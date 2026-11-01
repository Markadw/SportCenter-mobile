import { isAxiosError } from "axios";
import { authApi } from "../../../api/authApi";
import { InvalidSessionResponse } from "../errors";
import { InvalidStoredSession, sessionStorage } from "../storage/sessionStorage";
import type { LoginCredentials, Session, StoredSession } from "../types";

export const REFRESH_LEAD_MS = 30_000;
const STORAGE_NOTICE = "No pudimos guardar la sesión de forma segura. En este dispositivo sólo seguirá abierta hasta cerrar la aplicación.";
const CLEAR_NOTICE = "La sesión local se cerró, pero no pudimos borrar sus datos del almacenamiento seguro. Intenta cerrar sesión nuevamente antes de compartir el dispositivo.";
const EXPIRED_NOTICE = "Tu sesión ya no está activa. Vuelve a iniciar sesión.";

export class SessionRequestError extends Error {
  readonly code = "SESSION_RETRY_REQUIRED";
  constructor(message = "Tu sesión cambió. Vuelve a intentar la operación.") { super(message); }
}

export interface SessionSnapshot {
  session: Session | null;
  /** Ámbito recuperable para estado local. Nunca concede acceso privado. */
  sessionScopeId: string | null;
  notice: string | null;
  isRestoring: boolean;
}

export interface SessionRequestIdentity {
  owner: number;
  generation: number;
  sessionId: string;
  accessToken: string;
  retried: boolean;
}

interface Dependencies {
  api: Pick<typeof authApi, "login" | "refresh" | "logout">;
  storage: typeof sessionStorage;
  now: () => number;
}
let nextOwner = 0;

/** Coordina una sola rotación y descarta resultados de una cuenta o montaje anterior. */
export class SessionController {
  private readonly owner = ++nextOwner;
  private generation = 0;
  private active = false;
  private current: Session | null = null;
  private snapshot: SessionSnapshot = { session: null, sessionScopeId: null, notice: null, isRestoring: true };
  private readonly listeners = new Set<() => void>();
  private flight: { generation: number; promise: Promise<Session>; abort: AbortController } | null = null;
  private retryAt = 0;
  private refreshAt = 0;
  private readonly deps: Dependencies;

  constructor(dependencies: Partial<Dependencies> = {}) {
    this.deps = { api: authApi, storage: sessionStorage, now: () => Date.now(), ...dependencies };
  }

  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(change: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change, sessionScopeId: this.current?.sessionId ?? null };
    for (const listener of this.listeners) listener();
  }
  private install(next: Session) {
    this.current = next;
    // Para plazos cortos, reservar media vigencia evita renovaciones inmediatas en bucle.
    const remaining = Math.max(1, next.expiresAt - this.deps.now());
    this.refreshAt = next.expiresAt - Math.min(REFRESH_LEAD_MS, Math.floor(remaining / 2));
  }
  private valid(attempt: number) { return this.active && this.generation === attempt; }
  private advance() {
    this.generation += 1;
    this.flight?.abort.abort();
    this.flight = null;
    this.retryAt = 0;
    return this.generation;
  }

  activate() {
    this.active = true;
    this.publish({ session: null, isRestoring: true });
    void this.restore();
  }
  dispose() {
    this.active = false;
    this.advance();
    this.current = null;
    this.snapshot = { ...this.snapshot, session: null, sessionScopeId: null };
  }

  private async clear(attempt: number): Promise<boolean> {
    try {
      await this.deps.storage.clear(() => this.valid(attempt));
      return true;
    } catch {
      if (this.valid(attempt)) this.publish({ notice: CLEAR_NOTICE });
      return false;
    }
  }
  private async persist(next: Session, attempt: number): Promise<boolean> {
    try {
      await this.deps.storage.write(next, () => this.valid(attempt));
      return true;
    } catch { return false; }
  }

  private async restore() {
    const attempt = this.generation;
    try {
      const stored = await this.deps.storage.read();
      if (!this.valid(attempt) || !stored) return;
      await this.rotate(stored, attempt);
    } catch (error) {
      if (!this.valid(attempt)) return;
      if (error instanceof InvalidStoredSession) {
        this.publish({ notice: "Descartamos los datos de una sesión inválida. Vuelve a iniciar sesión." });
        await this.clear(attempt);
      } else if (!this.snapshot.notice) {
        this.publish({ notice: "No pudimos restaurar tu sesión. Comprueba la conexión o vuelve a iniciar sesión." });
      }
    } finally {
      if (this.valid(attempt)) this.publish({ isRestoring: false });
    }
  }

  readonly signIn = async (credentials: LoginCredentials, signal: AbortSignal) => {
    const attempt = this.advance();
    this.current = null;
    this.publish({ session: null, notice: null, isRestoring: false });
    await this.clear(attempt);
    if (!this.valid(attempt) || signal.aborted) return;
    const next = await this.deps.api.login(credentials, signal);
    if (!this.valid(attempt) || signal.aborted) return;
    const saved = await this.persist(next, attempt);
    if (!this.valid(attempt) || signal.aborted) {
      // El usuario puede abandonar el formulario mientras el llavero está escribiendo.
      if (this.valid(attempt)) await this.clear(attempt);
      return;
    }
    this.install(next);
    this.publish({ session: next, notice: saved ? null : STORAGE_NOTICE });
  };

  readonly signOut = async () => {
    const previous = this.current;
    const attempt = this.advance();
    this.current = null;
    this.publish({ session: null, notice: null, isRestoring: false });
    const cleared = await this.clear(attempt);
    if (!previous) return;
    try {
      await this.deps.api.logout(previous.accessToken);
    } catch (error) {
      const alreadyEnded = isAxiosError(error) && error.response?.status === 401;
      if (cleared && !alreadyEnded && this.valid(attempt)) {
        this.publish({ notice: "Cerramos la sesión en este dispositivo, pero no pudimos confirmar el cierre en el servidor." });
      }
    }
  };

  private async endInvalidSession(attempt: number) {
    if (!this.valid(attempt)) return;
    const ended = this.advance();
    this.current = null;
    this.publish({ session: null, notice: EXPIRED_NOTICE, isRestoring: false });
    await this.clear(ended);
  }

  private rotate(stored: StoredSession, attempt: number): Promise<Session> {
    if (!this.valid(attempt)) return Promise.reject(new SessionRequestError());
    if (this.flight?.generation === attempt) return this.flight.promise;
    const abort = new AbortController();
    let promise!: Promise<Session>;
    promise = (async () => {
      try {
        const next = await this.deps.api.refresh(stored, abort.signal);
        if (!this.valid(attempt)) throw new SessionRequestError();
        if (next.sessionId !== stored.sessionId) throw new InvalidSessionResponse();
        const saved = await this.persist(next, attempt);
        if (!this.valid(attempt)) throw new SessionRequestError();
        this.install(next);
        this.retryAt = 0;
        this.publish({ session: next, notice: saved ? null : STORAGE_NOTICE });
        return next;
      } catch (error) {
        if (!this.valid(attempt)) throw new SessionRequestError();
        const rejected = error instanceof InvalidSessionResponse ||
          (isAxiosError(error) && [400, 401, 403].includes(error.response?.status ?? 0));
        if (rejected) {
          await this.endInvalidSession(attempt);
        } else {
          this.retryAt = this.deps.now() + 15_000;
          // Un access token vencido no habilita pantallas privadas. Se conserva sólo
          // la posibilidad de renovar al volver a primer plano tras recuperar la red.
          const usable = this.current && this.current.expiresAt > this.deps.now() ? this.current : null;
          this.publish({ session: usable, notice: "No pudimos renovar tu sesión. Comprueba tu conexión y vuelve a intentarlo." });
        }
        throw new SessionRequestError("No pudimos renovar tu sesión. Vuelve a intentarlo.");
      } finally {
        if (this.flight?.promise === promise) this.flight = null;
      }
    })();
    this.flight = { generation: attempt, promise, abort };
    return promise;
  }

  readonly refreshIfNeeded = async (): Promise<void> => {
    const current = this.current;
    if (current && this.refreshAt <= this.deps.now()) {
      await this.rotate(current, this.generation);
    }
  };

  refreshDelay(): number | null {
    if (!this.snapshot.session || !this.current) return null;
    const deadline = Math.min(this.current.expiresAt, Math.max(
      this.refreshAt, this.retryAt,
    ));
    return Math.max(1, deadline - this.deps.now());
  }

  identityFor(accessToken: string): SessionRequestIdentity | null {
    if (!this.active || !this.current || this.current.accessToken !== accessToken) return null;
    return { owner: this.owner, generation: this.generation, sessionId: this.current.sessionId, accessToken, retried: false };
  }
  owns(identity: SessionRequestIdentity): boolean {
    return this.active && identity.owner === this.owner && identity.generation === this.generation &&
      this.current?.sessionId === identity.sessionId;
  }
  async tokenFor(identity: SessionRequestIdentity, force = false): Promise<string> {
    if (!this.owns(identity) || !this.current) throw new SessionRequestError();
    const current = this.current;
    if ((force && current.accessToken === identity.accessToken) || this.refreshAt <= this.deps.now()) {
      await this.rotate(current, this.generation);
    }
    if (!this.owns(identity) || !this.current || this.current.expiresAt <= this.deps.now()) throw new SessionRequestError();
    return this.current.accessToken;
  }
  async rejectRetried(identity: SessionRequestIdentity) {
    if (this.owns(identity) && this.current?.accessToken === identity.accessToken) {
      await this.endInvalidSession(identity.generation);
    }
  }
}

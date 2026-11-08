import { isAxiosError } from "axios";
import type { DeletionSessionIdentity } from "../auth/context/SessionController";
import { authorPreferences } from "../reviews/preferences/authorPreferences";
import { forgetReviewPreferenceOwner } from "../reviews/preferences/localIdentity";
import { accountDeletionApi } from "./api";
import { deletionReceiptStorage } from "./receiptStorage";
import type { DeletionReceipt, DeletionRequest, DeletionResult, DeletionVerification } from "./types";

export interface AccountDeletionState {
  stage: "start" | "code" | "review" | "result";
  busy: boolean;
  restoring: boolean;
  error: string | null;
  expiresAt: string | null;
  verification: DeletionVerification | null;
  result: DeletionResult | null;
  outcomeUnknown: boolean;
  hasReceipt: boolean;
  receiptUnavailable: boolean;
  cleanupWarning: string | null;
  requestId: string | null;
}
export interface DeletionSessionAccess {
  captureDeletionIdentity(): DeletionSessionIdentity | null;
  isDeletionIdentityCurrent(identity: DeletionSessionIdentity): boolean;
  deletionAccessToken(identity: DeletionSessionIdentity): Promise<string>;
  clearDeletedAccountSession(identity: DeletionSessionIdentity): Promise<boolean>;
}
interface Dependencies {
  auth: DeletionSessionAccess;
  api: typeof accountDeletionApi;
  storage: typeof deletionReceiptStorage;
  now: () => number;
  cleanupRecoveredAccount: (userId: number) => Promise<void>;
}
const initial = (): AccountDeletionState => ({ stage: "start", busy: false, restoring: true, error: null,
  expiresAt: null, verification: null, result: null, outcomeUnknown: false, hasReceipt: false,
  receiptUnavailable: false, cleanupWarning: null, requestId: null });
const CHANGED = "La sesión cambió. Inicia una nueva solicitud con la cuenta que deseas eliminar.";
const UNKNOWN = "No pudimos confirmar el resultado. Consulta el estado; no repitas la eliminación.";

/** A confirmation is sent at most once. Only its read-only receipt survives restart. */
export class AccountDeletionController {
  private state = initial();
  private active = false;
  private operation = 0;
  private request: AbortController | null = null;
  private owner: DeletionSessionIdentity | null = null;
  private challenge: DeletionRequest | null = null;
  private receipt: DeletionReceipt | null = null;
  private confirmingOperation: number | null = null;
  private cleanupOwner: DeletionSessionIdentity | null = null;
  private restoreFailed = false;
  private readonly listeners = new Set<() => void>();
  private readonly deps: Dependencies;

  constructor(auth: DeletionSessionAccess, dependencies: Partial<Omit<Dependencies, "auth">> = {}) {
    this.deps = { auth, api: accountDeletionApi, storage: deletionReceiptStorage, now: Date.now,
      cleanupRecoveredAccount: async userId => {
        forgetReviewPreferenceOwner(userId);
        await authorPreferences.purgeAccount(userId);
      }, ...dependencies };
  }
  readonly getSnapshot = () => this.state;
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(change: Partial<AccountDeletionState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  private valid(operation: number) { return this.active && operation === this.operation; }
  private owns(owner: DeletionSessionIdentity) { return this.deps.auth.isDeletionIdentityCurrent(owner); }
  activate() { this.active = true; void this.restore(); }
  dispose() {
    this.active = false;
    ++this.operation;
    this.request?.abort(); this.request = null;
    this.owner = null; this.challenge = null;
    this.state = { ...initial(), ...(this.receipt ? { stage: "result", hasReceipt: true, outcomeUnknown: true } as const : {}) };
  }
  private async restore() {
    const operation = ++this.operation;
    this.publish({ restoring: true });
    try {
      const receipt = await this.deps.storage.read();
      if (!this.valid(operation)) return;
      const current = this.deps.auth.captureDeletionIdentity();
      if (receipt && current && current.userId !== receipt.ownerId) {
        await this.deps.storage.clear(receipt);
        if (!this.valid(operation)) return;
        this.receipt = null;
      } else this.receipt = receipt;
      this.restoreFailed = false;
      this.publish({ restoring: false, error: null, ...(this.receipt ? {
        stage: "result", hasReceipt: true, outcomeUnknown: true, requestId: this.receipt.requestId,
      } : { stage: "start", hasReceipt: false }) });
      if (this.receipt) await this.refreshResult();
    } catch {
      if (this.valid(operation)) {
        this.restoreFailed = true;
        this.publish({ restoring: false, error: "No pudimos recuperar el comprobante seguro. Vuelve a intentarlo antes de iniciar otra solicitud." });
      }
    }
  }
  /** Called on auth changes, including logout and a different account signing in. */
  sessionChanged() {
    const current = this.deps.auth.captureDeletionIdentity();
    if (this.receipt && current && current.userId !== this.receipt.ownerId) {
      const receipt = this.receipt;
      this.reset();
      void this.deps.storage.clear(receipt).catch(() => {
        this.publish({ error: "No pudimos borrar el comprobante anterior del dispositivo. Intenta nuevamente." });
      });
    } else if (this.owner && !this.owns(this.owner) && this.confirmingOperation === null && !this.receipt) {
      this.reset(); this.publish({ error: CHANGED });
    }
  }
  private reset() {
    ++this.operation;
    this.request?.abort(); this.request = null;
    this.owner = null; this.challenge = null; this.receipt = null;
    this.confirmingOperation = null;
    this.cleanupOwner = null;
    this.publish({ ...initial(), restoring: false });
  }
  private begin() {
    const operation = ++this.operation, request = new AbortController();
    this.request = request;
    this.publish({ busy: true, error: null });
    return { operation, signal: request.signal };
  }
  private finish(operation: number) {
    if (this.valid(operation)) { this.request = null; this.publish({ busy: false }); }
  }
  private async token(owner: DeletionSessionIdentity) {
    if (!this.owns(owner)) throw new Error("SESSION_CHANGED");
    const token = await this.deps.auth.deletionAccessToken(owner);
    if (!this.owns(owner)) throw new Error("SESSION_CHANGED");
    return token;
  }
  readonly start = async () => {
    if (!this.active || this.state.busy || this.state.restoring || this.receipt) return;
    if (this.restoreFailed) { await this.restore(); return; }
    const owner = this.deps.auth.captureDeletionIdentity();
    if (!owner) return;
    const { operation, signal } = this.begin();
    this.owner = owner;
    this.challenge = null;
    this.publish({ verification: null, expiresAt: null });
    try {
      const token = await this.token(owner);
      if (!this.valid(operation)) return;
      const value = await this.deps.api.request(token, signal);
      if (!this.valid(operation) || !this.owns(owner)) return;
      this.challenge = value;
      this.publish({ stage: "code", expiresAt: value.expiresAt });
    } catch (error) {
      if (this.valid(operation)) this.publish({ error: this.message(error, "No se pudo enviar el código. No se ha confirmado la eliminación.") });
    } finally { this.finish(operation); }
  };
  readonly verify = async (code: string) => {
    const challenge = this.challenge, owner = this.owner;
    if (!this.active || this.state.busy || this.state.stage !== "code" || !challenge || !owner) return;
    if (!/^[0-9]{6}$/.test(code)) { this.publish({ error: "Escribe el código de seis dígitos enviado a tu correo." }); return; }
    if (Date.parse(challenge.expiresAt) <= this.deps.now()) { this.publish({ error: "El código venció. Solicita uno nuevo." }); return; }
    const { operation, signal } = this.begin();
    try {
      const token = await this.token(owner);
      if (!this.valid(operation)) return;
      const value = await this.deps.api.verify(challenge.requestId, code, token, signal);
      if (!this.valid(operation) || !this.owns(owner)) return;
      this.publish({ stage: "review", verification: value, expiresAt: value.expiresAt });
    } catch (error) {
      if (this.valid(operation)) this.publish({ error: this.message(error, "No se pudo verificar el código. Solicita otro si ya no es válido.") });
    } finally { this.finish(operation); }
  };
  readonly confirm = async () => {
    const challenge = this.challenge, owner = this.owner, verification = this.state.verification;
    if (!this.active || this.state.busy || this.state.stage !== "review" || !challenge || !owner || !verification || !this.owns(owner)) return;
    if (Date.parse(verification.expiresAt) <= this.deps.now()) {
      this.publish({ stage: "code", verification: null, error: "La autorización venció. Solicita un código nuevo para continuar." }); return;
    }
    const { operation, signal } = this.begin();
    const receipt = { requestId: challenge.requestId, receiptToken: challenge.receiptToken, ownerId: owner.userId };
    let sent = false;
    try {
      const token = await this.token(owner);
      if (!this.valid(operation)) return;
      // Fail closed if secure persistence fails: never send an irreversible action
      // without its recovery capability already stored on this device.
      await this.deps.storage.write(receipt, () => this.valid(operation) && this.owns(owner));
      if (!this.valid(operation) || !this.owns(owner)) return;
      if (Date.parse(verification.expiresAt) <= this.deps.now()) {
        await this.deps.storage.clear(receipt);
        this.publish({ stage: "code", verification: null, error: "La autorización venció. Solicita un código nuevo para continuar." }); return;
      }
      this.receipt = receipt;
      this.challenge = null;
      this.confirmingOperation = operation;
      this.publish({ stage: "result", verification: null, expiresAt: null, hasReceipt: true, outcomeUnknown: true, requestId: receipt.requestId });
      sent = true;
      const value = await this.deps.api.confirm(challenge.requestId, verification.confirmationToken, token, signal);
      if (this.valid(operation)) {
        this.sessionChanged();
        if (this.valid(operation)) this.acceptResult(value);
      }
    } catch (error) {
      if (this.valid(operation)) this.publish(sent ? { stage: "result", outcomeUnknown: true, error: UNKNOWN } : {
        error: this.message(error, "No pudimos guardar el comprobante seguro. La eliminación no se envió. Intenta nuevamente."),
      });
    } finally {
      if (sent) await this.cleanup(owner, operation);
      if (this.confirmingOperation === operation) this.confirmingOperation = null;
      if (sent && this.valid(operation)) this.owner = null;
      this.finish(operation);
    }
  };
  private async cleanup(owner: DeletionSessionIdentity, operation: number) {
    let cleared = false;
    try { cleared = await this.deps.auth.clearDeletedAccountSession(owner); } catch { /* Never hide the server outcome. */ }
    if (this.valid(operation)) {
      this.cleanupOwner = cleared ? null : owner;
      this.publish({ cleanupWarning: cleared ? null : "La sesión local se cerró, pero no pudimos borrar todos sus datos del dispositivo. Vuelve a intentar la limpieza antes de compartirlo." });
    }
  }
  readonly refreshResult = async () => {
    const receipt = this.receipt;
    if (!this.active || this.state.busy || !receipt) return;
    const { operation, signal } = this.begin();
    try {
      const value = await this.deps.api.result(receipt.requestId, receipt.receiptToken, signal);
      if (!this.valid(operation) || this.receipt !== receipt) return;
      this.sessionChanged();
      if (!this.valid(operation)) return;
      this.acceptResult(value);
      const owner = this.deps.auth.captureDeletionIdentity();
      if (!["received", "identity_verified"].includes(value.status)) {
        if (owner?.userId === receipt.ownerId && !this.cleanupOwner) this.cleanupOwner = owner;
        if (!this.cleanupOwner) {
          try {
            await this.deps.cleanupRecoveredAccount(receipt.ownerId);
            if (this.valid(operation)) this.publish({ cleanupWarning: null });
          } catch {
            if (this.valid(operation)) this.publish({ cleanupWarning: "No pudimos borrar todas las preferencias locales de la cuenta. Vuelve a intentar la limpieza antes de compartir el dispositivo." });
          }
        }
      }
    } catch (error) {
      if (this.valid(operation)) {
        const unavailable = isAxiosError(error) && error.response?.status === 404;
        this.publish({ error: unavailable ? "El comprobante ya no está disponible. Esto no acredita la eliminación. Contacta a Sport Center para dar seguimiento." :
          this.message(error, "No se pudo consultar el resultado. La falta de respuesta no acredita la eliminación."), receiptUnavailable: unavailable });
      }
    } finally {
      if (this.valid(operation) && this.cleanupOwner) await this.cleanup(this.cleanupOwner, operation);
      this.finish(operation);
    }
  };
  private acceptResult(result: DeletionResult) {
    this.publish({ stage: "result", result, outcomeUnknown: false, receiptUnavailable: false, error: null });
  }
  readonly cancel = () => { if (!this.state.busy && !this.receipt) this.reset(); };
  readonly restartUnconfirmed = async () => {
    if (this.state.busy || !this.receipt || !["received", "identity_verified"].includes(this.state.result?.status ?? "")) return;
    await this.discardReceipt();
  };
  readonly discardUnavailableReceipt = async () => {
    if (!this.state.busy && this.state.receiptUnavailable) await this.discardReceipt();
  };
  private async discardReceipt() {
    const receipt = this.receipt;
    if (!receipt) return;
    const { operation } = this.begin();
    try { await this.deps.storage.clear(receipt); if (this.valid(operation)) this.reset(); }
    catch { if (this.valid(operation)) this.publish({ error: "No pudimos retirar el comprobante seguro. Intenta nuevamente." }); }
    finally { this.finish(operation); }
  }
  private message(error: unknown, fallback: string) {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 429 || status === 409) return "Espera antes de intentarlo de nuevo. Si el código ya se utilizó, solicita uno nuevo.";
      if (status === 401 || status === 419) return "La sesión o la verificación ya no es válida. Inicia sesión y solicita un código nuevo.";
      if (status === 400 && this.state.stage === "code") return "El código es incorrecto, venció o ya no es válido. Revísalo o solicita uno nuevo.";
      if (status === 403) return "Esta operación requiere la verificación de tu cuenta o atención de Sport Center.";
      if (status === 503) return "El servicio no está disponible en este momento. Puedes solicitar atención por correo.";
    }
    return fallback;
  }
}

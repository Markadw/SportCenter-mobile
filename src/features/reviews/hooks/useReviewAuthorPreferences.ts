import { useEffect, useMemo, useRef, useState } from "react";
import { authorPreferences, ReviewPreferenceStorageError } from "../preferences/authorPreferences";
import { bindReviewPreferenceOwner, reviewPreferenceKey, reviewPreferenceOwner, type ReviewPreferenceOwner } from "../preferences/localIdentity";
interface Preferences {
  request: string; owner: ReviewPreferenceOwner | null; authors: number[]; ready: boolean; saving: boolean; error: string | null; notice: string | null;
}
export function useReviewAuthorPreferences(accessToken?: string, sessionId?: string) {
  const resolution = useMemo(() => {
    try { const owner = reviewPreferenceOwner(accessToken, sessionId); return { owner, key: reviewPreferenceKey(owner), error: null }; }
    catch { return { owner: null, key: "invalid", error: "No pudimos identificar esta cuenta para cargar sus preferencias locales. Vuelve a iniciar sesión para usarlas." }; }
  }, [accessToken, sessionId]);
  const ownerKind = resolution.owner?.kind, ownerId = resolution.owner?.kind === "account" ? resolution.owner.userId : null;
  const owner = useMemo<ReviewPreferenceOwner | null>(() => ownerKind === "account" && ownerId ? { kind: "account", userId: ownerId } : ownerKind === "guest" ? { kind: "guest" } : null, [ownerKind, ownerId]);
  const lifecycle = accessToken ? sessionId ?? "invalid-session" : "guest";
  const [attempt, setAttempt] = useState(0), [state, setState] = useState<Preferences | null>(null);
  const generation = useRef(0), mutation = useRef<object | null>(null);
  const request = lifecycle + ":" + resolution.key + ":" + attempt;
  useEffect(() => {
    const current = ++generation.current;
    let active = true, bound = false, unsubscribe: (() => void) | undefined;
    const isCurrent = () => active && generation.current === current;
    if (owner) {
      void Promise.resolve().then(async () => {
        if (!isCurrent()) return;
        bindReviewPreferenceOwner(sessionId, owner); bound = true;
        unsubscribe = authorPreferences.subscribe(owner, authors => {
          if (isCurrent()) setState(previous => ({ request, owner, authors, ready: true, saving: previous?.request === request && previous.saving, error: null, notice: previous?.request === request ? previous.notice : null }));
        });
        const authors = await authorPreferences.read(owner);
        if (isCurrent()) setState({ request, owner, authors, ready: true, saving: false, error: null, notice: null });
      }).catch((cause: unknown) => {
        if (isCurrent()) setState({ request, owner: bound ? owner : null, authors: [], ready: false, saving: false,
          error: cause instanceof ReviewPreferenceStorageError ? cause.message : "No pudimos cargar las preferencias de esta cuenta.", notice: null });
      });
    }
    return () => { active = false; generation.current += 1; mutation.current = null; unsubscribe?.(); };
    // El namespace cambia por cuenta/sesión; renovar el token con el mismo ID no recarga ni cancela operaciones.
  }, [request, owner, sessionId]);
  const current = state?.request === request && !resolution.error ? state : null;
  const ready = !!current?.ready, saving = !!current?.saving;
  async function mutate(authorId?: number) {
    const owner = current?.owner;
    if (!owner || mutation.current || (authorId !== undefined && !ready)) return false;
    const operation = {}, currentGeneration = generation.current; mutation.current = operation;
    const isCurrent = () => generation.current === currentGeneration && mutation.current === operation;
    setState(previous => previous?.request === request ? { ...previous, saving: true, error: null, notice: null } : previous);
    try {
      const authors = authorId === undefined ? await authorPreferences.restoreAll(owner, isCurrent) : await authorPreferences.hide(owner, authorId, isCurrent);
      if (isCurrent()) {
        setState({ request, owner, authors, ready: true, saving: false, error: null,
          notice: authorPreferences.persistent() ? "Preferencia guardada en este dispositivo." : "Preferencia aplicada en memoria; se restablece al recargar la versión web." });
        return true;
      }
      return false;
    } catch (cause) {
      if (isCurrent()) setState(previous => previous?.request === request ? { ...previous, saving: false, error: cause instanceof ReviewPreferenceStorageError ? cause.message : "No pudimos guardar la preferencia local.", notice: null } : previous);
    } finally { if (mutation.current === operation) mutation.current = null; }
    return false;
  }
  return { authors: new Set(current?.authors ?? []), ready, saving, loading: !resolution.error && !current,
    error: resolution.error ?? current?.error ?? null, notice: current?.notice ?? null,
    canReset: !!current?.owner, persistent: authorPreferences.persistent(), retry: () => setAttempt(value => value + 1),
    hide: (authorId: number) => mutate(authorId), restoreAll: () => mutate() };
}

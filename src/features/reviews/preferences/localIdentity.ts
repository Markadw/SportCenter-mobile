import { jwtDecode } from "jwt-decode";
export type ReviewPreferenceOwner = { kind: "guest" } | { kind: "account"; userId: number };
const bindings = new Map<string, number>();
const validId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
export class ReviewPreferenceIdentityError extends Error {
  constructor() { super("No pudimos identificar esta cuenta para cargar sus preferencias locales. Vuelve a iniciar sesión o consulta las reseñas sin ocultar autores."); }
}
// Sólo namespace local. Decodificar NO valida una firma ni autoriza acceso: el servidor valida Bearer.
export function reviewPreferenceOwner(accessToken?: string, sessionId?: string): ReviewPreferenceOwner {
  if (!accessToken) return { kind: "guest" };
  if (!sessionId?.trim() || accessToken.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)) throw new ReviewPreferenceIdentityError();
  let data: unknown;
  try { data = jwtDecode<unknown>(accessToken); } catch { throw new ReviewPreferenceIdentityError(); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ReviewPreferenceIdentityError();
  const claim = data as Record<string, unknown>;
  if (!validId(claim.id_usuario) || claim.sessionId !== sessionId) throw new ReviewPreferenceIdentityError();
  const previous = bindings.get(sessionId);
  if (previous !== undefined && previous !== claim.id_usuario) throw new ReviewPreferenceIdentityError();
  return { kind: "account", userId: claim.id_usuario };
}
export function bindReviewPreferenceOwner(sessionId: string | undefined, owner: ReviewPreferenceOwner) {
  if (owner.kind === "guest") return;
  if (!sessionId) throw new ReviewPreferenceIdentityError();
  const previous = bindings.get(sessionId);
  if (previous !== undefined && previous !== owner.userId) throw new ReviewPreferenceIdentityError();
  bindings.set(sessionId, owner.userId);
  if (bindings.size > 64) bindings.delete(bindings.keys().next().value!);
}
export function forgetReviewPreferenceOwner(userId: number) {
  for (const [sessionId, boundUserId] of bindings) {
    if (boundUserId === userId) bindings.delete(sessionId);
  }
}
export function reviewPreferenceKey(owner: ReviewPreferenceOwner): string {
  if (owner.kind === "guest") return "sport-center.review-authors.guest";
  if (!validId(owner.userId)) throw new ReviewPreferenceIdentityError();
  return "sport-center.review-authors.account." + owner.userId;
}

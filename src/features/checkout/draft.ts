import type { CheckoutDraft, OrderStatus } from "./types";
export const emptyAddress = () => ({ alias: "", calle: "", numero: "", colonia: "", ciudad: "", estado: "",
  codigo_postal: "", pais: "México", principal: false });
const emptyDraft = (): CheckoutDraft => ({ addressId: null, address: emptyAddress(), shippingId: null,
  promo: "", appliedPromo: "", prepared: null, uncertain: false });
const inactiveDraft = emptyDraft();
let owner: string | null = null;
let draft: CheckoutDraft | null = null;
const listeners = new Set<() => void>();

// Mantiene compatibilidad con el reinicio al cerrar sesión. No notifica durante un render.
export function getCheckoutDraft(sessionId: string | null): CheckoutDraft {
  if (owner !== sessionId || !draft) { owner = sessionId; draft = emptyDraft(); }
  return draft;
}
export function readCheckoutDraft(sessionId: string): CheckoutDraft {
  return owner === sessionId && draft ? draft : inactiveDraft;
}
export function subscribeCheckoutDraft(listener: () => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
function emit() { for (const listener of listeners) listener(); }
export function activateCheckoutDraft(sessionId: string) {
  if (owner !== sessionId || !draft) { getCheckoutDraft(sessionId); emit(); }
}
export function saveCheckoutDraft(sessionId: string, next: CheckoutDraft) {
  if (owner === sessionId && draft !== next) { draft = next; emit(); }
}
export function finishCheckoutDraft(sessionId: string, status: OrderStatus): boolean {
  // Un estado de otro pedido nunca resuelve una confirmación perdida sin ID conocido.
  if (owner !== sessionId || !draft?.prepared || draft.prepared.orderId !== status.id || draft.uncertain) return false;
  const terminal = status.paid || status.stockIncident || ["pago_cancelado", "pago_rechazado", "reembolsado"].includes(status.state);
  if (!terminal) return false;
  saveCheckoutDraft(sessionId, { ...draft, prepared: null, uncertain: false, promo: "", appliedPromo: "" });
  return true;
}

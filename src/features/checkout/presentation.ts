import type { OrderStatus } from "./types";
export function paymentTitle(status: OrderStatus | null): string {
  if (status?.stockIncident) return "Pago con incidencia de existencias";
  if (status?.state === "reembolsado") return "Pago reembolsado";
  if (status && ["pago_cancelado", "pago_rechazado"].includes(status.state)) return "Pago no completado";
  if (status?.paid) return "Pago confirmado";
  return "Verifica tu pago";
}

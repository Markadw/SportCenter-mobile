export function orderStatus(value: string): string {
  const labels: Record<string, string> = { pendiente: "Pendiente", "en proceso": "En proceso", preparando: "Preparando", enviado: "Enviado", en_transito: "En tránsito", entregado: "Entregado", incidencia: "Incidencia", cancelado: "Cancelado", pendiente_pago: "Pendiente de pago" };
  return labels[value.trim().toLowerCase()] ?? value;
}
export function money(value: number): string { return "$" + value.toFixed(2) + " MXN"; }
export function date(value: string | null): string {
  if (!value) return "Sin fecha registrada";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "Fecha no disponible" : timestamp.toLocaleDateString("es-MX");
}

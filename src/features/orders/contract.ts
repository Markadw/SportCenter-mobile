export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Respuesta inválida.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, fallback?: string): string {
  if ((value === null || value === undefined) && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.length > 10000) throw new Error("Respuesta inválida.");
  return value;
}
export function numeric(value: unknown, integer = false): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value))) throw new Error("Respuesta inválida.");
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || (integer && !Number.isSafeInteger(result))) throw new Error("Respuesta inválida.");
  return result;
}
export function positiveId(value: unknown): number { const id = numeric(value, true); if (!id) throw new Error("Identificador inválido."); return id; }
export function validId(value: string): boolean { return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0; }
export function optionalText(value: unknown): string | null { return value === null || value === undefined ? null : text(value); }

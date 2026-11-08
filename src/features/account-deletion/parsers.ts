import type { DeletionReceipt, DeletionRequest, DeletionResult, DeletionVerification } from "./types";

export const DELETION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DELETION_SECRET = /^[A-Za-z0-9_-]{43}$/;
const statuses = new Set(["received", "identity_verified", "deletion_confirmed", "in_progress", "completed", "requires_attention", "error"]);
export class InvalidDeletionResponse extends Error {
  constructor() { super("La respuesta de eliminación no es válida. Consulta el seguimiento antes de continuar."); }
}
function invalid(): never { throw new InvalidDeletionResponse(); }
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
}
function text(value: unknown): string { return typeof value === "string" && value.length <= 4096 ? value : invalid(); }
function reason(value: unknown): string | null { return value === null ? null : text(value); }
function date(value: unknown): string {
  const result = text(value);
  return Number.isFinite(Date.parse(result)) ? result : invalid();
}
function secret(value: unknown): string { return typeof value === "string" && DELETION_SECRET.test(value) ? value : invalid(); }
function uuid(value: unknown): string { return typeof value === "string" && DELETION_UUID.test(value) ? value : invalid(); }
function categories(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100) return invalid();
  return value.map(text);
}
export function parseDeletionRequest(value: unknown): DeletionRequest {
  const row = record(value);
  if (row.status !== "received") return invalid();
  return { requestId: uuid(row.requestId), receiptToken: secret(row.receiptToken), status: "received", expiresAt: date(row.expiresAt) };
}
export function parseDeletionVerification(value: unknown): DeletionVerification {
  const row = record(value), impact = record(row.consequences);
  if (row.status !== "identity_verified" || impact.irreversible !== true || impact.endsAllSessions !== true ||
    impact.newRegistrationIsSeparate !== true || typeof impact.requiresAttention !== "boolean") return invalid();
  let retentionPolicy: { basis: string; days: number } | null = null;
  if (impact.retentionPolicy !== null) {
    const policy = record(impact.retentionPolicy);
    if (!Number.isInteger(policy.days) || (policy.days as number) < 1 || (policy.days as number) > 36500) return invalid();
    retentionPolicy = { basis: text(policy.basis), days: policy.days as number };
  }
  return { status: "identity_verified", confirmationToken: secret(row.confirmationToken), expiresAt: date(row.expiresAt), consequences: {
    irreversible: true, endsAllSessions: true, newRegistrationIsSeparate: true,
    retainedCategories: categories(impact.retainedCategories), requiresAttention: impact.requiresAttention,
    reason: reason(impact.reason), retentionPolicy,
  } };
}
export function parseDeletionResult(value: unknown, requestId: string): DeletionResult {
  const row = record(value);
  if (uuid(row.requestId) !== requestId || !statuses.has(row.status as string) ||
    !["pending", "sent", "not_required", "unavailable"].includes(row.notification as string)) return invalid();
  let retention: DeletionResult["retention"];
  if (row.retention !== undefined) {
    const retained = record(row.retention);
    if (typeof retained.identifiersExpired !== "boolean") return invalid();
    retention = { until: date(retained.until), basis: text(retained.basis), identifiersExpired: retained.identifiersExpired };
  }
  return { requestId, status: row.status as DeletionResult["status"], reason: reason(row.reason),
    retainedCategories: categories(row.retainedCategories), notification: row.notification as DeletionResult["notification"],
    ...(retention ? { retention } : {}),
  };
}
export function parseDeletionReceipt(value: unknown): DeletionReceipt {
  const row = record(value);
  if (Object.keys(row).length !== 3 || !Number.isSafeInteger(row.ownerId) || (row.ownerId as number) <= 0) return invalid();
  return { requestId: uuid(row.requestId), receiptToken: secret(row.receiptToken), ownerId: row.ownerId as number };
}

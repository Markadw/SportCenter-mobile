import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { reviewPreferenceKey, type ReviewPreferenceOwner } from "./localIdentity";
export const MAX_HIDDEN_AUTHORS = 100;
const MAX_PAYLOAD_LENGTH = 1900;
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const memory = new Map<string, string>();
const queues = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<(authors: number[]) => void>>();
export class ReviewPreferenceStorageError extends Error {}
class CancelledPreferenceOperation extends Error {}
function positiveId(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
export function parseAuthorPreferences(value: unknown): number[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReviewPreferenceStorageError("Las preferencias guardadas no son válidas. Puedes restablecerlas.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || record.version !== 1 || !Array.isArray(record.authors) ||
    record.authors.length > MAX_HIDDEN_AUTHORS || !record.authors.every(positiveId) || new Set(record.authors).size !== record.authors.length) {
    throw new ReviewPreferenceStorageError("Las preferencias guardadas no son válidas. Puedes restablecerlas.");
  }
  return [...record.authors];
}
function serialize<T>(key: string, action: () => Promise<T>): Promise<T> {
  const operation = (queues.get(key) ?? Promise.resolve()).then(action, action);
  queues.set(key, operation);
  void operation.then(() => { if (queues.get(key) === operation) queues.delete(key); }, () => { if (queues.get(key) === operation) queues.delete(key); });
  return operation;
}
async function read(key: string): Promise<number[]> {
  let raw: unknown;
  try { raw = Platform.OS === "web" ? memory.get(key) ?? null : await SecureStore.getItemAsync(key, OPTIONS); }
  catch { throw new ReviewPreferenceStorageError("No pudimos cargar las preferencias locales. Vuelve a intentarlo."); }
  if (raw === null) return [];
  if (typeof raw !== "string" || raw.length > MAX_PAYLOAD_LENGTH) throw new ReviewPreferenceStorageError("Las preferencias guardadas no son válidas. Puedes restablecerlas.");
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new ReviewPreferenceStorageError("Las preferencias guardadas no son válidas. Puedes restablecerlas."); }
  return parseAuthorPreferences(data);
}
async function write(key: string, authors: number[], isCurrent: () => boolean): Promise<number[]> {
  if (!isCurrent()) throw new CancelledPreferenceOperation();
  const normalized = parseAuthorPreferences({ version: 1, authors });
  const payload = JSON.stringify({ version: 1, authors: normalized });
  if (payload.length > MAX_PAYLOAD_LENGTH) throw new ReviewPreferenceStorageError("No se pudo guardar esta preferencia: se alcanzó el límite local.");
  try {
    if (Platform.OS === "web") memory.set(key, payload);
    else await SecureStore.setItemAsync(key, payload, OPTIONS);
  } catch { throw new ReviewPreferenceStorageError("No pudimos guardar el cambio. No se ha confirmado su persistencia en este dispositivo."); }
  if (!isCurrent()) throw new CancelledPreferenceOperation();
  for (const listener of listeners.get(key) ?? []) listener([...normalized]);
  return normalized;
}
export const authorPreferences = {
  persistent: () => Platform.OS !== "web",
  read(owner: ReviewPreferenceOwner): Promise<number[]> { const key = reviewPreferenceKey(owner); return serialize(key, () => read(key)); },
  hide(owner: ReviewPreferenceOwner, authorId: number, isCurrent: () => boolean = () => true): Promise<number[]> {
    if (!positiveId(authorId)) return Promise.reject(new ReviewPreferenceStorageError("El autor no es válido."));
    const key = reviewPreferenceKey(owner);
    return serialize(key, async () => {
      if (!isCurrent()) throw new CancelledPreferenceOperation();
      const previous = await read(key);
      if (previous.includes(authorId)) return previous;
      if (previous.length >= MAX_HIDDEN_AUTHORS) throw new ReviewPreferenceStorageError("Puedes ocultar hasta 100 autores. Restaura alguno antes de añadir otro.");
      return write(key, [...previous, authorId], isCurrent);
    });
  },
  restoreAll(owner: ReviewPreferenceOwner, isCurrent: () => boolean = () => true): Promise<number[]> {
    const key = reviewPreferenceKey(owner); return serialize(key, () => write(key, [], isCurrent));
  },
  subscribe(owner: ReviewPreferenceOwner, listener: (authors: number[]) => void) {
    const key = reviewPreferenceKey(owner), group = listeners.get(key) ?? new Set<(authors: number[]) => void>();
    group.add(listener); listeners.set(key, group);
    return () => { group.delete(listener); if (!group.size) listeners.delete(key); };
  },
};

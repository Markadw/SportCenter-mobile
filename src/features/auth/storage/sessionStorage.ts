import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { StoredSession } from "../types";

const KEY = "sport-center.session";
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export class SessionStorageError extends Error {
  constructor() {
    super("No pudimos acceder al almacenamiento seguro de la sesión.");
  }
}

export class InvalidStoredSession extends Error {}

// Una sola cola también protege el cambio entre dos instancias del proveedor.
let pending: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation);
  pending = result.catch(() => {});
  return result;
}

async function eraseNative() {
  try {
    await SecureStore.deleteItemAsync(KEY, OPTIONS);
  } catch {
    // Si falla el borrado, sobrescribir elimina igualmente las credenciales.
    await SecureStore.setItemAsync(KEY, "", OPTIONS);
  }
}

export const sessionStorage = {
  read(): Promise<StoredSession | null> {
    return serialize(async () => {
      if (Platform.OS === "web") return null;
      let raw: string | null;
      try {
        raw = await SecureStore.getItemAsync(KEY, OPTIONS);
      } catch {
        throw new SessionStorageError();
      }
      if (!raw) return null;
      let value: unknown;
      try { value = JSON.parse(raw); } catch { throw new InvalidStoredSession(); }
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidStoredSession();
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length !== 2 ||
        typeof record.refreshToken !== "string" || !record.refreshToken.trim() ||
        typeof record.sessionId !== "string" || !record.sessionId.trim()) throw new InvalidStoredSession();
      return { refreshToken: record.refreshToken, sessionId: record.sessionId };
    });
  },
  write(record: StoredSession, isCurrent: () => boolean): Promise<void> {
    return serialize(async () => {
      if (Platform.OS === "web" || !isCurrent()) return;
      try {
        // Se construye expresamente: nunca persiste access token, correo, contraseña o código.
        await SecureStore.setItemAsync(KEY, JSON.stringify({
          refreshToken: record.refreshToken, sessionId: record.sessionId,
        }), OPTIONS);
        if (!isCurrent()) await eraseNative();
      } catch {
        try { await eraseNative(); } catch { /* Se informa el fallo al proveedor. */ }
        throw new SessionStorageError();
      }
    });
  },
  clear(isCurrent: () => boolean = () => true): Promise<void> {
    return serialize(async () => {
      if (Platform.OS === "web" || !isCurrent()) return;
      try { await eraseNative(); } catch { throw new SessionStorageError(); }
    });
  },
};

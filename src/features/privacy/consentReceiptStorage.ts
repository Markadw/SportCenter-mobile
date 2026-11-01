import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { NecessaryProcessingReceipt } from "./consentReceipt";

export type StoredNecessaryProcessingReceipt = Pick<NecessaryProcessingReceipt,
  "noticeVersion" | "acceptedAt" | "privacyUrl" | "termsUrl">;
const KEY = "sport-center.necessary-processing-receipt";
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
let memoryReceipt: StoredNecessaryProcessingReceipt | null = null;
let pending: Promise<unknown> = Promise.resolve();

export class ConsentReceiptStorageError extends Error {
  constructor() {
    super("No pudimos guardar la aceptación en este dispositivo. No enviamos el registro. Vuelve a intentarlo.");
  }
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation);
  pending = result.catch(() => {});
  return result;
}

function metadata(receipt: NecessaryProcessingReceipt): StoredNecessaryProcessingReceipt {
  // El recibo no identifica a una persona ni demuestra que el servidor creó una cuenta.
  return {
    noticeVersion: receipt.noticeVersion,
    acceptedAt: receipt.acceptedAt,
    privacyUrl: receipt.privacyUrl,
    termsUrl: receipt.termsUrl,
  };
}

export const consentReceiptStorage = {
  read(): Promise<StoredNecessaryProcessingReceipt | null> {
    return serialize(async () => {
      if (Platform.OS === "web") return memoryReceipt ? { ...memoryReceipt } : null;
      try {
        const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConsentReceiptStorageError();
        const record = value as Record<string, unknown>;
        if (Object.keys(record).length !== 4 ||
          typeof record.noticeVersion !== "string" || !record.noticeVersion.trim() ||
          typeof record.acceptedAt !== "string" || Number.isNaN(Date.parse(record.acceptedAt)) ||
          typeof record.privacyUrl !== "string" || !record.privacyUrl.startsWith("https://") ||
          typeof record.termsUrl !== "string" || !record.termsUrl.startsWith("https://")) throw new ConsentReceiptStorageError();
        return { noticeVersion: record.noticeVersion, acceptedAt: record.acceptedAt,
          privacyUrl: record.privacyUrl, termsUrl: record.termsUrl };
      } catch { throw new ConsentReceiptStorageError(); }
    });
  },
  save(receipt: NecessaryProcessingReceipt, signal?: AbortSignal): Promise<void> {
    return serialize(async () => {
      if (signal?.aborted) throw new ConsentReceiptStorageError();
      const value = metadata(receipt);
      try {
        if (Platform.OS === "web") memoryReceipt = value;
        else await SecureStore.setItemAsync(KEY, JSON.stringify(value), OPTIONS);
      } catch { throw new ConsentReceiptStorageError(); }
      if (signal?.aborted) throw new ConsentReceiptStorageError();
    });
  },
};

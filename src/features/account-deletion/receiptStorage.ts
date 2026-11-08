import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { parseDeletionReceipt } from "./parsers";
import type { DeletionReceipt } from "./types";

const KEY = "sport-center.account-deletion-receipt.v1";
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
let browserReceipt: DeletionReceipt | null = null;
let pending: Promise<unknown> = Promise.resolve();
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const result = pending.then(action, action);
  pending = result.catch(() => {});
  return result;
}
async function read(): Promise<DeletionReceipt | null> {
  if (Platform.OS === "web") return browserReceipt;
  const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (!raw) return null;
  try { return parseDeletionReceipt(JSON.parse(raw)); }
  catch {
    // An unreadable capability must not block this installation forever. Report
    // the loss once; never infer deletion or restore a mutation from corrupt data.
    await erase();
    throw new Error("INVALID_STORED_DELETION_RECEIPT");
  }
}
async function erase() {
  if (Platform.OS === "web") { browserReceipt = null; return; }
  try { await SecureStore.deleteItemAsync(KEY, OPTIONS); }
  catch { await SecureStore.setItemAsync(KEY, "", OPTIONS); }
}
export const deletionReceiptStorage = {
  read: () => serialize(read),
  write(receipt: DeletionReceipt, isCurrent: () => boolean): Promise<void> {
    const safe = parseDeletionReceipt(receipt);
    return serialize(async () => {
      if (!isCurrent()) throw new Error("DELETION_SESSION_CHANGED");
      if (Platform.OS === "web") browserReceipt = safe;
      else await SecureStore.setItemAsync(KEY, JSON.stringify(safe), OPTIONS);
      if (!isCurrent()) { await erase(); throw new Error("DELETION_SESSION_CHANGED"); }
    });
  },
  clear(expected: DeletionReceipt): Promise<void> {
    return serialize(async () => {
      const stored = await read();
      if (stored?.requestId === expected.requestId && stored.receiptToken === expected.receiptToken) await erase();
    });
  },
};

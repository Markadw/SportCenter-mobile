import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { deletionReceiptStorage } from "../src/features/account-deletion/receiptStorage";
import { InvalidDeletionResponse } from "../src/features/account-deletion/parsers";
import { deferred } from "./fixtures/auth";

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 4,
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));
const KEY = "sport-center.account-deletion-receipt.v1", OPTIONS = { keychainAccessible: 4 };
const receipt = { requestId: "11111111-2222-4333-8444-555555555555", receiptToken: "r".repeat(43), ownerId: 17 };
const other = { requestId: "d9fb3cb4-7207-4d85-8029-bdc550078013", receiptToken: "n".repeat(43), ownerId: 29 };
let raw: string | null;
beforeEach(() => {
  raw = null;
  jest.mocked(SecureStore.getItemAsync).mockReset().mockImplementation(async () => raw);
  jest.mocked(SecureStore.setItemAsync).mockReset().mockImplementation(async (_key, value) => { raw = value; });
  jest.mocked(SecureStore.deleteItemAsync).mockReset().mockImplementation(async () => { raw = null; });
});
afterEach(() => jest.restoreAllMocks());

test("guarda sólo identificador, propietario y comprobante en llavero de este dispositivo", async () => {
  await deletionReceiptStorage.write(receipt, () => true);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(KEY, JSON.stringify(receipt), OPTIONS);
  await expect(deletionReceiptStorage.read()).resolves.toEqual(receipt);
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith(KEY, OPTIONS);
  expect(Object.keys(JSON.parse(raw!)).sort()).toEqual(["ownerId", "receiptToken", "requestId"]);
});

test.each(["code", "accessToken", "refreshToken", "confirmationToken", "email"])("no permite persistir el campo %s junto al comprobante", extra => {
  expect(() => deletionReceiptStorage.write({ ...receipt, [extra]: "private" }, () => true)).toThrow(InvalidDeletionResponse);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

test.each([
  { ...receipt, ownerId: 0 }, { ...receipt, ownerId: "17" }, { ...receipt, requestId: "../profile" },
  { ...receipt, receiptToken: "short" }, { requestId: receipt.requestId },
])("no persiste recibos inválidos: %#", invalid => {
  expect(() => deletionReceiptStorage.write(invalid as typeof receipt, () => true)).toThrow(InvalidDeletionResponse);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

test("verifica la cuenta antes de iniciar la escritura", async () => {
  raw = JSON.stringify(other);
  await expect(deletionReceiptStorage.write(receipt, () => false)).rejects.toThrow("DELETION_SESSION_CHANGED");
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  await expect(deletionReceiptStorage.read()).resolves.toEqual(other);
});

test("cambio de cuenta durante escritura borra el recibo anterior y respeta la cola de la nueva cuenta", async () => {
  const blocked = deferred<void>();
  jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (_key, value) => { await blocked.promise; raw = value; });
  let current = true;
  const saving = deletionReceiptStorage.write(receipt, () => current);
  const rejected = expect(saving).rejects.toThrow("DELETION_SESSION_CHANGED");
  await Promise.resolve();
  current = false;
  const newAccount = deletionReceiptStorage.write(other, () => true);
  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  blocked.resolve();
  await rejected;
  await newAccount;
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEY, OPTIONS);
  await expect(deletionReceiptStorage.read()).resolves.toEqual(other);
});

test("clear espera la escritura pendiente antes de eliminar el mismo comprobante", async () => {
  const blocked = deferred<void>();
  jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (_key, value) => { await blocked.promise; raw = value; });
  const saving = deletionReceiptStorage.write(receipt, () => true);
  await Promise.resolve();
  const clearing = deletionReceiptStorage.clear(receipt);
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  blocked.resolve();
  await Promise.all([saving, clearing]);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEY, OPTIONS);
  await expect(deletionReceiptStorage.read()).resolves.toBeNull();
});

test("clear del recibo anterior nunca borra el comprobante de otra cuenta", async () => {
  await deletionReceiptStorage.write(other, () => true);
  await deletionReceiptStorage.clear(receipt);
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  await expect(deletionReceiptStorage.read()).resolves.toEqual(other);
});

test("si delete falla sobrescribe; si también falla informa el error", async () => {
  await deletionReceiptStorage.write(receipt, () => true);
  jest.mocked(SecureStore.deleteItemAsync).mockRejectedValue(new Error("locked"));
  await deletionReceiptStorage.clear(receipt);
  expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(KEY, "", OPTIONS);
  await expect(deletionReceiptStorage.read()).resolves.toBeNull();
  raw = JSON.stringify(receipt);
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("locked"));
  await expect(deletionReceiptStorage.clear(receipt)).rejects.toThrow("locked");
});

test("fallos de lectura o escritura segura se propagan, no simulan éxito", async () => {
  jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("read locked"));
  await expect(deletionReceiptStorage.read()).rejects.toThrow("read locked");
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("write locked"));
  await expect(deletionReceiptStorage.write(receipt, () => true)).rejects.toThrow("write locked");
});

test.each(["{", "null", "[]", "{}", JSON.stringify({ ...receipt, ownerId: -1 }), JSON.stringify({ ...receipt, code: "123456" })])(
  "lectura corrupta se descarta y se informa, sin volver a tratarla como un comprobante válido: %#", async value => {
    raw = value;
    await expect(deletionReceiptStorage.read()).rejects.toThrow();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEY, OPTIONS);
    await expect(deletionReceiptStorage.read()).resolves.toBeNull();
  },
);

test("web usa memoria y nunca localStorage, sessionStorage ni llavero como texto plano", async () => {
  jest.replaceProperty(Platform, "OS", "web");
  const browserStore = { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: browserStore });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: browserStore });
  try {
    await deletionReceiptStorage.write(receipt, () => true);
    await expect(deletionReceiptStorage.read()).resolves.toEqual(receipt);
    await deletionReceiptStorage.clear(other);
    await expect(deletionReceiptStorage.read()).resolves.toEqual(receipt);
    await deletionReceiptStorage.clear(receipt);
    await expect(deletionReceiptStorage.read()).resolves.toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(browserStore.getItem).not.toHaveBeenCalled();
    expect(browserStore.setItem).not.toHaveBeenCalled();
    expect(browserStore.removeItem).not.toHaveBeenCalled();
  } finally {
    Reflect.deleteProperty(globalThis, "localStorage");
    Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createNecessaryProcessingReceipt } from "../src/features/privacy/consentReceipt";
import { ConsentReceiptStorageError, consentReceiptStorage } from "../src/features/privacy/consentReceiptStorage";

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 4, getItemAsync: jest.fn(), setItemAsync: jest.fn(),
}));
const receipt = createNecessaryProcessingReceipt(true, Date.UTC(2026,10,1));
beforeEach(() => {
  jest.mocked(SecureStore.setItemAsync).mockReset().mockResolvedValue();
  jest.mocked(SecureStore.getItemAsync).mockReset().mockResolvedValue(null);
});
afterEach(() => jest.restoreAllMocks());

test("el recibo nativo guarda sólo versión, fecha y URLs con una llave distinta de sesión", async () => {
  await consentReceiptStorage.save({ ...receipt, email: "privado@example.test", passw: "no-persistir", accessToken: "token-secreto" } as typeof receipt);
  const [key, raw, options] = jest.mocked(SecureStore.setItemAsync).mock.calls[0];
  expect(key).toBe("sport-center.necessary-processing-receipt");
  expect(key).not.toBe("sport-center.session");
  expect(options).toEqual({ keychainAccessible: 4 });
  expect(Object.keys(JSON.parse(raw)).sort()).toEqual(["noticeVersion","acceptedAt","privacyUrl","termsUrl"].sort());
  expect(raw).not.toMatch(/privado|no-persistir|token-secreto|marketing|passw/);
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(raw);
  expect(await consentReceiptStorage.read()).toEqual(JSON.parse(raw));
});

test("web conserva sólo metadatos en memoria sin tocar SecureStore ni localStorage", async () => {
  jest.replaceProperty(Platform, "OS", "web");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const get = jest.fn(), set = jest.fn();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: get, setItem: set } });
  try {
    await consentReceiptStorage.save(receipt);
    expect(await consentReceiptStorage.read()).toMatchObject({ noticeVersion: receipt.noticeVersion, acceptedAt: receipt.acceptedAt });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("no oculta fallos de almacenamiento ni escribe si se canceló la espera", async () => {
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("detalle nativo"));
  await expect(consentReceiptStorage.save(receipt)).rejects.toBeInstanceOf(ConsentReceiptStorageError);
  const abort = new AbortController(); abort.abort();
  await expect(consentReceiptStorage.save(receipt, abort.signal)).rejects.toBeInstanceOf(ConsentReceiptStorageError);
  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
});

test("un recibo antiguo con datos ajenos al esquema no se interpreta como una nueva aceptación", async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify({ ...receipt, email: "privado@example.test" }));
  await expect(consentReceiptStorage.read()).rejects.toBeInstanceOf(ConsentReceiptStorageError);
});

test("una aceptación anterior conserva su versión y fecha sin convertirse en aceptación del aviso nuevo", async () => {
  const previous = {
    noticeVersion: "mobile-necessary-processing-v1",
    acceptedAt: "2026-11-01T00:00:00.000Z",
    privacyUrl: receipt.privacyUrl,
    termsUrl: receipt.termsUrl,
  };
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(previous));
  expect(await consentReceiptStorage.read()).toEqual(previous);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

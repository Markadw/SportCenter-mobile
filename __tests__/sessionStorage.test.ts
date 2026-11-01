import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { InvalidStoredSession, SessionStorageError, sessionStorage } from "../src/features/auth/storage/sessionStorage";
import { deferred } from "./fixtures/auth";

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 4,
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));
const record = { refreshToken: "refresh-secreto", sessionId: "sesion-1" };

beforeEach(() => {
  jest.mocked(SecureStore.getItemAsync).mockReset().mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockReset().mockResolvedValue();
  jest.mocked(SecureStore.deleteItemAsync).mockReset().mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());

describe("almacenamiento seguro de sesión", () => {
  test("sólo escribe refreshToken y sessionId y limita el llavero a este dispositivo desbloqueado", async () => {
    await sessionStorage.write({ ...record, accessToken: "no-persistir", passw: "no-persistir", email: "privado" } as typeof record, () => true);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("sport-center.session", JSON.stringify(record), { keychainAccessible: 4 });
    expect(JSON.stringify(jest.mocked(SecureStore.setItemAsync).mock.calls)).not.toMatch(/no-persistir|privado/);
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(record));
    await expect(sessionStorage.read()).resolves.toEqual(record);
  });

  test.each(["{", "null", "[]", "{}", JSON.stringify({ ...record, accessToken: "viejo" }), JSON.stringify({ ...record, refreshToken: " " })])(
    "rechaza esquema almacenado malformado: %#", async (raw) => {
      jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(raw);
      await expect(sessionStorage.read()).rejects.toBeInstanceOf(InvalidStoredSession);
    },
  );

  test("web conserva tokens únicamente en memoria del proveedor", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    const get = jest.fn();
    const set = jest.fn();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: get, setItem: set } });
    try {
      await sessionStorage.write(record, () => true);
      await expect(sessionStorage.read()).resolves.toBeNull();
      await sessionStorage.clear();
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
      expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    } finally { Reflect.deleteProperty(globalThis, "localStorage"); }
  });

  test("logout espera una escritura pendiente y borra su resultado antes de terminar", async () => {
    const pending = deferred<void>();
    jest.mocked(SecureStore.setItemAsync).mockReturnValueOnce(pending.promise);
    let active = true;
    const saving = sessionStorage.write(record, () => active);
    await Promise.resolve();
    active = false;
    const clearing = sessionStorage.clear();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    pending.resolve();
    await Promise.all([saving, clearing]);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    expect(jest.mocked(SecureStore.setItemAsync).mock.calls).toHaveLength(1);
  });

  test("si falla delete, sobrescribe las credenciales; si tampoco se puede, informa el fallo", async () => {
    jest.mocked(SecureStore.deleteItemAsync).mockRejectedValue(new Error("llavero"));
    await sessionStorage.clear();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("sport-center.session", "", { keychainAccessible: 4 });
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("llavero"));
    await expect(sessionStorage.clear()).rejects.toBeInstanceOf(SessionStorageError);
  });

  test("no oculta un fallo de lectura o escritura del sistema", async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("llavero"));
    await expect(sessionStorage.read()).rejects.toBeInstanceOf(SessionStorageError);
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("llavero"));
    await expect(sessionStorage.write(record, () => true)).rejects.toBeInstanceOf(SessionStorageError);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });
});

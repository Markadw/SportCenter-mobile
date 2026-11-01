import { waitFor } from "@testing-library/react-native";
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { authApi } from "../src/api/authApi";
import { SessionController, SessionRequestError } from "../src/features/auth/context/SessionController";
import { InvalidSessionResponse } from "../src/features/auth/errors";
import { InvalidStoredSession, sessionStorage } from "../src/features/auth/storage/sessionStorage";
import type { Session } from "../src/features/auth/types";
import { deferred, loginCredentials } from "./fixtures/auth";

const original: Session = { accessToken: "access-1", refreshToken: "refresh-1", sessionId: "session-1", expiresAt: 901_000 };
const renewed: Session = { ...original, accessToken: "access-2", refreshToken: "refresh-2", expiresAt: 1_801_000 };
function unauthorized() {
  return new AxiosError("no activo", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 401, statusText: "Unauthorized", headers: new AxiosHeaders(), data: {}, config: {} as InternalAxiosRequestConfig,
  });
}
let api: jest.Mocked<Pick<typeof authApi, "login" | "refresh" | "logout">>;
let storage: jest.Mocked<typeof sessionStorage>;
let controller: SessionController;
let now: number;

beforeEach(() => {
  now = 1_000;
  api = { login: jest.fn().mockResolvedValue(original), refresh: jest.fn().mockResolvedValue(renewed), logout: jest.fn().mockResolvedValue(undefined) };
  storage = { read: jest.fn().mockResolvedValue(null), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) };
  controller = new SessionController({ api, storage, now: () => now });
});
afterEach(() => controller.dispose());
async function start() {
  controller.activate();
  await waitFor(() => expect(controller.getSnapshot().isRestoring).toBe(false));
}
async function login() {
  await start();
  await controller.signIn(loginCredentials, new AbortController().signal);
}

describe("coordinación de sesión segura", () => {
  test("restaurar no concede acceso hasta validar el refresh y guarda su rotación", async () => {
    const pending = deferred<Session>();
    storage.read.mockResolvedValueOnce({ refreshToken: original.refreshToken, sessionId: original.sessionId });
    api.refresh.mockReturnValueOnce(pending.promise);
    controller.activate();
    expect(controller.getSnapshot()).toMatchObject({ session: null, isRestoring: true });
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    expect(controller.getSnapshot().session).toBeNull();
    pending.resolve(renewed);
    await waitFor(() => expect(controller.getSnapshot().isRestoring).toBe(false));
    expect(controller.getSnapshot().session).toEqual(renewed);
    expect(storage.write).toHaveBeenCalledWith(renewed, expect.any(Function));
  });

  test("credenciales rechazadas o esquema inválido de refresh retiran acceso y almacenamiento", async () => {
    await login();
    api.refresh.mockRejectedValueOnce(unauthorized());
    now = original.expiresAt;
    await expect(controller.refreshIfNeeded()).rejects.toBeInstanceOf(SessionRequestError);
    expect(controller.getSnapshot()).toMatchObject({ session: null, notice: expect.stringContaining("ya no está activa") });
    expect(storage.clear).toHaveBeenCalledTimes(2);
    api.login.mockResolvedValueOnce(original);
    await controller.signIn(loginCredentials, new AbortController().signal);
    api.refresh.mockRejectedValueOnce(new InvalidSessionResponse());
    await expect(controller.refreshIfNeeded()).rejects.toBeInstanceOf(SessionRequestError);
    expect(controller.getSnapshot().session).toBeNull();
  });

  test("una sesión almacenada malformada se elimina sin enviar tokens al servidor", async () => {
    storage.read.mockRejectedValueOnce(new InvalidStoredSession());
    await start();
    expect(api.refresh).not.toHaveBeenCalled();
    expect(storage.clear).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().session).toBeNull();
  });

  test("renovaciones concurrentes por requests, temporizador o foreground comparten un único refresh", async () => {
    await login();
    const pending = deferred<Session>();
    api.refresh.mockReturnValueOnce(pending.promise);
    now = original.expiresAt - 1_000;
    const identity = controller.identityFor(original.accessToken)!;
    const operations = [controller.tokenFor(identity), controller.tokenFor(identity, true), controller.refreshIfNeeded()];
    expect(api.refresh).toHaveBeenCalledTimes(1);
    pending.resolve(renewed);
    await expect(Promise.all(operations)).resolves.toEqual([renewed.accessToken, renewed.accessToken, undefined]);
    await expect(controller.tokenFor(identity, true)).resolves.toBe(renewed.accessToken);
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  test("logout offline retira acceso y borra datos antes de esperar la red", async () => {
    await login();
    const pending = deferred<void>();
    api.logout.mockReturnValueOnce(pending.promise);
    const operation = controller.signOut();
    expect(controller.getSnapshot().session).toBeNull();
    await waitFor(() => expect(api.logout).toHaveBeenCalledTimes(1));
    expect(storage.clear).toHaveBeenCalledTimes(2);
    pending.reject(new AxiosError("sin red", "ERR_NETWORK"));
    await operation;
    expect(controller.getSnapshot().notice).toContain("no pudimos confirmar el cierre");
  });

  test("un refresh tardío después de logout no resucita ni escribe la sesión", async () => {
    await login();
    const pending = deferred<Session>();
    api.refresh.mockReturnValueOnce(pending.promise);
    now = original.expiresAt;
    const operation = controller.refreshIfNeeded().catch(() => {});
    const signal = api.refresh.mock.calls[0][1];
    await controller.signOut();
    pending.resolve(renewed);
    await operation;
    expect(signal?.aborted).toBe(true);
    expect(storage.write).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().session).toBeNull();
  });

  test("un refresh fallido de la cuenta anterior no cierra la nueva cuenta", async () => {
    await login();
    const pending = deferred<Session>();
    api.refresh.mockReturnValueOnce(pending.promise);
    now = original.expiresAt;
    const operation = controller.refreshIfNeeded().catch(() => {});
    const other = { ...renewed, accessToken: "access-otra", sessionId: "session-otra" };
    api.login.mockResolvedValueOnce(other);
    await controller.signIn({ ...loginCredentials, email: "otra@example.test" }, new AbortController().signal);
    pending.reject(unauthorized());
    await operation;
    expect(controller.getSnapshot().session).toEqual(other);
    expect(controller.getSnapshot().notice).toBeNull();
  });

  test("una restauración tardía no reemplaza un login ni un logout reciente", async () => {
    const pending = deferred<Session>();
    storage.read.mockResolvedValueOnce(original);
    api.refresh.mockReturnValueOnce(pending.promise);
    controller.activate();
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    await controller.signIn(loginCredentials, new AbortController().signal);
    pending.resolve(renewed);
    await waitFor(() => expect(controller.getSnapshot().isRestoring).toBe(false));
    expect(controller.getSnapshot().session).toEqual(original);
  });

  test("fallo de persistencia muestra que la sesión sólo está en memoria", async () => {
    await start();
    storage.write.mockRejectedValueOnce(new Error("llavero no disponible"));
    await controller.signIn(loginCredentials, new AbortController().signal);
    expect(controller.getSnapshot().session).toEqual(original);
    expect(controller.getSnapshot().notice).toContain("sólo seguirá abierta hasta cerrar la aplicación");
    storage.clear.mockRejectedValueOnce(new Error("llavero no disponible"));
    await controller.signOut();
    expect(controller.getSnapshot().session).toBeNull();
    expect(controller.getSnapshot().notice).toContain("no pudimos borrar");
  });

  test("sin red un token vencido pierde acceso y se recupera sólo con refresh validado", async () => {
    await login();
    api.refresh.mockRejectedValueOnce(new AxiosError("sin red", "ERR_NETWORK"));
    now = original.expiresAt;
    await expect(controller.refreshIfNeeded()).rejects.toBeInstanceOf(SessionRequestError);
    expect(controller.getSnapshot().session).toBeNull();
    expect(storage.clear).toHaveBeenCalledTimes(1);
    await controller.refreshIfNeeded();
    expect(controller.getSnapshot().session).toEqual(renewed);
  });

  test("cancelar el login mientras persiste impide abrir sesión y borra el resultado", async () => {
    await start();
    const pending = deferred<void>();
    storage.write.mockReturnValueOnce(pending.promise);
    const abort = new AbortController();
    const operation = controller.signIn(loginCredentials, abort.signal);
    await waitFor(() => expect(storage.write).toHaveBeenCalledTimes(1));
    abort.abort();
    pending.resolve();
    await operation;
    expect(controller.getSnapshot().session).toBeNull();
    expect(storage.clear).toHaveBeenCalledTimes(2);
  });

  test("un login tardío no reemplaza otra cuenta ni persiste después de desmontar", async () => {
    await start();
    const pending = deferred<Session>();
    api.login.mockReturnValueOnce(pending.promise);
    const operation = controller.signIn(loginCredentials, new AbortController().signal);
    await waitFor(() => expect(api.login).toHaveBeenCalledTimes(1));
    controller.dispose();
    pending.resolve(original);
    await operation;
    expect(storage.write).not.toHaveBeenCalled();
    expect(controller.getSnapshot().session).toBeNull();
  });
});


test("un TTL corto se renueva con anticipación proporcional y no genera bucle inmediato", async () => {
  await start();
  api.login.mockResolvedValueOnce({ ...original, expiresAt: now + 1_000 });
  await controller.signIn(loginCredentials, new AbortController().signal);
  expect(controller.refreshDelay()).toBe(500);
  await controller.refreshIfNeeded();
  expect(api.refresh).not.toHaveBeenCalled();
  now += 500;
  api.refresh.mockResolvedValueOnce({ ...renewed, expiresAt: now + 1_000 });
  await controller.refreshIfNeeded();
  expect(api.refresh).toHaveBeenCalledTimes(1);
  expect(controller.refreshDelay()).toBe(500);
  await controller.refreshIfNeeded();
  expect(api.refresh).toHaveBeenCalledTimes(1);
});

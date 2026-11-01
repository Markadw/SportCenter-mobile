import { waitFor } from "@testing-library/react-native";
import { AxiosError, AxiosHeaders, create, type AxiosAdapter, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import env from "../src/config/env";
import { authApi } from "../src/api/authApi";
import { SessionController, SessionRequestError } from "../src/features/auth/context/SessionController";
import { registerSessionInterceptors } from "../src/features/auth/context/sessionInterceptors";
import type { Session } from "../src/features/auth/types";
import { deferred, loginCredentials } from "./fixtures/auth";

const original: Session = { accessToken: "access-1", refreshToken: "refresh-1", sessionId: "session-1", expiresAt: Date.now() + 900_000 };
const renewed: Session = { ...original, accessToken: "access-2", refreshToken: "refresh-2", expiresAt: Date.now() + 1_800_000 };
function response(config: InternalAxiosRequestConfig) {
  return { config, data: { ok: true }, status: 200, statusText: "OK", headers: new AxiosHeaders() };
}
function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError("no activo", "ERR_BAD_REQUEST", config, undefined, { ...response(config), status: 401 });
}
let api: jest.Mocked<Pick<typeof authApi, "login" | "refresh" | "logout">>;
let client: AxiosInstance;
let adapter: jest.MockedFunction<AxiosAdapter>;
let controller: SessionController;
let unregister: () => void;
let now: number;
beforeEach(async () => {
  now = Date.now();
  api = { login: jest.fn().mockResolvedValue(original), refresh: jest.fn().mockResolvedValue(renewed), logout: jest.fn().mockResolvedValue(undefined) };
  controller = new SessionController({ api, now: () => now, storage: {
    read: jest.fn().mockResolvedValue(null), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined),
  } });
  controller.activate();
  await waitFor(() => expect(controller.getSnapshot().isRestoring).toBe(false));
  await controller.signIn(loginCredentials, new AbortController().signal);
  adapter = jest.fn(async (config) => response(config));
  client = create({ baseURL: env.apiUrl, adapter });
  unregister = registerSessionInterceptors(client, controller);
});
afterEach(() => { unregister(); controller.dispose(); });
function headers(token = original.accessToken) { return { Authorization: `Bearer ${token}` }; }

describe("interceptores de sesión acotados", () => {
  test.each(["/users/profile", "/products/cart", "/products/orders/user", "/products/reviews/product/7/eligibility"])("un 401 GET privado %s renueva una vez y reintenta con el token nuevo", async (url) => {
    adapter.mockImplementationOnce(async (config) => { throw unauthorized(config); });
    await expect(client.get(url, { headers: headers() })).resolves.toMatchObject({ data: { ok: true } });
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(adapter.mock.calls[1][0].headers.get("Authorization")).toBe("Bearer access-2");
  });

  test("401 simultáneos comparten refresh y cada GET se reintenta como máximo una vez", async () => {
    const pending = deferred<Session>();
    api.refresh.mockReturnValueOnce(pending.promise);
    adapter.mockImplementation(async (config) => {
      if (config.headers.get("Authorization") === "Bearer access-1") throw unauthorized(config);
      return response(config);
    });
    const operations = [client.get("/users/profile", { headers: headers() }), client.head("/users/profile", { headers: headers() })];
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    pending.resolve(renewed);
    await Promise.all(operations);
    expect(adapter).toHaveBeenCalledTimes(4);
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  test("un segundo 401 termina la sesión sin bucle de refresh ni tercer envío", async () => {
    adapter.mockImplementation(async (config) => { throw unauthorized(config); });
    await expect(client.get("/users/profile", { headers: headers() })).rejects.toMatchObject({ response: { status: 401 } });
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().session).toBeNull();
  });

  test.each(["post", "put", "patch", "delete"] as const)("un 401 %s renueva pero exige reenvío manual", async (method) => {
    adapter.mockImplementationOnce(async (config) => { throw unauthorized(config); });
    await expect(client.request({ method, url: "/products/checkout/confirm", data: { quantity: 1 }, headers: headers() })).rejects.toBeInstanceOf(SessionRequestError);
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().session?.accessToken).toBe(renewed.accessToken);
  });

  test("antes de enviar una compra renueva un token próximo a vencer, sin repetir la compra", async () => {
    now = original.expiresAt - 5_000;
    await client.post("/products/checkout/confirm", { quantity: 1 }, { headers: headers() });
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0].headers.get("Authorization")).toBe("Bearer access-2");
  });

  test.each([
    ["post", "/users/login-user"], ["post", "/users/create-user"], ["post", "/users/verify-email"],
    ["post", "/users/resend-code"], ["post", "/users/refresh-token"],
    ["get", "/products/get-all-products"], ["head", "/products/get-all-products"],
    ["get", "/products/get-product-details/7"], ["get", "/products/get-all-categories"],
    ["get", "/products/get-all-marcas"], ["get", "/products/menu/sports"],
    ["get", "/products/reviews/product/7"],
    ["get", "https://externo.example/users/profile"], ["get", "//externo.example/users/profile"],
  ])("no renueva ni sustituye Authorization en operación pública o externa: %s %s", async (method, url) => {
    now = original.expiresAt;
    await client.request({ method, url, headers: headers() });
    expect(api.refresh).not.toHaveBeenCalled();
    expect(adapter.mock.calls[0][0].headers.get("Authorization")).toBe("Bearer access-1");
  });

  test.each([
    "/products/get-all-products", "/products/get-product-details/7", "/products/get-all-categories",
    "/products/get-all-marcas", "/products/menu/sports", "/products/reviews/product/7",
  ])("no inyecta Authorization en lectura pública %s", async (url) => {
    now = original.expiresAt;
    await client.get(url);
    expect(api.refresh).not.toHaveBeenCalled();
    expect(adapter.mock.calls[0][0].headers.get("Authorization")).toBeUndefined();
  });

  test.each(["/users/verify-user-email", "/users/verify-user-token", "/users/reset-psw"])(
    "recuperación pública %s sin Bearer no activa refresh ni reenvío ante 401", async (url) => {
      now = original.expiresAt;
      adapter.mockImplementationOnce(async (config) => { throw unauthorized(config); });
      await expect(client.post(url, { email: "cliente@example.test" })).rejects.toMatchObject({ response: { status: 401 } });
      expect(adapter).toHaveBeenCalledTimes(1);
      expect(adapter.mock.calls[0][0].headers.get("Authorization")).toBeUndefined();
      expect(api.refresh).not.toHaveBeenCalled();
      expect(controller.getSnapshot().session).toEqual(original);
    },
  );

  test("la exclusión pública depende del método y no alcanza mutaciones de la misma ruta", async () => {
    now = original.expiresAt - 5_000;
    await client.post("/products/reviews/product/7", {}, { headers: headers() });
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0].headers.get("Authorization")).toBe("Bearer access-2");
  });

  test("no inyecta tokens en requests sin autorización ni con otro bearer o baseURL externa", async () => {
    now = original.expiresAt;
    await client.get("/users/profile");
    await client.get("/users/profile", { headers: headers("otro-token") });
    await client.get("/users/profile", { baseURL: "https://externo.example", headers: headers() });
    expect(api.refresh).not.toHaveBeenCalled();
    expect(adapter.mock.calls[0][0].headers.get("Authorization")).toBeUndefined();
    expect(adapter.mock.calls[1][0].headers.get("Authorization")).toBe("Bearer otro-token");
    expect(adapter.mock.calls[2][0].headers.get("Authorization")).toBe("Bearer access-1");
  });

  test("un 401 antiguo de otra cuenta no renueva, no repite y no cierra la cuenta nueva", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    adapter.mockImplementationOnce(() => pending.promise);
    const operation = client.get("/users/profile", { headers: headers() }).catch((error: unknown) => error);
    await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
    const previous = adapter.mock.calls[0][0];
    const other = { ...renewed, accessToken: "otra-cuenta", sessionId: "otra-sesion" };
    api.login.mockResolvedValueOnce(other);
    await controller.signIn({ ...loginCredentials, email: "otra@example.test" }, new AbortController().signal);
    pending.reject(unauthorized(previous));
    await operation;
    expect(api.refresh).not.toHaveBeenCalled();
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().session).toEqual(other);
  });

  test("cambiar de cuenta durante refresh cancela el reintento del request original", async () => {
    const pending = deferred<Session>();
    api.refresh.mockReturnValueOnce(pending.promise);
    adapter.mockImplementationOnce(async (config) => { throw unauthorized(config); });
    const operation = client.get("/users/profile", { headers: headers() }).catch((error: unknown) => error);
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    const other = { ...renewed, accessToken: "otra-cuenta", sessionId: "otra-sesion" };
    api.login.mockResolvedValueOnce(other);
    await controller.signIn(loginCredentials, new AbortController().signal);
    pending.resolve(renewed);
    expect(await operation).toBeInstanceOf(SessionRequestError);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().session).toEqual(other);
  });

  test("desregistrar el proveedor elimina ambos interceptores", async () => {
    unregister();
    now = original.expiresAt;
    adapter.mockImplementationOnce(async (config) => { throw unauthorized(config); });
    await expect(client.get("/users/profile", { headers: headers() })).rejects.toMatchObject({ response: { status: 401 } });
    expect(api.refresh).not.toHaveBeenCalled();
    expect(controller.getSnapshot().session).toEqual(original);
  });
});

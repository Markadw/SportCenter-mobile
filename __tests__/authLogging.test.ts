import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import axiosClient from "../src/api/axios";

const originalAdapter = axiosClient.defaults.adapter;
let adapter: jest.MockedFunction<AxiosAdapter>;

function rejectResponse(config: InternalAxiosRequestConfig, status: number) {
  return new AxiosError("detalle interno con credenciales", "ERR_BAD_REQUEST", config, undefined, {
    config, status, statusText: "Error", headers: new AxiosHeaders(),
    data: { message: "dato-interno", token: "token-privado" },
  });
}

beforeEach(() => {
  adapter = jest.fn();
  axiosClient.defaults.adapter = adapter;
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  axiosClient.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("HU-02: registros de respuestas de autenticación", () => {
  test.each([
    ["/users/login-user", 400], ["/users/login-user", 401], ["/users/login-user", 429],
    ["/users/create-user", 400], ["/users/verify-email", 400], ["/users/resend-code", 400],
    ["/users/refresh-token", 401], ["/users/profile", 401], ["/users/logout", 401],
  ])("%s HTTP %s se informa sin advertencia y sigue rechazando la operación", async (url, status) => {
    let original: AxiosError | undefined;
    adapter.mockImplementationOnce(async (config) => {
      original = rejectResponse(config, status);
      throw original;
    });
    const result = await axiosClient.post(url, { passw: "contraseña-privada" }).catch((error: unknown) => error);
    expect(result).toBe(original);
    expect(console.info).toHaveBeenCalledWith(`[API] ← HTTP ${status} ${url}`);
    expect(console.warn).not.toHaveBeenCalled();
  });

  test.each([
    ["/users/login-user", 500], ["/users/login-user", 404], ["/products/get-all-products", 400],
  ])("%s HTTP %s conserva la advertencia de fallo inesperado", async (url, status) => {
    adapter.mockImplementationOnce(async (config) => { throw rejectResponse(config, status); });
    await expect(axiosClient.get(url)).rejects.toMatchObject({ response: { status } });
    expect(console.warn).toHaveBeenCalledWith(`[API] ✕ HTTP ${status} ${url}`);
  });

  test("una desconexión conserva la advertencia y el rechazo", async () => {
    const error = new AxiosError("sin conexión", "ERR_NETWORK");
    adapter.mockImplementationOnce(async (config) => { error.config = config; throw error; });
    await expect(axiosClient.post("/users/login-user", {})).rejects.toBe(error);
    expect(console.warn).toHaveBeenCalledWith("[API] ✕ Sin respuesta del servidor /users/login-user");
  });

  test("no registra el cuerpo, contraseña, cabeceras ni parámetros de la petición rechazada", async () => {
    adapter.mockImplementationOnce(async (config) => { throw rejectResponse(config, 400); });
    await expect(axiosClient.post("/users/login-user?email=correo-privado", { passw: "contraseña-privada" },
      { headers: { Authorization: "Bearer token-privado" } })).rejects.toMatchObject({ response: { status: 400 } });
    const logs = JSON.stringify([jest.mocked(console.info).mock.calls, jest.mocked(console.warn).mock.calls]);
    expect(logs).not.toMatch(/dato-interno|correo-privado|contraseña-privada|token-privado|credenciales/);
  });
});

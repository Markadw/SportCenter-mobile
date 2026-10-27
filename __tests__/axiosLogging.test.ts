import axiosClient from "../src/api/axios";

const originalAdapter = axiosClient.defaults.adapter;
let info: jest.SpyInstance;
let warn: jest.SpyInstance;

beforeEach(() => {
  info = jest.spyOn(console, "info").mockImplementation(() => {});
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  axiosClient.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("Registro seguro de rechazos HTTP", () => {
  test("un 400 sigue llegando al formulario y se registra sin LogBox ni datos privados", async () => {
    const failure = { isAxiosError: true,
      config: { url: "/users/create-user?email=privado@example.test" },
      response: { status: 400, data: { message: "SMTP: detalle-interno" } },
    };
    axiosClient.defaults.adapter = jest.fn().mockRejectedValue(failure);
    await expect(axiosClient.post("/users/create-user?email=privado@example.test", { passw: "clave-ficticia" }))
      .rejects.toBe(failure);
    expect(info).toHaveBeenCalledWith("[API] ← HTTP 400 /users/create-user");
    expect(warn).not.toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/privado|clave-ficticia|SMTP|detalle-interno/);
  });

  test("los fallos del servidor mantienen su advertencia y no muestran la respuesta interna", async () => {
    const failure = { isAxiosError: true, config: { url: "/users/create-user" },
      response: { status: 500, data: { message: "detalle-interno" } } };
    axiosClient.defaults.adapter = jest.fn().mockRejectedValue(failure);
    await expect(axiosClient.post("/users/create-user", {})).rejects.toBe(failure);
    expect(warn).toHaveBeenCalledWith("[API] ✕ HTTP 500 /users/create-user");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("detalle-interno");
  });

  test("una pérdida de conexión mantiene su advertencia y propaga el fallo", async () => {
    const failure = { isAxiosError: true, config: { url: "/users/create-user" }, code: "ERR_NETWORK" };
    axiosClient.defaults.adapter = jest.fn().mockRejectedValue(failure);
    await expect(axiosClient.post("/users/create-user", {})).rejects.toBe(failure);
    expect(warn).toHaveBeenCalledWith("[API] ✕ Sin respuesta del servidor /users/create-user");
  });
});

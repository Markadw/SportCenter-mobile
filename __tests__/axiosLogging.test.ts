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

test.each([
  ["get", "/products/cart", "/products/cart"],
  ["post", "/products/cart/items", "/products/cart/items"],
  ["put", "/products/cart/items/987654321", "/products/cart/items/:id"],
  ["delete", "/products/cart/items/987654321", "/products/cart/items/:id"],
  ["get", "/products/reviews/product/987654321", "/products/reviews/product/:id"],
  ["get", "/products/reviews/product/987654321/eligibility", "/products/reviews/product/:id/eligibility"],
  ["get", "/products/checkout/summary?codigo_promocional=privado", "/products/checkout/summary"],
  ["post", "/products/checkout/confirm", "/products/checkout/confirm"],
  ["get", "/products/orders/987654321/tracking", "/products/orders/:id/tracking"],
  ["get", "/products/orders/user", "/products/orders/user"],
  ["get", "/ruta-privada/987654321?token=privado", "[ruta no registrada]"],
])("registra %s %s sin exponer datos privados", async (method, url, endpoint) => {
  axiosClient.defaults.adapter = async config => ({ config, status: 200, statusText: "OK", headers: {}, data: {} });
  await expect(axiosClient.request({ method, url, headers: { Authorization: "Bearer privado" } })).resolves.toMatchObject({ status: 200 });
  expect(info).toHaveBeenCalledWith(`[API] → ${method.toUpperCase()} ${endpoint}`);
  expect(info).toHaveBeenCalledWith(`[API] ← 200 ${endpoint}`);
  expect(warn).not.toHaveBeenCalled();
  expect(JSON.stringify(info.mock.calls)).not.toMatch(/987654321|privado|ruta-privada/);
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

  test("los fallos del servidor se diagnostican sin LogBox ni respuesta interna", async () => {
    const failure = { isAxiosError: true, config: { url: "/users/create-user" },
      response: { status: 500, data: { message: "detalle-interno" } } };
    axiosClient.defaults.adapter = jest.fn().mockRejectedValue(failure);
    await expect(axiosClient.post("/users/create-user", {})).rejects.toBe(failure);
    expect(info).toHaveBeenCalledWith("[API] ✕ HTTP 500 /users/create-user");
    expect(warn).not.toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toContain("detalle-interno");
  });

  test("una pérdida de conexión mantiene el diagnóstico y propaga el fallo", async () => {
    const failure = { isAxiosError: true, config: { url: "/users/create-user" }, code: "ERR_NETWORK" };
    axiosClient.defaults.adapter = jest.fn().mockRejectedValue(failure);
    await expect(axiosClient.post("/users/create-user", {})).rejects.toBe(failure);
    expect(info).toHaveBeenCalledWith("[API] ✕ Sin respuesta del servidor /users/create-user");
    expect(warn).not.toHaveBeenCalled();
  });
});

import axiosClient from "../src/api/axios";
import { cartApi } from "../src/api/cartApi";
import { checkoutApi } from "../src/api/checkoutApi";
import { parseCart, purchaseError } from "../src/features/cart/contracts";
import { parsePrepared, parseSummary, safePaymentUrl, validateAddress, validatePayload } from "../src/features/checkout/contracts";
import { getCheckoutDraft, saveCheckoutDraft } from "../src/features/checkout/draft";

jest.mock("../src/api/axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
const get = jest.mocked(axiosClient.get), post = jest.mocked(axiosClient.post), put = jest.mocked(axiosClient.put), remove = jest.mocked(axiosClient.delete);
const item = { id_variante: 12, id_producto: 7, nombre: "Balón", sku: "ROJO", cantidad: 2, precio_unitario: 270,
  stock: 3, activo: true, imagen: "https://example.test/ball.png", atributos: { Color: "Rojo", secret: { token: "hidden" } }, costo_promedio: 9 };
const cart = { id_carrito: 5, id_usuario: 2, items: [item], summary: { subtotal: 540, itemCount: 2 }, secret: "hidden" };
const address = { alias: "Casa", calle: "Norte", numero: "2", colonia: "", ciudad: "Puebla", estado: "Puebla", codigo_postal: "72000", pais: "México", principal: false };
const shipping = { id_metodo_envio: 3, nombre: "Estándar", descripcion: "", costo_base: 130, dias_min: 2, dias_max: 5, activo: true };
const summary = { cart: { items: [item] }, addresses: [{ ...address, id_direccion: "8", secret: "hidden" }],
  shippingMethods: [shipping, { ...shipping, id_metodo_envio: 4, activo: false }], selectedShippingMethod: shipping, appliedPromotion: null,
  totals: { subtotal: 540, discount: 10, shipping: 130, total: 660, itemCount: 2 }, paymentMethods: [{ numero: "sensitive" }] };
const prepared = { order: { id_orden: 9, total: "660.00", estado: "pendiente_pago" }, checkout: { provider: "mercado_pago", init_point: "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=test" } };

test("carrito envía variante real y cantidad, token por solicitud y usa total del servidor", async () => {
  post.mockResolvedValueOnce({ data: cart });
  const signal = new AbortController().signal;
  const result = await cartApi.add("token", 12, 2, signal);
  expect(post).toHaveBeenCalledWith("/products/cart/items", { id_variante: 12, cantidad: 2 }, { signal, headers: { Authorization: "Bearer token" } });
  expect(result).toEqual({ id: 5, items: [{ variantId: 12, productId: 7, name: "Balón", sku: "ROJO", quantity: 2, unitPrice: 270, stock: 3, active: true, image: item.imagen, attributes: { Color: "Rojo" } }], subtotal: 540, itemCount: 2 });
});
test.each([0, -1, 1.5, 100, NaN, Infinity])("no envía cantidad inválida %s", async quantity => {
  await expect(cartApi.add("token", 12, quantity)).rejects.toThrow();
  expect(post).not.toHaveBeenCalled();
});
test("actualizar admite cero y eliminar usa ID de variante", async () => {
  put.mockResolvedValueOnce({ data: { ...cart, items: [], summary: { subtotal: 0, itemCount: 0 } } });
  remove.mockResolvedValueOnce({ data: cart });
  await cartApi.update("token", 12, 0); await cartApi.remove("token", 12);
  expect(put).toHaveBeenCalledWith("/products/cart/items/12", { cantidad: 0 }, expect.any(Object));
  expect(remove).toHaveBeenCalledWith("/products/cart/items/12", expect.any(Object));
});
test.each([NaN, Infinity, -1, "", null, true, "NaN"])("rechaza precio inválido %s", value => {
  expect(() => parseCart({ ...cart, items: [{ ...item, precio_unitario: value }] })).toThrow();
});
test("permite ver existencias insuficientes para corregir el carrito y rechaza filas duplicadas", () => {
  expect(parseCart({ ...cart, items: [{ ...item, stock: 0 }] }).items[0].stock).toBe(0);
  expect(() => parseCart({ ...cart, items: [item, item] })).toThrow();
  expect(parseCart({ ...cart, items: [{ ...item, imagen: "javascript:alert(1)" }] }).items[0].image).toBeNull();
});
test("resumen usa los campos reales, descarta datos de tarjetas y filtra envíos inactivos", async () => {
  get.mockResolvedValueOnce({ data: summary });
  const result = await checkoutApi.summary("token", 3, "CUPON");
  expect(get).toHaveBeenCalledWith("/products/checkout/summary", expect.objectContaining({ headers: { Authorization: "Bearer token" }, params: { id_metodo_envio: 3, codigo_promocion: "CUPON" } }));
  expect(get.mock.calls[0][1]).not.toHaveProperty("timeout");
  expect(result.addresses[0].id).toBe(8);
  expect(result.shippingMethods).toHaveLength(1);
  expect(result).not.toHaveProperty("paymentMethods");
  expect(result.totals.total).toBe(660);
  expect(() => parseSummary({ ...summary, totals: { ...summary.totals, total: -1 } })).toThrow();
});
test("dirección nueva se envía sólo en confirm con campos permitidos y sin tarjetas", async () => {
  post.mockResolvedValueOnce({ data: prepared });
  const signal = new AbortController().signal;
  const result = await checkoutApi.confirm("token", { metodo_pago: "mercado_pago", direccion: { ...address, calle: " Norte " }, id_metodo_envio: 3, codigo_promocion: "CUPON" }, signal);
  expect(post).toHaveBeenCalledWith("/products/checkout/confirm", { metodo_pago: "mercado_pago", direccion: address, id_metodo_envio: 3, codigo_promocion: "CUPON" }, { headers: { Authorization: "Bearer token" }, signal, timeout: 45_000 });
  expect(result).toEqual({ orderId: 9, total: 660, url: prepared.checkout.init_point });
  expect(result).not.toHaveProperty("paid");
});
test("dirección guardada no reenvía dirección y validación bloquea campos inválidos", () => {
  expect(validatePayload({ metodo_pago: "mercado_pago", id_direccion_envio: 8, direccion: address })).toEqual({ metodo_pago: "mercado_pago", id_direccion_envio: 8 });
  expect(validateAddress({ ...address, calle: "" })).toContain("Completa");
  expect(validateAddress({ ...address, codigo_postal: "abc" })).toContain("5 dígitos");
  expect(validateAddress({ ...address, calle: "x".repeat(151) })).toContain("longitud");
  expect(() => validatePayload({ metodo_pago: "mercado_pago" })).toThrow();
});
test.each(["http://www.mercadopago.com.mx/pay", "https://www.mercadopago.com.mx.evil.test/pay", "javascript:alert(1)",
  "https://evil.test/?next=mercadopago.com.mx", "https://user:pass@www.mercadopago.com.mx/pay", "https://www.mercadopago.com.mx:3000/pay"])("bloquea enlace de pago inseguro %s", url => {
  expect(safePaymentUrl(url)).toBeNull();
  expect(parsePrepared({ ...prepared, checkout: { ...prepared.checkout, init_point: url } }).url).toBeNull();
});
test("pedido pendiente ausente de orders/user no se considera pagado", async () => {
  get.mockResolvedValueOnce({ data: { id_orden: 9, estado_pedido: "pendiente_pago", total: "660.00" } }).mockResolvedValueOnce({ data: [] });
  expect(await checkoutApi.orderStatus("token", 9)).toEqual({ id: 9, state: "pendiente_pago", total: 660, paid: false, stockIncident: false });
  expect(get).toHaveBeenNthCalledWith(1, "/products/orders/9/tracking", expect.any(Object));
  expect(get).toHaveBeenNthCalledWith(2, "/products/orders/user", expect.any(Object));
});
test("sólo fecha_pago válida de orden propia confirma pago; incidencia se conserva", async () => {
  get.mockResolvedValueOnce({ data: { id_orden: 9, estado_pedido: "incidencia_stock", total: 660 } })
    .mockResolvedValueOnce({ data: [{ id_orden: 9, fecha_pago: "2026-10-31T12:00:00.000Z", tarjeta: "secret" }] });
  expect(await checkoutApi.orderStatus("token", 9)).toMatchObject({ paid: true, stockIncident: true });
});
test("cambio de cuenta descarta dirección, preferencia y estado incierto", () => {
  const first = getCheckoutDraft("one");
  saveCheckoutDraft("one", { ...first, address, uncertain: true, prepared: { orderId: 9, url: prepared.checkout.init_point, total: 660 } });
  const second = getCheckoutDraft("two");
  expect(second.address.calle).toBe(""); expect(second.prepared).toBeNull(); expect(second.uncertain).toBe(false);
  saveCheckoutDraft("one", { ...first, address });
  expect(getCheckoutDraft("two").address.calle).toBe("");
});
test("errores esperados no exponen objetos de servidor", () => {
  expect(purchaseError({ isAxiosError: true, response: { status: 400, data: { message: "Solo hay 2 unidades disponibles" } } }, "Revisar")).toBe("Solo hay 2 unidades disponibles");
  expect(purchaseError({ isAxiosError: true, response: { status: 500, data: { message: "secret SQL" } } }, "Revisar")).toBe("Revisar");
});


test("reembolso con fecha de pago histórica no se muestra como pago confirmado", async () => {
  get.mockResolvedValueOnce({ data: { id_orden: 9, estado_pedido: "pendiente", total: 660 } })
    .mockResolvedValueOnce({ data: [{ id_orden: 9, estado: "reembolsado", fecha_pago: "2026-10-31T12:00:00.000Z" }] });
  expect(await checkoutApi.orderStatus("token", 9)).toMatchObject({ paid: false, state: "reembolsado" });
});

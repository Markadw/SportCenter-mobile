import axiosClient from "../src/api/axios";
import { ordersApi, parseTracking } from "../src/api/ordersApi";
jest.mock("../src/api/axios", () => ({ __esModule: true, default: { get: jest.fn() } }));
const order = { id_orden: 7, estado: "en proceso", estado_envio: "en_transito", total: "180.50", fecha_creacion: "2026-01-01", items: [{ id_variante: 4, id_producto: 2, producto: "Balón", cantidad: 1, precio_unitario: "180.50", total: "180.50" }], id_usuario: 10 };
const tracking = { id_orden: 7, estado_pedido: "en proceso", estado_envio: "en_transito", total: "180.50", direccion_envio: { calle: "Calle", numero: "12" }, eventos_envio: [], codigo_confirmacion_entrega: "secret" };
it("uses only own-order and customer tracking endpoints", async () => {
  (axiosClient.get as jest.Mock).mockResolvedValueOnce({ data: [order] }).mockResolvedValueOnce({ data: tracking });
  const signal = new AbortController().signal, result = await ordersApi.detail("token", 7, signal);
  expect(result.order.id).toBe(7); expect(result.order.items[0].productId).toBe(2);
  expect(axiosClient.get).toHaveBeenNthCalledWith(1, "/products/orders/user", { signal, headers: { Authorization: "Bearer token" } });
  expect(axiosClient.get).toHaveBeenNthCalledWith(2, "/products/orders/7/tracking", { signal, headers: { Authorization: "Bearer token" } });
  expect(result.tracking).not.toHaveProperty("codigo_confirmacion_entrega"); expect(result.order).not.toHaveProperty("id_usuario");
});
it("does not request tracking for an order absent from the user's list", async () => {
  (axiosClient.get as jest.Mock).mockResolvedValue({ data: [order] });
  await expect(ordersApi.detail("token", 99)).rejects.toThrow();
  expect(axiosClient.get).toHaveBeenCalledTimes(1);
});
it("rejects mismatched order tracking and malformed totals", async () => {
  (axiosClient.get as jest.Mock).mockResolvedValueOnce({ data: [order] }).mockResolvedValueOnce({ data: { ...tracking, id_orden: 99 } });
  await expect(ordersApi.detail("token", 7)).rejects.toThrow();
  expect(() => parseTracking({ ...tracking, total: "NaN" })).toThrow();
});
it("keeps an empty server list as empty", async () => {
  (axiosClient.get as jest.Mock).mockResolvedValue({ data: [] });
  expect(await ordersApi.list("token")).toEqual([]);
});

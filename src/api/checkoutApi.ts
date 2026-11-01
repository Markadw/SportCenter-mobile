import axiosClient from "./axios";
import { numeric, record, text } from "../features/cart/contracts";
import { parsePrepared, parseSummary, validatePayload } from "../features/checkout/contracts";
import type { CheckoutPayload, OrderStatus } from "../features/checkout/types";
const config = (token: string, signal?: AbortSignal) => ({ headers: { Authorization: `Bearer ${token}` }, signal });

export const checkoutApi = {
  async summary(token: string, shippingId?: number | null, promo?: string, signal?: AbortSignal) {
    if (shippingId != null) numeric(shippingId, true, 1);
    if (promo && promo.trim().length > 50) throw new Error("El cupón admite hasta 50 caracteres.");
    const { data } = await axiosClient.get<unknown>("/products/checkout/summary", {
      ...config(token, signal), params: { ...(shippingId != null ? { id_metodo_envio: shippingId } : {}),
        ...(promo?.trim() ? { codigo_promocion: promo.trim() } : {}) },
    });
    return parseSummary(data);
  },
  async confirm(token: string, payload: CheckoutPayload, signal?: AbortSignal) {
    const body = validatePayload(payload);
    const { data } = await axiosClient.post<unknown>("/products/checkout/confirm", body, { ...config(token, signal), timeout: 45_000 });
    return parsePrepared(data);
  },
  async orderStatus(token: string, id: number, signal?: AbortSignal): Promise<OrderStatus> {
    numeric(id, true, 1);
    const tracking = await axiosClient.get<unknown>(`/products/orders/${id}/tracking`, config(token, signal));
    const t = record(tracking.data);
    if (numeric(t.id_orden, true, 1) !== id) throw new Error("El pedido del servidor no coincide.");
    const orders = await axiosClient.get<unknown>("/products/orders/user", config(token, signal));
    if (!Array.isArray(orders.data)) throw new Error("La respuesta de pedidos no es válida.");
    const own = orders.data.map(record).find(order => numeric(order.id_orden, true, 1) === id);
    const state = text(own?.estado, text(t.estado_pedido, "pendiente_pago"));
    const paymentDate = own?.fecha_pago;
    const paid = ["pendiente", "en proceso", "entregado", "incidencia_stock"].includes(state) && typeof paymentDate === "string" && Number.isFinite(Date.parse(paymentDate));
    return { id, state, total: numeric(t.total), paid, stockIncident: state === "incidencia_stock" };
  },
};

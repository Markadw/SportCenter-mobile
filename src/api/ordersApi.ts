import axiosClient from "./axios";
import { numeric, object, optionalText, positiveId, text } from "../features/orders/contract";
import type { Order, OrderTracking } from "../features/orders/types";
export function parseOrder(data: unknown): Order {
  const value = object(data);
  if (!Array.isArray(value.items)) throw new Error("Pedido inválido.");
  return { id: positiveId(value.id_orden), status: text(value.estado), shipmentStatus: optionalText(value.estado_envio), total: numeric(value.total), createdAt: text(value.fecha_creacion),
    items: value.items.map(item => { const row = object(item); return {
      variantId: positiveId(row.id_variante), productId: row.id_producto == null ? null : positiveId(row.id_producto),
      name: text(row.producto), quantity: positiveId(row.cantidad), unitPrice: numeric(row.precio_unitario), total: numeric(row.total),
    }; }),
  };
}
export function parseTracking(data: unknown): OrderTracking {
  const value = object(data), address = value.direccion_envio == null ? {} : object(value.direccion_envio);
  if (!Array.isArray(value.eventos_envio)) throw new Error("Seguimiento inválido.");
  return { id: positiveId(value.id_orden), status: text(value.estado_pedido), shipmentStatus: optionalText(value.estado_envio), total: numeric(value.total),
    trackingNumber: optionalText(value.tracking_number), carrier: optionalText(value.paqueteria), estimatedAt: optionalText(value.fecha_entrega_estimada),
    shippedAt: optionalText(value.fecha_envio), deliveredAt: optionalText(value.fecha_entrega_real ?? value.fecha_entrega),
    address: ["calle", "numero", "colonia", "ciudad", "estado", "codigo_postal", "pais"].map(key => optionalText(address[key])).filter(Boolean).join(", "),
    events: value.eventos_envio.map(event => { const row = object(event); return { status: text(row.estado), title: text(row.titulo), description: text(row.descripcion), location: optionalText(row.ubicacion), date: text(row.fecha_evento) }; }),
  };
}
export const ordersApi = {
  async list(accessToken: string, signal?: AbortSignal): Promise<Order[]> {
    const { data } = await axiosClient.get<unknown>("/products/orders/user", { signal, headers: { Authorization: "Bearer " + accessToken } });
    if (!Array.isArray(data)) throw new Error("No pudimos leer tus pedidos.");
    return data.map(parseOrder);
  },
  async detail(accessToken: string, id: number, signal?: AbortSignal): Promise<{ order: Order; tracking: OrderTracking }> {
    positiveId(id);
    const orders = await ordersApi.list(accessToken, signal), order = orders.find(value => value.id === id);
    if (!order) throw new Error("Pedido no disponible en tu cuenta.");
    const { data } = await axiosClient.get<unknown>("/products/orders/" + id + "/tracking", { signal, headers: { Authorization: "Bearer " + accessToken } });
    const tracking = parseTracking(data);
    if (tracking.id !== order.id) throw new Error("No pudimos confirmar el seguimiento.");
    return { order, tracking };
  },
};

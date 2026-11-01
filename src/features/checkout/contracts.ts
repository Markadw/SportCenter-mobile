import { numeric, parseItems, record, text } from "../cart/contracts";
import type { AddressDraft, CheckoutPayload, CheckoutSummary, PreparedCheckout, ShippingMethod } from "./types";

function shipping(value: unknown): ShippingMethod {
  const r = record(value);
  return { id: r.id_metodo_envio == null ? null : numeric(r.id_metodo_envio, true, 1), name: text(r.nombre),
    description: text(r.descripcion), cost: numeric(r.costo_base), minDays: numeric(r.dias_min, true),
    maxDays: numeric(r.dias_max, true), active: r.activo !== false };
}
export function parseSummary(value: unknown): CheckoutSummary {
  const r = record(value), cart = record(r.cart), totals = record(r.totals);
  if (!Array.isArray(r.addresses) || !Array.isArray(r.shippingMethods)) throw new Error("El resumen del servidor no es válido.");
  return {
    items: parseItems(cart.items),
    addresses: r.addresses.map(value => {
      const a = record(value);
      return { id: numeric(a.id_direccion, true, 1), alias: text(a.alias), calle: text(a.calle), numero: text(a.numero),
        colonia: text(a.colonia), ciudad: text(a.ciudad), estado: text(a.estado), codigo_postal: text(a.codigo_postal),
        pais: text(a.pais, "México"), principal: a.principal === true };
    }),
    shippingMethods: r.shippingMethods.map(shipping).filter(s => s.active),
    selectedShipping: shipping(r.selectedShippingMethod),
    promotion: r.appliedPromotion == null ? null : text(record(r.appliedPromotion).nombre),
    totals: { subtotal: numeric(totals.subtotal), discount: numeric(totals.discount), shipping: numeric(totals.shipping),
      total: numeric(totals.total), itemCount: numeric(totals.itemCount, true) },
  };
}
export function safePaymentUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const hosts = ["www.mercadopago.com.mx", "mercadopago.com.mx", "sandbox.mercadopago.com.mx",
      "www.mercadopago.com", "mercadopago.com", "sandbox.mercadopago.com"];
    return url.protocol === "https:" && hosts.includes(url.hostname) && !url.username && !url.password && (!url.port || url.port === "443") ? url.toString() : null;
  } catch { return null; }
}
export function parsePrepared(value: unknown): PreparedCheckout {
  const r = record(value), order = record(r.order), checkout = record(r.checkout);
  if (checkout.provider !== "mercado_pago") throw new Error("El proveedor de pago no es válido.");
  // No usar sandbox_init_point como reemplazo silencioso de un pago de producción.
  return { orderId: numeric(order.id_orden, true, 1), total: numeric(order.total), url: safePaymentUrl(checkout.init_point) };
}
const limits: Record<keyof Omit<AddressDraft, "principal">, number> = {
  alias: 50, calle: 150, numero: 20, colonia: 100, ciudad: 100, estado: 100, codigo_postal: 10, pais: 100,
};
export function validateAddress(address: AddressDraft): string | null {
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    if (typeof address[key] !== "string" || address[key].trim().length > limits[key]) return "Revisa la longitud de los campos de dirección.";
  }
  if (!address.calle.trim() || !address.ciudad.trim() || !address.estado.trim()) return "Completa calle, ciudad y estado.";
  if (!/^\d{5}$/.test(address.codigo_postal.trim())) return "El código postal debe tener 5 dígitos.";
  return null;
}
export function validatePayload(payload: CheckoutPayload): CheckoutPayload {
  if (payload.metodo_pago !== "mercado_pago") throw new Error("Selecciona Mercado Pago.");
  const result: CheckoutPayload = { metodo_pago: "mercado_pago" };
  if (payload.id_direccion_envio != null) result.id_direccion_envio = numeric(payload.id_direccion_envio, true, 1);
  else if (payload.direccion) {
    const error = validateAddress(payload.direccion); if (error) throw new Error(error);
    const address = payload.direccion;
    result.direccion = { alias: address.alias.trim(), calle: address.calle.trim(), numero: address.numero.trim(), colonia: address.colonia.trim(),
      ciudad: address.ciudad.trim(), estado: address.estado.trim(), codigo_postal: address.codigo_postal.trim(), pais: address.pais.trim(), principal: address.principal === true };
  } else throw new Error("Selecciona o agrega una dirección.");
  if (payload.id_metodo_envio != null) result.id_metodo_envio = numeric(payload.id_metodo_envio, true, 1);
  if (payload.codigo_promocion) {
    if (payload.codigo_promocion.trim().length > 50) throw new Error("El cupón admite hasta 50 caracteres.");
    result.codigo_promocion = payload.codigo_promocion.trim();
  }
  return result;
}

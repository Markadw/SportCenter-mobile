import type { CartItem } from "../cart/types";
export interface AddressDraft {
  alias: string; calle: string; numero: string; colonia: string;
  ciudad: string; estado: string; codigo_postal: string; pais: string; principal: boolean;
}
export interface Address extends AddressDraft { id: number }
export interface ShippingMethod { id: number | null; name: string; description: string; cost: number; minDays: number; maxDays: number; active: boolean }
export interface Totals { subtotal: number; discount: number; shipping: number; total: number; itemCount: number }
export interface CheckoutSummary {
  items: CartItem[]; addresses: Address[]; shippingMethods: ShippingMethod[];
  selectedShipping: ShippingMethod; promotion: string | null; totals: Totals;
}
export interface CheckoutPayload {
  metodo_pago: "mercado_pago"; id_direccion_envio?: number; direccion?: AddressDraft;
  id_metodo_envio?: number; codigo_promocion?: string;
}
export interface PreparedCheckout { orderId: number; url: string | null; total: number }
export interface OrderStatus { id: number; state: string; total: number; paid: boolean; stockIncident: boolean }
export interface CheckoutDraft {
  addressId: number | null; address: AddressDraft; shippingId: number | null;
  promo: string; appliedPromo: string; prepared: PreparedCheckout | null; uncertain: boolean;
}

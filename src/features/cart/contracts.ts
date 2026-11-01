import { isAxiosError } from "axios";
import type { Cart, CartItem } from "./types";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("La respuesta del servidor no es válida.");
  return value as Record<string, unknown>;
}
export function numeric(value: unknown, integer = false, minimum = 0): number {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) throw new Error("El servidor devolvió un número no válido.");
  const n = Number(value);
  if (!Number.isFinite(n) || n < minimum || n > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(n))) throw new Error("El servidor devolvió un número no válido.");
  return n;
}
export function text(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
export function safeImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null; } catch { return null; }
}
export function parseCartItem(value: unknown): CartItem {
  const r = record(value);
  const attributes: Record<string, string> = {};
  if (r.atributos && typeof r.atributos === "object" && !Array.isArray(r.atributos)) {
    for (const [key, value] of Object.entries(r.atributos)) if (typeof value === "string") attributes[key] = value;
  }
  const quantity = numeric(r.cantidad, true, 1);
  if (quantity > 99) throw new Error("La cantidad del servidor no es válida.");
  return { variantId: numeric(r.id_variante, true, 1), productId: numeric(r.id_producto, true, 1),
    name: text(r.nombre, "Producto"), sku: text(r.sku), quantity, unitPrice: numeric(r.precio_unitario),
    stock: numeric(r.stock, true), active: r.activo === true,
    image: safeImage(r.imagen ?? (Array.isArray(r.imagenes) ? r.imagenes[0] : null)), attributes };
}
export function parseItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) throw new Error("El carrito del servidor no es válido.");
  const items = value.map(parseCartItem);
  if (new Set(items.map(i => i.variantId)).size !== items.length) throw new Error("El carrito contiene variantes duplicadas.");
  return items;
}
export function parseCart(value: unknown): Cart {
  const r = record(value), summary = record(r.summary);
  return { id: numeric(r.id_carrito, true, 1), items: parseItems(r.items),
    subtotal: numeric(summary.subtotal), itemCount: numeric(summary.itemCount, true) };
}
export function validateQuantity(variantId: number, quantity: number, allowZero = false) {
  if (!Number.isSafeInteger(variantId) || variantId <= 0) throw new Error("Selecciona una variante válida.");
  if (!Number.isSafeInteger(quantity) || quantity < (allowZero ? 0 : 1) || quantity > 99) throw new Error("La cantidad debe ser un entero entre 1 y 99.");
}
export function purchaseError(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return "Tu sesión venció. Vuelve a iniciar sesión.";
    if (status === 403) return "El carrito está disponible para cuentas de cliente.";
    if (status === 429) return "Hay demasiadas solicitudes. Espera un momento.";
    if (!error.response) return "No pudimos conectar. Conservamos tus datos; revisa tu conexión.";
    // Mostrar sólo errores esperados del contrato; nunca serializar objetos o detalles internos.
    const body: unknown = error.response.data;
    const messages = ["El carrito está vacío", "El cupón no existe o no está activo", "Ya usaste este cupón",
      "El cupón alcanzó su límite de uso", "La dirección de envío no es válida", "La variante no existe",
      "Este producto no tiene stock disponible", "Este producto no está disponible"];
    if (status === 400 && body && typeof body === "object" && "message" in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === "string" && (messages.includes(message) || /^Solo hay \d+ unidades disponibles$/.test(message))) return message;
    }
    return fallback;
  }
  return error instanceof Error && !isAxiosError(error) ? error.message : fallback;
}

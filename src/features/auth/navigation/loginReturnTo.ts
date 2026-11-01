const STATIC_DESTINATIONS = ["/account", "/cart", "/checkout", "/profile", "/orders"] as const;
type StaticDestination = typeof STATIC_DESTINATIONS[number];
export type LoginReturnTo = StaticDestination | `/product/${number}` | `/reviews/${number}` | `/checkout-status?id=${number}`;
export const MAX_LOGIN_RETURN_TO_LENGTH = 128;

function isStaticDestination(value: string): value is StaticDestination {
  return STATIC_DESTINATIONS.some(destination => destination === value);
}
function safeId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** useLocalSearchParams ya decodifica el parámetro exterior. No vuelve a
 * decodificar ni admite una URL arbitraria, esquemas, fragmentos o parámetros extra. */
export function resolveLoginReturnTo(value: unknown): LoginReturnTo {
  if (typeof value !== "string" || value.length > MAX_LOGIN_RETURN_TO_LENGTH || /[%\\\s\u0000-\u001F\u007F]/.test(value)) return "/account";
  if (isStaticDestination(value)) return value;
  const product = /^\/(product|reviews)\/(\d{1,16})$/.exec(value);
  if (product) {
    const id = safeId(product[2]);
    if (id !== null) return product[1] === "product" ? `/product/${id}` : `/reviews/${id}`;
  }
  const checkout = /^\/checkout-status\?id=(\d{1,16})$/.exec(value);
  if (checkout) {
    const id = safeId(checkout[1]);
    if (id !== null) return `/checkout-status?id=${id}`;
  }
  return "/account";
}

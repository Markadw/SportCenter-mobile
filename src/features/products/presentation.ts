import type { Product } from "./types";

export const money = (value: number) => `$${value.toFixed(2)}`;
export function productPriceRange(product: Product) {
  const prices = product.variants.map(v => v.price);
  if (!prices.length) return null;
  const min = Math.min(...prices), max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)} – ${money(max)}`;
}
export function productWebsiteUrl(product: Product) {
  const slug = product.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const routeId = `${((product.id * 7919) % 9000) + 1000}${product.id}`;
  return `https://sport-center-sitie.netlify.app/product/${slug}/${routeId}`;
}

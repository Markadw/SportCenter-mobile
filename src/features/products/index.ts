// src/features/products/index.ts
export { ProductCard } from "./components/ProductCard";
export { ProductsProvider, useProducts } from "./context/ProductsContext";
export { CatalogScreen } from "./screens/CatalogScreen";
export { ProductDetailScreen } from "./screens/ProductDetailScreen"; // 👈 nuevo
export type { Product, Variant } from "./types";

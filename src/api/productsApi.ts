// src/api/productsApi.ts
import axiosClient from "./axios";
import { ENDPOINTS } from "./endpoints";

import type { Product, ProductRaw, Variant, VariantRaw } from "../features/products/types";
export type { Product, Variant } from "../features/products/types";

const mapVariant = (v: VariantRaw): Variant => ({
  id: v.id_variante,
  sku: v.sku,
  stock: v.stock,
  price: v.precio,
  images: v.imagenes ?? [],
  attributes: v.atributos ?? {},
});

const mapProduct = (p: ProductRaw): Product => {
  const variants = (p.variantes ?? []).map(mapVariant);
  const first = variants[0];
  const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);

  return {
    id: p.id_producto,
    name: p.producto,
    description: p.descripcion,
    brand: p.marca,
    brandImage: p.imagen_marca,
    category: p.categoria,
    parentCategory: p.categoria_padre,
    sports: p.deportes ?? [],
    variants,
    mainImage: first?.images?.[0] ?? null,
    price: first?.price ?? 0,
    stock: first?.stock ?? 0,
    totalStock,
    attributes: first?.attributes ?? {},
  };
};

export const productsApi = {
  getAll: async (): Promise<Product[]> => {
    const { data } = await axiosClient.get<ProductRaw[]>(ENDPOINTS.products.list);
    return data.map(mapProduct);
  },

  getById: async (id: number | string): Promise<Product | null> => {
    // ⚠️ El backend devuelve un ARRAY con un solo elemento
    const { data } = await axiosClient.get<ProductRaw[]>(
      ENDPOINTS.products.detail(id)
    );

    if (!Array.isArray(data) || data.length === 0) return null;
    return mapProduct(data[0]);
  },
};
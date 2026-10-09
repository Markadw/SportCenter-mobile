// src/types/index.ts

// --- Tipos CRUDOS del backend (como llegan) ---
export interface VariantRaw {
  sku: string;
  stock: number;
  precio: number;
  imagenes: string[];
  atributos: Record<string, string>;
  id_variante: number;
}

export interface ProductRaw {
  id_producto: number;
  producto: string;
  descripcion: string;
  activo: boolean;
  fecha_creacion: string;
  marca: string;
  imagen_marca: string | null;
  categoria: string;
  categoria_padre: string;
  deportes: string[];
  variantes: VariantRaw[];
}

// --- Tipos NORMALIZADOS que usa la app ---
export interface Variant {
  id: number;
  sku: string;
  stock: number;
  price: number;
  images: string[];
  attributes: Record<string, string>;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  brand: string;
  brandImage: string | null;
  category: string;
  parentCategory: string;
  sports: string[];
  variants: Variant[];
  // Derivados de la primera variante (para el catálogo)
  mainImage: string | null;
  price: number;
  stock: number;
  totalStock: number;
  attributes: Record<string, string>;
}
import type { Product, ProductRaw } from '../../src/features/products/types';

export const rawProduct: ProductRaw = {
  id_producto: 7,
  producto: 'Balón de fútbol',
  descripcion: 'Balón de entrenamiento',
  activo: true,
  fecha_creacion: '2026-10-13',
  marca: 'Sport Center',
  imagen_marca: null,
  categoria: 'Balones',
  categoria_padre: 'Accesorios',
  deportes: ['Fútbol'],
  variantes: [
    { id_variante: 11, sku: 'BAL-01', stock: 2, precio: 250,
      imagenes: ['https://example.test/ball.png'], atributos: { Color: 'Blanco' } },
    { id_variante: 12, sku: 'BAL-02', stock: 3, precio: 270,
      imagenes: [], atributos: { Color: 'Rojo' } },
  ],
};

export const product: Product = {
  id: 7,
  name: 'Balón de fútbol',
  description: 'Balón de entrenamiento',
  brand: 'Sport Center',
  brandImage: null,
  category: 'Balones',
  parentCategory: 'Accesorios',
  sports: ['Fútbol'],
  variants: [{ id: 11, sku: 'BAL-01', stock: 2, price: 250,
    images: [], attributes: { Color: 'Blanco' } }],
  mainImage: null,
  price: 250,
  stock: 2,
  totalStock: 2,
  attributes: { Color: 'Blanco' },
};

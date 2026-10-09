// src/api/catalogApi.ts
import axiosClient from "./axios";
import { ENDPOINTS } from "./endpoints";

interface CategoryRaw {
  id_categoria: number;
  nombre: string;
  id_padre: number | null;
}

interface BrandRaw {
  id_marca: number;
  nombre: string;
  imagen: string;
}

interface SportRaw {
  id_deporte: number;
  nombre: string;
}

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
}

export interface Brand {
  id: number;
  name: string;
  image: string;
}

export interface Sport {
  id: number;
  name: string;
}

const mapCategory = (c: CategoryRaw): Category => ({
  id: c.id_categoria,
  name: c.nombre,
  parentId: c.id_padre,
});

const mapBrand = (b: BrandRaw): Brand => ({
  id: b.id_marca,
  name: b.nombre,
  image: b.imagen,
});

const mapSport = (s: SportRaw): Sport => ({
  id: s.id_deporte,
  name: s.nombre,
});

export const catalogApi = {
  getCategories: async (): Promise<Category[]> => {
    const { data } = await axiosClient.get<CategoryRaw[]>(
      ENDPOINTS.products.categories
    );
    return data.map(mapCategory);
  },

  getBrands: async (): Promise<Brand[]> => {
    const { data } = await axiosClient.get<BrandRaw[]>(
      ENDPOINTS.products.brands
    );
    return data.map(mapBrand);
  },

  getSports: async (): Promise<Sport[]> => {
    const { data } = await axiosClient.get<SportRaw[]>(
      ENDPOINTS.products.sports
    );
    return data.map(mapSport);
  },
};
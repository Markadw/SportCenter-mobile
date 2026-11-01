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

function requestOptions<T>(url: string, signal?: AbortSignal) {
  return signal ? axiosClient.get<T>(url, { signal }) : axiosClient.get<T>(url);
}

export const catalogApi = {
  getCategories: async (signal?: AbortSignal): Promise<Category[]> => {
    const { data } = await requestOptions<CategoryRaw[]>(ENDPOINTS.products.categories, signal);
    return data.map(mapCategory);
  },

  getBrands: async (signal?: AbortSignal): Promise<Brand[]> => {
    const { data } = await requestOptions<BrandRaw[]>(ENDPOINTS.products.brands, signal);
    return data.map(mapBrand);
  },

  getSports: async (signal?: AbortSignal): Promise<Sport[]> => {
    const { data } = await requestOptions<SportRaw[]>(ENDPOINTS.products.sports, signal);
    return data.map(mapSport);
  },
};

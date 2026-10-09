// src/api/bannersApi.ts
import axiosClient from "./axios";
import { ENDPOINTS } from "./endpoints";

// --- Tipo crudo (como viene del backend) ---
interface BannerRaw {
  id_banner: number;
  url_imagen: string;
  cloudinary_public_id: string;
  titulo: string;
  descripcion: string | null;
  alt_text: string;
  orden: number;
  activo: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

// --- Tipo normalizado (el que usa la app) ---
export interface Banner {
  id: number;
  imageUrl: string;
  title: string;
  description: string | null;
  altText: string;
  order: number;
}

// --- Mapper ---
const mapBanner = (b: BannerRaw): Banner => ({
  id: b.id_banner,
  imageUrl: b.url_imagen,
  title: b.titulo,
  description: b.descripcion,
  altText: b.alt_text,
  order: b.orden,
});

// --- API pública ---
export const bannersApi = {
  getAll: async (): Promise<Banner[]> => {
    const { data } = await axiosClient.get<BannerRaw[]>(ENDPOINTS.banners.list);
    return data
      .filter((b) => b.activo)
      .sort((a, b) => a.orden - b.orden)
      .map(mapBanner);
  },
};
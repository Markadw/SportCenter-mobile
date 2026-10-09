import { create, isAxiosError } from "axios";
import env from "../config/env";

// Endpoints conocidos que pueden mostrarse en los registros.
const SAFE_ENDPOINTS = new Set([
  "/products/get-all-products",
  "/products/get-all-categories",
  "/products/get-all-marcas",
  "/products/menu/sports",
  "/company/banner",
  "/users/create-user",
  "/users/login-user",
  "/users/verify-email",
  "/users/resend-code",
  "/users/refresh-token",
  "/users/profile",
  "/users/logout",
]);

// Evita registrar parámetros, identificadores o tokens en URLs.
function safeEndpoint(url?: string): string {
  if (!url) return "[ruta desconocida]";

  const path = url.split(/[?#]/)[0];

  if (SAFE_ENDPOINTS.has(path)) {
    return path;
  }

  // Ocultar el ID del producto.
  if (/^\/products\/get-product-details\/[^/]+$/.test(path)) {
    return "/products/get-product-details/:id";
  }

  return "[ruta no registrada]";
}

const axiosClient = create({
  baseURL: env.apiUrl,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Registros disponibles únicamente en desarrollo.
if (__DEV__) {
  // Peticiones salientes
  axiosClient.interceptors.request.use((config) => {
    console.info(
      `[API] → ${config.method?.toUpperCase()} ${safeEndpoint(config.url)}`,
    );

    return config;
  });

  // Respuestas y errores
  axiosClient.interceptors.response.use(
    (response) => {
      console.info(
        `[API] ← ${response.status} ${safeEndpoint(response.config.url)}`,
      );

      return response;
    },
    (error: unknown) => {
      if (isAxiosError(error)) {
        const status = error.response
          ? `HTTP ${error.response.status}`
          : "Sin respuesta del servidor";

        console.warn(`[API] ✕ ${status} ${safeEndpoint(error.config?.url)}`);
      } else {
        console.warn("[API] ✕ Error inesperado");
      }

      return Promise.reject(error);
    },
  );
}

export default axiosClient;

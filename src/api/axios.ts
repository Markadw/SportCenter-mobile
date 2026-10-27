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

// Rechazos de autenticación que la interfaz presenta como mensajes del formulario.
const EXPECTED_AUTH_STATUSES: Record<string, readonly number[]> = {
  "/users/login-user": [400, 401, 429],
  "/users/create-user": [400, 429],
  "/users/verify-email": [400, 429],
  "/users/resend-code": [400, 429],
  "/users/refresh-token": [400, 401, 429],
  "/users/profile": [401],
  "/users/logout": [401],
};

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

        const endpoint = safeEndpoint(error.config?.url);
        if (error.response && EXPECTED_AUTH_STATUSES[endpoint]?.includes(error.response.status)) {
          console.info(`[API] ← ${status} ${endpoint}`);
        } else {
          console.warn(`[API] ✕ ${status} ${endpoint}`);
        }
      } else {
        console.warn("[API] ✕ Error inesperado");
      }

      return Promise.reject(error);
    },
  );
}

export default axiosClient;

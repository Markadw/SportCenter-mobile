import { isAxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import env from "../../../config/env";
import { SessionController, SessionRequestError, type SessionRequestIdentity } from "./SessionController";

interface SessionRequestConfig extends InternalAxiosRequestConfig {
  _sessionRequest?: SessionRequestIdentity;
}

const PUBLIC_AUTH_OPERATIONS = new Set([
  "post /users/login-user", "post /users/create-user", "post /users/verify-email", "post /users/resend-code",
  "post /users/refresh-token", "get /users/session", "post /users/logout", "post /users/auth/google-login",
  "post /users/verify-user-email", "post /users/verify-user-token", "post /users/reset-psw",
  "post /products/checkout/mercado-pago/webhook",
]);
const PUBLIC_PRODUCT_READS = new Set([
  "/products/get-all-products", "/products/get-all-categories", "/products/get-all-marcas",
  "/products/menu/sports", "/products/menu/brands", "/products/menu/complete-menu",
  "/products/promotions/public", "/products/promotions/offers", "/products/shipping-methods",
]);

function isPublicOperation(path: string, method = "get"): boolean {
  const normalizedMethod = method.toLowerCase();
  const readMethod = normalizedMethod === "head" ? "get" : normalizedMethod;
  if (PUBLIC_AUTH_OPERATIONS.has(readMethod + " " + path)) return true;
  if (readMethod !== "get") return false;
  return PUBLIC_PRODUCT_READS.has(path) ||
    /^\/products\/get-product-details\/[^/]+$/.test(path) ||
    /^\/products\/reviews\/product\/[^/]+$/.test(path) ||
    /^\/products\/menu\/categories-by-parent\/[^/]+$/.test(path);
}

function canHandle(config: InternalAxiosRequestConfig): boolean {
  try {
    const api = new URL(`${env.apiUrl}/`);
    const base = new URL(`${(config.baseURL ?? env.apiUrl).replace(/\/+$/, "")}/`);
    if (base.origin !== api.origin || base.pathname !== api.pathname) return false;
    // Axios combina baseURL y rutas que empiezan por /, también si la API usa /api.
    const url = config.url ?? "";
    const target = new URL(/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(url)
      ? url : `${base.href}${url.replace(/^\/+/, "")}`, base);
    if (target.origin !== api.origin || !target.pathname.startsWith(api.pathname)) return false;
    const path = `/${target.pathname.slice(api.pathname.length)}`.replace(/\/+$/, "");
    return !isPublicOperation(path, config.method);
  } catch { return false; }
}

export function registerSessionInterceptors(client: AxiosInstance, controller: SessionController): () => void {
  const request = client.interceptors.request.use(async (config: SessionRequestConfig) => {
    if (!canHandle(config)) return config;
    const authorization = config.headers.get("Authorization");
    const identity = config._sessionRequest ?? (typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? controller.identityFor(authorization.slice(7)) : null);
    // Las llamadas públicas o con un token ajeno nunca reciben el de la cuenta actual.
    if (!identity) return config;
    const accessToken = await controller.tokenFor(identity);
    if (!controller.owns(identity)) throw new SessionRequestError();
    config.headers.set("Authorization", `Bearer ${accessToken}`);
    config._sessionRequest = { ...identity, accessToken };
    return config;
  });
  const response = client.interceptors.response.use(undefined, async (error: unknown) => {
    if (!isAxiosError(error) || error.response?.status !== 401 || !error.config) return Promise.reject(error);
    const config = error.config as SessionRequestConfig;
    const identity = config._sessionRequest;
    if (!identity || !canHandle(config) || !controller.owns(identity)) return Promise.reject(error);
    if (identity.retried) {
      await controller.rejectRetried(identity);
      return Promise.reject(error);
    }
    const accessToken = await controller.tokenFor(identity, true);
    if (!["get", "head"].includes(config.method?.toLowerCase() ?? "")) {
      // No se repite una compra, pago u otra mutación: el usuario decide reenviarla.
      throw new SessionRequestError("Actualizamos tu sesión. Vuelve a enviar la operación para continuar.");
    }
    if (!controller.owns(identity)) throw new SessionRequestError();
    config.headers.set("Authorization", `Bearer ${accessToken}`);
    config._sessionRequest = { ...identity, accessToken, retried: true };
    return client.request(config);
  });
  return () => {
    client.interceptors.request.eject(request);
    client.interceptors.response.eject(response);
  };
}

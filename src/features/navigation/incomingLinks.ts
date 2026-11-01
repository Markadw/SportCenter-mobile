export const FALLBACK_PATH = "/catalog";
export const MAX_APP_LINK_LENGTH = 2_048;
export const MAX_DEVELOPMENT_LINK_LENGTH = 8_192;
const APP_SCHEME = "sportcentermobile:";
const DEVELOPMENT_SCHEME = "exp+sport-center-mobile:";
const WEBSITE_HOST = "sport-center-sitie.netlify.app";
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const STATIC_ROUTES = new Set([
  "/", "/catalog", "/account", "/login", "/register", "/verify-email", "/forgot-password",
  "/profile", "/orders", "/privacy", "/cart", "/checkout", "/checkout-status",
]);

interface LinkOptions { development?: boolean }

function requireWellFormed(value: string) {
  if (CONTROL_CHARACTERS.test(value) || value.includes("\\")) throw new Error("Enlace inválido");
  // Funciones nativas, sin fallback recursivo ni dependencia decode-uri-component.
  if (CONTROL_CHARACTERS.test(decodeURIComponent(value))) throw new Error("Enlace inválido");
  encodeURIComponent(value); // También rechaza sustitutos UTF-16 sin pareja.
}

function requireSafeRawPath(value: string) {
  const rawPath = value.split(/[?#]/, 1)[0].replace(/^[a-z][a-z\d+.-]*:\/\/[^/]*/i, "");
  if (/%(?:2f|5c|3f|23)/i.test(rawPath)) throw new Error("Separador de ruta ambiguo");
  const path = decodeURIComponent(rawPath);
  if (path.split("/").some(part => part === "." || part === "..")) throw new Error("Ruta ambigua");
}

function positiveId(value: string): boolean {
  return /^\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function canonicalRoute(path: string, url: URL): string {
  const decoded = decodeURIComponent(path);
  if (decoded.includes("//")) throw new Error("Ruta ambigua");
  const route = decoded === "/" ? "/" : decoded.replace(/\/$/, "");
  const dynamic = /^\/(?:product|orders|reviews)\/([^/]+)$/.exec(route);
  if (!STATIC_ROUTES.has(route) && (!dynamic || !positiveId(dynamic[1]))) throw new Error("Ruta no admitida");

  const values = new Map<string, string>();
  let count = 0;
  for (const [key, value] of url.searchParams.entries()) {
    if (++count > 16 || key.length > 64 || value.length > 512 || values.has(key) ||
      CONTROL_CHARACTERS.test(key) || CONTROL_CHARACTERS.test(value) ||
      /^(?:id|q|email|section)\[\]$/.test(key)) throw new Error("Parámetros ambiguos");
    values.set(key, value);
  }
  if (dynamic && values.has("id")) throw new Error("Identificador ambiguo");

  const accepted: [string, string][] = [];
  if (route === "/catalog" && values.has("q")) {
    const query = values.get("q")!;
    if (query.length > 200) throw new Error("Búsqueda demasiado larga");
    accepted.push(["q", query]);
  }
  if (route === "/verify-email" && values.has("email")) {
    const email = values.get("email")!;
    if (email.length > 100) throw new Error("Correo demasiado largo");
    accepted.push(["email", email]);
  }
  if (route === "/privacy" && values.has("section")) {
    const section = values.get("section")!;
    if (section !== "reviews" && section !== "deletion") throw new Error("Sección desconocida");
    accepted.push(["section", section]);
  }
  if (route === "/checkout-status") {
    const id = values.get("id");
    if (!id || !positiveId(id)) throw new Error("Pedido no válido");
    accepted.push(["id", id]);
  }
  // Parámetros desconocidos, fragmentos y estados declarados por el proveedor de
  // pagos no se trasladan al Router. La pantalla consulta el estado al servidor.
  const query = accepted.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  const result = route + (query ? "?" + query : "");
  if (result.length > MAX_APP_LINK_LENGTH) throw new Error("Enlace demasiado largo");
  return result;
}

function isDevelopmentHost(host: string): boolean {
  if (["localhost", "127.0.0.1", "[::1]", "exp.host", "u.expo.dev"].includes(host) || host.endsWith(".exp.direct")) return true;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const octets = host.split(".").map(Number);
  return octets.length === 4 && octets.every(value => Number.isInteger(value) && value >= 0 && value <= 255) &&
    (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
}

function developmentProject(url: URL): string {
  if (!["http:", "https:", "exp:", "exps:"].includes(url.protocol) || !isDevelopmentHost(url.hostname) ||
    url.username || url.password) throw new Error("Proyecto de desarrollo no admitido");
  const marker = url.pathname.indexOf("/--/");
  // El cliente nativo ya resolvió el servidor del proyecto antes de cargar este JS.
  // index.bundle y sus parámetros de Metro no son rutas de la aplicación.
  if (marker < 0) return "/";
  return canonicalRoute(url.pathname.slice(marker + 3), url);
}

/** Defensa de entradas nativas. No elimina la dependencia transitiva vulnerable,
 * no se ejecuta en web y no reemplaza autorización ni validación en las pantallas. */
export function sanitizeIncomingPath(input: unknown, { development = false }: LinkOptions = {}): string {
  try {
    if (typeof input !== "string" || !input || input.length > MAX_DEVELOPMENT_LINK_LENGTH || input.startsWith("//")) return FALLBACK_PATH;
    requireWellFormed(input);
    requireSafeRawPath(input);
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
    if (hasScheme && !/^[a-z][a-z\d+.-]*:\/\//i.test(input)) return FALLBACK_PATH;
    const url = new URL(input, "sportcentermobile://app/");
    if (url.username || url.password) return FALLBACK_PATH;

    if (development && [APP_SCHEME, DEVELOPMENT_SCHEME].includes(url.protocol) && url.hostname === "expo-development-client") {
      if (url.port || url.pathname !== "/") return FALLBACK_PATH;
      const projectUrls = url.searchParams.getAll("url");
      if (projectUrls.length !== 1 || !projectUrls[0] || projectUrls[0].length > MAX_DEVELOPMENT_LINK_LENGTH) return FALLBACK_PATH;
      requireWellFormed(projectUrls[0]);
      requireSafeRawPath(projectUrls[0]);
      return developmentProject(new URL(projectUrls[0]));
    }
    if (development && ["exp:", "exps:"].includes(url.protocol)) return developmentProject(url);
    if (input.length > MAX_APP_LINK_LENGTH) return FALLBACK_PATH;
    if (!hasScheme) return canonicalRoute(url.pathname, url);
    if (url.protocol === APP_SCHEME || (development && url.protocol === DEVELOPMENT_SCHEME)) {
      if (url.port) return FALLBACK_PATH;
      return canonicalRoute(url.hostname ? "/" + url.hostname + url.pathname : url.pathname || "/", url);
    }
    if (url.protocol === "https:" && url.hostname === WEBSITE_HOST && !url.port) return canonicalRoute(url.pathname, url);
    return FALLBACK_PATH;
  } catch { return FALLBACK_PATH; }
}

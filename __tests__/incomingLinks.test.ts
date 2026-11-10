import {
  FALLBACK_PATH, MAX_APP_LINK_LENGTH, MAX_DEVELOPMENT_LINK_LENGTH, sanitizeIncomingPath,
} from "../src/features/navigation/incomingLinks";
import { redirectSystemPath } from "../src/app/+native-intent";

test.each([
  "", "/", "sportcentermobile://", "exp://192.168.1.4:8081",
  "exp://192.168.1.4:8081/--/", "exp://169.254.1.4:8081",
])("una apertura del proyecto sin destino llega a Inicio: %s", path => {
  expect(redirectSystemPath({ path, initial: true })).toBe("/");
});

test.each([
  "/", "/catalog", "/account", "/login", "/register", "/verify-email", "/forgot-password",
  "/profile", "/orders", "/privacy", "/cart", "/checkout",
  "/product/7", "/orders/91", "/reviews/7", "/checkout-status?id=91",
])("admite únicamente la ruta autorizada %s", path => {
  expect(sanitizeIncomingPath(path)).toBe(path);
});

test.each([
  ["sportcentermobile://product/7", "/product/7"],
  ["sportcentermobile:///orders/91", "/orders/91"],
  ["sportcentermobile://", "/"],
  ["catalog?q=tenis", "/catalog?q=tenis"],
  ["https://sport-center-sitie.netlify.app/reviews/7", "/reviews/7"],
  ["sportcentermobile://catalog?q=f%C3%BAtbol+de+mesa", "/catalog?q=f%C3%BAtbol%20de%20mesa"],
  ["/verify-email?email=cliente%2Buno%40example.test", "/verify-email?email=cliente%2Buno%40example.test"],
  ["/privacy?section=deletion", "/privacy?section=deletion"],
  ["/privacy?section=reviews", "/privacy?section=reviews"],
  ["/catalog/?utm_source=correo#fragmento", "/catalog"],
])("construye una ruta relativa canónica desde %s", (input, expected) => {
  expect(sanitizeIncomingPath(input)).toBe(expected);
});

test("preserva porcentajes literales sin volver a decodificar el valor y descarta parámetros de navegación ajenos", () => {
  const result = sanitizeIncomingPath("sportcentermobile://catalog?q=%25FE&screen=checkout&params=internos");
  expect(result).toBe("/catalog?q=%25FE");
  expect(new URL(result, "https://example.test").searchParams.get("q")).toBe("%FE");
});

test.each(["%", "%GG", "%C3%28", "%ED%A0%80", "%C0%AF", "%F4%90%80%80", "\uD800"])(
  "rechaza codificación malformada sin lanzar excepción: %s", value => {
    expect(() => sanitizeIncomingPath("sportcentermobile://catalog?q=" + value)).not.toThrow();
    expect(sanitizeIncomingPath("sportcentermobile://catalog?q=" + value)).toBe(FALLBACK_PATH);
  },
);

test.each([
  "/checkout-status?id=7&id=8", "/checkout-status?id=7&%69d=8", "/checkout-status?id[]=7",
  "/checkout-status?id=0", "/checkout-status?id=-1", "/checkout-status?id=1.5", "/checkout-status?id=9007199254740992",
  "/checkout-status", "/product/7?id=8", "/product/0", "/orders/-2", "/reviews/1.2",
  "/catalog?q=uno&q=dos", "/verify-email?email=uno&email=dos", "/privacy?section=reviews&section=deletion",
  "/privacy?section=otra", "/product/../catalog", "/product/%2e%2e/catalog", "/product%2F7", "/catalog//",
  "/catalog?q=%00", "/catalog?q=%0A", "/catalog?q=uno\ndos", "/catalog\\?q=tenis",
])("rechaza entrada ambigua o identificador inválido: %s", input => {
  expect(sanitizeIncomingPath(input)).toBe(FALLBACK_PATH);
});

test.each([
  "/desconocida", "/oauth/callback?code=privado&state=valor", "/_sitemap", "/(tabs)/catalog",
  "https://ajeno.example/catalog", "https://sport-center-sitie.netlify.app.ajeno.example/catalog",
  "https://usuario:clave@sport-center-sitie.netlify.app/catalog", "//ajeno.example/catalog",
  "http://sport-center-sitie.netlify.app/catalog", "javascript:alert(1)", "file:///catalog",
])("no crea rutas ni confía en un origen o callback no autorizado: %s", input => {
  expect(sanitizeIncomingPath(input)).toBe(FALLBACK_PATH);
});

test("limita tamaño y número de parámetros antes de entregar datos al Router", () => {
  expect(sanitizeIncomingPath("/catalog?x=" + "a".repeat(MAX_APP_LINK_LENGTH))).toBe(FALLBACK_PATH);
  expect(sanitizeIncomingPath("/catalog?q=" + "a".repeat(201))).toBe(FALLBACK_PATH);
  expect(sanitizeIncomingPath("/verify-email?email=" + "a".repeat(101))).toBe(FALLBACK_PATH);
  expect(sanitizeIncomingPath("/catalog?" + Array.from({ length: 17 }, (_, index) => "k" + index + "=v").join("&"))).toBe(FALLBACK_PATH);
  const decode = jest.spyOn(globalThis, "decodeURIComponent");
  try {
    expect(sanitizeIncomingPath("a".repeat(MAX_DEVELOPMENT_LINK_LENGTH + 1))).toBe(FALLBACK_PATH);
    expect(decode).not.toHaveBeenCalled();
  } finally { decode.mockRestore(); }
});

test("el retorno de pago sólo admite un ID y no convierte status=approved en estado de compra", () => {
  expect(sanitizeIncomingPath("sportcentermobile://checkout-status?id=91&status=approved&payment_id=7&collection_status=approved"))
    .toBe("/checkout-status?id=91");
});

test.each([
  ["exp://127.0.0.1:8081/--/product/7", "/product/7"],
  ["exps://proyecto.exp.direct/--/checkout-status?id=91", "/checkout-status?id=91"],
  ["exp://192.168.1.4:8081", "/"],
  ["exp://exp.host/@usuario/proyecto", "/"],
  ["exp+sport-center-mobile://catalog?q=tenis", "/catalog?q=tenis"],
])("Expo Go/dev-client admite su enlace válido sólo en desarrollo: %s", (input, expected) => {
  expect(sanitizeIncomingPath(input, { development: true })).toBe(expected);
  expect(sanitizeIncomingPath(input)).toBe(FALLBACK_PATH);
});

test.each([
  ["http://localhost:8081/index.bundle?platform=android&dev=true", "/"],
  ["http://10.0.2.2:8081", "/"],
  ["https://proyecto.exp.direct", "/"],
  ["exp://192.168.1.4:8081/--/orders/91", "/orders/91"],
])("un launcher válido carga raíz o ruta /--/ sin enviar index.bundle a las pantallas: %s", (project, expected) => {
  const input = "exp+sport-center-mobile://expo-development-client/?url=" + encodeURIComponent(project);
  expect(sanitizeIncomingPath(input, { development: true })).toBe(expected);
  expect(sanitizeIncomingPath(input)).toBe(FALLBACK_PATH);
});

test.each([
  "exp+sport-center-mobile://expo-development-client/",
  "exp+sport-center-mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081&url=http%3A%2F%2Flocalhost%3A8090",
  "exp+sport-center-mobile://expo-development-client/?url=exp%2Bsport-center-mobile%3A%2F%2Fexpo-development-client%2F",
  "exp+sport-center-mobile://expo-development-client/?url=javascript%3Aalert(1)",
  "exp+sport-center-mobile://expo-development-client/?url=https%3A%2F%2Fajeno.example%2F",
  "exp+sport-center-mobile://expo-development-client/?url=http%3A%2F%2Fusuario%3Aclave%40localhost%3A8081",
  "exp://ajeno.example/--/product/7", "exp://localhost:8081/--/orders/7?id=8",
])("rechaza envoltorios anidados, ambiguos o ajenos: %s", input => {
  expect(sanitizeIncomingPath(input, { development: true })).toBe(FALLBACK_PATH);
});

test.each([true, false])("el adaptador nativo valida tanto initial=%s", initial => {
  expect(redirectSystemPath({ path: "sportcentermobile://product/7", initial })).toBe("/product/7");
  expect(redirectSystemPath({ path: "sportcentermobile://catalog?q=%C3%28", initial })).toBe(FALLBACK_PATH);
});

// Comprobación adicional contra la extracción real de Router 57 instalada: el
// guard devuelve rutas de la app, no una URL de Metro ni una consulta decodificada dos veces.
test.each([
  ["exp://127.0.0.1:8081/--/product/7", "product/7"],
  ["exp+sport-center-mobile://expo-development-client/?url=" + encodeURIComponent("http://localhost:8081/index.bundle?platform=android"), ""],
  ["exp+sport-center-mobile://expo-development-client/?url=" + encodeURIComponent("exp://10.0.2.2:8081/--/checkout-status?id=91"), "checkout-status?id=91"],
  ["sportcentermobile://catalog?q=%25FE", "catalog?q=%25FE"],
])("la salida de %s conserva la navegación al pasar por Router instalado", (input, expected) => {
  const { extractExpoPathFromURL } = jest.requireActual("expo-router/build/fork/extractPathFromURL");
  const canonical = sanitizeIncomingPath(input, { development: true });
  expect(extractExpoPathFromURL([], canonical)).toBe(expected);
});

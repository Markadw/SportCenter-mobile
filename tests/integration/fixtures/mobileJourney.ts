import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { rawProduct } from "../../../__tests__/fixtures/products";
import { loginCredentials, loginResponse } from "../../../__tests__/fixtures/auth";

// Datos anteriores al recorrido. Este pedido entregado no procede del checkout probado.
const priorOrder = {
  id_orden: 901, estado: "entregado", estado_envio: "entregado", total: 320,
  fecha_creacion: "2020-01-01T12:00:00Z",
  items: [{ id_variante: 11, id_producto: 7, producto: rawProduct.producto, cantidad: 1, precio_unitario: 250, total: 250 }],
};
const address = { id_direccion: 801, alias: "Casa QA", calle: "Norte", numero: "2", colonia: "Centro",
  ciudad: "Puebla", estado: "Puebla", codigo_postal: "72000", pais: "México", principal: true };
const shippingMethods = [
  { id_metodo_envio: 301, nombre: "Estándar QA", descripcion: "Entrega de prueba", costo_base: 70, dias_min: 2, dias_max: 4, activo: true },
  { id_metodo_envio: 302, nombre: "Express QA", descripcion: "Otra tarifa de prueba", costo_base: 90, dias_min: 1, dias_max: 2, activo: true },
];

export function createJourneyTransport() {
  let authenticated = false, quantity = 0;
  const reviews: Record<string, unknown>[] = [];
  const calls: { method: string; url: string; body: Record<string, unknown>; params: Record<string, unknown> }[] = [];
  const unexpected: string[] = [];
  const product = { ...rawProduct, variantes: rawProduct.variantes.map(variant => ({ ...variant, imagenes: [] })) };
  const item = () => ({ id_variante: 12, id_producto: 7, nombre: product.producto, sku: "BAL-02", cantidad: quantity,
    precio_unitario: 270, stock: 3, activo: true, imagen: null, atributos: { Color: "Rojo" } });
  const cart = () => ({ id_carrito: 701, items: quantity ? [item()] : [], summary: { subtotal: quantity * 270, itemCount: quantity } });
  const result = (config: InternalAxiosRequestConfig, data: unknown, status = 200) => ({ config, data, status,
    statusText: status === 201 ? "Created" : "OK", headers: new AxiosHeaders() });
  const adapter: AxiosAdapter = async config => {
    const method = (config.method ?? "get").toUpperCase(), url = config.url ?? "";
    const body: Record<string, unknown> = typeof config.data === "string" ? JSON.parse(config.data) : config.data ?? {};
    const params: Record<string, unknown> = { ...config.params };
    calls.push({ method, url, body, params });
    const deny = (status: number) => { throw new AxiosError("Respuesta sintética", undefined, config, undefined,
      result(config, { message: "Solicitud no autorizada" }, status)); };
    const privateRoute = url.startsWith("/products/cart") || url.startsWith("/products/checkout") ||
      url.startsWith("/products/orders") || url.endsWith("/eligibility") || (url === "/products/reviews" && method === "POST") ||
      url === "/users/logout" || url === "/users/profile";
    if (privateRoute && (!authenticated || config.headers.get("Authorization") !== "Bearer " + loginResponse.accessToken)) return deny(401);
    if (method === "GET" && url === "/products/get-all-products") return result(config, [product]);
    if (method === "GET" && url === "/products/get-product-details/7") return result(config, [product]);
    if (method === "GET" && url === "/products/get-all-categories") return result(config, [{ id_categoria: 1, nombre: "Balones", id_padre: null }]);
    if (method === "GET" && url === "/products/get-all-marcas") return result(config, [{ id_marca: 1, nombre: "Sport Center", imagen: "" }]);
    if (method === "GET" && url === "/products/menu/sports") return result(config, [{ id_deporte: 1, nombre: "Fútbol" }]);
    if (method === "POST" && url === "/users/login-user") {
      if (body.email !== loginCredentials.email || body.passw !== loginCredentials.passw) return deny(400);
      authenticated = true; return result(config, loginResponse, 201);
    }
    if (method === "POST" && url === "/users/logout") { authenticated = false; return result(config, { message: "Sesión cerrada" }, 201); }
    if (method === "GET" && url === "/users/profile") return result(config, {
      nombre: "Cliente QA", aPaterno: "Prueba", aMaterno: "Local", email: loginCredentials.email, telefono: "7711234567",
    });
    if (method === "GET" && url === "/products/cart") return result(config, cart());
    if (method === "POST" && url === "/products/cart/items" && body.id_variante === 12 && body.cantidad === 1) {
      quantity += 1; return result(config, cart(), 201);
    }
    if (method === "PUT" && url === "/products/cart/items/12" && body.cantidad === 2) { quantity = 2; return result(config, cart()); }
    if (method === "GET" && url === "/products/checkout/summary") {
      const shipping = shippingMethods.find(method => method.id_metodo_envio === (params.id_metodo_envio ?? 301));
      if (!shipping) return deny(400);
      return result(config, {
        cart: cart(), addresses: [address], shippingMethods, selectedShippingMethod: shipping, appliedPromotion: null,
        totals: { subtotal: quantity * 270, discount: 0, shipping: shipping.costo_base,
          total: quantity * 270 + shipping.costo_base, itemCount: quantity },
      });
    }
    if (method === "GET" && url === "/products/orders/user") return result(config, [priorOrder]);
    if (method === "GET" && url === "/products/orders/901/tracking") return result(config, {
      id_orden: 901, estado_pedido: "entregado", estado_envio: "entregado", total: 320,
      direccion_envio: address, fecha_entrega_real: "2020-01-04T12:00:00Z",
      eventos_envio: [{ estado: "entregado", titulo: "Entrega sintética anterior", descripcion: "Pedido previo al recorrido", fecha_evento: "2020-01-04T12:00:00Z" }],
    });
    if (method === "GET" && url === "/products/reviews/product/7") return result(config, {
      reviews, summary: { promedio: reviews.length ? 5 : 0, total: reviews.length },
    });
    if (method === "GET" && url === "/products/reviews/product/7/eligibility") return result(config, {
      canReview: reviews.length === 0, hasDeliveredPurchase: true, hasReview: reviews.length > 0,
    });
    if (method === "POST" && url === "/products/reviews" && body.id_producto === 7 && body.calificacion === 5 &&
      body.comentario === "Reseña sintética del pedido entregado anterior.") {
      if (reviews.length) return deny(400);
      const review = { id_review: 501, id_producto: 7, id_usuario: 101, usuario: "Cliente QA", calificacion: 5,
        comentario: body.comentario, fecha: "2020-01-05T12:00:00Z" };
      reviews.push(review); return result(config, review, 201);
    }
    unexpected.push(method + " " + url);
    throw new Error("Endpoint no previsto en el recorrido local: " + method + " " + url);
  };
  return { adapter, calls, unexpected, state: () => ({ authenticated, quantity, reviews: reviews.length }) };
}

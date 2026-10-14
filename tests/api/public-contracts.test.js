const base = process.env.API_BASE_URL.replace(/\/+$/, '');
const axios = require('axios');
let products;
let detail;
let productId;

async function readJson(route) {
  const response = await axios.get(`${base}${route}`, { timeout: 25000, maxRedirects: 0, validateStatus: () => true });
  if (response.status !== 200) throw new Error(`Contrato público respondió HTTP ${response.status}`);
  return response.data;
}

beforeAll(async () => {
  products = await readJson('/products/get-all-products');
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Precondición incumplida: se necesita al menos un producto conocido en la API.');
  }
  productId = process.env.API_PRODUCT_ID ? Number(process.env.API_PRODUCT_ID) : products[0].id_producto;
  if (!Number.isInteger(productId) || productId <= 0) throw new Error('ID de producto inválido.');
  detail = await readJson(`/products/get-product-details/${productId}`);
}, 60000);

describe('CP-03 / CP-04: integración HTTP real de lectura pública', () => {
  test('catálogo público devuelve identificadores y nombres utilizables sin Bearer', () => {
    expect(products.every((p) => Number.isInteger(p.id_producto) && typeof p.producto === 'string' && p.producto.length > 0)).toBe(true);
  });
  test('precio, stock y variantes cumplen el contrato que utiliza el cliente', () => {
    expect(products.every((p) => Array.isArray(p.variantes) && p.variantes.every((v) =>
      Number.isInteger(v.id_variante) && typeof v.precio === 'number' && v.precio >= 0
      && Number.isInteger(v.stock) && v.stock >= 0 && Array.isArray(v.imagenes)))).toBe(true);
  });
  test('detalle corresponde al producto solicitado', () => {
    expect(Array.isArray(detail)).toBe(true);
    expect(detail).toHaveLength(1);
    expect(detail[0].id_producto).toBe(productId);
  });
  test('perfil privado rechaza acceso sin sesión', async () => {
    const response = await axios.get(`${base}/users/profile`, { timeout: 25000, maxRedirects: 0, validateStatus: () => true });
    expect([401, 403]).toContain(response.status);
  });
});

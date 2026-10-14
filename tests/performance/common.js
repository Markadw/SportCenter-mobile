import http from 'k6/http';
import { check, sleep } from 'k6';

export function count(name, fallback, maximum = 20) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${name} debe estar entre 1 y ${maximum}.`);
  return value;
}

export function setupTarget() {
  const baseUrl = (__ENV.API_BASE_URL || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s@?#]+$/i.test(baseUrl)) throw new Error('Definir API_BASE_URL HTTP sin credenciales ni parámetros.');
  if (__ENV.ISOLATED_API !== 'true') throw new Error('La carga requiere confirmar un entorno propio y aislado con ISOLATED_API=true.');
  if (/back-sport-ghxk\.onrender\.com|mercadopago/i.test(baseUrl)) throw new Error('No ejecutar carga sobre la API compartida de Render ni Mercado Pago.');
  if (!/^\d+$/.test(__ENV.PRODUCT_ID || '')) throw new Error('Definir PRODUCT_ID conocido.');
  if (!__ENV.BACKEND_COMMIT) throw new Error('Registrar BACKEND_COMMIT de la instancia comprobada.');
  return { baseUrl, productId: __ENV.PRODUCT_ID, backendCommit: __ENV.BACKEND_COMMIT };
}

export function loadThresholds() {
  const thresholds = { checks: ['rate==1'] };
  const p95 = __ENV.P95_LIMIT_MS;
  const errorRate = __ENV.ERROR_RATE_LIMIT;
  if (p95 || errorRate) {
    if (!p95 || !errorRate || !(Number(p95) > 0) || !(Number(errorRate) >= 0 && Number(errorRate) <= 1) || !__ENV.THRESHOLD_REASON) {
      throw new Error('Los umbrales requieren P95_LIMIT_MS, ERROR_RATE_LIMIT y THRESHOLD_REASON justificados.');
    }
    thresholds.http_req_duration = [`p(95)<${Number(p95)}`];
    thresholds.http_req_failed = [`rate<=${Number(errorRate)}`];
  }
  return thresholds;
}

function json(response) {
  try { return response.json(); } catch { return null; }
}

export function readProducts(target) {
  const options = { timeout: '10s', redirects: 0 };
  const catalog = http.get(`${target.baseUrl}/products/get-all-products`, options);
  check(catalog, {
    'catálogo público HTTP 200 y arreglo': (r) => r.status === 200 && Array.isArray(json(r)),
  });
  const detail = http.get(`${target.baseUrl}/products/get-product-details/${target.productId}`, options);
  check(detail, {
    'detalle público corresponde al producto': (r) => {
      const data = json(r);
      return r.status === 200 && Array.isArray(data) && data.length === 1 && String(data[0].id_producto) === target.productId;
    },
  });
  sleep(1);
}

export function report(data, kind) {
  const meta = {
    kind, target: __ENV.API_BASE_URL, backendCommit: __ENV.BACKEND_COMMIT,
    productId: __ENV.PRODUCT_ID, isolated: __ENV.ISOLATED_API === 'true',
    performanceCriteria: kind === 'stress' ? 'Recuperación funcional; no se aplica automáticamente el P95 de carga normal'
      : __ENV.P95_LIMIT_MS ? 'Umbrales configurados por el operador' : 'Línea base; sin conclusión de aprobación de rendimiento',
    reason: __ENV.THRESHOLD_REASON || null,
    scope: 'Solo lecturas públicas del backend propio. No mide fluidez Android.',
  };
  return {
    [`test-results/performance-${kind}.json`]: JSON.stringify({ meta, results: data }, null, 2),
    stdout: `${kind}: ${meta.performanceCriteria}. Reporte JSON generado.\n`,
  };
}

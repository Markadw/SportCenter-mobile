import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

export const limitedResponses = new Counter('rate_limited_responses');
export const unexpectedResponses = new Counter('unexpected_responses');
export function count(name, fallback, maximum = 20) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(name + ' debe estar entre 1 y ' + maximum + '.');
  return value;
}
export function setupTarget() {
  const baseUrl = (__ENV.API_BASE_URL || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s@?#]+$/i.test(baseUrl)) throw new Error('Definir API_BASE_URL HTTP sin credenciales ni parámetros.');
  if (__ENV.ISOLATED_API !== 'true') throw new Error('La carga requiere confirmar un entorno propio y aislado.');
  if (/back-sport-ghxk\.onrender\.com|mercadopago/i.test(baseUrl)) throw new Error('No ejecutar carga sobre Render compartido ni Mercado Pago.');
  if (!/^\d+$/.test(__ENV.PRODUCT_ID || '')) throw new Error('Definir PRODUCT_ID conocido.');
  if (!__ENV.BACKEND_COMMIT) throw new Error('Registrar BACKEND_COMMIT de la instancia comprobada.');
  return { baseUrl, productId: __ENV.PRODUCT_ID, backendCommit: __ENV.BACKEND_COMMIT };
}
export function loadThresholds() {
  const thresholds = { checks: ['rate==1'], unexpected_responses: ['count==0'] };
  const p95 = __ENV.P95_LIMIT_MS;
  const errorRate = __ENV.ERROR_RATE_LIMIT;
  if (p95 || errorRate) {
    if (!p95 || !errorRate || !(Number(p95) > 0) || !(Number(errorRate) >= 0 && Number(errorRate) <= 1) || !__ENV.THRESHOLD_REASON) {
      throw new Error('Los umbrales requieren P95_LIMIT_MS, ERROR_RATE_LIMIT y THRESHOLD_REASON justificados.');
    }
    thresholds.http_req_duration = ['p(95)<' + Number(p95)];
    thresholds.http_req_failed = ['rate<=' + Number(errorRate)];
  }
  return thresholds;
}
function json(response) {
  try { return response.json(); } catch { return null; }
}
export function readProducts(target) {
  const options = { timeout: '10s', redirects: 0 };
  const catalog = http.get(target.baseUrl + '/products/get-all-products', { ...options, tags: { name: 'catalog' } });
  const catalogValid = catalog.status === 200 && Array.isArray(json(catalog));
  check(catalog, { 'catálogo público HTTP 200 y arreglo': () => catalogValid });
  const detail = http.get(target.baseUrl + '/products/get-product-details/' + target.productId, { ...options, tags: { name: 'detail' } });
  const data = json(detail);
  const detailValid = detail.status === 200 && Array.isArray(data) && data.length === 1 && String(data[0].id_producto) === target.productId;
  check(detail, { 'detalle público corresponde al producto': () => detailValid });
  limitedResponses.add(Number(catalog.status === 429) + Number(detail.status === 429));
  unexpectedResponses.add(Number(![200, 429].includes(catalog.status) || (catalog.status === 200 && !catalogValid))
    + Number(![200, 429].includes(detail.status) || (detail.status === 200 && !detailValid)));
  const sample = { healthy: catalogValid && detailValid, sampledAt: Date.now() };
  sleep(count('ITERATION_PAUSE_SECONDS', 3, 10));
  return sample;
}
export function report(data, kind) {
  const label = __ENV.RUN_LABEL || kind;
  if (!['baseline', 'load', 'stress'].includes(label)) throw new Error('Etiqueta de medición inválida.');
  const run = __ENV.PERFORMANCE_RUN;
  if (run && !/^[a-zA-Z0-9-]+$/.test(run)) throw new Error('Identificador de medición inválido.');
  const directory = run ? 'test-results/performance/' + run : 'test-results';
  const meta = { kind: label, target: __ENV.API_BASE_URL, backendCommit: __ENV.BACKEND_COMMIT,
    productId: __ENV.PRODUCT_ID, isolated: __ENV.ISOLATED_API === 'true',
    performanceCriteria: kind === 'stress' ? 'Admisión y recuperación ante el límite real de solicitudes'
      : __ENV.P95_LIMIT_MS ? 'Criterios locales acordados' : 'Referencia inicial; no califica rendimiento',
    reason: __ENV.THRESHOLD_REASON || null,
    scope: 'Lecturas públicas del backend local; no mide fluidez Android ni capacidad de producción.' };
  return {
    [directory + '/performance-' + label + '.json']: JSON.stringify({ meta, results: data }, null, 2),
    stdout: label + ': ' + meta.performanceCriteria + '. Reporte JSON generado.\n',
  };
}

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout, clearTimeout } = require('node:timers');
const backend = require('../tests/environment/backend-source.json');

const TARGET = 'http://127.0.0.1:3011';
const MAX_BYTES = 65536;
const TIMEOUT_MS = 5000;
const REPORT = 'test-results/security/dast-local.json';
const unsigned = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' +
  Buffer.from('{"id_usuario":1,"id_rol":3,"exp":4102444800}').toString('base64url') + '.';
const CASES = Object.freeze([
  Object.freeze({ id: 'D01', route: '/products/get-product-details/66', status: [200], baseline: true }),
  Object.freeze({ id: 'D02', route: '/users/profile', status: [401, 403] }),
  Object.freeze({ id: 'D03', route: '/users/profile', authorization: 'Bearer not-a-jwt', status: [401, 403] }),
  Object.freeze({ id: 'D04', route: '/users/profile', authorization: 'Bearer ' + unsigned, status: [401, 403] }),
  Object.freeze({ id: 'D05', route: '/products/reviews/product/not-a-number', status: [400] }),
  Object.freeze({ id: 'D06', route: '/products/reviews/product/%27%20OR%201%3D1', status: [400] }),
]);
class DastError extends Error { constructor(code) { super(code); this.code = code; } }
function need(value, code) { if (!value) throw new DastError(code); }

function validateScope(env, proof) {
  need(env.ISOLATED_DAST === 'true' && env.API_BASE_URL === TARGET, 'LOCAL_SCOPE_REQUIRED');
  need(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || ''), 'MOBILE_COMMIT_REQUIRED');
  need(proof?.ready === true && proof.apiUrl === TARGET && proof.backendCommit === backend.commit &&
    proof.productId === 66 && proof.seed?.products === 100 && proof.seed?.variants === 200, 'LOCAL_PROVENANCE_REQUIRED');
  return { mobileCommit: env.GITHUB_SHA, backendCommit: backend.commit, target: TARGET,
    scope: 'bounded-http-security-read-only-isolated-backend', expectedChecks: CASES.length };
}

function readResponse(item, requestHttp = http.request) {
  need(CASES.includes(item), 'REQUEST_NOT_ALLOWLISTED');
  return new Promise((resolve, reject) => {
    let bytes = 0, settled = false, timer;
    const fail = code => { if (!settled) { settled = true; clearTimeout(timer); reject(new DastError(code)); } };
    const request = requestHttp({ hostname: '127.0.0.1', port: 3011, method: 'GET', path: item.route,
      headers: { accept: 'application/json', ...(item.authorization ? { authorization: item.authorization } : {}) } }, response => {
      const chunks = [];
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) { fail('RESPONSE_TOO_LARGE'); response.destroy(); request.destroy(); }
        else chunks.push(chunk);
      });
      response.on('error', () => fail('RESPONSE_READ_FAILED'));
      response.on('end', () => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        resolve({ status: response.statusCode, contentType: response.headers['content-type'],
          body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    timer = setTimeout(() => { fail('REQUEST_TIMEOUT'); request.destroy(); }, TIMEOUT_MS);
    request.on('error', () => fail('REQUEST_FAILED'));
    request.end();
  });
}

function inspectResponse(item, response) {
  need(CASES.includes(item), 'REQUEST_NOT_ALLOWLISTED');
  need(Number.isInteger(response?.status) && item.status.includes(response.status), 'UNEXPECTED_HTTP_STATUS');
  need(typeof response.contentType === 'string' && /^application\/json(?:\s*;|$)/i.test(response.contentType), 'JSON_RESPONSE_REQUIRED');
  need(typeof response.body === 'string' && Buffer.byteLength(response.body) <= MAX_BYTES, 'RESPONSE_TOO_LARGE');
  let data;
  try { data = JSON.parse(response.body); } catch { throw new DastError('JSON_INVALID'); }
  need(data && typeof data === 'object', 'JSON_OBJECT_REQUIRED');
  if (item.baseline) need(Array.isArray(data) && data.length === 1 && data[0]?.id_producto === 66, 'SYNTHETIC_PRODUCT_NOT_CONFIRMED');
  let visited = 0;
  const visit = (value, depth) => {
    need(++visited <= 1000 && depth <= 12, 'PAYLOAD_TOO_COMPLEX');
    if (typeof value === 'string') {
      need(!/(?:QueryFailedError|PrismaClient\w*Error|Sequelize\w*Error|SQLSTATE|node_modules[\\/]|[\\/]app[\\/]src[\\/]|[A-Z]:\\Users\\|\bat [\w.$]+\s*\([^\r\n]+:\d+:\d+\)|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(value), 'INTERNAL_DETAIL_EXPOSED');
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        need(!/^(?:stack|stacktrace|query|parameters|passw|password|password_hash|passwordHash|access_?token|refresh_?token|session_?id|authorization|cookie|secret|jwtSecret)$/i.test(key), 'SENSITIVE_FIELD_EXPOSED');
        visit(child, depth + 1);
      }
    }
  };
  visit(data, 0);
  return { id: item.id, status: 'passed', httpStatus: response.status,
    checks: ['expected-status', 'bounded-json', 'no-known-sensitive-field-or-internal-detail'] };
}

async function runDast({ env, proof, request = readResponse }) {
  const context = validateScope(env, proof);
  const checks = [];
  for (const item of CASES) {
    let response;
    try { response = await request(item); checks.push(inspectResponse(item, response)); }
    catch (error) { checks.push({ id: item.id, status: 'failed',
      httpStatus: Number.isInteger(response?.status) && response.status >= 100 && response.status <= 599 ? response.status : null,
      reason: error instanceof DastError ? error.code : 'UNVERIFIED_RESPONSE' }); }
    if (item.baseline && checks[0].status !== 'passed') break;
  }
  return { version: 1, ...context, status: checks.length === CASES.length && checks.every(item => item.status === 'passed')
    ? 'passed_for_executed_scope' : 'failed', executedChecks: checks.length, checks,
    limits: ['no-production-scan', 'no-account-registration-or-email', 'no-writes-or-payments',
      'no-authenticated-account-or-cross-account-authorization-claim', 'not-all-backend-routes', 'not-native-TLS-or-device-storage'] };
}

async function main(env = process.env, io = fs) {
  io.mkdirSync(path.dirname(REPORT), { recursive: true });
  io.rmSync(REPORT, { force: true });
  let result;
  try {
    const proof = JSON.parse(io.readFileSync('test-results/local-environment.json', 'utf8'));
    result = await runDast({ env, proof });
  } catch (error) { result = { version: 1, status: 'failed', expectedChecks: CASES.length, executedChecks: 0,
    reason: error instanceof DastError ? error.code : 'LOCAL_PREFLIGHT_FAILED', checks: [] }; }
  io.writeFileSync(REPORT, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  const text = ['## Seguridad HTTP de la copia aislada', '', '**' + result.status + '**: ' + result.executedChecks + '/' + CASES.length + ' casos ejecutados.',
    '', '| Caso | Resultado | HTTP | Motivo |', '| --- | --- | --- | --- |',
    ...result.checks.map(item => '| ' + item.id + ' | ' + item.status + ' | ' + (item.httpStatus ?? '-') + ' | ' + (item.reason || '-') + ' |'),
    '', 'Alcance: seis GET prefijados contra backend QA congelado y datos sintéticos. No acredita todas las rutas, cuentas reales, TLS nativo ni Play.', '',
    ...(result.reason ? ['Precondición: ' + result.reason + '.', ''] : [])].join('\n');
  io.writeFileSync('test-results/security/dast-local-summary.md', text, { mode: 0o600 });
  if (env.GITHUB_STEP_SUMMARY) io.appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  if (result.status !== 'passed_for_executed_scope') throw new DastError('LOCAL_DAST_NOT_PASSED');
  return result;
}
module.exports = { TARGET, CASES, MAX_BYTES, TIMEOUT_MS, DastError, validateScope, readResponse, inspectResponse, runDast, main };
if (require.main === module) main().catch(() => { console.error('Seguridad HTTP local bloqueada; consultar informe saneado.'); process.exitCode = 1; });

'use strict';
// Un POST real al backend QA: acredita dirección persistida, nunca ejecuta un pago.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PIN } = require('./commerce-isolated.cjs');
const SOURCE_HASHES = Object.freeze({
  'src/modules/products/services/product-checkout.service.ts': '8f550ffb4ced5094f5bb41b368b1c2647ac744574f8dd63968fdf3b4c2ef5a6a',
  'src/modules/products/dto/checkout/create-checkout-order.dto.ts': 'b3505f45baf86a7ff6f353ad6de357474a490471ad49403ce8e5a00740ece502',
});
const SELLER_ID = 3497260719;
const ADDRESS = Object.freeze({ alias: 'QA direccion positiva', calle: 'Calle de prueba', numero: '1',
  colonia: 'Colonia QA', ciudad: 'Ciudad QA', estado: 'Estado QA', codigo_postal: '43000', pais: 'México', principal: true });
const ACTORS = Object.freeze([[910001, 'commerce-a@qa.invalid'], [910002, 'commerce-b@qa.invalid']]);
const CASE_IDS = Object.freeze(['PA01_SOURCE_AND_QA', 'PA02_TEST_SELLER_MX', 'PA03_OWN_CART_BEFORE',
  'PA04_SINGLE_CONFIRM_RECEIVED', 'PA05_PREFERENCE_MATCHES', 'PA06_NEW_ADDRESS_COMMITTED',
  'PA07_NEW_SESSION_READ', 'PA08_OTHER_ACCOUNT_ISOLATED', 'PA09_CART_STOCK_UNCHANGED', 'PA10_PENDING_WITHOUT_PAYMENT']);
function object(value) { assert.ok(value && typeof value === 'object' && !Array.isArray(value)); return value; }
function positiveId(value) {
  assert.ok((typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) &&
    Number.isSafeInteger(Number(value)) && Number(value) > 0); return Number(value);
}
function cents(value) { assert.ok(value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0); return Math.round(Number(value) * 100); }
function guardPositiveEnv(env) {
  for (const key of ['ISOLATED_TEST_ENV', 'QA_COMMERCE', 'QA_CHECKOUT_POSITIVE']) assert.equal(env[key], 'true', 'QA_POSITIVE_FLAG_REQUIRED');
  for (const name of ['ADMIN', 'EDITOR', 'READER', 'BACKUP']) {
    const url = new URL(env['DATABASE_URL_' + name]);
    assert.equal(url.protocol, 'postgres:'); assert.equal(url.hostname, 'db'); assert.equal(url.pathname, '/sportcenter_qa');
    assert.equal(url.port || '5432', '5432');
    assert.equal(url.search, '', 'QA_DATABASE_QUERY_FORBIDDEN');
    assert.equal(url.hash, '', 'QA_DATABASE_FRAGMENT_FORBIDDEN');
    assert.equal(decodeURIComponent(url.username), 'qa_' + name.toLowerCase());
  }
  const frontend = new URL(env.FRONTEND_URL);
  assert.equal(frontend.protocol, 'https:');
  assert.match(frontend.hostname, /^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/);
  assert.ok(!frontend.username && !frontend.password && !frontend.port && !frontend.search && !frontend.hash && frontend.pathname === '/');
  assert.equal(env.BACKEND_PUBLIC_URL, 'http://localhost:3000');
  assert.equal(env.MERCADO_PAGO_WEBHOOK_URL, 'http://127.0.0.1:3000/disabled');
  assert.equal(env.API_BASE_URL, 'http://127.0.0.1:3000');
  assert.equal(env.QA_EXPECTED_SELLER_ID, String(SELLER_ID));
  assert.equal(env.HTTPS_PROXY, 'http://egress:8080'); assert.equal(env.HTTP_PROXY, 'http://egress:8080');
  assert.deepEqual(String(env.NO_PROXY).split(',').map(host => host.trim()).sort(), ['127.0.0.1', 'db', 'localhost']);
  assert.ok(typeof env.MERCADO_PAGO_ACCESS_TOKEN === 'string' && env.MERCADO_PAGO_ACCESS_TOKEN.trim() &&
    !/\s/.test(env.MERCADO_PAGO_ACCESS_TOKEN), 'QA_PROVIDER_TOKEN_REQUIRED');
  assert.ok(!Object.keys(env).some(key => /SMTP|(?:^|_)EMAIL_|(?:^|_)MAIL_|SENDGRID|RESEND|MAILGUN|BREVO|POSTMARK|NODEMAILER/i.test(key)), 'QA_MAIL_FORBIDDEN');
  return frontend.origin;
}
function validateSeller(value) {
  const seller = object(value);
  assert.equal(positiveId(seller.id), SELLER_ID); assert.equal(seller.site_id, 'MLM');
  assert.ok(Array.isArray(seller.tags) && seller.tags.includes('test_user'), 'QA_TEST_SELLER_REQUIRED');
}
function validatePreference(value, prepared, frontend, total) {
  const p = object(value);
  assert.equal(String(p.id), prepared.preferenceId); assert.equal(positiveId(p.collector_id), SELLER_ID);
  assert.equal(p.site_id, 'MLM'); assert.equal(p.external_reference, prepared.reference);
  assert.equal(positiveId(object(p.metadata).id_orden), prepared.orderId);
  assert.equal(positiveId(p.metadata.id_usuario), ACTORS[0][0]);
  assert.ok(Array.isArray(p.items) && p.items.length === 1);
  const item = object(p.items[0]);
  assert.equal(String(item.id), String(prepared.orderId)); assert.equal(item.currency_id, 'MXN');
  assert.equal(Number(item.quantity), 1); assert.equal(cents(item.unit_price), total);
  const urls = object(p.back_urls);
  for (const state of ['success', 'failure', 'pending']) assert.equal(urls[state],
    frontend + '/dashboard/usuario/compras?payment=' + state + '&order=' + prepared.orderId);
  assert.ok(p.notification_url == null || p.notification_url === '', 'QA_NOTIFICATION_MUST_BE_OMITTED');
}
async function readLocalResponse(response) {
  assert.equal(response.redirected, false);
  const reader = response.body?.getReader(); assert.ok(reader);
  const chunks = []; let bytes = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break;
    bytes += part.value.byteLength; assert.ok(bytes <= 65536); chunks.push(Buffer.from(part.value)); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return { status: response.status, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
}
async function runPositiveAcceptance(deps = {}) {
  const env = deps.env || process.env;
  const report = { schemaVersion: 1, scope: 'isolated-checkout-positive-address-not-payment', backendCommit: PIN,
    sourceHashes: {}, status: 'failed', cases: [],
    flags: { sourcePinned: false, databaseConfirmed: false, sellerTestVerified: false, preferenceVerified: false,
      positivePersistence: false, freshSessionRead: false, otherAccountIsolated: false, cartStockUnchanged: false },
    operationUncertain: false, paymentExecuted: false, logout: [], databaseClosed: false, errorCode: 'NONE' };
  let db;
  const tokens = new Set();
  const record = (id, condition) => { report.cases.push({ id, status: condition ? 'passed' : 'failed' }); assert.ok(condition); };
  const call = async (method, route, token, body) => {
    assert.ok((method === 'POST' && ['/users/login-user', '/users/logout', '/products/checkout/confirm'].includes(route)) ||
      (method === 'GET' && route === '/products/checkout/summary'));
    return readLocalResponse(await (deps.fetchImpl || globalThis.fetch)('http://127.0.0.1:3000' + route, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
    }));
  };
  const login = async index => {
    const response = await call('POST', '/users/login-user', null, { email: ACTORS[index][1], passw: 'QaOnly-Commerce!47' });
    const token = response.data?.accessToken;
    if (typeof token === 'string' && /^[A-Za-z0-9._~-]+$/.test(token)) tokens.add(token);
    assert.ok(response.status >= 200 && response.status < 300 && tokens.has(token));
    assert.equal(typeof response.data.sessionId, 'string'); return token;
  };
  const logout = async token => {
    const response = await call('POST', '/users/logout', token, {});
    const ok = response.status >= 200 && response.status < 300;
    report.logout.push(ok); if (ok) tokens.delete(token); assert.ok(ok);
  };
  const summary = async token => { const response = await call('GET', '/products/checkout/summary', token);
    assert.equal(response.status, 200); const value = object(response.data);
    assert.ok(Array.isArray(value.addresses) && Array.isArray(object(value.cart).items)); return value; };
  const sameAddress = row => Object.entries(ADDRESS).every(([key, value]) => row[key] === value);
  try {
    const frontend = guardPositiveEnv(env);
    const readFile = deps.readFile || require('node:fs').readFileSync;
    const digestSource = deps.digestSource || (bytes => crypto.createHash('sha256').update(bytes).digest('hex'));
    for (const [file, hash] of Object.entries(SOURCE_HASHES)) {
      const observed = digestSource(readFile('/app/' + file).toString('utf8').replace(/\r\n/g, '\n'));
      assert.match(observed, /^[a-f0-9]{64}$/); report.sourceHashes[file] = observed; assert.equal(observed, hash);
    }
    report.flags.sourcePinned = true;
    const Client = deps.Client || require('/app/node_modules/pg').Client;
    db = new Client({ connectionString: env.DATABASE_URL_ADMIN, ssl: false, connectionTimeoutMillis: 5000,
      query_timeout: 5000, statement_timeout: 5000 }); await db.connect();
    const identity = (await db.query('SELECT current_database() AS database, current_user AS role')).rows[0];
    assert.equal(identity.database, 'sportcenter_qa'); assert.equal(identity.role, 'qa_admin');
    const actors = (await db.query('SELECT id_usuario,email FROM core.users WHERE id_usuario IN (910001,910002) ORDER BY id_usuario')).rows;
    assert.deepEqual(actors.map(row => [row.id_usuario, row.email]), ACTORS);
    const product = (await db.query('SELECT id_variante,sku FROM core.product_variants WHERE id_variante=131 AND id_producto=66')).rows;
    assert.deepEqual(product, [{ id_variante: 131, sku: 'QA-66-A' }]);
    // Una ejecución con pedido ya creado exige reconciliarlo, no crear otra preferencia.
    assert.equal((await db.query("SELECT id_orden FROM core.orders WHERE id_usuario IN (910001,910002) AND metodo_pago='mercado_pago'")).rows.length, 0);
    report.flags.databaseConfirmed = true; record('PA01_SOURCE_AND_QA', true);
    const providerModule = deps.provider || require('/app/node_modules/axios');
    const provider = providerModule.default ?? providerModule;
    assert.ok(provider && typeof provider.get === 'function', 'QA_PROVIDER_TRANSPORT_REQUIRED');
    const providerGet = async url => {
      const response = await provider.get(url, { headers: { Authorization: 'Bearer ' + env.MERCADO_PAGO_ACCESS_TOKEN },
        timeout: 15000, maxRedirects: 0, maxContentLength: 65536, maxBodyLength: 65536 });
      assert.equal(response.status, 200); return response.data;
    };
    validateSeller(await providerGet('https://api.mercadolibre.com/users/me'));
    report.flags.sellerTestVerified = true; record('PA02_TEST_SELLER_MX', true);
    const snapshot = async () => {
      const result = {};
      for (const table of ['carts', 'cart_items', 'inventory', 'inventory_movements']) {
        const row = (await db.query("SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data::text), '[]'::jsonb)::text AS data FROM (SELECT to_jsonb(t) AS row_data FROM core." + table + ' t) s')).rows[0];
        result[table] = crypto.createHash('sha256').update(row.data).digest('hex');
      }
      return result;
    };
    let token = await login(0);
    const before = await snapshot(), initial = await summary(token), total = cents(object(initial.totals).total);
    assert.ok(total > 0); assert.equal(initial.addresses.length, 1);
    assert.equal(initial.addresses[0].id_direccion, 910001);
    assert.equal(initial.cart.items.length, 1);
    assert.equal(positiveId(initial.cart.items[0].id_variante), 131);
    assert.ok(Number(initial.cart.items[0].stock) >= Number(initial.cart.items[0].cantidad) && Number(initial.cart.items[0].cantidad) > 0);
    const shippingId = positiveId(object(initial.selectedShippingMethod).id_metodo_envio);
    record('PA03_OWN_CART_BEFORE', true);
    report.operationUncertain = true;
    const confirmed = await call('POST', '/products/checkout/confirm', token,
      { metodo_pago: 'mercado_pago', id_metodo_envio: shippingId, direccion: { ...ADDRESS } });
    if ([400, 401, 403].includes(confirmed.status)) report.operationUncertain = false;
    assert.ok(confirmed.status >= 200 && confirmed.status < 300);
    const order = object(confirmed.data.order), checkout = object(confirmed.data.checkout);
    const prepared = { orderId: positiveId(order.id_orden), preferenceId: checkout.preference_id, reference: checkout.external_reference };
    assert.equal(checkout.provider, 'mercado_pago'); assert.equal(cents(order.total), total);
    assert.equal(order.estado, 'pendiente_pago'); assert.equal(order.fecha_pago, null);
    assert.ok(typeof prepared.preferenceId === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(prepared.preferenceId));
    assert.ok(typeof prepared.reference === 'string' && prepared.reference.startsWith('SC-ORDER-' + prepared.orderId + '-'));
    report.operationUncertain = false; record('PA04_SINGLE_CONFIRM_RECEIVED', true);
    validatePreference(await providerGet('https://api.mercadopago.com/checkout/preferences/' + encodeURIComponent(prepared.preferenceId)),
      prepared, frontend, total);
    report.flags.preferenceVerified = true; record('PA05_PREFERENCE_MATCHES', true);
    const after = await summary(token), added = after.addresses.filter(row => sameAddress(row));
    assert.equal(after.addresses.length, initial.addresses.length + 1); assert.equal(added.length, 1);
    const addressId = positiveId(added[0].id_direccion); assert.notEqual(addressId, 910001); assert.notEqual(addressId, 910002);
    const saved = (await db.query('SELECT id_direccion,id_usuario FROM core.direcciones WHERE id_direccion=$1', [addressId])).rows;
    assert.deepEqual(saved, [{ id_direccion: addressId, id_usuario: 910001 }]);
    report.flags.positivePersistence = true; record('PA06_NEW_ADDRESS_COMMITTED', true);
    await logout(token); token = await login(0);
    const fresh = await summary(token);
    assert.equal(fresh.addresses.filter(row => row.id_direccion === addressId && sameAddress(row)).length, 1);
    report.flags.freshSessionRead = true; record('PA07_NEW_SESSION_READ', true);
    const otherToken = await login(1), other = await summary(otherToken);
    assert.equal(other.addresses.length, 1); assert.equal(other.addresses[0].id_direccion, 910002);
    assert.ok(!other.addresses.some(row => row.id_direccion === addressId || sameAddress(row)));
    report.flags.otherAccountIsolated = true; record('PA08_OTHER_ACCOUNT_ISOLATED', true);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(after.cart, initial.cart); assert.deepEqual(fresh.cart, initial.cart);
    report.flags.cartStockUnchanged = true; record('PA09_CART_STOCK_UNCHANGED', true);
    const pending = (await db.query('SELECT id_usuario,estado,fecha_pago,total,id_direccion_envio FROM core.orders WHERE id_orden=$1', [prepared.orderId])).rows;
    assert.equal(pending.length, 1); assert.equal(pending[0].id_usuario, 910001);
    assert.equal(pending[0].estado, 'pendiente_pago'); assert.equal(pending[0].fecha_pago, null);
    assert.equal(pending[0].id_direccion_envio, addressId); assert.equal(cents(pending[0].total), total);
    const payment = (await db.query('SELECT estado,monto,referencia_externa FROM core.pagos WHERE id_orden=$1', [prepared.orderId])).rows;
    assert.equal(payment.length, 1); assert.equal(payment[0].estado, 'pendiente'); assert.equal(cents(payment[0].monto), total);
    assert.equal(payment[0].referencia_externa, prepared.reference);
    record('PA10_PENDING_WITHOUT_PAYMENT', true); report.status = 'passed';
  } catch { report.status = 'failed'; report.errorCode = 'QA_CHECKOUT_POSITIVE_FAILED';
    if (report.cases.length < CASE_IDS.length) report.cases.push({ id: CASE_IDS[report.cases.length], status: 'failed' });
  }
  finally {
    for (const token of [...tokens]) { try { await logout(token); }
      catch { report.status = 'failed'; report.errorCode = 'QA_CHECKOUT_LOGOUT_FAILED'; } }
    if (db) { try { await db.end(); report.databaseClosed = true; }
      catch { report.status = 'failed'; report.errorCode = 'QA_CHECKOUT_DB_CLOSE_FAILED'; } }
  }
  return report;
}
function validatePositiveReport(value) {
  const report = object(value);
  assert.deepEqual(Object.keys(report).sort(), ['schemaVersion', 'scope', 'backendCommit', 'sourceHashes', 'status',
    'cases', 'flags', 'operationUncertain', 'paymentExecuted', 'logout', 'databaseClosed', 'errorCode'].sort());
  assert.equal(report.schemaVersion, 1); assert.equal(report.backendCommit, PIN);
  assert.equal(report.scope, 'isolated-checkout-positive-address-not-payment'); assert.equal(report.paymentExecuted, false);
  assert.ok(['passed', 'failed'].includes(report.status));
  for (const [file, hash] of Object.entries(object(report.sourceHashes))) {
    assert.ok(Object.hasOwn(SOURCE_HASHES, file)); assert.match(hash, /^[a-f0-9]{64}$/);
  }
  assert.equal(typeof report.operationUncertain, 'boolean'); assert.equal(typeof report.databaseClosed, 'boolean');
  const flags = ['sourcePinned', 'databaseConfirmed', 'sellerTestVerified', 'preferenceVerified',
    'positivePersistence', 'freshSessionRead', 'otherAccountIsolated', 'cartStockUnchanged'];
  assert.deepEqual(Object.keys(object(report.flags)).sort(), flags.sort());
  assert.ok(Object.values(report.flags).every(flag => typeof flag === 'boolean'));
  if (report.flags.sourcePinned) assert.deepEqual(report.sourceHashes, SOURCE_HASHES);
  assert.ok(Array.isArray(report.cases) && report.cases.length <= CASE_IDS.length);
  report.cases.forEach((item, index) => { assert.deepEqual(Object.keys(item).sort(), ['id', 'status']);
    assert.equal(item.id, CASE_IDS[index]); assert.ok(['passed', 'failed'].includes(item.status)); });
  assert.ok(Array.isArray(report.logout) && report.logout.length <= 5 && report.logout.every(item => typeof item === 'boolean'));
  assert.ok(['NONE', 'QA_CHECKOUT_POSITIVE_FAILED', 'QA_CHECKOUT_LOGOUT_FAILED', 'QA_CHECKOUT_DB_CLOSE_FAILED'].includes(report.errorCode));
  if (report.status === 'passed') {
    assert.equal(report.cases.length, CASE_IDS.length); assert.ok(report.cases.every(item => item.status === 'passed'));
    assert.ok(Object.values(report.flags).every(Boolean)); assert.equal(report.operationUncertain, false);
    assert.deepEqual(report.logout, [true, true, true]); assert.equal(report.databaseClosed, true); assert.equal(report.errorCode, 'NONE');
  }
  return report;
}
module.exports = { SOURCE_HASHES, SELLER_ID, ADDRESS, ACTORS, CASE_IDS, guardPositiveEnv, validateSeller,
  validatePreference, runPositiveAcceptance, validatePositiveReport };

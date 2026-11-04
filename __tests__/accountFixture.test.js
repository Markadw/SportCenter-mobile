/** @jest-environment node */
'use strict';
// Synthetic stateful transports only. No real API, account, secret or Android interaction.
const test = globalThis.test || require('node:test').test;
const assert = require('node:assert/strict');
const path = require('node:path');
const { captureFixture, restoreFixture, validateFixture, validateCaptureReport, validateRestorationReport,
  validateMutationState, TEST_NAME, STATE_KEYS, RESTORATION_KEYS, ERROR_CODES, safeFixtureCode } = require(path.join(
  process.env.ACCOUNT_MUTATIONS_PREP_DIR || process.env.ACCOUNT_PREP_DIR || path.join(__dirname, '..', 'scripts'), 'account-fixture.cjs'));
const API = 'https://back-sport-ghxk.onrender.com';
const email = 'synthetic@example.test', password = 'Synthetic &+ Päss word';
const clone = value => JSON.parse(JSON.stringify(value));
const profile = () => ({ nombre: 'Original', aPaterno: 'Prueba', aMaterno: 'Movil', email, telefono: '5550001122',
  passw: 'PRIVATE_BACKEND_CANARY', rol: 99, id_usuario: 999 });
const item = (extra = {}) => ({ id_variante: 201, id_producto: 301, nombre: 'Producto sintético', sku: 'SYN-A', cantidad: 1,
  precio_unitario: 10, stock: 3, activo: true, atributos: { Color: 'Negro' }, ...extra });
const body = (status, text) => ({ status, body: { getReader() { let sent = false; return {
  async read() { if (sent) return { done: true }; sent = true; return { done: false, value: Buffer.from(text, 'utf8') }; },
  async cancel() {}, releaseLock() {},
}; } } });
const json = (status, value) => body(status, JSON.stringify(value));
function fake() {
  const state = { profile: profile(), items: [item(), item({ id_variante: 202, id_producto: 302, nombre: 'Otra línea', sku: 'SYN-B',
    cantidad: 2, precio_unitario: 20, stock: 6, atributos: { Talla: 'M' } })], price: 10, stock: 3,
    detailExtra: [], loginStatus: 201, logoutStatus: 201, before: null, afterWrite: null };
  const calls = [];
  const cart = () => ({ id_carrito: 101, items: clone(state.items), summary: {
    subtotal: state.items.reduce((sum, row) => sum + row.cantidad * row.precio_unitario, 0),
    itemCount: state.items.reduce((sum, row) => sum + row.cantidad, 0) } });
  const fetchImpl = async (url, config) => {
    assert.equal(new URL(url).origin, API); assert.equal(config.redirect, 'error');
    assert.ok(config.signal instanceof AbortSignal); calls.push({ url, method: config.method, config });
    const route = url.slice(API.length), payload = config.body === undefined ? undefined : JSON.parse(config.body);
    const override = await state.before?.({ route, method: config.method, payload }); if (override !== undefined) return override;
    if (route === '/users/login-user') {
      assert.deepEqual(payload, { email, passw: password });
      return json(state.loginStatus, state.loginStatus === 201 ? { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
        sessionId: 'synthetic-session', accessTokenExpiresIn: '15m' } : { code: 1 });
    }
    assert.equal(config.headers.Authorization, 'Bearer synthetic-access');
    if (route === '/users/logout') { assert.deepEqual(payload, {}); return json(state.logoutStatus, {}); }
    if (route === '/users/profile' && config.method === 'GET') return json(200, state.profile);
    if (route === '/products/cart' && config.method === 'GET') return json(200, cart());
    if (route === '/products/get-product-details/301' && config.method === 'GET') return json(200, [{ id_producto: 301,
      variantes: [{ id_variante: 201, sku: 'SYN-A', precio: state.price, stock: state.stock,
        atributos: { Color: 'Negro' } }, ...state.detailExtra] }]);
    if (route === '/users/update-profile' && config.method === 'PATCH') {
      assert.deepEqual(Object.keys(payload), ['nombre']); state.profile.nombre = payload.nombre;
      const result = await state.afterWrite?.({ route, method: config.method, payload });
      return result === undefined ? json(200, { user: state.profile }) : result;
    }
    if (route === '/products/cart/items/201' && config.method === 'PUT') {
      assert.deepEqual(Object.keys(payload), ['cantidad']);
      state.items.find(row => row.id_variante === 201).cantidad = payload.cantidad;
      const result = await state.afterWrite?.({ route, method: config.method, payload });
      return result === undefined ? json(200, cart()) : result;
    }
    if (route === '/products/cart/items' && config.method === 'POST') {
      assert.deepEqual(Object.keys(payload).sort(), ['cantidad', 'id_variante']); assert.equal(payload.id_variante, 201);
      const existing = state.items.find(row => row.id_variante === payload.id_variante);
      if (existing) existing.cantidad += payload.cantidad;
      else state.items.push(item({ cantidad: payload.cantidad, precio_unitario: state.price, stock: state.stock }));
      const result = await state.afterWrite?.({ route, method: config.method, payload });
      return result === undefined ? json(200, cart()) : result;
    }
    assert.fail('Unexpected route or mutation; no generic client is permitted');
  };
  return { state, calls, fetchImpl, cart };
}
const flags = (extra = {}) => Object.fromEntries(STATE_KEYS.map(key => [key, extra[key] ?? false]));
const writes = server => server.calls.filter(call => ['PATCH', 'PUT', 'DELETE'].includes(call.method) || call.method === 'POST' && call.url.endsWith('/products/cart/items'));
async function capture(server) {
  const result = await captureFixture({ email, password, fetchImpl: server.fetchImpl });
  assert.equal(validateCaptureReport(result), true); return result;
}
async function restore(server, fixture, mutationState = flags(), extra = {}) {
  const result = await restoreFixture({ email, password, fixture, mutationState, uiStopped: true, fetchImpl: server.fetchImpl, ...extra });
  assert.equal(validateRestorationReport(result), true);
  const serialized = JSON.stringify(result);
  for (const canary of [email, password, 'synthetic-access', 'synthetic-refresh', 'PRIVATE_BACKEND_CANARY', 'SYN-A', '5550001122']) assert.equal(serialized.includes(canary), false);
  assert.deepEqual(Object.keys(result.restoration), RESTORATION_KEYS); return result;
}

test('capture uses one login/session, bounded fixed GETs, then logout; baseline is private/frozen/allowlisted', async () => {
  const server = fake(), result = await capture(server);
  assert.equal(result.errorCode, 'NONE'); assert.equal(result.authReport.logoutConfirmed, true);
  assert.deepEqual(server.calls.map(call => [call.method, call.url.slice(API.length)]), [
    ['POST', '/users/login-user'], ['GET', '/users/profile'], ['GET', '/products/cart'],
    ['GET', '/products/get-product-details/301'], ['POST', '/users/logout']]);
  assert.equal(validateFixture(result.fixture), true); assert.equal(Object.isFrozen(result.fixture.profile), true);
  assert.equal(Object.isFrozen(result.fixture.cart.items[0]), true); assert.equal(result.fixture.target.selectorLabel, 'Color: Negro');
  assert.deepEqual(Object.keys(result.fixture.profile), ['nombre', 'aPaterno', 'aMaterno', 'email', 'telefono']);
  assert.equal(result.fixture.profile.passw, undefined); assert.equal(result.fixture.cart.id_usuario, undefined);
  assert.throws(() => JSON.stringify(result.fixture), /FIXTURE_INVALID/);
  assert.equal(validateFixture({ ...result.fixture }), false); assert.equal(writes(server).length, 0);
});
test('rejected auth or unconfirmed logout cannot expose an otherwise captured baseline', async () => {
  const rejected = fake(); rejected.state.loginStatus = 400;
  const first = await capture(rejected); assert.equal(first.fixture, null); assert.equal(first.errorCode, 'FIXTURE_AUTH_FAILED'); assert.equal(rejected.calls.length, 1);
  const cleanup = fake(); cleanup.state.logoutStatus = 503;
  const second = await capture(cleanup); assert.equal(second.fixture, null); assert.equal(second.errorCode, 'FIXTURE_AUTH_CLEANUP_FAILED');
});
for (const [name, change, code] of [
  ['nullable contact', server => { server.state.profile.telefono = null; }, 'FIXTURE_PROFILE_INVALID'],
  ['unnormalized surname', server => { server.state.profile.aPaterno = ' Prueba '; }, 'FIXTURE_PROFILE_NOT_NORMALIZED'],
  ['email normalization', server => { server.state.profile.email = email.toUpperCase(); }, 'FIXTURE_PROFILE_NOT_NORMALIZED'],
  ['same test name', server => { server.state.profile.nombre = TEST_NAME; }, 'FIXTURE_PROFILE_INVALID'],
  ['empty cart', server => { server.state.items = []; }, 'FIXTURE_EMPTY'],
  ['stock below base plus one', server => { server.state.items[0].cantidad = 2; server.state.items[0].stock = 2; server.state.items[1].activo = false; }, 'FIXTURE_STOCK'],
  ['quantity 99', server => { server.state.items[0].cantidad = 99; server.state.items[0].stock = 100; server.state.items[1].activo = false; }, 'FIXTURE_STOCK'],
  ['historical unit price', server => { server.state.price = 11; }, 'FIXTURE_PRICE_CHANGED'],
  ['ambiguous cart name', server => { server.state.items[1].nombre = server.state.items[0].nombre; }, 'FIXTURE_TARGET_AMBIGUOUS'],
  ['ambiguous variant label', server => { server.state.detailExtra = [{ id_variante: 203, sku: 'SYN-C', stock: 3, precio: 10, atributos: { Color: 'Negro' } }]; }, 'FIXTURE_TARGET_AMBIGUOUS'],
]) test('capture blocks ' + name + ' before any mutation and still logs out', async () => {
  const server = fake(); change(server); const result = await capture(server);
  assert.equal(result.fixture, null); assert.equal(result.errorCode, code); assert.equal(result.authReport.logoutConfirmed, true);
  assert.equal(result.authReport.errorCode, 'AUTHENTICATED_TASK_FAILED'); assert.equal(writes(server).length, 0);
});
test('quantity one with stock two is sufficient; quantity two with stock two was blocked', async () => {
  const server = fake(); server.state.items[0].stock = 2; server.state.stock = 2;
  assert.equal((await capture(server)).errorCode, 'NONE');
});
test('oversized/malformed fixture responses fail closed, retaining no body and always logging out', async () => {
  for (const [response, expected] of [[body(200, 'x'.repeat(65537)), 'FIXTURE_RESPONSE_TOO_LARGE'], [body(200, '<private>'), 'FIXTURE_RESPONSE_INVALID']]) {
    const server = fake(); server.state.before = ({ route }) => route === '/users/profile' ? response : undefined;
    const result = await capture(server); assert.equal(result.errorCode, expected); assert.equal(result.fixture, null);
    assert.equal(result.authReport.logoutConfirmed, true);
  }
});
test('already restored baseline makes no write; final independent reads and logout are required', async () => {
  const server = fake(), { fixture } = await capture(server); server.calls.length = 0;
  const result = await restore(server, fixture);
  assert.equal(result.errorCode, 'NONE'); assert.equal(result.restoration.baselineRestored, true);
  assert.equal(writes(server).length, 0); assert.equal(server.calls.filter(call => call.url.endsWith('/users/profile')).length, 2);
  assert.equal(server.calls.at(-1).url, API + '/users/logout');
});
test('profile restoration PATCHes only original nombre after recognized preimage, not contact or password', async () => {
  const server = fake(), { fixture } = await capture(server); server.state.profile.nombre = TEST_NAME; server.calls.length = 0;
  const result = await restore(server, fixture, flags({ profileNameAttempted: true }));
  assert.equal(result.restoration.baselineRestored, true); assert.equal(writes(server).length, 1);
  assert.deepEqual(JSON.parse(writes(server)[0].config.body), { nombre: 'Original' });
  assert.equal(server.state.profile.email, email); assert.equal(server.state.profile.telefono, '5550001122');
});
test('known increment restores an absolute base quantity with PUT and keeps all other lines', async () => {
  const server = fake(), { fixture } = await capture(server), other = clone(server.state.items[1]);
  server.state.items[0].cantidad = 2; server.calls.length = 0;
  const result = await restore(server, fixture, flags({ cartIncrementAttempted: true }));
  assert.equal(result.restoration.baselineRestored, true); assert.deepEqual(server.state.items[1], other);
  assert.deepEqual(writes(server).map(call => [call.method, JSON.parse(call.config.body)]), [['PUT', { cantidad: 1 }]]);
});
test('confirmed removal with no additive attempt permits one exact target POST, never whole-cart DELETE', async () => {
  const server = fake(), { fixture } = await capture(server); server.state.items.shift(); server.calls.length = 0;
  const result = await restore(server, fixture, flags({ cartRemoveAttempted: true, cartRemoveConfirmed: true }));
  assert.equal(result.restoration.baselineRestored, true); assert.equal(writes(server).length, 1);
  assert.equal(writes(server)[0].method, 'POST'); assert.deepEqual(JSON.parse(writes(server)[0].config.body), { id_variante: 201, cantidad: 1 });
});
test('an already present line after an additive attempt is only read; no duplicate POST', async () => {
  const server = fake(), { fixture } = await capture(server); server.calls.length = 0;
  const result = await restore(server, fixture, flags({ cartRemoveAttempted: true, cartRemoveConfirmed: true, cartAddAttempted: true }));
  assert.equal(result.restoration.baselineRestored, true); assert.equal(writes(server).length, 0);
});
test('absent line after an additive attempt stays uncertain and is never replayed', async () => {
  const server = fake(), { fixture } = await capture(server); server.state.items.shift(); server.calls.length = 0;
  const result = await restore(server, fixture, flags({ cartRemoveAttempted: true, cartRemoveConfirmed: true, cartAddAttempted: true }));
  assert.equal(result.errorCode, 'FIXTURE_MUTATION_UNCERTAIN'); assert.equal(result.restoration.mutationUncertain, true);
  assert.equal(result.restoration.baselineRestored, false); assert.equal(writes(server).length, 0);
});
test('a lost or 400 response after the one restoration POST can be resolved by final GET, never replay', async () => {
  for (const kind of ['network', 'http400']) {
    const server = fake(), { fixture } = await capture(server); server.state.items.shift(); server.calls.length = 0;
    server.state.afterWrite = () => { if (kind === 'network') throw new Error('PRIVATE_SERVER_CANARY'); return json(400, { detail: 'PRIVATE_SERVER_CANARY' }); };
    const result = await restore(server, fixture, flags({ cartRemoveAttempted: true, cartRemoveConfirmed: true }));
    assert.equal(result.restoration.baselineRestored, true); assert.equal(writes(server).length, 1);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SERVER_CANARY'), false);
  }
});
test('POST lost before processing remains unresolved; there is no automatic retry or replacement write', async () => {
  const server = fake(), { fixture } = await capture(server); server.state.items.shift(); server.calls.length = 0;
  server.state.before = ({ route, method }) => { if (route === '/products/cart/items' && method === 'POST') throw new Error('private failure'); };
  const result = await restore(server, fixture, flags({ cartRemoveAttempted: true, cartRemoveConfirmed: true }));
  assert.equal(result.restoration.baselineRestored, false); assert.equal(result.restoration.mutationUncertain, true); assert.equal(writes(server).length, 1);
});
test('unrecognized concurrent name/quantity is not overwritten', async () => {
  const server = fake(), { fixture } = await capture(server); server.state.profile.nombre = 'Concurrente'; server.state.items[0].cantidad = 3; server.calls.length = 0;
  const result = await restore(server, fixture, flags({ profileNameAttempted: true, cartIncrementAttempted: true }));
  assert.equal(result.errorCode, 'FIXTURE_CONFLICT'); assert.equal(result.restoration.concurrentChangeObserved, true);
  assert.equal(server.state.profile.nombre, 'Concurrente'); assert.equal(server.state.items[0].cantidad, 3); assert.equal(writes(server).length, 0);
});
test('concurrent other fields/lines remain untouched and restoration cannot be reported as complete', async () => {
  const server = fake(), { fixture } = await capture(server); server.state.profile.nombre = TEST_NAME; server.state.profile.telefono = '5559998877';
  server.state.items[0].cantidad = 2; server.state.items[1].cantidad = 3; server.calls.length = 0;
  const result = await restore(server, fixture, flags({ profileNameAttempted: true, cartIncrementAttempted: true }));
  assert.equal(result.restoration.otherProfileFieldsUnchanged, false); assert.equal(result.restoration.otherCartLinesUnchanged, false);
  assert.equal(result.restoration.concurrentChangeObserved, true); assert.equal(writes(server).length, 0);
});
for (const [kind, code] of [['price', 'FIXTURE_PRICE_CHANGED'], ['stock', 'FIXTURE_STOCK']]) test('changed ' + kind + ' blocks additive restoration without sending invented price or retry', async () => {
  const server = fake(), { fixture } = await capture(server); server.state.items.shift(); server.calls.length = 0;
  if (kind === 'price') server.state.price = 11; else server.state.stock = 0;
  const result = await restore(server, fixture, flags({ cartRemoveAttempted: true, cartRemoveConfirmed: true }));
  assert.equal(result.errorCode, code); assert.equal(result.restoration.baselineRestored, false);
  assert.equal(result.authReport.logoutConfirmed, true); assert.equal(writes(server).length, 0);
});
test('restored state with failed API logout still fails cleanup and acceptance', async () => {
  const server = fake(), { fixture } = await capture(server); server.state.logoutStatus = 503;
  const result = await restore(server, fixture);
  assert.equal(result.errorCode, 'FIXTURE_AUTH_CLEANUP_FAILED'); assert.equal(result.restoration.baselineRestored, false);
  assert.equal(result.authReport.logoutConfirmed, false);
});
test('failed final read cannot be reported as restored from an earlier mutation response', async () => {
  const server = fake(), { fixture } = await capture(server); server.state.profile.nombre = TEST_NAME; let reads = 0;
  server.state.before = ({ route }) => route === '/users/profile' && ++reads === 2 ? json(503, { internal: 'discarded' }) : undefined;
  const result = await restore(server, fixture, flags({ profileNameAttempted: true }));
  assert.equal(result.errorCode, 'FIXTURE_HTTP_FAILED'); assert.equal(result.restoration.baselineRestored, false); assert.equal(result.authReport.logoutConfirmed, true);
});
test('UI stop proof, genuine memory baseline and coherent flags are mandatory before a new login', async () => {
  const server = fake(), { fixture } = await capture(server); server.calls.length = 0;
  const first = await restore(server, fixture, flags(), { uiStopped: false }); assert.equal(first.errorCode, 'FIXTURE_UI_NOT_STOPPED');
  const second = await restore(server, { ...fixture }, flags()); assert.equal(second.errorCode, 'FIXTURE_INVALID');
  const third = await restore(server, fixture, flags({ cartAddAttempted: true })); assert.equal(third.errorCode, 'FIXTURE_STATE_INVALID');
  assert.equal(server.calls.length, 0); assert.equal(validateMutationState({ ...flags(), extra: true }), false);
});
test('strict report validators reject unsafe fields, forged restoration, raw codes and identity clones', async () => {
  const server = fake(), captured = await capture(server), result = await restore(server, captured.fixture);
  assert.equal(validateCaptureReport({ ...captured, email }), false);
  assert.equal(validateRestorationReport({ ...result, token: 'private' }), false);
  assert.equal(validateRestorationReport({ ...result, restoration: { ...result.restoration, mutationUncertain: true } }), false);
  assert.equal(validateRestorationReport({ ...result, authReport: null }), false);
  assert.equal(validateRestorationReport({ ...result, errorCode: 'raw internal message' }), false);
  assert.equal(safeFixtureCode(new Error('private')), 'FIXTURE_UNEXPECTED'); assert.ok(ERROR_CODES.includes(result.errorCode));
});

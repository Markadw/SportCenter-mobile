/** @jest-environment node */
// Dobles controlados: estos tests no producen evidencia de persistencia ni llaman proveedores.
const { describe, test, expect, jest } = require('@jest/globals');
const { SOURCE_HASHES, SELLER_ID, ADDRESS, ACTORS, guardPositiveEnv, validateSeller,
  runPositiveAcceptance, validatePositiveReport } = require('../tests/environment/checkout-positive.cjs');
function environment() {
  const env = { ISOLATED_TEST_ENV: 'true', QA_COMMERCE: 'true', QA_CHECKOUT_POSITIVE: 'true',
    QA_EXPECTED_SELLER_ID: String(SELLER_ID), API_BASE_URL: 'http://127.0.0.1:3000',
    FRONTEND_URL: 'https://qa-generated.trycloudflare.com', BACKEND_PUBLIC_URL: 'http://localhost:3000',
    MERCADO_PAGO_WEBHOOK_URL: 'http://127.0.0.1:3000/disabled', MERCADO_PAGO_ACCESS_TOKEN: 'synthetic-unit-placeholder',
    HTTPS_PROXY: 'http://egress:8080', HTTP_PROXY: 'http://egress:8080', NO_PROXY: 'localhost,127.0.0.1,db' };
  for (const name of ['ADMIN', 'EDITOR', 'READER', 'BACKUP']) env['DATABASE_URL_' + name] =
    'postgres://qa_' + name.toLowerCase() + ':synthetic@db:5432/sportcenter_qa';
  return env;
}
function response(status, data) {
  let consumed = false;
  return { status, redirected: false, body: { getReader: () => ({
    read: async () => consumed ? { done: true } : (consumed = true, { done: false, value: Buffer.from(JSON.stringify(data)) }),
    cancel: async () => {}, releaseLock: () => {},
  }) } };
}
function harness(options = {}) {
  const env = environment(), state = { committed: false, loginA: 0, confirms: 0, tokens: new Map(), stockChanged: false };
  const own = { id_direccion: 910001, principal: true }, other = { id_direccion: 910002, principal: true };
  const saved = { id_direccion: 920001, ...ADDRESS };
  const cart = { id_carrito: 910001, items: [{ id_variante: 131, cantidad: 1, stock: 5 }] };
  const db = { connect: jest.fn(async () => {}), end: jest.fn(async () => {}), query: jest.fn(async (sql) => {
    if (sql.includes('current_database()')) return { rows: [{ database: 'sportcenter_qa', role: 'qa_admin' }] };
    if (sql.includes('SELECT id_usuario,email')) return { rows: ACTORS.map(([id_usuario, email]) => ({ id_usuario, email })) };
    if (sql.includes('SELECT id_variante,sku')) return { rows: [{ id_variante: 131, sku: 'QA-66-A' }] };
    if (sql.includes("metodo_pago='mercado_pago'")) return { rows: options.alreadyPrepared ? [{ id_orden: 920001 }] : [] };
    if (sql.includes('to_jsonb(t)')) return { rows: [{ data: JSON.stringify(sql.includes('core.inventory ') && state.stockChanged ? ['changed'] : []) }] };
    if (sql.startsWith('SELECT id_direccion,id_usuario')) return { rows: options.noDatabaseAddress ? [] : [{ id_direccion: 920001, id_usuario: 910001 }] };
    if (sql.startsWith('SELECT id_usuario,estado')) return { rows: [{ id_usuario: 910001, estado: options.paid ? 'pendiente' : 'pendiente_pago',
      fecha_pago: options.paid ? '2026-01-01' : null, total: '100.00', id_direccion_envio: 920001 }] };
    if (sql.startsWith('SELECT estado,monto')) return { rows: [{ estado: 'pendiente', monto: '100.00', referencia_externa: 'SC-ORDER-920001-unit' }] };
    throw new Error('Unexpected SQL in unit double');
  }) };
  const Client = jest.fn(() => db);
  const fetchImpl = jest.fn(async (url, config) => {
    const route = new URL(url).pathname;
    if (route === '/users/login-user') {
      const body = JSON.parse(config.body), isA = body.email === ACTORS[0][1];
      if (isA) state.loginA++;
      const token = (isA ? 'qa-A-' + state.loginA : 'qa-B');
      state.tokens.set(token, isA ? 0 : 1);
      return response(201, { accessToken: token, sessionId: token + '-session' });
    }
    if (route === '/users/logout') {
      if (options.logoutFails) throw new Error('synthetic-secret-not-for-report');
      return response(201, { message: 'ok' });
    }
    if (route === '/products/checkout/summary') {
      const isA = state.tokens.get(config.headers.Authorization.slice(7)) === 0;
      const showSaved = state.committed && !options.noSavedAddress && !(options.freshReadMissing && state.loginA > 1);
      const addresses = isA ? [own, ...(showSaved ? [saved] : [])] : [other, ...(options.leakToB ? [saved] : [])];
      return response(200, { addresses, cart, totals: { total: 100 }, selectedShippingMethod: { id_metodo_envio: 910001 } });
    }
    if (route === '/products/checkout/confirm') {
      state.confirms++; state.committed = true; state.stockChanged = options.stockChanged || false;
      if (options.uncertain) throw new Error('synthetic-secret-not-for-report');
      if (options.rejected) { state.committed = false; return response(400, { message: 'Rejected' }); }
      const body = { order: { id_orden: 920001, total: '100.00', estado: 'pendiente_pago', fecha_pago: null },
        checkout: { provider: 'mercado_pago', preference_id: '3497260719-unit-pref', external_reference: 'SC-ORDER-920001-unit' } };
      if (options.malformedReceipt) delete body.checkout.preference_id;
      return response(201, body);
    }
    throw new Error('Unexpected local route in unit double');
  });
  const provider = { get: jest.fn(async url => {
    if (url === 'https://api.mercadolibre.com/users/me') return { status: 200,
      data: { id: SELLER_ID, site_id: 'MLM', user_type: 'normal', tags: options.realSeller ? ['normal'] : ['normal', 'test_user'] } };
    if (url === 'https://api.mercadopago.com/checkout/preferences/3497260719-unit-pref') {
      const data = { id: '3497260719-unit-pref', collector_id: options.wrongCollector ? 1 : SELLER_ID, site_id: 'MLM',
        external_reference: 'SC-ORDER-920001-unit', metadata: { id_orden: 920001, id_usuario: 910001 },
        items: [{ id: '920001', currency_id: 'MXN', quantity: 1, unit_price: 100 }],
        back_urls: Object.fromEntries(['success', 'failure', 'pending'].map(status => [status,
          env.FRONTEND_URL + '/dashboard/usuario/compras?payment=' + status + '&order=920001'])) };
      if (options.foreignNotification) data.notification_url = 'https://production.invalid/webhook';
      if (options.wrongAmount) data.items[0].unit_price = 101;
      if (options.foreignReturn) data.back_urls.success = 'https://production.invalid/success';
      return { status: 200, data };
    }
    throw new Error('Unexpected provider route in unit double');
  }) };
  // Sólo seam de hashing para este doble unitario. El ejecutor real calcula SHA256 del contenido.
  const readFile = jest.fn(file => Buffer.from(file));
  const digestSource = content => SOURCE_HASHES[content.replace(/^\/app\//, '')];
  return { deps: { env, Client, fetchImpl, provider, readFile, digestSource }, state, db };
}
describe('checkout positivo sólo en QA y con vendedor de prueba de México', () => {
  test('las guardas admiten el perfil explícito y no confunden normal con cuenta real', () => {
    expect(guardPositiveEnv(environment())).toBe('https://qa-generated.trycloudflare.com');
    expect(() => validateSeller({ id: SELLER_ID, site_id: 'MLM', user_type: 'normal', tags: ['normal', 'test_user'] })).not.toThrow();
  });
  test.each([
    ['opt-in', env => { delete env.QA_CHECKOUT_POSITIVE; }],
    ['base ajena', env => { env.DATABASE_URL_ADMIN = 'postgres://qa_admin:synthetic@outside.invalid/sportcenter_qa'; }],
    ['vendedor distinto', env => { env.QA_EXPECTED_SELLER_ID = '1'; }],
    ['retorno local', env => { env.FRONTEND_URL = 'http://localhost:4200'; }],
    ['retorno ajeno', env => { env.FRONTEND_URL = 'https://production.invalid'; }],
    ['webhook público', env => { env.MERCADO_PAGO_WEBHOOK_URL = 'https://production.invalid/webhook'; }],
    ['sin proxy', env => { delete env.HTTPS_PROXY; }],
    ['API ajena', env => { env.API_BASE_URL = 'https://production.invalid'; }],
    ['correo', env => { env.EMAIL_PASS = 'synthetic'; }],
  ])('rechaza %s antes de tocar base o red', async (_label, change) => {
    const h = harness(); change(h.deps.env);
    const report = await runPositiveAcceptance(h.deps);
    expect(report.status).toBe('failed'); expect(h.deps.Client).not.toHaveBeenCalled();
    expect(h.deps.fetchImpl).not.toHaveBeenCalled(); expect(h.deps.provider.get).not.toHaveBeenCalled();
    expect(() => validatePositiveReport(report)).not.toThrow();
  });
  test.each(['ADMIN', 'EDITOR', 'READER', 'BACKUP'].flatMap(role =>
    ['?host=outside.invalid', '?port=5433', '?user=other', '?sslmode=no-verify', '#ignored']
      .map(suffix => [role, suffix])))('rechaza parámetros o fragmentos DB en %s (%s) antes de conectar', async (role, suffix) => {
    const h = harness(); h.deps.env['DATABASE_URL_' + role] += suffix;
    const report = await runPositiveAcceptance(h.deps);
    expect(report.status).toBe('failed'); expect(report.errorCode).toBe('QA_CHECKOUT_POSITIVE_FAILED');
    expect(h.deps.Client).not.toHaveBeenCalled(); expect(h.deps.fetchImpl).not.toHaveBeenCalled();
    expect(h.deps.provider.get).not.toHaveBeenCalled();
    expect(() => validatePositiveReport(report)).not.toThrow();
  });
  test('una fuente alterada se rechaza usando el SHA256 real antes de conectar', async () => {
    const h = harness(); delete h.deps.digestSource; h.deps.readFile.mockReturnValue(Buffer.from('modified'));
    const report = await runPositiveAcceptance(h.deps);
    expect(report.flags.sourcePinned).toBe(false); expect(h.deps.Client).not.toHaveBeenCalled();
    expect(h.deps.provider.get).not.toHaveBeenCalled();
  });
  test.each([['cuenta no acreditada de prueba', { realSeller: true }], ['pedido ya preparado', { alreadyPrepared: true }]])(
    'no confirma con %s', async (_label, options) => {
      const h = harness(options), report = await runPositiveAcceptance(h.deps);
      expect(report.status).toBe('failed'); expect(h.state.confirms).toBe(0); expect(h.db.end).toHaveBeenCalledTimes(1);
    });
  test.each(['CJS', 'namespace ESM'])('acepta Axios como %s y ejecuta las consultas verificadas', async form => {
    const h = harness(), transport = h.deps.provider;
    if (form === 'namespace ESM') h.deps.provider = { default: transport };
    const report = await runPositiveAcceptance(h.deps);
    expect(report.status).toBe('passed'); expect(h.state.confirms).toBe(1);
    expect(transport.get.mock.calls.map(([url]) => url)).toEqual([
      'https://api.mercadolibre.com/users/me', 'https://api.mercadopago.com/checkout/preferences/3497260719-unit-pref']);
    expect(() => validatePositiveReport(report)).not.toThrow();
  });
  test('rechaza un módulo sin get antes de autenticar o confirmar', async () => {
    const h = harness(); h.deps.provider = { default: {} };
    const report = await runPositiveAcceptance(h.deps);
    expect(report.status).toBe('failed'); expect(h.deps.fetchImpl).not.toHaveBeenCalled();
    expect(h.state.confirms).toBe(0); expect(h.db.end).toHaveBeenCalledTimes(1);
  });
  test('exige todas las lecturas y verifica una única confirmación con limpieza', async () => {
    const h = harness(), report = await runPositiveAcceptance(h.deps);
    expect(report.status).toBe('passed'); expect(h.state.confirms).toBe(1); expect(report.paymentExecuted).toBe(false);
    expect(report.logout).toEqual([true, true, true]); expect(h.db.end).toHaveBeenCalledTimes(1);
    expect(h.deps.provider.get.mock.calls.map(([url]) => url)).toEqual([
      'https://api.mercadolibre.com/users/me', 'https://api.mercadopago.com/checkout/preferences/3497260719-unit-pref']);
    expect(h.db.query.mock.calls.every(([sql]) => sql.startsWith('SELECT '))).toBe(true);
    expect(() => validatePositiveReport(report)).not.toThrow();
  });
  test.each([
    ['persistencia ausente en resumen', { noSavedAddress: true }],
    ['persistencia ausente en base', { noDatabaseAddress: true }],
    ['dirección perdida al volver a entrar', { freshReadMissing: true }],
    ['dirección expuesta a B', { leakToB: true }],
    ['vendedor de preferencia distinto', { wrongCollector: true }],
    ['importe de preferencia distinto', { wrongAmount: true }],
    ['retorno ajeno', { foreignReturn: true }],
    ['notificación ajena', { foreignNotification: true }],
    ['inventario cambiado sin pagar', { stockChanged: true }],
    ['pedido pagado sin ejecutar pago', { paid: true }],
  ])('no declara éxito ante %s', async (_label, options) => {
    const h = harness(options), report = await runPositiveAcceptance(h.deps);
    expect(report.status).toBe('failed'); expect(h.state.confirms).toBe(1); expect(report.paymentExecuted).toBe(false);
    expect(h.db.end).toHaveBeenCalledTimes(1); expect(report.logout.every(Boolean)).toBe(true);
    expect(() => validatePositiveReport(report)).not.toThrow();
  });
  test.each([['conexión perdida', { uncertain: true }], ['recibo incompleto', { malformedReceipt: true }]])(
    '%s conserva incertidumbre y jamás repite POST', async (_label, options) => {
      const h = harness(options), report = await runPositiveAcceptance(h.deps);
      expect(h.state.confirms).toBe(1); expect(report.operationUncertain).toBe(true);
      expect(report.status).toBe('failed'); expect(report.logout).toEqual([true]);
      expect(JSON.stringify(report)).not.toContain('synthetic-secret-not-for-report');
      expect(JSON.stringify(report)).not.toContain('synthetic-unit-placeholder');
    });
  test('rechazo 400 del backend fijado no se confunde con resultado incierto', async () => {
    const h = harness({ rejected: true }), report = await runPositiveAcceptance(h.deps);
    expect(report.status).toBe('failed'); expect(report.operationUncertain).toBe(false); expect(h.state.confirms).toBe(1);
  });
  test('limpieza fallida impide declarar éxito', async () => {
    const h = harness({ logoutFails: true }), report = await runPositiveAcceptance(h.deps);
    expect(report.status).toBe('failed'); expect(report.errorCode).toBe('QA_CHECKOUT_LOGOUT_FAILED');
    expect(h.db.end).toHaveBeenCalledTimes(1);
  });
  test.each(['token', 'address', 'providerResponse', 'url', 'stack'])('el reporte rechaza el campo libre %s', async field => {
    const report = await runPositiveAcceptance({ env: {} });
    report[field] = 'synthetic'; expect(() => validatePositiveReport(report)).toThrow();
  });
  test('un reporte incompleto no puede cambiarse a aprobado', async () => {
    const report = await runPositiveAcceptance({ env: {} }); report.status = 'passed';
    expect(() => validatePositiveReport(report)).toThrow();
  });
});

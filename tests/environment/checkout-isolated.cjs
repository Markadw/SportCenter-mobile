'use strict';
// Backend real y PostgreSQL efímero. Comprueba rollback; no simula un pago exitoso.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PIN, guardConfig } = require('./commerce-isolated.cjs');

function guardRun(env, config, source, head, dirty) {
  for (const flag of ['ISOLATED_TEST_ENV', 'QA_COMMERCE', 'QA_CHECKOUT']) assert.equal(env[flag], 'true', 'QA_CHECKOUT_FLAG_REQUIRED');
  guardConfig(config, source);
  assert.equal(head, PIN, 'QA_CHECKOUT_SOURCE_REQUIRED');
  assert.equal(dirty, '', 'QA_CHECKOUT_SOURCE_DIRTY');
  assert.ok(!Object.keys(config.services.api.environment).some(key => /MERCADO_PAGO|SMTP|(?:^|_)EMAIL_|(?:^|_)MAIL_|SENDGRID|RESEND|MAILGUN|BREVO|POSTMARK|NODEMAILER/i.test(key)), 'QA_PROVIDERS_FORBIDDEN');
}

// Autocontenida para transmitir por stdin al contenedor API; sólo destinos literales.
async function containerAcceptance(deps = {}) {
  const check = require('node:assert/strict');
  const env = deps.env || process.env;
  const report = { schemaVersion: 1, scope: 'isolated-checkout-rollback-not-positive-address-persistence',
    backendCommit: '31ee304d902ec5ec5a9c0fc702eca5e1a531bc16', status: 'failed', cases: [],
    flags: { sourcePinned: false, databaseConfirmed: false, noProviders: false,
      writePathReached: false, rollbackConfirmed: false, freshSessionRead: false,
      positivePersistencePending: true }, logout: [], databaseClosed: false, errorCode: 'NONE' };
  let db;
  const tokens = new Set();
  const record = (id, condition) => { report.cases.push({ id, status: condition ? 'passed' : 'failed' }); check.ok(condition); };
  const call = async (method, route, token, body) => {
    check.ok((method === 'POST' && ['/users/login-user', '/users/logout', '/products/checkout/confirm'].includes(route)) ||
      (method === 'GET' && route === '/products/checkout/summary'));
    const response = await (deps.fetchImpl || globalThis.fetch)('http://127.0.0.1:3000' + route, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    check.equal(response.redirected, false);
    const reader = response.body?.getReader(); check.ok(reader);
    const chunks = []; let bytes = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength; check.ok(bytes <= 65536); chunks.push(Buffer.from(part.value)); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return { status: response.status, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  };
  const login = async () => {
    const response = await call('POST', '/users/login-user', null, { email: 'commerce-a@qa.invalid', passw: 'QaOnly-Commerce!47' });
    const token = response.data?.accessToken;
    // Guardar primero el token para cerrar una sesión aun si el resto de la respuesta falla.
    if (typeof token === 'string' && /^[A-Za-z0-9._~-]+$/.test(token)) tokens.add(token);
    check.ok(response.status >= 200 && response.status < 300 && tokens.has(token));
    check.equal(typeof response.data.sessionId, 'string');
    return token;
  };
  const logout = async token => {
    const response = await call('POST', '/users/logout', token, {});
    const ok = response.status >= 200 && response.status < 300;
    report.logout.push(ok); if (ok) tokens.delete(token); check.ok(ok);
  };
  try {
    check.equal(env.ISOLATED_TEST_ENV, 'true'); check.equal(env.QA_CHECKOUT, 'true');
    for (const role of ['ADMIN', 'EDITOR', 'READER', 'BACKUP']) {
      const url = new URL(env['DATABASE_URL_' + role]);
      check.equal(url.protocol, 'postgres:'); check.equal(url.hostname, 'db');
      check.equal(url.pathname, '/sportcenter_qa');
    }
    check.ok(!Object.keys(env).some(key => /MERCADO_PAGO|SMTP|(?:^|_)EMAIL_|(?:^|_)MAIL_|SENDGRID|RESEND|MAILGUN|BREVO|POSTMARK|NODEMAILER/i.test(key)));
    report.flags.noProviders = true;
    const hashes = {
      'src/modules/products/services/product-checkout.service.ts': '8f550ffb4ced5094f5bb41b368b1c2647ac744574f8dd63968fdf3b4c2ef5a6a',
      'src/modules/products/dto/checkout/create-checkout-order.dto.ts': 'b3505f45baf86a7ff6f353ad6de357474a490471ad49403ce8e5a00740ece502',
    };
    for (const [file, hash] of Object.entries(hashes)) {
      const data = (deps.readFile || require('node:fs').readFileSync)('/app/' + file);
      // Git conserva LF; el checkout Windows puede copiar CRLF a la imagen.
      check.equal(require('node:crypto').createHash('sha256').update(data.toString('utf8').replace(/\r\n/g, '\n')).digest('hex'), hash);
    }
    report.flags.sourcePinned = true;
    const Client = deps.Client || require('/app/node_modules/pg').Client;
    db = new Client({ connectionString: env.DATABASE_URL_ADMIN, ssl: false,
      connectionTimeoutMillis: 5000, query_timeout: 5000, statement_timeout: 5000 });
    await db.connect();
    const identity = (await db.query('SELECT current_database() AS database, current_user AS role')).rows[0];
    check.equal(identity.database, 'sportcenter_qa'); check.equal(identity.role, 'qa_admin');
    report.flags.databaseConfirmed = true;
    const users = (await db.query("SELECT id_usuario,email FROM core.users WHERE id_usuario IN (910001,910002) ORDER BY id_usuario")).rows;
    check.deepEqual(users.map(row => [row.id_usuario, row.email]), [[910001, 'commerce-a@qa.invalid'], [910002, 'commerce-b@qa.invalid']]);
    const tables = ['direcciones', 'orders', 'order_items', 'pagos', 'shipments', 'shipment_events', 'order_status_history', 'carts', 'cart_items', 'inventory'];
    // Compara contenido completo, no sólo conteos; no exporta direcciones, sesiones ni importes.
    const snapshot = async () => {
      const result = {};
      for (const table of tables) {
        const rows = (await db.query('SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data::text), \'[]\'::jsonb)::text AS data FROM (SELECT to_jsonb(t) AS row_data FROM core.' + table + ' t) s')).rows;
        result[table] = require('node:crypto').createHash('sha256').update(rows[0].data).digest('hex');
      }
      return result;
    };
    const sequenceState = async table => {
      const column = table === 'direcciones' ? 'id_direccion' : table === 'orders' ? 'id_orden' : 'id_pago';
      const row = (await db.query('SELECT pg_get_serial_sequence($1,$2) AS name', ['core.' + table, column])).rows[0];
      check.match(row.name || '', /^core\.[a-z_][a-z_0-9]*$/);
      return (await db.query('SELECT last_value::text AS value,is_called FROM ' + row.name)).rows[0];
    };
    let token = await login();
    const before = await snapshot();
    const summary = await call('GET', '/products/checkout/summary', token);
    record('AD01_OWN_ADDRESS_AND_STOCK', summary.status === 200 && summary.data.addresses.length === 1 &&
      summary.data.addresses[0].id_direccion === 910001 && summary.data.addresses[0].principal === true &&
      summary.data.cart.items.length === 1 && summary.data.cart.items[0].stock >= summary.data.cart.items[0].cantidad);
    const other = await call('POST', '/products/checkout/confirm', token,
      { id_direccion_envio: 910002, id_metodo_envio: 910001, metodo_pago: 'mercado_pago' });
    record('AD02_OTHER_ADDRESS_DENIED', other.status === 400 && other.data.message === 'La dirección de envío no es válida' &&
      JSON.stringify(before) === JSON.stringify(await snapshot()));
    const sequences = {};
    for (const table of ['direcciones', 'orders', 'pagos']) sequences[table] = await sequenceState(table);
    const created = await call('POST', '/products/checkout/confirm', token, { id_metodo_envio: 910001, metodo_pago: 'mercado_pago',
      direccion: { alias: 'QA direccion nueva', calle: 'Calle de prueba', numero: '1', colonia: 'Colonia QA',
        ciudad: 'Ciudad QA', estado: 'Estado QA', codigo_postal: '43000', pais: 'México', principal: true } });
    record('AD03_PROVIDER_CONFIGURATION_FAILURE', created.status === 400 && created.data.message === 'Mercado Pago no está configurado en el servidor');
    let advanced = true;
    for (const table of ['direcciones', 'orders', 'pagos']) {
      const after = await sequenceState(table), prior = sequences[table];
      advanced = advanced && after.is_called && (!prior.is_called || BigInt(after.value) > BigInt(prior.value));
    }
    report.flags.writePathReached = advanced;
    record('AD04_REAL_INSERT_PATH_REACHED', advanced);
    report.flags.rollbackConfirmed = JSON.stringify(before) === JSON.stringify(await snapshot());
    record('AD05_FULL_ROLLBACK', report.flags.rollbackConfirmed);
    await logout(token); token = await login();
    const fresh = await call('GET', '/products/checkout/summary', token);
    report.flags.freshSessionRead = fresh.status === 200 && JSON.stringify(fresh.data.addresses) === JSON.stringify(summary.data.addresses);
    record('AD06_FRESH_SESSION_NO_PHANTOM_ADDRESS', report.flags.freshSessionRead);
    report.status = 'passed';
  } catch { report.status = 'failed'; report.errorCode = 'QA_CHECKOUT_ACCEPTANCE_FAILED'; }
  finally {
    for (const token of [...tokens]) { try { await logout(token); } catch { report.status = 'failed'; report.errorCode = 'QA_CHECKOUT_LOGOUT_FAILED'; } }
    if (db) { try { await db.end(); report.databaseClosed = true; } catch { report.status = 'failed'; report.errorCode = 'QA_CHECKOUT_DB_CLOSE_FAILED'; } }
  }
  return report;
}

function validateReport(report) {
  assert.deepEqual(Object.keys(report).sort(), ['schemaVersion', 'scope', 'backendCommit', 'status', 'cases', 'flags', 'logout', 'databaseClosed', 'errorCode'].sort());
  assert.equal(report.schemaVersion, 1); assert.equal(report.backendCommit, PIN);
  assert.equal(report.scope, 'isolated-checkout-rollback-not-positive-address-persistence');
  assert.ok(['passed', 'failed'].includes(report.status));
  assert.deepEqual(Object.keys(report.flags).sort(), ['sourcePinned', 'databaseConfirmed', 'noProviders', 'writePathReached', 'rollbackConfirmed', 'freshSessionRead', 'positivePersistencePending'].sort());
  assert.ok(Object.values(report.flags).every(flag => typeof flag === 'boolean'));
  assert.equal(report.flags.positivePersistencePending, true);
  const ids = ['AD01_OWN_ADDRESS_AND_STOCK', 'AD02_OTHER_ADDRESS_DENIED', 'AD03_PROVIDER_CONFIGURATION_FAILURE', 'AD04_REAL_INSERT_PATH_REACHED', 'AD05_FULL_ROLLBACK', 'AD06_FRESH_SESSION_NO_PHANTOM_ADDRESS'];
  assert.ok(Array.isArray(report.cases) && report.cases.length <= ids.length);
  report.cases.forEach((item, index) => { assert.deepEqual(Object.keys(item).sort(), ['id', 'status']); assert.equal(item.id, ids[index]); assert.ok(['passed', 'failed'].includes(item.status)); });
  assert.ok(Array.isArray(report.logout) && report.logout.length <= 3 && report.logout.every(item => typeof item === 'boolean'));
  assert.equal(typeof report.databaseClosed, 'boolean');
  assert.ok(['NONE', 'QA_CHECKOUT_ACCEPTANCE_FAILED', 'QA_CHECKOUT_LOGOUT_FAILED', 'QA_CHECKOUT_DB_CLOSE_FAILED'].includes(report.errorCode));
  if (report.status === 'passed') {
    assert.equal(report.cases.length, ids.length); assert.ok(report.cases.every(item => item.status === 'passed'));
    assert.ok(Object.values(report.flags).every(Boolean)); assert.deepEqual(report.logout, [true, true]);
    assert.equal(report.databaseClosed, true); assert.equal(report.errorCode, 'NONE');
  }
  return report;
}

function main() {
  const root = path.resolve(__dirname, '../..'), file = path.join(__dirname, 'compose.yml');
  const options = { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 65536 };
  const command = (program, args, extra) => execFileSync(program, args, { ...options, ...extra });
  const config = JSON.parse(command('docker', ['compose', '-f', file, 'config', '--format', 'json']));
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'backend-source.json'), 'utf8'));
  const checkout = path.join(root, '.qa/backend');
  guardRun(process.env, config, source, command('git', ['-C', checkout, 'rev-parse', 'HEAD']).trim(), command('git', ['-C', checkout, 'status', '--porcelain']).trim());
  const mode = process.argv[2];
  if (mode === 'seed' || mode === 'schema-check') {
    command('docker', ['compose', '-f', file, 'exec', '-T', 'db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'qa_admin', '-d', 'sportcenter_qa'],
      { input: "SET sportcenter.checkout_qa = 'true';\n" + fs.readFileSync(path.join(__dirname, mode === 'seed' ? 'checkout-fixtures.sql' : 'checkout-schema-tests.sql'), 'utf8') });
    process.stdout.write(mode === 'seed' ? 'QA_CHECKOUT_SCHEMA_PREPARED\n' : 'QA_CHECKOUT_SCHEMA_CHECKED\n'); return;
  }
  assert.equal(mode, 'check', 'QA_CHECKOUT_MODE_REQUIRED');
  const input = '(' + containerAcceptance.toString() + ')().then(r=>process.stdout.write(JSON.stringify(r))).catch(()=>process.exitCode=1);';
  const raw = command('docker', ['compose', '-f', file, 'exec', '-T', '-e', 'QA_CHECKOUT=true', 'api', 'node', '-'], { input, timeout: 90000 });
  const report = validateReport(JSON.parse(raw));
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test-results/checkout-address-api.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
  if (report.status !== 'passed') process.exitCode = 1;
}
module.exports = { guardRun, containerAcceptance, validateReport };
if (require.main === module) { try { main(); } catch { process.stderr.write('QA_CHECKOUT_PREPARATION_FAILED\n'); process.exitCode = 1; } }

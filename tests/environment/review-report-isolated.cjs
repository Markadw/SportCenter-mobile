'use strict';
// Recibo real en la copia efímera. No abre el gateway ni contacta proveedores.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PIN, guardConfig } = require('./commerce-isolated.cjs');

// Autocontenida: se transmite por stdin al Node del contenedor API existente.
async function containerAcceptance(deps = {}) {
  const check = require('node:assert/strict');
  const env = deps.env || process.env;
  const sha = data => require('node:crypto').createHash('sha256').update(data).digest('hex');
  const readFile = deps.readFile || require('node:fs').readFileSync;
  const hashes = {
    'src/main.ts': '98aec3386fe095ca34f07d59a4b55e9f595c46491f5f7da7d3d37803cce9d29c',
    'src/modules/company/company.controller.ts': 'f5c81c391b11497952cf536de5380de017d9fc5809b438b5c054bc99838b74c8',
    'src/modules/company/company.service.ts': '91a5052219e0c9a5c0dc36a3f89ff5eed67bc0e00d2bac7fc557894971e2bfde',
    'src/modules/company/company.module.ts': '0afc746b7b9e484698128908ca2189841fec8b7689507c535d699d193fbeb25f',
    'src/modules/company/dto/create-contact-message.dto.ts': 'd9856a1b2e23d1814473fc97a6992d20d4d16a5043ee16347eb06055aaaa4a85',
    'src/modules/company/entities/contact-message.entity.ts': '2433c4a3417bdc25b7f7a353fde5792ad777d86505dee7cd7cf341f9c420305e',
  };
  const report = { schemaVersion: 1, scope: 'isolated-review-report-receipt-not-human-moderation',
    backendCommit: '31ee304d902ec5ec5a9c0fc702eca5e1a531bc16', status: 'failed', cases: [],
    flags: { sourcePinned: false, databaseConfirmed: false, emptyNamespace: false,
      syntheticReviewPresent: false, noProviders: false, negativeWritesAbsent: false,
      positiveFolio: false, exactPersistedUnreadRow: false, humanHandlingNotVerified: true },
    postAttempts: 0, writeUncertain: false, databaseClosed: false, errorCode: 'NONE' };
  let db;
  const record = (id, condition) => { report.cases.push({ id, status: condition ? 'passed' : 'failed' }); check.ok(condition); };
  const readResponse = async response => {
    check.equal(response.redirected, false);
    const reader = response.body?.getReader(); check.ok(reader);
    const chunks = []; let bytes = 0;
    try { for (;;) { const value = await reader.read(); if (value.done) break;
      bytes += value.value.byteLength; check.ok(bytes <= 16384); chunks.push(Buffer.from(value.value)); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const call = async body => {
    // Destino literal; ningún parámetro, redirect, token, host externo ni reintento.
    report.postAttempts++; report.writeUncertain = true;
    const response = await (deps.fetchImpl || globalThis.fetch)('http://127.0.0.1:3000/company/contact', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await readResponse(response);
    return { status: response.status, data };
  };
  try {
    check.equal(env.ISOLATED_TEST_ENV, 'true'); check.equal(env.QA_REVIEW_REPORT, 'true');
    for (const role of ['ADMIN', 'EDITOR', 'READER', 'BACKUP']) {
      const url = new URL(env['DATABASE_URL_' + role]);
      check.equal(url.protocol, 'postgres:'); check.equal(url.hostname, 'db');
      check.equal(url.pathname, '/sportcenter_qa');
    }
    check.ok(!Object.keys(env).some(name => /MERCADO_PAGO|SMTP|(?:^|_)EMAIL_|(?:^|_)MAIL_|SENDGRID|RESEND|MAILGUN|BREVO|POSTMARK|NODEMAILER/i.test(name)));
    report.flags.noProviders = true;
    for (const [file, expected] of Object.entries(hashes)) check.equal((deps.hash || sha)(readFile('/app/' + file)), expected);
    report.flags.sourcePinned = true;
    const Client = deps.Client || require('/app/node_modules/pg').Client;
    db = new Client({ connectionString: env.DATABASE_URL_ADMIN, ssl: false,
      connectionTimeoutMillis: 5000, query_timeout: 5000, statement_timeout: 5000 });
    await db.connect();
    const identity = (await db.query('SELECT current_database() AS database, current_user AS role')).rows;
    check.equal(identity[0]?.database, 'sportcenter_qa'); check.equal(identity[0]?.role, 'qa_admin');
    report.flags.databaseConfirmed = true;
    // No crea tablas ni elimina mensajes; exige la entidad real sincronizada por bootstrap.
    const table = (await db.query("SELECT to_regclass('public.contact_messages') IS NOT NULL AS present")).rows;
    check.equal(table[0]?.present, true);
    const triggers = (await db.query("SELECT count(*)::int AS total FROM pg_trigger WHERE tgrelid='public.contact_messages'::regclass AND NOT tgisinternal")).rows;
    check.equal(triggers[0]?.total, 0);
    const count = async () => (await db.query('SELECT count(*)::int AS total FROM public.contact_messages')).rows[0].total;
    check.equal(await count(), 0); report.flags.emptyNamespace = true;
    const reviews = (await db.query('SELECT id_review FROM core.reviews WHERE id_producto=$1 AND id_usuario=$2 AND comentario=$3',
      [66, 910002, 'Resena sintetica QA para comprobar lectura y elegibilidad.'])).rows;
    check.equal(reviews.length, 1); const reviewId = reviews[0].id_review;
    check.ok(Number.isSafeInteger(reviewId) && reviewId > 0); report.flags.syntheticReviewPresent = true;
    const body = { nombre: 'Cliente QA Reporte', email: 'review-report@qa.invalid',
      asunto: 'Reporte de reseña #' + reviewId + ' · producto #66',
      mensaje: 'Reseña #' + reviewId + ' del producto #66\nMotivo: Reporte sintetico autorizado en entorno local aislado.' };
    // IsEmail rechaza el primero; IsString rechaza el segundo. Sin claves extra:
    // ValidationPipe usa whitelist + forbidNonWhitelisted en el main fijado.
    const email = await call({ ...body, email: 'correo-invalido' });
    record('RR01_INVALID_EMAIL_DENIED', email.status === 400 && await count() === 0); report.writeUncertain = false;
    const message = await call({ ...body, mensaje: 123 });
    record('RR02_INVALID_MESSAGE_DENIED', message.status === 400 && await count() === 0); report.writeUncertain = false;
    report.flags.negativeWritesAbsent = true;
    const created = await call(body);
    const folio = created.data?.id_mensaje;
    report.flags.positiveFolio = created.status === 201 && Number.isSafeInteger(folio) && folio > 0;
    record('RR03_REPORT_FOLIO', report.flags.positiveFolio);
    const rows = (await db.query('SELECT id_mensaje,nombre,email,asunto,mensaje,telefono,leido,respondido,fecha_lectura,id_usuario_responde FROM public.contact_messages')).rows;
    const row = rows[0];
    report.flags.exactPersistedUnreadRow = rows.length === 1 && row.id_mensaje === folio &&
      Object.entries(body).every(([key, value]) => row[key] === value) && row.telefono === null &&
      row.leido === false && row.respondido === false && row.fecha_lectura === null && row.id_usuario_responde === null;
    record('RR04_EXACT_UNREAD_PERSISTENCE', report.flags.exactPersistedUnreadRow);
    report.writeUncertain = false; report.status = 'passed';
  } catch { report.status = 'failed'; report.errorCode = 'QA_REPORT_ACCEPTANCE_FAILED'; }
  finally { if (db) { try { await db.end(); report.databaseClosed = true; } catch { report.status = 'failed'; report.errorCode = 'QA_REPORT_DB_CLOSE_FAILED'; } } }
  return report;
}

function guardRun(env, config, source, head, dirty) {
  assert.equal(env.ISOLATED_TEST_ENV, 'true', 'QA_FLAG_REQUIRED');
  assert.equal(env.QA_COMMERCE, 'true', 'QA_COMMERCE_FLAG_REQUIRED');
  assert.equal(env.QA_REVIEW_REPORT, 'true', 'QA_REPORT_FLAG_REQUIRED');
  guardConfig(config, source); assert.equal(head, PIN, 'QA_CHECKOUT_REQUIRED'); assert.equal(dirty, '', 'QA_CHECKOUT_DIRTY');
}
function validateReport(report) {
  assert.equal(report?.schemaVersion, 1); assert.equal(report.backendCommit, PIN);
  assert.equal(report.scope, 'isolated-review-report-receipt-not-human-moderation');
  assert.ok(['passed', 'failed'].includes(report.status));
  assert.deepEqual(Object.keys(report).sort(), ['schemaVersion', 'scope', 'backendCommit', 'status', 'cases', 'flags', 'postAttempts', 'writeUncertain', 'databaseClosed', 'errorCode'].sort());
  assert.deepEqual(Object.keys(report.flags).sort(), ['sourcePinned', 'databaseConfirmed', 'emptyNamespace', 'syntheticReviewPresent', 'noProviders', 'negativeWritesAbsent', 'positiveFolio', 'exactPersistedUnreadRow', 'humanHandlingNotVerified'].sort());
  assert.ok(Object.values(report.flags).every(value => typeof value === 'boolean'));
  assert.ok(Number.isSafeInteger(report.postAttempts) && report.postAttempts >= 0 && report.postAttempts <= 3);
  assert.equal(typeof report.writeUncertain, 'boolean'); assert.equal(typeof report.databaseClosed, 'boolean');
  assert.ok(['NONE', 'QA_REPORT_ACCEPTANCE_FAILED', 'QA_REPORT_DB_CLOSE_FAILED'].includes(report.errorCode));
  const ids = ['RR01_INVALID_EMAIL_DENIED', 'RR02_INVALID_MESSAGE_DENIED', 'RR03_REPORT_FOLIO', 'RR04_EXACT_UNREAD_PERSISTENCE'];
  assert.ok(Array.isArray(report.cases) && report.cases.length <= ids.length);
  report.cases.forEach((item, index) => { assert.deepEqual(Object.keys(item).sort(), ['id', 'status']); assert.equal(item.id, ids[index]); assert.ok(['passed', 'failed'].includes(item.status)); });
  if (report.status === 'passed') {
    assert.equal(report.cases.length, 4); assert.ok(report.cases.every(item => item.status === 'passed'));
    assert.ok(Object.values(report.flags).every(Boolean)); assert.equal(report.postAttempts, 3);
    assert.equal(report.writeUncertain, false); assert.equal(report.databaseClosed, true); assert.equal(report.errorCode, 'NONE');
  }
  return report;
}
function main() {
  const root = path.resolve(__dirname, '../..'), file = path.join(root, 'tests/environment/compose.yml');
  const quiet = { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 65536 };
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'backend-source.json'), 'utf8'));
  const config = JSON.parse(execFileSync('docker', ['compose', '-f', file, 'config', '--format', 'json'], quiet));
  const checkout = path.join(root, '.qa/backend');
  guardRun(process.env, config, source, execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], quiet).trim(),
    execFileSync('git', ['-C', checkout, 'status', '--porcelain'], quiet).trim());
  const input = '(' + containerAcceptance.toString() + ')().then(r=>process.stdout.write(JSON.stringify(r))).catch(()=>{process.stderr.write("QA_REPORT_RUNTIME_FAILED");process.exitCode=1;});';
  const raw = execFileSync('docker', ['compose', '-f', file, 'exec', '-T', '-e', 'QA_REVIEW_REPORT=true', 'api', 'node', '-'],
    { ...quiet, input, stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 });
  const report = validateReport(JSON.parse(raw));
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test-results/review-report-api.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  // La evidencia completa ya pasó allowlist estricta; reutiliza el log, sin otro artefacto de éxito.
  process.stdout.write(JSON.stringify(report) + '\n');
  if (report.status !== 'passed') process.exitCode = 1;
}
module.exports = { containerAcceptance, guardRun, validateReport };
if (require.main === module) { try { main(); } catch { process.stderr.write('QA_REPORT_PREPARATION_FAILED\n'); process.exitCode = 1; } }

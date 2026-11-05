/** @jest-environment node */
'use strict';
const { test } = require('@jest/globals');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { containerAcceptance, guardRun, validateReport } = require('../tests/environment/review-report-isolated.cjs');
const { reviewReportSummary } = require('../scripts/write-api-summary');
const PIN = '31ee304d902ec5ec5a9c0fc702eca5e1a531bc16';
function env() { return { ISOLATED_TEST_ENV: 'true', QA_COMMERCE: 'true', QA_REVIEW_REPORT: 'true',
  ...Object.fromEntries(['ADMIN', 'EDITOR', 'READER', 'BACKUP'].map(role => ['DATABASE_URL_' + role,
    'postgres://qa_admin:qa-admin-local@db:5432/sportcenter_qa'])) }; }
function config() { return { name: 'sportcenter-mobile-qa', networks: { isolated: { internal: true } }, services: {
  api: { image: 'sportcenter-local-qa:31ee304d902e', networks: ['isolated'], environment: env() }, db: { networks: ['isolated'] },
  access: { environment: { ISOLATED_TEST_ENV: 'true', QA_COMMERCE: 'true' }, ports: ['127.0.0.1:3011:3000'] },
} }; }
function response(status, data, { redirect = false, oversized = false } = {}) {
  let done = false;
  return { status, redirected: redirect, body: { getReader: () => ({
    read: async () => done ? { done: true } : (done = true, { done: false, value: Buffer.from(oversized ? 'x'.repeat(16385) : JSON.stringify(data)) }),
    cancel: async () => {}, releaseLock() {},
  }) } };
}
const sourceHashes = [
  '98aec3386fe095ca34f07d59a4b55e9f595c46491f5f7da7d3d37803cce9d29c',
  'f5c81c391b11497952cf536de5380de017d9fc5809b438b5c054bc99838b74c8',
  '91a5052219e0c9a5c0dc36a3f89ff5eed67bc0e00d2bac7fc557894971e2bfde',
  '0afc746b7b9e484698128908ca2189841fec8b7689507c535d699d193fbeb25f',
  'd9856a1b2e23d1814473fc97a6992d20d4d16a5043ee16347eb06055aaaa4a85',
  '2433c4a3417bdc25b7f7a353fde5792ad777d86505dee7cd7cf341f9c420305e',
];
function fixture(options = {}) {
  const posts = [], queries = []; let rows = [], sourceIndex = 0, constructed = 0, ends = 0;
  class Client {
    constructor(config) { constructed++; assert.equal(config.ssl, false); assert.equal(config.query_timeout, 5000); }
    async connect() { if (options.connectionError) throw Error('private connection failure'); }
    async end() { ends++; if (options.endError) throw Error('private close failure'); }
    async query(sql, args) {
      queries.push({ sql, args });
      if (sql.includes('current_database')) return { rows: [{ database: options.wrongDb ? 'production' : 'sportcenter_qa', role: 'qa_admin' }] };
      if (sql.includes('to_regclass')) return { rows: [{ present: !options.missingTable }] };
      if (sql.includes('pg_trigger')) return { rows: [{ total: options.trigger ? 1 : 0 }] };
      if (sql.includes('count(*)')) return { rows: [{ total: rows.length + (options.nonempty ? 1 : 0) }] };
      if (sql.includes('core.reviews')) return { rows: options.noReview ? [] : [{ id_review: 12345 }] };
      if (sql.includes('SELECT id_mensaje')) return { rows: rows.map(row => ({ ...row, ...(options.alteredRow ? { leido: true } : {}) })) };
      throw Error('UNEXPECTED_SQL');
    }
  }
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:3000/company/contact'); assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, undefined); const body = JSON.parse(init.body); posts.push(body);
    assert.deepEqual(Object.keys(body).sort(), ['asunto', 'email', 'mensaje', 'nombre']);
    if (posts.length < 3) {
      if (options.negativePersists) rows.push({ private: 'never exported' });
      return response(400, { message: 'private validation body' });
    }
    rows.push({ ...body, id_mensaje: 7, telefono: null, leido: false, respondido: false, fecha_lectura: null, id_usuario_responde: null });
    if (options.ambiguous) throw Error('private response lost after DB commit');
    return response(201, { id_mensaje: options.invalidFolio ? '7' : 7, privateField: 'never exported' }, options);
  };
  return { posts, queries, stats: () => ({ constructed, ends }), deps: { env: env(), Client, fetchImpl,
    readFile: file => { assert.ok(file.startsWith('/app/src/')); return sourceHashes[sourceIndex++]; },
    hash: value => options.sourceChanged ? 'changed' : value } };
}
test('host guard requires exact opt-ins, frozen checkout and internal compose', () => {
  assert.doesNotThrow(() => guardRun(env(), config(), { commit: PIN }, PIN, ''));
  for (const flag of ['ISOLATED_TEST_ENV', 'QA_COMMERCE', 'QA_REVIEW_REPORT']) {
    for (const value of [undefined, 'false', 'TRUE']) assert.throws(() => guardRun({ ...env(), [flag]: value }, config(), { commit: PIN }, PIN, ''));
  }
  assert.throws(() => guardRun(env(), config(), { commit: 'changed' }, PIN, ''));
  assert.throws(() => guardRun(env(), config(), { commit: PIN }, 'changed', ''));
  assert.throws(() => guardRun(env(), config(), { commit: PIN }, PIN, ' M source.ts'));
  const c = config(); c.services.api.networks.push('access'); assert.throws(() => guardRun(env(), c, { commit: PIN }, PIN, ''));
});
test('container checks its own flags, every database URL, no providers and pinned source before any write', async () => {
  const changes = [e => { e.QA_REVIEW_REPORT = 'false'; }, e => { e.ISOLATED_TEST_ENV = 'false'; },
    ...['ADMIN', 'EDITOR', 'READER', 'BACKUP'].map(role => e => { e['DATABASE_URL_' + role] = 'postgres://qa:x@remote/production'; }),
    ...['MERCADO_PAGO_ACCESS_TOKEN', 'SMTP_HOST', 'SENDGRID_API_KEY', 'MAILGUN_KEY', 'RESEND_API_KEY', 'BREVO_API_KEY', 'EMAIL_USER', 'MAIL_HOST', 'POSTMARK_TOKEN'].map(name => e => { e[name] = 'synthetic'; })];
  for (const change of changes) { const m = fixture(); change(m.deps.env); const r = await containerAcceptance(m.deps);
    assert.equal(r.status, 'failed'); assert.equal(m.posts.length, 0); assert.equal(m.stats().constructed, 0); }
  const m = fixture({ sourceChanged: true }); const r = await containerAcceptance(m.deps);
  assert.equal(r.flags.sourcePinned, false); assert.equal(m.stats().constructed, 0); assert.equal(m.posts.length, 0);
});
test('source pinning accepts LF and CRLF buffers but rejects changed content before database access', async () => {
  const sha = data => require('node:crypto').createHash('sha256').update(data).digest('hex');
  const sources = sourceHashes.map((_, i) => `// frozen source ${i}\nexport const value = ${i};\n`);
  const expected = sources.map(sha);
  for (const ending of ['\n', '\r\n']) {
    const m = fixture(); let readIndex = 0, hashIndex = 0;
    m.deps.readFile = () => Buffer.from(sources[readIndex++].replace(/\n/g, ending));
    m.deps.hash = data => { const i = hashIndex++; assert.equal(sha(data), expected[i]); return sourceHashes[i]; };
    const r = await containerAcceptance(m.deps); validateReport(r);
    assert.equal(r.status, 'passed'); assert.equal(r.flags.sourcePinned, true);
    assert.equal(readIndex, 6); assert.equal(hashIndex, 6);
  }
  const m = fixture(); let readIndex = 0, hashIndex = 0;
  m.deps.readFile = () => Buffer.from((sources[readIndex++] + '// changed\n').replace(/\n/g, '\r\n'));
  m.deps.hash = data => { const i = hashIndex++; const actual = sha(data); return actual === expected[i] ? sourceHashes[i] : actual; };
  const r = await containerAcceptance(m.deps);
  assert.equal(r.status, 'failed'); assert.equal(r.flags.sourcePinned, false);
  assert.equal(m.stats().constructed, 0); assert.equal(m.posts.length, 0);
});

test('wrong runtime DB, missing entity, external trigger, existing messages or missing fixture stop before POST', async () => {
  for (const option of ['wrongDb', 'missingTable', 'trigger', 'nonempty', 'noReview', 'connectionError']) {
    const m = fixture({ [option]: true }); const r = await containerAcceptance(m.deps);
    assert.equal(r.status, 'failed'); assert.equal(m.posts.length, 0); assert.equal(m.stats().ends, 1);
  }
});
test('two real invalid payload shapes and one valid mobile payload yield four sanitized controls', async () => {
  const m = fixture(); const r = await containerAcceptance(m.deps); validateReport(r);
  assert.equal(r.status, 'passed'); assert.equal(r.cases.length, 4); assert.equal(m.posts.length, 3);
  assert.equal(m.posts[0].email, 'correo-invalido'); assert.equal(m.posts[1].mensaje, 123);
  assert.deepEqual(m.posts[2], { nombre: 'Cliente QA Reporte', email: 'review-report@qa.invalid',
    asunto: 'Reporte de reseña #12345 · producto #66',
    mensaje: 'Reseña #12345 del producto #66\nMotivo: Reporte sintetico autorizado en entorno local aislado.' });
  const serialized = JSON.stringify(r);
  for (const forbidden of ['@qa.invalid', '12345', 'Cliente QA', 'privateField', 'private validation', 'never exported', 'id_mensaje']) assert.ok(!serialized.includes(forbidden));
  assert.equal(r.writeUncertain, false); assert.equal(r.databaseClosed, true); assert.equal(r.flags.humanHandlingNotVerified, true);
  assert.ok(m.queries.every(query => /^SELECT /.test(query.sql)));
});
test('lost response after commit is uncertain and never replays POST or attempts remote cleanup', async () => {
  const m = fixture({ ambiguous: true }); const r = await containerAcceptance(m.deps); validateReport(r);
  assert.equal(r.status, 'failed'); assert.equal(r.writeUncertain, true); assert.equal(m.posts.length, 3); assert.equal(m.stats().ends, 1);
  assert.equal(r.errorCode, 'QA_REPORT_ACCEPTANCE_FAILED'); assert.ok(!JSON.stringify(r).includes('response lost'));
});
test('wrong folio, redirected or oversized response, modified persistence or DB-close error cannot pass', async () => {
  for (const option of ['invalidFolio', 'redirect', 'oversized', 'alteredRow', 'endError', 'negativePersists']) {
    const m = fixture({ [option]: true }); const r = await containerAcceptance(m.deps); validateReport(r);
    assert.equal(r.status, 'failed'); assert.ok(m.posts.length <= 3); assert.equal(m.stats().ends, 1);
  }
});
test('summary only approves complete successful schema and never reflects unknown data', async () => {
  const r = await containerAcceptance(fixture().deps);
  assert.ok(reviewReportSummary(r, 'success').includes('aprobado para cuatro controles locales'));
  for (const outcome of ['failure', 'skipped', 'cancelled', 'PRIVATE_VALUE']) {
    const s = reviewReportSummary(r, outcome); assert.ok(s.includes('sin aprobación acreditada')); assert.ok(!s.includes('PRIVATE_VALUE'));
  }
  for (const mutate of [x => { x.cases.pop(); }, x => { x.databaseClosed = false; }, x => { x.writeUncertain = true; },
    x => { x.flags.positiveFolio = false; }, x => { x.extra = 'PRIVATE_VALUE'; }, x => { x.cases[0].id = 'PRIVATE_VALUE'; }]) {
    const copy = structuredClone(r); mutate(copy); assert.throws(() => validateReport(copy));
    assert.ok(reviewReportSummary(copy, 'success').includes('sin aprobación acreditada'));
  }
  assert.ok(reviewReportSummary(null, 'success').includes('sin aprobación acreditada'));
});
test('existing HTTP job runs one report after commerce, keeps one artifact and unconditional teardown', () => {
  const { validateWorkflows } = require('../scripts/validate-test-configs');
  const read = () => new Map(['ci.yml', 'api-android.yml', 'performance.yml', 'security.yml', 'android-validation.yml']
    .map(file => [file, YAML.parse(fs.readFileSync(path.join(__dirname, '../.github/workflows', file), 'utf8'))]));
  assert.doesNotThrow(() => validateWorkflows(read()));
  for (const mutate of [
    job => { job.steps.find(step => step.id === 'review_report_local').if = 'false'; },
    job => { job.steps.find(step => step.id === 'review_report_local')['continue-on-error'] = true; },
    job => { job.steps.find(step => step.id === 'review_report_local').env.QA_REVIEW_REPORT = 'false'; },
    job => { job.steps.find(step => step.id === 'review_report_local').run += '\nnode tests/environment/review-report-isolated.cjs'; },
    job => { const i = job.steps.findIndex(step => step.id === 'review_report_local'); job.steps.push(job.steps.splice(i, 1)[0]); },
    job => { job.steps.find(step => step.run === 'node scripts/write-api-summary.js').env.REVIEW_REPORT_OUTCOME = 'success'; },
    job => { const step = job.steps.find(step => step.with?.name === 'api-evidence'); step.with.path = step.with.path.replace('test-results/review-report-api.json\n', ''); },
  ]) { const w = read(); mutate(w.get('api-android.yml').jobs.api); assert.throws(() => validateWorkflows(w)); }
});

/** @jest-environment node */
'use strict';
const test = globalThis.test || require('node:test').test;
const assert = require('node:assert/strict');
const path = require('node:path');
const account = require(path.join(process.env.ACCOUNT_PREP_DIR || path.join(__dirname, '..', 'scripts'), 'android-account.cjs'));
const { SandboxError } = require(path.join(process.env.ACCOUNT_PREP_DIR || path.join(__dirname, '..', 'scripts'), 'account-sandbox.cjs'));
const REPO = process.env.ACCOUNT_REPO_ROOT || path.join(__dirname, '..');
const { xmlTree } = require(path.join(REPO, 'scripts/android-pinning.js'));
const { SOURCE, AccountError } = account;
const fixtureTools = require(path.join(process.env.ACCOUNT_PREP_DIR || path.join(__dirname, '..', 'scripts'), 'account-fixture.cjs'));
const { ReadableStream } = require('node:stream/web');
const mutationSuccess = () => ({ mutationChecks: Object.fromEntries(account.MUTATION_CHECKS.map(id => [id, 'passed'])),
  mutationEvidence: Object.fromEntries(account.MUTATION_FLAGS.map(key => [key, !['mutationUncertain', 'concurrentChangeObserved'].includes(key)])) });
async function capturedFixture(email, password) {
  const body = (value, status = 200) => ({ status, ok: status < 300, headers: { get: () => 'application/json' },
    body: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(JSON.stringify(value))); controller.close(); } }) });
  const result = await fixtureTools.captureFixture({ email, password, fetchImpl: async value => {
    const endpoint = new URL(value).pathname;
    if (endpoint === '/users/login-user') return body({ accessToken: 'access-fixture', refreshToken: 'refresh-fixture', sessionId: 'session-fixture', accessTokenExpiresIn: '15m' }, 201);
    if (endpoint === '/users/logout') return body({ message: 'ok' }, 201);
    if (endpoint === '/users/profile') return body({ nombre: 'Original SC', aPaterno: 'Prueba', aMaterno: 'Reserva', email, telefono: '5551234567' });
    if (endpoint === '/products/cart') return body({ id_carrito: 1, items: [{ id_variante: 12, id_producto: 7, nombre: 'Producto Uno', sku: 'RED',
      cantidad: 1, precio_unitario: 100, stock: 3, activo: true, atributos: { Color: 'Rojo' } }], summary: { subtotal: 100, itemCount: 1 } });
    if (endpoint === '/products/get-product-details/7') return body([{ id_producto: 7, variantes: [{ id_variante: 12, stock: 3, precio: 100, sku: 'RED', atributos: { Color: 'Rojo' } }] }]);
    throw new Error('Unexpected fixture transport');
  } });
  assert.equal(result.errorCode, 'NONE'); return result;
}
const jobsNames = ['Definir comprobaciones por evento y rama', 'Calidad previa a integración / Análisis estático y pruebas del cliente',
  'Seguridad previa a integración y APK / Dependencias y SAST CodeQL', 'Integración HTTP real y regresión de contratos',
  'Comprobar configuración de rendimiento y estrés / Inspeccionar guiones sin ejecutar carga', 'Compilar y aceptar APK candidato',
  'Rechazo nativo bajo MITM y recuperación del mismo APK', 'Resultado de integración'];
function producer() { return { id: SOURCE.producer, run_attempt: SOURCE.attempt, head_sha: SOURCE.commit, head_branch: SOURCE.tag, event: 'push',
  path: '.github/workflows/api-android.yml', repository: { full_name: SOURCE.repository }, status: 'completed', conclusion: 'success' }; }
function jobs() { return { total_count: jobsNames.length, jobs: jobsNames.map(name => ({ name, run_id: SOURCE.producer, run_attempt: SOURCE.attempt, status: 'completed', conclusion: 'success' })) }; }
function candidate() { return { buildId: SOURCE.buildId, commit: SOURCE.commit, api: SOURCE.api, sha256: SOURCE.sha256, emulatorApi: 34, maestro: '2.12.0' }; }
function inspection() { return { status: 'passed_for_static_scope', package: SOURCE.appId, checks: {
  candidate: { status: 'passed', evidence: { buildId: SOURCE.buildId, commit: SOURCE.commit, sha256: SOURCE.sha256 } },
  manifest: { status: 'passed', evidence: { applicationId: SOURCE.appId, debuggable: false } }, signature: { status: 'passed', evidence: { verified: true } } } }; }
function build() { return { id: SOURCE.buildId, platform: 'ANDROID', status: 'FINISHED', gitCommitHash: SOURCE.commit, buildProfile: 'preview',
  app: { id: SOURCE.projectId }, appIdentifier: SOURCE.appId, appVersion: '1.0.0', appBuildVersion: '1', distribution: 'INTERNAL',
  message: 'sport-center-candidate-v1:' + SOURCE.fingerprint, artifacts: { applicationArchiveUrl: 'https://expo.dev/artifacts/eas/immutable.apk' } }; }
function automation() { return { sha: 'a'.repeat(40), head: 'a'.repeat(40), ref: 'refs/tags/validation/account-rc4-v1', repository: SOURCE.repository,
  changed: 'README.md\nscripts/android-account.cjs', dirty: '' }; }
const attr = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
function ui(nodes) { return '<?xml version="1.0" encoding="UTF-8"?><hierarchy rotation="0">' + nodes.map(node => '<node ' + Object.entries({
  package: SOURCE.appId, class: 'android.widget.TextView', enabled: 'true', clickable: 'false', bounds: '[10,20][200,80]', ...node,
}).map(([key, value]) => key + '="' + attr(value) + '"').join(' ') + '/>').join('') + '</hierarchy>'; }
function junit(name = 'AC01', extras = '') { const n = name + ' private account'; return '<testsuites><testsuite tests="1" failures="0"><testcase id="' + n + '" name="' + n + '" classname="' + n + '" status="SUCCESS">' + extras + '</testcase></testsuite></testsuites>'; }
function parentFixture() { return { path: '/tmp/sportcenter-account-AbC123', confirm: () => {}, verifyMaestro: async () => {} }; }
function apiPass() { return { status: 'passed', loginHttpStatus: 201, logoutHttpStatus: 201, sessionValid: true,
  accessTokenReceived: true, logoutAttempted: true, logoutConfirmed: true, uiContinueAllowed: true, errorCode: 'NONE' }; }

test('exact approved producer attempt plus immutable APK evidence is accepted', () => assert.equal(account.verifyProducer(producer(), jobs(), candidate(), inspection()).producerVerified, true));
for (const [label, mutate] of [
  ['attempt1', run => run.run_attempt = SOURCE.attempt + 1], ['different source', run => run.head_sha = 'b'.repeat(40)], ['pending', run => run.status = 'in_progress'],
  ['failure', run => run.conclusion = 'failure'], ['other repository', run => run.repository.full_name = 'other/repo'], ['other tag', run => run.head_branch = 'develop'],
]) test('producer rejects ' + label, () => { const run = producer(); mutate(run); assert.throws(() => account.verifyProducer(run, jobs(), candidate(), inspection()), /ACCOUNT_PRODUCER/); });
for (const state of ['skipped', 'failure', 'cancelled', null]) test('producer does not accept required job ' + state, () => {
  const value = jobs(); value.jobs[0].conclusion = state; assert.throws(() => account.verifyProducer(producer(), value, candidate(), inspection()), /ACCOUNT_PRODUCER/);
});
test('producer rejects incomplete/duplicate jobs and attempt mismatch', () => {
  for (const mutate of [value => value.total_count++, value => value.jobs.push(value.jobs[0]), value => value.jobs[0].run_attempt = SOURCE.attempt + 1]) {
    const value = jobs(); mutate(value); assert.throws(() => account.verifyProducer(producer(), value, candidate(), inspection()), /ACCOUNT_PRODUCER/);
  }
});
test('artifact identity, app and release manifest cannot be substituted', () => {
  for (const mutate of [v => v.sha256 = 'b'.repeat(64), v => v.buildId = 'old-preview', v => v.commit = 'c'.repeat(40)]) {
    const v = candidate(); mutate(v); assert.throws(() => account.verifyProducer(producer(), jobs(), v, inspection()), /ACCOUNT_ARTIFACT/);
  }
  const value = inspection(); value.checks.manifest.evidence.debuggable = true;
  assert.throws(() => account.verifyProducer(producer(), jobs(), candidate(), value), /ACCOUNT_ARTIFACT/);
});
test('EAS metadata accepts only same finished preview and safe private HTTPS URL', () => assert.match(account.verifyBuild(build()), /^https:/));
for (const [key, value] of [['id', 'other'], ['status', 'IN_PROGRESS'], ['gitCommitHash', 'c'.repeat(40)], ['buildProfile', 'development'],
  ['appIdentifier', 'com.other.app'], ['message', 'latest'], ['distribution', 'STORE'], ['appBuildVersion', '2']]) {
  test('EAS rejects changed ' + key, () => { const v = build(); v[key] = value; assert.throws(() => account.verifyBuild(v), /ACCOUNT_BUILD/); });
}
for (const value of ['http://expo.dev/x.apk', 'https://user:pass@expo.dev/x.apk', 'https://expo.dev/x.aab']) test('EAS rejects URL ' + value.split(':')[0], () => {
  const v = build(); v.artifacts.applicationArchiveUrl = value; assert.throws(() => account.verifyBuild(v), /ACCOUNT_BUILD/);
});
test('account tag has independent closed source guard', () => {
  assert.equal(account.verifyAutomation(automation()).artifactSourceCommit, SOURCE.commit);
  for (const file of ['src/app/login.tsx', 'src/features/auth/context/SessionController.ts', 'app.json', 'package-lock.json', 'assets/icon.png', 'scripts/android-account-neighbor.cjs']) {
    const value = automation(); value.changed = file; assert.throws(() => account.verifyAutomation(value), /ACCOUNT_APP_TREE/);
  }
  for (const ref of ['refs/heads/develop', 'refs/tags/validation/release-rc4', 'refs/tags/candidate/android-rc4']) assert.throws(() => account.verifyAutomation({ ...automation(), ref }), /ACCOUNT_AUTOMATION/);
  assert.throws(() => account.verifyAutomation({ ...automation(), dirty: ' M README.md' }), /ACCOUNT_AUTOMATION/);
});
test('credentials preserve Unicode and shell-sensitive bytes without putting them in YAML', () => {
  const password = 'á漢字 +%s $ ` " \' &|;\\ end';
  assert.deepEqual(account.credentials({ ANDROID_TEST_EMAIL: 'Test+qa@Example.com', ANDROID_TEST_PASSWORD: password }), { email: 'test+qa@example.com', password });
  const flow = account.yaml('AC01-password', account.FLOWS.password); assert.ok(!flow.includes(password)); assert.match(flow, /\$\{MAESTRO_ACCOUNT_PASSWORD\}/);
  assert.throws(() => account.credentials({}), /ACCOUNT_SECRETS/);
  assert.throws(() => account.credentials({ ANDROID_TEST_EMAIL: 'a@b.com', ANDROID_TEST_PASSWORD: '12345678\n' }), /ACCOUNT_FIXTURE/);
});
test('UI parser decodes only safe builtin/numeric entities and keeps PII private', () => {
  const nodes = account.parsePrivateUi(ui([{ text: 'Ropa & "equipo"', 'content-desc': 'Correo', class: 'android.widget.EditText' }]));
  assert.equal(nodes[0].text, 'Ropa & "equipo"');
  const parsed = account.parsePrivateUi('<hierarchy><node package="' + SOURCE.appId + '" text="a&#64;b.com"/></hierarchy>');
  assert.equal(parsed[0].text, 'a@b.com');
});
test('UI parser accepts the exact AOSP serializer declaration with whitespace before closing PI', () => {
  const xml = ui([{ text: 'Public login' }]).replace('<?xml version="1.0" encoding="UTF-8"?>', "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>");
  assert.equal(account.parsePrivateUi(xml)[0].text, 'Public login');
  assert.throws(() => account.parsePrivateUi(xml.replace(' ?>', ' ?')), /ACCOUNT_UI_INVALID/);
  assert.throws(() => account.parsePrivateUi(xml.replace('<hierarchy', '<!DOCTYPE hierarchy><hierarchy')), /ACCOUNT_UI_INVALID/);
});
for (const text of ['<!DOCTYPE hierarchy><hierarchy/>', '<hierarchy><node/></oops>', '<hierarchy><node>', '<hierarchy><node text="&secret;"/></hierarchy>',
  '<hierarchy><node text="x" text="y"/></hierarchy>', '<wrong/>', '<hierarchy><node text="&#0;"/></hierarchy>']) {
  test('UI rejects malformed/unsafe structure', () => assert.throws(() => account.parsePrivateUi(text), /ACCOUNT_UI/));
}
test('focus targets unique enabled EditText instead of its duplicate label', () => {
  const nodes = account.parsePrivateUi(ui([{ text: 'Correo electrónico' }, { 'content-desc': 'Correo electrónico', class: 'android.widget.EditText' }]));
  assert.deepEqual(account.point(nodes, 'Correo electrónico', 'input'), [105, 50]);
  nodes.push(nodes[1]); assert.throws(() => account.point(nodes, 'Correo electrónico', 'input'), /AMBIGUOUS/);
});
test('profile validates expected account by actual editable value without report export', () => {
  const nodes = account.parsePrivateUi(ui([{ text: 'test+qa@example.com', 'content-desc': 'Correo', class: 'android.widget.EditText' }]));
  assert.equal(account.profileMatches(nodes, 'test+qa@example.com'), true); assert.equal(account.profileMatches(nodes, 'other@example.com'), false);
});
test('empty and unavailable cart are never silently populated', () => {
  assert.equal(account.fixtureStatus(account.parsePrivateUi(ui([{ text: 'Tu carrito está vacío' }]))), 'empty');
  assert.equal(account.fixtureStatus(account.parsePrivateUi(ui([{ text: 'Revisa las existencias (0 disponibles).' }]))), 'stock');
  assert.equal(account.fixtureStatus(account.parsePrivateUi(ui([{ text: 'Subtotal' }]))), 'ready');
  const flows = Object.values(account.FLOWS).join('\n');
  for (const forbidden of ['Agregar al carrito', 'Eliminar', 'Guardar cambios', 'Aplicar cupón', 'Crear cuenta', 'Olvidé mi contraseña', 'Solicitar eliminación']) assert.ok(!flows.includes(forbidden));
  assert.match(account.FLOWS.summary, /assertVisible: "\^Continuar a Mercado Pago\$"/); assert.doesNotMatch(account.FLOWS.summary, /tapOn: "\^Continuar a Mercado Pago/);
});
test('session restore and postlogout do not clear state', () => {
  assert.doesNotMatch(account.FLOWS.restored + account.FLOWS.guest, /clearState|inputText/);
  assert.match(account.FLOWS.navigate, /clearState: true/);
});
test('JUnit requires exactly one successful expected flow', () => assert.doesNotThrow(() => account.verifyJUnit(junit(), 'AC01', xmlTree)));
for (const [label, text] of [['truncated', junit().slice(0, -5)], ['wrongroot', junit().replaceAll('testsuites', 'wrong')],
  ['counts', junit().replace('tests="1"', 'tests="2"')], ['failurecounter', junit().replace('failures="0"', 'failures="1"')],
  ['status', junit().replace('SUCCESS', 'FAILED')], ['skip', junit('AC01', '<skipped/>')], ['failure', junit('AC01', '<failure/>')],
  ['wrongcase', junit('AC02')], ['DTD', '<!DOCTYPE testsuites>' + junit()]]) test('JUnit rejects ' + label, () => assert.throws(() => account.verifyJUnit(text, 'AC01', xmlTree), /ACCOUNT_JUNIT/));
test('public report drops arbitrary secret/error/UI fields and never upgrades partial to PASS', () => {
  const secret = 'never-publish@example.com';
  const state = { status: 'passed', email: secret, raw: secret, cases: { AC01: 'passed' }, errors: [new Error(secret)], cleanup: { device: true, sandbox: true, localSession: true } };
  const report = account.publicReport(state); assert.equal(report.status, 'failed'); assert.ok(!JSON.stringify(report).includes(secret));
  assert.deepEqual(report.failureCodes, ['ACCOUNT_UNEXPECTED_FAILURE']); assert.equal(report.cleanup.serverRevocation, 'not-independently-observed');
});
test('all seven historical controls, four read-only checks and cleanup gates are mandatory', () => {
  const state = { status: 'passed', cases: Object.fromEntries(account.CASES.map(id => [id, 'passed'])),
    readOnlyChecks: Object.fromEntries(account.READ_ONLY_CHECKS.map(id => [id, 'passed'])), ...mutationSuccess(), orderListState: 'empty', errors: [], cleanup: { device: true, sandbox: true, localSession: true, fixtureRestoration: true } };
  assert.equal(account.publicReport(state).status, 'passed');
  for (const key of Object.keys(state.cleanup)) assert.equal(account.publicReport({ ...state, cleanup: { ...state.cleanup, [key]: false } }).status, 'failed');
  for (const id of account.READ_ONLY_CHECKS) assert.equal(account.publicReport({ ...state, readOnlyChecks: { ...state.readOnlyChecks, [id]: 'not_run' } }).status, 'failed');
  assert.equal(account.publicReport({ ...state, orderListState: null }).status, 'failed');
  assert.equal(account.publicReport({ ...state, readOnlyChecks: undefined }).status, 'failed');
  for (const id of account.MUTATION_CHECKS) assert.equal(account.publicReport({ ...state, mutationChecks: { ...state.mutationChecks, [id]: 'not_run' } }).status, 'failed');
  assert.equal(account.publicReport({ ...state, mutationEvidence: { ...state.mutationEvidence, mutationUncertain: true } }).status, 'failed');
});
test('known fixed errors survive sanitization but error messages never do', () => {
  assert.equal(account.safeCode(new AccountError('ACCOUNT_FIXTURE_EMPTY')), 'ACCOUNT_FIXTURE_EMPTY');
  assert.equal(account.safeCode({ code: 'raw-password', message: 'private' }), 'ACCOUNT_UNEXPECTED_FAILURE');
});
test('report emits only fixed stages and never arbitrary private stage text', () => {
  assert.equal(account.publicReport({ stage: 'AC01-password' }).stage, 'AC01-password');
  const value = account.publicReport({ stage: 'private-person@example.com' }); assert.equal(value.stage, 'unknown');
  assert.ok(!JSON.stringify(value).includes('private-person'));
  const diagnostic = account.publicReport({ sandboxDiagnostic: { sandboxCode: 'private-person@example.com', cleanupCode: null, cleanupConfirmed: true } });
  assert.equal(diagnostic.sandboxDiagnostic, null); assert.ok(!JSON.stringify(diagnostic).includes('private-person'));
});

async function runtime(config = {}) {
  const calls = [], flows = [], files = new Map(); let installed = false, authenticated = false, stage = 'login', cleaned = false,
    typedEmail = '', typedPassword = '', passwordVisible = false, apiCalls = 0, parentCalls = 0, clock = 0, restoreCalls = 0,
    profileName = 'Original SC', draftName = 'Original SC', savedName = false, cartQty = 1, productQty = 1, selected = false, processRunning = false, restoredState = null,
    profileVisible = 'email';
  const email = 'private+fixture@example.com', password = 'Private *&%s 漢字', sha = 'a'.repeat(40);
  const captured = config.apiReport ? { authReport: config.apiReport, fixture: null, errorCode: config.apiReport.logoutConfirmed ? 'FIXTURE_AUTH_FAILED' : 'FIXTURE_AUTH_CLEANUP_FAILED' } : await capturedFixture(email, password);
  const nodes = () => {
    if (stage === 'profile') return [
      { text: config.wrongProfile ? 'other@example.com' : email, 'content-desc': 'Correo', class: 'android.widget.EditText', bounds: '[10,120][200,180]' },
      { text: config.changedPreimage ? 'Concurrent name' : draftName, 'content-desc': 'Nombre', class: 'android.widget.EditText', bounds: '[10,20][200,80]' },
      { text: 'Prueba', 'content-desc': 'Apellido paterno', class: 'android.widget.EditText', bounds: '[10,90][200,110]' },
      { text: 'Reserva', 'content-desc': 'Apellido materno', class: 'android.widget.EditText', bounds: '[10,190][200,210]' },
      { text: '5551234567', 'content-desc': 'Teléfono', class: 'android.widget.EditText', bounds: '[10,285][200,305]' },
      { text: 'Guardar cambios', clickable: 'true', bounds: '[10,320][200,380]' },
      ...(savedName ? [{ text: 'Tu perfil se actualizó correctamente.' }] : []),
    ].map(node => {
      if (!config.profileViewport || !['Nombre', 'Apellido paterno', 'Apellido materno', 'Correo', 'Teléfono', 'Guardar cambios'].includes(node['content-desc'] || node.text)) return node;
      const control = Object.entries(account.PROFILE_CONTROLS).find(([, value]) => value.label === (node['content-desc'] || node.text));
      return control && control[0] === profileVisible && config.unmeasuredProfileField !== control[0] ? node : { ...node, bounds: '[0,0][0,0]' };
    }).concat(config.unmeasuredProfileField ? [{ text: account.PROFILE_CONTROLS[config.unmeasuredProfileField].label }] : []);
    if (stage === 'cart') return [{ text: 'Tu carrito' }, ...(config.empty || cartQty === 0 ? [{ text: 'Tu carrito está vacío' }] : [
      { text: 'Subtotal' }, { text: cartQty + ' artículos' }, { text: String(cartQty), 'content-desc': 'Cantidad de Producto Uno: ' + cartQty, bounds: '[10,120][200,180]' },
      { text: 'Agregar una unidad de Producto Uno', clickable: 'true', bounds: '[250,120][400,180]' },
      { text: 'Restar una unidad de Producto Uno', clickable: 'true', bounds: '[10,220][200,280]' },
      { text: 'Eliminar Producto Uno', clickable: 'true', bounds: '[10,320][200,380]' },
    ])];
    if (stage === 'product') return [
      { text: 'Color: Rojo', clickable: 'true', checked: String(selected), bounds: '[10,20][200,80]' },
      ...(config.ambiguousVariant ? [{ text: 'Color: Rojo', clickable: 'true', checked: 'false', bounds: '[220,20][400,80]' }] : []),
      { text: 'SKU: RED' }, { text: config.changedPrice ? '$101.00' : '$100.00' }, { text: '3 disponibles' },
      { text: 'Restar cantidad', clickable: 'true', bounds: '[10,220][60,280]' },
      { text: 'Sumar cantidad', clickable: 'true', bounds: '[160,220][210,280]' },
      { text: String(productQty), bounds: '[85,230][135,270]' },
      { text: 'Agregar al carrito', clickable: 'true', bounds: '[10,320][200,380]' },
      ...(config.added ? [{ text: 'Agregado al carrito.' }] : []),
    ];
    if (stage === 'account') return [{ text: 'Mi cuenta' }, { text: 'Has iniciado sesión en Sport Center.' }, { text: 'Cerrar sesión', clickable: 'true' }];
    if (stage === 'guest') return [{ text: 'Tu cuenta Sport Center' }];
    if (stage === 'orders') return config.ordersError ? [{ text: 'No se pudo cargar' }] : config.ordersLoading ? [{ text: 'Cargando información' }] : [
      { text: 'Mis pedidos' }, { text: 'Aquí aparecen tus pedidos que ya no están pendientes de pago.' }, { text: 'Actualizar pedidos', clickable: 'true' },
      config.ordersList ? { 'content-desc': 'Ver pedido 1987654321', clickable: 'true' } : { text: 'Aún no tienes pedidos registrados en esta lista.' },
    ];
    if (stage === 'profile-guard') return config.exposedProfile ? [{ text: 'Actualiza tus datos personales y de contacto.' }, { text: 'Guardar cambios' }] : [
      { text: 'Accede a tu cuenta de Sport Center.' }, { text: 'Iniciar sesión', clickable: 'true' },
    ];
    if (stage === 'checkout-guard') return config.exposedCheckout ? [{ text: 'Dirección de envío' }, { text: 'Subtotal' }] : [
      { text: 'Inicia sesión para continuar' }, { text: 'Iniciar sesión', clickable: 'true' },
    ];
    if (stage === 'privacy') return [{ text: config.inaccessiblePrivacy ? 'No se pudo cargar' : 'Datos y sesión en este dispositivo' }];
    return [{ 'content-desc': 'Correo electrónico', text: typedEmail, class: 'android.widget.EditText', bounds: '[10,20][200,80]' },
      { 'content-desc': 'Contraseña', text: passwordVisible ? typedPassword : '••••', password: passwordVisible ? 'false' : 'true', class: 'android.widget.EditText', bounds: '[10,120][200,180]' },
      { 'content-desc': passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña', clickable: 'true', bounds: '[250,120][400,180]' },
      { 'content-desc': 'Iniciar sesión', clickable: 'true', bounds: '[10,220][200,280]' },
      ...(config.rejectLoginUI ? [{ text: 'Accede a tu cuenta de Sport Center.' }, { text: 'El correo o la contraseña no son correctos. Revisa tus datos.' }] : [])];
  };
  const run = async (file, args) => {
    calls.push({ file, args }); assert.equal(file, 'adb');
    if (args[0] === 'devices') return { stdout: 'List of devices attached\nemulator-5554\tdevice\n' };
    const a = args.slice(2), key = a.join(' ');
    if (key.startsWith('shell am start')) processRunning = true;
    let stdout = '';
    if (key.includes('ro.build.version.sdk')) stdout = '34';
    else if (key.includes('ro.product.cpu.abi')) stdout = 'x86_64';
    else if (key === 'shell wm size') stdout = 'Physical size: 1080x1920';
    else if (key === 'shell ps -A -o NAME') stdout = 'NAME\n' + (config.runningAfterStop ? SOURCE.appId : '');
    else if (key.startsWith('shell pm list packages')) stdout = installed ? 'package:' + SOURCE.appId : '';
    else if (a[0] === 'install') { installed = true; processRunning = true; }
    else if (a[0] === 'uninstall') installed = false;
    else if (key.startsWith('exec-out cat')) stdout = ui(nodes());
    else if (key.startsWith('shell am force-stop')) {
      processRunning = false;
      if (config.lostProfilePersist) profileName = 'Original SC';
      else if (config.lostOriginalPersist && profileName === 'Original SC') profileName = 'Prueba SC';
    }
    else if (key.startsWith('shell input tap') && stage === 'profile' && a.at(-1) === '350') { profileName = draftName; savedName = !config.saveUnconfirmed; }
    else if (key.startsWith('shell input tap') && stage === 'cart') {
      if (a.at(-1) === '150') { if (!config.failIncrement) cartQty++; }
      else if (a.at(-1) === '250') cartQty--;
      else if (a.at(-1) === '350') cartQty = 0;
    }
    else if (key.startsWith('shell input tap') && stage === 'product') {
      if (a.at(-1) === '50') selected = true;
      else if (a.at(-2) === '185') productQty++;
      else if (a.at(-1) === '350') { if (!config.failAdd) { cartQty += productQty; config.added = true; } }
    }
    else if (key.startsWith('shell input tap') && a.at(-2) === '325' && a.at(-1) === '150') passwordVisible = !passwordVisible;
    else if (key.startsWith('shell input tap') && a.at(-1) === '250') { authenticated = !config.rejectLoginUI; stage = authenticated ? 'account' : 'login'; }
    else if (key.includes('sportcentermobile://account')) stage = authenticated ? 'account' : 'guest';
    else if (key.includes('sportcentermobile://orders')) stage = 'orders';
    else if (key.includes('sportcentermobile://profile')) stage = 'profile-guard';
    else if (key.includes('sportcentermobile://checkout')) stage = 'checkout-guard';
    else if (key.includes('sportcentermobile://privacy')) stage = 'privacy';
    else if (key.includes('sportcentermobile://cart')) stage = authenticated ? 'cart' : 'guest';
    else if (key.includes('sportcentermobile://product/7')) { stage = 'product'; productQty = 1; selected = false; config.added = false; }
    return { stdout };
  };
  const create = async options => {
    assert.ok(!Object.hasOwn(options, 'run'), 'sandbox must retain capturedRun, not the strict ADB/Git executor');
    assert.equal(options.runnerTemp, '/tmp/sportcenter-account-AbC123');
    if (config.failSetupCleanup) { const error = new Error('private setup data'); error.code = 'SANDBOX_SETUP_CLEANUP_FAILED'; throw error; }
    return { root: '/private/root',
    createPrivateFile: async (name, body) => {
      if (config.failWrite) throw new SandboxError('PRIVATE_FILE_WRITE_FAILED');
      files.set('/private/root/' + name, body); return '/private/root/' + name;
    },
    runMaestro: async (_serial, argv, options) => {
      const flowPath = argv.at(-1), body = files.get(flowPath), name = body.match(/\nname: ([^\n]+) private account\n/)[1];
      flows.push({ name, body, env: options.secretEnv, argv });
      const keys = Object.keys(options.secretEnv);
      assert.ok(keys.every(key => ['MAESTRO_ACCOUNT_EMAIL', 'MAESTRO_ACCOUNT_PASSWORD', 'MAESTRO_ACCOUNT_FIELD_VALUE'].includes(key)));
      assert.ok(!argv.some(arg => arg.includes(email) || arg.includes(password)));
      if (name === 'AC01-navigate') stage = 'login';
      else if (name === 'AC01-email') typedEmail = email;
      else if (name === 'AC01-password') typedPassword = config.corruptInput ? 'changed' : password;
      else if (name === 'AC02') stage = 'profile';
      else if (name === 'AC03') stage = 'cart';
      else if (name === 'AC05') { assert.equal(authenticated, true); stage = 'account'; }
      else if (name === 'AC06' || name === 'cleanup') { authenticated = false; stage = 'guest'; }
      else if (name === 'AC07') { assert.equal(authenticated, false); stage = 'guest'; }
      else if (name === 'MU02' || name === 'MU03') {
        if (body.includes('tapOn: "^Cuenta$"')) { assert.equal(authenticated, true); stage = 'account'; }
        else if (body.includes('tapOn: "^Mi perfil$"')) { stage = 'profile'; draftName = profileName; savedName = false; }
      }
      if (Object.hasOwn(options.secretEnv, 'MAESTRO_ACCOUNT_FIELD_VALUE')) draftName = config.corruptMutationInput ? 'different' : options.secretEnv.MAESTRO_ACCOUNT_FIELD_VALUE;
      if (stage === 'profile' && body.includes('scrollUntilVisible:') && body.includes('direction:')) {
        const control = Object.entries(account.PROFILE_CONTROLS).find(([, value]) => body.includes('text: ' + JSON.stringify('^' + value.label + '$')));
        assert.ok(control); assert.ok(body.includes('direction: ' + control[1].direction)); assert.ok(body.includes('centerElement: true'));
        profileVisible = control[0];
      }
      const output = argv[argv.indexOf('--output') + 1]; files.set(output, junit(name));
      return { exitCode: config.failPhase === name || config.rejectLoginUI && name === 'AC01' || config.failProfileScroll && body.includes('direction:') ? 1 : 0, stdout: password, stderr: email };
    },
    readPrivateFile: async name => files.get('/private/root/' + name),
    cleanup: async () => { cleaned = true; if (config.failCleanup) throw new Error(password); },
    };
  };
  const result = await account.runAcceptance({ env: { ACCOUNT_UNIT_TEST: true, GITHUB_RUN_ID: '123', GITHUB_SHA: sha, RUNNER_TEMP: '/tmp',
    ANDROID_TEST_EMAIL: email, ANDROID_TEST_PASSWORD: password }, context: { artifactSourceCommit: SOURCE.commit, automationCommit: sha,
    producerVerified: true, producerRun: SOURCE.producer, producerAttempt: SOURCE.attempt, apkSha256: SOURCE.sha256, parentInspectionVerified: true },
    apk: '/private/candidate.apk', hash: async () => SOURCE.sha256, run, create,
    capture: async value => { assert.deepEqual(value, { email, password }); apiCalls++; return captured; },
    restore: async value => {
      restoreCalls++; assert.equal(value.fixture, captured.fixture); assert.equal(authenticated, false); assert.equal(processRunning, false); assert.equal(value.uiStopped, true);
      restoredState = value.mutationState;
      const uncertain = !!config.failAdd, conflict = !!config.restoreConflict;
      if (!uncertain && !conflict) { profileName = 'Original SC'; cartQty = 1; }
      return { authReport: apiPass(), restoration: { profileRestored: true, cartRestored: !uncertain && !conflict,
        otherProfileFieldsUnchanged: true, otherCartLinesUnchanged: !conflict, baselineRestored: !uncertain && !conflict,
        mutationUncertain: uncertain, concurrentChangeObserved: conflict }, errorCode: uncertain ? 'FIXTURE_MUTATION_UNCERTAIN' : conflict ? 'FIXTURE_CONFLICT' : 'NONE' };
    },
    parent: () => { parentCalls++; return parentFixture(); }, xmlTree, now: () => clock, wait: async duration => { clock += duration; } });
  assert.ok([email, password, 'Original SC', 'Producto Uno', 'Color: Rojo'].every(value => !JSON.stringify(result).includes(value)));
  return { result, calls, flows, cleaned, installed, authenticated, apiCalls, parentCalls, passwordVisible, restoreCalls, profileName, cartQty, restoredState };
}
test('runtime uses one login, preserves state for cold restore, and removes only its installed app', async () => {
  const value = await runtime(); assert.equal(value.result.status, 'passed'); assert.equal(value.cleaned, true);
  assert.equal(value.installed, false); assert.equal(value.authenticated, false);
  assert.equal(value.flows.filter(item => item.name === 'AC01-password').length, 1);
  assert.equal(value.flows.filter(item => Object.keys(item.env).length).length, 4);
  assert.ok(value.calls.every(item => !item.args.includes('clear') && !item.args.includes('curl')));
  assert.equal(value.calls.filter(item => item.args[2] === 'install').length, 1);
  assert.equal(value.calls.filter(item => item.args.join(' ').includes('am force-stop')).length, 7);
  assert.equal(value.apiCalls, 1); assert.deepEqual(value.result.inputObservation, { emailMatches: true, passwordMatches: true, passwordHidden: true });
  assert.ok(value.result.cases.every(item => item.status === 'passed'));
  assert.ok(value.result.readOnlyChecks.every(item => item.status === 'passed')); assert.equal(value.result.orderListState, 'empty');
  assert.ok(value.result.mutationChecks.every(item => item.status === 'passed')); assert.equal(value.restoreCalls, 1);
  assert.equal(value.result.cleanup.fixtureRestoration, true); assert.equal(value.profileName, 'Original SC'); assert.equal(value.cartQty, 1);
});
test('a real orders list is read without opening its identifier or publishing it', async () => {
  const value = await runtime({ ordersList: true }); assert.equal(value.result.status, 'passed'); assert.equal(value.result.orderListState, 'list');
  assert.ok(!JSON.stringify(value.result).includes('1987654321'));
  const routes = value.calls.filter(item => item.args.includes('android.intent.action.VIEW'));
  assert.ok(routes.every(item => !item.args.some(arg => /orders\/\d/.test(arg))));
  for (const route of Object.values(account.READ_ONLY_URLS)) {
    const found = routes.find(item => item.args.includes(route)); assert.ok(found, 'all fixed read-only routes are observed');
    assert.ok(found.args.includes(SOURCE.appId + '/.MainActivity'));
  }
  assert.ok(routes.every(item => !item.args.some(arg => /checkout-status|reviews|contact/.test(arg))));
});
test('orders errors and loading never become a passed list and fail-first still logs out and cleans', async () => {
  for (const config of [{ ordersError: true }, { ordersLoading: true }]) {
    const value = await runtime(config); assert.equal(value.result.status, 'failed'); assert.equal(value.result.stage, 'RO01-orders');
    assert.equal(value.result.readOnlyChecks[0].status, 'failed'); assert.equal(value.result.orderListState, null);
    assert.equal(value.result.cases.find(item => item.id === 'AC05').status, 'passed');
    assert.equal(value.result.cases.find(item => item.id === 'AC06').status, 'not_run');
    assert.ok(value.result.readOnlyChecks.slice(1).every(item => item.status === 'not_run'));
    assert.equal(value.authenticated, false); assert.equal(value.cleaned, true); assert.ok(Object.values(value.result.cleanup).slice(0, 3).every(Boolean));
  }
});
test('visible private profile or checkout after logout fails its required guard even with a guest heading', async () => {
  for (const [config, id] of [[{ exposedProfile: true }, 'RO02'], [{ exposedCheckout: true }, 'RO03']]) {
    const value = await runtime(config); assert.equal(value.result.status, 'failed'); assert.ok(value.result.cases.every(item => item.status === 'passed'));
    assert.equal(value.result.readOnlyChecks.find(item => item.id === id).status, 'failed');
    assert.deepEqual(value.result.failureCodes, ['ACCOUNT_GUEST_GUARD_FAILED']); assert.equal(value.result.readOnlyChecks.at(-1).status, 'not_run');
    assert.equal(value.cleaned, true); assert.equal(value.authenticated, false);
  }
});
test('privacy is required: a successful tool exit with inaccessible content still fails', async () => {
  const value = await runtime({ inaccessiblePrivacy: true }); assert.equal(value.result.status, 'failed'); assert.equal(value.result.stage, 'RO04-privacy');
  assert.equal(value.result.readOnlyChecks.at(-1).status, 'failed'); assert.deepEqual(value.result.failureCodes, ['ACCOUNT_PRIVACY_READ_FAILED']);
  assert.equal(value.cleaned, true); assert.equal(value.installed, false); assert.equal(value.authenticated, false);
});
test('read-only classifiers require real owned content, consistent orders state and no protected content', () => {
  const header = [{ text: 'Mis pedidos' }, { text: 'Aquí aparecen tus pedidos que ya no están pendientes de pago.' }, { text: 'Actualizar pedidos' }];
  const empty = { text: 'Aún no tienes pedidos registrados en esta lista.' }, row = { 'content-desc': 'Ver pedido 17', clickable: 'true' };
  const parse = items => account.parsePrivateUi(ui(items));
  assert.equal(account.orderListStatus(parse([...header, empty])), 'empty');
  assert.equal(account.orderListStatus(parse([...header, row])), 'list');
  assert.equal(account.orderListStatus(parse([...header, empty, row])), 'error');
  assert.equal(account.orderListStatus(parse([...header, row, { text: 'Cargando información' }])), 'loading');
  assert.equal(account.orderListStatus(parse([...header, row, { text: 'No se pudo cargar' }])), 'error');
  assert.equal(account.orderListStatus(parse([row])), 'loading');
  assert.equal(account.orderListStatus(parse([...header, { ...row, package: 'other.app' }])), 'loading');
  const login = [{ text: 'Accede a tu cuenta de Sport Center.' }, { text: 'Iniciar sesión' }];
  assert.equal(account.guestGuardStatus(parse(login), 'profile'), 'ready');
  assert.equal(account.guestGuardStatus(parse([...login, { text: 'Guardar cambios' }]), 'profile'), 'private');
  assert.equal(account.guestGuardStatus(parse([{ text: 'Inicia sesión para continuar' }, { text: 'Iniciar sesión' }, { text: 'Subtotal' }]), 'checkout'), 'private');
  assert.equal(account.guestGuardStatus(parse([{ text: 'Iniciar sesión' }]), 'profile'), 'loading');
  assert.equal(account.privacyVisible(parse([{ text: 'Datos y sesión en este dispositivo', package: 'other.app' }])), false);
});
test('read-only public report rejects arbitrary states, foreign IDs and private strings', () => {
  const report = account.publicReport({ status: 'passed', readOnlyChecks: { RO01: 'passed', RO02: 'private@example.com', SECRET: 'passed' },
    orderListState: 'Pedido #1987654321 private@example.com' });
  assert.equal(report.status, 'failed'); assert.equal(report.orderListState, null);
  assert.deepEqual(report.readOnlyChecks, [{ id: 'RO01', status: 'passed' }, { id: 'RO02', status: 'not_run' }, { id: 'RO03', status: 'not_run' }, { id: 'RO04', status: 'not_run' }]);
  assert.ok(!JSON.stringify(report).includes('private@example.com') && !JSON.stringify(report).includes('1987654321'));
});
test('corrupted typed password is hidden again and prevents the single UI submit', async () => {
  const value = await runtime({ corruptInput: true });
  assert.equal(value.result.stage, 'AC01-input-check'); assert.equal(value.result.status, 'failed');
  assert.deepEqual(value.result.inputObservation, { emailMatches: true, passwordMatches: false, passwordHidden: true });
  assert.ok(value.result.failureCodes.includes('ACCOUNT_INPUT_MISMATCH')); assert.equal(value.passwordVisible, false);
  assert.equal(value.calls.filter(item => item.args.slice(-2).join(' ') === '105 250').length, 0);
});
test('server-rejected fixture is blocked before sandbox, app install or UI', async () => {
  const value = await runtime({ apiReport: { status: 'blocked', loginHttpStatus: 400, logoutHttpStatus: null,
    sessionValid: false, accessTokenReceived: false, logoutAttempted: false, logoutConfirmed: false, uiContinueAllowed: false, errorCode: 'CREDENTIALS_REJECTED' } });
  assert.equal(value.result.status, 'blocked'); assert.equal(value.result.stage, 'api-auth-probe');
  assert.equal(value.result.cases[0].status, 'blocked'); assert.equal(value.parentCalls, 0); assert.equal(value.flows.length, 0);
  assert.equal(value.calls.filter(item => item.args[2] === 'install').length, 0); assert.equal(value.result.cleanup.sandbox, true);
  assert.equal(value.result.apiContract.errorCode, 'CREDENTIALS_REJECTED');
});
test('API session without confirmed logout prevents UI and fails cleanup', async () => {
  const value = await runtime({ apiReport: { ...apiPass(), status: 'failed', logoutHttpStatus: 500,
    logoutConfirmed: false, uiContinueAllowed: false, errorCode: 'LOGOUT_HTTP_FAILED' } });
  assert.equal(value.result.status, 'failed'); assert.equal(value.parentCalls, 0); assert.equal(value.flows.length, 0);
  assert.equal(value.result.cleanup.localSession, false); assert.ok(value.result.failureCodes.includes('ACCOUNT_API_AUTH_CLEANUP_FAILED'));
});
test('failed login snapshots fixed UI diagnosis before finally changes the route', async () => {
  const value = await runtime({ rejectLoginUI: true });
  assert.equal(value.result.stage, 'AC01-await-account');
  assert.deepEqual(value.result.loginUi, { observed: true, hasLogin: true, hasAccount: false, busy: false, errorCodes: ['CREDENTIALS_REJECTED'] });
  assert.equal(value.result.cleanup.localSession, true); assert.equal(value.passwordVisible, false);
});
test('UI classifier ignores all unknown personal text and report refuses arbitrary payload fields', () => {
  const nodes = account.parsePrivateUi(ui([{ text: 'Accede a tu cuenta de Sport Center.' }, { text: 'personal@example.com private-pass' },
    { text: 'Has realizado demasiados intentos. Espera un minuto antes de volver a intentarlo.' }, { text: 'Ingresando…' }]));
  const value = account.classifyLoginUi(nodes);
  assert.deepEqual(value, { observed: true, hasLogin: true, hasAccount: false, busy: true, errorCodes: ['RATE_LIMITED'] });
  assert.ok(!JSON.stringify(value).includes('personal'));
  const report = account.publicReport({ loginUi: { ...value, extra: 'personal@example.com' }, inputObservation: { emailMatches: 'personal@example.com' }, apiContract: { email: 'personal@example.com' } });
  assert.equal(report.loginUi, null); assert.equal(report.inputObservation, null); assert.equal(report.apiContract, null);
  assert.ok(!JSON.stringify(report).includes('personal'));
});
test('empty fixture remains blocked with no add/delete and still signs out/cleans', async () => {
  const value = await runtime({ empty: true }); assert.equal(value.result.status, 'blocked');
  assert.deepEqual(value.result.failureCodes, ['ACCOUNT_FIXTURE_EMPTY']); assert.equal(value.result.cases.find(item => item.id === 'AC04').status, 'not_run');
  assert.equal(value.cleaned, true); assert.equal(value.authenticated, false);
  assert.ok(value.calls.every(item => !item.args.some(arg => /cart\/items|checkout\/confirm/.test(arg))));
});
test('private phase failure is never hidden and cleanup still runs', async () => {
  const value = await runtime({ failPhase: 'AC04' }); assert.equal(value.result.status, 'failed'); assert.equal(value.cleaned, true);
  assert.equal(value.result.cases.find(item => item.id === 'AC04').status, 'failed');
  assert.equal(value.result.cases.find(item => item.id === 'AC05').status, 'not_run');
  assert.equal(value.authenticated, false); assert.equal(value.installed, false);
});
test('cleanup failure prevents a passing account result', async () => {
  const value = await runtime({ failCleanup: true }); assert.equal(value.result.status, 'failed');
  assert.ok(value.result.failureCodes.includes('ACCOUNT_SANDBOX_CLEANUP_FAILED')); assert.equal(value.result.cleanup.sandbox, false);
});
test('trusted runtime file-write failure retains a whitelisted cause and confirmed cleanup', async () => {
  const value = await runtime({ failWrite: true });
  assert.equal(value.result.status, 'failed'); assert.equal(value.result.stage, 'AC01-navigate');
  assert.deepEqual(value.result.failureCodes, ['ACCOUNT_SANDBOX_FAILED']);
  assert.deepEqual(value.result.sandboxDiagnostic, { sandboxCode: 'PRIVATE_FILE_WRITE_FAILED', cleanupCode: null, cleanupConfirmed: true });
  assert.equal(value.result.cleanup.sandbox, true); assert.equal(value.cleaned, true);
  assert.equal(account.safeCode({ code: 'PRIVATE_FILE_WRITE_FAILED' }), 'ACCOUNT_UNEXPECTED_FAILURE');
});
test('setup factory cleanup failure remains explicitly unconfirmed without a sandbox instance', async () => {
  const value = await runtime({ failSetupCleanup: true });
  assert.equal(value.result.status, 'failed'); assert.equal(value.result.stage, 'sandbox-probes');
  assert.equal(value.result.cleanup.sandbox, false);
  assert.deepEqual(value.result.failureCodes, ['ACCOUNT_SANDBOX_CLEANUP_FAILED']);
  assert.equal(value.flows.length, 0); assert.equal(value.installed, false);
  assert.ok(!JSON.stringify(value.result).includes('private setup data'));
});
test('credential-free probe starts only the ADB server and records coded proof after cleanup', async () => {
  const calls = [], writes = [], reports = [];
  const context = { artifactSourceCommit: SOURCE.commit, automationCommit: 'a'.repeat(40), producerVerified: true,
    producerRun: SOURCE.producer, producerAttempt: SOURCE.attempt, apkSha256: SOURCE.sha256, parentInspectionVerified: true };
  await account.probe({ RUNNER_TEMP: '/tmp', GITHUB_RUN_ID: '123', GITHUB_SHA: 'a'.repeat(40) }, {
    parent: parentFixture,
    readSource: () => context, writeSource: (file, value) => writes.push({ file, value }), writeReport: (...args) => reports.push(args),
    run: async (file, args) => { calls.push({ file, args }); return { stdout: '' }; },
    create: async options => { assert.ok(!Object.hasOwn(options, 'run')); assert.equal(options.runnerTemp, '/tmp/sportcenter-account-AbC123'); return {
      probes: { ipv4RejectedWithCounter: true, adbLoopbackReachable: true }, runAs: async (args, secretEnv) => {
        assert.deepEqual(args, ['maestro', '--version']); assert.deepEqual(secretEnv, {});
        return { exitCode: 0, timedOut: false, stdout: 'Public fixed banner\n\n2.12.0\n' };
      }, createPrivateFile: async () => {}, readPrivateFile: async () => account.PREFLIGHT_FILE,
      cleanup: async () => calls.push({ cleanup: true }) }; },
  });
  assert.deepEqual(calls, [{ file: 'adb', args: ['start-server'] }, { cleanup: true }]);
  assert.equal(writes.length, 1); assert.equal(writes[0].value.sandboxPreflight.cleanupConfirmed, true); assert.equal(reports.length, 0);
  assert.equal(writes[0].value.sandboxPreflight.maestroVersionVerified, true);
  assert.equal(writes[0].value.sandboxPreflight.privateFileRoundtripVerified, true);
});
test('probe refuses credentials and never starts an emulator or account on failure', async () => {
  for (const key of ['ANDROID_TEST_EMAIL', 'ANDROID_TEST_PASSWORD', 'EXPO_TOKEN', 'GITHUB_TOKEN']) {
    await assert.rejects(account.probe({ RUNNER_TEMP: '/tmp', [key]: 'private-secret' }), /ACCOUNT_AUTOMATION_SCOPE/);
  }
  const reports = [], calls = [];
  await assert.rejects(account.probe({ RUNNER_TEMP: '/tmp', GITHUB_RUN_ID: '123', GITHUB_SHA: 'a'.repeat(40) }, {
    parent: parentFixture,
    readSource: () => ({ artifactSourceCommit: SOURCE.commit, automationCommit: 'a'.repeat(40), producerVerified: true,
      producerRun: SOURCE.producer, producerAttempt: SOURCE.attempt, apkSha256: SOURCE.sha256, parentInspectionVerified: true }),
    run: async (file, args) => { calls.push({ file, args }); return { stdout: '' }; },
    create: async () => { throw Object.assign(new Error('private-person@example.com'), { code: 'private-password' }); },
    writeSource: () => assert.fail('cannot approve source proof on failed setup'), writeReport: (file, value) => reports.push(value),
  }), /ACCOUNT_SANDBOX_CLEANUP_FAILED/);
  assert.deepEqual(calls, [{ file: 'adb', args: ['start-server'] }]); assert.equal(reports.length, 1);
  assert.ok(reports[0].cases.every(item => item.status === 'not_run')); assert.equal(reports[0].cleanup.sandbox, false);
  assert.ok(!JSON.stringify(reports).includes('private-person') && !JSON.stringify(reports).includes('private-password'));
});
test('dedicated parent proof requires exact /tmp identity, owner and 0711 without accepting neighbors', () => {
  const proof = { version: 1, path: '/tmp/sportcenter-account-AbC123', device: '1', inode: '2', uid: 1001, mode: '711', cleanupConfirmed: true };
  const actual = { directory: true, symlink: false, canonical: proof.path, tmpCanonical: '/tmp', uid: 1001, callerUid: 1001, device: '1', inode: '2', mode: '711' };
  assert.equal(account.validateParentProof(proof, actual, proof.path), proof.path);
  for (const [key, value] of [['directory', false], ['symlink', true], ['canonical', '/tmp/elsewhere'], ['tmpCanonical', '/private/tmp'],
    ['uid', 999], ['callerUid', 999], ['device', '3'], ['inode', '3'], ['mode', '700']]) {
    assert.throws(() => account.validateParentProof(proof, { ...actual, [key]: value }, proof.path), /ACCOUNT_SANDBOX_PARENT_INVALID/);
  }
  for (const value of ['/tmp', '/tmp/sportcenter-account-AbC123/child', '/tmp/sportcenter-account-AbC123-other', '/home/runner/work/_temp']) {
    assert.throws(() => account.validateParentProof({ ...proof, path: value }, { ...actual, canonical: value }, value), /ACCOUNT_SANDBOX_PARENT_INVALID/);
  }
  assert.throws(() => account.validateParentProof(proof, actual, '/tmp/sportcenter-account-ZzZ999'), /ACCOUNT_SANDBOX_PARENT_INVALID/);
  assert.throws(() => account.assertParentCleanup({ ...proof, cleanupConfirmed: false }), /ACCOUNT_SANDBOX_PARENT_INVALID/);
});
test('probe marks parent active before sandbox creation and confirms only after cleanup', async () => {
  const calls = [], reports = [], context = { artifactSourceCommit: SOURCE.commit, automationCommit: 'a'.repeat(40), producerVerified: true,
    producerRun: SOURCE.producer, producerAttempt: SOURCE.attempt, apkSha256: SOURCE.sha256, parentInspectionVerified: true };
  await account.probe({ RUNNER_TEMP: '/tmp', GITHUB_RUN_ID: '123', GITHUB_SHA: 'a'.repeat(40) }, {
    parent: () => ({ path: '/tmp/sportcenter-account-AbC123', verifyMaestro: async () => calls.push('verify-tool'), confirm: value => calls.push('confirmed:' + value) }),
    readSource: () => context, writeSource: () => calls.push('source-pass'), writeReport: (file, value) => reports.push(value),
    run: async () => { calls.push('adb'); return { exitCode: 0, stdout: '' }; },
    create: async () => { calls.push('create'); return { probes: { ipv4RejectedWithCounter: true, adbLoopbackReachable: true },
      runAs: async () => { calls.push('tool-version'); return { exitCode: 0, stdout: '2.12.0\n' }; },
      createPrivateFile: async () => calls.push('write'), readPrivateFile: async () => { calls.push('read'); return account.PREFLIGHT_FILE; },
      cleanup: async () => calls.push('cleanup') }; },
  });
  assert.deepEqual(calls, ['adb', 'verify-tool', 'confirmed:false', 'create', 'tool-version', 'write', 'read', 'cleanup', 'confirmed:true', 'source-pass']); assert.equal(reports.length, 0);
});
test('preflight file mismatch fails before AVD/account and still records confirmed cleanup', async () => {
  const reports = [];
  await assert.rejects(account.probe({ RUNNER_TEMP: '/tmp', GITHUB_RUN_ID: '123', GITHUB_SHA: 'a'.repeat(40) }, {
    parent: parentFixture,
    readSource: () => ({ artifactSourceCommit: SOURCE.commit, automationCommit: 'a'.repeat(40), producerVerified: true,
      producerRun: SOURCE.producer, producerAttempt: SOURCE.attempt, apkSha256: SOURCE.sha256, parentInspectionVerified: true }),
    run: async () => ({ exitCode: 0, stdout: '' }),
    create: async () => ({ probes: { ipv4RejectedWithCounter: true, adbLoopbackReachable: true },
      runAs: async () => ({ exitCode: 0, stdout: '2.12.0\n' }), createPrivateFile: async () => {},
      readPrivateFile: async () => 'different', cleanup: async () => {} }),
    writeSource: () => assert.fail('roundtrip mismatch cannot approve proof'), writeReport: (file, value) => reports.push(value),
  }), /ACCOUNT_SANDBOX_FAILED/);
  assert.equal(reports[0].stage, 'sandbox-file-roundtrip'); assert.equal(reports[0].cleanup.sandbox, true);
  assert.ok(reports[0].cases.every(item => item.status === 'not_run'));
});
test('ADB start failure preserves process code and never claims sandbox setup or cleanup failed', async () => {
  const reports = [], calls = [];
  const context = { artifactSourceCommit: SOURCE.commit, automationCommit: 'a'.repeat(40), producerVerified: true,
    producerRun: SOURCE.producer, producerAttempt: SOURCE.attempt, apkSha256: SOURCE.sha256, parentInspectionVerified: true };
  for (const throws of [true, false]) {
    await assert.rejects(account.probe({ RUNNER_TEMP: '/tmp', GITHUB_RUN_ID: '123', GITHUB_SHA: 'a'.repeat(40) }, {
      readSource: () => context,
      run: async (file, args) => { calls.push({ file, args }); if (throws) throw new AccountError('ACCOUNT_PROCESS_FAILED'); return { stdout: '', exitCode: 1 }; },
      create: async () => assert.fail('sandbox must not be attempted after failed ADB start'),
      writeSource: () => assert.fail('failed ADB cannot approve source'), writeReport: (file, value) => reports.push(value),
    }), /ACCOUNT_PROCESS_FAILED/);
  }
  assert.equal(calls.length, 2);
  for (const value of reports) {
    assert.equal(value.status, 'failed'); assert.equal(value.stage, 'probe-adb-start-server'); assert.equal(value.sandboxAttempted, false);
    assert.equal(value.sandboxDiagnostic, null); assert.equal(value.cleanup.sandbox, true);
    assert.deepEqual(value.failureCodes, ['ACCOUNT_PROCESS_FAILED']); assert.ok(value.cases.every(item => item.status === 'not_run'));
  }
});

test('all seven base controls cannot approve a report without every required read-only control', () => {
  const base = { status: 'passed', cases: Object.fromEntries(account.CASES.map(id => [id, 'passed'])),
    readOnlyChecks: Object.fromEntries(account.READ_ONLY_CHECKS.map(id => [id, 'passed'])), ...mutationSuccess(), orderListState: 'empty',
    errors: [], cleanup: { device: true, sandbox: true, localSession: true, fixtureRestoration: true } };
  assert.equal(account.publicReport(base).status, 'passed');
  for (const id of account.READ_ONLY_CHECKS) {
    const missing = { ...base.readOnlyChecks }; delete missing[id];
    assert.equal(account.publicReport({ ...base, readOnlyChecks: missing }).status, 'failed');
    assert.equal(account.publicReport({ ...base, readOnlyChecks: { ...base.readOnlyChecks, [id]: 'failed' } }).status, 'failed');
  }
  assert.equal(account.publicReport({ ...base, orderListState: null }).status, 'failed');
});

test('profile input corruption fails before save and never starts a restorative API session unnecessarily', async () => {
  const value = await runtime({ corruptMutationInput: true });
  assert.equal(value.result.stage, 'MU01-profile-name-input'); assert.equal(value.result.mutationChecks[0].status, 'failed');
  assert.equal(value.profileName, 'Original SC'); assert.equal(value.restoreCalls, 0);
  assert.equal(value.result.cleanup.fixtureRestoration, true); assert.equal(value.result.status, 'failed');
});
test('a changed profile preimage blocks before editing or saving any field', async () => {
  const value = await runtime({ changedPreimage: true });
  assert.equal(value.result.status, 'blocked'); assert.equal(value.result.stage, 'MU01-profile-preimage-nombre');
  assert.equal(value.restoreCalls, 0); assert.equal(value.profileName, 'Original SC');
  assert.ok(!value.flows.some(flow => Object.hasOwn(flow.env, 'MAESTRO_ACCOUNT_FIELD_VALUE')));
  assert.deepEqual(value.result.failureCodes, ['FIXTURE_CONFLICT']);
});
test('a lost profile change after cold start is not rescued into a passing UI case by API cleanup', async () => {
  const value = await runtime({ lostProfilePersist: true });
  assert.equal(value.result.stage, 'MU02-profile-persist'); assert.equal(value.result.mutationChecks[1].status, 'failed');
  assert.equal(value.result.mutationEvidence.profilePersisted, false); assert.equal(value.result.cleanup.fixtureRestoration, true);
  assert.equal(value.result.status, 'failed'); assert.equal(value.restoreCalls, 1);
});
test('API fallback cannot certify restoration UI when the original name did not persist after a cold start', async () => {
  const value = await runtime({ lostOriginalPersist: true });
  assert.equal(value.result.stage, 'MU02-profile-preimage-nombre'); assert.equal(value.result.mutationChecks[1].status, 'failed');
  assert.equal(value.result.mutationEvidence.profileUiRestored, false); assert.equal(value.result.cleanup.fixtureRestoration, true);
  assert.equal(value.result.mutationChecks.at(-1).status, 'not_run'); assert.equal(value.result.status, 'failed');
});
test('ambiguous variant selectors or changed rendered prices prevent every cart mutation', async () => {
  for (const config of [{ ambiguousVariant: true }, { changedPrice: true }]) {
    const value = await runtime(config); assert.equal(value.result.status, 'failed');
    assert.equal(value.result.stage, 'MU04-target-preflight');
    assert.equal(value.restoredState.cartIncrementAttempted, false); assert.equal(value.restoredState.cartRemoveAttempted, false);
    assert.equal(value.restoredState.cartAddAttempted, false); assert.equal(value.cartQty, 1);
    assert.equal(value.result.cleanup.fixtureRestoration, true);
  }
});
test('a failed additive attempt remains uncertain and cannot receive a cleanup PASS or be replayed', async () => {
  const value = await runtime({ failAdd: true });
  assert.equal(value.result.stage, 'MU04-cart-readd'); assert.equal(value.result.status, 'failed');
  assert.equal(value.restoredState.cartRemoveConfirmed, true); assert.equal(value.restoredState.cartAddAttempted, true);
  assert.equal(value.result.mutationEvidence.mutationUncertain, true); assert.equal(value.result.cleanup.fixtureRestoration, false);
  assert.equal(value.cartQty, 0); assert.equal(value.restoreCalls, 1); assert.equal(value.result.cleanup.device, true);
});
test('a concurrent baseline change prevents MU04 MU05 and global acceptance even when all UI steps passed', async () => {
  const value = await runtime({ restoreConflict: true });
  assert.equal(value.result.status, 'failed'); assert.ok(value.result.cases.every(item => item.status === 'passed'));
  assert.ok(value.result.readOnlyChecks.every(item => item.status === 'passed'));
  assert.deepEqual(value.result.mutationChecks.slice(3).map(item => item.status), ['failed', 'failed']);
  assert.equal(value.result.mutationEvidence.concurrentChangeObserved, true); assert.equal(value.result.cleanup.fixtureRestoration, false);
});
test('restoration cannot start until logout and process absence are both observed', async () => {
  const value = await runtime({ runningAfterStop: true });
  assert.equal(value.restoreCalls, 0); assert.equal(value.result.cleanup.fixtureRestoration, false);
  assert.equal(value.result.mutationEvidence.uiStopped, false); assert.equal(value.result.status, 'failed');
  assert.ok(value.result.failureCodes.includes('ACCOUNT_MUTATION_UI_NOT_STOPPED'));
});
test('mutation evidence exports fixed booleans only and every additional gate is mandatory', () => {
  const state = { status: 'passed', cases: Object.fromEntries(account.CASES.map(id => [id, 'passed'])),
    readOnlyChecks: Object.fromEntries(account.READ_ONLY_CHECKS.map(id => [id, 'passed'])), ...mutationSuccess(), orderListState: 'empty',
    errors: [], cleanup: { device: true, sandbox: true, localSession: true, fixtureRestoration: true } };
  assert.equal(account.publicReport(state).status, 'passed');
  for (const id of account.MUTATION_CHECKS) assert.equal(account.publicReport({ ...state, mutationChecks: { ...state.mutationChecks, [id]: 'failed' } }).status, 'failed');
  const value = account.publicReport({ ...state, mutationEvidence: { profileSaved: 'private@example.com', arbitrary: 'private-name' } });
  assert.equal(value.status, 'failed'); assert.ok(Object.values(value.mutationEvidence).every(item => typeof item === 'boolean'));
  assert.ok(!JSON.stringify(value).includes('private-name') && !JSON.stringify(value).includes('private@example.com'));
  assert.equal(account.publicReport({ ...state, cleanup: { ...state.cleanup, fixtureRestoration: false } }).status, 'failed');
});
test('product quantity is accepted only for one numeric TextView between its labelled step controls', () => {
  const controls = [{ text: 'Restar cantidad', clickable: 'true', bounds: '[10,220][60,280]' }, { text: 'Sumar cantidad', clickable: 'true', bounds: '[160,220][210,280]' }];
  const quantity = { text: '2', bounds: '[85,230][135,270]' };
  assert.equal(account.productQuantity(account.parsePrivateUi(ui([...controls, quantity]))), 2);
  assert.equal(account.productQuantity(account.parsePrivateUi(ui([...controls, quantity, quantity]))), null);
  assert.equal(account.productQuantity(account.parsePrivateUi(ui([...controls, { ...quantity, bounds: '[300,230][350,270]' }]))), null);
});

test('profile locator brings Nombre above Correo and Telefono below into view through bounded Maestro commands', async () => {
  const value = await runtime({ profileViewport: true }); assert.equal(value.result.status, 'passed');
  const scrolls = value.flows.filter(flow => flow.body.includes('direction:'));
  assert.ok(scrolls.some(flow => flow.body.includes('text: "^Nombre$"') && flow.body.includes('direction: UP')));
  assert.ok(scrolls.some(flow => flow.body.includes('text: "^Teléfono$"') && flow.body.includes('direction: DOWN')));
  assert.ok(scrolls.some(flow => flow.body.includes('text: "^Guardar cambios$"') && flow.body.includes('direction: DOWN')));
  assert.ok(scrolls.every(flow => flow.body.includes('timeout: 30000') && flow.body.includes('centerElement: true')));
  assert.ok(!value.calls.some(call => call.args.slice(2, 5).join(' ') === 'shell input swipe'));
});
test('a successful locator with visible label but unmeasurable EditText never permits a profile write', async () => {
  const value = await runtime({ profileViewport: true, unmeasuredProfileField: 'nombre' });
  assert.equal(value.result.status, 'failed'); assert.equal(value.result.stage, 'MU01-profile-preimage-nombre');
  assert.deepEqual(value.result.failureCodes, ['ACCOUNT_MUTATION_UI_INVALID']); assert.equal(value.restoreCalls, 0);
  assert.equal(value.profileName, 'Original SC'); assert.equal(value.result.cleanup.fixtureRestoration, true);
});
test('failed Maestro profile scrolling is mandatory and cannot fall back to a blind tap or save', async () => {
  const value = await runtime({ failProfileScroll: true }); assert.equal(value.result.status, 'failed');
  assert.equal(value.result.stage, 'MU01-profile-preimage-nombre'); assert.deepEqual(value.result.failureCodes, ['ACCOUNT_MAESTRO_FAILED']);
  assert.equal(value.restoreCalls, 0); assert.equal(value.profileName, 'Original SC');
  assert.ok(!value.flows.some(flow => Object.hasOwn(flow.env, 'MAESTRO_ACCOUNT_FIELD_VALUE')));
  assert.throws(() => account.profileScrollBody('${PRIVATE_INPUT}'), /ACCOUNT_MUTATION_UI_INVALID/);
});

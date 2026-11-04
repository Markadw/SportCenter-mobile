'use strict';
const test = globalThis.test || require('node:test').test;
const assert = require('node:assert/strict');
const path = require('node:path');
const account = require(path.join(process.env.ACCOUNT_PREP_DIR || path.join(__dirname, '..', 'scripts'), 'android-account.cjs'));
const { SandboxError } = require(path.join(process.env.ACCOUNT_PREP_DIR || path.join(__dirname, '..', 'scripts'), 'account-sandbox.cjs'));
const REPO = process.env.ACCOUNT_REPO_ROOT || path.join(__dirname, '..');
const { xmlTree } = require(path.join(REPO, 'scripts/android-pinning.js'));
const { SOURCE, AccountError } = account;
const jobsNames = ['Definir comprobaciones por evento y rama', 'Calidad previa a integración / Análisis estático y pruebas del cliente',
  'Seguridad previa a integración y APK / Dependencias y SAST CodeQL', 'Integración HTTP real y regresión de contratos',
  'Comprobar configuración de rendimiento y estrés / Inspeccionar guiones sin ejecutar carga', 'Compilar y aceptar APK candidato',
  'Rechazo nativo bajo MITM y recuperación del mismo APK', 'Resultado de integración'];
function producer() { return { id: SOURCE.producer, run_attempt: 2, head_sha: SOURCE.commit, head_branch: 'candidate/android-rc4', event: 'push',
  path: '.github/workflows/api-android.yml', repository: { full_name: SOURCE.repository }, status: 'completed', conclusion: 'success' }; }
function jobs() { return { total_count: jobsNames.length, jobs: jobsNames.map(name => ({ name, run_id: SOURCE.producer, run_attempt: 2, status: 'completed', conclusion: 'success' })) }; }
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

test('exact approved attempt2 plus immutable APK evidence is accepted', () => assert.equal(account.verifyProducer(producer(), jobs(), candidate(), inspection()).producerVerified, true));
for (const [label, mutate] of [
  ['attempt1', run => run.run_attempt = 1], ['different source', run => run.head_sha = 'b'.repeat(40)], ['pending', run => run.status = 'in_progress'],
  ['failure', run => run.conclusion = 'failure'], ['other repository', run => run.repository.full_name = 'other/repo'], ['other tag', run => run.head_branch = 'develop'],
]) test('producer rejects ' + label, () => { const run = producer(); mutate(run); assert.throws(() => account.verifyProducer(run, jobs(), candidate(), inspection()), /ACCOUNT_PRODUCER/); });
for (const state of ['skipped', 'failure', 'cancelled', null]) test('producer does not accept required job ' + state, () => {
  const value = jobs(); value.jobs[0].conclusion = state; assert.throws(() => account.verifyProducer(producer(), value, candidate(), inspection()), /ACCOUNT_PRODUCER/);
});
test('producer rejects incomplete/duplicate jobs and attempt mismatch', () => {
  for (const mutate of [value => value.total_count++, value => value.jobs.push(value.jobs[0]), value => value.jobs[0].run_attempt = 1]) {
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
test('all seven controls plus all cleanup gates are mandatory', () => {
  const state = { status: 'passed', cases: Object.fromEntries(account.CASES.map(id => [id, 'passed'])), errors: [], cleanup: { device: true, sandbox: true, localSession: true } };
  assert.equal(account.publicReport(state).status, 'passed');
  for (const key of Object.keys(state.cleanup)) assert.equal(account.publicReport({ ...state, cleanup: { ...state.cleanup, [key]: false } }).status, 'failed');
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
  const calls = [], flows = [], files = new Map(); let installed = false, authenticated = false, stage = 'login', cleaned = false;
  const email = 'private+fixture@example.com', password = 'Private *&%s 漢字', sha = 'a'.repeat(40);
  const nodes = () => {
    if (stage === 'profile') return [{ text: config.wrongProfile ? 'other@example.com' : email, 'content-desc': 'Correo', class: 'android.widget.EditText' }];
    if (stage === 'cart') return [{ text: config.empty ? 'Tu carrito está vacío' : 'Subtotal' }];
    if (stage === 'account') return [{ text: 'Has iniciado sesión en Sport Center.' }, { text: 'Cerrar sesión', clickable: 'true' }];
    if (stage === 'guest') return [{ text: 'Tu cuenta Sport Center' }];
    return [{ 'content-desc': 'Correo electrónico', class: 'android.widget.EditText', bounds: '[10,20][200,80]' },
      { 'content-desc': 'Contraseña', class: 'android.widget.EditText', bounds: '[10,120][200,180]' },
      { 'content-desc': 'Iniciar sesión', clickable: 'true', bounds: '[10,220][200,280]' }];
  };
  const run = async (file, args) => {
    calls.push({ file, args }); assert.equal(file, 'adb');
    if (args[0] === 'devices') return { stdout: 'List of devices attached\nemulator-5554\tdevice\n' };
    const a = args.slice(2), key = a.join(' ');
    let stdout = '';
    if (key.includes('ro.build.version.sdk')) stdout = '34';
    else if (key.includes('ro.product.cpu.abi')) stdout = 'x86_64';
    else if (key.startsWith('shell pm list packages')) stdout = installed ? 'package:' + SOURCE.appId : '';
    else if (a[0] === 'install') installed = true;
    else if (a[0] === 'uninstall') installed = false;
    else if (key.startsWith('exec-out cat')) stdout = ui(nodes());
    else if (key.startsWith('shell input tap') && a.at(-1) === '250') { authenticated = true; stage = 'account'; }
    else if (key.includes('sportcentermobile://account')) stage = authenticated ? 'account' : 'guest';
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
      assert.ok(keys.every(key => ['MAESTRO_ACCOUNT_EMAIL', 'MAESTRO_ACCOUNT_PASSWORD'].includes(key)));
      assert.ok(!argv.some(arg => arg.includes(email) || arg.includes(password)));
      if (name === 'AC01-navigate') stage = 'login';
      else if (name === 'AC02') stage = 'profile';
      else if (name === 'AC03') stage = 'cart';
      else if (name === 'AC05') { assert.equal(authenticated, true); stage = 'account'; }
      else if (name === 'AC06' || name === 'cleanup') { authenticated = false; stage = 'guest'; }
      else if (name === 'AC07') { assert.equal(authenticated, false); stage = 'guest'; }
      const output = argv[argv.indexOf('--output') + 1]; files.set(output, junit(name));
      return { exitCode: config.failPhase === name ? 1 : 0, stdout: password, stderr: email };
    },
    readPrivateFile: async name => files.get('/private/root/' + name),
    cleanup: async () => { cleaned = true; if (config.failCleanup) throw new Error(password); },
    };
  };
  const result = await account.runAcceptance({ env: { ACCOUNT_UNIT_TEST: true, GITHUB_RUN_ID: '123', GITHUB_SHA: sha, RUNNER_TEMP: '/tmp',
    ANDROID_TEST_EMAIL: email, ANDROID_TEST_PASSWORD: password }, context: { artifactSourceCommit: SOURCE.commit, automationCommit: sha,
    producerVerified: true, producerRun: SOURCE.producer, producerAttempt: 2, apkSha256: SOURCE.sha256, parentInspectionVerified: true },
    apk: '/private/candidate.apk', hash: async () => SOURCE.sha256, run, create, parent: parentFixture, xmlTree });
  assert.ok(!JSON.stringify(result).includes(email) && !JSON.stringify(result).includes(password));
  return { result, calls, flows, cleaned, installed, authenticated };
}
test('runtime uses one login, preserves state for cold restore, and removes only its installed app', async () => {
  const value = await runtime(); assert.equal(value.result.status, 'passed'); assert.equal(value.cleaned, true);
  assert.equal(value.installed, false); assert.equal(value.authenticated, false);
  assert.equal(value.flows.filter(item => item.name === 'AC01-password').length, 1);
  assert.equal(value.flows.filter(item => Object.keys(item.env).length).length, 2);
  assert.ok(value.calls.every(item => !item.args.includes('clear') && !item.args.includes('curl')));
  assert.equal(value.calls.filter(item => item.args[2] === 'install').length, 1);
  assert.equal(value.calls.filter(item => item.args.join(' ').includes('am force-stop')).length, 3);
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
    producerRun: SOURCE.producer, producerAttempt: 2, apkSha256: SOURCE.sha256, parentInspectionVerified: true };
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
      producerRun: SOURCE.producer, producerAttempt: 2, apkSha256: SOURCE.sha256, parentInspectionVerified: true }),
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
    producerRun: SOURCE.producer, producerAttempt: 2, apkSha256: SOURCE.sha256, parentInspectionVerified: true };
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
      producerRun: SOURCE.producer, producerAttempt: 2, apkSha256: SOURCE.sha256, parentInspectionVerified: true }),
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
    producerRun: SOURCE.producer, producerAttempt: 2, apkSha256: SOURCE.sha256, parentInspectionVerified: true };
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

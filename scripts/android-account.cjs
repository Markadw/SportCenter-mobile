// PRIVATE PREPARATION. No CI execution or acceptance is asserted by this file.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: pause } = require('node:timers/promises');
const { createSandbox, safeSandboxDiagnostic, isSafeSandboxDiagnostic } = require('./account-sandbox.cjs');

const SOURCE = Object.freeze({ repository: 'Markadw/SportCenter-mobile',
  commit: 'e15671b17615621b29f4bc4bb9c0ccfdf167e657', projectId: 'c608a591-dfad-47d6-98cf-e714e821c269',
  appId: 'com.markadw.sportcenter', api: 'https://back-sport-ghxk.onrender.com',
  buildId: 'b409ac48-41b0-4292-8e9c-df8153006f71', sha256: '092cdbbc6942fe16c941f814a0b581b26c33c8cd658ae5b0015d9c10f947d564',
  fingerprint: '945e4f8e191f1fbf1dec5f942cee3d98bf38b203107c2f2fdddeca5803be0fd3',
  producer: 41708999367, attempt: 2, artifact: 13272237966, artifactBytes: 176634,
  artifactSha256: 'dda9576bdc03753f5ba24600b676770592a6915aa1b42792e49b87efdafef07d',
  appVersion: '1.0.0', appBuildVersion: '1' });
const CASES = Object.freeze(['AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07']);
const STAGES = Object.freeze(['preflight', 'device-check', 'probe-adb-start-server', 'sandbox-parent-verify', 'sandbox-probes', 'sandbox-tool-version', 'app-install', 'AC01-navigate', 'AC01-email',
  'AC01-password', 'AC01-submit', 'AC01-await-account', 'AC02-open', 'AC02-scroll', 'AC02-compare', 'AC03-open', 'AC03-fixture',
  'AC04-summary', 'AC05-restore', 'AC06-logout', 'AC07-guest', 'AC07-guard', 'completed', 'cleanup-session', 'cleanup-device', 'cleanup-sandbox']);
const AUTOMATION_FILES = Object.freeze(['config/android-release-validation.json', 'scripts/android-release.js', '__tests__/androidRelease.test.js',
  'tests/manual/android-release.md', 'scripts/android-profiles.js', '__tests__/androidProfiles.test.js',
  '.github/workflows/android-validation.yml', '.github/workflows/ci.yml', 'scripts/validate-test-configs.js',
  '__tests__/pipelines.test.js', '__tests__/candidatePolicy.test.js', '__tests__/android16k.test.js',
  'docs/seguridad-candidata.md', 'tests/plan.json', 'README.md',
  'scripts/android-account.cjs', 'scripts/account-sandbox.cjs', '__tests__/androidAccount.test.js',
  '__tests__/accountSandbox.test.js', '__tests__/androidAccountWorkflow.test.js', 'tests/manual/android-account.md']);
const CODES = Object.freeze(['ACCOUNT_SECRETS_MISSING', 'ACCOUNT_FIXTURE_INVALID', 'ACCOUNT_FIXTURE_EMPTY',
  'ACCOUNT_FIXTURE_STOCK', 'ACCOUNT_PRODUCER_NOT_APPROVED', 'ACCOUNT_ARTIFACT_MISMATCH', 'ACCOUNT_BUILD_MISMATCH',
  'ACCOUNT_AUTOMATION_SCOPE', 'ACCOUNT_APP_TREE_CHANGED', 'ACCOUNT_UI_INVALID', 'ACCOUNT_UI_TIMEOUT',
  'ACCOUNT_UI_ACTION_AMBIGUOUS', 'ACCOUNT_PROFILE_MISMATCH', 'ACCOUNT_MAESTRO_FAILED', 'ACCOUNT_JUNIT_INVALID',
  'ACCOUNT_PROCESS_FAILED', 'ACCOUNT_SESSION_CLEANUP_UNCONFIRMED', 'ACCOUNT_DEVICE_CLEANUP_FAILED',
  'ACCOUNT_SANDBOX_FAILED', 'ACCOUNT_SANDBOX_CLEANUP_FAILED', 'ACCOUNT_UNEXPECTED_FAILURE']);
const PARENT_ERROR = 'ACCOUNT_SANDBOX_PARENT_INVALID';
const TOOL_ERROR = 'ACCOUNT_SANDBOX_TOOL_INVALID';
class AccountError extends Error { constructor(code) { super(code); this.code = code; } }
function need(value, code) { if (!value) throw new AccountError(code); }
function safeCode(error) { return [...CODES, PARENT_ERROR, TOOL_ERROR].includes(error?.code) ? error.code : 'ACCOUNT_UNEXPECTED_FAILURE'; }
function verifyProducer(run, jobs, candidate, inspection) {
  need(run?.id === SOURCE.producer && run.run_attempt === SOURCE.attempt && run.head_sha === SOURCE.commit &&
    run.head_branch === 'candidate/android-rc4' && run.event === 'push' && run.path === '.github/workflows/api-android.yml' &&
    run.repository?.full_name === SOURCE.repository && run.status === 'completed' && run.conclusion === 'success', 'ACCOUNT_PRODUCER_NOT_APPROVED');
  need(Array.isArray(jobs?.jobs) && jobs.total_count === jobs.jobs.length, 'ACCOUNT_PRODUCER_NOT_APPROVED');
  for (const name of ['Definir comprobaciones por evento y rama', 'Calidad previa a integración / Análisis estático y pruebas del cliente',
    'Seguridad previa a integración y APK / Dependencias y SAST CodeQL', 'Integración HTTP real y regresión de contratos',
    'Comprobar configuración de rendimiento y estrés / Inspeccionar guiones sin ejecutar carga',
    'Compilar y aceptar APK candidato', 'Rechazo nativo bajo MITM y recuperación del mismo APK', 'Resultado de integración']) {
    const found = jobs.jobs.filter(job => job.name === name);
    need(found.length === 1 && found[0].run_id === SOURCE.producer && found[0].run_attempt === SOURCE.attempt &&
      found[0].status === 'completed' && found[0].conclusion === 'success', 'ACCOUNT_PRODUCER_NOT_APPROVED');
  }
  need(candidate?.buildId === SOURCE.buildId && candidate.commit === SOURCE.commit && candidate.api === SOURCE.api && candidate.sha256 === SOURCE.sha256 &&
    candidate.emulatorApi === 34 && candidate.maestro === '2.12.0', 'ACCOUNT_ARTIFACT_MISMATCH');
  const proof = inspection?.checks;
  need(inspection.status === 'passed_for_static_scope' && inspection.package === SOURCE.appId &&
    proof?.candidate?.status === 'passed' && proof.candidate.evidence?.buildId === SOURCE.buildId && proof.candidate.evidence.commit === SOURCE.commit &&
    proof.candidate.evidence.sha256 === SOURCE.sha256 && proof.manifest?.status === 'passed' &&
    proof.manifest.evidence?.applicationId === SOURCE.appId && proof.manifest.evidence.debuggable === false &&
    proof.signature?.status === 'passed' && proof.signature.evidence?.verified === true, 'ACCOUNT_ARTIFACT_MISMATCH');
  return { producerRun: SOURCE.producer, producerAttempt: SOURCE.attempt, producerVerified: true };
}
function verifyBuild(build) {
  need(build?.id === SOURCE.buildId && build.status === 'FINISHED' && build.platform === 'ANDROID' && build.gitCommitHash === SOURCE.commit &&
    build.buildProfile === 'preview' && build.app?.id === SOURCE.projectId && build.appIdentifier === SOURCE.appId &&
    build.appVersion === SOURCE.appVersion && build.appBuildVersion === SOURCE.appBuildVersion && build.distribution === 'INTERNAL' &&
    build.message === 'sport-center-candidate-v1:' + SOURCE.fingerprint, 'ACCOUNT_BUILD_MISMATCH');
  let url; try { url = new URL(build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl); } catch { throw new AccountError('ACCOUNT_BUILD_MISMATCH'); }
  need(url.protocol === 'https:' && !url.username && !url.password && url.pathname.endsWith('.apk'), 'ACCOUNT_BUILD_MISMATCH');
  return url.toString(); // PRIVATE only: never serialize this value into reports.
}
function verifyAutomation({ sha, head, ref, repository, changed, dirty = '' }) {
  need(/^[a-f0-9]{40}$/.test(sha || '') && sha !== SOURCE.commit && head.trim() === sha && repository === SOURCE.repository &&
    /^refs\/tags\/validation\/account-[A-Za-z0-9_.-]+$/.test(ref || '') && !dirty.trim(), 'ACCOUNT_AUTOMATION_SCOPE');
  const files = changed.trim() ? changed.trim().split(/\r?\n/) : [];
  need(files.length > 0 && files.every(file => AUTOMATION_FILES.includes(file)), 'ACCOUNT_APP_TREE_CHANGED');
  return { automationCommit: sha, artifactSourceCommit: SOURCE.commit, changedAutomationFiles: files.length };
}
function credentials(env) {
  const email = env.ANDROID_TEST_EMAIL, password = env.ANDROID_TEST_PASSWORD;
  need(typeof email === 'string' && typeof password === 'string' && email.length > 0 && password.length > 0, 'ACCOUNT_SECRETS_MISSING');
  need(email.length <= 100 && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim()) &&
    password.length >= 8 && password.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(email + password) &&
    password.isWellFormed(), 'ACCOUNT_FIXTURE_INVALID');
  return { email: email.trim().toLowerCase(), password };
}
function decodeAttribute(value) {
  return value.replace(/&([^;]+);/g, (_, item) => {
    const simple = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(simple, item)) return simple[item];
    need(/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(item), 'ACCOUNT_UI_INVALID');
    const code = item[1] === 'x' ? parseInt(item.slice(2), 16) : Number(item.slice(1));
    need(Number.isSafeInteger(code) && code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff), 'ACCOUNT_UI_INVALID');
    return String.fromCodePoint(code);
  });
}
// Dedicated bounded UI parser: only Android's hierarchy/node shape and built-in entities.
function parsePrivateUi(source) {
  need(typeof source === 'string' && source.length > 0 && source.length <= 512 * 1024 && !source.includes('<!'), 'ACCOUNT_UI_INVALID');
  const input = source.replace(/^<\?xml version=['"]1\.0['"](?: encoding=['"]UTF-8['"])?(?: standalone=['"]yes['"])?\?>/, '');
  need(!input.includes('<?'), 'ACCOUNT_UI_INVALID');
  const root = { name: '#root', attrs: {}, children: [] }, stack = [root]; let offset = 0, count = 0;
  for (const match of input.matchAll(/<[^>]+>|[^<]+/g)) {
    need(match.index === offset, 'ACCOUNT_UI_INVALID'); offset += match[0].length; const token = match[0];
    if (!token.startsWith('<')) { need(!token.trim(), 'ACCOUNT_UI_INVALID'); continue; }
    if (token.startsWith('</')) { need(token === '</' + stack.at(-1).name + '>' && stack.length > 1, 'ACCOUNT_UI_INVALID'); stack.pop(); continue; }
    const opening = token.match(/^<(hierarchy|node)([\s\S]*?)(\/?)>$/); need(opening && ++count <= 4096 && stack.length <= 64, 'ACCOUNT_UI_INVALID');
    let tail = opening[2]; const attrs = {};
    while (tail.trim()) {
      const attr = tail.match(/^\s+([\w:.-]+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/);
      need(attr && !Object.hasOwn(attrs, attr[1]), 'ACCOUNT_UI_INVALID'); const raw = attr[2] ?? attr[3];
      need(!raw.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, '').includes('&'), 'ACCOUNT_UI_INVALID');
      attrs[attr[1]] = decodeAttribute(raw); tail = tail.slice(attr[0].length);
    }
    const node = { name: opening[1], attrs, children: [] }; stack.at(-1).children.push(node); if (!opening[3]) stack.push(node);
  }
  need(offset === input.length && stack.length === 1 && root.children.length === 1 && root.children[0].name === 'hierarchy', 'ACCOUNT_UI_INVALID');
  const nodes = [], pending = [...root.children[0].children];
  while (pending.length) { const node = pending.shift(); need(node.name === 'node', 'ACCOUNT_UI_INVALID'); nodes.push(node.attrs); pending.push(...node.children); }
  return nodes;
}
function labelled(nodes, label) { return nodes.filter(node => node.package === SOURCE.appId && [node.text, node['content-desc']].includes(label)); }
function hasLabel(nodes, label) { return labelled(nodes, label).length > 0; }
function point(nodes, label, kind) {
  const found = labelled(nodes, label).filter(node => node.enabled === 'true' &&
    (kind === 'input' ? node.class === 'android.widget.EditText' : node.clickable === 'true'));
  need(found.length === 1, 'ACCOUNT_UI_ACTION_AMBIGUOUS'); const bounds = found[0].bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  need(bounds && Number(bounds[3]) > Number(bounds[1]) && Number(bounds[4]) > Number(bounds[2]) &&
    Number(bounds[3]) < 8192 && Number(bounds[4]) < 8192, 'ACCOUNT_UI_ACTION_AMBIGUOUS');
  return [Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2), Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2)];
}
function profileMatches(nodes, email) {
  const fields = labelled(nodes, 'Correo').filter(node => node.class === 'android.widget.EditText');
  return fields.length === 1 && fields[0].text?.trim().toLowerCase() === email;
}
function fixtureStatus(nodes) {
  if (hasLabel(nodes, 'Tu carrito está vacío')) return 'empty';
  if (nodes.some(node => node.package === SOURCE.appId && /^Revisa las existencias \(\d+ disponibles\)\.$/.test(node.text || ''))) return 'stock';
  if (hasLabel(nodes, 'No pudimos cargar el carrito')) return 'error';
  return hasLabel(nodes, 'Subtotal') ? 'ready' : 'loading';
}
function yaml(name, body) { need(/^(?:AC0[1-7](?:-(?:navigate|email|password))?|cleanup)$/.test(name), 'ACCOUNT_MAESTRO_FAILED'); return 'appId: ' + SOURCE.appId + '\nname: ' + name + ' private account\n---\n' + body + '\n'; }
const FLOWS = Object.freeze({
  navigate: '- launchApp:\n    clearState: true\n- extendedWaitUntil:\n    visible: "Explora por deporte"\n    timeout: 45000\n- tapOn: "^Cuenta$"\n- extendedWaitUntil:\n    visible: "Tu cuenta Sport Center"\n    timeout: 45000\n- tapOn: "^Iniciar sesión$"\n- extendedWaitUntil:\n    visible: "Accede a tu cuenta de Sport Center."\n    timeout: 45000',
  email: '- inputText: ${MAESTRO_ACCOUNT_EMAIL}',
  password: '- inputText: ${MAESTRO_ACCOUNT_PASSWORD}\n- hideKeyboard',
  login: '- extendedWaitUntil:\n    visible: "Has iniciado sesión en Sport Center."\n    timeout: 45000\n- assertVisible: "^Mi cuenta$"',
  profile: '- tapOn: "^Mi perfil$"\n- extendedWaitUntil:\n    visible: "Actualiza tus datos personales y de contacto."\n    timeout: 45000\n- assertVisible: "^Nombre$"\n- assertVisible: "^Apellido paterno$"\n- assertVisible: "^Apellido materno$"\n- assertNotVisible: "Tu perfil se actualizó correctamente."',
  cart: '- pressKey: Back\n- extendedWaitUntil:\n    visible: "Has iniciado sesión en Sport Center."\n    timeout: 45000\n- tapOn: "^Mi carrito$"\n- extendedWaitUntil:\n    visible: "^Tu carrito$"\n    timeout: 45000',
  summary: '- scrollUntilVisible:\n    element:\n      text: "^Continuar compra$"\n    timeout: 30000\n- assertVisible:\n    text: "^Continuar compra$"\n    enabled: true\n- tapOn: "^Continuar compra$"\n- extendedWaitUntil:\n    visible: "^Dirección de envío$"\n    timeout: 45000\n- scrollUntilVisible:\n    element:\n      text: "^Método de envío$"\n    timeout: 30000\n- assertVisible: "^Método de envío$"\n- scrollUntilVisible:\n    element:\n      text: "^Subtotal$"\n    timeout: 30000\n- assertVisible: "^Subtotal$"\n- assertVisible: "^Descuento$"\n- scrollUntilVisible:\n    element:\n      text: "^Total$"\n    timeout: 30000\n- assertVisible: "^Total$"\n- scrollUntilVisible:\n    element:\n      text: "^Continuar a Mercado Pago$"\n    timeout: 30000\n- assertVisible: "^Continuar a Mercado Pago$"',
  restored: '- extendedWaitUntil:\n    visible: "Explora por deporte"\n    timeout: 45000\n- tapOn: "^Cuenta$"\n- extendedWaitUntil:\n    visible: "Has iniciado sesión en Sport Center."\n    timeout: 45000\n- assertVisible: "^Mi cuenta$"',
  logout: '- scrollUntilVisible:\n    element:\n      text: "^Cerrar sesión$"\n    timeout: 30000\n- tapOn: "^Cerrar sesión$"\n- extendedWaitUntil:\n    visible: "Accede a tu cuenta de Sport Center."\n    timeout: 45000',
  guest: '- extendedWaitUntil:\n    visible: "Explora por deporte"\n    timeout: 45000\n- tapOn: "^Cuenta$"\n- extendedWaitUntil:\n    visible: "Tu cuenta Sport Center"\n    timeout: 45000\n- assertNotVisible: "Has iniciado sesión en Sport Center."',
  guard: '- extendedWaitUntil:\n    visible: "Inicia sesión con tu cuenta de cliente para ver tus productos."\n    timeout: 45000\n- assertNotVisible: "^Subtotal$"',
});
function verifyJUnit(source, name, xmlTree) {
  let tree; try { tree = xmlTree(source); } catch { throw new AccountError('ACCOUNT_JUNIT_INVALID'); }
  need(tree?.name === 'testsuites' && tree.children?.length === 1 && tree.children[0].name === 'testsuite', 'ACCOUNT_JUNIT_INVALID');
  const suite = tree.children[0], cases = suite.children.filter(item => item.name === 'testcase');
  for (const owner of [tree, suite]) for (const [key, expected] of [['tests', '1'], ['failures', '0'], ['errors', '0'], ['skipped', '0']]) {
    if (owner === suite && ['tests', 'failures'].includes(key) || Object.hasOwn(owner.attrs, key)) need(owner.attrs[key] === expected, 'ACCOUNT_JUNIT_INVALID');
  }
  const pending = [tree]; let count = 0;
  while (pending.length) { const node = pending.pop(); need(++count <= 64 && !['failure', 'error', 'skipped'].includes(node.name) && !node.text.trim(), 'ACCOUNT_JUNIT_INVALID'); pending.push(...node.children); }
  need(cases.length === 1 && suite.children.every(node => ['testcase', 'properties'].includes(node.name)), 'ACCOUNT_JUNIT_INVALID');
  const item = cases[0], expected = name + ' private account';
  need(item.attrs.name === expected && item.attrs.id === expected && item.attrs.classname === expected && item.attrs.status === 'SUCCESS' &&
    item.children.every(node => node.name === 'properties'), 'ACCOUNT_JUNIT_INVALID');
}
function publicReport(state) {
  const clean = { version: 1, scope: 'dedicated-account-read-only-ui-api34', artifactSourceCommit: SOURCE.commit,
    automationCommit: /^[a-f0-9]{40}$/.test(state.automationCommit || '') ? state.automationCommit : null,
    buildId: SOURCE.buildId, apkSha256: SOURCE.sha256, producerRun: SOURCE.producer, producerAttempt: SOURCE.attempt,
    status: ['passed', 'failed', 'blocked'].includes(state.status) ? state.status : 'failed',
    stage: STAGES.includes(state.failureStage || state.stage) ? state.failureStage || state.stage : 'unknown',
    sandboxAttempted: state.sandboxAttempted === true,
    sandboxDiagnostic: isSafeSandboxDiagnostic(state.sandboxDiagnostic) ? { ...state.sandboxDiagnostic } : null,
    cases: CASES.map(id => ({ id, status: ['passed', 'failed', 'blocked', 'not_run'].includes(state.cases?.[id]) ? state.cases[id] : 'not_run' })),
    cleanup: { device: state.cleanup?.device === true, sandbox: state.cleanup?.sandbox === true,
      localSession: state.cleanup?.localSession === true, serverRevocation: 'not-independently-observed' },
    failureCodes: [...new Set((state.errors || []).map(safeCode))],
    accountMutations: 'login-refresh-logout-only-no-cart-profile-address-order-payment-writes',
    physicalDevice: 'not-run', payment: 'not-run' };
  if (clean.status === 'passed' && (!clean.cases.every(item => item.status === 'passed') || !Object.values(clean.cleanup).slice(0, 3).every(Boolean) || clean.failureCodes.length)) clean.status = 'failed';
  return clean;
}
async function apkHash(file) { const hash = createHash('sha256'); for await (const chunk of fs.createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }

// Wiring deliberately accepts a source proof verified in a credential-free step.
// The future workflow must not inject account secrets into prepare/download/inspect.
async function runAcceptance({ env, apk, context, run, xmlTree, create = createSandbox, parent = sandboxParent, now = Date.now, wait = pause, hash = apkHash }) {
  need(process.platform === 'linux' || env.ACCOUNT_UNIT_TEST === true, 'ACCOUNT_SANDBOX_FAILED');
  need(context?.artifactSourceCommit === SOURCE.commit && context.automationCommit === env.GITHUB_SHA && context.producerVerified === true &&
    context.producerRun === SOURCE.producer && context.producerAttempt === SOURCE.attempt && context.apkSha256 === SOURCE.sha256 && context.parentInspectionVerified === true,
  'ACCOUNT_ARTIFACT_MISMATCH');
  need(await hash(apk) === SOURCE.sha256, 'ACCOUNT_ARTIFACT_MISMATCH');
  const secret = credentials(env), state = { status: 'failed', stage: 'device-check', automationCommit: context.automationCommit, cases: {}, errors: [], cleanup: {} };
  let box, parentContext, setupAttempted = false, loginAttempted = false, loggedOut = false, caseId = 'AC01', sequence = 0, installed = false, remoteCreated = false;
  const stdout = result => typeof result === 'string' ? result : result.stdout;
  const serialRaw = stdout(await run('adb', ['devices'], {}));
  const devices = serialRaw.trim().split(/\r?\n/).slice(1).filter(Boolean).map(line => line.split(/\s+/));
  need(devices.length === 1 && /^emulator-[0-9]+$/.test(devices[0][0]) && devices[0][1] === 'device', 'ACCOUNT_PROCESS_FAILED');
  const serial = devices[0][0], remote = '/data/local/tmp/sportcenter-account-' + env.GITHUB_RUN_ID;
  need(/^\d+$/.test(env.GITHUB_RUN_ID || ''), 'ACCOUNT_SANDBOX_FAILED');
  const adb = async args => stdout(await run('adb', ['-s', serial, ...args], {}));
  const readUi = async () => { try { await adb(['shell', 'uiautomator', 'dump', remote + '/ui.xml']); return parsePrivateUi(await adb(['exec-out', 'cat', remote + '/ui.xml'])); }
    finally { await adb(['shell', 'rm', '-f', remote + '/ui.xml']); } };
  const waitUi = async predicate => { const deadline = now() + 45000; while (now() < deadline) { const nodes = await readUi(); if (predicate(nodes)) return nodes; await wait(250); } throw new AccountError('ACCOUNT_UI_TIMEOUT'); };
  const tap = async (label, kind) => { const coordinate = point(await readUi(), label, kind); await adb(['shell', 'input', 'tap', ...coordinate.map(String)]); };
  const flow = async (name, body, secretEnv = {}) => {
    const unique = name + '-' + (++sequence);
    const file = await box.createPrivateFile(unique + '.yaml', yaml(name, body));
    const output = path.posix.join(box.root, unique + '.xml');
    const result = await box.runMaestro(serial, ['test', '--format', 'junit', '--output', output, file], { secretEnv });
    need(result.exitCode === 0, 'ACCOUNT_MAESTRO_FAILED'); verifyJUnit(await box.readPrivateFile(unique + '.xml'), name, xmlTree);
  };
  const cold = async () => { await adb(['shell', 'am', 'force-stop', SOURCE.appId]); await adb(['shell', 'am', 'start', '-W', '-n', SOURCE.appId + '/.MainActivity']); };
  try {
    need((await adb(['shell', 'getprop', 'ro.build.version.sdk'])).trim() === '34' && (await adb(['shell', 'getprop', 'ro.product.cpu.abi'])).trim() === 'x86_64', 'ACCOUNT_PROCESS_FAILED');
    need(!(await adb(['reverse', '--list'])).trim(), 'ACCOUNT_PROCESS_FAILED');
    need(!(await adb(['shell', 'pm', 'list', 'packages', SOURCE.appId])).trim(), 'ACCOUNT_PROCESS_FAILED');
    state.stage = 'sandbox-parent-verify'; parentContext = parent(env); await parentContext.verifyMaestro(run);
    parentContext.confirm(false);
    state.stage = 'sandbox-probes'; setupAttempted = true; state.sandboxAttempted = true;
    try { box = await create({ runnerTemp: parentContext.path, runId: env.GITHUB_RUN_ID, env }); }
    catch (error) { state.sandboxDiagnostic = safeSandboxDiagnostic(error); throw error; }
    await adb(['shell', 'mkdir', remote]); remoteCreated = true; await adb(['shell', 'chmod', '700', remote]);
    state.stage = 'app-install'; await adb(['install', apk]); installed = true;
    state.stage = 'AC01-navigate';
    await flow('AC01-navigate', FLOWS.navigate);
    state.stage = 'AC01-email'; await tap('Correo electrónico', 'input'); await flow('AC01-email', FLOWS.email, { MAESTRO_ACCOUNT_EMAIL: secret.email });
    state.stage = 'AC01-password'; await tap('Contraseña', 'input'); await flow('AC01-password', FLOWS.password, { MAESTRO_ACCOUNT_PASSWORD: secret.password });
    state.stage = 'AC01-submit'; loginAttempted = true; await tap('Iniciar sesión', 'button');
    state.stage = 'AC01-await-account'; await flow('AC01', FLOWS.login); state.cases.AC01 = 'passed';
    caseId = 'AC02'; state.stage = 'AC02-open'; await flow('AC02', FLOWS.profile);
    // The field can be below the viewport; scroll only (never enter/save data).
    state.stage = 'AC02-scroll'; await flow('AC02', '- scrollUntilVisible:\n    element:\n      text: "^Correo$"\n    timeout: 30000');
    state.stage = 'AC02-compare'; need(profileMatches(await readUi(), secret.email), 'ACCOUNT_PROFILE_MISMATCH'); state.cases.AC02 = 'passed';
    caseId = 'AC03'; state.stage = 'AC03-open'; await flow('AC03', FLOWS.cart); state.stage = 'AC03-fixture';
    const cart = fixtureStatus(await waitUi(nodes => fixtureStatus(nodes) !== 'loading'));
    need(cart !== 'empty', 'ACCOUNT_FIXTURE_EMPTY'); need(cart !== 'stock', 'ACCOUNT_FIXTURE_STOCK'); need(cart === 'ready', 'ACCOUNT_UI_TIMEOUT');
    state.cases.AC03 = 'passed';
    caseId = 'AC04'; state.stage = 'AC04-summary'; await flow('AC04', FLOWS.summary); state.cases.AC04 = 'passed';
    caseId = 'AC05'; state.stage = 'AC05-restore'; await cold(); await flow('AC05', FLOWS.restored); state.cases.AC05 = 'passed';
    caseId = 'AC06'; state.stage = 'AC06-logout'; await flow('AC06', FLOWS.logout); loggedOut = true; state.cases.AC06 = 'passed';
    caseId = 'AC07'; state.stage = 'AC07-guest'; await cold(); await flow('AC07', FLOWS.guest); state.stage = 'AC07-guard';
    await adb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'sportcentermobile://cart', '-p', SOURCE.appId]);
    await flow('AC07', FLOWS.guard); state.cases.AC07 = 'passed'; state.status = 'passed'; state.stage = 'completed';
  } catch (error) {
    const code = error?.code === 'SANDBOX_SETUP_CLEANUP_FAILED' ? 'ACCOUNT_SANDBOX_CLEANUP_FAILED' : safeCode(error);
    state.errors.push(new AccountError(code)); state.failureStage = state.stage;
    const blocked = ['ACCOUNT_FIXTURE_EMPTY', 'ACCOUNT_FIXTURE_STOCK'].includes(code); state.cases[caseId] = blocked ? 'blocked' : 'failed'; state.status = blocked ? 'blocked' : 'failed';
  } finally {
    if (loginAttempted && !loggedOut) {
      try {
        await adb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'sportcentermobile://account', '-p', SOURCE.appId]);
        const nodes = await waitUi(items => hasLabel(items, 'Has iniciado sesión en Sport Center.') || hasLabel(items, 'Tu cuenta Sport Center') || hasLabel(items, 'Accede a tu cuenta de Sport Center.'));
        if (hasLabel(nodes, 'Has iniciado sesión en Sport Center.')) await flow('cleanup', FLOWS.logout);
        state.cleanup.localSession = true;
      } catch { state.errors.push(new AccountError('ACCOUNT_SESSION_CLEANUP_UNCONFIRMED')); state.failureStage ||= 'cleanup-session'; }
    } else state.cleanup.localSession = !loginAttempted || loggedOut;
    try {
      if (installed) { await adb(['shell', 'am', 'force-stop', SOURCE.appId]); await adb(['uninstall', SOURCE.appId]); }
      if (remoteCreated) { await adb(['shell', 'rm', '-f', remote + '/ui.xml']); await adb(['shell', 'rmdir', remote]); }
      need(!(await adb(['shell', 'pm', 'list', 'packages', SOURCE.appId])).trim(), 'ACCOUNT_DEVICE_CLEANUP_FAILED');
      state.cleanup.device = true;
    } catch { state.errors.push(new AccountError('ACCOUNT_DEVICE_CLEANUP_FAILED')); state.failureStage ||= 'cleanup-device'; }
    try {
      if (box) { await box.cleanup(); state.cleanup.sandbox = true;
        state.sandboxDiagnostic = { sandboxCode: null, cleanupCode: null, cleanupConfirmed: true }; }
      else { state.cleanup.sandbox = !setupAttempted || state.sandboxDiagnostic?.cleanupConfirmed === true;
        need(state.cleanup.sandbox, 'ACCOUNT_SANDBOX_CLEANUP_FAILED'); }
    }
    catch (error) { state.errors.push(new AccountError('ACCOUNT_SANDBOX_CLEANUP_FAILED')); state.failureStage ||= 'cleanup-sandbox';
      state.sandboxDiagnostic ||= safeSandboxDiagnostic(error); }
    try { if (parentContext && state.cleanup.sandbox === true) parentContext.confirm(true); }
    catch { state.errors.push(new AccountError(PARENT_ERROR)); state.failureStage ||= 'cleanup-sandbox'; }
  }
  if (state.errors.some(error => /CLEANUP/.test(error.code))) state.status = 'failed';
  return publicReport(state);
}

const execute = promisify(execFile);
async function command(file, args, options = {}) {
  const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['ANDROID_TEST_EMAIL', 'ANDROID_TEST_PASSWORD'].includes(key)));
  try { const result = await execute(file, args, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 45000, windowsHide: true, env: childEnv, ...options }); return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 }; }
  catch { throw new AccountError('ACCOUNT_PROCESS_FAILED'); } // Never render child errors/argv/streams.
}
function locations(env) {
  need(typeof env.RUNNER_TEMP === 'string' && path.isAbsolute(env.RUNNER_TEMP), 'ACCOUNT_SANDBOX_FAILED');
  const scratch = path.join(env.RUNNER_TEMP, 'sportcenter-account-control');
  return { scratch, metadata: path.join(scratch, 'build.json'), apk: path.join(scratch, 'candidate.apk'),
    parent: path.join(scratch, 'sandbox-parent.json'), proof: 'test-results/android-account-source.json', report: 'test-results/android-account.json' };
}
function privateDirectory(directory) {
  try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (error) { need(error.code === 'EEXIST', 'ACCOUNT_SANDBOX_FAILED'); }
  const stat = fs.lstatSync(directory); need(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, 'ACCOUNT_SANDBOX_FAILED');
}
function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const handle = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
  try { fs.writeFileSync(handle, JSON.stringify(value, null, 2) + '\n'); } finally { fs.closeSync(handle); }
}
async function boundedResponse(response, limit) {
  need(response.ok && response.body, 'ACCOUNT_PROCESS_FAILED'); const chunks = []; let length = 0;
  for await (const chunk of response.body) { length += chunk.length; need(length <= limit, 'ACCOUNT_PROCESS_FAILED'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}
async function github(env, suffix) {
  need(typeof env.GITHUB_TOKEN === 'string' && env.GITHUB_TOKEN.length > 0, 'ACCOUNT_PRODUCER_NOT_APPROVED');
  try {
    const response = await fetch('https://api.github.com/repos/' + SOURCE.repository + suffix, { headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(30000), redirect: 'error' });
    return JSON.parse((await boundedResponse(response, 2 * 1024 * 1024)).toString('utf8'));
  } catch { throw new AccountError('ACCOUNT_PRODUCER_NOT_APPROVED'); }
}
async function prepare(env, run = command) {
  need(!env.ANDROID_TEST_EMAIL && !env.ANDROID_TEST_PASSWORD, 'ACCOUNT_AUTOMATION_SCOPE');
  const files = locations(env); privateDirectory(files.scratch);
  const out = async args => (await run('git', args)).stdout;
  const context = verifyAutomation({ sha: env.GITHUB_SHA, head: await out(['rev-parse', 'HEAD']), ref: env.GITHUB_REF,
    repository: env.GITHUB_REPOSITORY, changed: await out(['diff', '--name-only', '--no-renames', SOURCE.commit, 'HEAD']), dirty: await out(['status', '--porcelain']) });
  await out(['merge-base', '--is-ancestor', SOURCE.commit, 'HEAD']);
  const producer = await github(env, '/actions/runs/' + SOURCE.producer);
  const jobs = await github(env, '/actions/runs/' + SOURCE.producer + '/attempts/' + SOURCE.attempt + '/jobs?per_page=100');
  const artifact = await github(env, '/actions/artifacts/' + SOURCE.artifact);
  need(artifact.id === SOURCE.artifact && artifact.name === 'android-evidence' && artifact.expired === false && artifact.size_in_bytes === SOURCE.artifactBytes &&
    artifact.digest === 'sha256:' + SOURCE.artifactSha256 && artifact.workflow_run?.id === SOURCE.producer && artifact.workflow_run?.head_sha === SOURCE.commit, 'ACCOUNT_ARTIFACT_MISMATCH');
  const response = await fetch('https://api.github.com/repos/' + SOURCE.repository + '/actions/artifacts/' + SOURCE.artifact + '/zip', {
    headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json' }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  need(response.status === 302, 'ACCOUNT_ARTIFACT_MISMATCH'); const url = new URL(response.headers.get('location'));
  need(url.protocol === 'https:' && !url.username && !url.password && /(?:^|\.)(?:blob\.core\.windows\.net|actions\.githubusercontent\.com)$/.test(url.hostname), 'ACCOUNT_ARTIFACT_MISMATCH');
  // GitHub token is deliberately NOT forwarded to the redirected blob origin.
  const bytes = await boundedResponse(await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60000) }), SOURCE.artifactBytes);
  need(bytes.length === SOURCE.artifactBytes && createHash('sha256').update(bytes).digest('hex') === SOURCE.artifactSha256, 'ACCOUNT_ARTIFACT_MISMATCH');
  const archive = path.join(files.scratch, 'parent.zip'); fs.writeFileSync(archive, bytes, { flag: 'wx', mode: 0o600 });
  try {
    const names = (await run('unzip', ['-Z1', archive])).stdout.trim().split(/\r?\n/);
    const json = async name => {
      const matches = names.filter(item => item === name || item.endsWith('/' + name));
      need(matches.length === 1 && !matches[0].split('/').includes('..') && !matches[0].startsWith('/'), 'ACCOUNT_ARTIFACT_MISMATCH');
      return JSON.parse((await run('unzip', ['-p', archive, matches[0]])).stdout);
    };
    const proof = verifyProducer(producer, jobs, await json('android-build.json'), await json('android-inspection.json'));
    save(files.proof, { version: 1, ...context, ...proof, apkSha256: SOURCE.sha256, buildId: SOURCE.buildId,
      parentArtifactId: SOURCE.artifact, parentArtifactSha256: SOURCE.artifactSha256, parentInspectionVerified: true });
  } finally { fs.rmSync(archive, { force: true }); }
}
function updateSource(file, value) {
  const stat = fs.lstatSync(file); need(stat.isFile() && !stat.isSymbolicLink(), 'ACCOUNT_ARTIFACT_MISMATCH');
  const target = file + '.tmp'; save(target, value); fs.renameSync(target, file);
}
function validateParentProof(proof, actual, environmentPath) {
  need(proof && Object.keys(proof).sort().join(',') === 'cleanupConfirmed,device,inode,mode,path,uid,version' && proof.version === 1 &&
    /^\/tmp\/sportcenter-account-[A-Za-z0-9]{6}$/.test(proof.path || '') && environmentPath === proof.path &&
    typeof proof.cleanupConfirmed === 'boolean' && proof.mode === '711' && Number.isSafeInteger(proof.uid) && proof.uid > 0 &&
    /^\d+$/.test(proof.device || '') && /^\d+$/.test(proof.inode || ''), PARENT_ERROR);
  need(actual && actual.directory === true && actual.symlink === false && actual.tmpCanonical === '/tmp' && actual.canonical === proof.path &&
    actual.uid === proof.uid && actual.callerUid === proof.uid && actual.device === proof.device && actual.inode === proof.inode && actual.mode === '711', PARENT_ERROR);
  return proof.path;
}
function parentFacts(base) {
  const stat = fs.lstatSync(base, { bigint: true });
  return { directory: stat.isDirectory(), symlink: stat.isSymbolicLink(), canonical: fs.realpathSync(base), tmpCanonical: fs.realpathSync('/tmp'),
    uid: Number(stat.uid), callerUid: process.getuid(), device: String(stat.dev), inode: String(stat.ino), mode: (Number(stat.mode) & 0o7777).toString(8) };
}
function readParent(env) {
  need(process.platform === 'linux', PARENT_ERROR);
  const file = locations(env).parent, descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor); need(stat.isFile() && stat.size <= 4096 && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600, PARENT_ERROR);
    const proof = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
    validateParentProof(proof, parentFacts(proof.path), env.ACCOUNT_SANDBOX_PARENT); return proof;
  } catch { throw new AccountError(PARENT_ERROR); } finally { fs.closeSync(descriptor); }
}
function sandboxParent(env) {
  let proof; try { proof = readParent(env); } catch { throw new AccountError(PARENT_ERROR); }
  return { path: proof.path,
    confirm(value) { need(typeof value === 'boolean', PARENT_ERROR); proof = readParent(env); updateSource(locations(env).parent, { ...proof, cleanupConfirmed: value }); },
    async verifyMaestro(run) {
      try {
        const result = await run('/bin/sh', ['-c', 'command -v maestro'], { env: { PATH: env.PATH, LANG: 'C.UTF-8' } });
        const executable = (typeof result === 'string' ? result : result.stdout).trim();
        need(fs.realpathSync(executable) === proof.path + '/maestro-account/maestro/bin/maestro' && fs.statSync(executable).isFile(), TOOL_ERROR);
      } catch { throw new AccountError(TOOL_ERROR); }
    },
  };
}
function runtimeDirectory(env) {
  need(process.platform === 'linux' && !env.ANDROID_TEST_EMAIL && !env.ANDROID_TEST_PASSWORD, PARENT_ERROR);
  need(typeof env.GITHUB_ENV === 'string' && path.isAbsolute(env.GITHUB_ENV), PARENT_ERROR);
  const files = locations(env); privateDirectory(files.scratch); need(!fs.existsSync(files.parent), PARENT_ERROR);
  const base = fs.mkdtempSync('/tmp/sportcenter-account-'); fs.chmodSync(base, 0o711);
  const actual = parentFacts(base), proof = { version: 1, path: base, device: actual.device, inode: actual.inode, uid: actual.uid, mode: '711', cleanupConfirmed: true };
  validateParentProof(proof, actual, base); save(files.parent, proof);
  fs.appendFileSync(env.GITHUB_ENV, 'ACCOUNT_SANDBOX_PARENT=' + base + '\n');
}
function assertParentCleanup(proof) { need(proof?.cleanupConfirmed === true, PARENT_ERROR); }
function cleanupParent(env) {
  const file = locations(env).parent;
  if (!fs.existsSync(file)) return;
  const proof = readParent(env); assertParentCleanup(proof);
  // Exact new /tmp directory, inode/device/uid/mode verified immediately above.
  // No fallback and no modification/removal of RUNNER_TEMP, HOME or ancestors.
  fs.rmSync(proof.path, { recursive: true }); fs.rmSync(file);
}
async function probe(env, { run = command, create = createSandbox,
  parent = sandboxParent, readSource = file => JSON.parse(fs.readFileSync(file, 'utf8')), writeSource = updateSource, writeReport = save } = {}) {
  need(!env.ANDROID_TEST_EMAIL && !env.ANDROID_TEST_PASSWORD && !env.EXPO_TOKEN && !env.GITHUB_TOKEN, 'ACCOUNT_AUTOMATION_SCOPE');
  const files = locations(env), context = readSource(files.proof);
  need(context.artifactSourceCommit === SOURCE.commit && context.automationCommit === env.GITHUB_SHA && context.producerVerified === true &&
    context.producerRun === SOURCE.producer && context.producerAttempt === SOURCE.attempt && context.apkSha256 === SOURCE.sha256 &&
    context.parentInspectionVerified === true, 'ACCOUNT_ARTIFACT_MISMATCH');
  const state = { status: 'failed', stage: 'probe-adb-start-server', automationCommit: env.GITHUB_SHA, cases: {}, errors: [],
    cleanup: { device: true, localSession: true, sandbox: false } };
  let box, parentContext, failure, setupAttempted = false;
  try {
    const started = await run('adb', ['start-server']);
    need(!started || !Object.hasOwn(started, 'exitCode') || started.exitCode === 0, 'ACCOUNT_PROCESS_FAILED');
    state.stage = 'sandbox-parent-verify'; parentContext = parent(env); await parentContext.verifyMaestro(run); parentContext.confirm(false);
    state.stage = 'sandbox-probes'; setupAttempted = true; state.sandboxAttempted = true;
    box = await create({ runnerTemp: parentContext.path, runId: env.GITHUB_RUN_ID, env });
    need(box.probes?.ipv4RejectedWithCounter === true && box.probes?.adbLoopbackReachable === true, 'ACCOUNT_SANDBOX_FAILED');
    state.stage = 'sandbox-tool-version'; const version = await box.runAs(['maestro', '--version'], {}, 30000);
    need(version.exitCode === 0 && version.timedOut !== true && version.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1) === '2.12.0', TOOL_ERROR);
  } catch (error) { failure = error; if (setupAttempted) state.sandboxDiagnostic = safeSandboxDiagnostic(error); }
  if (box) {
    try { await box.cleanup(); state.cleanup.sandbox = true; }
    catch (error) { failure ||= error; state.sandboxDiagnostic ||= safeSandboxDiagnostic(error); }
  } else state.cleanup.sandbox = !setupAttempted || state.sandboxDiagnostic?.cleanupConfirmed === true;
  try { if (parentContext && state.cleanup.sandbox === true) parentContext.confirm(true); }
  catch (error) { failure ||= error; state.cleanup.sandbox = false; }
  if (failure || !state.cleanup.sandbox) {
    state.errors = [new AccountError(!setupAttempted || failure instanceof AccountError ? safeCode(failure) : state.cleanup.sandbox ? 'ACCOUNT_SANDBOX_FAILED' : 'ACCOUNT_SANDBOX_CLEANUP_FAILED')];
    if (!state.cleanup.sandbox) state.errors.push(new AccountError('ACCOUNT_SANDBOX_CLEANUP_FAILED'));
    writeReport(files.report, publicReport(state));
    throw new AccountError(state.errors[0].code);
  }
  writeSource(files.proof, { ...context, sandboxPreflight: { status: 'passed', ipv4RejectedWithCounter: true,
    ipv6RulesVerified: true, adbLoopbackReachable: true, maestroVersionVerified: true, cleanupConfirmed: true,
    scope: 'no-emulator-no-account-Maestro-version-only' } });
}
async function main(mode, env = process.env) {
  const files = locations(env);
  if (mode === 'prepare') return prepare(env);
  if (mode === 'runtime-dir') return runtimeDirectory(env);
  if (mode === 'probe') return probe(env);
  if (mode === 'kvm') {
    need(!env.ANDROID_TEST_EMAIL && !env.ANDROID_TEST_PASSWORD, 'ACCOUNT_AUTOMATION_SCOPE');
    const { prepareKvm } = require(path.join(process.cwd(), 'scripts', 'android-16k.js'));
    return prepareKvm({ env, save: () => {} });
  }
  if (mode === 'view') {
    need(!env.ANDROID_TEST_EMAIL && !env.ANDROID_TEST_PASSWORD, 'ACCOUNT_AUTOMATION_SCOPE'); privateDirectory(files.scratch);
    const result = await command('npx', ['--yes', 'eas-cli@27.4.0', 'build:view', SOURCE.buildId, '--json'], { timeout: 120000 });
    const build = JSON.parse(result.stdout); verifyBuild(build); save(files.metadata, build); return;
  }
  if (mode === 'download') {
    need(!env.ANDROID_TEST_EMAIL && !env.ANDROID_TEST_PASSWORD, 'ACCOUNT_AUTOMATION_SCOPE');
    const build = JSON.parse(fs.readFileSync(files.metadata, 'utf8')); const url = verifyBuild(build);
    // Reuse HTTPS/manual redirect download and immutable hash verification; no rebuild.
    const profiles = require(path.join(process.cwd(), 'scripts', 'android-profiles.js'));
    await profiles.download(url, files.apk, SOURCE.sha256); fs.chmodSync(files.apk, 0o600); return;
  }
  if (mode === 'runtime') {
    const context = JSON.parse(fs.readFileSync(files.proof, 'utf8'));
    const { xmlTree } = require(path.join(process.cwd(), 'scripts', 'android-pinning.js'));
    let result;
    try { result = await runAcceptance({ env, apk: files.apk, context, run: command, xmlTree }); }
    catch (error) { result = publicReport({ status: 'failed', errors: [error] }); }
    save(files.report, result); need(result.status === 'passed', 'ACCOUNT_UI_TIMEOUT'); return;
  }
  if (mode === 'finish') {
    const value = JSON.parse(fs.readFileSync(files.report, 'utf8'));
    need(value.status === 'passed' && value.apkSha256 === SOURCE.sha256 && value.artifactSourceCommit === SOURCE.commit && value.automationCommit === env.GITHUB_SHA &&
      value.cases?.length === CASES.length && value.cases.every((item, index) => item.id === CASES[index] && item.status === 'passed') &&
      value.cleanup?.device === true && value.cleanup?.sandbox === true && value.cleanup?.localSession === true && value.failureCodes?.length === 0, 'ACCOUNT_UI_TIMEOUT'); return;
  }
  if (mode === 'summary') {
    let result; try { result = JSON.parse(fs.readFileSync(files.report, 'utf8')); } catch { result = publicReport({ status: 'failed' }); }
    need(result.buildId === SOURCE.buildId && result.apkSha256 === SOURCE.sha256 && result.artifactSourceCommit === SOURCE.commit, 'ACCOUNT_ARTIFACT_MISMATCH');
    const lines = ['Prueba de cuenta dedicada del APK F2: ' + (['passed', 'blocked', 'failed'].includes(result.status) ? result.status : 'failed') + '.',
      ...CASES.map(id => id + ': ' + (result.cases?.find(item => item.id === id)?.status === 'passed' ? 'passed' : 'not-passed')),
      'Alcance: lectura, restauración y cierre local; sin pedido, pago, cambios de perfil/dirección/carrito ni prueba física.'];
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, lines.join('\n\n') + '\n'); return;
  }
  if (mode === 'cleanup') {
    cleanupParent(env);
    const directory = path.resolve(files.scratch), parent = path.resolve(env.RUNNER_TEMP);
    need(path.dirname(directory) === parent && path.basename(directory) === 'sportcenter-account-control', 'ACCOUNT_SANDBOX_FAILED');
    if (fs.existsSync(directory)) { need(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink(), 'ACCOUNT_SANDBOX_FAILED'); fs.rmSync(directory, { recursive: true }); }
    return;
  }
  throw new AccountError('ACCOUNT_AUTOMATION_SCOPE');
}
module.exports = { SOURCE, CASES, STAGES, AUTOMATION_FILES, CODES, AccountError, safeCode, verifyProducer, verifyBuild, verifyAutomation,
  credentials, parsePrivateUi, hasLabel, point, profileMatches, fixtureStatus, yaml, FLOWS, verifyJUnit, publicReport, runAcceptance,
  locations, prepare, validateParentProof, assertParentCleanup, runtimeDirectory, sandboxParent, probe, main };
if (require.main === module) main(process.argv[2]).catch(error => { process.stderr.write(safeCode(error) + '\n'); process.exitCode = 1; });

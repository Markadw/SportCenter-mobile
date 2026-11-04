// Explicit native acceptance; requiring this module performs no operations.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: pause } = require('node:timers/promises');
const { createSandbox, SandboxError, SANDBOX_ERROR_CODES, safeSandboxDiagnostic, isSafeSandboxDiagnostic } = require('./account-sandbox.cjs');
const { validateProbeReport, REPORT_KEYS: API_REPORT_KEYS } = require('./account-auth-probe.cjs');
const { TEST_NAME, STATE_KEYS, RESTORATION_KEYS, ERROR_CODES: FIXTURE_CODES, captureFixture, restoreFixture,
  validateCaptureReport, validateRestorationReport } = require('./account-fixture.cjs');

const SOURCE = Object.freeze({
  "repository": "Markadw/SportCenter-mobile",
  "commit": "8e8a6da3fedbb61057efaa7fe30b6923b6195595",
  "projectId": "c608a591-dfad-47d6-98cf-e714e821c269",
  "appId": "com.markadw.sportcenter",
  "api": "https://back-sport-ghxk.onrender.com",
  "buildId": "65ec0aec-31df-4305-adfe-03cab1461e0f",
  "sha256": "895f51818410574da55c29eca493910af19a87e47ffcc7177c20c46776659542",
  "fingerprint": "0cfb627c02154da92e1d19f466723a9ca5a1b0621f38e74d652493014d59fb8f",
  "producer": 41810909053,
  "attempt": 1,
  "tag": "candidate/android-rc5",
  "artifact": 13313681074,
  "artifactBytes": 178005,
  "artifactSha256": "84a1976a6af896b1efbcfafb2afdeee8f92cd7348586b00c267b5815a2176128",
  "appVersion": "1.0.0",
  "appBuildVersion": "1"
});
const CASES = Object.freeze(['AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07']);
const READ_ONLY_CHECKS = Object.freeze(['RO01', 'RO02', 'RO03', 'RO04']);
const MUTATION_CHECKS = Object.freeze(['MU01', 'MU02', 'MU03', 'MU04', 'MU05']);
const MUTATION_FLAGS = Object.freeze(['profileSaved', 'profilePersisted', 'profileUiRestored', 'cartIncreased', 'cartPersisted',
  'cartUiRestored', 'cartRemoved', 'cartReadded', 'uiStopped', ...RESTORATION_KEYS]);
const PROFILE_CONTROLS = Object.freeze({
  nombre: { label: 'Nombre', kind: 'input', direction: 'UP' },
  aPaterno: { label: 'Apellido paterno', kind: 'input', direction: 'DOWN' },
  aMaterno: { label: 'Apellido materno', kind: 'input', direction: 'DOWN' },
  email: { label: 'Correo', kind: 'input', direction: 'DOWN' },
  telefono: { label: 'Teléfono', kind: 'input', direction: 'DOWN' },
  guardar: { label: 'Guardar cambios', kind: 'button', direction: 'DOWN' },
});
const PROFILE_STAGES = Object.freeze(['MU01', 'MU02'].flatMap(id => [
  ...['nombre', 'aPaterno', 'aMaterno', 'email', 'telefono'].map(key => id + '-profile-preimage-' + key),
  ...['name-control', 'name-input', 'save-control', 'save-response', 'name-verify'].map(key => id + '-profile-' + key),
]));
const READ_ONLY_URLS = Object.freeze({ orders: 'sportcentermobile://orders', account: 'sportcentermobile://account',
  profile: 'sportcentermobile://profile', cart: 'sportcentermobile://cart', checkout: 'sportcentermobile://checkout', privacy: 'sportcentermobile://privacy' });
const STAGES = Object.freeze(['preflight', 'device-check', 'probe-adb-start-server', 'sandbox-parent-verify', 'sandbox-probes', 'sandbox-tool-version', 'sandbox-file-roundtrip', 'app-install', 'AC01-navigate', 'AC01-email',
  'api-auth-probe', 'AC01-password', 'AC01-input-check', 'AC01-password-hide', 'AC01-submit', 'AC01-await-account', 'AC02-open', 'AC02-scroll', 'AC02-compare', 'AC03-open', 'AC03-fixture',
  'AC04-summary', 'AC05-restore', 'AC06-logout', 'AC07-guest', 'AC07-guard', 'RO01-orders', 'RO01-return',
  'RO02-profile-guard', 'RO03-checkout-guard', 'RO04-privacy', 'MU01-profile-save', 'MU02-profile-persist', 'MU02-profile-restore',
  'MU03-cart-increase', 'MU03-cart-persist', 'MU03-cart-restore', 'MU04-target-preflight', 'MU04-cart-remove', 'MU04-cart-readd',
  'MU05-baseline', 'cleanup-stop-ui', ...PROFILE_STAGES, 'completed', 'cleanup-session', 'cleanup-device', 'cleanup-sandbox']);
const AUTOMATION_FILES = Object.freeze(['config/android-release-validation.json', 'scripts/android-release.js', '__tests__/androidRelease.test.js',
  'tests/manual/android-release.md', 'scripts/android-profiles.js', '__tests__/androidProfiles.test.js',
  '.github/workflows/android-validation.yml', '.github/workflows/ci.yml', 'scripts/validate-test-configs.js',
  '__tests__/pipelines.test.js', '__tests__/candidatePolicy.test.js', '__tests__/android16k.test.js',
  'docs/seguridad-candidata.md', 'tests/plan.json', 'README.md',
  'scripts/android-account.cjs', 'scripts/account-sandbox.cjs', '__tests__/androidAccount.test.js',
  '__tests__/accountSandbox.test.js', '__tests__/androidAccountWorkflow.test.js', 'tests/manual/android-account.md',
  'scripts/account-auth-probe.cjs', '__tests__/accountAuthProbe.test.js', 'scripts/account-fixture.cjs', '__tests__/accountFixture.test.js']);
const CODES = Object.freeze(['ACCOUNT_SECRETS_MISSING', 'ACCOUNT_FIXTURE_INVALID', 'ACCOUNT_FIXTURE_EMPTY',
  'ACCOUNT_FIXTURE_STOCK', 'ACCOUNT_PRODUCER_NOT_APPROVED', 'ACCOUNT_ARTIFACT_MISMATCH', 'ACCOUNT_BUILD_MISMATCH',
  'ACCOUNT_AUTOMATION_SCOPE', 'ACCOUNT_APP_TREE_CHANGED', 'ACCOUNT_UI_INVALID', 'ACCOUNT_UI_TIMEOUT',
  'ACCOUNT_UI_ACTION_AMBIGUOUS', 'ACCOUNT_PROFILE_MISMATCH', 'ACCOUNT_MAESTRO_FAILED', 'ACCOUNT_JUNIT_INVALID',
  'ACCOUNT_PROCESS_FAILED', 'ACCOUNT_SESSION_CLEANUP_UNCONFIRMED', 'ACCOUNT_DEVICE_CLEANUP_FAILED',
  'ACCOUNT_SANDBOX_FAILED', 'ACCOUNT_SANDBOX_CLEANUP_FAILED', 'ACCOUNT_UNEXPECTED_FAILURE', 'ACCOUNT_INPUT_MISMATCH',
  'ACCOUNT_API_AUTH_BLOCKED', 'ACCOUNT_API_AUTH_FAILED', 'ACCOUNT_API_AUTH_CLEANUP_FAILED',
  'ACCOUNT_ORDERS_READ_FAILED', 'ACCOUNT_GUEST_GUARD_FAILED', 'ACCOUNT_PRIVACY_READ_FAILED',
  'ACCOUNT_MUTATION_UI_INVALID', 'ACCOUNT_MUTATION_UI_NOT_STOPPED', 'ACCOUNT_FIXTURE_RESTORATION_FAILED']);
const PARENT_ERROR = 'ACCOUNT_SANDBOX_PARENT_INVALID';
const TOOL_ERROR = 'ACCOUNT_SANDBOX_TOOL_INVALID';
const PREFLIGHT_FILE = 'Sport Center · comprobación privada\n';
const LOGIN_ERRORS = Object.freeze({
  'No pudimos confirmar una sesión válida. Vuelve a intentarlo.': 'INVALID_SESSION_RESPONSE',
  'No pudimos conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.': 'NETWORK_UNAVAILABLE',
  'Has realizado demasiados intentos. Espera un minuto antes de volver a intentarlo.': 'RATE_LIMITED',
  'El servidor no está disponible. Inténtalo más tarde.': 'SERVER_UNAVAILABLE',
  'Tu cuenta todavía no está verificada. Revisa el correo que recibiste para activarla.': 'ACCOUNT_UNVERIFIED',
  'El correo o la contraseña no son correctos. Revisa tus datos.': 'CREDENTIALS_REJECTED',
  'No se pudo iniciar sesión. Inténtalo de nuevo más tarde.': 'LOGIN_REJECTED',
  'Escribe tu correo.': 'EMAIL_REQUIRED', 'Escribe un correo válido.': 'EMAIL_INVALID',
  'Escribe tu contraseña.': 'PASSWORD_REQUIRED', 'La contraseña debe tener al menos 8 caracteres.': 'PASSWORD_TOO_SHORT',
});
const LOGIN_ERROR_CODES = Object.freeze(Object.values(LOGIN_ERRORS));
class AccountError extends Error { constructor(code) { super(code); this.code = code; } }
function need(value, code) { if (!value) throw new AccountError(code); }
function trustedSandboxError(error) { return error instanceof SandboxError && SANDBOX_ERROR_CODES.includes(error.code); }
function safeCode(error) { return [...CODES, ...FIXTURE_CODES.filter(code => code !== 'NONE'), PARENT_ERROR, TOOL_ERROR].includes(error?.code) ? error.code : trustedSandboxError(error) ? 'ACCOUNT_SANDBOX_FAILED' : 'ACCOUNT_UNEXPECTED_FAILURE'; }
function verifyProducer(run, jobs, candidate, inspection) {
  need(run?.id === SOURCE.producer && run.run_attempt === SOURCE.attempt && run.head_sha === SOURCE.commit &&
    run.head_branch === SOURCE.tag && run.event === 'push' && run.path === '.github/workflows/api-android.yml' &&
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
  const input = source.replace(/^<\?xml version=['"]1\.0['"](?: encoding=['"]UTF-8['"])?(?: standalone=['"]yes['"])?\s*\?>/, '');
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
function inputMatches(nodes, label, expected) {
  const found = labelled(nodes, label).filter(node => node.class === 'android.widget.EditText');
  return found.length === 1 && found[0].text === expected;
}
function classifyLoginUi(nodes) {
  const owned = nodes.filter(node => node.package === SOURCE.appId), codes = [];
  for (const [message, code] of Object.entries(LOGIN_ERRORS)) if (owned.some(node => [node.text, node['content-desc']].includes(message))) codes.push(code);
  return { observed: true, hasLogin: hasLabel(owned, 'Accede a tu cuenta de Sport Center.'),
    hasAccount: hasLabel(owned, 'Mi cuenta') && hasLabel(owned, 'Has iniciado sesión en Sport Center.'),
    busy: hasLabel(owned, 'Ingresando…') || labelled(owned, 'Iniciar sesión').some(node => node.clickable === 'true' && node.enabled === 'false'),
    errorCodes: codes };
}
function safeLoginUi(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'busy,errorCodes,hasAccount,hasLogin,observed' ||
    !['observed', 'hasLogin', 'hasAccount', 'busy'].every(key => typeof value[key] === 'boolean') ||
    !Array.isArray(value.errorCodes) || value.errorCodes.length > LOGIN_ERROR_CODES.length ||
    !value.errorCodes.every(code => LOGIN_ERROR_CODES.includes(code)) || new Set(value.errorCodes).size !== value.errorCodes.length) return null;
  return { observed: value.observed, hasLogin: value.hasLogin, hasAccount: value.hasAccount, busy: value.busy, errorCodes: [...value.errorCodes] };
}
function safeInputObservation(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'emailMatches,passwordHidden,passwordMatches' ||
    !Object.values(value).every(item => item === null || typeof item === 'boolean')) return null;
  return { emailMatches: value.emailMatches, passwordMatches: value.passwordMatches, passwordHidden: value.passwordHidden };
}
function fixtureStatus(nodes) {
  if (hasLabel(nodes, 'Tu carrito está vacío')) return 'empty';
  if (nodes.some(node => node.package === SOURCE.appId && /^Revisa las existencias \(\d+ disponibles\)\.$/.test(node.text || ''))) return 'stock';
  if (hasLabel(nodes, 'No pudimos cargar el carrito')) return 'error';
  return hasLabel(nodes, 'Subtotal') ? 'ready' : 'loading';
}
function orderListStatus(nodes) {
  if (['No se pudo cargar', 'Carga cancelada', 'Accede a tu cuenta de Sport Center.'].some(label => hasLabel(nodes, label))) return 'error';
  if (hasLabel(nodes, 'Cargando información')) return 'loading';
  const header = ['Mis pedidos', 'Aquí aparecen tus pedidos que ya no están pendientes de pago.', 'Actualizar pedidos'].every(label => hasLabel(nodes, label));
  if (!header) return 'loading';
  const empty = hasLabel(nodes, 'Aún no tienes pedidos registrados en esta lista.');
  const list = nodes.some(node => node.package === SOURCE.appId && node.enabled === 'true' && node.clickable === 'true' &&
    /^Ver pedido [1-9][0-9]*$/.test(node['content-desc'] || ''));
  if (empty && list) return 'error';
  return empty ? 'empty' : list ? 'list' : 'loading';
}
function guestGuardStatus(nodes, route) {
  need(route === 'profile' || route === 'checkout', 'ACCOUNT_GUEST_GUARD_FAILED');
  const privateLabels = ['Has iniciado sesión en Sport Center.', 'Actualiza tus datos personales y de contacto.', 'Guardar cambios',
    'Dirección de envío', 'Método de envío', 'Subtotal', 'Continuar a Mercado Pago'];
  if (privateLabels.some(label => hasLabel(nodes, label))) return 'private';
  const expected = route === 'profile' ? 'Accede a tu cuenta de Sport Center.' : 'Inicia sesión para continuar';
  return hasLabel(nodes, expected) && hasLabel(nodes, 'Iniciar sesión') ? 'ready' : 'loading';
}
function privacyVisible(nodes) { return hasLabel(nodes, 'Datos y sesión en este dispositivo'); }
function fieldMatches(nodes, label, expected) { return inputMatches(nodes, label, expected); }
function cartQuantityMatches(nodes, target, quantity) {
  const quantities = labelled(nodes, 'Cantidad de ' + target.name + ': ' + quantity);
  const remove = labelled(nodes, 'Eliminar ' + target.name).filter(node => node.clickable === 'true' && node.enabled === 'true');
  return quantities.length === 1 && quantities[0].text === String(quantity) && remove.length === 1;
}
function targetVisible(nodes, target) {
  return nodes.some(node => node.package === SOURCE.appId && ([node.text, node['content-desc']].includes('Eliminar ' + target.name) ||
    (node['content-desc'] || '').startsWith('Cantidad de ' + target.name + ': ')));
}
function rectangle(node) {
  const value = node?.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!value) return null;
  const result = value.slice(1).map(Number);
  return result[2] > result[0] && result[3] > result[1] && result.every(n => n >= 0 && n < 8192) ? result : null;
}
function productQuantity(nodes) {
  const minus = labelled(nodes, 'Restar cantidad').filter(node => node.clickable === 'true');
  const plus = labelled(nodes, 'Sumar cantidad').filter(node => node.clickable === 'true');
  if (minus.length !== 1 || plus.length !== 1) return null;
  const a = rectangle(minus[0]), b = rectangle(plus[0]); if (!a || !b || a[2] >= b[0]) return null;
  const values = nodes.filter(node => node.package === SOURCE.appId && node.class === 'android.widget.TextView' && /^[1-9]\d?$/.test(node.text || '')).filter(node => {
    const r = rectangle(node); if (!r) return false;
    const x = (r[0] + r[2]) / 2, y = (r[1] + r[3]) / 2;
    return x > a[2] && x < b[0] && y >= Math.max(a[1], b[1]) && y <= Math.min(a[3], b[3]);
  });
  return values.length === 1 ? Number(values[0].text) : null;
}
function mutationEvidence(value) { return Object.fromEntries(MUTATION_FLAGS.map(key => [key, value?.[key] === true])); }
function mutationsPassed(value) {
  return MUTATION_FLAGS.filter(key => !['mutationUncertain', 'concurrentChangeObserved'].includes(key)).every(key => value?.[key] === true) &&
    value?.mutationUncertain === false && value?.concurrentChangeObserved === false;
}
function profileScrollBody(key) {
  need(Object.hasOwn(PROFILE_CONTROLS, key), 'ACCOUNT_MUTATION_UI_INVALID');
  const control = PROFILE_CONTROLS[key], selector = '^' + control.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
  return '- scrollUntilVisible:\n    element:\n      text: ' + JSON.stringify(selector) + '\n    direction: ' + control.direction + '\n    timeout: 30000\n    centerElement: true';
}
function yaml(name, body) { need(/^(?:AC0[1-7](?:-(?:navigate|email|password))?|RO04|MU0[1-5]|cleanup)$/.test(name), 'ACCOUNT_MAESTRO_FAILED'); return 'appId: ' + SOURCE.appId + '\nname: ' + name + ' private account\n---\n' + body + '\n'; }
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
  privacy: '- extendedWaitUntil:\n    visible: "^Privacidad y términos$"\n    timeout: 45000\n- scrollUntilVisible:\n    element:\n      text: "^Abrir aviso de privacidad del sitio$"\n    timeout: 30000\n- assertVisible: "^Abrir aviso de privacidad del sitio$"\n- scrollUntilVisible:\n    element:\n      text: "^Abrir términos y condiciones del sitio$"\n    timeout: 30000\n- assertVisible: "^Abrir términos y condiciones del sitio$"\n- scrollUntilVisible:\n    element:\n      text: "^Datos y sesión en este dispositivo$"\n    timeout: 30000\n- assertVisible: "^Datos y sesión en este dispositivo$"',
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
  const clean = { version: 1, scope: 'dedicated-account-profile-cart-ui-api34', artifactSourceCommit: SOURCE.commit,
    automationCommit: /^[a-f0-9]{40}$/.test(state.automationCommit || '') ? state.automationCommit : null,
    buildId: SOURCE.buildId, apkSha256: SOURCE.sha256, producerRun: SOURCE.producer, producerAttempt: SOURCE.attempt,
    status: ['passed', 'failed', 'blocked'].includes(state.status) ? state.status : 'failed',
    stage: STAGES.includes(state.failureStage || state.stage) ? state.failureStage || state.stage : 'unknown',
    sandboxAttempted: state.sandboxAttempted === true,
    sandboxDiagnostic: isSafeSandboxDiagnostic(state.sandboxDiagnostic) ? { ...state.sandboxDiagnostic } : null,
    apiContract: validateProbeReport(state.apiContract) ? Object.fromEntries(API_REPORT_KEYS.map(key => [key, state.apiContract[key]])) : null,
    inputObservation: safeInputObservation(state.inputObservation), loginUi: safeLoginUi(state.loginUi),
    cases: CASES.map(id => ({ id, status: ['passed', 'failed', 'blocked', 'not_run'].includes(state.cases?.[id]) ? state.cases[id] : 'not_run' })),
    readOnlyChecks: READ_ONLY_CHECKS.map(id => ({ id, status: ['passed', 'failed', 'not_run'].includes(state.readOnlyChecks?.[id]) ? state.readOnlyChecks[id] : 'not_run' })),
    mutationChecks: MUTATION_CHECKS.map(id => ({ id, status: ['passed', 'failed', 'not_run'].includes(state.mutationChecks?.[id]) ? state.mutationChecks[id] : 'not_run' })),
    mutationEvidence: mutationEvidence(state.mutationEvidence),
    orderListState: ['empty', 'list'].includes(state.orderListState) ? state.orderListState : null,
    cleanup: { device: state.cleanup?.device === true, sandbox: state.cleanup?.sandbox === true,
      localSession: state.cleanup?.localSession === true, fixtureRestoration: state.cleanup?.fixtureRestoration === true, serverRevocation: 'not-independently-observed' },
    failureCodes: [...new Set((state.errors || []).map(safeCode))],
    accountMutations: 'login-refresh-logout-profile-name-cart-target-only-no-address-order-payment-review-email-writes',
    physicalDevice: 'not-run', payment: 'not-run' };
  if (clean.status === 'passed' && (!clean.cases.every(item => item.status === 'passed') || !clean.readOnlyChecks.every(item => item.status === 'passed') ||
    !clean.mutationChecks.every(item => item.status === 'passed') || !mutationsPassed(clean.mutationEvidence) || !clean.cleanup.fixtureRestoration ||
    clean.orderListState === null || !Object.values(clean.cleanup).slice(0, 3).every(Boolean) || clean.failureCodes.length)) clean.status = 'failed';
  return clean;
}
async function apkHash(file) { const hash = createHash('sha256'); for await (const chunk of fs.createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }

// Wiring deliberately accepts a source proof verified in a credential-free step.
// The future workflow must not inject account secrets into prepare/download/inspect.
async function runAcceptance({ env, apk, context, run, xmlTree, create = createSandbox, parent = sandboxParent, capture = captureFixture, restore = restoreFixture, now = Date.now, wait = pause, hash = apkHash }) {
  need(process.platform === 'linux' || env.ACCOUNT_UNIT_TEST === true, 'ACCOUNT_SANDBOX_FAILED');
  need(context?.artifactSourceCommit === SOURCE.commit && context.automationCommit === env.GITHUB_SHA && context.producerVerified === true &&
    context.producerRun === SOURCE.producer && context.producerAttempt === SOURCE.attempt && context.apkSha256 === SOURCE.sha256 && context.parentInspectionVerified === true,
  'ACCOUNT_ARTIFACT_MISMATCH');
  need(await hash(apk) === SOURCE.sha256, 'ACCOUNT_ARTIFACT_MISMATCH');
  const secret = credentials(env), state = { status: 'failed', stage: 'device-check', automationCommit: context.automationCommit, cases: {}, readOnlyChecks: {}, mutationChecks: {},
    mutationEvidence: mutationEvidence(), errors: [], cleanup: {} };
  const mutationState = Object.fromEntries(STATE_KEYS.map(key => [key, false]));
  let fixture = null, box, parentContext, setupAttempted = false, loginAttempted = false, loggedOut = false, caseId = 'AC01', sequence = 0, installed = false, remoteCreated = false,
    bodyCompleted = false, removalUiComplete = false, viewport = null;
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
  const openReadOnly = async route => {
    need(Object.hasOwn(READ_ONLY_URLS, route), 'ACCOUNT_GUEST_GUARD_FAILED');
    await adb(['shell', 'am', 'start', '-W', '-n', SOURCE.appId + '/.MainActivity', '-a', 'android.intent.action.VIEW', '-d', READ_ONLY_URLS[route]]);
  };
  const scrollFor = async (label, kind = 'any') => {
    for (const direction of ['down', 'up']) for (let attempt = 0; attempt < 12; attempt++) {
      const nodes = await readUi(), found = labelled(nodes, label).filter(node => kind === 'input' ? node.class === 'android.widget.EditText' : kind === 'button' ? node.clickable === 'true' : true);
      need(found.length <= 1, 'ACCOUNT_MUTATION_UI_INVALID');
      if (found.length === 1 && rectangle(found[0])) return nodes;
      if (!viewport) {
        const sizes = [...(await adb(['shell', 'wm', 'size'])).matchAll(/(?:Physical|Override) size: (\d+)x(\d+)/g)];
        need(sizes.length > 0 && sizes.length <= 2, 'ACCOUNT_MUTATION_UI_INVALID');
        viewport = sizes.at(-1).slice(1).map(Number);
        need(viewport.every(n => n >= 320 && n < 8192), 'ACCOUNT_MUTATION_UI_INVALID');
      }
      const [width, height] = viewport, x = Math.floor(width / 2), top = Math.floor(height * 0.3), bottom = Math.floor(height * 0.8);
      await adb(['shell', 'input', 'swipe', String(x), String(direction === 'down' ? bottom : top), String(x), String(direction === 'down' ? top : bottom), '250']);
    }
    throw new AccountError('ACCOUNT_UI_TIMEOUT');
  };
  const mutationTap = async (label, flag) => {
    const coordinate = point(await scrollFor(label, 'button'), label, 'button');
    need(STATE_KEYS.includes(flag), 'ACCOUNT_MUTATION_UI_INVALID');
    mutationState[flag] = true; state.mutationEvidence.mutationUncertain = true;
    await adb(['shell', 'input', 'tap', ...coordinate.map(String)]);
  };
  const profileControl = async key => {
    await flow(caseId, profileScrollBody(key));
    const control = PROFILE_CONTROLS[key], nodes = await readUi();
    const found = labelled(nodes, control.label).filter(node => control.kind === 'input' ? node.class === 'android.widget.EditText' : node.clickable === 'true');
    need(found.length === 1 && rectangle(found[0]), 'ACCOUNT_MUTATION_UI_INVALID');
    return nodes;
  };
  const saveName = async (name, value) => {
    state.stage = name + '-profile-name-control';
    const coordinate = point(await profileControl('nombre'), 'Nombre', 'input'); await adb(['shell', 'input', 'tap', ...coordinate.map(String)]);
    state.stage = name + '-profile-name-input';
    await flow(name, '- eraseText: 100\n- inputText: ${MAESTRO_ACCOUNT_FIELD_VALUE}\n- hideKeyboard', { MAESTRO_ACCOUNT_FIELD_VALUE: value });
    need(fieldMatches(await readUi(), 'Nombre', value), 'ACCOUNT_MUTATION_UI_INVALID');
    state.stage = name + '-profile-save-control';
    const save = point(await profileControl('guardar'), 'Guardar cambios', 'button');
    mutationState.profileNameAttempted = true; state.mutationEvidence.mutationUncertain = true;
    await adb(['shell', 'input', 'tap', ...save.map(String)]);
    state.stage = name + '-profile-save-response';
    await waitUi(items => hasLabel(items, 'Tu perfil se actualizó correctamente.'));
    state.stage = name + '-profile-name-verify';
    need(fieldMatches(await profileControl('nombre'), 'Nombre', value), 'ACCOUNT_MUTATION_UI_INVALID');
  };
  const verifyProfilePreimage = async expectedName => {
    for (const key of ['nombre', 'aPaterno', 'aMaterno', 'email', 'telefono']) {
      state.stage = caseId + '-profile-preimage-' + key;
      need(fieldMatches(await profileControl(key), PROFILE_CONTROLS[key].label, key === 'nombre' ? expectedName : fixture.profile[key]), 'FIXTURE_CONFLICT');
    }
  };
  const cartQuantity = async quantity => {
    await scrollFor('Eliminar ' + fixture.target.name, 'button');
    await waitUi(nodes => cartQuantityMatches(nodes, fixture.target, quantity));
  };
  const prepareVariant = async () => {
    const target = fixture.target;
    need(Number.isSafeInteger(target.productId) && target.productId > 0, 'ACCOUNT_MUTATION_UI_INVALID');
    await adb(['shell', 'am', 'start', '-W', '-n', SOURCE.appId + '/.MainActivity', '-a', 'android.intent.action.VIEW', '-d', 'sportcentermobile://product/' + target.productId]);
    await scrollFor(target.selectorLabel, 'button'); await tap(target.selectorLabel, 'button');
    const selected = await waitUi(nodes => labelled(nodes, target.selectorLabel).some(node => node.clickable === 'true' && node.checked === 'true'));
    need(labelled(selected, target.selectorLabel).filter(node => node.clickable === 'true').length === 1, 'ACCOUNT_MUTATION_UI_INVALID');
    await scrollFor('SKU: ' + target.sku);
    const priced = await scrollFor('$' + target.currentPrice.toFixed(2));
    const stock = priced.filter(node => node.package === SOURCE.appId && /^(\d+) disponibles$/.test(node.text || ''));
    need(stock.length === 1 && Number(/^(\d+)/.exec(stock[0].text)[1]) >= target.quantity + 1, 'ACCOUNT_MUTATION_UI_INVALID');
    const quantityNodes = await scrollFor('Sumar cantidad', 'button');
    need(productQuantity(quantityNodes) === 1, 'ACCOUNT_MUTATION_UI_INVALID');
    point(await scrollFor('Agregar al carrito', 'button'), 'Agregar al carrito', 'button');
  };
  try {
    need((await adb(['shell', 'getprop', 'ro.build.version.sdk'])).trim() === '34' && (await adb(['shell', 'getprop', 'ro.product.cpu.abi'])).trim() === 'x86_64', 'ACCOUNT_PROCESS_FAILED');
    need(!(await adb(['reverse', '--list'])).trim(), 'ACCOUNT_PROCESS_FAILED');
    need(!(await adb(['shell', 'pm', 'list', 'packages', SOURCE.appId])).trim(), 'ACCOUNT_PROCESS_FAILED');
    state.stage = 'api-auth-probe'; const captured = await capture({ email: secret.email, password: secret.password });
    need(validateCaptureReport(captured), 'ACCOUNT_API_AUTH_FAILED'); const apiContract = captured.authReport; state.apiContract = apiContract;
    need(apiContract.status !== 'blocked', 'ACCOUNT_API_AUTH_BLOCKED');
    need(captured.errorCode === 'NONE', captured.errorCode); fixture = captured.fixture;
    need(apiContract.status === 'passed' && apiContract.sessionValid === true && apiContract.logoutConfirmed === true && apiContract.uiContinueAllowed === true, 'ACCOUNT_API_AUTH_FAILED');
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
    state.stage = 'AC01-input-check'; state.inputObservation = { emailMatches: inputMatches(await readUi(), 'Correo electrónico', secret.email), passwordMatches: null, passwordHidden: null };
    let shown = false;
    try {
      await tap('Mostrar contraseña', 'button'); shown = true;
      const visible = await waitUi(nodes => hasLabel(nodes, 'Ocultar contraseña'));
      state.inputObservation.passwordMatches = inputMatches(visible, 'Contraseña', secret.password);
    } finally {
      if (shown) {
        state.stage = 'AC01-password-hide'; await tap('Ocultar contraseña', 'button');
        const hidden = await waitUi(nodes => hasLabel(nodes, 'Mostrar contraseña'));
        const passwords = labelled(hidden, 'Contraseña').filter(node => node.class === 'android.widget.EditText');
        state.inputObservation.passwordHidden = passwords.length === 1 && passwords[0].password === 'true';
      }
    }
    state.stage = 'AC01-input-check'; need(Object.values(state.inputObservation).every(value => value === true), 'ACCOUNT_INPUT_MISMATCH');
    state.stage = 'AC01-submit'; loginAttempted = true; await tap('Iniciar sesión', 'button');
    state.stage = 'AC01-await-account';
    try { await flow('AC01', FLOWS.login); }
    catch (error) {
      try { state.loginUi = classifyLoginUi(await readUi()); }
      catch { state.loginUi = { observed: false, hasLogin: false, hasAccount: false, busy: false, errorCodes: [] }; }
      throw error;
    }
    state.cases.AC01 = 'passed';
    caseId = 'AC02'; state.stage = 'AC02-open'; await flow('AC02', FLOWS.profile);
    // The field can be below the viewport; scroll only (never enter/save data).
    state.stage = 'AC02-scroll'; await flow('AC02', '- scrollUntilVisible:\n    element:\n      text: "^Correo$"\n    timeout: 30000');
    state.stage = 'AC02-compare'; need(profileMatches(await readUi(), secret.email), 'ACCOUNT_PROFILE_MISMATCH'); state.cases.AC02 = 'passed';
    caseId = 'MU01'; state.stage = 'MU01-profile-save'; await verifyProfilePreimage(fixture.profile.nombre); await saveName('MU01', TEST_NAME);
    state.mutationEvidence.profileSaved = true; state.mutationChecks.MU01 = 'passed';
    caseId = 'MU02'; state.stage = 'MU02-profile-persist'; await cold(); await flow('MU02', FLOWS.restored); await flow('MU02', FLOWS.profile);
    need(fieldMatches(await profileControl('nombre'), 'Nombre', TEST_NAME), 'ACCOUNT_MUTATION_UI_INVALID'); state.mutationEvidence.profilePersisted = true;
    state.stage = 'MU02-profile-restore'; await verifyProfilePreimage(TEST_NAME); await saveName('MU02', fixture.profile.nombre);
    await cold(); await flow('MU02', FLOWS.restored); await flow('MU02', FLOWS.profile); await verifyProfilePreimage(fixture.profile.nombre);
    state.mutationEvidence.profileUiRestored = true; state.mutationChecks.MU02 = 'passed';
    caseId = 'AC03'; state.stage = 'AC03-open'; await flow('AC03', FLOWS.cart); state.stage = 'AC03-fixture';
    const cart = fixtureStatus(await waitUi(nodes => fixtureStatus(nodes) !== 'loading'));
    need(cart !== 'empty', 'ACCOUNT_FIXTURE_EMPTY'); need(cart !== 'stock', 'ACCOUNT_FIXTURE_STOCK'); need(cart === 'ready', 'ACCOUNT_UI_TIMEOUT');
    state.cases.AC03 = 'passed';
    caseId = 'MU03'; state.stage = 'MU04-target-preflight'; await prepareVariant(); await openReadOnly('cart'); await cartQuantity(fixture.target.quantity);
    state.stage = 'MU03-cart-increase'; await mutationTap('Agregar una unidad de ' + fixture.target.name, 'cartIncrementAttempted');
    await cartQuantity(fixture.target.quantity + 1); state.mutationEvidence.cartIncreased = true;
    state.stage = 'MU03-cart-persist'; await cold(); await flow('MU03', FLOWS.restored); await openReadOnly('cart');
    await cartQuantity(fixture.target.quantity + 1); state.mutationEvidence.cartPersisted = true;
    state.stage = 'MU03-cart-restore'; await mutationTap('Restar una unidad de ' + fixture.target.name, 'cartIncrementAttempted');
    await cartQuantity(fixture.target.quantity); state.mutationEvidence.cartUiRestored = true; state.mutationChecks.MU03 = 'passed';
    caseId = 'MU04'; state.stage = 'MU04-cart-remove'; await mutationTap('Eliminar ' + fixture.target.name, 'cartRemoveAttempted');
    await waitUi(nodes => !targetVisible(nodes, fixture.target) && (hasLabel(nodes, 'Tu carrito') || hasLabel(nodes, 'Tu carrito está vacío')));
    const remaining = fixture.cart.itemCount - fixture.target.quantity;
    if (remaining === 0) await waitUi(nodes => hasLabel(nodes, 'Tu carrito está vacío'));
    else await scrollFor(remaining + ' artículos');
    mutationState.cartRemoveConfirmed = true; state.mutationEvidence.cartRemoved = true;
    state.stage = 'MU04-cart-readd'; await prepareVariant();
    for (let quantity = 1; quantity < fixture.target.quantity; quantity++) {
      await tap('Sumar cantidad', 'button'); await waitUi(nodes => productQuantity(nodes) === quantity + 1);
    }
    await mutationTap('Agregar al carrito', 'cartAddAttempted'); await waitUi(nodes => hasLabel(nodes, 'Agregado al carrito.'));
    await openReadOnly('cart'); await cartQuantity(fixture.target.quantity); state.mutationEvidence.cartReadded = true; removalUiComplete = true;
    caseId = 'AC04'; state.stage = 'AC04-summary'; await flow('AC04', FLOWS.summary); state.cases.AC04 = 'passed';
    caseId = 'AC05'; state.stage = 'AC05-restore'; await cold(); await flow('AC05', FLOWS.restored); state.cases.AC05 = 'passed';
    caseId = 'RO01'; state.stage = 'RO01-orders'; await openReadOnly('orders');
    const orders = orderListStatus(await waitUi(nodes => orderListStatus(nodes) !== 'loading'));
    need(orders === 'empty' || orders === 'list', 'ACCOUNT_ORDERS_READ_FAILED'); state.orderListState = orders;
    state.stage = 'RO01-return'; await openReadOnly('account');
    await waitUi(nodes => hasLabel(nodes, 'Mi cuenta') && hasLabel(nodes, 'Has iniciado sesión en Sport Center.')); state.readOnlyChecks.RO01 = 'passed';
    caseId = 'AC06'; state.stage = 'AC06-logout'; await flow('AC06', FLOWS.logout); loggedOut = true; state.cases.AC06 = 'passed';
    caseId = 'AC07'; state.stage = 'AC07-guest'; await cold(); await flow('AC07', FLOWS.guest); state.stage = 'AC07-guard';
    await adb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'sportcentermobile://cart', '-p', SOURCE.appId]);
    await flow('AC07', FLOWS.guard); state.cases.AC07 = 'passed';
    for (const [id, route] of [['RO02', 'profile'], ['RO03', 'checkout']]) {
      caseId = id; state.stage = id + '-' + route + '-guard'; await openReadOnly(route);
      const guarded = guestGuardStatus(await waitUi(nodes => guestGuardStatus(nodes, route) !== 'loading'), route);
      need(guarded === 'ready', 'ACCOUNT_GUEST_GUARD_FAILED'); state.readOnlyChecks[id] = 'passed';
    }
    caseId = 'RO04'; state.stage = 'RO04-privacy'; await openReadOnly('privacy'); await flow('RO04', FLOWS.privacy);
    need(privacyVisible(await readUi()), 'ACCOUNT_PRIVACY_READ_FAILED'); state.readOnlyChecks.RO04 = 'passed';
    bodyCompleted = true; state.status = 'passed'; state.stage = 'completed';
  } catch (error) {
    const code = error?.code === 'SANDBOX_SETUP_CLEANUP_FAILED' ? 'ACCOUNT_SANDBOX_CLEANUP_FAILED' : safeCode(error);
    if (trustedSandboxError(error)) state.sandboxDiagnostic = safeSandboxDiagnostic(error);
    state.errors.push(new AccountError(code)); state.failureStage = state.stage;
    const blocked = ['ACCOUNT_FIXTURE_EMPTY', 'ACCOUNT_FIXTURE_STOCK', 'ACCOUNT_API_AUTH_BLOCKED', 'FIXTURE_PROFILE_INVALID', 'FIXTURE_PROFILE_NOT_NORMALIZED',
      'FIXTURE_EMPTY', 'FIXTURE_STOCK', 'FIXTURE_VARIANT_INVALID', 'FIXTURE_PRICE_CHANGED', 'FIXTURE_TARGET_AMBIGUOUS'].includes(code) ||
      code === 'FIXTURE_CONFLICT' && !STATE_KEYS.some(key => key !== 'cartRemoveConfirmed' && mutationState[key]);
    if (MUTATION_CHECKS.includes(caseId)) state.mutationChecks[caseId] = 'failed';
    else if (READ_ONLY_CHECKS.includes(caseId)) state.readOnlyChecks[caseId] = 'failed'; else state.cases[caseId] = blocked ? 'blocked' : 'failed';
    state.status = blocked ? 'blocked' : 'failed';
  } finally {
    if (loginAttempted && !loggedOut) {
      try {
        await adb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'sportcentermobile://account', '-p', SOURCE.appId]);
        const nodes = await waitUi(items => hasLabel(items, 'Has iniciado sesión en Sport Center.') || hasLabel(items, 'Tu cuenta Sport Center') || hasLabel(items, 'Accede a tu cuenta de Sport Center.'));
        if (hasLabel(nodes, 'Has iniciado sesión en Sport Center.')) await flow('cleanup', FLOWS.logout);
        state.cleanup.localSession = true;
      } catch { state.errors.push(new AccountError('ACCOUNT_SESSION_CLEANUP_UNCONFIRMED')); state.failureStage ||= 'cleanup-session'; }
    } else state.cleanup.localSession = !loginAttempted || loggedOut;
    if (state.apiContract?.accessTokenReceived === true && state.apiContract.logoutConfirmed !== true) {
      state.cleanup.localSession = false; state.errors.push(new AccountError('ACCOUNT_API_AUTH_CLEANUP_FAILED')); state.failureStage ||= 'api-auth-probe';
    }
    const attempted = STATE_KEYS.some(key => key !== 'cartRemoveConfirmed' && mutationState[key]);
    state.cleanup.fixtureRestoration = !attempted;
    if (attempted) {
      try {
        need(state.cleanup.localSession === true && installed, 'ACCOUNT_MUTATION_UI_NOT_STOPPED');
        await adb(['shell', 'am', 'force-stop', SOURCE.appId]);
        const processes = (await adb(['shell', 'ps', '-A', '-o', 'NAME'])).trim().split(/\r?\n/).map(line => line.trim());
        need(!processes.some(name => name === SOURCE.appId || name.startsWith(SOURCE.appId + ':')), 'ACCOUNT_MUTATION_UI_NOT_STOPPED');
        state.mutationEvidence.uiStopped = true;
        const result = await restore({ email: secret.email, password: secret.password, fixture, mutationState: { ...mutationState }, uiStopped: true });
        need(validateRestorationReport(result), 'ACCOUNT_FIXTURE_RESTORATION_FAILED');
        Object.assign(state.mutationEvidence, result.restoration);
        need(result.errorCode === 'NONE' && result.restoration.baselineRestored, result.errorCode === 'NONE' ? 'ACCOUNT_FIXTURE_RESTORATION_FAILED' : result.errorCode);
        state.cleanup.fixtureRestoration = true;
        if (bodyCompleted && removalUiComplete) {
          state.mutationChecks.MU04 = 'passed'; state.mutationChecks.MU05 = 'passed';
        }
      } catch (error) {
        state.errors.push(new AccountError('ACCOUNT_FIXTURE_RESTORATION_FAILED'), new AccountError(safeCode(error))); state.failureStage ||= 'MU05-baseline';
        if (bodyCompleted) { state.mutationChecks.MU05 = 'failed'; if (removalUiComplete) state.mutationChecks.MU04 = 'failed'; }
        state.status = 'failed';
      }
    }
    try {
      if (installed) { await adb(['shell', 'am', 'force-stop', SOURCE.appId]); await adb(['uninstall', SOURCE.appId]); }
      if (remoteCreated) { await adb(['shell', 'rm', '-f', remote + '/ui.xml']); await adb(['shell', 'rmdir', remote]); }
      need(!(await adb(['shell', 'pm', 'list', 'packages', SOURCE.appId])).trim(), 'ACCOUNT_DEVICE_CLEANUP_FAILED');
      state.cleanup.device = true;
    } catch { state.errors.push(new AccountError('ACCOUNT_DEVICE_CLEANUP_FAILED')); state.failureStage ||= 'cleanup-device'; }
    try {
      if (box) { await box.cleanup(); state.cleanup.sandbox = true;
        state.sandboxDiagnostic = { sandboxCode: state.sandboxDiagnostic?.sandboxCode ?? null, cleanupCode: null, cleanupConfirmed: true }; }
      else { state.cleanup.sandbox = !setupAttempted || state.sandboxDiagnostic?.cleanupConfirmed === true;
        need(state.cleanup.sandbox, 'ACCOUNT_SANDBOX_CLEANUP_FAILED'); }
    }
    catch (error) { state.errors.push(new AccountError('ACCOUNT_SANDBOX_CLEANUP_FAILED')); state.failureStage ||= 'cleanup-sandbox';
      const cleanupDiagnostic = safeSandboxDiagnostic(error);
      state.sandboxDiagnostic = state.sandboxDiagnostic?.sandboxCode ? { sandboxCode: state.sandboxDiagnostic.sandboxCode,
        cleanupCode: cleanupDiagnostic.sandboxCode, cleanupConfirmed: false } : cleanupDiagnostic; }
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
    state.stage = 'sandbox-file-roundtrip'; await box.createPrivateFile('public-roundtrip.txt', PREFLIGHT_FILE);
    need(await box.readPrivateFile('public-roundtrip.txt') === PREFLIGHT_FILE, 'ACCOUNT_SANDBOX_FAILED');
  } catch (error) { failure = error; if (setupAttempted) state.sandboxDiagnostic = safeSandboxDiagnostic(error); }
  if (box) {
    try { await box.cleanup(); state.cleanup.sandbox = true;
      if (state.sandboxDiagnostic) state.sandboxDiagnostic = { sandboxCode: state.sandboxDiagnostic.sandboxCode, cleanupCode: null, cleanupConfirmed: true }; }
    catch (error) { failure ||= error; const secondary = safeSandboxDiagnostic(error);
      state.sandboxDiagnostic = state.sandboxDiagnostic?.sandboxCode ? { sandboxCode: state.sandboxDiagnostic.sandboxCode,
        cleanupCode: secondary.sandboxCode, cleanupConfirmed: false } : secondary; }
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
    ipv6RulesVerified: true, adbLoopbackReachable: true, maestroVersionVerified: true, privateFileRoundtripVerified: true, cleanupConfirmed: true,
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
      value.readOnlyChecks?.length === READ_ONLY_CHECKS.length && value.readOnlyChecks.every((item, index) => item.id === READ_ONLY_CHECKS[index] && item.status === 'passed') &&
      value.mutationChecks?.length === MUTATION_CHECKS.length && value.mutationChecks.every((item, index) => item.id === MUTATION_CHECKS[index] && item.status === 'passed') &&
      mutationsPassed(value.mutationEvidence) && value.cleanup?.fixtureRestoration === true &&
      ['empty', 'list'].includes(value.orderListState) &&
      value.cleanup?.device === true && value.cleanup?.sandbox === true && value.cleanup?.localSession === true && value.failureCodes?.length === 0, 'ACCOUNT_UI_TIMEOUT'); return;
  }
  if (mode === 'summary') {
    let result; try { result = JSON.parse(fs.readFileSync(files.report, 'utf8')); } catch { result = publicReport({ status: 'failed' }); }
    need(result.buildId === SOURCE.buildId && result.apkSha256 === SOURCE.sha256 && result.artifactSourceCommit === SOURCE.commit, 'ACCOUNT_ARTIFACT_MISMATCH');
    const lines = ['Prueba de cuenta dedicada del APK ' + SOURCE.tag + ': ' + (['passed', 'blocked', 'failed'].includes(result.status) ? result.status : 'failed') + '.',
      ...CASES.map(id => id + ': ' + (result.cases?.find(item => item.id === id)?.status === 'passed' ? 'passed' : 'not-passed')),
      ...READ_ONLY_CHECKS.map(id => id + ': ' + (result.readOnlyChecks?.find(item => item.id === id)?.status === 'passed' ? 'passed' : 'not-passed')),
      ...MUTATION_CHECKS.map(id => id + ': ' + (result.mutationChecks?.find(item => item.id === id)?.status === 'passed' ? 'passed' : 'not-passed')),
      'Alcance: lectura, sesión y cambios reversibles de nombre y una línea del carrito; sin dirección, pedido, pago, correo, reseña ni prueba física.'];
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
module.exports = { SOURCE, CASES, READ_ONLY_CHECKS, MUTATION_CHECKS, MUTATION_FLAGS, PROFILE_CONTROLS, PROFILE_STAGES, profileScrollBody, READ_ONLY_URLS, STAGES, AUTOMATION_FILES, CODES, PREFLIGHT_FILE, LOGIN_ERROR_CODES, AccountError, safeCode, verifyProducer, verifyBuild, verifyAutomation,
  credentials, parsePrivateUi, hasLabel, point, profileMatches, inputMatches, classifyLoginUi, fixtureStatus, orderListStatus, guestGuardStatus, privacyVisible,
  fieldMatches, cartQuantityMatches, targetVisible, productQuantity, mutationEvidence, mutationsPassed, yaml, FLOWS, verifyJUnit, publicReport, runAcceptance,
  locations, prepare, validateParentProof, assertParentCleanup, runtimeDirectory, sandboxParent, probe, main };
if (require.main === module) main(process.argv[2]).catch(error => { process.stderr.write(safeCode(error) + '\n'); process.exitCode = 1; });

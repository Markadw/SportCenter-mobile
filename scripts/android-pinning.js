const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { createHash, randomUUID } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const { SOURCE, resolveSourceContext, verifyApi34Evidence } = require('./android-source-context');
const { androidTools } = require('./inspect-android-artifact');
const { verifyAospImage, SystemImageError } = require('./android-16k');
const APP = 'com.markadw.sportcenter';
const TOOL = Object.freeze({ version: '12.3.1', url: 'https://downloads.mitmproxy.org/12.3.1/mitmproxy-12.3.1-linux-x86_64.tar.gz',
  sha256: 'f7b4237f5702f6cd21357fe6e4680a7e905f8f9b816b872230d018ea696c34d5' });
function hostname(value) {
  assert.ok(typeof value === 'string' && value.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(value), 'Host público exacto inválido.');
  return value;
}
function candidate(meta, actualHash, env, context = resolveSourceContext(env)) {
  assert.match(env.GITHUB_REF || '', /^refs\/tags\/(?:candidate|validation)\/android-[A-Za-z0-9_.-]+$/, 'Sólo etiquetas candidate/android-* o validation/android-*.');
  if ((env.GITHUB_REF || '').startsWith('refs/tags/validation/')) {
    assert.equal(context.revalidation, true); assert.equal(context.artifactSourceCommit, SOURCE.commit);
    assert.equal(context.automationCommit, env.GITHUB_SHA); assert.equal(meta?.buildId, SOURCE.buildId);
    assert.equal(actualHash, SOURCE.apkSha256);
  } else assert.equal(context.revalidation, false);
  assert.equal(env.PINNING_CANDIDATE, 'true', 'El job debe identificar explícitamente una candidata.');
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  assert.match(env.PINNING_EXPECTED_SHA256 || '', /^[a-f0-9]{64}$/);
  assert.ok(typeof meta?.buildId === 'string' && /^[a-zA-Z0-9-]+$/.test(meta.buildId), 'Falta ID de build.');
  assert.equal(meta.buildId, env.PINNING_EXPECTED_BUILD_ID, 'Build distinto del job API34.');
  assert.equal(meta.commit, context.artifactSourceCommit, 'Commit distinto de la fuente verificada.');
  assert.equal(meta.commit, env.PINNING_EXPECTED_COMMIT, 'Commit distinto del job API34.');
  assert.equal(meta.emulatorApi, 34, 'La procedencia debe ser el APK del job API34.');
  assert.equal(meta.sha256, env.PINNING_EXPECTED_SHA256, 'Metadatos y output API34 discrepan.');
  assert.equal(actualHash, meta.sha256, 'El APK descargado no conserva su SHA256.');
  return { buildId: meta.buildId, commit: meta.commit, sha256: actualHash,
    ...(context.revalidation ? { artifactSourceCommit: context.artifactSourceCommit, automationCommit: context.automationCommit } : {}) };
}
// Only the small release NSC shape emitted by this app is accepted. Unknown XML/configurations fail closed.
function xmlTree(source) {
  assert.ok(typeof source === 'string' && source.length < 2_000_000 && !source.includes('<!'),
    'Comentarios, DTD, entidades y CDATA no admitidos en XML compilado.');
  // AAPT emite una declaración inicial; no se sanea ni elimina contenido XML arbitrario.
  const declaration = source.match(/^<\?xml\s+version\s*=\s*(?:"1\.0"|'1\.0')(?:\s+encoding\s*=\s*(?:"[A-Za-z][A-Za-z0-9._-]*"|'[A-Za-z][A-Za-z0-9._-]*'))?(?:\s+standalone\s*=\s*(?:"(?:yes|no)"|'(?:yes|no)'))?\s*\?>/);
  const input = declaration ? source.slice(declaration[0].length) : source;
  assert.ok(!input.includes('<?'), 'Instrucciones XML no admitidas.');
  const root = { name: '#root', attrs: {}, children: [], text: '' }, stack = [root];
  let offset = 0;
  for (const match of input.matchAll(/<[^>]+>|[^<]+/g)) {
    assert.equal(match.index, offset, 'XML incompleto.'); offset += match[0].length;
    const token = match[0], parent = stack[stack.length - 1];
    if (!token.startsWith('<')) { assert.ok(!token.includes('&'), 'Entidades XML no admitidas en NSC.'); parent.text += token; continue; }
    if (token.startsWith('</')) { assert.equal(token, '</' + parent.name + '>', 'Cierre XML incoherente.'); assert.ok(stack.length > 1); stack.pop(); continue; }
    const opening = token.match(/^<([A-Za-z_:][\w:.-]*)([\s\S]*?)(\/?)>$/); assert.ok(opening, 'Elemento XML inválido.');
    const attrs = {}; let tail = opening[2];
    while (tail.trim()) {
      const attr = tail.match(/^\s+([\w:.-]+)\s*=\s*(?:"([^"<&]*)"|'([^'<&]*)')/);
      assert.ok(attr && !(attr[1] in attrs), 'Atributo XML inválido o repetido.');
      attrs[attr[1]] = attr[2] ?? attr[3]; tail = tail.slice(attr[0].length);
    }
    const node = { name: opening[1], attrs, children: [], text: '' }; parent.children.push(node);
    if (!opening[3]) stack.push(node);
  }
  assert.equal(offset, input.length); assert.equal(stack.length, 1); assert.equal(root.children.length, 1);
  assert.equal(root.text.trim(), '', 'Texto fuera de la raíz XML.');
  return root.children[0];
}
function manifestApplication(manifest) {
  const root = xmlTree(manifest);
  assert.ok(root.name === 'manifest', 'NSC_MANIFEST_ROOT_INVALID');
  const pending = [root], applications = [];
  while (pending.length) {
    const node = pending.pop();
    if (node.name === 'application') applications.push(node);
    for (const child of node.children) pending.push(child);
  }
  assert.ok(applications.length === 1 && root.children.includes(applications[0]), 'Se requiere un único application directo del manifiesto.');
  assert.notEqual(applications[0].attrs['android:debuggable'], 'true', 'No se admite APK debuggable.');
  return applications[0];
}
function nscReference(manifest) {
  const reference = manifestApplication(manifest).attrs['android:networkSecurityConfig'];
  assert.ok(reference === '@xml/network_security_config' || reference === '@' + APP + ':xml/network_security_config'
    || /^@(?:ref\/)?0x[0-9a-f]{8}$/i.test(reference || ''), 'NSC_MANIFEST_REFERENCE_INVALID');
  return reference;
}
function resolveNscResource(manifest, table) {
  const reference = nscReference(manifest);
  assert.ok(typeof table === 'string' && table.length <= 4 * 1024 * 1024, 'NSC_RESOURCE_TABLE_INVALID');
  const records = [], packages = []; let pkg, current;
  for (const line of table.split(/\r?\n/)) {
    const header = line.match(/^Package name=([A-Za-z][A-Za-z0-9_.]*) id=([0-9a-f]{2})\s*$/i);
    if (header) { pkg = { name: header[1], id: header[2].toLowerCase() }; packages.push(pkg); current = null; continue; }
    const resource = line.match(/^\s+resource (0x[0-9a-f]{8}) ([A-Za-z0-9_]+)\/([A-Za-z0-9_]+)\s*$/i);
    if (resource) { current = { pkg, id: resource[1].toLowerCase(), type: resource[2], name: resource[3], values: [] }; records.push(current); continue; }
    if (/^\s*(?:resource|type)\s/.test(line)) { current = null; continue; }
    if (current && line.trim()) current.values.push(line.trim());
  }
  assert.ok(packages.filter(value => value.name === APP).length === 1, 'NSC_RESOURCE_PACKAGE_AMBIGUOUS');
  const matches = records.filter(value => value.pkg?.name === APP && value.type === 'xml' && value.name === 'network_security_config');
  assert.ok(matches.length === 1, 'NSC_RESOURCE_AMBIGUOUS_OR_MISSING');
  const resource = matches[0];
  assert.ok(resource.id.slice(2, 4) === resource.pkg.id && records.filter(value => value.id === resource.id).length === 1,
    'NSC_RESOURCE_ID_AMBIGUOUS');
  const numeric = reference.match(/^@(?:ref\/)?(0x[0-9a-f]{8})$/i);
  assert.ok(!numeric || numeric[1].toLowerCase() === resource.id, 'NSC_RESOURCE_REFERENCE_MISMATCH');
  assert.ok(resource.values.length === 1, 'NSC_RESOURCE_DEFAULT_ONLY_REQUIRED');
  const value = resource.values[0].match(/^\(\) \(file\) (res\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.xml) type=XML$/);
  assert.ok(value && value[1].length <= 240, 'NSC_RESOURCE_DEFAULT_XML_REQUIRED');
  return { reference, id: resource.id, name: 'xml/network_security_config', package: APP, configuration: 'default', path: value[1] };
}
async function loadCompiledNsc(manifest, apk, { analyzer, aapt2, request = command }) {
  const table = await request(aapt2, ['dump', 'resources', apk], { diagnostic: 'NSC_RESOURCE_TABLE' });
  const resource = resolveNscResource(manifest, table);
  const files = (await request(analyzer, ['files', 'list', apk], { diagnostic: 'NSC_APK_ENTRIES' })).split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const count = entry => files.filter(value => value === entry || value === '/' + entry).length;
  assert.ok(count('resources.arsc') === 1 && count(resource.path) === 1, 'NSC_COMPILED_ENTRY_MISSING_OR_AMBIGUOUS');
  const xml = await request(analyzer, ['resources', 'xml', '--file', '/' + resource.path, apk], { diagnostic: 'NSC_COMPILED_XML' });
  return { xml, resource };
}
function compiledPolicy(manifest, nsc, api, image, expectedPins, resource) {
  hostname(api); hostname(image); assert.notEqual(api, image, 'El control de imagen debe quedar fuera del dominio pinned.');
  const reference = nscReference(manifest);
  assert.ok(resource ? resource.reference === reference && resource.name === 'xml/network_security_config'
    && resource.package === APP && resource.configuration === 'default' && /^0x[0-9a-f]{8}$/.test(resource.id)
    : reference === '@xml/network_security_config', 'No se resolvió la NSC compilada del manifiesto.');
  const root = xmlTree(nsc); assert.equal(root.name, 'network-security-config'); assert.equal(root.text.trim(), '');
  assert.deepEqual(root.attrs, {}); assert.equal(root.children.length, 2, 'NSC desconocida o bypass adicional.');
  const base = root.children.find(n => n.name === 'base-config'), domain = root.children.find(n => n.name === 'domain-config');
  for (const node of [base, domain]) {
    assert.ok(node); assert.deepEqual(node.attrs, { cleartextTrafficPermitted: 'false' }); assert.equal(node.text.trim(), '');
    const trust = node.children.filter(n => n.name === 'trust-anchors'); assert.equal(trust.length, 1);
    assert.deepEqual(trust[0].attrs, {}); assert.equal(trust[0].children.length, 1); assert.equal(trust[0].text.trim(), '');
    const cert = trust[0].children[0]; assert.equal(cert.name, 'certificates'); assert.deepEqual(cert.attrs, { src: 'system' });
    assert.equal(cert.children.length, 0); assert.equal(cert.text.trim(), '');
  }
  assert.equal(base.children.length, 1); assert.equal(domain.children.length, 3);
  const dom = domain.children.find(n => n.name === 'domain'), set = domain.children.find(n => n.name === 'pin-set');
  assert.ok(dom && set); assert.deepEqual(dom.attrs, { includeSubdomains: 'false' }); assert.equal(dom.text.trim(), api); assert.equal(dom.children.length, 0);
  assert.deepEqual(set.attrs, {}); assert.equal(set.text.trim(), ''); assert.ok(set.children.length >= 2);
  const pins = set.children.map(n => {
    assert.equal(n.name, 'pin'); assert.deepEqual(n.attrs, { digest: 'SHA-256' }); assert.equal(n.children.length, 0);
    assert.match(n.text.trim(), /^[A-Za-z0-9+/]{43}=$/); return n.text.trim();
  });
  assert.equal(new Set(pins).size, pins.length); assert.deepEqual([...pins].sort(), [...expectedPins].sort(), 'Pines compilados distintos de los revisados.');
  return { apiHost: api, imageHost: image, pins, systemOnly: true, overridesPins: false, compiled: true };
}
function emulatorEvidence(properties) {
  assert.match(properties.serial || '', /^emulator-\d+$/, 'Nunca ejecutar contra un dispositivo físico.');
  assert.equal(properties.sdk, '30'); assert.equal(properties.qemu, '1'); assert.equal(properties.type, 'userdebug');
  assert.equal(properties.abi, 'x86_64'); assert.equal(properties.root, '0'); assert.equal(properties.playStore, false, 'PLAY_STORE_PRESENT');
  return { api: 30, abi: 'x86_64', type: 'userdebug', ephemeral: true };
}
function verifyAospPackage(listing) {
  const packagePath = 'system-images;android-30;default;x86_64';
  const location = 'system-images/android-30/default/x86_64';
  const fail = (property, expected, actual) => { throw new SystemImageError(property, expected, actual); };
  if (typeof listing !== 'string' || listing.length > 4 * 1024 * 1024) fail('InstalledPackage.Table', 'single installed table', '[invalid]');
  const lines = listing.split(/\r?\n/).map(line => line.trim());
  const heading = lines.indexOf('Installed packages:');
  const headers = lines.map((line, index) => line.split('|').map(cell => cell.trim()).join('|') === 'Path|Version|Description|Location' ? index : -1).filter(index => index >= 0);
  if (heading < 0 || lines.lastIndexOf('Installed packages:') !== heading || headers.length !== 1 || headers[0] <= heading)
    fail('InstalledPackage.Table', 'single installed table', '[missing_or_ambiguous]');
  const rows = lines.slice(headers[0] + 1).map(line => line.split('|').map(cell => cell.trim())).filter(cells => cells[0] === packagePath);
  if (rows.length !== 1 || rows[0].length !== 4) fail('InstalledPackage.Path', packagePath, rows.length > 1 ? '[duplicate]' : '[missing_or_malformed]');
  if (rows[0][1] !== '11') fail('InstalledPackage.Revision', '11', /^\d{1,3}$/.test(rows[0][1]) ? rows[0][1] : '[unrecognized]');
  if (rows[0][3] !== location && rows[0][3] !== location + '/') fail('InstalledPackage.Location', location, '[unrecognized]');
  return { package: packagePath, packageRevision: 11, packageMetadata: 'sdkmanager23-list-installed' };
}
function minSdkEvidence(value) {
  assert.match(value.trim(), /^\d+$/, 'minSdk no disponible.');
  const minimum = Number(value.trim());
  assert.ok(Number.isInteger(minimum) && minimum >= 1 && minimum <= 30, 'minSdk incompatible con API30.');
  return minimum;
}
function clockEvidence(seconds, hostMilliseconds) {
  assert.match(seconds.trim(), /^\d+$/, 'Reloj del AVD no disponible.');
  assert.ok(Math.abs(Number(seconds.trim()) * 1000 - hostMilliseconds) <= 60000, 'Reloj del AVD fuera del control temporal.');
  return true;
}
function verdict(events, context) {
  assert.ok(context.compiled?.compiled && context.caInstalled && context.baselineUi && context.negativeUi && context.recoveryUi, 'Faltan controles nativos/NSC/CA/UI.');
  const rows = events.filter(e => e.runId === context.runId);
  assert.equal(rows.length, events.length, 'Evidencia ajena a esta ejecución.');
  assert.ok(rows.length > 0 && rows.length <= 5000, 'Eventos ausentes o excesivos.');
  const api = context.compiled.apiHost, image = context.compiled.imageHost;
  const validCert = e => e.cert?.valid === true && e.cert.caSha256 === context.caSha256 && e.cert.pinMatches === false
    && /^[a-f0-9]{64}$/.test(e.cert.leafSha256 || '');
  const capturedBefore = (phaseRows, event) => phaseRows.find(ready => ready.event === 'client_cert_ready'
    && ready.host === event.host && ready.connId === event.connId && validCert(ready)
    && ready.cert.leafSha256 === event.cert?.leafSha256 && phaseRows.indexOf(ready) < phaseRows.indexOf(event));
  const control = rows.filter(e => e.phase === 'control'), attack = rows.filter(e => e.phase === 'attack');
  assert.ok(control.some(e => e.event === 'passthrough' && e.host === api), 'No se observó API passthrough desde el APK.');
  const images = control.filter(e => e.event === 'image_response' && e.host === image && e.status >= 200 && e.status < 300);
  assert.ok(images.some(e => control.some(t => t.event === 'client_tls_ok' && t.connId === e.connId && validCert(t)
    && capturedBefore(control, t) && control.indexOf(t) < control.indexOf(e))), 'No hay imagen 2xx y TLS confiado por el propio APK.');
  const rejected = attack.filter(e => e.host === api && e.event === 'client_tls_failed' && validCert(e)
    && e.failureCategory === 'certificate_rejected' && capturedBefore(attack, e));
  assert.ok(rejected.some(e => attack.some(t => t.event === 'intercept' && t.connId === e.connId) &&
    attack.some(t => t.event === 'server_tls_ok' && t.connId === e.connId
      && attack.indexOf(t) < attack.indexOf(capturedBefore(attack, e)))), 'Falta rechazo con certificado válido y upstream TLS satisfactorio.');
  assert.ok(!attack.some(e => e.host === api && ['api_http_received', 'client_tls_ok', 'passthrough', 'server_tls_failed'].includes(e.event)), 'API aceptada, fuera del ataque o upstream fallido.');
  assert.ok(!rows.some(e => ['invalid_configuration', 'forbidden_request', 'addon_error'].includes(e.event)), 'El proxy detectó configuración o tráfico no admitido.');
  const ids = new Set(control.map(e => e.connId)); assert.ok(rejected.every(e => !ids.has(e.connId)), 'Se reutilizó una conexión del control.');
  return { status: 'passed_controlled_native_rejection', scope: 'Mismo APK release; CA aceptada por imagen del APK, rechazo API bajo MITM y recuperación. No identifica por sí solo una excepción de pinning.',
    imageResponses: images.length, apiRejections: rejected.length, nativePinExceptionCaptured: context.nativePinException === true };
}
async function sha256(file) { const hash = createHash('sha256'); for await (const c of fs.createReadStream(file)) hash.update(c); return hash.digest('hex'); }
function cleanEnv(env) { return Object.fromEntries(Object.entries(env).filter(([key]) => !/TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|KEYLOG/i.test(key))); }
async function command(binary, args, options = {}) {
  const { diagnostic, ...executionOptions } = options;
  try { return (await execute(binary, args, { timeout: 45000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', env: cleanEnv(process.env), ...executionOptions })).stdout; }
  catch (error) {
    const labels = ['NSC_MANIFEST', 'NSC_RESOURCE_TABLE', 'NSC_APK_ENTRIES', 'NSC_COMPILED_XML'];
    const exit = Number.isInteger(error.code) ? error.code : error.code === 'ENOENT' ? 'unavailable' : error.killed ? 'timeout' : 'unknown';
    if (labels.includes(diagnostic)) {
      throw new Error('PILOT_TOOL_FAILED ' + diagnostic + ' exit=' + exit);
    }
    throw new Error(path.basename(binary) + ': comando del piloto fallido; exit=' + exit + '; diagnóstico bruto sólo temporal.');
  }
}
const sleep = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms));
async function until(action, timeout = 90000) { const end = Date.now() + timeout; do { if (await action()) return; await sleep(1000); } while (Date.now() < end); throw new Error('El control no se completó dentro del plazo.'); }
async function playStorePresent(adb) {
  // pm path devuelve 1 cuando el paquete no existe: list packages representa esa ausencia con éxito.
  const output = await adb('shell', 'pm', 'list', 'packages', 'com.android.vending');
  return output.trim().split(/\r?\n/).some(line => line === 'package:com.android.vending');
}
async function assertCaAbsent(adb, devicePath) {
  assert.match(devicePath, /^\/system\/etc\/security\/cacerts\/[a-f0-9]{8}\.0$/);
  // adb ya invoca el shell remoto; un segundo sh -c perdería las comillas del cuerpo.
  const output = await adb('shell', 'if [ -e ' + devicePath + ' ]; then echo exists; else echo missing; fi');
  assert.equal(output.trim(), 'missing', 'Colisión de CA; no se sobrescribe un certificado existente.');
}
async function readUiDump(adb, devicePath) {
  assert.match(devicePath, /^\/data\/local\/tmp\/sport-pinning-[a-f0-9-]+\.xml$/);
  await adb('shell', 'rm', '-f', devicePath);
  const output = await adb('shell', 'uiautomator', 'dump', devicePath);
  // API30 puede devolver exit0 sin escribir XML si no alcanza idle/root. No leer una captura anterior.
  if (!output.includes('UI hierchary dumped to: ' + devicePath)) return '';
  const xml = await adb('shell', 'cat', devicePath);
  return /<hierarchy(?:\s|>)[\s\S]*<\/hierarchy>\s*$/.test(xml) ? xml : '';
}
function texts(xml) {
  const decode = value => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return [...xml.matchAll(/<node\b([^>]+)>/g)].map(m => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], decode(a[2])]))).filter(n => n.package === APP);
}
function visible(xml, expected) { return texts(xml).some(n => n.text === expected || n['content-desc'] === expected); }
function tapBounds(xml, expected) {
  const matches = texts(xml).filter(n => n.text === expected || n['content-desc'] === expected);
  assert.equal(matches.length, 1, 'Control de navegación ausente o ambiguo.');
  const b = matches[0].bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/); assert.ok(b);
  assert.ok(+b[3] > +b[1] && +b[4] > +b[2]); return [Math.floor((+b[1] + +b[3]) / 2), Math.floor((+b[2] + +b[4]) / 2)];
}
async function readCompiledPolicy(env, apk, meta, controls = {}) {
  const pinsConfig = JSON.parse(fs.readFileSync('config/security-pins.json', 'utf8'));
  const apiHost = hostname(pinsConfig.domain), imageHost = hostname(env.PINNING_IMAGE_HOST);
  assert.equal(new URL(meta.api).origin, 'https://' + apiHost, 'API de metadatos distinta del dominio compilado.');
  const tools = androidTools(env), analyzer = env.APKANALYZER || tools.analyzer;
  assert.equal((await command(analyzer, ['manifest', 'application-id', apk])).trim(), APP);
  assert.equal((await command(analyzer, ['manifest', 'debuggable', apk])).trim(), 'false');
  controls.minSdk = minSdkEvidence(await command(analyzer, ['manifest', 'min-sdk', apk]));
  const manifest = await command(analyzer, ['manifest', 'print', apk], { diagnostic: 'NSC_MANIFEST' });
  const nsc = await loadCompiledNsc(manifest, apk, { analyzer, aapt2: tools.aapt2 });
  controls.nscResource = nsc.resource;
  const policy = compiledPolicy(manifest, nsc.xml, apiHost, imageHost, pinsConfig.pins.map(p => p.sha256), nsc.resource);
  controls.compiledNsc = { compiled: true, systemOnly: true, apiHost, imageHost, pinCount: policy.pins.length };
  return policy;
}
async function preflight(env = process.env) {
  const result = { status: 'blocked', scope: 'compiled-nsc-only-no-avd-no-tls', controls: {} };
  try {
    assert.equal(process.platform, 'linux', 'NSC_PREFLIGHT_REQUIRES_LINUX');
    const apk = path.resolve(env.PINNING_APK || path.join(env.RUNNER_TEMP || os.tmpdir(), 'sport-center.apk'));
    const meta = JSON.parse(fs.readFileSync(env.PINNING_BUILD_META || 'test-results/android-build.json', 'utf8'));
    result.candidate = candidate(meta, await sha256(apk), env, resolveSourceContext(env));
    await readCompiledPolicy(env, apk, meta, result.controls);
    result.status = 'passed_compiled_nsc_preflight';
  } catch (error) { result.reason = error instanceof Error ? error.message.slice(0, 240) : 'NSC_PREFLIGHT_FAILED'; }
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/android-pinning-preflight.json', JSON.stringify(result, null, 2) + '\n');
  return result;
}
async function pilot(env = process.env) {
  assert.equal(process.platform, 'linux', 'El piloto nativo sólo se ejecuta en runner Linux efímero.');
  assert.equal(env.PINNING_EPHEMERAL_AVD, 'true'); assert.equal(env.PINNING_SYSTEM_IMAGE, 'system-images;android-30;default;x86_64');
  const serial = env.ANDROID_SERIAL || 'emulator-5554'; assert.match(serial, /^emulator-\d+$/);
  const temporary = path.resolve(env.RUNNER_TEMP || os.tmpdir()), scratch = fs.mkdtempSync(path.join(temporary, 'sport-pinning-'));
  const result = { status: 'blocked', controls: {}, tool: TOOL.version }; let proxy, proxyLog, caDevice, installedCa = false, proxyChanged = false;
  const adb = (...args) => command('adb', ['-s', serial, ...args]);
  const output = path.resolve('test-results/android-pinning.json');
  const runId = randomUUID(), file = name => path.join(scratch, name);
  const writePhase = phase => fs.writeFileSync(file('phase'), phase, { mode: 0o600 });
  const readEvents = () => fs.existsSync(file('events.jsonl')) ? fs.readFileSync(file('events.jsonl'), 'utf8').split('\n').filter(Boolean).map(s => JSON.parse(s)) : [];
  try {
    const apk = path.resolve(env.PINNING_APK || path.join(temporary, 'sport-center.apk'));
    const meta = JSON.parse(fs.readFileSync(env.PINNING_BUILD_META || 'test-results/android-build.json', 'utf8'));
    const context = resolveSourceContext(env);
    if (context.revalidation) verifyApi34Evidence(JSON.parse(fs.readFileSync('test-results/android34.json', 'utf8')), context);
    result.candidate = candidate(meta, await sha256(apk), env, context);
    assert.ok(typeof env.PRODUCT_NAME === 'string' && env.PRODUCT_NAME.trim().length > 0 && env.PRODUCT_NAME.length < 200 && !/[\r\n]/.test(env.PRODUCT_NAME), 'Falta producto público visible para control UI.');
    const policy = await readCompiledPolicy(env, apk, meta, result.controls);
    const { apiHost, imageHost } = policy;
    const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
    assert.ok(typeof sdk === 'string' && path.isAbsolute(sdk), 'ANDROID_SDK_REQUIRED');
    const installed = verifyAospPackage(await command(path.join(sdk, 'cmdline-tools/23.0/bin/sdkmanager'), ['--list_installed', '--sdk_root=' + sdk]));
    result.controls.systemImage = { ...installed, ...verifyAospImage(fs.readFileSync(path.join(sdk, 'system-images/android-30/default/x86_64/source.properties'), 'utf8')) };
    const version = await command(env.MITMDUMP || 'mitmdump', ['--version']); assert.match(version, /^Mitmproxy:\s+12\.3\.1(?: binary)?\s*$/m, 'Versión mitmproxy distinta de la fijada.');
    const priorProxy = (await adb('shell', 'settings', 'get', 'global', 'http_proxy')).trim();
    assert.ok(['null', '', ':0'].includes(priorProxy), 'El AVD ya tenía proxy: no es un control limpio.');
    await adb('root'); await adb('wait-for-device');
    const getprop = async key => (await adb('shell', 'getprop', key)).trim();
    result.emulator = emulatorEvidence({ serial, sdk: await getprop('ro.build.version.sdk'), qemu: await getprop('ro.kernel.qemu'),
      type: await getprop('ro.build.type'), abi: await getprop('ro.product.cpu.abi'), root: (await adb('shell', 'id', '-u')).trim(),
      playStore: await playStorePresent(adb) });
    await adb('install', '-r', apk);
    writePhase('control');
    fs.writeFileSync(file('config.json'), JSON.stringify({ runId, apiHost, imageHost, pins: policy.pins, phaseFile: file('phase'), events: file('events.jsonl'), caFile: file('ca/mitmproxy-ca-cert.pem') }), { mode: 0o600 });
    proxyLog = fs.openSync(file('proxy.log'), 'wx', 0o600);
    proxy = spawn(env.MITMDUMP || 'mitmdump', ['--listen-host', '127.0.0.1', '--listen-port', '18080', '--set', 'confdir=' + file('ca'),
      '--set', 'ssl_insecure=false', '--set', 'add_upstream_certs_to_client_chain=false', '-s', path.join(__dirname, 'android-pinning-proxy.py')],
    { env: { ...cleanEnv(env), PINNING_CONFIG: file('config.json') }, stdio: ['ignore', proxyLog, proxyLog] });
    let spawnFailed = false; proxy.on('error', () => { spawnFailed = true; });
    await until(async () => { assert.ok(!spawnFailed && proxy.exitCode === null, 'El proxy no pudo iniciarse.'); return fs.existsSync(file('ca/mitmproxy-ca-cert.pem')); }, 30000);
    await until(() => new Promise(resolve => { const socket = net.connect(18080, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); }), 15000);
    const caFile = file('ca/mitmproxy-ca-cert.pem');
    const hash = (await command('openssl', ['x509', '-in', caFile, '-subject_hash_old', '-noout'])).trim(); assert.match(hash, /^[a-f0-9]{8}$/);
    const caDigest = (await command('openssl', ['x509', '-in', caFile, '-fingerprint', '-sha256', '-noout'])).trim().split('=').pop().replace(/:/g, '').toLowerCase(); assert.match(caDigest, /^[a-f0-9]{64}$/);
    // API29/30 procedure documented by mitmproxy; failure never falls back to a user CA.
    await adb('shell', 'avbctl', 'disable-verification'); await adb('reboot'); await adb('wait-for-device');
    await until(async () => (await getprop('sys.boot_completed')) === '1', 120000);
    await adb('root'); await adb('wait-for-device');
    const remount = await adb('remount');
    if (/reboot/i.test(remount)) {
      await adb('reboot'); await adb('wait-for-device');
      await until(async () => (await getprop('sys.boot_completed')) === '1', 120000);
      await adb('root'); await adb('wait-for-device'); await adb('remount');
    }
    caDevice = '/system/etc/security/cacerts/' + hash + '.0';
    await assertCaAbsent(adb, caDevice);
    await adb('push', caFile, caDevice); installedCa = true;
    await adb('shell', 'chmod', '644', caDevice); await adb('shell', 'chown', 'root:root', caDevice); await adb('shell', 'restorecon', caDevice);
    assert.equal((await adb('shell', 'sha256sum', caDevice)).trim().split(/\s+/)[0], await sha256(caFile), 'CA copiada distinta.');
    await adb('reboot'); await adb('wait-for-device');
    await until(async () => (await getprop('sys.boot_completed')) === '1', 120000);
    result.controls.clockSynchronized = clockEvidence(await adb('shell', 'date', '+%s'), Date.now());
    await adb('shell', 'settings', 'put', 'global', 'http_proxy', '10.0.2.2:18080'); proxyChanged = true;
    const uiPath = '/data/local/tmp/sport-pinning-' + runId + '.xml';
    const ui = () => readUiDump(adb, uiPath);
    async function catalog() {
      await adb('shell', 'am', 'force-stop', APP); await adb('shell', 'pm', 'clear', APP);
      await adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', APP);
      let current = ''; await until(async () => { current = await ui(); return visible(current, 'Catálogo'); });
      await adb('shell', 'input', 'tap', ...tapBounds(current, 'Catálogo').map(String));
    }
    await catalog(); await until(async () => visible(await ui(), env.PRODUCT_NAME));
    await until(async () => readEvents().some(e => e.phase === 'control' && e.event === 'image_response' && e.status >= 200 && e.status < 300));
    result.controls.baselineUi = true;
    await adb('shell', 'am', 'force-stop', APP); proxy.kill('SIGTERM');
    await until(async () => proxy.exitCode !== null, 15000);
    // A new proxy process keeps the same CA, but removes all tunnels/TLS sessions from the control.
    clockEvidence(await adb('shell', 'date', '+%s'), Date.now());
    writePhase('attack'); proxy = spawn(env.MITMDUMP || 'mitmdump', ['--listen-host', '127.0.0.1', '--listen-port', '18080', '--set', 'confdir=' + file('ca'),
      '--set', 'ssl_insecure=false', '--set', 'add_upstream_certs_to_client_chain=false', '-s', path.join(__dirname, 'android-pinning-proxy.py')],
    { env: { ...cleanEnv(env), PINNING_CONFIG: file('config.json') }, stdio: ['ignore', proxyLog, proxyLog] });
    proxy.on('error', () => { spawnFailed = true; }); await sleep(1500); assert.ok(!spawnFailed && proxy.exitCode === null, 'No se reinició el proxy.');
    await catalog();
    await until(async () => { const xml = await ui(); return visible(xml, 'No se pudo cargar el catálogo') && visible(xml, 'Reintentar') && !visible(xml, env.PRODUCT_NAME); });
    result.controls.negativeUi = true;
    await until(async () => readEvents().some(e => e.phase === 'attack' && e.event === 'client_tls_failed'));
    await adb('shell', 'settings', 'delete', 'global', 'http_proxy'); proxyChanged = false;
    await catalog(); await until(async () => visible(await ui(), env.PRODUCT_NAME)); result.controls.recoveryUi = true;
    assert.equal(await sha256(apk), result.candidate.sha256, 'El APK cambió durante el piloto.');
    Object.assign(result, verdict(readEvents(), { runId, compiled: policy, caInstalled: true, caSha256: caDigest, baselineUi: true, negativeUi: true, recoveryUi: true }));
    await adb('shell', 'rm', '-f', uiPath);
  } catch (error) {
    result.status = 'blocked_or_failed'; result.reason = error instanceof Error ? error.message.slice(0, 240) : 'Piloto incompleto.';
    if (error instanceof SystemImageError) result.systemImageMismatch = error.diagnostic;
  } finally {
    try { if (proxyChanged) await adb('shell', 'settings', 'delete', 'global', 'http_proxy'); if (installedCa) { await adb('root'); await adb('wait-for-device'); await adb('shell', 'rm', '-f', caDevice); } }
    catch { result.status = 'blocked_or_failed'; result.cleanup = 'No se pudo comprobar limpieza; destruir AVD efímero.'; }
    if (proxy && proxy.exitCode === null) { proxy.kill('SIGTERM'); try { await until(async () => proxy.exitCode !== null, 10000); } catch { proxy.kill('SIGKILL'); } }
    if (proxyLog !== undefined) fs.closeSync(proxyLog);
    assert.ok(path.dirname(scratch) === temporary && path.basename(scratch).startsWith('sport-pinning-'));
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  }
  return result;
}
module.exports = { APP, TOOL, hostname, candidate, xmlTree, compiledPolicy, resolveNscResource, loadCompiledNsc, command, emulatorEvidence, verifyAospPackage, minSdkEvidence, clockEvidence, verdict, playStorePresent, assertCaAbsent, readUiDump, texts, visible, tapBounds, cleanEnv, preflight, pilot };
if (require.main === module) {
  const isPreflight = process.argv[2] === 'preflight';
  (isPreflight ? preflight() : pilot()).then(result => {
    console.log((isPreflight ? 'Preflight NSC compilada: ' : 'Piloto pinning nativo: ') + result.status
      + '. Informe saneado: test-results/' + (isPreflight ? 'android-pinning-preflight.json' : 'android-pinning.json'));
    process.exitCode = result.status === (isPreflight ? 'passed_compiled_nsc_preflight' : 'passed_controlled_native_rejection') ? 0 : 1;
  }).catch(() => { console.error('Piloto/preflight bloqueado antes de poder iniciarse.'); process.exitCode = 1; });
}

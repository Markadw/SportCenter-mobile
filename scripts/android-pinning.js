const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { createHash, randomUUID } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const APP = 'com.markadw.sportcenter';
const TOOL = Object.freeze({ version: '12.3.1', url: 'https://downloads.mitmproxy.org/12.3.1/mitmproxy-12.3.1-linux-x86_64.tar.gz',
  sha256: 'f7b4237f5702f6cd21357fe6e4680a7e905f8f9b816b872230d018ea696c34d5' });
function hostname(value) {
  assert.ok(typeof value === 'string' && value.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(value), 'Host público exacto inválido.');
  return value;
}
function candidate(meta, actualHash, env) {
  assert.match(env.GITHUB_REF || '', /^refs\/tags\/candidate\/android-[A-Za-z0-9_.-]+$/, 'Sólo etiquetas candidate/android-*.');
  assert.equal(env.PINNING_CANDIDATE, 'true', 'El job debe identificar explícitamente una candidata.');
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  assert.match(env.PINNING_EXPECTED_SHA256 || '', /^[a-f0-9]{64}$/);
  assert.ok(typeof meta?.buildId === 'string' && /^[a-zA-Z0-9-]+$/.test(meta.buildId), 'Falta ID de build.');
  assert.equal(meta.buildId, env.PINNING_EXPECTED_BUILD_ID, 'Build distinto del job API34.');
  assert.equal(meta.commit, env.GITHUB_SHA, 'Commit distinto de la candidata.');
  assert.equal(meta.commit, env.PINNING_EXPECTED_COMMIT, 'Commit distinto del job API34.');
  assert.equal(meta.emulatorApi, 34, 'La procedencia debe ser el APK del job API34.');
  assert.equal(meta.sha256, env.PINNING_EXPECTED_SHA256, 'Metadatos y output API34 discrepan.');
  assert.equal(actualHash, meta.sha256, 'El APK descargado no conserva su SHA256.');
  return { buildId: meta.buildId, commit: meta.commit, sha256: actualHash };
}
// Only the small release NSC shape emitted by this app is accepted. Unknown XML/configurations fail closed.
function xmlTree(source) {
  assert.ok(typeof source === 'string' && source.length < 2_000_000 && !/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(source), 'XML no admitido.');
  const input = source.replace(/<\?xml[^?]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
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
  return root.children[0];
}
function compiledPolicy(manifest, nsc, api, image, expectedPins) {
  hostname(api); hostname(image); assert.notEqual(api, image, 'El control de imagen debe quedar fuera del dominio pinned.');
  const appTag = manifest.replace(/<!--[\s\S]*?-->/g, '').match(/<application\b[^>]*>/);
  assert.ok(appTag && /\bandroid:networkSecurityConfig="@xml\/network_security_config"/.test(appTag[0]), 'No se resolvió la NSC compilada del manifiesto.');
  assert.ok(!/\bandroid:debuggable="true"/.test(appTag[0]), 'No se admite APK debuggable.');
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
  assert.equal(properties.abi, 'x86_64'); assert.equal(properties.root, '0'); assert.equal(properties.playStore, false);
  return { api: 30, abi: 'x86_64', type: 'userdebug', ephemeral: true };
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
  try { return (await execute(binary, args, { timeout: 45000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', env: cleanEnv(process.env), ...options })).stdout; }
  catch { throw new Error(path.basename(binary) + ': comando del piloto fallido; diagnóstico bruto sólo temporal.'); }
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
async function pilot(env = process.env) {
  assert.equal(process.platform, 'linux', 'El piloto nativo sólo se ejecuta en runner Linux efímero.');
  assert.equal(env.PINNING_EPHEMERAL_AVD, 'true'); assert.equal(env.PINNING_SYSTEM_IMAGE, 'system-images;android-30;google_apis;x86_64');
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
    result.candidate = candidate(meta, await sha256(apk), env);
    const pinsConfig = JSON.parse(fs.readFileSync('config/security-pins.json', 'utf8'));
    const apiHost = hostname(pinsConfig.domain), imageHost = hostname(env.PINNING_IMAGE_HOST);
    assert.equal(new URL(meta.api).origin, 'https://' + apiHost, 'API de metadatos distinta del dominio compilado.');
    assert.ok(typeof env.PRODUCT_NAME === 'string' && env.PRODUCT_NAME.trim().length > 0 && env.PRODUCT_NAME.length < 200 && !/[\r\n]/.test(env.PRODUCT_NAME), 'Falta producto público visible para control UI.');
    const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT; assert.ok(sdk);
    const analyzer = env.APKANALYZER || path.join(sdk, 'cmdline-tools/latest/bin/apkanalyzer');
    assert.equal((await command(analyzer, ['manifest', 'application-id', apk])).trim(), APP);
    assert.equal((await command(analyzer, ['manifest', 'debuggable', apk])).trim(), 'false');
    result.controls.minSdk = minSdkEvidence(await command(analyzer, ['manifest', 'min-sdk', apk]));
    const manifest = await command(analyzer, ['manifest', 'print', apk]);
    const nsc = await command(analyzer, ['resources', 'xml', '--file', '/res/xml/network_security_config.xml', apk]);
    const policy = compiledPolicy(manifest, nsc, apiHost, imageHost, pinsConfig.pins.map(p => p.sha256));
    result.controls.compiledNsc = { compiled: true, systemOnly: true, apiHost, imageHost, pinCount: policy.pins.length };
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
module.exports = { APP, TOOL, hostname, candidate, xmlTree, compiledPolicy, emulatorEvidence, minSdkEvidence, clockEvidence, verdict, playStorePresent, assertCaAbsent, readUiDump, texts, visible, tapBounds, cleanEnv, pilot };
if (require.main === module) pilot().then(result => { console.log('Piloto pinning nativo: ' + result.status + '. Informe saneado: test-results/android-pinning.json'); process.exitCode = result.status === 'passed_controlled_native_rejection' ? 0 : 1; })
  .catch(() => { console.error('Piloto bloqueado antes de poder iniciarse.'); process.exitCode = 1; });

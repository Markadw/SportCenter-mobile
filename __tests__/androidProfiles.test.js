/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { test, expect, jest } = require('@jest/globals');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const YAML = require('yaml');
const { validateWorkflows } = require('../scripts/validate-test-configs');
const pins = require('../config/security-pins.json');
const { SOURCE, BUILDS, BUNDLETOOL, FILES, verifySource, verifyProducer, verifyBuild, download,
  application, resolvePolicy, policyEvidence, debugFlows, metroAbsent, stopMetro, runtime, main } = require('../scripts/android-profiles');
const sha = 'a'.repeat(40);
const source = { sha, ref: 'refs/tags/validation/profiles-rc1', repository: SOURCE.repository,
  head: sha + '\n', changed: 'scripts/android-profiles.js\nREADME.md\n', dirty: '' };
function build(profile) { return { id: BUILDS[profile].id, platform: 'ANDROID', status: 'FINISHED', gitCommitHash: SOURCE.commit,
  app: { id: SOURCE.projectId }, appIdentifier: SOURCE.appId, buildProfile: profile,
  message: 'sport-center-' + profile + '-v1:' + SOURCE.commit, appVersion: '1.0.0', appBuildVersion: '1',
  artifacts: { applicationArchiveUrl: 'https://example.invalid/expected' + BUILDS[profile].extension + '?signed=PRIVATE' } }; }
function producer() { const names = ['Calidad previa a integración / Análisis estático y pruebas del cliente',
  'Seguridad previa a integración y APK / Dependencias y SAST CodeQL', 'Integración HTTP real y regresión de contratos', 'Resultado de integración'];
return { run: { id: SOURCE.runId, head_sha: SOURCE.commit, head_branch: 'develop', event: 'push',
  path: '.github/workflows/api-android.yml', status: 'completed', conclusion: 'success', repository: { full_name: SOURCE.repository } },
  jobs: { total_count: names.length, jobs: names.map(name => ({ name, run_id: SOURCE.runId, status: 'completed', conclusion: 'success' })) } }; }
function manifest(debug = false, extra = '', cleartext = debug ? 'true' : 'false', min = '24') {
  return '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="' + SOURCE.appId + '">'
    + '<uses-sdk android:minSdkVersion="' + min + '" android:targetSdkVersion="36"/>' + extra
    + '<application android:debuggable="' + debug + '" android:usesCleartextTraffic="' + cleartext + '" android:networkSecurityConfig="@ref/0x7f140006">'
    + '<activity android:name=".MainActivity"><intent-filter><data android:scheme="exp+sport-center-mobile"/></intent-filter></activity></application></manifest>';
}
const apiPolicy = '<base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system"/></trust-anchors></base-config>'
  + '<domain-config cleartextTrafficPermitted="false"><domain includeSubdomains="false">' + pins.domain + '</domain>'
  + '<trust-anchors><certificates src="system"/></trust-anchors><pin-set>'
  + pins.pins.map(pin => '<pin digest="SHA-256">' + pin.sha256 + '</pin>').join('') + '</pin-set></domain-config>';
const metroPolicy = '<domain-config cleartextTrafficPermitted="true">'
  + ['localhost', '127.0.0.1', '10.0.2.2', '10.0.3.2'].map(host => '<domain includeSubdomains="false">' + host + '</domain>').join('') + '</domain-config>';
const policy = debug => '<network-security-config>' + apiPolicy + (debug ? metroPolicy : '') + '</network-security-config>';
function workflows() { return new Map(['ci.yml', 'api-android.yml', 'performance.yml', 'security.yml', 'android-validation.yml']
  .map(file => [file, YAML.parse(fs.readFileSync(path.join(__dirname, '../.github/workflows', file), 'utf8'))])); }

test('congela perfiles, hashes reales y fuente distinta de preview; no contiene campos pendientes', () => {
  expect(SOURCE.commit).toBe('5dcacd46a24ae54da5300cd394a91c590a9a5825');
  expect(BUILDS.development.sha256).toBe('ebfb8281ec12359178954255c94cf3e7d70e681d405c9c497fa3b9064d34d1d2');
  expect(BUILDS.production.sha256).toBe('acf7d113a2a093211f3f990ac5d2b26ef5ff5ba37bc7a6efb9fe230fa05fd91b');
  expect(BUNDLETOOL).toMatchObject({ version: '1.18.3', sha256: 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29' });
  expect(verifySource(source)).toMatchObject({ artifactSourceCommit: SOURCE.commit, automationCommit: sha });
  for (const file of FILES) expect(() => verifySource({ ...source, changed: file })).not.toThrow();
});
test.each([{ ref: 'refs/tags/validation/android-rc1' }, { ref: 'refs/heads/develop' }, { repository: 'other/repo' },
  { sha: SOURCE.commit, head: SOURCE.commit }, { head: 'b'.repeat(40) }, { dirty: ' M app.json' },
  { changed: 'src/app/index.tsx' }, { changed: 'eas.json' }, { changed: 'package-lock.json' }, { changed: '' }])('bloquea fuente ajena o árbol de aplicación cambiado %#', change => {
  expect(() => verifySource({ ...source, ...change })).toThrow();
});
test('exige productor final aprobado y rechaza omisiones, paginación y duplicados', () => {
  const data = producer(); expect(verifyProducer(data.run, data.jobs)).toEqual({ producerChecksVerified: true });
  expect(() => verifyProducer({ ...data.run, conclusion: 'failure' }, data.jobs)).toThrow();
  expect(() => verifyProducer(data.run, { ...data.jobs, total_count: 100 })).toThrow();
  for (const state of ['failure', 'skipped', 'cancelled', null]) {
    const changed = producer(); changed.jobs.jobs[2].conclusion = state;
    expect(() => verifyProducer(changed.run, changed.jobs)).toThrow('PRODUCER_CHECK_NOT_SUCCESSFUL');
  }
  data.jobs.jobs.push(data.jobs.jobs[0]); data.jobs.total_count++;
  expect(() => verifyProducer(data.run, data.jobs)).toThrow();
});
test.each(['development', 'production'])('no confunde build/configuración/artefacto del perfil %s', profile => {
  expect(verifyBuild(build(profile), profile)).toMatchObject({ buildId: BUILDS[profile].id, profile, commit: SOURCE.commit });
  for (const damage of [{ status: 'IN_PROGRESS' }, { gitCommitHash: 'c'.repeat(40) }, { buildProfile: 'preview' }, { platform: 'IOS' },
    { id: 'another-build' }, { app: { id: 'other-project' } }, { appIdentifier: 'other.app' }, { message: 'old-message' },
    { appBuildVersion: '2' }, { expirationDate: '2000-01-01' }, { artifacts: { applicationArchiveUrl: 'http://example.invalid/test' + BUILDS[profile].extension } },
    { artifacts: { applicationArchiveUrl: 'https://example.invalid/wrong.zip' } }]) expect(() => verifyBuild({ ...build(profile), ...damage }, profile)).toThrow();
});
test('descarga exige hash congelado, verifica bytes y elimina archivo alterado sin filtrar URL', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-profiles-download-')), file = path.join(directory, 'artifact.apk');
  const bytes = Buffer.from('controlled artifact'), digest = createHash('sha256').update(bytes).digest('hex');
  const response = () => ({ status: 200, ok: true, body: Readable.toWeb(Readable.from([bytes])) });
  try {
    await expect(download('https://example.invalid/file.apk', file, '', jest.fn())).rejects.toThrow('ARTIFACT_HASH_NOT_FROZEN');
    await expect(download('https://example.invalid/file.apk', file, digest, jest.fn(response))).resolves.toBe(bytes.length);
    fs.unlinkSync(file);
    await expect(download('https://example.invalid/file.apk?token=PRIVATE', file, '0'.repeat(64), jest.fn(response))).rejects.toThrow('ARTIFACT_HASH_MISMATCH');
    expect(fs.existsSync(file)).toBe(false);
    const redirect = jest.fn(async () => ({ status: 302, body: { cancel: jest.fn() }, headers: { get: () => 'http://example.invalid/plain.apk' } }));
    await expect(download('https://example.invalid/file.apk', file, digest, redirect)).rejects.toThrow('ARTIFACT_HTTPS_REQUIRED');
    expect(redirect).toHaveBeenCalledTimes(1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('Debug registra flag real con precedencia NSC API24+ y release sigue exigiendo false', () => {
  const permissions = '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>'
    + '<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE"/>';
  expect(application(manifest(true, permissions), true).evidence).toMatchObject({ debuggable: true, manifestCleartext: 'true', effectiveCleartextAuthority: 'NSC-API24+' });
  expect(() => application(manifest(true, '', 'true', '23'), true)).toThrow('MANIFEST_SDK');
  expect(() => application(manifest(false, '', 'true'), false)).toThrow('MANIFEST_TLS_POLICY_REQUIRED');
  for (const permission of ['SYSTEM_ALERT_WINDOW', 'CHANGE_WIFI_MULTICAST_STATE']) {
    expect(() => application(manifest(false, '<uses-permission android:name="android.permission.' + permission + '"/>'), false)).toThrow('UNUSED_PERMISSION');
  }
  expect(() => application(manifest(true, '<uses-permission android:name="android.permission.CAMERA"/>'), true)).toThrow('UNUSED_PERMISSION');
});
test('resuelve NSC compilada de Debug sin cambiar el manifiesto para fingir release', () => {
  const table = 'Package name=' + SOURCE.appId + ' id=7f\n  resource 0x7f140006 xml/network_security_config\n    () (file) res/xml/network_security_config.xml type=XML\n';
  expect(resolvePolicy(manifest(true), table, true)).toMatchObject({ id: '0x7f140006', path: 'res/xml/network_security_config.xml' });
  expect(() => resolvePolicy(manifest(true), table.replace('resource 0x7f140006', 'resource 0x7f140007'), true)).toThrow();
  expect(() => resolvePolicy(manifest(true), table + '    () (file) res/xml/other.xml type=XML\n', true)).toThrow();
});
test('política mantiene API pinned y loopback sólo en Debug, sin CAs nuevas ni bypass', () => {
  expect(policyEvidence(policy(true), true).metroCleartextHosts).toHaveLength(4);
  expect(policyEvidence(policy(false), false).metroCleartextHosts).toEqual([]);
  for (const [xml, debug] of [[policy(true), false], [policy(false), true],
    [policy(true).replace('>localhost<', '>evil.invalid<'), true],
    [policy(true).replace('src="system"', 'src="user"'), true],
    [policy(true).replace('cleartextTrafficPermitted="false"', 'cleartextTrafficPermitted="true"'), true],
    [policy(true).replace('<pin-set>', '<pin-set expiration="2000-01-01">'), true]]) expect(() => policyEvidence(xml, debug)).toThrow();
});
test('Debug abre el servidor después de clearState; no aprueba sólo el launcher', () => {
  const original = fs.readFileSync(path.join(__dirname, '../.maestro', fs.readdirSync(path.join(__dirname, '../.maestro'))[0]), 'utf8');
  const url = 'exp+sport-center-mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081';
  const transformed = YAML.parseAllDocuments(debugFlows(original, url))[1].toJSON();
  expect(transformed[0]).toEqual({ launchApp: { clearState: true } }); expect(transformed[1]).toEqual({ openLink: url });
  expect(() => debugFlows(original, 'http://unrelated.invalid')).toThrow();
});
test('no confunde timeout o respuesta HTTP con ausencia de Metro', async () => {
  await expect(metroAbsent(jest.fn(async () => { throw Object.assign(new Error('private'), { cause: { code: 'ECONNREFUSED' } }); }))).resolves.toBe(true);
  await expect(metroAbsent(jest.fn(async () => { throw Error('timeout'); }))).rejects.toThrow('METRO_ABSENCE_UNPROVEN');
  await expect(metroAbsent(jest.fn(async () => ({ ok: false })))).rejects.toThrow('METRO_STILL_LISTENING');
});
test('limpieza de Metro termina sólo el grupo propio y espera su salida', async () => {
  const child = { pid: 123456, exitCode: null, signalCode: null, kill: jest.fn() };
  const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
  try { await stopMetro(child, async () => { child.signalCode = 'SIGTERM'; });
    expect(kill).toHaveBeenCalledWith(-123456, 'SIGTERM'); expect(child.kill).not.toHaveBeenCalled(); }
  finally { kill.mockRestore(); }
});
test('fallo Maestro Debug conserva fallo y limpia reverse, Metro y app sin ejecutar release', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-profiles-runtime-'));
  fs.mkdirSync(path.join(temporary, 'sport-center-profiles'));
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, pid: 123456 });
  const state = { offlineStatus: 'passed', productionDerived: { aabSha256: BUILDS.production.sha256, apkSha256: 'd'.repeat(64) },
    developmentInspection: { manifest: { schemes: ['exp+sport-center-mobile'] } } };
  const run = jest.fn(async (tool, args) => {
    if (tool === 'maestro') throw Error('controlled Maestro failure');
    if (args[0] === 'devices') return 'List of devices attached\nemulator-5554\tdevice\n';
    if (args.includes('ro.kernel.qemu')) return '1';
    if (args.includes('ro.build.version.sdk')) return '34';
    if (args.includes('ro.product.cpu.abi')) return 'x86_64';
    return '';
  });
  const stop = jest.fn(async () => { child.signalCode = 'SIGTERM'; }); const save = jest.fn();
  try {
    await expect(runtime({ RUNNER_TEMP: temporary, GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', PINNING_EPHEMERAL_AVD: 'true', PRODUCT_NAME: 'Test product' }, 34,
      { run, save, stop, platform: 'linux', source: async () => ({}), fileHash: async file => file.endsWith('development.apk') ? BUILDS.development.sha256 : 'd'.repeat(64),
        read: () => JSON.stringify(state), wait: async () => ({ ready: true }), idle: async () => true,
        start: () => child, ready: async () => {} })).rejects.toThrow('PUBLIC_PROFILE_ACCEPTANCE_FAILED');
    expect(stop).toHaveBeenCalledWith(child, expect.any(Function));
    expect(run.mock.calls.some(([, args]) => args.includes('--remove'))).toBe(true);
    expect(run.mock.calls.some(([, args]) => args.includes('uninstall'))).toBe(true);
    expect(run.mock.calls.filter(([tool]) => tool === 'maestro')).toHaveLength(1);
    expect(save).toHaveBeenLastCalledWith({ development: expect.objectContaining({ status: 'failed', cleanup: 'passed' }) });
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
test.each(['failure', 'skipped', 'cancelled', undefined])('agregado de perfiles bloquea resultado %s', async result => {
  await expect(main('gate', { RESULT_QUALITY: 'success', RESULT_SECURITY: 'success', RESULT_PROFILES: result })).rejects.toThrow('PROFILE_REQUIRED_JOB_NOT_SUCCESSFUL');
});
test('agregado sólo aprueba todos los jobs correctos', async () => {
  await expect(main('gate', { RESULT_QUALITY: 'success', RESULT_SECURITY: 'success', RESULT_PROFILES: 'success' })).resolves.toBeUndefined();
});
test.each([
  workflow => { workflow.jobs.profiles.if = 'always()'; },
  workflow => { workflow.jobs.native.if = "startsWith(github.ref, 'refs/tags/validation/profiles-')"; },
  workflow => { workflow.jobs.result.if = 'always()'; },
  workflow => { workflow.jobs.profiles.env.EXPO_TOKEN = 'secret'; },
  workflow => { workflow.jobs.profiles.env.GITHUB_SHA = 'spoof'; },
  workflow => { workflow.jobs.profiles.steps.find(step => step.id === 'source').if = 'false'; },
  workflow => { workflow.jobs.profiles.steps.find(step => step.id === 'inspection')['continue-on-error'] = true; },
  workflow => { workflow.jobs.profiles.steps.find(step => step.id === 'pages16k').with.target = 'google_apis'; },
  workflow => { workflow.jobs.profiles.steps = workflow.jobs.profiles.steps.filter(step => step.run !== 'node scripts/android-profiles.js cleanup'); },
  workflow => { workflow.jobs.profiles.steps.find(step => step.uses?.startsWith('actions/upload-artifact')).with.path += '\nkeystore.jks'; },
  workflow => { workflow.jobs.profiles_result.steps.find(step => step.run?.endsWith(' gate')).env.RESULT_PROFILES = 'success'; },
])('rechaza orquestación de perfiles insegura o que falsea resultados %#', mutate => {
  const config = workflows(); mutate(config.get('android-validation.yml')); expect(() => validateWorkflows(config)).toThrow();
});

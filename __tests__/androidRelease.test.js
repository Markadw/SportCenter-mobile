/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { test, expect, jest } = require('@jest/globals');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { validateWorkflows } = require('../scripts/validate-test-configs');
const profiles = require('../scripts/android-profiles');
const { MODE, FINAL_SOURCE, PREBUILD_RUN_ID, PREBUILD_SCOPE, PREBUILD_ATTEMPT, PREBUILD_ANDROID_SCOPE, AUTOMATION_FILES, verifyReceipt, readReceipt, fingerprint, verifyAutomation, verifyPrebuild,
  verifyBuild, sourceContext, validateResult, LINK_CASES, incomingFlow, verifyLinkLaunch, verifyLinkReport,
  validateIncomingLinks } = require('../scripts/android-release');

const sourceCommit = FINAL_SOURCE, automationCommit = 'f'.repeat(40);
const receipt = () => ({ version: 1, mode: MODE, repository: profiles.SOURCE.repository, sourceCommit, prebuildRunId: PREBUILD_RUN_ID,
  projectId: profiles.SOURCE.projectId, appId: profiles.SOURCE.appId, api: profiles.SOURCE.api, appVersion: '1.0.0', appBuildVersion: '1',
  production: { buildId: '11111111-1111-1111-1111-111111111111', sha256: 'a'.repeat(64), bytes: 12345,
    message: 'sport-center-production-v1:' + sourceCommit } });
const automation = () => ({ sha: automationCommit, ref: 'refs/tags/validation/release-rc3-v1', repository: profiles.SOURCE.repository,
  head: automationCommit, changed: 'scripts/android-release.js\nconfig/android-release-validation.json', dirty: '' });
const context = () => verifyAutomation(receipt(), automation());
const contract = () => ({ sourceCommit, buildId: receipt().production.buildId, sha256: receipt().production.sha256 });
function producer() {
  const names = ['Definir comprobaciones por evento y rama', 'Calidad previa a integración / Análisis estático y pruebas del cliente',
    'Seguridad previa a integración y APK / Dependencias y SAST CodeQL', 'Integración HTTP real y regresión de contratos',
    'Comprobar configuración de rendimiento y estrés / Inspeccionar guiones sin ejecutar carga',
    'Resultado de integración', 'Compilar y aceptar APK candidato', 'Rechazo nativo bajo MITM y recuperación del mismo APK'];
  return { run: { id: PREBUILD_RUN_ID, head_sha: sourceCommit, head_branch: 'candidate/android-rc5', run_attempt: PREBUILD_ATTEMPT,
    event: 'push', path: '.github/workflows/api-android.yml', status: 'completed', conclusion: 'success', repository: { full_name: profiles.SOURCE.repository } },
  jobs: { total_count: names.length, jobs: names.map(name => ({ name, run_id: PREBUILD_RUN_ID, run_attempt: PREBUILD_ATTEMPT,
    status: 'completed', conclusion: 'success' })) } };
}
function build() { const value = receipt(); return { id: value.production.buildId, platform: 'ANDROID', status: 'FINISHED',
  gitCommitHash: value.sourceCommit, buildProfile: 'production', app: { id: value.projectId }, appIdentifier: value.appId,
  message: value.production.message, appVersion: value.appVersion, appBuildVersion: value.appBuildVersion,
  artifacts: { applicationArchiveUrl: 'https://example.test/artifact.aab?signed=private' } }; }

test('no crea ni acepta recibos PENDING, esquema abierto o hash ausente', () => {
  expect(verifyReceipt(receipt())).toEqual(receipt());
  expect(() => readReceipt(() => { throw Error('secret-private-path'); })).toThrow('RELEASE_RECEIPT_MISSING');
  expect(() => readReceipt(() => '{broken')).toThrow('RELEASE_RECEIPT_INVALID');
  for (const mutate of [value => { value.sourceCommit = 'PENDING'; }, value => { delete value.production.sha256; },
    value => { value.production.buildId = 'PENDING'; }, value => { value.production.sha256 = 'PENDING'; },
    value => { value.production.bytes = 0; }, value => { value.production.bytes = 1024 ** 3; },
    value => { value.mode = 'all-passed'; }, value => { value.production.url = 'https://signed.test'; },
    value => { value.appId = 'other.app'; }, value => { value.api = 'http://127.0.0.1:3011'; },
    value => { value.production.message = 'anything'; }, value => { value.appBuildVersion = 'NaN'; },
    value => { value.sourceCommit = [value.sourceCommit]; }, value => { value.production.buildId = [value.production.buildId]; },
    value => { value.production.sha256 = [value.production.sha256]; }, value => { value.appBuildVersion = [value.appBuildVersion]; },
    value => { value.prebuildRunId += 1; },
    value => { value.sourceCommit = '5d2f30256ec201bcb1b96d3bc00a6d1fa47e9624'; },
    value => { value.prebuildRunId = 41701616145; }]) {
    const value = receipt(); mutate(value); expect(() => verifyReceipt(value)).toThrow();
  }
});
test('huella estable del recibo incluye toda identidad de artefacto', () => {
  const value = receipt(); expect(fingerprint(value)).toHaveLength(64);
  expect(fingerprint({ ...value, production: { ...value.production, bytes: 23456 } })).not.toBe(fingerprint(value));
  expect(fingerprint(Object.fromEntries(Object.entries(value).reverse()))).toBe(fingerprint(value));
});
test('la automatización nueva acepta sólo rutas exactas y jamás lock, app o parches', () => {
  expect(verifyAutomation(receipt(), automation())).toMatchObject({ validationMode: MODE, artifactSourceCommit: sourceCommit,
    automationCommit, productionBuildId: receipt().production.buildId, productionSha256: 'a'.repeat(64) });
  for (const file of ['src/app/index.tsx', 'app.json', 'eas.json', 'package.json', 'package-lock.json',
    'patches/decode-uri-component+0.2.2.patch', 'assets/icon.png', 'config/security-pins.json', 'scripts/android-release-neighbor.js',
    'tests/manual/neighbor.md', '.github/workflows/security.yml']) {
    expect(AUTOMATION_FILES).not.toContain(file);
    expect(() => verifyAutomation(receipt(), { ...automation(), changed: file })).toThrow('RELEASE_APPLICATION_TREE_CHANGED');
  }
  for (const changed of [{ sha: sourceCommit }, { ref: 'refs/tags/validation/profiles-rc2-v5' }, { head: sourceCommit }, { dirty: '?? stray' }]) {
    expect(() => verifyAutomation(receipt(), { ...automation(), ...changed })).toThrow();
  }
});
test('requiere el productor RC5 exacto con ocho jobs aprobados, incluido Preview y TLS', () => {
  const value = producer(); expect(verifyPrebuild(receipt(), value.run, value.jobs)).toEqual({ prebuildChecksVerified: true, prebuildScope: PREBUILD_SCOPE, prebuildAndroid: PREBUILD_ANDROID_SCOPE, prebuildAttempt: PREBUILD_ATTEMPT });
  for (const mutate of [value => { value.run.head_sha = profiles.SOURCE.commit; }, value => { value.run.head_branch = 'candidate/android-rc3'; },
    value => { value.run.conclusion = 'failure'; }, value => { value.run.event = 'pull_request'; },
    value => { value.jobs.jobs[4].conclusion = 'skipped'; }, value => { value.jobs.jobs[4].status = 'in_progress'; },
    value => { value.jobs.jobs.push(value.jobs.jobs[0]); value.jobs.total_count++; }, value => { value.jobs.total_count++; },
    value => { value.jobs.jobs[6].conclusion = 'skipped'; }, value => { value.jobs.jobs[7].conclusion = 'failure'; },
    value => { value.run.id += 1; }, value => { value.run.run_attempt += 1; }, value => { value.jobs.jobs[0].run_attempt += 1; },
    value => { value.run.status = 'in_progress'; value.run.conclusion = null; }]) {
    const input = producer(); mutate(input); expect(() => verifyPrebuild(receipt(), input.run, input.jobs)).toThrow();
  }
});
test('el AAB debe ser FINISHED, del SHA, perfil y mensaje congelados; jamás Preview/Debug', () => {
  expect(verifyBuild(receipt(), build())).toMatchObject({ buildId: receipt().production.buildId, commit: sourceCommit });
  for (const mutate of [value => { value.status = 'IN_PROGRESS'; }, value => { value.gitCommitHash = profiles.SOURCE.commit; },
    value => { value.buildProfile = 'development'; }, value => { value.buildProfile = 'preview'; }, value => { value.app.id = 'other'; },
    value => { value.id = profiles.BUILDS.production.id; }, value => { value.message = 'other'; }, value => { value.appBuildVersion = '2'; },
    value => { value.artifacts.applicationArchiveUrl = 'https://example.test/app.apk'; },
    value => { value.artifacts.applicationArchiveUrl = 'https://user:secret@example.test/app.aab'; }, value => { value.expirationDate = '2020-01-01'; }]) {
    const input = build(); mutate(input); expect(() => verifyBuild(receipt(), input)).toThrow();
  }
});
test('revalida prueba de fuente por paso y rechaza otra revisión o comprobaciones previas no acreditadas', async () => {
  const env = { GITHUB_SHA: automationCommit, GITHUB_REF: automation().ref, GITHUB_REPOSITORY: profiles.SOURCE.repository };
  const run = async (_tool, args) => args[0] === 'rev-parse' ? automationCommit : args[0] === 'diff' ? automation().changed : '';
  const proof = { ...context(), prebuildChecksVerified: true, prebuildScope: PREBUILD_SCOPE, prebuildAndroid: PREBUILD_ANDROID_SCOPE, prebuildAttempt: PREBUILD_ATTEMPT };
  await expect(sourceContext(env, receipt(), run, () => JSON.stringify(proof))).resolves.toEqual(context());
  for (const invalid of [{ ...proof, prebuildChecksVerified: false }, { ...proof, prebuildScope: 'native-apk-tls-passed' },
    { ...proof, prebuildAndroid: 'passed' }, { ...proof, receiptSha256: 'b'.repeat(64) },
    { ...proof, artifactSourceCommit: profiles.SOURCE.commit }]) {
    await expect(sourceContext(env, receipt(), run, () => JSON.stringify(invalid))).rejects.toThrow('RELEASE_SOURCE_PROOF_MISMATCH');
  }
});
test('runtime release-only exige recibo, tag y prueba correlacionados y nunca permite Debug', () => {
  const env = { GITHUB_SHA: automationCommit, GITHUB_REF: automation().ref, GITHUB_REPOSITORY: profiles.SOURCE.repository };
  expect(profiles.verifyReleaseRuntimeContract(contract(), context(), env, 'release34')).toEqual({ id: receipt().production.buildId, sha256: 'a'.repeat(64) });
  for (const mode of ['debug34', 'api34', 'other']) expect(() => profiles.verifyReleaseRuntimeContract(contract(), context(), env, mode)).toThrow('RELEASE_RUNTIME_SCOPE');
  for (const proof of [{ ...context(), validationMode: 'historical' }, { ...context(), productionSha256: 'b'.repeat(64) },
    { ...context(), automationCommit: sourceCommit }, { ...context(), productionBuildId: profiles.BUILDS.production.id }]) {
    expect(() => profiles.verifyReleaseRuntimeContract(contract(), proof, env, 'release34')).toThrow('RELEASE_RUNTIME_PROOF_MISMATCH');
  }
  expect(() => profiles.verifyReleaseRuntimeContract(contract(), context(), { ...env, GITHUB_REF: 'refs/tags/validation/profiles-old' }, 'release34')).toThrow('RELEASE_RUNTIME_SCOPE');
  expect(() => profiles.verifyReleaseRuntimeContract({ ...contract(), skipDebug: true }, context(), env, 'release34')).toThrow('RELEASE_RUNTIME_CONTRACT_SCHEMA');
});
function runtimeFixture({ fail = false, cleanupFail = false } = {}) {
  const state = { ...context(), offlineStatus: 'passed', productionDerived: { aabSha256: receipt().production.sha256, apkSha256: 'd'.repeat(64) } };
  const run = jest.fn(async (tool, args) => {
    if (tool === 'maestro') { if (fail) throw Error('private failure'); return ''; }
    if (args[0] === 'devices') return 'List of devices attached\nemulator-5554\tdevice\n';
    if (args.includes('ro.kernel.qemu')) return '1'; if (args.includes('ro.build.version.sdk')) return '34';
    if (args.includes('ro.product.cpu.abi')) return 'x86_64'; if (args.includes('pidof')) return '1234';
    if (args.includes('uninstall') && cleanupFail) throw Error('private cleanup');
    return '';
  });
  const config = { run, releaseContract: contract(), save: update => Object.assign(state, update), platform: 'linux', source: async () => context(),
    fileHash: async () => 'd'.repeat(64), read: file => file.endsWith('.xml') ? '<testsuite><testcase name="catalog"/><testcase name="detail"/></testsuite>' : JSON.stringify(state),
    wait: async () => ({ ready: true }), idle: async () => true, stop: async () => {}, afterPublic: async () => passedLinks() };
  const env = { RUNNER_TEMP: os.tmpdir(), GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', PINNING_EPHEMERAL_AVD: 'true',
    PRODUCT_NAME: 'Synthetic', GITHUB_SHA: automationCommit, GITHUB_REF: automation().ref, GITHUB_REPOSITORY: profiles.SOURCE.repository };
  return { state, run, config, env };
}
test('nueva Release API34 funciona sin un Debug ficticio y sigue apuntando Maestro al serial verificado', async () => {
  const f = runtimeFixture(); await expect(profiles.runtime(f.env, 'release34', f.config)).resolves.toBeUndefined();
  expect(f.state.development).toBeUndefined(); expect(f.state.runtimeApi34Status).toBe('passed');
  expect(f.state.production).toMatchObject({ artifactSourceCommit: sourceCommit, automationCommit, status: 'passed_public_scope', cleanup: 'passed',
    cleanReleaseStart: { metroAbsent: true, reverseAbsent: true, packageAbsent: true } });
  const maestro = f.run.mock.calls.find(([tool]) => tool === 'maestro');
  expect(maestro[1].slice(0, 3)).toEqual(['--device', 'emulator-5554', 'test']);
  expect(maestro[1]).toContain('test-results/release-production.xml');
  await expect(profiles.runtime(f.env, 'release34', f.config)).rejects.toThrow('PROFILE_PHASE_ALREADY_RECORDED');
});
test('el modo histórico conserva su obligación Debug y no hereda la excepción release-only', async () => {
  const f = runtimeFixture(); delete f.config.releaseContract;
  f.config.source = async () => ({ artifactSourceCommit: profiles.SOURCE.commit, automationCommit });
  f.state.productionDerived.aabSha256 = profiles.BUILDS.production.sha256;
  await expect(profiles.runtime(f.env, 'release34', f.config)).rejects.toThrow('DEBUG_CLEANUP_NOT_PASSED');
  expect(profiles.api34Aggregate({ production: { status: 'passed_public_scope', cleanup: 'passed' } })).toMatchObject({ runtimeApi34Status: 'incomplete', runtimeApi34MissingPhases: ['development'] });
});
test('un fallo de aceptación o cleanup conserva el fallo del agregado release-only', async () => {
  for (const options of [{ fail: true }, { cleanupFail: true }]) {
    const f = runtimeFixture(options); await expect(profiles.runtime(f.env, 'release34', f.config)).rejects.toThrow();
    expect(f.state.runtimeApi34Status).toBe('failed'); expect(f.state.production.status).toBe('failed');
  }
});
function passedState() {
  const phase = api => ({ artifactSourceCommit: sourceCommit, automationCommit, status: 'passed_public_scope', cleanup: 'passed', profile: 'production',
    api, abi: 'x86_64', publicFlows: 2, processAfter: true, crashCheck: { fatalCrashDetected: false }, independentOfMetro: true,
    cleanReleaseStart: { metroAbsent: true, reverseAbsent: true, packageAbsent: true }, incomingLinks: passedLinks() });
  return { validationMode: MODE, offlineStatus: 'passed', productionBundle: { status: 'passed_bundle_scope', sha256: receipt().production.sha256,
    buildId: receipt().production.buildId, artifactSourceCommit: sourceCommit }, productionDerived: { status: 'passed_offline_scope',
    aabSha256: receipt().production.sha256, buildId: receipt().production.buildId, apkSha256: 'd'.repeat(64) },
  production: phase(34), production16k: { ...phase(36), backcompatDisabled: true, runtimeBefore: { pageSize: 16384 }, runtimeAfter: { pageSize: 16384 } } };
}
function passedLinks() { return { method: 'adb-view-cold-public-uri', scope: 'native-entry-routing-not-decoder-recovery',
  cases: LINK_CASES.map(item => ({ id: item.id, status: 'passed', nativeLaunchConfirmed: true })) }; }
test('finish exige las dos Releases propias, 16KB, proceso y limpieza sin fabricar Debug actual', () => {
  expect(validateResult(receipt(), passedState(), context())).toEqual({ status: 'passed_production_release_scope', validationMode: MODE, debugCurrentSource: 'not-requested-not-accredited' });
  for (const mutate of [state => { state.production.status = 'failed'; }, state => { state.production.cleanup = 'failed'; },
    state => { state.development = { status: 'passed_public_scope' }; }, state => { delete state.production16k; },
    state => { state.production16k.runtimeAfter.pageSize = 4096; }, state => { state.production16k.backcompatDisabled = false; },
    state => { state.production.processAfter = false; }, state => { state.production.crashCheck.fatalCrashDetected = true; },
    state => { state.production.artifactSourceCommit = profiles.SOURCE.commit; }, state => { state.productionDerived.aabSha256 = profiles.BUILDS.production.sha256; },
    state => { state.productionBundle.status = 'failed'; }, state => { delete state.production.incomingLinks; },
    state => { state.production16k.incomingLinks.cases[1].status = 'failed'; }]) {
    const state = passedState(); mutate(state); expect(() => validateResult(receipt(), state, context())).toThrow();
  }
});
test('URI finitas comprueban Unicode/+ y rechazo previo al parser, sin ampliar rutas ni permitir casos arbitrarios', () => {
  expect(LINK_CASES.map(value => value.uri)).toEqual(['sportcentermobile://catalog?q=bal%C3%B3n%2Bcampo', 'sportcentermobile://catalog?q=%E0%A4%A']);
  expect(incomingFlow(LINK_CASES[0])).toContain('^balón\\\\+campo$');
  expect(incomingFlow(LINK_CASES[1])).toContain('- assertNotVisible: "Borrar búsqueda"');
  for (const item of LINK_CASES) {
    expect(incomingFlow(item)).toContain('timeout: 45000');
    expect(incomingFlow(item)).not.toMatch(/retryTap|optional:|sleep:|launchApp:/);
  }
  expect(() => incomingFlow({ ...LINK_CASES[0], uri: 'https://evil.test' })).toThrow('RELEASE_LINK_CASE_NOT_ALLOWED');
});
test('arranque y JUnit de URI son obligatorios; chooser, paquete distinto, error u omisión fallan', () => {
  const valid = 'Status: ok\nActivity: ' + profiles.SOURCE.appId + '/.MainActivity\n';
  expect(() => verifyLinkLaunch(valid)).not.toThrow();
  for (const raw of ['', 'Status: timeout\nActivity: ' + profiles.SOURCE.appId + '/.MainActivity\n', valid + valid,
    'Status: ok\nActivity: android/com.android.internal.app.ChooserActivity\n']) expect(() => verifyLinkLaunch(raw)).toThrow('RELEASE_LINK_LAUNCH_NOT_VERIFIED');
  expect(() => verifyLinkReport(linkXml(), LINK_CASES[0])).not.toThrow();
  for (const xml of ['', '<testsuite/>', '<testcase/><testcase/>', '<testcase><failure/></testcase>', '<testcase><skipped/></testcase>']) {
    expect(() => verifyLinkReport(xml, LINK_CASES[0])).toThrow('RELEASE_LINK_UI_NOT_PASSED');
  }
});
test('las entradas nativas usan adb VIEW package explícito y Maestro device, sin datos privados ni fallback del decoder', async () => {
  const run = jest.fn(async () => ''), writes = [], adb = jest.fn(async args => {
    if (args.includes('pidof')) return '1234';
    if (args.includes('start')) return 'Status: ok\nActivity: ' + profiles.SOURCE.appId + '/.MainActivity\n';
    return '';
  });
  const result = await validateIncomingLinks({ run, adb, serial: 'emulator-5554', env: {}, files: { scratch: os.tmpdir() }, api: 34,
    mkdir: jest.fn(), write: (file, contents) => writes.push([file, contents]), read: file => linkXml(file.includes('L02') ? 'L02' : 'L01') });
  expect(result).toMatchObject({ method: 'adb-view-cold-public-uri', scope: 'native-entry-routing-not-decoder-recovery', cases: [{ id: 'L01', status: 'passed' }, { id: 'L02', status: 'passed' }] });
  expect(writes).toHaveLength(2); expect(run).toHaveBeenCalledTimes(2);
  for (const [, args] of run.mock.calls) expect(args.slice(0, 3)).toEqual(['--device', 'emulator-5554', 'test']);
  const starts = adb.mock.calls.map(value => value[0]).filter(args => args.includes('start'));
  expect(starts).toHaveLength(2);
  for (const args of starts) expect(args.slice(-2)).toEqual(['-p', profiles.SOURCE.appId]);
  expect(JSON.stringify(result)).not.toMatch(/signed|https:|JWT|Bear|sportcentermobile|balón|decoder-fallback-passed/);
});
function linkXml(id = 'L01') {
  const name = id + ' native public entry';
  return '<?xml version="1.0" encoding="UTF-8"?><testsuites><testsuite name="Test Suite" tests="1" failures="0">' +
    '<testcase id="' + name + '" name="' + name + '" classname="' + name + '" file="tmp/' + id + '.yaml" status="SUCCESS"/>' +
    '</testsuite></testsuites>';
}
test('JUnit Maestro real admite raíz sin contadores y metadatos opcionales coherentes', () => {
  for (const item of LINK_CASES) expect(() => verifyLinkReport(linkXml(item.id), item)).not.toThrow();
  const value = linkXml().replace('<testsuites>', '<testsuites tests="1" failures="0" errors="0" skipped="0">')
    .replace('tests="1" failures="0">', 'tests="1" failures="0" errors="0" skipped="0">');
  expect(() => verifyLinkReport(value, LINK_CASES[0])).not.toThrow();
  expect(() => verifyLinkReport(linkXml(), { ...LINK_CASES[0] })).toThrow('RELEASE_LINK_CASE_NOT_ALLOWED');
});
test.each([
  value => value.slice(0, -8),
  value => value.replace('<testsuites>', '<other>').replace('</testsuites>', '</other>'),
  value => value.replace('tests="1"', 'tests="2"'),
  value => value.replace('tests="1"', 'tests="01"'),
  value => value.replace('failures="0"', 'failures="1"'),
  value => value.replace(' failures="0"', ''),
  value => value.replace('<testsuites>', '<testsuites tests="2">'),
  value => value.replace('<testsuites>', '<testsuites failures="1">'),
  value => value.replace('<testsuites>', '<testsuites errors="1">'),
  value => value.replace('<testsuites>', '<testsuites skipped="1">'),
  value => value.replace('failures="0"', 'failures="0" errors="1"'),
  value => value.replace('failures="0"', 'failures="0" skipped="1"'),
  value => value.replace('status="SUCCESS"', 'status="FAILED"'),
  value => value.replace(' status="SUCCESS"', ''),
  value => value.replace('name="L01 native public entry"', 'name="L02 native public entry"'),
  value => value.replace('id="L01 native public entry"', 'id="L02 native public entry"'),
  value => value.replace('tmp/L01.yaml', 'tmp/another.yaml'),
  value => value.replace('status="SUCCESS"/>', 'status="SUCCESS"><failure/></testcase>'),
  value => value.replace('status="SUCCESS"/>', 'status="SUCCESS"><error/></testcase>'),
  value => value.replace('status="SUCCESS"/>', 'status="SUCCESS"><skipped/></testcase>'),
  value => value.replace('</testsuite>', '<unexpected/></testsuite>'),
  value => value.replace('</testsuites>', '<testsuite tests="0" failures="0"/></testsuites>'),
  value => value.replace('</testsuite>', '<testcase status="SUCCESS"/></testsuite>'),
  value => value.replace('</testsuite>', '<properties><property name="x" value="y"><failure/></property></properties></testsuite>'),
  value => value.replace('<testsuites>', '<!DOCTYPE testsuites><testsuites>'),
  value => value.replace('name="Test Suite"', 'name="Test &amp; Suite"'),
])('JUnit truncado, contradictorio o no exitoso conserva el fallo %#', mutate => {
  expect(() => verifyLinkReport(mutate(linkXml()), LINK_CASES[0])).toThrow('RELEASE_LINK_UI_NOT_PASSED');
});
test('una salida no exitosa de Maestro impide aceptar incluso un XML aparentemente correcto', async () => {
  const read = jest.fn(() => linkXml()), run = jest.fn(async () => { throw Error('controlled nonzero Maestro exit'); });
  const adb = async args => args.includes('start') ? 'Status: ok\nActivity: ' + profiles.SOURCE.appId + '/.MainActivity\n' : '';
  await expect(validateIncomingLinks({ run, adb, serial: 'emulator-5554', env: {}, files: { scratch: os.tmpdir() }, api: 34,
    mkdir: jest.fn(), write: jest.fn(), read })).rejects.toThrow('controlled nonzero Maestro exit');
  expect(read).not.toHaveBeenCalled(); expect(run).toHaveBeenCalledTimes(1);
});
test('una URI fallida se conserva como fallo de fase y no evita cleanup', async () => {
  const f = runtimeFixture(); f.config.afterPublic = async () => { throw Error('private URI failure'); };
  await expect(profiles.runtime(f.env, 'release34', f.config)).rejects.toThrow('PROFILE_PUBLIC_PHASES_FAILED');
  expect(f.state.production).toMatchObject({ status: 'failed', cleanup: 'passed' });
  expect(f.state.runtimeApi34Status).toBe('failed');
});
function workflows() { return new Map(['ci.yml', 'api-android.yml', 'security.yml', 'performance.yml', 'android-validation.yml']
  .map(file => [file, YAML.parse(fs.readFileSync(path.join(process.cwd(), '.github/workflows', file), 'utf8'))])); }
test('el YAML Release conserva perfiles históricos separados y compuertas propias', () => {
  expect(() => validateWorkflows(workflows())).not.toThrow();
});
test.each([
  value => { value.jobs.release.needs = ['quality']; },
  value => { value.jobs.release.if = "${{ startsWith(github.ref, 'refs/tags/validation/profiles-') }}"; },
  value => { value.jobs.release.steps = value.jobs.release.steps.filter(step => step.id !== 'finish'); },
  value => { value.jobs.release.steps.find(step => step.id === 'release34')['continue-on-error'] = true; },
  value => { value.jobs.release.steps.find(step => step.id === 'release34').with.script = 'node scripts/android-profiles.js release34'; },
  value => { delete value.jobs.release.steps.find(step => step.id === 'pages16k').with['ram-size']; },
  value => { value.jobs.release.steps.find(step => step.id === 'pages16k').with['ram-size'] = '2048M'; },
  value => { value.jobs.release.steps.find(step => step.id === 'pages16k').with['emulator-options'] += ' -memory 1024'; },
  value => { value.jobs.release.steps.find(step => step.id === 'pages16k').with['force-avd-creation'] = false; },
  value => { value.jobs.release.env.EXPO_TOKEN = 'global'; },
  value => { value.jobs.release.steps.find(step => step.id === 'source').env.GITHUB_SHA = 'fake'; },
  value => { value.jobs.release.steps.push({ run: 'npx eas-cli@latest build --platform android' }); },
  value => { value.jobs.release.steps.find(step => step.uses?.startsWith('actions/upload-artifact@')).with.path += 'test-results/release-production/\n'; },
  value => { value.jobs.release_result.needs = ['release']; },
  value => { value.jobs.release_result.steps.find(step => step.run === 'node scripts/android-release.js gate').env.RESULT_SECURITY = 'success'; },
  value => { value.on.push.tags.push('anything-*'); },
])('rechaza una desviación de guardias, entorno, evidencia o agregado Release %#', mutate => {
  const input = workflows(); mutate(input.get('android-validation.yml')); expect(() => validateWorkflows(input)).toThrow();
});
test('la etiqueta Release mantiene el control criptográfico opt-in real, sin omitirlo', () => {
  for (const field of ['setup', 'test']) {
    const input = workflows(), job = input.get('ci.yml').jobs.validate;
    if (field === 'setup') {
      const step = job.steps.find(step => step.run === 'bash scripts/android-pinning-install.sh');
      step.if = step.if.replace(" || startsWith(github.ref, 'refs/tags/validation/release-')", '');
    } else {
      const step = job.steps.find(step => step.id === 'tests');
      step.env.PINNING_TEST_MITMDUMP = step.env.PINNING_TEST_MITMDUMP.replace(" || startsWith(github.ref, 'refs/tags/validation/release-')", '');
    }
    expect(() => validateWorkflows(input)).toThrow();
  }
});

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const profiles = require('./android-profiles');
const { EAS_CLI_VERSION } = require('./eas-candidate');
const { androidTools } = require('./inspect-android-artifact');
const { prepareKvm } = require('./android-16k');
const { xmlTree } = require('./android-pinning');
const { checkScope, AVD } = require('./prepare-android-disk.cjs');

const RECEIPT_FILE = 'config/android-release-validation.json';
const PROOF_FILE = 'test-results/android-release-source.json';
const REPORT_FILE = 'test-results/android-release.json';
const MODE = 'production-release-only';
const FINAL_SOURCE = '8831dfad7fd1b0c696d11f50c79442c5499b7cd2';
const PRODUCTION_BUILD_ID = '43bcc31d-8297-48e4-b91e-7f37c63d349c';
const PREBUILD_RUN_ID = 41860689069;
const PREBUILD_SCOPE = 'rc6-preview-quality-sast-http-apk-api34-tls-api30';
const PREBUILD_ATTEMPT = 2;
const PREBUILD_ANDROID_SCOPE = 'passed-rc6-preview-api34-and-controlled-tls-api30';
const TAG = /^refs\/tags\/validation\/release-[A-Za-z0-9_.-]+$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const RELEASE_AVD = 'profiles-release34';
const SDK = '/usr/local/lib/android/sdk';
const LINK_CASES = Object.freeze([
  Object.freeze({ id: 'L01', uri: 'sportcentermobile://catalog?q=bal%C3%B3n%2Bcampo', text: '^balón\\+campo$', label: 'unicode-plus-catalog-query' }),
  Object.freeze({ id: 'L02', uri: 'sportcentermobile://catalog?q=%E0%A4%A', label: 'malformed-uri-catalog-fallback' }),
]);
const AUTOMATION_FILES = Object.freeze([RECEIPT_FILE, 'scripts/android-release.js', '__tests__/androidRelease.test.js',
  'tests/manual/android-release.md', 'scripts/android-profiles.js', '__tests__/androidProfiles.test.js',
  '.github/workflows/android-validation.yml', '.github/workflows/ci.yml', 'scripts/validate-test-configs.js',
  'scripts/prepare-android-disk.cjs', '__tests__/androidDisk.test.js',
  '__tests__/pipelines.test.js', '__tests__/candidatePolicy.test.js', '__tests__/android16k.test.js',
  'docs/seguridad-candidata.md', 'tests/plan.json', 'README.md']);
class ReleaseError extends Error { constructor(code) { super(code); this.code = code; } }
function need(value, code) { if (!value) throw new ReleaseError(code); }
function keys(value, expected) { return value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('\n') === [...expected].sort().join('\n'); }
function fingerprint(receipt) {
  const stable = value => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(stable(receipt))).digest('hex');
}
function verifyReceipt(value) {
  need(keys(value, ['version', 'mode', 'repository', 'sourceCommit', 'prebuildRunId', 'projectId', 'appId', 'api',
    'appVersion', 'appBuildVersion', 'production']), 'RELEASE_RECEIPT_SCHEMA');
  need(value.version === 1 && value.mode === MODE && value.repository === profiles.SOURCE.repository &&
    value.sourceCommit === FINAL_SOURCE && value.prebuildRunId === PREBUILD_RUN_ID,
  'RELEASE_RECEIPT_SOURCE');
  need(value.projectId === profiles.SOURCE.projectId && value.appId === profiles.SOURCE.appId &&
    value.api === profiles.SOURCE.api && typeof value.appVersion === 'string' && /^\d+\.\d+\.\d+$/.test(value.appVersion) &&
    typeof value.appBuildVersion === 'string' && /^[1-9][0-9]*$/.test(value.appBuildVersion), 'RELEASE_RECEIPT_APP');
  const build = value.production;
  need(keys(build, ['buildId', 'sha256', 'bytes', 'message']) && typeof build.buildId === 'string' && UUID.test(build.buildId) && build.buildId === PRODUCTION_BUILD_ID &&
    typeof build.sha256 === 'string' && HEX.test(build.sha256) &&
    Number.isSafeInteger(build.bytes) && build.bytes > 0 && build.bytes <= 512 * 1024 * 1024 &&
    build.message === 'sport-center-production-v1:' + value.sourceCommit, 'RELEASE_RECEIPT_BUILD');
  return JSON.parse(JSON.stringify(value));
}
function readReceipt(read = fs.readFileSync) {
  let raw;
  try { raw = read(RECEIPT_FILE, 'utf8'); } catch { throw new ReleaseError('RELEASE_RECEIPT_MISSING'); }
  need(typeof raw === 'string' && Buffer.byteLength(raw) <= 8192, 'RELEASE_RECEIPT_SIZE');
  try { return verifyReceipt(JSON.parse(raw)); } catch (error) { throw error instanceof ReleaseError ? error : new ReleaseError('RELEASE_RECEIPT_INVALID'); }
}
function verifyAutomation(receipt, { sha, ref, repository, head, changed, dirty = '' }) {
  verifyReceipt(receipt);
  need(/^[a-f0-9]{40}$/.test(sha || '') && sha !== receipt.sourceCommit && head.trim() === sha, 'RELEASE_AUTOMATION_SHA');
  need(TAG.test(ref || '') && repository === receipt.repository, 'RELEASE_TAG_SCOPE');
  const files = changed.trim() ? changed.trim().split(/\r?\n/) : [];
  need(files.length > 0 && files.every(file => AUTOMATION_FILES.includes(file)), 'RELEASE_APPLICATION_TREE_CHANGED');
  need(!dirty.trim(), 'RELEASE_CHECKOUT_DIRTY');
  return { version: 1, validationMode: MODE, artifactSourceCommit: receipt.sourceCommit, automationCommit: sha,
    prebuildRunId: receipt.prebuildRunId, productionBuildId: receipt.production.buildId,
    productionSha256: receipt.production.sha256, receiptSha256: fingerprint(receipt), changedAutomationFiles: files.length };
}
function verifyPrebuild(receipt, run, jobs) {
  verifyReceipt(receipt);
  need(run?.id === PREBUILD_RUN_ID && run.id === receipt.prebuildRunId && run.head_sha === FINAL_SOURCE &&
    run.head_sha === receipt.sourceCommit && run.run_attempt === PREBUILD_ATTEMPT && run.event === 'push' &&
    run.head_branch === 'candidate/android-rc6' && run.path === '.github/workflows/api-android.yml' &&
    run.status === 'completed' && run.conclusion === 'success' && run.repository?.full_name === receipt.repository,
  'RELEASE_PREBUILD_NOT_APPROVED');
  need(Array.isArray(jobs?.jobs) && Number.isSafeInteger(jobs.total_count) && jobs.total_count === jobs.jobs.length,
    'RELEASE_PREBUILD_JOBS_INCOMPLETE');
  for (const name of ['Definir comprobaciones por evento y rama',
    'Calidad previa a integración / Análisis estático y pruebas del cliente',
    'Seguridad previa a integración y APK / Dependencias y SAST CodeQL', 'Integración HTTP real y regresión de contratos',
    'Comprobar configuración de rendimiento y estrés / Inspeccionar guiones sin ejecutar carga',
    'Compilar y aceptar APK candidato', 'Rechazo nativo bajo MITM y recuperación del mismo APK', 'Resultado de integración']) {
    const found = jobs.jobs.filter(job => job.name === name);
    need(found.length === 1 && found[0].run_id === PREBUILD_RUN_ID && found[0].run_attempt === PREBUILD_ATTEMPT &&
      found[0].head_sha === FINAL_SOURCE && found[0].status === 'completed' && found[0].conclusion === 'success', 'RELEASE_PREBUILD_CHECK_NOT_SUCCESSFUL');
  }
  // This is evidence of the exact Preview producer, not acceptance of the new AAB.
  return { prebuildChecksVerified: true, prebuildScope: PREBUILD_SCOPE, prebuildAndroid: PREBUILD_ANDROID_SCOPE,
    prebuildAttempt: PREBUILD_ATTEMPT };
}
function verifyBuild(receipt, build, now = Date.now()) {
  verifyReceipt(receipt);
  need(build?.id === receipt.production.buildId && build.platform === 'ANDROID' && build.status === 'FINISHED' &&
    build.gitCommitHash === receipt.sourceCommit && build.buildProfile === 'production' && build.app?.id === receipt.projectId &&
    build.appIdentifier === receipt.appId && build.message === receipt.production.message &&
    build.appVersion === receipt.appVersion && build.appBuildVersion === receipt.appBuildVersion, 'RELEASE_EAS_METADATA_MISMATCH');
  if (build.expirationDate != null) need(Number.isFinite(Date.parse(build.expirationDate)) && Date.parse(build.expirationDate) > now, 'RELEASE_EAS_BUILD_EXPIRED');
  let url;
  try { url = new URL(build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl); } catch { throw new ReleaseError('RELEASE_AAB_URL_INVALID'); }
  need(url.protocol === 'https:' && !url.username && !url.password && url.pathname.endsWith('.aab'), 'RELEASE_AAB_URL_INVALID');
  return { buildId: build.id, commit: receipt.sourceCommit, url: url.toString() };
}
async function command(file, args, options = {}) {
  try { return (await promisify(execFile)(file, args, { encoding: 'utf8', timeout: 45000, maxBuffer: 16 * 1024 * 1024,
    windowsHide: true, ...options })).stdout; } catch { throw new ReleaseError('RELEASE_TOOL_FAILED'); }
}
async function fileHash(file) {
  const digest = createHash('sha256'); for await (const chunk of fs.createReadStream(file)) digest.update(chunk); return digest.digest('hex');
}
function locations(env) {
  need(typeof env.RUNNER_TEMP === 'string' && path.isAbsolute(env.RUNNER_TEMP), 'RELEASE_TEMP_REQUIRED');
  const scratch = path.join(env.RUNNER_TEMP, 'sport-center-profiles');
  return { scratch, production: path.join(scratch, 'production.aab'), derived: path.join(scratch, 'production-derived.apk'),
    bundletool: path.join(scratch, 'bundletool.jar'), metadata: path.join(scratch, 'production-eas-private.json') };
}
const save = update => profiles.report(update, REPORT_FILE);
function incomingFlow(item) {
  need(LINK_CASES.includes(item), 'RELEASE_LINK_CASE_NOT_ALLOWED');
  return ['appId: ' + profiles.SOURCE.appId, 'name: ' + item.id + ' native public entry', '---',
    '- extendedWaitUntil:', '    visible: "Buscar en el catálogo"', '    timeout: 45000',
    '- waitForAnimationToEnd:', '    timeout: 5000',
    ...(item.id === 'L01' ? ['- assertVisible:', '    text: ' + JSON.stringify(item.text), '- assertVisible: "Borrar búsqueda"']
      : ['- assertNotVisible: "Borrar búsqueda"']), '- takeScreenshot: ' + item.id.toLowerCase() + '-catalog', ''].join('\n');
}
function verifyLinkLaunch(raw) {
  need(typeof raw === 'string' && raw.length <= 32768, 'RELEASE_LINK_LAUNCH_NOT_VERIFIED');
  const status = [...raw.matchAll(/^Status:\s*(\S+)\s*$/gm)], activities = [...raw.matchAll(/^Activity:\s*(\S+)\s*$/gm)];
  need(status.length === 1 && status[0][1] === 'ok' && activities.length === 1 &&
    [profiles.SOURCE.appId + '/.MainActivity', profiles.SOURCE.appId + '/' + profiles.SOURCE.appId + '.MainActivity'].includes(activities[0][1]),
  'RELEASE_LINK_LAUNCH_NOT_VERIFIED');
}
function verifyLinkReport(xml, item) {
  need(LINK_CASES.includes(item), 'RELEASE_LINK_CASE_NOT_ALLOWED');
  need(typeof xml === 'string' && xml.length <= 256 * 1024, 'RELEASE_LINK_UI_NOT_PASSED');
  let root;
  try { root = xmlTree(xml); } catch { throw new ReleaseError('RELEASE_LINK_UI_NOT_PASSED'); }
  const pending = [root]; let nodes = 0;
  while (pending.length) {
    const node = pending.pop();
    need(++nodes <= 64 && !['failure', 'error', 'skipped'].includes(node.name) && !node.text.trim(), 'RELEASE_LINK_UI_NOT_PASSED');
    pending.push(...node.children);
  }
  const attributes = (node, allowed) => need(Object.keys(node.attrs).every(key => allowed.includes(key)), 'RELEASE_LINK_UI_NOT_PASSED');
  const counters = (node, required) => {
    for (const [name, expected] of [['tests', '1'], ['failures', '0'], ['errors', '0'], ['skipped', '0']]) {
      if (required.includes(name) || Object.hasOwn(node.attrs, name)) need(node.attrs[name] === expected, 'RELEASE_LINK_UI_NOT_PASSED');
    }
  };
  const metadata = ['name', 'time', 'timestamp'];
  need(root.name === 'testsuites' && root.children.length === 1 && root.children[0].name === 'testsuite', 'RELEASE_LINK_UI_NOT_PASSED');
  attributes(root, [...metadata, 'tests', 'failures', 'errors', 'skipped']); counters(root, []);
  const suite = root.children[0];
  attributes(suite, [...metadata, 'device', 'tests', 'failures', 'errors', 'skipped']); counters(suite, ['tests', 'failures']);
  const cases = suite.children.filter(node => node.name === 'testcase');
  need(cases.length === 1 && suite.children.every(node => ['testcase', 'properties'].includes(node.name)), 'RELEASE_LINK_UI_NOT_PASSED');
  const test = cases[0], name = item.id + ' native public entry';
  attributes(test, ['id', 'name', 'classname', 'file', 'time', 'timestamp', 'status']);
  need(test.attrs.id === name && test.attrs.name === name && test.attrs.classname === name && test.attrs.status === 'SUCCESS' &&
    (!Object.hasOwn(test.attrs, 'file') || test.attrs.file.split(/[\\/]/).at(-1) === item.id + '.yaml') &&
    test.children.every(node => node.name === 'properties'), 'RELEASE_LINK_UI_NOT_PASSED');
  for (const owner of [suite, test]) {
    const groups = owner.children.filter(node => node.name === 'properties');
    need(groups.length <= 1, 'RELEASE_LINK_UI_NOT_PASSED');
    for (const properties of groups) {
      attributes(properties, []); const names = new Set();
      for (const property of properties.children) {
        need(property.name === 'property' && property.children.length === 0 && keys(property.attrs, ['name', 'value']) &&
          property.attrs.name.length > 0 && !names.has(property.attrs.name), 'RELEASE_LINK_UI_NOT_PASSED');
        names.add(property.attrs.name);
      }
    }
  }
}
async function validateIncomingLinks({ run, adb, serial, env, files, api, mkdir = fs.mkdirSync, write = fs.writeFileSync, read = fs.readFileSync }) {
  need([34, 36].includes(api) && /^emulator-[0-9]+$/.test(serial), 'RELEASE_LINK_DEVICE_SCOPE');
  const folder = path.join(files.scratch, 'incoming-' + api); mkdir(folder);
  const cases = [];
  for (const item of LINK_CASES) {
    const file = path.join(folder, item.id + '.yaml'), output = 'test-results/release-incoming' + api + '-' + item.id;
    write(file, incomingFlow(item), { flag: 'wx', mode: 0o600 });
    await adb(['shell', 'am', 'force-stop', profiles.SOURCE.appId]);
    // Both URIs are fixed public values; single quotes survive the adb shell parser.
    verifyLinkLaunch(await adb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', "'" + item.uri + "'", '-p', profiles.SOURCE.appId]));
    await run('maestro', ['--device', serial, 'test', '--format', 'junit', '--output', output + '.xml', '--test-output-dir', output, file],
      { timeout: 120000, env });
    verifyLinkReport(read(output + '.xml', 'utf8'), item);
    need(/^[1-9][0-9]*$/.test((await adb(['shell', 'pidof', profiles.SOURCE.appId])).trim()), 'RELEASE_LINK_PROCESS_NOT_RUNNING');
    cases.push({ id: item.id, status: 'passed', label: item.label, nativeLaunchConfirmed: true });
  }
  return { method: 'adb-view-cold-public-uri', scope: 'native-entry-routing-not-decoder-recovery', cases };
}
async function sourceContext(env, receipt, run = command, read = fs.readFileSync) {
  const context = verifyAutomation(receipt, { sha: env.GITHUB_SHA, ref: env.GITHUB_REF, repository: env.GITHUB_REPOSITORY,
    head: await run('git', ['rev-parse', 'HEAD']), changed: await run('git', ['diff', '--name-only', '--no-renames', receipt.sourceCommit, 'HEAD']),
    dirty: await run('git', ['status', '--porcelain', '--untracked-files=all']) });
  await run('git', ['merge-base', '--is-ancestor', receipt.sourceCommit, 'HEAD']);
  let proof;
  try { proof = JSON.parse(read(PROOF_FILE, 'utf8')); } catch { throw new ReleaseError('RELEASE_SOURCE_PROOF_MISSING'); }
  need(proof.prebuildChecksVerified === true && proof.prebuildScope === PREBUILD_SCOPE &&
    proof.prebuildAndroid === PREBUILD_ANDROID_SCOPE && proof.prebuildAttempt === PREBUILD_ATTEMPT && Object.entries(context).every(([key, value]) => proof[key] === value), 'RELEASE_SOURCE_PROOF_MISMATCH');
  return context;
}
async function inspect(receipt, env, context, run = command) {
  const files = locations(env), tools = androidTools(env);
  need(tools.buildVersion === '37.0.0' && tools.commandLineTools?.version === '23.0', 'RELEASE_ANDROID_TOOL_VERSIONS');
  need(await fileHash(files.production) === receipt.production.sha256, 'RELEASE_AAB_HASH_MISMATCH');
  await profiles.download(profiles.BUNDLETOOL.url, files.bundletool, profiles.BUNDLETOOL.sha256);
  need((await run('java', ['-jar', files.bundletool, 'version'])).trim() === profiles.BUNDLETOOL.version, 'RELEASE_BUNDLETOOL_VERSION');
  const bundle = args => run('java', ['-Duser.language=en', '-jar', files.bundletool, ...args], { timeout: 120000 });
  await bundle(['validate', '--bundle=' + files.production]);
  const manifest = profiles.application(await bundle(['dump', 'manifest', '--bundle=' + files.production]), false).evidence;
  const signed = await run('jarsigner', ['-J-Duser.language=en', '-verify', '-verbose', '-certs', files.production], { timeout: 90000 });
  need(/^jar verified\.\s*$/m.test(signed) && !/This jar contains unsigned entries/i.test(signed), 'RELEASE_AAB_SIGNATURE_NOT_VERIFIED');
  save({ productionBundle: { status: 'passed_bundle_scope', ...context, buildId: receipt.production.buildId, sha256: receipt.production.sha256,
    manifest, bundletool: { version: profiles.BUNDLETOOL.version, sha256: profiles.BUNDLETOOL.sha256 }, signatureScope: 'upload-archive-not-future-Play-App-Signing' } });
  const key = path.join(files.scratch, 'release-validation-only.p12'), password = path.join(files.scratch, 'release-validation-only.pass'),
    archive = path.join(files.scratch, 'production.apks');
  try {
    fs.writeFileSync(password, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
    await run('keytool', ['-genkeypair', '-keystore', key, '-storetype', 'PKCS12', '-alias', 'validation-only', '-storepass:file', password,
      '-keypass:file', password, '-dname', 'CN=Local validation only', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '1', '-noprompt']);
    await bundle(['build-apks', '--bundle=' + files.production, '--output=' + archive, '--mode=universal', '--aapt2=' + tools.aapt2,
      '--ks=' + key, '--ks-key-alias=validation-only', '--ks-pass=file:' + password, '--key-pass=file:' + password]);
    need((await run('unzip', ['-Z1', archive])).trim().split(/\r?\n/).filter(entry => entry === 'universal.apk').length === 1, 'RELEASE_UNIVERSAL_APK_AMBIGUOUS');
    await profiles.extractUniversal(archive, files.derived);
  } finally { for (const file of [key, password, archive]) fs.rmSync(file, { force: true }); }
  need(await fileHash(files.production) === receipt.production.sha256, 'RELEASE_AAB_CHANGED_DURING_DERIVATION');
  const release = await profiles.inspectApk(files.derived, false, tools, run);
  need(release.manifest.schemes.includes('sportcentermobile'), 'RELEASE_NATIVE_SCHEME_MISSING');
  save({ productionDerived: { ...release, buildId: receipt.production.buildId, aabSha256: receipt.production.sha256,
    apkSha256: await fileHash(files.derived), signingIdentity: 'temporary-validation-key-not-Play-identity' }, offlineStatus: 'passed' });
}
function verifyRuntimePhase(receipt, value, context, api) {
  need(value?.status === 'passed_public_scope' && value.cleanup === 'passed' && value.profile === 'production' &&
    value.api === api && value.abi === 'x86_64' && value.publicFlows === 2 && value.processAfter === true &&
    value.crashCheck?.fatalCrashDetected === false &&
    value.artifactSourceCommit === receipt.sourceCommit && value.automationCommit === context.automationCommit &&
    value.independentOfMetro === true && value.cleanReleaseStart?.metroAbsent === true &&
    value.cleanReleaseStart?.reverseAbsent === true && value.cleanReleaseStart?.packageAbsent === true, 'RELEASE_RUNTIME_NOT_PASSED');
  need(value.incomingLinks?.scope === 'native-entry-routing-not-decoder-recovery' && value.incomingLinks?.method === 'adb-view-cold-public-uri' &&
    Array.isArray(value.incomingLinks.cases) && value.incomingLinks.cases.length === 2 && value.incomingLinks.cases.every((item, index) =>
      item.id === LINK_CASES[index].id && item.status === 'passed' && item.nativeLaunchConfirmed === true), 'RELEASE_NATIVE_ENTRY_NOT_PASSED');
}
function verifyAvdCleanup(receipt, state, context) {
  const proof = state.avdCleanup34;
  need(proof?.status === 'passed' && proof.avdName === RELEASE_AVD && proof.api === 34 && proof.publicCases === 4 &&
    proof.artifactSourceCommit === receipt.sourceCommit && proof.automationCommit === context.automationCommit &&
    proof.noDevices === true && proof.noEmulatorProcesses === true && proof.directoryAbsent === true && proof.descriptorAbsent === true,
  'RELEASE_AVD34_CLEANUP_NOT_PASSED');
}
// The action stops its emulator but retains its userdata. Only remove our finished API34 AVD,
// through the pinned SDK manager, before the second fresh AVD consumes the same hosted disk.
async function cleanupAvd34(receipt, state, context, { env = process.env, platform = process.platform, io = fs, run = command,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) } = {}) {
  verifyReceipt(receipt); verifyRuntimePhase(receipt, state.production, context, 34);
  need(state.production.configuredAvdName === RELEASE_AVD && /^emulator-[0-9]+$/.test(state.production.selectedDevice || ''), 'RELEASE_AVD34_SCOPE');
  need(!state.avdCleanup34 && !state.production16k, 'RELEASE_AVD34_PHASE_ALREADY_RECORDED');
  try { checkScope(env, platform); } catch { throw new ReleaseError('RELEASE_AVD34_HOSTED_SCOPE'); }
  need(env.ANDROID_HOME === SDK && (!env.ANDROID_SDK_ROOT || env.ANDROID_SDK_ROOT === SDK) &&
    env.APKANALYZER === SDK + '/cmdline-tools/23.0/bin/apkanalyzer', 'RELEASE_AVD34_TOOL_SCOPE');
  const folder = AVD + '/' + RELEASE_AVD + '.avd', descriptor = AVD + '/' + RELEASE_AVD + '.ini';
  const adb = SDK + '/platform-tools/adb', manager = SDK + '/cmdline-tools/23.0/bin/avdmanager';
  const safePath = (file, directory) => {
    const parts = file.split('/').filter(Boolean); let current = '/';
    for (let index = 0; index <= parts.length; index++) {
      if (index) current += (current === '/' ? '' : '/') + parts[index - 1];
      const stat = io.lstatSync(current), last = index === parts.length;
      need(!stat.isSymbolicLink() && io.realpathSync(current) === current &&
        (last && !directory ? stat.isFile() : stat.isDirectory()), 'RELEASE_AVD34_UNSAFE_PATH');
    }
  };
  try { safePath(folder, true); safePath(descriptor, false); safePath(adb, false); safePath(manager, false); }
  catch (error) { throw error instanceof ReleaseError ? error : new ReleaseError('RELEASE_AVD34_UNSAFE_PATH'); }
  const ini = io.readFileSync(descriptor, 'utf8');
  need(typeof ini === 'string' && Buffer.byteLength(ini) <= 8192 && !ini.includes('\0'), 'RELEASE_AVD34_DESCRIPTOR_SCOPE');
  const fields = ini.trim().split(/\r?\n/).map(line => /^(avd\.ini\.encoding|path|path\.rel|target)=([^\r\n\\]+)$/.exec(line));
  need(fields.every(Boolean) && new Set(fields.map(field => field[1])).size === fields.length &&
    fields.some(field => field[1] === 'target' && field[2] === 'android-34'), 'RELEASE_AVD34_DESCRIPTOR_SCOPE');
  const paths = [...ini.matchAll(/^path=(.*)$/gm)], relative = [...ini.matchAll(/^path\.rel=(.*)$/gm)];
  need(paths.length === 1 && paths[0][1].trim() === folder && relative.length <= 1 &&
    (!relative.length || relative[0][1].trim() === 'avd/' + RELEASE_AVD + '.avd'), 'RELEASE_AVD34_DESCRIPTOR_SCOPE');
  let stopped = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const devices = await run(adb, ['devices']), processes = await run('/usr/bin/ps', ['-eo', 'args=']);
    need(typeof devices === 'string' && devices.length < 32768 && /^List of devices attached\r?\n/.test(devices) &&
      typeof processes === 'string' && processes.length < 1024 * 1024, 'RELEASE_AVD34_STOP_NOT_VERIFIED');
    const noDevices = devices.replace(/^List of devices attached\r?\n/, '').trim() === '';
    const noProcesses = !/^(?:\S*\/)?(?:emulator(?:64-\S+)?|qemu-system-\S+)(?:\s|$)/m.test(processes);
    if (noDevices && noProcesses) { stopped = true; break; }
    if (attempt < 9) await wait(1000);
  }
  need(stopped, 'RELEASE_AVD34_EMULATOR_STILL_ACTIVE');
  await run(manager, ['delete', 'avd', '--name', 'profiles-release34'], { timeout: 45000, env });
  const absent = file => { try { io.lstatSync(file); return false; } catch (error) { if (error.code === 'ENOENT') return true; throw error; } };
  need(absent(folder) && absent(descriptor), 'RELEASE_AVD34_DELETE_NOT_VERIFIED');
  return { status: 'passed', avdName: RELEASE_AVD, api: 34, publicCases: 4, artifactSourceCommit: receipt.sourceCommit,
    automationCommit: context.automationCommit, noDevices: true, noEmulatorProcesses: true, directoryAbsent: true, descriptorAbsent: true };
}
function validateResult(receipt, state, context) {
  verifyReceipt(receipt);
  need(state?.validationMode === MODE && state.offlineStatus === 'passed' && !state.development && !state.developmentInspection,
    'RELEASE_OFFLINE_OR_SCOPE_NOT_PASSED');
  need(state.productionBundle?.status === 'passed_bundle_scope' && state.productionDerived?.status === 'passed_offline_scope' &&
    state.productionBundle?.sha256 === receipt.production.sha256 && state.productionBundle?.buildId === receipt.production.buildId &&
    state.productionBundle?.artifactSourceCommit === receipt.sourceCommit && state.productionDerived?.aabSha256 === receipt.production.sha256 &&
    state.productionDerived?.buildId === receipt.production.buildId && HEX.test(state.productionDerived?.apkSha256 || ''), 'RELEASE_ARTIFACT_RESULT_MISMATCH');
  for (const [phase, api] of [['production', 34], ['production16k', 36]]) {
    verifyRuntimePhase(receipt, state[phase], context, api);
  }
  verifyAvdCleanup(receipt, state, context);
  need(state.production16k.backcompatDisabled === true && state.production16k.runtimeBefore?.pageSize === 16384 &&
    state.production16k.runtimeAfter?.pageSize === 16384, 'RELEASE_16K_NOT_VERIFIED');
  return { status: 'passed_production_release_scope', validationMode: MODE, debugCurrentSource: 'not-requested-not-accredited' };
}
async function main(mode, env = process.env) {
  if (mode === 'gate') { for (const key of ['RESULT_QUALITY', 'RESULT_SECURITY', 'RESULT_RELEASE']) need(env[key] === 'success', 'RELEASE_REQUIRED_JOB_NOT_SUCCESSFUL'); return; }
  if (mode === 'cleanup') {
    const files = locations(env); need(path.dirname(files.scratch) === path.resolve(env.RUNNER_TEMP) && path.basename(files.scratch) === 'sport-center-profiles', 'RELEASE_CLEANUP_SCOPE');
    fs.rmSync(files.scratch, { recursive: true, force: true }); return;
  }
  if (mode === 'summary') {
    let state = {}; try { state = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')); } catch { /* Sin informe no hay aprobación. */ }
    const text = ['# Validación del AAB de producción', '', 'Alcance: production-release-only. Debug anterior conserva exclusivamente su evidencia histórica.', '',
      '| Fase | Estado observado |', '| --- | --- |', ...[['AAB', 'productionBundle'], ['APK derivado', 'productionDerived'], ['Release API34', 'production'], ['Release API36 16KB', 'production16k']]
        .map(([label, key]) => '| ' + label + ' | ' + (['passed_bundle_scope', 'passed_offline_scope', 'passed_public_scope'].includes(state[key]?.status) ? 'aprobado en su alcance' : state[key]?.status === 'failed' ? 'falló' : 'sin acreditar') + ' |'), '',
      'La firma derivada es temporal. No acredita ARM64 físico, cuentas privadas, compra ni publicación Play.', ''].join('\n');
    fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/android-release-summary.md', text);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, text); return;
  }
  const receipt = readReceipt(), files = locations(env);
  if (mode === 'prepare') {
    const context = verifyAutomation(receipt, { sha: env.GITHUB_SHA, ref: env.GITHUB_REF, repository: env.GITHUB_REPOSITORY,
      head: await command('git', ['rev-parse', 'HEAD']), changed: await command('git', ['diff', '--name-only', '--no-renames', receipt.sourceCommit, 'HEAD']),
      dirty: await command('git', ['status', '--porcelain', '--untracked-files=all']) });
    await command('git', ['merge-base', '--is-ancestor', receipt.sourceCommit, 'HEAD']);
    need(typeof env.GITHUB_TOKEN === 'string' && env.GITHUB_TOKEN.length > 0, 'RELEASE_GITHUB_READ_TOKEN_REQUIRED');
    const request = async endpoint => {
      const response = await fetch('https://api.github.com/repos/' + receipt.repository + endpoint, { redirect: 'error',
        headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) });
      need(response.ok, 'RELEASE_PREBUILD_READ_FAILED'); return response.json();
    };
    const prebuild = verifyPrebuild(receipt, await request('/actions/runs/' + receipt.prebuildRunId),
      await request('/actions/runs/' + receipt.prebuildRunId + '/jobs?filter=latest&per_page=100'));
    fs.mkdirSync(files.scratch, { mode: 0o700 }); profiles.report({ ...context, ...prebuild }, PROOF_FILE); save({ ...context, ...prebuild }); return;
  }
  const context = await sourceContext(env, receipt);
  if (mode === 'view') {
    need(typeof env.EXPO_TOKEN === 'string' && env.EXPO_TOKEN.length > 0, 'RELEASE_EXPO_READ_TOKEN_REQUIRED');
    const raw = await command('npx', ['--yes', `eas-cli@${EAS_CLI_VERSION}`, 'build:view', receipt.production.buildId, '--json'], { env, timeout: 120000 });
    verifyBuild(receipt, JSON.parse(raw)); fs.writeFileSync(files.metadata, raw, { flag: 'wx', mode: 0o600 }); return;
  }
  if (mode === 'download') {
    let bytes;
    try { const build = verifyBuild(receipt, JSON.parse(fs.readFileSync(files.metadata, 'utf8')));
      bytes = await profiles.download(build.url, files.production, receipt.production.sha256);
      need(bytes === receipt.production.bytes, 'RELEASE_ARTIFACT_SIZE_MISMATCH');
    } finally { fs.rmSync(files.metadata, { force: true }); }
    save({ artifact: { buildId: receipt.production.buildId, commit: receipt.sourceCommit, profile: 'production', sha256: receipt.production.sha256, bytes } }); return;
  }
  if (mode === 'inspect') { try { return await inspect(receipt, env, context); }
    catch (error) { save({ offlineStatus: 'failed', offlineFailure: { reason: error instanceof ReleaseError ? error.code : 'RELEASE_INSPECTION_FAILED' } }); throw error; } }
  if (mode === 'kvm') return prepareKvm({ env, save: kvm => save({ kvm }) });
  if (mode === 'cleanup-avd34') {
    const state = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
    try { save({ avdCleanup34: await cleanupAvd34(receipt, state, context, { env }) }); }
    catch (error) { save({ avdCleanup34: { status: 'failed', reason: error instanceof ReleaseError ? error.code : 'RELEASE_AVD34_CLEANUP_FAILED' } }); throw error; }
    return;
  }
  if (mode === 'api36') verifyAvdCleanup(receipt, JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')), context);
  if (['release34', 'api36'].includes(mode)) return profiles.runtime(env, mode, { save,
    source: () => sourceContext(env, receipt), releaseContract: { sourceCommit: receipt.sourceCommit,
      buildId: receipt.production.buildId, sha256: receipt.production.sha256 }, afterPublic: validateIncomingLinks });
  if (mode === 'finish') { save(validateResult(receipt, JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')), context)); return; }
  throw new ReleaseError('RELEASE_MODE_UNKNOWN');
}
module.exports = { RECEIPT_FILE, PROOF_FILE, REPORT_FILE, MODE, FINAL_SOURCE, PRODUCTION_BUILD_ID, PREBUILD_RUN_ID, PREBUILD_SCOPE, PREBUILD_ATTEMPT, PREBUILD_ANDROID_SCOPE, LINK_CASES, AUTOMATION_FILES, ReleaseError, fingerprint,
  verifyReceipt, readReceipt, verifyAutomation, verifyPrebuild, verifyBuild, incomingFlow, verifyLinkLaunch, verifyLinkReport, validateIncomingLinks,
  sourceContext, inspect, verifyRuntimePhase, verifyAvdCleanup, cleanupAvd34, validateResult, main };
if (require.main === module) main(process.argv[2]).catch(error => { console.error('Validación Release bloqueada: ' +
  (error instanceof ReleaseError ? error.code : 'RELEASE_VALIDATION_FAILED')); process.exitCode = 1; });

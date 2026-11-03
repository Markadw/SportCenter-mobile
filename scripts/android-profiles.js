const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { setTimeout: pause } = require('node:timers/promises');
const { xmlTree } = require('./android-pinning');
const { androidTools, signatureEvidence, manifestEvidence, nativeEntries, zipAlignmentEvidence, loadAlignmentEvidence, relroEvidence } = require('./inspect-android-artifact');
const { prepareKvm, verifyImage, verifyRuntime, verifyCrashLog, verifyPid } = require('./android-16k');
const { assertAndroidReport } = require('./android-ci');
const { waitForService } = require('./wait-for-service');
const pinConfig = require('../config/security-pins.json');

const SOURCE = Object.freeze({ repository: 'Markadw/SportCenter-mobile',
  commit: '5dcacd46a24ae54da5300cd394a91c590a9a5825', runId: 41557906330,
  projectId: 'c608a591-dfad-47d6-98cf-e714e821c269', appId: 'com.markadw.sportcenter',
  api: 'https://back-sport-ghxk.onrender.com' });
const BUILDS = Object.freeze({
  development: Object.freeze({ id: '7ccfddc3-4fbd-4c52-aef7-c31587ba2244', extension: '.apk', sha256: 'ebfb8281ec12359178954255c94cf3e7d70e681d405c9c497fa3b9064d34d1d2' }),
  production: Object.freeze({ id: '31b3eefb-72db-4757-87aa-1e458dd73e52', extension: '.aab', sha256: 'acf7d113a2a093211f3f990ac5d2b26ef5ff5ba37bc7a6efb9fe230fa05fd91b' }),
});
const BUNDLETOOL = Object.freeze({ version: '1.18.3', url: 'https://github.com/google/bundletool/releases/download/1.18.3/bundletool-all-1.18.3.jar',
  sha256: 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29' });
const FILES = Object.freeze(['.github/workflows/ci.yml', '.github/workflows/android-validation.yml', 'scripts/android-profiles.js',
  '__tests__/androidProfiles.test.js', '__tests__/android16k.test.js', '__tests__/pipelines.test.js', '__tests__/candidatePolicy.test.js',
  'scripts/validate-test-configs.js', 'tests/manual/android-profiles.md', 'README.md',
  'scripts/android-pinning.js', '__tests__/androidPinning.test.js', 'tests/manual/android-pinning-pilot.md',
  'scripts/inspect-android-artifact.js', '__tests__/androidArtifactInspection.test.js']);
const tagPattern = /^refs\/tags\/validation\/profiles-[A-Za-z0-9_.-]+$/;
const HEX = /^[a-f0-9]{64}$/;
class ProfileError extends Error { constructor(code) { super(code); this.code = code; } }
function need(value, code) { if (!value) throw new ProfileError(code); }
async function command(file, args, options = {}) {
  try { return (await promisify(execFile)(file, args, { encoding: 'utf8', timeout: 45000,
    windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options })).stdout; }
  catch (cause) { const error = new ProfileError('TOOL_COMMAND_FAILED'); error.diagnostic = { tool: path.basename(file), exitCode: Number.isInteger(cause.code) ? cause.code : null, timedOut: cause.killed === true }; throw error; }
}
async function hash(file) { const digest = createHash('sha256'); for await (const chunk of fs.createReadStream(file)) digest.update(chunk); return digest.digest('hex'); }
function locations(env) {
  need(typeof env.RUNNER_TEMP === 'string' && path.isAbsolute(env.RUNNER_TEMP), 'RUNNER_TEMP_REQUIRED');
  const scratch = path.join(env.RUNNER_TEMP, 'sport-center-profiles');
  return { scratch, development: path.join(scratch, 'development.apk'), production: path.join(scratch, 'production.aab'),
    derived: path.join(scratch, 'production-derived.apk'), bundletool: path.join(scratch, 'bundletool.jar') };
}
function report(update, file = 'test-results/android-profiles.json') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  need(process.platform !== 'linux' || Number.isInteger(fs.constants.O_NOFOLLOW), 'REPORT_NOFOLLOW_REQUIRED');
  const descriptor = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0), 0o600);
  try {
    need(fs.fstatSync(descriptor).isFile(), 'REPORT_REGULAR_FILE_REQUIRED');
    const raw = fs.readFileSync(descriptor, 'utf8'); need(raw.length < 1024 * 1024, 'REPORT_TOO_LARGE');
    const previous = raw ? JSON.parse(raw) : {}, bytes = Buffer.from(JSON.stringify({ ...previous, ...update }, null, 2) + '\n');
    let offset = 0;
    while (offset < bytes.length) { const count = fs.writeSync(descriptor, bytes, offset, bytes.length - offset, offset);
      need(Number.isInteger(count) && count > 0 && count <= bytes.length - offset, 'REPORT_WRITE_FAILED'); offset += count; }
    fs.ftruncateSync(descriptor, bytes.length);
  } finally { fs.closeSync(descriptor); }
}
function verifySource({ sha, ref, repository, head, changed, dirty = '' }) {
  need(/^[a-f0-9]{40}$/.test(sha || '') && sha !== SOURCE.commit && head.trim() === sha, 'AUTOMATION_SHA_MISMATCH');
  need(tagPattern.test(ref || '') && repository === SOURCE.repository, 'PROFILE_TAG_SCOPE_REQUIRED');
  const files = changed.trim() ? changed.trim().split(/\r?\n/) : [];
  need(files.length > 0 && files.every(file => FILES.includes(file)), 'APPLICATION_TREE_CHANGED');
  need(!dirty.trim(), 'CHECKOUT_DIRTY');
  return { version: 1, artifactSourceCommit: SOURCE.commit, automationCommit: sha, changedAutomationFiles: files.length,
    producerRunId: SOURCE.runId, buildIds: Object.fromEntries(Object.entries(BUILDS).map(([name, build]) => [name, build.id])) };
}
function verifyProducer(run, jobs) {
  need(run?.id === SOURCE.runId && run.head_sha === SOURCE.commit && run.head_branch === 'develop'
    && run.event === 'push' && run.path === '.github/workflows/api-android.yml' && run.status === 'completed'
    && run.conclusion === 'success' && run.repository?.full_name === SOURCE.repository, 'PRODUCER_RUN_NOT_APPROVED');
  need(Array.isArray(jobs?.jobs) && jobs.total_count === jobs.jobs.length, 'PRODUCER_JOBS_INCOMPLETE');
  for (const name of ['Calidad previa a integración / Análisis estático y pruebas del cliente',
    'Seguridad previa a integración y APK / Dependencias y SAST CodeQL', 'Integración HTTP real y regresión de contratos', 'Resultado de integración']) {
    const match = jobs.jobs.filter(job => job.name === name);
    need(match.length === 1 && match[0].run_id === SOURCE.runId && match[0].status === 'completed'
      && match[0].conclusion === 'success', 'PRODUCER_CHECK_NOT_SUCCESSFUL');
  }
  return { producerChecksVerified: true };
}
function verifyBuild(build, profile, now = Date.now()) {
  const expected = BUILDS[profile]; need(expected, 'PROFILE_UNKNOWN');
  need(build?.id === expected.id && build.platform === 'ANDROID' && build.status === 'FINISHED'
    && build.gitCommitHash === SOURCE.commit && build.app?.id === SOURCE.projectId
    && build.appIdentifier === SOURCE.appId && build.buildProfile === profile
    && build.message === 'sport-center-' + profile + '-v1:' + SOURCE.commit
    && build.appVersion === '1.0.0' && build.appBuildVersion === '1', 'EAS_PROFILE_METADATA_MISMATCH');
  if (build.expirationDate != null) need(Number.isFinite(Date.parse(build.expirationDate)) && Date.parse(build.expirationDate) > now, 'EAS_BUILD_EXPIRED');
  let url; try { url = new URL(build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl); } catch { throw new ProfileError('EAS_ARTIFACT_URL_INVALID'); }
  need(url.protocol === 'https:' && !url.username && !url.password && url.pathname.endsWith(expected.extension), 'EAS_ARTIFACT_TYPE_MISMATCH');
  return { buildId: expected.id, profile, commit: SOURCE.commit, url: url.toString() };
}
async function download(url, file, expectedHash, fetchApi = fetch) {
  need(HEX.test(expectedHash || ''), 'ARTIFACT_HASH_NOT_FROZEN');
  let current = new URL(url), response;
  for (let redirects = 0; redirects < 6; redirects += 1) {
    need(current.protocol === 'https:' && !current.username && !current.password, 'ARTIFACT_HTTPS_REQUIRED');
    response = await fetchApi(current, { redirect: 'manual', signal: AbortSignal.timeout(120000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); need(typeof location === 'string' && location.length > 0 && location.length <= 16384, 'ARTIFACT_REDIRECT_INVALID'); await response.body?.cancel(); current = new URL(location, current); continue; }
    break;
  }
  need(response?.ok && response.body && response.status === 200, 'ARTIFACT_DOWNLOAD_FAILED');
  let bytes = 0;
  const limiter = new Transform({ transform(chunk, _encoding, done) { bytes += chunk.length;
    done(bytes <= 512 * 1024 * 1024 ? null : new ProfileError('ARTIFACT_DOWNLOAD_TOO_LARGE'), chunk); } });
  try {
    await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(file, { flags: 'wx', mode: 0o600 }));
    need(await hash(file) === expectedHash, 'ARTIFACT_HASH_MISMATCH');
  } catch (error) { fs.rmSync(file, { force: true }); throw error instanceof ProfileError ? error : new ProfileError('ARTIFACT_DOWNLOAD_FAILED'); }
  return bytes;
}
async function sourceContext(env, run = command) {
  const proof = JSON.parse(fs.readFileSync('test-results/android-profiles-source.json', 'utf8'));
  const context = verifySource({ sha: env.GITHUB_SHA, ref: env.GITHUB_REF, repository: env.GITHUB_REPOSITORY,
    head: await run('git', ['rev-parse', 'HEAD']), changed: await run('git', ['diff', '--name-only', '--no-renames', SOURCE.commit, 'HEAD']),
    dirty: await run('git', ['status', '--porcelain', '--untracked-files=all']) });
  await run('git', ['merge-base', '--is-ancestor', SOURCE.commit, 'HEAD']);
  need(proof.artifactSourceCommit === context.artifactSourceCommit && proof.automationCommit === context.automationCommit
    && proof.producerRunId === SOURCE.runId && proof.producerChecksVerified === true, 'SOURCE_PROOF_MISMATCH');
  return context;
}
function application(manifest, development) {
  const root = xmlTree(manifest), apps = root.children.filter(node => node.name === 'application');
  need(root.name === 'manifest' && root.attrs.package === SOURCE.appId && apps.length === 1, 'MANIFEST_PACKAGE_OR_APPLICATION');
  const app = apps[0], sdk = root.children.filter(node => node.name === 'uses-sdk');
  need((app.attrs['android:debuggable'] || 'false') === (development ? 'true' : 'false'), 'DEBUGGABLE_PROFILE_MISMATCH');
  const cleartext = app.attrs['android:usesCleartextTraffic'];
  need(sdk.length === 1 && sdk[0].attrs['android:targetSdkVersion'] === '36'
    && /^\d+$/.test(sdk[0].attrs['android:minSdkVersion'] || '') && Number(sdk[0].attrs['android:minSdkVersion']) >= 24, 'MANIFEST_SDK');
  // With an explicit NSC, Android API24+ ignores usesCleartextTraffic. Debug merges true; policy is checked below from compiled XML.
  need((development ? ['true', 'false'].includes(cleartext) : cleartext === 'false')
    && typeof app.attrs['android:networkSecurityConfig'] === 'string', 'MANIFEST_TLS_POLICY_REQUIRED');
  const permissions = root.children.filter(node => node.name === 'uses-permission').map(node => node.attrs['android:name']);
  const forbidden = /^android\.permission\.(?:SYSTEM_ALERT_WINDOW|CHANGE_WIFI_MULTICAST_STATE|VIBRATE|CAMERA|RECORD_AUDIO|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|READ_MEDIA_[A-Z_]+)$/;
  need(permissions.every(value => typeof value === 'string' && /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+$/.test(value) && (!forbidden.test(value) || (development && ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.CHANGE_WIFI_MULTICAST_STATE'].includes(value)))), 'UNUSED_PERMISSION');
  if (!development) manifestEvidence({ applicationId: SOURCE.appId, targetSdk: '36', debuggable: 'false', permissions: permissions.join('\n') });
  const schemes = [];
  const visit = node => { if (node.name === 'data' && node.attrs['android:scheme']) schemes.push(node.attrs['android:scheme']); node.children.forEach(visit); };
  visit(app);
  return { app, evidence: { applicationId: SOURCE.appId, debuggable: development, targetSdk: 36,
    minSdk: Number(sdk[0].attrs['android:minSdkVersion']), manifestCleartext: cleartext, effectiveCleartextAuthority: 'NSC-API24+', permissions: [...new Set(permissions)].sort(), developmentOnlyPermissions: development ? permissions.filter(value => ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.CHANGE_WIFI_MULTICAST_STATE'].includes(value)) : [], schemes: [...new Set(schemes)].sort() } };
}
function resolvePolicy(manifest, table, development) {
  const reference = application(manifest, development).app.attrs['android:networkSecurityConfig'];
  const numeric = /^@(?:ref\/)?(0x[0-9a-f]{8})$/i.exec(reference || '');
  need(numeric || reference === '@xml/network_security_config' || reference === '@' + SOURCE.appId + ':xml/network_security_config', 'NSC_REFERENCE');
  const records = []; let pkg, current;
  for (const line of table.split(/\r?\n/)) {
    const header = /^Package name=([A-Za-z][A-Za-z0-9_.]*) id=([0-9a-f]{2})\s*$/i.exec(line);
    if (header) { pkg = { name: header[1], id: header[2].toLowerCase() }; current = null; continue; }
    const row = /^\s+resource (0x[0-9a-f]{8}) ([A-Za-z0-9_]+)\/([A-Za-z0-9_]+)\s*$/i.exec(line);
    if (row) { current = { pkg, id: row[1].toLowerCase(), type: row[2], name: row[3], values: [] }; records.push(current); continue; }
    if (/^\s*(?:resource|type)\s/.test(line)) current = null;
    else if (current && line.trim()) current.values.push(line.trim());
  }
  const matches = records.filter(value => value.pkg?.name === SOURCE.appId && value.type === 'xml' && value.name === 'network_security_config');
  need(matches.length === 1, 'NSC_RESOURCE_COUNT'); const resource = matches[0];
  need(resource.id.slice(2, 4) === resource.pkg.id && (!numeric || numeric[1].toLowerCase() === resource.id)
    && records.filter(value => value.id === resource.id).length === 1 && resource.values.length === 1, 'NSC_RESOURCE_ID_OR_VALUES');
  const value = /^\(\) \(file\) (res\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.xml) type=XML$/.exec(resource.values[0]);
  need(value && value[1].length <= 240, 'NSC_RESOURCE_FILE');
  return { id: resource.id, path: value[1], reference };
}
function policyEvidence(xml, development) {
  const root = xmlTree(xml); need(root.name === 'network-security-config' && !Object.keys(root.attrs).length && !root.text.trim(), 'NSC_ROOT');
  const base = root.children.filter(node => node.name === 'base-config'), configs = root.children.filter(node => node.name === 'domain-config');
  need(base.length === 1 && configs.length === (development ? 2 : 1) && root.children.length === (development ? 3 : 2), 'NSC_SHAPE');
  const system = node => { const anchors = node.children.filter(value => value.name === 'trust-anchors');
    need(anchors.length === 1 && anchors[0].children.length === 1 && !Object.keys(anchors[0].attrs).length, 'NSC_TRUST_SHAPE');
    const cert = anchors[0].children[0]; need(cert.name === 'certificates' && cert.attrs.src === 'system'
      && Object.keys(cert.attrs).length === 1 && !cert.children.length && !cert.text.trim(), 'NSC_SYSTEM_ONLY'); };
  need(base[0].attrs.cleartextTrafficPermitted === 'false' && Object.keys(base[0].attrs).length === 1 && base[0].children.length === 1, 'NSC_BASE'); system(base[0]);
  const api = configs.filter(node => node.children.some(value => value.name === 'domain' && value.text.trim() === pinConfig.domain));
  need(api.length === 1 && api[0].attrs.cleartextTrafficPermitted === 'false' && Object.keys(api[0].attrs).length === 1 && api[0].children.length === 3, 'NSC_API');
  system(api[0]); const domains = api[0].children.filter(node => node.name === 'domain'), sets = api[0].children.filter(node => node.name === 'pin-set');
  need(domains.length === 1 && domains[0].attrs.includeSubdomains === 'false' && Object.keys(domains[0].attrs).length === 1, 'NSC_API_DOMAIN');
  need(sets.length === 1 && !Object.keys(sets[0].attrs).length && sets[0].children.length === 2, 'NSC_PINSET');
  const pins = sets[0].children.map(node => { need(node.name === 'pin' && node.attrs.digest === 'SHA-256' && Object.keys(node.attrs).length === 1 && !node.children.length, 'NSC_PIN'); return node.text.trim(); });
  need(new Set(pins).size === 2 && pinConfig.pins.every(pin => pins.includes(pin.sha256)), 'NSC_PIN_VALUES');
  const hosts = ['localhost', '127.0.0.1', '10.0.2.2', '10.0.3.2'];
  if (development) {
    const metro = configs.filter(node => node !== api[0])[0];
    need(metro.attrs.cleartextTrafficPermitted === 'true' && Object.keys(metro.attrs).length === 1 && metro.children.length === hosts.length, 'NSC_METRO_SHAPE');
    need(new Set(metro.children.map(node => node.text.trim())).size === hosts.length && metro.children.every(node => node.name === 'domain'
      && hosts.includes(node.text.trim()) && node.attrs.includeSubdomains === 'false' && Object.keys(node.attrs).length === 1 && !node.children.length), 'NSC_METRO_HOSTS');
  }
  return { apiPinCount: 2, systemTrustOnly: true, baseCleartext: false, metroCleartextHosts: development ? hosts : [], scope: 'compiled-policy-not-runtime-TLS-proof' };
}
async function inspectApk(file, development, tools, run = command) {
  const manifest = await run(tools.analyzer, ['manifest', 'print', file]);
  const evidence = application(manifest, development).evidence;
  const resource = resolvePolicy(manifest, await run(tools.aapt2, ['dump', 'resources', file]), development);
  const entries = nativeEntries((await run('unzip', ['-Z1', file])).trim());
  need(entries.entries.filter(name => name === resource.path).length === 1, 'NSC_COMPILED_ENTRY');
  const policy = policyEvidence(await run(tools.analyzer, ['resources', 'xml', '--file', '/' + resource.path, file]), development);
  const signature = signatureEvidence(await run(tools.signer, ['verify', '--verbose', '--print-certs', file]));
  need(signature.signers === 1, 'PROFILE_SINGLE_SIGNER_REQUIRED');
  const alignment = !development ? zipAlignmentEvidence(await run(tools.zipalign, ['-c', '-P', '16', '-v', '4', file])) : { scope: 'Debug API34 only; no 16KB claim' };
  let elf = { scope: 'Debug API34 only; no 16KB claim' };
  if (!development) {
    need(entries.libraries64.length > 0 && entries.libraries64.length <= 256, 'ELF64_LIBRARY_COUNT');
    const directory = fs.mkdtempSync(path.join(path.dirname(file), 'elf-profiles-')), binary = path.join(directory, 'current.so');
    let minimum = Infinity, relroSegments = 0, exceptions = 0;
    try {
      for (const entry of entries.libraries64) {
        const bytes = await run('unzip', ['-p', file, entry], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
        fs.writeFileSync(binary, bytes, { flag: 'wx', mode: 0o600 });
        const load = loadAlignmentEvidence(await run(tools.objdump, ['-p', binary]));
        const relro = relroEvidence(await run(tools.readelf, ['-Wl', binary]));
        minimum = Math.min(minimum, load.minimumAlignment); relroSegments += relro.relroSegments; exceptions += relro.dedicatedLoadExceptions;
        fs.unlinkSync(binary);
      }
      elf = { libraries64: entries.libraries64.length, minimumLoadAlignment: minimum, relroSegments, dedicatedLoadExceptions: exceptions,
        scope: 'all arm64-v8a and x86_64 LOAD/RELRO structure; runtime remains separate' };
    } finally { fs.rmSync(binary, { force: true }); fs.rmdirSync(directory); }
  }
  return { status: 'passed_offline_scope', manifest: evidence, networkPolicy: policy, signature,
    nativeAbis: entries.abis, zipAlignment: alignment, elf };
}
async function extractUniversal(archive, destination) {
  const child = spawn('unzip', ['-p', archive, 'universal.apk'], { stdio: ['ignore', 'pipe', 'ignore'] });
  let bytes = 0; const limiter = new Transform({ transform(chunk, _encoding, done) { bytes += chunk.length;
    done(bytes <= 512 * 1024 * 1024 ? null : new ProfileError('DERIVED_APK_TOO_LARGE'), chunk); } });
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  try {
    const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new ProfileError('DERIVED_APK_EXTRACTION_FAILED'))); });
    await Promise.all([pipeline(child.stdout, limiter, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 })), closed]);
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
}
async function inspectProfiles(env, run = command) {
  const context = await sourceContext(env, run), files = locations(env), tools = androidTools(env);
  need(tools.buildVersion === '37.0.0' && tools.commandLineTools?.version === '23.0', 'ANDROID_TOOL_VERSIONS');
  for (const profile of ['development', 'production']) need(HEX.test(BUILDS[profile].sha256) && await hash(files[profile]) === BUILDS[profile].sha256, 'FROZEN_ARTIFACT_HASH_MISMATCH');
  report({ offlineStage: 'development-inspection' });
  const debug = await inspectApk(files.development, true, tools, run); report({ developmentInspection: debug });
  await download(BUNDLETOOL.url, files.bundletool, BUNDLETOOL.sha256);
  need((await run('java', ['-jar', files.bundletool, 'version'])).trim() === BUNDLETOOL.version, 'BUNDLETOOL_VERSION');
  const bundle = args => run('java', ['-Duser.language=en', '-jar', files.bundletool, ...args], { timeout: 120000 });
  report({ offlineStage: 'bundle-validation' });
  await bundle(['validate', '--bundle=' + files.production]);
  const aabManifest = application(await bundle(['dump', 'manifest', '--bundle=' + files.production]), false).evidence;
  report({ offlineStage: 'bundle-signature' });
  const signed = await run('jarsigner', ['-J-Duser.language=en', '-verify', '-verbose', '-certs', files.production], { timeout: 90000 });
  need(/^jar verified\.\s*$/m.test(signed) && !/This jar contains unsigned entries/i.test(signed), 'AAB_SIGNATURE_NOT_VERIFIED');
  report({ productionBundle: { status: 'passed_bundle_scope', ...context, sha256: BUILDS.production.sha256,
    buildId: BUILDS.production.id, manifest: aabManifest, bundletool: { version: BUNDLETOOL.version, sha256: BUNDLETOOL.sha256 },
    signatureScope: 'signed-upload-archive-not-future-Play-App-Signing' } });
  const key = path.join(files.scratch, 'validation-only.jks'), password = path.join(files.scratch, 'validation-only.pass'), set = path.join(files.scratch, 'production.apks');
  try {
    fs.writeFileSync(password, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
    await run('keytool', ['-genkeypair', '-keystore', key, '-storetype', 'JKS', '-alias', 'validation-only', '-storepass:file', password,
      '-keypass:file', password, '-dname', 'CN=Local validation only', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '1', '-noprompt']);
    report({ offlineStage: 'bundle-derivation' });
    await bundle(['build-apks', '--bundle=' + files.production, '--output=' + set, '--mode=universal', '--aapt2=' + tools.aapt2,
      '--ks=' + key, '--ks-key-alias=validation-only', '--ks-pass=file:' + password, '--key-pass=file:' + password]);
    const entries = (await run('unzip', ['-Z1', set])).trim().split(/\r?\n/);
    need(entries.filter(entry => entry === 'universal.apk').length === 1, 'UNIVERSAL_APK_MISSING_OR_AMBIGUOUS');
    await extractUniversal(set, files.derived);
  } finally { for (const file of [password, key, set]) fs.rmSync(file, { force: true }); }
  need(await hash(files.production) === BUILDS.production.sha256, 'AAB_CHANGED_DURING_DERIVATION');
  report({ offlineStage: 'derived-release-inspection' });
  const release = await inspectApk(files.derived, false, tools, run), derivedHash = await hash(files.derived);
  report({ productionDerived: { ...release, buildId: BUILDS.production.id, aabSha256: BUILDS.production.sha256,
    apkSha256: derivedHash, signingIdentity: 'temporary-local-validation-key-not-Play-identity' }, offlineStatus: 'passed' });
}
function debugFlows(source, url) {
  const YAML = require('yaml');
  need(typeof url === 'string' && /^exp\+sport-center-mobile:\/\/expo-development-client\/\?url=/.test(url), 'DEVCLIENT_URL_INVALID');
  const documents = YAML.parseAllDocuments(source); need(documents.length === 2 && documents.every(document => !document.errors.length), 'MAESTRO_FLOW_INVALID');
  const header = documents[0].toJSON(), commands = documents[1].toJSON();
  need(header.appId === '${APP_ID}' && Array.isArray(commands) && commands[0]?.launchApp?.clearState === true, 'MAESTRO_CLEAR_STATE_REQUIRED');
  return YAML.stringify(header) + '---\n' + YAML.stringify([commands[0], { openLink: url }, ...commands.slice(1)]);
}
async function waitMetro(child, fetchApi = fetch, sleep = pause) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    need(child.exitCode === null && child.signalCode === null && !child.spawnFailure, 'METRO_EXITED');
    try { const response = await fetchApi('http://127.0.0.1:8081/status', { signal: AbortSignal.timeout(2000) });
      if (response.ok && (await response.text()).trim() === 'packager-status:running') return; } catch { /* Arranque acotado. */ }
    await sleep(1000);
  }
  throw new ProfileError('METRO_NOT_READY');
}
async function stopMetro(child, sleep = pause) {
  if (!child) return;
  need(Number.isSafeInteger(child.pid) && child.pid > 0, 'METRO_OWNED_PID_REQUIRED');
  if (child.exitCode === null && child.signalCode === null) { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
  for (let attempt = 0; attempt < 20 && child.exitCode === null && child.signalCode === null; attempt += 1) await sleep(250);
  if (child.exitCode === null && child.signalCode === null) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
  for (let attempt = 0; attempt < 20 && child.exitCode === null && child.signalCode === null; attempt += 1) await sleep(250);
  need(child.exitCode !== null || child.signalCode !== null, 'METRO_CLEANUP_FAILED');
}
async function metroAbsent(fetchApi = fetch) {
  try { await fetchApi('http://127.0.0.1:8081/status', { signal: AbortSignal.timeout(2000) }); }
  catch (error) { need(error?.cause?.code === 'ECONNREFUSED' || error?.code === 'ECONNREFUSED', 'METRO_ABSENCE_UNPROVEN'); return true; }
  throw new ProfileError('METRO_STILL_LISTENING');
}
async function runtime(env, api = 34, { run = command, save = report, wait = waitForService, sleep = pause, source = sourceContext,
  read = fs.readFileSync, fileHash = hash, platform = process.platform, idle = metroAbsent, start = spawn, ready = waitMetro, stop = stopMetro } = {}) {
  const context = await source(env, run), files = locations(env);
  need(platform === 'linux' && env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted'
    && env.PINNING_EPHEMERAL_AVD === 'true', 'EPHEMERAL_HOSTED_AVD_REQUIRED');
  const devices = (await run('adb', ['devices'])).trim().split(/\r?\n/).filter(line => /\tdevice$/.test(line));
  need(devices.length === 1 && /^emulator-\d+\tdevice$/.test(devices[0]), 'ONLY_ONE_EMULATOR_ALLOWED');
  const adb = args => run('adb', ['-s', devices[0].split('\t')[0], ...args]);
  need((await adb(['shell', 'getprop', 'ro.kernel.qemu'])).trim() === '1'
    && (await adb(['shell', 'getprop', 'ro.build.version.sdk'])).trim() === String(api)
    && (await adb(['shell', 'getprop', 'ro.product.cpu.abi'])).trim() === 'x86_64', 'EMULATOR_RUNTIME_MISMATCH');
  const state = JSON.parse(read('test-results/android-profiles.json', 'utf8'));
  need(state.offlineStatus === 'passed' && state.productionDerived?.aabSha256 === BUILDS.production.sha256
    && await fileHash(files.derived) === state.productionDerived.apkSha256, 'DERIVED_RECEIPT_MISMATCH');
  need(typeof env.PRODUCT_NAME === 'string' && env.PRODUCT_NAME.trim().length > 0
    && env.PRODUCT_NAME.length <= 160 && !/[\r\n\x00-\x1f]/.test(env.PRODUCT_NAME), 'PRODUCT_NAME_REQUIRED');
  need((await wait({ apiUrl: SOURCE.api, android: true })).ready === true, 'CATALOG_NOT_READY');
  const phases = api === 34 ? ['development', 'production'] : ['production16k'];
  for (const phase of phases) {
    const development = phase === 'development', entry = { ...context, api, abi: 'x86_64', status: 'running', profile: development ? 'development' : 'production' };
    let metro, metroFd, reverse = false, failure;
    try {
      await idle();
      if (api === 36) {
        const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
        entry.image = verifyImage(fs.readFileSync(path.join(sdk, 'system-images/android-36/google_apis_ps16k/x86_64/source.properties'), 'utf8'));
        entry.runtimeBefore = verifyRuntime({ pageSize: await adb(['shell', 'getconf', 'PAGE_SIZE']), abi: 'x86_64', api: '36' });
        await adb(['shell', 'setprop', 'bionic.linker.16kb.app_compat.enabled', 'false']);
        await adb(['shell', 'setprop', 'pm.16kb.app_compat.disabled', 'true']);
        need((await adb(['shell', 'getprop', 'bionic.linker.16kb.app_compat.enabled'])).trim() === 'false'
          && (await adb(['shell', 'getprop', 'pm.16kb.app_compat.disabled'])).trim() === 'true', 'BACKCOMPAT_NOT_DISABLED');
        entry.backcompatDisabled = true;
      }
      const apk = development ? files.development : files.derived;
      if (development) need(await fileHash(apk) === BUILDS.development.sha256, 'DEBUG_APK_CHANGED');
      await adb(['install', '-r', apk]);
      await adb(['logcat', '-b', 'crash', '-c']);
      let flowDirectory = '.maestro';
      if (development) {
        need(state.developmentInspection.manifest.schemes.includes('exp+sport-center-mobile'), 'DEVCLIENT_SCHEME_NOT_DECLARED');
        metroFd = fs.openSync(path.join(files.scratch, 'metro-private.log'), 'wx', 0o600);
        metro = start(process.execPath, [path.resolve('node_modules/expo/bin/cli'), 'start', '--dev-client', '--localhost', '--port', '8081'],
          { env: { ...env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_PUBLIC_API_URL: SOURCE.api }, detached: true, stdio: ['ignore', metroFd, metroFd] });
        metro.on('error', () => { metro.spawnFailure = true; });
        await ready(metro);
        await adb(['reverse', 'tcp:8081', 'tcp:8081']); reverse = true;
        flowDirectory = path.join(files.scratch, 'debug-flows'); fs.mkdirSync(flowDirectory);
        const url = 'exp+sport-center-mobile://expo-development-client/?url=' + encodeURIComponent('http://127.0.0.1:8081');
        const flows = fs.readdirSync('.maestro').filter(file => file.endsWith('.yaml'));
        need(flows.length === 2, 'PUBLIC_FLOW_COUNT');
        for (const file of flows) fs.writeFileSync(path.join(flowDirectory, file), debugFlows(fs.readFileSync(path.join('.maestro', file), 'utf8'), url));
        entry.metro = { loopbackReady: true, reverseReady: true, schemeVerified: true };
      } else {
        need(!(await adb(['reverse', '--list'])).includes('tcp:8081'), 'ADB_REVERSE_STILL_PRESENT');
        entry.independentOfMetro = true;
      }
      const output = 'test-results/profiles-' + phase;
      await run('maestro', ['test', '-e', 'APP_ID=' + SOURCE.appId, '-e', 'PRODUCT_NAME=' + env.PRODUCT_NAME,
        '--format', 'junit', '--output', output + '.xml', '--test-output-dir', output, flowDirectory], { timeout: 600000, env: { ...env, ANDROID_SERIAL: devices[0].split('\t')[0] } });
      need(assertAndroidReport(read(output + '.xml', 'utf8')) === 2, 'PUBLIC_FLOWS_INCOMPLETE');
      entry.publicFlows = 2; entry.processAfter = verifyPid(await adb(['shell', 'pidof', SOURCE.appId]));
      entry.crashCheck = verifyCrashLog(await adb(['logcat', '-b', 'crash', '-d', '-v', 'brief']));
      if (api === 36) entry.runtimeAfter = verifyRuntime({ pageSize: await adb(['shell', 'getconf', 'PAGE_SIZE']), abi: 'x86_64', api: '36' });
      entry.status = 'passed_public_scope';
    } catch (error) { failure = error instanceof ProfileError ? error : new ProfileError('PUBLIC_PROFILE_ACCEPTANCE_FAILED'); entry.status = 'failed'; entry.reason = failure.code; if (error.diagnostic) entry.diagnostic = error.diagnostic; }
    finally {
      let cleanupFailed = false;
      if (reverse) try { await adb(['reverse', '--remove', 'tcp:8081']); } catch { cleanupFailed = true; }
      try { await stop(metro, sleep); } catch { cleanupFailed = true; }
      if (metroFd !== undefined) try { fs.closeSync(metroFd); } catch { cleanupFailed = true; }
      try { await adb(['uninstall', SOURCE.appId]);
        need((await adb(['shell', 'pm', 'list', 'packages', SOURCE.appId])).trim() === '', 'APP_CLEANUP_FAILED');
      } catch { cleanupFailed = true; }
      entry.cleanup = cleanupFailed ? 'failed' : 'passed';
      if (cleanupFailed) { entry.status = 'failed'; failure ||= new ProfileError('PROFILE_CLEANUP_FAILED'); }
      entry.scope = api === 36 ? 'derived-AAB-x86_64-16KB-simulation-not-native-ARM64' : development ? 'Debug-with-Metro-public-flows' : 'AAB-derived-release-public-flows-without-Metro';
      save({ [phase]: entry });
    }
    if (failure) throw failure;
  }
}
async function main(mode, env = process.env) {
  if (mode === 'gate') { for (const value of [env.RESULT_QUALITY, env.RESULT_SECURITY, env.RESULT_PROFILES]) need(value === 'success', 'PROFILE_REQUIRED_JOB_NOT_SUCCESSFUL'); return; }
  if (mode === 'summary') {
    let state = {}; try { state = JSON.parse(fs.readFileSync('test-results/android-profiles.json', 'utf8')); } catch { /* Falta evidencia; no aprobar. */ }
    const phaseRows = [['Inspección Debug', 'developmentInspection'], ['AAB válido y firmado', 'productionBundle'], ['APK derivado', 'productionDerived'],
      ['Debug API34 con Metro', 'development'], ['Release API34 sin Metro', 'production'], ['Derivado API36 de 16KB', 'production16k']]
      .map(([label, key]) => { const value = state[key]?.status; const status = ['passed_offline_scope', 'passed_bundle_scope', 'passed_public_scope'].includes(value)
        ? 'aprobado en su alcance' : value === 'failed' ? 'falló' : 'sin acreditar'; return '| ' + label + ' | ' + status + ' |'; });
    const text = ['# Validación Debug y AAB', '', 'Fuente EAS: ' + SOURCE.commit + '. No compila ni publica.', '', '| Fase | Resultado |', '| --- | --- |', ...phaseRows,
      '', 'La firma temporal del APK derivado no es la identidad Play. API36 acredita sólo simulación x86_64; la prueba física y cuenta/compra quedan fuera.', ''].join('\n');
    fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/android-profiles-summary.md', text);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, text); return;
  }
  const files = locations(env);
  if (mode === 'prepare') {
    const context = verifySource({ sha: env.GITHUB_SHA, ref: env.GITHUB_REF, repository: env.GITHUB_REPOSITORY,
      head: await command('git', ['rev-parse', 'HEAD']), changed: await command('git', ['diff', '--name-only', '--no-renames', SOURCE.commit, 'HEAD']),
      dirty: await command('git', ['status', '--porcelain', '--untracked-files=all']) });
    await command('git', ['merge-base', '--is-ancestor', SOURCE.commit, 'HEAD']);
    need(typeof env.GITHUB_TOKEN === 'string' && env.GITHUB_TOKEN.length > 0, 'GITHUB_READ_TOKEN_REQUIRED');
    const request = async endpoint => { const response = await fetch('https://api.github.com/repos/' + SOURCE.repository + endpoint,
      { redirect: 'error', headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) });
      need(response.ok, 'PRODUCER_READ_FAILED'); return response.json(); };
    const producer = verifyProducer(await request('/actions/runs/' + SOURCE.runId), await request('/actions/runs/' + SOURCE.runId + '/jobs?filter=latest&per_page=100'));
    fs.mkdirSync(files.scratch, { mode: 0o700 });
    report({ ...context, ...producer }, 'test-results/android-profiles-source.json'); return;
  }
  await sourceContext(env);
  if (mode === 'view') {
    need(typeof env.EXPO_TOKEN === 'string' && env.EXPO_TOKEN.length > 0, 'EXPO_READ_TOKEN_REQUIRED');
    for (const profile of ['development', 'production']) {
      const raw = await command('npx', ['--yes', 'eas-cli@latest', 'build:view', BUILDS[profile].id, '--json'], { env, timeout: 120000 });
      verifyBuild(JSON.parse(raw), profile);
      fs.writeFileSync(path.join(files.scratch, profile + '-eas-private.json'), raw, { flag: 'wx', mode: 0o600 });
    }
    return;
  }
  if (mode === 'download') {
    const artifacts = {};
    try {
      for (const profile of ['development', 'production']) {
        const build = verifyBuild(JSON.parse(fs.readFileSync(path.join(files.scratch, profile + '-eas-private.json'), 'utf8')), profile);
        const bytes = await download(build.url, files[profile], BUILDS[profile].sha256);
        artifacts[profile] = { buildId: build.buildId, commit: SOURCE.commit, profile, sha256: BUILDS[profile].sha256, bytes };
      }
    } finally { for (const profile of ['development', 'production']) fs.rmSync(path.join(files.scratch, profile + '-eas-private.json'), { force: true }); }
    report({ artifacts }); return;
  }
  if (mode === 'inspect') { try { return await inspectProfiles(env); } catch (error) { report({ offlineStatus: 'failed', offlineFailure: { reason: error instanceof ProfileError ? error.code : 'PROFILE_STATIC_CHECK_FAILED', ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) } }); throw error; } }
  if (mode === 'kvm') return prepareKvm({ env, save: kvm => report({ kvm }) });
  if (mode === 'api34') return runtime(env, 34);
  if (mode === 'api36') return runtime(env, 36);
  if (mode === 'cleanup') {
    need(path.dirname(files.scratch) === path.resolve(env.RUNNER_TEMP) && path.basename(files.scratch) === 'sport-center-profiles', 'CLEANUP_SCOPE_INVALID');
    fs.rmSync(files.scratch, { recursive: true, force: true }); return;
  }
  throw new ProfileError('PROFILE_MODE_UNKNOWN');
}
module.exports = { SOURCE, BUILDS, BUNDLETOOL, FILES, ProfileError, verifySource, verifyProducer, verifyBuild,
  download, application, resolvePolicy, policyEvidence, inspectApk, debugFlows, waitMetro, stopMetro, metroAbsent, runtime, main };
if (require.main === module) main(process.argv[2]).catch(error => { console.error('Validación de perfiles bloqueada: ' + (error instanceof ProfileError ? error.code : 'PROFILE_VALIDATION_FAILED'));
  process.exitCode = 1; });

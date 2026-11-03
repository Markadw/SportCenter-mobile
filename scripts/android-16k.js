const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { setTimeout: pause } = require('node:timers/promises');
const { selectAndroidBuild, assertAndroidReport } = require('./android-ci');
const { waitForService } = require('./wait-for-service');

const { SOURCE, AUTOMATION_FILES, PROOF_FILE, ProbeError, verifyAutomation, resolveSourceContext } = require('./android-source-context');
const hex64 = /^[a-f0-9]{64}$/;
function requireValue(value, code) { if (!value) throw new ProbeError(code); }
function verifyParent(run, jobs, artifacts) {
  requireValue(run?.id === SOURCE.runId && run.head_sha === SOURCE.commit && run.head_branch === SOURCE.branch
    && run.event === 'push' && run.path === '.github/workflows/api-android.yml'
    && run.repository?.full_name === SOURCE.repository && run.repository.private === false
    && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, 'PARENT_RUN_MISMATCH');
  requireValue(Array.isArray(jobs?.jobs) && jobs.total_count === jobs.jobs.length, 'PARENT_JOBS_INCOMPLETE');
  const requiredJobs = {
    quality: 'Calidad previa a integración / Análisis estático y pruebas del cliente',
    security: 'Seguridad previa a integración y APK / Dependencias y SAST CodeQL',
    api: 'Integración HTTP real y regresión de contratos' };
  const parentGates = {};
  for (const [key, name] of Object.entries(requiredJobs)) {
    const matches = jobs.jobs.filter(job => job.name === name);
    requireValue(matches.length === 1 && matches[0].run_id === SOURCE.runId
      && matches[0].status === 'completed' && matches[0].conclusion === 'success', 'PARENT_GATE_NOT_SUCCESSFUL');
    parentGates[key] = matches[0].id;
  }
  const matching = jobs.jobs.filter(job => job.name === SOURCE.jobName);
  requireValue(matching.length === 1, 'PARENT_JOB_AMBIGUOUS');
  const job = matching[0];
  requireValue(job.run_id === SOURCE.runId && Number.isSafeInteger(job.run_attempt) && job.run_attempt > 0
    && job.run_attempt <= run.run_attempt && job.status === 'completed'
    && ['success', 'failure'].includes(job.conclusion) && Number.isSafeInteger(job.id), 'PARENT_ANDROID_METADATA_INVALID');
  const requiredSteps = ['Comprobar EAS, identificador Android y datos del escenario',
    'Verificar la cadena TLS real y los pines antes del APK',
    'Resolver la candidata EAS y esperar su resultado real sin duplicarla',
    'Verificar procedencia y descargar APK de esta ejecución'];
  requireValue(Array.isArray(job.steps), 'PARENT_STEPS_MISSING');
  for (const name of requiredSteps) {
    const matches = job.steps.filter(step => step.name === name);
    requireValue(matches.length === 1 && matches[0].status === 'completed'
      && matches[0].conclusion === 'success', 'PARENT_BUILD_STEP_NOT_SUCCESSFUL');
  }
  if (job.conclusion === 'failure') {
    const failures = job.steps.filter(step => step.conclusion === 'failure');
    requireValue(failures.length === 1 && failures[0].name === 'Inspeccionar firma, manifiesto, ABI, alineación y clases del APK real',
      'PARENT_FAILURE_NOT_INSPECTOR');
  }
  requireValue(Array.isArray(artifacts?.artifacts) && artifacts.total_count === artifacts.artifacts.length, 'PARENT_ARTIFACTS_INCOMPLETE');
  const matches = artifacts.artifacts.filter(artifact => artifact.name === 'android-evidence');
  requireValue(matches.length === 1, 'PARENT_ARTIFACT_AMBIGUOUS');
  const artifact = matches[0];
  requireValue(artifact.expired === false && Number.isSafeInteger(artifact.id) && artifact.id > 0
    && artifact.workflow_run?.id === SOURCE.runId && artifact.workflow_run.head_sha === SOURCE.commit
    && /^sha256:[a-f0-9]{64}$/.test(artifact.digest || ''), 'PARENT_ARTIFACT_INVALID');
  return { parentRunId: SOURCE.runId, parentRunAttempt: run.run_attempt, parentAndroidJobId: job.id, parentAndroidJobAttempt: job.run_attempt,
    parentArtifactId: artifact.id, parentArtifactDigest: artifact.digest, parentAndroidConclusion: job.conclusion,
    parentGates, parentChecksVerified: true };
}
function verifyMetadata(meta, candidate) {
  requireValue(meta?.buildId === SOURCE.buildId && meta.commit === SOURCE.commit
    && meta.api === SOURCE.api && meta.sha256 === SOURCE.apkSha256 && meta.emulatorApi === 34
    && meta.maestro === SOURCE.maestro, 'PARENT_APK_METADATA_MISMATCH');
  requireValue(candidate?.buildId === SOURCE.buildId && candidate.projectId === SOURCE.projectId
    && candidate.commit === SOURCE.commit && candidate.profile === SOURCE.profile
    && ['created', 'reused'].includes(candidate.source) && hex64.test(candidate.configFingerprint || ''), 'CANDIDATE_METADATA_MISMATCH');
  return { buildId: meta.buildId, apkSha256: meta.sha256, configFingerprint: candidate.configFingerprint };
}
function verifyBuild(build, meta, candidate, now = Date.now()) {
  verifyMetadata(meta, candidate);
  requireValue(build?.id === SOURCE.buildId && build.app?.id === SOURCE.projectId
    && build.appIdentifier === SOURCE.appId && build.buildProfile === SOURCE.profile
    && build.message === 'sport-center-candidate-v1:' + candidate.configFingerprint, 'EAS_BUILD_SCOPE_MISMATCH');
  if (build.expirationDate != null) requireValue(Number.isFinite(Date.parse(build.expirationDate))
    && Date.parse(build.expirationDate) > now, 'EAS_BUILD_EXPIRED');
  try { return selectAndroidBuild([build], SOURCE.commit); }
  catch { throw new ProbeError('EAS_APK_NOT_FINISHED'); }
}
class SystemImageError extends ProbeError {
  constructor(property, expected, actual) {
    super('SYSTEM_IMAGE_MISMATCH'); this.diagnostic = { property, expected, actual };
  }
}
function systemImageEvidence(properties, required) {
  const pairs = typeof properties === 'string' && properties.length <= 65536
    ? properties.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'))
      .map(line => line.split('=').map(part => part.trim())) : [];
  for (const [property, expected] of Object.entries(required)) {
    const entries = pairs.filter(pair => pair[0] === property);
    if (entries.length === 1 && entries[0].length === 2 && entries[0][1] === expected) continue;
    const value = entries.length === 1 && entries[0].length === 2 ? entries[0][1] : null;
    const known = property === 'SystemImage.Abi' ? ['x86', 'x86_64', 'arm64-v8a', 'armeabi-v7a']
      : ['default', 'google_apis', 'page_size_16kb', 'google_apis_ps16k', 'google_apis_playstore', 'google_apis,page_size_16kb'];
    const actual = entries.length > 1 ? '[duplicate]' : value === null ? (entries.length ? '[unrecognized]' : null)
      : ((property === 'Pkg.Revision' || property === 'AndroidVersion.ApiLevel') && /^\d{1,3}$/.test(value)) || known.includes(value)
        ? value : '[unrecognized]';
    throw new SystemImageError(property, expected, actual);
  }
}
function verifyImage(properties) {
  systemImageEvidence(properties, { 'Pkg.Revision': '7', 'AndroidVersion.ApiLevel': '36',
    'SystemImage.Abi': 'x86_64', 'SystemImage.TagId': 'google_apis,page_size_16kb' });
  return { package: SOURCE.image, revision: 7 };
}
function verifyAospImage(properties) {
  // The official r11 archive retains Pkg.Revision=10 in its payload; installed package metadata is checked separately.
  systemImageEvidence(properties, { 'Pkg.Revision': '10', 'AndroidVersion.ApiLevel': '30',
    'SystemImage.Abi': 'x86_64', 'SystemImage.TagId': 'default' });
  return { package: 'system-images;android-30;default;x86_64', payloadRevision: 10 };
}
function verifyRuntime({ pageSize, abi, api }) {
  requireValue(pageSize.trim() === '16384', 'PAGE_SIZE_NOT_16KB');
  requireValue(abi.trim() === 'x86_64' && api.trim() === '36', 'RUNTIME_ARCH_OR_API_MISMATCH');
  return { pageSize: 16384, abi: 'x86_64', api: 36 };
}
function verifyPid(value) {
  requireValue(/^[1-9][0-9]*$/.test(value.trim()), 'APP_PROCESS_NOT_RUNNING');
  return true;
}
function verifyCrashLog(log) {
  requireValue(typeof log === 'string' && log.length <= 512 * 1024, 'CRASH_LOG_INCOMPLETE');
  const ownProcess = log.includes('Process: ' + SOURCE.appId + ',') || log.includes('>>> ' + SOURCE.appId + ' <<<');
  requireValue(!(ownProcess && /FATAL EXCEPTION|Fatal signal|Abort message|signal \d+ \(SIG/.test(log)), 'APP_FATAL_CRASH');
  return { fatalCrashDetected: false, scope: 'crash-buffer-since-launch-package-identity' };
}
function classifyEasFailure(error) {
  const output = [error?.message, error?.stderr, error?.stdout].filter(value => typeof value === 'string')
    .map(value => value.slice(0, 8192)).join('\n');
  let category = 'unknown';
  if (error?.code === 'ENOENT' || /Failed to resolve plugin|Cannot find (?:module|package)|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ConfigError|PluginError|Cannot evaluate (?:app|Expo) config/i.test(output)) category = 'dependency_config';
  else if (/not logged in|not authenticated|unauthorized|authentication (?:failed|required)|invalid (?:access )?token|expired (?:access )?token|invalid credentials|HTTP (?:401|403)/i.test(output)) category = 'authentication';
  else if (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH'].includes(error?.code)
    || /fetch failed|network request failed|socket hang up|network timeout|request timed out|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|HTTP 5[0-9]{2}/i.test(output)) category = 'network';
  return { category, exitCode: Number.isInteger(error?.code) && error.code >= 0 && error.code <= 255 ? error.code : null };
}
class EasReadError extends ProbeError {
  constructor(error) {
    super('EAS_READ_FAILED');
    Object.assign(this, classifyEasFailure(error));
  }
}
async function command(file, args, options = {}) {
  try {
    const { stdout } = await promisify(execFile)(file, args, { encoding: 'utf8', timeout: 30000,
      maxBuffer: 1024 * 1024, windowsHide: true, ...options });
    return stdout;
  } catch (error) {
    if (file === 'npx' && args.includes('build:view')) throw new EasReadError(error);
    throw new ProbeError('COMMAND_FAILED');
  }
}
async function viewBuild(request = command, env = process.env) {
  requireValue(typeof env.EXPO_TOKEN === 'string' && env.EXPO_TOKEN.length > 0, 'EAS_READ_TOKEN_REQUIRED');
  try {
    // CI Linux únicamente. Capturar stdout/stderr: contienen enlaces firmados y no son evidencia publicable.
    const raw = await request('npx', ['--yes', 'eas-cli@latest', 'build:view', SOURCE.buildId, '--json'],
      { env, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(raw);
  } catch (error) { throw error instanceof EasReadError ? error : new EasReadError(error); }
}
async function github(endpoint, token, fetchApi = fetch) {
  requireValue(typeof token === 'string' && token.length > 0, 'GITHUB_READ_TOKEN_REQUIRED');
  try {
    const response = await fetchApi('https://api.github.com/repos/' + SOURCE.repository + endpoint,
      { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    requireValue(response.ok, 'GITHUB_READ_FAILED');
    return await response.json();
  } catch { throw new ProbeError('GITHUB_READ_FAILED'); }
}
async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function downloadApk(build, expectedHash, file, fetchApi = fetch) {
  try {
    const response = await fetchApi(build.url, { signal: AbortSignal.timeout(180000) });
    requireValue(response.ok && response.body, 'APK_DOWNLOAD_FAILED');
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file, { mode: 0o600 }));
    requireValue(await hashFile(file) === expectedHash, 'APK_HASH_MISMATCH');
  } catch (error) { fs.rmSync(file, { force: true }); throw new ProbeError(error?.code === 'APK_HASH_MISMATCH' ? error.code : 'APK_DOWNLOAD_FAILED'); }
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function record(update, directory = 'test-results') {
  fs.mkdirSync(directory, { recursive: true });
  // O_NOFOLLOW está disponible en el runner Linux; Windows usa el mismo descriptor sin ese flag.
  requireValue(process.platform !== 'linux' || Number.isInteger(fs.constants.O_NOFOLLOW), 'REPORT_NOFOLLOW_UNAVAILABLE');
  const descriptor = fs.openSync(path.join(directory, 'android16k.json'),
    fs.constants.O_CREAT | fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0), 0o600);
  let operationError;
  try {
    requireValue(fs.fstatSync(descriptor).isFile(), 'REPORT_NOT_REGULAR_FILE');
    const raw = fs.readFileSync(descriptor, 'utf8');
    const previous = raw.length ? JSON.parse(raw) : {};
    const bytes = Buffer.from(JSON.stringify({ ...previous, ...update }, null, 2) + '\n', 'utf8');
    let written = 0;
    while (written < bytes.length) {
      const count = fs.writeSync(descriptor, bytes, written, bytes.length - written, written);
      requireValue(Number.isInteger(count) && count > 0 && count <= bytes.length - written, 'REPORT_WRITE_INCOMPLETE');
      written += count;
    }
    fs.ftruncateSync(descriptor, bytes.length);
  } catch (error) { operationError = error; throw error; }
  finally {
    try { fs.closeSync(descriptor); }
    catch (error) { if (!operationError) throw error; }
  }
}
function locations(env) {
  requireValue(typeof env.RUNNER_TEMP === 'string' && path.isAbsolute(env.RUNNER_TEMP), 'RUNNER_TEMP_REQUIRED');
  const parent = path.join(env.RUNNER_TEMP, 'android16k-parent');
  return { parent, meta: path.join(parent, 'android-build.json'), candidate: path.join(parent, 'eas-candidate.json'),
    build: path.join(env.RUNNER_TEMP, 'android16k-eas-private.json'), apk: path.join(env.RUNNER_TEMP, 'sport-center.apk') };
}
async function probe({ run = command, env = process.env, wait = waitForService, save = record,
  read = fs.readFileSync, fileHash = hashFile, sleep = pause } = {}) {
  const files = locations(env);
  const meta = JSON.parse(read(files.meta, 'utf8')), candidate = JSON.parse(read(files.candidate, 'utf8'));
  verifyMetadata(meta, candidate);
  requireValue(await fileHash(files.apk) === meta.sha256, 'APK_HASH_MISMATCH');
  requireValue(typeof env.PRODUCT_NAME === 'string' && env.PRODUCT_NAME.trim().length > 0
    && env.PRODUCT_NAME.length <= 160 && !/[\r\n\x00-\x1f]/.test(env.PRODUCT_NAME), 'PUBLIC_PRODUCT_NAME_REQUIRED');
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  requireValue(typeof sdk === 'string' && path.isAbsolute(sdk), 'ANDROID_SDK_REQUIRED');
  const image = verifyImage(read(path.join(sdk, 'system-images/android-36/google_apis_ps16k/x86_64/source.properties'), 'utf8'));
  const serial = env.ANDROID_SERIAL || 'emulator-5554';
  requireValue(/^emulator-\d+$/.test(serial), 'ANDROID_SERIAL_INVALID');
  const adb = args => run('adb', ['-s', serial, ...args]);
  requireValue((await adb(['get-state'])).trim() === 'device', 'ANDROID_DEVICE_NOT_READY');
  const runtime = async () => verifyRuntime({ pageSize: await adb(['shell', 'getconf', 'PAGE_SIZE']),
    abi: await adb(['shell', 'getprop', 'ro.product.cpu.abi']), api: await adb(['shell', 'getprop', 'ro.build.version.sdk']) });
  const before = await runtime();
  // Desactivar el modo de compatibilidad: no confundir arranque tolerado a 4KB con esta prueba.
  await adb(['shell', 'setprop', 'bionic.linker.16kb.app_compat.enabled', 'false']);
  await adb(['shell', 'setprop', 'pm.16kb.app_compat.disabled', 'true']);
  requireValue((await adb(['shell', 'getprop', 'bionic.linker.16kb.app_compat.enabled'])).trim() === 'false'
    && (await adb(['shell', 'getprop', 'pm.16kb.app_compat.disabled'])).trim() === 'true', 'BACKCOMPAT_NOT_DISABLED');
  save({ image, deviceSerial: serial, runtimeBefore: before, backcompatDisabled: true, outcome: 'running', scope: 'official-x86_64-16kb-simulation-not-native-arm' });
  let failure;
  try {
    await adb(['install', '-r', files.apk]);
    requireValue(/\bprimaryCpuAbi=x86_64\b/.test(await adb(['shell', 'dumpsys', 'package', SOURCE.appId])), 'APP_ABI_NOT_X86_64');
    await adb(['shell', 'am', 'force-stop', SOURCE.appId]);
    await adb(['logcat', '-b', 'crash', '-c']);
    const launch = await adb(['shell', 'am', 'start', '-W', '-n', SOURCE.appId + '/.MainActivity']);
    requireValue(/^Status: ok\s*$/m.test(launch), 'APP_LAUNCH_FAILED');
    let running = false;
    for (let attempt = 0; attempt < 10 && !running; attempt += 1) {
      try { running = verifyPid(await adb(['shell', 'pidof', SOURCE.appId])); } catch { /* Arranque acotado. */ }
      if (!running) await sleep(500);
    }
    requireValue(running, 'APP_PROCESS_NOT_RUNNING');
    const readiness = await wait({ apiUrl: SOURCE.api, android: true });
    requireValue(readiness.ready === true, 'PUBLIC_CATALOG_NOT_READY');
    save({ processBefore: true, publicCatalogReady: true });
    await run('maestro', ['--device', serial, 'test', '-e', 'APP_ID=' + SOURCE.appId, '-e', 'PRODUCT_NAME=' + env.PRODUCT_NAME,
      '--format', 'junit', '--output', 'test-results/android16k-maestro.xml',
      '--test-output-dir', 'test-results/android16k-maestro', '.maestro'], { timeout: 600000 });
    requireValue(assertAndroidReport(read('test-results/android16k-maestro.xml', 'utf8')) === 2, 'PUBLIC_FLOWS_INCOMPLETE');
    save({ publicFlows: 2, processAfter: verifyPid(await adb(['shell', 'pidof', SOURCE.appId])) });
  } catch (error) { failure = error instanceof ProbeError ? error : new ProbeError('PUBLIC_ACCEPTANCE_FAILED'); }
  try {
    save({ runtimeAfter: await runtime(), crashCheck: verifyCrashLog(await adb(['logcat', '-b', 'crash', '-d', '-v', 'brief'])) });
  } catch (error) { failure = error instanceof ProbeError ? error : new ProbeError('RUNTIME_AFTER_FAILED'); }
  if (failure) throw failure;
  save({ outcome: 'passed' });
}
async function acceptApi34({ run = command, env = process.env, wait = waitForService,
  source = resolveSourceContext, read = fs.readFileSync, fileHash = hashFile, save } = {}) {
  const context = source(env), files = locations(env);
  const meta = JSON.parse(read(files.meta, 'utf8')), candidate = JSON.parse(read(files.candidate, 'utf8'));
  verifyMetadata(meta, candidate);
  requireValue(await fileHash(files.apk) === SOURCE.apkSha256, 'APK_HASH_MISMATCH');
  requireValue(typeof env.PRODUCT_NAME === 'string' && env.PRODUCT_NAME.trim().length > 0
    && env.PRODUCT_NAME.length <= 160 && !/[\r\n\x00-\x1f]/.test(env.PRODUCT_NAME), 'PUBLIC_PRODUCT_NAME_REQUIRED');
  const serial = env.ANDROID_SERIAL || 'emulator-5554';
  requireValue(/^emulator-\d+$/.test(serial), 'ANDROID_SERIAL_INVALID');
  const adb = args => run('adb', ['-s', serial, ...args]);
  requireValue((await adb(['get-state'])).trim() === 'device', 'ANDROID_DEVICE_NOT_READY');
  requireValue((await adb(['shell', 'getprop', 'ro.build.version.sdk'])).trim() === '34'
    && (await adb(['shell', 'getprop', 'ro.product.cpu.abi'])).trim() === 'x86_64', 'API34_RUNTIME_MISMATCH');
  await adb(['install', '-r', files.apk]);
  const ready = await wait({ apiUrl: SOURCE.api, android: true });
  requireValue(ready.ready === true, 'PUBLIC_CATALOG_NOT_READY');
  await run('maestro', ['--device', serial, 'test', '-e', 'APP_ID=' + SOURCE.appId, '-e', 'PRODUCT_NAME=' + env.PRODUCT_NAME,
    '--format', 'junit', '--output', 'test-results/maestro.xml', '--test-output-dir', 'test-results/maestro', '.maestro'], { timeout: 600000 });
  requireValue(assertAndroidReport(read('test-results/maestro.xml', 'utf8')) === 2, 'PUBLIC_FLOWS_INCOMPLETE');
  const report = { status: 'passed', deviceSerial: serial, api: 34, abi: 'x86_64', publicFlows: 2,
    processAfter: verifyPid(await adb(['shell', 'pidof', SOURCE.appId])), buildId: SOURCE.buildId,
    apkSha256: SOURCE.apkSha256, artifactSourceCommit: context.artifactSourceCommit, automationCommit: context.automationCommit };
  if (save) save(report);
  else fs.writeFileSync('test-results/android34.json', JSON.stringify(report, null, 2) + '\n');
}
function kvmDeviceAccess({ open = fs.openSync, stat = fs.fstatSync, close = fs.closeSync } = {}) {
  const result = { exists: null, characterDevice: null, readable: false, writable: false, openReadWrite: false, error: 'none' };
  let closeFailed = false;
  for (const [key, mode] of [['readable', fs.constants.O_RDONLY], ['writable', fs.constants.O_WRONLY], ['openReadWrite', fs.constants.O_RDWR]]) {
    let descriptor;
    try {
      descriptor = open('/dev/kvm', mode | (fs.constants.O_NOFOLLOW || 0));
      result.exists = true; result.characterDevice = stat(descriptor).isCharacterDevice();
      if (result.characterDevice) { result[key] = true; if (key === 'openReadWrite') result.error = 'none'; }
      else result.error = 'NOT_CHARACTER_DEVICE';
    } catch (error) {
      if (key === 'openReadWrite') {
        result.error = ['ENOENT', 'EACCES', 'EPERM', 'ENODEV', 'ENXIO', 'ELOOP'].includes(error?.code) ? error.code : 'OPEN_FAILED';
        if (error?.code === 'ENOENT') result.exists = false;
      }
    } finally {
      if (descriptor !== undefined) try { close(descriptor); }
      catch { closeFailed = true; }
    }
  }
  if (closeFailed) { result.openReadWrite = false; result.error = 'CLOSE_FAILED'; }
  return result;
}
async function prepareKvm({ env = process.env, platform = process.platform, run = command,
  read = fs.readFileSync, inspect = kvmDeviceAccess, save = kvm => record({ kvm }) } = {}) {
  requireValue(platform === 'linux' && env.GITHUB_ACTIONS === 'true' && env.RUNNER_OS === 'Linux'
    && env.RUNNER_ENVIRONMENT === 'github-hosted' && env.PINNING_EPHEMERAL_AVD === 'true', 'KVM_REQUIRES_EPHEMERAL_HOSTED_LINUX');
  let cpu = '';
  try { cpu = read('/proc/cpuinfo', 'utf8'); } catch { /* No registrar contenido del host. */ }
  const report = { status: 'preparing', scope: 'device-access-only-avd-proves-acceleration',
    cpu: { vmx: /\bvmx\b/.test(cpu), svm: /\bsvm\b/.test(cpu) }, before: inspect(), steps: [] };
  save(report);
  const attempt = async (name, args, timeout = 15000) => {
    let success = false;
    try { await run('sudo', ['-n', ...args], { timeout, maxBuffer: 65536 }); success = true; } catch { /* Sólo estado seguro. */ }
    report.steps.push({ name, success }); return success;
  };
  try {
    requireValue(report.before.characterDevice !== false, 'KVM_DEVICE_NOT_CHARACTER');
    await attempt('module_kvm', ['modprobe', 'kvm']);
    if (report.cpu.vmx) await attempt('module_cpu', ['modprobe', 'kvm_intel']);
    else if (report.cpu.svm) await attempt('module_cpu', ['modprobe', 'kvm_amd']);
    const reload = await attempt('udev_reload', ['udevadm', 'control', '--reload-rules']);
    const trigger = await attempt('udev_trigger', ['udevadm', 'trigger', '--name-match=/dev/kvm']);
    const settled = await attempt('udev_settle', ['udevadm', 'settle', '--timeout=15'], 20000);
    const permissions = reload && trigger && settled
      ? await attempt('device_permissions', ['chmod', '0666', '--', '/dev/kvm']) : false;
    report.after = inspect();
    requireValue(report.after.exists !== false, 'KVM_DEVICE_ABSENT');
    requireValue(report.after.characterDevice !== false, 'KVM_DEVICE_NOT_CHARACTER');
    requireValue(!['EACCES', 'EPERM'].includes(report.after.error), 'KVM_PERMISSION_DENIED');
    requireValue(reload && trigger && settled && permissions, 'KVM_PREPARATION_FAILED');
    requireValue(report.after.openReadWrite === true, 'KVM_DEVICE_OPEN_FAILED');
    report.status = 'access_ready';
  } catch (error) {
    report.status = 'blocked'; report.reason = error instanceof ProbeError ? error.code : 'KVM_PREPARATION_FAILED';
    throw new ProbeError(report.reason);
  } finally {
    if (!report.after) report.after = inspect();
    save(report);
  }
  return report;
}
async function main(mode, env = process.env) {
  const files = locations(env);
  if (mode === 'prepare') {
    requireValue((await command('git', ['rev-parse', 'HEAD'])).trim() === env.GITHUB_SHA, 'CHECKOUT_SHA_MISMATCH');
    const automation = verifyAutomation({ commit: env.GITHUB_SHA, ref: env.GITHUB_REF, repository: env.GITHUB_REPOSITORY,
      changed: await command('git', ['diff', '--name-only', '--no-renames', SOURCE.commit, 'HEAD']),
      dirty: await command('git', ['status', '--porcelain', '--untracked-files=all']) });
    await command('git', ['merge-base', '--is-ancestor', SOURCE.commit, 'HEAD']);
    const base = '/actions/runs/' + SOURCE.runId;
    const run = await github(base, env.GITHUB_TOKEN);
    const jobs = await github(base + '/jobs?filter=latest&per_page=100', env.GITHUB_TOKEN);
    const artifacts = await github(base + '/artifacts?per_page=100', env.GITHUB_TOKEN);
    const parent = verifyParent(run, jobs, artifacts);
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync(PROOF_FILE, JSON.stringify({ version: 1, ...automation, ...parent,
      buildId: SOURCE.buildId, apkSha256: SOURCE.apkSha256 }, null, 2) + '\n');
    record({ ...automation, ...parent, outcome: 'prepared' });
    requireValue(typeof env.GITHUB_OUTPUT === 'string', 'GITHUB_OUTPUT_REQUIRED');
    fs.appendFileSync(env.GITHUB_OUTPUT, 'artifact_id=' + parent.parentArtifactId + '\n');
    return;
  }
  if (mode === 'view') {
    requireValue(process.platform === 'linux', 'EAS_READ_REQUIRES_LINUX_CI');
    const meta = readJson(files.meta), candidate = readJson(files.candidate);
    record(verifyMetadata(meta, candidate));
    resolveSourceContext(env);
    fs.writeFileSync('test-results/android-build.json', JSON.stringify(meta, null, 2) + '\n');
    fs.writeFileSync('test-results/eas-candidate.json', JSON.stringify(candidate, null, 2) + '\n');
    const build = await viewBuild(command, env);
    verifyBuild(build, meta, candidate);
    fs.writeFileSync(files.build, JSON.stringify(build), { mode: 0o600 });
    return;
  }
  if (mode === 'download') {
    const meta = readJson(files.meta), candidate = readJson(files.candidate);
    const build = verifyBuild(readJson(files.build), meta, candidate);
    try { await downloadApk(build, meta.sha256, files.apk); }
    finally { fs.rmSync(files.build, { force: true }); }
    record({ apkHashVerified: true });
    return;
  }
  if (mode === 'kvm') { resolveSourceContext(env); return prepareKvm({ env }); }
  if (mode === 'api34') return acceptApi34({ env });
  if (mode === 'probe') { resolveSourceContext(env); return probe({ env }); }
  if (mode === 'gate') {
    requireValue(['RESULT_QUALITY', 'RESULT_SECURITY', 'RESULT_NATIVE'].every(key => env[key] === 'success'), 'NATIVE_VALIDATION_NOT_SUCCESSFUL');
    console.log('Validación nativa aprobada del mismo APK: inspección, API34, MITM API30 y simulación 16KB x86_64. No acredita ARM64 nativo ni Play.');
    return;
  }
  if (mode !== 'summary') throw new ProbeError('MODE_INVALID');
  const safeRead = file => { try { return readJson(file); } catch { return {}; } };
  const result = safeRead('test-results/android16k.json');
  const inspection = safeRead('test-results/android-inspection.json');
  const api34 = safeRead('test-results/android34.json');
  const pinning = safeRead('test-results/android-pinning.json');
  const passed = result.outcome === 'passed' && inspection.status === 'passed_for_static_scope'
    && api34.status === 'passed' && pinning.status === 'passed_controlled_native_rejection';
  const text = ['# Validación nativa del mismo APK', '', passed ? 'Comprobaciones nativas completadas.'
    : 'Validación incompleta o bloqueada; no acredita aprobación nativa.',
    '', 'Fuente APK: ' + SOURCE.commit + '. Build EAS existente: ' + SOURCE.buildId + '.',
    'APK SHA256: ' + SOURCE.apkSha256 + '.',
    'El SHA de automatización se registra por separado; no se modifica GITHUB_SHA.',
    '', 'El run padre ' + SOURCE.runId + ' conserva su fallo histórico de inspección. Esta ejecución no lo convierte en verde.',
    '16KB acredita simulación oficial x86_64, no ejecución nativa ARM64 ni aceptación de Google Play.', ''].join('\n');
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/android16k-summary.md', text);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  else process.stdout.write(text);
}
module.exports = { SOURCE, AUTOMATION_FILES, ProbeError, verifyAutomation, verifyParent, verifyMetadata,
  verifyBuild, verifyImage, verifyAospImage, SystemImageError, verifyRuntime, verifyPid, verifyCrashLog, viewBuild, downloadApk, probe, acceptApi34, record, classifyEasFailure, EasReadError, kvmDeviceAccess, prepareKvm, main };
if (require.main === module) main(process.argv[2]).catch(error => {
  const code = error instanceof ProbeError ? error.code : 'INTERNAL_ERROR';
  const easRead = error instanceof EasReadError ? { category: error.category, exitCode: error.exitCode } : undefined;
  record({ outcome: 'blocked', reason: code, ...(easRead ? { easRead } : {}),
    ...(error instanceof SystemImageError ? { systemImageMismatch: error.diagnostic } : {}) });
  console.error('Prueba 16KB bloqueada: ' + code + (easRead
    ? ' category=' + easRead.category + ' exitCode=' + (easRead.exitCode ?? 'unknown') : '') + '.');
  process.exitCode = 1;
});

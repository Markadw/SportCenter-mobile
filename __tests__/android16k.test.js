/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { test, expect, jest } = require('@jest/globals');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { createHash } = require('node:crypto');
const YAML = require('yaml');
const { SOURCE, AUTOMATION_FILES, verifyAutomation, verifyParent, verifyMetadata, verifyBuild,
  verifyImage, verifyRuntime, verifyPid, verifyCrashLog, viewBuild, downloadApk, probe, acceptApi34, record, classifyEasFailure, EasReadError, kvmDeviceAccess, prepareKvm, main } = require('../scripts/android-16k');

const automation = { commit: 'a'.repeat(40), ref: 'refs/tags/validation/android-same-apk', repository: SOURCE.repository,
  changed: 'scripts/android-16k.js\n.github/workflows/ci.yml\n' };
function parent() {
  const steps = ['Comprobar EAS, identificador Android y datos del escenario', 'Verificar la cadena TLS real y los pines antes del APK',
    'Resolver la candidata EAS y esperar su resultado real sin duplicarla', 'Verificar procedencia y descargar APK de esta ejecución']
    .map(name => ({ name, status: 'completed', conclusion: 'success' }));
  return { run: { id: SOURCE.runId, head_sha: SOURCE.commit, head_branch: SOURCE.branch, event: 'push',
    path: '.github/workflows/api-android.yml', repository: { full_name: SOURCE.repository, private: false }, run_attempt: 2,
    status: 'completed', conclusion: 'failure' }, jobs: { total_count: 4, jobs: [{ id: 99, name: SOURCE.jobName,
    run_id: SOURCE.runId, run_attempt: 2, status: 'completed', conclusion: 'success', steps },
    ...['Calidad previa a integración / Análisis estático y pruebas del cliente',
      'Seguridad previa a integración y APK / Dependencias y SAST CodeQL', 'Integración HTTP real y regresión de contratos']
      .map((name, index) => ({ id: index + 1, name, run_id: SOURCE.runId, status: 'completed', conclusion: 'success' }))] },
  artifacts: { total_count: 1, artifacts: [{ id: 100, name: 'android-evidence', expired: false,
    digest: 'sha256:' + 'b'.repeat(64), workflow_run: { id: SOURCE.runId, head_sha: SOURCE.commit } }] } };
}
function metadata() {
  return { meta: { buildId: SOURCE.buildId, commit: SOURCE.commit, api: SOURCE.api, sha256: SOURCE.apkSha256,
    emulatorApi: 34, maestro: SOURCE.maestro }, candidate: { buildId: SOURCE.buildId, projectId: SOURCE.projectId,
    commit: SOURCE.commit, profile: 'preview', source: 'reused', configFingerprint: 'd'.repeat(64) } };
}
function build() {
  return { id: SOURCE.buildId, app: { id: SOURCE.projectId }, appIdentifier: SOURCE.appId, buildProfile: 'preview',
    message: 'sport-center-candidate-v1:' + 'd'.repeat(64), platform: 'ANDROID', status: 'FINISHED',
    gitCommitHash: SOURCE.commit, artifacts: { applicationArchiveUrl: 'https://example.invalid/same.apk?signed=private' } };
}
const image = 'Pkg.Revision=7\nAndroidVersion.ApiLevel=36\nSystemImage.Abi=x86_64\nSystemImage.TagId=google_apis_ps16k\n';
const runtime = { pageSize: '16384\r\n', abi: 'x86_64\n', api: '36\n' };
const junit = '<testsuite><testcase name="catalog"/><testcase name="detail"/></testsuite>';

test('separa SHA de automatización y fuente y admite sólo rutas exactas', () => {
  expect(verifyAutomation(automation)).toEqual({ automationCommit: 'a'.repeat(40), artifactSourceCommit: SOURCE.commit, changedAutomationFiles: 2 });
  for (const file of AUTOMATION_FILES) expect(() => verifyAutomation({ ...automation, changed: file })).not.toThrow();
});
test.each(['src/app/index.tsx', 'app.json', 'assets/icon.png', 'package-lock.json', 'plugins/with-network-security.js',
  'src/app/_layout.tsx', 'scripts/android-16k.js/../app.json', 'scripts/android-16k.js\napp.json', '.github/workflows/security.yml'])('bloquea cambio fuera del ámbito: %s', changed => {
  expect(() => verifyAutomation({ ...automation, changed })).toThrow('APP_TREE_CHANGED');
});
test.each([{ commit: SOURCE.commit }, { commit: SOURCE.commit.slice(0, 7) }, { ref: 'refs/heads/main' },
  { repository: 'another/repo' }, { dirty: ' M app.json' }, { changed: '' }])('bloquea checkout inadecuado %j', change => {
  expect(() => verifyAutomation({ ...automation, ...change })).toThrow();
});
test('acepta último Android exitoso aunque el workflow global continúe y guarda el nuevo job ID', () => {
  const data = parent();
  expect(verifyParent(data.run, data.jobs, data.artifacts)).toMatchObject({ parentAndroidJobId: 99, parentRunAttempt: 2, parentArtifactId: 100 });
});
test('admite Android anterior aún vigente cuando sólo se reintentó otro job del run', () => {
  const data = parent(); data.jobs.jobs[0].run_attempt = 1;
  expect(verifyParent(data.run, data.jobs, data.artifacts)).toMatchObject({ parentAndroidJobAttempt: 1, parentRunAttempt: 2 });
});
test.each(['cancelled', null])('bloquea Android %s', conclusion => {
  const data = parent(); data.jobs.jobs[0].conclusion = conclusion;
  expect(() => verifyParent(data.run, data.jobs, data.artifacts)).toThrow('PARENT_ANDROID_METADATA_INVALID');
});
test.each(['head_sha', 'head_branch', 'event', 'path'])('rechaza identidad padre incorrecta: %s', key => {
  const data = parent(); data.run[key] = 'wrong';
  expect(() => verifyParent(data.run, data.jobs, data.artifacts)).toThrow('PARENT_RUN_MISMATCH');
});
test('rechaza intento futuro, jobs paginados o duplicados y artefacto expirado/ambiguo', () => {
  let data = parent(); data.jobs.jobs[0].run_attempt = 3;
  expect(() => verifyParent(data.run, data.jobs, data.artifacts)).toThrow('PARENT_ANDROID_METADATA_INVALID');
  data = parent(); data.jobs.total_count = 101;
  expect(() => verifyParent(data.run, data.jobs, data.artifacts)).toThrow('PARENT_JOBS_INCOMPLETE');
  data = parent(); data.jobs.jobs.push(data.jobs.jobs[0]); data.jobs.total_count++;
  expect(() => verifyParent(data.run, data.jobs, data.artifacts)).toThrow('PARENT_JOB_AMBIGUOUS');
  data = parent(); data.artifacts.artifacts[0].expired = true;
  expect(() => verifyParent(data.run, data.jobs, data.artifacts)).toThrow('PARENT_ARTIFACT_INVALID');
  data = parent(); data.artifacts.artifacts.push(data.artifacts.artifacts[0]); data.artifacts.total_count++;
  expect(() => verifyParent(data.run, data.jobs, data.artifacts)).toThrow('PARENT_ARTIFACT_AMBIGUOUS');
});
test.each(['buildId', 'commit', 'api', 'sha256', 'emulatorApi', 'maestro'])('exige metadata APK padre exacta: %s', key => {
  const { meta, candidate } = metadata(); meta[key] = 'wrong';
  expect(() => verifyMetadata(meta, candidate)).toThrow('PARENT_APK_METADATA_MISMATCH');
});
test.each(['buildId', 'projectId', 'commit', 'profile', 'configFingerprint', 'source'])('exige candidata exacta: %s', key => {
  const { meta, candidate } = metadata(); candidate[key] = 'wrong';
  expect(() => verifyMetadata(meta, candidate)).toThrow('CANDIDATE_METADATA_MISMATCH');
});
test('contrasta EAS FINISHED y fingerprint remoto con el contrato selectAndroidBuild', () => {
  const { meta, candidate } = metadata();
  expect(verifyBuild(build(), meta, candidate)).toMatchObject({ id: SOURCE.buildId, commit: SOURCE.commit });
  for (const change of [{ status: 'IN_PROGRESS' }, { gitCommitHash: 'a'.repeat(40) }, { platform: 'IOS' },
    { buildProfile: 'production' }, { id: 'another-build' }, { app: { id: 'another-project' } },
    { message: 'sport-center-candidate-v1:' + 'e'.repeat(64) }, { appIdentifier: 'another.app' },
    { artifacts: { applicationArchiveUrl: 'http://example.invalid/same.apk' } }, { expirationDate: '2000-01-01' }]) {
    expect(() => verifyBuild({ ...build(), ...change }, meta, candidate)).toThrow();
  }
});
test('única operación EAS es build:view con ID fijo y salida capturada', async () => {
  const request = jest.fn().mockResolvedValue(JSON.stringify(build()));
  expect(await viewBuild(request, { EXPO_TOKEN: 'test-secret' })).toEqual(build());
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0].slice(0, 2)).toEqual(['npx', ['--yes', 'eas-cli@latest', 'build:view', SOURCE.buildId, '--json']]);
  await expect(viewBuild(jest.fn().mockRejectedValue(new Error('signed-url secret')), { EXPO_TOKEN: 'test' })).rejects.toThrow('EAS_READ_FAILED');
  await expect(viewBuild(request, {})).rejects.toThrow('EAS_READ_TOKEN_REQUIRED');
});
test('hash APK auténtico: acepta bytes idénticos y elimina descarga discrepante sin filtrar URL', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'android16k-'));
  const file = path.join(directory, 'same.apk');
  const bytes = Buffer.from('same candidate bytes');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const fetchApi = jest.fn(async () => ({ ok: true, body: Readable.toWeb(Readable.from([bytes])) }));
  try {
    await downloadApk({ url: 'https://example.invalid/private.apk' }, hash, file, fetchApi);
    expect(fs.readFileSync(file)).toEqual(bytes);
    await expect(downloadApk({ url: 'https://example.invalid/private.apk' }, '0'.repeat(64), file, fetchApi)).rejects.toThrow('APK_HASH_MISMATCH');
    expect(fs.existsSync(file)).toBe(false);
    await expect(downloadApk({ url: 'https://example.invalid/private.apk' }, hash, file,
      jest.fn().mockRejectedValue(new Error('private signed url')))).rejects.toThrow('APK_DOWNLOAD_FAILED');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('exige la imagen oficial y revisión revisada; no acepta una imagen normal/otra API', () => {
  expect(verifyImage(image)).toEqual({ package: SOURCE.image, revision: 7 });
  for (const value of [image.replace('=7', '=8'), image.replace('=36', '=35'), image.replace('=x86_64', '=arm64-v8a'),
    image.replace('=google_apis_ps16k', '=google_apis'), image + 'Pkg.Revision=7\n', '']) {
    expect(() => verifyImage(value)).toThrow('SYSTEM_IMAGE_MISMATCH');
  }
});
test('exige 16384 reales y ABI/API antes y después, sin 4KB ni ARM', () => {
  expect(verifyRuntime(runtime)).toEqual({ pageSize: 16384, abi: 'x86_64', api: 36 });
  for (const change of [{ pageSize: '4096' }, { pageSize: '16384\n4096' }, { abi: 'arm64-v8a' }, { api: '35' }]) {
    expect(() => verifyRuntime({ ...runtime, ...change })).toThrow();
  }
  expect(verifyPid('123\n')).toBe(true);
  for (const pid of ['', '0', '123 456', 'error']) expect(() => verifyPid(pid)).toThrow('APP_PROCESS_NOT_RUNNING');
});
test('no publica logcat y rechaza fatales Java/nativos identificados del paquete', () => {
  expect(verifyCrashLog('FATAL EXCEPTION\nProcess: another.app, PID: 2')).toMatchObject({ fatalCrashDetected: false });
  for (const text of ['FATAL EXCEPTION\nProcess: ' + SOURCE.appId + ', PID: 123',
    '>>> ' + SOURCE.appId + ' <<<\nsignal 11 (SIGSEGV)', 'Fatal signal 6\n>>> ' + SOURCE.appId + ' <<<']) {
    expect(() => verifyCrashLog(text)).toThrow('APP_FATAL_CRASH');
  }
  expect(() => verifyCrashLog('x'.repeat(512 * 1024 + 1))).toThrow('CRASH_LOG_INCOMPLETE');
});
function simulation(overrides = {}) {
  const { meta, candidate } = metadata();
  const env = { RUNNER_TEMP: os.tmpdir(), ANDROID_HOME: os.tmpdir(), PRODUCT_NAME: 'Producto público' };
  let pageCalls = 0;
  const run = jest.fn(async (file, args) => {
    const command = args.join(' ');
    if (file === 'maestro') return '';
    if (command === 'shell getconf PAGE_SIZE') { pageCalls++; return overrides.afterPage && pageCalls > 1 ? overrides.afterPage : '16384\n'; }
    if (command === 'shell getprop ro.product.cpu.abi') return 'x86_64';
    if (command === 'shell getprop ro.build.version.sdk') return '36';
    if (command === 'shell getprop bionic.linker.16kb.app_compat.enabled') return overrides.compat || 'false';
    if (command === 'shell getprop pm.16kb.app_compat.disabled') return 'true';
    if (command === 'shell dumpsys package ' + SOURCE.appId) return 'primaryCpuAbi=' + (overrides.appAbi || 'x86_64');
    if (command.startsWith('shell am start')) return 'Status: ok\n';
    if (command.startsWith('shell pidof')) return overrides.pid ?? '123';
    if (command === 'logcat -b crash -d -v brief') return overrides.crash || '';
    return '';
  });
  const read = jest.fn(file => file.endsWith('android-build.json') ? JSON.stringify(meta)
    : file.endsWith('eas-candidate.json') ? JSON.stringify(candidate) : file.endsWith('source.properties') ? image : overrides.junit || junit);
  return { env, run, read, save: jest.fn(), fileHash: jest.fn().mockResolvedValue(overrides.hash || meta.sha256),
    wait: jest.fn().mockResolvedValue({ ready: overrides.ready ?? true }), sleep: jest.fn().mockResolvedValue() };
}
test('piloto comprueba runtime antes/después, instala el mismo APK y ejecuta sólo flujos públicos', async () => {
  const options = simulation();
  await probe(options);
  expect(options.save).toHaveBeenLastCalledWith({ outcome: 'passed' });
  expect(options.run.mock.calls.filter(([, args]) => args.join(' ') === 'shell getconf PAGE_SIZE')).toHaveLength(2);
  expect(options.run.mock.calls.find(([file]) => file === 'maestro')[1]).toContain('.maestro');
  const install = options.run.mock.calls.find(([, args]) => args[0] === 'install');
  expect(install[1]).toEqual(['install', '-r', path.join(os.tmpdir(), 'sport-center.apk')]);
  expect(options.wait).toHaveBeenCalledWith({ apiUrl: SOURCE.api, android: true });
});
test.each([{ hash: '0'.repeat(64) }, { compat: 'true' }, { appAbi: 'arm64-v8a' }, { pid: '' },
  { ready: false }, { junit: '<testsuite><testcase/></testsuite>' },
  { junit: '<testsuite><testcase/><testcase><skipped/></testcase></testsuite>' },
  { afterPage: '4096' }, { crash: 'FATAL EXCEPTION\nProcess: ' + SOURCE.appId + ', PID: 123' }])('piloto falla cerrado sin atribuir éxito: %j', async change => {
  const options = simulation(change);
  await expect(probe(options)).rejects.toThrow();
  expect(options.save.mock.calls).not.toContainEqual([{ outcome: 'passed' }]);
});
test('workflow aislado conserva permisos, EAS sólo lectura, KVM, SHA Maestro y evidencia acotada', () => {
  const workflow = YAML.parse(fs.readFileSync(path.join(__dirname, '../.github/workflows/android-validation.yml'), 'utf8'));
  expect(workflow.on.push.tags).toEqual(['validation/android-*']);
  expect(workflow.on.push.branches).toBeUndefined();
  expect(Object.keys(workflow.on)).toEqual(['push']);
  expect(workflow.permissions).toEqual({ contents: 'read', actions: 'read', 'pull-requests': 'read' });
  expect(workflow.jobs.quality).toMatchObject({ uses: './.github/workflows/ci.yml', with: { keep_evidence: true } });
  const job = workflow.jobs.native;
  expect(job.needs).toEqual(['quality', 'security']); expect(job['runs-on']).toBe('ubuntu-24.04');
  const tokenSteps = job.steps.filter(step => step.env?.EXPO_TOKEN);
  expect(tokenSteps).toHaveLength(1); expect(tokenSteps[0].run).toBe('node scripts/android-16k.js view');
  expect(job.env.EXPO_TOKEN).toBeUndefined();
  const emulator = job.steps.find(step => step.id === 'pages16k');
  expect(emulator.with).toMatchObject({ 'api-level': 36, arch: 'x86_64', target: 'google_apis_ps16k',
    'disable-linux-hw-accel': false, 'force-avd-creation': true, script: 'node scripts/android-16k.js probe' });
  expect(emulator.with['emulator-options']).toContain('-accel on');
  expect(emulator.with['emulator-options']).toContain('-gpu swiftshader');
  const evidence = job.steps.find(step => step.uses?.startsWith('actions/upload-artifact'));
  expect(evidence.if).toContain('failure()'); expect(evidence.if).toContain("env.keep_evidence == 'true'");
  expect(evidence.with['retention-days']).toBe(14);
  expect(evidence.with.path).not.toMatch(/\.apk|eas-private|parent|logcat/);
  expect(job.steps.map(step => step.run || '').join('\n')).not.toMatch(/eas-cli.*\sbuild\s|scripts\/eas-candidate/);
  expect(job.steps.find(step => step.name?.includes('Instalar herramientas')).run).toContain('a6044a84542f522f434c5dc3d609e60c7446d423f3ed1b2ae513f5c48663ec5e');
});

test('el fallo histórico del inspector no se convierte en éxito ni sustituye las compuertas previas', () => {
  const data = parent(); data.jobs.jobs[0].conclusion = 'failure';
  data.jobs.jobs[0].steps.push({ name: 'Inspeccionar firma, manifiesto, ABI, alineación y clases del APK real', status: 'completed', conclusion: 'failure' });
  expect(verifyParent(data.run, data.jobs, data.artifacts)).toMatchObject({ parentAndroidConclusion: 'failure', parentChecksVerified: true });
  data.jobs.jobs[0].steps[1].conclusion = 'failure';
  expect(() => verifyParent(data.run, data.jobs, data.artifacts)).toThrow('PARENT_BUILD_STEP_NOT_SUCCESSFUL');
});
test.each([1, 2, 3])('no acepta una compuerta padre fallida u omitida: %s', index => {
  const data = parent(); data.jobs.jobs[index].conclusion = 'skipped';
  expect(() => verifyParent(data.run, data.jobs, data.artifacts)).toThrow('PARENT_GATE_NOT_SUCCESSFUL');
});
test('Maestro API34 se ejecuta de nuevo y produce procedencia separada, nunca infiere éxito del padre', async () => {
  const options = simulation();
  const base = options.run;
  options.run = jest.fn((file, args, config) => args.join(' ') === 'shell getprop ro.build.version.sdk' ? Promise.resolve('34') : base(file, args, config));
  options.source = () => ({ artifactSourceCommit: SOURCE.commit, automationCommit: 'a'.repeat(40) });
  await acceptApi34(options);
  expect(options.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'passed', publicFlows: 2,
    artifactSourceCommit: SOURCE.commit, automationCommit: 'a'.repeat(40), apkSha256: SOURCE.apkSha256 }));
  expect(options.run.mock.calls.some(([file]) => file === 'maestro')).toBe(true);
  options.run = jest.fn().mockResolvedValue('36');
  await expect(acceptApi34(options)).rejects.toThrow('API34_RUNTIME_MISMATCH');
});
test.each(['failure', 'skipped', 'cancelled', undefined])('el agregado bloquea calidad/seguridad/nativo %s', async status => {
  for (const key of ['RESULT_QUALITY', 'RESULT_SECURITY', 'RESULT_NATIVE']) {
    await expect(main('gate', { RUNNER_TEMP: os.tmpdir(), RESULT_QUALITY: 'success', RESULT_SECURITY: 'success', RESULT_NATIVE: 'success', [key]: status }))
      .rejects.toThrow('NATIVE_VALIDATION_NOT_SUCCESSFUL');
  }
});

function reportDirectory(action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'android16k-record-'));
  try { return action(directory); }
  finally {
    jest.restoreAllMocks();
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir())
      || !path.basename(directory).startsWith('android16k-record-')) throw Error('Ruta temporal inesperada');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
test('record crea carpeta/archivo ausentes y conserva metadata al actualizar un informe existente', () => reportDirectory(base => {
  const directory = path.join(base, 'new', 'nested'), file = path.join(directory, 'android16k.json');
  const open = jest.spyOn(fs, 'openSync');
  record({ source: SOURCE.commit, stage: 'prepared' }, directory);
  record({ stage: 'downloaded' }, directory);
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ source: SOURCE.commit, stage: 'downloaded' });
  const reportOpens = open.mock.calls.filter(([target]) => target === file);
  expect(reportOpens).toHaveLength(2);
  for (const [, flags, mode] of reportOpens) {
    expect(flags & fs.constants.O_RDWR).toBe(fs.constants.O_RDWR);
    expect(flags & fs.constants.O_CREAT).toBe(fs.constants.O_CREAT);
    if (fs.constants.O_NOFOLLOW) expect(flags & fs.constants.O_NOFOLLOW).toBe(fs.constants.O_NOFOLLOW);
    expect(mode).toBe(0o600);
  }
}));
test('record escribe desde cero, soporta escrituras parciales UTF8 y trunca los bytes sobrantes', () => reportDirectory(directory => {
  const file = path.join(directory, 'android16k.json');
  record({ text: 'x'.repeat(1000), preserve: true }, directory);
  const write = fs.writeSync;
  const positions = [];
  jest.spyOn(fs, 'writeSync').mockImplementation((fd, buffer, offset, length, position) => {
    positions.push(position);
    return write(fd, buffer, offset, Math.min(length, 7), position);
  });
  record({ text: 'ñ✓' }, directory);
  const expected = JSON.stringify({ text: 'ñ✓', preserve: true }, null, 2) + '\n';
  expect(fs.readFileSync(file, 'utf8')).toBe(expected);
  expect(fs.statSync(file).size).toBe(Buffer.byteLength(expected));
  expect(positions[0]).toBe(0);
  expect(positions.length).toBeGreaterThan(1);
  expect(positions[1]).toBe(7);
}));
test('record no sigue el pathname sustituido entre lectura y escritura: mantiene el descriptor original', () => reportDirectory(directory => {
  const file = path.join(directory, 'android16k.json'), original = path.join(directory, 'original.json');
  fs.writeFileSync(file, JSON.stringify({ source: 'original' }));
  const read = fs.readFileSync;
  let swapped = false;
  jest.spyOn(fs, 'readFileSync').mockImplementation((target, ...args) => {
    const value = read(target, ...args);
    if (typeof target === 'number' && !swapped) {
      fs.renameSync(file, original);
      fs.writeFileSync(file, 'replacement-must-stay-untouched');
      swapped = true;
    }
    return value;
  });
  record({ stage: 'updated' }, directory);
  expect(swapped).toBe(true);
  expect(read(file, 'utf8')).toBe('replacement-must-stay-untouched');
  expect(JSON.parse(read(original, 'utf8'))).toEqual({ source: 'original', stage: 'updated' });
}));
test.each(['readFileSync', 'writeSync', 'ftruncateSync'])('record cierra el descriptor ante error de %s y propaga el error', method => reportDirectory(directory => {
  const failure = Object.assign(new Error('REPORT_IO_FAILURE'), { code: 'EIO' });
  const close = jest.spyOn(fs, 'closeSync');
  jest.spyOn(fs, method).mockImplementationOnce(() => { throw failure; });
  expect(() => record({ outcome: 'passed' }, directory)).toThrow(failure);
  expect(close).toHaveBeenCalledTimes(1);
  expect(() => fs.fstatSync(close.mock.calls[0][0])).toThrow();
}));
test('record cierra también ante JSON malformado y no sobrescribe evidencia ilegible', () => reportDirectory(directory => {
  const file = path.join(directory, 'android16k.json'); fs.writeFileSync(file, '{malformed');
  const close = jest.spyOn(fs, 'closeSync');
  expect(() => record({ outcome: 'passed' }, directory)).toThrow(SyntaxError);
  expect(close).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(file, 'utf8')).toBe('{malformed');
}));
test('record falla si writeSync no progresa y libera el descriptor', () => reportDirectory(directory => {
  const close = jest.spyOn(fs, 'closeSync');
  jest.spyOn(fs, 'writeSync').mockReturnValueOnce(0);
  expect(() => record({ outcome: 'passed' }, directory)).toThrow('REPORT_WRITE_INCOMPLETE');
  expect(close).toHaveBeenCalledTimes(1);
}));
test('record propaga ENOENT al abrir sin intentar cerrar un descriptor inexistente', () => reportDirectory(directory => {
  const close = jest.spyOn(fs, 'closeSync');
  const failure = Object.assign(new Error('folder disappeared'), { code: 'ENOENT' });
  jest.spyOn(fs, 'openSync').mockImplementationOnce(() => { throw failure; });
  expect(() => record({ stage: 'prepared' }, directory)).toThrow(failure);
  expect(close).not.toHaveBeenCalled();
}));
test.each([false, true])('record propaga fallo de cierre y preserva un error previo si existe: %s', priorError => reportDirectory(directory => {
  const writeError = new Error('WRITE_FAILED'), closeError = new Error('CLOSE_FAILED');
  const close = fs.closeSync;
  const closed = jest.spyOn(fs, 'closeSync').mockImplementation(fd => { close(fd); throw closeError; });
  if (priorError) jest.spyOn(fs, 'writeSync').mockImplementationOnce(() => { throw writeError; });
  expect(() => record({ outcome: 'passed' }, directory)).toThrow(priorError ? writeError : closeError);
  expect(closed).toHaveBeenCalledTimes(1);
  expect(() => fs.fstatSync(closed.mock.calls[0][0])).toThrow();
}));

test.each([
  ['dependency_config', { code: 1, stderr: 'Failed to resolve plugin for module "expo-router".' }, 1],
  ['dependency_config', { code: 'ENOENT', message: 'CLI executable missing' }, null],
  ['dependency_config', { code: 1, stderr: 'Cannot find module expo-secure-store' }, 1],
  ['authentication', { code: 1, stderr: 'Invalid access token' }, 1],
  ['authentication', { code: 1, stderr: 'HTTP 401 Unauthorized' }, 1],
  ['network', { code: 'ENOTFOUND', message: 'getaddrinfo failure' }, null],
  ['network', { code: 1, stderr: 'request failed: getaddrinfo ENOTFOUND' }, 1],
  ['network', { code: 1, stderr: 'fetch failed: socket hang up' }, 1],
  ['unknown', { code: 2, stderr: 'Unexpected CLI state' }, 2],
  ['unknown', { code: 'untrusted-text', stdout: 'Unexpected output' }, null],
  ['unknown', null, null],
])('clasifica el fallo EAS como %s sin propagar salida externa', (category, error, exitCode) => {
  expect(classifyEasFailure(error)).toEqual({ category, exitCode });
});
test('build:view conserva categoría y exitCode; no expone URL firmada, tokens, stdout ni stderr', async () => {
  const raw = Object.assign(new Error('Failed to resolve plugin; private-message-value'), { code: 1,
    stderr: 'private-token-value https://private.invalid/artifact.apk?token=private-signature-value',
    stdout: 'private-stdout-value', cause: 'private-cause-value' });
  let captured;
  try { await viewBuild(jest.fn().mockRejectedValue(raw), { EXPO_TOKEN: 'private-env-token-value' }); }
  catch (error) { captured = error; }
  expect(captured).toBeInstanceOf(EasReadError);
  expect(captured).toMatchObject({ code: 'EAS_READ_FAILED', category: 'dependency_config', exitCode: 1 });
  const safe = JSON.stringify({ message: captured.message, stack: captured.stack, ...captured });
  for (const text of ['private-message-value', 'private-token-value', 'private.invalid', 'private-signature-value',
    'private-stdout-value', 'private-cause-value', 'private-env-token-value']) expect(safe).not.toContain(text);
  expect(captured.stdout).toBeUndefined(); expect(captured.stderr).toBeUndefined(); expect(captured.cause).toBeUndefined();
  await expect(viewBuild(jest.fn().mockRejectedValue(captured), { EXPO_TOKEN: 'fixture' })).rejects.toBe(captured);
});
test('JSON EAS malformado queda en unknown sin filtrar el contenido de la salida', async () => {
  let captured;
  try { await viewBuild(jest.fn().mockResolvedValue('private-json-content https://private.invalid/'), { EXPO_TOKEN: 'fixture' }); }
  catch (error) { captured = error; }
  expect(captured).toMatchObject({ code: 'EAS_READ_FAILED', category: 'unknown', exitCode: null });
  expect(captured.message).not.toContain('private-json-content');
});

function kvmSimulation({ before, after, cpu = 'flags: vmx', fail } = {}) {
  const ready = { exists: true, characterDevice: true, readable: true, writable: true, openReadWrite: true, error: 'none' };
  return { platform: 'linux', env: { GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux', RUNNER_ENVIRONMENT: 'github-hosted', PINNING_EPHEMERAL_AVD: 'true' },
    read: jest.fn(() => cpu), inspect: jest.fn().mockReturnValueOnce(before || ready).mockReturnValue(after || ready), save: jest.fn(),
    run: jest.fn(async (_file, args) => { if (fail?.(args)) throw new Error('PRIVATE_HOST_OUTPUT_123'); return ''; }) };
}
test('KVM recupera permisos con módulos/udev acotados antes del chmod exacto y apertura real', async () => {
  const options = kvmSimulation({ before: { exists: null, characterDevice: null, readable: false, writable: false, openReadWrite: false, error: 'EACCES' } });
  const report = await prepareKvm(options);
  expect(report.status).toBe('access_ready');
  expect(report.scope).toBe('device-access-only-avd-proves-acceleration');
  expect(report.cpu).toEqual({ vmx: true, svm: false });
  expect(options.run.mock.calls.map(([file, args]) => [file, ...args])).toEqual([
    ['sudo', '-n', 'modprobe', 'kvm'], ['sudo', '-n', 'modprobe', 'kvm_intel'],
    ['sudo', '-n', 'udevadm', 'control', '--reload-rules'], ['sudo', '-n', 'udevadm', 'trigger', '--name-match=/dev/kvm'],
    ['sudo', '-n', 'udevadm', 'settle', '--timeout=15'], ['sudo', '-n', 'chmod', '0666', '--', '/dev/kvm'],
  ]);
  expect(options.run.mock.calls.every(([, , config]) => config.timeout > 0 && config.timeout <= 20000)).toBe(true);
  expect(options.inspect).toHaveBeenCalledTimes(2);
  expect(report.after.openReadWrite).toBe(true);
  expect(report.acceleration).toBeUndefined();
});
test('KVM selecciona AMD sólo cuando svm está visible y no publica cpuinfo ni errores raw', async () => {
  const options = kvmSimulation({ cpu: 'PRIVATE_HOST_OUTPUT_123 flags: svm', fail: args => args.includes('modprobe') });
  const report = await prepareKvm(options);
  expect(options.run.mock.calls.some(([, args]) => args.includes('kvm_amd'))).toBe(true);
  expect(options.run.mock.calls.some(([, args]) => args.includes('kvm_intel'))).toBe(false);
  expect(report.status).toBe('access_ready'); // Un módulo ya integrado puede suministrar el dispositivo.
  expect(JSON.stringify(report)).not.toContain('PRIVATE_HOST_OUTPUT_123');
});
test('KVM puede aparecer tras modprobe pero no inventa módulos CPU sin flags', async () => {
  const options = kvmSimulation({ cpu: '', before: { exists: false, characterDevice: null, readable: false, writable: false, openReadWrite: false, error: 'ENOENT' } });
  expect((await prepareKvm(options)).status).toBe('access_ready');
  expect(options.run.mock.calls.filter(([, args]) => args.includes('modprobe'))).toHaveLength(1);
});
test.each([
  [{ exists: false, characterDevice: null, openReadWrite: false, error: 'ENOENT' }, 'KVM_DEVICE_ABSENT'],
  [{ exists: true, characterDevice: false, openReadWrite: false, error: 'NOT_CHARACTER_DEVICE' }, 'KVM_DEVICE_NOT_CHARACTER'],
  [{ exists: null, characterDevice: null, openReadWrite: false, error: 'EACCES' }, 'KVM_PERMISSION_DENIED'],
  [{ exists: true, characterDevice: true, openReadWrite: false, error: 'EPERM' }, 'KVM_PERMISSION_DENIED'],
  [{ exists: true, characterDevice: true, openReadWrite: false, error: 'OPEN_FAILED' }, 'KVM_DEVICE_OPEN_FAILED'],
])('KVM bloquea con diagnóstico específico del dispositivo %#', async (after, reason) => {
  const options = kvmSimulation({ after });
  await expect(prepareKvm(options)).rejects.toThrow(reason);
  expect(options.save).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'blocked', reason, after }));
});
test('KVM no aplica chmod si udev no termina y mantiene el fallo de preparación', async () => {
  const options = kvmSimulation({ fail: args => args.includes('settle') });
  await expect(prepareKvm(options)).rejects.toThrow('KVM_PREPARATION_FAILED');
  expect(options.run.mock.calls.some(([, args]) => args.includes('chmod'))).toBe(false);
  expect(options.save.mock.calls.at(-1)[0].steps).toContainEqual({ name: 'udev_settle', success: false });
});
test('KVM informa error de chmod aunque el dispositivo siga accesible', async () => {
  const options = kvmSimulation({ fail: args => args.includes('chmod') });
  await expect(prepareKvm(options)).rejects.toThrow('KVM_PREPARATION_FAILED');
});
test.each([{ GITHUB_ACTIONS: 'false' }, { RUNNER_OS: 'Windows' }, { RUNNER_ENVIRONMENT: 'self-hosted' }, { PINNING_EPHEMERAL_AVD: 'false' }])('KVM no cambia hosts fuera del runner efímero %#', async change => {
  const options = kvmSimulation(); options.env = { ...options.env, ...change };
  await expect(prepareKvm(options)).rejects.toThrow('KVM_REQUIRES_EPHEMERAL_HOSTED_LINUX');
  expect(options.run).not.toHaveBeenCalled(); expect(options.inspect).not.toHaveBeenCalled();
});
test('inspección KVM abre/fstat/cierra descriptores y exige un O_RDWR real', () => {
  const open = jest.fn(() => 42), stat = jest.fn(() => ({ isCharacterDevice: () => true })), close = jest.fn();
  expect(kvmDeviceAccess({ open, stat, close })).toEqual({ exists: true, characterDevice: true, readable: true, writable: true, openReadWrite: true, error: 'none' });
  expect(open).toHaveBeenCalledTimes(3); expect(stat).toHaveBeenCalledTimes(3); expect(close).toHaveBeenCalledTimes(3);
  expect(open.mock.calls[2][0]).toBe('/dev/kvm');
  expect(open.mock.calls[2][1] & fs.constants.O_RDWR).toBe(fs.constants.O_RDWR);
  if (fs.constants.O_NOFOLLOW) expect(open.mock.calls[2][1] & fs.constants.O_NOFOLLOW).toBe(fs.constants.O_NOFOLLOW);
});
test('inspección KVM diferencia lectura disponible de escritura denegada sin stat por nombre', () => {
  const open = jest.fn((_file, flags) => { if ((flags & 3) !== fs.constants.O_RDONLY) throw Object.assign(new Error('PRIVATE_HOST_OUTPUT_123'), { code: 'EACCES' }); return 42; });
  const close = jest.fn();
  expect(kvmDeviceAccess({ open, stat: () => ({ isCharacterDevice: () => true }), close }))
    .toEqual({ exists: true, characterDevice: true, readable: true, writable: false, openReadWrite: false, error: 'EACCES' });
  expect(close).toHaveBeenCalledTimes(1);
});
test('inspección KVM no infiere dispositivo ausente de un error de permisos y no filtra detalles', () => {
  const inspect = code => kvmDeviceAccess({ open: () => { throw Object.assign(new Error('PRIVATE_HOST_OUTPUT_123'), { code }); } });
  expect(inspect('ENOENT')).toMatchObject({ exists: false, characterDevice: null, openReadWrite: false, error: 'ENOENT' });
  expect(inspect('EACCES')).toMatchObject({ exists: null, characterDevice: null, error: 'EACCES' });
  expect(JSON.stringify(inspect('unexpected-private-code'))).not.toContain('PRIVATE_HOST_OUTPUT_123');
});
test('inspección KVM cierra ante fstat fallido y bloquea si falla algún cierre', () => {
  const close = jest.fn();
  expect(kvmDeviceAccess({ open: () => 42, stat: () => { throw Error('PRIVATE_HOST_OUTPUT_123'); }, close }))
    .toMatchObject({ openReadWrite: false, error: 'OPEN_FAILED' });
  expect(close).toHaveBeenCalledTimes(3);
  expect(kvmDeviceAccess({ open: () => 42, stat: () => ({ isCharacterDevice: () => true }), close: () => { throw Error('close'); } }))
    .toMatchObject({ openReadWrite: false, error: 'CLOSE_FAILED' });
});

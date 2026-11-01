/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { describe, test, expect } = require('@jest/globals');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');
const { PACKAGE, JADX, manifestEvidence, signatureEvidence, nativeEntries, zipAlignmentEvidence, loadAlignmentEvidence,
  relroEvidence, entrypointClasses, decompiledEvidence, candidateEvidence, inspectionVerdict, tool } = require('../scripts/inspect-android-artifact');
const { validateWorkflows } = require('../scripts/validate-test-configs');
const root = path.resolve(__dirname, '..');
const cleanManifest = { applicationId: PACKAGE, targetSdk: '36\n', debuggable: 'false\n',
  permissions: 'android.permission.INTERNET\nandroid.permission.ACCESS_NETWORK_STATE\n' };
const digest = 'a'.repeat(64);
const verifiedSignature = 'Verifies\nVerified using v1 scheme (JAR signing): false\nVerified using v2 scheme (APK Signature Scheme v2): true\nNumber of signers: 1\nSigner #1 certificate SHA-256 digest: ' + digest + '\n';
const entries = 'AndroidManifest.xml\nclasses.dex\nassets/index.android.bundle\nlib/arm64-v8a/libreactnative.so\nlib/x86_64/libreactnative.so\n';
const load = 'LOAD off 0x0000 vaddr 0x0000 paddr 0x0000 align 2**14\nLOAD off 0x4000 vaddr 0x4000 paddr 0x4000 align 2**16\n';
const headers = 'Program Headers:\n  Type Offset VirtAddr PhysAddr FileSiz MemSiz Flg Align\n  LOAD 0x000000 0x000000 0x000000 0x000100 0x000100 R E 0x4000\n';
function temporary(action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-apk-tests-'));
  try { return action(directory); }
  finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('sport-apk-tests-')) throw new Error('Ruta temporal inesperada.');
    fs.rmSync(directory, { recursive: true });
  }
}

describe('Manifiesto real del APK', () => {
  test('confirma package, target API y debuggable del resultado de apkanalyzer', () => {
    expect(manifestEvidence(cleanManifest)).toEqual({ applicationId: PACKAGE, targetSdk: 36, debuggable: false,
      permissions: ['android.permission.ACCESS_NETWORK_STATE', 'android.permission.INTERNET'] });
  });
  test.each([
    { ...cleanManifest, applicationId: 'com.other.app' }, { ...cleanManifest, targetSdk: '35' },
    { ...cleanManifest, targetSdk: '' }, { ...cleanManifest, targetSdk: '36-preview' },
    { ...cleanManifest, debuggable: 'true' }, { ...cleanManifest, debuggable: '' },
    { ...cleanManifest, permissions: 'unrecognized: output' },
  ])('un manifiesto incompleto o fuera del requisito no aprueba %#', value => {
    expect(() => manifestEvidence(value)).toThrow();
  });
  test.each(['SYSTEM_ALERT_WINDOW', 'VIBRATE', 'CAMERA', 'RECORD_AUDIO', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE',
    'MANAGE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_AUDIO', 'READ_MEDIA_VISUAL_USER_SELECTED'])(
    'rechaza permiso innecesario %s', permission => {
      expect(() => manifestEvidence({ ...cleanManifest, permissions: cleanManifest.permissions + 'android.permission.' + permission })).toThrow('permisos');
    });
});

describe('Firma, procedencia y ABI de la candidata', () => {
  test('conserva solamente huellas públicas y esquemas verificados por apksigner', () => {
    expect(signatureEvidence(verifiedSignature)).toMatchObject({ verified: true, certificateSha256: [digest], schemes: ['v2'], signers: 1 });
  });
  test.each(['', verifiedSignature.replace('Verifies', 'DOES NOT VERIFY'),
    verifiedSignature.replace('true', 'false'), verifiedSignature.replace(digest, 'bad'),
    verifiedSignature.replace('Number of signers: 1', 'Number of signers: 0')])('no infiere una firma verificada de una salida inválida %#', output => {
    expect(() => signatureEvidence(output)).toThrow();
  });
  test('usa las librerías reales de las ABI64 y registra presencia del bundle JS/Hermes', () => {
    expect(nativeEntries(entries)).toMatchObject({ abis: ['arm64-v8a', 'x86_64'], libraries64: ['lib/arm64-v8a/libreactnative.so', 'lib/x86_64/libreactnative.so'],
      javascriptBundles: ['assets/index.android.bundle'] });
  });
  test.each(['', 'classes.dex\n', 'AndroidManifest.xml\nlib/armeabi-v7a/library.so\n',
    'AndroidManifest.xml\nlib/x86/library.so\nlib/arm64-v8a/library.so\n', entries + '../escape.so\n', entries + 'classes.dex\n'])(
    'no acredita ABI64 con datos ausentes o entradas inválidas %#', output => { expect(() => nativeEntries(output)).toThrow(); });
  test('la inspección usa el SHA256 y commit de la misma descarga EAS', () => {
    const metadata = { buildId: 'build-id', commit: 'b'.repeat(40), sha256: digest };
    expect(candidateEvidence(metadata, digest, metadata.commit)).toEqual(metadata);
    expect(() => candidateEvidence(metadata, 'c'.repeat(64), metadata.commit)).toThrow('huella');
    expect(() => candidateEvidence(metadata, digest, 'd'.repeat(40))).toThrow('commit');
    expect(() => candidateEvidence({}, digest)).toThrow('procedencia');
  });
});

describe('Alineación real de 16 KB', () => {
  test('zipalign requiere su confirmación explícita', () => {
    expect(zipAlignmentEvidence('Verifying alignment...\nVerification successful\n')).toMatchObject({ verified: true, pageSize: 16384 });
    expect(() => zipAlignmentEvidence('Verification FAILED')).toThrow();
    expect(() => zipAlignmentEvidence('')).toThrow();
  });
  test('comprueba todos los segmentos LOAD, no sólo el primero', () => {
    expect(loadAlignmentEvidence(load)).toEqual({ loadSegments: 2, minimumAlignment: 16384 });
    expect(() => loadAlignmentEvidence(load.replace('2**16', '2**12'))).toThrow('inferior');
  });
  test.each(['', 'LOAD missing alignment', 'LOAD align 2**13', 'LOAD align 2**NaN'])('ELF ausente o inválido no aprueba %#', output => {
    expect(() => loadAlignmentEvidence(output)).toThrow();
  });
  test('RELRO compartido exige final alineado; sin RELRO es compatible por este criterio', () => {
    const shared = 'Program Headers:\n  LOAD 0x0cfaf0 0x000dfaf0 0x000dfaf0 0x03510 0x03510 RW 0x4000\n';
    expect(relroEvidence(shared + '  GNU_RELRO 0x0cfaf0 0x000dfaf0 0x000dfaf0 0x01510 0x00510 R 0x1\n'))
      .toMatchObject({ relroSegments: 1, endpointsAligned: true, dedicatedLoadExceptions: 0, compatible16KB: true });
    expect(() => relroEvidence(shared + '  GNU_RELRO 0x0cfaf0 0x000dfaf0 0x000dfaf0 0x01510 0x01510 R 0x1\n')).toThrow('compartido');
    expect(relroEvidence(headers).relroSegments).toBe(0);
    expect(() => relroEvidence('')).toThrow();
  });
  test('acepta el contraejemplo oficial: RELRO ocupa su LOAD y el siguiente writable inicia en otra página', () => {
    const official = 'Program Headers:\n'
      + '  LOAD 0x000000 0x0000000000000000 0x0000000000000000 0x000680 0x000680 R E 0x4000\n'
      + '  LOAD 0x000680 0x0000000000004680 0x0000000000004680 0x0001d8 0x000980 RW 0x4000\n'
      + '  LOAD 0x004000 0x0000000000008000 0x0000000000008000 0x000100 0x000200 RW 0x4000\n'
      + '  GNU_RELRO 0x000680 0x0000000000004680 0x0000000000004680 0x0001d8 0x000980 R 0x1\n';
    expect(relroEvidence(official)).toEqual({ relroSegments: 1, endpointsAligned: false, dedicatedLoadExceptions: 1, compatible16KB: true });
    expect(() => relroEvidence(official.replace('0x0000000000008000 0x0000000000008000', '0x0000000000006000 0x0000000000006000')))
      .toThrow('invade');
  });
  test('RELRO fuera de LOAD y encabezados malformados conservan el bloqueo', () => {
    expect(() => relroEvidence(headers + '  GNU_RELRO 0x0 0x4000 0x4000 0x100 0x100 R 0x1\n')).toThrow('contenido');
    expect(() => relroEvidence(headers + '  GNU_RELRO broken\n')).toThrow('interpretable');
  });
});

describe('JADX acotado y límites honestos', () => {
  test('el release oficial queda fijado por versión, URL y SHA256 conocido', () => {
    expect(JADX).toEqual({ version: '1.5.6', url: 'https://github.com/skylot/jadx/releases/download/v1.5.6/jadx-1.5.6.zip',
      sha256: '545ea2be9c242511bc145755cf4bda2485ade42966e096f8b4d3da2a230e8974' });
  });
  test('selecciona máximo dos entrypoints del package y omite componentes de terceros', () => {
    expect(entrypointClasses('<manifest><application android:name=".MainApplication"><activity android:name="com.other.Library"/><activity android:name=".MainActivity"/><activity android:name=".Other"/></application></manifest>'))
      .toEqual([PACKAGE + '.MainApplication', PACKAGE + '.MainActivity']);
    expect(() => entrypointClasses('<manifest><application android:name="com.other.Library"/></manifest>')).toThrow();
  });
  test('demuestra código observable sin conservar literales ni fuentes en el informe', () => {
    const source = 'package ' + PACKAGE + '; public class MainActivity { String name = "observable"; }';
    const evidence = decompiledEvidence(PACKAGE + '.MainActivity', source);
    expect(evidence.visibleStringLiterals).toBe(1); expect(evidence.sourceSha256).toHaveLength(64);
    expect(JSON.stringify(evidence)).not.toContain('observable');
    expect(() => decompiledEvidence('MainActivity', '')).toThrow();
    expect(() => decompiledEvidence('MainActivity', source + '// JADX ERROR')).toThrow();
  });
});

describe('Fallos de herramienta, ausencia de APK y omisiones', () => {
  test('conserva fallos de salida y no publica stderr de herramientas', async () => {
    await expect(tool(process.execPath, ['-e', 'process.stderr.write("sensitive-fixture"); process.exit(9)']))
      .rejects.toThrow('salida 9');
    try { await tool(process.execPath, ['-e', 'process.stderr.write("sensitive-fixture"); process.exit(9)']); }
    catch (error) { expect(error.message).not.toContain('sensitive-fixture'); }
  });
  test('timeout de una herramienta no se convierte en aprobación', async () => {
    await expect(tool(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 50 })).rejects.toThrow('timeout');
  });
  test('ninguna comprobación ausente, fallida u omitida equivale a aprobada', () => {
    const names = ['candidate', 'signature', 'manifest', 'abi', 'zipalign', 'elf', 'jadx'];
    const passed = Object.fromEntries(names.map(name => [name, { status: 'passed' }]));
    expect(inspectionVerdict(passed)).toBe('passed_for_static_scope');
    for (const name of names) for (const status of ['failed', 'not_run', undefined]) {
      expect(inspectionVerdict({ ...passed, [name]: status ? { status } : undefined })).toBe('blocked');
    }
    expect(inspectionVerdict({})).toBe('blocked');
  });
  test('CLI sin APK escribe informe bloqueado y devuelve exit 1 sin ejecutar herramientas ni descargas', () => temporary(directory => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/inspect-android-artifact.js')], {
      cwd: directory, env: { ...process.env, RUNNER_TEMP: directory, GITHUB_STEP_SUMMARY: path.join(directory, 'summary.md') }, encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'test-results/android-inspection.json'), 'utf8'));
    expect(report.status).toBe('blocked'); expect(report.error).toContain('APK no disponible');
    expect(Object.values(report.checks).every(check => check.status === 'not_run')).toBe(true);
    expect(fs.readFileSync(path.join(directory, 'test-results/android-inspection.txt'), 'utf8')).toContain('No acredita');
  }));
});

function workflows() {
  return new Map(['ci.yml', 'api-android.yml', 'performance.yml', 'security.yml'].map(file =>
    [file, YAML.parse(fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8'))]));
}
describe('Inspección obligatoria en la candidata Android', () => {
  test.each([
    config => { config.jobs.android.steps = config.jobs.android.steps.filter(step => step.id !== 'artifact_inspection'); },
    config => { config.jobs.android.steps.find(step => step.id === 'artifact_inspection').if = 'false'; },
    config => { const step = config.jobs.android.steps.find(step => step.id === 'artifact_inspection'); config.jobs.android.steps = [step, ...config.jobs.android.steps.filter(value => value !== step)]; },
    config => { config.jobs.android.steps.find(step => step.id === 'artifact_inspection')['continue-on-error'] = true; },
    config => { const artifact = config.jobs.android.steps.find(step => step.uses?.startsWith('actions/upload-artifact@')); artifact.with.path = artifact.with.path.replace('test-results/android-inspection.json', ''); },
  ])('detecta inspección omitida, anterior a la descarga o fallos encubiertos %#', mutate => {
    const config = workflows(); mutate(config.get('api-android.yml')); expect(() => validateWorkflows(config)).toThrow();
  });
});

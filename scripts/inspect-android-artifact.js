const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Transform, Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const execute = promisify(execFile);
const { resolveSourceContext } = require('./android-source-context');
const PACKAGE = 'com.markadw.sportcenter';
const JADX = Object.freeze({ version: '1.5.6',
  url: 'https://github.com/skylot/jadx/releases/download/v1.5.6/jadx-1.5.6.zip',
  sha256: '545ea2be9c242511bc145755cf4bda2485ade42966e096f8b4d3da2a230e8974' });
const REQUIRED = ['candidate', 'signature', 'manifest', 'abi', 'zipalign', 'elf', 'jadx'];
const prohibited = /^(?:android\.permission\.(?:SYSTEM_ALERT_WINDOW|VIBRATE|CAMERA|CAMERA_DISABLE_TRANSMIT_LED|SYSTEM_CAMERA|RECORD_AUDIO|CAPTURE_AUDIO_OUTPUT|CAPTURE_MEDIA_OUTPUT|MODIFY_AUDIO_SETTINGS|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|MANAGE_MEDIA|MEDIA_CONTENT_CONTROL|ACCESS_MEDIA_LOCATION|READ_MEDIA_[A-Z_]+))$/;

function manifestEvidence({ applicationId, targetSdk, debuggable, permissions }) {
  assert.equal(applicationId.trim(), PACKAGE, 'El identificador del APK no corresponde a Sport Center.');
  assert.ok(/^\d+$/.test(targetSdk.trim()), 'Falta un target SDK numérico en el APK.');
  const target = Number(targetSdk.trim());
  assert.ok(Number.isSafeInteger(target) && target >= 36, 'El APK debe apuntar a Android API 36 o superior.');
  assert.equal(debuggable.trim(), 'false', 'El APK release debe tener debuggable=false.');
  const values = permissions.trim() ? permissions.trim().split(/\r?\n/).map(value => value.trim()) : [];
  assert.ok(values.every(value => /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+$/.test(value)), 'Informe de permisos inválido.');
  const forbidden = values.filter(value => prohibited.test(value));
  assert.equal(forbidden.length, 0, 'El APK solicita permisos ajenos a las funciones de Sport Center: ' + forbidden.join(', '));
  return { applicationId: PACKAGE, targetSdk: target, debuggable: false, permissions: [...new Set(values)].sort() };
}
function signatureEvidence(output) {
  assert.ok(/^Verifies\s*$/m.test(output) && !/^DOES NOT VERIFY\b/m.test(output), 'apksigner no confirmó la firma.');
  const counts = [...output.matchAll(/^Number of signers:\s*(\d+)\s*$/gm)];
  const signers = counts.length === 1 ? Number(counts[0][1]) : 0;
  assert.ok(Number.isSafeInteger(signers) && signers > 0 && signers <= 16, 'Falta evidencia de firmantes del APK.');
  const schemes = [...output.matchAll(/^Verified using (v[\d.]+) scheme[^\r\n]*:\s*true\s*$/gm)].map(match => match[1]);
  assert.ok(schemes.some(value => ['v2', 'v3', 'v3.1'].includes(value)), 'Falta una firma APK v2 o v3 válida.');
  const certificates = new Map();
  // SDK anteriores: Signer #1; Build Tools 37: V2 Signer. Nunca aceptar la huella de public key.
  for (const match of output.matchAll(/^(?:Signer #([1-9]\d*) certificate|V(?:2|3(?:\.1)?) Signer(?: #([1-9]\d*))?: certificate) SHA-256 digest:\s*([a-fA-F0-9]{64})\s*$/gm)) {
    assert.ok(match[1] || match[2] || signers === 1, 'Firmante sin índice ambiguo.');
    const index = Number(match[1] || match[2] || 1), digest = match[3].toLowerCase();
    assert.ok(index <= signers && (!certificates.has(index) || certificates.get(index) === digest), 'Huellas de firmantes contradictorias.');
    certificates.set(index, digest);
  }
  assert.equal(certificates.size, signers, 'Faltan las huellas públicas de los certificados.');
  return { verified: true, signers, certificateSha256: [...new Set(certificates.values())].sort(), schemes,
    scope: 'Integridad y esquemas de firma del APK; la identidad del certificado no se compara con una huella de publicación preaprobada.' };
}
function nativeEntries(output) {
  const entries = output.split(/\r?\n/).filter(Boolean);
  assert.ok(entries.length > 0 && entries.includes('AndroidManifest.xml'), 'El archivo no contiene un manifiesto APK.');
  const native = entries.filter(name => /^lib\/[^/]+\/[^/]+\.so$/.test(name));
  assert.ok(!entries.some(name => name.includes('..') || name.startsWith('/') || name.includes('\\')), 'Entradas de APK no seguras.');
  assert.equal(new Set(entries).size, entries.length, 'El APK contiene entradas duplicadas.');
  const abis = [...new Set(native.map(name => name.split('/')[1]))].sort();
  assert.ok(abis.includes('arm64-v8a') || abis.includes('x86_64'), 'No se encontraron librerías de una ABI de 64 bits.');
  if (abis.includes('armeabi-v7a')) assert.ok(abis.includes('arm64-v8a'), 'Falta arm64-v8a para la ABI ARM de 32 bits.');
  if (abis.includes('x86')) assert.ok(abis.includes('x86_64'), 'Falta x86_64 para la ABI x86 de 32 bits.');
  return { entries, native, abis, libraries64: native.filter(name => /^lib\/(arm64-v8a|x86_64)\//.test(name)),
    javascriptBundles: entries.filter(name => /^assets\/.*(?:\.bundle|\.hbc|\.jsbundle)$/.test(name)).slice(0, 10) };
}
function zipAlignmentEvidence(output) {
  assert.ok(/^Verification successful\s*$/m.test(output), 'zipalign no confirmó alineación de 16 KB.');
  return { pageSize: 16384, alignment: 4, verified: true };
}
function loadAlignmentEvidence(output) {
  const loads = output.split(/\r?\n/).filter(line => /^\s*LOAD\s/.test(line));
  assert.ok(loads.length > 0, 'Faltan segmentos ELF LOAD.');
  const powers = loads.map(line => {
    const match = line.match(/\balign\s+2\*\*(\d+)\s*$/);
    assert.ok(match, 'Alineación ELF LOAD no interpretable.');
    const power = Number(match[1]);
    assert.ok(Number.isInteger(power) && power >= 14 && power <= 30, 'Un segmento ELF LOAD tiene alineación inferior a 16 KB o no válida.');
    return power;
  });
  return { loadSegments: powers.length, minimumAlignment: 2 ** Math.min(...powers) };
}
function relroEvidence(output) {
  assert.ok(/Program Headers:/.test(output) && /^\s*LOAD\s/m.test(output), 'Faltan encabezados ELF verificables.');
  function segment(line) {
    const columns = line.trim().split(/\s+/);
    assert.ok(columns.length >= 7 && columns.slice(1, 6).every(value => /^0x[0-9a-f]+$/i.test(value))
      && /^0x[0-9a-f]+$/i.test(columns.at(-1)), 'Segmento ELF no interpretable.');
    const flags = columns.slice(6, -1).join('');
    assert.ok(/^[RWE]*$/.test(flags), 'Flags ELF no interpretables.');
    return { start: BigInt(columns[2]), size: BigInt(columns[5]), writable: flags.includes('W') };
  }
  const loads = output.split(/\r?\n/).filter(line => /^\s*LOAD\s/.test(line)).map(segment);
  const segments = output.split(/\r?\n/).filter(line => /^\s*GNU_RELRO\s/.test(line)).map(segment);
  return relroGeometryEvidence(loads, segments);
}
function relroGeometryEvidence(loads, segments) {
  let dedicatedLoadExceptions = 0;
  const roundPage = value => ((value + 0x3fffn) / 0x4000n) * 0x4000n;
  for (const relro of segments) {
    const end = relro.start + relro.size;
    const containing = loads.filter(load => load.start <= relro.start && load.start + load.size >= end);
    const dedicated = loads.filter(load => load.start === relro.start && load.size > 0n
      && load.start + load.size <= end && end <= roundPage(load.start + load.size));
    assert.ok(containing.length || dedicated.length, 'El segmento RELRO no está contenido en un LOAD verificable ni en su padding de página.');
    const partial = end % 0x4000n !== 0n || containing.length === 0;
    assert.ok(!partial || dedicated.length === 1, 'El final del segmento GNU_RELRO compartido no está alineado a 16 KB.');
    const owner = partial ? dedicated[0] : containing[0];
    const protectedStart = relro.start - (relro.start % 0x4000n), protectedEnd = roundPage(end);
    // Bionic mapea LOAD y protege GNU_RELRO con page_start/page_end. Sólo se permite
    // padding del LOAD dedicado, sin bytes de otro LOAD RW en la página protegida.
    assert.ok(!loads.some(load => load !== owner && load.writable && load.size > 0n && load.start < protectedEnd
      && load.start + load.size > protectedStart), 'La protección del LOAD RELRO invade otro LOAD escribible.');
    if (partial) dedicatedLoadExceptions += 1;
  }
  return { relroSegments: segments.length, endpointsAligned: segments.every(relro => (relro.start + relro.size) % 0x4000n === 0n),
    dedicatedLoadExceptions, compatible16KB: true };
}
function entrypointClasses(xml) {
  assert.ok(/<manifest\b/.test(xml) && /<application\b/.test(xml), 'No se pudo leer el manifiesto decodificado.');
  const tags = xml.match(/<(?:application|activity)\b[^>]*>/g) || [];
  const names = tags.flatMap(tag => {
    const attribute = tag.match(/\bandroid:name\s*=\s*(?:"([^"]+)"|'([^']+)')/);
    if (!attribute) return [];
    let name = attribute[1] || attribute[2];
    if (name.startsWith('.')) name = PACKAGE + name;
    else if (!name.includes('.')) name = PACKAGE + '.' + name;
    return name.startsWith(PACKAGE + '.') && /^(?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*$/.test(name) ? [name] : [];
  });
  const selected = [...new Set(names)].slice(0, 2);
  assert.ok(selected.length > 0, 'No se encontraron entrypoints del package para inspección acotada con JADX.');
  return selected;
}
function decompiledEvidence(name, source) {
  assert.ok(typeof source === 'string' && source.length > 20 && /\b(?:class|interface|enum|record)\s+[A-Za-z_$]/.test(source), 'JADX no generó una clase legible.');
  assert.ok(!/JADX ERROR|Method not decompiled/.test(source), 'JADX dejó errores de descompilación en la clase seleccionada.');
  return { name, sourceBytes: Buffer.byteLength(source), sourceSha256: createHash('sha256').update(source).digest('hex'),
    visibleStringLiterals: [...source.matchAll(/"(?:\\.|[^"\\])*"/g)].length };
}
function candidateEvidence(metadata, actualSha256, commit, context) {
  assert.ok(metadata && /^[a-f0-9]{64}$/.test(metadata.sha256 || '') && /^[a-f0-9]{40}$/.test(metadata.commit || ''), 'Falta la procedencia del APK candidato.');
  assert.equal(metadata.sha256, actualSha256, 'La huella del APK cambió después de descargarlo.');
  if (commit) assert.equal(metadata.commit, commit, 'El APK no corresponde al commit del job.');
  assert.ok(typeof metadata.buildId === 'string' && metadata.buildId.trim(), 'Falta el ID del build EAS.');
  return { buildId: metadata.buildId, commit: metadata.commit, sha256: actualSha256,
    ...(context?.revalidation ? { artifactSourceCommit: context.artifactSourceCommit, automationCommit: context.automationCommit } : {}) };
}
function inspectionVerdict(checks) {
  return REQUIRED.every(name => checks[name]?.status === 'passed') ? 'passed_for_static_scope' : 'blocked';
}
function versions(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => /^\d+(?:\.\d+)+$/.test(name))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
}
const COMMAND_LINE_TOOLS = Object.freeze({ version: '23.0', jars: Object.freeze({
  'lib/apkparser/cli/analyzer-cli.jar': '28b1fab252938439e6bfe3121dfe47598d45f16775e33a66c7f06b52c8bddff4',
  'lib/apkparser/tools.binary-resources.jar': '7e4c2ff34cac9bb1bccbcda15d796a300c3e2a85462419fcce412a62b1119f62',
}) });
function commandLineToolsEvidence(properties, hashes) {
  assert.ok(typeof properties === 'string', 'CMDLINE_TOOLS_PROPERTIES_REQUIRED');
  const versions = properties.split(/\r?\n/).filter(line => /^Pkg\.Revision\s*=/.test(line));
  assert.ok(versions.length === 1 && /^Pkg\.Revision\s*=\s*23\.0\s*$/.test(versions[0]), 'CMDLINE_TOOLS_VERSION_MISMATCH');
  assert.ok(hashes && Object.keys(hashes).length === 2, 'CMDLINE_TOOLS_JARS_REQUIRED');
  for (const [file, hash] of Object.entries(COMMAND_LINE_TOOLS.jars)) assert.ok(hashes[file] === hash, 'CMDLINE_TOOLS_JAR_HASH_MISMATCH');
  return { version: COMMAND_LINE_TOOLS.version, jars: { ...hashes } };
}
function pinnedAnalyzerEvidence(analyzer) {
  assert.ok(typeof analyzer === 'string' && path.isAbsolute(analyzer), 'CMDLINE_TOOLS_ANALYZER_REQUIRED');
  const directory = path.dirname(path.dirname(analyzer));
  let properties, hashes;
  try {
    properties = fs.readFileSync(path.join(directory, 'source.properties'), 'utf8');
    hashes = Object.fromEntries(Object.keys(COMMAND_LINE_TOOLS.jars).map(file =>
      [file, createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex')]));
  } catch { throw new Error('CMDLINE_TOOLS_FILES_UNAVAILABLE'); }
  return commandLineToolsEvidence(properties, hashes);
}
function selectApkanalyzer(sdk, override) {
  if (override) {
    assert.ok(typeof override === 'string' && path.isAbsolute(override) && fs.existsSync(override), 'APKANALYZER_OVERRIDE_UNAVAILABLE');
    return override;
  }
  const directories = ['latest', ...versions(path.join(sdk, 'cmdline-tools'))];
  const analyzer = directories.map(value => path.join(sdk, 'cmdline-tools', value, 'bin', 'apkanalyzer')).find(file => fs.existsSync(file));
  assert.ok(analyzer, 'Falta cmdline-tools/bin/apkanalyzer del SDK Android.');
  return analyzer;
}
function verifyTools23(env = process.env) {
  const evidence = pinnedAnalyzerEvidence(env.APKANALYZER);
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/android-command-line-tools.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log('Command-line Tools ' + evidence.version + ': revisión y dos JAR SHA256 verificados.');
  return evidence;
}
function androidTools(env) {
  assert.equal(process.platform, 'linux', 'La inspección de herramientas nativas requiere el runner Linux configurado.');
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  assert.ok(sdk && fs.existsSync(sdk), 'Falta ANDROID_HOME o ANDROID_SDK_ROOT.');
  const buildVersion = versions(path.join(sdk, 'build-tools')).find(value => Number(value.split('.')[0]) >= 35
    && ['apksigner', 'zipalign'].every(tool => fs.existsSync(path.join(sdk, 'build-tools', value, tool))));
  assert.ok(buildVersion, 'Se requieren Android SDK Build-Tools 35 o superiores.');
  const analyzer = selectApkanalyzer(sdk, env.APKANALYZER);
  const commandLineTools = env.APKANALYZER ? pinnedAnalyzerEvidence(analyzer) : undefined;
  const ndkVersion = versions(path.join(sdk, 'ndk')).find(value =>
    ['llvm-objdump', 'llvm-readelf'].every(tool => fs.existsSync(path.join(sdk, 'ndk', value, 'toolchains', 'llvm', 'prebuilt', 'linux-x86_64', 'bin', tool))));
  assert.ok(ndkVersion, 'Faltan llvm-objdump y llvm-readelf del NDK Android.');
  const build = path.join(sdk, 'build-tools', buildVersion), llvm = path.join(sdk, 'ndk', ndkVersion, 'toolchains', 'llvm', 'prebuilt', 'linux-x86_64', 'bin');
  return { buildVersion, ndkVersion, analyzer, commandLineTools, aapt2: path.join(build, 'aapt2'), signer: path.join(build, 'apksigner'), zipalign: path.join(build, 'zipalign'),
    objdump: path.join(llvm, 'llvm-objdump'), readelf: path.join(llvm, 'llvm-readelf') };
}
async function tool(command, args, options = {}) {
  try {
    const result = await execute(command, args, { encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, ...options });
    return result.stdout;
  } catch (error) {
    // No volcar stderr, argumentos, clases descompiladas ni información de un almacén de claves.
    const reason = error.killed ? 'timeout' : error.code === 'ENOENT' ? 'no disponible' : 'salida ' + (error.code ?? 'desconocida');
    throw new Error(path.basename(command) + ': herramienta fallida (' + reason + ').');
  }
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function jadxTool(scratch) {
  const zip = path.join(scratch, 'jadx.zip'), folder = path.join(scratch, 'jadx');
  const response = await fetch(JADX.url, { signal: AbortSignal.timeout(120000) });
  assert.ok(response.ok && response.body, 'No se pudo descargar el release oficial de JADX.');
  let bytes = 0;
  const limiter = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    callback(bytes > 100 * 1024 * 1024 ? new Error('La descarga de JADX excede el límite.') : null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(zip));
  assert.equal(await sha256(zip), JADX.sha256, 'El SHA256 del release JADX no coincide con el pin.');
  await tool('unzip', ['-q', zip, '-d', folder]);
  const binary = path.join(folder, 'bin', 'jadx');
  assert.ok(fs.existsSync(binary), 'El release de JADX no contiene el CLI esperado.');
  fs.chmodSync(binary, 0o755);
  const version = (await tool(binary, ['--version'])).trim();
  assert.equal(version, JADX.version, 'La versión de JADX no coincide con el pin.');
  return binary;
}
function writeReport(report, env, directory = 'test-results') {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'android-inspection.json'), JSON.stringify(report, null, 2) + '\n');
  const lines = ['## Inspección estática del APK candidato', '', 'Resultado: **' + report.status + '**.', '',
    '| Comprobación | Estado |', '|---|---|', ...REQUIRED.map(name => '| ' + name + ' | ' + report.checks[name].status + ' |'), '',
    ...REQUIRED.filter(name => report.checks[name].error).map(name => name + ': ' + report.checks[name].error), '',
    'JADX ' + JADX.version + ': máximo dos entrypoints del package, 120 segundos por clase, sin recursos ni fuentes adjuntas.',
    'La identidad del certificado no se compara con una huella de publicación preaprobada.',
    'La firma no impide ingeniería inversa. El manifiesto, DEX, clases nativas de arranque, recursos y bundle JS/Hermes siguen siendo observables.',
    'El resultado cubre firma, manifiesto, ABI y alineación estructural. No acredita ejecución en un dispositivo de 16 KB, análisis completo del bundle JS/Hermes ni revisión integral de seguridad.', ''];
  const summary = lines.join('\n');
  fs.writeFileSync(path.join(directory, 'android-inspection.txt'), summary);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
}
async function inspect(env = process.env) {
  const report = { status: 'blocked', package: PACKAGE, generatedAt: new Date().toISOString(),
    checks: Object.fromEntries(REQUIRED.map(name => [name, { status: 'not_run' }])) };
  async function check(name, action) {
    try { const evidence = await action(); report.checks[name] = { status: 'passed', evidence }; return evidence; }
    catch (error) { report.checks[name] = { status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'Comprobación fallida.' }; return null; }
  }
  let scratch;
  const temporaryRoot = path.resolve(env.RUNNER_TEMP || os.tmpdir());
  try {
    const apk = path.join(temporaryRoot, 'sport-center.apk');
    assert.ok(fs.existsSync(apk) && fs.statSync(apk).isFile(), 'APK no disponible: no se acredita inspección.');
    const meta = JSON.parse(fs.readFileSync('test-results/android-build.json', 'utf8'));
    const context = resolveSourceContext(env);
    report.source = context;
    const candidate = await check('candidate', async () => candidateEvidence(meta, await sha256(apk), context.artifactSourceCommit, context));
    assert.ok(candidate, 'No se inspecciona un APK cuya procedencia no coincide con la candidata.');
    const tools = androidTools(env);
    report.tools = { buildTools: tools.buildVersion, ndk: tools.ndkVersion, jadx: JADX, commandLineTools: tools.commandLineTools };
    scratch = fs.mkdtempSync(path.join(temporaryRoot, 'sport-apk-inspection-'));
    await check('signature', async () => signatureEvidence(await tool(tools.signer, ['verify', '--verbose', '--print-certs', apk])));
    await check('manifest', async () => {
      const values = {};
      for (const [key, command] of Object.entries({ applicationId: 'application-id', targetSdk: 'target-sdk', debuggable: 'debuggable', permissions: 'permissions' })) {
        values[key] = await tool(tools.analyzer, ['manifest', command, apk]);
      }
      return manifestEvidence(values);
    });
    const entries = await check('abi', async () => nativeEntries(await tool('unzip', ['-Z1', apk])));
    if (entries) {
      report.checks.abi.evidence = { abis: entries.abis, nativeLibraryCount: entries.native.length, libraries64: entries.libraries64.length, javascriptBundles: entries.javascriptBundles };
    }
    await check('zipalign', async () => zipAlignmentEvidence(await tool(tools.zipalign, ['-c', '-P', '16', '-v', '4', apk])));
    await check('elf', async () => {
      assert.ok(entries?.libraries64.length, 'No hay una lista de librerías64 verificable.');
      const libraries = [];
      for (const [index, entry] of entries.libraries64.entries()) {
        const file = path.join(scratch, 'native-' + index + '.so');
        const bytes = await tool('unzip', ['-p', apk, entry], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
        fs.writeFileSync(file, bytes);
        const load = loadAlignmentEvidence(await tool(tools.objdump, ['-p', file]));
        const relro = relroEvidence(await tool(tools.readelf, ['-Wl', file]));
        libraries.push({ library: entry, ...load, ...relro });
        fs.unlinkSync(file);
      }
      return { scope: 'Todas las librerías arm64-v8a y x86_64 del APK, segmentos LOAD y final GNU_RELRO.', libraries };
    });
    await check('jadx', async () => {
      assert.equal(report.checks.manifest.status, 'passed', 'El manifiesto debe aprobarse antes de seleccionar clases.');
      const classes = entrypointClasses(await tool(tools.analyzer, ['manifest', 'print', apk]));
      const binary = await jadxTool(scratch), evidence = [];
      for (const [index, name] of classes.entries()) {
        const output = path.join(scratch, 'app-class-' + index + '.java');
        await tool(binary, ['--single-class', name, '--single-class-output', output, '--no-res', '--threads-count', '2',
          '--decompilation-mode', 'simple', '--no-debug-info', '--config', 'none', '--log-level', 'error', apk],
        { timeout: 120000, env: { ...env, JAVA_OPTS: '-Xmx1536m' } });
        evidence.push(decompiledEvidence(name, fs.readFileSync(output, 'utf8')));
      }
      return { ...JADX, selectedClasses: evidence, scope: 'Sólo entrypoints nativos seleccionados del package; no interpreta el bundle React Native JS/Hermes.' };
    });
  } catch (error) {
    report.error = error instanceof Error ? error.message.slice(0, 500) : 'No se pudo iniciar la inspección.';
    for (const name of REQUIRED) if (report.checks[name].status === 'not_run') report.checks[name] = { status: 'not_run', error: report.error };
  } finally {
    if (scratch) {
      const resolved = path.resolve(scratch);
      assert.ok(path.dirname(resolved) === temporaryRoot && path.basename(resolved).startsWith('sport-apk-inspection-'), 'Ruta temporal de inspección no segura.');
      fs.rmSync(resolved, { recursive: true });
    }
  }
  report.status = inspectionVerdict(report.checks);
  writeReport(report, env);
  return report;
}
module.exports = { PACKAGE, JADX, manifestEvidence, signatureEvidence, nativeEntries, zipAlignmentEvidence,
  loadAlignmentEvidence, relroEvidence, relroGeometryEvidence, entrypointClasses, decompiledEvidence, candidateEvidence, inspectionVerdict, writeReport, inspect, tool, androidTools, COMMAND_LINE_TOOLS, commandLineToolsEvidence, pinnedAnalyzerEvidence, selectApkanalyzer, verifyTools23 };
if (require.main === module && process.argv[2] === 'verify-tools23') {
  try { verifyTools23(); } catch { console.error('CMDLINE_TOOLS_23_VERIFICATION_FAILED'); process.exitCode = 1; }
}
else if (require.main === module) inspect().then(report => { process.exitCode = report.status === 'passed_for_static_scope' ? 0 : 1; })
  .catch(() => { console.error('Falló la escritura del informe de inspección Android.'); process.exitCode = 1; });

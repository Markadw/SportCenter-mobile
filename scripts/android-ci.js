const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { URL } = require('node:url');

function validateAndroidSetup(app, eas, env) {
  const missing = [];
  if (!env.EXPO_TOKEN) missing.push('secreto EXPO_TOKEN de GitHub');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(app.expo?.extra?.eas?.projectId || '')) {
    missing.push('extra.eas.projectId en app.json');
  }
  if (!/^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(app.expo?.android?.package || '')) {
    missing.push('android.package en app.json');
  }
  if (!env.PRODUCT_NAME?.trim()) missing.push('variable ANDROID_TEST_PRODUCT_NAME de GitHub');
  if (eas.build?.preview?.android?.buildType !== 'apk') missing.push('perfil preview de tipo APK');
  if (!/^[a-f0-9]{40}$/i.test(env.GITHUB_SHA || '')) missing.push('commit de la ejecución');
  if (missing.length) throw new Error(`Android bloqueado: configurar ${missing.join(', ')}.`);
  const target = new URL(env.API_BASE_URL);
  assert.ok(['http:', 'https:'].includes(target.protocol) && !target.username && !target.password
    && !target.search && !target.hash, 'API_BASE_URL debe ser HTTP sin credenciales ni parámetros.');
  return { appId: app.expo.android.package, apiUrl: target.toString().replace(/\/+$/, '') };
}

function selectAndroidBuild(data, commit) {
  assert.ok(Array.isArray(data) && data.length === 1, 'EAS debe devolver un único build Android.');
  const build = data[0];
  assert.equal(build.platform, 'ANDROID', 'La compilación no corresponde a Android.');
  assert.equal(build.status, 'FINISHED', 'La compilación de EAS no terminó correctamente.');
  assert.equal(build.gitCommitHash, commit, 'El APK no corresponde al commit comprobado.');
  const url = new URL(build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl || '');
  assert.ok(url.protocol === 'https:' && !url.username && !url.password && url.pathname.endsWith('.apk'),
    'EAS no devolvió un APK HTTPS instalable.');
  return { id: build.id, url: url.toString(), commit };
}

function assertAndroidReport(xml) {
  const cases = xml.match(/<testcase(?:\s|>)/g) || [];
  assert.ok(cases.length >= 2, 'Maestro debe ejecutar al menos los dos flujos de aceptación.');
  assert.ok(!/<(?:failure|error)\b/.test(xml), 'El informe de aceptación contiene fallos.');
  assert.ok(!/<skipped\b/.test(xml), 'Un flujo omitido no acredita aceptación.');
  return cases.length;
}

async function main(mode) {
  if (mode === 'prepare') {
    const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
    const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
    const config = validateAndroidSetup(app, eas, process.env);
    fs.mkdirSync('test-results', { recursive: true });
    // Sólo cambia la copia de CI: el APK utiliza la misma API que los contratos HTTP.
    eas.build.preview.env = { ...eas.build.preview.env, EXPO_PUBLIC_API_URL: config.apiUrl };
    fs.writeFileSync('eas.json', JSON.stringify(eas, null, 2) + '\n');
    fs.appendFileSync(process.env.GITHUB_ENV, `APP_ID=${config.appId}\n`);
    return;
  }
  if (mode === 'download') {
    const build = selectAndroidBuild(JSON.parse(fs.readFileSync('test-results/eas-build.json', 'utf8')), process.env.GITHUB_SHA);
    const response = await fetch(build.url, { signal: AbortSignal.timeout(120000) });
    assert.ok(response.ok && response.body, 'No se pudo descargar el APK finalizado de EAS.');
    const apkPath = path.join(process.env.RUNNER_TEMP, 'sport-center.apk');
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(apkPath));
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(apkPath)) hash.update(chunk);
    const meta = { buildId: build.id, commit: build.commit, api: process.env.API_BASE_URL,
      sha256: hash.digest('hex'), emulatorApi: 34, maestro: '2.12.0' };
    fs.writeFileSync('test-results/android-build.json', JSON.stringify(meta, null, 2) + '\n');
    if (process.env.GITHUB_OUTPUT) {
      const outputs = { build_id: build.id, commit: build.commit, apk_url: build.url, apk_sha256: meta.sha256 };
      for (const value of Object.values(outputs)) assert.ok(!/[\r\n]/.test(value), 'Salida de APK inválida.');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => key + '=' + value).join('\n') + '\n');
    }
    return;
  }
  if (mode === 'verify') {
    console.log(`Aceptación Android: ${assertAndroidReport(fs.readFileSync('test-results/maestro.xml', 'utf8'))} casos sin fallos.`);
    return;
  }
  if (mode !== 'summary') throw new Error('Usar prepare, download, verify o summary.');
  const meta = fs.existsSync('test-results/android-build.json')
    ? JSON.parse(fs.readFileSync('test-results/android-build.json', 'utf8')) : null;
  const text = [
    '# Compilación y aceptación Android', '',
    `Preparación: **${process.env.PREPARE_OUTCOME || 'sin resultado'}**.`,
    `Build EAS: **${process.env.BUILD_OUTCOME || 'sin resultado'}**.`,
    `Aceptación: **${process.env.ANDROID_OUTCOME || 'sin resultado'}**.`, '',
    meta ? `Build: ${meta.buildId}. Commit: ${meta.commit}. APK SHA256: ${meta.sha256}.`
      : 'No hay APK verificado de esta ejecución. Revisar la primera etapa fallida; no acredita aceptación.',
    '', 'La APK permanece en EAS. Esta etapa no publica en Google Play.', '',
  ].join('\n');
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/android-summary.md', text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  else process.stdout.write(text);
}
module.exports = { validateAndroidSetup, selectAndroidBuild, assertAndroidReport };
if (require.main === module) main(process.argv[2]).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

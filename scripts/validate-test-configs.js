const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

function validateDecoder23(job, beforeIndex, afterIndex = -1) {
  const decoderIndex = job.steps.findIndex(step => step.id === 'command_line_tools');
  const decoder = job.steps[decoderIndex];
  assert.ok(decoderIndex > afterIndex && decoderIndex < beforeIndex && !decoder.if && !decoder['continue-on-error'], 'Decoder23 debe verificarse antes de inspector/preflight');
  assert.equal(decoder['timeout-minutes'], 5);
  assert.ok(decoder.run.includes('"$sdk/cmdline-tools/latest/bin/sdkmanager" --install "cmdline-tools;23.0"'), 'Instalar Command-line Tools23 oficial exacto');
  assert.ok(decoder.run.includes('APKANALYZER="$sdk/cmdline-tools/23.0/bin/apkanalyzer" node scripts/inspect-android-artifact.js verify-tools23'), 'Verificar versión/JAR antes de usar decoder');
  assert.ok(decoder.run.indexOf('verify-tools23') < decoder.run.indexOf('>> "$GITHUB_ENV"')
    && decoder.run.includes('echo "APKANALYZER=$sdk/cmdline-tools/23.0/bin/apkanalyzer" >> "$GITHUB_ENV"'), 'Exportar decoder23 sólo después de verificarlo');
  assert.ok(decoder.run.startsWith('set -euo pipefail\n'), 'Verificación decoder debe detenerse al fallar');
  const evidence = job.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(evidence?.with.path.includes('test-results/android-command-line-tools.json'), 'Falta evidencia versión/JAR decoder');
}

function validateProfilesWorkflow(workflow) {
  const job = workflow.jobs.profiles, result = workflow.jobs.profiles_result;
  assert.ok(job && result, 'Falta validación separada de perfiles');
  assert.equal(job.if, "${{ startsWith(github.ref, 'refs/tags/validation/profiles-') }}");
  assert.deepEqual(job.needs, ['quality', 'security']);
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.equal(job['timeout-minutes'], 60);
  assert.equal(job.env.keep_evidence, 'true');
  assert.equal(job.env.PINNING_EPHEMERAL_AVD, 'true');
  assert.ok(!job.env.EXPO_TOKEN && !job.env.GITHUB_TOKEN && !job.env.GITHUB_SHA && !job.env.GITHUB_REF, 'Tokens sólo en la consulta correspondiente');
  const ordered = ['prepare', 'view', 'download', 'inspect', 'kvm', 'debug34', 'release34', 'api36'];
  let previous = -1;
  for (const mode of ordered) {
    const matches = job.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.run === 'node scripts/android-profiles.js ' + mode
      || step.with?.script === 'node scripts/android-profiles.js ' + mode);
    assert.equal(matches.length, 1, 'Cada fase de perfiles debe ejecutarse exactamente una vez: ' + mode);
    assert.ok(matches[0].index > previous && !matches[0].step['continue-on-error'], 'Fase omitida o fuera de orden: ' + mode);
    if (mode === 'api36' || mode === 'release34') assert.equal(matches[0].step.if, "${{ !cancelled() && steps.inspection.outcome == 'success' && steps.kvm.outcome == 'success' }}", 'API36 conserva prerrequisitos e independencia del resultado API34');
    else assert.ok(!matches[0].step.if, 'Fase de perfiles no puede omitirse: ' + mode);
    previous = matches[0].index;
  }
  const token = job.steps.filter(step => step.env?.EXPO_TOKEN);
  assert.equal(token.length, 1); assert.equal(token[0].run, 'node scripts/android-profiles.js view');
  const githubToken = job.steps.filter(step => step.env?.GITHUB_TOKEN);
  assert.equal(githubToken.length, 1); assert.equal(githubToken[0].run, 'node scripts/android-profiles.js prepare');
  for (const step of job.steps) assert.ok(!step.env?.GITHUB_SHA && !step.env?.GITHUB_REF, 'No sustituir la procedencia');
  const commands = job.steps.map(step => step.run || '').join('\n');
  assert.ok(!/eas-cli[^\n]*\sbuild\s|eas-cli[^\n]*\s(?:submit|update)\b|eas-candidate/.test(commands), 'No crear ni publicar artefactos en la validación de perfiles');
  const inspect = job.steps.findIndex(step => step.run === 'node scripts/android-profiles.js inspect');
  validateDecoder23(job, inspect, job.steps.findIndex(step => step.run === 'node scripts/android-profiles.js download'));
  assert.ok(job.steps.find(step => step.id === 'command_line_tools').run.includes('"build-tools;37.0.0"'));
  assert.equal(job.steps.find(step => step.id === 'kvm')['timeout-minutes'], 2);
  for (const [id, api, target, name] of [['debug34', 34, 'google_apis', 'profiles-debug34'], ['release34', 34, 'google_apis', 'profiles-release34'], ['pages16k', 36, 'google_apis_ps16k', 'profiles16k']]) {
    const step = job.steps.find(item => item.id === id);
    if (id === 'pages16k') validate16kMemory(step);
    else assert.equal(step.with['ram-size'], undefined, 'API34 no cambia RAM');
    assert.equal(step.uses, 'reactivecircus/android-emulator-runner@v2');
    assert.equal(step.with['api-level'], api); assert.equal(step.with.target, target); assert.equal(step.with.arch, 'x86_64');
    assert.equal(step.with['avd-name'], name); assert.equal(step.with['force-avd-creation'], true); assert.equal(step.with['disable-linux-hw-accel'], false);
    assert.ok(step.with['emulator-options'].includes('-accel on') && step.with['emulator-options'].includes('-no-snapshot'));
  }
  assert.ok(!job.steps.some(step => step.with?.script === 'node scripts/android-profiles.js api34'), 'No reutilizar modo API34 mixto');
  assert.equal(new Set(job.steps.filter(step => step.uses === 'reactivecircus/android-emulator-runner@v2').map(step => step.with['avd-name'])).size, 3);
  assert.equal(job.steps.find(step => step.run === 'node scripts/android-profiles.js cleanup')?.if, 'always()');
  assert.equal(job.steps.find(step => step.run === 'node scripts/android-profiles.js summary')?.if, 'always()');
  const artifact = job.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(artifact.with.name, 'android-profiles-evidence');
  assert.ok(!/\.apk|\.aab|\.apks|\.jks|\.pass|private|logcat|eas-private/.test(artifact.with.path));
  for (const file of ['android-profiles-source.json', 'android-profiles.json', 'profiles-development.xml', 'profiles-production.xml', 'profiles-production16k.xml']) {
    assert.ok(artifact.with.path.includes(file), 'Evidencia ausente: ' + file);
  }
  assert.equal(result.name, 'Resultado de Debug y AAB');
  assert.deepEqual(result.needs, ['quality', 'security', 'profiles']);
  assert.equal(result.if, "${{ always() && startsWith(github.ref, 'refs/tags/validation/profiles-') }}");
  const gate = result.steps.find(step => step.run === 'node scripts/android-profiles.js gate');
  assert.ok(gate);
  for (const id of ['quality', 'security', 'profiles']) assert.equal(gate.env['RESULT_' + id.toUpperCase()], '$' + '{{ needs.' + id + '.result }}');
}

function validateReleaseWorkflow(workflow) {
  const job = workflow.jobs.release, result = workflow.jobs.release_result;
  assert.ok(job && result, 'Falta validación Release AAB independiente');
  assert.equal(job.if, "${{ startsWith(github.ref, 'refs/tags/validation/release-') }}", 'Release sólo en su etiqueta explícita');
  assert.deepEqual(job.needs, ['quality', 'security'], 'Release exige calidad y seguridad antes de artefactos');
  assert.equal(job['runs-on'], 'ubuntu-24.04'); assert.equal(job['timeout-minutes'], 60);
  assert.equal(job.env.keep_evidence, 'true'); assert.equal(job.env.PINNING_EPHEMERAL_AVD, 'true');
  for (const key of ['EXPO_TOKEN', 'GITHUB_TOKEN', 'GITHUB_SHA', 'GITHUB_REF']) assert.equal(job.env[key], undefined, 'No ampliar tokens ni sustituir fuente');
  let previous = -1;
  for (const mode of ['prepare', 'view', 'download', 'inspect', 'kvm', 'release34', 'cleanup-avd34', 'api36', 'finish']) {
    const matches = job.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.run === 'node scripts/android-release.js ' + mode
      || step.with?.script === 'node scripts/android-release.js ' + mode);
    assert.equal(matches.length, 1, 'Cada fase Release se ejecuta una vez: ' + mode);
    const { step, index } = matches[0];
    assert.ok(index > previous && !step['continue-on-error'], 'Release sin fases duplicadas, omitidas o desordenadas');
    const conditions = {
      release34: "${{ !cancelled() && steps.inspection.outcome == 'success' && steps.kvm.outcome == 'success' && steps.disk34.outcome == 'success' }}",
      'cleanup-avd34': "${{ !cancelled() && steps.release34.outcome == 'success' }}",
      api36: "${{ !cancelled() && steps.inspection.outcome == 'success' && steps.kvm.outcome == 'success' && steps.avd34_cleanup.outcome == 'success' && steps.disk36.outcome == 'success' }}",
      finish: "${{ !cancelled() && steps.inspection.outcome == 'success' && steps.kvm.outcome == 'success' }}",
    };
    if (conditions[mode]) assert.equal(step.if, conditions[mode], 'Release conserva disco, limpieza y prerrequisitos');
    else assert.ok(!step.if, 'Precondición Release no puede omitirse');
    previous = index;
  }
  const install = job.steps.findIndex(step => step.run === 'npm ci --no-audit --no-fund');
  assert.ok(install > job.steps.findIndex(step => step.run === 'node scripts/android-release.js prepare') &&
    install < job.steps.findIndex(step => step.run === 'node scripts/android-release.js view'), 'Consultar EAS sólo con lockfile instalado');
  const expo = job.steps.filter(step => step.env?.EXPO_TOKEN), github = job.steps.filter(step => step.env?.GITHUB_TOKEN);
  assert.equal(expo.length, 1); assert.equal(expo[0].run, 'node scripts/android-release.js view');
  assert.equal(github.length, 1); assert.equal(github[0].run, 'node scripts/android-release.js prepare');
  for (const step of job.steps) assert.ok(!step.env?.GITHUB_SHA && !step.env?.GITHUB_REF && !step['continue-on-error'], 'Release no sustituye fuente ni oculta fallos');
  const commands = job.steps.map(step => step.run || '').join('\n');
  assert.ok(!/eas-cli[^\n]*\sbuild\s|eas-cli[^\n]*\s(?:submit|update)\b|eas-candidate|android-profiles\.js|debug34/.test(commands), 'Release sólo valida su AAB; no construye ni reutiliza Debug histórico');
  const inspection = job.steps.findIndex(step => step.run === 'node scripts/android-release.js inspect');
  validateDecoder23(job, inspection, job.steps.findIndex(step => step.run === 'node scripts/android-release.js download'));
  assert.ok(job.steps.find(step => step.id === 'command_line_tools').run.includes('"build-tools;37.0.0"'));
  assert.equal(job.steps.find(step => step.id === 'kvm')['timeout-minutes'], 2);
  const diskSteps = job.steps.filter(step => step.run === 'node scripts/prepare-android-disk.cjs');
  assert.equal(diskSteps.length, 2, 'Un preflight de 12 GiB antes de cada AVD Release');
  for (const [id, afterId, beforeId, condition] of [
    ['disk34', 'kvm', 'release34', "${{ !cancelled() && steps.inspection.outcome == 'success' && steps.kvm.outcome == 'success' }}"],
    ['disk36', 'avd34_cleanup', 'pages16k', "${{ !cancelled() && steps.avd34_cleanup.outcome == 'success' }}"],
  ]) {
    const index = job.steps.findIndex(step => step.id === id), step = job.steps[index];
    assert.equal(step?.run, 'node scripts/prepare-android-disk.cjs'); assert.equal(step.if, condition);
    assert.equal(step['timeout-minutes'], 3); assert.equal(step.env, undefined);
    assert.equal(index, job.steps.findIndex(item => item.id === beforeId) - 1, 'Disco inmediatamente antes de la AVD');
    assert.ok(index > job.steps.findIndex(item => item.id === afterId), 'Preflight después de sus prerrequisitos');
  }
  const avdCleanup = job.steps.find(step => step.id === 'avd34_cleanup');
  assert.equal(avdCleanup?.run, 'node scripts/android-release.js cleanup-avd34');
  assert.equal(avdCleanup['timeout-minutes'], 2); assert.equal(avdCleanup.env, undefined);
  const names = new Set();
  for (const [id, api, target, name, command] of [['release34', 34, 'google_apis', 'profiles-release34', 'release34'],
    ['pages16k', 36, 'google_apis_ps16k', 'profiles16k', 'api36']]) {
    const step = job.steps.find(value => value.id === id);
    assert.equal(step?.uses, 'reactivecircus/android-emulator-runner@v2');
    assert.equal(step.with['api-level'], api); assert.equal(step.with.arch, 'x86_64'); assert.equal(step.with.target, target);
    assert.equal(step.with['avd-name'], name); assert.equal(step.with['force-avd-creation'], true); assert.equal(step.with['disable-linux-hw-accel'], false);
    assert.equal(step.with.script, 'node scripts/android-release.js ' + command);
    assert.ok(step.with['emulator-options'].includes('-accel on') && step.with['emulator-options'].includes('-no-snapshot'));
    if (api === 36) validate16kMemory(step); else assert.equal(step.with['ram-size'], undefined, 'Release34 no cambia RAM');
    names.add(step.with['avd-name']);
  }
  assert.equal(job.steps.filter(step => step.uses === 'reactivecircus/android-emulator-runner@v2').length, 2, 'Release usa sólo dos AVD nuevas');
  assert.equal(names.size, 2);
  for (const mode of ['summary', 'cleanup']) assert.equal(job.steps.find(step => step.run === 'node scripts/android-release.js ' + mode)?.if, 'always()');
  const evidence = job.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(evidence.with.name, 'android-release-evidence'); assert.equal(evidence.with['retention-days'], 14);
  const paths = ['test-results/android-release-source.json', 'test-results/android-release.json', 'test-results/android-release-summary.md',
    'test-results/android-command-line-tools.json', 'test-results/release-production.xml', 'test-results/release-production16k.xml',
    'test-results/release-production/**/*.png', 'test-results/release-production16k/**/*.png'];
  for (const api of [34, 36]) for (const id of ['L01', 'L02']) paths.push('test-results/release-incoming' + api + '-' + id + '.xml',
    'test-results/release-incoming' + api + '-' + id + '/**/*.png');
  validateAndroidEvidence(job, paths);
  assert.equal(result.name, 'Resultado de Release AAB'); assert.deepEqual(result.needs, ['quality', 'security', 'release']);
  assert.equal(result.if, "${{ always() && startsWith(github.ref, 'refs/tags/validation/release-') }}");
  const gate = result.steps.find(step => step.run === 'node scripts/android-release.js gate'); assert.ok(gate, 'Falta gate Release');
  for (const id of ['quality', 'security', 'release']) assert.equal(gate.env['RESULT_' + id.toUpperCase()], '${{ needs.' + id + '.result }}');
}

function validateAccountWorkflow(workflow) {
  const job = workflow.jobs.account, result = workflow.jobs.account_result;
  assert.equal(job.environment, 'android-private-qa', 'La cuenta de pruebas requiere su entorno dedicado');
  assert.equal(job.if, "${{ startsWith(github.ref, 'refs/tags/validation/account-') }}");
  assert.deepEqual(job.needs, ['quality', 'security']);
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.equal(job['timeout-minutes'], 35);
  assert.deepEqual(job.env, { keep_evidence: 'true' }, 'No credenciales globales de cuenta');
  const commands = ['node scripts/android-account.cjs prepare', 'npm ci --no-audit --no-fund',
    'node scripts/android-account.cjs view', 'node scripts/android-account.cjs download', 'node scripts/android-account.cjs runtime-dir',
    'node scripts/android-account.cjs kvm',
    'node scripts/android-account.cjs probe'];
  const order = commands.map(command => job.steps.findIndex(step => step.run === command));
  assert.ok(order.every((index, n) => index >= 0 && (!n || index > order[n - 1])));
  const prepare = job.steps[order[0]], view = job.steps[order[2]];
  assert.deepEqual(prepare.env, { GITHUB_TOKEN: '${{ github.token }}' });
  assert.deepEqual(view.env, { EXPO_TOKEN: '${{ secrets.EXPO_TOKEN }}' });
  const adbTools = job.steps.find(step => step.id === 'account_adb_tools');
  assert.ok(adbTools && job.steps.indexOf(adbTools) < order.at(-1), 'ADB del SDK antes del probe sin credenciales');
  assert.ok(adbTools.run.includes('test -x "$ANDROID_HOME/platform-tools/adb"') && adbTools.run.includes('echo "$ANDROID_HOME/platform-tools" >> "$GITHUB_PATH"'));
  const runtime = job.steps.find(step => step.id === 'account_runtime');
  assert.ok(job.steps.indexOf(runtime) > order.at(-1));
  assert.equal(runtime.uses, 'reactivecircus/android-emulator-runner@v2');
  assert.equal(runtime.with['api-level'], 34); assert.equal(runtime.with.arch, 'x86_64');
  assert.equal(runtime.with.target, 'google_apis'); assert.equal(runtime.with['force-avd-creation'], true);
  assert.equal(runtime.with['disable-linux-hw-accel'], false);
  assert.ok(runtime.with['emulator-options'].includes('-no-snapshot') && runtime.with['emulator-options'].includes('-accel on'));
  assert.equal(runtime.with.script, 'node scripts/android-account.cjs runtime');
  assert.deepEqual(runtime.env, { ANDROID_TEST_EMAIL: '${{ secrets.ANDROID_TEST_EMAIL }}', ANDROID_TEST_PASSWORD: '${{ secrets.ANDROID_TEST_PASSWORD }}' });
  for (const step of job.steps) {
    if (step !== runtime) assert.ok(!/ANDROID_TEST_EMAIL|ANDROID_TEST_PASSWORD/.test(JSON.stringify(step)), 'Cuenta sólo en runtime');
    assert.ok(!step.if || step.if === 'always()' || step.uses?.startsWith('actions/upload-artifact@'));
    if (step !== view) assert.ok(!step.env?.EXPO_TOKEN);
    if (step !== prepare) assert.ok(!step.env?.GITHUB_TOKEN);
  }
  const install = job.steps.find(step => step.name?.startsWith('Instalar Maestro'));
  assert.ok(install.run.includes('cli-2.12.0/maestro.zip') && install.run.includes('a6044a84542f522f434c5dc3d609e60c7446d423f3ed1b2ae513f5c48663ec5e') && install.run.includes('sha256sum --check --strict'));
  assert.ok(install.run.includes('umask 022') && install.run.includes('$ACCOUNT_SANDBOX_PARENT/maestro-account/maestro/bin') && !install.run.includes('chmod'), 'Herramientas públicas sólo en la base exclusiva, sin abrir carpetas existentes');
  assert.ok(job.steps.findIndex(step => step.run === 'node scripts/android-account.cjs finish') > job.steps.indexOf(runtime));
  assert.equal(job.steps.find(step => step.run === 'node scripts/android-account.cjs cleanup')?.if, 'always()');
  validateAndroidEvidence(job, ['test-results/android-account-source.json', 'test-results/android-account.json']);
  assert.equal(result.if, "${{ always() && startsWith(github.ref, 'refs/tags/validation/account-') }}");
  assert.deepEqual(result.needs, ['quality', 'security', 'account']);
  const gate = result.steps[0];
  for (const id of ['quality', 'security', 'account']) {
    assert.equal(gate.env['RESULT_' + id.toUpperCase()], '${{ needs.' + id + '.result }}');
    assert.ok(gate.run.includes('test "$RESULT_' + id.toUpperCase() + '" = success'));
  }
}

function validateAndroidEvidence(job, allowedPaths) {
  const uploads = job.steps.filter(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(uploads.length, 1, 'Cada job Android conserva una sola allowlist exacta de evidencia');
  assert.equal(typeof uploads[0].with?.path, 'string', 'La allowlist exacta de evidencia Android debe ser explícita');
  const paths = uploads[0].with.path.trim().split(/\r?\n/).map(value => value.trim());
  for (const png of allowedPaths.filter(value => value.endsWith('/**/*.png'))) {
    assert.ok(paths.includes(png), 'El artefacto Android debe incluir las capturas PNG de Maestro');
  }
  assert.deepEqual([...paths].sort(), [...allowedPaths].sort(), 'Sólo se admite la allowlist exacta de evidencia Android; no carpetas, logs ni otros globs');
}

function validate16kMemory(step) {
  assert.equal(step.with['ram-size'], '4096M', 'API36 16KB requiere RAM guest fija de 4096M');
  assert.ok(!/(?:^|\s)-(?:memory|m)(?:\s|=|[0-9]|$)/i.test(step.with['emulator-options']), 'No sobrescribir RAM guest mediante opciones CLI');
}

function validateNativeWorkflow(workflow) {
  assert.ok(workflow, 'Falta el orquestador de validación del mismo APK');
  assert.deepEqual(workflow.on, { push: { tags: ['validation/android-*', 'validation/profiles-*', 'validation/release-*', 'validation/account-*'] } }, 'Validación sólo en tags validation/android-*');
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read', 'pull-requests': 'read' }, 'No elevar permisos globales');
  assert.equal(workflow.jobs.quality.uses, './.github/workflows/ci.yml');
  assert.equal(workflow.jobs.quality.with.keep_evidence, true);
  assert.equal(workflow.jobs.security.uses, './.github/workflows/security.yml');
  assert.deepEqual(workflow.jobs.security.permissions, { contents: 'read', 'security-events': 'write', actions: 'read' });
  assert.equal(workflow.jobs.security.with.keep_evidence, true);
  const job = workflow.jobs.native;
  assert.equal(job.if, "${{ startsWith(github.ref, 'refs/tags/validation/android-') }}");
  assert.deepEqual(job.needs, ['quality', 'security']);
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.equal(job.env.EXPO_TOKEN, undefined, 'EXPO_TOKEN sólo en build:view');
  assert.equal(job.env.PINNING_SYSTEM_IMAGE, 'system-images;android-30;default;x86_64');
  const tokenSteps = job.steps.filter(step => step.env?.EXPO_TOKEN);
  assert.equal(tokenSteps.length, 1, 'EXPO_TOKEN sólo en build:view');
  assert.equal(tokenSteps[0].run, 'node scripts/android-16k.js view');
  assert.ok(!job.env.GITHUB_SHA && !job.env.GITHUB_REF, 'No sustituir procedencia GitHub');
  for (const step of job.steps) assert.ok(!step.env?.GITHUB_SHA && !step.env?.GITHUB_REF, 'No sustituir procedencia GitHub');
  const commands = job.steps.map(step => step.run || '').join('\n');
  assert.ok(!/eas-cli[^\n]*\sbuild\s|node scripts\/eas-candidate/.test(commands), 'No crear builds en validación');
  const install = job.steps.find(step => step.id === 'install');
  assert.equal(install?.run, 'npm ci --no-audit --no-fund', 'EAS build:view requiere dependencias exactas del lockfile');
  assert.ok(!install.if, 'La instalación nativa no puede omitirse');
  const ordered = ['node scripts/android-16k.js prepare', 'npm ci --no-audit --no-fund', 'node scripts/android-16k.js view',
    'node scripts/android-16k.js download', 'node scripts/inspect-android-artifact.js', 'node scripts/android-pinning.js preflight', 'node scripts/android-16k.js kvm'];
  const indices = ordered.map(command => job.steps.findIndex(step => step.run === command));
  assert.ok(indices.every((index, offset) => index >= 0 && (offset === 0 || index > indices[offset - 1])), 'Procedencia, descarga e inspección deben preceder Android');
  validateDecoder23(job, indices[4], indices[3]);
  const preflight = job.steps.find(step => step.id === 'nsc_preflight');
  assert.equal(preflight?.run, 'node scripts/android-pinning.js preflight');
  assert.ok(!preflight.if && !preflight['continue-on-error'], 'NSC preflight debe ser obligatorio antes de AVD');
  const evidence = job.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(evidence.with.path.includes('test-results/android-command-line-tools.json'), 'Falta evidencia versión/JAR decoder');
  assert.ok(evidence.with.path.includes('test-results/android-pinning-preflight.json'), 'Falta evidencia NSC preflight');
  validateAndroidEvidence(job, [
    'test-results/android-validation-source.json',
    'test-results/android-build.json',
    'test-results/eas-candidate.json',
    'test-results/android-command-line-tools.json',
    'test-results/android-inspection.json',
    'test-results/android-inspection.txt',
    'test-results/android34.json',
    'test-results/maestro.xml',
    'test-results/maestro/**/*.png',
    'test-results/android-pinning-preflight.json',
    'test-results/android-pinning.json',
    'test-results/android16k.json',
    'test-results/android16k-summary.md',
    'test-results/android16k-maestro.xml',
    'test-results/android16k-maestro/**/*.png',
  ]);
  const kvm = job.steps.find(step => step.id === 'kvm');
  assert.equal(kvm?.run, 'node scripts/android-16k.js kvm');
  assert.equal(kvm['timeout-minutes'], 2);
  assert.ok(!kvm.if && !kvm['continue-on-error'], 'KVM no puede omitirse');
  let previous = indices.at(-1);
  const names = new Set();
  for (const [id, api, target, command] of [['api34', 34, 'google_apis', 'node scripts/android-16k.js api34'],
    ['pinning', 30, 'default', 'node scripts/android-pinning.js'], ['pages16k', 36, 'google_apis_ps16k', 'node scripts/android-16k.js probe']]) {
    const index = job.steps.findIndex(step => step.id === id), step = job.steps[index];
    if (id === 'pages16k') validate16kMemory(step);
    assert.ok(index > previous && !step['continue-on-error'], 'API34, MITM y 16KB son obligatorios y secuenciales');
    if (id === 'pages16k') assert.equal(step.if, "${{ !cancelled() && steps.inspection.outcome == 'success' && steps.nsc_preflight.outcome == 'success' && steps.kvm.outcome == 'success' && steps.api34.outcome == 'success' }}", '16KB exige prerrequisitos aprobados y ausencia de cancelación, independientemente de pinning');
    else assert.ok(!step.if, 'API34 y MITM conservan sus guardias obligatorias');
    assert.equal(step.uses, 'reactivecircus/android-emulator-runner@v2');
    assert.equal(step.with['api-level'], api); assert.equal(step.with.arch, 'x86_64'); assert.equal(step.with.target, target);
    assert.equal(step.with.script, command); assert.equal(step.with['disable-linux-hw-accel'], false);
    assert.equal(step.with['force-avd-creation'], true);
    assert.ok(step.with['emulator-options'].includes('-accel on') && step.with['emulator-options'].includes('-no-snapshot'));
    assert.ok(!names.has(step.with['avd-name']), 'Cada fase exige un AVD nuevo'); names.add(step.with['avd-name']); previous = index;
  }
  const result = workflow.jobs.result;
  assert.equal(result.name, 'Resultado de validación nativa');
  assert.deepEqual(result.needs, ['quality', 'security', 'native']); assert.equal(result.if, "${{ always() && startsWith(github.ref, 'refs/tags/validation/android-') }}");
  const gate = result.steps.find(step => step.run === 'node scripts/android-16k.js gate');
  assert.ok(gate, 'Falta agregado de resultados reales');
  for (const id of ['quality', 'security', 'native']) assert.equal(gate.env['RESULT_' + id.toUpperCase()], '$' + '{{ needs.' + id + '.result }}');
}

function validateWorkflows(workflows) {
  const client = workflows.get('ci.yml');
  assert.deepEqual(client.on.push.branches, ['feature/**', 'fix/**', 'chore/**', 'test/**', 'release/**', 'hotfix/**']);
  assert.ok(Object.hasOwn(client.on, 'workflow_call'), 'Calidad debe ser reutilizable');
  assert.ok(!client.on.pull_request, 'El orquestador debe evitar una segunda ejecución de calidad en PR');
  assert.equal(client.jobs.push_policy.steps.find((step) => step.id === 'policy')?.run, 'node scripts/pipeline-policy.js push',
    'El push debe deduplicar la calidad con el PR abierto');
  assert.equal(client.jobs.push_policy.if, "github.event_name == 'push' && github.ref_type == 'branch' && github.ref != 'refs/heads/develop' && github.ref != 'refs/heads/main'",
    'La deduplicación de push sólo corresponde a ramas, no a tags candidatos');
  assert.equal(client.jobs.validate.needs, 'push_policy');
  assert.equal(client.jobs.validate.if, "${{ !cancelled() && (needs.push_policy.result == 'skipped' || needs.push_policy.outputs.run_quality == 'true') }}",
    'Calidad debe respetar la deduplicación y los fallos de la política');
  const commands = client.jobs.validate.steps.map((step) => step.run).filter(Boolean).join('\n');
  for (const script of ['lint', 'typecheck', 'test:ci', 'test:config']) {
    assert.ok(commands.includes(`npm run ${script}`), `CI no ejecuta ${script}`);
  }
  for (const [id, script] of [['lint', 'lint:report'], ['types', 'typecheck:report']]) {
    assert.equal(client.jobs.validate.steps.find((step) => step.id === id)?.run, 'npm run ' + script,
      'El análisis estático debe generar sus informes');
  }
  const typecheck = client.jobs.validate.steps.find((step) => step.id === 'types');
  assert.equal(typecheck.if, "${{ !cancelled() && steps.install.outcome == 'success' }}",
    'TypeScript debe informar también cuando ESLint falle');
  const cryptoSetup = client.jobs.validate.steps.find(step => step.run === 'bash scripts/android-pinning-install.sh');
  assert.equal(cryptoSetup?.if, "startsWith(github.ref, 'refs/tags/candidate/android-') || startsWith(github.ref, 'refs/tags/validation/android-') || startsWith(github.ref, 'refs/tags/validation/profiles-') || startsWith(github.ref, 'refs/tags/validation/release-') || startsWith(github.ref, 'refs/tags/validation/account-')", 'La herramienta criptográfica sólo se instala en candidatas explícitas');
  assert.equal(client.jobs.validate.steps.find(step => step.id === 'tests').env.PINNING_TEST_MITMDUMP,
    "${{ (startsWith(github.ref, 'refs/tags/candidate/android-') || startsWith(github.ref, 'refs/tags/validation/android-') || startsWith(github.ref, 'refs/tags/validation/profiles-') || startsWith(github.ref, 'refs/tags/validation/release-') || startsWith(github.ref, 'refs/tags/validation/account-')) && 'mitmdump' || '' }}", 'La candidata exige criptografía real, sin omitirla');
  const clientEvidence = client.jobs.validate.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(clientEvidence.with.path.split('\n').includes('test-results/static-analysis/'),
    'El artefacto existente debe conservar los informes estáticos');
  const integration = workflows.get('api-android.yml');
  assert.deepEqual(integration.on.pull_request.branches, ['develop', 'main']);
  assert.ok(integration.on.pull_request.types.includes('ready_for_review'), 'La candidata debe comprobarse al salir de borrador');
  assert.equal(integration.jobs.plan.steps.find((step) => step.id === 'policy')?.run, 'node scripts/pipeline-policy.js plan');
  assert.equal(integration.jobs.plan.outputs.android, '${{ steps.policy.outputs.android }}', 'La decisión Android debe proceder de la matriz');
  assert.equal(integration.on.workflow_dispatch.inputs.run_android.type, 'boolean');
  assert.equal(integration.on.workflow_dispatch.inputs.run_android.default, false, 'Android manual debe solicitarse explícitamente');
  assert.deepEqual(integration.on.push.branches, ['develop', 'main']);
  assert.deepEqual(integration.on.push.tags, ['candidate/android-*'], 'La candidata explícita exige un tag con el prefijo autorizado');
  assert.equal(integration.jobs.quality.uses, './.github/workflows/ci.yml');
  assert.equal(integration.jobs.quality.needs, 'plan', 'La calidad debe respetar la matriz');
  assert.deepEqual(integration.jobs.api.needs, ['plan', 'quality'], 'HTTP requiere calidad aprobada');
  assert.ok(integration.jobs.api.steps.some((step) => step.id === 'readiness'
    && step.run === 'node scripts/wait-for-service.js'), 'HTTP requiere comprobar disponibilidad de la API');
  const apiSteps = integration.jobs.api.steps;
  const commerceSteps = apiSteps.filter(item => item.id === 'commerce_local');
  assert.equal(commerceSteps.length, 1, 'Comercio requiere un único paso en el job HTTP existente');
  const commerceStep = commerceSteps[0];
  assert.deepEqual(commerceStep.env, { ISOLATED_TEST_ENV: 'true', QA_COMMERCE: 'true' }, 'Comercio exige ambas flags sólo en su paso');
  assert.equal(commerceStep.if, undefined, 'Comercio HTTP no puede omitirse');
  assert.equal(commerceStep.run.trim(), [
    'docker compose -f tests/environment/compose.yml up -d --no-deps --force-recreate access',
    'node tests/environment/commerce-isolated.cjs seed "$GITHUB_WORKSPACE"',
    'node tests/environment/commerce-isolated.cjs check "$GITHUB_WORKSPACE"',
  ].join('\n'), 'Comercio sólo recrea access, aplica seed una vez y prueba la QA local');
  const teardownIndex = apiSteps.findIndex(item => item.run === 'node scripts/test-environment.js stop');
  assert.ok(apiSteps.indexOf(commerceStep) > apiSteps.findIndex(item => item.id === 'dast_local') &&
    apiSteps.findIndex(item => item.id === 'dast_local') >= 0 && teardownIndex > apiSteps.indexOf(commerceStep),
  'Comercio se ejecuta después de DAST y antes del teardown');
  assert.equal(apiSteps[teardownIndex].if, 'always()', 'Comercio conserva cleanup siempre');
  assert.ok(!integration.env?.QA_COMMERCE && !integration.jobs.api.env?.QA_COMMERCE, 'No habilitar comercio globalmente');
  for (const item of apiSteps.filter(item => item !== commerceStep)) {
    assert.equal(item.env?.QA_COMMERCE, undefined, 'La flag de comercio sólo pertenece a su paso');
  }
  const httpSummary = apiSteps.find(item => item.run === 'node scripts/write-api-summary.js');
  assert.equal(httpSummary?.env.COMMERCE_OUTCOME, '${{ steps.commerce_local.outcome }}', 'El resumen evalúa el resultado real de comercio');
  const httpArtifacts = apiSteps.filter(item => item.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(httpArtifacts.length, 1, 'Comercio reutiliza el único artefacto HTTP');
  assert.equal(httpArtifacts[0].with.name, 'api-evidence');
  assert.ok(httpArtifacts[0].with.path.trim().split('\n').includes('test-results/commerce-api.json'), 'Falta informe compacto de comercio');
  const security = workflows.get('security.yml');
  assert.ok(security, 'Falta el workflow de seguridad obligatorio');
  assert.deepEqual(Object.keys(security.on), ['workflow_call'], 'Seguridad sólo debe reutilizarse desde integración');
  assert.equal(security.on.workflow_call.inputs.keep_evidence.default, false);
  assert.equal(security.permissions, undefined, 'Los permisos de seguridad deben limitarse al job');
  assert.equal(integration.permissions?.['security-events'], undefined, 'No otorgar security-events globalmente');
  const permissions = { contents: 'read', 'security-events': 'write', actions: 'read' };
  assert.deepEqual(integration.jobs.security.permissions, permissions, 'El caller requiere permisos mínimos de seguridad');
  assert.equal(integration.jobs.security.uses, './.github/workflows/security.yml');
  assert.equal(integration.jobs.security.needs, 'plan');
  assert.equal(integration.jobs.security.with.keep_evidence, "${{ needs.plan.outputs.evidence == 'true' }}");
  const callers = [...workflows].flatMap(([file, workflow]) => Object.values(workflow.jobs)
    .filter(job => job.uses === './.github/workflows/security.yml').map(() => file)).sort();
  assert.deepEqual(callers, ['android-validation.yml', 'api-android.yml'],
    'Seguridad debe llamarse una sola vez por cada orquestador autorizado');
  const scan = security.jobs.scan;
  assert.deepEqual(scan.permissions, permissions, 'CodeQL requiere permisos mínimos del job');
  const step = id => scan.steps.find(item => item.id === id);
  assert.equal(step('install')?.run, 'npm ci --no-audit --no-fund');
  assert.ok(step('audit')?.run.includes('npm audit --json --audit-level=critical'), 'Auditoría npm obligatoria');
  assert.ok(step('audit').run.includes('|| audit_exit=$?') && step('audit').run.includes('"$audit_exit"'),
    'La auditoría debe conservar su código real de salida');
  assert.ok(step('audit').run.includes('node scripts/evaluate-security.js audit'), 'La auditoría debe evaluarse');
  assert.equal(step('audit').if, "${{ !cancelled() && steps.install.outcome == 'success' }}");
  assert.ok(step('semgrep')?.run.includes('semgrep/semgrep@sha256:2e45517a85e13a9cca14a2a00df6bb48affd66b8ebfae1b0991cd57578362fb0'), 'Semgrep debe usar el contenedor oficial fijado');
  for (const flag of ['--config p/ci', '--metrics off', '--error --strict --severity ERROR', 'node scripts/evaluate-semgrep.js']) {
    assert.ok(step('semgrep').run.includes(flag), 'Semgrep requiere análisis real, privacidad y bloqueo de fallos: ' + flag);
  }
  assert.equal(step('init')?.uses, 'github/codeql-action/init@v4');
  assert.deepEqual(step('init').with, { languages: 'javascript-typescript', 'build-mode': 'none', queries: 'security-extended' },
    'CodeQL oficial debe analizar JavaScript/TypeScript sin build ni tokens externos');
  assert.equal(step('init').if, "${{ !cancelled() && steps.install.outcome == 'success' }}",
    'CodeQL debe ejecutarse también si la auditoría falla');
  assert.equal(step('analyze')?.uses, 'github/codeql-action/analyze@v4');
  assert.equal(step('analyze').if, "${{ !cancelled() && steps.init.outcome == 'success' }}");
  assert.equal(step('analyze').with.output, 'test-results/security/codeql');
  assert.equal(step('analyze').with.upload, 'always', 'SARIF debe subirse a GitHub Security');
  assert.equal(step('analyze').with['wait-for-processing'], true);
  assert.equal(step('analyze').with['upload-database'], false, 'No duplicar bases CodeQL como evidencia');
  assert.equal(step('sast')?.run, 'node scripts/evaluate-security.js sast test-results/security/codeql');
  assert.equal(step('sast').if, '${{ !cancelled() }}', 'El gate debe detectar un análisis omitido o fallido');
  assert.equal(step('sast').env.ANALYZE_OUTCOME, '${{ steps.analyze.outcome }}');
  const securitySummary = scan.steps.find(item => item.run === 'node scripts/evaluate-security.js summary');
  assert.equal(securitySummary?.if, 'always()', 'Seguridad debe informar también sin resultados');
  for (const id of ['install', 'audit', 'semgrep', 'init', 'analyze', 'sast']) {
    assert.equal(securitySummary.env[id.toUpperCase() + '_OUTCOME'], '${{ steps.' + id + '.outcome }}',
      'El resumen debe evaluar el resultado real de seguridad: ' + id);
  }
  const securityEvidence = scan.steps.find(item => item.uses?.startsWith('actions/upload-artifact@'));
  assert.deepEqual(securityEvidence.with.path.trim().split('\n'), ['test-results/security/summary.md',
    'test-results/security/audit-gate.json', 'test-results/security/sast-gate.json', 'test-results/security/semgrep-gate.json'], 'Conservar sólo diagnóstico compacto de seguridad');
  assert.deepEqual(integration.jobs.android.needs, ['plan', 'quality', 'security', 'api', 'performance'], 'Android requiere calidad, seguridad, API e inspección aprobadas');
  assert.equal(integration.jobs.android.if, "needs.plan.outputs.android == 'true'", 'Android sólo se ejecuta cuando lo solicita la matriz');
  assert.equal(integration.jobs.android['runs-on'], 'ubuntu-latest', 'Android debe disponer de un runner alojado');
  const candidateBuild = integration.jobs.android.steps.find(step => step.id === 'build');
  assert.equal(candidateBuild?.run, 'node scripts/eas-candidate.js', 'Resolver y esperar la candidata sin builds duplicados');
  assert.equal(candidateBuild.env.EAS_CONFIG_REVISION, '${{ vars.EAS_CONFIG_REVISION }}');
  assert.equal(candidateBuild.env.EAS_REUSE_BUILD_ID, "${{ inputs.eas_reuse_build_id || vars.EAS_REUSE_BUILD_ID || '' }}");
  assert.equal(integration.jobs.android.concurrency['cancel-in-progress'], false);
  assert.equal(integration.jobs.android.concurrency.group, 'android-candidate-${{ github.repository }}-${{ github.sha }}-preview');
  assert.equal(integration.jobs.plan.outputs.pinning, '${{ steps.policy.outputs.pinning }}');
  const pinning = integration.jobs.pinning;
  assert.deepEqual(pinning?.needs, ['plan', 'android'], 'Pinning reutiliza la candidata ya aceptada');
  assert.equal(pinning.if, "needs.plan.outputs.pinning == 'true'", 'Piloto sólo en la candidata explícita');
  assert.equal(pinning.env.PINNING_EXPECTED_BUILD_ID, '${{ needs.android.outputs.build_id }}');
  assert.equal(pinning.env.PINNING_EXPECTED_SHA256, '${{ needs.android.outputs.apk_sha256 }}');
  assert.equal(pinning.env.PINNING_EXPECTED_COMMIT, '${{ needs.android.outputs.commit }}');
  assert.equal(pinning.env.CANDIDATE_APK_URL, '${{ needs.android.outputs.apk_url }}');
  assert.ok(!pinning.steps.some(step => step.run?.includes('eas-cli') || step.run?.includes('eas-candidate')), 'Pinning no recompila APK');
  const pinningEmulator = pinning.steps.find(step => step.uses?.startsWith('reactivecircus/android-emulator-runner@'));
  assert.equal(pinning.env.PINNING_SYSTEM_IMAGE, 'system-images;android-30;default;x86_64');
  assert.equal(pinningEmulator?.with['api-level'], 30);
  assert.equal(pinningEmulator.with.target, 'default');
  assert.equal(pinningEmulator.with.arch, 'x86_64');
  assert.ok(pinningEmulator.with['emulator-options'].includes('-writable-system'));
  assert.equal(pinningEmulator.with.script, 'node scripts/android-pinning.js');
  validateDecoder23(pinning, pinning.steps.indexOf(pinningEmulator),
    pinning.steps.findIndex(step => step.uses?.startsWith('actions/download-artifact@')));

  const nativeInspection = integration.jobs.android.steps.filter(step => step.id === 'artifact_inspection');
  assert.equal(nativeInspection.length, 1, 'La candidata requiere una sola inspección APK real');
  assert.equal(nativeInspection[0].run, 'node scripts/inspect-android-artifact.js');
  assert.equal(nativeInspection[0].if, undefined, 'La inspección de la candidata no puede omitirse');
  assert.equal(nativeInspection[0]['timeout-minutes'], 10, 'La inspección debe tener un límite de ejecución');
  validateDecoder23(integration.jobs.android, integration.jobs.android.steps.indexOf(nativeInspection[0]),
    integration.jobs.android.steps.findIndex(step => step.uses?.startsWith('actions/setup-java@')));
  const stepPosition = id => integration.jobs.android.steps.findIndex(step => step.id === id);
  const javaPosition = integration.jobs.android.steps.findIndex(step => step.uses?.startsWith('actions/setup-java@'));
  assert.ok(stepPosition('artifact_inspection') > stepPosition('apk') && stepPosition('artifact_inspection') > javaPosition
    && stepPosition('artifact_inspection') < stepPosition('acceptance'), 'Inspeccionar el APK descargado con Java listo antes de aceptarlo');
  const acceptance = integration.jobs.android.steps.find((step) => step.id === 'acceptance');
  assert.ok(acceptance?.with?.script?.includes('--test-output-dir test-results/maestro'),
    'Maestro debe conservar capturas en el directorio de evidencia sin carpetas ocultas');
  const androidScript = acceptance.with.script;
  assert.ok(androidScript.indexOf('node scripts/wait-for-service.js --android') >= 0
    && androidScript.indexOf('node scripts/wait-for-service.js --android') < androidScript.indexOf('maestro test'),
  'Android requiere comprobar red y API antes de Maestro');
  const androidEvidence = integration.jobs.android.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(androidEvidence?.with?.path?.split('\n').includes('test-results/maestro/**/*.png'),
    'El artefacto Android debe incluir las capturas de Maestro');
  for (const file of ['test-results/android-inspection.json', 'test-results/android-inspection.txt']) {
    assert.ok(androidEvidence.with.path.split('\n').includes(file), 'Falta evidencia compacta de inspección APK: ' + file);
  }
  validateAndroidEvidence(integration.jobs.android, [
    'test-results/readiness-android.json',
    'test-results/android-summary.md',
    'test-results/android-build.json',
    'test-results/api-tls-pins.json',
    'test-results/android-command-line-tools.json',
    'test-results/android-inspection.json',
    'test-results/android-inspection.txt',
    'test-results/maestro.xml',
    'test-results/maestro/**/*.png',
    'test-results/eas-candidate.json',
  ]);
  assert.equal(integration.jobs.integration.name.replace(/\s+/g, ' '),
    "${{ (startsWith(github.ref, 'refs/tags/candidate/android-') || (github.event_name == 'workflow_dispatch' && (inputs.run_android || github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/heads/release/') || startsWith(github.ref, 'refs/heads/hotfix/')))) && 'Resultado de candidata Android' || 'Resultado de integración' }}",
    'Separar el check de candidata explícita y conservar Resultado de integración para PR y pushes normales');
  assert.deepEqual(integration.jobs.integration.needs, ['plan', 'quality', 'security', 'api', 'performance', 'android', 'pinning']);
  assert.equal(integration.jobs.integration.if, 'always()', 'El resultado final debe evaluar también los fallos previos');
  const gate = integration.jobs.integration.steps.find((step) => step.run === 'node scripts/pipeline-policy.js gate');
  assert.ok(gate, 'El resultado final debe ejecutar el bloqueo de integración');
  assert.equal(gate.env.REQUIRE_ANDROID, '${{ needs.plan.outputs.android }}', 'El bloqueo Android debe seguir la matriz');
  assert.equal(gate.env.REQUIRE_PINNING, '${{ needs.plan.outputs.pinning }}');
  for (const id of ['plan', 'quality', 'security', 'api', 'performance', 'android', 'pinning']) {
    assert.equal(gate.env[`RESULT_${id.toUpperCase()}`], '${{ needs.' + id + '.result }}',
      'El resultado final debe evaluar la comprobación real: ' + id);
  }
  assert.equal(integration.jobs.performance.uses, './.github/workflows/performance.yml');
  assert.deepEqual(integration.jobs.delivery.needs, ['plan', 'android', 'integration'], 'La entrega exige integración y Android aprobados');
  assert.equal(integration.jobs.delivery.if, "github.ref_type == 'branch' && needs.plan.outputs.evidence == 'true' && needs.plan.outputs.android == 'true'", 'La entrega requiere evidencia y una candidata Android solicitada');
  assert.equal(integration.jobs.delivery.environment.name, 'qa-interna');
  const performance = workflows.get('performance.yml');
  assert.ok(Object.hasOwn(performance.on, 'workflow_call'));
  assert.ok(!performance.on.push && !performance.on.pull_request, 'La inspección debe reutilizarse desde el orquestador');
  assert.equal(performance.jobs.measure.needs, 'inspect');
  assert.equal(performance.jobs.measure.if, "github.event_name == 'workflow_dispatch' && inputs.run_measurement");
  assert.equal(performance.on.workflow_call.inputs.run_measurement.default, false,
    'Reutilizar desde una integración manual no debe ejecutar carga');
  assert.equal(performance.on.workflow_dispatch.inputs.run_measurement.default, true);
  assert.ok(!performance.jobs.inspect.steps.some((step) => step.uses?.startsWith('actions/upload-artifact@')),
    'Una inspección k6 no debe crear artefactos');

  validateNativeWorkflow(workflows.get('android-validation.yml'));
  validateProfilesWorkflow(workflows.get('android-validation.yml'));
  validateReleaseWorkflow(workflows.get('android-validation.yml'));
  validateAccountWorkflow(workflows.get('android-validation.yml'));

  for (const [file, workflow] of workflows) {
    for (const [id, job] of Object.entries(workflow.jobs)) {
      assert.ok(!job['continue-on-error'], `No ocultar fallos del job: ${file} / ${id}`);
      for (const dependency of [].concat(job.needs || [])) {
        assert.ok(workflow.jobs[dependency], `Dependencia inexistente: ${file} / ${id} / ${dependency}`);
      }
      for (const step of job.steps || []) {
        assert.ok(!step['continue-on-error'], `No ocultar fallos: ${file}`);
        if (!step.uses?.startsWith('actions/upload-artifact@')) continue;
        assert.equal(step.with['retention-days'], 14, `Retención inconsistente: ${file}`);
        assert.ok(!/\.apk|\.aab/.test(step.with.path), 'No duplicar binarios de EAS en GitHub');
        if (file !== 'performance.yml') {
          assert.ok(step.if.includes('failure()') && step.if.includes('evidence'), `Artefacto ordinario innecesario: ${file}`);
        }
      }
    }
  }
}

function validatePublicFlow(file, commands) {
  assert.ok(['catalogo-publico.yaml', 'detalle-producto.yaml'].includes(file), 'Flujo público desconocido');
  assert.ok(Array.isArray(commands), 'Comandos públicos incompletos');
  assert.deepEqual(commands[0], { launchApp: { clearState: true } }, 'Cada caso exige arranque limpio');
  const home = commands.findIndex(command => command?.extendedWaitUntil?.visible === 'Explora por deporte');
  assert.ok(home > 0, 'El inicio debe ser visible antes de la pestaña');
  assert.deepEqual(commands[home], { extendedWaitUntil: { visible: 'Explora por deporte', timeout: 45000 } });
  const taps = commands.map((command, index) => command?.tapOn === 'Catálogo' ? index : -1).filter(index => index >= 0);
  assert.equal(taps.length, 1, 'Catálogo requiere un único tap, sin reintentos');
  const tap = taps[0];
  assert.equal(commands.slice(0, tap + 1).filter(command => command && Object.hasOwn(command, 'tapOn')).length, 1,
    'No añadir taps alternativos antes de la transición al catálogo');
  assert.ok(tap > home + 2, 'La pestaña debe comprobarse después del inicio');
  assert.deepEqual(commands.slice(tap - 2, tap), [
    { assertVisible: { text: '^Catálogo$', enabled: true } }, { waitForAnimationToEnd: { timeout: 5000 } },
  ], 'Exigir pestaña visible/habilitada y espera nativa acotada antes del único tap');
  assert.deepEqual(commands[tap + 1], { extendedWaitUntil: { visible: 'Buscar en el catálogo', timeout: 30000 } },
    'La transición a catálogo conserva su aserción obligatoria');
  assert.ok(!/"(?:sleep|retry|retryTapIfNoChange|optional|skip|continue-on-error)"/.test(JSON.stringify(commands)),
    'No ocultar fallos ni sustituir sincronización por sleeps o reintentos');
}

function main() {
  const workflows = new Map();
  for (const directory of ['.github/workflows', '.maestro']) {
    for (const name of fs.readdirSync(directory).filter((file) => /\.ya?ml$/.test(file))) {
      const file = path.join(directory, name);
      const documents = YAML.parseAllDocuments(fs.readFileSync(file, 'utf8'));
      for (const document of documents) assert.equal(document.errors.length, 0, `YAML inválido: ${file}`);
      if (directory === '.maestro') {
        assert.equal(documents.length, 2);
        assert.equal(documents[0].toJS().appId, '${APP_ID}');
        assert.ok(Array.isArray(documents[1].toJS()));
        if (['catalogo-publico.yaml', 'detalle-producto.yaml'].includes(name)) validatePublicFlow(name, documents[1].toJS());
      } else {
        assert.equal(documents.length, 1);
        const workflow = documents[0].toJS();
        assert.ok(workflow.on && workflow.jobs, `Workflow incompleto: ${file}`);
        workflows.set(name, workflow);
      }
    }
  }
  validateWorkflows(workflows);
  const build = JSON.parse(fs.readFileSync('eas.json', 'utf8')).build;
  assert.equal(build.preview.android.buildType, 'apk');
  assert.equal(build.production.android.buildType, 'app-bundle');
  const plan = JSON.parse(fs.readFileSync('tests/plan.json', 'utf8'));
  assert.equal(plan.activities.length, 7);
  assert.equal(new Set(plan.cases.map((item) => item.group)).size, plan.cases.length);
  for (const activity of plan.activities) {
    for (const file of activity.files || []) assert.ok(fs.existsSync(file), `Archivo ausente: ${file}`);
  }
  console.log('Matriz por evento/rama, dependencias, resultados obligatorios y política de artefactos válidos.');
  console.log('Esta validación no compila APK ni ejecuta Android o carga.');
}
module.exports = { validateWorkflows, validatePublicFlow };
if (require.main === module) main();

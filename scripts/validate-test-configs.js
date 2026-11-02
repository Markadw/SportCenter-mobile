const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

function validateNativeWorkflow(workflow) {
  assert.ok(workflow, 'Falta el orquestador de validación del mismo APK');
  assert.deepEqual(workflow.on, { push: { tags: ['validation/android-*'] } }, 'Validación sólo en tags validation/android-*');
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read', 'pull-requests': 'read' }, 'No elevar permisos globales');
  assert.equal(workflow.jobs.quality.uses, './.github/workflows/ci.yml');
  assert.equal(workflow.jobs.quality.with.keep_evidence, true);
  assert.equal(workflow.jobs.security.uses, './.github/workflows/security.yml');
  assert.deepEqual(workflow.jobs.security.permissions, { contents: 'read', 'security-events': 'write', actions: 'read' });
  assert.equal(workflow.jobs.security.with.keep_evidence, true);
  const job = workflow.jobs.native;
  assert.deepEqual(job.needs, ['quality', 'security']);
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.equal(job.env.EXPO_TOKEN, undefined, 'EXPO_TOKEN sólo en build:view');
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
    'node scripts/android-16k.js download', 'node scripts/inspect-android-artifact.js', 'node scripts/android-16k.js kvm'];
  const indices = ordered.map(command => job.steps.findIndex(step => step.run === command));
  assert.ok(indices.every((index, offset) => index >= 0 && (offset === 0 || index > indices[offset - 1])), 'Procedencia, descarga e inspección deben preceder Android');
  const kvm = job.steps.find(step => step.id === 'kvm');
  assert.equal(kvm?.run, 'node scripts/android-16k.js kvm');
  assert.equal(kvm['timeout-minutes'], 2);
  assert.ok(!kvm.if && !kvm['continue-on-error'], 'KVM no puede omitirse');
  let previous = indices.at(-1);
  const names = new Set();
  for (const [id, api, target, command] of [['api34', 34, 'google_apis', 'node scripts/android-16k.js api34'],
    ['pinning', 30, 'google_apis', 'node scripts/android-pinning.js'], ['pages16k', 36, 'google_apis_ps16k', 'node scripts/android-16k.js probe']]) {
    const index = job.steps.findIndex(step => step.id === id), step = job.steps[index];
    assert.ok(index > previous && !step.if && !step['continue-on-error'], 'API34, MITM y 16KB son obligatorios y secuenciales');
    assert.equal(step.uses, 'reactivecircus/android-emulator-runner@v2');
    assert.equal(step.with['api-level'], api); assert.equal(step.with.arch, 'x86_64'); assert.equal(step.with.target, target);
    assert.equal(step.with.script, command); assert.equal(step.with['disable-linux-hw-accel'], false);
    assert.equal(step.with['force-avd-creation'], true);
    assert.ok(step.with['emulator-options'].includes('-accel on') && step.with['emulator-options'].includes('-no-snapshot'));
    assert.ok(!names.has(step.with['avd-name']), 'Cada fase exige un AVD nuevo'); names.add(step.with['avd-name']); previous = index;
  }
  const result = workflow.jobs.result;
  assert.equal(result.name, 'Resultado de validación nativa');
  assert.deepEqual(result.needs, ['quality', 'security', 'native']); assert.equal(result.if, 'always()');
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
  assert.equal(cryptoSetup?.if, "startsWith(github.ref, 'refs/tags/candidate/android-') || startsWith(github.ref, 'refs/tags/validation/android-')", 'La herramienta criptográfica sólo se instala en candidatas explícitas');
  assert.equal(client.jobs.validate.steps.find(step => step.id === 'tests').env.PINNING_TEST_MITMDUMP,
    "${{ (startsWith(github.ref, 'refs/tags/candidate/android-') || startsWith(github.ref, 'refs/tags/validation/android-')) && 'mitmdump' || '' }}", 'La candidata exige criptografía real, sin omitirla');
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
  assert.equal(pinningEmulator?.with['api-level'], 30);
  assert.ok(pinningEmulator.with['emulator-options'].includes('-writable-system'));
  assert.equal(pinningEmulator.with.script, 'node scripts/android-pinning.js');

  const nativeInspection = integration.jobs.android.steps.filter(step => step.id === 'artifact_inspection');
  assert.equal(nativeInspection.length, 1, 'La candidata requiere una sola inspección APK real');
  assert.equal(nativeInspection[0].run, 'node scripts/inspect-android-artifact.js');
  assert.equal(nativeInspection[0].if, undefined, 'La inspección de la candidata no puede omitirse');
  assert.equal(nativeInspection[0]['timeout-minutes'], 10, 'La inspección debe tener un límite de ejecución');
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
  assert.ok(androidEvidence?.with?.path?.split('\n').includes('test-results/maestro/'),
    'El artefacto Android debe incluir las capturas de Maestro');
  for (const file of ['test-results/android-inspection.json', 'test-results/android-inspection.txt']) {
    assert.ok(androidEvidence.with.path.split('\n').includes(file), 'Falta evidencia compacta de inspección APK: ' + file);
  }
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
module.exports = { validateWorkflows };
if (require.main === module) main();

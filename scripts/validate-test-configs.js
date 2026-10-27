const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

function validateWorkflows(workflows) {
  const client = workflows.get('ci.yml');
  assert.deepEqual(client.on.push.branches, ['feature/**', 'fix/**', 'chore/**', 'test/**', 'release/**', 'hotfix/**']);
  assert.ok(Object.hasOwn(client.on, 'workflow_call'), 'Calidad debe ser reutilizable');
  assert.ok(!client.on.pull_request, 'El orquestador debe evitar una segunda ejecución de calidad en PR');
  assert.equal(client.jobs.push_policy.steps.find((step) => step.id === 'policy')?.run, 'node scripts/pipeline-policy.js push',
    'El push debe deduplicar la calidad con el PR abierto');
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
  assert.equal(integration.jobs.quality.uses, './.github/workflows/ci.yml');
  assert.equal(integration.jobs.quality.needs, 'plan', 'La calidad debe respetar la matriz');
  assert.deepEqual(integration.jobs.api.needs, ['plan', 'quality'], 'HTTP requiere calidad aprobada');
  assert.ok(integration.jobs.api.steps.some((step) => step.id === 'readiness'
    && step.run === 'node scripts/wait-for-service.js'), 'HTTP requiere comprobar disponibilidad de la API');
  assert.deepEqual(integration.jobs.android.needs, ['plan', 'quality', 'api', 'performance'], 'Android requiere calidad, API e inspección aprobadas');
  assert.equal(integration.jobs.android.if, "needs.plan.outputs.android == 'true'", 'Android sólo se ejecuta cuando lo solicita la matriz');
  assert.equal(integration.jobs.android['runs-on'], 'ubuntu-latest', 'Android debe disponer de un runner alojado');
  assert.ok(integration.jobs.android.steps.some((step) => step.run?.includes('--wait --json')), 'Debe esperar el resultado real del build');
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
  assert.deepEqual(integration.jobs.integration.needs, ['plan', 'quality', 'api', 'performance', 'android']);
  assert.equal(integration.jobs.integration.if, 'always()', 'El resultado final debe evaluar también los fallos previos');
  const gate = integration.jobs.integration.steps.find((step) => step.run === 'node scripts/pipeline-policy.js gate');
  assert.ok(gate, 'El resultado final debe ejecutar el bloqueo de integración');
  assert.equal(gate.env.REQUIRE_ANDROID, '${{ needs.plan.outputs.android }}', 'El bloqueo Android debe seguir la matriz');
  for (const id of ['plan', 'quality', 'api', 'performance', 'android']) {
    assert.equal(gate.env[`RESULT_${id.toUpperCase()}`], '${{ needs.' + id + '.result }}',
      'El resultado final debe evaluar la comprobación real: ' + id);
  }
  assert.equal(integration.jobs.performance.uses, './.github/workflows/performance.yml');
  assert.deepEqual(integration.jobs.delivery.needs, ['plan', 'android', 'integration'], 'La entrega exige integración y Android aprobados');
  assert.equal(integration.jobs.delivery.if, "needs.plan.outputs.evidence == 'true' && needs.plan.outputs.android == 'true'", 'La entrega requiere evidencia y una candidata Android solicitada');
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

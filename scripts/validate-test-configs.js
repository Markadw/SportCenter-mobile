const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

function validateWorkflows(workflows) {
  const client = workflows.get('ci.yml');
  assert.deepEqual(client.on.push.branches, ['feature/**', 'fix/**', 'chore/**', 'test/**', 'release/**', 'hotfix/**']);
  assert.ok(Object.hasOwn(client.on, 'workflow_call'), 'Calidad debe ser reutilizable');
  assert.ok(!client.on.pull_request, 'El orquestador debe evitar una segunda ejecución de calidad en PR');
  const commands = client.jobs.validate.steps.map((step) => step.run).filter(Boolean).join('\n');
  for (const script of ['lint', 'typecheck', 'test:ci', 'test:config']) {
    assert.ok(commands.includes(`npm run ${script}`), `CI no ejecuta ${script}`);
  }
  const integration = workflows.get('api-android.yml');
  assert.deepEqual(integration.on.pull_request.branches, ['develop', 'main']);
  assert.deepEqual(integration.on.push.branches, ['develop', 'main']);
  assert.equal(integration.jobs.quality.uses, './.github/workflows/ci.yml');
  assert.deepEqual(integration.jobs.api.needs, ['plan', 'quality'], 'HTTP requiere calidad aprobada');
  assert.ok(integration.jobs.api.steps.some((step) => step.id === 'readiness'
    && step.run === 'node scripts/wait-for-service.js'), 'HTTP requiere comprobar disponibilidad de la API');
  assert.deepEqual(integration.jobs.android.needs, ['plan', 'quality', 'api', 'performance'], 'Android requiere calidad, API e inspección aprobadas');
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
  assert.equal(integration.jobs.performance.uses, './.github/workflows/performance.yml');
  assert.deepEqual(integration.jobs.delivery.needs, ['plan', 'android', 'integration'], 'La entrega exige integración y Android aprobados');
  assert.equal(integration.jobs.delivery.if, "needs.plan.outputs.evidence == 'true'", 'La entrega sólo se prepara para una candidata con evidencia');
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

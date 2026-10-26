const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const workflows = new Map();
for (const directory of ['.github/workflows', '.maestro']) {
  for (const name of fs.readdirSync(directory).filter((file) => /\.ya?ml$/.test(file))) {
    const file = path.join(directory, name);
    const documents = YAML.parseAllDocuments(fs.readFileSync(file, 'utf8'));
    for (const document of documents) assert.equal(document.errors.length, 0, `YAML inválido: ${file}`);
    if (directory === '.maestro') {
      assert.equal(documents.length, 2, `Maestro requiere cabecera y comandos: ${file}`);
      assert.equal(documents[0].toJS().appId, '${APP_ID}');
      assert.ok(Array.isArray(documents[1].toJS()));
    } else {
      assert.equal(documents.length, 1);
      const workflow = documents[0].toJS();
      assert.ok(workflow.on && workflow.jobs, `Workflow incompleto: ${file}`);
      assert.deepEqual(workflow.on.pull_request.branches, ['develop', 'main'], `Destinos de PR incorrectos: ${file}`);
      if (workflow.on.push) assert.deepEqual(workflow.on.push.branches, ['develop', 'main']);
      workflows.set(name, workflow);
    }
    console.log(`Configuración YAML válida: ${file}`);
  }
}
const client = workflows.get('ci.yml');
assert.ok(Object.hasOwn(client.on, 'workflow_call'), 'El cliente debe poder reutilizarse antes de Android');
const commands = client.jobs.validate.steps.map((step) => step.run).filter(Boolean).join('\n');
for (const script of ['lint', 'typecheck', 'test:ci', 'test:config']) {
  assert.ok(commands.includes(`npm run ${script}`), `CI no ejecuta ${script}`);
}
const api = workflows.get('api-android.yml');
assert.equal(api.jobs.quality.uses, './.github/workflows/ci.yml');
assert.deepEqual(api.jobs.android.needs, ['quality', 'api'], 'Android requiere calidad y API aprobadas');
for (const job of [api.jobs.quality, api.jobs.android]) {
  assert.ok(job.if.includes("github.event_name == 'workflow_dispatch'") && job.if.includes('inputs.run_android'));
}
const performance = workflows.get('performance.yml');
assert.equal(performance.jobs.measure.needs, 'inspect');
assert.ok(performance.jobs.measure.if.includes('inputs.isolated_api'));

const build = JSON.parse(fs.readFileSync('eas.json', 'utf8')).build;
assert.equal(build.preview.android.buildType, 'apk');
assert.equal(build.production.android.buildType, 'app-bundle');
const plan = JSON.parse(fs.readFileSync('tests/plan.json', 'utf8'));
assert.equal(plan.activities.length, 7);
assert.ok(plan.cases.length > 0);
assert.equal(new Set(plan.cases.map((item) => item.group)).size, plan.cases.length, 'Grupos de prueba duplicados');
for (const activity of plan.activities) {
  for (const file of activity.files || []) assert.ok(fs.existsSync(file), `Archivo de prueba ausente: ${file}`);
}
console.log('Flujo develop/main, dependencias de aceptación, perfiles EAS y plan coherentes. No ejecuta Android ni carga.');

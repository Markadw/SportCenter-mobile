const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

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
      const workflow = documents[0].toJS();
      assert.ok(workflow.on && workflow.jobs, `Workflow incompleto: ${file}`);
    }
    console.log(`Configuración YAML válida: ${file}`);
  }
}
assert.equal(JSON.parse(fs.readFileSync('eas.json', 'utf8')).build.preview.android.buildType, 'apk');
const plan = JSON.parse(fs.readFileSync('tests/plan.json', 'utf8'));
assert.equal(plan.activities.length, 7);
assert.equal(plan.cases.length, 9);
console.log('Perfil APK y matriz de siete actividades/nueve historias válidos. No ejecuta Android ni carga.');

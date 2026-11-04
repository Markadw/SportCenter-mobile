/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { test, expect } = require('@jest/globals');
const fs = require('node:fs');
const YAML = require('yaml');
const { validateWorkflows } = require('../scripts/validate-test-configs');
function workflows() {
  return new Map(fs.readdirSync('.github/workflows').filter(file => /\.ya?ml$/.test(file))
    .map(file => [file, YAML.parse(fs.readFileSync('.github/workflows/' + file, 'utf8'))]));
}
test('la comprobación de cuenta sólo usa APK existente, secretos en runtime y evidencia sin datos privados', () => {
  expect(() => validateWorkflows(workflows())).not.toThrow();
});
test.each([
  ['sin entorno QA', workflow => { delete workflow.jobs.account.environment; }],
  ['otro entorno QA', workflow => { workflow.jobs.account.environment = 'production'; }],
  ['sin calidad', workflow => { workflow.jobs.account.needs = ['security']; }],
  ['sin seguridad', workflow => { workflow.jobs.account.needs = ['quality']; }],
  ['etiqueta amplia', workflow => { workflow.on.push.tags.push('*'); }],
  ['secretos globales', workflow => { workflow.jobs.account.env.ANDROID_TEST_EMAIL = '${{ secrets.ANDROID_TEST_EMAIL }}'; }],
  ['secretos en consulta EAS', workflow => { workflow.jobs.account.steps.find(step => step.run === 'node scripts/android-account.cjs view').env.ANDROID_TEST_PASSWORD = '${{ secrets.ANDROID_TEST_PASSWORD }}'; }],
  ['token Expo durante login', workflow => { workflow.jobs.account.steps.find(step => step.id === 'account_runtime').env.EXPO_TOKEN = '${{ secrets.EXPO_TOKEN }}'; }],
  ['omite directorio exclusivo', workflow => { workflow.jobs.account.steps = workflow.jobs.account.steps.filter(step => step.run !== 'node scripts/android-account.cjs runtime-dir'); }],
  ['omite disponibilidad de ADB', workflow => { workflow.jobs.account.steps = workflow.jobs.account.steps.filter(step => step.id !== 'account_adb_tools'); }],
  ['omite prueba sin credenciales', workflow => { workflow.jobs.account.steps = workflow.jobs.account.steps.filter(step => step.run !== 'node scripts/android-account.cjs probe'); }],
  ['omite runtime', workflow => { workflow.jobs.account.steps.find(step => step.id === 'account_runtime').if = 'false'; }],
  ['oculta fallo', workflow => { workflow.jobs.account['continue-on-error'] = true; }],
  ['reutiliza dispositivo', workflow => { workflow.jobs.account.steps.find(step => step.id === 'account_runtime').with['force-avd-creation'] = false; }],
  ['publica capturas privadas', workflow => { workflow.jobs.account.steps.find(step => step.uses?.startsWith('actions/upload-artifact@')).with.path += 'test-results/**/*.png\n'; }],
  ['Maestro sin integridad', workflow => { const step = workflow.jobs.account.steps.find(step => step.name?.startsWith('Instalar Maestro')); step.run = step.run.replace('a6044a84542f522f434c5dc3d609e60c7446d423f3ed1b2ae513f5c48663ec5e', '0'.repeat(64)); }],
  ['limpieza omitida', workflow => { workflow.jobs.account.steps.find(step => step.run === 'node scripts/android-account.cjs cleanup').if = 'success()'; }],
  ['agregado sin seguridad', workflow => { workflow.jobs.account_result.needs = ['quality', 'account']; }],
  ['agregado siempre verde', workflow => { workflow.jobs.account_result.steps[0].env.RESULT_ACCOUNT = 'success'; }],
])('rechaza configuración insegura de cuenta: %s', (_, mutate) => {
  const value = workflows(); mutate(value.get('android-validation.yml'));
  expect(() => validateWorkflows(value)).toThrow();
});

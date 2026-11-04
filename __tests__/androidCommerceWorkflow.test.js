/** @jest-environment node */
const { test, expect } = require('@jest/globals');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const context = process.env.ANDROID_COMMERCE_CONTEXT_DIR || path.resolve(__dirname, '..');
const overlay = process.env.ANDROID_COMMERCE_PREP_DIR || context;
const { validateWorkflows } = require(path.join(overlay, 'scripts/validate-test-configs.js'));
function workflows() {
  return new Map(['ci.yml', 'api-android.yml', 'performance.yml', 'security.yml', 'android-validation.yml'].map(file => {
    const root = ['ci.yml', 'android-validation.yml'].includes(file) ? overlay : context;
    return [file, YAML.parse(fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8'))];
  }));
}
const step = (job, mode) => job.steps.find(item => item.run === 'node scripts/android-commerce.cjs ' + mode);
test('el tag sintético conserva gates históricos y el nombre separado de candidata', () => {
  const config = workflows(), native = config.get('android-validation.yml');
  expect(() => validateWorkflows(config)).not.toThrow();
  expect(config.get('api-android.yml').jobs.integration.name).toContain('Resultado de candidata Android');
  expect(native.jobs.commerce_result.name).toBe('Resultado de comercio Android aislado');
  expect(native.jobs.commerce.environment).toBeUndefined();
  for (const id of ['native', 'profiles', 'release', 'account']) expect(native.jobs[id].if).not.toContain('commerce-');
});
test.each([
  job => { job.if = "${{ startsWith(github.ref, 'refs/tags/candidate/android-') }}"; },
  job => { job.environment = 'android-private-qa'; },
  job => { job.needs = ['quality']; },
  job => { job['timeout-minutes'] = 90; },
  job => { job.env.QA_COMMERCE = 'false'; },
  job => { job.env.ISOLATED_TEST_ENV = 'false'; },
  job => { job.env.API_BASE_URL = 'https://outside.invalid'; },
  job => { job.env.GITHUB_SHA = 'spoof'; },
  job => { job.env.ANDROID_TEST_EMAIL = '${{ secrets.ANDROID_TEST_EMAIL }}'; },
  job => { job.steps[0].with['persist-credentials'] = true; },
  job => { job.steps.find(item => item.uses === 'actions/setup-node@v4').with['node-version'] = '20'; },
  job => { step(job, 'prepare').env.EXPO_TOKEN = '${{ secrets.EXPO_TOKEN }}'; },
  job => { step(job, 'view').env.GITHUB_TOKEN = '${{ github.token }}'; },
  job => { step(job, 'download').env = { EXPO_TOKEN: '${{ secrets.EXPO_TOKEN }}' }; },
  job => { step(job, 'host-probe').env = { GITHUB_SHA: 'spoof' }; },
  job => { const index = job.steps.indexOf(step(job, 'prepare')); const install = job.steps.findIndex(item => item.run === 'npm ci --no-audit --no-fund'); [job.steps[index], job.steps[install]] = [job.steps[install], job.steps[index]]; },
  job => { step(job, 'host-probe').if = 'always()'; },
  job => { job.steps.find(item => item.id === 'commerce_adb_tools').run = 'adb version'; },
  job => { job.steps.find(item => item.name?.startsWith('Instalar Maestro')).run = 'curl https://outside.invalid/tool.zip'; },
  job => { job.steps.find(item => item.name?.startsWith('Instalar Maestro')).run += '\nchmod 755 "$RUNNER_TEMP"'; },
  job => { job.steps.push({ run: 'npx eas-cli@27.4.0 build --platform android' }); },
  job => { job.steps.push({ run: 'curl -X POST https://outside.invalid/write' }); },
  job => { job.steps.find(item => item.run?.includes(' seed ')).run += '\nnode tests/environment/commerce-isolated.cjs seed "$GITHUB_WORKSPACE"'; },
  job => { job.steps.find(item => item.run?.includes(' check ')).run = 'node tests/environment/commerce-isolated.cjs check https://outside.invalid'; },
  job => { const r = job.steps.find(item => item.id === 'commerce_runtime'); r.with['api-level'] = 36; },
  job => { job.steps.find(item => item.id === 'commerce_runtime').with.target = 'google_apis_playstore'; },
  job => { job.steps.find(item => item.id === 'commerce_runtime').with.arch = 'arm64-v8a'; },
  job => { job.steps.find(item => item.id === 'commerce_runtime').with['disable-linux-hw-accel'] = true; },
  job => { job.steps.find(item => item.id === 'commerce_runtime').with['force-avd-creation'] = false; },
  job => { job.steps.find(item => item.id === 'commerce_runtime').with['ram-size'] = '4096M'; },
  job => { const r = job.steps.find(item => item.id === 'commerce_runtime'); r.with['emulator-options'] = r.with['emulator-options'].replace('-no-snapshot', ''); },
  job => { job.steps.find(item => item.id === 'commerce_runtime').with.script = 'node scripts/android-account.cjs runtime'; },
  job => { job.steps.find(item => item.id === 'commerce_runtime').env = { ANDROID_TEST_PASSWORD: '${{ secrets.ANDROID_TEST_PASSWORD }}' }; },
  job => { const a = job.steps.indexOf(step(job, 'finish')), b = job.steps.findIndex(item => item.id === 'commerce_runtime'); [job.steps[a], job.steps[b]] = [job.steps[b], job.steps[a]]; },
  job => { job.steps.find(item => item.run === 'npm run env:stop').if = 'success()'; },
  job => { step(job, 'cleanup').if = 'success()'; },
  job => { job.steps.find(item => item.uses?.startsWith('actions/upload-artifact@')).with.path += '\ntest-results/raw.log'; },
  job => { job.steps.find(item => item.uses?.startsWith('actions/upload-artifact@')).with.path += '\ntest-results/**/*.png'; },
  job => { const u = job.steps.find(item => item.uses?.startsWith('actions/upload-artifact@')); u.with.path = 'test-results/'; },
  job => { const u = job.steps.find(item => item.uses?.startsWith('actions/upload-artifact@')); u.with.path = u.with.path.replace('test-results/commerce-api.json', ''); },
  job => { job.steps.find(item => item.uses?.startsWith('actions/upload-artifact@')).with['retention-days'] = 90; },
])('rechaza debilitamiento de aislamiento, orden o evidencia %#', mutate => {
  const config = workflows(); mutate(config.get('android-validation.yml').jobs.commerce);
  expect(() => validateWorkflows(config)).toThrow();
});
test.each([
  result => { result.name = 'Resultado de integración'; },
  result => { result.needs = ['quality', 'commerce']; },
  result => { result.if = 'always()'; },
  result => { result.steps[0].env.RESULT_COMMERCE = 'success'; },
  result => { result.steps[0].run += '\ntrue'; },
])('el agregado exige resultados reales y no publica el check protegido %#', mutate => {
  const config = workflows(); mutate(config.get('android-validation.yml').jobs.commerce_result);
  expect(() => validateWorkflows(config)).toThrow();
});
test.each([
  config => { config.get('android-validation.yml').on.push.tags = ['validation/*']; },
  config => { config.get('android-validation.yml').on.push.tags = config.get('android-validation.yml').on.push.tags.filter(tag => tag !== 'validation/commerce-*'); },
  config => { const item = config.get('ci.yml').jobs.validate.steps.find(item => item.run === 'bash scripts/android-pinning-install.sh'); item.if = item.if.replace(" || startsWith(github.ref, 'refs/tags/validation/commerce-')", ''); },
  config => { config.get('ci.yml').jobs.validate.steps.find(item => item.id === 'tests').env.PINNING_TEST_MITMDUMP = ''; },
])('el prefijo exacto de comercio y criptografía real no son opcionales %#', mutate => {
  const config = workflows(); mutate(config);
  expect(() => validateWorkflows(config)).toThrow();
});

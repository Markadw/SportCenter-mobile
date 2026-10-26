/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { describe, test, expect } = require('@jest/globals');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');
const { executionPlan, evaluateChecks } = require('../scripts/pipeline-policy');
const { validateWorkflows } = require('../scripts/validate-test-configs');
const { clientSummary } = require('../scripts/write-test-summary');
const { apiSummary } = require('../scripts/write-api-summary');
const { validateAndroidSetup, selectAndroidBuild, assertAndroidReport } = require('../scripts/android-ci');
const root = path.resolve(__dirname, '..');

describe('Matriz y bloqueo de integración', () => {
  test.each(['feature/login', 'fix/filtros', 'chore/base', 'test/config', 'release/1.0', 'hotfix/1.0'])(
    'el push a %s sólo exige calidad rápida', (branch) => {
      expect(executionPlan({ event: 'push', branch })).toEqual({ stage: 'trabajo', android: false, evidence: false });
    });
  test('el PR a develop exige Android y evita artefactos ordinarios', () => {
    expect(executionPlan({ event: 'pull_request', base: 'develop', head: 'feature/catalogo' }))
      .toEqual({ stage: 'revision', android: true, evidence: false });
  });
  test('el merge a develop comprueba integración sin repetir Android', () => {
    expect(executionPlan({ event: 'push', branch: 'develop' }))
      .toEqual({ stage: 'integracion', android: false, evidence: false });
  });
  test.each(['develop', 'release/1.0', 'hotfix/1.0'])('el PR desde %s a main exige evidencia y Android', (head) => {
    expect(executionPlan({ event: 'pull_request', base: 'main', head }))
      .toEqual({ stage: 'entrega', android: true, evidence: true });
  });
  test('rechaza entregar directamente una feature a main', () => {
    expect(() => executionPlan({ event: 'pull_request', base: 'main', head: 'feature/login' })).toThrow('Main recibe');
  });
  test('no permite desactivar Android manualmente en main', () => {
    expect(executionPlan({ event: 'workflow_dispatch', branch: 'main', android: false }).android).toBe(true);
  });
  test('rechaza ramas fuera del flujo', () => {
    expect(() => executionPlan({ event: 'push', branch: 'otra' })).toThrow('fuera');
  });
  test.each(['failure', 'skipped', 'cancelled', undefined])('bloquea una API con resultado %s', (api) => {
    expect(evaluateChecks({ plan: 'success', quality: 'success', api, performance: 'success', android: 'success' }, true))
      .toEqual(['api']);
  });
  test('una aceptación omitida bloquea el PR pero es opcional después del merge a develop', () => {
    const results = { plan: 'success', quality: 'success', api: 'success', performance: 'success', android: 'skipped' };
    expect(evaluateChecks(results, true)).toEqual(['android']);
    expect(evaluateChecks(results, false)).toEqual([]);
  });
  test('el proceso final devuelve error real ante fallo y éxito sólo con todo aprobado', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-pipeline-'));
    try {
      const env = { ...process.env, GITHUB_STEP_SUMMARY: path.join(temp, 'summary.md'),
        REQUIRE_ANDROID: 'true', RESULT_PLAN: 'success', RESULT_QUALITY: 'success',
        RESULT_API: 'failure', RESULT_PERFORMANCE: 'success', RESULT_ANDROID: 'skipped' };
      const failed = spawnSync(process.execPath, [path.join(root, 'scripts/pipeline-policy.js'), 'gate'], { env, encoding: 'utf8' });
      expect(failed.status).toBe(1);
      expect(fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain('Bloqueada');
      const passed = spawnSync(process.execPath, [path.join(root, 'scripts/pipeline-policy.js'), 'gate'],
        { env: { ...env, RESULT_API: 'success', RESULT_ANDROID: 'success' }, encoding: 'utf8' });
      expect(passed.status).toBe(0);
    } finally {
      if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('sport-pipeline-')) {
        throw new Error('Ruta temporal de prueba inesperada.');
      }
      fs.rmSync(temp, { recursive: true });
    }
  });
  test('un Android ejecutado y fallido bloquea aunque fuera opcional', () => {
    expect(evaluateChecks({ plan: 'success', quality: 'success', api: 'success',
      performance: 'success', android: 'failure' }, false)).toEqual(['android']);
  });
});

function workflows() {
  return new Map(['ci.yml', 'api-android.yml', 'performance.yml'].map((file) =>
    [file, YAML.parse(fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8'))]));
}
describe('Dependencias reales de los YAML', () => {
  test('valida los workflows del repositorio', () => expect(() => validateWorkflows(workflows())).not.toThrow());
  test('detecta si se retira la dependencia de calidad a las pruebas HTTP', () => {
    const config = workflows();
    config.get('api-android.yml').jobs.api.needs = ['plan'];
    expect(() => validateWorkflows(config)).toThrow('HTTP requiere calidad');
  });
  test('detecta artefactos añadidos a una simple inspección', () => {
    const config = workflows();
    config.get('performance.yml').jobs.inspect.steps.push({ uses: 'actions/upload-artifact@v4' });
    expect(() => validateWorkflows(config)).toThrow('inspección k6');
  });
  test('no permite activar carga al reutilizar el workflow desde integración manual', () => {
    const config = workflows();
    config.get('performance.yml').on.workflow_call.inputs.run_measurement.default = true;
    expect(() => validateWorkflows(config)).toThrow('no debe ejecutar carga');
  });
});

describe('Informes de pruebas', () => {
  test('no presenta la falta de reporte por fallo como una aprobación', () => {
    expect(apiSummary(null, { TEST_OUTCOME: 'failure' })).toContain('Falló la suite HTTP');
    expect(clientSummary(null, { TEST_OUTCOME: 'failure', LINT_OUTCOME: 'success' })).toContain('Fallida');
  });
  test('distingue categorías que pasaron de las que fallaron', () => {
    const report = { testResults: [
      { name: '/app/__tests__/catalog.test.ts', assertionResults: [{ status: 'passed', fullName: 'catálogo' }] },
      { name: '/app/tests/integration/store.test.ts', assertionResults: [{ status: 'failed', fullName: 'servicio' }] },
    ] };
    const summary = clientSummary(report, { TEST_OUTCOME: 'failure' });
    expect(summary).toContain('Unitaria / componente: 1 casos · 1 aprobados · 0 fallidos');
    expect(summary).toContain('Integración del cliente: 1 casos · 0 aprobados · 1 fallidos');
  });
});

describe('Precondiciones y procedencia del APK candidato', () => {
  const commit = 'a'.repeat(40);
  const app = { expo: { extra: { eas: { projectId: '12345678-1234-1234-1234-123456789abc' } }, android: { package: 'com.sport.center' } } };
  const eas = { build: { preview: { android: { buildType: 'apk' } } } };
  const env = { EXPO_TOKEN: 'dato-ficticio', PRODUCT_NAME: 'Balón', GITHUB_SHA: commit, API_BASE_URL: 'https://example.test' };
  const build = { id: 'build-de-prueba', platform: 'ANDROID', status: 'FINISHED', gitCommitHash: commit,
    artifacts: { buildUrl: 'https://example.test/app.apk' } };
  test('valida una configuración completa sin conectar a EAS', () => {
    expect(validateAndroidSetup(app, eas, env)).toEqual({ appId: 'com.sport.center', apiUrl: 'https://example.test' });
  });
  test('falla con motivo explícito cuando falta la vinculación o el token', () => {
    expect(() => validateAndroidSetup({ expo: {} }, eas, { ...env, EXPO_TOKEN: '' })).toThrow('extra.eas.projectId');
  });
  test('rechaza un APK de otro commit', () => {
    expect(() => selectAndroidBuild([build], 'b'.repeat(40))).toThrow('commit comprobado');
  });
  test('rechaza un build que sólo fue solicitado y aún está en cola', () => {
    expect(() => selectAndroidBuild([{ ...build, status: 'IN_QUEUE' }], commit)).toThrow('no terminó');
  });
  test('acepta únicamente el APK Android finalizado del commit esperado', () => {
    expect(selectAndroidBuild([build], commit)).toMatchObject({ id: 'build-de-prueba', commit });
  });
  test.each(['<testsuite tests="0"/>', '<testsuite><testcase name="catálogo"><failure/></testcase></testsuite>',
    '<testsuite><testcase name="catálogo"/><testcase name="detalle"><skipped/></testcase></testsuite>'])(
    'un informe vacío o fallido no acredita aceptación: %s', (xml) => expect(() => assertAndroidReport(xml)).toThrow());
  test('un informe con casos aprobados acredita la ejecución de aceptación', () => {
    expect(assertAndroidReport('<testsuite><testcase name="catálogo"/><testcase name="detalle"/></testsuite>')).toBe(2);
  });
});

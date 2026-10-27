/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { describe, test, expect, jest } = require('@jest/globals');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');
const { executionPlan, evaluateChecks, pushQuality } = require('../scripts/pipeline-policy');
const { validateWorkflows } = require('../scripts/validate-test-configs');
const { clientSummary } = require('../scripts/write-test-summary');
const { apiSummary } = require('../scripts/write-api-summary');
const { validateAndroidSetup, selectAndroidBuild, assertAndroidReport } = require('../scripts/android-ci');
const { validatedAndroidNetwork, waitForService } = require('../scripts/wait-for-service');
const root = path.resolve(__dirname, '..');

describe('Matriz y bloqueo de integración', () => {
  test.each(['feature/login', 'fix/filtros', 'chore/base', 'test/config', 'release/1.0', 'hotfix/1.0'])(
    'el push a %s sólo exige calidad rápida', (branch) => {
      expect(executionPlan({ event: 'push', branch })).toEqual({ stage: 'trabajo', android: false, evidence: false });
    });
  test('el PR a develop omite APK y Android y evita artefactos ordinarios', () => {
    expect(executionPlan({ event: 'pull_request', base: 'develop', head: 'feature/catalogo' }))
      .toEqual({ stage: 'revision', android: false, evidence: false });
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
  test.each(['plan', 'quality', 'api', 'performance'])('la comprobación %s sigue siendo obligatoria sin Android', (name) => {
    const results = { plan: 'success', quality: 'success', api: 'success', performance: 'success', android: 'skipped' };
    for (const result of ['failure', 'skipped', 'cancelled', undefined]) {
      expect(evaluateChecks({ ...results, [name]: result }, false)).toEqual([name]);
    }
  });
  test('Android omitido permite integrar en develop pero bloquea una ejecución que lo exige', () => {
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
      const withoutAndroid = spawnSync(process.execPath, [path.join(root, 'scripts/pipeline-policy.js'), 'gate'],
        { env: { ...env, REQUIRE_ANDROID: 'false', RESULT_API: 'success' }, encoding: 'utf8' });
      expect(withoutAndroid.status).toBe(0);
      expect(fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain('| android | skipped |');
      const failedHttp = spawnSync(process.execPath, [path.join(root, 'scripts/pipeline-policy.js'), 'gate'],
        { env: { ...env, REQUIRE_ANDROID: 'false' }, encoding: 'utf8' });
      expect(failedHttp.status).toBe(1);
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
  test.each(['lint', 'types', 'tests'])('no permite omitir %s del workflow de calidad', (id) => {
    const config = workflows();
    config.get('ci.yml').jobs.validate.steps = config.get('ci.yml').jobs.validate.steps.filter((step) => step.id !== id);
    expect(() => validateWorkflows(config)).toThrow();
  });
  test('no permite ocultar fallos de calidad mediante continue-on-error', () => {
    const config = workflows();
    config.get('api-android.yml').jobs.quality['continue-on-error'] = true;
    expect(() => validateWorkflows(config)).toThrow('No ocultar fallos del job');
  });
  test('no permite exigir Android al margen de la matriz', () => {
    const config = workflows();
    config.get('api-android.yml').jobs.integration.steps[1].env.REQUIRE_ANDROID = 'true';
    expect(() => validateWorkflows(config)).toThrow('bloqueo Android debe seguir la matriz');
  });
  test('no permite sustituir el resultado HTTP por un éxito fijo', () => {
    const config = workflows();
    config.get('api-android.yml').jobs.integration.steps[1].env.RESULT_API = 'success';
    expect(() => validateWorkflows(config)).toThrow('comprobación real: api');
  });
  test('no permite ejecutar Android automáticamente fuera de la matriz', () => {
    const config = workflows();
    config.get('api-android.yml').jobs.android.if = 'always()';
    expect(() => validateWorkflows(config)).toThrow('Android sólo se ejecuta');
  });
  test('rechaza guardar capturas en una carpeta oculta que no se conserva como evidencia', () => {
    const config = workflows();
    const acceptance = config.get('api-android.yml').jobs.android.steps.find((step) => step.id === 'acceptance');
    acceptance.with.script = acceptance.with.script.replace('--test-output-dir', '--debug-output');
    expect(() => validateWorkflows(config)).toThrow('conservar capturas');
  });
  test('rechaza omitir las capturas del artefacto de diagnóstico Android', () => {
    const config = workflows();
    const evidence = config.get('api-android.yml').jobs.android.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    evidence.with.path = 'test-results/maestro.xml';
    expect(() => validateWorkflows(config)).toThrow('incluir las capturas');
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


describe('Preparación limitada del entorno antes de probar', () => {
  const network = (id, capabilities) => `NetworkAgentInfo{network{${id}} nc{[Transports: WIFI Capabilities: ${capabilities}]}}`;
  const validated = `Active default network: 100\n${network(100, 'INTERNET&VALIDATED')}`;
  function clock() {
    let time = 0;
    return { now: () => time, pause: jest.fn(async (ms) => { time += ms; }) };
  }
  const ready = () => ({ status: 200, json: async () => [{ id_producto: 66 }] });
  test('exige que la red predeterminada tenga Internet validado', () => {
    expect(validatedAndroidNetwork(validated)).toBe(true);
    expect(validatedAndroidNetwork('Active default network: none')).toBe(false);
    expect(validatedAndroidNetwork(`Active default network: 100\n${network(100, 'INTERNET')}\n${network(101, 'INTERNET&VALIDATED')}`)).toBe(false);
  });
  test.each([502, 503, 504])('espera recuperación de HTTP %s sin repetir las pruebas', async (status) => {
    const fetchApi = jest.fn().mockResolvedValueOnce({ status }).mockResolvedValueOnce(ready());
    const result = await waitForService({ apiUrl: 'https://example.test', fetchApi, ...clock() });
    expect(result).toMatchObject({ ready: true, attempts: 2, elapsedMs: 3000 });
  });
  test('no consulta la API hasta que el emulador tiene red validada', async () => {
    const readNetwork = jest.fn().mockReturnValueOnce('Active default network: none').mockReturnValue(validated);
    const fetchApi = jest.fn().mockResolvedValue(ready());
    const result = await waitForService({ apiUrl: 'https://example.test', android: true, readNetwork, fetchApi, ...clock() });
    expect(result).toMatchObject({ ready: true, attempts: 1, elapsedMs: 3000 });
    expect(fetchApi).toHaveBeenCalledTimes(1);
  });
  test('el límite de preparación falla si la API nunca conecta', async () => {
    const fetchApi = jest.fn().mockRejectedValue(new TypeError('fallo de red'));
    await expect(waitForService({ apiUrl: 'https://example.test', timeout: 6000, fetchApi, ...clock() }))
      .rejects.toThrow('Preparación agotó 6 segundos');
    expect(fetchApi).toHaveBeenCalledTimes(2);
  });
  test('un rechazo HTTP no transitorio detiene la preparación sin reintentos', async () => {
    const fetchApi = jest.fn().mockResolvedValue({ status: 403 });
    await expect(waitForService({ apiUrl: 'https://example.test', fetchApi, ...clock() })).rejects.toThrow('HTTP 403');
    expect(fetchApi).toHaveBeenCalledTimes(1);
  });
  test('un HTTP 200 sin productos no acredita un entorno listo', async () => {
    const fetchApi = jest.fn().mockResolvedValue({ status: 200, json: async () => [] });
    await expect(waitForService({ apiUrl: 'https://example.test', fetchApi, ...clock() })).rejects.toThrow('catálogo JSON con productos');
  });
});


describe('Evitar trabajo duplicado sin omitir cambios de aplicación', () => {
  const pr = { state: 'open', base: { ref: 'develop' }, head: { sha: 'actual' } };
  test('el push de un commit con PR abierto no repite calidad', async () => {
    expect(await pushQuality({ repository: 'owner/repo', branch: 'chore/ci', sha: 'actual' }, async () => [pr])).toBe(false);
  });
  test('un push sin PR conserva la validación rápida', async () => {
    expect(await pushQuality({ repository: 'owner/repo', branch: 'feature/app', sha: 'actual' }, async () => [])).toBe(true);
  });
  test('un PR de otro commit no permite omitir calidad', async () => {
    expect(await pushQuality({ repository: 'owner/repo', branch: 'feature/app', sha: 'nuevo' }, async () => [pr])).toBe(true);
  });
  test('una consulta fallida no produce una omisión aprobada', async () => {
    await expect(pushQuality({ repository: 'owner/repo', branch: 'feature/app', sha: 'actual' }, async () => { throw new Error('HTTP 403'); })).rejects.toThrow('HTTP 403');
  });
});

describe('Android opcional en develop', () => {
  test.each([true, false])('un PR a develop con draft=%s no solicita APK aunque incluya evidencia', (draft) => {
    expect(executionPlan({ event: 'pull_request', base: 'develop', head: 'feature/app', draft, evidence: true }))
      .toEqual({ stage: draft ? 'borrador' : 'revision', android: false, evidence: true });
  });
  test.each([false, true])('la ejecución manual de develop respeta run_android=%s', (android) => {
    expect(executionPlan({ event: 'workflow_dispatch', branch: 'develop', android }))
      .toEqual({ stage: 'integracion', android, evidence: false });
  });
  test.each(['release/1.0', 'hotfix/1.0'])('la candidata manual %s sigue exigiendo Android', (branch) => {
    expect(executionPlan({ event: 'workflow_dispatch', branch, android: false }))
      .toEqual({ stage: 'candidata', android: true, evidence: true });
  });
  test('main conserva Android obligatorio en push y omisión mientras el PR es borrador', () => {
    expect(executionPlan({ event: 'push', branch: 'main' }))
      .toEqual({ stage: 'entrega', android: true, evidence: true });
    expect(executionPlan({ event: 'pull_request', base: 'main', head: 'develop', draft: true }))
      .toEqual({ stage: 'borrador', android: false, evidence: true });
  });
  test('el plan real de PR a develop no necesita clasificar archivos para omitir Android', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-pipeline-'));
    try {
      const event = path.join(temp, 'event.json');
      const output = path.join(temp, 'output.txt');
      const summary = path.join(temp, 'summary.md');
      fs.writeFileSync(event, JSON.stringify({ pull_request: { draft: false } }));
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/pipeline-policy.js'), 'plan'], {
        env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'develop',
          GITHUB_HEAD_REF: 'feature/app', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary, RUN_ANDROID: 'false', KEEP_EVIDENCE: 'false' }, encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(fs.readFileSync(output, 'utf8')).toBe('android=false\nevidence=false\n');
      expect(fs.readFileSync(summary, 'utf8')).toContain('No se acredita aceptación Android');
    } finally {
      if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('sport-pipeline-')) {
        throw new Error('Ruta temporal de prueba inesperada.');
      }
      fs.rmSync(temp, { recursive: true });
    }
  });
});

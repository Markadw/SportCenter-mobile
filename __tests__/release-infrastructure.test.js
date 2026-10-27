/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { describe, test, expect } = require('@jest/globals');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { validateTestEnvironment } = require('../scripts/test-environment');
const { internalCandidate } = require('../scripts/publish-internal-candidate');
const { summarizePerformance } = require('../scripts/performance-summary');
const { executionPlan } = require('../scripts/pipeline-policy');
const { validateWorkflows } = require('../scripts/validate-test-configs');
const profile = require('../tests/performance/profile.json');
const source = require('../tests/environment/backend-source.json');
const root = path.resolve(__dirname, '..');
const environment = () => YAML.parse(fs.readFileSync(path.join(root, 'tests/environment/compose.yml'), 'utf8'));

describe('Aislamiento del entorno reproducible', () => {
  test('valida la copia de datos, API y carga con acceso sólo local', () => expect(() => validateTestEnvironment(environment())).not.toThrow());
  test('impide dirigir k6 al servidor compartido', () => {
    const config = environment();
    config.services.k6.environment.API_BASE_URL = 'https://back-sport-ghxk.onrender.com';
    expect(() => validateTestEnvironment(config)).toThrow('copia local');
  });
  test('rechaza exponer PostgreSQL al host', () => {
    const config = environment();
    config.services.db.ports = ['5432:5432'];
    expect(() => validateTestEnvironment(config)).toThrow('PostgreSQL no debe exponerse');
  });
  test('rechaza una segunda red de salida para la API', () => {
    const config = environment();
    config.services.api.networks.push('access');
    expect(() => validateTestEnvironment(config)).toThrow('red aislada');
  });
});
describe('Entrega interna después de aprobar pruebas', () => {
  const commit = 'a'.repeat(40);
  const env = { INTEGRATION_RESULT: 'success', ANDROID_RESULT: 'success', GITHUB_SHA: commit,
    CANDIDATE_COMMIT: commit, CANDIDATE_BUILD_ID: '12345678-1234-1234-1234-123456789abc',
    CANDIDATE_APK_URL: 'https://example.test/app.apk', CANDIDATE_SHA256: 'b'.repeat(64) };
  test('prepara sólo el APK verificado de la revisión aprobada', () => {
    expect(internalCandidate(env)).toMatchObject({ commit, environment: 'qa-interna', status: 'approved_for_internal_validation' });
  });
  test.each(['failure','skipped','cancelled'])('bloquea la entrega con integración %s', (result) => {
    expect(() => internalCandidate({ ...env, INTEGRATION_RESULT: result })).toThrow('integración aprobada');
  });
  test('rechaza sustituir el commit del APK', () => {
    expect(() => internalCandidate({ ...env, CANDIDATE_COMMIT: 'c'.repeat(40) })).toThrow('commit comprobado');
  });
  test('la etiqueta de evidencia conserva la candidata de un PR a develop', () => {
    expect(executionPlan({ event: 'pull_request', base: 'develop', head: 'chore/ci', evidence: true }).evidence).toBe(true);
  });
  test('detecta una entrega que omite la dependencia de integración', () => {
    const config = new Map(['ci.yml','api-android.yml','performance.yml'].map((file) =>
      [file,YAML.parse(fs.readFileSync(path.join(root,'.github/workflows',file),'utf8'))]));
    config.get('api-android.yml').jobs.delivery.needs = ['plan','android'];
    expect(() => validateWorkflows(config)).toThrow('entrega exige integración');
  });
});
describe('Dictamen de métricas y alcance medido', () => {
  function record(name, p95, exitCode = 0) {
    return { name, exitCode, report: { meta: { isolated: true, backendCommit: source.commit }, results: { metrics: {
      http_reqs: { values: { count: 20 } }, http_req_duration: { values: { 'p(95)': p95 } },
      http_req_failed: { values: { rate: 0 } }, checks: { values: { fails: 0 } },
    } } } };
  }
  test('una referencia sola no se presenta como rendimiento aprobado', () => {
    expect(summarizePerformance([record('baseline',10)],profile,source).verdict).toBe('reference_only');
  });
  test('compara la referencia y la carga sin duplicar solicitudes', () => {
    const summary = summarizePerformance([record('baseline',10),record('load',20)],profile,source);
    expect(summary.comparison.changePercent).toBe(100);
    expect(summary.verdict).toBe('passed_for_executed_scope');
  });
  test('conserva como fallo el código de salida de k6', () => {
    expect(summarizePerformance([record('load',20,99)],profile,source).verdict).toBe('failure');
  });
  test('un número de solicitudes cero no acredita una medición', () => {
    const empty = record('load',20);
    empty.report.results.metrics.http_reqs.values.count = 0;
    expect(() => summarizePerformance([empty],profile,source)).toThrow('sin solicitudes');
  });
  test('un P95 fuera del acuerdo falla aunque el proceso devuelva cero', () => {
    expect(summarizePerformance([record('load',800)],profile,source).verdict).toBe('failure');
  });
});

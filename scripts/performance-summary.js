const assert = require('node:assert/strict');

function value(report, name, field) {
  const result = report?.results?.metrics?.[name]?.values?.[field];
  assert.ok(typeof result === 'number' && Number.isFinite(result), 'Falta una métrica verificable: ' + name + '/' + field);
  return result;
}
function summarizePerformance(records, profile, source) {
  const stages = records.map((item) => {
    assert.equal(item.report.meta.isolated, true, 'El resultado debe corresponder al entorno aislado.');
    assert.equal(item.report.meta.backendCommit, source.commit, 'El resultado corresponde a otro backend.');
    const result = { name: item.name, exitCode: item.exitCode,
      requests: value(item.report, 'http_reqs', 'count'),
      p95Ms: value(item.report, 'http_req_duration', 'p(95)'),
      errorRate: value(item.report, 'http_req_failed', 'rate') };
    assert.ok(result.requests > 0, 'Una medición sin solicitudes no acredita pruebas.');
    result.passed = item.exitCode === 0;
    if (item.name === 'load') result.passed = result.passed && result.p95Ms < profile.load.p95LimitMs
      && result.errorRate <= profile.load.errorRateLimit && value(item.report, 'checks', 'fails') === 0;
    if (item.name === 'stress') {
      result.rateLimitedResponses = value(item.report, 'rate_limited_responses{scenario:stress}', 'count');
      result.recoveryMs = value(item.report, 'recovery_time_ms', 'max');
      result.recoverySamples = value(item.report, 'recovery_valid_samples', 'count');
      result.recoveryErrorRate = value(item.report, 'http_req_failed{scenario:verifyRecovery}', 'rate');
      result.passed = result.passed && result.rateLimitedResponses > 0 && result.recoveryMs <= profile.stress.recoveryLimitMs
        && result.recoverySamples > 0 && result.recoveryErrorRate === 0
        && value(item.report, 'recovery_observed', 'count') > 0 && value(item.report, 'unexpected_responses', 'count') === 0;
    }
    return result;
  });
  const baseline = stages.find((stage) => stage.name === 'baseline');
  const load = stages.find((stage) => stage.name === 'load');
  const comparison = baseline && load ? { baselineP95Ms: baseline.p95Ms, loadP95Ms: load.p95Ms,
    changePercent: baseline.p95Ms ? ((load.p95Ms / baseline.p95Ms) - 1) * 100 : null } : null;
  return { scope: profile.scope, backendCommit: source.commit, agreement: profile.agreement,
    profile, seed: { products: 100, variants: 200 }, stages, comparison,
    verdict: stages.some((stage) => !stage.passed) ? 'failure'
      : stages.every((stage) => stage.name === 'baseline') ? 'reference_only' : 'passed_for_executed_scope' };
}
function performanceMarkdown(summary) {
  const rows = summary.stages.map((stage) => '| ' + stage.name + ' | ' + stage.requests + ' | '
    + stage.p95Ms.toFixed(2) + ' | ' + (stage.errorRate * 100).toFixed(2) + '% | ' + (stage.passed ? 'Aprobada' : 'Fallida') + ' |');
  const recovery = summary.stages.find((stage) => stage.name === 'stress');
  return ['## Medición local de la API', '', summary.scope, '',
    '| Escenario | Solicitudes | P95 ms | Respuestas HTTP fallidas | Resultado |', '|---|---:|---:|---:|---|', ...rows, '',
    summary.comparison ? 'Comparación P95: ' + summary.comparison.baselineP95Ms.toFixed(2) + ' ms de referencia y '
      + summary.comparison.loadP95Ms.toFixed(2) + ' ms con carga normal.' : 'Sin comparación entre referencia y carga normal en esta ejecución.',
    recovery ? 'Estrés: ' + recovery.rateLimitedResponses + ' respuestas 429 durante la sobrecarga; recuperación en '
      + (recovery.recoveryMs / 1000).toFixed(2) + ' s y ' + recovery.recoverySamples + ' muestras correctas en la verificación final.'
      : 'No se ejecutó esfuerzo en esta medición.',
    recovery ? 'El P95 de esfuerzo incluye rechazos 429 y no se compara con el objetivo de carga normal.' : '',
    '', 'Backend: ' + summary.backendCommit + '. Dictamen: ' + summary.verdict + '.',
    'Las respuestas 429 durante el estrés representan el límite de admisión del backend; la verificación final exige cero errores.',
    '',].join('\n');
}
module.exports = { summarizePerformance, performanceMarkdown };

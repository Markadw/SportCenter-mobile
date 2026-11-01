const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const VERSION = '1.183.0';
const IMAGE = 'semgrep/semgrep@sha256:2e45517a85e13a9cca14a2a00df6bb48affd66b8ebfae1b0991cd57578362fb0';
function evaluate(report, exitCode) {
  assert.ok(report && report.version === VERSION, 'Falta el informe de la versión Semgrep fijada.');
  assert.ok(Array.isArray(report.results) && Array.isArray(report.errors), 'Informe Semgrep incompleto.');
  assert.equal(report.errors.length, 0, 'Semgrep informó errores de análisis.');
  assert.ok(Array.isArray(report.paths?.scanned) && report.paths.scanned.length > 0, 'Semgrep no analizó archivos.');
  assert.ok(report.paths.scanned.every(file => typeof file === 'string' && file.length > 0), 'Lista de archivos Semgrep inválida.');
  assert.ok(Array.isArray(report.skipped_rules) && report.skipped_rules.length === 0, 'Semgrep omitió reglas.');
  const findings = report.results.map(result => {
    assert.ok(typeof result.check_id === 'string' && result.check_id.length > 0 && result.extra?.severity === 'ERROR', 'Hallazgo Semgrep inválido para el filtro configurado.');
    return result.check_id;
  });
  assert.ok(Number.isInteger(exitCode) && [0, 1].includes(exitCode), 'Falló la ejecución de Semgrep.');
  assert.equal(exitCode === 0, findings.length === 0, 'El código de salida no corresponde a los hallazgos Semgrep.');
  return { tool: 'Semgrep CE', version: VERSION, image: IMAGE, configuration: 'p/ci', severity: 'ERROR',
    scope: 'Código del cliente, plugins de configuración y scripts; análisis intrafunción con reglas públicas del registro, complementario a CodeQL security-extended.',
    scannedFiles: report.paths.scanned.length, findings: findings.length, ruleIds: [...new Set(findings)].sort(),
    verdict: findings.length ? 'blocked' : 'passed_for_executed_scope' };
}
function main(file, code, directory = 'test-results/security') {
  fs.mkdirSync(directory, { recursive: true });
  let result;
  try {
    const raw = fs.readFileSync(file);
    result = { ...evaluate(JSON.parse(raw), Number(code)), reportSha256: createHash('sha256').update(raw).digest('hex') };
  } catch {
    result = { tool: 'Semgrep CE', version: VERSION, verdict: 'blocked', reason: 'Informe ausente, inválido, incompleto o ejecución fallida.' };
  }
  fs.writeFileSync(path.join(directory, 'semgrep-gate.json'), JSON.stringify(result, null, 2) + '\n');
  const summary = '\n## Semgrep CE\n\n' + (result.verdict === 'passed_for_executed_scope'
    ? 'Aprobado para el alcance ejecutado: ' + result.scannedFiles + ' archivos, sin hallazgos de severidad ERROR.\n'
    : 'Bloqueado: revisar semgrep-gate.json y el diagnóstico de la ejecución.\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  process.stdout.write(summary);
  if (result.verdict !== 'passed_for_executed_scope') process.exitCode = 1;
}
module.exports = { evaluate, VERSION, IMAGE };
if (require.main === module) main(process.argv[2], process.argv[3]);

/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { test, expect } = require('@jest/globals');
const { evaluate, VERSION } = require('../scripts/evaluate-semgrep');
const valid = () => ({ version: VERSION, results: [], errors: [], paths: { scanned: ['src/api/axios.ts'] }, skipped_rules: [] });
test('acepta sólo una ejecución real con archivos y sin errores', () => {
  expect(evaluate(valid(), 0)).toMatchObject({ verdict: 'passed_for_executed_scope', scannedFiles: 1, findings: 0 });
});
test.each([
  ['otra versión', report => { report.version = '0.0.0'; }],
  ['errores', report => { report.errors = [{ type: 'ParseError' }]; }],
  ['sin archivos', report => { report.paths.scanned = []; }],
  ['regla omitida', report => { report.skipped_rules = ['rule']; }],
  ['informe parcial', report => { delete report.results; }],
])('bloquea %s', (_, change) => { const report = valid(); change(report); expect(() => evaluate(report, 0)).toThrow(); });
test.each([2, 7, NaN])('bloquea error operativo %s', code => { expect(() => evaluate(valid(), code)).toThrow(); });
test('un hallazgo ERROR bloquea y no publica mensajes ni fragmentos de código', () => {
  const report = valid(); report.results = [{ check_id: 'security.rule', extra: { severity: 'ERROR', message: 'dato privado' } }];
  const summary = evaluate(report, 1);
  expect(summary.verdict).toBe('blocked'); expect(summary.findings).toBe(1);
  expect(JSON.stringify(summary)).not.toContain('dato privado');
  expect(() => evaluate(report, 0)).toThrow();
});

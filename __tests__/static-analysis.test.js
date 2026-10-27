/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { runAnalysis, staticSummary } = require('../scripts/run-static-analysis');
const { validateWorkflows } = require('../scripts/validate-test-configs');
const YAML = require('yaml');
let temp;
beforeAll(() => { temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-static-')); });
afterAll(() => {
  if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('sport-static-')) throw new Error('Ruta temporal inesperada.');
  fs.rmSync(temp, { recursive: true });
});
function workspace(name) {
  const cwd = path.join(temp, name);
  fs.mkdirSync(cwd);
  return cwd;
}
const env = {};

describe('Informes de analizadores con ejecución real de sus CLI', () => {
  test('ESLint conserva el error y reemplaza el diagnóstico anterior cuando se corrige', () => {
    const cwd = workspace('eslint');
    fs.writeFileSync(path.join(cwd, 'eslint.config.cjs'), "module.exports=[{files:['*.js'],rules:{'no-undef':'error'}}];");
    fs.writeFileSync(path.join(cwd, 'example.js'), 'missingName();');
    const failed = runAnalysis('lint', { cwd, env });
    expect(failed).toMatchObject({ status: 'failure', toolExitCode: 1, exitCode: 1, errorCount: 1 });
    expect(failed.diagnostics[0]).toMatchObject({ file: 'example.js', line: 1, rule: 'no-undef' });
    fs.writeFileSync(path.join(cwd, 'example.js'), 'const value = 1;');
    const passed = runAnalysis('lint', { cwd, env });
    expect(passed).toMatchObject({ status: 'success', exitCode: 0, errorCount: 0, diagnostics: [] });
    expect(JSON.parse(fs.readFileSync(path.join(cwd, 'test-results/static-analysis/eslint.json'), 'utf8')).status).toBe('success');
  });
  test('un fallo de configuración ESLint mantiene el código 2 y el diagnóstico', () => {
    const cwd = workspace('eslint-config');
    fs.writeFileSync(path.join(cwd, 'eslint.config.cjs'), "throw new Error('configuracion-invalida');");
    fs.writeFileSync(path.join(cwd, 'example.js'), 'const value = 1;');
    const failed = runAnalysis('lint', { cwd, env });
    expect(failed).toMatchObject({ status: 'failure', exitCode: 2, toolExitCode: 2, errorCount: null });
    expect(failed.output).toContain('configuracion-invalida');
  });
  test('ESLint informa las advertencias conservando la política actual de salida', () => {
    const cwd = workspace('eslint-warning');
    fs.writeFileSync(path.join(cwd, 'eslint.config.cjs'), "module.exports=[{files:['*.js'],rules:{'no-undef':'warn'}}];");
    fs.writeFileSync(path.join(cwd, 'example.js'), 'missingName();');
    const result = runAnalysis('lint', { cwd, env });
    expect(result).toMatchObject({ status: 'success', exitCode: 0, errorCount: 0, warningCount: 1 });
    expect(result.diagnostics[0].severity).toBe('warning');
  });
  test('TypeScript conserva el error de tipos y vuelve a cero tras corregirlo', () => {
    const cwd = workspace('typescript');
    fs.writeFileSync(path.join(cwd, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, types: [] }, include: ['example.ts'] }));
    fs.writeFileSync(path.join(cwd, 'example.ts'), "const value: number = 'texto';");
    const failed = runAnalysis('typecheck', { cwd, env });
    expect(failed.status).toBe('failure');
    expect(failed.exitCode).toBe(failed.toolExitCode);
    expect(failed.exitCode).not.toBe(0);
    expect(failed.output).toContain('TS2322');
    fs.writeFileSync(path.join(cwd, 'example.ts'), 'const value: number = 1;');
    expect(runAnalysis('typecheck', { cwd, env })).toMatchObject({ status: 'success', exitCode: 0, errorCount: 0 });
  });
});

describe('Evidencia del workflow sin aprobaciones falsas', () => {
  const report = { tool: 'ESLint', version: '9', context: { commit: 'actual', runId: '10', runAttempt: '2' },
    status: 'success', exitCode: 0, errorCount: 0, warningCount: 0, diagnostics: [], command: 'eslint .', durationMs: 1 };
  test('la falta de archivo se muestra aunque la etapa diga success', () => {
    expect(staticSummary({}, { LINT_OUTCOME: 'success' })).toContain('Sin informe');
    expect(staticSummary({}, { LINT_OUTCOME: 'success' })).not.toContain('Aprobada');
  });
  test('un reporte anterior no acredita una etapa omitida', () => {
    expect(staticSummary({ eslint: report }, { LINT_OUTCOME: 'skipped' })).toContain('Omitida: skipped');
    expect(staticSummary({ eslint: report }, { LINT_OUTCOME: 'skipped' })).not.toContain('Aprobada');
  });
  test.each([{ GITHUB_SHA: 'otro' }, { GITHUB_RUN_ID: '11' }, { GITHUB_RUN_ATTEMPT: '3' }])('rechaza un informe de otra ejecución: %j', (context) => {
    expect(staticSummary({ eslint: report }, { LINT_OUTCOME: 'success', ...context })).toContain('Informe de otra ejecución');
  });
  test('el validador rechaza perder los informes del artefacto existente', () => {
    const root = path.resolve(__dirname, '..');
    const workflows = new Map(['ci.yml','api-android.yml','performance.yml'].map((file) => [file, YAML.parse(fs.readFileSync(path.join(root,'.github/workflows',file),'utf8'))]));
    const evidence = workflows.get('ci.yml').jobs.validate.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    evidence.with.path = evidence.with.path.replace('test-results/static-analysis/','');
    expect(() => validateWorkflows(workflows)).toThrow('informes estáticos');
  });
});

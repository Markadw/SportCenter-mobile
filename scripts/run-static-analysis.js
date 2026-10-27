const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tools = { lint: { package: 'eslint', bin: 'eslint', label: 'ESLint' },
  typecheck: { package: 'typescript', bin: 'tsc', label: 'TypeScript' } };

function context(cwd, env) {
  let commit = env.GITHUB_SHA || null;
  let worktreeDirty = null;
  if (!commit) {
    try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim(); } catch { /* El entorno temporal puede no ser un repositorio. */ }
  }
  try { worktreeDirty = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim() !== ''; } catch { /* Puede no existir un checkout. */ }
  return { commit, worktreeDirty, runId: env.GITHUB_RUN_ID || null, runAttempt: env.GITHUB_RUN_ATTEMPT || null };
}

function runAnalysis(kind, { cwd = root, directory = path.join(cwd, 'test-results/static-analysis'), env = process.env } = {}) {
  const tool = tools[kind];
  if (!tool) throw new Error('Usar lint o typecheck.');
  fs.mkdirSync(directory, { recursive: true });
  const reportFile = path.join(directory, tool.package + '.json');
  const nativeFile = path.join(directory, '.eslint-native-' + process.pid + '.json');
  fs.rmSync(reportFile, { force: true });
  fs.rmSync(nativeFile, { force: true });
  const start = Date.now();
  const report = { tool: tool.label, version: null, context: context(cwd, env),
    startedAt: new Date(start).toISOString(), status: 'failure', exitCode: 2, toolExitCode: null,
    errorCount: null, warningCount: null, diagnostics: [], output: '' };
  try {
    const packageFile = require.resolve(tool.package + '/package.json');
    const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    const executable = path.resolve(path.dirname(packageFile), metadata.bin[tool.bin]);
    const args = kind === 'lint' ? ['.', '--format', 'json', '--output-file', nativeFile] : ['--noEmit', '--pretty', 'false'];
    report.version = metadata.version;
    report.command = kind === 'lint' ? 'eslint . --format json --output-file <informe temporal>' : 'tsc --noEmit --pretty false';
    const result = spawnSync(process.execPath, [executable, ...args], { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    report.toolExitCode = result.status;
    report.signal = result.signal;
    report.exitCode = result.status ?? 2;
    report.output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n').trim();
    if (kind === 'lint') {
      if (fs.existsSync(nativeFile)) {
        const results = JSON.parse(fs.readFileSync(nativeFile, 'utf8'));
        if (!Array.isArray(results) || results.length === 0) throw new Error('ESLint no produjo resultados de archivos analizados.');
        report.filesAnalyzed = results.length;
        report.errorCount = results.reduce((sum, file) => sum + file.errorCount, 0);
        report.warningCount = results.reduce((sum, file) => sum + file.warningCount, 0);
        report.diagnostics = results.flatMap((file) => file.messages.map((message) => ({
          file: path.relative(cwd, file.filePath).split(path.sep).join('/'), line: message.line || null,
          column: message.column || null, severity: message.severity === 2 ? 'error' : 'warning',
          rule: message.ruleId, message: message.message,
        })));
      } else if (result.status === 0) throw new Error('ESLint terminó sin generar su informe.');
    } else {
      report.errorCount = (report.output.match(/error TS\d+:/g) || []).length;
      if (report.exitCode !== 0 && report.errorCount === 0) report.errorCount = null;
      report.warningCount = 0;
    }
    if (report.exitCode === 0 && (report.errorCount || 0) > 0) report.exitCode = 2;
    report.status = report.exitCode === 0 ? 'success' : 'failure';
  } catch (error) {
    report.output = [report.output, error.message].filter(Boolean).join('\n');
    report.exitCode = report.exitCode || 2;
  } finally {
    fs.rmSync(nativeFile, { force: true });
  }
  report.durationMs = Date.now() - start;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  return report;
}

function staticSummary(reports, env = {}) {
  const rows = [];
  const details = [];
  const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  for (const [kind, tool] of Object.entries(tools)) {
    const step = env[kind === 'lint' ? 'LINT_OUTCOME' : 'TYPES_OUTCOME'];
    const report = reports[tool.package];
    let state;
    if (step && !['success', 'failure'].includes(step)) state = 'Omitida: ' + step;
    else if (!report) state = 'Sin informe: revisar la etapa y sus logs';
    else if (report.tool !== tool.label || (env.GITHUB_SHA && report.context?.commit !== env.GITHUB_SHA)
      || (env.GITHUB_RUN_ID && report.context?.runId !== env.GITHUB_RUN_ID)
      || (env.GITHUB_RUN_ATTEMPT && report.context?.runAttempt !== env.GITHUB_RUN_ATTEMPT)) state = 'Informe de otra ejecución';
    else if (step && step !== report.status) state = 'Resultado inconsistente con la etapa';
    else state = report.status === 'success' && report.exitCode === 0 ? 'Aprobada' : 'Fallida';
    const usable = ['Aprobada', 'Fallida'].includes(state);
    rows.push('| ' + [tool.label, usable ? report.version : '-', state, usable ? report.exitCode : '-',
      usable ? report.errorCount ?? 'Ver salida' : '-', usable ? report.warningCount ?? 'Ver salida' : '-'].map(cell).join(' | ') + ' |');
    if (!usable) continue;
    details.push('', '### ' + tool.label, '', 'Comando: `' + report.command + '`. Duración: ' + report.durationMs + ' ms.');
    if (report.filesAnalyzed !== undefined) details.push('Archivos analizados: ' + report.filesAnalyzed + '.');
    for (const diagnostic of report.diagnostics.slice(0, 30)) details.push('- ' + cell(diagnostic.file) + ':' + diagnostic.line + ':' + diagnostic.column
      + ' · ' + cell(diagnostic.severity) + ' · ' + cell(diagnostic.rule || 'analizador') + ' · ' + cell(diagnostic.message));
    if (report.diagnostics.length > 30) details.push('Mostrando 30 de ' + report.diagnostics.length + ' diagnósticos; ver JSON completo.');
    if (report.output) details.push('', '<pre>' + report.output.slice(0, 8000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>',
      report.output.length > 8000 ? 'Salida abreviada en el resumen; ver JSON completo.' : '');
    else if (report.diagnostics.length === 0 && state === 'Aprobada') details.push('Sin diagnósticos.');
  }
  return ['## Informe de análisis estático', '', '| Herramienta | Versión | Resultado | Código de salida | Errores | Advertencias |',
    '|---|---|---|---:|---:|---:|', ...rows, ...details, '',
    'Los JSON completos se incluyen en client-evidence ante fallos o en candidatas con evidencia. Una etapa omitida o sin informe no acredita análisis.', ''].join('\n');
}

module.exports = { runAnalysis, staticSummary };
if (require.main === module) {
  try {
    const report = runAnalysis(process.argv[2]);
    console.log(report.tool + ' ' + report.version + ': ' + report.status + '. Código de salida: ' + report.exitCode + '.');
    for (const diagnostic of report.diagnostics) console.log(diagnostic.file + ':' + diagnostic.line + ':' + diagnostic.column
      + ' ' + diagnostic.severity + ' ' + diagnostic.message + ' (' + diagnostic.rule + ')');
    if (report.output) process.stdout.write(report.output + '\n');
    console.log('Informe: test-results/static-analysis/' + tools[process.argv[2]].package + '.json');
    process.exitCode = report.exitCode;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}

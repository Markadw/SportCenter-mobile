const fs = require('node:fs');
const path = require('node:path');
const { staticSummary } = require('./run-static-analysis');
const escapeCell = (value) => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const outcome = (value) => ({ success: 'Aprobada', failure: 'Fallida', cancelled: 'Cancelada',
  skipped: 'Omitida por una etapa previa' }[value] || 'Sin resultado');

function clientSummary(report, env = {}, staticReports = {}) {
  const groups = { 'Unitaria / componente': [], 'Integración del cliente': [] };
  for (const suite of report?.testResults || []) {
    const type = /tests[\\/]integration[\\/]/.test(suite.name) ? 'Integración del cliente' : 'Unitaria / componente';
    for (const test of suite.assertionResults) groups[type].push({ ...test, file: path.basename(suite.name) });
  }
  const counts = (cases) => `${cases.length} casos · ${cases.filter((test) => test.status === 'passed').length} aprobados · ${cases.filter((test) => test.status === 'failed').length} fallidos · ${cases.filter((test) => !['passed', 'failed'].includes(test.status)).length} pendientes`;
  const rows = Object.entries(groups).flatMap(([type, cases]) => cases.map((test) =>
    `| ${type} | ${escapeCell(test.file)} | ${escapeCell(test.fullName)} | ${escapeCell(test.status)} |`));
  return [
    '# Calidad del cliente móvil', '',
    `Instalación: **${outcome(env.INSTALL_OUTCOME)}**.`,
    `Ejecución Jest: **${outcome(env.TEST_OUTCOME)}**. Configuración: **${outcome(env.CONFIG_OUTCOME)}**.`, '',
    staticSummary(staticReports, env),
    ...(report ? Object.entries(groups).map(([type, cases]) => `- ${type}: ${counts(cases)}.`)
      : ['**No se generó el informe Jest.** Los estados anteriores distinguen fallo de instalación, pruebas fallidas y etapas omitidas.']),
    '', 'Regresión: reutiliza esta misma suite; no duplica el número de casos.',
    'HTTP real y Android se informan en sus propias etapas. La inspección k6 no acredita rendimiento.', '',
    '| Tipo | Archivo | Caso | Resultado |', '|---|---|---|---|', ...rows, '',
    'Los resultados ordinarios quedan en este resumen y en los logs. Los informes compactos se conservan ante fallo o en candidatas de entrega.', '',
  ].join('\n');
}
module.exports = { clientSummary };
if (require.main === module) {
  const file = 'test-results/jest.json';
  const staticReports = Object.fromEntries(['eslint', 'typescript'].map((tool) => {
    const file = 'test-results/static-analysis/' + tool + '.json';
    let report = null;
    try { report = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* Se informa explícitamente que falta el reporte. */ }
    return [tool, report];
  }));
  const text = clientSummary(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null, process.env, staticReports);
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/client-summary.md', text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  else process.stdout.write(text);
}

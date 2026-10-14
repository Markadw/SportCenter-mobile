const fs = require('node:fs');
const path = require('node:path');

const reportPath = 'test-results/jest.json';
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const escapeCell = (value) => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
let markdown;

if (!fs.existsSync(reportPath)) {
  markdown = '# Pruebas de Sport Center Mobile\n\nNo se generó el reporte de pruebas. Consultar los pasos anteriores del workflow.\n';
} else {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const integrationCount = report.testResults.filter((suite) => /tests[\\/]integration[\\/]/.test(suite.name))
    .reduce((sum, suite) => sum + suite.assertionResults.length, 0);
  const result = report.success ? 'Aprobadas' : 'Consultar fallos';
  const staticResult = process.env.LINT_OUTCOME === 'success' && process.env.TYPES_OUTCOME === 'success'
    ? 'Aprobado' : 'Consultar pasos de lint y TypeScript';
  const rows = report.testResults.flatMap((suite) => suite.assertionResults.map((test) => {
    const status = test.status === 'passed' ? '✅ Aprobada' : test.status === 'failed' ? '❌ Fallida' : '⏸ Pendiente';
    const type = /tests[\\/]integration[\\/]/.test(suite.name) ? 'Integración cliente' : 'Unitaria / componente';
    return `| ${type} | ${escapeCell(path.basename(suite.name))} | ${escapeCell(test.fullName)} | ${status} |`;
  }));
  markdown = [
    '# Pruebas de Sport Center Mobile',
    '',
    `**Total: ${report.numTotalTests} · Aprobadas: ${report.numPassedTests} · Fallidas: ${report.numFailedTests} · Pendientes: ${report.numPendingTests}**`,
    '',
    `Suites: ${report.numPassedTestSuites}/${report.numTotalTestSuites} aprobadas.`,
    '',
    '## Tipos previstos en la planeación integrada',
    '',
    '| Tipo | Resultado y alcance |',
    '|---|---|',
    `| Análisis estático | ${staticResult} |`,
    `| Unitarias y componentes | ${report.numTotalTests - integrationCount} casos: ${result} |`,
    `| Integración del cliente | ${integrationCount} casos: ${result}; transporte HTTP simulado |`,
    '| Integración HTTP real | Suite separada en Pipeline 2; no ejecutada por el pipeline del cliente |',
    `| Regresión afectada | ${result}; reutiliza los mismos ${report.numTotalTests} casos, sin duplicar el conteo |`,
    '| Aceptación Android | Flujos Maestro preparados. No ejecutados sin APK/dispositivo |',
    '| Rendimiento | Guion k6 preparado. Su inspección no mide el backend ni Android |',
    '| Estrés | Guion k6 y recuperación preparados. No ejecutados sobre la API compartida |',
    '',
    'Fuente: Planeacion_Integrada_SportCenter_Mobile.docx, secciones 10–15. Matriz completa y grupos CP: tests/plan.json.',
    '',
    'Alcance: HU-03 (catálogo y filtros), HU-04 (detalle) y MOB-004 (consumo de datos simulado). No certifica la API real ni Android físico.',
    '',
    '| Tipo | Archivo | Caso | Resultado |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');

  const coveragePath = 'coverage/coverage-summary.json';
  if (fs.existsSync(coveragePath)) {
    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    const moduleCount = Object.keys(coverage).filter((key) => key !== 'total').length;
    markdown += `\nCobertura de líneas: **${coverage.total.lines.pct}%** sobre ${moduleCount} módulos seleccionados. No representa toda la aplicación.\n`;
  }
  markdown += '\nReportes JSON y cobertura disponibles en el artefacto **sport-center-mobile-test-evidence**.\n';
}

if (summaryPath) {
  fs.appendFileSync(summaryPath, markdown);
} else {
  process.stdout.write(markdown);
}

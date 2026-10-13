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
  const rows = report.testResults.flatMap((suite) => suite.assertionResults.map((test) => {
    const status = test.status === 'passed' ? '✅ Aprobada' : test.status === 'failed' ? '❌ Fallida' : '⏸ Pendiente';
    return `| ${escapeCell(path.basename(suite.name))} | ${escapeCell(test.fullName)} | ${status} |`;
  }));
  markdown = [
    '# Pruebas de Sport Center Mobile',
    '',
    `**Total: ${report.numTotalTests} · Aprobadas: ${report.numPassedTests} · Fallidas: ${report.numFailedTests} · Pendientes: ${report.numPendingTests}**`,
    '',
    `Suites: ${report.numPassedTestSuites}/${report.numTotalTestSuites} aprobadas.`,
    '',
    'Alcance: HU-03 (catálogo y filtros), HU-04 (detalle) y MOB-004 (consumo de datos simulado). No certifica la API real ni Android físico.',
    '',
    '| Archivo | Caso | Resultado |',
    '|---|---|---|',
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

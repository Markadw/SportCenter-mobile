const fs = require('node:fs');
function apiSummary(report, env = {}) {
  if (!report) {
    const reason = env.INSTALL_OUTCOME === 'failure' ? 'Falló la instalación de dependencias.'
      : env.TEST_OUTCOME === 'failure' ? 'Falló la suite HTTP antes de producir un informe.'
        : 'La suite HTTP no llegó a ejecutarse; revisar las etapas previas.';
    return `# Integración HTTP real\n\n**Sin informe**. ${reason}\n`;
  }
  const clean = (value) => String(value).replace(/[\r\n]/g, ' ');
  return [
    '# Integración HTTP real', '',
    `Total: **${report.numTotalTests}** · Aprobadas: **${report.numPassedTests}** · Fallidas: **${report.numFailedTests}** · Pendientes: **${report.numPendingTests}**.`, '',
    'Lecturas de catálogo/detalle y rechazo de perfil sin sesión. No crea datos ni valida compra o sesión completa.', '',
    ...report.testResults.flatMap((suite) => suite.assertionResults.map((test) => `- ${test.status}: ${clean(test.fullName)}`)), '',
  ].join('\n');
}
module.exports = { apiSummary };
if (require.main === module) {
  const file = 'test-results/api.json';
  let text = apiSummary(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null, process.env);
  if (process.env.LOCAL_TEST_OUTCOME) {
    const localFile = 'test-results/api-local.json';
    text += '\n## Contratos contra la copia local reproducible\n\n';
    text += apiSummary(fs.existsSync(localFile) ? JSON.parse(fs.readFileSync(localFile, 'utf8')) : null,
      { TEST_OUTCOME: process.env.LOCAL_TEST_OUTCOME });
    text += '\nSon los mismos cuatro contratos en otro entorno; no se cuentan como casos únicos adicionales.\n';
  }
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/api-summary.md', text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  else process.stdout.write(text);
}

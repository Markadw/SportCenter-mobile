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
function dastSummary(report, outcome) {
  const known = ['success', 'failure', 'skipped', 'cancelled'];
  const step = known.includes(outcome) ? outcome : 'sin resultado';
  const complete = report?.version === 1 && report.expectedChecks === 6 && report.executedChecks === 6 &&
    Array.isArray(report.checks) && report.checks.length === 6 && report.checks.every((item, index) =>
      item.id === 'D0' + (index + 1) && item.status === 'passed' && Number.isInteger(item.httpStatus) &&
      (index === 0 ? item.httpStatus === 200 : index < 4 ? [401, 403].includes(item.httpStatus) : item.httpStatus === 400));
  const passed = step === 'success' && complete && report.status === 'passed_for_executed_scope';
  return ['\n## Seguridad HTTP de la copia aislada', '', 'Paso: **' + step + '**. Resultado: **' +
    (passed ? 'aprobado para seis casos locales' : 'sin aprobación acreditada') + '**.', '',
    'Informe: test-results/security/dast-local.json. Backend QA congelado; no acredita todas las rutas de Render, TLS nativo, cuentas reales o Play.', ''].join('\n');
}
const COMMERCE_CASES = ['IQ01_OWN_LISTS', 'IQ02_DETAIL_TIMELINE', 'IQ03_OTHER_OWNER_DENIED',
  'IQ04_ELIGIBILITY_OWNER', 'IQ05_INELIGIBLE_POST_DENIED', 'IQ06_INVALID_RATING_DENIED',
  'IQ07_SHORT_COMMENT_DENIED', 'IQ08_REVIEW_PERSISTED', 'IQ09_DUPLICATE_DENIED',
  'IQ10_AFTER_PUBLICATION', 'IQ11_PUBLIC_READ_SUMMARY', 'IQ12_ADDRESS_CHECKOUT_READ_ONLY'];
function commerceSummary(report, outcome) {
  const step = ['success', 'failure', 'skipped', 'cancelled'].includes(outcome) ? outcome : 'sin resultado';
  const complete = report?.schemaVersion === 1 && report.scope === 'real-local-backend-synthetic-data-not-payment' &&
    report.status === 'passed' && report.errorCode === 'NONE' && Array.isArray(report.cases) &&
    report.cases.length === COMMERCE_CASES.length && report.cases.every((item,index) => item.id === COMMERCE_CASES[index] && item.status === 'passed') &&
    Array.isArray(report.logout) && report.logout.length === 2 && report.logout.every(value => value === true);
  const approved = step === 'success' && complete;
  return ['\n## Comercio con fixtures sintéticas aisladas', '', 'Paso: **' + step + '**. Resultado: **' +
    (approved ? 'aprobado para doce contratos locales' : 'sin aprobación acreditada') + '**.', '',
    'Informe: test-results/commerce-api.json. Pedidos propios, rechazo de acceso ajeno, seguimiento, elegibilidad, validaciones, publicación sintética y resumen/dirección.', '',
    'Usa backend QA congelado y datos sintéticos; no acredita Android, compra/cobro/entrega reales, Mercado Pago ni paridad de constraints productivos.', ''].join('\n');
}
module.exports = { apiSummary, dastSummary, commerceSummary, COMMERCE_CASES };
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
  if (process.env.DAST_OUTCOME) {
    let report;
    try { report = JSON.parse(fs.readFileSync('test-results/security/dast-local.json', 'utf8')); } catch { /* No aprobar sin informe válido. */ }
    text += dastSummary(report, process.env.DAST_OUTCOME);
  }
  if (process.env.COMMERCE_OUTCOME) {
    let report;
    try { report = JSON.parse(fs.readFileSync('test-results/commerce-api.json', 'utf8')); } catch { /* Sin aprobación cuando falte evidencia. */ }
    text += commerceSummary(report, process.env.COMMERCE_OUTCOME);
  }
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/api-summary.md', text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  else process.stdout.write(text);
}

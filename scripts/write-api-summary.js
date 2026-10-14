const fs = require('node:fs');
const target = process.env.GITHUB_STEP_SUMMARY;
let text = '# Integración HTTP real de Sport Center Mobile\n\n';
if (fs.existsSync('test-results/api.json')) {
  const report = JSON.parse(fs.readFileSync('test-results/api.json', 'utf8'));
  text += `Total: **${report.numTotalTests}** · Aprobadas: **${report.numPassedTests}** · Fallidas: **${report.numFailedTests}**.\n\n`;
  text += 'Lecturas de catálogo/detalle y rechazo de perfil sin sesión. No crea datos ni valida compra, sesión completa o aceptación Android.\n\n';
  for (const suite of report.testResults) {
    for (const test of suite.assertionResults) text += `- ${test.status}: ${test.fullName.replace(/[\r\n]/g, ' ')}\n`;
  }
} else {
  text += 'No ejecutado: no se generó reporte HTTP. Consultar instalación y precondiciones.\n';
}
if (target) fs.appendFileSync(target, text);
else process.stdout.write(text);

const fs = require('node:fs');
let status = 'not_run';
try { status = JSON.parse(fs.readFileSync('test-results/android-pinning.json', 'utf8')).status; } catch { /* El informe ausente no acredita ejecución. */ }
const passed = status === 'passed_controlled_native_rejection';
const text = '\n## Rechazo nativo bajo MITM\n\n' + (passed
  ? 'Aprobado para el alcance controlado: mismo APK release, CA system aceptada por una imagen, rechazo de la API interceptada y recuperación.\n'
  : 'Sin aprobación: falta completar los controles nativos. Consultar el resultado del job y su informe saneado.\n')
  + '\nEl evento genérico de fallo TLS no identifica por sí solo una excepción de pinning. No prueba compras ni seguridad completa.\n';
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
process.stdout.write(text);
if (!passed) process.exitCode = 1;

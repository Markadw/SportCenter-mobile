const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

if (!process.env.API_BASE_URL) {
  console.error('No ejecutado: definir API_BASE_URL para la suite HTTP real.');
  process.exit(2);
}
const target = new URL(process.env.API_BASE_URL);
if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash) {
  throw new Error('API_BASE_URL debe ser una URL HTTP sin credenciales ni parámetros.');
}
fs.mkdirSync('test-results', { recursive: true });
fs.rmSync('test-results/api.json', { force: true });
const result = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '--config', 'jest.api.config.js',
  '--ci', '--runInBand', '--verbose', '--json', '--outputFile=test-results/api.json'], { stdio: 'inherit' });
process.exit(result.status ?? 1);

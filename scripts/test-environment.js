const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { waitForService } = require('./wait-for-service');
const root = path.resolve(__dirname, '..');
const source = require('../tests/environment/backend-source.json');
const checkout = path.join(root, '.qa', 'backend');
const composeFile = path.join(root, 'tests', 'environment', 'compose.yml');

function command(program, args, options = {}) {
  return execFileSync(program, args, { cwd: root, stdio: 'inherit', ...options });
}
function compose(args) {
  return command('docker', ['compose', '-f', composeFile, ...args]);
}
function validateTestEnvironment(config) {
  assert.equal(config.networks.isolated.internal, true, 'La red de datos y carga debe ser interna.');
  const networks = (service) => Array.isArray(service.networks) ? service.networks : Object.keys(service.networks || {});
  for (const name of ['api', 'db', 'k6']) {
    assert.deepEqual(networks(config.services[name]), ['isolated'], name + ' debe permanecer en la red aislada.');
  }
  assert.ok(!(config.services.db.ports || []).length, 'PostgreSQL no debe exponerse en el host.');
  for (const name of ['ADMIN','EDITOR','READER','BACKUP']) {
    const target = new URL(config.services.api.environment['DATABASE_URL_' + name]);
    assert.equal(target.hostname, 'db', 'La API sólo puede conectar con PostgreSQL del entorno.');
    assert.equal(target.pathname, '/sportcenter_qa');
  }
  assert.equal(config.services.k6.environment.API_BASE_URL, 'http://api:3000', 'La carga sólo puede apuntar a la copia local.');
  const ports = config.services.access.ports;
  assert.ok(ports.length === 1 && (typeof ports[0] === 'string' ? ports[0].startsWith('127.0.0.1:') : ports[0].host_ip === '127.0.0.1'),
    'La entrada debe limitarse a localhost.');
}
function prepare() {
  assert.equal(path.relative(root, checkout), path.join('.qa', 'backend'));
  const config = JSON.parse(command('docker', ['compose', '-f', composeFile, '--profile', 'measurement', 'config', '--format', 'json'],
    { encoding: 'utf8', stdio: 'pipe' }));
  validateTestEnvironment(config);
  if (!fs.existsSync(path.join(checkout, '.git'))) {
    fs.mkdirSync(path.dirname(checkout), { recursive: true });
    command('git', ['clone', '--quiet', '--depth', '1', source.repository, checkout]);
    command('git', ['-C', checkout, 'fetch', '--quiet', '--depth', '1', 'origin', source.commit]);
    command('git', ['-C', checkout, 'checkout', '--quiet', '--detach', source.commit]);
  }
  const current = command('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: 'pipe' }).trim();
  assert.equal(current, source.commit, 'El backend local no coincide con la revisión fijada.');
  const dirty = command('git', ['-C', checkout, 'status', '--porcelain'], { encoding: 'utf8', stdio: 'pipe' }).trim();
  assert.equal(dirty, '', 'La copia local contiene cambios; revisarlos antes de preparar el entorno.');
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
}
async function main(mode) {
  if (mode === 'prepare') { prepare(); return; }
  if (mode === 'stop') { compose(['down']); return; }
  if (mode === 'status') { compose(['ps']); return; }
  if (mode !== 'start') throw new Error('Usar start, stop, status o prepare.');
  prepare();
  compose(['up', '--build', '-d', 'access']);
  const result = await waitForService({ apiUrl: 'http://127.0.0.1:3011', timeout: 120000 });
  const proof = { ...result, backendCommit: source.commit, productId: 66,
    seed: { products: 100, variants: 200 }, apiUrl: 'http://127.0.0.1:3011' };
  fs.writeFileSync(path.join(root, 'test-results', 'local-environment.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log('API local preparada en http://127.0.0.1:3011; PostgreSQL y red aislados.');
}
module.exports = { compose, prepare, validateTestEnvironment, start: () => main('start') };
if (require.main === module) main(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });

require('/app/node_modules/reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DataSource } = require('/app/node_modules/typeorm');

async function main() {
  assert.equal(process.env.ISOLATED_TEST_ENV, 'true', 'El arranque de prueba exige aislamiento.');
  const url = new URL(process.env.DATABASE_URL_ADMIN);
  assert.equal(url.hostname, 'db', 'Sólo se permite la base del compose de pruebas.');
  assert.equal(url.pathname, '/sportcenter_qa');
  const db = new DataSource({ type: 'postgres', url: url.toString(), ssl: false,
    entities: ['/app/dist/**/*.entity.js'], synchronize: false, logging: false });
  await db.initialize();
  const existing = await db.query("SELECT to_regclass('core.products') AS name");
  if (!existing[0].name) await db.synchronize();
  await db.query(fs.readFileSync('/qa/seed.sql', 'utf8'));
  await db.destroy();
  console.log('Base aislada preparada: 100 productos y 200 variantes sintéticos.');
  require('/app/dist/src/main.js');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

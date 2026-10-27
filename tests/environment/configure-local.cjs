const fs = require('node:fs');
const assert = require('node:assert/strict');
const file = '/app/src/app.module.ts';
let source = fs.readFileSync(file, 'utf8');
assert.equal((source.match(/ssl: true,/g) || []).length, 4, 'Revisar las conexiones del backend antes de adaptar TLS local.');
assert.equal((source.match(/rejectUnauthorized: false,/g) || []).length, 4);
source = source.replace(/ssl: true,/g, 'ssl: false,')
  .replace(/ssl: \{\s*rejectUnauthorized: false,\s*\},/g, 'ssl: false,');
fs.writeFileSync(file, source);

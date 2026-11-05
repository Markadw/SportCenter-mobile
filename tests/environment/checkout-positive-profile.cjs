'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');

const BACKEND_COMMIT = '31ee304d902ec5ec5a9c0fc702eca5e1a531bc16';
const NODE_IMAGE = 'node:22.20.0-bookworm-slim@sha256:b21fe589dfbe5cc39365d0544b9be3f1f33f55f3c86c87a76ff65a02f8f5848e';
const POSTGRES_IMAGE = 'postgres@sha256:5fe8ca7fc662071188c30271cb870d1ce9a6ec4578c934b064697ae77a9241e1';

function validateCallback(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.match(url.hostname, /^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/);
  assert.equal(url.port + url.username + url.password + url.search + url.hash, '');
  assert.equal(url.pathname, '/');
  return url.origin;
}

// Perfil independiente: no cambia compose.yml ni permite conectar una base externa.
// El llamador debe acreditar que controla el túnel; el formato de URL no lo demuestra.
function createPositiveProfile({ root, project, callbackUrl }) {
  assert.ok(path.isAbsolute(root), 'QA_ROOT_ABSOLUTE_REQUIRED');
  assert.match(project, /^sc-checkout-positive-[0-9]+$/);
  const frontend = validateCallback(callbackUrl);
  const qa = file => path.join(root, 'tests', 'environment', file);
  const common = { cpus: 1, mem_limit: '512m' };
  const database = {
    DATABASE_URL_ADMIN: 'postgres://qa_admin:qa-admin-local@db:5432/sportcenter_qa',
    DATABASE_URL_EDITOR: 'postgres://qa_editor:qa-editor-local@db:5432/sportcenter_qa',
    DATABASE_URL_READER: 'postgres://qa_reader:qa-reader-local@db:5432/sportcenter_qa',
    DATABASE_URL_BACKUP: 'postgres://qa_backup:qa-backup-local@db:5432/sportcenter_qa',
  };
  const mount = (file, target = '/qa/' + file) => ({ type: 'bind', source: qa(file), target, read_only: true });
  return {
    name: project,
    services: {
      db: {
        ...common, image: POSTGRES_IMAGE,
        environment: { POSTGRES_DB: 'sportcenter_qa', POSTGRES_USER: 'qa_admin', POSTGRES_PASSWORD: 'qa-admin-local' },
        tmpfs: ['/var/lib/postgresql/data:rw,size=268435456'],
        volumes: [mount('schema.sql', '/docker-entrypoint-initdb.d/00-schema.sql')],
        healthcheck: { test: ['CMD-SHELL', 'pg_isready -U qa_admin -d sportcenter_qa'], interval: '2s', timeout: '2s', retries: 30 },
        networks: ['isolated'],
      },
      api: {
        ...common, image: 'sportcenter-local-qa:31ee304d902e',
        environment: {
          ...database, ISOLATED_TEST_ENV: 'true', QA_COMMERCE: 'true', QA_CHECKOUT_POSITIVE: 'true',
          QA_EXPECTED_SELLER_ID: '3497260719', API_BASE_URL: 'http://127.0.0.1:3000',
          JWT_SECRET: 'qa-local-access-secret', JWT_REFRESH_SECRET: 'qa-local-refresh-secret',
          R2_ENDPOINT: 'http://storage.invalid', R2_ACCESS_KEY_ID: 'qa-local', R2_SECRET_ACCESS_KEY: 'qa-local', R2_BUCKET_NAME: 'qa-local',
          MERCADO_PAGO_ACCESS_TOKEN: '${QA_MERCADO_PAGO_ACCESS_TOKEN:?QA_TEST_TOKEN_REQUIRED}',
          FRONTEND_URL: frontend, BACKEND_PUBLIC_URL: 'http://localhost:3000',
          MERCADO_PAGO_WEBHOOK_URL: 'http://127.0.0.1:3000/disabled',
          HTTP_PROXY: 'http://egress:8080', HTTPS_PROXY: 'http://egress:8080', NO_PROXY: 'localhost,127.0.0.1,db',
        },
        volumes: [mount('checkout-positive.cjs'), mount('commerce-isolated.cjs')],
        depends_on: { db: { condition: 'service_healthy' }, egress: { condition: 'service_started' } },
        networks: ['isolated'],
      },
      egress: {
        image: NODE_IMAGE, command: ['node', '/qa/checkout-positive-network.cjs', 'proxy'],
        environment: { QA_CHECKOUT_POSITIVE: 'true' },
        volumes: [mount('checkout-positive-network.cjs')],
        cpus: 0.25, mem_limit: '96m', networks: ['isolated', 'provider'],
      },
      access: {
        image: NODE_IMAGE, command: ['node', '/qa/access.cjs'],
        environment: { ISOLATED_TEST_ENV: 'true', QA_COMMERCE: 'true' },
        volumes: [mount('access.cjs'), mount('commerce-isolated.cjs')],
        depends_on: ['api'], ports: ['127.0.0.1::3000'],
        cpus: 0.25, mem_limit: '64m', networks: ['isolated', 'access'],
      },
    },
    networks: { isolated: { internal: true }, provider: {}, access: {} },
  };
}

module.exports = { BACKEND_COMMIT, NODE_IMAGE, POSTGRES_IMAGE, validateCallback, createPositiveProfile };

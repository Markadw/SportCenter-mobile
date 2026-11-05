/** @jest-environment node */
const { describe, test, expect, jest, beforeEach } = require('@jest/globals');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { guardRun, containerAcceptance, validateReport } = require('../tests/environment/checkout-isolated.cjs');
const source = require('../tests/environment/backend-source.json');

function config() {
  const value = YAML.parse(fs.readFileSync(path.join(__dirname, '../tests/environment/compose.yml'), 'utf8'));
  value.services.access.environment.QA_COMMERCE = 'true';
  return value;
}
const flags = { ISOLATED_TEST_ENV: 'true', QA_COMMERCE: 'true', QA_CHECKOUT: 'true' };

describe('escritura checkout exclusivamente local y sin proveedores', () => {
  test('acepta la copia fijada y aislada', () => {
    expect(() => guardRun(flags, config(), source, source.commit, '')).not.toThrow();
  });
  test.each(Object.keys(flags))('no permite omitir %s', flag => {
    expect(() => guardRun({ ...flags, [flag]: undefined }, config(), source, source.commit, '')).toThrow();
  });
  test.each([
    ['base externa', value => { value.services.api.environment.DATABASE_URL_ADMIN = 'postgres://qa:qa@production.invalid/sportcenter_qa'; }],
    ['red con salida', value => { value.networks.isolated.internal = false; }],
    ['API publicada', value => { value.services.api.ports = ['3000:3000']; }],
    ['proxy público', value => { value.services.access.ports = ['0.0.0.0:3011:3000']; }],
    ['imagen diferente', value => { value.services.api.image = 'backend:latest'; }],
  ])('rechaza %s antes de preparar datos', (_label, change) => {
    const value = config(); change(value);
    expect(() => guardRun(flags, value, source, source.commit, '')).toThrow();
  });
  test.each(['MERCADO_PAGO_ACCESS_TOKEN', 'SMTP_HOST', 'MAIL_HOST', 'EMAIL_API_KEY', 'SENDGRID_API_KEY'])('rechaza proveedor %s', key => {
    const value = config(); value.services.api.environment[key] = 'qa-placeholder';
    expect(() => guardRun(flags, value, source, source.commit, '')).toThrow();
  });
  test('rechaza un backend distinto o modificado', () => {
    expect(() => guardRun(flags, config(), source, 'other', '')).toThrow();
    expect(() => guardRun(flags, config(), source, source.commit, ' M service.ts')).toThrow();
  });
  test('sin opt-in no abre base ni hace HTTP', async () => {
    const Client = jest.fn(), fetchImpl = jest.fn();
    const report = await containerAcceptance({ env: {}, Client, fetchImpl });
    expect(Client).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
    expect(report.status).toBe('failed'); expect(report.cases).toEqual([]);
    expect(report.flags.positivePersistencePending).toBe(true);
    expect(() => validateReport(report)).not.toThrow();
  });
  test('una fuente de servicio alterada detiene la ejecución antes de conectar', async () => {
    const env = { ...flags };
    for (const role of ['ADMIN', 'EDITOR', 'READER', 'BACKUP']) env['DATABASE_URL_' + role] = 'postgres://qa:qa@db/sportcenter_qa';
    const Client = jest.fn(), fetchImpl = jest.fn();
    const report = await containerAcceptance({ env, Client, fetchImpl, readFile: () => Buffer.from('changed') });
    expect(Client).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
    expect(report.flags.sourcePinned).toBe(false); expect(report.status).toBe('failed');
  });
});

describe('evidencia acotada: rollback no significa HU06 terminada', () => {
  let report;
  beforeEach(async () => { report = await containerAcceptance({ env: {} }); });
  test('impide declarar guardado positivo con este ejecutor', () => {
    report.flags.positivePersistencePending = false;
    expect(() => validateReport(report)).toThrow();
  });
  test.each(['accessToken', 'password', 'address', 'response', 'stack'])('no permite exportar %s', key => {
    report[key] = 'sensitive-placeholder';
    expect(() => validateReport(report)).toThrow();
  });
  test('rechaza detalles libres dentro de los resultados', () => {
    report.cases = [{ id: 'AD01_OWN_ADDRESS_AND_STOCK', status: 'failed', message: 'sensitive-placeholder' }];
    expect(() => validateReport(report)).toThrow();
  });
  test('no acepta éxito sin todos los controles y limpieza', () => {
    report.status = 'passed';
    expect(() => validateReport(report)).toThrow();
  });
});

const { describe, test, expect } = require('@jest/globals');
const { createPositiveProfile, validateCallback } = require('../tests/environment/checkout-positive-profile.cjs');
const path = require('node:path');

const options = { root: path.resolve(__dirname, '..'), project: 'sc-checkout-positive-123', callbackUrl: 'https://sample-qa-return.trycloudflare.com' };

describe('perfil separado de checkout positivo', () => {
  test.each([
    'http://sample-qa-return.trycloudflare.com', 'https://back-sport-ghxk.onrender.com',
    'https://trycloudflare.com.evil.invalid', 'https://user:pass@sample-qa-return.trycloudflare.com',
    'https://sample-qa-return.trycloudflare.com/other', 'https://sample-qa-return.trycloudflare.com?token=bad',
  ])('rechaza un retorno distinto del formato QA: %s', value => {
    expect(() => validateCallback(value)).toThrow();
  });
  test('base y API permanecen internas; sólo el proxy tiene salida al proveedor', () => {
    const c = createPositiveProfile(options);
    expect(c.networks.isolated.internal).toBe(true);
    expect(c.services.db.networks).toEqual(['isolated']);
    expect(c.services.api.networks).toEqual(['isolated']);
    expect(c.services.egress.networks).toEqual(['isolated', 'provider']);
    expect(c.services.db.ports).toBeUndefined();
    expect(c.services.api.ports).toBeUndefined();
    expect(c.services.egress.ports).toBeUndefined();
    expect(c.services.access.ports).toEqual(['127.0.0.1::3000']);
  });
  test('fija todas las bases sintéticas y deja el secreto fuera de la configuración', () => {
    const env = createPositiveProfile(options).services.api.environment;
    for (const name of ['ADMIN', 'EDITOR', 'READER', 'BACKUP']) {
      const u = new URL(env['DATABASE_URL_' + name]);
      expect([u.hostname, u.pathname]).toEqual(['db', '/sportcenter_qa']);
    }
    expect(env.MERCADO_PAGO_ACCESS_TOKEN).toBe('${QA_MERCADO_PAGO_ACCESS_TOKEN:?QA_TEST_TOKEN_REQUIRED}');
    expect(env.QA_EXPECTED_SELLER_ID).toBe('3497260719');
    expect(env.MERCADO_PAGO_WEBHOOK_URL).toBe('http://127.0.0.1:3000/disabled');
    expect(env.HTTPS_PROXY).toBe('http://egress:8080');
    expect(env.NO_PROXY).toBe('localhost,127.0.0.1,db');
  });
  test('no acepta proyectos compartidos ni rutas relativas', () => {
    expect(() => createPositiveProfile({ ...options, root: '.' })).toThrow();
    expect(() => createPositiveProfile({ ...options, project: 'sportcenter-mobile-qa' })).toThrow();
  });
});

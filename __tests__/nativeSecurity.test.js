/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { describe, test, expect, jest: jestApi } = require('@jest/globals');
const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');
const { X509Certificate, createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { parseStringPromise } = require('xml2js');
const { buildNetworkSecurityConfig, validatePinConfig } = require('../plugins/with-network-security');
const { verifyCertificateChain, verifyApiPins } = require('../scripts/verify-api-pins');
const pins = require('../config/security-pins.json');
const app = require('../app.json').expo;
const eas = require('../eas.json');

function publicRoot() {
  return tls.rootCertificates.map((pem) => new X509Certificate(pem)).find((certificate) =>
    Date.parse(certificate.validFrom) < Date.now() && Date.parse(certificate.validTo) > Date.now() &&
    certificate.verify(certificate.publicKey));
}
function testChain() {
  const certificate = publicRoot();
  if (!certificate) throw new Error('Node no dispone de una CA pública vigente para las pruebas sin red.');
  const peer = { raw: certificate.raw };
  peer.issuerCertificate = peer;
  const sha256 = createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
  return { peer, config: { domain: pins.domain, pins: [{ sha256 }, { sha256: 'A'.repeat(43) + '=' }] } };
}

describe('CNG de seguridad de red Android', () => {
  test.each(['preview', 'production', undefined])('perfil %s bloquea HTTP, CA de usuario y bypass por expiración', async (profile) => {
    const xml = buildNetworkSecurityConfig(pins, profile);
    const parsed = (await parseStringPromise(xml))['network-security-config'];
    expect(parsed['base-config'][0].$.cleartextTrafficPermitted).toBe('false');
    expect(parsed['domain-config']).toHaveLength(1);
    const api = parsed['domain-config'][0];
    expect(api.$.cleartextTrafficPermitted).toBe('false');
    expect(api.domain).toEqual([{ _: pins.domain, $: { includeSubdomains: 'false' } }]);
    expect(api['pin-set'][0].pin).toHaveLength(2);
    expect(api['pin-set'][0].$).toBeUndefined();
    expect(xml).not.toMatch(/src="user"|overridePins|expiration=|debug-overrides|cleartextTrafficPermitted="true"/);
    expect(parsed['base-config'][0]['trust-anchors'][0].certificates).toEqual([{ $: { src: 'system' } }]);
  });

  test('sólo development permite HTTP para hosts concretos de Metro y conserva pinning HTTPS en la API', async () => {
    const xml = buildNetworkSecurityConfig(pins, 'development');
    const parsed = (await parseStringPromise(xml))['network-security-config'];
    expect(parsed['base-config'][0].$.cleartextTrafficPermitted).toBe('false');
    const [api, metro] = parsed['domain-config'];
    expect(api.$.cleartextTrafficPermitted).toBe('false');
    expect(api['pin-set'][0].pin).toHaveLength(2);
    expect(metro.$.cleartextTrafficPermitted).toBe('true');
    expect(metro.domain.map((domain) => domain._)).toEqual(['localhost','127.0.0.1','10.0.2.2','10.0.3.2']);
    expect(metro.domain.every((domain) => domain.$.includeSubdomains === 'false')).toBe(true);
  });

  test.each([
    {}, { ...pins, domain: 'onrender.com' }, { ...pins, domain: '*.onrender.com' },
    { ...pins, pins: pins.pins.slice(0,1) }, { ...pins, pins: [pins.pins[0], pins.pins[0]] },
    { ...pins, pins: [{ sha256: 'no-es-pin' }, pins.pins[1]] },
    { ...pins, pins: [{ sha256: 'B'.repeat(43) + '=' }, pins.pins[1]] },
  ])('configuración inválida falla antes de generar XML: %#', (config) => {
    expect(() => validatePinConfig(config)).toThrow();
    expect(() => buildNetworkSecurityConfig(config, 'production')).toThrow();
  });

  test('el plugin enlaza el manifest y genera XML por mods de Expo, sin archivos nativos de fuente', () => {
    const plugin = fs.readFileSync(path.join(__dirname,'../plugins/with-network-security.js'),'utf8');
    expect(plugin).toContain("require('expo/config-plugins')");
    expect(plugin).toContain('withAndroidManifest');
    expect(plugin).toContain('withDangerousMod');
    expect(plugin).toContain("application.$['android:networkSecurityConfig'] = '@xml/network_security_config'");
    expect(app.plugins).toContain('./plugins/with-network-security');
    expect(fs.readFileSync(path.join(__dirname,'../.gitignore'),'utf8')).toContain('/android');
  });

  test('release habilita R8 y shrink sin reglas keep globales y excluye permisos no utilizados', () => {
    const build = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties')[1].android;
    expect(build).toMatchObject({ enableMinifyInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true, usesCleartextTraffic: false });
    expect(build.extraProguardRules).not.toMatch(/-keep\s+(?:class|interface)\s+(?:\*|\*\*|expo\.\*\*|com\.facebook\.\*\*)/);
    for (const permission of ['CAMERA','RECORD_AUDIO','READ_EXTERNAL_STORAGE','WRITE_EXTERNAL_STORAGE','READ_MEDIA_AUDIO','READ_MEDIA_IMAGES','READ_MEDIA_VIDEO']) {
      expect(app.android.blockedPermissions).toContain(`android.permission.${permission}`);
    }
    expect(app.android.permissions ?? []).not.toEqual(expect.arrayContaining(['android.permission.ACCESS_FINE_LOCATION']));
    expect(app.name).toBe('Sport Center');
    expect(app.android.versionCode).toBe(1);
    expect(app.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads).toBe(false);
  });

  test('EAS mantiene preview APK release y producción AAB, con development client separado', () => {
    expect(eas.build.development).toMatchObject({ developmentClient: true, distribution: 'internal' });
    expect(eas.build.preview).toMatchObject({ distribution: 'internal', android: { buildType: 'apk' } });
    expect(eas.build.preview.developmentClient).not.toBe(true);
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    for (const profile of ['development','preview','production']) expect(eas.build[profile].env.EXPO_PUBLIC_API_URL).toBe(`https://${pins.domain}`);
  });
});

describe('verificación TLS y SPKI sin requests de aplicación', () => {
  test('acepta una cadena autorizada con SPKI coincidente y verifica criptográficamente la clave', () => {
    const { peer, config } = testChain();
    expect(verifyCertificateChain(peer, config, true)).toMatchObject({ domain: pins.domain, matchedPins: [config.pins[0].sha256] });
  });
  test('rechaza un pin ajeno, una cadena no autorizada, ausente o expirada', () => {
    const { peer, config } = testChain();
    expect(() => verifyCertificateChain(peer, { ...config, pins: [{ sha256: createHash('sha256').update('otra-clave-1').digest('base64') }, { sha256: createHash('sha256').update('otra-clave-2').digest('base64') }] }, true)).toThrow('Ningún certificado');
    expect(() => verifyCertificateChain(peer, config, false)).toThrow('TLS rechazó');
    expect(() => verifyCertificateChain({}, config, true)).toThrow('cadena TLS verificable');
    expect(() => verifyCertificateChain(peer, config, true, Date.UTC(2100,0,1))).toThrow('fuera de vigencia');
  });
  test('rechaza un emisor que no firma la hoja de la cadena', () => {
    const { peer, config } = testChain();
    const other = tls.rootCertificates.map((pem) => new X509Certificate(pem)).find((cert) => !cert.raw.equals(peer.raw));
    peer.issuerCertificate = { raw: other.raw };
    expect(() => verifyCertificateChain(peer, config, true)).toThrow('firma');
  });
  test('la conexión exige CA e identidad TLS y nunca acepta rejectUnauthorized false', async () => {
    const socket = new EventEmitter();
    socket.destroy = jestApi.fn();
    socket.authorized = false;
    const connect = jestApi.fn(() => socket);
    const operation = verifyApiPins(pins, { connect, timeoutMs: 100 });
    socket.emit('secureConnect');
    await expect(operation).rejects.toThrow('TLS rechazó');
    expect(connect).toHaveBeenCalledWith({ host: pins.domain, servername: pins.domain, port: 443, rejectUnauthorized: true, minVersion: 'TLSv1.2' });
    expect(socket.destroy).toHaveBeenCalled();
  });
  test('timeout y errores de conexión fallan cerrados sin reintentar ni hacer HTTP', async () => {
    const socket = new EventEmitter();
    socket.destroy = jestApi.fn();
    const connect = jestApi.fn(() => socket);
    await expect(verifyApiPins(pins, { connect, timeoutMs: 5 })).rejects.toThrow('excedió');
    expect(connect).toHaveBeenCalledTimes(1);
    const operation = verifyApiPins(pins, { connect, timeoutMs: 100 });
    socket.emit('error', Object.assign(new Error('TLS'), { code: 'CERT_HAS_EXPIRED' }));
    await expect(operation).rejects.toThrow('CERT_HAS_EXPIRED');
    expect(() => verifyApiPins(pins, { timeoutMs: 15_001 })).toThrow('15000');
  });
});

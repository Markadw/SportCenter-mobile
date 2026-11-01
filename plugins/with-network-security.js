const { Buffer } = require('node:buffer');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const pins = require('../config/security-pins.json');

const API_DOMAIN = 'back-sport-ghxk.onrender.com';
const METRO_HOSTS = ['localhost', '127.0.0.1', '10.0.2.2', '10.0.3.2'];

function validatePinConfig(config) {
  if (!config || config.domain !== API_DOMAIN || !Array.isArray(config.pins) || config.pins.length < 2) {
    throw new Error('La API requiere su dominio exacto y al menos dos pines de respaldo.');
  }
  const values = config.pins.map((pin) => {
    if (!pin || typeof pin.sha256 !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(pin.sha256) ||
      Buffer.from(pin.sha256, 'base64').toString('base64') !== pin.sha256) {
      throw new Error('Cada pin debe ser una huella SPKI SHA-256 en base64 canónica.');
    }
    return pin.sha256;
  });
  if (new Set(values).size !== values.length) throw new Error('Los pines primario y de respaldo deben ser distintos.');
  return { domain: config.domain, pins: values };
}

function buildNetworkSecurityConfig(config, profile = process.env.EAS_BUILD_PROFILE) {
  const validated = validatePinConfig(config);
  const metro = profile === 'development' ? `
  <!-- Excepción de Metro limitada a desarrollo; la API mantiene su propia política. -->
  <domain-config cleartextTrafficPermitted="true">
${METRO_HOSTS.map((host) => `    <domain includeSubdomains="false">${host}</domain>`).join('\n')}
  </domain-config>` : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">${validated.domain}</domain>
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
    <pin-set>
${validated.pins.map((pin) => `      <pin digest="SHA-256">${pin}</pin>`).join('\n')}
    </pin-set>
  </domain-config>${metro}
</network-security-config>
`;
}

function withNetworkSecurity(config) {
  const xml = buildNetworkSecurityConfig(pins);
  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    application.$['android:usesCleartextTraffic'] = 'false';
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'network_security_config.xml'), xml, 'utf8');
    return mod;
  }]);
}

module.exports = withNetworkSecurity;
module.exports.buildNetworkSecurityConfig = buildNetworkSecurityConfig;
module.exports.validatePinConfig = validatePinConfig;

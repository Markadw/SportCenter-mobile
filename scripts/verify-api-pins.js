const tls = require('node:tls');
const { X509Certificate, createHash } = require('node:crypto');
const pins = require('../config/security-pins.json');
const { validatePinConfig } = require('../plugins/with-network-security');

function readCertificateChain(peer, now = Date.now()) {
  const chain = [];
  const seen = new Set();
  let current = peer;
  while (current?.raw) {
    const certificate = new X509Certificate(current.raw);
    if (seen.has(certificate.fingerprint256)) throw new Error('La cadena TLS contiene un ciclo inválido.');
    seen.add(certificate.fingerprint256);
    if (now < Date.parse(certificate.validFrom) || now > Date.parse(certificate.validTo)) {
      throw new Error('La cadena TLS contiene un certificado fuera de vigencia.');
    }
    const spki = certificate.publicKey.export({ type: 'spki', format: 'der' });
    chain.push({
      subject: certificate.subject,
      issuer: certificate.issuer,
      validTo: certificate.validTo,
      sha256: createHash('sha256').update(spki).digest('base64'),
    });
    const issuer = current.issuerCertificate;
    if (!issuer?.raw) break;
    const issuerCertificate = new X509Certificate(issuer.raw);
    if (issuerCertificate.fingerprint256 === certificate.fingerprint256) break;
    if (!certificate.checkIssued(issuerCertificate) || !certificate.verify(issuerCertificate.publicKey)) {
      throw new Error('No se pudo verificar la firma de la cadena TLS.');
    }
    current = issuer;
  }
  if (!chain.length) throw new Error('El servidor no entregó una cadena TLS verificable.');
  return chain;
}

function verifyCertificateChain(peer, config, authorized, now = Date.now()) {
  const validated = validatePinConfig(config);
  if (authorized !== true) throw new Error('TLS rechazó la confianza o la identidad del servidor.');
  const chain = readCertificateChain(peer, now);
  const matchedPins = validated.pins.filter((pin) => chain.some((certificate) => certificate.sha256 === pin));
  if (!matchedPins.length) throw new Error('Ningún certificado de la cadena TLS coincide con los pines configurados.');
  return { domain: validated.domain, verifiedAt: new Date(now).toISOString(), matchedPins, chain };
}

function verifyApiPins(config = pins, { connect = tls.connect, timeoutMs = 15_000 } = {}) {
  const validated = validatePinConfig(config);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) throw new Error('El límite TLS debe estar entre 1 y 15000 ms.');
  return new Promise((resolve, reject) => {
    let finished = false;
    let socket;
    let timer;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket?.destroy();
      if (error) reject(error); else resolve(result);
    };
    timer = setTimeout(() => finish(new Error('La verificación TLS excedió 15 segundos.')), timeoutMs);
    try {
      socket = connect({ host: validated.domain, port: 443, servername: validated.domain,
        rejectUnauthorized: true, minVersion: 'TLSv1.2' });
      socket.once('secureConnect', () => {
        try {
          if (!socket.authorized) throw new Error('TLS rechazó la cadena del servidor.');
          const peer = socket.getPeerCertificate(true);
          const identityError = tls.checkServerIdentity(validated.domain, peer);
          if (identityError) throw new Error('El certificado TLS no pertenece al dominio de la API.');
          finish(null, verifyCertificateChain(peer, config, socket.authorized));
        } catch (error) { finish(error); }
      });
      socket.once('error', (error) => finish(new Error(`No se pudo verificar TLS (${error.code || 'conexión rechazada'}).`)));
      socket.once('close', () => {
        if (!finished) finish(new Error('La conexión TLS terminó antes de verificarse.'));
      });
    } catch (error) { finish(error); }
  });
}

if (require.main === module) {
  verifyApiPins().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(`Verificación de pines fallida: ${error.message}`);
    process.exitCode = 1;
  });
}
module.exports = { readCertificateChain, verifyCertificateChain, verifyApiPins };

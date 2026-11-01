/** @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { test, expect, jest } = require('@jest/globals');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { TOOL, candidate, compiledPolicy, emulatorEvidence, minSdkEvidence, clockEvidence, verdict, playStorePresent, assertCaAbsent, readUiDump, visible, tapBounds, cleanEnv } = require('../scripts/android-pinning');
const { buildNetworkSecurityConfig } = require('../plugins/with-network-security');
const pinConfig = require('../config/security-pins.json');
const api = pinConfig.domain, image = 'http2.mlstatic.com';
const manifest = '<manifest><application android:networkSecurityConfig="@xml/network_security_config" android:debuggable="false"></application></manifest>';
const nsc = buildNetworkSecurityConfig(pinConfig, 'preview');
const policy = () => compiledPolicy(manifest, nsc, api, image, pinConfig.pins.map(p => p.sha256));
const digest = 'a'.repeat(64), commit = 'b'.repeat(40);
const env = { PINNING_CANDIDATE: 'true', GITHUB_REF: 'refs/tags/candidate/android-proof', GITHUB_SHA: commit,
  PINNING_EXPECTED_COMMIT: commit, PINNING_EXPECTED_BUILD_ID: 'build-1', PINNING_EXPECTED_SHA256: digest };
const meta = { buildId: 'build-1', commit, sha256: digest, emulatorApi: 34 };
const cert = { valid: true, pinMatches: false, caSha256: 'c'.repeat(64), leafSha256: 'd'.repeat(64) };
const event = (phase, event, host, connId, extra = {}) => ({ runId: 'this-run', phase, event, host, connId, ...extra });
function proof() {
  return [
    event('control', 'passthrough', api, 'baseline-api'),
    event('control', 'client_cert_ready', image, 'image', { cert }),
    event('control', 'client_tls_ok', image, 'image', { cert }),
    event('control', 'image_response', image, 'image', { status: 200 }),
    event('attack', 'intercept', api, 'new-api'),
    event('attack', 'server_tls_ok', api, 'new-api'),
    event('attack', 'client_cert_ready', api, 'new-api', { cert }),
    event('attack', 'client_tls_failed', api, 'new-api', { cert, failureCategory: 'certificate_rejected' }),
  ];
}
const context = () => ({ runId: 'this-run', compiled: policy(), caInstalled: true, caSha256: cert.caSha256,
  baselineUi: true, negativeUi: true, recoveryUi: true });

test('candidate reuses the API34 build, commit and exact APK bytes and rejects another candidate/branch', () => {
  expect(candidate(meta, digest, env).sha256).toBe(digest);
  for (const change of [{ GITHUB_REF: 'refs/heads/develop' }, { PINNING_CANDIDATE: 'false' },
    { PINNING_EXPECTED_BUILD_ID: 'other' }, { PINNING_EXPECTED_SHA256: 'd'.repeat(64) }, { PINNING_EXPECTED_COMMIT: 'e'.repeat(40) }]) {
    expect(() => candidate(meta, digest, { ...env, ...change })).toThrow();
  }
  expect(() => candidate(meta, 'd'.repeat(64), env)).toThrow();
  expect(() => candidate({ ...meta, emulatorApi: 30 }, digest, env)).toThrow();
});
test('compiled NSC accepts only the actual system-only release policy and exact pins', () => {
  expect(policy()).toMatchObject({ compiled: true, systemOnly: true, overridesPins: false });
  const variants = [
    nsc.replace('src="system"', 'src="user"'),
    nsc.replace('src="system"', 'src="system" overridePins="true"'),
    nsc.replace('<pin-set>', '<pin-set expiration="2030-01-01">'),
    nsc.replace('</network-security-config>', '<debug-overrides></debug-overrides></network-security-config>'),
    nsc.replace('includeSubdomains="false"', 'includeSubdomains="true"'),
    nsc.replace(api, 'other.example.test'), nsc.replace('</pin-set>', ''),
    '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///private">]>' + nsc,
  ];
  for (const variant of variants) expect(() => compiledPolicy(manifest, variant, api, image, pinConfig.pins.map(p => p.sha256))).toThrow();
  expect(() => compiledPolicy(manifest, nsc, api, api, pinConfig.pins.map(p => p.sha256))).toThrow();
  expect(() => compiledPolicy(manifest.replace('@xml/network_security_config', '@xml/unknown'), nsc, api, image, pinConfig.pins.map(p => p.sha256))).toThrow();
  expect(() => compiledPolicy(manifest, nsc, api, image, ['z'.repeat(43) + '='])).toThrow();
});
test('physical devices, Play builds, a different API, ABI or non-root adbd never qualify', () => {
  const properties = { serial: 'emulator-5554', sdk: '30', qemu: '1', type: 'userdebug', abi: 'x86_64', root: '0', playStore: false };
  expect(emulatorEvidence(properties).api).toBe(30);
  for (const change of [{ serial: 'physical-device' }, { sdk: '34' }, { qemu: '0' }, { type: 'user' }, { abi: 'arm64-v8a' }, { root: '2000' }, { playStore: true }]) {
    expect(() => emulatorEvidence({ ...properties, ...change })).toThrow();
  }
});
test('only the complete native differential control and recovery yields the limited verdict', () => {
  expect(verdict(proof(), context())).toMatchObject({ status: 'passed_controlled_native_rejection', nativePinExceptionCaptured: false });
});
test.each(['compiled', 'caInstalled', 'baselineUi', 'negativeUi', 'recoveryUi'])('missing %s blocks approval', key => {
  expect(() => verdict(proof(), { ...context(), [key]: false })).toThrow();
});
test('tls_failed_client alone is never evidence of pinning', () => {
  expect(() => verdict([event('attack', 'client_tls_failed', api, 'x', { cert })], context())).toThrow();
});
test.each(['passthrough', 'client_cert_ready', 'client_tls_ok', 'image_response', 'intercept', 'server_tls_ok', 'client_tls_failed'])('missing event %s is inconclusive', name => {
  expect(() => verdict(proof().filter(e => e.event !== name), context())).toThrow();
});
test.each([{ valid: false }, { pinMatches: true }, { caSha256: 'different-ca' }])('rejects invalid SAN/time/signature, matching pin or a different CA: %j', change => {
  const events = proof().map(e => e.event === 'client_tls_failed' ? { ...e, cert: { ...cert, ...change } } : e);
  expect(() => verdict(events, context())).toThrow();
});
test('image response must share a TLS connection whose certificate the APK accepted', () => {
  expect(() => verdict(proof().map(e => e.event === 'image_response' ? { ...e, connId: 'cached-or-other-client' } : e), context())).toThrow();
  expect(() => verdict(proof().map(e => e.event === 'image_response' ? { ...e, status: 503 } : e), context())).toThrow();
});
test.each(['api_http_received', 'client_tls_ok', 'passthrough', 'server_tls_failed'])('API %s contradicts successful rejection', name => {
  expect(() => verdict([...proof(), event('attack', name, api, 'new-api', { cert })], context())).toThrow();
});
test('a reused connection, unrelated run or forbidden request cannot pass', () => {
  expect(() => verdict(proof().map(e => e.phase === 'attack' ? { ...e, connId: 'baseline-api' } : e), context())).toThrow();
  expect(() => verdict([...proof(), { runId: 'other' }], context())).toThrow();
  expect(() => verdict([...proof(), event('control', 'forbidden_request', image, 'image')], context())).toThrow();
});
test('UI proof requires the app package and an unambiguous visible target', () => {
  const xml = '<node package="com.markadw.sportcenter" text="Catálogo" bounds="[0,10][100,50]"></node>';
  expect(visible(xml, 'Catálogo')).toBe(true); expect(tapBounds(xml, 'Catálogo')).toEqual([50, 30]);
  expect(visible(xml.replace('com.markadw.sportcenter', 'browser'), 'Catálogo')).toBe(false);
  expect(() => tapBounds(xml + xml, 'Catálogo')).toThrow();
});
test('tool download is immutable and child tools receive no credentials', () => {
  const installer = fs.readFileSync(path.join(__dirname, '../scripts/android-pinning-install.sh'), 'utf8');
  expect(installer).toContain(TOOL.url); expect(installer).toContain(TOOL.sha256);
  expect(cleanEnv({ PATH: '/bin', EXPO_TOKEN: 'secret', GITHUB_TOKEN: 'secret', API_PASSWORD: 'secret' })).toEqual({ PATH: '/bin' });
});
test('missing minSdk and incompatible APKs do not become numeric zero or pass API30', () => {
  expect(minSdkEvidence('24\n')).toBe(24);
  for (const value of ['', 'unknown', '0', '31', '24.5']) expect(() => minSdkEvidence(value)).toThrow();
});
test('a different emulator clock cannot masquerade as rejection of a time-valid certificate', () => {
  expect(clockEvidence('1700000000', 1700000000000)).toBe(true);
  expect(() => clockEvidence('', 1700000000000)).toThrow();
  expect(() => clockEvidence('1700000000', 1700000120000)).toThrow();
});



test('a certificate failure must follow upstream TLS and capture of that exact local certificate', () => {
  const events = proof();
  const ready = events.find(e => e.phase === 'attack' && e.event === 'client_cert_ready');
  expect(() => verdict(events.filter(e => e !== ready).concat(ready), context())).toThrow();
  expect(() => verdict(events.map(e => e === ready ? { ...e, cert: { ...cert, leafSha256: 'e'.repeat(64) } } : e), context())).toThrow();
  const server = events.find(e => e.phase === 'attack' && e.event === 'server_tls_ok');
  expect(() => verdict(events.filter(e => e !== server).concat(server), context())).toThrow();
});
test.each([undefined, 'other_or_ambiguous', 'protocol_error'])('generic TLS failure %s cannot masquerade as certificate rejection', failureCategory => {
  expect(() => verdict(proof().map(e => e.event === 'client_tls_failed' ? { ...e, failureCategory } : e), context())).toThrow();
});
test('Play Store absence uses list packages, not the pm path exit1 failure', async () => {
  const adb = jest.fn(async (...args) => {
    expect(args).toEqual(['shell', 'pm', 'list', 'packages', 'com.android.vending']);
    return '';
  });
  expect(await playStorePresent(adb)).toBe(false);
  expect(await playStorePresent(async () => 'package:com.android.vending\n')).toBe(true);
  expect(await playStorePresent(async () => 'package:com.android.vending.fake\n')).toBe(false);
  await expect(playStorePresent(async () => { throw Error('ADB transport failed'); })).rejects.toThrow('ADB transport failed');
});
test('the CA probe is valid remote-shell syntax and never opens a second unquoted sh -c', async () => {
  const shell = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : '/bin/sh';
  const adb = jest.fn(async (...args) => {
    expect(args[0]).toBe('shell'); expect(args).toHaveLength(2);
    const result = spawnSync(shell, ['-n', '-c', args.slice(1).join(' ')], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    return 'missing\n';
  });
  await assertCaAbsent(adb, '/system/etc/security/cacerts/1234abcd.0');
  const broken = spawnSync(shell, ['-n', '-c', 'sh -c ' + adb.mock.calls[0][1]], { encoding: 'utf8' });
  expect(broken.status).not.toBe(0);
  await expect(assertCaAbsent(async () => 'exists\n', '/system/etc/security/cacerts/1234abcd.0')).rejects.toThrow('Colisión');
  const unsafe = jest.fn(); await expect(assertCaAbsent(unsafe, '/tmp/cert;echo invalid')).rejects.toThrow();
  expect(unsafe).not.toHaveBeenCalled();
});
const uiDevice = '/data/local/tmp/sport-pinning-aabbccdd.xml';
const uiXml = '<hierarchy rotation="0"><node package="com.markadw.sportcenter" text="Catálogo" bounds="[0,10][100,50]"/></hierarchy>';
test.each(['', 'ERROR: could not get idle state.', 'ERROR: null root node returned by UiTestAutomationBridge.'])('UI dump exit0 without XML never reuses a stale capture: %s', output => {
  let stale = uiXml;
  const adb = jest.fn(async (...args) => {
    if (args[1] === 'rm') { stale = ''; return ''; }
    if (args[1] === 'uiautomator') return output;
    if (args[1] === 'cat') return stale;
    throw Error('Unexpected command');
  });
  return expect(readUiDump(adb, uiDevice)).resolves.toBe('').then(() => {
    expect(adb.mock.calls[0]).toEqual(['shell', 'rm', '-f', uiDevice]);
    expect(adb.mock.calls.some(args => args[1] === 'cat')).toBe(false);
  });
});
test('UI dump reads only a confirmed fresh complete hierarchy', async () => {
  const adb = jest.fn(async (...args) => args[1] === 'uiautomator' ? 'UI hierchary dumped to: ' + uiDevice : args[1] === 'cat' ? uiXml : '');
  expect(visible(await readUiDump(adb, uiDevice), 'Catálogo')).toBe(true);
  expect(await readUiDump(async (...args) => args[1] === 'uiautomator' ? 'UI hierchary dumped to: ' + uiDevice : '<hierarchy><node', uiDevice)).toBe('');
  await expect(readUiDump(async () => { throw Error('ADB unavailable'); }, uiDevice)).rejects.toThrow('ADB unavailable');
});
test('keylog environment variables cannot ask the TLS library to write traffic keys', () => {
  expect(cleanEnv({ PATH: '/bin', SSLKEYLOGFILE: '/private/keys', MITMPROXY_SSLKEYLOGFILE: '/private/keys' })).toEqual({ PATH: '/bin' });
});


// Ejecución opt-in con la distribución standalone12.3.1; usa sus APIs/crypto reales, sin red.
const realMitmTest = process.env.PINNING_TEST_MITMDUMP ? test : test.skip;
realMitmTest('mitmproxy12.3.1 real: TLSConfig elige el certificado antes del fallo y crypto rechaza variantes inválidas', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-pinning-crypto-'));
  try {
    const version = spawnSync(process.env.PINNING_TEST_MITMDUMP, ['--version'], { env: cleanEnv(process.env), encoding: 'utf8', timeout: 15000, windowsHide: true });
    expect(version.status).toBe(0); expect(version.stdout).toMatch(/^Mitmproxy:\s+12\.3\.1(?: binary)?\s*$/m);
    const config = { runId: 'offline-crypto', apiHost: api, imageHost: image, pins: pinConfig.pins.map(pin => pin.sha256),
      phaseFile: path.join(directory, 'phase'), events: path.join(directory, 'events.jsonl'), caFile: path.join(directory, 'selected-ca.pem') };
    fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify(config));
    fs.writeFileSync(config.phaseFile, 'attack');
    fs.writeFileSync(path.join(directory, 'checks.py'), String.raw`
import importlib.util
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from OpenSSL import SSL
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID
from mitmproxy import connection, ctx, tls
from mitmproxy.proxy.context import Context
from mitmproxy.proxy.layers.tls import TlsStartClientHook

spec = importlib.util.spec_from_file_location("pilot_under_test", os.environ["PINNING_PROXY_SOURCE"])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
pilot = module.addons[0]
checks = []
def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)

class Checks:
    async def running(self):
        result = {"passed": False, "checks": []}
        try:
            manager = ctx.master.addons
            observer = manager.get(module.ClientCertificateObserver.name)
            tlsconfig = manager.get("tlsconfig")
            check("observer_after_tlsconfig", observer is not None and manager.chain.index(observer) > manager.chain.index(tlsconfig))
            ca = tlsconfig.certstore.default_ca.to_cryptography()
            key = tlsconfig.certstore.default_privatekey
            Path(pilot.config["caFile"]).write_bytes(ca.public_bytes(serialization.Encoding.PEM))
            emitted = []
            pilot.emit = lambda event, connection=None, **fields: emitted.append({"event": event, **(connection or {}), **fields})
            client = connection.Client(peername=("127.0.0.1", 12345), sockname=("127.0.0.1", 18080))
            client.sni = pilot.config["apiHost"]
            context = Context(client, ctx.options)
            context.server.address = (client.sni, 443)
            pilot.connections[client.id] = {"phase": "attack", "host": client.sni, "connId": client.id}
            data = tls.TlsData(client, context)
            await manager.trigger_event(TlsStartClientHook(data))
            leaf = data.ssl_conn.get_certificate(as_cryptography=True)
            check("legacy_mitmcert_is_none", client.mitmcert is None)
            try:
                leaf.extensions.get_extension_for_class(x509.BasicConstraints)
                absent = False
            except x509.ExtensionNotFound:
                absent = True
            check("real_dummy_leaf_omits_basicconstraints", absent)
            check("capture_before_handshake_failure", emitted[-1]["event"] == "client_cert_ready" and emitted[-1]["cert"]["valid"])
            client.error = "tlsv1 alert certificate unknown"
            pilot.tls_failed_client(data)
            check("failure_bound_to_captured_certificate", emitted[-1]["cert"]["valid"] and emitted[-1]["failureCategory"] == "certificate_rejected")
            client.error = "connection closed PRIVATE-UNPUBLISHED"
            pilot.tls_failed_client(data)
            check("generic_disconnect_is_ambiguous", emitted[-1]["failureCategory"] == "other_or_ambiguous")
            check("no_raw_error_in_events", "PRIVATE-UNPUBLISHED" not in json.dumps(emitted))
            pilot.client_certificates.pop(client.id)
            pilot.tls_failed_client(data)
            check("failure_without_capture_invalid", not emitted[-1]["cert"]["valid"])
            observer.tls_start_client(data)
            original = data.ssl_conn
            def connection_with(cert):
                conn = SSL.Connection(SSL.Context(SSL.TLS_SERVER_METHOD))
                if cert is not None:
                    conn.use_certificate(cert)
                    conn.use_privatekey(key)
                conn.set_accept_state()
                return conn
            data.ssl_conn = connection_with(leaf)
            check("another_ssl_object_invalidates_capture", not pilot.bound_certificate(data, pilot.connections[client.id])["valid"])
            data.ssl_conn = connection_with(None)
            check("missing_local_certificate_invalid", not pilot.certificate(data, client.sni)["valid"])
            now = datetime.now(timezone.utc)
            def leaf_variant(host=None, before=None, after=None, basic=None, usage=ExtendedKeyUsageOID.SERVER_AUTH, signer=None):
                builder = x509.CertificateBuilder().subject_name(leaf.subject).issuer_name(ca.subject)
                builder = builder.public_key(key.public_key()).serial_number(x509.random_serial_number())
                builder = builder.not_valid_before(before or now - timedelta(days=1)).not_valid_after(after or now + timedelta(days=1))
                builder = builder.add_extension(x509.SubjectAlternativeName([x509.DNSName(host or client.sni)]), critical=False)
                builder = builder.add_extension(x509.ExtendedKeyUsage([usage]), critical=False)
                if basic is not None:
                    builder = builder.add_extension(x509.BasicConstraints(ca=basic, path_length=None), critical=True)
                return builder.sign(signer or key, hashes.SHA256())
            for name, variant in (
                ("wrong_san_invalid", leaf_variant(host="other.example.test")),
                ("expired_leaf_invalid", leaf_variant(before=now-timedelta(days=3), after=now-timedelta(days=2))),
                ("future_leaf_invalid", leaf_variant(before=now+timedelta(days=2), after=now+timedelta(days=3))),
                ("leaf_ca_true_invalid", leaf_variant(basic=True)),
                ("client_only_eku_invalid", leaf_variant(usage=ExtendedKeyUsageOID.CLIENT_AUTH)),
                ("wrong_signature_invalid", leaf_variant(signer=rsa.generate_private_key(public_exponent=65537, key_size=2048))),
            ):
                data.ssl_conn = connection_with(variant)
                check(name, not pilot.certificate(data, client.sni)["valid"])
            data.ssl_conn = connection_with(leaf_variant(basic=False))
            check("explicit_non_ca_leaf_valid", pilot.certificate(data, client.sni)["valid"])
            data.ssl_conn = original
            public = ca.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
            import base64, hashlib
            pilot.config["pins"] = [base64.b64encode(hashlib.sha256(public).digest()).decode("ascii")]
            check("matching_ca_pin_detected", pilot.certificate(data, client.sni)["pinMatches"])
            pilot.client_disconnected(client)
            check("disconnect_discards_cached_certificate", client.id not in pilot.client_certificates)
            result = {"passed": True, "checks": checks}
        except Exception:
            result = {"passed": False, "checks": checks, "failure": "offline crypto/API check failed"}
        finally:
            Path(os.environ["PINNING_TEST_RESULT"]).write_text(json.dumps(result), encoding="utf-8")
            ctx.master.shutdown()

addons = [pilot, Checks()]
`);
    const env = { ...cleanEnv(process.env), PINNING_CONFIG: path.join(directory, 'config.json'),
      PINNING_PROXY_SOURCE: path.join(__dirname, '../scripts/android-pinning-proxy.py'), PINNING_TEST_RESULT: path.join(directory, 'result.json') };
    const result = spawnSync(process.env.PINNING_TEST_MITMDUMP, ['--listen-host', '127.0.0.1', '--listen-port', '0',
      '--set', 'confdir=' + path.join(directory, 'mitm-ca'), '-q', '-s', path.join(directory, 'checks.py')],
    { env, encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(directory, 'result.json'))).toBe(true);
    const checks = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'));
    expect(checks.passed).toBe(true);
    expect(checks.checks).toHaveLength(19);
  } finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('sport-pinning-crypto-')) throw Error('Ruta temporal inesperada');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}, 65000);


test.each([
  '<?xml version="1.0"?>',
  '<?xml version="1.0" encoding="utf-8"?>',
  "<?xml version = '1.0' encoding = 'UTF-8' standalone = 'yes'?>",
])('compiled XML accepts only a single initial declaration without sanitizing content: %s', declaration => {
  expect(compiledPolicy(declaration + '\n' + manifest, nsc, api, image, pinConfig.pins.map(pin => pin.sha256))).toMatchObject({ compiled: true });
});
test.each([
  '<!-- ordinary comment -->',
  '<!-- <!-- nested --> comment -->',
  '<!DOCTYPE manifest>',
  '<!ENTITY app "application">',
  '<![CDATA[<application android:networkSecurityConfig="@xml/network_security_config"/>]]>',
  '<?unexpected instruction?>',
])('comments and declarations are rejected in both compiled inputs: %s', unsupported => {
  expect(() => compiledPolicy(unsupported + manifest, nsc, api, image, pinConfig.pins.map(pin => pin.sha256))).toThrow();
  expect(() => compiledPolicy(manifest, unsupported + nsc, api, image, pinConfig.pins.map(pin => pin.sha256))).toThrow();
});
test.each([
  '<manifest><!-- <application android:networkSecurityConfig="@xml/network_security_config"/> --><application android:networkSecurityConfig="@xml/other"/></manifest>',
  '<manifest><!-- <!-- --> <application android:networkSecurityConfig="@xml/network_security_config"/> --><application android:networkSecurityConfig="@xml/other"/></manifest>',
  '<manifest><application android:networkSecurityConfig="@xml/network_security_config"><!-- <application/> --></application></manifest>',
])('a fake application inside ordinary or nested comments cannot supply the policy: %#', source => {
  expect(() => compiledPolicy(source, nsc, api, image, pinConfig.pins.map(pin => pin.sha256))).toThrow('Comentarios');
});
test.each([
  '<manifest/>',
  '<manifest><queries><application android:networkSecurityConfig="@xml/network_security_config"/></queries></manifest>',
  '<manifest><application android:networkSecurityConfig="@xml/network_security_config"/><application android:networkSecurityConfig="@xml/network_security_config"/></manifest>',
  '<manifest><application android:networkSecurityConfig="@xml/network_security_config"><application/></application></manifest>',
  '<other><application android:networkSecurityConfig="@xml/network_security_config"/></other>',
  'unexpected text' + manifest,
  manifest + '<manifest/>',
])('the real manifest tree requires exactly one direct application: %#', source => {
  expect(() => compiledPolicy(source, nsc, api, image, pinConfig.pins.map(pin => pin.sha256))).toThrow();
});
test.each([
  '\n<?xml version="1.0"?>' + manifest,
  '<?xml version="1.0"?><?xml version="1.0"?>' + manifest,
  '<manifest><?xml version="1.0"?><application android:networkSecurityConfig="@xml/network_security_config"/></manifest>',
  '<?xml version="1.0" unexpected="value"?>' + manifest,
])('XML declarations outside the supported initial position cannot be stripped into validity: %#', source => {
  expect(() => compiledPolicy(source, nsc, api, image, pinConfig.pins.map(pin => pin.sha256))).toThrow();
});
test('the compiled manifest retains its own namespace, attributes, permissions and activity tree', () => {
  const source = '<?xml version="1.0" encoding="utf-8"?>\n'
    + '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.markadw.sportcenter" android:versionCode="1" android:versionName="1.0.0">'
    + '<uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/><uses-permission android:name="android.permission.INTERNET"/>'
    + '<queries><intent><action android:name="android.intent.action.VIEW"/><data android:scheme="https"/></intent></queries>'
    + '<application android:name=".MainApplication" android:label="Sport Center" android:icon="@mipmap/ic_launcher" android:networkSecurityConfig="@xml/network_security_config" android:debuggable="false">'
    + '<activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity>'
    + '<meta-data android:name="expo.modules.updates.ENABLED" android:value="false"/></application></manifest>';
  expect(compiledPolicy(source, nsc, api, image, pinConfig.pins.map(pin => pin.sha256))).toMatchObject({ compiled: true, systemOnly: true });
  expect(() => compiledPolicy(source.replace('android:debuggable="false"', 'android:debuggable="true"'), nsc, api, image, pinConfig.pins.map(pin => pin.sha256))).toThrow('debuggable');
});

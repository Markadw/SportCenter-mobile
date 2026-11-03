const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { createHash, randomUUID } = require('node:crypto');
const { inflateSync } = require('node:zlib');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const { SOURCE, resolveSourceContext, verifyApi34Evidence } = require('./android-source-context');
const { androidTools } = require('./inspect-android-artifact');
const { verifyAospImage, SystemImageError } = require('./android-16k');
const APP = 'com.markadw.sportcenter';
const TOOL = Object.freeze({ version: '12.3.1', url: 'https://downloads.mitmproxy.org/12.3.1/mitmproxy-12.3.1-linux-x86_64.tar.gz',
  sha256: 'f7b4237f5702f6cd21357fe6e4680a7e905f8f9b816b872230d018ea696c34d5' });
function hostname(value) {
  assert.ok(typeof value === 'string' && value.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(value), 'Host público exacto inválido.');
  return value;
}
function candidate(meta, actualHash, env, context = resolveSourceContext(env)) {
  assert.match(env.GITHUB_REF || '', /^refs\/tags\/(?:candidate|validation)\/android-[A-Za-z0-9_.-]+$/, 'Sólo etiquetas candidate/android-* o validation/android-*.');
  if ((env.GITHUB_REF || '').startsWith('refs/tags/validation/')) {
    assert.equal(context.revalidation, true); assert.equal(context.artifactSourceCommit, SOURCE.commit);
    assert.equal(context.automationCommit, env.GITHUB_SHA); assert.equal(meta?.buildId, SOURCE.buildId);
    assert.equal(actualHash, SOURCE.apkSha256);
  } else assert.equal(context.revalidation, false);
  assert.equal(env.PINNING_CANDIDATE, 'true', 'El job debe identificar explícitamente una candidata.');
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  assert.match(env.PINNING_EXPECTED_SHA256 || '', /^[a-f0-9]{64}$/);
  assert.ok(typeof meta?.buildId === 'string' && /^[a-zA-Z0-9-]+$/.test(meta.buildId), 'Falta ID de build.');
  assert.equal(meta.buildId, env.PINNING_EXPECTED_BUILD_ID, 'Build distinto del job API34.');
  assert.equal(meta.commit, context.artifactSourceCommit, 'Commit distinto de la fuente verificada.');
  assert.equal(meta.commit, env.PINNING_EXPECTED_COMMIT, 'Commit distinto del job API34.');
  assert.equal(meta.emulatorApi, 34, 'La procedencia debe ser el APK del job API34.');
  assert.equal(meta.sha256, env.PINNING_EXPECTED_SHA256, 'Metadatos y output API34 discrepan.');
  assert.equal(actualHash, meta.sha256, 'El APK descargado no conserva su SHA256.');
  return { buildId: meta.buildId, commit: meta.commit, sha256: actualHash,
    ...(context.revalidation ? { artifactSourceCommit: context.artifactSourceCommit, automationCommit: context.automationCommit } : {}) };
}
// Only the small release NSC shape emitted by this app is accepted. Unknown XML/configurations fail closed.
function xmlTree(source) {
  assert.ok(typeof source === 'string' && source.length < 2_000_000 && !source.includes('<!'),
    'Comentarios, DTD, entidades y CDATA no admitidos en XML compilado.');
  // AAPT emite una declaración inicial; no se sanea ni elimina contenido XML arbitrario.
  const declaration = source.match(/^<\?xml\s+version\s*=\s*(?:"1\.0"|'1\.0')(?:\s+encoding\s*=\s*(?:"[A-Za-z][A-Za-z0-9._-]*"|'[A-Za-z][A-Za-z0-9._-]*'))?(?:\s+standalone\s*=\s*(?:"(?:yes|no)"|'(?:yes|no)'))?\s*\?>/);
  const input = declaration ? source.slice(declaration[0].length) : source;
  assert.ok(!input.includes('<?'), 'Instrucciones XML no admitidas.');
  const root = { name: '#root', attrs: {}, children: [], text: '' }, stack = [root];
  let offset = 0;
  for (const match of input.matchAll(/<[^>]+>|[^<]+/g)) {
    assert.equal(match.index, offset, 'XML incompleto.'); offset += match[0].length;
    const token = match[0], parent = stack[stack.length - 1];
    if (!token.startsWith('<')) { assert.ok(!token.includes('&'), 'Entidades XML no admitidas en NSC.'); parent.text += token; continue; }
    if (token.startsWith('</')) { assert.equal(token, '</' + parent.name + '>', 'Cierre XML incoherente.'); assert.ok(stack.length > 1); stack.pop(); continue; }
    const opening = token.match(/^<([A-Za-z_:][\w:.-]*)([\s\S]*?)(\/?)>$/); assert.ok(opening, 'Elemento XML inválido.');
    const attrs = {}; let tail = opening[2];
    while (tail.trim()) {
      const attr = tail.match(/^\s+([\w:.-]+)\s*=\s*(?:"([^"<&]*)"|'([^'<&]*)')/);
      assert.ok(attr && !(attr[1] in attrs), 'Atributo XML inválido o repetido.');
      attrs[attr[1]] = attr[2] ?? attr[3]; tail = tail.slice(attr[0].length);
    }
    const node = { name: opening[1], attrs, children: [], text: '' }; parent.children.push(node);
    if (!opening[3]) stack.push(node);
  }
  assert.equal(offset, input.length); assert.equal(stack.length, 1); assert.equal(root.children.length, 1);
  assert.equal(root.text.trim(), '', 'Texto fuera de la raíz XML.');
  return root.children[0];
}
function manifestApplication(manifest) {
  const root = xmlTree(manifest);
  assert.ok(root.name === 'manifest', 'NSC_MANIFEST_ROOT_INVALID');
  const pending = [root], applications = [];
  while (pending.length) {
    const node = pending.pop();
    if (node.name === 'application') applications.push(node);
    for (const child of node.children) pending.push(child);
  }
  assert.ok(applications.length === 1 && root.children.includes(applications[0]), 'Se requiere un único application directo del manifiesto.');
  assert.notEqual(applications[0].attrs['android:debuggable'], 'true', 'No se admite APK debuggable.');
  return applications[0];
}
function nscReference(manifest) {
  const reference = manifestApplication(manifest).attrs['android:networkSecurityConfig'];
  assert.ok(reference === '@xml/network_security_config' || reference === '@' + APP + ':xml/network_security_config'
    || /^@(?:ref\/)?0x[0-9a-f]{8}$/i.test(reference || ''), 'NSC_MANIFEST_REFERENCE_INVALID');
  return reference;
}
function resolveNscResource(manifest, table) {
  const reference = nscReference(manifest);
  assert.ok(typeof table === 'string' && table.length <= 4 * 1024 * 1024, 'NSC_RESOURCE_TABLE_INVALID');
  const records = [], packages = []; let pkg, current;
  for (const line of table.split(/\r?\n/)) {
    const header = line.match(/^Package name=([A-Za-z][A-Za-z0-9_.]*) id=([0-9a-f]{2})\s*$/i);
    if (header) { pkg = { name: header[1], id: header[2].toLowerCase() }; packages.push(pkg); current = null; continue; }
    const resource = line.match(/^\s+resource (0x[0-9a-f]{8}) ([A-Za-z0-9_]+)\/([A-Za-z0-9_]+)\s*$/i);
    if (resource) { current = { pkg, id: resource[1].toLowerCase(), type: resource[2], name: resource[3], values: [] }; records.push(current); continue; }
    if (/^\s*(?:resource|type)\s/.test(line)) { current = null; continue; }
    if (current && line.trim()) current.values.push(line.trim());
  }
  assert.ok(packages.filter(value => value.name === APP).length === 1, 'NSC_RESOURCE_PACKAGE_AMBIGUOUS');
  const matches = records.filter(value => value.pkg?.name === APP && value.type === 'xml' && value.name === 'network_security_config');
  assert.ok(matches.length === 1, 'NSC_RESOURCE_AMBIGUOUS_OR_MISSING');
  const resource = matches[0];
  assert.ok(resource.id.slice(2, 4) === resource.pkg.id && records.filter(value => value.id === resource.id).length === 1,
    'NSC_RESOURCE_ID_AMBIGUOUS');
  const numeric = reference.match(/^@(?:ref\/)?(0x[0-9a-f]{8})$/i);
  assert.ok(!numeric || numeric[1].toLowerCase() === resource.id, 'NSC_RESOURCE_REFERENCE_MISMATCH');
  assert.ok(resource.values.length === 1, 'NSC_RESOURCE_DEFAULT_ONLY_REQUIRED');
  const value = resource.values[0].match(/^\(\) \(file\) (res\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.xml) type=XML$/);
  assert.ok(value && value[1].length <= 240, 'NSC_RESOURCE_DEFAULT_XML_REQUIRED');
  return { reference, id: resource.id, name: 'xml/network_security_config', package: APP, configuration: 'default', path: value[1] };
}
async function loadCompiledNsc(manifest, apk, { analyzer, aapt2, request = command }) {
  const table = await request(aapt2, ['dump', 'resources', apk], { diagnostic: 'NSC_RESOURCE_TABLE' });
  const resource = resolveNscResource(manifest, table);
  const files = (await request(analyzer, ['files', 'list', apk], { diagnostic: 'NSC_APK_ENTRIES' })).split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const count = entry => files.filter(value => value === entry || value === '/' + entry).length;
  assert.ok(count('resources.arsc') === 1 && count(resource.path) === 1, 'NSC_COMPILED_ENTRY_MISSING_OR_AMBIGUOUS');
  const xml = await request(analyzer, ['resources', 'xml', '--file', '/' + resource.path, apk], { diagnostic: 'NSC_COMPILED_XML' });
  return { xml, resource };
}
function compiledPolicy(manifest, nsc, api, image, expectedPins, resource) {
  hostname(api); hostname(image); assert.notEqual(api, image, 'El control de imagen debe quedar fuera del dominio pinned.');
  const reference = nscReference(manifest);
  assert.ok(resource ? resource.reference === reference && resource.name === 'xml/network_security_config'
    && resource.package === APP && resource.configuration === 'default' && /^0x[0-9a-f]{8}$/.test(resource.id)
    : reference === '@xml/network_security_config', 'No se resolvió la NSC compilada del manifiesto.');
  const root = xmlTree(nsc); assert.equal(root.name, 'network-security-config'); assert.equal(root.text.trim(), '');
  assert.deepEqual(root.attrs, {}); assert.equal(root.children.length, 2, 'NSC desconocida o bypass adicional.');
  const base = root.children.find(n => n.name === 'base-config'), domain = root.children.find(n => n.name === 'domain-config');
  for (const node of [base, domain]) {
    assert.ok(node); assert.deepEqual(node.attrs, { cleartextTrafficPermitted: 'false' }); assert.equal(node.text.trim(), '');
    const trust = node.children.filter(n => n.name === 'trust-anchors'); assert.equal(trust.length, 1);
    assert.deepEqual(trust[0].attrs, {}); assert.equal(trust[0].children.length, 1); assert.equal(trust[0].text.trim(), '');
    const cert = trust[0].children[0]; assert.equal(cert.name, 'certificates'); assert.deepEqual(cert.attrs, { src: 'system' });
    assert.equal(cert.children.length, 0); assert.equal(cert.text.trim(), '');
  }
  assert.equal(base.children.length, 1); assert.equal(domain.children.length, 3);
  const dom = domain.children.find(n => n.name === 'domain'), set = domain.children.find(n => n.name === 'pin-set');
  assert.ok(dom && set); assert.deepEqual(dom.attrs, { includeSubdomains: 'false' }); assert.equal(dom.text.trim(), api); assert.equal(dom.children.length, 0);
  assert.deepEqual(set.attrs, {}); assert.equal(set.text.trim(), ''); assert.ok(set.children.length >= 2);
  const pins = set.children.map(n => {
    assert.equal(n.name, 'pin'); assert.deepEqual(n.attrs, { digest: 'SHA-256' }); assert.equal(n.children.length, 0);
    assert.match(n.text.trim(), /^[A-Za-z0-9+/]{43}=$/); return n.text.trim();
  });
  assert.equal(new Set(pins).size, pins.length); assert.deepEqual([...pins].sort(), [...expectedPins].sort(), 'Pines compilados distintos de los revisados.');
  return { apiHost: api, imageHost: image, pins, systemOnly: true, overridesPins: false, compiled: true };
}
function emulatorEvidence(properties) {
  assert.match(properties.serial || '', /^emulator-\d+$/, 'Nunca ejecutar contra un dispositivo físico.');
  assert.equal(properties.sdk, '30'); assert.equal(properties.qemu, '1'); assert.equal(properties.type, 'userdebug');
  assert.equal(properties.abi, 'x86_64'); assert.equal(properties.root, '0'); assert.equal(properties.playStore, false, 'PLAY_STORE_PRESENT');
  return { api: 30, abi: 'x86_64', type: 'userdebug', ephemeral: true };
}
function verifyAospPackage(listing) {
  const packagePath = 'system-images;android-30;default;x86_64', location = 'system-images/android-30/default/x86_64';
  const evidence = { format: 'unknown', installedSections: 0, matchingRows: 0, sgrSequences: 0 };
  const fail = (property, expected, actual) => {
    const error = new SystemImageError(property, expected, actual); error.packageListing = { ...evidence }; throw error;
  };
  if (typeof listing !== 'string' || listing.length > 4 * 1024 * 1024) fail('InstalledPackage.Table', 'bounded installed listing', '[invalid]');
  // Consume only bounded SGR colors/styles. Cursor movement, OSC, bare CR and other controls fail closed.
  const fragments = []; let offset = 0, from = 0;
  while (offset < listing.length) {
    const value = listing.charCodeAt(offset);
    if (value === 27) {
      const sgr = listing.slice(offset, offset + 48).match(/^\x1b\[([0-9;]{0,39})m/);
      if (!sgr || ++evidence.sgrSequences > 10000) fail('InstalledPackage.Controls', 'bounded SGR only', '[invalid]');
      const codes = sgr[1] === '' ? [0] : sgr[1].split(';').map(value => /^\d{1,3}$/.test(value) ? Number(value) : -1);
      if (codes.length > 8) fail('InstalledPackage.Controls', 'bounded SGR only', '[invalid]');
      for (let index = 0; index < codes.length; index++) {
        const code = codes[index];
        if ([0, 1, 2, 3, 4, 22, 23, 24, 39, 49].includes(code) || (code >= 30 && code <= 37)
          || (code >= 40 && code <= 47) || (code >= 90 && code <= 97) || (code >= 100 && code <= 107)) continue;
        const length = codes[index + 1] === 5 ? 1 : codes[index + 1] === 2 ? 3 : 0;
        if (![38, 48].includes(code) || !length || codes.length < index + length + 2
          || !codes.slice(index + 2, index + length + 2).every(value => value >= 0 && value <= 255))
          fail('InstalledPackage.Controls', 'bounded SGR only', '[invalid]');
        index += length + 1;
      }
      fragments.push(listing.slice(from, offset)); offset += sgr[0].length; from = offset; continue;
    }
    if ((value < 32 && value !== 9 && value !== 10 && !(value === 13 && listing[offset + 1] === '\n'))
      || (value >= 127 && value <= 159)) fail('InstalledPackage.Controls', 'bounded SGR only', '[invalid]');
    offset++;
  }
  fragments.push(listing.slice(from));
  const lines = fragments.join('').split(/\r?\n/).map(line => line.trim());
  const headings = lines.map((line, index) => /^Installed packages:$/i.test(line) ? index : -1).filter(index => index >= 0);
  evidence.installedSections = headings.length;
  if (headings.length !== 1) fail('InstalledPackage.Table', 'single installed section', '[missing_or_ambiguous]');
  const nextSection = lines.findIndex((line, index) => index > headings[0] && line.endsWith(':'));
  const section = lines.slice(headings[0] + 1, nextSection < 0 ? lines.length : nextSection).filter(Boolean);
  const headers = section.map((line, index) => line.split('|').map(cell => cell.trim()).join('|') === 'Path|Version|Description|Location' ? index : -1).filter(index => index >= 0);
  evidence.format = headers.length ? 'legacy-sdkmanager' : section.some(line => line.includes('|')) ? 'unsupported' : 'android-cli';
  if (evidence.format === 'unsupported' || headers.length > 1) fail('InstalledPackage.Table', 'recognized installed format', '[missing_or_ambiguous]');
  const exactPath = token => token === packagePath || token === location;
  const rows = section.map((line, index) => ({ line, index })).filter(row => exactPath(row.line.split(/[ \t|]/)[0]));
  evidence.matchingRows = rows.length;
  if (rows.length !== 1) fail('InstalledPackage.Path', packagePath, rows.length > 1 ? '[duplicate]' : '[missing]');
  let version;
  if (evidence.format === 'legacy-sdkmanager') {
    const cells = rows[0].line.split('|').map(cell => cell.trim());
    if (rows[0].index <= headers[0] || cells.length !== 4 || !exactPath(cells[0]) || !cells[2])
      fail('InstalledPackage.Table', 'legacy row with location', '[malformed]');
    version = cells[1];
    if (cells[3] !== location && cells[3] !== location + '/') fail('InstalledPackage.Location', location, '[unrecognized]');
  } else {
    const cells = rows[0].line.split(/[ \t]+/); version = cells[1];
    const arrow = cells[2] === '->';
    if (cells.length < (arrow ? 5 : 3) || (arrow && !/^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(cells[3])))
      fail('InstalledPackage.Table', 'path installed-version description', '[malformed]');
    evidence.updateAvailable = arrow;
  }
  if (!['11', '11.0', '11.0.0'].includes(version))
    fail('InstalledPackage.Revision', '11', /^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(version || '') ? version : '[unrecognized]');
  evidence.installedVersion = version;
  return { package: packagePath, packageRevision: 11, packageMetadata: 'sdkmanager23-list-installed', packageListing: evidence };
}
class PilotLaunchError extends Error {
  constructor(code, evidence = {}) { super(code); this.code = code; this.launchEvidence = evidence; }
}
function componentName(value) {
  if (typeof value !== 'string' || value.length > 300 || !/^[A-Za-z][A-Za-z0-9_.]*\/[.A-Za-z_$][A-Za-z0-9_.$]*$/.test(value)) return null;
  const [pkg, activity] = value.split('/'), full = activity.startsWith('.') ? pkg + activity : activity;
  return pkg === APP && full.startsWith(APP + '.') && /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(full) ? pkg + '/' + full : null;
}
function compiledLauncher(manifest) {
  const root = xmlTree(manifest), application = manifestApplication(manifest);
  const candidates = application.children.filter(node => ['activity', 'activity-alias'].includes(node.name)
    && node.children.some(filter => filter.name === 'intent-filter'
      && filter.children.some(child => child.name === 'action' && child.attrs['android:name'] === 'android.intent.action.MAIN')
      && filter.children.some(child => child.name === 'category' && child.attrs['android:name'] === 'android.intent.category.LAUNCHER')));
  if (root.attrs.package !== APP || candidates.length !== 1 || candidates[0].name !== 'activity'
    || candidates[0].attrs['android:exported'] !== 'true') throw new PilotLaunchError('PILOT_COMPILED_LAUNCHER_INVALID');
  const name = candidates[0].attrs['android:name'];
  if (typeof name !== 'string' || !name) throw new PilotLaunchError('PILOT_COMPILED_LAUNCHER_INVALID');
  const qualified = name?.startsWith('.') ? APP + name : name?.includes('.') ? name : APP + '.' + name;
  const component = componentName(APP + '/' + qualified);
  if (!component) throw new PilotLaunchError('PILOT_COMPILED_LAUNCHER_INVALID');
  return { component, launcherCount: 1, exported: true };
}
function packagePresence(output) {
  if (typeof output !== 'string' || output.length > 65536) throw new PilotLaunchError('PILOT_PACKAGE_PRESENCE_INVALID');
  const lines = output.trim() ? output.trim().split(/\r?\n/).map(line => line.trim()) : [];
  if (!lines.every(line => /^package:[A-Za-z][A-Za-z0-9_.]*$/.test(line))) throw new PilotLaunchError('PILOT_PACKAGE_PRESENCE_INVALID');
  const matches = lines.filter(line => line === 'package:' + APP).length;
  if (matches > 1) throw new PilotLaunchError('PILOT_PACKAGE_PRESENCE_INVALID');
  return matches === 1;
}
function installedApkEvidence(output, packagePath) {
  const lines = typeof output === 'string' ? output.trim().split(/\r?\n/) : [];
  if (lines.at(-1) !== 'Success' || lines.filter(line => line === 'Success').length !== 1 || lines.some(line => /^(?:Failure|Error)\b/.test(line)))
    throw new PilotLaunchError('PILOT_INSTALL_NOT_SUCCESS');
  if (typeof packagePath !== 'string' || !/^package:\/data\/app\/[A-Za-z0-9_~./=+-]+\/base\.apk\s*$/.test(packagePath)
    || packagePath.trim().split(/\r?\n/).length !== 1 || packagePath.includes('/../')) throw new PilotLaunchError('PILOT_PACKAGE_PATH_INVALID');
  return { installSuccess: true, packagePathConfirmed: true };
}
async function reinstallSameApk(adb, apk, expectedHash, fileHash = sha256) {
  if (await fileHash(apk) !== expectedHash) throw new PilotLaunchError('PILOT_APK_HASH_MISMATCH');
  const installed = await adb('install', '-r', apk);
  const evidence = installedApkEvidence(installed, await adb('shell', 'pm', 'path', '--user', '0', APP));
  const packagePresent = packagePresence(await adb('shell', 'cmd', 'package', 'list', 'packages', '--user', '0', APP));
  if (!packagePresent) throw new PilotLaunchError('PILOT_PACKAGE_MISSING');
  return { ...evidence, packagePresent };
}
async function launchInstalledApp(adb, expected) {
  const evidence = { packagePresent: null, clearSucceeded: null, launcherUnique: null, resolverMatches: null,
    startStatus: 'unobserved', activityMatches: null, processRunning: null, foregroundConfirmed: null };
  try {
    evidence.packagePresent = packagePresence(await adb('shell', 'cmd', 'package', 'list', 'packages', '--user', '0', APP));
    if (!evidence.packagePresent) throw new PilotLaunchError('PILOT_PACKAGE_MISSING');
    await adb('shell', 'am', 'force-stop', '--user', '0', APP);
    evidence.clearSucceeded = (await adb('shell', 'pm', 'clear', '--user', '0', APP)).trim() === 'Success';
    if (!evidence.clearSucceeded) throw new PilotLaunchError('PILOT_CLEAR_NOT_SUCCESS');
    const intent = ['--components', '--user', '0', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', APP];
    const query = (await adb('shell', 'cmd', 'package', 'query-activities', ...intent)).trim().split(/\r?\n/).filter(Boolean);
    const resolved = (await adb('shell', 'cmd', 'package', 'resolve-activity', ...intent)).trim().split(/\r?\n/).filter(Boolean);
    const component = componentName(expected);
    evidence.launcherUnique = query.length === 1 && !!component && componentName(query[0]) === component;
    evidence.resolverMatches = resolved.length === 1 && !!component && componentName(resolved[0]) === component;
    if (!evidence.launcherUnique || !evidence.resolverMatches) throw new PilotLaunchError('PILOT_RUNTIME_LAUNCHER_INVALID');
    const output = await adb('shell', 'am', 'start', '--user', '0', '-W', '-n', component, '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER');
    const lines = output.split(/\r?\n/).map(line => line.trim()), statuses = lines.filter(line => line.startsWith('Status:')),
      activities = lines.filter(line => line.startsWith('Activity:'));
    if (lines.some(line => /^Error(?:\s+type\s+\d+)?:/.test(line))) { evidence.startStatus = 'error'; throw new PilotLaunchError('PILOT_START_REPORTED_ERROR'); }
    evidence.startStatus = statuses.length === 1 && statuses[0] === 'Status: ok' ? 'ok'
      : statuses.length === 1 && statuses[0] === 'Status: timeout' ? 'timeout' : 'invalid';
    if (evidence.startStatus !== 'ok') throw new PilotLaunchError('PILOT_START_STATUS_INVALID');
    evidence.activityMatches = activities.length === 1 && componentName(activities[0].slice('Activity:'.length).trim()) === component;
    if (!evidence.activityMatches) throw new PilotLaunchError('PILOT_START_ACTIVITY_INVALID');
    const pid = (await adb('shell', 'pidof ' + APP + ' || true')).trim();
    evidence.processRunning = /^[1-9]\d*(?:\s+[1-9]\d*)*$/.test(pid);
    if (!evidence.processRunning) throw new PilotLaunchError('PILOT_PROCESS_MISSING');
    const foreground = await adb('shell', 'dumpsys', 'activity', 'activities');
    if (foreground.length > 256 * 1024) throw new PilotLaunchError('PILOT_FOREGROUND_INVALID');
    const resumed = foreground.split(/\r?\n/).filter(line => /\b(?:mResumedActivity:|topResumedActivity=|ResumedActivity:)/.test(line))
      .flatMap(line => line.match(/[A-Za-z][A-Za-z0-9_.]*\/[.A-Za-z_$][A-Za-z0-9_.$]*/g) || []);
    evidence.foregroundConfirmed = resumed.length > 0 && resumed.every(value => componentName(value) === component);
    if (!evidence.foregroundConfirmed) throw new PilotLaunchError('PILOT_FOREGROUND_MISMATCH');
    return evidence;
  } catch (error) {
    if (error instanceof PilotLaunchError) { error.launchEvidence = evidence; throw error; }
    throw new PilotLaunchError('PILOT_LAUNCH_ADB_FAILED', evidence);
  }
}
function minSdkEvidence(value) {
  assert.match(value.trim(), /^\d+$/, 'minSdk no disponible.');
  const minimum = Number(value.trim());
  assert.ok(Number.isInteger(minimum) && minimum >= 1 && minimum <= 30, 'minSdk incompatible con API30.');
  return minimum;
}
function clockEvidence(seconds, hostMilliseconds) {
  assert.match(seconds.trim(), /^\d+$/, 'Reloj del AVD no disponible.');
  assert.ok(Math.abs(Number(seconds.trim()) * 1000 - hostMilliseconds) <= 60000, 'Reloj del AVD fuera del control temporal.');
  return true;
}
function verdict(events, context) {
  assert.ok(context.compiled?.compiled && context.caInstalled && context.baselineUi && context.negativeUi && context.recoveryUi, 'Faltan controles nativos/NSC/CA/UI.');
  const rows = events.filter(e => e.runId === context.runId);
  assert.equal(rows.length, events.length, 'Evidencia ajena a esta ejecución.');
  assert.ok(rows.length > 0 && rows.length <= 5000, 'Eventos ausentes o excesivos.');
  const api = context.compiled.apiHost, image = context.compiled.imageHost;
  const validCert = e => e.cert?.valid === true && e.cert.caSha256 === context.caSha256 && e.cert.pinMatches === false
    && /^[a-f0-9]{64}$/.test(e.cert.leafSha256 || '');
  const capturedBefore = (phaseRows, event) => phaseRows.find(ready => ready.event === 'client_cert_ready'
    && ready.host === event.host && ready.connId === event.connId && validCert(ready)
    && ready.cert.leafSha256 === event.cert?.leafSha256 && phaseRows.indexOf(ready) < phaseRows.indexOf(event));
  const control = rows.filter(e => e.phase === 'control'), attack = rows.filter(e => e.phase === 'attack');
  assert.ok(control.some(e => e.event === 'passthrough' && e.host === api), 'No se observó API passthrough desde el APK.');
  const images = control.filter(e => e.event === 'image_response' && e.host === image && e.status >= 200 && e.status < 300);
  assert.ok(images.some(e => control.some(t => t.event === 'client_tls_ok' && t.connId === e.connId && validCert(t)
    && capturedBefore(control, t) && control.indexOf(t) < control.indexOf(e))), 'No hay imagen 2xx y TLS confiado por el propio APK.');
  const rejected = attack.filter(e => e.host === api && e.event === 'client_tls_failed' && validCert(e)
    && e.failureCategory === 'certificate_rejected' && capturedBefore(attack, e));
  assert.ok(rejected.some(e => attack.some(t => t.event === 'intercept' && t.connId === e.connId) &&
    attack.some(t => t.event === 'server_tls_ok' && t.connId === e.connId
      && attack.indexOf(t) < attack.indexOf(capturedBefore(attack, e)))), 'Falta rechazo con certificado válido y upstream TLS satisfactorio.');
  assert.ok(!attack.some(e => e.host === api && ['api_http_received', 'client_tls_ok', 'passthrough', 'server_tls_failed'].includes(e.event)), 'API aceptada, fuera del ataque o upstream fallido.');
  assert.ok(!rows.some(e => ['invalid_configuration', 'forbidden_request', 'addon_error'].includes(e.event)), 'El proxy detectó configuración o tráfico no admitido.');
  const ids = new Set(control.map(e => e.connId)); assert.ok(rejected.every(e => !ids.has(e.connId)), 'Se reutilizó una conexión del control.');
  return { status: 'passed_controlled_native_rejection', scope: 'Mismo APK release; CA aceptada por imagen del APK, rechazo API bajo MITM y recuperación. No identifica por sí solo una excepción de pinning.',
    imageResponses: images.length, apiRejections: rejected.length, nativePinExceptionCaptured: context.nativePinException === true };
}
async function sha256(file) { const hash = createHash('sha256'); for await (const c of fs.createReadStream(file)) hash.update(c); return hash.digest('hex'); }
function cleanEnv(env) { return Object.fromEntries(Object.entries(env).filter(([key]) => !/TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|KEYLOG/i.test(key))); }
async function command(binary, args, options = {}) {
  const { diagnostic, ...executionOptions } = options;
  try { return (await execute(binary, args, { timeout: 45000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', env: cleanEnv(process.env), ...executionOptions })).stdout; }
  catch (error) {
    const labels = ['NSC_MANIFEST', 'NSC_RESOURCE_TABLE', 'NSC_APK_ENTRIES', 'NSC_COMPILED_XML'];
    const exit = Number.isInteger(error.code) ? error.code : error.code === 'ENOENT' ? 'unavailable' : error.killed ? 'timeout' : 'unknown';
    if (labels.includes(diagnostic)) {
      throw new Error('PILOT_TOOL_FAILED ' + diagnostic + ' exit=' + exit);
    }
    throw new Error(path.basename(binary) + ': comando del piloto fallido; exit=' + exit + '; diagnóstico bruto sólo temporal.');
  }
}
const sleep = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms));
async function until(action, timeout = 90000) { const end = Date.now() + timeout; do { if (await action()) return; await sleep(1000); } while (Date.now() < end); throw new PilotWaitTimeout(); }
class PilotWaitTimeout extends Error { constructor() { super('PILOT_WAIT_TIMEOUT'); } }
const PILOT_PHASES = ['setup', 'control', 'attack', 'recovery'];
const PILOT_OPERATIONS = ['initialization', 'candidate', 'compiled_policy', 'system_image', 'tool_version', 'proxy_state',
  'emulator', 'apk_install', 'package_after_ca', 'apk_reinstall', 'proxy_start', 'proxy_ca_ready', 'proxy_listening', 'ca_prepare', 'boot_verified', 'remount',
  'boot_remounted', 'ca_install', 'boot_with_ca', 'clock_check', 'proxy_enabled', 'catalog_launch', 'catalog_visible',
  'catalog_opened', 'product_visible', 'image_2xx', 'proxy_stopped', 'proxy_restart', 'error_visible', 'tls_failure_event',
  'proxy_removed', 'apk_hash', 'verdict'];
function createPilotProgress(result, wait = until) {
  result.progress = { phase: 'setup', operation: 'initialization', lastSuccessfulControl: null };
  const enter = (phase, operation) => {
    assert.ok(PILOT_PHASES.includes(phase) && PILOT_OPERATIONS.includes(operation), 'PILOT_DIAGNOSTIC_STEP_INVALID');
    result.progress.phase = phase; result.progress.operation = operation;
  };
  const complete = () => { result.progress.lastSuccessfulControl = { phase: result.progress.phase, operation: result.progress.operation }; };
  const action = async (phase, operation, task) => { enter(phase, operation); const value = await task(); complete(); return value; };
  return { enter, complete, action, wait: (phase, operation, task, timeout) => action(phase, operation, () => wait(task, timeout)),
    errorCode: error => 'PILOT_' + result.progress.phase.toUpperCase() + '_' + result.progress.operation.toUpperCase()
      + (error instanceof PilotWaitTimeout ? '_TIMEOUT' : '_FAILED') };
}
function validFailurePng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 || bytes.length > 2 * 1024 * 1024
    || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  try {
    let offset = 8, width, height, channels, ended = false, dataEnded = false; const compressed = [];
    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) return false;
      const size = bytes.readUInt32BE(offset), end = offset + size + 12;
      if (end > bytes.length) return false;
      const kind = bytes.toString('ascii', offset + 4, offset + 8);
      if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(kind)) return false;
      let crc = 0xffffffff;
      for (let index = offset + 4; index < end - 4; index++) {
        crc ^= bytes[index]; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(end - 4)) return false;
      if (offset === 8 && kind !== 'IHDR') return false;
      if (kind === 'IHDR') {
        if (width !== undefined || size !== 13) return false;
        width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12);
        channels = bytes[offset + 17] === 6 ? 4 : bytes[offset + 17] === 2 ? 3 : 0;
        if (!width || !height || width > 4096 || height > 4096 || width * height > 4194304 || !channels
          || bytes[offset + 16] !== 8 || bytes[offset + 18] || bytes[offset + 19] || bytes[offset + 20]) return false;
      } else if (kind === 'IDAT') {
        if (dataEnded) return false; compressed.push(bytes.subarray(offset + 8, end - 4));
      } else {
        if (compressed.length) dataEnded = true;
        if (kind === 'IEND') { if (size || end !== bytes.length) return false; ended = true; }
        else if (kind[0] === kind[0].toUpperCase()) return false;
      }
      offset = end;
    }
    if (!ended || !compressed.length) return false;
    const decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: 20 * 1024 * 1024 });
    const row = width * channels + 1;
    if (decoded.length !== row * height) return false;
    for (let index = 0; index < decoded.length; index += row) if (decoded[index] > 4) return false;
    return true;
  } catch { return false; }
}
const DIAGNOSTIC_EVENTS = ['invalid_configuration', 'addon_error', 'intercept', 'passthrough', 'client_cert_ready',
  'client_tls_ok', 'client_tls_failed', 'server_tls_ok', 'server_tls_failed', 'api_http_received', 'forbidden_request', 'image_response'];
async function failureDiagnostics({ runAdb, xml = '', productName, readEvents, runId, allowScreenshot = false,
  savePng = bytes => {
    fs.mkdirSync('test-results/maestro', { recursive: true });
    fs.writeFileSync('test-results/maestro/pinning-failure.png', bytes, { flag: 'wx', mode: 0o600 });
  } }) {
  const uiAvailable = typeof xml === 'string' && xml.length <= 2 * 1024 * 1024 && /<hierarchy(?:\s|>)/.test(xml);
  const report = { uiAvailable, ui: { catalog: uiAvailable && visible(xml, 'Catálogo'),
    product: uiAvailable && typeof productName === 'string' && !!productName && visible(xml, productName),
    errorState: uiAvailable && visible(xml, 'No se pudo cargar el catálogo') && visible(xml, 'Reintentar') },
  eventsAvailable: false, eventCounts: { control: {}, attack: {}, recovery: {} }, ignoredEvents: 0,
  health: { adbAccessible: false, processRunning: null, ownFatalCrashDetected: null }, screenshot: { attempted: false, saved: false } };
  try {
    const events = readEvents(); report.eventsAvailable = Array.isArray(events); report.eventsTruncated = Array.isArray(events) && events.length > 5000;
    for (const event of Array.isArray(events) ? events.slice(0, 5000) : []) {
      if (!event || event.runId !== runId || !Object.hasOwn(report.eventCounts, event.phase) || !DIAGNOSTIC_EVENTS.includes(event.event)) { report.ignoredEvents++; continue; }
      const counts = report.eventCounts[event.phase]; counts[event.event] = (counts[event.event] || 0) + 1;
    }
  } catch { /* Unreadable events never expose partial JSON or proxy output. */ }
  const bounded = (args, options = {}) => runAdb(args, { timeout: 1500, killSignal: 'SIGKILL', maxBuffer: 65536, ...options });
  try { report.health.adbAccessible = (await bounded(['get-state'])).trim() === 'device'; } catch { /* Unknown is not healthy. */ }
  if (!report.health.adbAccessible) return report;
  const tasks = [
    (async () => { try { const output = (await bounded(['shell', 'pidof ' + APP + ' || true'])).trim();
      if (output === '' || /^[1-9]\d*(?:\s+[1-9]\d*)*$/.test(output)) report.health.processRunning = output !== ''; } catch { /* Unknown remains null. */ } })(),
    (async () => { try { const output = await bounded(['logcat', '-b', 'crash', '-d', '-v', 'brief', '-t', '200']);
      if (typeof output === 'string' && output.length <= 65536) report.health.ownFatalCrashDetected =
        (output.includes('Process: ' + APP + ',') || output.includes('>>> ' + APP + ' <<<')) && /FATAL EXCEPTION|Fatal signal|Abort message|signal \d+ \(SIG/.test(output);
    } catch { /* No raw logcat is persisted. */ } })(),
  ];
  if (allowScreenshot) tasks.push((async () => {
    report.screenshot.attempted = true;
    try {
      const bytes = await bounded(['exec-out', 'screencap', '-p'], { timeout: 2500, maxBuffer: 2 * 1024 * 1024, encoding: null });
      if (!validFailurePng(bytes)) { report.screenshot.errorCode = 'PILOT_FAILURE_PNG_INVALID'; return; }
      try { savePng(bytes); report.screenshot.saved = true; report.screenshot.path = 'test-results/maestro/pinning-failure.png'; }
      catch { report.screenshot.errorCode = 'PILOT_FAILURE_PNG_SAVE_FAILED'; }
    } catch { report.screenshot.errorCode = 'PILOT_FAILURE_PNG_CAPTURE_FAILED'; }
  })());
  await Promise.allSettled(tasks); return report;
}
async function playStorePresent(adb) {
  // pm path devuelve 1 cuando el paquete no existe: list packages representa esa ausencia con éxito.
  const output = await adb('shell', 'pm', 'list', 'packages', 'com.android.vending');
  return output.trim().split(/\r?\n/).some(line => line === 'package:com.android.vending');
}
class PilotCleanupError extends Error {
  constructor(evidence) {
    super('PILOT_CLEANUP_CA_' + evidence.operation.toUpperCase() + '_FAILED');
    this.code = this.message; this.cleanupEvidence = { ...evidence, status: 'failed' };
  }
}
async function removeOwnCa(adb, devicePath, expectedHash) {
  const evidence = { status: 'blocked', operation: 'validate_target', rootVerified: false, writableState: 'unobserved',
    identityVerified: false, removeCommandCompleted: false, alreadyAbsent: false, absenceVerified: false };
  try {
    assert.match(devicePath || '', /^\/system\/etc\/security\/cacerts\/[a-f0-9]{8}\.0$/);
    assert.match(expectedHash || '', /^[a-f0-9]{64}$/);
    evidence.operation = 'root'; await adb('root');
    evidence.operation = 'wait_device'; await adb('wait-for-device');
    evidence.operation = 'verify_root'; assert.equal((await adb('shell', 'id', '-u')).trim(), '0'); evidence.rootVerified = true;
    evidence.operation = 'remount'; await adb('remount');
    evidence.operation = 'verify_writable';
    const writable = (await adb('shell', 'if [ -w /system/etc/security/cacerts ]; then echo writable; else echo not_writable; fi')).trim();
    evidence.writableState = ['writable', 'not_writable'].includes(writable) ? writable : 'invalid';
    assert.equal(evidence.writableState, 'writable');
    evidence.operation = 'check_presence';
    const presence = (await adb('shell', 'if [ -e ' + devicePath + ' ]; then echo present; else echo missing; fi')).trim();
    assert.ok(['present', 'missing'].includes(presence));
    if (presence === 'missing') { evidence.alreadyAbsent = true; evidence.absenceVerified = true; }
    else {
      evidence.operation = 'verify_identity';
      assert.equal((await adb('shell', 'sha256sum', devicePath)).trim().split(/\s+/)[0], expectedHash); evidence.identityVerified = true;
      evidence.operation = 'remove_own_ca'; await adb('shell', 'rm', '-f', devicePath); evidence.removeCommandCompleted = true;
      evidence.operation = 'verify_absence'; await assertCaAbsent(adb, devicePath); evidence.absenceVerified = true;
    }
    evidence.operation = 'complete'; evidence.status = 'passed'; return evidence;
  } catch { throw new PilotCleanupError(evidence); }
}
async function assertCaAbsent(adb, devicePath) {
  assert.match(devicePath, /^\/system\/etc\/security\/cacerts\/[a-f0-9]{8}\.0$/);
  // adb ya invoca el shell remoto; un segundo sh -c perdería las comillas del cuerpo.
  const output = await adb('shell', 'if [ -e ' + devicePath + ' ]; then echo exists; else echo missing; fi');
  assert.equal(output.trim(), 'missing', 'Colisión de CA; no se sobrescribe un certificado existente.');
}
async function readUiDump(adb, devicePath) {
  assert.match(devicePath, /^\/data\/local\/tmp\/sport-pinning-[a-f0-9-]+\.xml$/);
  await adb('shell', 'rm', '-f', devicePath);
  const output = await adb('shell', 'uiautomator', 'dump', devicePath);
  // API30 puede devolver exit0 sin escribir XML si no alcanza idle/root. No leer una captura anterior.
  if (!output.includes('UI hierchary dumped to: ' + devicePath)) return '';
  const xml = await adb('shell', 'cat', devicePath);
  return /<hierarchy(?:\s|>)[\s\S]*<\/hierarchy>\s*$/.test(xml) ? xml : '';
}
function texts(xml) {
  const decode = value => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return [...xml.matchAll(/<node\b([^>]+)>/g)].map(m => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], decode(a[2])]))).filter(n => n.package === APP);
}
function visible(xml, expected) { return texts(xml).some(n => n.text === expected || n['content-desc'] === expected); }
function tapBounds(xml, expected) {
  const matches = texts(xml).filter(n => n.text === expected || n['content-desc'] === expected);
  assert.equal(matches.length, 1, 'Control de navegación ausente o ambiguo.');
  const b = matches[0].bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/); assert.ok(b);
  assert.ok(+b[3] > +b[1] && +b[4] > +b[2]); return [Math.floor((+b[1] + +b[3]) / 2), Math.floor((+b[2] + +b[4]) / 2)];
}
async function readCompiledPolicy(env, apk, meta, controls = {}) {
  const pinsConfig = JSON.parse(fs.readFileSync('config/security-pins.json', 'utf8'));
  const apiHost = hostname(pinsConfig.domain), imageHost = hostname(env.PINNING_IMAGE_HOST);
  assert.equal(new URL(meta.api).origin, 'https://' + apiHost, 'API de metadatos distinta del dominio compilado.');
  const tools = androidTools(env), analyzer = env.APKANALYZER || tools.analyzer;
  assert.equal((await command(analyzer, ['manifest', 'application-id', apk])).trim(), APP);
  assert.equal((await command(analyzer, ['manifest', 'debuggable', apk])).trim(), 'false');
  controls.minSdk = minSdkEvidence(await command(analyzer, ['manifest', 'min-sdk', apk]));
  const manifest = await command(analyzer, ['manifest', 'print', apk], { diagnostic: 'NSC_MANIFEST' });
  const nsc = await loadCompiledNsc(manifest, apk, { analyzer, aapt2: tools.aapt2 });
  controls.nscResource = nsc.resource; controls.launcher = compiledLauncher(manifest);
  const policy = compiledPolicy(manifest, nsc.xml, apiHost, imageHost, pinsConfig.pins.map(p => p.sha256), nsc.resource);
  controls.compiledNsc = { compiled: true, systemOnly: true, apiHost, imageHost, pinCount: policy.pins.length };
  return policy;
}
async function preflight(env = process.env) {
  const result = { status: 'blocked', scope: 'compiled-nsc-only-no-avd-no-tls', controls: {} };
  try {
    assert.equal(process.platform, 'linux', 'NSC_PREFLIGHT_REQUIRES_LINUX');
    const apk = path.resolve(env.PINNING_APK || path.join(env.RUNNER_TEMP || os.tmpdir(), 'sport-center.apk'));
    const meta = JSON.parse(fs.readFileSync(env.PINNING_BUILD_META || 'test-results/android-build.json', 'utf8'));
    result.candidate = candidate(meta, await sha256(apk), env, resolveSourceContext(env));
    await readCompiledPolicy(env, apk, meta, result.controls);
    result.status = 'passed_compiled_nsc_preflight';
  } catch (error) { result.reason = error instanceof Error ? error.message.slice(0, 240) : 'NSC_PREFLIGHT_FAILED'; }
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/android-pinning-preflight.json', JSON.stringify(result, null, 2) + '\n');
  return result;
}
async function pilot(env = process.env) {
  assert.equal(process.platform, 'linux', 'El piloto nativo sólo se ejecuta en runner Linux efímero.');
  assert.equal(env.PINNING_EPHEMERAL_AVD, 'true'); assert.equal(env.PINNING_SYSTEM_IMAGE, 'system-images;android-30;default;x86_64');
  const serial = env.ANDROID_SERIAL || 'emulator-5554'; assert.match(serial, /^emulator-\d+$/);
  const temporary = path.resolve(env.RUNNER_TEMP || os.tmpdir()), scratch = fs.mkdtempSync(path.join(temporary, 'sport-pinning-'));
  const result = { status: 'blocked', controls: {}, tool: TOOL.version };
  const progress = createPilotProgress(result); let lastUi = '';
  let proxy, proxyLog, caDevice, ownCaHash, installedCa = false, proxyChanged = false;
  const adb = (...args) => command('adb', ['-s', serial, ...args]);
  const output = path.resolve('test-results/android-pinning.json');
  const runId = randomUUID(), file = name => path.join(scratch, name);
  const writePhase = phase => fs.writeFileSync(file('phase'), phase, { mode: 0o600 });
  const readEvents = () => fs.existsSync(file('events.jsonl')) ? fs.readFileSync(file('events.jsonl'), 'utf8').split('\n').filter(Boolean).map(s => JSON.parse(s)) : [];
  try {
    const apk = path.resolve(env.PINNING_APK || path.join(temporary, 'sport-center.apk'));
    const meta = JSON.parse(fs.readFileSync(env.PINNING_BUILD_META || 'test-results/android-build.json', 'utf8'));
    const context = resolveSourceContext(env);
    if (context.revalidation) verifyApi34Evidence(JSON.parse(fs.readFileSync('test-results/android34.json', 'utf8')), context);
    progress.enter('setup', 'candidate');
    result.candidate = candidate(meta, await sha256(apk), env, context); progress.complete();
    assert.ok(typeof env.PRODUCT_NAME === 'string' && env.PRODUCT_NAME.trim().length > 0 && env.PRODUCT_NAME.length < 200 && !/[\r\n]/.test(env.PRODUCT_NAME), 'Falta producto público visible para control UI.');
    const policy = await progress.action('setup', 'compiled_policy', () => readCompiledPolicy(env, apk, meta, result.controls));
    const { apiHost, imageHost } = policy;
    progress.enter('setup', 'system_image');
    const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
    assert.ok(typeof sdk === 'string' && path.isAbsolute(sdk), 'ANDROID_SDK_REQUIRED');
    const installed = verifyAospPackage(await command(path.join(sdk, 'cmdline-tools/23.0/bin/sdkmanager'), ['--list_installed', '--sdk_root=' + sdk]));
    result.controls.systemImage = { ...installed, ...verifyAospImage(fs.readFileSync(path.join(sdk, 'system-images/android-30/default/x86_64/source.properties'), 'utf8')) };
    progress.complete(); progress.enter('setup', 'tool_version');
    const version = await command(env.MITMDUMP || 'mitmdump', ['--version']); assert.match(version, /^Mitmproxy:\s+12\.3\.1(?: binary)?\s*$/m, 'Versión mitmproxy distinta de la fijada.');
    progress.complete(); progress.enter('setup', 'proxy_state');
    const priorProxy = (await adb('shell', 'settings', 'get', 'global', 'http_proxy')).trim();
    assert.ok(['null', '', ':0'].includes(priorProxy), 'El AVD ya tenía proxy: no es un control limpio.');
    progress.complete(); progress.enter('setup', 'emulator');
    await adb('root'); await adb('wait-for-device');
    const getprop = async key => (await adb('shell', 'getprop', key)).trim();
    result.emulator = emulatorEvidence({ serial, sdk: await getprop('ro.build.version.sdk'), qemu: await getprop('ro.kernel.qemu'),
      type: await getprop('ro.build.type'), abi: await getprop('ro.product.cpu.abi'), root: (await adb('shell', 'id', '-u')).trim(),
      playStore: await playStorePresent(adb) });
    progress.complete();
    await progress.action('setup', 'apk_install', async () => {
      const installed = await adb('install', '-r', apk);
      result.controls.installBeforeCa = installedApkEvidence(installed, await adb('shell', 'pm', 'path', '--user', '0', APP));
      result.controls.packageBeforeCa = packagePresence(await adb('shell', 'cmd', 'package', 'list', 'packages', '--user', '0', APP));
      if (!result.controls.packageBeforeCa) throw new PilotLaunchError('PILOT_PACKAGE_MISSING');
    });
    progress.enter('setup', 'proxy_start'); writePhase('control');
    fs.writeFileSync(file('config.json'), JSON.stringify({ runId, apiHost, imageHost, pins: policy.pins, phaseFile: file('phase'), events: file('events.jsonl'), caFile: file('ca/mitmproxy-ca-cert.pem') }), { mode: 0o600 });
    proxyLog = fs.openSync(file('proxy.log'), 'wx', 0o600);
    proxy = spawn(env.MITMDUMP || 'mitmdump', ['--listen-host', '127.0.0.1', '--listen-port', '18080', '--set', 'confdir=' + file('ca'),
      '--set', 'ssl_insecure=false', '--set', 'add_upstream_certs_to_client_chain=false', '-s', path.join(__dirname, 'android-pinning-proxy.py')],
    { env: { ...cleanEnv(env), PINNING_CONFIG: file('config.json') }, stdio: ['ignore', proxyLog, proxyLog] });
    let spawnFailed = false; proxy.on('error', () => { spawnFailed = true; });
    progress.complete();
    await progress.wait('setup', 'proxy_ca_ready', async () => { assert.ok(!spawnFailed && proxy.exitCode === null, 'El proxy no pudo iniciarse.'); return fs.existsSync(file('ca/mitmproxy-ca-cert.pem')); }, 30000);
    await progress.wait('setup', 'proxy_listening', () => new Promise(resolve => { const socket = net.connect(18080, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); }), 15000);
    progress.enter('setup', 'ca_prepare');
    const caFile = file('ca/mitmproxy-ca-cert.pem');
    const hash = (await command('openssl', ['x509', '-in', caFile, '-subject_hash_old', '-noout'])).trim(); assert.match(hash, /^[a-f0-9]{8}$/);
    const caDigest = (await command('openssl', ['x509', '-in', caFile, '-fingerprint', '-sha256', '-noout'])).trim().split('=').pop().replace(/:/g, '').toLowerCase(); assert.match(caDigest, /^[a-f0-9]{64}$/);
    // API29/30 procedure documented by mitmproxy; failure never falls back to a user CA.
    await adb('shell', 'avbctl', 'disable-verification'); await adb('reboot'); await adb('wait-for-device');
    progress.complete();
    await progress.wait('setup', 'boot_verified', async () => (await getprop('sys.boot_completed')) === '1', 120000);
    progress.enter('setup', 'remount');
    await adb('root'); await adb('wait-for-device');
    const remount = await adb('remount');
    if (/reboot/i.test(remount)) {
      await adb('reboot'); await adb('wait-for-device');
      await progress.wait('setup', 'boot_remounted', async () => (await getprop('sys.boot_completed')) === '1', 120000);
      await adb('root'); await adb('wait-for-device'); await adb('remount');
    }
    progress.complete(); progress.enter('setup', 'ca_install');
    caDevice = '/system/etc/security/cacerts/' + hash + '.0';
    await assertCaAbsent(adb, caDevice);
    ownCaHash = await sha256(caFile);
    await adb('push', caFile, caDevice); installedCa = true;
    await adb('shell', 'chmod', '644', caDevice); await adb('shell', 'chown', 'root:root', caDevice); await adb('shell', 'restorecon', caDevice);
    assert.equal((await adb('shell', 'sha256sum', caDevice)).trim().split(/\s+/)[0], ownCaHash, 'CA copiada distinta.');
    result.controls.caCopyVerified = true; progress.complete(); progress.enter('setup', 'boot_with_ca');
    await adb('reboot'); await adb('wait-for-device');
    await progress.wait('setup', 'boot_with_ca', async () => (await getprop('sys.boot_completed')) === '1', 120000);
    result.controls.clockSynchronized = await progress.action('setup', 'clock_check', async () => clockEvidence(await adb('shell', 'date', '+%s'), Date.now()));
    result.controls.packageAfterCa = await progress.action('setup', 'package_after_ca', async () => packagePresence(await adb('shell', 'cmd', 'package', 'list', 'packages', '--user', '0', APP)));
    const reinstall = await progress.action('setup', 'apk_reinstall', () => reinstallSameApk(adb, apk, result.candidate.sha256));
    result.controls.installAfterCa = { installSuccess: reinstall.installSuccess, packagePathConfirmed: reinstall.packagePathConfirmed };
    result.controls.packageAfterReinstall = reinstall.packagePresent;
    await progress.action('control', 'proxy_enabled', () => adb('shell', 'settings', 'put', 'global', 'http_proxy', '10.0.2.2:18080')); proxyChanged = true;
    const uiPath = '/data/local/tmp/sport-pinning-' + runId + '.xml';
    const ui = async () => { lastUi = ''; lastUi = await readUiDump(adb, uiPath); return lastUi; };
    async function catalog(phase) {
      lastUi = '';
      result.launchChecks ||= {};
      result.launchChecks[phase] = await progress.action(phase, 'catalog_launch', () => launchInstalledApp(adb, result.controls.launcher.component));
      let current = '';
      await progress.wait(phase, 'catalog_visible', async () => { current = await ui(); return visible(current, 'Catálogo'); });
      await progress.action(phase, 'catalog_opened', () => adb('shell', 'input', 'tap', ...tapBounds(current, 'Catálogo').map(String)));
    }
    await catalog('control');
    await progress.wait('control', 'product_visible', async () => visible(await ui(), env.PRODUCT_NAME));
    await progress.wait('control', 'image_2xx', async () => readEvents().some(e => e.phase === 'control' && e.event === 'image_response' && e.status >= 200 && e.status < 300));
    result.controls.baselineUi = true; progress.enter('control', 'proxy_stopped');
    await adb('shell', 'am', 'force-stop', APP); proxy.kill('SIGTERM');
    await progress.wait('control', 'proxy_stopped', async () => proxy.exitCode !== null, 15000);
    // A new proxy process keeps the same CA, but removes all tunnels/TLS sessions from the control.
    await progress.action('attack', 'clock_check', async () => clockEvidence(await adb('shell', 'date', '+%s'), Date.now()));
    progress.enter('attack', 'proxy_restart');
    writePhase('attack'); proxy = spawn(env.MITMDUMP || 'mitmdump', ['--listen-host', '127.0.0.1', '--listen-port', '18080', '--set', 'confdir=' + file('ca'),
      '--set', 'ssl_insecure=false', '--set', 'add_upstream_certs_to_client_chain=false', '-s', path.join(__dirname, 'android-pinning-proxy.py')],
    { env: { ...cleanEnv(env), PINNING_CONFIG: file('config.json') }, stdio: ['ignore', proxyLog, proxyLog] });
    proxy.on('error', () => { spawnFailed = true; }); await sleep(1500); assert.ok(!spawnFailed && proxy.exitCode === null, 'No se reinició el proxy.');
    progress.complete(); await catalog('attack');
    await progress.wait('attack', 'error_visible', async () => { const xml = await ui(); return visible(xml, 'No se pudo cargar el catálogo') && visible(xml, 'Reintentar') && !visible(xml, env.PRODUCT_NAME); });
    result.controls.negativeUi = true;
    await progress.wait('attack', 'tls_failure_event', async () => readEvents().some(e => e.phase === 'attack' && e.event === 'client_tls_failed'));
    await progress.action('recovery', 'proxy_removed', () => adb('shell', 'settings', 'delete', 'global', 'http_proxy')); proxyChanged = false;
    await catalog('recovery'); await progress.wait('recovery', 'product_visible', async () => visible(await ui(), env.PRODUCT_NAME)); result.controls.recoveryUi = true;
    progress.enter('recovery', 'apk_hash'); assert.equal(await sha256(apk), result.candidate.sha256, 'El APK cambió durante el piloto.'); progress.complete();
    progress.enter('recovery', 'verdict');
    Object.assign(result, verdict(readEvents(), { runId, compiled: policy, caInstalled: true, caSha256: caDigest, baselineUi: true, negativeUi: true, recoveryUi: true }));
    progress.complete(); await adb('shell', 'rm', '-f', uiPath);
  } catch (error) {
    result.status = 'blocked_or_failed'; result.errorCode = error instanceof PilotLaunchError ? error.code : progress.errorCode(error); result.reason = result.errorCode;
    if (error instanceof PilotLaunchError) result.launchEvidence = error.launchEvidence;
    if (error instanceof SystemImageError) {
      result.systemImageMismatch = error.diagnostic;
      if (error.packageListing) result.packageListing = error.packageListing;
    }
    try {
      result.failureDiagnostics = await failureDiagnostics({
        runAdb: (args, options) => command('adb', ['-s', serial, ...args], options),
        xml: lastUi, productName: env.PRODUCT_NAME, readEvents, runId, allowScreenshot: result.emulator?.ephemeral === true,
      });
    } catch { result.failureDiagnostics = { errorCode: 'PILOT_FAILURE_DIAGNOSTIC_FAILED' }; }
  } finally {
    result.cleanupChecks = { proxy: 'not_required', ca: { status: 'not_required' } }; const cleanupErrors = [];
    if (proxyChanged) {
      try { await adb('shell', 'settings', 'delete', 'global', 'http_proxy'); result.cleanupChecks.proxy = 'restore_command_completed'; }
      catch { result.cleanupChecks.proxy = 'failed'; cleanupErrors.push('PILOT_CLEANUP_PROXY_RESTORE_FAILED'); }
    }
    if (installedCa) {
      try { result.cleanupChecks.ca = await removeOwnCa(adb, caDevice, ownCaHash); }
      catch (error) {
        result.cleanupChecks.ca = error instanceof PilotCleanupError ? error.cleanupEvidence : { status: 'failed', operation: 'unknown' };
        cleanupErrors.push(error instanceof PilotCleanupError ? error.code : 'PILOT_CLEANUP_CA_FAILED');
      }
    }
    if (cleanupErrors.length) {
      result.status = 'blocked_or_failed'; result.cleanup = 'No se pudo comprobar limpieza; destruir AVD efímero.';
      result.cleanupErrorCode = cleanupErrors[0]; result.cleanupErrors = cleanupErrors;
    }
    if (proxy && proxy.exitCode === null) { proxy.kill('SIGTERM'); try { await until(async () => proxy.exitCode !== null, 10000); } catch { proxy.kill('SIGKILL'); } }
    if (proxyLog !== undefined) fs.closeSync(proxyLog);
    assert.ok(path.dirname(scratch) === temporary && path.basename(scratch).startsWith('sport-pinning-'));
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  }
  return result;
}
module.exports = { APP, TOOL, hostname, candidate, xmlTree, compiledPolicy, resolveNscResource, loadCompiledNsc, command, emulatorEvidence, verifyAospPackage, PilotLaunchError, compiledLauncher, packagePresence, installedApkEvidence, reinstallSameApk, launchInstalledApp, minSdkEvidence, clockEvidence, verdict, PilotWaitTimeout, createPilotProgress, validFailurePng, failureDiagnostics, playStorePresent, PilotCleanupError, removeOwnCa, assertCaAbsent, readUiDump, texts, visible, tapBounds, cleanEnv, preflight, pilot };
if (require.main === module) {
  const isPreflight = process.argv[2] === 'preflight';
  (isPreflight ? preflight() : pilot()).then(result => {
    console.log((isPreflight ? 'Preflight NSC compilada: ' : 'Piloto pinning nativo: ') + result.status
      + '. Informe saneado: test-results/' + (isPreflight ? 'android-pinning-preflight.json' : 'android-pinning.json'));
    process.exitCode = result.status === (isPreflight ? 'passed_compiled_nsc_preflight' : 'passed_controlled_native_rejection') ? 0 : 1;
  }).catch(() => { console.error('Piloto/preflight bloqueado antes de poder iniciarse.'); process.exitCode = 1; });
}

/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { test, expect, jest } = require('@jest/globals');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const YAML = require('yaml');
const { validateWorkflows, validatePublicFlow } = require('../scripts/validate-test-configs');
const pins = require('../config/security-pins.json');
const { SOURCE, BUILDS, BUNDLETOOL, FILES, verifySource, verifyProducer, verifyBuild, download,
  application, resolvePolicy, policyEvidence, METRO_SERVER, ProfileError, verifyMetroContext, queryMetroContext, debugFlows, metroAbsent, stopMetro, RUNTIME_PHASES, api34Aggregate, failureCrashEvidence, observeFailure, runtime, main } = require('../scripts/android-profiles');
const sha = 'a'.repeat(40);
const source = { sha, ref: 'refs/tags/validation/profiles-rc1', repository: SOURCE.repository,
  head: sha + '\n', changed: 'scripts/android-profiles.js\nREADME.md\n', dirty: '' };
function build(profile) { return { id: BUILDS[profile].id, platform: 'ANDROID', status: 'FINISHED', gitCommitHash: SOURCE.commit,
  app: { id: SOURCE.projectId }, appIdentifier: SOURCE.appId, buildProfile: profile,
  message: 'sport-center-' + profile + '-v1:' + SOURCE.commit, appVersion: '1.0.0', appBuildVersion: '1',
  artifacts: { applicationArchiveUrl: 'https://example.invalid/expected' + BUILDS[profile].extension + '?signed=PRIVATE' } }; }
function producer() { const names = ['Calidad previa a integración / Análisis estático y pruebas del cliente',
  'Seguridad previa a integración y APK / Dependencias y SAST CodeQL', 'Integración HTTP real y regresión de contratos', 'Resultado de integración'];
return { run: { id: SOURCE.runId, head_sha: SOURCE.commit, head_branch: 'develop', event: 'push',
  path: '.github/workflows/api-android.yml', status: 'completed', conclusion: 'success', repository: { full_name: SOURCE.repository } },
  jobs: { total_count: names.length, jobs: names.map(name => ({ name, run_id: SOURCE.runId, status: 'completed', conclusion: 'success' })) } }; }
function manifest(debug = false, extra = '', cleartext = debug ? 'true' : 'false', min = '24') {
  return '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="' + SOURCE.appId + '">'
    + '<uses-sdk android:minSdkVersion="' + min + '" android:targetSdkVersion="36"/>' + extra
    + '<application android:debuggable="' + debug + '" android:usesCleartextTraffic="' + cleartext + '" android:networkSecurityConfig="@ref/0x7f140006">'
    + '<activity android:name=".MainActivity"><intent-filter><data android:scheme="exp+sport-center-mobile"/></intent-filter></activity></application></manifest>';
}
const apiPolicy = '<base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system"/></trust-anchors></base-config>'
  + '<domain-config cleartextTrafficPermitted="false"><domain includeSubdomains="false">' + pins.domain + '</domain>'
  + '<trust-anchors><certificates src="system"/></trust-anchors><pin-set>'
  + pins.pins.map(pin => '<pin digest="SHA-256">' + pin.sha256 + '</pin>').join('') + '</pin-set></domain-config>';
const metroPolicy = '<domain-config cleartextTrafficPermitted="true">'
  + ['localhost', '127.0.0.1', '10.0.2.2', '10.0.3.2'].map(host => '<domain includeSubdomains="false">' + host + '</domain>').join('') + '</domain-config>';
const policy = debug => '<network-security-config>' + apiPolicy + (debug ? metroPolicy : '') + '</network-security-config>';
function workflows() { return new Map(['ci.yml', 'api-android.yml', 'performance.yml', 'security.yml', 'android-validation.yml']
  .map(file => [file, YAML.parse(fs.readFileSync(path.join(__dirname, '../.github/workflows', file), 'utf8'))])); }

test('congela perfiles, hashes reales y fuente distinta de preview; no contiene campos pendientes', () => {
  expect(SOURCE.commit).toBe('5dcacd46a24ae54da5300cd394a91c590a9a5825');
  expect(BUILDS.development.sha256).toBe('ebfb8281ec12359178954255c94cf3e7d70e681d405c9c497fa3b9064d34d1d2');
  expect(BUILDS.production.sha256).toBe('acf7d113a2a093211f3f990ac5d2b26ef5ff5ba37bc7a6efb9fe230fa05fd91b');
  expect(BUNDLETOOL).toMatchObject({ version: '1.18.3', sha256: 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29' });
  expect(verifySource(source)).toMatchObject({ artifactSourceCommit: SOURCE.commit, automationCommit: sha });
  for (const file of FILES) expect(() => verifySource({ ...source, changed: file })).not.toThrow();
});
test.each([{ ref: 'refs/tags/validation/android-rc1' }, { ref: 'refs/heads/develop' }, { repository: 'other/repo' },
  { sha: SOURCE.commit, head: SOURCE.commit }, { head: 'b'.repeat(40) }, { dirty: ' M app.json' },
  { changed: 'src/app/index.tsx' }, { changed: 'eas.json' }, { changed: 'package-lock.json' }, { changed: '.maestro/another.yaml' }, { changed: '.github/workflows/another.yml' }, { changed: 'tests/manual/another-16k.md' }, { changed: 'scripts/android-pinning-other.py' }, { changed: 'scripts/android-pinning-proxy.js' }, { changed: '' }])('bloquea fuente ajena o árbol de aplicación cambiado %#', change => {
  expect(() => verifySource({ ...source, ...change })).toThrow();
});
test.each(['.github/workflows/api-android.yml', 'tests/manual/android-16k.md', 'scripts/android-pinning-proxy.py'])('compatibilidad PR51 sólo permite la ruta exacta %s', file => {
  expect(() => verifySource({ ...source, changed: file })).not.toThrow();
});

test('exige productor final aprobado y rechaza omisiones, paginación y duplicados', () => {
  const data = producer(); expect(verifyProducer(data.run, data.jobs)).toEqual({ producerChecksVerified: true });
  expect(() => verifyProducer({ ...data.run, conclusion: 'failure' }, data.jobs)).toThrow();
  expect(() => verifyProducer(data.run, { ...data.jobs, total_count: 100 })).toThrow();
  for (const state of ['failure', 'skipped', 'cancelled', null]) {
    const changed = producer(); changed.jobs.jobs[2].conclusion = state;
    expect(() => verifyProducer(changed.run, changed.jobs)).toThrow('PRODUCER_CHECK_NOT_SUCCESSFUL');
  }
  data.jobs.jobs.push(data.jobs.jobs[0]); data.jobs.total_count++;
  expect(() => verifyProducer(data.run, data.jobs)).toThrow();
});
test.each(['development', 'production'])('no confunde build/configuración/artefacto del perfil %s', profile => {
  expect(verifyBuild(build(profile), profile)).toMatchObject({ buildId: BUILDS[profile].id, profile, commit: SOURCE.commit });
  for (const damage of [{ status: 'IN_PROGRESS' }, { gitCommitHash: 'c'.repeat(40) }, { buildProfile: 'preview' }, { platform: 'IOS' },
    { id: 'another-build' }, { app: { id: 'other-project' } }, { appIdentifier: 'other.app' }, { message: 'old-message' },
    { appBuildVersion: '2' }, { expirationDate: '2000-01-01' }, { artifacts: { applicationArchiveUrl: 'http://example.invalid/test' + BUILDS[profile].extension } },
    { artifacts: { applicationArchiveUrl: 'https://example.invalid/wrong.zip' } }]) expect(() => verifyBuild({ ...build(profile), ...damage }, profile)).toThrow();
});
test('descarga exige hash congelado, verifica bytes y elimina archivo alterado sin filtrar URL', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-profiles-download-')), file = path.join(directory, 'artifact.apk');
  const bytes = Buffer.from('controlled artifact'), digest = createHash('sha256').update(bytes).digest('hex');
  const response = () => ({ status: 200, ok: true, body: Readable.toWeb(Readable.from([bytes])) });
  try {
    await expect(download('https://example.invalid/file.apk', file, '', jest.fn())).rejects.toThrow('ARTIFACT_HASH_NOT_FROZEN');
    await expect(download('https://example.invalid/file.apk', file, digest, jest.fn(response))).resolves.toBe(bytes.length);
    fs.unlinkSync(file);
    await expect(download('https://example.invalid/file.apk?token=PRIVATE', file, '0'.repeat(64), jest.fn(response))).rejects.toThrow('ARTIFACT_HASH_MISMATCH');
    expect(fs.existsSync(file)).toBe(false);
    const redirect = jest.fn(async () => ({ status: 302, body: { cancel: jest.fn() }, headers: { get: () => 'http://example.invalid/plain.apk' } }));
    await expect(download('https://example.invalid/file.apk', file, digest, redirect)).rejects.toThrow('ARTIFACT_HTTPS_REQUIRED');
    expect(redirect).toHaveBeenCalledTimes(1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('Debug registra flag real con precedencia NSC API24+ y release sigue exigiendo false', () => {
  const permissions = '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>'
    + '<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE"/>';
  expect(application(manifest(true, permissions), true).evidence).toMatchObject({ debuggable: true, manifestCleartext: 'true', effectiveCleartextAuthority: 'NSC-API24+' });
  expect(() => application(manifest(true, '', 'true', '23'), true)).toThrow('MANIFEST_SDK');
  expect(() => application(manifest(false, '', 'true'), false)).toThrow('MANIFEST_TLS_POLICY_REQUIRED');
  for (const permission of ['SYSTEM_ALERT_WINDOW', 'CHANGE_WIFI_MULTICAST_STATE']) {
    expect(() => application(manifest(false, '<uses-permission android:name="android.permission.' + permission + '"/>'), false)).toThrow('UNUSED_PERMISSION');
  }
  expect(() => application(manifest(true, '<uses-permission android:name="android.permission.CAMERA"/>'), true)).toThrow('UNUSED_PERMISSION');
});
test('resuelve NSC compilada de Debug sin cambiar el manifiesto para fingir release', () => {
  const table = 'Package name=' + SOURCE.appId + ' id=7f\n  resource 0x7f140006 xml/network_security_config\n    () (file) res/xml/network_security_config.xml type=XML\n';
  expect(resolvePolicy(manifest(true), table, true)).toMatchObject({ id: '0x7f140006', path: 'res/xml/network_security_config.xml' });
  expect(() => resolvePolicy(manifest(true), table.replace('resource 0x7f140006', 'resource 0x7f140007'), true)).toThrow();
  expect(() => resolvePolicy(manifest(true), table + '    () (file) res/xml/other.xml type=XML\n', true)).toThrow();
});
test('política mantiene API pinned y loopback sólo en Debug, sin CAs nuevas ni bypass', () => {
  expect(policyEvidence(policy(true), true).metroCleartextHosts).toHaveLength(4);
  expect(policyEvidence(policy(false), false).metroCleartextHosts).toEqual([]);
  for (const [xml, debug] of [[policy(true), false], [policy(false), true],
    [policy(true).replace('>localhost<', '>evil.invalid<'), true],
    [policy(true).replace('src="system"', 'src="user"'), true],
    [policy(true).replace('cleartextTrafficPermitted="false"', 'cleartextTrafficPermitted="true"'), true],
    [policy(true).replace('<pin-set>', '<pin-set expiration="2000-01-01">'), true]]) expect(() => policyEvidence(xml, debug)).toThrow();
});
function metroFixture() {
  return { open: { runtime: 'custom', appId: SOURCE.appId, scheme: 'exp+sport-center-mobile',
    url: 'exp+sport-center-mobile://expo-development-client/?url=' + encodeURIComponent(METRO_SERVER) },
  manifest: { runtimeVersion: 'exposdk:57.0.0', launchAsset: { url: METRO_SERVER + '/node_modules/expo-router/entry.bundle?platform=android&dev=true' },
    extra: { eas: { projectId: SOURCE.projectId }, expoClient: { sdkVersion: '57.0.0', android: { package: SOURCE.appId } } } } };
}
test.each(['catalogo-publico.yaml', 'detalle-producto.yaml'])('Debug completa onboarding SDK57 obligatorio después de Connect y conserva %s', file => {
  const original = fs.readFileSync(path.join(__dirname, '../.maestro', file), 'utf8');
  const commands = YAML.parseAllDocuments(original)[1].toJSON();
  const documents = YAML.parseAllDocuments(debugFlows(original, METRO_SERVER));
  const transformed = documents[1].toJSON();
  const onboardingText = String.raw`^This is the developer menu\. It gives you access to useful tools in your development builds\.$`;
  expect(documents[0].toJSON()).toEqual(YAML.parseAllDocuments(original)[0].toJSON());
  expect(transformed.slice(0,7)).toEqual([{ launchApp: { clearState: true } },
    { extendedWaitUntil: { visible: 'Development Build', timeout: 30000 } },
    { tapOn: 'http://' }, { inputText: METRO_SERVER }, 'hideKeyboard', { takeScreenshot: 'debug-launcher-connect' }, { tapOn: 'Connect' }]);
  expect(transformed.slice(7,16)).toEqual([
    { extendedWaitUntil: { visible: onboardingText, timeout: 45000 } }, { assertVisible: '^Continue$' },
    { takeScreenshot: 'debug-developer-menu-onboarding' }, { tapOn: '^Continue$' },
    { extendedWaitUntil: { visible: '^Reload$', timeout: 10000 } }, { assertNotVisible: onboardingText }, 'back',
    { extendedWaitUntil: { notVisible: '^Reload$', timeout: 10000 } }, { assertNotVisible: onboardingText },
  ]);
  expect(transformed.slice(16)).toEqual(commands.slice(1));
  expect(transformed.filter(command => command === 'back')).toHaveLength(1);
  expect(JSON.stringify(transformed)).not.toMatch(/openLink|optional|runFlow|retry|continue-on-error/);
  expect(() => debugFlows(original.replace('clearState: true', 'clearState: false'), METRO_SERVER)).toThrow('MAESTRO_CLEAR_STATE_REQUIRED');
  for (const url of ['http://localhost:8081', METRO_SERVER + '/', 'http://other.invalid', 'https://127.0.0.1:8081']) {
    expect(() => debugFlows(original,url)).toThrow('METRO_SERVER_URL_NOT_ALLOWED');
  }
});

test.each(['catalogo-publico.yaml', 'detalle-producto.yaml'])('la sincronización pública conserva el tap único y la aserción de transición en %s', file => {
  const commands = YAML.parseAllDocuments(fs.readFileSync(path.join(__dirname, '../.maestro', file), 'utf8'))[1].toJSON();
  expect(() => validatePublicFlow(file, commands)).not.toThrow();
  const tap = commands.findIndex(command => command.tapOn === 'Catálogo');
  for (const mutate of [
    value => value.splice(tap - 1, 1),
    value => { value[tap - 2].assertVisible.enabled = false; },
    value => { value[tap - 1].waitForAnimationToEnd.timeout = 30000; },
    value => value.splice(tap, 0, { tapOn: 'Catálogo' }),
    value => value.splice(1, 0, { tapOn: { text: '^Catálogo$', retryTapIfNoChange: true } }),
    value => { value[tap + 1].extendedWaitUntil.visible = 'Explora por deporte'; },
    value => { value[tap + 1].extendedWaitUntil.optional = true; },
    value => value.push({ sleep: 5000 }),
    value => value.push({ retry: { maxRetries: 2 } }),
  ]) {
    const changed = structuredClone(commands); mutate(changed);
    expect(() => validatePublicFlow(file, changed)).toThrow();
  }
});

test('valida metadata CLI/manifest de SDK57 y envía headers Android sin publicar cuerpos', async () => {
  const fixture = metroFixture();
  const fetchApi = jest.fn(async url => ({ status:200,ok:true,text:async () => JSON.stringify(url.includes('_expo/open') ? fixture.open : fixture.manifest) }));
  await expect(queryMetroContext(fetchApi)).resolves.toMatchObject({ serverUrl: METRO_SERVER, appId: SOURCE.appId,
    projectObserved:true, sdkVersion:'57.0.0', source:'official-cli-and-manifest' });
  expect(fetchApi.mock.calls[0][0]).toBe(METRO_SERVER+'/_expo/open?platform=android&runtime=custom');
  expect(fetchApi.mock.calls[1]).toEqual([METRO_SERVER+'/?platform=android', expect.objectContaining({redirect:'error',
    headers:{'expo-platform':'android',Accept:'application/expo+json'}})]);
  const minimal = metroFixture();delete minimal.manifest.extra;delete minimal.manifest.runtimeVersion;
  expect(verifyMetroContext(minimal.open,minimal.manifest)).toMatchObject({projectObserved:false,sdkVersion:null,runtimeVersion:null});
});
test.each([
  value => { value.open.appId='other.app'; }, value => { value.open.runtime='expo'; }, value => { value.open.scheme='other'; },
  value => { value.open.url=value.open.url.replace(encodeURIComponent(METRO_SERVER),encodeURIComponent('http://user:pass@127.0.0.1:8081')); },
  value => { value.open.url=value.open.url.replace(encodeURIComponent(METRO_SERVER),encodeURIComponent('http://127.0.0.1:8082')); },
  value => { value.open.url+='&url='+encodeURIComponent(METRO_SERVER); },
  value => { value.manifest.extra.eas.projectId='other-project'; }, value => { value.manifest.extra.expoClient.sdkVersion='58.0.0'; },
  value => { value.manifest.runtimeVersion='exposdk:58.0.0'; }, value => { value.manifest.extra.expoClient.android.package='other.app'; },
  value => { value.manifest.launchAsset.url=value.manifest.launchAsset.url.replace('127.0.0.1','other.invalid'); },
  value => { value.manifest.launchAsset.url=value.manifest.launchAsset.url.replace('dev=true','dev=false'); },
])('rechaza servidor, proyecto o bundle inesperado antes de UIConnect %#', mutate => {
  const fixture=metroFixture();mutate(fixture);expect(()=>verifyMetroContext(fixture.open,fixture.manifest)).toThrow();
});
test('no confunde timeout o respuesta HTTP con ausencia de Metro', async () => {
  await expect(metroAbsent(jest.fn(async () => { throw Object.assign(new Error('private'), { cause: { code: 'ECONNREFUSED' } }); }))).resolves.toBe(true);
  await expect(metroAbsent(jest.fn(async () => { throw Error('timeout'); }))).rejects.toThrow('METRO_ABSENCE_UNPROVEN');
  await expect(metroAbsent(jest.fn(async () => ({ ok: false })))).rejects.toThrow('METRO_STILL_LISTENING');
});
test('limpieza de Metro termina sólo el grupo propio y espera su salida', async () => {
  const child = { pid: 123456, exitCode: null, signalCode: null, kill: jest.fn() };
  const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
  try { await stopMetro(child, async () => { child.signalCode = 'SIGTERM'; });
    expect(kill).toHaveBeenCalledWith(-123456, 'SIGTERM'); expect(child.kill).not.toHaveBeenCalled(); }
  finally { kill.mockRestore(); }
});
function runtimeFixture(options={}) {
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'sport-profiles-runtime-'));
  fs.mkdirSync(path.join(temporary,'sport-center-profiles'));
  const child=Object.assign(new EventEmitter(),{exitCode:null,signalCode:null,pid:123456});
  const state={offlineStatus:'passed',productionDerived:{aabSha256:BUILDS.production.sha256,apkSha256:'d'.repeat(64)},
    developmentInspection:{manifest:{schemes:['exp+sport-center-mobile']}}};
  if(options.development)state.development=options.development;
  let uninstalled=false;
  const run=jest.fn(async(tool,args)=>{
    if(tool==='maestro'){
      const development=args.includes('test-results/profiles-development.xml');
      if((development&&(options.failDebug??true))||(!development&&options.failRelease))throw Error('controlled phase failure');return '';
    }
    if(args[0]==='devices')return 'List of devices attached\nemulator-5554\tdevice\n';
    if(args.includes('ro.kernel.qemu'))return '1';
    if(args.includes('ro.build.version.sdk'))return '34';
    if(args.includes('ro.product.cpu.abi'))return 'x86_64';
    if(args.includes('pidof')){if(options.failObservation)throw Error('private failure');return '1234';}
    if(args.includes('logcat')&&args.includes('-d')&&options.failObservation)throw Error('private failure');
    if(args.includes('--remove')&&options.failCleanup)throw Error('controlled cleanup failure');
    if(args.includes('--list')&&options.leftoverReverse)return 'emulator-5554 tcp:8081 tcp:8081';
    if(args.includes('uninstall'))uninstalled=true;
    if(args.includes('packages')&&options.leftoverPackage&&!uninstalled)return 'package:'+SOURCE.appId;
    return '';
  });
  const stop=jest.fn(async()=>{child.signalCode='SIGTERM';}),save=jest.fn(update=>Object.assign(state,update)),start=jest.fn(()=>child);
  const config={run,save,stop,platform:'linux',source:async()=>({artifactSourceCommit:SOURCE.commit,automationCommit:sha}),
    fileHash:async file=>file.endsWith('development.apk')?BUILDS.development.sha256:'d'.repeat(64),
    read:file=>file.endsWith('.xml')?'<testsuite><testcase name="catalog"/><testcase name="detail"/></testsuite>':JSON.stringify(state),
    wait:async()=>({ready:true}),idle:async()=>{if(options.metroStillListening)throw new ProfileError('METRO_STILL_LISTENING');return true;},
    start,ready:async()=>{},getMetroContext:async()=>{const f=metroFixture();return verifyMetroContext(f.open,f.manifest);}};
  const env={RUNNER_TEMP:temporary,GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',PINNING_EPHEMERAL_AVD:'true',PRODUCT_NAME:'Test product'};
  return{run,save,state,start,stop,child,config,env,dispose:()=>fs.rmSync(temporary,{recursive:true,force:true})};
}
const debugPassed=()=>({status:'passed_public_scope',cleanup:'passed',api:34,profile:'development',artifactSourceCommit:SOURCE.commit,automationCommit:sha});

test('Debug y release requieren invocaciones separadas; un fallo Debug conservado no se sobrescribe al aprobar release',async()=>{
  const f=runtimeFixture();try{
    await expect(runtime(f.env,'debug34',f.config)).rejects.toThrow('PROFILE_PUBLIC_PHASES_FAILED');
    expect(f.state.runtimeApi34Status).toBe('failed');expect(f.state.runtimeApi34MissingPhases).toEqual(['production']);
    const debug=structuredClone(f.state.development);
    await expect(runtime(f.env,'release34',f.config)).resolves.toBeUndefined();
    expect(f.state.development).toEqual(debug);
    expect(f.state.runtimeApi34Status).toBe('failed');expect(f.state.runtimeApi34MissingPhases).toEqual([]);
    expect(f.state.runtimeApi34Failures).toEqual([{phase:'development',reason:'PUBLIC_PROFILE_ACCEPTANCE_FAILED'}]);
    expect(f.state.production).toMatchObject({status:'passed_public_scope',configuredAvdName:'profiles-release34',independentOfMetro:true,
      cleanReleaseStart:{metroAbsent:true,reverseAbsent:true,packageAbsent:true}});
    expect(f.start).toHaveBeenCalledTimes(1);
    expect(f.start).toHaveBeenCalledWith(process.execPath,['--dns-result-order=ipv4first',path.resolve('node_modules/expo/bin/cli'),
      'start','--dev-client','--localhost','--port','8081'],expect.objectContaining({detached:true}));
    expect(f.start.mock.calls[0][2].env.NODE_OPTIONS).toBeUndefined();
    const calls=f.run.mock.calls.filter(([tool])=>tool==='maestro');expect(calls).toHaveLength(2);
    for(const [,args,config]of calls){expect(args.slice(0,3)).toEqual(['--device','emulator-5554','test']);expect(config.env.ANDROID_SERIAL).toBeUndefined();}
    expect(debug.failureObservation).toMatchObject({capture:'after-maestro-suite-before-cleanup',perCaseAttribution:'not-established',process:{status:'observed',appRunning:true,pids:[1234]}});
    const firstUninstall=f.run.mock.calls.findIndex(([,args])=>args.includes('uninstall'));
    const installs=f.run.mock.calls.map(([,args],index)=>args.includes('install')?index:-1).filter(index=>index>=0);
    expect(installs[1]).toBeGreaterThan(firstUninstall);
  }finally{f.dispose();}
});

test('limpieza Debug fallida bloquea release y no pierde el fallo original',async()=>{
  const f=runtimeFixture({failCleanup:true});try{
    await expect(runtime(f.env,'debug34',f.config)).rejects.toThrow('PROFILE_CLEANUP_FAILED');
    await expect(runtime(f.env,'release34',f.config)).rejects.toThrow('DEBUG_CLEANUP_NOT_PASSED');
    expect(f.run.mock.calls.filter(([tool])=>tool==='maestro')).toHaveLength(1);
    expect(f.run.mock.calls.filter(([,args])=>args.includes('install'))).toHaveLength(1);
    expect(f.state.development).toMatchObject({status:'failed',cleanup:'failed',reason:'PUBLIC_PROFILE_ACCEPTANCE_FAILED'});
    expect(f.state.runtimeApi34Status).toBe('failed');
  }finally{f.dispose();}
});

test.each([undefined,{...debugPassed(),cleanup:undefined},{...debugPassed(),status:'running'},
  {...debugPassed(),automationCommit:'b'.repeat(40)},{...debugPassed(),artifactSourceCommit:'c'.repeat(40)}])('release bloquea falta de cleanup Debug válido de la automatización actual %#',async development=>{
  const f=runtimeFixture({development});try{
    await expect(runtime(f.env,'release34',f.config)).rejects.toThrow('DEBUG_CLEANUP_NOT_PASSED');
    expect(f.run.mock.calls.filter(([,args])=>args.includes('install'))).toHaveLength(0);
  }finally{f.dispose();}
});

test.each([{leftoverReverse:true},{leftoverPackage:true},{metroStillListening:true}])('release en AVD separada conserva las comprobaciones Metro/reverse/paquete %#',async options=>{
  const f=runtimeFixture({...options,development:debugPassed()});try{
    await expect(runtime(f.env,'release34',f.config)).rejects.toThrow('PROFILE_PUBLIC_PHASES_FAILED');
    expect(f.run.mock.calls.filter(([tool])=>tool==='maestro')).toHaveLength(0);
    expect(f.run.mock.calls.filter(([,args])=>args.includes('install'))).toHaveLength(0);
    expect(f.state.production.status).toBe('failed');expect(f.state.runtimeApi34Status).toBe('failed');
  }finally{f.dispose();}
});

test('API34 queda incompleto tras Debug aprobado y sólo aprueba después de release aprobado, sin sobrescribir fases',async()=>{
  const f=runtimeFixture({failDebug:false});try{
    await expect(runtime(f.env,'debug34',f.config)).resolves.toBeUndefined();
    expect(f.state.runtimeApi34Status).toBe('incomplete');expect(f.state.runtimeApi34MissingPhases).toEqual(['production']);
    await expect(runtime(f.env,'release34',f.config)).resolves.toBeUndefined();
    expect(f.state.runtimeApi34Status).toBe('passed');expect(f.state.runtimeApi34Failures).toEqual([]);
    const state=structuredClone(f.state);
    await expect(runtime(f.env,'release34',f.config)).rejects.toThrow('PROFILE_PHASE_ALREADY_RECORDED');
    expect(f.state).toEqual(state);
    expect(f.run.mock.calls.filter(([tool])=>tool==='maestro')).toHaveLength(2);
    expect(f.state.development.failureObservation).toBeUndefined();expect(f.state.production.failureObservation).toBeUndefined();
  }finally{f.dispose();}
});

test('retira modo mixto y mantiene perfiles API34/API36 explícitos con AVDs distintos',async()=>{
  expect(Object.keys(RUNTIME_PHASES)).toEqual(['debug34','release34','api36']);
  expect(new Set(Object.values(RUNTIME_PHASES).map(value=>value.avd)).size).toBe(3);
  await expect(main('api34',{})).rejects.toThrow('PROFILE_RUNTIME_MODE_REQUIRED');
  const f=runtimeFixture();try{for(const mode of [34,'api34','other','toString'])await expect(runtime(f.env,mode,f.config)).rejects.toThrow('PROFILE_RUNTIME_MODE_REQUIRED');}
  finally{f.dispose();}
});

test('agregado API34 exige ambos resultados y cleanup, sin aprobación por omisión',()=>{
  expect(api34Aggregate({})).toMatchObject({runtimeApi34Status:'incomplete',runtimeApi34MissingPhases:['development','production']});
  expect(api34Aggregate({development:debugPassed()})).toMatchObject({runtimeApi34Status:'incomplete'});
  expect(api34Aggregate({development:debugPassed(),production:{status:'passed_public_scope',cleanup:'passed'}})).toMatchObject({runtimeApi34Status:'passed'});
  expect(api34Aggregate({development:debugPassed(),production:{status:'passed_public_scope'}})).toMatchObject({runtimeApi34Status:'failed'});
});

test('fallo del diagnóstico nunca oculta fallo Maestro ni limpieza',async()=>{
  const f=runtimeFixture({failObservation:true});try{
    await expect(runtime(f.env,'debug34',f.config)).rejects.toThrow('PROFILE_PUBLIC_PHASES_FAILED');
    expect(f.state.development).toMatchObject({reason:'PUBLIC_PROFILE_ACCEPTANCE_FAILED',cleanup:'passed',failureObservation:{process:{status:'unknown',appRunning:null},crash:{status:'unknown'}}});
  }finally{f.dispose();}
});

test('diagnóstico de crash retiene sólo códigos de eventos identificados por paquete, sin texto privado',async()=>{
  const raw='E/AndroidRuntime(1234): FATAL EXCEPTION: main\nE/AndroidRuntime(1234): Process: '+SOURCE.appId+', PID: 1234\nE/AndroidRuntime(1234): private@example.invalid SECRET\n'
    +'F/DEBUG   (555): pid: 1234, tid: 1234 >>> '+SOURCE.appId+' <<<\nF/DEBUG   (555): signal 6 (SIGABRT), private SECRET\n';
  expect(failureCrashEvidence(raw).codes).toEqual(['JAVA_FATAL','NATIVE_FATAL']);
  expect(failureCrashEvidence(raw.replaceAll(SOURCE.appId,'other.app')).codes).toEqual([]);
  expect(failureCrashEvidence('E/AndroidRuntime(1): FATAL EXCEPTION: main\nI/other(2): Process: '+SOURCE.appId+', PID: 1\n').codes).toEqual([]);
  expect(failureCrashEvidence('x'.repeat(512*1024+1)).status).toBe('unknown');
  expect(failureCrashEvidence('logcat: Permission denied').status).toBe('unknown');
  const adb=jest.fn(async args=>args.includes('pidof')?'1234':raw);
  const evidence=await observeFailure(adb);
  expect(adb).toHaveBeenCalledWith(['shell','pidof',SOURCE.appId],{timeout:5000,maxBuffer:4096});
  expect(adb).toHaveBeenCalledWith(['logcat','-b','crash','-d','-v','brief'],{timeout:5000,maxBuffer:512*1024});
  expect(JSON.stringify(evidence)).not.toMatch(/SECRET|example|Process:|signal 6/);
  const malformed=await observeFailure(jest.fn(async args=>args.includes('pidof')?'1234 SECRET':''));
  expect(malformed.process).toEqual({status:'unknown',appRunning:null,pids:[]});
});

test.each(['failure', 'skipped', 'cancelled', undefined])('agregado de perfiles bloquea resultado %s', async result => {
  await expect(main('gate', { RESULT_QUALITY: 'success', RESULT_SECURITY: 'success', RESULT_PROFILES: result })).rejects.toThrow('PROFILE_REQUIRED_JOB_NOT_SUCCESSFUL');
});
test('agregado sólo aprueba todos los jobs correctos', async () => {
  await expect(main('gate', { RESULT_QUALITY: 'success', RESULT_SECURITY: 'success', RESULT_PROFILES: 'success' })).resolves.toBeUndefined();
});
test.each([
  workflow => { workflow.jobs.profiles.if = 'always()'; },
  workflow => { workflow.jobs.native.if = "startsWith(github.ref, 'refs/tags/validation/profiles-')"; },
  workflow => { workflow.jobs.result.if = 'always()'; },
  workflow => { workflow.jobs.profiles.env.EXPO_TOKEN = 'secret'; },
  workflow => { workflow.jobs.profiles.env.GITHUB_SHA = 'spoof'; },
  workflow => { workflow.jobs.profiles.steps.find(step => step.id === 'source').if = 'false'; },
  workflow => { workflow.jobs.profiles.steps.find(step => step.id === 'inspection')['continue-on-error'] = true; },
  workflow => { workflow.jobs.profiles.steps.find(step => step.id === 'pages16k').with.target = 'google_apis'; },
  workflow => { workflow.jobs.profiles.steps.find(step => step.id === 'pages16k').if = 'always()'; },
  workflow => { workflow.jobs.profiles.steps.find(step => step.id === 'pages16k').if = "${{ !cancelled() && steps.api34.outcome == 'success' }}"; },
  workflow => { workflow.jobs.profiles.steps = workflow.jobs.profiles.steps.filter(step => step.run !== 'node scripts/android-profiles.js cleanup'); },
  workflow => { workflow.jobs.profiles.steps.find(step => step.uses?.startsWith('actions/upload-artifact')).with.path += '\nkeystore.jks'; },
  workflow => { workflow.jobs.profiles_result.steps.find(step => step.run?.endsWith(' gate')).env.RESULT_PROFILES = 'success'; },
])('rechaza orquestación de perfiles insegura o que falsea resultados %#', mutate => {
  const config = workflows(); mutate(config.get('android-validation.yml')); expect(() => validateWorkflows(config)).toThrow();
});


test.each(['native', 'profiles'])('API36 16KB de %s fija RAM guest sin override CLI', jobName => {
  const config = workflows();
  const job = config.get('android-validation.yml').jobs[jobName];
  expect(job.steps.find(step => step.id === 'pages16k').with['ram-size']).toBe('4096M');
  for (const step of job.steps.filter(step => step.with?.['api-level'] === 34)) expect(step.with['ram-size']).toBeUndefined();
  expect(() => validateWorkflows(config)).not.toThrow();
  for (const mutate of [
    step => { delete step.with['ram-size']; },
    step => { step.with['ram-size'] = '2560M'; },
    step => { step.with['ram-size'] = 4096; },
    step => { step.with['emulator-options'] += ' -memory 2048'; },
    step => { step.with['emulator-options'] += ' -memory=2048'; },
    step => { step.with['emulator-options'] += ' -qemu -m 2048'; },
    step => { step.with['emulator-options'] += ' -qemu -m2048'; },
  ]) {
    const changed = workflows(); mutate(changed.get('android-validation.yml').jobs[jobName].steps.find(step => step.id === 'pages16k'));
    expect(() => validateWorkflows(changed)).toThrow();
  }
});


test.each([
  job => { job.steps.find(step => step.id === 'release34').if = 'success()'; },
  job => { job.steps.find(step => step.id === 'release34').with['avd-name'] = 'profiles-debug34'; },
  job => { job.steps.find(step => step.id === 'debug34').with['force-avd-creation'] = false; },
  job => { job.steps.find(step => step.id === 'release34').with.script = 'node scripts/android-profiles.js api34'; },
  job => { job.steps.find(step => step.id === 'release34')['continue-on-error'] = true; },
  job => { job.steps.find(step => step.id === 'debug34').with['ram-size'] = '4096M'; },
])('no permite mezclar AVD/perfil, omitir fase tras fallo o cambiar RAM API34 %#', mutate => {
  const config=workflows();mutate(config.get('android-validation.yml').jobs.profiles);expect(()=>validateWorkflows(config)).toThrow();
});

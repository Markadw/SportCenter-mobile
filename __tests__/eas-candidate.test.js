/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { describe, test, expect, jest } = require('@jest/globals');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCandidateIdentity, ensureCandidateBuild, main } = require('../scripts/eas-candidate');
const projectId = '12345678-1234-1234-1234-123456789abc';
const buildId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const otherId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const sha = 'a'.repeat(40);
function settings() {
  const app = { expo: { extra: { eas: { projectId } }, android: { package: 'com.sport.center' }, version: '1.0.0' } };
  const eas = { build: { preview: { distribution: 'internal', android: { buildType: 'apk' }, env: { EXPO_PUBLIC_API_URL: 'https://example.test' } } } };
  return { app, eas, effectiveConfig: { appConfig: structuredClone(app.expo), buildProfile: {
    distribution: 'internal', buildType: 'apk', env: { EXPO_PUBLIC_API_URL: 'https://example.test' },
  } }, lockfile: '{"lockfileVersion":3}', commit: sha, apiUrl: 'https://example.test', revision: 'qa-remote-1' };
}
function identity() { return createCandidateIdentity(settings()); }
function build(values = {}) {
  const candidate = identity();
  return { id: buildId, app: { id: projectId }, platform: 'ANDROID', appIdentifier: 'com.sport.center',
    gitCommitHash: sha, buildProfile: 'preview', message: candidate.message, status: 'FINISHED',
    artifacts: { applicationArchiveUrl: 'https://example.test/app.apk?signature=PRIVATE-SIGNED-URL' }, ...values };
}
function clock() {
  let time = 0;
  return { now: () => time, pause: jest.fn(async ms => { time += ms; }), waitMs: 10, pollMs: 2 };
}
function providers(values = {}) {
  return { identity: identity(), listBuilds: jest.fn(async () => [build()]), viewBuild: jest.fn(async () => build()),
    createBuild: jest.fn(async () => [build({ status: 'NEW' })]), reuseBuildId: buildId, attempt: 2, ...clock(), ...values };
}
async function temporary(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-eas-candidate-'));
  try { return await callback(directory); }
  finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('sport-eas-candidate-')) throw Error('Ruta temporal inesperada');
    fs.rmSync(directory, { recursive: true });
  }
}

describe('Identidad EAS de configuración controlada, sin equivalencia por SHA solo', () => {
  test('es determinista ante orden JSON y excluye rutas internas del runner', () => {
    const a = settings(), b = settings();
    b.effectiveConfig.appConfig = { version: '1.0.0', android: { package: 'com.sport.center' }, extra: { eas: { projectId } }, _internal: { projectRoot: '/PRIVATE/runner' } };
    expect(createCandidateIdentity(a)).toEqual(createCandidateIdentity(b));
    expect(JSON.stringify(createCandidateIdentity(b))).not.toContain('PRIVATE');
  });
  test.each([
    value => { value.apiUrl = 'https://other.test'; value.eas.build.preview.env.EXPO_PUBLIC_API_URL = value.apiUrl; value.effectiveConfig.buildProfile.env.EXPO_PUBLIC_API_URL = value.apiUrl; },
    value => { value.app.expo.version = '1.0.1'; },
    value => { value.effectiveConfig.buildProfile.image = 'pinned-image'; },
    value => { value.lockfile += ' '; },
    value => { value.revision = 'qa-remote-2'; },
    value => { value.commit = 'b'.repeat(40); },
  ])('un cambio de entrada controlada invalida la marca: %#', mutate => {
    const value = settings(); mutate(value);
    expect(createCandidateIdentity(value).message).not.toBe(identity().message);
  });
  test.each([
    value => { delete value.revision; }, value => { value.apiUrl = 'http://example.test'; },
    value => { value.apiUrl = 'https://PRIVATE:SECRET@example.test'; },
    value => { value.apiUrl = 'https://example.test?token=PRIVATE'; },
    value => { value.effectiveConfig.buildProfile.env.EXPO_PUBLIC_API_URL = 'https://other.test'; },
    value => { value.effectiveConfig.appConfig.extra.eas.projectId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; },
    value => { value.effectiveConfig.appConfig.android.package = 'com.other.app'; },
    value => { value.effectiveConfig.buildProfile.buildType = 'app-bundle'; },
  ])('no inventa identidad para configuración incompleta o incompatible: %#', mutate => {
    const value = settings(); mutate(value);
    expect(() => createCandidateIdentity(value)).toThrow();
  });
});

describe('Resolución de compilación exacta y reintentos explícitos', () => {
  test('reutiliza sólo ID confirmado y build:view fresco, sin crear otro APK', async () => {
    const calls = providers();
    const result = await ensureCandidateBuild(calls);
    expect(result).toMatchObject({ source: 'reused', build: { id: buildId, status: 'FINISHED' } });
    expect(calls.viewBuild).toHaveBeenCalledWith(buildId);
    expect(calls.createBuild).not.toHaveBeenCalled();
  });
  test.each([
    { app: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' } }, { platform: 'IOS' },
    { gitCommitHash: 'b'.repeat(40) }, { buildProfile: 'production' }, { appIdentifier: 'com.other.app' },
  ])('jamás selecciona otro proyecto, plataforma, commit, perfil o app: %#', changed => {
    const calls = providers({ listBuilds: jest.fn(async () => [build(changed)]) });
    return expect(ensureCandidateBuild(calls)).rejects.toThrow('BUILD_SCOPE_MISMATCH').then(() => expect(calls.createBuild).not.toHaveBeenCalled());
  });
  test.each([undefined, 'sin-marca', 'sport-center-candidate-v1:' + 'b'.repeat(64)])('SHA coincidente sin marca exacta no se reutiliza: %s', message => {
    const calls = providers({ listBuilds: jest.fn(async () => [build({ message })]) });
    return expect(ensureCandidateBuild(calls)).rejects.toThrow('EXACT_REUSE_NOT_FOUND').then(() => expect(calls.createBuild).not.toHaveBeenCalled());
  });
  test('ni un force nuevo permite duplicar silenciosamente un candidato exacto ya existente', async () => {
    const calls = providers({ reuseBuildId: undefined, allowNew: true });
    await expect(ensureCandidateBuild(calls)).rejects.toThrow('EXPLICIT_REUSE_ID_REQUIRED');
    expect(calls.createBuild).not.toHaveBeenCalled();
  });
  test('el primer intento vacío crea una sola vez y marca el build antes de verificarlo', async () => {
    const calls = providers({ listBuilds: jest.fn(async () => []), reuseBuildId: undefined, attempt: 1 });
    expect(await ensureCandidateBuild(calls)).toMatchObject({ source: 'created' });
    expect(calls.createBuild).toHaveBeenCalledTimes(1);
    expect(calls.createBuild).toHaveBeenCalledWith(identity().message);
    expect(calls.viewBuild).toHaveBeenCalledTimes(1);
  });
  test('un rerun vacío requiere autorización explícita para crear otro', async () => {
    const calls = providers({ listBuilds: jest.fn(async () => []), reuseBuildId: undefined });
    await expect(ensureCandidateBuild(calls)).rejects.toThrow('EXPLICIT_NEW_BUILD_REQUIRED');
    expect(calls.createBuild).not.toHaveBeenCalled();
    expect(await ensureCandidateBuild({ ...calls, allowNew: true })).toMatchObject({ source: 'created' });
    expect(calls.createBuild).toHaveBeenCalledTimes(1);
  });
  test('un build legado del mismo SHA exige la misma autorización, no prueba ausencia', async () => {
    const calls = providers({ listBuilds: jest.fn(async () => [build({ message: null })]), reuseBuildId: undefined, attempt: 1 });
    await expect(ensureCandidateBuild(calls)).rejects.toThrow('EXPLICIT_NEW_BUILD_REQUIRED');
    expect(calls.createBuild).not.toHaveBeenCalled();
  });
  test('reconstruye un fallo terminal sólo con autorización explícita y view fresco', async () => {
    const calls = providers({ reuseBuildId: undefined, allowNew: true, listBuilds: jest.fn(async () => [build({ status: 'ERRORED' })]),
      createBuild: jest.fn(async () => [build({ id: otherId, status: 'NEW' })]),
      viewBuild: jest.fn(async id => build({ id, status: id === buildId ? 'ERRORED' : 'FINISHED' })) });
    expect(await ensureCandidateBuild(calls)).toMatchObject({ source: 'created', build: { id: otherId } });
    expect(calls.createBuild).toHaveBeenCalledTimes(1);
  });
  test('espera la compilación activa seleccionada con límite y verifica cada respuesta', async () => {
    const calls = providers({ viewBuild: jest.fn().mockResolvedValueOnce(build({ status: 'IN_QUEUE' }))
      .mockResolvedValueOnce(build({ status: 'IN_PROGRESS' })).mockResolvedValueOnce(build()) });
    expect(await ensureCandidateBuild(calls)).toMatchObject({ source: 'reused' });
    expect(calls.pause).toHaveBeenCalledTimes(2);
    expect(calls.createBuild).not.toHaveBeenCalled();
    const stalled = providers({ viewBuild: jest.fn(async () => build({ status: 'IN_PROGRESS' })) });
    await expect(ensureCandidateBuild(stalled)).rejects.toThrow('WAIT_TIMEOUT');
    expect(stalled.createBuild).not.toHaveBeenCalled();
  });
  test.each(['ERRORED', 'CANCELED', 'unknown'])('estado %s bloquea sin crear un sustituto', async status => {
    const calls = providers({ viewBuild: jest.fn(async () => build({ status })) });
    await expect(ensureCandidateBuild(calls)).rejects.toThrow('BUILD_NOT_SUCCESSFUL');
    expect(calls.createBuild).not.toHaveBeenCalled();
  });
  test.each([
    { id: otherId }, { message: 'changed' }, { app: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' } },
    { expirationDate: '1970-01-01T00:00:00Z' }, { expirationDate: 'invalid' },
    { artifacts: { buildUrl: 'http://example.test/app.apk' } }, { artifacts: { buildUrl: 'https://example.test/app.aab' } },
  ])('rechaza metadata cambiada, caducidad o artefacto inválido tras view: %#', async changed => {
    const calls = providers({ viewBuild: jest.fn(async () => build(changed)) });
    await expect(ensureCandidateBuild(calls)).rejects.toThrow();
    expect(calls.createBuild).not.toHaveBeenCalled();
  });
  test.each(['listBuilds', 'viewBuild'])('un fallo de %s no se convierte en creación', async method => {
    const calls = providers({ [method]: jest.fn(async () => { throw Error('fallo de consulta'); }) });
    await expect(ensureCandidateBuild(calls)).rejects.toThrow('fallo de consulta');
    expect(calls.createBuild).not.toHaveBeenCalled();
  });
  test('una respuesta de creación incierta nunca provoca un segundo intento', async () => {
    const calls = providers({ reuseBuildId: undefined, listBuilds: jest.fn(async () => []), attempt: 1,
      createBuild: jest.fn(async () => { throw Error('respuesta perdida'); }) });
    await expect(ensureCandidateBuild(calls)).rejects.toThrow('respuesta perdida');
    expect(calls.createBuild).toHaveBeenCalledTimes(1);
  });
  test('consulta más de una página antes de decidir y bloquea el límite sin asumir ausencia', async () => {
    const page = Array.from({ length: 50 }, (_, index) => build({ id: '00000000-0000-0000-0000-' + String(index).padStart(12, '0') }));
    const calls = providers({ reuseBuildId: page[49].id, listBuilds: jest.fn().mockResolvedValueOnce(page).mockResolvedValueOnce([]),
      viewBuild: jest.fn(async id => build({ id })) });
    expect((await ensureCandidateBuild(calls)).build.id).toBe(page[49].id);
    expect(calls.listBuilds.mock.calls.map(([query]) => query.offset)).toEqual([0, 50]);
    const full = providers({ listBuilds: jest.fn(async ({ offset }) => page.map((item, index) => ({ ...item,
      id: '00000000-0000-0000-0000-' + String(offset + index).padStart(12, '0') }))) });
    await expect(ensureCandidateBuild(full)).rejects.toThrow('LOOKUP_INCOMPLETE');
    expect(full.createBuild).not.toHaveBeenCalled();
  });
});

test('CLI inyectada mantiene el JSON del download y sólo guarda metadata pública compacta', () => temporary(async cwd => {
  const values = settings();
  for (const [file, value] of [['app.json', values.app], ['eas.json', values.eas]]) fs.writeFileSync(path.join(cwd, file), JSON.stringify(value));
  fs.writeFileSync(path.join(cwd, 'package-lock.json'), values.lockfile);
  const request = jest.fn(async args => {
    if (args[0] === '--version') return 'eas-cli/27.2.0 linux-x64 node-v22.20.0';
    if (args[0] === 'config') return values.effectiveConfig;
    if (args[0] === 'build:list') return [build()];
    if (args[0] === 'build:view') return build();
    throw Error('No se permite crear en esta prueba');
  });
  const result = await main({ cwd, env: { EXPO_TOKEN: 'PRIVATE-TOKEN', GITHUB_SHA: sha, GITHUB_RUN_ATTEMPT: '2',
    API_BASE_URL: values.apiUrl, EAS_CONFIG_REVISION: values.revision, EAS_REUSE_BUILD_ID: buildId }, request });
  expect(result).toMatchObject({ buildId, source: 'reused', projectId, commit: sha, profile: 'preview' });
  const compact = fs.readFileSync(path.join(cwd, 'test-results/eas-candidate.json'), 'utf8');
  expect(compact).not.toContain('PRIVATE'); expect(compact).not.toContain('https:');
  expect(JSON.parse(fs.readFileSync(path.join(cwd, 'test-results/eas-build.json'), 'utf8'))).toEqual([build()]);
  expect(request.mock.calls.some(([args]) => args[0] === 'build')).toBe(false);
}));


test.each(['antes de config', 'antes de crear'])('una versión latest nueva bloquea %s sin compilar', stage => temporary(async cwd => {
  const values = settings();
  for (const [file, value] of [['app.json', values.app], ['eas.json', values.eas]]) fs.writeFileSync(path.join(cwd, file), JSON.stringify(value));
  fs.writeFileSync(path.join(cwd, 'package-lock.json'), values.lockfile);
  let versionCalls = 0;
  const request = jest.fn(async args => {
    if (args[0] === '--version') {
      versionCalls += 1;
      return stage === 'antes de config' || versionCalls > 1 ? 'eas-cli/27.2.1 linux-x64 node-v22.20.0' : 'eas-cli/27.2.0 linux-x64 node-v22.20.0';
    }
    if (args[0] === 'config') return values.effectiveConfig;
    if (args[0] === 'build:list') return [];
    throw Error('No debe compilar ni descargar');
  });
  await expect(main({ cwd, env: { EXPO_TOKEN: 'PRIVATE-TOKEN', GITHUB_SHA: sha, GITHUB_RUN_ATTEMPT: '1',
    API_BASE_URL: values.apiUrl, EAS_CONFIG_REVISION: values.revision }, request })).rejects.toThrow('CLI_VERSION_UNVERIFIED');
  expect(request.mock.calls.some(([args]) => args[0] === 'build')).toBe(false);
  if (stage === 'antes de config') expect(request).toHaveBeenCalledTimes(1);
}));

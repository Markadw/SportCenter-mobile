const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { selectAndroidBuild } = require('./android-ci');

const EAS_CLI_VERSION = '27.2.0';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const active = new Set(['NEW', 'IN_QUEUE', 'IN_PROGRESS', 'PENDING_CANCEL']);
class CandidateError extends Error {
  constructor(code) { super('Candidato EAS bloqueado: ' + code + '.'); this.code = code; }
}
function requireValue(condition, code) { if (!condition) throw new CandidateError(code); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function apiAddress(value) {
  let url;
  try { url = new URL(value); } catch { throw new CandidateError('API_INVALID'); }
  requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'API_INVALID');
  return url.toString().replace(/\/+$/, '');
}
function createCandidateIdentity({ app, eas, effectiveConfig, lockfile, commit, apiUrl, revision, profile = 'preview' }) {
  requireValue(/^[a-f0-9]{40}$/i.test(commit || ''), 'COMMIT_REQUIRED');
  requireValue(/^[a-z][a-z0-9-]{0,31}$/.test(profile), 'PROFILE_INVALID');
  requireValue(typeof revision === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(revision), 'REMOTE_CONFIG_REVISION_REQUIRED');
  requireValue(typeof lockfile === 'string' && lockfile.length > 0, 'LOCKFILE_REQUIRED');
  const projectId = app?.expo?.extra?.eas?.projectId;
  const appId = app?.expo?.android?.package;
  const config = effectiveConfig?.appConfig;
  const buildProfile = effectiveConfig?.buildProfile;
  requireValue(uuid.test(projectId || '') && config?.extra?.eas?.projectId === projectId, 'PROJECT_MISMATCH');
  requireValue(typeof appId === 'string' && /^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(appId) && config?.android?.package === appId, 'APP_IDENTIFIER_MISMATCH');
  requireValue(eas?.build?.[profile]?.android?.buildType === 'apk' && buildProfile?.buildType === 'apk'
    && buildProfile.distribution === 'internal' && !buildProfile.developmentClient, 'APK_PROFILE_REQUIRED');
  const api = apiAddress(apiUrl);
  requireValue(apiAddress(buildProfile.env?.EXPO_PUBLIC_API_URL) === api
    && apiAddress(eas.build[profile].env?.EXPO_PUBLIC_API_URL) === api, 'EFFECTIVE_API_MISMATCH');
  // _internal contiene rutas del runner, no configuración pública del APK.
  const publicConfig = { ...config }; delete publicConfig._internal;
  const configFingerprint = digest(JSON.stringify(canonical({ version: 1, cli: EAS_CLI_VERSION,
    projectId, appId, commit: commit.toLowerCase(), profile, api, revision,
    app: app.expo, eas, effectiveConfig: { appConfig: publicConfig, buildProfile }, lockfileHash: digest(lockfile) })));
  return { projectId, appId, commit: commit.toLowerCase(), profile, configFingerprint, message: 'sport-center-candidate-v1:' + configFingerprint };
}
function verifyScope(build, identity) {
  requireValue(build && typeof build === 'object' && uuid.test(build.id || ''), 'BUILD_METADATA_INVALID');
  requireValue(build.app?.id === identity.projectId && build.platform === 'ANDROID'
    && build.gitCommitHash === identity.commit && build.buildProfile === identity.profile
    && build.appIdentifier === identity.appId, 'BUILD_SCOPE_MISMATCH');
}
async function ensureCandidateBuild({ identity, listBuilds, viewBuild, createBuild, reuseBuildId,
  allowNew = false, attempt, onProgress = () => {}, now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  waitMs = 30 * 60 * 1000, pollMs = 15000 }) {
  requireValue(Number.isSafeInteger(attempt) && attempt > 0 && typeof allowNew === 'boolean', 'ATTEMPT_INVALID');
  requireValue(Number.isSafeInteger(waitMs) && waitMs > 0 && waitMs <= 45 * 60 * 1000
    && Number.isSafeInteger(pollMs) && pollMs > 0 && pollMs <= 30000, 'WAIT_LIMIT_INVALID');
  requireValue(reuseBuildId === undefined || uuid.test(reuseBuildId), 'REUSE_ID_INVALID');
  const deadline = now() + waitMs;
  const builds = [], ids = new Set();
  let complete = false;
  for (let page = 0; page < 4; page += 1) {
    const batch = await listBuilds({ offset: page * 50, limit: 50, identity });
    requireValue(Array.isArray(batch) && batch.length <= 50, 'LOOKUP_INVALID');
    for (const build of batch) {
      verifyScope(build, identity);
      requireValue(!ids.has(build.id), 'LOOKUP_UNSTABLE'); ids.add(build.id); builds.push(build);
    }
    if (batch.length < 50) { complete = true; break; }
  }
  requireValue(complete && now() < deadline, 'LOOKUP_INCOMPLETE');
  const matching = builds.filter(build => build.message === identity.message);
  let selected, source;
  if (reuseBuildId) {
    selected = matching.find(build => build.id === reuseBuildId);
    requireValue(selected, 'EXACT_REUSE_NOT_FOUND'); source = 'reused';
  } else {
    // El ID explícito confirma la reutilización: EAS no expone todos los secretos cloud.
    for (const previous of matching) {
      requireValue(allowNew, 'EXPLICIT_REUSE_ID_REQUIRED');
      const fresh = await viewBuild(previous.id); verifyScope(fresh, identity);
      requireValue(fresh.id === previous.id && fresh.message === identity.message, 'BUILD_CONFIG_MISMATCH');
      requireValue(['ERRORED', 'CANCELED'].includes(fresh.status), 'EXPLICIT_REUSE_ID_REQUIRED');
    }
    requireValue(allowNew || (attempt === 1 && builds.length === 0), 'EXPLICIT_NEW_BUILD_REQUIRED');
    requireValue(now() < deadline, 'WAIT_TIMEOUT');
    const created = await createBuild(identity.message);
    requireValue(Array.isArray(created) && created.length === 1, 'CREATE_RESULT_INVALID');
    [selected] = created; source = 'created'; verifyScope(selected, identity);
    requireValue(selected.message === identity.message, 'BUILD_CONFIG_MISMATCH');
  }
  const buildId = selected.id;
  let previousStatus;
  while (now() < deadline) {
    const build = await viewBuild(buildId);
    requireValue(now() < deadline, 'WAIT_TIMEOUT');
    verifyScope(build, identity);
    requireValue(build.id === buildId && build.message === identity.message, 'BUILD_CONFIG_MISMATCH');
    requireValue(active.has(build.status) || ['FINISHED', 'ERRORED', 'CANCELED'].includes(build.status), 'BUILD_NOT_SUCCESSFUL');
    if (build.status !== previousStatus) {
      onProgress({ buildId, source, status: build.status }); previousStatus = build.status;
    }
    if (build.status === 'FINISHED') {
      if (build.expirationDate !== undefined && build.expirationDate !== null) {
        requireValue(Number.isFinite(Date.parse(build.expirationDate)) && Date.parse(build.expirationDate) > now(), 'BUILD_EXPIRED');
      }
      try { selectAndroidBuild([build], identity.commit); } catch { throw new CandidateError('APK_ARTIFACT_INVALID'); }
      return { build, source, identity };
    }
    requireValue(active.has(build.status), 'BUILD_NOT_SUCCESSFUL');
    const remaining = deadline - now();
    requireValue(remaining > 0, 'WAIT_TIMEOUT');
    await pause(Math.min(pollMs, remaining));
  }
  throw new CandidateError('WAIT_TIMEOUT');
}
async function runEas(args, { cwd, env }) {
  try {
    // Los resultados quedan capturados: no imprimir config, errores remotos ni URLs firmadas.
    const { stdout } = await promisify(execFile)('npx', ['--yes', 'eas-cli@latest', ...args],
      { cwd, env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    return args[0] === '--version' ? stdout.trim() : JSON.parse(stdout);
  } catch { throw new CandidateError('EAS_REQUEST_FAILED'); }
}
async function main({ cwd = process.cwd(), env = process.env, request = runEas } = {}) {
  const read = file => fs.readFileSync(path.join(cwd, file), 'utf8');
  const profile = 'preview';
  requireValue(typeof env.EXPO_TOKEN === 'string' && env.EXPO_TOKEN.length > 0, 'TOKEN_REQUIRED');
  requireValue(/^[a-f0-9]{40}$/i.test(env.GITHUB_SHA || ''), 'COMMIT_REQUIRED');
  requireValue(/^[A-Za-z0-9._-]{1,80}$/.test(env.EAS_CONFIG_REVISION || ''), 'REMOTE_CONFIG_REVISION_REQUIRED');
  requireValue(/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT || ''), 'ATTEMPT_INVALID');
  const verifyCliVersion = async () => {
    const value = await request(['--version'], { cwd, env });
    const match = typeof value === 'string' ? /^eas-cli\/([0-9]+\.[0-9]+\.[0-9]+)(?:\s|$)/.exec(value) : null;
    requireValue(match?.[1] === EAS_CLI_VERSION, 'CLI_VERSION_UNVERIFIED');
  };
  await verifyCliVersion();
  const effectiveConfig = await request(['config', '--platform', 'android', '--profile', profile, '--non-interactive', '--json'], { cwd, env });
  const identity = createCandidateIdentity({ app: JSON.parse(read('app.json')), eas: JSON.parse(read('eas.json')),
    lockfile: read('package-lock.json'), effectiveConfig, commit: env.GITHUB_SHA, apiUrl: env.API_BASE_URL,
    revision: env.EAS_CONFIG_REVISION, profile });
  requireValue(env.EAS_ALLOW_NEW_BUILD === undefined || ['true', 'false'].includes(env.EAS_ALLOW_NEW_BUILD), 'NEW_BUILD_INPUT_INVALID');
  const invoke = args => request(args, { cwd, env });
  const directory = path.join(cwd, 'test-results'); fs.mkdirSync(directory, { recursive: true });
  const result = await ensureCandidateBuild({ identity, onProgress: state => {
    const progress = { ...state, projectId: identity.projectId, commit: identity.commit, profile, configFingerprint: identity.configFingerprint };
    fs.writeFileSync(path.join(directory, 'eas-candidate.json'), JSON.stringify(progress, null, 2) + '\n');
    console.log('Build EAS ' + state.buildId + ': ' + state.status + ' (' + state.source + ').');
  }, attempt: Number(env.GITHUB_RUN_ATTEMPT),
    reuseBuildId: env.EAS_REUSE_BUILD_ID || undefined, allowNew: env.EAS_ALLOW_NEW_BUILD === 'true',
    listBuilds: ({ offset, limit }) => invoke(['build:list', '--platform', 'android', '--build-profile', profile,
      '--git-commit-hash', identity.commit, '--offset', String(offset), '--limit', String(limit), '--non-interactive', '--json']),
    viewBuild: id => invoke(['build:view', id, '--json']),
    createBuild: async message => {
      await verifyCliVersion();
      return invoke(['build', '--platform', 'android', '--profile', profile, '--non-interactive', '--no-wait', '--json', '--message', message]);
    },
  });
  // Contrato del download existente. Archivo privado: nunca añadirlo a upload-artifact.
  fs.writeFileSync(path.join(directory, 'eas-build.json'), JSON.stringify([result.build]) + '\n');
  const metadata = { buildId: result.build.id, source: result.source, projectId: identity.projectId,
    commit: identity.commit, profile, configFingerprint: identity.configFingerprint, status: 'FINISHED' };
  fs.writeFileSync(path.join(directory, 'eas-candidate.json'), JSON.stringify(metadata, null, 2) + '\n');
  return metadata;
}
module.exports = { EAS_CLI_VERSION, createCandidateIdentity, ensureCandidateBuild, main };
if (require.main === module) main().then(result => {
  console.log('Candidato EAS verificado: ' + result.buildId + ' (' + result.source + ').');
}).catch(error => {
  console.error(error instanceof CandidateError ? error.message : 'Candidato EAS bloqueado: UNVERIFIED.');
  process.exitCode = 1;
});

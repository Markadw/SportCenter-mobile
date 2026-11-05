'use strict';

// Source/provenance validation only. Requiring this module performs no I/O or network requests.
const fs = require('node:fs');
const { createHash } = require('node:crypto');

const CONFIG_FILE = 'config/android-email-forms-validation.json';
const RECEIPT_FILE = CONFIG_FILE;
const EXPECTED_SOURCE = '8831dfad7fd1b0c696d11f50c79442c5499b7cd2';
const EXPECTED_PRODUCER = 41860689069;
const EXPECTED_PRODUCER_TAG = 'candidate/android-rc6';
const EXPECTED_ATTEMPT = 2;
const IDENTITY = Object.freeze({ repository: 'Markadw/SportCenter-mobile',
  projectId: 'c608a591-dfad-47d6-98cf-e714e821c269', appId: 'com.markadw.sportcenter',
  api: 'https://back-sport-ghxk.onrender.com', appVersion: '1.0.0', appBuildVersion: '1',
  easCliVersion: '27.4.0', maestroVersion: '2.12.0' });
const CONFIG_KEYS = Object.freeze(['version', 'repository', 'sourceCommit', 'projectId', 'appId', 'api',
  'buildId', 'sha256', 'bytes', 'fingerprint', 'producerRun', 'producerAttempt', 'producerTag',
  'artifactId', 'artifactBytes', 'artifactSha256', 'appVersion', 'appBuildVersion', 'easCliVersion', 'maestroVersion']);
const PHASES = Object.freeze({ register: 'register', verify: 'verify', reset: 'reset', request: 'request' });
const REQUIRED_JOBS = Object.freeze(['Definir comprobaciones por evento y rama',
  'Calidad previa a integración / Análisis estático y pruebas del cliente',
  'Seguridad previa a integración y APK / Dependencias y SAST CodeQL',
  'Integración HTTP real y regresión de contratos',
  'Comprobar configuración de rendimiento y estrés / Inspeccionar guiones sin ejecutar carga',
  'Compilar y aceptar APK candidato', 'Rechazo nativo bajo MITM y recuperación del mismo APK',
  'Resultado de integración']);
const STATIC_CHECKS = Object.freeze(['candidate', 'signature', 'manifest', 'abi', 'zipalign', 'elf', 'jadx']);
const AUTOMATION_FILES = Object.freeze([
  CONFIG_FILE,
  'scripts/android-email-forms.cjs', 'scripts/android-email-forms-source.cjs',
  'scripts/prepare-android-disk.cjs', '__tests__/androidDisk.test.js',
  '__tests__/androidEmailForms.test.js', '__tests__/androidEmailFormsSource.test.js',
  '__tests__/androidEmailFormsWorkflow.test.js',
  'tests/manual/android-email-forms.md',
  '.github/workflows/android-validation.yml',
  'scripts/validate-test-configs.js', '__tests__/androidAccountWorkflow.test.js',
  '__tests__/pipelines.test.js',
]);
const ERROR_CODES = Object.freeze(['EMAIL_FORMS_CONFIG_MISSING', 'EMAIL_FORMS_CONFIG_INVALID',
  'EMAIL_FORMS_CONFIG_SCHEMA', 'EMAIL_FORMS_CONFIG_IDENTITY', 'EMAIL_FORMS_CONFIG_SOURCE',
  'EMAIL_FORMS_CONFIG_BUILD', 'EMAIL_FORMS_CONFIG_ARTIFACT', 'EMAIL_FORMS_PRODUCER_MISMATCH',
  'EMAIL_FORMS_PRODUCER_JOBS_INCOMPLETE', 'EMAIL_FORMS_PRODUCER_JOB_NOT_PASSED',
  'EMAIL_FORMS_CANDIDATE_MISMATCH', 'EMAIL_FORMS_INSPECTION_MISMATCH',
  'EMAIL_FORMS_ARTIFACT_MISMATCH', 'EMAIL_FORMS_ARTIFACT_DIGEST_MISMATCH',
  'EMAIL_FORMS_BUILD_MISMATCH', 'EMAIL_FORMS_BUILD_EXPIRED', 'EMAIL_FORMS_BUILD_TIME_REQUIRED',
  'EMAIL_FORMS_AUTOMATION_SCOPE', 'EMAIL_FORMS_APP_TREE_CHANGED', 'EMAIL_FORMS_APK_MISMATCH']);
const MAX_APK_BYTES = 512 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;

class FormSourceError extends Error {
  constructor(code) {
    const safe = ERROR_CODES.includes(code) ? code : 'EMAIL_FORMS_CONFIG_INVALID';
    super(safe); this.name = 'FormSourceError'; this.code = safe;
  }
}
function need(value, code) { if (!value) throw new FormSourceError(code); }
function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function positive(value, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= maximum;
}
function hex(value, length) {
  return typeof value === 'string' && value.length === length && /^[a-f0-9]+$/.test(value);
}
function uuid(value) {
  return typeof value === 'string' && value.length === 36
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
}
function exactTag(value, expression) {
  if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const match = expression.exec(value);
  return match && match[0] === value && !value.includes('..') && !value.endsWith('.') ? match : null;
}
function dataKeys(value) {
  if (!record(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === CONFIG_KEYS.length && keys.every(key => typeof key === 'string' && CONFIG_KEYS.includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}
function verifyConfig(value) {
  need(dataKeys(value), 'EMAIL_FORMS_CONFIG_SCHEMA');
  need(value.version === 1 && Object.entries(IDENTITY).every(([key, expected]) => value[key] === expected),
    'EMAIL_FORMS_CONFIG_IDENTITY');
  need(value.sourceCommit === EXPECTED_SOURCE && value.producerRun === EXPECTED_PRODUCER && value.producerAttempt === EXPECTED_ATTEMPT && value.producerTag === EXPECTED_PRODUCER_TAG && hex(value.sourceCommit, 40) && positive(value.producerRun) && positive(value.producerAttempt)
    && exactTag(value.producerTag, /^candidate\/android-([A-Za-z0-9][A-Za-z0-9_.-]{0,79})$/),
    'EMAIL_FORMS_CONFIG_SOURCE');
  need(uuid(value.buildId) && hex(value.sha256, 64) && positive(value.bytes, MAX_APK_BYTES)
    && hex(value.fingerprint, 64), 'EMAIL_FORMS_CONFIG_BUILD');
  need(positive(value.artifactId) && positive(value.artifactBytes, MAX_ARTIFACT_BYTES)
    && hex(value.artifactSha256, 64), 'EMAIL_FORMS_CONFIG_ARTIFACT');
  return Object.freeze(Object.fromEntries(CONFIG_KEYS.map(key => [key, value[key]])));
}
function readConfig(read = fs.readFileSync) {
  let raw;
  try { raw = read(CONFIG_FILE, 'utf8'); } catch { throw new FormSourceError('EMAIL_FORMS_CONFIG_MISSING'); }
  need(typeof raw === 'string' && Buffer.byteLength(raw) > 0 && Buffer.byteLength(raw) <= 16384,
    'EMAIL_FORMS_CONFIG_INVALID');
  let value;
  try { value = JSON.parse(raw); } catch { throw new FormSourceError('EMAIL_FORMS_CONFIG_INVALID'); }
  return verifyConfig(value);
}
function fingerprint(config) {
  const receipt = verifyConfig(config);
  const stable = Object.fromEntries(Object.keys(receipt).sort().map(key => [key, receipt[key]]));
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
function verifyProducer(config, run, jobs, candidate, inspection) {
  const c = verifyConfig(config);
  need(run?.id === c.producerRun && run.run_attempt === c.producerAttempt && run.head_sha === c.sourceCommit
    && run.head_branch === c.producerTag && run.event === 'push' && run.path === '.github/workflows/api-android.yml'
    && run.repository?.full_name === c.repository && run.status === 'completed' && run.conclusion === 'success',
    'EMAIL_FORMS_PRODUCER_MISMATCH');
  need(Array.isArray(jobs?.jobs) && positive(jobs.total_count) && jobs.total_count === jobs.jobs.length,
    'EMAIL_FORMS_PRODUCER_JOBS_INCOMPLETE');
  for (const name of REQUIRED_JOBS) {
    const matches = jobs.jobs.filter(job => job?.name === name);
    need(matches.length === 1 && matches[0].run_id === c.producerRun
      && matches[0].run_attempt === c.producerAttempt && matches[0].head_sha === c.sourceCommit
      && matches[0].status === 'completed' && matches[0].conclusion === 'success',
    'EMAIL_FORMS_PRODUCER_JOB_NOT_PASSED');
  }
  need(candidate?.buildId === c.buildId && candidate.commit === c.sourceCommit && candidate.api === c.api
    && candidate.sha256 === c.sha256 && candidate.emulatorApi === 34 && candidate.maestro === c.maestroVersion,
    'EMAIL_FORMS_CANDIDATE_MISMATCH');
  const checks = inspection?.checks, source = inspection?.source;
  need(inspection?.status === 'passed_for_static_scope' && inspection.package === c.appId
    && source?.revalidation === false && source.artifactSourceCommit === c.sourceCommit
    && source.automationCommit === c.sourceCommit
    && STATIC_CHECKS.every(name => checks?.[name]?.status === 'passed')
    && checks.candidate.evidence?.buildId === c.buildId && checks.candidate.evidence.commit === c.sourceCommit
    && checks.candidate.evidence.sha256 === c.sha256
    && checks.manifest.evidence?.applicationId === c.appId && checks.manifest.evidence.debuggable === false
    && Number.isSafeInteger(checks.manifest.evidence.targetSdk) && checks.manifest.evidence.targetSdk >= 36
    && checks.signature.evidence?.verified === true, 'EMAIL_FORMS_INSPECTION_MISMATCH');
  return { producerRun: c.producerRun, producerAttempt: c.producerAttempt, producerVerified: true,
    artifactSourceCommit: c.sourceCommit, buildId: c.buildId, apkSha256: c.sha256,
    parentInspectionVerified: true };
}
function binary(value, maximum) {
  return value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= maximum;
}
function verifyArtifact(config, metadata, zipBytes) {
  const c = verifyConfig(config);
  need(metadata?.id === c.artifactId && metadata.name === 'android-evidence' && metadata.expired === false
    && metadata.size_in_bytes === c.artifactBytes && metadata.digest === 'sha256:' + c.artifactSha256
    && metadata.workflow_run?.id === c.producerRun && metadata.workflow_run.head_sha === c.sourceCommit
    && metadata.workflow_run.head_branch === c.producerTag, 'EMAIL_FORMS_ARTIFACT_MISMATCH');
  need(binary(zipBytes, MAX_ARTIFACT_BYTES) && zipBytes.byteLength === c.artifactBytes
    && createHash('sha256').update(zipBytes).digest('hex') === c.artifactSha256,
    'EMAIL_FORMS_ARTIFACT_DIGEST_MISMATCH');
  return { parentArtifactId: c.artifactId, parentArtifactSha256: c.artifactSha256,
    parentArtifactBytes: c.artifactBytes, parentArtifactVerified: true };
}
function verifyApk(config, apkBytes) {
  const c = verifyConfig(config);
  need(binary(apkBytes, MAX_APK_BYTES) && apkBytes.byteLength === c.bytes
    && createHash('sha256').update(apkBytes).digest('hex') === c.sha256, 'EMAIL_FORMS_APK_MISMATCH');
  return { apkSha256: c.sha256, apkBytes: c.bytes };
}
function verifyBuild(config, build, nowMs) {
  const c = verifyConfig(config);
  need(build?.id === c.buildId && build.status === 'FINISHED' && build.platform === 'ANDROID'
    && build.gitCommitHash === c.sourceCommit && build.buildProfile === 'preview' && build.distribution === 'INTERNAL'
    && build.app?.id === c.projectId && build.appIdentifier === c.appId && build.appVersion === c.appVersion
    && build.appBuildVersion === c.appBuildVersion && build.message === 'sport-center-candidate-v1:' + c.fingerprint,
    'EMAIL_FORMS_BUILD_MISMATCH');
  need(Number.isSafeInteger(nowMs) && nowMs >= 0, 'EMAIL_FORMS_BUILD_TIME_REQUIRED');
  if (build.expirationDate != null) {
    need(typeof build.expirationDate === 'string' && Number.isFinite(Date.parse(build.expirationDate))
      && Date.parse(build.expirationDate) > nowMs, 'EMAIL_FORMS_BUILD_EXPIRED');
  }
  let url;
  try { url = new URL(build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl); }
  catch { throw new FormSourceError('EMAIL_FORMS_BUILD_MISMATCH'); }
  need(url.protocol === 'https:' && !url.username && !url.password && url.pathname.endsWith('.apk')
    && (!url.port || url.port === '443'), 'EMAIL_FORMS_BUILD_MISMATCH');
  return url.toString(); // PRIVATE: never copy a signed artifact URL to public evidence.
}
function verifyAutomation(config, { sha, head, ref, repository, changed, dirty } = {}) {
  const c = verifyConfig(config);
  const tag = exactTag(ref, /^refs\/tags\/validation\/account-forms-(register|verify|reset|request)-([A-Za-z0-9][A-Za-z0-9_.-]{0,79})$/);
  need(hex(sha, 40) && sha !== c.sourceCommit && typeof head === 'string' && head.trim() === sha
    && repository === c.repository && tag && typeof dirty === 'string' && !dirty.trim(),
    'EMAIL_FORMS_AUTOMATION_SCOPE');
  need(typeof changed === 'string' && Buffer.byteLength(changed) <= 65536, 'EMAIL_FORMS_APP_TREE_CHANGED');
  const files = changed.replace(/\r\n/g, '\n').split('\n');
  while (files.at(-1) === '') files.pop();
  need(files.length > 0 && new Set(files).size === files.length
    && files.every(file => AUTOMATION_FILES.includes(file)), 'EMAIL_FORMS_APP_TREE_CHANGED');
  return { version: 1, phase: tag[1], artifactSourceCommit: c.sourceCommit, automationCommit: sha,
    producerRun: c.producerRun, producerAttempt: c.producerAttempt, apkSha256: c.sha256,
    buildId: c.buildId, receiptSha256: fingerprint(c), changedAutomationFiles: files.length };
}

module.exports = { CONFIG_FILE, RECEIPT_FILE, EXPECTED_SOURCE, EXPECTED_PRODUCER, EXPECTED_PRODUCER_TAG, EXPECTED_ATTEMPT, IDENTITY, CONFIG_KEYS, PHASES, REQUIRED_JOBS, STATIC_CHECKS,
  AUTOMATION_FILES, ERROR_CODES, FormSourceError, verifyConfig, readConfig, fingerprint, verifyProducer,
  verifyArtifact, verifyBuild, verifyAutomation, verifyApk };

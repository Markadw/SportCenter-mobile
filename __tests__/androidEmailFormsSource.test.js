'use strict';
const test = globalThis.test || require('node:test').test;
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');
const guard = require(path.join(process.env.EMAIL_FORMS_PREP_DIR || path.join(__dirname, '..', 'scripts'),
  'android-email-forms-source.cjs'));

// Synthetic fixtures only. This file is not a validation receipt for any real APK or producer.
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const apk = Buffer.from('synthetic-preview-apk-bytes'), zip = Buffer.from('synthetic-producer-artifact-zip');
const config = () => ({ version: 1, ...guard.IDENTITY, sourceCommit: guard.EXPECTED_SOURCE,
  buildId: '11111111-2222-4333-8444-555555555555', sha256: digest(apk), bytes: apk.length,
  fingerprint: 'b'.repeat(64), producerRun: guard.EXPECTED_PRODUCER, producerAttempt: guard.EXPECTED_ATTEMPT, producerTag: guard.EXPECTED_PRODUCER_TAG,
  artifactId: 202, artifactBytes: zip.length, artifactSha256: digest(zip) });
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const c = config();
  return { c, run: { id: c.producerRun, run_attempt: c.producerAttempt, head_sha: c.sourceCommit,
    head_branch: c.producerTag, event: 'push', path: '.github/workflows/api-android.yml',
    repository: { full_name: c.repository }, status: 'completed', conclusion: 'success' },
  jobs: { total_count: guard.REQUIRED_JOBS.length, jobs: guard.REQUIRED_JOBS.map(name => ({ name,
    run_id: c.producerRun, run_attempt: c.producerAttempt, head_sha: c.sourceCommit,
    status: 'completed', conclusion: 'success' })) },
  candidate: { buildId: c.buildId, commit: c.sourceCommit, api: c.api, sha256: c.sha256,
    emulatorApi: 34, maestro: '2.12.0' },
  inspection: { status: 'passed_for_static_scope', package: c.appId,
    source: { revalidation: false, artifactSourceCommit: c.sourceCommit, automationCommit: c.sourceCommit },
    checks: Object.fromEntries(guard.STATIC_CHECKS.map(name => [name, { status: 'passed', evidence:
      name === 'candidate' ? { buildId: c.buildId, commit: c.sourceCommit, sha256: c.sha256 }
        : name === 'manifest' ? { applicationId: c.appId, targetSdk: 36, debuggable: false }
          : name === 'signature' ? { verified: true } : {} }])) },
  artifact: { id: c.artifactId, name: 'android-evidence', expired: false, size_in_bytes: c.artifactBytes,
    digest: 'sha256:' + c.artifactSha256, workflow_run: { id: c.producerRun,
      head_sha: c.sourceCommit, head_branch: c.producerTag } },
  build: { id: c.buildId, status: 'FINISHED', platform: 'ANDROID', gitCommitHash: c.sourceCommit,
    buildProfile: 'preview', distribution: 'INTERNAL', app: { id: c.projectId }, appIdentifier: c.appId,
    appVersion: '1.0.0', appBuildVersion: '1', message: 'sport-center-candidate-v1:' + c.fingerprint,
    artifacts: { applicationArchiveUrl: 'https://builds.example.invalid/synthetic.apk?private=token' },
    expirationDate: '2030-01-01T00:00:00.000Z' } };
}
const code = expected => error => error instanceof guard.FormSourceError && error.code === expected
  && error.message === expected && !Object.hasOwn(error, 'cause');
function producer(f) { return guard.verifyProducer(f.c, f.run, f.jobs, f.candidate, f.inspection); }
const NOW = Date.parse('2026-01-01T00:00:00.000Z');
const automation = phase => ({ sha: 'c'.repeat(40), head: 'c'.repeat(40) + '\n',
  ref: 'refs/tags/validation/account-forms-' + phase + '-fixture', repository: guard.IDENTITY.repository,
  changed: 'scripts/android-email-forms-source.cjs\n__tests__/androidEmailFormsSource.test.js\n', dirty: '' });

test('configuration is mandatory and missing/invalid input never invents a source or build', () => {
  assert.equal(guard.EXPECTED_ATTEMPT, 2);
  assert.throws(() => guard.readConfig(() => { throw new Error('private filesystem detail'); }), code('EMAIL_FORMS_CONFIG_MISSING'));
  for (const raw of ['', 'not JSON', 'null', '{}']) assert.throws(() => guard.readConfig(() => raw), guard.FormSourceError);
  const c = guard.readConfig((file, encoding) => {
    assert.equal(file, 'config/android-email-forms-validation.json'); assert.equal(encoding, 'utf8');
    return JSON.stringify(config());
  });
  assert.equal(c.sourceCommit, guard.EXPECTED_SOURCE); assert.equal(Object.isFrozen(c), true);
});

test('receipt schema pins exact application and tooling versions and rejects undeclared fields', () => {
  for (const change of [{ version: 2 }, { repository: 'other/repo' }, { appVersion: '1.0.1' },
    { appBuildVersion: '2' }, { easCliVersion: 'latest' }, { maestroVersion: '2.13.0' },
    { appId: 'other.app' }, { projectId: '00000000-0000-0000-0000-000000000000' }, { api: 'https://other.invalid' }]) {
    assert.throws(() => guard.verifyConfig({ ...config(), ...change }), code('EMAIL_FORMS_CONFIG_IDENTITY'));
  }
  assert.throws(() => guard.verifyConfig({ ...config(), privateEmail: 'private@example.invalid' }), code('EMAIL_FORMS_CONFIG_SCHEMA'));
  const missing = config(); delete missing.producerAttempt;
  assert.throws(() => guard.verifyConfig(missing), code('EMAIL_FORMS_CONFIG_SCHEMA'));
  for (const change of [{ sourceCommit: guard.EXPECTED_SOURCE + '\n' }, { producerRun: '101' },
    { producerAttempt: 0 }, { producerAttempt: 1 }, { producerAttempt: 3 },
    { producerTag: 'develop' }, { producerTag: 'candidate/android-fixture\n' }]) {
    assert.throws(() => guard.verifyConfig({ ...config(), ...change }), code('EMAIL_FORMS_CONFIG_SOURCE'));
  }
});

test('receipt digest is stable under key ordering and changes with pinned provenance', () => {
  const c = config(), reordered = Object.fromEntries(Object.entries(c).reverse());
  assert.equal(guard.fingerprint(c), guard.fingerprint(reordered));
  assert.notEqual(guard.fingerprint(c), guard.fingerprint({ ...c, artifactId: 203 }));
});

test('producer requires exact push/tag/source and all eight mandatory jobs from the same attempt/SHA', () => {
  const f = fixture(); assert.equal(producer(f).producerVerified, true);
  for (const change of [{ head_sha: 'd'.repeat(40) }, { id: 102 }, { run_attempt: 1 }, { run_attempt: 3 },
    { head_branch: 'develop' }, { event: 'workflow_dispatch' }, { conclusion: 'failure' },
    { path: '.github/workflows/other.yml' }]) {
    const wrong = fixture(); Object.assign(wrong.run, change);
    assert.throws(() => producer(wrong), code('EMAIL_FORMS_PRODUCER_MISMATCH'));
  }
  for (const change of [{ conclusion: 'skipped' }, { conclusion: 'failure' }, { run_attempt: 1 }, { run_attempt: 3 },
    { head_sha: 'd'.repeat(40) }, { run_id: 999 }, { status: 'in_progress' }]) {
    const wrong = fixture(); Object.assign(wrong.jobs.jobs[0], change);
    assert.throws(() => producer(wrong), code('EMAIL_FORMS_PRODUCER_JOB_NOT_PASSED'));
  }
  const partial = fixture(); partial.jobs.total_count += 1;
  assert.throws(() => producer(partial), code('EMAIL_FORMS_PRODUCER_JOBS_INCOMPLETE'));
  const duplicate = fixture(); duplicate.jobs.jobs.push(clone(duplicate.jobs.jobs[0])); duplicate.jobs.total_count += 1;
  assert.throws(() => producer(duplicate), code('EMAIL_FORMS_PRODUCER_JOB_NOT_PASSED'));
  const renamed = fixture();
  renamed.jobs.jobs.find(job => job.name === 'Resultado de integración').name = 'Resultado de candidata Android';
  assert.throws(() => producer(renamed), code('EMAIL_FORMS_PRODUCER_JOB_NOT_PASSED'));
});

test('candidate and every static check must establish the same original APK source', () => {
  for (const change of [{ commit: 'd'.repeat(40) }, { buildId: 'other' }, { sha256: 'd'.repeat(64) },
    { api: 'https://other.invalid' }, { emulatorApi: 36 }, { maestro: 'other' }]) {
    const f = fixture(); Object.assign(f.candidate, change);
    assert.throws(() => producer(f), code('EMAIL_FORMS_CANDIDATE_MISMATCH'));
  }
  for (const name of guard.STATIC_CHECKS) {
    const f = fixture(); f.inspection.checks[name].status = 'not_run';
    assert.throws(() => producer(f), code('EMAIL_FORMS_INSPECTION_MISMATCH'));
  }
  for (const mutate of [f => { f.inspection.source.revalidation = true; },
    f => { f.inspection.source.automationCommit = 'd'.repeat(40); },
    f => { f.inspection.checks.candidate.evidence.commit = 'd'.repeat(40); },
    f => { f.inspection.checks.manifest.evidence.debuggable = true; },
    f => { f.inspection.checks.signature.evidence.verified = false; }]) {
    const f = fixture(); mutate(f);
    assert.throws(() => producer(f), code('EMAIL_FORMS_INSPECTION_MISMATCH'));
  }
});

test('artifact identity and actual ZIP bytes both have to match the reviewed digest', () => {
  const f = fixture(); assert.equal(guard.verifyArtifact(f.c, f.artifact, zip).parentArtifactVerified, true);
  for (const change of [{ id: 999 }, { name: 'other-evidence' }, { expired: true },
    { size_in_bytes: zip.length + 1 }, { digest: 'sha256:' + 'd'.repeat(64) }]) {
    assert.throws(() => guard.verifyArtifact(f.c, { ...f.artifact, ...change }, zip), code('EMAIL_FORMS_ARTIFACT_MISMATCH'));
  }
  const wrong = clone(f.artifact); wrong.workflow_run.head_sha = 'd'.repeat(40);
  assert.throws(() => guard.verifyArtifact(f.c, wrong, zip), code('EMAIL_FORMS_ARTIFACT_MISMATCH'));
  for (const bytes of [undefined, 'synthetic-producer-artifact-zip', Buffer.from('different'), Buffer.alloc(zip.length)]) {
    assert.throws(() => guard.verifyArtifact(f.c, f.artifact, bytes), code('EMAIL_FORMS_ARTIFACT_DIGEST_MISMATCH'));
  }
});

test('EAS metadata is exactly the finished internal preview build, version, SHA and fingerprint', () => {
  const f = fixture(); assert.equal(guard.verifyBuild(f.c, f.build, NOW), f.build.artifacts.applicationArchiveUrl);
  for (const change of [{ buildProfile: 'production' }, { buildProfile: 'development' }, { distribution: 'STORE' },
    { gitCommitHash: 'd'.repeat(40) }, { id: 'other' }, { platform: 'IOS' }, { status: 'IN_QUEUE' },
    { appVersion: '1.0.1' }, { appBuildVersion: '2' }, { message: 'sport-center-candidate-v1:' + 'd'.repeat(64) }]) {
    assert.throws(() => guard.verifyBuild(f.c, { ...f.build, ...change }, NOW), code('EMAIL_FORMS_BUILD_MISMATCH'));
  }
  assert.throws(() => guard.verifyBuild(f.c, f.build), code('EMAIL_FORMS_BUILD_TIME_REQUIRED'));
  assert.throws(() => guard.verifyBuild(f.c, { ...f.build, expirationDate: '2025-01-01' }, NOW), code('EMAIL_FORMS_BUILD_EXPIRED'));
  for (const url of ['http://example.invalid/app.apk', 'https://example.invalid/app.aab',
    'https://user:password@example.invalid/app.apk', 'https://example.invalid:123/app.apk']) {
    assert.throws(() => guard.verifyBuild(f.c, { ...f.build, artifacts: { applicationArchiveUrl: url } }, NOW), code('EMAIL_FORMS_BUILD_MISMATCH'));
  }
});

test('actual APK bytes and byte count must match the independently pinned receipt', () => {
  assert.deepEqual(guard.verifyApk(config(), apk), { apkSha256: digest(apk), apkBytes: apk.length });
  assert.throws(() => guard.verifyApk(config(), Buffer.alloc(apk.length)), code('EMAIL_FORMS_APK_MISMATCH'));
  assert.throws(() => guard.verifyApk({ ...config(), bytes: apk.length + 1 }, apk), code('EMAIL_FORMS_APK_MISMATCH'));
});

test('automation derives one exact phase and stable receipt proof without accepting application changes', () => {
  for (const filename of ['scripts/prepare-android-disk.cjs', '__tests__/androidDisk.test.js']) {
    assert.doesNotThrow(() => guard.verifyAutomation(config(), { ...automation('register'), changed: filename + '\n' }));
  }
  for (const phase of ['register', 'verify', 'reset', 'request']) {
    const c = config(), result = guard.verifyAutomation(c, automation(phase));
    assert.equal(result.phase, phase); assert.equal(result.receiptSha256, guard.fingerprint(c));
    assert.equal(result.artifactSourceCommit, c.sourceCommit); assert.equal(result.automationCommit, 'c'.repeat(40));
    assert.equal(result.producerRun, c.producerRun); assert.equal(result.buildId, c.buildId);
  }
  for (const filename of ['src/features/passwordRecovery/screens/PasswordRecoveryScreen.tsx', 'assets/icon.png',
    'app.json', 'app.config.js', 'package.json', 'package-lock.json', 'bun.lock', 'config/security-pins.json',
    'scripts/android-account.cjs', 'scripts/account-sandbox.cjs', '__tests__/androidEmailFormsUnknown.test.js',
    '../scripts/android-email-forms.cjs', ' scripts/android-email-forms.cjs', 'scripts/unknown.cjs',
    'scripts/prepare-android-disk.js', '__tests__/androidDiskOther.test.js']) {
    assert.throws(() => guard.verifyAutomation(config(), { ...automation('reset'), changed: filename + '\n' }), code('EMAIL_FORMS_APP_TREE_CHANGED'));
  }
  for (const ref of ['refs/tags/validation/account-register-fixture', 'refs/tags/validation/account-forms-unknown-fixture',
    'refs/heads/validation/account-forms-reset-fixture', 'refs/tags/validation/account-forms-reset-fixture\n']) {
    assert.throws(() => guard.verifyAutomation(config(), { ...automation('reset'), ref }), code('EMAIL_FORMS_AUTOMATION_SCOPE'));
  }
  assert.throws(() => guard.verifyAutomation(config(), { ...automation('reset'), dirty: ' M src/app/index.tsx' }), code('EMAIL_FORMS_AUTOMATION_SCOPE'));
});

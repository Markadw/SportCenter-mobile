const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const SOURCE = Object.freeze({ repository: 'Markadw/SportCenter-mobile', runId: 41349708434,
  commit: 'c8168584e92d620b9cdf75b6d27228128b12bc81', branch: 'candidate/android-1.0.0-rc2',
  jobName: 'Compilar y aceptar APK candidato', buildId: '2bf40b15-71fc-41c9-9ad6-bf825096b394',
  apkSha256: '1ac0a14bec648434d8733d64ef817d3e41329fe47e1c6fea843cdda1a7bb814d',
  projectId: 'c608a591-dfad-47d6-98cf-e714e821c269', appId: 'com.markadw.sportcenter', profile: 'preview',
  api: 'https://back-sport-ghxk.onrender.com', image: 'system-images;android-36;google_apis_ps16k;x86_64', maestro: '2.12.0' });
const AUTOMATION_FILES = Object.freeze(['.github/workflows/android-validation.yml', '.github/workflows/ci.yml', '.github/workflows/api-android.yml',
  'scripts/android-16k.js', 'scripts/android-source-context.js', 'scripts/inspect-android-artifact.js',
  'scripts/android-pinning.js', 'scripts/android-pinning-proxy.py', 'scripts/validate-test-configs.js', '__tests__/android16k.test.js',
  '__tests__/androidSourceContext.test.js', '__tests__/androidArtifactInspection.test.js',
  '__tests__/androidPinning.test.js', '__tests__/pipelines.test.js', '__tests__/candidatePolicy.test.js',
  '__tests__/release-infrastructure.test.js', '__tests__/security.test.js', '__tests__/static-analysis.test.js', 'tests/manual/android-16k.md', 'README.md', 'docs/seguridad-candidata.md', 'tests/plan.json', 'tests/manual/android-pinning-pilot.md',
  'scripts/android-profiles.js', '__tests__/androidProfiles.test.js', 'tests/manual/android-profiles.md',
  '.maestro/catalogo-publico.yaml', '.maestro/detalle-producto.yaml']);
const PROOF_FILE = 'test-results/android-validation-source.json';
const validationTag = /^refs\/tags\/validation\/android-[A-Za-z0-9_.-]+$/;
class ProbeError extends Error {
  constructor(code) { super('Validación nativa bloqueada: ' + code + '.'); this.code = code; }
}
function requireValue(value, code) { if (!value) throw new ProbeError(code); }
function verifyAutomation({ commit, ref, repository, changed, dirty = '' }) {
  requireValue(/^[a-f0-9]{40}$/.test(commit || '') && commit !== SOURCE.commit, 'AUTOMATION_SHA_INVALID');
  requireValue(validationTag.test(ref || '') && repository === SOURCE.repository, 'AUTOMATION_SCOPE_INVALID');
  const files = changed.trim() ? changed.trim().split(/\r?\n/) : [];
  requireValue(files.length > 0 && files.every(file => AUTOMATION_FILES.includes(file)), 'APP_TREE_CHANGED');
  requireValue(!dirty.trim(), 'WORKTREE_DIRTY');
  return { automationCommit: commit, artifactSourceCommit: SOURCE.commit, changedAutomationFiles: files.length };
}
function verifySourceProof(proof, env, changed, head, dirty = '') {
  requireValue(head.trim() === env.GITHUB_SHA, 'CHECKOUT_SHA_MISMATCH');
  verifyAutomation({ commit: env.GITHUB_SHA, ref: env.GITHUB_REF, repository: env.GITHUB_REPOSITORY, changed, dirty });
  requireValue(proof?.version === 1 && proof.artifactSourceCommit === SOURCE.commit
    && proof.automationCommit === env.GITHUB_SHA && proof.buildId === SOURCE.buildId
    && proof.apkSha256 === SOURCE.apkSha256 && proof.parentRunId === SOURCE.runId
    && proof.parentChecksVerified === true, 'SOURCE_PROOF_MISMATCH');
  return { revalidation: true, artifactSourceCommit: SOURCE.commit, automationCommit: env.GITHUB_SHA,
    buildId: SOURCE.buildId, apkSha256: SOURCE.apkSha256, parentRunId: SOURCE.runId };
}
function resolveSourceContext(env = process.env, io = {}) {
  requireValue(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || ''), 'COMMIT_REQUIRED');
  if (!validationTag.test(env.GITHUB_REF || '')) {
    requireValue(!(env.GITHUB_REF || '').startsWith('refs/tags/validation/'), 'VALIDATION_TAG_INVALID');
    return { revalidation: false, artifactSourceCommit: env.GITHUB_SHA, automationCommit: env.GITHUB_SHA };
  }
  const read = io.read || (file => fs.readFileSync(file, 'utf8'));
  const git = io.git || (args => execFileSync('git', args, { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }));
  try {
    git(['merge-base', '--is-ancestor', SOURCE.commit, 'HEAD']);
    return verifySourceProof(JSON.parse(read(PROOF_FILE)), env,
      git(['diff', '--name-only', '--no-renames', SOURCE.commit, 'HEAD']), git(['rev-parse', 'HEAD']),
      git(['status', '--porcelain', '--untracked-files=all']));
  } catch (error) { throw error instanceof ProbeError ? error : new ProbeError('SOURCE_PROOF_UNAVAILABLE'); }
}
function verifyApi34Evidence(report, context) {
  requireValue(report?.status === 'passed' && report.api === 34 && report.abi === 'x86_64'
    && report.publicFlows === 2 && report.processAfter === true && report.buildId === SOURCE.buildId
    && report.apkSha256 === SOURCE.apkSha256 && report.artifactSourceCommit === context.artifactSourceCommit
    && report.automationCommit === context.automationCommit, 'API34_NOT_VERIFIED');
}
module.exports = { SOURCE, AUTOMATION_FILES, PROOF_FILE, ProbeError, verifyAutomation,
  verifySourceProof, resolveSourceContext, verifyApi34Evidence };

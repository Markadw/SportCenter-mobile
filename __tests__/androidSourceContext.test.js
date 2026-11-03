/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { test, expect, jest } = require('@jest/globals');
const { SOURCE, verifyAutomation, verifySourceProof, resolveSourceContext, verifyApi34Evidence } = require('../scripts/android-source-context');
const env = { GITHUB_SHA: 'a'.repeat(40), GITHUB_REF: 'refs/tags/validation/android-same-apk', GITHUB_REPOSITORY: SOURCE.repository };
const proof = { version: 1, artifactSourceCommit: SOURCE.commit, automationCommit: env.GITHUB_SHA,
  buildId: SOURCE.buildId, apkSha256: SOURCE.apkSha256, parentRunId: SOURCE.runId, parentChecksVerified: true };
const changed = 'scripts/inspect-android-artifact.js\n.github/workflows/android-validation.yml';
test('resuelve procedencia de validación sólo con prueba y árbol de app idéntico, sin cambiar variables GitHub', () => {
  const before = { ...env };
  const git = jest.fn(args => args[0] === 'diff' ? changed : args[0] === 'rev-parse' ? env.GITHUB_SHA : '');
  const context = resolveSourceContext(env, { read: () => JSON.stringify(proof), git });
  expect(context).toMatchObject({ revalidation: true, artifactSourceCommit: SOURCE.commit, automationCommit: env.GITHUB_SHA });
  expect(env).toEqual(before);
  expect(git).toHaveBeenCalledWith(['diff', '--name-only', '--no-renames', SOURCE.commit, 'HEAD']);
  expect(git).toHaveBeenCalledWith(['merge-base', '--is-ancestor', SOURCE.commit, 'HEAD']);
});
test('candidate normal conserva SHA==GITHUB_SHA y no lee una prueba de otra fuente', () => {
  const read = jest.fn();
  expect(resolveSourceContext({ ...env, GITHUB_REF: 'refs/tags/candidate/android-rc2' }, { read }))
    .toEqual({ revalidation: false, artifactSourceCommit: env.GITHUB_SHA, automationCommit: env.GITHUB_SHA });
  expect(read).not.toHaveBeenCalled();
});
test.each(['artifactSourceCommit', 'automationCommit', 'buildId', 'apkSha256', 'parentRunId', 'parentChecksVerified'])('rechaza prueba alterada: %s', key => {
  expect(() => verifySourceProof({ ...proof, [key]: 'wrong' }, env, changed, env.GITHUB_SHA)).toThrow('SOURCE_PROOF_MISMATCH');
});
test('rechaza SHA de checkout distinto, cambios de runtime y prueba ausente', () => {
  expect(() => verifySourceProof(proof, env, changed, 'b'.repeat(40))).toThrow('CHECKOUT_SHA_MISMATCH');
  expect(() => verifySourceProof(proof, env, changed + '\napp.json', env.GITHUB_SHA)).toThrow('APP_TREE_CHANGED');
  expect(() => resolveSourceContext(env, { read: () => { throw Error('missing'); }, git: () => '' })).toThrow('SOURCE_PROOF_UNAVAILABLE');
  expect(() => verifyAutomation({ commit: env.GITHUB_SHA, ref: 'refs/heads/test/android-16k', repository: SOURCE.repository, changed })).toThrow();
});
test('pinning debe consumir API34 real de la automatización actual y del mismo APK', () => {
  const context = verifySourceProof(proof, env, changed, env.GITHUB_SHA);
  const report = { status: 'passed', api: 34, abi: 'x86_64', publicFlows: 2, processAfter: true,
    buildId: SOURCE.buildId, apkSha256: SOURCE.apkSha256, artifactSourceCommit: SOURCE.commit, automationCommit: env.GITHUB_SHA };
  expect(() => verifyApi34Evidence(report, context)).not.toThrow();
  for (const key of Object.keys(report)) expect(() => verifyApi34Evidence({ ...report, [key]: 'wrong' }, context)).toThrow('API34_NOT_VERIFIED');
});


test('admite sólo la ruta auditada exacta del addon y rechaza vecinos/runtime', () => {
  const check = changed => verifyAutomation({ commit: env.GITHUB_SHA, ref: env.GITHUB_REF, repository: env.GITHUB_REPOSITORY, changed });
  expect(check('scripts/android-pinning-proxy.py')).toMatchObject({ changedAutomationFiles: 1 });
  for (const route of ['scripts/android-pinning-proxy.py.bak', 'scripts/android-pinning-proxy.py/../app.json', 'scripts/android-pinning-install.sh', 'scripts/private-proxy.py', 'src/app/index.tsx', 'app.json'])
    expect(() => check(route)).toThrow('APP_TREE_CHANGED');
});

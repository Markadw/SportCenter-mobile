const assert = require('node:assert/strict');
const fs = require('node:fs');
function internalCandidate(env) {
  assert.equal(env.INTEGRATION_RESULT, 'success', 'La entrega exige integración aprobada.');
  assert.equal(env.ANDROID_RESULT, 'success', 'La entrega exige aceptación Android aprobada.');
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  assert.equal(env.CANDIDATE_COMMIT, env.GITHUB_SHA, 'La entrega debe corresponder al commit comprobado.');
  assert.match(env.CANDIDATE_BUILD_ID || '', /^[a-f0-9-]{36}$/);
  assert.match(env.CANDIDATE_SHA256 || '', /^[a-f0-9]{64}$/);
  const apk = new URL(env.CANDIDATE_APK_URL);
  assert.ok(apk.protocol === 'https:' && !apk.username && !apk.password && apk.pathname.endsWith('.apk'), 'La entrega exige el APK HTTPS verificado.');
  return { status: 'approved_for_internal_validation', commit: env.GITHUB_SHA, buildId: env.CANDIDATE_BUILD_ID,
    apkUrl: apk.toString(), sha256: env.CANDIDATE_SHA256, environment: 'qa-interna',
    scope: 'Incremento funcional de catálogo y detalle. La medición de capacidad de producción y Google Play quedan fuera de esta entrega.' };
}
module.exports = { internalCandidate };
if (require.main === module) {
  const candidate = internalCandidate(process.env);
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/internal-candidate.json', JSON.stringify(candidate, null, 2) + '\n');
  const text = ['## Entrega interna aprobada', '', candidate.scope, '',
    '- Commit: ' + candidate.commit, '- Build EAS: ' + candidate.buildId,
    '- APK SHA256: ' + candidate.sha256, '- [Instalar el APK comprobado](' + candidate.apkUrl + ')', '',
    'GitHub registra esta entrega en qa-interna sólo después de aprobar integración y Android.', ''].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  console.log(JSON.stringify(candidate));
}

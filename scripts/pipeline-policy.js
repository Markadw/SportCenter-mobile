const assert = require('node:assert/strict');
const fs = require('node:fs');

const workBranch = /^(feature|fix|chore|test|release|hotfix)\/.+/;
function executionPlan({ event, branch, base, head, refType = 'branch', deleted = false, android = false, evidence = false, draft = false }) {
  assert.equal(typeof deleted, 'boolean', 'El estado deleted debe proceder del evento push.');
  if (deleted) throw new Error('Eliminar una referencia no genera una candidata.');
  if (refType === 'tag') {
    if (event === 'push' && /^candidate\/android-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(branch)) {
      return { stage: 'candidata', android: true, evidence: true };
    }
    throw new Error('Sólo un push de tag candidate/android-* puede solicitar una candidata por etiqueta.');
  }
  assert.equal(refType, 'branch', 'El resto de la matriz requiere una referencia de rama.');
  if (event === 'push' && workBranch.test(branch)) return { stage: 'trabajo', android: false, evidence: false };
  if (event === 'pull_request') {
    if (!['develop', 'main'].includes(base)) throw new Error('Destino de PR fuera de la matriz.');
    if (base === 'main' && head !== 'develop' && !/^(release|hotfix)\/.+/.test(head)) throw new Error('Main recibe entregas desde develop, release/* o hotfix/*.');
    return { stage: draft ? 'borrador' : base === 'main' ? 'entrega' : 'revision',
      android: !draft && base === 'main', evidence: base === 'main' || evidence };
  }
  if (['push', 'workflow_dispatch'].includes(event) && ['develop', 'main'].includes(branch)) {
    return { stage: branch === 'main' ? 'entrega' : 'integracion',
      android: branch === 'main' || (event === 'workflow_dispatch' && android),
      evidence: branch === 'main' || (event === 'workflow_dispatch' && evidence) };
  }
  if (event === 'workflow_dispatch' && /^(release|hotfix)\/.+/.test(branch)) return { stage: 'candidata', android: true, evidence: true };
  throw new Error('Evento o rama fuera de la matriz de integración.');
}

async function pushQuality({ repository, branch, sha, deleted = false }, fetchPulls) {
  if (deleted) return false;
  if (!workBranch.test(branch)) throw new Error('La deduplicación sólo se aplica a ramas de trabajo.');
  const prs = await fetchPulls(repository, branch);
  assert.ok(Array.isArray(prs), 'No se pudo comprobar si existe un PR.');
  return !prs.some((pr) => pr.state === 'open' && ['develop', 'main'].includes(pr.base?.ref) && pr.head?.sha === sha);
}

function evaluateChecks(results, requireAndroid) {
  const required = ['plan', 'quality', 'security', 'api', 'performance'];
  if (requireAndroid || !['skipped', undefined].includes(results.android)) required.push('android');
  return required.filter((name) => results[name] !== 'success');
}

async function main(mode, env = process.env) {
  if (mode === 'push') {
    const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    const run = await pushQuality({ repository: env.GITHUB_REPOSITORY, branch: env.GITHUB_REF_NAME,
      sha: env.GITHUB_SHA, deleted: event.deleted }, async (repository, branch) => {
      const url = new URL((env.GITHUB_API_URL || 'https://api.github.com') + '/repos/' + repository + '/pulls');
      url.search = new URLSearchParams({ state: 'open', head: repository.split('/')[0] + ':' + branch, per_page: '100' }).toString();
      const response = await fetch(url, { headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('No se pudo consultar la deduplicación de PR: HTTP ' + response.status);
      return response.json();
    });
    fs.appendFileSync(env.GITHUB_OUTPUT, 'run_quality=' + run + '\n');
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, '## Push de trabajo\n\n' + (run
      ? 'Sin PR abierto para este commit: ejecutar calidad.\n'
      : event.deleted ? 'Rama eliminada: no ejecutar pruebas.\n' : 'La calidad se ejecuta en el PR de este commit; no se repite en el push.\n'));
    return;
  }
  if (mode === 'plan') {
    let draft = false, deleted = false;
    assert.ok(['branch', 'tag'].includes(env.GITHUB_REF_TYPE), 'Falta el tipo de referencia de GitHub.');
    if (env.GITHUB_EVENT_NAME === 'push') {
      const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
      assert.equal(typeof event.deleted, 'boolean', 'Falta deleted en el evento push.'); deleted = event.deleted;
    }
    if (env.GITHUB_EVENT_NAME === 'pull_request') {
      const pr = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')).pull_request;
      draft = pr.draft;
      assert.equal(typeof draft, 'boolean');
    }
    const plan = executionPlan({ event: env.GITHUB_EVENT_NAME, branch: env.GITHUB_REF_NAME, base: env.GITHUB_BASE_REF,
      head: env.GITHUB_HEAD_REF, refType: env.GITHUB_REF_TYPE, deleted, draft, android: env.RUN_ANDROID === 'true', evidence: env.KEEP_EVIDENCE === 'true' });
    fs.appendFileSync(env.GITHUB_OUTPUT, `android=${plan.android}\nevidence=${plan.evidence}\n`);
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## Matriz de ejecución\n\nEtapa: **${plan.stage}**. Android obligatorio: **${plan.android ? 'sí' : 'no'}**.\n\n`
      + (env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_BASE_REF === 'develop'
        ? 'PR a develop: lint, TypeScript, pruebas del cliente, HTTP, seguridad e inspección obligatorios. APK y Android se omiten; pueden solicitarse en una ejecución manual de develop. No se acredita aceptación Android.\n'
        : env.GITHUB_REF_TYPE === 'tag' ? 'Candidata explícita del commit congelado: exige APK, inspección y aceptación Android; no registra una entrega automáticamente.\n'
          : draft ? 'Borrador: calidad e integración sin compilar APK. Al marcarlo listo se vuelve a evaluar la candidata.\n'
          : plan.android ? 'Esta ejecución exige compilación y aceptación Android aprobadas.\n'
            : 'Integración sin APK ni Android; se comprueban calidad, HTTP, seguridad e inspección.\n'));
    return;
  }
  if (mode !== 'gate') throw new Error('Usar push, plan o gate.');
  const results = Object.fromEntries(['plan', 'quality', 'security', 'api', 'performance', 'android'].map((name) => [name, env[`RESULT_${name.toUpperCase()}`] || 'skipped']));
  const blocked = evaluateChecks(results, env.REQUIRE_ANDROID !== 'false');
  const rows = Object.entries(results).map(([name, result]) => `| ${name} | ${result} |`);
  fs.appendFileSync(env.GITHUB_STEP_SUMMARY, ['## Resultado de integración', '', '| Comprobación | Estado |', '|---|---|', ...rows, '',
    blocked.length ? `**Bloqueada**: ${blocked.join(', ')}.\n`
      : '**Aprobada para el alcance ejecutado**. Esta comprobación no despliega ni acredita mediciones de carga.\n'].join('\n'));
  if (blocked.length) throw new Error(`Integración bloqueada: ${blocked.join(', ')}.`);
}
module.exports = { executionPlan, evaluateChecks, pushQuality };
if (require.main === module) main(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });

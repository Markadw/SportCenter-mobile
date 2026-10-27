const assert = require('node:assert/strict');
const fs = require('node:fs');

const workBranch = /^(feature|fix|chore|test|release|hotfix)\/.+/;
function executionPlan({ event, branch, base, head, android = false, evidence = false, draft = false }) {
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
  const required = ['plan', 'quality', 'api', 'performance'];
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
    let draft = false;
    if (env.GITHUB_EVENT_NAME === 'pull_request') {
      const pr = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')).pull_request;
      draft = pr.draft;
      assert.equal(typeof draft, 'boolean');
    }
    const plan = executionPlan({ event: env.GITHUB_EVENT_NAME, branch: env.GITHUB_REF_NAME, base: env.GITHUB_BASE_REF,
      head: env.GITHUB_HEAD_REF, draft, android: env.RUN_ANDROID === 'true', evidence: env.KEEP_EVIDENCE === 'true' });
    fs.appendFileSync(env.GITHUB_OUTPUT, `android=${plan.android}\nevidence=${plan.evidence}\n`);
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## Matriz de ejecución\n\nEtapa: **${plan.stage}**. Android obligatorio: **${plan.android ? 'sí' : 'no'}**.\n\n`
      + (env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_BASE_REF === 'develop'
        ? 'PR a develop: lint, TypeScript, pruebas del cliente, HTTP e inspección obligatorios. APK y Android se omiten; pueden solicitarse en una ejecución manual de develop. No se acredita aceptación Android.\n'
        : draft ? 'Borrador: calidad e integración sin compilar APK. Al marcarlo listo se vuelve a evaluar la candidata.\n'
          : plan.android ? 'Esta ejecución exige compilación y aceptación Android aprobadas.\n'
            : 'Integración sin APK ni Android; se comprueban calidad, HTTP e inspección.\n'));
    return;
  }
  if (mode !== 'gate') throw new Error('Usar push, plan o gate.');
  const results = Object.fromEntries(['plan', 'quality', 'api', 'performance', 'android'].map((name) => [name, env[`RESULT_${name.toUpperCase()}`] || 'skipped']));
  const blocked = evaluateChecks(results, env.REQUIRE_ANDROID !== 'false');
  const rows = Object.entries(results).map(([name, result]) => `| ${name} | ${result} |`);
  fs.appendFileSync(env.GITHUB_STEP_SUMMARY, ['## Resultado de integración', '', '| Comprobación | Estado |', '|---|---|', ...rows, '',
    blocked.length ? `**Bloqueada**: ${blocked.join(', ')}.\n`
      : '**Aprobada para el alcance ejecutado**. Esta comprobación no despliega ni acredita mediciones de carga.\n'].join('\n'));
  if (blocked.length) throw new Error(`Integración bloqueada: ${blocked.join(', ')}.`);
}
module.exports = { executionPlan, evaluateChecks, pushQuality };
if (require.main === module) main(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });

const fs = require('node:fs');

const workBranch = /^(feature|fix|chore|test|release|hotfix)\/.+/;
function executionPlan({ event, branch, base, head, android = false, evidence = false }) {
  if (event === 'push' && workBranch.test(branch)) {
    return { stage: 'trabajo', android: false, evidence: false };
  }
  if (event === 'pull_request') {
    if (!['develop', 'main'].includes(base)) throw new Error('Destino de PR fuera de la matriz.');
    if (base === 'main' && head !== 'develop' && !/^(release|hotfix)\/.+/.test(head)) {
      throw new Error('Main recibe entregas desde develop, release/* o hotfix/*.');
    }
    return { stage: base === 'main' ? 'entrega' : 'revision', android: true, evidence: base === 'main' };
  }
  if (['push', 'workflow_dispatch'].includes(event) && ['develop', 'main'].includes(branch)) {
    return { stage: branch === 'main' ? 'entrega' : 'integracion',
      android: branch === 'main' || (event === 'workflow_dispatch' && android),
      evidence: branch === 'main' || (event === 'workflow_dispatch' && evidence) };
  }
  if (event === 'workflow_dispatch' && /^(release|hotfix)\/.+/.test(branch)) {
    return { stage: 'candidata', android: true, evidence: true };
  }
  throw new Error('Evento o rama fuera de la matriz de integración.');
}

function evaluateChecks(results, requireAndroid) {
  const required = ['plan', 'quality', 'api', 'performance'];
  if (requireAndroid || !['skipped', undefined].includes(results.android)) required.push('android');
  return required.filter((name) => results[name] !== 'success');
}

function main(mode, env = process.env) {
  if (mode === 'plan') {
    const plan = executionPlan({ event: env.GITHUB_EVENT_NAME, branch: env.GITHUB_REF_NAME,
      base: env.GITHUB_BASE_REF, head: env.GITHUB_HEAD_REF,
      android: env.RUN_ANDROID === 'true', evidence: env.KEEP_EVIDENCE === 'true' });
    fs.appendFileSync(env.GITHUB_OUTPUT, `android=${plan.android}\nevidence=${plan.evidence}\n`);
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
      `## Matriz de ejecución\n\nEtapa: **${plan.stage}**. Android obligatorio: **${plan.android ? 'sí' : 'no'}**.\n`);
    return;
  }
  if (mode !== 'gate') throw new Error('Usar plan o gate.');
  const results = Object.fromEntries(['plan', 'quality', 'api', 'performance', 'android']
    .map((name) => [name, env[`RESULT_${name.toUpperCase()}`] || 'skipped']));
  const blocked = evaluateChecks(results, env.REQUIRE_ANDROID !== 'false');
  const rows = Object.entries(results).map(([name, result]) => `| ${name} | ${result} |`);
  fs.appendFileSync(env.GITHUB_STEP_SUMMARY, [
    '## Resultado de integración', '', '| Comprobación | Estado |', '|---|---|', ...rows, '',
    blocked.length ? `**Bloqueada**: ${blocked.join(', ')}.\n`
      : '**Aprobada para el alcance ejecutado**. Esta comprobación no despliega ni acredita mediciones de carga.\n',
  ].join('\n'));
  if (blocked.length) throw new Error(`Integración bloqueada: ${blocked.join(', ')}.`);
}
module.exports = { executionPlan, evaluateChecks };
if (require.main === module) main(process.argv[2]);

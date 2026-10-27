const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const workBranch = /^(feature|fix|chore|test|release|hotfix)\/.+/;
function executionPlan({ event, branch, base, head, android = false, evidence = false, draft = false, appChanged = true }) {
  if (event === 'push' && workBranch.test(branch)) return { stage: 'trabajo', android: false, evidence: false };
  if (event === 'pull_request') {
    if (!['develop', 'main'].includes(base)) throw new Error('Destino de PR fuera de la matriz.');
    if (base === 'main' && head !== 'develop' && !/^(release|hotfix)\/.+/.test(head)) throw new Error('Main recibe entregas desde develop, release/* o hotfix/*.');
    return { stage: draft ? 'borrador' : base === 'main' ? 'entrega' : 'revision',
      android: !draft && (base === 'main' || appChanged), evidence: base === 'main' || evidence };
  }
  if (['push', 'workflow_dispatch'].includes(event) && ['develop', 'main'].includes(branch)) {
    return { stage: branch === 'main' ? 'entrega' : 'integracion',
      android: branch === 'main' || (event === 'workflow_dispatch' && android),
      evidence: branch === 'main' || (event === 'workflow_dispatch' && evidence) };
  }
  if (event === 'workflow_dispatch' && /^(release|hotfix)\/.+/.test(branch)) return { stage: 'candidata', android: true, evidence: true };
  throw new Error('Evento o rama fuera de la matriz de integración.');
}

function applicationChanged(files, read) {
  const tooling = new Set(['README.md', 'AGENTS.md', '.env.example', 'eslint.config.js', 'jest.config.js', 'jest.api.config.js',
    'scripts/pipeline-policy.js', 'scripts/validate-test-configs.js', 'scripts/run-static-analysis.js', 'scripts/write-test-summary.js',
    'scripts/write-api-summary.js', 'scripts/run-api-tests.js', 'scripts/performance-summary.js', 'scripts/run-performance.js',
    'scripts/test-environment.js', 'scripts/publish-internal-candidate.js']);
  for (const file of files) {
    if (file === '.github/workflows/api-android.yml') {
      const section = (text) => text.replace(/\r\n/g, '\n').match(/^  android:\n[\s\S]*?(?=^  [\w-]+:|(?![\s\S]))/m)?.[0];
      const before = section(read('base', file));
      const after = section(read('head', file));
      if (!before || !after || before !== after) return true;
    } else if (file === 'package.json') {
      const projection = (text) => {
        const data = JSON.parse(text);
        const result = Object.fromEntries(['name', 'version', 'main', 'expo', 'dependencies', 'devDependencies', 'engines', 'overrides', 'resolutions']
          .map((key) => [key, data[key]]));
        result.buildScripts = Object.fromEntries(Object.entries(data.scripts || {}).filter(([key]) =>
          ['preinstall', 'install', 'postinstall', 'prepare', 'prepack'].includes(key) || key.startsWith('eas-build-')));
        return JSON.stringify(result);
      };
      if (projection(read('base', file)) !== projection(read('head', file))) return true;
    } else if (!tooling.has(file) && !/^(?:__tests__|tests|docs|evidence|\.github)\//.test(file)) return true;
  }
  return false;
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
    let appChanged = false;
    if (env.GITHUB_EVENT_NAME === 'pull_request') {
      const pr = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')).pull_request;
      draft = pr.draft;
      assert.equal(typeof draft, 'boolean');
      const refs = { base: pr.base.sha, head: pr.head.sha };
      for (const ref of Object.values(refs)) assert.match(ref, /^[a-f0-9]{40}$/);
      const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' });
      const files = git(['diff', '--no-renames', '--name-only', '-z', refs.base + '...' + refs.head]).split('\0').filter(Boolean);
      appChanged = applicationChanged(files, (side, file) => git(['show', refs[side] + ':' + file]));
    }
    const plan = executionPlan({ event: env.GITHUB_EVENT_NAME, branch: env.GITHUB_REF_NAME, base: env.GITHUB_BASE_REF,
      head: env.GITHUB_HEAD_REF, draft, appChanged, android: env.RUN_ANDROID === 'true', evidence: env.KEEP_EVIDENCE === 'true' });
    fs.appendFileSync(env.GITHUB_OUTPUT, `android=${plan.android}\nevidence=${plan.evidence}\n`);
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## Matriz de ejecución\n\nEtapa: **${plan.stage}**. Android obligatorio: **${plan.android ? 'sí' : 'no'}**.\n\n`
      + (draft ? 'Borrador: calidad e integración sin compilar APK. Al marcarlo listo se vuelve a evaluar la candidata.\n'
        : env.GITHUB_EVENT_NAME === 'pull_request' && !appChanged && env.GITHUB_BASE_REF === 'develop'
          ? 'El PR sólo modifica herramientas, pruebas o documentación; no genera otro APK.\n' : 'Se comprueba el alcance de la candidata antes de integrar.\n'));
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
module.exports = { executionPlan, evaluateChecks, applicationChanged, pushQuality };
if (require.main === module) main(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });

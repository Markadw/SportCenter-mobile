const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const environment = require('./test-environment');
const { waitForService } = require('./wait-for-service');
const { summarizePerformance, performanceMarkdown } = require('./performance-summary');
const root = path.resolve(__dirname, '..');
const profile = require('../tests/performance/profile.json');
const source = require('../tests/environment/backend-source.json');

async function runPerformance(selection) {
  assert.ok(['baseline', 'load', 'stress', 'all'].includes(selection), 'Elegir baseline, load, stress o all.');
  const run = new Date().toISOString().replace(/[^0-9]/g, '');
  const directory = path.join(root, 'test-results', 'performance', run);
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  fs.mkdirSync(directory);
  const records = [];
  const selected = selection === 'all' ? ['baseline', 'load', 'stress'] : selection === 'load' ? ['baseline', 'load'] : [selection];
  try {
    await environment.start();
    for (const name of selected) {
      environment.compose(['restart', 'api']);
      await waitForService({ apiUrl: 'http://127.0.0.1:3011', timeout: 120000 });
      const config = name === 'stress' ? profile.stress : profile[name];
      const vars = { K6_NO_USAGE_REPORT: 'true', PERFORMANCE_RUN: run, RUN_LABEL: name,
        ITERATION_PAUSE_SECONDS: profile.iterationPauseSeconds, LOAD_VUS: config.vus || config.normalVus,
        DURATION_SECONDS: config.durationSeconds || 30,
        THRESHOLD_REASON: profile.reason };
      if (name === 'load') Object.assign(vars, { P95_LIMIT_MS: profile.load.p95LimitMs, ERROR_RATE_LIMIT: profile.load.errorRateLimit });
      if (name === 'stress') Object.assign(vars, { STRESS_VUS: config.peakVus, RAMP_SECONDS: config.rampSeconds,
        HOLD_SECONDS: config.holdSeconds, DOWN_SECONDS: config.downSeconds, STOP_SECONDS: config.stopSeconds,
        OBSERVE_RECOVERY_SECONDS: config.observeRecoverySeconds, VERIFY_RECOVERY_SECONDS: config.verifyRecoverySeconds,
        RECOVERY_LIMIT_MS: config.recoveryLimitMs });
      const args = ['compose', '-f', path.join(root, 'tests/environment/compose.yml'), 'run', '--rm', '--no-deps'];
      for (const [key, data] of Object.entries(vars)) args.push('-e', key + '=' + data);
      args.push('k6', 'run', '--quiet', 'tests/performance/' + (name === 'stress' ? 'stress' : 'load') + '.js');
      console.log('Midiendo ' + name + ' en la copia local.');
      const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit' });
      const file = path.join(directory, 'performance-' + name + '.json');
      assert.ok(fs.existsSync(file), 'k6 no produjo el informe de ' + name + '.');
      records.push({ name, exitCode: result.status ?? 1, report: JSON.parse(fs.readFileSync(file, 'utf8')) });
      if (result.status !== 0) throw new Error('La medición ' + name + ' no aprobó. Se conserva el resultado real.');
    }
    const summary = summarizePerformance(records, profile, source);
    summary.createdAt = new Date().toISOString();
    summary.sourceFiles = Object.fromEntries(['tests/performance/common.js','tests/performance/load.js','tests/performance/stress.js','tests/performance/profile.json','tests/environment/backend-source.json']
      .map((file) => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
    const markdown = performanceMarkdown(summary);
    fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    fs.writeFileSync(path.join(directory, 'summary.md'), markdown);
    fs.writeFileSync(path.join(root, 'test-results', 'performance-summary.json'), JSON.stringify({ directory, ...summary }, null, 2) + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    process.stdout.write(markdown + '\n');
    if (summary.verdict === 'failure') throw new Error('Los criterios de medición no aprobaron.');
    return summary;
  } catch (error) {
    fs.writeFileSync(path.join(directory, 'execution-error.json'), JSON.stringify({
      verdict: 'failure', reason: error.message, completed: records.map((record) => ({ name: record.name, exitCode: record.exitCode })),
      backendCommit: source.commit, scope: profile.scope,
    }, null, 2) + '\n');
    throw error;
  }
}
module.exports = { runPerformance };
if (require.main === module) runPerformance(process.argv[2] || process.env.SCENARIO || 'all')
  .catch((error) => { console.error(error.message); process.exitCode = 1; });

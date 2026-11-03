/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { describe, test, expect } = require('@jest/globals');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');
const { executionPlan } = require('../scripts/pipeline-policy');
const { validateWorkflows } = require('../scripts/validate-test-configs');
const root = path.resolve(__dirname, '..');

describe('Candidata explícita por etiqueta de SHA congelado', () => {
  test.each(['candidate/android-20261101-abcd1234', 'candidate/android-' + 'a'.repeat(40)])('sólo el push del tag %s activa APK y evidencia', branch => {
    expect(executionPlan({ event: 'push', refType: 'tag', branch })).toEqual({ stage: 'candidata', android: true, evidence: true });
  });
  test.each(['v1.0.0', 'release/1.0', 'candidate/android-', 'candidate/android/one', 'candidate/android-one/two', 'candidate/ios-one'])(
    'una etiqueta fuera del prefijo exacto no compila: %s', branch => {
      expect(() => executionPlan({ event: 'push', refType: 'tag', branch })).toThrow();
    });
  test('una rama con el mismo nombre y un dispatch de tag no sustituyen el push explícito', () => {
    expect(() => executionPlan({ event: 'push', refType: 'branch', branch: 'candidate/android-one' })).toThrow();
    expect(() => executionPlan({ event: 'workflow_dispatch', refType: 'tag', branch: 'candidate/android-one' })).toThrow();
  });
  test.each(['candidate/android-one', 'develop'])('borrar la referencia %s nunca genera APK ni candidata', branch => {
    expect(() => executionPlan({ event: 'push', refType: branch === 'develop' ? 'branch' : 'tag', branch, deleted: true })).toThrow('Eliminar');
  });
  test('preserva PR develop sin APK y los push habituales de trabajo', () => {
    expect(executionPlan({ event: 'pull_request', refType: 'branch', base: 'develop', head: 'feature/new', evidence: true }).android).toBe(false);
    expect(executionPlan({ event: 'push', refType: 'branch', branch: 'release/freeze' }).android).toBe(false);
    expect(executionPlan({ event: 'push', refType: 'branch', branch: 'develop' }).android).toBe(false);
    expect(executionPlan({ event: 'push', refType: 'branch', branch: 'main' }).android).toBe(true);
  });
  test('el CLI usa deleted y ref_type reales del evento y no acredita una eliminación', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-candidate-'));
    try {
      const event = path.join(directory, 'event.json'), output = path.join(directory, 'outputs.txt'), summary = path.join(directory, 'summary.md');
      fs.writeFileSync(event, JSON.stringify({ deleted: false }));
      fs.writeFileSync(output, ''); fs.writeFileSync(summary, '');
      const env = { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'candidate/android-final',
        GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary };
      const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/pipeline-policy.js'), 'plan'], { env, encoding: 'utf8' });
      expect(run().status).toBe(0);
      expect(fs.readFileSync(output, 'utf8')).toContain('android=true');
      expect(fs.readFileSync(output, 'utf8')).toContain('evidence=true');
      expect(fs.readFileSync(summary, 'utf8')).toContain('no registra una entrega automáticamente');
      fs.writeFileSync(event, JSON.stringify({ deleted: true })); fs.writeFileSync(output, '');
      expect(run().status).toBe(1); expect(fs.readFileSync(output, 'utf8')).not.toContain('android=true');
      fs.writeFileSync(event, JSON.stringify({ deleted: 'false' }));
      expect(run().status).toBe(1);
    } finally {
      if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('sport-candidate-')) throw new Error('Ruta temporal inesperada.');
      fs.rmSync(directory, { recursive: true });
    }
  });
});
function workflows() {
  return new Map(['ci.yml', 'api-android.yml', 'performance.yml', 'security.yml', 'android-validation.yml'].map(file =>
    [file, YAML.parse(fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8'))]));
}
describe('Configuración de candidata independiente del workflow_dispatch de main', () => {
  test('el tag no ejecuta deduplicación de ramas ni entrega automática', () => {
    const config = workflows();
    expect(config.get('api-android.yml').on.push.tags).toEqual(['candidate/android-*']);
    expect(config.get('ci.yml').jobs.push_policy.if).toContain("github.ref_type == 'branch'");
    expect(config.get('api-android.yml').jobs.delivery.if).toContain("github.ref_type == 'branch'");
    expect(() => validateWorkflows(config)).not.toThrow();
  });
  test.each([
    config => { config.get('api-android.yml').on.push.tags = ['**']; },
    config => { config.get('ci.yml').jobs.push_policy.if = "github.event_name == 'push'"; },
    config => { config.get('api-android.yml').jobs.delivery.if = "needs.plan.outputs.evidence == 'true' && needs.plan.outputs.android == 'true'"; },
  ])('bloquea tags amplios o una candidata que entra en políticas de rama %#', mutate => {
    const config = workflows(); mutate(config); expect(() => validateWorkflows(config)).toThrow();
  });
});

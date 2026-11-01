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
const { evaluateAudit, evaluateSarif, evaluateSarifFiles, securitySummary } = require('../scripts/evaluate-security');
const { validateWorkflows } = require('../scripts/validate-test-configs');
const root = path.resolve(__dirname, '..');
const outcomes = { install: 'success', audit: 'success', init: 'success', analyze: 'success', sast: 'success' };
function audit(values = {}, vulnerabilities = {}) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...values };
  return { auditReportVersion: 2, vulnerabilities,
    metadata: { vulnerabilities: { ...counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) } } };
}
function sarif(severity = '6.9', level) {
  const properties = severity === undefined ? {} : { 'security-severity': severity };
  return { version: '2.1.0', runs: [{ tool: { driver: { name: 'CodeQL', rules: [{ id: 'js/test', properties,
    ...(level ? { defaultConfiguration: { level } } : {}) }] } },
    invocations: [{ executionSuccessful: true }], results: [{ ruleId: 'js/test', ruleIndex: 0, message: { text: 'Synthetic finding' } }] }] };
}
function temporary(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-security-'));
  try { return callback(directory); }
  finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('sport-security-')) throw new Error('Ruta temporal inesperada.');
    fs.rmSync(directory, { recursive: true });
  }
}
function cleanSast() {
  const report = sarif(); report.runs[0].results = [];
  return { ...evaluateSarif(report), files: 1 };
}

describe('Auditoría npm sin remediaciones automáticas', () => {
  test('cero críticas permite altas y las informa como pendientes', () => {
    const result = evaluateAudit(audit({ high: 1 }, { dependency: { severity: 'high' } }), 0);
    expect(result.status).toBe('passed'); expect(result.counts.high).toBe(1);
    const summary = securitySummary(result, cleanSast(), outcomes);
    expect(summary.status).toBe('passed');
    expect(summary.markdown).toContain('dependency');
    expect(summary.markdown).toContain('siguen pendientes');
  });
  test('una crítica bloquea aunque npm devuelva cero', () => {
    expect(evaluateAudit(audit({ critical: 1 }, { dependency: { severity: 'critical' } }), 0).status).toBe('blocked');
  });
  test('no confía en metadata cero cuando hay una entrada crítica', () => {
    expect(() => evaluateAudit(audit({}, { dependency: { severity: 'critical' } }), 0)).toThrow('contadores');
  });
  test.each([1, 2, 127])('conserva como fallo operativo el código npm %s', exit => {
    expect(evaluateAudit(audit(), exit).status).toBe('blocked');
  });
  test.each([null, {}, { ...audit(), auditReportVersion: 1 }, { ...audit(), error: { code: 'ENOAUDIT' } },
    { ...audit(), metadata: {} }, { ...audit(), vulnerabilities: [] },
    audit({ critical: -1 }), audit({ high: '1' }), { ...audit(), metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 1 } } },
    audit({}, { dependency: { severity: 'unknown' } }), audit({}, { dependency: { severity: 'high' } })])('rechaza un informe npm ausente o malformado %#', report => {
    expect(() => evaluateAudit(report, 0)).toThrow();
  });
});

describe('SARIF de CodeQL y umbral de seguridad', () => {
  test.each([['6.9', 'passed', 0, 0], ['7', 'blocked', 1, 0], ['8.9', 'blocked', 1, 0], ['9', 'blocked', 0, 1], [10, 'blocked', 0, 1]])(
    'score %s produce %s', (score, status, high, critical) => {
      expect(evaluateSarif(sarif(score))).toMatchObject({ status, counts: { high, critical } });
    });
  test('un resultado de nivel error y una regla de nivel error bloquean sin score', () => {
    const resultLevel = sarif(); delete resultLevel.runs[0].tool.driver.rules[0].properties['security-severity'];
    resultLevel.runs[0].results[0].level = 'error';
    expect(evaluateSarif(resultLevel).status).toBe('blocked');
    const ruleLevel = sarif('1', 'error'); ruleLevel.runs[0].results[0].level = 'note';
    expect(evaluateSarif(ruleLevel).status).toBe('blocked');
    const propertyLevel = sarif(); propertyLevel.runs[0].tool.driver.rules[0].properties = { 'problem.severity': 'error' };
    expect(evaluateSarif(propertyLevel).status).toBe('blocked');
  });
  test('propiedad de resultado no puede reducir el score de la regla', () => {
    const report = sarif('9'); report.runs[0].results[0].properties = { 'security-severity': '1' };
    expect(evaluateSarif(report).counts.critical).toBe(1);
  });
  test('supresión o baseline no eluden el gate explícito', () => {
    const report = sarif('8');
    report.runs[0].results[0].suppressions = [{ kind: 'inSource', status: 'accepted' }];
    report.runs[0].results[0].baselineState = 'unchanged';
    expect(evaluateSarif(report).status).toBe('blocked');
  });
  test('resuelve reglas en extensiones sin perder su severidad', () => {
    const report = sarif();
    report.runs[0].tool.extensions = [{ name: 'queries', rules: [{ id: 'js/extension', properties: { 'security-severity': '9.8' } }] }];
    report.runs[0].results[0] = { rule: { id: 'js/extension', index: 0, toolComponent: { index: 0, name: 'queries' } } };
    expect(evaluateSarif(report)).toMatchObject({ status: 'blocked', blockedRules: ['js/extension'] });
  });
  test.each([
    report => { report.version = '2.0.0'; },
    report => { report.runs = []; },
    report => { delete report.runs[0].results; },
    report => { delete report.runs[0].tool.driver.rules; },
    report => { report.runs[0].tool.driver.name = 'Other'; },
    report => { report.runs[0].results[0].ruleId = 'js/unknown'; },
    report => { report.runs[0].results[0].ruleIndex = 20; },
    report => { report.runs[0].tool.driver.rules[0].properties['security-severity'] = 'NaN'; },
    report => { report.runs[0].tool.driver.rules[0].properties['security-severity'] = 11; },
    report => { report.runs[0].tool.driver.rules[0].properties['security-severity'] = null; },
    report => { report.runs[0].results[0].level = 'critical'; },
    report => { report.runs[0].results[0].rule = { id: 'js/different' }; },
    report => { report.runs[0].invocations[0].executionSuccessful = false; },
    report => { report.runs[0].invocations[0].executionSuccessful = 'false'; },
    report => { report.runs[0].invocations[0].toolExecutionNotifications = [{ level: 'error' }]; },
  ])('bloquea formato SARIF o ejecución malformados %#', mutate => {
    const report = sarif(); mutate(report); expect(() => evaluateSarif(report)).toThrow();
  });
  test('varios archivos se agregan y directorio vacío no equivale a cero hallazgos', () => temporary(directory => {
    expect(() => evaluateSarifFiles(directory)).toThrow('ningún informe');
    fs.writeFileSync(path.join(directory, 'a.sarif'), JSON.stringify(sarif('1')));
    fs.writeFileSync(path.join(directory, 'b.sarif'), JSON.stringify(sarif('9')));
    expect(evaluateSarifFiles(directory)).toMatchObject({ status: 'blocked', files: 2, counts: { results: 2, critical: 1 } });
  }));
});

describe('Resultado de seguridad real y diagnóstico', () => {
  test.each(['install', 'audit', 'init', 'analyze', 'sast'])('un paso %s omitido, cancelado o fallido nunca aprueba', name => {
    for (const status of ['skipped', 'failure', 'cancelled', undefined]) {
      expect(securitySummary(evaluateAudit(audit(), 0), cleanSast(), { ...outcomes, [name]: status }).status).toBe('blocked');
    }
  });
  test('informes pasados con contadores ausentes o incompatibles no producen verde', () => {
    expect(securitySummary({ kind: 'audit', status: 'passed' }, cleanSast(), outcomes).status).toBe('blocked');
    expect(securitySummary(evaluateAudit(audit(), 0), { kind: 'sast', status: 'passed' }, outcomes).status).toBe('blocked');
    expect(securitySummary({ ...evaluateAudit(audit(), 0), counts: { info: 0, low: 0, moderate: 0, high: 0, critical: 1 } }, cleanSast(), outcomes).status).toBe('blocked');
    expect(securitySummary(null, null, outcomes).markdown).toContain('Bloqueada');
  });
  test('CLI devuelve error y genera diagnóstico para JSON inválido o informe ausente', () => temporary(directory => {
    const file = path.join(directory, 'audit.json'); fs.writeFileSync(file, '{invalid');
    const run = args => spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-security.js'), ...args],
      { cwd: directory, env: { ...process.env, ANALYZE_OUTCOME: 'success' }, encoding: 'utf8' });
    expect(run(['audit', file, '0']).status).toBe(1);
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'test-results/security/audit-gate.json'), 'utf8')).status).toBe('invalid');
    expect(run(['sast', path.join(directory, 'absent')]).status).toBe(1);
    expect(run(['audit', file]).status).toBe(1);
    expect(run(['summary']).status).toBe(1);
    expect(fs.readFileSync(path.join(directory, 'test-results/security/summary.md'), 'utf8')).toContain('Bloqueada');
  }));
});

function workflows() {
  return new Map(['ci.yml', 'api-android.yml', 'performance.yml', 'security.yml'].map(file =>
    [file, YAML.parse(fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8'))]));
}
describe('Workflow de seguridad deduplicado y obligatorio', () => {
  test.each([
    ['programación adicional', config => { config.get('security.yml').on.schedule = [{ cron: '* * * * *' }]; }],
    ['doble caller', config => { config.get('api-android.yml').jobs.securityCopy = { ...config.get('api-android.yml').jobs.security }; }],
    ['Android sin seguridad', config => { config.get('api-android.yml').jobs.android.needs = ['plan', 'quality', 'api', 'performance']; }],
    ['gate sin resultado real', config => { config.get('api-android.yml').jobs.integration.steps[1].env.RESULT_SECURITY = 'success'; }],
    ['permisos globales', config => { config.get('api-android.yml').permissions['security-events'] = 'write'; }],
    ['CodeQL antiguo', config => { config.get('security.yml').jobs.scan.steps.find(step => step.id === 'init').uses = 'github/codeql-action/init@v3'; }],
    ['token externo', config => { config.get('security.yml').jobs.scan.steps.find(step => step.id === 'init').with['external-repository-token'] = 'external'; }],
    ['SARIF sin subida', config => { config.get('security.yml').jobs.scan.steps.find(step => step.id === 'analyze').with.upload = 'never'; }],
    ['audit sin código real', config => { config.get('security.yml').jobs.scan.steps.find(step => step.id === 'audit').run = 'npm audit --json || true'; }],
    ['SAST con resultado fijo', config => { config.get('security.yml').jobs.scan.steps.find(step => step.id === 'sast').env.ANALYZE_OUTCOME = 'success'; }],
    ['errores ignorados', config => { config.get('security.yml').jobs.scan.steps.find(step => step.id === 'audit')['continue-on-error'] = true; }],
  ])('detecta %s', (_name, mutate) => {
    const config = workflows(); mutate(config); expect(() => validateWorkflows(config)).toThrow();
  });
});


test("CLI sólo aprueba con ambos informes completos y resultados reales de ejecución", () => temporary(directory => {
  const npmFile = path.join(directory, "audit.json"), sarifFile = path.join(directory, "javascript.sarif");
  fs.writeFileSync(npmFile, JSON.stringify(audit()));
  const clean = sarif(); clean.runs[0].results = [];
  fs.writeFileSync(sarifFile, JSON.stringify(clean));
  const env = { ...process.env, INSTALL_OUTCOME: "success", AUDIT_OUTCOME: "success", INIT_OUTCOME: "success",
    ANALYZE_OUTCOME: "success", SAST_OUTCOME: "success" };
  const run = (args, values = env) => spawnSync(process.execPath, [path.join(root, "scripts/evaluate-security.js"), ...args],
    { cwd: directory, env: values, encoding: "utf8" });
  expect(run(["audit", npmFile, "0"]).status).toBe(0);
  expect(run(["sast", sarifFile]).status).toBe(0);
  expect(run(["summary"]).status).toBe(0);
  expect(run(["sast", sarifFile], { ...env, ANALYZE_OUTCOME: "skipped" }).status).toBe(1);
  expect(run(["summary"]).status).toBe(1);
}));

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
const outcomes = { install: 'success', audit: 'success', semgrep: 'success', init: 'success', analyze: 'success', sast: 'success' };
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
  test.each(['install', 'audit', 'semgrep', 'init', 'analyze', 'sast'])('un paso %s omitido, cancelado o fallido nunca aprueba', name => {
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
  return new Map(['ci.yml', 'api-android.yml', 'performance.yml', 'security.yml', 'android-validation.yml'].map(file =>
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
  const env = { ...process.env, INSTALL_OUTCOME: "success", AUDIT_OUTCOME: "success", SEMGREP_OUTCOME: "success", INIT_OUTCOME: "success",
    ANALYZE_OUTCOME: "success", SAST_OUTCOME: "success" };
  const run = (args, values = env) => spawnSync(process.execPath, [path.join(root, "scripts/evaluate-security.js"), ...args],
    { cwd: directory, env: values, encoding: "utf8" });
  expect(run(["audit", npmFile, "0"]).status).toBe(0);
  expect(run(["sast", sarifFile]).status).toBe(0);
  expect(run(["summary"]).status).toBe(0);
  expect(run(["sast", sarifFile], { ...env, ANALYZE_OUTCOME: "skipped" }).status).toBe(1);
  expect(run(["summary"]).status).toBe(1);
}));


// Proyección mínima anonimizada de CodeQL PR44 (analysis 2072527667).
// Conserva el driver sin rules, extensiones auxiliares sin rules y reglas en el pack.
function actualCodeqlShape() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/security/codeql-extension-rules.sarif'), 'utf8'));
}
describe('Variación real de componentes CodeQL SARIF 2.1.0', () => {
  test('acepta results vacío con reglas sólo en extensión y no modifica el informe', () => {
    const report = actualCodeqlShape(), before = JSON.stringify(report);
    expect(report.runs[0].tool.driver).not.toHaveProperty('rules');
    expect(evaluateSarif(report)).toMatchObject({ status: 'passed', counts: { results: 0, high: 0, critical: 0, errors: 0, blocked: 0 } });
    expect(JSON.stringify(report)).toBe(before);
  });
  test('un hallazgo referenciado al pack real conserva su score crítico aunque el driver no tenga reglas', () => {
    const report = actualCodeqlShape(), run = report.runs[0];
    const index = run.tool.extensions.findIndex(component => component.rules?.length);
    const rule = run.tool.extensions[index].rules[0];
    run.results = [{ rule: { id: rule.id, index: 0, toolComponent: { index } }, message: { text: 'Hallazgo sintético sin fuentes.' } }];
    expect(evaluateSarif(report)).toMatchObject({ status: 'blocked', counts: { results: 1, critical: 1, blocked: 1 }, blockedRules: [rule.id] });
  });
  test('no inventa metadata para un resultado que referencia un componente sin reglas', () => {
    const report = actualCodeqlShape();
    report.runs[0].results = [{ ruleId: 'js/unknown', ruleIndex: 0, message: { text: 'Hallazgo sintético.' } }];
    expect(() => evaluateSarif(report)).toThrow('Referencia de regla SARIF inexistente');
    report.runs[0].results[0] = { rule: { id: 'js/unknown', index: 0, toolComponent: { index: 0 } } };
    expect(() => evaluateSarif(report)).toThrow('Referencia de regla SARIF inexistente');
  });
  test.each([null, {}, 'rules', 0])('omisión válida no equivale a aceptar rules malformado: %j', rules => {
    const report = actualCodeqlShape(); report.runs[0].tool.driver.rules = rules;
    expect(() => evaluateSarif(report)).toThrow('Reglas SARIF no válidas');
    delete report.runs[0].tool.driver.rules; report.runs[0].tool.extensions[0].rules = rules;
    expect(() => evaluateSarif(report)).toThrow('Reglas SARIF no válidas');
  });
  test('el fixture válido no elude analyze fallido ni resultados ausentes en CLI', () => temporary(directory => {
    const file = path.join(directory, 'actual.sarif'); fs.writeFileSync(file, JSON.stringify(actualCodeqlShape()));
    const run = outcome => spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-security.js'), 'sast', file],
      { cwd: directory, env: { ...process.env, ANALYZE_OUTCOME: outcome }, encoding: 'utf8' });
    expect(run('success').status).toBe(0);
    for (const outcome of ['failure', 'cancelled', 'skipped', '']) expect(run(outcome).status).toBe(1);
    const invalid = actualCodeqlShape(); delete invalid.runs[0].results;
    fs.writeFileSync(file, JSON.stringify(invalid));
    expect(run('success').status).toBe(1);
  }));
});


// Datos sintéticos: no atribuyen las ubicaciones a los hallazgos remotos de PR44.
function locatedSarif(uri = 'scripts/example.js') {
  const report = sarif('7.8');
  report.runs[0].results[0].locations = [{ physicalLocation: {
    artifactLocation: { uri, uriBaseId: '%SRCROOT%' }, region: { startLine: 12, startColumn: 7 },
  } }];
  return report;
}

describe('Diagnóstico SAST compacto sin publicar contenido del SARIF', () => {
  test('conserva regla, score máximo y ubicación relativa sin mensajes ni fuentes', () => {
    const report = locatedSarif('src/app/(tabs)/[id].tsx');
    const result = report.runs[0].results[0];
    result.message = { text: 'PRIVATE-MESSAGE' };
    result.locations[0].physicalLocation.region.snippet = { text: 'PRIVATE-SOURCE' };
    result.relatedLocations = [{ message: { text: 'PRIVATE-RELATED' } }];
    result.codeFlows = [{ threadFlows: [{ message: { text: 'PRIVATE-FLOW' } }] }];
    result.properties = { 'security-severity': '9.1', token: 'PRIVATE-TOKEN' };
    report.runs[0].originalUriBaseIds = { '%SRCROOT%': { uri: 'file:///PRIVATE-RUNNER/' } };
    const before = JSON.stringify(report);
    const evaluated = evaluateSarif(report);
    expect(evaluated).toMatchObject({ status: 'blocked', counts: { critical: 1, blocked: 1 }, blockedFindingsOmitted: 0 });
    expect(evaluated.blockedFindings).toEqual([{ ruleId: 'js/test', score: 9.1, severity: 'critical',
      path: 'src/app/(tabs)/[id].tsx', startLine: 12, startColumn: 7 }]);
    expect(JSON.stringify(evaluated)).not.toContain('PRIVATE-');
    const summary = securitySummary(evaluateAudit(audit(), 0), { ...evaluated, files: 1 }, outcomes);
    expect(summary.status).toBe('blocked');
    expect(summary.markdown).toContain('| js/test | 9.1 | critical | ' + String.fromCharCode(96) + 'src/app/(tabs)/[id].tsx' + String.fromCharCode(96) + ' | 12 | 7 |');
    expect(summary.markdown).not.toContain('PRIVATE-');
    expect(JSON.stringify(report)).toBe(before);
  });
  test('resuelve el índice cero sin resolver la base al directorio privado del runner', () => {
    const report = locatedSarif(), run = report.runs[0];
    run.artifacts = [{ location: { uri: 'scripts/indexed.js', uriBaseId: '%SRCROOT%' } }];
    run.results[0].locations[0].physicalLocation.artifactLocation = { index: 0, uriBaseId: '%SRCROOT%' };
    expect(evaluateSarif(report).blockedFindings[0]).toMatchObject({ path: 'scripts/indexed.js', startLine: 12, startColumn: 7 });
  });
  test.each([
    '', '/PRIVATE/absolute.js', 'C:/PRIVATE/absolute.js', 'C:\\PRIVATE\\absolute.js', '//PRIVATE/host.js',
    'https://PRIVATE.example/source.js', 'file:///PRIVATE/source.js', 'data:text/PRIVATE',
    '../PRIVATE/source.js', './PRIVATE/source.js', 'src/../PRIVATE/source.js', 'src/./PRIVATE.js', 'src//PRIVATE.js',
    'src\\PRIVATE.js', 'src/%2e%2e/PRIVATE.js', 'src/PRIVATE%20file.js', 'src/PRIVATE.js?token=SECRET',
    'src/PRIVATE.js#fragment', 'src/PRIVATE file.js', 'src/PRIVATE\nfile.js', 'src/PRIVATE\rfile.js', 'src/PRIVATE\tfile.js',
    'src/PRIVATE|file.js', 'src/PRIVATE<file>.js', 'src/PRIVATE&file.js', 'src/PRIVATE' + String.fromCharCode(96) + 'file.js',
    'src/PRIVATÉ.js', 'src/' + 'PRIVATE'.repeat(50) + '.js', null, {}, ['src/PRIVATE.js'],
  ])('una ruta no publicable se omite y conserva el bloqueo: %#', uri => {
    const evaluated = evaluateSarif(locatedSarif(uri));
    expect(evaluated).toMatchObject({ status: 'blocked', counts: { high: 1, blocked: 1 }, blockedFindingsOmitted: 0 });
    expect(evaluated.blockedFindings[0]).toEqual({ ruleId: 'js/test', score: 7.8, severity: 'high', path: null, startLine: null, startColumn: null });
    expect(JSON.stringify(evaluated)).not.toContain('PRIVATE');
    expect(securitySummary(evaluateAudit(audit(), 0), { ...evaluated, files: 1 }, outcomes).markdown).not.toContain('PRIVATE');
  });
  test.each([
    { uri: 'scripts/example.js', uriBaseId: 'EXTERNAL' },
    { index: -1 }, { index: '0' }, { index: 1 },
    { uri: 'scripts/different.js', index: 0 },
    { index: 0, uriBaseId: 'EXTERNAL' },
  ])('no publica una referencia ambigua, externa o inexistente: %#', reference => {
    const report = locatedSarif(), run = report.runs[0];
    run.artifacts = [{ location: { uri: 'scripts/example.js', uriBaseId: '%SRCROOT%' } }];
    run.results[0].locations[0].physicalLocation.artifactLocation = reference;
    expect(evaluateSarif(report)).toMatchObject({ status: 'blocked', blockedFindings: [{ path: null, startLine: null, startColumn: null }] });
  });
  test('también rechaza bases externas o URI absolutas en el artefacto indexado', () => {
    const report = locatedSarif(), run = report.runs[0];
    run.results[0].locations[0].physicalLocation.artifactLocation = { index: 0 };
    for (const location of [{ uri: 'scripts/example.js', uriBaseId: 'EXTERNAL' }, { uri: 'https://PRIVATE.example/source.js' }]) {
      run.artifacts = [{ location }];
      expect(evaluateSarif(report).blockedFindings[0].path).toBeNull();
    }
  });
  test.each([0, -1, 1.5, '12', null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('sólo publica posiciones enteras positivas: %s', position => {
    const report = locatedSarif();
    report.runs[0].results[0].locations[0].physicalLocation.region = { startLine: position, startColumn: 7 };
    expect(evaluateSarif(report).blockedFindings[0]).toMatchObject({ path: 'scripts/example.js', startLine: null, startColumn: null });
    report.runs[0].results[0].locations[0].physicalLocation.region = { startLine: 12, startColumn: position };
    expect(evaluateSarif(report).blockedFindings[0]).toMatchObject({ startLine: 12, startColumn: null });
  });
  test.each([null, {}, [], [null], [{ physicalLocation: null }]])('ubicación ausente o malformada no descarta un hallazgo: %#', locations => {
    const report = locatedSarif(); report.runs[0].results[0].locations = locations;
    expect(evaluateSarif(report)).toMatchObject({ status: 'blocked', counts: { high: 1, blocked: 1 }, blockedFindings: [{ path: null }] });
  });
  test('nivel error sin score conserva la causa bloqueante y un score bajo no crea diagnóstico alto', () => {
    const report = locatedSarif(); delete report.runs[0].tool.driver.rules[0].properties['security-severity'];
    report.runs[0].results[0].level = 'error';
    expect(evaluateSarif(report).blockedFindings[0]).toMatchObject({ score: null, severity: 'error' });
    expect(evaluateSarif(sarif('6.9'))).toMatchObject({ status: 'passed', blockedFindings: [], blockedFindingsOmitted: 0 });
  });
  test('limita el diagnóstico global entre runs y archivos sin perder contadores ni bloqueo', () => temporary(directory => {
    const a = locatedSarif(), b = locatedSarif('src/example.ts');
    a.runs[0].results = Array.from({ length: 30 }, () => structuredClone(a.runs[0].results[0]));
    a.runs.push(structuredClone(a.runs[0]));
    b.runs[0].results = Array.from({ length: 15 }, () => structuredClone(b.runs[0].results[0]));
    expect(evaluateSarif(a)).toMatchObject({ counts: { results: 60, high: 60, blocked: 60 }, blockedFindingsOmitted: 10 });
    fs.writeFileSync(path.join(directory, 'a.sarif'), JSON.stringify(a));
    fs.writeFileSync(path.join(directory, 'b.sarif'), JSON.stringify(b));
    const evaluated = evaluateSarifFiles(directory);
    expect(evaluated).toMatchObject({ status: 'blocked', files: 2, counts: { results: 75, high: 75, blocked: 75 }, blockedFindingsOmitted: 25 });
    expect(evaluated.blockedFindings).toHaveLength(50);
    const summary = securitySummary(evaluateAudit(audit(), 0), evaluated, outcomes);
    expect(summary.status).toBe('blocked');
    expect(summary.markdown.match(/\| js\/test \|/g)).toHaveLength(50);
    expect(summary.markdown).toContain('ausencia de diagnóstico: 25.');
  }));
  test('el resumen revalida el JSON compacto sin reflejar valores manipulados', () => {
    const evaluated = { ...evaluateSarif(locatedSarif()), files: 1 };
    evaluated.blockedRules = ['https://PRIVATE.example/rule'];
    evaluated.blockedFindings = [{ ruleId: '<PRIVATE-RULE>', score: 'PRIVATE-SCORE', severity: 'PRIVATE-SEVERITY',
      path: 'https://PRIVATE.example/source', startLine: 'PRIVATE-LINE', startColumn: 'PRIVATE-COLUMN',
      message: 'PRIVATE-MESSAGE', snippet: 'PRIVATE-SOURCE' }];
    const summary = securitySummary(evaluateAudit(audit(), 0), evaluated, outcomes);
    expect(summary.status).toBe('blocked');
    expect(summary.markdown).not.toContain('PRIVATE');
    expect(summary.markdown).toContain('No publicable');
  });
  test('CLI conserva los dos altos y el fallo, publicando sólo ubicación mínima en JSON y resumen', () => temporary(directory => {
    const report = locatedSarif(), run = report.runs[0];
    run.results.push(structuredClone(run.results[0]));
    run.results[1].locations[0].physicalLocation = { artifactLocation: { uri: 'src/example.ts' }, region: { startLine: 28, startColumn: 3, snippet: { text: 'PRIVATE-SOURCE' } } };
    run.results[1].message = { text: 'PRIVATE-MESSAGE' };
    const file = path.join(directory, 'two-high.sarif'); fs.writeFileSync(file, JSON.stringify(report));
    const env = { ...process.env, INSTALL_OUTCOME: 'success', AUDIT_OUTCOME: 'success', INIT_OUTCOME: 'success', ANALYZE_OUTCOME: 'success', SAST_OUTCOME: 'failure' };
    const cli = args => spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-security.js'), ...args], { cwd: directory, env, encoding: 'utf8' });
    expect(cli(['sast', file]).status).toBe(1);
    const json = fs.readFileSync(path.join(directory, 'test-results/security/sast-gate.json'), 'utf8');
    const result = JSON.parse(json);
    expect(result).toMatchObject({ status: 'blocked', counts: { high: 2, critical: 0, blocked: 2 }, blockedFindingsOmitted: 0 });
    expect(result.blockedFindings.map(finding => finding.path)).toEqual(['scripts/example.js', 'src/example.ts']);
    expect(json).not.toContain('PRIVATE-');
    fs.writeFileSync(path.join(directory, 'test-results/security/audit-gate.json'), JSON.stringify(evaluateAudit(audit(), 0)));
    expect(cli(['summary']).status).toBe(1);
    const summary = fs.readFileSync(path.join(directory, 'test-results/security/summary.md'), 'utf8');
    expect(summary).toContain('**2 altos**');
    expect(summary).toContain('scripts/example.js');
    expect(summary).toContain('src/example.ts');
    expect(summary).not.toContain('PRIVATE-');
  }));
});


test.each(['JSON malformado', 'referencia de regla incompatible'])('CLI no publica valores crudos mediante errores: %s', kind => temporary(directory => {
  const report = locatedSarif(); report.runs[0].results[0].ruleId = 'js/PRIVATE-RULE';
  const file = path.join(directory, 'invalid.sarif');
  fs.writeFileSync(file, kind === 'JSON malformado' ? '{"PRIVATE-SOURCE": }' : JSON.stringify(report));
  const env = { ...process.env, INSTALL_OUTCOME: 'success', AUDIT_OUTCOME: 'success', INIT_OUTCOME: 'success', ANALYZE_OUTCOME: 'success', SAST_OUTCOME: 'failure' };
  const cli = args => spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-security.js'), ...args], { cwd: directory, env, encoding: 'utf8' });
  const evaluated = cli(['sast', file]);
  expect(evaluated.status).toBe(1);
  const json = fs.readFileSync(path.join(directory, 'test-results/security/sast-gate.json'), 'utf8');
  expect(JSON.parse(json)).toMatchObject({ status: 'invalid', reasons: ['Informe SARIF ausente, inválido o análisis CodeQL sin éxito.'] });
  expect(json).not.toContain('PRIVATE-');
  expect(evaluated.stdout + evaluated.stderr).not.toContain('PRIVATE-');
  fs.writeFileSync(path.join(directory, 'test-results/security/audit-gate.json'), JSON.stringify(evaluateAudit(audit(), 0)));
  expect(cli(['summary']).status).toBe(1);
  expect(fs.readFileSync(path.join(directory, 'test-results/security/summary.md'), 'utf8')).not.toContain('PRIVATE-');
}));

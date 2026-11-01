const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const outputDirectory = path.join('test-results', 'security');
const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const levels = new Set(['none', 'note', 'warning', 'error']);
const maximumBlockedFindings = 50;
function diagnosticRuleId(value) {
  return typeof value === 'string' && value.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(value) ? value : null;
}
function diagnosticPath(value) {
  if (typeof value !== 'string' || value.length > 240 || !/^[A-Za-z0-9_.@()[\]\/-]+$/.test(value)) return null;
  const segments = value.split('/');
  return segments.every(segment => segment && segment !== '.' && segment !== '..') ? value : null;
}
function diagnosticPosition(value) { return Number.isSafeInteger(value) && value > 0 ? value : null; }
function diagnosticArtifact(reference, run) {
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return null;
  const localBase = location => location?.uriBaseId === undefined || location.uriBaseId === '%SRCROOT%';
  if (!localBase(reference)) return null;
  let uri = reference.uri;
  if (reference.index !== undefined) {
    if (!Number.isSafeInteger(reference.index) || reference.index < 0) return null;
    const indexed = Array.isArray(run.artifacts) ? run.artifacts[reference.index]?.location : undefined;
    if (!indexed || !localBase(indexed) || (uri !== undefined && uri !== indexed.uri)) return null;
    uri = indexed.uri;
  }
  return diagnosticPath(uri);
}
function findingLocation(result, run) {
  // Nunca publicar mensajes, snippets, bases absolutas ni otras ubicaciones del SARIF.
  const physical = Array.isArray(result.locations) ? result.locations[0]?.physicalLocation : undefined;
  const file = diagnosticArtifact(physical?.artifactLocation, run);
  const startLine = file ? diagnosticPosition(physical?.region?.startLine) : null;
  return { path: file, startLine, startColumn: startLine ? diagnosticPosition(physical?.region?.startColumn) : null };
}
function summaryFinding(value) {
  const file = diagnosticPath(value?.path);
  const startLine = file ? diagnosticPosition(value?.startLine) : null;
  return { ruleId: diagnosticRuleId(value?.ruleId),
    score: typeof value?.score === 'number' && Number.isFinite(value.score) && value.score >= 0 && value.score <= 10 ? value.score : null,
    severity: ['critical', 'high', 'error'].includes(value?.severity) ? value.severity : null,
    path: file, startLine, startColumn: startLine ? diagnosticPosition(value?.startColumn) : null };
}
function object(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), label + ' debe ser un objeto.');
  return value;
}
function integer(value, label) {
  assert.ok(Number.isSafeInteger(value) && value >= 0, label + ' debe ser un entero no negativo.');
  return value;
}
function string(value, label) {
  assert.ok(typeof value === 'string' && value.trim(), label + ' debe contener texto.');
  return value;
}
function score(value) {
  if (value === undefined) return null;
  assert.ok(typeof value === 'number' || (typeof value === 'string' && /^(?:\d+(?:\.\d+)?)$/.test(value)), 'security-severity no válido.');
  const number = Number(value);
  assert.ok(Number.isFinite(number) && number >= 0 && number <= 10, 'security-severity fuera de 0–10.');
  return number;
}
function level(value) {
  if (value === undefined) return undefined;
  assert.ok(levels.has(value), 'Nivel SARIF no válido.');
  return value;
}
function evaluateAudit(report, exitCode) {
  object(report, 'El informe npm audit');
  assert.equal(report.auditReportVersion, 2, 'Se requiere el formato npm audit v2.');
  assert.ok(!report.error, 'npm audit informó un error operativo.');
  integer(exitCode, 'El código de salida de npm audit');
  assert.ok(exitCode <= 255, 'Código de salida npm audit no válido.');
  const metadata = object(object(report.metadata, 'metadata').vulnerabilities, 'metadata.vulnerabilities');
  const counts = Object.fromEntries(severities.map(name => [name, integer(metadata[name], 'npm audit: ' + name)]));
  assert.equal(integer(metadata.total, 'npm audit: total'), Object.values(counts).reduce((a, b) => a + b, 0), 'Total npm audit inconsistente.');
  const entries = object(report.vulnerabilities, 'vulnerabilities');
  const observed = Object.fromEntries(severities.map(name => [name, 0]));
  const highPackages = [], criticalPackages = [];
  for (const [name, value] of Object.entries(entries)) {
    const vulnerability = object(value, 'Vulnerabilidad npm');
    assert.ok(severities.includes(vulnerability.severity), 'Severidad npm audit no válida.');
    observed[vulnerability.severity] += 1;
    if (vulnerability.severity === 'high') highPackages.push(name);
    if (vulnerability.severity === 'critical') criticalPackages.push(name);
  }
  // npm audit v2 deriva cada contador de estas mismas entradas; una discrepancia invalida el informe.
  assert.deepEqual(counts, observed, "Los contadores npm audit no coinciden con las vulnerabilidades.");
  return { kind: 'audit', status: counts.critical === 0 && exitCode === 0 ? 'passed' : 'blocked',
    exitCode, counts, highPackages: highPackages.sort().slice(0, 50), criticalPackages: criticalPackages.sort().slice(0, 50),
    reasons: [...(counts.critical ? ['Hay vulnerabilidades npm críticas.'] : []),
      ...(exitCode !== 0 ? ['npm audit devolvió un código de salida no cero: ' + exitCode + '.'] : [])] };
}
function component(value) {
  const tool = object(value, 'Componente SARIF');
  string(tool.name, 'Nombre de herramienta SARIF');
  // SARIF 2.1.0 §3.19.23 permite omitir rules; CodeQL puede definirlas en extensiones.
  const rules = tool.rules === undefined ? [] : tool.rules;
  assert.ok(Array.isArray(rules), 'Reglas SARIF no válidas.');
  const ids = new Set();
  for (const rule of rules) {
    object(rule, 'Regla SARIF'); string(rule.id, 'ID de regla SARIF');
    assert.ok(!ids.has(rule.id), 'Reglas SARIF duplicadas.'); ids.add(rule.id);
    if (rule.properties !== undefined) object(rule.properties, 'Propiedades de regla SARIF');
    if (rule.defaultConfiguration !== undefined) object(rule.defaultConfiguration, 'Configuración de regla SARIF');
    score(rule.properties?.['security-severity']);
    level(rule.defaultConfiguration?.level); level(rule.properties?.['problem.severity']);
  }
  return { ...tool, rules };
}
function resolveRule(result, driver, extensions) {
  const reference = result.rule === undefined ? {} : object(result.rule, 'Referencia de regla SARIF');
  const toolReference = reference.toolComponent === undefined ? {} : object(reference.toolComponent, 'Referencia de herramienta SARIF');
  let tool = driver;
  if (toolReference.index !== undefined) {
    integer(toolReference.index, 'Índice de herramienta SARIF'); tool = extensions[toolReference.index];
    assert.ok(tool, 'Referencia de herramienta SARIF inexistente.');
  } else if (toolReference.name !== undefined) {
    const matches = [driver, ...extensions].filter(item => item.name === toolReference.name);
    assert.equal(matches.length, 1, 'Nombre de herramienta SARIF ambiguo o inexistente.'); [tool] = matches;
  }
  const id = result.ruleId ?? reference.id;
  if (id !== undefined) string(id, 'ID de resultado SARIF');
  if (result.ruleId !== undefined && reference.id !== undefined) assert.equal(result.ruleId, reference.id, "Referencias de ID SARIF incompatibles.");
  if (result.ruleIndex !== undefined && reference.index !== undefined) assert.equal(result.ruleIndex, reference.index, "Referencias de índice SARIF incompatibles.");
  if (toolReference.name !== undefined) assert.equal(tool.name, toolReference.name, "Referencias de herramienta SARIF incompatibles.");
  const index = result.ruleIndex ?? reference.index;
  let rule;
  if (index !== undefined) {
    integer(index, 'Índice de regla SARIF'); rule = tool.rules[index];
    assert.ok(rule, 'Referencia de regla SARIF inexistente.');
    if (id !== undefined) assert.equal(rule.id, id, 'El ID y el índice de regla SARIF no coinciden.');
  } else {
    rule = tool.rules.find(item => item.id === id);
    assert.ok(rule, 'El resultado no referencia una regla SARIF válida.');
  }
  return rule;
}
function evaluateSarif(report) {
  object(report, 'El informe SARIF');
  assert.equal(report.version, '2.1.0', 'Se requiere SARIF 2.1.0.');
  assert.ok(Array.isArray(report.runs) && report.runs.length > 0, 'Faltan ejecuciones SARIF.');
  const counts = { results: 0, high: 0, critical: 0, errors: 0, blocked: 0 };
  const blockedRules = new Set();
  const blockedFindings = [];
  for (const run of report.runs) {
    object(run, 'Ejecución SARIF'); object(run.tool, 'Herramienta SARIF');
    const driver = component(run.tool.driver);
    assert.equal(driver.name, 'CodeQL', 'Se requiere un informe de CodeQL.');
    const extensionValues = run.tool.extensions === undefined ? [] : run.tool.extensions;
    assert.ok(Array.isArray(extensionValues), 'Extensiones SARIF no válidas.');
    const extensions = extensionValues.map(component);
    if (run.invocations !== undefined) {
      assert.ok(Array.isArray(run.invocations), 'Invocaciones SARIF no válidas.');
      for (const invocation of run.invocations) {
        object(invocation, 'Invocación SARIF');
        if (invocation.executionSuccessful !== undefined) assert.equal(typeof invocation.executionSuccessful, 'boolean', 'Estado de invocación SARIF no válido.');
        assert.ok(invocation.executionSuccessful !== false, 'El análisis SARIF no terminó correctamente.');
        for (const field of ['toolExecutionNotifications', 'toolConfigurationNotifications']) {
          if (invocation[field] === undefined) continue;
          assert.ok(Array.isArray(invocation[field]), 'Notificaciones SARIF no válidas.');
          for (const notification of invocation[field]) {
            object(notification, 'Notificación SARIF');
            assert.notEqual(level(notification.level), 'error', 'CodeQL informó un error de ejecución.');
          }
        }
      }
    }
    assert.ok(Array.isArray(run.results), 'Faltan resultados SARIF.');
    for (const result of run.results) {
      object(result, 'Resultado SARIF');
      const rule = resolveRule(result, driver, extensions);
      if (result.properties !== undefined) object(result.properties, 'Propiedades de resultado SARIF');
      const scores = [score(rule.properties?.['security-severity']), score(result.properties?.['security-severity'])].filter(value => value !== null);
      const severity = scores.length ? Math.max(...scores) : null;
      const error = [level(result.level), level(rule.defaultConfiguration?.level), level(rule.properties?.['problem.severity'])].includes('error');
      const blocked = (severity !== null && severity >= 7) || error;
      counts.results += 1;
      if (severity !== null && severity >= 9) counts.critical += 1;
      else if (severity !== null && severity >= 7) counts.high += 1;
      if (error) counts.errors += 1;
      if (blocked) {
        counts.blocked += 1;
        blockedRules.add(diagnosticRuleId(rule.id) ?? '(regla no publicable)');
        if (blockedFindings.length < maximumBlockedFindings) blockedFindings.push({
          ruleId: diagnosticRuleId(rule.id), score: severity,
          severity: severity !== null && severity >= 9 ? 'critical' : severity !== null && severity >= 7 ? 'high' : 'error',
          ...findingLocation(result, run),
        });
      }
    }
  }
  return { kind: 'sast', status: counts.blocked ? 'blocked' : 'passed', counts,
    blockedRules: [...blockedRules].sort().slice(0, 50), blockedFindings, blockedFindingsOmitted: counts.blocked - blockedFindings.length, reasons: counts.blocked ? ['CodeQL contiene hallazgos de seguridad ≥7 o nivel error.'] : [] };
}
function sarifFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) { assert.ok(target.endsWith('.sarif'), 'El informe debe ser SARIF.'); return [target]; }
  assert.ok(stat.isDirectory(), 'Directorio SARIF no válido.');
  const files = fs.readdirSync(target, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(target, entry.name);
    return entry.isDirectory() ? sarifFiles(file) : entry.isFile() && entry.name.endsWith('.sarif') ? [file] : [];
  }).sort();
  return files;
}
function evaluateSarifFiles(target) {
  const files = sarifFiles(target);
  assert.ok(files.length > 0, 'No se generó ningún informe SARIF.');
  const reports = files.map(file => evaluateSarif(JSON.parse(fs.readFileSync(file, 'utf8'))));
  const counts = { results: 0, high: 0, critical: 0, errors: 0, blocked: 0 };
  for (const report of reports) for (const key of Object.keys(counts)) counts[key] += report.counts[key];
  const blockedFindings = reports.flatMap(report => report.blockedFindings).slice(0, maximumBlockedFindings);
  return { kind: 'sast', status: reports.every(report => report.status === 'passed') ? 'passed' : 'blocked', counts, files: files.length,
    blockedFindings, blockedFindingsOmitted: counts.blocked - blockedFindings.length,
    blockedRules: [...new Set(reports.flatMap(report => report.blockedRules))].sort().slice(0, 50),
    reasons: reports.some(report => report.status !== 'passed') ? ['CodeQL contiene hallazgos de seguridad ≥7 o nivel error.'] : [] };
}
function writeResult(kind, report, directory = outputDirectory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, kind + '-gate.json'), JSON.stringify(report, null, 2) + '\n');
}
function display(value) { return String(value).replace(/[\r\n|\x60*<>\[\]]/g, '').slice(0, 160); }
function securitySummary(audit, sast, outcomes) {
  const required = ['install', 'audit', 'init', 'analyze', 'sast'];
  const problems = required.filter(name => outcomes[name] !== 'success');
  const countShape = (report, names) => report && report.counts && typeof report.counts === "object"
    && names.every(name => Number.isSafeInteger(report.counts[name]) && report.counts[name] >= 0);
  const auditCounts = countShape(audit, severities);
  const sastCounts = countShape(sast, ["results", "high", "critical", "errors", "blocked"]);
  for (const [name, report] of [["audit", audit], ["sast", sast]]) {
    if (!report || report.kind !== name || report.status !== 'passed') problems.push(name + '-report');
  }
  if (!auditCounts || audit.exitCode !== 0 || audit.counts.critical !== 0) problems.push("audit-report");
  if (!sastCounts || !Number.isSafeInteger(sast.files) || sast.files < 1 || sast.counts.blocked !== 0
    || sast.counts.high !== 0 || sast.counts.critical !== 0 || sast.counts.errors !== 0) problems.push("sast-report");
  const lines = ['## Seguridad móvil', '', '| Comprobación | Estado |', '|---|---|',
    ...required.map(name => '| ' + name + ' | ' + display(outcomes[name] || 'skipped') + ' |'), ''];
  if (auditCounts) {
    lines.push('npm audit: **' + audit.counts.critical + ' críticas**, **' + audit.counts.high + ' altas**.');
    if (Array.isArray(audit.highPackages) && audit.highPackages.length) lines.push('Dependencias con severidad alta: ' + audit.highPackages.map(display).join(', ') + '.');
    if (Array.isArray(audit.criticalPackages) && audit.criticalPackages.length) lines.push('Dependencias con severidad crítica: ' + audit.criticalPackages.map(display).join(', ') + '.');
    if (audit.counts.high > 0) lines.push('Las vulnerabilidades altas se reportan y siguen pendientes; este control no instala correcciones.');
    lines.push('');
  }
  if (sastCounts) lines.push('CodeQL: **' + sast.counts.critical + ' críticos**, **' + sast.counts.high + ' altos**, **' + sast.counts.errors + ' de nivel error**.',
    ...(Array.isArray(sast.blockedRules) && sast.blockedRules.length ? ['Reglas bloqueantes: ' + sast.blockedRules.slice(0, 50).map(value => diagnosticRuleId(value) ?? 'No publicable').join(', ') + '.'] : []), '');
  if (sastCounts && sast.counts.blocked > 0) {
    const findings = Array.isArray(sast.blockedFindings) ? sast.blockedFindings.slice(0, Math.min(maximumBlockedFindings, sast.counts.blocked)).map(summaryFinding) : [];
    if (findings.length) lines.push('| Regla | Score | Severidad | Ruta relativa | Línea | Columna |', '|---|---:|---|---|---:|---:|',
      ...findings.map(finding => '| ' + [finding.ruleId ?? 'No publicable', finding.score ?? '-', finding.severity ?? '-',
        finding.path ? '`' + finding.path + '`' : 'No publicable o ausente', finding.startLine ?? '-', finding.startColumn ?? '-'].join(' | ') + ' |'), '');
    const omitted = sast.counts.blocked - findings.length;
    if (omitted > 0) lines.push('Detalles omitidos del resumen por límite o ausencia de diagnóstico: ' + omitted + '.', '');
  }
  for (const report of [audit, sast]) if (Array.isArray(report?.reasons) && report.reasons.length) lines.push(...report.reasons.map(display), '');
  lines.push(problems.length ? '**Bloqueada**: ' + [...new Set(problems)].join(', ') + '.' :
    '**Aprobada para el análisis ejecutado**: cero dependencias críticas y cero hallazgos CodeQL ≥7 o nivel error.',
    '', 'El resultado no acredita pruebas dinámicas, pagos reales ni seguridad completa de la aplicación.', '');
  return { status: problems.length ? 'blocked' : 'passed', markdown: lines.join('\n') };
}
function readResult(kind, directory) {
  try { return JSON.parse(fs.readFileSync(path.join(directory, kind + '-gate.json'), 'utf8')); } catch { return null; }
}
function main(args = process.argv.slice(2), env = process.env) {
  const mode = args[0];
  assert.ok(['audit', 'sast', 'summary'].includes(mode), 'Usar audit, sast o summary.');
  if (mode === 'summary') {
    const directory = args[1] || outputDirectory;
    const outcomes = Object.fromEntries(['install', 'audit', 'init', 'analyze', 'sast'].map(name => [name, env[name.toUpperCase() + '_OUTCOME']]));
    const result = securitySummary(readResult('audit', directory), readResult('sast', directory), outcomes);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'summary.md'), result.markdown);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, result.markdown);
    console.log(result.markdown);
    return result.status === 'passed' ? 0 : 1;
  }
  let report;
  try {
    if (mode === 'audit') {
      const exit = args[2]; assert.ok(typeof exit === 'string' && /^\d+$/.test(exit), 'Falta el código real de salida de npm audit.');
      report = evaluateAudit(JSON.parse(fs.readFileSync(args[1] || path.join(outputDirectory, 'npm-audit.json'), 'utf8')), Number(exit));
    } else {
      assert.equal(env.ANALYZE_OUTCOME, 'success', 'CodeQL fue omitido, cancelado o falló.');
      report = evaluateSarifFiles(args[1] || path.join(outputDirectory, 'codeql'));
    }
  } catch {
    // assert y JSON.parse pueden incluir valores o fragmentos del informe en error.message.
    report = { kind: mode, status: 'invalid', reasons: [mode === 'sast'
      ? 'Informe SARIF ausente, inválido o análisis CodeQL sin éxito.'
      : 'Informe npm audit ausente, inválido o sin código real de salida.'] };
  }
  writeResult(mode, report);
  console.log(mode + ': ' + report.status);
  return report.status === 'passed' ? 0 : 1;
}
module.exports = { evaluateAudit, evaluateSarif, evaluateSarifFiles, securitySummary, main };
if (require.main === module) {
  try { process.exitCode = main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { describe, test, expect } = require('@jest/globals');
const { escapeMarkdownCell } = require('../scripts/report-markdown');
const { clientSummary } = require('../scripts/write-test-summary');
const { staticSummary } = require('../scripts/run-static-analysis');
const tick = String.fromCharCode(96);

// El parser HTML de jsdom verifica el texto representado por las entidades GFM6.2.
// Las tablas y su número de columnas se comprueban sobre los reportes públicos.
function renderedText(encoded) {
  const element = document.createElement('td');
  element.innerHTML = encoded;
  expect(element.childElementCount).toBe(0);
  return element.textContent;
}
function tableRow(summary, prefix, columns) {
  const row = summary.split('\n').find(line => line.startsWith('| ' + prefix));
  expect(row).toBeDefined();
  const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
  expect(cells).toHaveLength(columns);
  return cells.map(renderedText);
}
function staticReport(values = {}) {
  return { tool: 'ESLint', version: '9.39.5', context: {}, status: 'failure', exitCode: 1,
    errorCount: 1, warningCount: 0, diagnostics: [], command: 'eslint .', durationMs: 1, output: '', ...values };
}

describe('Texto literal de reportes Markdown compartido', () => {
  test.each([1, 2, 3])('%s barras junto a pipes y backticks se conservan sin crear delimitadores', count => {
    const value = 'antes' + '\\'.repeat(count) + '|' + tick + '|después';
    const encoded = escapeMarkdownCell(value);
    expect(encoded).not.toMatch(/[\\|\x60]/);
    expect(renderedText(encoded)).toBe(value);
  });
  test.each([
    '<img src=x onerror="alert(1)">', '</td></tr><script>alert(1)</script>',
    '&lt;script&gt; &#124; &amp;', '[enlace](https://example.test) ![imagen](data:text/html)',
    '**texto** _texto_ ~~texto~~ # título', 'áéíóú · 日本語 · 🏀',
  ])('HTML, entidades y sintaxis de entrada se representan como texto: %s', value => {
    const encoded = escapeMarkdownCell(value);
    expect(encoded).not.toMatch(/[<>|\x60\\\[\]*_~]/);
    expect(renderedText(encoded)).toBe(value);
  });
  test('codifica todos los metacaracteres en un pase y no reinterpreta entidades de entrada', () => {
    expect(escapeMarkdownCell('\\|' + tick + '<>&')).toBe('&#92;&#124;&#96;&#60;&#62;&#38;');
    expect(renderedText(escapeMarkdownCell('&#92;|'))).toBe('&#92;|');
    expect(escapeMarkdownCell('Catálogo 29 productos')).toBe('Catálogo 29 productos');
    expect(escapeMarkdownCell(0)).toBe('0');
  });
  test('saltos de línea y controles no pueden crear filas, bloques ni secuencias de terminal', () => {
    const value = 'uno\r\ndos\rtres\ncuatro\tfinal\u2028cinco\u2029seis\u0000siete\u001bfin';
    const encoded = escapeMarkdownCell(value);
    expect(encoded).not.toMatch(/[\u0000-\u001f\u007f\u2028\u2029]/);
    expect(renderedText(encoded)).toBe('uno dos tres cuatro final cinco seis siete fin');
  });
});

describe('Reporteros públicos conservan tablas, estados y diagnósticos', () => {
  test.each([1, 2, 3])('Jest conserva cuatro columnas con %s barras, HTML, pipes y backticks en un caso', count => {
    const fullName = 'caso ' + '\\'.repeat(count) + '|' + tick + '<img src=x onerror="alert(1)">\r\n[fin](https://example.test)';
    const report = { testResults: [{ name: '/app/__tests__/report.test.js',
      assertionResults: [{ fullName, status: 'failed' }] }] };
    const before = JSON.stringify(report);
    const summary = clientSummary(report, { TEST_OUTCOME: 'failure' });
    const row = tableRow(summary, 'Unitaria / componente |', 4);
    expect(row).toEqual(['Unitaria / componente', 'report.test.js', fullName.replace(/\r\n/g, ' '), 'failed']);
    expect(summary).toContain('1 casos · 0 aprobados · 1 fallidos');
    expect(summary).toContain('Ejecución Jest: **Fallida**');
    expect(summary).not.toContain('<img');
    expect(JSON.stringify(report)).toBe(before);
  });
  test('análisis estático conserva seis columnas, estado real y diagnóstico literal', () => {
    const version = '9.39.5\\|' + tick + '<b>versión</b>';
    const message = 'mensaje\\|' + tick + '<img src=x>\n**texto**';
    const report = staticReport({ version, diagnostics: [{ file: 'src/a\\|[id].tsx', line: 12, column: 7,
      severity: 'error', rule: 'test/rule', message }] });
    const before = JSON.stringify(report);
    const summary = staticSummary({ eslint: report }, { LINT_OUTCOME: 'failure' });
    expect(tableRow(summary, 'ESLint |', 6)).toEqual(['ESLint', version, 'Fallida', '1', '1', '0']);
    const diagnostic = summary.split('\n').find(line => line.startsWith('- src'));
    expect(renderedText(diagnostic)).toBe('- src/a\\|[id].tsx:12:7 · error · test/rule · ' + message.replace(/\n/g, ' '));
    expect(summary).toContain('Comando: ' + tick + 'eslint .' + tick);
    expect(summary).not.toContain('<img');
    expect(summary).not.toContain('<b>');
    expect(JSON.stringify(report)).toBe(before);
  });
  test('la salida preformateada existente permanece escapada y no puede cerrar su contenedor', () => {
    const output = '</pre><script>alert(1)</script>&lt;source&gt;\\|' + tick;
    const summary = staticSummary({ eslint: staticReport({ output }) }, { LINT_OUTCOME: 'failure' });
    expect(summary).toContain('<pre>&lt;/pre&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;lt;source&amp;gt;\\|' + tick + '</pre>');
    expect(summary).not.toContain('<script>');
    expect(summary.match(/<pre>/g)).toHaveLength(1);
    expect(summary.match(/<\/pre>/g)).toHaveLength(1);
  });
});

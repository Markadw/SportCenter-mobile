/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { beforeAll, test, expect, jest } = require('@jest/globals');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

const PATCHED_SHA256 = '2a6d60a839e2ca32adaeb002fd4ee840104f0230d7ad62422fa983e55d204267';
const LICENSE_SHA256 = 'ed7a9a0f74e43951b2520efe1a4349cb9ed5f3dff0b0f268e2e51a4d38df7ea4';
const decoderPath = require.resolve('decode-uri-component');
const sha256 = value => createHash('sha256').update(value).digest('hex');
let decode;

beforeAll(() => {
  // Fail before loading/calling a decoder or spawning any adversarial input if postinstall did not apply this exact reviewed patch.
  expect(sha256(fs.readFileSync(decoderPath))).toBe(PATCHED_SHA256);
  decode = require(decoderPath);
});

test('clean and production-only installs retain the pinned fail-closed patch hook', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  expect(manifest.scripts.postinstall).toBe('patch-package --error-on-fail');
  expect(manifest.dependencies['patch-package']).toBe('8.0.1');
  expect(manifest.devDependencies?.['patch-package']).toBeUndefined();
});

test('installed decoder keeps its CommonJS identity and the upstream MIT notice', () => {
  expect(typeof decode).toBe('function');
  expect(require('decode-uri-component/package.json').version).toBe('0.2.2');
  expect(sha256(fs.readFileSync(path.join(path.dirname(decoderPath), 'license')))).toBe(LICENSE_SHA256);
});

test.each([
  ['empty', '', ''], ['ASCII', 'sport-center', 'sport-center'],
  ['legacy plus', 'a+b', 'a b'], ['encoded plus', '%2B', '+'],
  ['mixed plus', 'a+%2B+b', 'a + b'], ['plus in malformed input', 'a+b%zz', 'a b%zz'],
  ['two-byte Unicode', '%C3%A1', 'á'], ['three-byte Unicode', '%E2%82%AC', '€'],
  ['four-byte Unicode', '%F0%9F%98%80', '😀'], ['lowercase UTF8', '%f0%9f%98%80', '😀'],
  ['literal Unicode', 'árbol+😀', 'árbol 😀'], ['UTF8 BOM', '%EF%BB%BF', '\uFEFF'],
  ['UTF16 BOM', '%FE%FF', '\uFFFD\uFFFD'], ['reverse UTF16 BOM', '%FF%FE', '\uFFFD\uFFFD'],
  ['invalid hex', '%zz', '%zz'], ['incomplete percent', '%', '%'], ['incomplete hex', '%A', '%A'],
  ['continuation byte', '%80', '%80'], ['truncated C2', '%C2', '\uFFFD'], ['lowercase truncated C2', '%c2', '%c2'],
  ['truncated three-byte UTF8', '%E2%82', '%E2%82'], ['overlong UTF8', '%C0%AF', '%C0%AF'],
  ['surrogate UTF8', '%ED%A0%80', '%ED%A0%80'], ['out-of-range UTF8', '%F4%90%80%80', '%F4%90%80%80'],
  ['mixed valid and invalid', '%E2%82%AC%zz%20ok', '€%zz ok'],
  ['decoded output is not rescanned', '%25C2%zz', '%C2%zz'], ['encoded percent is decoded once', '%2520', '%20'],
  ['BOM with valid and invalid bytes', '%FE%FF%C3%A9%zz', '\uFFFD\uFFFDé%zz'], ['NUL', '%00', '\u0000'],
])('patched real decoder: %s', (_name, input, expected) => {
  expect(decode(input)).toBe(expected);
});

test.each([undefined, null, 42, true, {}, [], Symbol('fixture')])('non-string input preserves the real TypeError contract: %p', value => {
  expect(() => decode(value)).toThrow(TypeError);
  expect(() => decode(value)).toThrow('Expected `encodedURI` to be of type `string`, got `' + typeof value + '`');
});

test('objects are rejected without implicit coercion', () => {
  const toString = jest.fn(() => '%41');
  expect(() => decode({ toString })).toThrow(TypeError);
  expect(toString).not.toHaveBeenCalled();
});

test('Router query-string resolves the patched callable and preserves query plus/Unicode round trips', () => {
  const routerLoad = createRequire(require.resolve('expo-router'));
  const queryPath = routerLoad.resolve('query-string');
  const queryLoad = createRequire(queryPath);
  expect(fs.realpathSync(queryLoad.resolve('decode-uri-component'))).toBe(fs.realpathSync(decoderPath));
  expect(sha256(fs.readFileSync(queryLoad.resolve('decode-uri-component')))).toBe(PATCHED_SHA256);
  const query = queryLoad(queryPath);
  const parsed = query.parse('name=a+b&symbol=%2B&text=%C3%A1&bad=%25C2%zz');
  expect(parsed).toEqual({ name: 'a b', symbol: '+', text: 'á', bad: '%C2%zz' });
  expect(query.parse(query.stringify(parsed))).toEqual(parsed);
});

// Instrument only the bounded child. Structural scan budgets catch the two old algorithms without executing either old version.
const childScript = String.raw`
const fs = require('node:fs'), { createHash } = require('node:crypto'), { performance } = require('node:perf_hooks');
const [file, expected, mode] = process.argv.slice(1);
if (createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) {
  process.stderr.write('PATCH_HASH_MISMATCH'); process.exit(64);
}
const decode = require(file), sizes = [2048, 8192, 32768], results = [];
for (const size of sizes) {
  let input;
  if (mode === 'exponential') input = '%C2'.repeat(size);
  else {
    const chunks = [];
    for (let i = 0; i < size; i++) chunks.push('%' + Math.floor(i / 256).toString(16).padStart(2, '0') + '%' + (i % 256).toString(16).padStart(2, '0') + 'x');
    input = chunks.join('') + '%zz';
  }
  const nativeDecode = globalThis.decodeURIComponent, nativeReplace = String.prototype.replace;
  let decodeCalls = 0, decodeChars = 0, replaceCalls = 0, replaceChars = 0, output, elapsedMs;
  globalThis.decodeURIComponent = value => {
    decodeCalls++; decodeChars += value.length;
    if (decodeChars > input.length * 8) throw Error('DECODE_SCAN_BUDGET');
    return nativeDecode(value);
  };
  String.prototype.replace = function (...args) {
    replaceCalls++; replaceChars += this.length;
    if (replaceChars > input.length * 4) throw Error('REPLACE_SCAN_BUDGET');
    return nativeReplace.apply(this, args);
  };
  try { const start = performance.now(); output = decode(input); elapsedMs = performance.now() - start; }
  finally { globalThis.decodeURIComponent = nativeDecode; String.prototype.replace = nativeReplace; }
  results.push({ size, inputLength: input.length, outputLength: output.length, suffixIntact: output.endsWith('%zz'), decodeCalls, decodeChars, replaceCalls, replaceChars, elapsedMs });
}
process.stdout.write(JSON.stringify(results));
`;

test.each(['exponential', 'quadratic'])('adversarial %s family scales within linear scan budgets in a hash-guarded child', mode => {
  const result = spawnSync(process.execPath, ['-e', childScript, decoderPath, PATCHED_SHA256, mode], {
    encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 65536,
    env: { SystemRoot: process.env.SystemRoot || process.env.SYSTEMROOT || '', NODE_ENV: 'test' },
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  const rows = JSON.parse(result.stdout);
  expect(rows.map(row => row.size)).toEqual([2048, 8192, 32768]);
  for (const row of rows) {
    expect(row.decodeCalls).toBeGreaterThan(0);
    expect(row.replaceCalls).toBeGreaterThanOrEqual(2);
    expect(row.decodeChars).toBeLessThanOrEqual(row.inputLength * 8);
    expect(row.replaceChars).toBeLessThanOrEqual(row.inputLength * 4);
    expect(row.outputLength).toBeLessThanOrEqual(row.inputLength);
    if (mode === 'exponential') expect(row.outputLength).toBe(row.size);
    else expect(row.suffixIntact).toBe(true);
  }
  const first = rows[0], last = rows.at(-1), inputGrowth = last.inputLength / first.inputLength;
  expect(last.replaceChars / first.replaceChars).toBeLessThanOrEqual(inputGrowth * 1.5);
  expect(last.decodeChars / first.decodeChars).toBeLessThanOrEqual(inputGrowth * 1.5);
});

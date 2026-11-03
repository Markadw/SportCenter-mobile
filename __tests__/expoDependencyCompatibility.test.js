/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { test, expect } = require('@jest/globals');
const { createRequire } = require('node:module');
const { PluginSchema, DevToolsPluginOutputSchema } = require('@expo/cli/build/src/start/server/DevToolsPlugin.schema');
const { createMCPDevToolsExtensionSchema } = require('@expo/cli/build/src/start/server/createMCPDevToolsExtensionSchema');
const { DevToolsPluginCliExtensionResults } = require('@expo/cli/build/src/start/server/DevToolsPluginCliExtensionResults');
const { fromZodError } = require('zod-validation-error/v4');

const plugin = () => ({
  packageName: '@fixture/public-plugin',
  packageRoot: '/private/public-plugin',
  bannerTitle: 'Public tools',
  cliExtensions: {
    description: 'Offline compatibility fixture',
    entryPoint: 'cli.js',
    commands: [
      { name: 'inspect', title: 'Inspect', environments: ['cli', 'mcp'], parameters: [
        { name: 'query', type: 'text' }, { name: 'limit', type: 'number' }, { name: 'includeAll', type: 'confirm' },
      ] },
      { name: 'ping', title: 'Ping', environments: ['mcp'] },
    ],
  },
});

// Resolve from each real consumer; a safe root copy must not hide a vulnerable nested copy.
test('CLI and both ESLint consumers actually resolve patched Zod4', () => {
  for (const consumer of ['@expo/cli', 'eslint-plugin-react-hooks', 'zod-validation-error/v4']) {
    const load = createRequire(require.resolve(consumer));
    const version = load('zod/package.json').version;
    expect(version).toMatch(/^4\.\d+\.\d+$/);
    const [, minor, patch] = version.split('.').map(Number);
    expect(minor > 6 || minor === 6 && patch >= 6).toBe(true);
    expect(typeof load('zod/v4').z.object).toBe('function');
  }
});

test('real CLI PluginSchema accepts descriptors and preserves readonly environments', () => {
  expect(PluginSchema.safeParse({ packageName: 'public-plugin', packageRoot: '/private' }).success).toBe(true);
  const parsed = PluginSchema.parse(plugin());
  expect(parsed.cliExtensions.commands[0].parameters).toHaveLength(3);
  expect(Object.isFrozen(parsed.cliExtensions.commands[0].environments)).toBe(true);
  expect(parsed.cliExtensions.commands[0].environments).toEqual(['cli', 'mcp']);
});

test('real CLI PluginSchema rejects missing fields and invalid nested enums', () => {
  const invalid = plugin();
  invalid.cliExtensions.commands[0].parameters[0].type = 'object';
  for (const value of [{ packageName: 'public-plugin' }, { packageName: '', packageRoot: '/private' }, invalid]) {
    const result = PluginSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error.issues.length).toBeGreaterThan(0);
  }
});

test('real CLI output schema accepts text and URL media without fetching them', () => {
  const value = [{ type: 'text', text: 'public fixture', level: 'info' },
    { type: 'image', url: 'https://example.invalid/image.png' },
    { type: 'audio', url: 'https://example.invalid/audio.mp3', text: 'fixture' }];
  expect(DevToolsPluginOutputSchema.parse(value)).toEqual(value);
});

test('real CLI output schema rejects malformed media, levels and container types', () => {
  for (const value of [[{ type: 'image', url: 'not a URL' }],
    [{ type: 'text', text: 'fixture', level: 'debug' }], { type: 'text', text: 'fixture', level: 'info' }]) {
    const result = DevToolsPluginOutputSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(Array.isArray(result.error.issues)).toBe(true);
    expect(result.error.issues.length).toBeGreaterThan(0);
  }
});

// Schema construction only: this does not install, enable or attest an MCP transport/converter.
test('real MCP schema factory accepts correctly typed command parameters', () => {
  const schema = createMCPDevToolsExtensionSchema(plugin());
  const value = { command: 'inspect', query: 'ball', limit: 3, includeAll: true };
  expect(schema.parse(value)).toEqual(value);
  expect(schema.safeParse({ command: 'ping' }).success).toBe(true);
});

test('real MCP schema stays strict and exposes issues for invalid commands and types', () => {
  const schema = createMCPDevToolsExtensionSchema(plugin());
  for (const value of [{ command: 'unknown' }, { command: 'inspect', limit: '3' },
    { command: 'inspect', includeAll: 'true' }, { command: 'inspect', extra: 'not allowed' }]) {
    const result = schema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error.issues.length).toBeGreaterThan(0);
    expect(result.error.issues.every(issue => typeof issue.message === 'string')).toBe(true);
  }
});

test('real MCP schema factory rejects plugins with no commands', () => {
  expect(() => createMCPDevToolsExtensionSchema({ packageName: 'public-plugin' })).toThrow(/has no commands/);
  const empty = plugin(); empty.cliExtensions.commands = [];
  expect(() => createMCPDevToolsExtensionSchema(empty)).toThrow(/has no commands/);
});

test('real CLI output error handler still formats error.issues instead of crashing', () => {
  const output = new DevToolsPluginCliExtensionResults();
  expect(output.parseOutputText(JSON.stringify([{ type: 'text', text: 'fixture', level: 'info' }])))
    .toEqual([{ type: 'text', text: 'fixture', level: 'info' }]);
  const invalid = output.parseOutputText(JSON.stringify([{ type: 'image', url: 'invalid' }]));
  expect(invalid).toHaveLength(1);
  expect(invalid[0]).toMatchObject({ type: 'text', level: 'error' });
  expect(invalid[0].text).toMatch(/^Invalid JSON: .+/);
});

test('real zod-validation-error/v4 formats errors from its resolved Zod version', () => {
  const load = createRequire(require.resolve('zod-validation-error/v4'));
  const { z } = load('zod/v4');
  const result = z.object({ count: z.number().int().min(1) }).safeParse({ count: 0 });
  expect(result.success).toBe(false);
  const formatted = fromZodError(result.error);
  expect(typeof formatted.message).toBe('string');
  expect(formatted.message).toContain('count');
  expect(formatted.toString()).toContain(formatted.message);
});

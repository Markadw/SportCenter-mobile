'use strict';
const test = globalThis.test || require('node:test').test;
const assert = require('node:assert/strict');
const { createSandbox, planSandbox, firewallPlan, assertFirstOwnerRule, assertChainRules,
  parseRejectCounter, privatePath, secretSubset, capturedRun, SandboxError, SANDBOX_ERROR_CODES,
  safeSandboxDiagnostic, isSafeSandboxDiagnostic, UID_PROCESS_WRAPPER } = require(require('node:path').join(process.env.ACCOUNT_PREP_DIR || require('node:path').join(__dirname, '..', 'scripts'), 'account-sandbox.cjs'));

function mockRuntime(config = {}) {
  const calls = [], rules = new Map(), output = { iptables: ['-A OUTPUT -j ACCEPT'], ip6tables: ['-A OUTPUT -j ACCEPT'] };
  const files = new Map();
  const state = { root: null, home: null, username: null, owner: 1001, counter: 0, readyProbe: false, ...config };
  const success = stdout => ({ stdout: stdout ?? '', stderr: '', exitCode: 0 });
  const run = async (file, args, options) => {
    calls.push({ file, args: [...args], options: { ...options, env: { ...options.env } } });
    assert.equal(options.shell, false);
    assert.ok(Number.isInteger(options.timeout) && options.timeout > 0 && options.timeout <= 600000);
    let tool = file, a = args;
    if (file === 'sudo') { const split = args.indexOf('--'); assert.ok(split >= 0); tool = args[split + 1]; a = args.slice(split + 2); }
    if (a[0] === '-e' && a[1] === UID_PROCESS_WRAPPER) {
      assert.ok(!args.some(arg => arg === '-D' || arg.startsWith('--chdir')));
      const split = a.indexOf('--', 2);
      state.wrapperCwd = a[split + 1];
      tool = a[split + 2]; a = a.slice(split + 3);
    }
    if (tool === '/bin/sh') return success('/tools/' + a[a.length - 1] + '\n');
    if (tool.startsWith('/tools/')) tool = tool.slice('/tools/'.length);
    if (state.failTool === tool) return { stdout: '', stderr: 'DO_NOT_PRINT', exitCode: 2 };
    if (a.includes('--help') || a.includes('--version') || tool === 'true') return success();
    if (tool === 'realpath') {
      const target = a[a.length - 1];
      if (state.escapedPath === target) return success('/outside/private-file\n');
      return success(target + '\n');
    }
    if (tool === 'mkdir') {
      if (!state.root) { state.root = a[a.indexOf('--') + 1]; state.home = state.root + '/home'; }
      return success();
    }
    if (tool === 'stat') return success('8:' + (state.replacedRoot ? '999' : '42') + ':' + state.owner + ':700');
    if (tool === 'useradd') { state.username = a[a.length - 1]; return success(); }
    if (tool === 'getent') return success(state.username + ':x:200001:200002::' + state.home + ':/bin/false\n');
    if (tool === 'id') return success(a.length === 1 ? '1001\n' : a[0] === '-u' ? '200001\n' : '200002\n');
    if (tool === 'chown') { state.owner = 200001; return success(); }
    if (tool === 'pkill') return { stdout: '', stderr: '', exitCode: 1 };
    if (tool === 'pgrep') return state.processesRemain ? success('9001\n') : { stdout: '', stderr: '', exitCode: 1 };
    if (tool === 'rm' || tool === 'userdel') return success();
    if (tool === 'install') { files.set(a[a.length - 1], options.input); return success(); }
    if (tool === 'cat') return success(files.get(a[a.length - 1]) ?? '<testsuites/>');
    if (tool === 'iptables' || tool === 'ip6tables') {
      const action = a[2], chain = a[3];
      if (action === '-N') { rules.set(chain, []); return success(); }
      if (action === '-A') { rules.get(chain).push(a.slice(2).join(' ')); return success(); }
      if (action === '-I') { output[tool].unshift('-A OUTPUT ' + a.slice(5).join(' ')); return success(); }
      if (action === '-S' && chain === 'OUTPUT') {
        const lines = [...output[tool]];
        if (state.displaceV6 && tool === 'ip6tables') lines.unshift('-A OUTPUT -j ACCEPT');
        return success('-P OUTPUT ACCEPT\n' + lines.join('\n') + '\n');
      }
      if (action === '-S') return success('-N ' + chain + '\n' + rules.get(chain).join('\n') + '\n');
      if (action === '-L') return success('Chain ' + chain + '\nnum pkts bytes target prot opt in out source destination\n'
        + '1 0 0 ACCEPT all -- * * 0.0.0.0/0 127.0.0.1\n2 ' + state.counter + ' 60 REJECT all -- * * 0.0.0.0/0 0.0.0.0/0 reject-with icmp-port-unreachable\n');
      if (action === '-D') { output[tool] = output[tool].filter(line => line !== '-A OUTPUT ' + a.slice(4).join(' ')); return success(); }
      if (action === '-F') { rules.set(chain, []); return success(); }
      if (action === '-X') { rules.delete(chain); return success(); }
    }
    if (a[0] === '-e' && a[1].includes('192.0.2.1')) {
      if (!state.noCounterIncrement) state.counter += 1;
      return success('NEGATIVE_BLOCKED');
    }
    if (a[0] === '-e' && a[1].includes('127.0.0.1')) {
      state.readyProbe = true;
      return state.noAdb ? { stdout: 'ADB_UNAVAILABLE', stderr: '', exitCode: 1 } : success('ADB_OK');
    }
    if (tool === 'maestro') {
      assert.equal(state.readyProbe, true);
      return { stdout: 'private stdout', stderr: 'private stderr', exitCode: state.maestroExit ?? 0 };
    }
    if (tool === 'fixture-command') return success('fixture');
    throw new Error('Unexpected mocked command');
  };
  return { run, calls, state, files, output, rules };
}
function setup(mock, env = {}) {
  return createSandbox({ runnerTemp: '/runner/tmp', runId: 'private-123', run: mock.run,
    env: { PATH: '/usr/bin:/bin', ...env }, platform: 'linux', nodePath: '/usr/bin/node' });
}
function command(call) {
  const i = call.args.indexOf('--');
  let tool = call.file === 'sudo' ? call.args[i + 1] : call.file;
  const args = call.file === 'sudo' ? call.args.slice(i + 2) : call.args;
  if (args[0] === '-e' && args[1] === UID_PROCESS_WRAPPER) tool = args[args.indexOf('--', 2) + 2];
  return tool.replace(/^\/tools\//, '');
}
function failCode(code) { return error => error.code === code && error.message === code && !('cause' in error); }

test('Windows fails before subprocess or network work', async () => {
  let calls = 0;
  await assert.rejects(createSandbox({ platform: 'win32', run: async () => { calls += 1; } }), failCode('LINUX_SANDBOX_REQUIRED'));
  assert.equal(calls, 0);
});

test('pure plans keep targets in one new directory and only permit exact loopback hosts', () => {
  const p = planSandbox({ runnerTemp: '/runner/tmp', runId: 'private-1', nonce: '0123456789abcdef' });
  assert.equal(p.root, '/runner/tmp/account-sandbox-private-1-0123456789abcdef');
  assert.ok(p.username.length <= 32);
  assert.throws(() => planSandbox({ runnerTemp: '/', runId: 'x', nonce: '0123456789abcdef' }), failCode('RUNNER_TEMP_INVALID'));
  assert.throws(() => planSandbox({ runnerTemp: '/runner/tmp', runId: '../escape', nonce: '0123456789abcdef' }), failCode('RUN_ID_INVALID'));
  assert.ok(firewallPlan(200001, p.chain4, 4).allow.includes('127.0.0.1/32'));
  assert.ok(firewallPlan(200001, p.chain6, 6).allow.includes('::1/128'));
  assert.throws(() => privatePath(p.root, '/outside/flow.yaml'), failCode('PRIVATE_PATH_INVALID'));
  assert.throws(() => privatePath(p.root, '../outside'), failCode('PRIVATE_PATH_INVALID'));
});

test('strict firewall readers reject preceding accepts, extra rules and missing counters', () => {
  const p = firewallPlan(200001, 'ASC_0123456789abcdef_4', 4);
  const line = '-A OUTPUT -m owner --uid-owner 200001 -j ' + p.chain;
  assertFirstOwnerRule('-P OUTPUT ACCEPT\n' + line + '\n-A OUTPUT -j ACCEPT', 200001, p.chain);
  assert.throws(() => assertFirstOwnerRule('-A OUTPUT -j ACCEPT\n' + line, 200001, p.chain), failCode('FIREWALL_OWNER_NOT_FIRST'));
  assertChainRules(p.allow.join(' ') + '\n' + p.reject.join(' '), p);
  assert.throws(() => assertChainRules(p.allow.join(' ') + '\n-A ' + p.chain + ' -j ACCEPT\n' + p.reject.join(' '), p), failCode('FIREWALL_CHAIN_MISMATCH'));
  assert.equal(parseRejectCounter('2 12 123 REJECT all -- * * 0.0.0.0/0 0.0.0.0/0'), 12);
  assert.throws(() => parseRejectCounter('1 0 0 ACCEPT all -- * * anywhere anywhere'), failCode('REJECT_COUNTER_INVALID'));
});

test('setup probes before secrets, isolates env/cwd, and keeps all Maestro outputs private', async () => {
  const m = mockRuntime();
  const password = 'private-%s-ñ-🔐\nvalue';
  const sb = await setup(m, { MAESTRO_ACCOUNT_PASSWORD: password, HTTPS_PROXY: 'http://bad',
    JAVA_TOOL_OPTIONS: '-javaagent:bad', JDK_JAVA_OPTIONS: '-Dhttp.proxyHost=bad', MAESTRO_API_KEY: 'unrelated',
    ANDROID_HOME: '/installed/android-sdk', ANDROID_SDK_ROOT: '/installed/android-sdk', JAVA_HOME: '/installed/java' });
  assert.equal(sb.uid, 200001); assert.equal(sb.gid, 200002);
  assert.deepEqual(sb.probes.ipv4RejectedWithCounter, true);
  assert.ok(m.calls.every(call => !Object.values(call.options.env).includes(password)));
  const flow = await sb.createPrivateFile('work/login.yaml', 'appId: example\n---\n- inputText: ${MAESTRO_ACCOUNT_PASSWORD}\n');
  assert.equal(flow, sb.work + '/login.yaml');
  const result = await sb.runMaestro('emulator-5554', ['test', '--format', 'junit', '--output', sb.root + '/CASE.xml', flow],
    { secretEnv: { MAESTRO_ACCOUNT_PASSWORD: password } });
  assert.equal(result.stdout, 'private stdout'); assert.equal(result.stderr, 'private stderr');
  assert.equal(result.outputFile, sb.root + '/CASE.xml');
  const call = m.calls.find(call => command(call) === 'maestro');
  assert.ok(call.args.includes(sb.work));
  assert.ok(call.args.includes(UID_PROCESS_WRAPPER));
  assert.ok(!call.args.some(arg => arg === '-D' || arg.startsWith('--chdir')));
  assert.equal(call.options.env.HOME, sb.home);
  assert.equal(call.options.env.MAESTRO_ACCOUNT_PASSWORD, password);
  assert.equal(call.options.env.MAESTRO_CLI_NO_ANALYTICS, '1');
  assert.equal(call.options.env.MAESTRO_ACCOUNT_EMAIL, undefined);
  assert.equal(call.options.env.ANDROID_HOME, '/installed/android-sdk');
  assert.equal(call.options.env.ANDROID_SDK_ROOT, '/installed/android-sdk');
  assert.equal(call.options.env.JAVA_HOME, '/installed/java');
  assert.ok(call.args.some(arg => arg.startsWith('--preserve-env=')
    && arg.includes('ANDROID_HOME') && arg.includes('ANDROID_SDK_ROOT')));
  for (const key of ['HTTPS_PROXY', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', 'MAESTRO_API_KEY']) assert.equal(call.options.env[key], undefined);
  assert.ok(call.args.every(arg => !arg.includes(password)));
  assert.ok(result.debugOutputDir.startsWith(sb.artifacts + '/'));
  assert.ok(result.testOutputDir.startsWith(sb.artifacts + '/'));
  assert.equal(await sb.readPrivateFile('CASE.xml'), '<testsuites/>');
  await sb.cleanup();
  const kill = m.calls.findIndex(call => command(call) === 'pkill' && !call.args.includes('--help'));
  const remove = m.calls.findIndex(call => call.args.includes('-D'));
  const rm = m.calls.findIndex(call => command(call) === 'rm' && call.args.includes('-rf'));
  assert.ok(kill >= 0 && remove > kill && rm > remove);
  const deleted = m.calls[rm].args;
  assert.equal(deleted[deleted.length - 1], sb.root);
  assert.ok(deleted.includes('--one-file-system'));
  assert.ok(!m.calls.some(call => command(call) === 'chmod'));
  assert.equal(m.rules.size, 0);
  const count = m.calls.length; await sb.cleanup(); assert.equal(m.calls.length, count);
});

test('negative TCP error without a REJECT counter increment fails closed and cleans only its resources', async () => {
  const m = mockRuntime({ noCounterIncrement: true });
  await assert.rejects(setup(m), failCode('EGRESS_REJECTION_UNPROVEN'));
  assert.equal(m.state.readyProbe, false);
  assert.equal(m.rules.size, 0);
  assert.ok(m.calls.some(call => command(call) === 'userdel' && !call.args.includes('--help')));
});

test('IPv6 displacement and unavailable ADB both prevent exposing a ready sandbox', async () => {
  for (const [config, code] of [[{ displaceV6: true }, 'FIREWALL_OWNER_NOT_FIRST'], [{ noAdb: true }, 'PRIVATE_ADB_UNREACHABLE']]) {
    const m = mockRuntime(config);
    await assert.rejects(setup(m), failCode(code));
    assert.equal(m.rules.size, 0);
  }
});

test('missing firewall tool fails before creating account or private root', async () => {
  const m = mockRuntime({ failTool: 'ip6tables' });
  await assert.rejects(setup(m), failCode('FIREWALL_UNAVAILABLE'));
  assert.equal(m.state.root, null);
  assert.equal(m.state.username, null);
});

test('invalid Android SDK environment fails before subprocess work', async () => {
  for (const [key, value] of [['ANDROID_HOME', 'relative/sdk'], ['ANDROID_SDK_ROOT', '/sdk/../outside'],
    ['ANDROID_HOME', '/sdk\ninvalid']]) {
    const m = mockRuntime();
    await assert.rejects(setup(m, { [key]: value }), failCode('SANDBOX_SDK_PATH_INVALID'));
    assert.equal(m.calls.length, 0);
  }
});

test('caller cannot pass arbitrary env, unsafe cwd, secrets in argv or public output paths', async () => {
  const m = mockRuntime(), sb = await setup(m);
  const flow = await sb.createPrivateFile('work/check.yaml', 'appId: example\n---\n- launchApp\n');
  await assert.rejects(sb.runAs(['fixture-command'], { HTTP_PROXY: 'bad' }), failCode('PRIVATE_ENV_KEY_REJECTED'));
  await assert.rejects(sb.runAs(['fixture-command', 'password-value'], { MAESTRO_ACCOUNT_PASSWORD: 'password-value' }), failCode('SECRET_IN_ARGV_REJECTED'));
  await assert.rejects(sb.runMaestro('emulator-5554', ['test', flow], { cwd: '/outside' }), failCode('PRIVATE_CWD_INVALID'));
  await assert.rejects(sb.runMaestro('emulator-5554', ['test', '--output', '/public/report.xml', flow]), failCode('PRIVATE_PATH_INVALID'));
  await assert.rejects(sb.runMaestro('emulator-5554', ['test', '--analyze', flow]), failCode('PRIVATE_MAESTRO_ARGV_INVALID'));
  await assert.rejects(sb.runMaestro('emulator-5554', ['test', '-e', 'PASSWORD=value', flow]), failCode('PRIVATE_MAESTRO_ARGV_INVALID'));
  assert.deepEqual(secretSubset({}), {});
  await sb.cleanup();
});

test('firewall order is rechecked before every credential-bearing child', async () => {
  const m = mockRuntime(), sb = await setup(m);
  m.state.displaceV6 = true;
  await assert.rejects(sb.runAs(['fixture-command'], { MAESTRO_ACCOUNT_EMAIL: 'dedicated@example.invalid' }), failCode('FIREWALL_OWNER_NOT_FIRST'));
  assert.ok(!m.calls.some(call => command(call) === 'fixture-command'));
  await sb.cleanup();
});

test('changed root identity or escaping file symlink is never recursively deleted/read', async () => {
  const m = mockRuntime(), sb = await setup(m);
  m.state.escapedPath = sb.root + '/work/escape.xml';
  await assert.rejects(sb.readPrivateFile('work/escape.xml'), failCode('PRIVATE_PATH_ESCAPED'));
  assert.ok(!m.calls.some(call => command(call) === 'cat' && !call.args.includes('--help')));
  m.state.replacedRoot = true;
  await assert.rejects(sb.cleanup(), failCode('PRIVATE_ROOT_CHANGED'));
  assert.ok(!m.calls.some(call => command(call) === 'rm' && call.args.includes('-rf')));
});

test('cleanup retains firewall if UID processes cannot be proven stopped', async () => {
  const m = mockRuntime(), sb = await setup(m);
  m.state.processesRemain = true;
  await assert.rejects(sb.cleanup(), failCode('SANDBOX_PROCESSES_REMAIN'));
  assert.ok(!m.calls.some(call => call.args.includes('-D')));
  m.state.processesRemain = false;
  await sb.cleanup();
});

test('captured executor buffers stdout/stderr and bounds subprocess lifetime without network', async () => {
  const result = await capturedRun(process.execPath, ['-e', "process.stdout.write('out');process.stderr.write('err');process.exitCode=3"],
    { env: process.env, timeout: 3000 });
  assert.equal(result.stdout, 'out'); assert.equal(result.stderr, 'err'); assert.equal(result.exitCode, 3);
  const timed = await capturedRun(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { env: process.env, timeout: 25 });
  assert.equal(timed.timedOut, true); assert.notEqual(timed.exitCode, 0);
});
test('captured executor returns exit1 normally for pgrep/pkill absence semantics', async () => {
  const result = await capturedRun(process.execPath, ['-e', 'process.exitCode=1'], { env: process.env, timeout: 3000 });
  assert.equal(result.exitCode, 1); assert.equal(result.timedOut, false); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
});

test('setup diagnostic preserves first failure when cleanup also fails', async () => {
  const m = mockRuntime({ noCounterIncrement: true });
  const originalRun = m.run;
  m.run = async (file, args, options) => args.includes('-D')
    ? { stdout: 'private cleanup output', stderr: 'private cleanup error', exitCode: 2 }
    : originalRun(file, args, options);
  let caught;
  try { await setup(m); } catch (error) { caught = error; }
  assert.equal(caught.code, 'SANDBOX_SETUP_CLEANUP_FAILED');
  const diagnostic = safeSandboxDiagnostic(caught);
  assert.deepEqual(diagnostic, { sandboxCode: 'EGRESS_REJECTION_UNPROVEN',
    cleanupCode: 'SANDBOX_FIREWALL_CLEANUP_FAILED', cleanupConfirmed: false });
  assert.equal(isSafeSandboxDiagnostic(diagnostic), true);
  assert.ok(!JSON.stringify(diagnostic).includes('private cleanup'));
  diagnostic.sandboxCode = 'changed';
  assert.equal(safeSandboxDiagnostic(caught).sandboxCode, 'EGRESS_REJECTION_UNPROVEN');
});

test('setup diagnostics confirm cleanup only from actual cleanup or no resources created', async () => {
  const m = mockRuntime({ noCounterIncrement: true });
  let setupError;
  try { await setup(m); } catch (error) { setupError = error; }
  assert.deepEqual(safeSandboxDiagnostic(setupError), { sandboxCode: 'EGRESS_REJECTION_UNPROVEN',
    cleanupCode: null, cleanupConfirmed: true });
  let validationError;
  try { await createSandbox({ platform: 'win32' }); } catch (error) { validationError = error; }
  assert.deepEqual(safeSandboxDiagnostic(validationError), { sandboxCode: 'LINUX_SANDBOX_REQUIRED',
    cleanupCode: null, cleanupConfirmed: true });
});

test('public diagnostic vocabulary rejects arbitrary codes, extra PII and untrusted metadata', () => {
  const privateText = 'secret-account-password@example.invalid';
  const error = new SandboxError(privateText);
  error.stdout = privateText; error.stderr = privateText;
  error.diagnostic = { sandboxCode: privateText, cleanupCode: privateText, cleanupConfirmed: true };
  const fallback = { sandboxCode: 'SANDBOX_SETUP_FAILED', cleanupCode: null, cleanupConfirmed: false };
  assert.deepEqual(safeSandboxDiagnostic(error), fallback);
  assert.ok(!JSON.stringify(safeSandboxDiagnostic(error)).includes(privateText));
  assert.deepEqual(safeSandboxDiagnostic({ code: 'PRIVATE_ADB_UNREACHABLE', message: privateText,
    diagnostic: { sandboxCode: 'PRIVATE_ADB_UNREACHABLE', cleanupCode: null, cleanupConfirmed: true } }),
  { sandboxCode: 'PRIVATE_ADB_UNREACHABLE', cleanupCode: null, cleanupConfirmed: false });
  assert.equal(Object.isFrozen(SANDBOX_ERROR_CODES), true);
  assert.equal(isSafeSandboxDiagnostic({ sandboxCode: null, cleanupCode: null, cleanupConfirmed: true }), true);
  assert.equal(isSafeSandboxDiagnostic(fallback), true);
  assert.equal(isSafeSandboxDiagnostic({ ...fallback, sandboxCode: privateText }), false);
  assert.equal(isSafeSandboxDiagnostic({ ...fallback, message: privateText }), false);
  assert.equal(isSafeSandboxDiagnostic({ ...fallback, cleanupCode: 'SUDO_UNAVAILABLE', cleanupConfirmed: true }), false);
  assert.equal(isSafeSandboxDiagnostic({ sandboxCode: null, cleanupCode: null, cleanupConfirmed: false }), false);
  const accessor = Object.defineProperty({}, 'code', { get() { throw new Error(privateText); } });
  assert.deepEqual(safeSandboxDiagnostic(accessor), fallback);
  const unsafeObject = { sandboxCode: 'SANDBOX_SETUP_FAILED', cleanupCode: null };
  Object.defineProperty(unsafeObject, 'cleanupConfirmed', { get() { throw new Error(privateText); } });
  assert.equal(isSafeSandboxDiagnostic(unsafeObject), false);
});

test('fixed UID wrapper changes cwd, passes literal argv and preserves child exit code without a shell', async () => {
  const literal = 'literal; no-shell $(not-executed)';
  const result = await capturedRun(process.execPath, ['-e', UID_PROCESS_WRAPPER, '--', process.cwd(), process.execPath,
    '-e', 'process.stdout.write(JSON.stringify({cwd:process.cwd(),arg:process.argv[1]}));process.stderr.write("private");process.exitCode=7',
    '--', literal], { env: process.env, timeout: 3000 });
  assert.equal(result.exitCode, 7);
  assert.deepEqual(JSON.parse(result.stdout), { cwd: process.cwd(), arg: literal });
  assert.equal(result.stderr, 'private');
});

test('fixed UID wrapper rejects invalid cwd and argv without error messages', async () => {
  for (const args of [['relative-cwd', process.execPath], [process.cwd(), 'relative-executable'], [process.cwd()]]) {
    const result = await capturedRun(process.execPath, ['-e', UID_PROCESS_WRAPPER, '--', ...args],
      { env: process.env, timeout: 3000 });
    assert.equal(result.exitCode, 125);
    assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  }
});

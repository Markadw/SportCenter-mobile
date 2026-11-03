'use strict';

// Private Linux-only runner. Never log commands, environments, child output, or causes.
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path').posix;

const MAX_OUTPUT = 8 * 1024 * 1024;
const CONTROL_TIMEOUT = 15000;
const SECRET_KEYS = Object.freeze(['MAESTRO_ACCOUNT_EMAIL', 'MAESTRO_ACCOUNT_PASSWORD']);
const PATH_DEFAULT = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
// Explicit publication vocabulary. Never turn arbitrary errors or child output into report fields.
const SANDBOX_ERROR_CODES = Object.freeze([
  'CALLER_UID_UNAVAILABLE', 'EGRESS_REJECTION_UNPROVEN', 'FIREWALL_ALLOW_FAILED',
  'FIREWALL_CHAIN_CREATE_FAILED', 'FIREWALL_CHAIN_MISMATCH', 'FIREWALL_INCOMPLETE',
  'FIREWALL_INSERT_FAILED', 'FIREWALL_INSPECTION_FAILED', 'FIREWALL_OUTPUT_INVALID',
  'FIREWALL_OWNER_DUPLICATE', 'FIREWALL_OWNER_NOT_FIRST', 'FIREWALL_PLAN_INVALID',
  'FIREWALL_REJECT_FAILED', 'FIREWALL_UNAVAILABLE', 'LINUX_SANDBOX_REQUIRED', 'NONCE_INVALID',
  'PRIVATE_ADB_UNREACHABLE', 'PRIVATE_ARGV_INVALID', 'PRIVATE_CWD_INVALID', 'PRIVATE_DEVICE_INVALID',
  'PRIVATE_DIRECTORIES_CREATE_FAILED', 'PRIVATE_ENV_INVALID', 'PRIVATE_ENV_KEY_REJECTED',
  'PRIVATE_ENV_VALUE_INVALID', 'PRIVATE_EXECUTABLE_INVALID', 'PRIVATE_EXECUTABLE_UNAVAILABLE',
  'PRIVATE_FILE_READ_FAILED', 'PRIVATE_FILE_TOO_LARGE', 'PRIVATE_FILE_WRITE_FAILED',
  'PRIVATE_MAESTRO_ARGV_INVALID', 'PRIVATE_MAESTRO_FLOW_REQUIRED', 'PRIVATE_MAESTRO_FORMAT_INVALID',
  'PRIVATE_OWNERSHIP_FAILED', 'PRIVATE_PATH_ESCAPED', 'PRIVATE_PATH_INVALID', 'PRIVATE_PATH_UNAVAILABLE',
  'PRIVATE_ROOT_CHANGED', 'PRIVATE_ROOT_CREATE_FAILED', 'PRIVATE_ROOT_IDENTITY_INVALID',
  'PRIVATE_ROOT_STAT_FAILED', 'REJECT_COUNTER_INVALID', 'REJECT_COUNTER_UNAVAILABLE',
  'RUNNER_TEMP_INVALID', 'RUNNER_TEMP_UNAVAILABLE', 'RUN_ID_INVALID',
  'SANDBOX_ACCOUNT_CHANGED', 'SANDBOX_ACCOUNT_CLEANUP_FAILED', 'SANDBOX_ACCOUNT_CREATE_FAILED',
  'SANDBOX_BUSY', 'SANDBOX_CONFIG_INVALID', 'SANDBOX_FIREWALL_CLEANUP_FAILED',
  'SANDBOX_GID_UNAVAILABLE', 'SANDBOX_NODE_PATH_INVALID', 'SANDBOX_NOT_READY',
  'SANDBOX_PRIVATE_CLEANUP_FAILED', 'SANDBOX_PROCESSES_REMAIN', 'SANDBOX_PROCESS_INSPECTION_FAILED',
  'SANDBOX_PROCESS_KILL_FAILED', 'SANDBOX_ROOT_INVALID', 'SANDBOX_SDK_PATH_INVALID',
  'SANDBOX_SETUP_CLEANUP_FAILED', 'SANDBOX_SETUP_FAILED', 'SANDBOX_SUBPROCESS_FAILED',
  'SANDBOX_TOOL_UNAVAILABLE', 'SANDBOX_UID_NOT_DISTINCT', 'SANDBOX_UID_NOT_EMPTY',
  'SANDBOX_UID_UNAVAILABLE', 'SECRETS_BEFORE_PROBES', 'SECRET_IN_ARGV_REJECTED',
  'SUBPROCESS_OUTPUT_LIMIT', 'SUBPROCESS_RESULT_INVALID', 'SUBPROCESS_TIMEOUT_INVALID',
  'SUDO_UNAVAILABLE', 'UID_INVALID',
]);
const sandboxCodeSet = new Set(SANDBOX_ERROR_CODES);
const sandboxDiagnostics = new WeakMap();
function ownData(value, key) {
  try {
    if (!value || !['object', 'function'].includes(typeof value)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch { return undefined; }
}
function fixedSandboxCode(error) {
  const code = ownData(error, 'code');
  return typeof code === 'string' && sandboxCodeSet.has(code) ? code : 'SANDBOX_SETUP_FAILED';
}
function isSafeSandboxDiagnostic(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 3 || !keys.every(key => ['sandboxCode', 'cleanupCode', 'cleanupConfirmed'].includes(key))) return false;
    const sandboxCode = ownData(value, 'sandboxCode'), cleanupCode = ownData(value, 'cleanupCode');
    const cleanupConfirmed = ownData(value, 'cleanupConfirmed');
    if (!(sandboxCode === null || typeof sandboxCode === 'string' && sandboxCodeSet.has(sandboxCode))
      || !(cleanupCode === null || typeof cleanupCode === 'string' && sandboxCodeSet.has(cleanupCode))
      || typeof cleanupConfirmed !== 'boolean') return false;
    if (cleanupConfirmed && cleanupCode !== null) return false;
    if (sandboxCode === null && (cleanupCode !== null || cleanupConfirmed !== true)) return false;
    return true;
  } catch { return false; }
}
function rememberSandboxDiagnostic(error, diagnostic) {
  // All callers construct this object from fixed codes and locally observed cleanup state.
  if (error && ['object', 'function'].includes(typeof error) && isSafeSandboxDiagnostic(diagnostic)) {
    sandboxDiagnostics.set(error, Object.freeze(diagnostic));
  }
  return error;
}
function safeSandboxDiagnostic(error) {
  const diagnostic = error && ['object', 'function'].includes(typeof error) ? sandboxDiagnostics.get(error) : undefined;
  return diagnostic ? { ...diagnostic } : {
    sandboxCode: fixedSandboxCode(error), cleanupCode: null, cleanupConfirmed: false,
  };
}
class SandboxError extends Error {
  constructor(code) { super(code); this.name = 'SandboxError'; this.code = code; }
}
function need(value, code) { if (!value) throw new SandboxError(code); }
function safeText(value, max = 16384) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0');
}
function absolute(value) {
  return safeText(value) && path.isAbsolute(value) && !/[\r\n]/.test(value);
}
function isWithin(root, candidate) {
  return absolute(root) && absolute(candidate) && candidate !== root && candidate.startsWith(root + '/');
}
function privatePath(root, name) {
  need(safeText(name, 1024), 'PRIVATE_PATH_INVALID');
  const candidate = path.isAbsolute(name) ? name : path.join(root, name);
  const relative = path.relative(root, candidate);
  need(isWithin(root, candidate) && candidate === path.normalize(candidate)
    && relative.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(part)
      && part !== '.' && part !== '..'), 'PRIVATE_PATH_INVALID');
  return candidate;
}
function planSandbox({ runnerTemp, runId, nonce }) {
  need(absolute(runnerTemp) && path.normalize(runnerTemp) === runnerTemp && runnerTemp !== '/', 'RUNNER_TEMP_INVALID');
  need(typeof runId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(runId), 'RUN_ID_INVALID');
  need(typeof nonce === 'string' && /^[a-f0-9]{16}$/.test(nonce), 'NONCE_INVALID');
  const root = path.join(runnerTemp, 'account-sandbox-' + runId.slice(0, 32) + '-' + nonce);
  need(path.dirname(root) === runnerTemp && isWithin(runnerTemp, root), 'SANDBOX_ROOT_INVALID');
  return Object.freeze({ root, home: path.join(root, 'home'), work: path.join(root, 'work'),
    artifacts: path.join(root, 'artifacts'), username: 'asc_' + nonce,
    chain4: 'ASC_' + nonce + '_4', chain6: 'ASC_' + nonce + '_6' });
}
function firewallPlan(uid, chain, family) {
  need(Number.isSafeInteger(uid) && uid > 0 && uid <= 2147483647, 'UID_INVALID');
  need(/^ASC_[a-f0-9]{16}_[46]$/.test(chain) && [4, 6].includes(family), 'FIREWALL_PLAN_INVALID');
  const loopback = family === 4 ? '127.0.0.1/32' : '::1/128';
  const reject = family === 4 ? 'icmp-port-unreachable' : 'icmp6-port-unreachable';
  return { tool: family === 4 ? 'iptables' : 'ip6tables', chain,
    create: ['-N', chain], allow: ['-A', chain, '-d', loopback, '-j', 'ACCEPT'],
    reject: ['-A', chain, '-j', 'REJECT', '--reject-with', reject],
    insert: ['-I', 'OUTPUT', '1', '-m', 'owner', '--uid-owner', String(uid), '-j', chain],
    remove: ['-D', 'OUTPUT', '-m', 'owner', '--uid-owner', String(uid), '-j', chain] };
}
function ruleLines(output) {
  need(typeof output === 'string' && output.length <= MAX_OUTPUT, 'FIREWALL_OUTPUT_INVALID');
  return output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}
function assertFirstOwnerRule(output, uid, chain) {
  const rules = ruleLines(output).filter(line => line.startsWith('-A OUTPUT '));
  need(rules[0] === '-A OUTPUT -m owner --uid-owner ' + uid + ' -j ' + chain, 'FIREWALL_OWNER_NOT_FIRST');
  need(rules.filter(line => line.includes('-j ' + chain)).length === 1, 'FIREWALL_OWNER_DUPLICATE');
  return true;
}
function assertChainRules(output, plan) {
  const rules = ruleLines(output).filter(line => line.startsWith('-A '));
  // ip6tables normalizes a full IPv6 prefix to ::1 on some versions.
  const expectedAllow = plan.allow.join(' ');
  const equivalentAllow = expectedAllow.replace('::1/128', '::1');
  need(rules.length === 2 && [expectedAllow, equivalentAllow].includes(rules[0])
    && rules[1] === plan.reject.join(' '), 'FIREWALL_CHAIN_MISMATCH');
  return true;
}
function parseRejectCounter(output) {
  const matches = ruleLines(output).map(line => /^2\s+(\d+)\s+\d+\s+REJECT\s/.exec(line)).filter(Boolean);
  need(matches.length === 1, 'REJECT_COUNTER_INVALID');
  const value = Number(matches[0][1]);
  need(Number.isSafeInteger(value) && value >= 0, 'REJECT_COUNTER_INVALID');
  return value;
}
function parseIdentity(output) {
  const match = /^(\d+):(\d+):(\d+):700$/.exec(String(output).trim());
  need(match, 'PRIVATE_ROOT_IDENTITY_INVALID');
  return { device: match[1], inode: match[2], uid: Number(match[3]) };
}
function parseId(output) {
  const text = String(output).trim();
  need(/^[1-9]\d{0,9}$/.test(text), 'UID_INVALID');
  const value = Number(text);
  need(Number.isSafeInteger(value) && value <= 2147483647, 'UID_INVALID');
  return value;
}
function secretSubset(environment = {}) {
  need(environment && typeof environment === 'object' && !Array.isArray(environment), 'PRIVATE_ENV_INVALID');
  need(Object.keys(environment).every(key => SECRET_KEYS.includes(key)), 'PRIVATE_ENV_KEY_REJECTED');
  const result = {};
  for (const key of Object.keys(environment)) {
    need(safeText(environment[key], 8192), 'PRIVATE_ENV_VALUE_INVALID');
    result[key] = environment[key];
  }
  return result;
}
function normalizeResult(result) {
  if (typeof result === 'string') return { stdout: result, stderr: '', exitCode: 0, timedOut: false };
  need(result && typeof result === 'object', 'SUBPROCESS_RESULT_INVALID');
  const stdout = result.stdout ?? '', stderr = result.stderr ?? '';
  need(typeof stdout === 'string' && typeof stderr === 'string'
    && Buffer.byteLength(stdout) + Buffer.byteLength(stderr) <= MAX_OUTPUT, 'SUBPROCESS_OUTPUT_LIMIT');
  return { stdout, stderr, exitCode: Number.isInteger(result.exitCode) ? result.exitCode : -1,
    timedOut: result.timedOut === true };
}

// No inherited stdio, shell, or error objects. Raw output exists only in the returned buffers.
async function capturedRun(file, args, options) {
  need(options && Number.isSafeInteger(options.timeout) && options.timeout > 0 && options.timeout <= 600000,
    'SUBPROCESS_TIMEOUT_INVALID');
  return new Promise(resolve => {
    let child, settled = false, halting = false, timer, killTimer, size = 0, stdout = '', stderr = '', timedOut = false;
    const finish = exitCode => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(killTimer);
      resolve({ stdout, stderr, exitCode: halting ? -1 : exitCode, timedOut });
    };
    const halt = () => {
      if (halting) return; halting = true;
      try { child.kill('SIGTERM'); } catch { /* Only fixed failure state is returned. */ }
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} finish(-1); }, 500);
    };
    try {
      child = spawn(file, args, { cwd: options.cwd, env: options.env, shell: false,
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const accept = (kind, chunk) => {
        if (settled) return;
        size += Buffer.byteLength(chunk);
        if (size > MAX_OUTPUT) { stdout = ''; stderr = ''; halt(); return; }
        if (kind === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
      };
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => accept('stdout', chunk));
      child.stderr.on('data', chunk => accept('stderr', chunk));
      child.stdin.on('error', () => {});
      child.on('error', () => finish(-1));
      child.on('close', code => finish(Number.isInteger(code) ? code : -1));
      timer = setTimeout(() => { timedOut = true; halt(); }, options.timeout);
      child.stdin.end(options.input ?? '');
    } catch { finish(-1); }
  });
}

const PROBE_IDENTITY = String.raw`if(process.getuid()!==Number(process.argv[1])||process.getgid()!==Number(process.argv[2])){process.stdout.write('PROBE_UID_MISMATCH');process.exit(1);}`;
const NEGATIVE_PROBE = PROBE_IDENTITY + String.raw`const net=require('node:net');let done=false;const s=net.createConnection({host:'192.0.2.1',port:443});function end(code,word){if(done)return;done=true;s.destroy();process.stdout.write(word);process.exitCode=code;}s.setTimeout(4000);s.on('connect',()=>end(1,'UNEXPECTED_CONNECTION'));s.on('error',()=>end(0,'NEGATIVE_BLOCKED'));s.on('timeout',()=>end(1,'NEGATIVE_TIMEOUT'));`;
const ADB_PROBE = PROBE_IDENTITY + String.raw`const net=require('node:net');let done=false,b=Buffer.alloc(0);const s=net.createConnection({host:'127.0.0.1',port:5037});function end(code,word){if(done)return;done=true;s.destroy();process.stdout.write(word);process.exitCode=code;}s.setTimeout(4000);s.on('connect',()=>s.write('000Chost:version'));s.on('data',v=>{b=Buffer.concat([b,v]);if(b.length>128)return end(1,'ADB_INVALID');if(b.length>=4&&b.subarray(0,4).toString()!=='OKAY')return end(1,'ADB_INVALID');if(b.length>=8){const n=parseInt(b.subarray(4,8).toString(),16);if(!Number.isInteger(n)||n<1||n>32)return end(1,'ADB_INVALID');if(b.length>=8+n)end(0,'ADB_OK');}});s.on('error',()=>end(1,'ADB_UNAVAILABLE'));s.on('timeout',()=>end(1,'ADB_TIMEOUT'));s.on('end',()=>{if(!done)end(1,'ADB_INCOMPLETE');});`;
// Fixed program, never assembled from flow data. Arguments contain only the already
// validated cwd, executable and command arguments; secrets remain in the allowlisted env.
// The inherited descriptors are the outer capturedRun pipes, never the public console.
const UID_PROCESS_WRAPPER = String.raw`'use strict';
const {spawn}=require('node:child_process');
const path=require('node:path');
const signals=require('node:os').constants.signals;
let child;
try {
  const [cwd,executable,...args]=process.argv.slice(1);
  if(typeof cwd!=='string'||!path.isAbsolute(cwd)||cwd.includes('\0')
    ||typeof executable!=='string'||!path.isAbsolute(executable)||executable.includes('\0')
    ||args.length>128||args.some(arg=>typeof arg!=='string'||arg.includes('\0'))) {
    process.exitCode=125;
  } else {
    process.chdir(cwd);
    child=spawn(executable,args,{cwd:process.cwd(),env:process.env,shell:false,stdio:'inherit'});
    for(const signal of ['SIGTERM','SIGINT','SIGHUP']) {
      process.on(signal,()=>{try{child.kill(signal);}catch{process.exitCode=128+signals[signal];}});
    }
    child.once('error',()=>{process.exitCode=126;});
    child.once('exit',(code,signal)=>{
      process.exitCode=Number.isInteger(code)?code:(signal&&signals[signal]?128+signals[signal]:126);
    });
  }
} catch { process.exitCode=125; }
`;

async function createSandboxInternal({ runnerTemp, runId, run = capturedRun, env = process.env,
  platform = process.platform, nodePath = process.execPath } = {}) {
  need(platform === 'linux', 'LINUX_SANDBOX_REQUIRED');
  need(typeof run === 'function' && env && typeof env === 'object', 'SANDBOX_CONFIG_INVALID');
  need(absolute(nodePath), 'SANDBOX_NODE_PATH_INVALID');
  need(absolute(runnerTemp) && path.normalize(runnerTemp) === runnerTemp && runnerTemp !== '/', 'RUNNER_TEMP_INVALID');
  const sdkEnv = {};
  for (const key of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
    if (env[key] !== undefined) {
      need(absolute(env[key]) && path.normalize(env[key]) === env[key], 'SANDBOX_SDK_PATH_INVALID');
      sdkEnv[key] = env[key];
    }
  }
  const toolEnv = { PATH: safeText(env.PATH) ? env.PATH : PATH_DEFAULT, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  const invoke = async (file, args, options = {}) => {
    const timeout = options.timeout ?? CONTROL_TIMEOUT;
    need(Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 600000, 'SUBPROCESS_TIMEOUT_INVALID');
    try { return normalizeResult(await run(file, args, { cwd: runnerTemp, env: toolEnv,
      timeout, maxBuffer: MAX_OUTPUT, shell: false, windowsHide: true, ...options })); }
    catch { throw new SandboxError('SANDBOX_SUBPROCESS_FAILED'); }
  };
  const checked = async (file, args, code, options) => {
    const result = await invoke(file, args, options);
    need(result.exitCode === 0 && !result.timedOut, code);
    return result.stdout;
  };
  const sudo = (args, code, options) => checked('sudo', ['-n', '--', ...args], code, options);
  const canonicalTemp = (await checked('realpath', ['-e', '--', runnerTemp], 'RUNNER_TEMP_UNAVAILABLE')).trim();
  need(absolute(canonicalTemp) && canonicalTemp !== '/' && path.normalize(canonicalTemp) === canonicalTemp, 'RUNNER_TEMP_INVALID');
  const plan = planSandbox({ runnerTemp: canonicalTemp, runId, nonce: randomBytes(8).toString('hex') });
  let rootCreated = false, userCreated = false, uidProcessesChecked = false, uid, gid, initialIdentity,
    ready = false, closed = false, busy = false, sequence = 0;
  const installed = [];
  const rootIdentity = async () => {
    const resolved = (await sudo(['realpath', '-e', '--', plan.root], 'PRIVATE_ROOT_CHANGED')).trim();
    need(resolved === plan.root && path.dirname(resolved) === canonicalTemp, 'PRIVATE_ROOT_CHANGED');
    const actual = parseIdentity(await sudo(['stat', '--printf', '%d:%i:%u:%a', '--', plan.root], 'PRIVATE_ROOT_CHANGED'));
    need(!initialIdentity || actual.device === initialIdentity.device && actual.inode === initialIdentity.inode,
      'PRIVATE_ROOT_CHANGED');
    need(actual.uid === initialIdentity?.uid || actual.uid === uid, 'PRIVATE_ROOT_CHANGED');
    return actual;
  };
  const contained = async (candidate, exists) => {
    await rootIdentity();
    const resolved = (await sudo(['realpath', exists ? '-e' : '-m', '--', candidate], 'PRIVATE_PATH_UNAVAILABLE')).trim();
    need(resolved === candidate && isWithin(plan.root, resolved), 'PRIVATE_PATH_ESCAPED');
    return resolved;
  };
  const assertFirewall = async () => {
    for (const item of installed) {
      need(item.jump, 'FIREWALL_INCOMPLETE');
      assertFirstOwnerRule(await sudo([item.tool, '-w', '5', '-S', 'OUTPUT'], 'FIREWALL_INSPECTION_FAILED'), uid, item.chain);
      assertChainRules(await sudo([item.tool, '-w', '5', '-S', item.chain], 'FIREWALL_INSPECTION_FAILED'), item);
    }
    need(installed.length === 2, 'FIREWALL_INCOMPLETE');
  };
  const resolveExecutable = async executable => {
    if (path.isAbsolute(executable)) return executable;
    need(/^[A-Za-z0-9][A-Za-z0-9_.+-]{0,95}$/.test(executable), 'PRIVATE_EXECUTABLE_INVALID');
    // The shell program is fixed; the executable name is a positional argument, never shell code.
    // Resolve before sudo so secure_path cannot select a different Maestro/ADB binary.
    const resolved = (await checked('/bin/sh', ['-c', 'command -v "$1"', 'account-sandbox', executable],
      'PRIVATE_EXECUTABLE_UNAVAILABLE')).trim();
    need(absolute(resolved), 'PRIVATE_EXECUTABLE_UNAVAILABLE');
    return resolved;
  };
  const executeAs = async (argv, environment = {}, timeout = 45000, cwd = plan.work, allowBeforeReady = false) => {
    need(!closed && (ready || allowBeforeReady), 'SANDBOX_NOT_READY');
    need(!busy, 'SANDBOX_BUSY');
    need(Array.isArray(argv) && argv.length > 0 && argv.length <= 128
      && argv.every(arg => typeof arg === 'string' && arg.length <= 32768 && !arg.includes('\0'))
      && safeText(argv[0]) && !argv[0].startsWith('-'), 'PRIVATE_ARGV_INVALID');
    const secrets = secretSubset(environment);
    need(ready || Object.keys(secrets).length === 0, 'SECRETS_BEFORE_PROBES');
    need(!Object.values(secrets).some(value => argv.some(arg => arg.includes(value))), 'SECRET_IN_ARGV_REJECTED');
    need([plan.root, plan.home, plan.work, plan.artifacts].includes(cwd), 'PRIVATE_CWD_INVALID');
    await rootIdentity();
    if (ready) await assertFirewall();
    const executable = await resolveExecutable(argv[0]);
    const childEnv = { ...toolEnv, HOME: plan.home, XDG_STATE_HOME: path.join(plan.root, 'state'),
      XDG_CACHE_HOME: path.join(plan.root, 'cache'), XDG_CONFIG_HOME: path.join(plan.root, 'config'),
      XDG_DATA_HOME: path.join(plan.root, 'data'), XDG_RUNTIME_DIR: path.join(plan.root, 'runtime'),
      TMPDIR: path.join(plan.root, 'tmp'),
      TMP: path.join(plan.root, 'tmp'), TEMP: path.join(plan.root, 'tmp'),
      MAESTRO_CLI_NO_ANALYTICS: '1', ...secrets };
    if (absolute(env.JAVA_HOME)) childEnv.JAVA_HOME = env.JAVA_HOME;
    for (const key of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
      if (sdkEnv[key] !== undefined) childEnv[key] = sdkEnv[key];
    }
    const preserve = Object.keys(childEnv).join(',');
    busy = true;
    try { return await invoke('sudo', ['-n', '--preserve-env=' + preserve,
      '--user=#' + uid, '--group=#' + gid, '--', nodePath, '-e', UID_PROCESS_WRAPPER,
      '--', cwd, executable, ...argv.slice(1)], { env: childEnv, timeout }); }
    finally { busy = false; }
  };
  const cleanup = async () => {
    if (closed) return;
    ready = false;
    // Stop exactly the account this instance created, before changing either firewall.
    if (userCreated) {
      const account = (await sudo(['getent', 'passwd', plan.username], 'SANDBOX_ACCOUNT_CHANGED')).trim().split(':');
      need(account.length === 7 && account[0] === plan.username && account[5] === plan.home,
        'SANDBOX_ACCOUNT_CHANGED');
      const accountUid = parseId(account[2]), accountGid = parseId(account[3]);
      need((uid === undefined || accountUid === uid) && (gid === undefined || accountGid === gid), 'SANDBOX_ACCOUNT_CHANGED');
      uid = accountUid; gid = accountGid;
      if (uidProcessesChecked) {
        const killed = await invoke('sudo', ['-n', '--', 'pkill', '-KILL', '-u', String(uid)]);
        need(!killed.timedOut && [0, 1].includes(killed.exitCode), 'SANDBOX_PROCESS_KILL_FAILED');
      }
      let stopped = false;
      for (let attempt = 0; attempt < (uidProcessesChecked ? 20 : 1); attempt += 1) {
        const remaining = await invoke('sudo', ['-n', '--', 'pgrep', '-u', String(uid)]);
        if (!remaining.timedOut && remaining.exitCode === 1 && !remaining.stdout.trim()) { stopped = true; break; }
        need(!remaining.timedOut && remaining.exitCode === 0, 'SANDBOX_PROCESS_INSPECTION_FAILED');
        if (uidProcessesChecked && attempt < 19) await new Promise(resolve => setTimeout(resolve, 50));
      }
      need(stopped, 'SANDBOX_PROCESSES_REMAIN');
    }
    for (const item of [...installed].reverse()) {
      if (item.jump) { await sudo([item.tool, '-w', '5', ...item.remove], 'SANDBOX_FIREWALL_CLEANUP_FAILED'); item.jump = false; }
      if (item.created) {
        await sudo([item.tool, '-w', '5', '-F', item.chain], 'SANDBOX_FIREWALL_CLEANUP_FAILED');
        await sudo([item.tool, '-w', '5', '-X', item.chain], 'SANDBOX_FIREWALL_CLEANUP_FAILED'); item.created = false;
      }
    }
    if (rootCreated) {
      await rootIdentity();
      await sudo(['rm', '-rf', '--one-file-system', '--', plan.root], 'SANDBOX_PRIVATE_CLEANUP_FAILED'); rootCreated = false;
    }
    if (userCreated) { await sudo(['userdel', '--', plan.username], 'SANDBOX_ACCOUNT_CLEANUP_FAILED'); userCreated = false; }
    closed = true;
  };
  try {
    await sudo(['true'], 'SUDO_UNAVAILABLE');
    // Missing cleanup or firewall tools must fail before an account or secrets exist.
    for (const tool of ['useradd', 'userdel', 'pkill', 'pgrep', 'getent', 'mkdir', 'chown', 'stat', 'install', 'cat', 'rm', 'realpath']) {
      await sudo([tool, '--help'], 'SANDBOX_TOOL_UNAVAILABLE');
    }
    for (const tool of ['iptables', 'ip6tables']) await sudo([tool, '-w', '5', '--version'], 'FIREWALL_UNAVAILABLE');
    const callerUid = parseId(await checked('id', ['-u'], 'CALLER_UID_UNAVAILABLE'));
    await checked('mkdir', ['-m', '0700', '--', plan.root], 'PRIVATE_ROOT_CREATE_FAILED'); rootCreated = true;
    initialIdentity = parseIdentity(await checked('stat', ['--printf', '%d:%i:%u:%a', '--', plan.root], 'PRIVATE_ROOT_STAT_FAILED'));
    await sudo(['useradd', '--system', '--user-group', '--no-create-home', '--home-dir', plan.home,
      '--shell', '/bin/false', '--', plan.username], 'SANDBOX_ACCOUNT_CREATE_FAILED'); userCreated = true;
    uid = parseId(await sudo(['id', '-u', plan.username], 'SANDBOX_UID_UNAVAILABLE'));
    gid = parseId(await sudo(['id', '-g', plan.username], 'SANDBOX_GID_UNAVAILABLE'));
    need(uid !== callerUid, 'SANDBOX_UID_NOT_DISTINCT');
    const initiallyEmpty = await invoke('sudo', ['-n', '--', 'pgrep', '-u', String(uid)]);
    need(!initiallyEmpty.timedOut && initiallyEmpty.exitCode === 1 && !initiallyEmpty.stdout.trim(), 'SANDBOX_UID_NOT_EMPTY');
    uidProcessesChecked = true;
    const directories = ['home', 'work', 'artifacts', 'state', 'cache', 'config', 'data', 'runtime', 'tmp'].map(name => path.join(plan.root, name));
    await checked('mkdir', ['-m', '0700', '--', ...directories], 'PRIVATE_DIRECTORIES_CREATE_FAILED');
    await sudo(['chown', String(uid) + ':' + gid, '--', plan.root, ...directories], 'PRIVATE_OWNERSHIP_FAILED');
    await rootIdentity();
    for (const family of [4, 6]) {
      const item = { ...firewallPlan(uid, family === 4 ? plan.chain4 : plan.chain6, family), created: false, jump: false };
      installed.push(item);
      await sudo([item.tool, '-w', '5', ...item.create], 'FIREWALL_CHAIN_CREATE_FAILED'); item.created = true;
      await sudo([item.tool, '-w', '5', ...item.allow], 'FIREWALL_ALLOW_FAILED');
      await sudo([item.tool, '-w', '5', ...item.reject], 'FIREWALL_REJECT_FAILED');
      await sudo([item.tool, '-w', '5', ...item.insert], 'FIREWALL_INSERT_FAILED'); item.jump = true;
    }
    await assertFirewall();
    const counterArgs = ['iptables', '-w', '5', '-L', plan.chain4, '-n', '-v', '-x', '--line-numbers'];
    const before = parseRejectCounter(await sudo(counterArgs, 'REJECT_COUNTER_UNAVAILABLE'));
    const negative = await executeAs([nodePath, '-e', NEGATIVE_PROBE, '--', String(uid), String(gid)], {}, 7000, plan.work, true);
    const after = parseRejectCounter(await sudo(counterArgs, 'REJECT_COUNTER_UNAVAILABLE'));
    need(negative.exitCode === 0 && !negative.timedOut && negative.stdout === 'NEGATIVE_BLOCKED' && after > before,
      'EGRESS_REJECTION_UNPROVEN');
    const positive = await executeAs([nodePath, '-e', ADB_PROBE, '--', String(uid), String(gid)], {}, 7000, plan.work, true);
    need(positive.exitCode === 0 && !positive.timedOut && positive.stdout === 'ADB_OK', 'PRIVATE_ADB_UNREACHABLE');
    await assertFirewall();
    ready = true;
  } catch (error) {
    const sandboxCode = fixedSandboxCode(error);
    try { await cleanup(); }
    catch (cleanupError) {
      throw rememberSandboxDiagnostic(new SandboxError('SANDBOX_SETUP_CLEANUP_FAILED'), {
        sandboxCode, cleanupCode: fixedSandboxCode(cleanupError), cleanupConfirmed: false,
      });
    }
    throw rememberSandboxDiagnostic(error instanceof SandboxError ? error : new SandboxError('SANDBOX_SETUP_FAILED'), {
      sandboxCode, cleanupCode: null,
      cleanupConfirmed: !rootCreated && !userCreated && installed.every(item => !item.created && !item.jump),
    });
  }
  const createPrivateFile = async (name, content) => {
    need(ready && !closed && !busy, 'SANDBOX_NOT_READY');
    need(typeof content === 'string' && Buffer.byteLength(content) <= 1024 * 1024, 'PRIVATE_FILE_TOO_LARGE');
    const target = await contained(privatePath(plan.root, name), false);
    // Existing parents only; no recursive mkdir or writes through paths outside this root.
    if (path.dirname(target) === plan.root) await rootIdentity();
    else await contained(path.dirname(target), true);
    await sudo(['install', '-m', '0600', '-o', String(uid), '-g', String(gid), '--', '/dev/stdin', target],
      'PRIVATE_FILE_WRITE_FAILED', { input: content });
    return target;
  };
  const readPrivateFile = async name => {
    need(ready && !closed && !busy, 'SANDBOX_NOT_READY');
    const target = await contained(privatePath(plan.root, name), true);
    return sudo(['cat', '--', target], 'PRIVATE_FILE_READ_FAILED');
  };
  const runMaestro = async (serial, argv, { secretEnv = {}, cwd = plan.work } = {}) => {
    need(typeof serial === 'string' && /^emulator-\d+$/.test(serial), 'PRIVATE_DEVICE_INVALID');
    need(Array.isArray(argv) && argv[0] === 'test', 'PRIVATE_MAESTRO_ARGV_INVALID');
    let outputFile, flow, reinstall = [];
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === '--format') { need(argv[++i] === 'junit', 'PRIVATE_MAESTRO_FORMAT_INVALID'); }
      else if (arg === '--output') { need(!outputFile, 'PRIVATE_MAESTRO_ARGV_INVALID'); outputFile = privatePath(plan.root, argv[++i]); }
      else if (arg === '--no-reinstall-driver') { need(!reinstall.length, 'PRIVATE_MAESTRO_ARGV_INVALID'); reinstall = [arg]; }
      else { need(typeof arg === 'string' && !arg.startsWith('-') && !flow, 'PRIVATE_MAESTRO_ARGV_INVALID'); flow = privatePath(plan.root, arg); }
    }
    need(flow, 'PRIVATE_MAESTRO_FLOW_REQUIRED');
    await contained(flow, true);
    const caseName = 'case-' + String(++sequence).padStart(3, '0');
    outputFile ||= path.join(plan.artifacts, caseName + '.xml');
    await contained(outputFile, false);
    if (path.dirname(outputFile) === plan.root) await rootIdentity();
    else await contained(path.dirname(outputFile), true);
    const debugOutputDir = path.join(plan.artifacts, caseName + '-debug');
    const testOutputDir = path.join(plan.artifacts, caseName + '-tests');
    const result = await executeAs(['maestro', '--device', serial, 'test', '--format', 'junit', '--output', outputFile,
      '--debug-output', debugOutputDir, '--test-output-dir', testOutputDir, ...reinstall, flow], secretEnv, 600000, cwd);
    return { ...result, outputFile, debugOutputDir, testOutputDir };
  };
  return Object.freeze({ uid, gid, root: plan.root, home: plan.home, work: plan.work, artifacts: plan.artifacts,
    runAs: (argv, environment, timeout) => executeAs(argv, environment, timeout),
    runMaestro, createPrivateFile, readPrivateFile, cleanup,
    probes: Object.freeze({ ipv4RejectedWithCounter: true, adbLoopbackReachable: true,
      scope: 'Linux runtime probes; emulator and adb server retain their original UID' }) });
}

async function createSandbox(options) {
  try { return await createSandboxInternal(options); }
  catch (error) {
    if (error && ['object', 'function'].includes(typeof error) && sandboxDiagnostics.has(error)) throw error;
    // Before the internal setup try, only argument checks and read-only realpath execute.
    // No root, account, process or firewall resource has been created in this branch.
    throw rememberSandboxDiagnostic(error, {
      sandboxCode: fixedSandboxCode(error), cleanupCode: null, cleanupConfirmed: true,
    });
  }
}

module.exports = { SandboxError, SANDBOX_ERROR_CODES, safeSandboxDiagnostic, isSafeSandboxDiagnostic,
  UID_PROCESS_WRAPPER, planSandbox, firewallPlan, assertFirstOwnerRule, assertChainRules,
  parseRejectCounter, parseIdentity, privatePath, secretSubset, capturedRun, createSandbox };

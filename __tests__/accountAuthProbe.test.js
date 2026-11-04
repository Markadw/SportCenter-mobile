/** @jest-environment node */
'use strict';
// Synthetic fixtures and fake transports only. This file never contacts the API.
const test = globalThis.test || require('node:test').test;
const assert = require('node:assert/strict');
const path = require('node:path');
const { ReadableStream } = require('node:stream/web');
const { probeAccountAuth, validateProbeReport, REPORT_KEYS, MAX_BODY_BYTES, TIMEOUT_MS } = require(
  path.join(process.env.ACCOUNT_PREP_DIR || path.join(__dirname, '..', 'scripts'), 'account-auth-probe.cjs'));
const email = 'synthetic@example.test', password = 'Synthetic &+ "Päss word';
const session = (extra = {}) => ({ accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
  sessionId: 'synthetic-session', accessTokenExpiresIn: '15m', ...extra });
const response = (status, body) => ({ status, body: body === null ? null : new ReadableStream({
  start(controller) { controller.enqueue(Buffer.from(body, 'utf8')); controller.close(); },
}) });
const json = (status, body) => response(status, JSON.stringify(body));
const fake = replies => {
  const calls = [];
  return { calls, fetchImpl: async (...args) => {
    calls.push(args);
    const next = replies.shift();
    if (next instanceof Error) throw next;
    assert.ok(next, 'No implicit retries or extra requests are allowed');
    return next;
  } };
};
const run = async (replies, input = {}) => {
  const transport = fake(replies);
  const result = await probeAccountAuth({ email, password, fetchImpl: transport.fetchImpl, ...input });
  assert.equal(validateProbeReport(result), true);
  assert.deepEqual(Object.keys(result), REPORT_KEYS);
  assert.equal(JSON.stringify(result).includes(email), false);
  assert.equal(JSON.stringify(result).includes(password), false);
  assert.equal(JSON.stringify(result).includes('synthetic-access'), false);
  assert.equal(JSON.stringify(result).includes('synthetic-refresh'), false);
  return { result, calls: transport.calls };
};

test('201 contract: exact login body, then logout, both fixed HTTPS POST without redirects', async () => {
  const { result, calls } = await run([json(201, session()), json(201, { message: 'ignored' })],
    { email: ' SYNTHETIC@EXAMPLE.TEST ' });
  assert.equal(result.status, 'passed'); assert.equal(result.uiContinueAllowed, true);
  assert.equal(result.logoutConfirmed, true); assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'https://back-sport-ghxk.onrender.com/users/login-user');
  assert.deepEqual(JSON.parse(calls[0][1].body), { email, passw: password });
  assert.equal(calls[1][0], 'https://back-sport-ghxk.onrender.com/users/logout');
  assert.equal(calls[1][1].headers.Authorization, 'Bearer synthetic-access');
  assert.deepEqual(JSON.parse(calls[1][1].body), {});
  assert.ok(calls.every(([, config]) => config.method === 'POST' && config.redirect === 'error' &&
    config.signal instanceof AbortSignal));
  assert.notEqual(calls[0][1].signal, calls[1][1].signal);
  assert.equal(TIMEOUT_MS, 15000);
});
for (const [status, body, expected] of [
  [400, { code: 2, message: 'private detail ignored' }, 'ACCOUNT_UNVERIFIED'],
  [400, { code: 1 }, 'CREDENTIALS_REJECTED'], [401, {}, 'CREDENTIALS_REJECTED'],
  [429, {}, 'RATE_LIMITED'], [503, {}, 'LOGIN_SERVER_ERROR'], [302, {}, 'LOGIN_REDIRECT'],
  [403, {}, 'LOGIN_HTTP_UNEXPECTED'],
]) test('HTTP ' + status + ' -> ' + expected + ', without retry/UI', async () => {
  const { result, calls } = await run([json(status, body)]);
  assert.equal(result.errorCode, expected); assert.equal(result.uiContinueAllowed, false);
  assert.equal(result.logoutAttempted, false); assert.equal(calls.length, 1);
});
test('200 with the same valid session matches Axios semantics and is logged out before UI', async () => {
  const { result, calls } = await run([json(200, session()), json(200, {})]);
  assert.equal(result.errorCode, 'NONE'); assert.equal(result.status, 'passed');
  assert.equal(result.logoutConfirmed, true); assert.equal(calls.length, 2);
});
test('logout starts only after the complete login response and UI remains gated until it finishes', async () => {
  let releaseLogin, releaseLogout;
  let markLogoutStarted;
  const logoutStarted = new Promise(resolve => { markLogoutStarted = resolve; });
  const calls = [];
  const pending = probeAccountAuth({ email, password, fetchImpl: async (url, config) => {
    calls.push([url, config]);
    if (calls.length === 1) return new Promise(resolve => { releaseLogin = resolve; });
    if (calls.length === 2) return new Promise(resolve => { releaseLogout = resolve; markLogoutStarted(); });
    assert.fail('No third request permitted');
  } });
  assert.equal(calls.length, 1);
  releaseLogin(json(201, session()));
  await Promise.race([logoutStarted, pending.then(() => assert.fail('Probe finished before logout started'))]);
  assert.equal(calls.length, 2);
  let completed = false;
  pending.then(() => { completed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  releaseLogout(json(201, {}));
  const result = await pending;
  assert.equal(result.uiContinueAllowed, true);
  assert.equal(validateProbeReport(result), true);
});
test('rejected HTTP containing an issued access token is always logged out', async () => {
  const { result, calls } = await run([json(401, { accessToken: 'synthetic-access' }), json(201, {})]);
  assert.equal(result.errorCode, 'CREDENTIALS_REJECTED');
  assert.equal(result.status, 'blocked'); assert.equal(result.logoutConfirmed, true); assert.equal(calls.length, 2);
});
for (const change of [{ refreshToken: null }, { sessionId: '' }, { accessTokenExpiresIn: '25h' },
  { accessTokenExpiresIn: '0s' }, { accessTokenExpiresIn: '999999999999999999999s' },
  { accessTokenExpiresIn: '1d' }]) test('invalid session/TTL is rejected while its issued token is revoked: ' +
    Object.keys(change)[0] + '=' + String(Object.values(change)[0]), async () => {
  const { result, calls } = await run([json(201, session(change)), json(201, {})]);
  assert.equal(result.errorCode, 'LOGIN_SESSION_INVALID'); assert.equal(result.sessionValid, false);
  assert.equal(result.logoutConfirmed, true); assert.equal(calls.length, 2);
});
test('24-hour TTL boundary accepted and a 204 logout needs no JSON body', async () => {
  const { result } = await run([json(201, session({ accessTokenExpiresIn: '86400s' })),
    response(204, null)]);
  assert.equal(result.status, 'passed');
});
test('malformed JSON cannot authorize UI', async () => {
  const { result } = await run([response(201, 'not-json')]);
  assert.equal(result.errorCode, 'LOGIN_BODY_INVALID'); assert.equal(result.status, 'failed');
});
test('stream over 64KiB is cancelled and never parsed or returned', async () => {
  let cancelled = false;
  const streamed = { status: 201, body: new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(MAX_BODY_BYTES + 1)); },
    cancel() { cancelled = true; },
  }) };
  const { result, calls } = await run([streamed]);
  assert.equal(result.errorCode, 'LOGIN_BODY_TOO_LARGE'); assert.equal(cancelled, true);
  assert.equal(calls.length, 1); assert.equal(result.uiContinueAllowed, false);
});
for (const [reply, expected] of [
  [new Error('synthetic private network failure'), 'LOGIN_NETWORK_ERROR'],
  [Object.assign(new Error('synthetic timeout'), { name: 'TimeoutError' }), 'LOGIN_TIMEOUT'],
]) test('transport failure is reduced to ' + expected, async () => {
  const { result, calls } = await run([reply]);
  assert.equal(result.errorCode, expected); assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(result).includes('private'), false);
});
for (const [reply, expected] of [
  [json(401, {}), 'LOGOUT_HTTP_FAILED'], [json(307, {}), 'LOGOUT_REDIRECT'],
  [new Error('synthetic logout private failure'), 'LOGOUT_NETWORK_ERROR'],
  [Object.assign(new Error('timeout'), { name: 'TimeoutError' }), 'LOGOUT_TIMEOUT'],
]) test('logout must succeed before UI: ' + expected, async () => {
  const { result, calls } = await run([json(201, session()), reply]);
  assert.equal(result.sessionValid, true); assert.equal(result.logoutAttempted, true);
  assert.equal(result.logoutConfirmed, false); assert.equal(result.uiContinueAllowed, false);
  assert.equal(result.status, 'failed'); assert.equal(result.errorCode, expected); assert.equal(calls.length, 2);
});
test('oversized logout body also fails closed, never authorizing UI', async () => {
  const { result } = await run([json(201, session()),
    response(201, 'x'.repeat(MAX_BODY_BYTES + 1))]);
  assert.equal(result.errorCode, 'LOGOUT_BODY_TOO_LARGE'); assert.equal(result.logoutConfirmed, false);
});
test('missing/invalid credentials cause no request', async () => {
  const { result, calls } = await run([], { password: '' });
  assert.equal(result.errorCode, 'CREDENTIALS_MISSING'); assert.equal(calls.length, 0);
  const second = await run([], { email: 'invalid' });
  assert.equal(second.result.errorCode, 'CREDENTIALS_INVALID');
});
test('report validator rejects extra fields, forged success, unsafe codes and inconsistent cleanup', async () => {
  const { result } = await run([json(201, session()), json(201, {})]);
  assert.equal(validateProbeReport({ ...result, accessToken: 'not allowed' }), false);
  assert.equal(validateProbeReport({ ...result, logoutConfirmed: false }), false);
  assert.equal(validateProbeReport({ ...result, errorCode: 'internal private error' }), false);
  assert.equal(validateProbeReport({ ...result, loginHttpStatus: 401 }), false);
  assert.equal(validateProbeReport({ ...result, status: 'failed', uiContinueAllowed: false,
    sessionValid: false, errorCode: 'NONE' }), false);
  assert.equal(validateProbeReport(null), false);
  assert.equal(validateProbeReport(new Proxy({}, { ownKeys() { throw new Error(); } })), false);
});

test('private authenticated callback runs in the original session before unconditional logout and returns no private value', async () => {
  const events = [], transport = fake([json(201, session()), json(201, {})]);
  const result = await probeAccountAuth({ email, password, fetchImpl: async (...args) => {
    events.push(args[0].endsWith('logout') ? 'logout' : 'login'); return transport.fetchImpl(...args);
  }, onAuthenticated: async token => { assert.equal(token, 'synthetic-access'); events.push('callback'); return { private: 'discard' }; } });
  assert.deepEqual(events, ['login', 'callback', 'logout']); assert.equal(result.status, 'passed');
  assert.deepEqual(Object.keys(result), REPORT_KEYS); assert.equal(JSON.stringify(result).includes('discard'), false);
});
test('callback failure has a fixed public code, still logs out, and cannot allow UI', async () => {
  const transport = fake([json(201, session()), json(201, {})]);
  const result = await probeAccountAuth({ email, password, fetchImpl: transport.fetchImpl,
    onAuthenticated: async () => { throw new Error('PRIVATE_CALLBACK_CANARY'); } });
  assert.equal(result.errorCode, 'AUTHENTICATED_TASK_FAILED'); assert.equal(result.logoutConfirmed, true);
  assert.equal(result.uiContinueAllowed, false); assert.equal(validateProbeReport(result), true);
  assert.equal(JSON.stringify(result).includes('PRIVATE_CALLBACK_CANARY'), false); assert.equal(transport.calls.length, 2);
});
test('callback failure cannot hide unconfirmed logout and rejected login never invokes callback', async () => {
  const transport = fake([json(201, session()), json(503, {})]);
  const result = await probeAccountAuth({ email, password, fetchImpl: transport.fetchImpl,
    onAuthenticated: async () => { throw new Error('private'); } });
  assert.equal(result.errorCode, 'LOGOUT_HTTP_FAILED'); assert.equal(result.logoutConfirmed, false); assert.equal(result.uiContinueAllowed, false);
  const rejected = fake([json(400, { code: 1 })]); let invoked = false;
  const rejectedResult = await probeAccountAuth({ email, password, fetchImpl: rejected.fetchImpl,
    onAuthenticated: async () => { invoked = true; } });
  assert.equal(rejectedResult.errorCode, 'CREDENTIALS_REJECTED'); assert.equal(invoked, false);
});

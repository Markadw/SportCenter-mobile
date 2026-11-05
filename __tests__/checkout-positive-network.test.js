/** @jest-environment node */
'use strict';

const { test, afterEach } = require('@jest/globals');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createEgressProxy, createReturnServer } = require('../tests/environment/checkout-positive-network.cjs');

const servers = new Set();
const AUTHORIZATION = 'Bearer synthetic-provider-test-only';

async function listen(server) {
  servers.add(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return server;
}

afterEach(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  servers.clear();
});

function send(server, target, { method = 'GET', body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined && !('content-length' in requestHeaders) && !('transfer-encoding' in requestHeaders)) {
    requestHeaders['content-length'] = Buffer.byteLength(body);
  }
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: server.address().port,
      method, path: target, headers: requestHeaders, timeout: 2000 }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('LOCAL_TEST_TIMEOUT')));
    request.end(body);
  });
}

function proxySend(server, target, options = {}) {
  return send(server, target, { ...options, headers: { authorization: AUTHORIZATION, ...options.headers } });
}

function provider({ status = 200, body = '{}', headers = {}, error, hang = false } = {}) {
  const calls = [];
  const requests = [];
  const requestImpl = (options, callback) => {
    const request = new EventEmitter();
    request.destroyed = false;
    request.destroy = () => { request.destroyed = true; };
    request.end = (data) => {
      calls.push({ options, body: Buffer.from(data || '') });
      if (hang) return;
      queueMicrotask(() => {
        if (error) return request.emit('error', new Error(error));
        const response = new PassThrough();
        response.statusCode = status;
        response.headers = headers;
        callback(response);
        response.end(body);
      });
    };
    requests.push(request);
    return request;
  };
  return { requestImpl, calls, requests };
}

test('requiring the library creates no listener; CLI rejects an absent or wrong opt-in', () => {
  const server = createReturnServer();
  assert.equal(server.listening, false);
  const script = path.resolve(__dirname, '../tests/environment/checkout-positive-network.cjs');
  for (const flag of [undefined, 'false', 'TRUE']) {
    const result = spawnSync(process.execPath, [script, 'proxy'], {
      env: { ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        ...(flag === undefined ? {} : { QA_CHECKOUT_POSITIVE: flag }) },
      encoding: 'utf8', timeout: 2000,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'QA_CHECKOUT_POSITIVE_PROXY_SCOPE_INVALID\n');
  }
});

test.each(['api.mercadopago.com', 'api.mercadolibre.com'])('identity lookup for %s uses verified HTTPS and no forwarded client cookies', async (hostname) => {
  const upstream = provider({ body: '{"test_user":true}' });
  const server = await listen(createEgressProxy({ requestImpl: upstream.requestImpl }));
  const response = await proxySend(server, `https://${hostname}:443/users/me`, {
    headers: { 'x-extra': 'not-forwarded', host: 'attacker.invalid' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { test_user: true });
  assert.equal(upstream.calls.length, 1);
  const { options } = upstream.calls[0];
  assert.equal(options.protocol, 'https:');
  assert.equal(options.hostname, hostname);
  assert.equal(options.servername, hostname);
  assert.equal(options.port, 443);
  assert.equal(options.path, '/users/me');
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.agent, false);
  assert.equal(options.timeout, 15000);
  assert.deepEqual(options.headers, { authorization: AUTHORIZATION, accept: 'application/json', 'accept-encoding': 'identity' });
});

test('absolute-form POST forwards one JSON body and preference lookup stays on the same allowlist', async () => {
  const upstream = provider({ status: 201, body: '{"id":"3497260719-qa"}' });
  const server = await listen(createEgressProxy({ requestImpl: upstream.requestImpl }));
  const body = JSON.stringify({ items: [{ title: 'Synthetic QA', quantity: 1, unit_price: 1 }] });
  const response = await proxySend(server, 'https://api.mercadopago.com/checkout/preferences', {
    method: 'POST', body, headers: { 'content-type': 'application/json;charset=utf-8' },
  });
  assert.equal(response.status, 201);
  assert.equal(upstream.calls.length, 1);
  assert.equal(upstream.calls[0].body.toString(), body);
  assert.equal(upstream.calls[0].options.headers['content-length'], Buffer.byteLength(body));
  assert.equal(upstream.calls[0].options.headers['content-type'], 'application/json');
  const lookup = await proxySend(server, 'https://api.mercadopago.com/checkout/preferences/3497260719-qa');
  assert.equal(lookup.status, 201);
  assert.equal(upstream.calls[1].options.path, '/checkout/preferences/3497260719-qa');
});

test.each([
  ['GET', 'http://api.mercadopago.com/users/me'],
  ['GET', 'https://api.mercadopago.com.evil.invalid/users/me'],
  ['GET', 'https://api.mercadopago.com:444/users/me'],
  ['GET', 'https://user:password@api.mercadopago.com/users/me'],
  ['GET', 'https://127.0.0.1/users/me'],
  ['GET', '/users/me'],
  ['GET', 'https://api.mercadopago.com/users/me?access_token=synthetic'],
  ['GET', 'https://api.mercadopago.com/users/me#fragment'],
  ['GET', 'https://api.mercadopago.com/a/../users/me'],
  ['GET', 'https://api.mercadopago.com/v1/payments/123'],
  ['POST', 'https://api.mercadopago.com/v1/payments'],
  ['POST', 'https://api.mercadopago.com/users/me'],
  ['GET', 'https://api.mercadopago.com/checkout/preferences/'],
  ['GET', 'https://api.mercadopago.com/checkout/preferences/id%2fextra'],
  ['GET', 'https://api.mercadopago.com/checkout/preferences/id/extra'],
  ['GET', 'https://api.mercadopago.com/checkout/preferences/id?extra=1'],
  ['POST', 'https://api.mercadolibre.com/checkout/preferences'],
])('denies %s %s before any upstream request', async (method, target) => {
  const upstream = provider();
  const server = await listen(createEgressProxy({ requestImpl: upstream.requestImpl }));
  const response = await proxySend(server, target, { method });
  assert.equal(response.status, 403);
  assert.equal(upstream.calls.length, 0);
});

test('does not create an opaque CONNECT tunnel even to a listed host', async () => {
  const upstream = provider();
  const server = await listen(createEgressProxy({ requestImpl: upstream.requestImpl }));
  const raw = await new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: server.address().port });
    const chunks = [];
    socket.setTimeout(2000, () => socket.destroy(new Error('LOCAL_TEST_TIMEOUT')));
    socket.on('connect', () => socket.write('CONNECT api.mercadopago.com:443 HTTP/1.1\r\nHost: api.mercadopago.com:443\r\n\r\n'));
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => resolve(Buffer.concat(chunks).toString()));
    socket.on('error', reject);
  });
  assert.match(raw, /^HTTP\/1\.1 403 /);
  assert.equal(upstream.calls.length, 0);
});

test('rejects unused methods, missing auth, cookies and proxy credentials without forwarding', async () => {
  const upstream = provider();
  const server = await listen(createEgressProxy({ requestImpl: upstream.requestImpl }));
  const target = 'https://api.mercadopago.com/users/me';
  assert.equal((await proxySend(server, target, { method: 'DELETE' })).status, 405);
  assert.equal((await send(server, target)).status, 403);
  assert.equal((await proxySend(server, target, { headers: { authorization: 'Basic synthetic' } })).status, 403);
  assert.equal((await proxySend(server, target, { headers: { cookie: 'not-forwarded' } })).status, 403);
  assert.equal((await proxySend(server, target, { headers: { 'proxy-authorization': 'Basic synthetic' } })).status, 403);
  assert.equal(upstream.calls.length, 0);
});

test('bounds both declared and chunked request bodies at 64 KiB; valid maximum JSON is forwarded', async () => {
  const upstream = provider();
  const server = await listen(createEgressProxy({ requestImpl: upstream.requestImpl }));
  const target = 'https://api.mercadopago.com/checkout/preferences';
  const overLimit = JSON.stringify({ x: 'x'.repeat(65529) });
  assert.equal(Buffer.byteLength(overLimit), 65537);
  assert.equal((await proxySend(server, target, { method: 'POST', body: overLimit,
    headers: { 'content-type': 'application/json' } })).status, 413);
  assert.equal((await proxySend(server, target, { method: 'POST', body: overLimit,
    headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } })).status, 413);
  assert.equal(upstream.calls.length, 0);
  const exactLimit = JSON.stringify({ x: 'x'.repeat(65528) });
  assert.equal(Buffer.byteLength(exactLimit), 65536);
  assert.equal((await proxySend(server, target, { method: 'POST', body: exactLimit,
    headers: { 'content-type': 'application/json' } })).status, 200);
  assert.equal(upstream.calls.length, 1);
});

test('rejects compressed, non-object or invalid JSON and a GET body', async () => {
  const upstream = provider();
  const server = await listen(createEgressProxy({ requestImpl: upstream.requestImpl }));
  const target = 'https://api.mercadopago.com/checkout/preferences';
  assert.equal((await proxySend(server, target, { method: 'POST', body: '{}',
    headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await proxySend(server, target, { method: 'POST', body: '{}',
    headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } })).status, 415);
  for (const body of ['[1]', 'null', '{bad']) {
    assert.equal((await proxySend(server, target, { method: 'POST', body,
      headers: { 'content-type': 'application/json' } })).status, 400);
  }
  assert.equal((await proxySend(server, 'https://api.mercadopago.com/users/me', { body: 'x' })).status, 400);
  assert.equal(upstream.calls.length, 0);
});

test('does not follow redirects or forward provider cookies', async () => {
  const redirect = provider({ status: 302, headers: { location: 'https://outside.invalid', 'set-cookie': 'private=synthetic' } });
  const first = await listen(createEgressProxy({ requestImpl: redirect.requestImpl }));
  const denied = await proxySend(first, 'https://api.mercadopago.com/users/me');
  assert.equal(denied.status, 502);
  assert.equal(denied.headers.location, undefined);
  assert.equal(denied.headers['set-cookie'], undefined);
  assert.equal(redirect.calls.length, 1);
  const accepted = provider({ headers: { 'set-cookie': 'private=synthetic' } });
  const second = await listen(createEgressProxy({ requestImpl: accepted.requestImpl }));
  assert.equal((await proxySend(second, 'https://api.mercadopago.com/users/me')).headers['set-cookie'], undefined);
});

test('provider errors and oversized responses fail closed with fixed diagnostics', async () => {
  const sensitiveError = 'synthetic-token-and-untrusted-certificate-detail';
  const failed = provider({ error: sensitiveError });
  const first = await listen(createEgressProxy({ requestImpl: failed.requestImpl }));
  const response = await proxySend(first, 'https://api.mercadopago.com/users/me');
  assert.equal(response.status, 502);
  assert.equal(response.body.includes(sensitiveError), false);
  assert.equal(response.body, '{"code":"QA_PROVIDER_UNAVAILABLE"}');
  const large = provider({ body: 'x'.repeat(65537) });
  const second = await listen(createEgressProxy({ requestImpl: large.requestImpl }));
  const oversized = await proxySend(second, 'https://api.mercadopago.com/users/me');
  assert.equal(oversized.status, 502);
  assert.equal(oversized.body, '{"code":"QA_PROVIDER_BODY_TOO_LARGE"}');
});

test('asks for identity encoding and rejects an unexpectedly compressed provider response', async () => {
  const upstream = provider({ headers: { 'content-encoding': 'gzip' } });
  const server = await listen(createEgressProxy({ requestImpl: upstream.requestImpl }));
  const response = await proxySend(server, 'https://api.mercadopago.com/users/me');
  assert.equal(upstream.calls[0].options.headers['accept-encoding'], 'identity');
  assert.equal(response.status, 502);
  assert.equal(response.body, '{"code":"QA_PROVIDER_RESPONSE_DENIED"}');
});

test('absolute timeout destroys a hung provider request; callers cannot raise the 15-second limit', async () => {
  const upstream = provider({ hang: true });
  const server = await listen(createEgressProxy({ requestImpl: upstream.requestImpl, timeoutMs: 25 }));
  const response = await proxySend(server, 'https://api.mercadopago.com/users/me');
  assert.equal(response.status, 504);
  assert.equal(response.body, '{"code":"QA_PROVIDER_TIMEOUT"}');
  assert.equal(upstream.requests[0].destroyed, true);
  for (const timeoutMs of [0, 15001, Infinity, '15000']) {
    assert.throws(() => createEgressProxy({ timeoutMs }), /QA_PROXY_OPTIONS_INVALID/);
  }
});

test.each(['success', 'failure', 'pending'])('static return accepts %s without reflecting an order or confirming a payment', async (state) => {
  const server = await listen(createReturnServer());
  assert.equal(server.address().address, '127.0.0.1');
  const response = await send(server, `/dashboard/usuario/compras?payment=${state}&order=123456`);
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /^text\/html/);
  assert.equal(response.body.includes('123456'), false);
  assert.match(response.body, /no confirma un pago ni una compra/);
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
});

test('return HEAD and health use fixed content and never set cookies', async () => {
  const server = await listen(createReturnServer());
  const head = await send(server, '/dashboard/usuario/compras?payment=pending&order=1', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
  assert.equal(head.headers['set-cookie'], undefined);
  const health = await send(server, '/healthz');
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { status: 'qa_return_only' });
  assert.equal((await send(server, '/healthz', { method: 'HEAD' })).body, '');
});

test.each([
  '/', '/healthz?x=1', '/users/me', '/products/checkout/mercado-pago/webhook',
  '/dashboard/usuario/compras?payment=approved&order=1',
  '/dashboard/usuario/compras?payment=success&order=0',
  '/dashboard/usuario/compras?payment=success&order=-1',
  '/dashboard/usuario/compras?payment=success&order=2147483648',
  '/dashboard/usuario/compras?payment=success&order=1&token=synthetic',
  '/dashboard/usuario/compras?payment=success&order=1&order=2',
  '/dashboard/usuario/%63ompras?payment=success&order=1',
  'https://outside.invalid/dashboard/usuario/compras?payment=success&order=1',
])('return server denies unrelated or malformed target %s', async (target) => {
  const server = await listen(createReturnServer());
  const response = await send(server, target);
  assert.equal(response.status, 403);
  assert.equal(response.body, '{"code":"QA_RETURN_DENIED"}');
});

test('return server rejects POST rather than receiving webhook or account data', async () => {
  const server = await listen(createReturnServer());
  const response = await send(server, '/dashboard/usuario/compras?payment=success&order=1', {
    method: 'POST', body: '{"synthetic":"not accepted"}',
  });
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, 'GET, HEAD');
  assert.equal(response.body.includes('not accepted'), false);
});

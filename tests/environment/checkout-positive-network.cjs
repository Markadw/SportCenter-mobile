'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');

const MAX_BODY_BYTES = 64 * 1024;
const MAX_TIMEOUT_MS = 15000;
const PROVIDER_HOSTS = new Set(['api.mercadopago.com', 'api.mercadolibre.com']);
const RETURN_HTML = '<!doctype html><html lang="es"><meta charset="utf-8"><title>Retorno de prueba QA</title><h1>Retorno de prueba de Sport Center</h1><p>Esta página no confirma un pago ni una compra. Consulta el estado en el entorno de pruebas autorizado.</p></html>';

function fixedResponse(response, status, code, extraHeaders = {}) {
  if (response.destroyed || response.writableEnded) return;
  const body = Buffer.from(JSON.stringify({ code }));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    connection: 'close',
    ...extraHeaders,
  });
  response.end(body);
}

function denySocket(socket, status = 403) {
  if (socket.destroyed) return;
  if (socket.writableEnded || !socket.writable) return socket.destroy();
  socket.end(`HTTP/1.1 ${status} Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function configureServer(server) {
  server.headersTimeout = MAX_TIMEOUT_MS;
  server.requestTimeout = MAX_TIMEOUT_MS;
  server.timeout = MAX_TIMEOUT_MS;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 24;
  // An opaque tunnel cannot enforce the provider path allowlist.
  server.on('connect', (_request, socket) => denySocket(socket));
  server.on('upgrade', (_request, socket) => denySocket(socket));
  server.on('clientError', (_error, socket) => denySocket(socket, 400));
  server.on('checkContinue', (_request, response) => fixedResponse(response, 417, 'QA_EXPECT_DENIED'));
  return server;
}

function providerTarget(raw, method) {
  if (typeof raw !== 'string' || raw.length > 512) return null;
  const match = /^https:\/\/(api\.mercadopago\.com|api\.mercadolibre\.com)(?::443)?(\/[^?#]*)$/.exec(raw);
  if (!match || !PROVIDER_HOSTS.has(match[1])) return null;
  const hostname = match[1];
  const path = match[2];
  if (method === 'GET' && path === '/users/me') return { hostname, path };
  if (hostname !== 'api.mercadopago.com') return null;
  if (method === 'POST' && path === '/checkout/preferences') return { hostname, path };
  if (method === 'GET' && /^\/checkout\/preferences\/[A-Za-z0-9][A-Za-z0-9_-]{0,179}$/.test(path)) {
    return { hostname, path };
  }
  return null;
}

function createEgressProxy({ requestImpl = https.request, timeoutMs = MAX_TIMEOUT_MS } = {}) {
  if (typeof requestImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new TypeError('QA_PROXY_OPTIONS_INVALID');
  }
  return configureServer(http.createServer({ maxHeaderSize: 8192 }, (request, response) => {
    if (!['GET', 'POST'].includes(request.method)) {
      request.resume();
      return fixedResponse(response, 405, 'QA_METHOD_DENIED', { allow: 'GET, POST' });
    }
    const target = providerTarget(request.url, request.method);
    const authorization = request.headers.authorization;
    if (!target || typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9._~-]{1,1024}$/.test(authorization)
      || request.headers.cookie !== undefined || request.headers['proxy-authorization'] !== undefined) {
      request.resume();
      return fixedResponse(response, 403, 'QA_TARGET_DENIED');
    }
    const length = request.headers['content-length'];
    if (length !== undefined && (!/^\d{1,6}$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
      request.resume();
      return fixedResponse(response, 413, 'QA_BODY_TOO_LARGE');
    }
    if (request.headers['content-encoding'] !== undefined
      || (request.method === 'POST' && !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] || ''))) {
      request.resume();
      return fixedResponse(response, 415, 'QA_CONTENT_TYPE_DENIED');
    }

    let settled = false;
    let upstream;
    let upstreamResponse;
    let timer;
    const stop = () => {
      clearTimeout(timer);
      upstreamResponse?.destroy();
      upstream?.destroy();
    };
    const fail = (status, code) => {
      if (settled) return;
      settled = true;
      stop();
      fixedResponse(response, status, code);
    };
    timer = setTimeout(() => fail(504, 'QA_PROVIDER_TIMEOUT'), timeoutMs);
    timer.unref();
    response.on('close', () => {
      if (!settled) {
        settled = true;
        stop();
      }
    });
    request.on('aborted', () => {
      if (!settled) {
        settled = true;
        stop();
      }
    });
    request.on('error', () => fail(400, 'QA_REQUEST_INVALID'));
    let requestBytes = 0;
    const requestChunks = [];
    request.on('data', (chunk) => {
      if (settled) return;
      requestBytes += chunk.length;
      if (requestBytes > MAX_BODY_BYTES) return fail(413, 'QA_BODY_TOO_LARGE');
      requestChunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      const body = Buffer.concat(requestChunks);
      if (request.method === 'GET' && body.length) return fail(400, 'QA_GET_BODY_DENIED');
      if (request.method === 'POST') {
        try {
          const payload = JSON.parse(body.toString('utf8'));
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail(400, 'QA_JSON_INVALID');
        } catch {
          return fail(400, 'QA_JSON_INVALID');
        }
      }
      const headers = { authorization, accept: 'application/json', 'accept-encoding': 'identity' };
      if (request.method === 'POST') {
        headers['content-type'] = 'application/json';
        headers['content-length'] = body.length;
      }
      try {
        upstream = requestImpl({
          protocol: 'https:', hostname: target.hostname, port: 443,
          servername: target.hostname, path: target.path, method: request.method,
          rejectUnauthorized: true, agent: false, timeout: timeoutMs, headers,
        }, (incoming) => {
          upstreamResponse = incoming;
          if (settled) return incoming.destroy();
          const encoding = incoming.headers?.['content-encoding'];
          if (!Number.isInteger(incoming.statusCode) || incoming.statusCode < 200 || incoming.statusCode > 599
            || (incoming.statusCode >= 300 && incoming.statusCode < 400)
            || (encoding !== undefined && (typeof encoding !== 'string' || encoding.toLowerCase() !== 'identity'))) {
            return fail(502, 'QA_PROVIDER_RESPONSE_DENIED');
          }
          let responseBytes = 0;
          const responseChunks = [];
          incoming.on('data', (chunk) => {
            if (settled) return;
            responseBytes += chunk.length;
            if (responseBytes > MAX_BODY_BYTES) return fail(502, 'QA_PROVIDER_BODY_TOO_LARGE');
            responseChunks.push(chunk);
          });
          incoming.on('aborted', () => fail(502, 'QA_PROVIDER_UNAVAILABLE'));
          incoming.on('error', () => fail(502, 'QA_PROVIDER_UNAVAILABLE'));
          incoming.on('end', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const responseBody = Buffer.concat(responseChunks);
            response.writeHead(incoming.statusCode, {
              'content-type': 'application/json; charset=utf-8',
              'content-length': responseBody.length,
              'cache-control': 'no-store',
              'x-content-type-options': 'nosniff',
              connection: 'close',
            });
            response.end(responseBody);
          });
        });
        upstream.on('error', () => fail(502, 'QA_PROVIDER_UNAVAILABLE'));
        upstream.on('timeout', () => fail(504, 'QA_PROVIDER_TIMEOUT'));
        upstream.end(body);
      } catch {
        fail(502, 'QA_PROVIDER_UNAVAILABLE');
      }
    });
  }));
}

function createReturnServer() {
  return configureServer(http.createServer({ maxHeaderSize: 8192 }, (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      request.resume();
      return fixedResponse(response, 405, 'QA_METHOD_DENIED', { allow: 'GET, HEAD' });
    }
    const match = /^\/dashboard\/usuario\/compras\?payment=(success|failure|pending)&order=([1-9][0-9]{0,9})$/.exec(request.url || '');
    if (request.url !== '/healthz' && (!match || Number(match[2]) > 2147483647)) {
      request.resume();
      return fixedResponse(response, 403, 'QA_RETURN_DENIED');
    }
    const health = request.url === '/healthz';
    const body = Buffer.from(health ? '{"status":"qa_return_only"}' : RETURN_HTML);
    response.writeHead(200, {
      'content-type': health ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      'content-length': body.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      connection: 'close',
    });
    request.resume();
    response.end(request.method === 'HEAD' ? undefined : body);
  }));
}

module.exports = { createEgressProxy, createReturnServer };

if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== 'proxy' || process.env.QA_CHECKOUT_POSITIVE !== 'true'
    || process.platform !== 'linux' || !fs.existsSync('/.dockerenv')) {
    process.stderr.write('QA_CHECKOUT_POSITIVE_PROXY_SCOPE_INVALID\n');
    process.exitCode = 1;
  } else {
    const server = createEgressProxy();
    server.on('error', () => {
      process.stderr.write('QA_CHECKOUT_POSITIVE_PROXY_UNAVAILABLE\n');
      process.exitCode = 1;
    });
    server.listen(8080, '0.0.0.0');
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        server.closeAllConnections();
        server.close();
      });
    }
  }
}

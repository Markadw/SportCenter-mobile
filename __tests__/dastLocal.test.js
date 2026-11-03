/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
const { describe, test, expect, jest } = require('@jest/globals');
const { EventEmitter } = require('node:events');
const { TARGET, CASES, MAX_BYTES, validateScope, readResponse, inspectResponse, runDast, main } = require('../scripts/dast-local');
const { forwardedHeaders, createGateway } = require('../tests/environment/access.cjs');
const backend = require('../tests/environment/backend-source.json');
const { dastSummary } = require('../scripts/write-api-summary');

const env = { ISOLATED_DAST: 'true', API_BASE_URL: TARGET, GITHUB_SHA: 'a'.repeat(40) };
const proof = { ready: true, apiUrl: TARGET, backendCommit: backend.commit, productId: 66, seed: { products: 100, variants: 200 } };
const response = (item, data) => ({ status: item.status[0], contentType: 'application/json; charset=utf-8',
  body: JSON.stringify(data ?? (item.baseline ? [{ id_producto: 66 }] : { statusCode: item.status[0], message: 'Solicitud rechazada', error: 'Error' })) });

describe('DAST HTTP finito en backend QA, nunca un escáner productivo', () => {
  test.each(['https://back-sport-ghxk.onrender.com', 'http://localhost:3011', 'http://127.0.0.1:3011@evil.test',
    TARGET + '/', TARGET + '?next=https://evil.test', TARGET + '#fragment', 'http://127.0.0.1:8081'])('rechaza destino %s antes de enviar solicitudes', async address => {
    const request = jest.fn();
    await expect(runDast({ env: { ...env, API_BASE_URL: address }, proof, request })).rejects.toThrow('LOCAL_SCOPE_REQUIRED');
    expect(request).not.toHaveBeenCalled();
  });
  test.each([{ ...env, ISOLATED_DAST: 'false' }, { ...env, GITHUB_SHA: 'not-a-commit' }])('exige intención local y revisión móvil explícitas', value => {
    expect(() => validateScope(value, proof)).toThrow();
  });
  test.each([{ ...proof, ready: false }, { ...proof, backendCommit: 'b'.repeat(40) }, { ...proof, productId: 1 },
    { ...proof, apiUrl: 'https://evil.test' }, { ...proof, seed: { products: 0, variants: 0 } }])('rechaza procedencia local incompleta', value => {
    expect(() => validateScope(env, value)).toThrow('LOCAL_PROVENANCE_REQUIRED');
  });
  test('ejecuta sólo los seis casos fijados y distingue ausencia, formato y alg:none', async () => {
    const request = jest.fn(async item => response(item));
    const result = await runDast({ env, proof, request });
    expect(result).toMatchObject({ status: 'passed_for_executed_scope', expectedChecks: 6, executedChecks: 6,
      mobileCommit: env.GITHUB_SHA, backendCommit: backend.commit });
    expect(request.mock.calls.map(args => args[0])).toEqual(CASES);
    expect(CASES[1].authorization).toBeUndefined();
    expect(CASES[2].authorization).toBe('Bearer not-a-jwt');
    expect(JSON.parse(Buffer.from(CASES[3].authorization.split(' ')[1].split('.')[0], 'base64url'))).toEqual({ alg: 'none', typ: 'JWT' });
    expect(JSON.stringify(result)).not.toContain('Bearer');
    expect(JSON.stringify(result)).not.toContain('id_usuario');
  });
  test('un control público fallido bloquea los otros casos sin falsear su ejecución', async () => {
    const request = jest.fn(async () => ({ status: 503 }));
    const result = await runDast({ env, proof, request });
    expect(request).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'failed', executedChecks: 1, checks: [{ id: 'D01', reason: 'UNEXPECTED_HTTP_STATUS' }] });
  });
  test.each([200, 302, 404, 429, 500])('el perfil privado con HTTP %i no acredita rechazo seguro', status => {
    expect(() => inspectResponse(CASES[2], { ...response(CASES[2]), status })).toThrow('UNEXPECTED_HTTP_STATUS');
  });
  test.each(['<html>error</html>', 'not-json', 'null'])('rechaza contenido inesperado sin conservarlo: %s', body => {
    expect(() => inspectResponse(CASES[2], { ...response(CASES[2]), body })).toThrow();
  });
  test('rechaza HTML y un producto distinto a la semilla conocida', () => {
    expect(() => inspectResponse(CASES[2], { ...response(CASES[2]), contentType: 'text/html' })).toThrow('JSON_RESPONSE_REQUIRED');
    expect(() => inspectResponse(CASES[0], response(CASES[0], [{ id_producto: 77 }]))).toThrow('SYNTHETIC_PRODUCT_NOT_CONFIRMED');
  });
  test.each(['passw', 'passwordHash', 'refreshToken', 'access_token', 'sessionId', 'stack', 'query', 'parameters'])('detecta campo interno %s sin publicar su valor', async key => {
    const request = async item => response(item, item.baseline ? undefined : { [key]: 'secret-do-not-publish' });
    const result = await runDast({ env, proof, request });
    expect(result.status).toBe('failed');
    expect(result.checks[1].reason).toBe('SENSITIVE_FIELD_EXPOSED');
    expect(JSON.stringify(result)).not.toContain('secret-do-not-publish');
  });
  test.each(['QueryFailedError: SQL', 'at fn (/app/src/controller.js:1:2)', 'C:\\Users\\name\\secret', 'node_modules/typeorm',
    '-----BEGIN RSA PRIVATE KEY-----'])('detecta indicio de detalles internos: %s', value => {
    expect(() => inspectResponse(CASES[1], response(CASES[1], { message: value }))).toThrow('INTERNAL_DETAIL_EXPOSED');
  });
  test('un fallo de red no incluye mensajes, URL, JWT o cuerpo crudos', async () => {
    const result = await runDast({ env, proof, request: async () => { throw new Error('https://signed.test?secret=value Bearer credential'); } });
    expect(result.checks[0].reason).toBe('UNVERIFIED_RESPONSE');
    expect(JSON.stringify(result)).not.toMatch(/signed|credential|secret=value/);
  });
  test('limita tamaño y complejidad del JSON', () => {
    expect(() => inspectResponse(CASES[1], { ...response(CASES[1]), body: ' '.repeat(MAX_BYTES + 1) })).toThrow('RESPONSE_TOO_LARGE');
    expect(() => inspectResponse(CASES[1], response(CASES[1], Array.from({ length: 1001 }, () => 1)))).toThrow('PAYLOAD_TOO_COMPLEX');
  });
  test('el transporte fija loopback, GET y seis rutas, sin seguir redirecciones', async () => {
    const transport = jest.fn((options, receive) => {
      const request = new EventEmitter(); request.destroy = jest.fn();
      request.end = () => { const result = new EventEmitter(); result.statusCode = 302;
        result.headers = { 'content-type': 'application/json', location: 'https://evil.test' };
        receive(result); result.emit('data', Buffer.from('{}')); result.emit('end'); };
      return request;
    });
    const received = await readResponse(CASES[2], transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toMatchObject({ hostname: '127.0.0.1', port: 3011, method: 'GET',
      path: '/users/profile', headers: { authorization: 'Bearer not-a-jwt' } });
    expect(() => inspectResponse(CASES[2], received)).toThrow('UNEXPECTED_HTTP_STATUS');
    expect(() => readResponse({ ...CASES[2] }, transport)).toThrow('REQUEST_NOT_ALLOWLISTED');
  });
  test('el transporte corta una respuesta que excede el límite', async () => {
    let request;
    const transport = (_options, receive) => {
      request = new EventEmitter(); request.destroy = jest.fn();
      request.end = () => { const result = new EventEmitter(); result.destroy = jest.fn();
        result.headers = {}; receive(result); result.emit('data', Buffer.alloc(MAX_BYTES + 1)); };
      return request;
    };
    await expect(readResponse(CASES[1], transport)).rejects.toThrow('RESPONSE_TOO_LARGE');
    expect(request.destroy).toHaveBeenCalled();
  });
  test('una procedencia ausente sustituye el informe anterior por un fallo saneado', async () => {
    const writes = new Map(), calls = [];
    const io = { mkdirSync: jest.fn(), rmSync: file => calls.push(['remove', file]),
      readFileSync: () => { throw new Error('secret-private-path'); },
      writeFileSync: (file, value) => { calls.push(['write', file]); writes.set(file, value); } };
    await expect(main(env, io)).rejects.toThrow('LOCAL_DAST_NOT_PASSED');
    expect(calls[0]).toEqual(['remove', 'test-results/security/dast-local.json']);
    expect(JSON.parse(writes.get('test-results/security/dast-local.json'))).toMatchObject({ status: 'failed', executedChecks: 0, reason: 'LOCAL_PREFLIGHT_FAILED' });
    expect([...writes.values()].join('')).not.toContain('secret-private-path');
  });
});

describe('Gateway QA de lectura: Authorization explícita, sin cookies ni destino externo', () => {
  test('reenvía exactamente el Bearer sintético y Accept, sin propagar cookies u otros encabezados', () => {
    expect(forwardedHeaders({ authorization: CASES[3].authorization, cookie: 'secret-cookie', host: 'evil.test',
      'x-forwarded-for': 'evil' })).toEqual({ accept: 'application/json', authorization: CASES[3].authorization });
    expect(forwardedHeaders({})).toEqual({ accept: 'application/json' });
  });
  test.each(['Basic abc', 'Bearer a\r\nx: value', 'Bearer ' + 'a'.repeat(2048), ['Bearer a'], 'Bearer a b'])('rechaza encabezados no permitidos', authorization => {
    expect(forwardedHeaders({ authorization })).toBeNull();
  });
  test('la petición upstream conserva api:3000 y GET con el token de la prueba', () => {
    const upstream = new EventEmitter(); upstream.end = jest.fn();
    const send = jest.fn(() => upstream), server = createGateway(send);
    const handler = server.listeners('request')[0];
    handler({ method: 'GET', url: '/users/profile', headers: { authorization: CASES[2].authorization } }, {});
    expect(send.mock.calls[0][0]).toMatchObject({ hostname: 'api', port: 3000, method: 'GET', path: '/users/profile',
      headers: { authorization: CASES[2].authorization } });
    expect(upstream.end).toHaveBeenCalledTimes(1);
    server.close();
  });
  test('bloquea escrituras y encabezados inválidos antes de abrir upstream', () => {
    const send = jest.fn(), server = createGateway(send), handler = server.listeners('request')[0];
    const result = { writeHead: jest.fn(), end: jest.fn() };
    handler({ method: 'POST', url: '/users/create-user', headers: {} }, result);
    handler({ method: 'GET', url: '/users/profile', headers: { authorization: 'Basic secret' } }, result);
    expect(result.writeHead.mock.calls).toEqual([[405], [400]]);
    expect(send).not.toHaveBeenCalled(); server.close();
  });
});

describe('Resultado DAST explícito en el resumen HTTP', () => {
  test('reconoce sólo seis casos íntegros y un paso aprobado', async () => {
    const report = await runDast({ env, proof, request: async item => response(item) });
    expect(dastSummary(report, 'success')).toContain('aprobado para seis casos locales');
    for (const outcome of ['failure', 'skipped', 'cancelled', 'unexpected-secret']) {
      expect(dastSummary(report, outcome)).toContain('sin aprobación acreditada');
    }
    expect(dastSummary(report, 'unexpected-secret')).not.toContain('unexpected-secret');
  });
  test.each([null, {}, { version: 1, status: 'passed_for_executed_scope', expectedChecks: 6, executedChecks: 0, checks: [] }])('no transforma un informe ausente o incompleto en verde', report => {
    expect(dastSummary(report, 'success')).toContain('sin aprobación acreditada');
  });
  test('no acepta un caso sustituido ni incorpora campos crudos al resumen', async () => {
    const report = await runDast({ env, proof, request: async item => response(item) });
    report.checks[1] = { ...report.checks[1], id: 'secret-body', body: 'secret-private-data' };
    const text = dastSummary(report, 'success');
    expect(text).toContain('sin aprobación acreditada');
    expect(text).not.toMatch(/secret-body|secret-private-data/);
  });
});

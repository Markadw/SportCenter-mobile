const http = require('node:http');
function forwardedHeaders(headers) {
  const result = { accept: 'application/json' };
  const authorization = headers.authorization;
  if (authorization !== undefined) {
    if (typeof authorization !== 'string' || authorization.length > 2048 ||
      !/^Bearer [A-Za-z0-9._~-]+$/.test(authorization)) return null;
    result.authorization = authorization;
  }
  return result;
}
function createGateway(requestUpstream = http.request) {
  return http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method) || !request.url.startsWith('/')) {
    response.writeHead(405); response.end(); return;
  }
  const headers = forwardedHeaders(request.headers);
  if (!headers) { response.writeHead(400); response.end(); return; }
  const upstream = requestUpstream({ hostname: 'api', port: 3000, path: request.url,
    method: request.method, headers, timeout: 15000 }, (result) => {
    response.writeHead(result.statusCode, result.headers);
    result.pipe(response);
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(503);
    response.end();
  });
  upstream.end();
  });
}
// Compose publishes this container port only on host 127.0.0.1:3011.
if (require.main === module) {
  if (process.env.ISOLATED_TEST_ENV === 'true' && process.env.QA_COMMERCE === 'true') {
    // Sólo QA sintética: no amplía el gateway GET/HEAD por defecto.
    require('./commerce-isolated.cjs').createGateway().listen(3000, '0.0.0.0');
  } else {
    createGateway().listen(3000, '0.0.0.0');
  }
}
module.exports = { forwardedHeaders, createGateway };

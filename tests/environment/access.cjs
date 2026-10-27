const http = require('node:http');
http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method) || !request.url.startsWith('/')) {
    response.writeHead(405); response.end(); return;
  }
  const upstream = http.request({ hostname: 'api', port: 3000, path: request.url,
    method: request.method, headers: { accept: 'application/json' }, timeout: 15000 }, (result) => {
    response.writeHead(result.statusCode, result.headers);
    result.pipe(response);
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(503);
    response.end();
  });
  upstream.end();
}).listen(3000, '0.0.0.0');

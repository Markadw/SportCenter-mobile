const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function validatedAndroidNetwork(output) {
  const active = output.match(/Active default network:\s*(\d+)/)?.[1];
  if (!active) return false;
  const network = output.split(/\r?\n/).find((line) =>
    line.includes('NetworkAgentInfo') && line.includes(`network{${active}}`));
  return !!network && /\bINTERNET\b/.test(network) && /\bVALIDATED\b/.test(network);
}

async function waitForService({ apiUrl, android = false, timeout = 90000,
  fetchApi = globalThis.fetch, now = Date.now,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  readNetwork = () => execFileSync('adb', ['shell', 'dumpsys', 'connectivity'], { encoding: 'utf8', timeout: 5000 }),
}) {
  const base = new URL(apiUrl);
  assert.ok(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password
    && !base.search && !base.hash, 'API_BASE_URL debe ser HTTP sin credenciales ni parámetros.');
  const endpoint = `${base.toString().replace(/\/+$/, '')}/products/get-all-products`;
  const started = now();
  const deadline = started + timeout;
  let attempts = 0;
  let reason = 'No se recibió respuesta del catálogo';
  while (now() < deadline) {
    let networkReady = !android;
    if (android) {
      try { networkReady = validatedAndroidNetwork(readNetwork()); }
      catch { networkReady = false; }
    }
    if (!networkReady) {
      reason = 'El emulador aún no tiene una red predeterminada con INTERNET y VALIDATED';
    } else if (now() < deadline) {
      attempts += 1;
      let response;
      try {
        response = await fetchApi(endpoint, { redirect: 'error',
          signal: AbortSignal.timeout(Math.min(30000, Math.max(1, deadline - now()))) });
      } catch (error) {
        reason = `No se pudo conectar con la API (${error?.name || 'error de red'})`;
      }
      if (response) {
        if (response.status === 200) {
          const products = await response.json();
          assert.ok(Array.isArray(products) && products.length > 0,
            'La API respondió 200, pero no devolvió un catálogo JSON con productos.');
          return { ready: true, android, attempts, elapsedMs: now() - started,
            status: response.status, products: products.length };
        }
        const status = response.status;
        await response.body?.cancel();
        assert.ok([502, 503, 504].includes(status), `La API respondió HTTP ${status}; revisar el entorno antes de probar.`);
        reason = `La API aún no está disponible (HTTP ${status})`;
      }
    }
    const remaining = deadline - now();
    if (remaining > 0) await pause(Math.min(3000, remaining));
  }
  throw new Error(`Preparación agotó ${timeout / 1000} segundos: ${reason}. No acredita pruebas aprobadas.`);
}

async function main() {
  const android = process.argv.includes('--android');
  const file = `test-results/readiness-${android ? 'android' : 'api'}.json`;
  fs.mkdirSync('test-results', { recursive: true });
  let result;
  try {
    result = await waitForService({ apiUrl: process.env.API_BASE_URL, android });
    console.log(`Entorno preparado: API HTTP 200, ${result.products} productos${android ? ' y red Android validada' : ''}. Espera: ${result.elapsedMs} ms.`);
  } catch (error) {
    result = { ready: false, android, reason: error.message };
    console.error(error.message);
    process.exitCode = 1;
  }
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
}
module.exports = { validatedAndroidNetwork, waitForService };
if (require.main === module) main();

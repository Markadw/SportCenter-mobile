'use strict';
// PREPARACION PRIVADA: no arranca Docker ni Expo. Sólo QA sintética aislada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const PIN = '31ee304d902ec5ec5a9c0fc702eca5e1a531bc16';
const BASE = 'http://127.0.0.1:3011';
const ORIGIN = 'http://localhost:4200';
// Deliberadamente sintética y exclusiva del compose; jamás usar esta cuenta fuera de QA.
const QA_PASSWORD = 'QaOnly-Commerce!47';
const USERS = Object.freeze(['commerce-a@qa.invalid', 'commerce-b@qa.invalid']);
const MAX_BODY = 16384;
const MAX_RESPONSE = 2 * 1024 * 1024;
function commerceEnabled(env) { return env.ISOLATED_TEST_ENV === 'true' && env.QA_COMMERCE === 'true'; }
const ROUTES = Object.freeze({
  GET: [ /^\/users\/profile$/, /^\/products\/orders\/user$/,
    /^\/products\/cart$/,
    /^\/products\/checkout\/summary$/,
    /^\/products\/orders\/91000[12]\/tracking$/,
    /^\/products\/reviews\/product\/6[68](?:\/eligibility)?$/,
    /^\/products\/get-product-details\/6[68]$/,
    /^\/products\/(?:get-all-products|get-all-categories|get-all-marcas|menu\/sports)$/ ],
  POST: [ /^\/users\/(?:login-user|logout|refresh-token)$/, /^\/products\/reviews$/ ],
});
function allowed(method, target) {
  if (typeof target !== 'string' || target.length > 2048 || !target.startsWith('/') ||
      target.startsWith('//') || /[%\\#\r\n]/.test(target.split('?')[0])) return false;
  let u; try { u = new URL(target, BASE); } catch { return false; }
  if(u.pathname==='/products/checkout/summary' && [...u.searchParams].some(([k,v])=>k!=='id_metodo_envio'||v!=='910001'))return false;
  return u.origin === BASE && (ROUTES[method] || []).some(re => re.test(u.pathname));
}
function safeHeaders(headers) {
  if (headers.origin !== undefined && headers.origin !== ORIGIN) return null;
  const result = { accept: 'application/json' };
  if (headers.origin) result.origin = ORIGIN;
  if (headers.authorization !== undefined) {
    if (typeof headers.authorization !== 'string' || headers.authorization.length > 2048 ||
        !/^Bearer [A-Za-z0-9._~-]+$/.test(headers.authorization)) return null;
    result.authorization = headers.authorization;
  }
  return result;
}
function validBody(target, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const keys = Object.keys(body).sort().join(',');
  if (target === '/users/login-user') return keys === 'email,passw' && USERS.includes(body.email) && body.passw === QA_PASSWORD;
  if (target === '/users/logout') return keys === '';
  if (target === '/users/refresh-token') return keys === 'refreshToken' && typeof body.refreshToken === 'string' && body.refreshToken.length <= 2048;
  // Permite los valores inválidos de rating/comentario de los casos negativos; valida el servidor real.
  if (target === '/products/reviews') return keys === 'calificacion,comentario,id_producto' && [66,68].includes(body.id_producto) &&
    Number.isFinite(body.calificacion) && typeof body.comentario === 'string' && body.comentario.length <= 1000;
  return false;
}
function guardConfig(config, source) {
  assert.equal(source.commit, PIN, 'QA_SOURCE_REQUIRED');
  assert.equal(config.name, 'sportcenter-mobile-qa', 'QA_PROJECT_REQUIRED');
  assert.equal(config.networks.isolated.internal, true, 'QA_INTERNAL_REQUIRED');
  const nets = s => Array.isArray(s.networks) ? s.networks : Object.keys(s.networks || {});
  for (const name of ['api','db']) {
    assert.deepEqual(nets(config.services[name]), ['isolated'], 'QA_INTERNAL_REQUIRED');
    assert.equal((config.services[name].ports || []).length, 0, 'QA_UNPUBLISHED_REQUIRED');
  }
  const env = config.services.api.environment;
  assert.equal(env.ISOLATED_TEST_ENV, 'true', 'QA_FLAG_REQUIRED');
  for (const role of ['ADMIN','EDITOR','READER','BACKUP']) {
    const u = new URL(env['DATABASE_URL_' + role]);
    assert.equal(u.hostname, 'db', 'QA_DATABASE_REQUIRED');
    assert.equal(u.pathname, '/sportcenter_qa', 'QA_DATABASE_REQUIRED');
  }
  assert.ok(!Object.keys(env).some(k => /MERCADO_PAGO|SMTP|EMAIL_PASS|MAIL_PASSWORD/.test(k)), 'QA_NO_PROVIDER_REQUIRED');
  assert.equal(config.services.api.image, 'sportcenter-local-qa:31ee304d902e', 'QA_IMAGE_REQUIRED');
  assert.ok(commerceEnabled(config.services.access.environment || {}), 'QA_COMMERCE_FLAG_REQUIRED');
  const ports = config.services.access.ports;
  assert.equal(ports.length, 1, 'QA_LOOPBACK_REQUIRED');
  const p = ports[0];
  assert.ok(typeof p === 'string' ? p === '127.0.0.1:3011:3000' : p.host_ip === '127.0.0.1' && Number(p.published) === 3011 && Number(p.target) === 3000, 'QA_LOOPBACK_REQUIRED');
  return true;
}
function buildFixtureSql(hash) {
  assert.match(hash, /^\$2[aby]\$10\$[A-Za-z0-9./]{53}$/, 'QA_HASH_REQUIRED');
  return fs.readFileSync(path.join(__dirname, 'commerce-fixtures.sql'), 'utf8').replaceAll('__QA_BCRYPT__', hash);
}
function createGateway(requestUpstream = http.request) {
  assert.ok(commerceEnabled(process.env), 'QA_COMMERCE_FLAG_REQUIRED');
  return http.createServer(async (req,res) => {
    const end = (status) => { res.writeHead(status); res.end(); };
    const preflight = req.method === 'OPTIONS';
    const method = preflight ? req.headers['access-control-request-method'] : req.method;
    if (!allowed(method, req.url)) { end(405); return; }
    const headers = safeHeaders(req.headers);
    if (!headers) { end(403); return; }
    // CORS fijo local, no refleja orígenes arbitrarios ni habilita proxy hacia hosts externos.
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', ORIGIN);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (preflight) { end(204); return; }
    let body = Buffer.alloc(0);
    try {
      for await (const chunk of req) {
        if (body.length + chunk.length > MAX_BODY) { end(413); return; }
        body = Buffer.concat([body, chunk]);
      }
      if (req.method === 'POST') {
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '') ||
            !validBody(new URL(req.url, BASE).pathname, JSON.parse(body.toString('utf8')))) { end(400); return; }
        headers['content-type'] = 'application/json';
        headers['content-length'] = String(body.length);
      } else if (body.length) { end(400); return; }
    } catch { end(400); return; }
    const upstream = requestUpstream({hostname:'api',port:3000,path:req.url,method:req.method,headers,timeout:15000}, response => {
      let size=0;
      // No cookies: login/refresh expone tokens en JSON como el cliente móvil, sólo memoria.
      res.writeHead(response.statusCode || 502, {'content-type':'application/json'});
      response.on('data', chunk => { size+=chunk.length; if(size>MAX_RESPONSE){response.destroy();res.destroy();}else res.write(chunk); });
      response.on('end',()=>res.end());
      response.on('error',()=>res.destroy());
    });
    upstream.on('timeout',()=>upstream.destroy());
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end();});
    upstream.end(body.length ? body : undefined);
  });
}
async function readJson(response) {
  assert.ok(!response.redirected, 'QA_REDIRECT_REJECTED');
  const reader = response.body?.getReader();
  assert.ok(reader, 'QA_BODY_REQUIRED');
  let size=0; const chunks=[];
  try { for(;;){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;assert.ok(size<=MAX_RESPONSE,'QA_BODY_LIMIT');chunks.push(Buffer.from(x.value));} }
  finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  const text=Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : null;
}
async function runAcceptance({fetchImpl=globalThis.fetch}={}) {
  if(fetchImpl===globalThis.fetch)assert.ok(commerceEnabled(process.env),'QA_COMMERCE_FLAG_REQUIRED');
  const report={schemaVersion:1,scope:'real-local-backend-synthetic-data-not-payment',status:'failed',cases:[],logout:[false,false],errorCode:'NONE'};
  const tokens=[];
  async function call(method,target,token,body){
    assert.ok(allowed(method,target),'QA_ROUTE_REQUIRED');
    const response=await fetchImpl(BASE+target,{method,redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await readJson(response)};
  }
  const record=(id,condition)=>{report.cases.push({id,status:condition?'passed':'failed'});assert.ok(condition,'QA_ASSERTION_FAILED');};
  try {
    for(const email of USERS){const r=await call('POST','/users/login-user',null,{email,passw:QA_PASSWORD});
      if(typeof r.data?.accessToken==='string' && /^[A-Za-z0-9._~-]+$/.test(r.data.accessToken))tokens.push(r.data.accessToken);
      assert.ok(r.status>=200&&r.status<300&&tokens.length===USERS.indexOf(email)+1&&typeof r.data?.sessionId==='string'&&typeof r.data?.refreshToken==='string','QA_LOGIN_FAILED');}
    const a=await call('GET','/products/orders/user',tokens[0]);
    const b=await call('GET','/products/orders/user',tokens[1]);
    record('IQ01_OWN_LISTS',a.status===200&&b.status===200&&a.data.length===1&&b.data.length===1&&a.data[0].id_orden===910001&&b.data[0].id_orden===910002);
    const own=await call('GET','/products/orders/910001/tracking',tokens[0]);
    record('IQ02_DETAIL_TIMELINE',own.status===200&&own.data.id_orden===910001&&own.data.estado_pedido==='entregado'&&own.data.eventos_envio.length===2&&!Object.hasOwn(own.data,'codigo_confirmacion_entrega'));
    const cross=await call('GET','/products/orders/910001/tracking',tokens[1]);
    record('IQ03_OTHER_OWNER_DENIED',cross.status===400);
    const ea=await call('GET','/products/reviews/product/68/eligibility',tokens[0]);
    const eb=await call('GET','/products/reviews/product/68/eligibility',tokens[1]);
    record('IQ04_ELIGIBILITY_OWNER',ea.status===200&&ea.data.canReview===true&&ea.data.hasDeliveredPurchase===true&&ea.data.hasReview===false&&eb.status===200&&eb.data.canReview===false&&eb.data.hasDeliveredPurchase===false);
    const denied=await call('POST','/products/reviews',tokens[1],{id_producto:68,calificacion:4,comentario:'Resena sintetica de prueba sin elegibilidad.'});
    record('IQ05_INELIGIBLE_POST_DENIED',denied.status===400);
    const invalid=await call('POST','/products/reviews',tokens[0],{id_producto:68,calificacion:0,comentario:'Comentario sintetico de prueba.'});
    record('IQ06_INVALID_RATING_DENIED',invalid.status===400);
    const short=await call('POST','/products/reviews',tokens[0],{id_producto:68,calificacion:4,comentario:'Corto'});
    record('IQ07_SHORT_COMMENT_DENIED',short.status===400);
    const created=await call('POST','/products/reviews',tokens[0],{id_producto:68,calificacion:4,comentario:'Resena sintetica QA creada en servidor local aislado.'});
    record('IQ08_REVIEW_PERSISTED',created.status===201&&created.data.id_usuario===910001&&created.data.id_producto===68&&created.data.calificacion===4);
    const duplicate=await call('POST','/products/reviews',tokens[0],{id_producto:68,calificacion:4,comentario:'Segundo comentario sintetico de prueba.'});
    record('IQ09_DUPLICATE_DENIED',duplicate.status===400);
    const after=await call('GET','/products/reviews/product/68/eligibility',tokens[0]);
    record('IQ10_AFTER_PUBLICATION',after.status===200&&after.data.canReview===false&&after.data.hasReview===true);
    const list=await call('GET','/products/reviews/product/68');
    record('IQ11_PUBLIC_READ_SUMMARY',list.status===200&&list.data.reviews.length===1&&list.data.reviews[0].id_usuario===910001&&list.data.summary.total===1&&list.data.summary.promedio===4);
    const checkout=await call('GET','/products/checkout/summary',tokens[0]);
    record('IQ12_ADDRESS_CHECKOUT_READ_ONLY',checkout.status===200&&checkout.data.addresses.length===1&&checkout.data.addresses[0].id_usuario===910001&&checkout.data.cart.items.length===1&&checkout.data.cart.items[0].cantidad===1&&checkout.data.totals.total===166);
    report.status='passed';
  } catch { report.status='failed';report.errorCode='QA_ACCEPTANCE_FAILED'; }
  finally { for(let i=0;i<tokens.length;i++){try{const r=await call('POST','/users/logout',tokens[i],{});report.logout[i]=r.status>=200&&r.status<300;}catch{report.logout[i]=false;}} }
  if(!report.logout.every(Boolean)){report.status='failed';report.errorCode='QA_LOGOUT_UNCONFIRMED';}
  return report;
}
function readConfig(repo) {
  const file=path.join(repo,'tests/environment/compose.yml');
  const raw=execFileSync('docker',['compose','-f',file,'config','--format','json'],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000});
  const source=JSON.parse(fs.readFileSync(path.join(repo,'tests/environment/backend-source.json'),'utf8'));
  const config=JSON.parse(raw);guardConfig(config,source);return {file,config};
}
async function runReadyAcceptance({waitForService,fetchImpl=globalThis.fetch}={}) {
  const wait = waitForService || require('../../scripts/wait-for-service').waitForService;
  const ready = await wait({apiUrl:BASE,timeout:30000});
  assert.equal(ready.ready,true,'QA_GATEWAY_NOT_READY');
  return runAcceptance({fetchImpl});
}
async function main() {
  assert.ok(commerceEnabled(process.env),'QA_COMMERCE_FLAG_REQUIRED');
  const mode=process.argv[2];
  if(mode==='gateway'){createGateway().listen(3000,'0.0.0.0');return;}
  const repo=path.resolve(process.argv[3]||'');
  const {file}=readConfig(repo);
  // Comprueba checkout ya existente, sin clonar ni cambiar Git.
  const head=execFileSync('git',['-C',path.join(repo,'.qa/backend'),'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  assert.equal(head,PIN,'QA_CHECKOUT_REQUIRED');
  const dirty=execFileSync('git',['-C',path.join(repo,'.qa/backend'),'status','--porcelain'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  assert.equal(dirty,'','QA_CHECKOUT_DIRTY');
  if(mode==='seed'){
    const hash=execFileSync('docker',['compose','-f',file,'exec','-T','api','node'],{input:"require('bcrypt').hash("+JSON.stringify(QA_PASSWORD)+",10).then(x=>process.stdout.write(x));",encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000}).trim();
    const sql=buildFixtureSql(hash);
    execFileSync('docker',['compose','-f',file,'exec','-T','db','psql','-X','-v','ON_ERROR_STOP=1','-U','qa_admin','-d','sportcenter_qa'],{input:sql,stdio:['pipe','pipe','pipe'],timeout:30000});
    process.stdout.write(JSON.stringify({scope:'synthetic-local-only',status:'seeded',backendCommit:PIN})+'\n');return;
  }
  assert.equal(mode,'check','QA_MODE_REQUIRED');
  const report=await runReadyAcceptance();
  fs.mkdirSync(path.join(repo,'test-results'),{recursive:true});
  fs.writeFileSync(path.join(repo,'test-results','commerce-api.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify({status:report.status,caseCount:report.cases.length,logoutConfirmed:report.logout.every(Boolean),scope:report.scope})+'\n');
  if(report.status!=='passed')process.exitCode=1;
}
module.exports={PIN,BASE,ORIGIN,USERS,QA_PASSWORD,commerceEnabled,allowed,safeHeaders,validBody,guardConfig,buildFixtureSql,createGateway,runAcceptance,runReadyAcceptance};
if(require.main===module)main().catch(()=>{process.stderr.write('QA_PREPARATION_FAILED\n');process.exitCode=1;});

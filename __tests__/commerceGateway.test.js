/** @jest-environment node */
'use strict';
const {test}=require('@jest/globals');
const assert=require('node:assert/strict');
const {PIN,BASE,USERS,QA_PASSWORD,commerceEnabled,allowed,safeHeaders,validBody,guardConfig,buildFixtureSql,createGateway,runAcceptance,runReadyAcceptance}=require('../tests/environment/commerce-isolated.cjs');
function config(){return {name:'sportcenter-mobile-qa',networks:{isolated:{internal:true}},services:{
  db:{networks:['isolated']},api:{networks:['isolated'],image:'sportcenter-local-qa:31ee304d902e',environment:{ISOLATED_TEST_ENV:'true',
    ...Object.fromEntries(['ADMIN','EDITOR','READER','BACKUP'].map(x=>['DATABASE_URL_'+x,'postgres://qa:synthetic@db:5432/sportcenter_qa']))}},
  access:{environment:{ISOLATED_TEST_ENV:'true',QA_COMMERCE:'true'},ports:['127.0.0.1:3011:3000']}}};}
function response(status,data){let done=false;return {status,redirected:false,body:{getReader:()=>({read:async()=>done?{done:true}:(done=true,{done:false,value:Buffer.from(JSON.stringify(data))}),cancel:async()=>{},releaseLock(){}})}};}
function mock({ambiguous=false,invalidSession=false}={}){const calls=[];let published=false;const fetchImpl=async(url,init)=>{
  assert.ok(url.startsWith(BASE+'/'));const p=new URL(url).pathname;const b=init.body?JSON.parse(init.body):null;calls.push({p,method:init.method,b});
  if(p==='/users/login-user')return response(201,{accessToken:b.email===USERS[0]?'token-a':'token-b',refreshToken:'refresh',sessionId:invalidSession?null:'session'});
  if(p==='/users/logout')return response(201,{message:'ok'});
  if(p==='/products/orders/user')return response(200,[{id_orden:init.headers.Authorization==='Bearer token-a'?910001:910002}]);
  if(p==='/products/orders/910001/tracking')return init.headers.Authorization==='Bearer token-a'?response(200,{id_orden:910001,estado_pedido:'entregado',eventos_envio:[{},{}]}):response(400,{});
  if(p.endsWith('/eligibility')){const owner=init.headers.Authorization==='Bearer token-a';return response(200,{canReview:owner&&!published,hasDeliveredPurchase:owner,hasReview:owner&&published});}
  if(p==='/products/reviews'&&init.headers.Authorization==='Bearer token-b')return response(400,{});
  if(p==='/products/reviews'&&(b.calificacion===0||b.comentario.length<10))return response(400,{});
  if(p==='/products/reviews'){if(ambiguous)throw Error('not returned');if(published)return response(400,{});published=true;return response(201,{id_usuario:910001,id_producto:68,calificacion:4});}
  if(p==='/products/reviews/product/68')return response(200,{reviews:[{id_usuario:910001}],summary:{total:1,promedio:4}});
  if(p==='/products/checkout/summary')return response(200,{addresses:[{id_usuario:910001}],cart:{items:[{cantidad:1}]},totals:{total:166}});
  throw Error('UNEXPECTED_MOCK_ROUTE');
};return {fetchImpl,calls};}
test('allowlist admits only the planned own-order and review contracts',()=>{
  for(const p of ['/products/orders/user','/products/orders/910001/tracking','/products/reviews/product/68/eligibility','/products/reviews/product/66','/users/profile','/products/cart','/products/checkout/summary','/products/checkout/summary?id_metodo_envio=910001'])assert.equal(allowed('GET',p),true);
  assert.equal(allowed('GET','/products/checkout/summary?codigo_promocion=anything'),false);
  for(const p of ['/users/login-user','/users/logout','/users/refresh-token','/products/reviews'])assert.equal(allowed('POST',p),true);
});
test('commerce requires both explicit exact flags; default remains disabled',()=>{
  assert.equal(commerceEnabled({}),false);assert.equal(commerceEnabled({ISOLATED_TEST_ENV:'true'}),false);
  assert.equal(commerceEnabled({QA_COMMERCE:'true'}),false);assert.equal(commerceEnabled({ISOLATED_TEST_ENV:'true',QA_COMMERCE:'TRUE'}),false);
  assert.equal(commerceEnabled({ISOLATED_TEST_ENV:'true',QA_COMMERCE:'true'}),true);
});
test('gateway rejects payment, staff, arbitrary IDs, writes and external targets',()=>{
  for(const [m,p] of [['POST','/products/checkout/confirm'],['POST','/products/checkout/mercado-pago/webhook'],['POST','/company/contact'],['PATCH','/users/update-profile'],['GET','/products/orders/910001/tracking/staff'],['GET','/products/orders/1/tracking'],['GET','/products/reviews/admin/all'],['GET','https://example.com'],['GET','//example.com'],['GET','/products/%2e%2e/orders/user'],['DELETE','/products/cart']])assert.equal(allowed(m,p),false);
});
test('fixed CORS and headers do not forward cookies or arbitrary origins',()=>{
  assert.equal(safeHeaders({origin:'https://sport-center-sitie.netlify.app'}),null);
  assert.equal(safeHeaders({authorization:'Bearer unsafe token'}),null);
  const h=safeHeaders({origin:'http://localhost:4200',authorization:'Bearer synthetic-token',cookie:'not forwarded'});
  assert.equal(h.origin,'http://localhost:4200');assert.equal(h.cookie,undefined);
});
test('login is restricted to synthetic fixtures; review ownership remains server checked',()=>{
  assert.equal(validBody('/users/login-user',{email:USERS[0],passw:QA_PASSWORD}),true);
  assert.equal(validBody('/users/login-user',{email:'other@qa.invalid',passw:QA_PASSWORD}),false);
  assert.equal(validBody('/users/logout',{}),true);assert.equal(validBody('/users/logout',{extra:true}),false);
  assert.equal(validBody('/products/reviews',{id_producto:66,calificacion:0,comentario:'Corto'}),true);
  assert.equal(validBody('/products/reviews',{id_producto:69,calificacion:4,comentario:'Comentario QA'}),false);
});
test('compose source, database and network guards accept only the isolated namespace',()=>assert.equal(guardConfig(config(),{commit:PIN}),true));
test('guard fails closed for altered source, egress, provider, flag, database or ports',()=>{
  assert.throws(()=>guardConfig(config(),{commit:'different'}));
  for(const change of [c=>c.services.api.networks.push('access'),c=>c.services.db.ports=['5432:5432'],c=>c.networks.isolated.internal=false,
    c=>c.services.api.environment.ISOLATED_TEST_ENV='false',c=>c.services.api.environment.DATABASE_URL_ADMIN='postgres://qa:x@remote/sportcenter_qa',
    c=>c.services.api.environment.MERCADO_PAGO_ACCESS_TOKEN='not-a-real-key',c=>c.services.access.ports=['0.0.0.0:3011:3000'],
    c=>c.services.access.environment.QA_COMMERCE='false',c=>c.services.access.environment.ISOLATED_TEST_ENV='false']){const c=config();change(c);assert.throws(()=>guardConfig(c,{commit:PIN}));}
});
test('seed requires a bcrypt hash and has no payment/inventory writes',()=>{
  assert.throws(()=>buildFixtureSql("'; injected"));const sql=buildFixtureSql('$2b$10$'+'.'.repeat(53));
  assert.ok(!sql.includes('__QA_BCRYPT__'));assert.ok(sql.includes('QA_NAMESPACE_NOT_EMPTY'));assert.ok(sql.includes('QA_DATABASE_REQUIRED'));
  assert.ok(!/(?:INSERT INTO|UPDATE|DELETE FROM)\s+core\.(?:inventory|pagos)/i.test(sql));
  assert.ok(sql.includes('qa_sintetico_sin_pago'));
});
test('twelve HTTP assertions pass with both sessions closed and sanitized output',async()=>{
  const m=mock();const r=await runAcceptance({fetchImpl:m.fetchImpl});assert.equal(r.status,'passed');assert.equal(r.cases.length,12);assert.deepEqual(r.logout,[true,true]);
  const raw=JSON.stringify(r);for(const forbidden of [...USERS,QA_PASSWORD,'token-a','token-b','910001','910002'])assert.ok(!raw.includes(forbidden));
  assert.equal(m.calls.filter(x=>x.p==='/users/login-user').length,2);assert.equal(m.calls.filter(x=>x.p==='/users/logout').length,2);
});
test('ambiguous publication is not replayed; it fails and still logs both sessions out',async()=>{
  const m=mock({ambiguous:true});const r=await runAcceptance({fetchImpl:m.fetchImpl});assert.equal(r.status,'failed');assert.deepEqual(r.logout,[true,true]);
  assert.equal(m.calls.filter(x=>x.p==='/products/reviews'&&x.b.comentario.includes('creada en servidor')).length,1);
});
test('token from malformed login response is logged out without continuing review actions',async()=>{
  const m=mock({invalidSession:true});const r=await runAcceptance({fetchImpl:m.fetchImpl});assert.equal(r.status,'failed');
  assert.equal(m.calls.filter(x=>x.p==='/products/reviews').length,0);assert.equal(m.calls.filter(x=>x.p==='/users/logout').length,1);
});
test('gateway runtime bounds and CORS fail closed without any backend or external request',async()=>{
  const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
  const previous={a:process.env.ISOLATED_TEST_ENV,b:process.env.QA_COMMERCE};
  process.env.ISOLATED_TEST_ENV='true';process.env.QA_COMMERCE='true';const calls=[];
  const server=createGateway((options,callback)=>{calls.push(options);const req=new EventEmitter();req.end=()=>{const res=new PassThrough();res.statusCode=200;callback(res);res.end('{}');};req.destroy=()=>req.emit('error',Error('mock'));return req;});
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
    const send=(p,options={})=>new Promise((resolve,reject)=>{const req=require('node:http').request(base+p,{method:options.method||'GET',headers:options.headers||{},timeout:3000},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:{get:n=>res.headers[n.toLowerCase()]},text:async()=>Buffer.concat(chunks).toString()}));});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('MOCK_TIMEOUT')));req.end(options.body);});
    assert.equal((await send('/products/checkout/confirm',{method:'POST',body:'{}'})).status,405);
    assert.equal((await send('/products/reviews/product/66',{headers:{Origin:'https://outside.invalid'}})).status,403);
    const pre=await send('/products/reviews',{method:'OPTIONS',headers:{Origin:'http://localhost:4200','Access-Control-Request-Method':'POST'}});
    assert.equal(pre.status,204);assert.equal(pre.headers.get('Access-Control-Allow-Origin'),'http://localhost:4200');
    assert.equal((await send('/users/login-user',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(16385)})).status,413);
    assert.equal((await send('/users/login-user',{method:'POST',headers:{'Content-Type':'application/json'},body:'{invalid'})).status,400);
    assert.equal(calls.length,0);
    const ok=await send('/users/login-user',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:4200'},body:JSON.stringify({email:USERS[0],passw:QA_PASSWORD})});
    assert.equal(ok.status,200);await ok.text();assert.equal(calls.length,1);assert.equal(calls[0].hostname,'api');assert.equal(calls[0].port,3000);assert.equal(calls[0].path,'/users/login-user');
  } finally {
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    if(previous.a===undefined)delete process.env.ISOLATED_TEST_ENV;else process.env.ISOLATED_TEST_ENV=previous.a;
    if(previous.b===undefined)delete process.env.QA_COMMERCE;else process.env.QA_COMMERCE=previous.b;
  }
});

test('compose opts in explicitly while preserving the legacy read-only gateway',()=>{
  const fs=require('node:fs'),path=require('node:path'),YAML=require('yaml');
  const root=path.resolve(__dirname,'..');
  const c=YAML.parse(fs.readFileSync(path.join(root,'tests/environment/compose.yml'),'utf8'));
  assert.equal(c.services.access.environment.ISOLATED_TEST_ENV,'true');
  assert.equal(c.services.access.environment.QA_COMMERCE,'${QA_COMMERCE:-false}');
  assert.ok(c.services.access.volumes.includes('./commerce-isolated.cjs:/qa/commerce-isolated.cjs:ro'));
  const legacy=fs.readFileSync(path.join(root,'tests/environment/access.cjs'),'utf8');
  assert.ok(legacy.includes("!['GET', 'HEAD'].includes(request.method)"));
  assert.ok(legacy.includes("process.env.ISOLATED_TEST_ENV === 'true' && process.env.QA_COMMERCE === 'true'"));
});
test('commerce summary requires twelve exact cases, success and both confirmed logouts',()=>{
  const {commerceSummary,COMMERCE_CASES}=require('../scripts/write-api-summary');
  const r={schemaVersion:1,scope:'real-local-backend-synthetic-data-not-payment',status:'passed',errorCode:'NONE',logout:[true,true],cases:COMMERCE_CASES.map(id=>({id,status:'passed'}))};
  assert.ok(commerceSummary(r,'success').includes('aprobado para doce contratos locales'));
  for(const outcome of ['failure','skipped','cancelled','private-unexpected-value']){
    const text=commerceSummary(r,outcome);assert.ok(text.includes('sin aprobación acreditada'));assert.ok(!text.includes('private-unexpected-value'));
  }
  for(const mutate of [x=>x.cases.pop(),x=>x.cases[0].id='unexpected-private-body',x=>x.cases[1].status='failed',x=>x.logout[1]=false,x=>x.status='failed',x=>x.scope='other']){
    const copy=JSON.parse(JSON.stringify(r));mutate(copy);const text=commerceSummary(copy,'success');assert.ok(text.includes('sin aprobación acreditada'));assert.ok(!text.includes('unexpected-private-body'));
  }
  assert.ok(commerceSummary(null,'success').includes('sin aprobación acreditada'));
});
test('workflow keeps commerce in the HTTP job, local-only, before unconditional teardown',()=>{
  const fs=require('node:fs'),path=require('node:path'),YAML=require('yaml');
  const {validateWorkflows}=require('../scripts/validate-test-configs');
  const read=()=>new Map(['ci.yml','api-android.yml','performance.yml','security.yml','android-validation.yml'].map(f=>[f,YAML.parse(fs.readFileSync(path.join(__dirname,'../.github/workflows',f),'utf8'))]));
  assert.doesNotThrow(()=>validateWorkflows(read()));
  for(const mutate of [
    job=>{job.steps.find(x=>x.id==='commerce_local').env.QA_COMMERCE='false';},
    job=>{job.steps.find(x=>x.id==='commerce_local').if='false';},
    job=>{job.steps.find(x=>x.id==='commerce_local').run+='\nnode tests/environment/commerce-isolated.cjs seed "$GITHUB_WORKSPACE"';},
    job=>{job.steps.find(x=>x.id==='commerce_local').run=job.steps.find(x=>x.id==='commerce_local').run.replace('--no-deps ','');},
    job=>{job.steps.find(x=>x.id==='commerce_local').run=job.steps.find(x=>x.id==='commerce_local').run.replace('check "$GITHUB_WORKSPACE"','check https://outside.invalid');},
    job=>{const i=job.steps.findIndex(x=>x.id==='commerce_local');job.steps.push(job.steps.splice(i,1)[0]);},
    job=>{job.steps.find(x=>x.run==='node scripts/test-environment.js stop').if='success()';},
    job=>{job.env={QA_COMMERCE:'true'};},
    job=>{const a=job.steps.find(x=>x.with?.name==='api-evidence');a.with.path=a.with.path.replace('test-results/commerce-api.json\n','');},
    job=>{job.steps.find(x=>x.run==='node scripts/write-api-summary.js').env.COMMERCE_OUTCOME='success';},
  ]){const w=read();mutate(w.get('api-android.yml').jobs.api);assert.throws(()=>validateWorkflows(w));}
});
test('readiness timeout or incomplete proof prevents every login and mutation',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error('UNEXPECTED_POST');};
  await assert.rejects(runReadyAcceptance({waitForService:async()=>{throw Error('MOCK_TIMEOUT');},fetchImpl}));
  await assert.rejects(runReadyAcceptance({waitForService:async()=>({ready:false}),fetchImpl}));
  assert.equal(calls,0);
  const m=mock();let ready=false;
  const r=await runReadyAcceptance({waitForService:async options=>{assert.equal(options.apiUrl,BASE);assert.equal(options.timeout,30000);ready=true;return {ready:true};},fetchImpl:async(...args)=>{assert.equal(ready,true);return m.fetchImpl(...args);}});
  assert.equal(r.status,'passed');assert.equal(m.calls.filter(x=>x.p==='/users/login-user').length,2);
});

/** @jest-environment node */
'use strict';
const test=globalThis.test||require('node:test').test,assert=require('node:assert/strict'),path=require('node:path');
const network=require(path.join(process.env.NATIVE_COMMERCE_PREP_DIR||path.join(__dirname,'..','scripts'),'android-commerce-network.cjs'));
function fake(options={}){
 const chains={iptables:new Map(),ip6tables:new Map()},output={iptables:[],ip6tables:[]},counts={iptables:0,ip6tables:0},accepted={3011:0,8081:0},calls=[],invocations=[];const ok=stdout=>({stdout:stdout||'',stderr:'',exitCode:0,timedOut:false}),missing=()=>({stdout:'',stderr:'iptables: No chain/target/match by that name.\n',exitCode:1,timedOut:false});
 if(options.preexistingChain)chains.iptables.set('SCQ4_12345',[]);if(options.preexistingReference)output.iptables.push('-A OUTPUT -j SCQ4_12345');
 const adb=async(args,invoke={})=>{calls.push(args);invocations.push({args,options:invoke});
  if(args[0]==='root'||args[0]==='wait-for-device')return ok();
  if(args.slice(0,3).join(' ')==='shell id -u')return ok(options.rootDenied?'2000\n':'0\n');
  if(args.slice(0,3).join(' ')==='shell am get-current-user')return ok('0\n');
  if(args[0]==='shell'&&args[1]==='pm')return ok('package:'+network.APP+' uid:'+(options.badUid?'1000':'10123')+'\n');
  if(args[0]==='shell'&&args[1]==='run-as')return ok(options.runAsMismatch?'10124\n':'10123\n');
  if(args[0]==='shell'&&args[1]==='-T'){
   const ipv6=args.includes('-6'),binary=ipv6?'ip6tables':'iptables',host=args.at(-2),port=args.at(-1);
   if(port==='9'){if(!options.noCounter)counts[binary]++;return{stdout:'',stderr:'connection rejected',exitCode:options.connectedNegative?0:1,timedOut:false};}
   accepted[port]++;const endpoint=port==='3011'?'/products/get-all-categories':'/status';assert.equal(invoke.input,'GET '+endpoint+' HTTP/1.1\r\nHost: '+network.HOST+':'+port+'\r\nConnection: close\r\n\r\n');if(port==='3011'&&options.apiProbe)return options.apiProbe;
   if(port==='3011'&&options.apiUnavailable)return{stdout:'',stderr:'private transport detail',exitCode:1,timedOut:false};
   return ok('HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n'+(host===network.HOST&&port==='8081'?'packager-status:running':'[]'));
  }
  const binary=args[1],a=args.slice(2);if(!Object.hasOwn(chains,binary))throw Error('unexpected fake tool');
  // AOSP14 generic_opt_check rejects OPT_NUMERIC with CMD_LIST_RULES.
  if(a.includes('-S')&&a.includes('-n'))return{stdout:'',stderr:'option -n not allowed in this context',exitCode:2,timedOut:false};
  if(a[0]==='-S'){
   if(a.length===1){if(options.enumerationFailure)return{stdout:'',stderr:'table unavailable',exitCode:2,timedOut:false};if(options.malformedEnumeration)return ok('not a table dump');return ok('-P INPUT ACCEPT\n-P FORWARD ACCEPT\n-P OUTPUT ACCEPT\n'+[...chains[binary].keys()].map(k=>'-N '+k).join('\n')+'\n'+output[binary].join('\n')+'\n'+[...chains[binary].values()].flat().join('\n')+'\n');}
   if(a[1]==='OUTPUT')return ok('-P OUTPUT ACCEPT\n'+output[binary].join('\n')+'\n');
   if(!chains[binary].has(a[1]))return missing();return ok('-N '+a[1]+'\n'+chains[binary].get(a[1]).join('\n')+'\n');
  }
  if(a[0]==='-N'){if(chains[binary].has(a[1]))return{...missing(),stderr:'Chain already exists'};chains[binary].set(a[1],[]);return ok();}
  if(a[0]==='-A'){chains[binary].get(a[1]).push(a.join(' '));if(options.extraAllow&&binary==='iptables'&&a.includes('REJECT'))chains[binary].get(a[1]).unshift('-A '+a[1]+' -d 0.0.0.0/0 -p tcp -m tcp --dport 443 -j ACCEPT');return ok();}
  if(a[0]==='-I'){output[binary].unshift('-A OUTPUT '+a.slice(3).join(' '));if(options.shadowed)output[binary].unshift('-A OUTPUT -j ACCEPT');return ok();}
  if(a[0]==='-D'){const line='-A OUTPUT '+a.slice(2).join(' '),index=output[binary].indexOf(line);if(index<0)return missing();output[binary].splice(index,1);return ok();}
  if(a[0]==='-F'){chains[binary].set(a[1],[]);return ok();}
  if(a[0]==='-X'){if(options.cleanupFailed)return{stdout:'',stderr:'private cleanup detail',exitCode:4,timedOut:false};chains[binary].delete(a[1]);return ok();}
  if(a.join(' ').startsWith('-n -v -x -L'))return ok('Chain '+a.at(-1)+'\n pkts bytes target prot opt in out source destination\n'+(options.omitAcceptCounters?'':[3011,8081].map(port=>' '+accepted[port]+' 60 ACCEPT tcp -- * * 0.0.0.0/0 10.0.2.2 tcp dpt:'+port).join('\n')+'\n')+' '+counts[binary]+' 60 REJECT all -- * * anywhere anywhere\n');
  throw Error('unexpected fake table action');
 };
 return{adb,chains,output,calls,invocations};
}
test('guard verifies both owner rule sets, real rejected packets and both allowed host services before returning proof',async()=>{
 const f=fake(),guard=await network.installNetwork({adb:f.adb,runId:'12345'});assert.equal(Object.values(guard.proof).filter(v=>typeof v==='boolean').every(Boolean),true);assert.equal(guard.proof.scope,'app-uid-10.0.2.2-tcp-3011-8081-only');assert.equal(await guard.verify(),true);assert.equal(await guard.cleanup(),true);assert.equal(f.chains.iptables.size,0);assert.equal(f.chains.ip6tables.size,0);assert.deepEqual(f.output,{iptables:[],ip6tables:[]});
 const accepts=f.calls.filter(a=>a.includes('ACCEPT'));assert.equal(accepts.length,2);assert.deepEqual(accepts.map(a=>a[a.indexOf('--dport')+1]),['3011','8081']);
});
for(const[name,options,code]of[
 ['root absent',{rootDenied:true},'COMMERCE_AVD_ROOT_REQUIRED'],
 ['system UID',{badUid:true},'COMMERCE_AVD_UID_INVALID'],
 ['run-as wrong UID',{runAsMismatch:true},'COMMERCE_AVD_UID_INVALID'],
 ['extra egress allowance',{extraAllow:true},'COMMERCE_AVD_RULES_UNVERIFIED'],
 ['owner jump shadowed',{shadowed:true},'COMMERCE_AVD_RULES_UNVERIFIED'],
 ['failure without reject counter',{noCounter:true},'COMMERCE_AVD_REJECTION_UNPROVEN'],
 ['negative unexpectedly connected',{connectedNegative:true},'COMMERCE_AVD_REJECTION_UNPROVEN'],
 ['QA unreachable from app UID',{apiUnavailable:true},'COMMERCE_AVD_QA_UNREACHABLE'],
])test('guard fails closed before account UI: '+name,async()=>{const f=fake(options);await assert.rejects(network.installNetwork({adb:f.adb,runId:'12345'}),error=>error.code===code&&error.diagnostic.cleanupConfirmed===true);});
test('cleanup uncertainty is retained, without claiming that rules disappeared',async()=>{const f=fake({apiUnavailable:true,cleanupFailed:true});await assert.rejects(network.installNetwork({adb:f.adb,runId:'12345'}),e=>e.code==='COMMERCE_AVD_QA_UNREACHABLE'&&e.diagnostic.cleanupConfirmed===false);});
test('rule and identity parsers reject partial, duplicate, widened or foreign definitions',()=>{
 assert.throws(()=>network.parseUid('package:other.app uid:10123'),/COMMERCE_AVD_UID_INVALID/);assert.throws(()=>network.plan(0,'1'),/COMMERCE_AVD_NETWORK_SCOPE/);assert.throws(()=>network.plan(10123,'1; command'),/COMMERCE_AVD_NETWORK_SCOPE/);
 assert.throws(()=>network.rules('-N SCQ4_1\n-A SCQ4_1 -j ACCEPT','SCQ4_1'),/COMMERCE_AVD_RULES_UNVERIFIED/);assert.throws(()=>network.jump('-A OUTPUT -m owner --uid-owner 10124 -j SCQ4_1',10123,'SCQ4_1'),/COMMERCE_AVD_RULES_UNVERIFIED/);assert.throws(()=>network.rejectCount('0 0 ACCEPT all\n'),/COMMERCE_AVD_RULES_UNVERIFIED/);
});
test('foreign package is rejected before any root or network command',async()=>{let called=false;await assert.rejects(network.installNetwork({adb:async()=>{called=true;},runId:'1',packageName:'other.app'}),/COMMERCE_AVD_NETWORK_SCOPE/);assert.equal(called,false);});

test('AOSP14 list-rules rejects numeric modifier; guard uses valid numeric serialization and retains numeric counters',async()=>{
 const f=fake(),incompatible=await f.adb(['shell','iptables','-n','-S']);assert.equal(incompatible.exitCode,2);f.calls.length=0;
 const guard=await network.installNetwork({adb:f.adb,runId:'12345'});await guard.verify();await guard.cleanup();
 const queries=f.calls.filter(a=>a.includes('-S'));assert(queries.length>0);assert(queries.every(a=>!a.includes('-n')));assert(f.calls.some(a=>a.slice(2,6).join(' ')==='-n -v -x -L'));
});
test('failed or malformed whole-table enumeration never proves absence and never creates a chain',async()=>{
 for(const [options,code]of[[{enumerationFailure:true},'COMMERCE_AVD_TOOL_FAILED'],[{malformedEnumeration:true},'COMMERCE_AVD_RULES_UNVERIFIED']]){const f=fake(options);await assert.rejects(network.installNetwork({adb:f.adb,runId:'12345'}),e=>e.code===code&&e.diagnostic.cleanupConfirmed===true);assert(!f.calls.some(a=>a.includes('-N')));}
});
test('preexisting exact chain or reference is preserved and rejected before any firewall mutation',async()=>{
 for(const options of[{preexistingChain:true},{preexistingReference:true}]){const f=fake(options),before=JSON.stringify({chains:[...f.chains.iptables],output:f.output});await assert.rejects(network.installNetwork({adb:f.adb,runId:'12345'}),e=>e.code==='COMMERCE_AVD_NETWORK_SCOPE'&&e.diagnostic.cleanupConfirmed===true);assert.equal(JSON.stringify({chains:[...f.chains.iptables],output:f.output}),before);assert(!f.calls.some(a=>['-N','-A','-I','-D','-F','-X'].some(flag=>a.includes(flag))));}
});

test('nc uses explicit connect, idle and EOF bounds with an outer margin, and sends real CRLF HTTP headers',async()=>{
 const f=fake(),guard=await network.installNetwork({adb:f.adb,runId:'12345'});await guard.cleanup();const calls=f.invocations.filter(i=>i.args.includes('nc'));assert(calls.length>=4);for(const call of calls){for(const flag of ['-w','-W','-q'])assert.equal(call.args[call.args.indexOf(flag)+1],'4');assert.equal(call.options.timeout,11000);}const requests=calls.filter(i=>['3011','8081'].includes(i.args.at(-1)));assert.equal(requests.length,2);assert(requests.every(i=>i.options.input.endsWith('\r\n\r\n')&&!i.options.input.includes('\\r')));
});
test('timeout, nonzero exit and non-200 status remain failures with fixed header-only diagnostics',async()=>{
 for(const raw of[{stdout:'',stderr:'connection refused private@example.invalid',exitCode:1,timedOut:false},{stdout:'HTTP/1.1 200 OK\r\n\r\nPRIVATE',stderr:'',exitCode:-1,timedOut:true},{stdout:'HTTP/1.1 503 Unavailable\r\n\r\nPRIVATE',stderr:'',exitCode:0,timedOut:false}]){const f=fake({apiProbe:raw});let observed;await assert.rejects(network.installNetwork({adb:f.adb,runId:'12345'}),e=>{observed=e;return e.code==='COMMERCE_AVD_QA_UNREACHABLE';});const d=network.safeDiagnostic(observed.diagnostic);assert(d&&d.cleanupConfirmed);assert.equal(d.stage,'positive-probes');assert.equal(d.probe.target,'qa');assert.equal(d.probe.exitCode,raw.exitCode);assert.equal(d.probe.timedOut,raw.timedOut);assert.equal(d.probe.before.acceptedPackets,0);assert.equal(d.probe.after.acceptedPackets,1);assert.equal(d.probe.before.rejectedPackets,d.probe.after.rejectedPackets);assert(!JSON.stringify(d).includes('PRIVATE')&&!JSON.stringify(d).includes('@'));if(raw.stdout.startsWith('HTTP/1.1 200'))assert.equal(d.probe.httpStatus,200);}
});
test('optional unparsed accept counters stay null rather than invented zero',async()=>{const f=fake({omitAcceptCounters:true,apiUnavailable:true});let error;try{await network.installNetwork({adb:f.adb,runId:'12345'});}catch(e){error=e;}const d=network.safeDiagnostic(error.diagnostic);assert.equal(d.probe.before.acceptedPackets,null);assert.equal(d.probe.after.acceptedPackets,null);assert.equal(d.probe.after.rejectedPackets,1);assert.equal(d.probe.httpStatus,null);});
test('diagnostic projection rejects unknown keys, text-bearing fields, invalid status or unsafe counts',()=>{
 const raw={stdout:'HTTP/1.1 200 OK\r\n\r\nprivate-body',stderr:'arbitrary secret text',exitCode:1,timedOut:false},counts={acceptedPackets:1,rejectedPackets:1};const value={stage:'positive-probes',cleanupConfirmed:true,probe:network.observeProbe(raw,'qa',counts,counts)};assert.equal(network.safeDiagnostic(value).probe.stderrEnum,'other');for(const mutate of[v=>v.body='PRIVATE',v=>v.probe.target='private@example.invalid',v=>v.probe.httpStatus=999,v=>v.probe.before.acceptedPackets='secret',v=>v.probe.stderrEnum='private']){const d=structuredClone(value);mutate(d);assert.equal(network.safeDiagnostic(d),null);}
});

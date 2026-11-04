/** @jest-environment node */
'use strict';
const test=globalThis.test||require('node:test').test,assert=require('node:assert/strict'),path=require('node:path');
const network=require(path.join(process.env.NATIVE_COMMERCE_PREP_DIR||path.join(__dirname,'..','scripts'),'android-commerce-network.cjs'));
function fake(options={}){
 const chains={iptables:new Map(),ip6tables:new Map()},output={iptables:[],ip6tables:[]},counts={iptables:0,ip6tables:0},calls=[];const ok=stdout=>({stdout:stdout||'',stderr:'',exitCode:0,timedOut:false}),missing=()=>({stdout:'',stderr:'iptables: No chain/target/match by that name.\n',exitCode:1,timedOut:false});
 const adb=async args=>{calls.push(args);
  if(args[0]==='root'||args[0]==='wait-for-device')return ok();
  if(args.slice(0,3).join(' ')==='shell id -u')return ok(options.rootDenied?'2000\n':'0\n');
  if(args.slice(0,3).join(' ')==='shell am get-current-user')return ok('0\n');
  if(args[0]==='shell'&&args[1]==='pm')return ok('package:'+network.APP+' uid:'+(options.badUid?'1000':'10123')+'\n');
  if(args[0]==='shell'&&args[1]==='run-as')return ok(options.runAsMismatch?'10124\n':'10123\n');
  if(args[0]==='shell'&&args[1]==='-T'){
   const ipv6=args.includes('-6'),binary=ipv6?'ip6tables':'iptables',host=args.at(-2),port=args.at(-1);
   if(port==='9'){if(!options.noCounter)counts[binary]++;return{stdout:'',stderr:'connection rejected',exitCode:options.connectedNegative?0:1,timedOut:false};}
   if(port==='3011'&&options.apiUnavailable)return{stdout:'',stderr:'private transport detail',exitCode:1,timedOut:false};
   return ok('HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n'+(host===network.HOST&&port==='8081'?'packager-status:running':'[]'));
  }
  const binary=args[1],a=args.slice(2);if(!Object.hasOwn(chains,binary))throw Error('unexpected fake tool');
  if(a[0]==='-n'&&a[1]==='-S'){
   if(a[2]==='OUTPUT')return ok('-P OUTPUT ACCEPT\n'+output[binary].join('\n')+'\n');
   if(!chains[binary].has(a[2]))return missing();return ok('-N '+a[2]+'\n'+chains[binary].get(a[2]).join('\n')+'\n');
  }
  if(a[0]==='-N'){if(chains[binary].has(a[1]))return{...missing(),stderr:'Chain already exists'};chains[binary].set(a[1],[]);return ok();}
  if(a[0]==='-A'){chains[binary].get(a[1]).push(a.join(' '));if(options.extraAllow&&binary==='iptables'&&a.includes('REJECT'))chains[binary].get(a[1]).unshift('-A '+a[1]+' -d 0.0.0.0/0 -p tcp -m tcp --dport 443 -j ACCEPT');return ok();}
  if(a[0]==='-I'){output[binary].unshift('-A OUTPUT '+a.slice(3).join(' '));if(options.shadowed)output[binary].unshift('-A OUTPUT -j ACCEPT');return ok();}
  if(a[0]==='-D'){const line='-A OUTPUT '+a.slice(2).join(' '),index=output[binary].indexOf(line);if(index<0)return missing();output[binary].splice(index,1);return ok();}
  if(a[0]==='-F'){chains[binary].set(a[1],[]);return ok();}
  if(a[0]==='-X'){if(options.cleanupFailed)return{stdout:'',stderr:'private cleanup detail',exitCode:4,timedOut:false};chains[binary].delete(a[1]);return ok();}
  if(a.join(' ').startsWith('-n -v -x -L'))return ok('Chain '+a.at(-1)+'\n pkts bytes target prot opt in out source destination\n '+counts[binary]+' 60 REJECT all -- * * anywhere anywhere\n');
  throw Error('unexpected fake table action');
 };
 return{adb,chains,output,calls};
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

'use strict';
// Android-only rules for the one installed Debug UID. No operations occur on require.
const APP='com.markadw.sportcenter',HOST='10.0.2.2';
const NC_TIMEOUT_MS=11000,STDERR_ENUM=Object.freeze(['none','permission-denied','connection-refused','unreachable','timeout','other']);
const CODES=Object.freeze(['COMMERCE_AVD_ROOT_REQUIRED','COMMERCE_AVD_UID_INVALID','COMMERCE_AVD_NETWORK_SCOPE','COMMERCE_AVD_RULES_UNVERIFIED','COMMERCE_AVD_REJECTION_UNPROVEN','COMMERCE_AVD_QA_UNREACHABLE','COMMERCE_AVD_METRO_UNREACHABLE','COMMERCE_AVD_NETWORK_CLEANUP_FAILED','COMMERCE_AVD_TOOL_FAILED']);
class NetworkError extends Error{constructor(code,diagnostic){const safe=CODES.includes(code)?code:'COMMERCE_AVD_TOOL_FAILED';super(safe);this.code=safe;if(diagnostic)this.diagnostic=diagnostic;}}
const need=(value,code)=>{if(!value)throw new NetworkError(code);};
function countValue(value){return value===null||Number.isSafeInteger(value)&&value>=0;}
function safeDiagnostic(value){
 if(!value||Object.keys(value).sort().join(',')!=='cleanupConfirmed,probe,stage'||typeof value.cleanupConfirmed!=='boolean'||!['root','uid','rules','reject-probes','positive-probes','unknown'].includes(value.stage))return null;
 const p=value.probe;if(p!==null){if(!p||Object.keys(p).sort().join(',')!=='after,before,exitCode,httpStatus,responseBytes,stderrEnum,target,timedOut'||!['qa','metro'].includes(p.target)||!Number.isInteger(p.exitCode)||p.exitCode< -1||p.exitCode>255||typeof p.timedOut!=='boolean'||!(p.httpStatus===null||Number.isInteger(p.httpStatus)&&p.httpStatus>=100&&p.httpStatus<=599)||!Number.isInteger(p.responseBytes)||p.responseBytes<0||p.responseBytes>262144||!STDERR_ENUM.includes(p.stderrEnum))return null;
  for(const key of ['before','after'])if(!p[key]||Object.keys(p[key]).sort().join(',')!=='acceptedPackets,rejectedPackets'||!Object.values(p[key]).every(countValue))return null;
 }
 return{stage:value.stage,cleanupConfirmed:value.cleanupConfirmed,probe:p===null?null:{target:p.target,exitCode:p.exitCode,timedOut:p.timedOut,httpStatus:p.httpStatus,responseBytes:p.responseBytes,stderrEnum:p.stderrEnum,before:{...p.before},after:{...p.after}}};
}
function counterSnapshot(raw,port){
 let rejectedPackets=null;try{rejectedPackets=rejectCount(raw);}catch{}const lines=typeof raw==='string'?raw.split(/\r?\n/):[];
 const rows=lines.filter(line=>new RegExp('^\\s*([0-9]+)\\s+[0-9]+\\s+ACCEPT\\s+tcp\\s').test(line)&&new RegExp('(?:^|\\s)dpt:'+port+'(?:\\s|$)').test(line));
 const acceptedPackets=rows.length===1?Number(rows[0].trim().split(/\s+/)[0]):null;return{acceptedPackets:countValue(acceptedPackets)?acceptedPackets:null,rejectedPackets};
}
function stderrEnum(text){if(!text.trim())return'none';if(/permission denied|operation not permitted/i.test(text))return'permission-denied';if(/connection refused/i.test(text))return'connection-refused';if(/network is unreachable|no route to host|host is unreachable/i.test(text))return'unreachable';if(/timed? ?out|timeout/i.test(text))return'timeout';return'other';}
function observeProbe(raw,target,before,after){const status=/^HTTP\/1\.[01] ([1-5][0-9]{2})(?: [^\r\n]*)?\r?\n/.exec(raw.stdout);return{target,exitCode:raw.exitCode,timedOut:raw.timedOut===true,httpStatus:status?Number(status[1]):null,responseBytes:Buffer.byteLength(raw.stdout),stderrEnum:stderrEnum(raw.stderr),before,after};}

function normal(result){need(result&&typeof result.stdout==='string'&&typeof result.stderr==='string'&&Number.isInteger(result.exitCode)&&Buffer.byteLength(result.stdout)+Buffer.byteLength(result.stderr)<=262144,'COMMERCE_AVD_TOOL_FAILED');return result;}
function parseUid(text){const match=new RegExp('^package:'+APP.replaceAll('.','\\.')+' uid:([1-9][0-9]*)$').exec(text.trim());need(match,'COMMERCE_AVD_UID_INVALID');const uid=Number(match[1]);need(Number.isSafeInteger(uid)&&uid>=10000&&uid<=19999,'COMMERCE_AVD_UID_INVALID');return uid;}
function plan(uid,runId){need(Number.isSafeInteger(uid)&&uid>=10000&&uid<=19999&&typeof runId==='string'&&/^[1-9][0-9]{0,19}$/.test(runId),'COMMERCE_AVD_NETWORK_SCOPE');const suffix=runId.slice(-12),v4='SCQ4_'+suffix,v6='SCQ6_'+suffix;return{uid,v4,v6,allows:[3011,8081],host:HOST};}
function ruleTokens(line,chain){const tokens=line.trim().split(/\s+/);need(tokens[0]==='-A'&&tokens[1]===chain,'COMMERCE_AVD_RULES_UNVERIFIED');const pairs={};for(let i=2;i<tokens.length;i+=2){need(i+1<tokens.length&&tokens[i].startsWith('-')&&!Object.hasOwn(pairs,tokens[i]),'COMMERCE_AVD_RULES_UNVERIFIED');pairs[tokens[i]]=tokens[i+1];}return pairs;}
function rules(raw,chain,ipv6=false){need(typeof raw==='string'&&raw.length<=32768,'COMMERCE_AVD_RULES_UNVERIFIED');const lines=raw.trim().split(/\r?\n/);need(lines.shift()==='-N '+chain,'COMMERCE_AVD_RULES_UNVERIFIED');need(lines.length===(ipv6?1:3),'COMMERCE_AVD_RULES_UNVERIFIED');
 for(let i=0;i<lines.length;i++){const actual=ruleTokens(lines[i],chain),expected=!ipv6&&i<2?{'-d':HOST+'/32','-p':'tcp','-m':'tcp','--dport':String([3011,8081][i]),'-j':'ACCEPT'}:{'-j':'REJECT','--reject-with':ipv6?'icmp6-port-unreachable':'icmp-port-unreachable'};need(JSON.stringify(Object.entries(actual).sort())===JSON.stringify(Object.entries(expected).sort()),'COMMERCE_AVD_RULES_UNVERIFIED');}return true;}
function jump(raw,uid,chain){need(typeof raw==='string'&&raw.length<=65536,'COMMERCE_AVD_RULES_UNVERIFIED');const lines=raw.trim().split(/\r?\n/).filter(line=>line.startsWith('-A OUTPUT '));need(lines.length>0,'COMMERCE_AVD_RULES_UNVERIFIED');const actual=ruleTokens(lines[0],'OUTPUT'),expected={'-m':'owner','--uid-owner':String(uid),'-j':chain};need(JSON.stringify(Object.entries(actual).sort())===JSON.stringify(Object.entries(expected).sort()),'COMMERCE_AVD_RULES_UNVERIFIED');return true;}
function rejectCount(raw){need(typeof raw==='string'&&raw.length<=32768,'COMMERCE_AVD_RULES_UNVERIFIED');const matches=[...raw.matchAll(/^\s*([0-9]+)\s+[0-9]+\s+REJECT\s+/gm)];need(matches.length===1,'COMMERCE_AVD_RULES_UNVERIFIED');const count=Number(matches[0][1]);need(Number.isSafeInteger(count)&&count>=0,'COMMERCE_AVD_RULES_UNVERIFIED');return count;}
// AOSP14 xshared.c makes -n illegal with -S; list-rules already serializes numbers.
// Absence is established by a successful whole-table dump, never by stderr text.
function chainAbsent(raw,chain){
 need(typeof raw==='string'&&raw.length>0&&raw.length<=262144&&/^[A-Za-z0-9_.:-]{1,28}$/.test(chain),'COMMERCE_AVD_RULES_UNVERIFIED');
 const lines=raw.trim().split(/\r?\n/).map(line=>line.trim()).filter(Boolean),policies=new Set(),declared=new Set(),owners=[];let present=false;
 for(const line of lines){const tokens=line.split(/\s+/),[op,name]=tokens;need(/^[A-Za-z0-9_.:-]{1,28}$/.test(name||''),'COMMERCE_AVD_RULES_UNVERIFIED');if(tokens.includes(chain))present=true;
  if(op==='-P'){need(tokens.length===3&&['INPUT','FORWARD','OUTPUT'].includes(name)&&['ACCEPT','DROP'].includes(tokens[2])&&!policies.has(name),'COMMERCE_AVD_RULES_UNVERIFIED');policies.add(name);}
  else if(op==='-N'){need(tokens.length===2&&!declared.has(name)&&!['INPUT','FORWARD','OUTPUT'].includes(name),'COMMERCE_AVD_RULES_UNVERIFIED');declared.add(name);}
  else{need(op==='-A'&&tokens.length>=4,'COMMERCE_AVD_RULES_UNVERIFIED');owners.push(name);}
 }
 need(policies.size===3&&owners.every(name=>policies.has(name)||declared.has(name)),'COMMERCE_AVD_RULES_UNVERIFIED');return !present;
}
async function installNetwork({adb,runId,packageName=APP}){
 need(packageName===APP&&typeof adb==='function','COMMERCE_AVD_NETWORK_SCOPE');const resources=[];let setupStage='root',uid,p,mutationUncertain=false,lastProbe=null;
 const call=async(args,options={})=>normal(await adb(args,{timeout:10000,...options}));
 const good=async args=>{const result=await call(args);need(result.exitCode===0&&!result.timedOut,'COMMERCE_AVD_TOOL_FAILED');return result.stdout;};
 const table=(binary,args)=>good(['shell',binary,...args]);
 const absence=async(binary,chain)=>chainAbsent(await table(binary,['-S']),chain);
 const verify=async()=>{need(p&&uid,'COMMERCE_AVD_UID_INVALID');need(parseUid(await good(['shell','pm','list','packages','-U',APP]))===uid,'COMMERCE_AVD_UID_INVALID');for(const[binary,chain,ipv6]of[['iptables',p.v4,false],['ip6tables',p.v6,true]]){jump(await table(binary,['-S','OUTPUT']),uid,chain);rules(await table(binary,['-S',chain]),chain,ipv6);}return true;};
 const cleanup=async()=>{let failed=mutationUncertain;for(const resource of [...resources].reverse()){const{binary,chain,jumpAttempted}=resource;try{if(jumpAttempted){const removed=await call(['shell',binary,'-D','OUTPUT','-m','owner','--uid-owner',String(uid),'-j',chain]);need(removed.exitCode===0||removed.exitCode===1,'COMMERCE_AVD_NETWORK_CLEANUP_FAILED');const output=await table(binary,['-S','OUTPUT']);need(!output.split(/\r?\n/).some(line=>line.split(/\s+/).includes(chain)),'COMMERCE_AVD_NETWORK_CLEANUP_FAILED');}await table(binary,['-F',chain]);await table(binary,['-X',chain]);need(await absence(binary,chain),'COMMERCE_AVD_NETWORK_CLEANUP_FAILED');}catch{failed=true;}}
  if(failed)throw new NetworkError('COMMERCE_AVD_NETWORK_CLEANUP_FAILED');return true;};
 try{
  const rooted=await call(['root']);need(rooted.exitCode===0,'COMMERCE_AVD_ROOT_REQUIRED');await good(['wait-for-device']);need((await good(['shell','id','-u'])).trim()==='0'&&(await good(['shell','am','get-current-user'])).trim()==='0','COMMERCE_AVD_ROOT_REQUIRED');
  setupStage='uid';uid=parseUid(await good(['shell','pm','list','packages','-U',APP]));need((await good(['shell','run-as',APP,'id','-u'])).trim()===String(uid),'COMMERCE_AVD_UID_INVALID');p=plan(uid,runId);
  setupStage='rules';for(const[binary,chain,ipv6]of[['iptables',p.v4,false],['ip6tables',p.v6,true]]){
   need(await absence(binary,chain),'COMMERCE_AVD_NETWORK_SCOPE');mutationUncertain=true;await table(binary,['-N',chain]);mutationUncertain=false;const resource={binary,chain,jumpAttempted:false};resources.push(resource);
   if(!ipv6)for(const port of[3011,8081])await table(binary,['-A',chain,'-d',HOST+'/32','-p','tcp','-m','tcp','--dport',String(port),'-j','ACCEPT']);
   await table(binary,['-A',chain,'-j','REJECT','--reject-with',ipv6?'icmp6-port-unreachable':'icmp-port-unreachable']);resource.jumpAttempted=true;await table(binary,['-I','OUTPUT','1','-m','owner','--uid-owner',String(uid),'-j',chain]);
  }
  await verify();setupStage='reject-probes';
  const nc=async(host,port,input='',ipv6=false)=>call(['shell','-T','run-as',APP,'/system/bin/toybox','nc',ipv6?'-6':'-4','-n','-w','4','-W','4','-q','4',host,String(port)],{timeout:NC_TIMEOUT_MS,input});
  for(const[binary,chain,host,ipv6]of[['iptables',p.v4,'192.0.2.1',false],['ip6tables',p.v6,'::1',true]]){const before=rejectCount(await table(binary,['-n','-v','-x','-L',chain]));const result=await nc(host,9,'',ipv6);const after=rejectCount(await table(binary,['-n','-v','-x','-L',chain]));need(!result.timedOut&&result.exitCode!==0&&after>before,'COMMERCE_AVD_REJECTION_UNPROVEN');}
  setupStage='positive-probes';for(const[port,endpoint,code]of[[3011,'/products/get-all-categories','COMMERCE_AVD_QA_UNREACHABLE'],[8081,'/status','COMMERCE_AVD_METRO_UNREACHABLE']]){const before=counterSnapshot(await table('iptables',['-n','-v','-x','-L',p.v4]),port),raw=await nc(HOST,port,'GET '+endpoint+' HTTP/1.1\r\nHost: '+HOST+':'+port+'\r\nConnection: close\r\n\r\n'),after=counterSnapshot(await table('iptables',['-n','-v','-x','-L',p.v4]),port);lastProbe=observeProbe(raw,port===3011?'qa':'metro',before,after);need(!raw.timedOut&&raw.exitCode===0&&lastProbe.httpStatus===200&&(port!==8081||raw.stdout.includes('packager-status:running')),code);}
  await verify();return Object.freeze({proof:Object.freeze({rooted:true,uidMatched:true,ipv4RulesVerified:true,ipv6RulesVerified:true,ipv4RejectedWithCounter:true,ipv6RejectedWithCounter:true,apiReachable:true,metroReachable:true,scope:'app-uid-10.0.2.2-tcp-3011-8081-only'}),verify,cleanup});
 }catch(error){let cleaned=false;try{await cleanup();cleaned=true;}catch{}const code=error instanceof NetworkError?error.code:'COMMERCE_AVD_TOOL_FAILED';throw new NetworkError(code,{stage:['root','uid','rules','reject-probes','positive-probes'].includes(setupStage)?setupStage:'unknown',cleanupConfirmed:cleaned,probe:lastProbe});}
}
module.exports={APP,HOST,CODES,NetworkError,parseUid,plan,rules,jump,rejectCount,chainAbsent,NC_TIMEOUT_MS,STDERR_ENUM,safeDiagnostic,counterSnapshot,observeProbe,installNetwork};

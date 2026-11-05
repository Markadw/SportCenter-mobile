'use strict';
// Explicit UI phases. Requiring this module sends no request and starts no process.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),{setTimeout:pause}=require('node:timers/promises');
const account=require('./android-account.cjs');
const {createSandbox,SandboxError,safeSandboxDiagnostic,isSafeSandboxDiagnostic}=require('./account-sandbox.cjs');
const provenance=require('./android-email-forms-source.cjs');
const PACKAGE='com.markadw.sportcenter';
const PHASE_CASES=Object.freeze({register:Object.freeze(['EF01','EF02']),verify:Object.freeze(['EF03','EF04','EF05']),reset:Object.freeze(['EF06','EF07','EF08','EF09','EF05']),request:Object.freeze(['EF05'])});
const LABELS=Object.freeze({name:'Nombre',surname:'Apellido paterno',secondSurname:'Apellido materno',registrationEmail:'Correo electrónico',phone:'Teléfono',password:'Contraseña',confirmation:'Confirmar contraseña',verification:'Código de verificación',recoveryEmail:'Correo',recovery:'Código de recuperación',newPassword:'Nueva contraseña'});
const EVIDENCE=Object.freeze(['registered','resent','invalidVerificationDidNotComplete','verified','recoveryRequested','resumedWithoutRequest','invalidResetDidNotComplete','passwordUpdated','newPasswordLogin','loggedOut']);
const REQUIRED_EVIDENCE=Object.freeze({register:['registered','resent'],verify:['invalidVerificationDidNotComplete','verified','recoveryRequested'],reset:['resumedWithoutRequest','invalidResetDidNotComplete','passwordUpdated','newPasswordLogin','loggedOut','recoveryRequested'],request:['recoveryRequested']});
const CODES=Object.freeze(['FORMS_SECRETS_MISSING','FORMS_FIXTURE_INVALID','FORMS_SOURCE_INVALID','FORMS_PROCESS_FAILED','FORMS_UI_INVALID','FORMS_UI_TIMEOUT','FORMS_MAESTRO_FAILED','FORMS_INPUT_MISMATCH','FORMS_SANDBOX_FAILED','FORMS_SANDBOX_CLEANUP_FAILED','FORMS_DEVICE_CLEANUP_FAILED','FORMS_CASES_INCOMPLETE','FORMS_UNEXPECTED_FAILURE']);
const STAGES=Object.freeze(['preflight','device-check','probe-adb-start-server','sandbox-parent','sandbox-probes','app-install','register-open','register-consent','register-submit','register-response','resend-submit','resend-response','verify-open','verify-resume','verify-invalid-submit','verify-invalid-response','verify-submit','verify-response','recovery-open','recovery-submit','recovery-settle','recovery-response','reset-open','reset-resume','reset-invalid-submit','reset-invalid-response','reset-submit','reset-response','login-open','login-submit','login-response','logout-submit','logout-response','cleanup-device','cleanup-sandbox','completed',...Object.keys(LABELS).flatMap(k=>['field-'+k,'check-'+k])]);
const NOTICE_RESENT='Enviamos un código nuevo a tu correo. Revisa también la carpeta de spam; el código anterior deja de servir.';
const RESET_ERROR='No pudimos cambiar la contraseña. Revisa el código y la nueva contraseña; solicita otro código si venció o agotaste los intentos.';
class FormsError extends Error{constructor(code){super(code);this.code=code;}}
const need=(v,code)=>{if(!v)throw new FormsError(code);};
function safeCode(error){
 if(CODES.includes(error?.code))return error.code;
 if(error instanceof SandboxError)return'FORMS_SANDBOX_FAILED';
 const shared={ACCOUNT_UI_INVALID:'FORMS_UI_INVALID',ACCOUNT_UI_ACTION_AMBIGUOUS:'FORMS_UI_INVALID',ACCOUNT_UI_TIMEOUT:'FORMS_UI_TIMEOUT',ACCOUNT_JUNIT_INVALID:'FORMS_MAESTRO_FAILED',ACCOUNT_SANDBOX_PARENT_INVALID:'FORMS_SANDBOX_FAILED',ACCOUNT_SANDBOX_TOOL_INVALID:'FORMS_SANDBOX_FAILED'};
 return error instanceof account.AccountError&&Object.hasOwn(shared,error.code)?shared[error.code]:'FORMS_UNEXPECTED_FAILURE';
}
function credentials(env,phase){
 need(Object.hasOwn(PHASE_CASES,phase),'FORMS_SOURCE_INVALID');
 const email=env.ANDROID_FORMS_EMAIL,password=env.ANDROID_FORMS_PASSWORD,phone=env.ANDROID_FORMS_PHONE,code=env.ANDROID_FORMS_CODE,newPassword=env.ANDROID_FORMS_NEW_PASSWORD;
 need(typeof email==='string','FORMS_SECRETS_MISSING');
 need(email===email.trim().toLowerCase()&&email.length<=100&&/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email),'FORMS_FIXTURE_INVALID');
 if(phase==='request'){need([password,phone,code,newPassword].every(value=>value===undefined||value===''),'FORMS_SOURCE_INVALID');return{email,password:null,phone:null,code:null,newPassword:null};}
 need(typeof password==='string','FORMS_SECRETS_MISSING');
 const validPassword=v=>typeof v==='string'&&v.length<=256&&/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!#$%&¿?@*_/-])[A-Za-z\d!#$%&¿?@*_/-]{12,}$/.test(v);
 need(email===email.trim().toLowerCase()&&email.length<=100&&/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)&&validPassword(password),'FORMS_FIXTURE_INVALID');
 if(phase==='register')need(typeof phone==='string'&&/^\d{10}$/.test(phone),'FORMS_FIXTURE_INVALID');
 else need(typeof code==='string'&&/^\d{6}$/.test(code),'FORMS_FIXTURE_INVALID');
 if(phase==='reset')need(validPassword(newPassword)&&newPassword!==password,'FORMS_FIXTURE_INVALID');
 return{email,password,phone:phase==='register'?phone:null,code:phase==='register'?null:code,newPassword:phase==='reset'?newPassword:null};
}
function wrongCode(value){need(/^\d{6}$/.test(value),'FORMS_FIXTURE_INVALID');return value.slice(0,5)+(Number(value[5])+1)%10;}
const FIELD_BODY='- eraseText: 256\n- inputText: ${MAESTRO_ACCOUNT_FIELD_VALUE}\n- hideKeyboard';
const BUTTONS=Object.freeze(['Acepto el tratamiento necesario para mi cuenta','Crear cuenta','Reenviar código','Ya tengo un código','Verificar cuenta','Enviar código','Ya tengo un código de recuperación','Actualizar contraseña','Iniciar sesión','Cerrar sesión']);
const BUTTON_TARGETS=Object.freeze(['consent','register-submit','resend-code','verify-resume','verify-submit','request-recovery','reset-resume','reset-submit','login-submit','logout']);
const SCROLL_TARGETS=Object.freeze(Object.fromEntries([...Object.entries(LABELS).map(([key,label])=>['input-'+key,Object.freeze({label,kind:'input'})]),...BUTTONS.map((label,i)=>[BUTTON_TARGETS[i],Object.freeze({label,kind:'button'})])]));
function formsYaml(name,body){
 need(typeof name==='string'&&name.length===5&&/^EF[0-9]{3}$/.test(name)&&body===FIELD_BODY,'FORMS_MAESTRO_FAILED');
 return 'appId: '+PACKAGE+'\nname: '+name+' private account\n---\n'+body+'\n';
}
function landingReady(route,nodes){
 const field=label=>nodes.some(node=>node.package===PACKAGE&&node.class==='android.widget.EditText'&&node['content-desc']===label&&node.enabled==='true');
 if(route==='register')return account.hasLabel(nodes,'Crear cuenta')&&field('Nombre');
 if(route==='forgot-password')return account.hasLabel(nodes,'Recuperar contraseña')&&field('Correo');
 if(route==='login')return account.hasLabel(nodes,'Accede a tu cuenta de Sport Center.')&&field('Correo electrónico');
 throw new FormsError('FORMS_UI_INVALID');
}
function screenSize(text){
 need(typeof text==='string'&&text.length<=4096,'FORMS_PROCESS_FAILED');
 const lines=text.trim().split(/\r?\n/),physical=/^Physical size: ([1-9][0-9]{0,3})x([1-9][0-9]{0,3})$/.exec(lines[0]),override=lines.length===2?/^Override size: ([1-9][0-9]{0,3})x([1-9][0-9]{0,3})$/.exec(lines[1]):null;
 need(physical&&lines.length<=2&&(lines.length===1||override),'FORMS_PROCESS_FAILED');
 const match=override||physical,width=Number(match[1]),height=Number(match[2]);need(width<=8192&&height<=8192,'FORMS_PROCESS_FAILED');return{width,height};
}
function visiblePoint(nodes,label,kind,viewport,route){
 need(viewport&&Number.isInteger(viewport.width)&&Number.isInteger(viewport.height)&&viewport.width>0&&viewport.height>0,'FORMS_UI_INVALID');
 const regions=nodes.filter(node=>node.package===PACKAGE&&node.class==='android.widget.ScrollView'),selected=regions.length?selectedRegion(nodes,regions,viewport,{label,kind,route}):null;
 if(route&&!regions.length)return null;
 if(regions.length&&!selected)return null;
 const region=selected?rectangle(selected.bounds):{left:0,top:0,right:viewport.width,bottom:viewport.height};
 if(!region||selected?.enabled==='false'||region.right>viewport.width||region.bottom>viewport.height)return null;
 nodes=scopedFormNodes(nodes,viewport,{label,kind,route});
 const found=nodes.filter(node=>node.package===PACKAGE&&[node.text,node['content-desc']].includes(label)&&node.enabled==='true'&&(kind==='input'?node.class==='android.widget.EditText':node.clickable==='true'));
 need(found.length<=1,'FORMS_UI_INVALID');if(!found.length)return null;
 const bounds=/^\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]$/.exec(found[0].bounds||'');
 if(!bounds||Number(bounds[1])<region.left||Number(bounds[2])<region.top||Number(bounds[3])>region.right||Number(bounds[4])>region.bottom)return null;
 try{const point=account.point(nodes,label,kind);return point[0]>=0&&point[0]<viewport.width&&point[1]>=0&&point[1]<viewport.height?point:null;}catch{return null;}
}
function rectangle(value){
 const match=/^\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]$/.exec(value||'');if(!match)return null;
 const [left,top,right,bottom]=match.slice(1).map(Number);return right>left&&bottom>top&&right<=8192&&bottom<=8192?{left,top,right,bottom}:null;
}
// Keep ancestry private; the historical strict parser remains the authority for XML validation.
const UI_ANCESTORS=new WeakMap();
function parseFormsUi(source){
 const nodes=account.parsePrivateUi(source),root={children:[]},stack=[root];
 for(const match of source.matchAll(/<[^>]+>/g)){
  const token=match[0];if(token.startsWith('<?'))continue;
  if(token.startsWith('</')){stack.pop();continue;}
  const opening=/^<(hierarchy|node)([\s\S]*?)(\/?)>$/.exec(token);need(opening,'FORMS_UI_INVALID');
  const item={name:opening[1],children:[],parent:stack.at(-1)};stack.at(-1).children.push(item);if(!opening[3])stack.push(item);
 }
 const pending=[...root.children[0].children];let index=0;
 while(pending.length){const item=pending.shift();item.attrs=nodes[index++];const ancestors=[];for(let parent=item.parent;parent;parent=parent.parent)if(parent.attrs)ancestors.push(parent.attrs);UI_ANCESTORS.set(item.attrs,ancestors);pending.push(...item.children);}
 need(index===nodes.length,'FORMS_UI_INVALID');return nodes;
}
const SYNTAX_FAILURES=Object.freeze(['none','type-size','doctype','instruction','lexical','text','nesting','tag','node-limit','depth-limit','attribute','entity','codepoint','root','tag-placement','unclassified']);
// Diagnostic replay only: never accepts a snapshot rejected by the historical parser.
function classifyUiSyntax(source){
 if(typeof source!=='string'||source.length===0||source.length>512*1024)return'type-size';if(source.includes('<!'))return'doctype';
 const input=source.replace(/^<\?xml version=['"]1\.0['"](?: encoding=['"]UTF-8['"])?(?: standalone=['"]yes['"])?\s*\?>/,'');if(input.includes('<?'))return'instruction';
 const root={name:'#root',children:[]},stack=[root];let offset=0,count=0;
 for(const match of input.matchAll(/<[^>]+>|[^<]+/g)){
  if(match.index!==offset)return'lexical';offset+=match[0].length;const token=match[0];
  if(!token.startsWith('<')){if(token.trim())return'text';continue;}
  if(token.startsWith('</')){if(stack.length<=1||token!=='</'+stack.at(-1).name+'>')return'nesting';stack.pop();continue;}
  const opening=/^<(hierarchy|node)([\s\S]*?)(\/?)>$/.exec(token);if(!opening)return'tag';if(++count>4096)return'node-limit';if(stack.length>64)return'depth-limit';
  let tail=opening[2];const names=new Set();
  while(tail.trim()){
   const attr=/^\s+([\w:.-]+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(tail);if(!attr||names.has(attr[1]))return'attribute';names.add(attr[1]);const raw=attr[2]??attr[3];
   if(raw.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g,'').includes('&'))return'entity';
   for(const entity of raw.matchAll(/&([^;]+);/g)){const item=entity[1];if(['amp','lt','gt','quot','apos'].includes(item))continue;const code=item[1]==='x'?parseInt(item.slice(2),16):Number(item.slice(1));if(!Number.isSafeInteger(code)||code<32||code>0x10ffff||code>=0xd800&&code<=0xdfff)return'codepoint';}
   tail=tail.slice(attr[0].length);
  }
  const node={name:opening[1],children:[]};stack.at(-1).children.push(node);if(!opening[3])stack.push(node);
 }
 if(offset!==input.length)return'lexical';if(stack.length!==1||root.children.length!==1||root.children[0].name!=='hierarchy')return'root';
 const pending=[...root.children[0].children];while(pending.length){const node=pending.shift();if(node.name!=='node')return'tag-placement';pending.push(...node.children);}return'unclassified';
}
function safeSyntaxDiagnostic(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'invalidReads')||!Object.hasOwn(value,'lastFailure')||!Number.isInteger(value.invalidReads)||value.invalidReads<0||value.invalidReads>1000||!SYNTAX_FAILURES.includes(value.lastFailure)||((value.invalidReads===0)!==(value.lastFailure==='none')))return null;
 return{invalidReads:value.invalidReads,lastFailure:value.lastFailure};
}
const RECOVERY_ANCHORS=Object.freeze([{label:'Código de recuperación',kind:'input',strong:true},{label:'Nueva contraseña',kind:'input',strong:true},{label:'Correo',kind:'input',strong:false},{label:'Actualizar contraseña',kind:'button',strong:false}].map(Object.freeze));
function selectedRegion(nodes,regions,viewport,{label,kind,route}={}){
 if(regions.length===1)return regions[0];
 const owned=nodes.filter(node=>node.package===PACKAGE),candidates=[];
 const parentOf=node=>{const ancestors=UI_ANCESTORS.get(node);if(!ancestors)return null;const parent=ancestors.find(item=>regions.includes(item)),box=rectangle(node.bounds),region=parent&&rectangle(parent.bounds);return parent&&box&&region&&box.right>region.left&&box.left<region.right&&box.bottom>region.top&&box.top<region.bottom&&box.right<=viewport.width&&box.bottom<=viewport.height?parent:null;};
 if(route==='forgot-password'){
  const strong=[],fallback=[];
  for(const anchor of RECOVERY_ANCHORS){const matches=owned.filter(node=>[node.text,node['content-desc']].includes(anchor.label)&&(anchor.kind==='input'?node.class==='android.widget.EditText':node.clickable==='true'&&node.enabled==='true'));if(matches.length>1&&anchor.strong)return null;if(matches.length===1){const parent=parentOf(matches[0]);if(parent)(anchor.strong?strong:fallback).push(parent);}}
  const unique=[...new Set(strong.length?strong:fallback)];return unique.length===1?unique[0]:null;
 }
 const targets=owned.filter(node=>[node.text,node['content-desc']].includes(label)&&(kind==='input'?node.class==='android.widget.EditText':node.clickable==='true')&&node.enabled==='true');
 if(targets.length===1){const parent=parentOf(targets[0]);if(parent)candidates.push(parent);}
 const unique=[...new Set(candidates)];return unique.length===1?unique[0]:null;
}
function scopedFormNodes(nodes,viewport,context){
 const regions=nodes.filter(node=>node.package===PACKAGE&&node.class==='android.widget.ScrollView');
 if(!regions.length)return nodes;
 const selected=selectedRegion(nodes,regions,viewport,context);if(!selected)return [];
 return UI_ANCESTORS.has(selected)?nodes.filter(node=>node===selected||UI_ANCESTORS.get(node)?.includes(selected)):nodes;
}
function scrollGeometry(nodes,viewport,context){
 const regions=nodes.filter(node=>node.package===PACKAGE&&node.class==='android.widget.ScrollView');
 const fail=(result,regionValid=false)=>({regionFound:regions.length>0,regionValid,laneFound:false,result});
 if(!regions.length)return fail('missing-region');const selected=selectedRegion(nodes,regions,viewport,context);if(!selected)return fail('multiple-regions');
 const region=rectangle(selected.bounds);
 if(!region||selected.enabled==='false'||region.right>viewport.width||region.bottom>viewport.height||region.right-region.left<96||region.bottom-region.top<160)return fail('invalid-region');
 const controls=[];
 for(const node of nodes){
  if(node===selected||node.package!==PACKAGE||!(node.class==='android.widget.EditText'||node.clickable==='true'))continue;
  if(UI_ANCESTORS.has(selected)&&!UI_ANCESTORS.get(node)?.includes(selected))continue;
  const box=rectangle(node.bounds);if(!box)return fail('invalid-controls',true);
  if(box.right<=region.left||box.left>=region.right||box.bottom<=region.top||box.top>=region.bottom)continue;
  controls.push({left:Math.max(region.left,box.left),right:Math.min(region.right,box.right)});
 }
 if(!controls.length)return fail('no-padding-lane',true);
 const leftEnd=Math.min(...controls.map(box=>box.left)),rightStart=Math.max(...controls.map(box=>box.right));
 const x=leftEnd-region.left>=12?Math.floor((region.left+leftEnd)/2):region.right-rightStart>=12?Math.floor((rightStart+region.right)/2):null;
 if(x===null)return fail('no-padding-lane',true);
 const inset=Math.max(8,Math.min(24,Math.floor((region.bottom-region.top)*0.08))),top=region.top+inset,bottom=region.bottom-inset;
 const upperY=Math.floor(top+(bottom-top)*0.2),lowerY=Math.floor(top+(bottom-top)*0.8);
 if(lowerY-upperY<80||x<=region.left+3||x>=region.right-3)return fail('invalid-region');
 return{regionFound:true,regionValid:true,laneFound:true,result:'valid',x,upperY,lowerY};
}
const SCROLL_RESULTS=Object.freeze(['searching','already-visible','found','missing-region','multiple-regions','invalid-region','invalid-controls','no-padding-lane','target-invalid','gesture-limit','deadline','read-error','swipe-error']);
function safeScrollDiagnostic(value){
 const keys=['target','direction','attempts','regionFound','regionValid','laneFound','result'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(value,key))||!Object.hasOwn(SCROLL_TARGETS,value.target)||!['UP','DOWN'].includes(value.direction)||!Number.isInteger(value.attempts)||value.attempts<0||value.attempts>10||!['regionFound','regionValid','laneFound'].every(key=>typeof value[key]==='boolean')||!SCROLL_RESULTS.includes(value.result))return null;
 return Object.fromEntries(keys.map(key=>[key,value[key]]));
}
async function scrollControl({readUi,swipe,viewport,label,kind,direction,target,route,now=Date.now,onDiagnostic=()=>{}}){
 need(Object.hasOwn(SCROLL_TARGETS,target)&&SCROLL_TARGETS[target].label===label&&SCROLL_TARGETS[target].kind===kind&&['UP','DOWN'].includes(direction),'FORMS_UI_INVALID');
 need(route===undefined||['register','forgot-password','login','account'].includes(route),'FORMS_UI_INVALID');
 const deadline=now()+30000,diagnostic={target,direction,attempts:0,regionFound:false,regionValid:false,laneFound:false,result:'searching'};
 const publish=()=>onDiagnostic({...diagnostic});
 const stop=(result,code='FORMS_UI_INVALID')=>{diagnostic.result=result;publish();throw new FormsError(code);};
 for(;;){
  if(now()>=deadline)stop('deadline','FORMS_UI_TIMEOUT');
  let nodes;try{nodes=await readUi(deadline);}catch(error){diagnostic.result='read-error';publish();throw error;}
  if(now()>=deadline)stop('deadline','FORMS_UI_TIMEOUT');
  let point;try{point=visiblePoint(nodes,label,kind,viewport,route);}catch(error){diagnostic.result='target-invalid';publish();throw error;}
  if(point){diagnostic.result=diagnostic.attempts?'found':'already-visible';publish();return point;}
  if(diagnostic.attempts>=10)stop('gesture-limit','FORMS_UI_TIMEOUT');
  const geometry=scrollGeometry(nodes,viewport,{label,kind,route});diagnostic.regionFound=geometry.regionFound;diagnostic.regionValid=geometry.regionValid;diagnostic.laneFound=geometry.laneFound;
  if(geometry.result!=='valid')stop(geometry.result);
  if(now()>=deadline)stop('deadline','FORMS_UI_TIMEOUT');
  diagnostic.attempts++;publish();
  try{await swipe(geometry,direction,deadline);}catch(error){diagnostic.result='swipe-error';publish();throw error;}
 }
}
const MAESTRO_KEYS=Object.freeze(['action','resultObserved','exitCode','timedOut','junitRead','junitValid','errorEnum','exceptionEnum']);
const EXCEPTIONS=Object.freeze({'io.grpc.StatusRuntimeException':'grpc-status','java.net.ConnectException':'java-connect','java.net.SocketTimeoutException':'java-socket-timeout','java.io.IOException':'java-io','java.lang.IllegalStateException':'java-illegal-state','java.lang.IllegalArgumentException':'java-illegal-argument','java.util.concurrent.TimeoutException':'java-timeout','java.lang.OutOfMemoryError':'java-out-of-memory'});
function maestroExceptionEnum(result){
 const text=[result?.stdout,result?.stderr].filter(value=>typeof value==='string').map(value=>value.slice(0,1048576)).join('\n');
 for(const[name,code]of Object.entries(EXCEPTIONS))if(text.includes(name))return code;
 return /\bmaestro\.[A-Za-z0-9_.$]*(?:Exception|Error|Failure)\b/.test(text)?'maestro-public-error':'none';
}
function safeMaestroDiagnostic(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==MAESTRO_KEYS.length||!MAESTRO_KEYS.every(key=>Object.hasOwn(value,key)))return null;
 if(!['scroll','input'].includes(value.action)||!['resultObserved','timedOut','junitRead','junitValid'].every(key=>typeof value[key]==='boolean')||!(value.exitCode===null||Number.isInteger(value.exitCode)&&value.exitCode>=-1&&value.exitCode<=255)||!['none','element-not-found','device-offline','timeout','junit-invalid','process-error','other'].includes(value.errorEnum)||!['none','maestro-public-error',...Object.values(EXCEPTIONS)].includes(value.exceptionEnum))return null;
 return Object.fromEntries(MAESTRO_KEYS.map(key=>[key,value[key]]));
}
function maestroErrorEnum(result){
 if(result?.timedOut===true)return'timeout';
 const text=[result?.stdout,result?.stderr].filter(value=>typeof value==='string').map(value=>value.slice(0,1048576)).join('\n');
 if(/device[^\r\n]*(?:offline|not found)|no devices\/emulators|device disconnected/i.test(text))return'device-offline';
 if(/element[^\r\n]*not found|no (?:(?:matching|visible) )?elements? found|unable to find[^\r\n]*element/i.test(text))return'element-not-found';
 if(/timed? out|timeout|deadline exceeded/i.test(text))return'timeout';
 return'other';
}
async function waitForUi(predicate,{readUi,now=Date.now,wait=pause}){
 const deadline=now()+45000;let invalidReads=0;
 while(now()<deadline){
  let nodes;
  try{nodes=await readUi();}
  catch(error){
   if(!(error instanceof account.AccountError)||error.code!=='ACCOUNT_UI_INVALID')throw error;
   if(++invalidReads>=3)throw new FormsError('FORMS_UI_INVALID');
   await wait(250);continue;
  }
  if(predicate(nodes))return nodes;
  await wait(250);
 }
 throw new FormsError('FORMS_UI_TIMEOUT');
}
function stage(state,value){need(STAGES.includes(value),'FORMS_UI_INVALID');state.stage=value;}
async function executePhase(driver,secret,state){
 const mark=(id,evidence)=>{state.cases[id]='passed';state.evidence[evidence]=true;};
 const submit=async(label,before,after,predicate)=>{stage(state,before);state.operationUncertain=true;await driver.tap(label);stage(state,after);await driver.wait(predicate);state.operationUncertain=false;};
 const recoveryForm=async()=>{
  state.recoveryUi={codeObserved:false,updateButtonObserved:false,lastCodeVisible:false,lastUpdateButtonVisible:false};
  const observe=nodes=>{const code=account.hasLabel(nodes,'Código de recuperación'),button=account.hasLabel(nodes,'Actualizar contraseña');state.recoveryUi={codeObserved:state.recoveryUi.codeObserved||code,updateButtonObserved:state.recoveryUi.updateButtonObserved||button,lastCodeVisible:code,lastUpdateButtonVisible:button};return{code,button};};
  await driver.wait(nodes=>observe(nodes).code);
  await driver.reveal('Actualizar contraseña');
  await driver.wait(nodes=>observe(nodes).button);
 };
 const requestRecovery=async()=>{
  stage(state,'recovery-open');await driver.open('forgot-password');await driver.fill('recoveryEmail',secret.email,{direction:'UP'});
  stage(state,'recovery-submit');state.operationUncertain=true;await driver.tap('Enviar código');
  if(state.phase==='request'){stage(state,'recovery-settle');await driver.pause(65000);}
  stage(state,'recovery-response');
  await recoveryForm();state.operationUncertain=false;mark('EF05','recoveryRequested');
 };
 if(state.phase==='register'){
  stage(state,'register-open');await driver.open('register');await driver.wait(nodes=>account.hasLabel(nodes,'Crear cuenta'));
  for(const[key,value]of[['name','Prueba Formulario'],['surname','Sport'],['secondSurname','Center'],['registrationEmail',secret.email],['phone',secret.phone],['password',secret.password],['confirmation',secret.password]])await driver.fill(key,value,{secure:['password','confirmation'].includes(key)});
  stage(state,'register-consent');await driver.tap('Acepto el tratamiento necesario para mi cuenta');await driver.wait(nodes=>nodes.some(n=>n.package===PACKAGE&&n['content-desc']==='Acepto el tratamiento necesario para mi cuenta'&&n.checked==='true'));
  await submit('Crear cuenta','register-submit','register-response',nodes=>account.hasLabel(nodes,'Verificar correo')&&account.hasLabel(nodes,'Código de verificación'));mark('EF01','registered');
  await submit('Reenviar código','resend-submit','resend-response',nodes=>account.hasLabel(nodes,NOTICE_RESENT));mark('EF02','resent');
 }else if(state.phase==='verify'){
  stage(state,'verify-open');await driver.open('register');await driver.fill('registrationEmail',secret.email);stage(state,'verify-resume');await driver.tap('Ya tengo un código');await driver.wait(nodes=>account.hasLabel(nodes,'Verificar correo')&&account.fieldMatches(nodes,'Correo electrónico',secret.email));
  await driver.fill('verification',wrongCode(secret.code));await submit('Verificar cuenta','verify-invalid-submit','verify-invalid-response',nodes=>account.hasLabel(nodes,'Código incorrecto. Intentos restantes: 2.')&&!account.hasLabel(nodes,'Cuenta verificada'));mark('EF03','invalidVerificationDidNotComplete');
  await driver.fill('verification',secret.code);await submit('Verificar cuenta','verify-submit','verify-response',nodes=>account.hasLabel(nodes,'Cuenta verificada')&&account.hasLabel(nodes,'Tu correo quedó confirmado. Ya puedes iniciar sesión en Sport Center.'));mark('EF04','verified');
  await requestRecovery();
 }else if(state.phase==='reset'){
  stage(state,'reset-open');await driver.open('forgot-password');await driver.fill('recoveryEmail',secret.email,{direction:'UP'});stage(state,'reset-resume');await driver.tap('Ya tengo un código de recuperación');await recoveryForm();mark('EF06','resumedWithoutRequest');
  await driver.fill('recovery',wrongCode(secret.code),{direction:'UP'});await driver.fill('newPassword',secret.newPassword,{secure:true});await driver.fill('confirmation',secret.newPassword,{secure:true});
  await submit('Actualizar contraseña','reset-invalid-submit','reset-invalid-response',nodes=>account.hasLabel(nodes,RESET_ERROR)&&!account.hasLabel(nodes,'Contraseña actualizada'));mark('EF07','invalidResetDidNotComplete');
  await driver.fill('recovery',secret.code,{direction:'UP'});await submit('Actualizar contraseña','reset-submit','reset-response',nodes=>account.hasLabel(nodes,'Contraseña actualizada')&&account.hasLabel(nodes,'Tu contraseña se cambió correctamente. Inicia sesión con la nueva contraseña.'));mark('EF08','passwordUpdated');
  stage(state,'login-open');await driver.open('login');await driver.fill('registrationEmail',secret.email,{direction:'UP'});await driver.fill('password',secret.newPassword,{secure:true,login:true});
  await submit('Iniciar sesión','login-submit','login-response',nodes=>account.hasLabel(nodes,'Mi cuenta')&&account.hasLabel(nodes,'Has iniciado sesión en Sport Center.'));state.evidence.newPasswordLogin=true;
  stage(state,'logout-submit');state.operationUncertain=true;await driver.tap('Cerrar sesión');stage(state,'logout-response');
  await driver.open('account');await driver.wait(nodes=>account.hasLabel(nodes,'Inicia sesión con tu cuenta verificada o regístrate para comenzar.')&&!account.hasLabel(nodes,'Has iniciado sesión en Sport Center.'));
  state.operationUncertain=false;state.evidence.loggedOut=true;state.cases.EF09='passed';
  await requestRecovery();
 }else if(state.phase==='request')await requestRecovery();
 else throw new FormsError('FORMS_SOURCE_INVALID');
}
function publicReport(state,config){
 const phase=Object.hasOwn(PHASE_CASES,state.phase)?state.phase:null;
 const report={version:1,scope:'owned-account-email-forms-android-api34',phase,artifactSourceCommit:config.sourceCommit,automationCommit:/^[a-f0-9]{40}$/.test(state.automationCommit||'')?state.automationCommit:null,buildId:config.buildId,apkSha256:config.sha256,
  producerRun:config.producerRun,producerAttempt:config.producerAttempt,status:state.status==='passed'?'passed':'failed',stage:STAGES.includes(state.failureStage||state.stage)?state.failureStage||state.stage:'unknown',
  cases:(phase?PHASE_CASES[phase]:[]).map(id=>({id,status:['passed','failed','not_run'].includes(state.cases?.[id])?state.cases[id]:'not_run'})),evidence:Object.fromEntries(EVIDENCE.map(k=>[k,state.evidence?.[k]===true])),operationUncertain:state.operationUncertain===true,
  recoveryUi:Object.fromEntries(['codeObserved','updateButtonObserved','lastCodeVisible','lastUpdateButtonVisible'].map(key=>[key,state.recoveryUi?.[key]===true])),
  maestroDiagnostic:safeMaestroDiagnostic(state.maestroDiagnostic),
  scrollDiagnostic:safeScrollDiagnostic(state.scrollDiagnostic),
  cleanup:{device:state.cleanup?.device===true,sandbox:state.cleanup?.sandbox===true,localSession:state.cleanup?.localSession===true},sandboxDiagnostic:isSafeSandboxDiagnostic(state.sandboxDiagnostic)?state.sandboxDiagnostic:null,failureCodes:[...new Set((state.errors||[]).map(safeCode))],
  gmailDelivery:'not-observed-by-runner',serverRevocation:'not-independently-observed',physicalDevice:'not-run',payment:'not-run'};
 if(phase==='request')report.syntaxDiagnostic=safeSyntaxDiagnostic(state.syntaxDiagnostic);
 if(report.status==='passed'&&(!phase||report.stage!=='completed'||!report.cases.length||!report.cases.every(c=>c.status==='passed')||!REQUIRED_EVIDENCE[phase].every(key=>report.evidence[key])||!Object.values(report.cleanup).every(Boolean)||report.operationUncertain||report.failureCodes.length))report.status='failed';
 if(report.status==='passed'&&phase!=='register'&&(!report.recoveryUi.codeObserved||!report.recoveryUi.updateButtonObserved))report.status='failed';
 if(report.status==='passed'&&report.maestroDiagnostic!==null)report.status='failed';
 if(report.status==='passed'&&report.scrollDiagnostic&&!['found','already-visible'].includes(report.scrollDiagnostic.result))report.status='failed';
 if(report.status==='passed'&&phase==='request'&&report.syntaxDiagnostic===null)report.status='failed';
 if(report.status==='passed'&&phase==='request'&&EVIDENCE.some(key=>report.evidence[key]!== (key==='recoveryRequested')))report.status='failed';
 return report;
}
async function strictRun(file,args,options={}){try{return(await promisify(execFile)(file,args,{encoding:'utf8',timeout:45000,maxBuffer:1024*1024,windowsHide:true,...options})).stdout;}catch{throw new FormsError('FORMS_PROCESS_FAILED');}}
const stdout=x=>typeof x==='string'?x:x.stdout;
async function apkHash(file){const digest=createHash('sha256');for await(const part of fs.createReadStream(file))digest.update(part);return digest.digest('hex');}
async function runPhase({env,config,context,apk,run=strictRun,create=createSandbox,parent=account.sandboxParent,hash=apkHash,now=Date.now,wait=pause,xmlTree,execute=executePhase}){
 provenance.verifyConfig(config);need(process.platform==='linux'||env.ACCOUNT_UNIT_TEST===true,'FORMS_SANDBOX_FAILED');
 need(context.artifactSourceCommit===config.sourceCommit&&context.automationCommit===env.GITHUB_SHA&&context.apkSha256===config.sha256&&context.producerVerified===true&&context.parentInspectionVerified===true&&context.producerRun===config.producerRun&&context.producerAttempt===config.producerAttempt&&context.buildId===config.buildId&&context.receiptSha256===provenance.fingerprint(config)&&context.sandboxPreflight?.status==='passed'&&['ipv4RejectedWithCounter','adbLoopbackReachable','maestroVersionVerified','privateFileRoundtripVerified','cleanupConfirmed'].every(key=>context.sandboxPreflight[key]===true),'FORMS_SOURCE_INVALID');need(await hash(apk)===config.sha256,'FORMS_SOURCE_INVALID');
 const phase=context.phase,secret=credentials(env,phase),state={phase,status:'failed',stage:'device-check',automationCommit:context.automationCommit,cases:{},evidence:{},errors:[],cleanup:{},operationUncertain:false,...(phase==='request'?{syntaxDiagnostic:{invalidReads:0,lastFailure:'none'}}:{})};
 let box,parentContext,setupAttempted=false,installAttempted=false,remoteCreated=false,serial,viewport,currentRoute,sequence=0;
 const remote='/data/local/tmp/sportcenter-email-forms-'+env.GITHUB_RUN_ID;need(/^\d+$/.test(env.GITHUB_RUN_ID||''),'FORMS_SOURCE_INVALID');
 const adb=async(args,options={})=>stdout(await run('adb',['-s',serial,...args],options));
 const readUi=async deadline=>{const options=()=>{if(deadline===undefined)return{};const remaining=deadline-now();need(remaining>0,'FORMS_UI_TIMEOUT');return{timeout:Math.min(10000,remaining)};};try{await adb(['shell','uiautomator','dump',remote+'/ui.xml'],options());const source=await adb(['exec-out','cat',remote+'/ui.xml'],options());try{return parseFormsUi(source);}catch(error){if(phase==='request'&&['ACCOUNT_UI_INVALID','FORMS_UI_INVALID'].includes(error?.code)){state.syntaxDiagnostic.invalidReads=Math.min(1000,state.syntaxDiagnostic.invalidReads+1);state.syntaxDiagnostic.lastFailure=classifyUiSyntax(source);}throw error;}}finally{await adb(['shell','rm','-f',remote+'/ui.xml'],{timeout:5000});}};
 const flow=async(body,value)=>{
  const diagnostic={action:'input',resultObserved:false,exitCode:null,timedOut:false,junitRead:false,junitValid:false,errorEnum:'process-error',exceptionEnum:'none'};
  try{
   const name='EF'+String(++sequence).padStart(3,'0'),file=await box.createPrivateFile(name+'.yaml',formsYaml(name,body)),output=path.posix.join(box.root,name+'.xml');
   const result=await box.runMaestro(serial,['test','--format','junit','--output',output,file],{secretEnv:value===undefined?{}:{MAESTRO_ACCOUNT_FIELD_VALUE:value}});
   diagnostic.resultObserved=true;diagnostic.exitCode=Number.isInteger(result?.exitCode)&&result.exitCode>=-1&&result.exitCode<=255?result.exitCode:null;diagnostic.timedOut=result?.timedOut===true;diagnostic.errorEnum=maestroErrorEnum(result);diagnostic.exceptionEnum=maestroExceptionEnum(result);
   need(result?.exitCode===0&&!diagnostic.timedOut,'FORMS_MAESTRO_FAILED');
   diagnostic.errorEnum='junit-invalid';const junit=await box.readPrivateFile(name+'.xml');diagnostic.junitRead=true;account.verifyJUnit(junit,name,xmlTree);diagnostic.junitValid=true;
  }catch(error){if(!diagnostic.resultObserved)diagnostic.exceptionEnum=maestroExceptionEnum(error);state.maestroDiagnostic=diagnostic;throw error;}
 };
 const measured=async(label,kind)=>{const point=visiblePoint(await readUi(),label,kind,viewport,currentRoute);need(point,'FORMS_UI_INVALID');return point;};
 const revealControl=async(label,kind,direction,target)=>scrollControl({readUi,viewport,label,kind,direction,target,route:currentRoute,now,onDiagnostic:value=>{state.scrollDiagnostic=value;},swipe:async(geometry,way,deadline)=>{const remaining=deadline-now();need(remaining>0,'FORMS_UI_TIMEOUT');const [from,to]=way==='DOWN'?[geometry.lowerY,geometry.upperY]:[geometry.upperY,geometry.lowerY];await adb(['shell','input','swipe',String(geometry.x),String(from),String(geometry.x),String(to),'400'],{timeout:Math.min(5000,remaining)});}});
 const reveal=async label=>{const i=BUTTONS.indexOf(label);need(i>=0,'FORMS_UI_INVALID');await revealControl(label,'button','DOWN',BUTTON_TARGETS[i]);};
 const tap=async label=>{await reveal(label);const point=await measured(label,'button');await adb(['shell','input','tap',...point.map(String)]);};
 const driver={
  async open(route){need(['register','forgot-password','login','account'].includes(route),'FORMS_UI_INVALID');currentRoute=route;await adb(['shell','am','start','-W','-n',PACKAGE+'/.MainActivity','-a','android.intent.action.VIEW','-d','sportcentermobile://'+route]);if(route!=='account')await waitForUi(nodes=>landingReady(route,nodes),{readUi,now,wait});},
  async wait(predicate){return waitForUi(predicate,{readUi,now,wait});},tap,reveal,async pause(duration){need(phase==='request'&&duration===65000,'FORMS_SOURCE_INVALID');await wait(duration);},
  async fill(key,value,{secure=false,login=false,direction='DOWN'}={}){stage(state,'field-'+key);await revealControl(LABELS[key],'input',direction,'input-'+key);const point=await measured(LABELS[key],'input');await adb(['shell','input','tap',...point.map(String)]);await flow(FIELD_BODY,value);stage(state,'check-'+key);
   const fieldNodes=async()=>scopedFormNodes(await readUi(),viewport,{label:LABELS[key],kind:'input',route:currentRoute});
   if(!secure){need(account.fieldMatches(await fieldNodes(),LABELS[key],value),'FORMS_INPUT_MISMATCH');return;}
   const show=login?'Mostrar contraseña':'Mostrar: '+LABELS[key],hide=login?'Ocultar contraseña':'Ocultar: '+LABELS[key];let shown=false;
   try{const p=await measured(show,'button');await adb(['shell','input','tap',...p.map(String)]);shown=true;need(account.fieldMatches(await fieldNodes(),LABELS[key],value),'FORMS_INPUT_MISMATCH');}
   finally{if(shown){const p=await measured(hide,'button');await adb(['shell','input','tap',...p.map(String)]);need(account.hasLabel(await fieldNodes(),show),'FORMS_INPUT_MISMATCH');}}
  }
 };
 try{
  const devices=stdout(await run('adb',['devices'],{})).trim().split(/\r?\n/).slice(1).filter(Boolean).map(v=>v.split(/\s+/));need(devices.length===1&&/^emulator-[0-9]+$/.test(devices[0][0])&&devices[0][1]==='device','FORMS_PROCESS_FAILED');serial=devices[0][0];need((await adb(['shell','getprop','ro.build.version.sdk'])).trim()==='34','FORMS_PROCESS_FAILED');viewport=screenSize(await adb(['shell','wm','size']));need(!(await adb(['shell','pm','list','packages',PACKAGE])).trim(),'FORMS_DEVICE_CLEANUP_FAILED');
  stage(state,'sandbox-parent');parentContext=parent(env);await parentContext.verifyMaestro(run);parentContext.confirm(false);stage(state,'sandbox-probes');setupAttempted=true;box=await create({runnerTemp:parentContext.path,runId:env.GITHUB_RUN_ID,env});
  need(box.probes?.ipv4RejectedWithCounter===true&&box.probes?.adbLoopbackReachable===true,'FORMS_SANDBOX_FAILED');remoteCreated=true;await adb(['shell','mkdir','-p',remote]);
  stage(state,'app-install');installAttempted=true;need(/Success/.test(await adb(['install','--no-streaming',apk])),'FORMS_PROCESS_FAILED');await execute(driver,secret,state);stage(state,'completed');state.status='passed';
 }catch(error){state.failureStage=state.stage;state.errors.push(error);if(error instanceof SandboxError)state.sandboxDiagnostic=safeSandboxDiagnostic(error);const pending=PHASE_CASES[phase].find(id=>state.cases[id]!=='passed');if(pending)state.cases[pending]='failed';}
 finally{
  try{if(serial){if(installAttempted){if((await adb(['shell','pm','list','packages',PACKAGE])).trim()){await adb(['shell','am','force-stop',PACKAGE]);await adb(['shell','pm','clear',PACKAGE]);need(/Success/.test(await adb(['uninstall',PACKAGE])),'FORMS_DEVICE_CLEANUP_FAILED');}need(!(await adb(['shell','pm','list','packages',PACKAGE])).trim(),'FORMS_DEVICE_CLEANUP_FAILED');}if(remoteCreated)await adb(['shell','rm','-rf',remote]);}state.cleanup.device=true;state.cleanup.localSession=true;}catch{state.failureStage ||= 'cleanup-device';state.errors.push(new FormsError('FORMS_DEVICE_CLEANUP_FAILED'));}
  if(box){try{await box.cleanup();state.cleanup.sandbox=true;if(state.sandboxDiagnostic)state.sandboxDiagnostic={sandboxCode:state.sandboxDiagnostic.sandboxCode,cleanupCode:null,cleanupConfirmed:true};}catch(error){state.failureStage ||= 'cleanup-sandbox';state.errors.push(new FormsError('FORMS_SANDBOX_CLEANUP_FAILED'));state.sandboxDiagnostic=safeSandboxDiagnostic(error);}}
  else state.cleanup.sandbox=!setupAttempted||state.sandboxDiagnostic?.cleanupConfirmed===true;
  try{if(parentContext&&state.cleanup.sandbox)parentContext.confirm(true);}catch{state.cleanup.sandbox=false;state.errors.push(new FormsError('FORMS_SANDBOX_CLEANUP_FAILED'));}
 }
 return publicReport(state,config);
}
module.exports={PACKAGE,PHASE_CASES,LABELS,EVIDENCE,REQUIRED_EVIDENCE,CODES,STAGES,FormsError,NOTICE_RESENT,RESET_ERROR,credentials,wrongCode,formsYaml,landingReady,screenSize,visiblePoint,parseFormsUi,classifyUiSyntax,safeSyntaxDiagnostic,scrollGeometry,scrollControl,safeScrollDiagnostic,safeMaestroDiagnostic,maestroErrorEnum,maestroExceptionEnum,waitForUi,stage,executePhase,publicReport,runPhase};
const REPORT_FILE='test-results/android-email-forms.json',PROOF_FILE='test-results/android-email-forms-source.json';
const filesFor=env=>{const scratch=account.locations(env).scratch;return{scratch,apk:path.join(scratch,'forms.apk'),metadata:path.join(scratch,'forms-eas-private.json'),proof:PROOF_FILE,report:REPORT_FILE};};
function noFormSecrets(env){need(!Object.keys(env).some(key=>key.startsWith('ANDROID_FORMS_')),'FORMS_SOURCE_INVALID');}
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
async function boundedBody(response,maximum){need(response.ok&&response.body,'FORMS_SOURCE_INVALID');const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;need(size<=maximum,'FORMS_SOURCE_INVALID');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);}
async function readGithub(env,endpoint){need(typeof env.GITHUB_TOKEN==='string'&&env.GITHUB_TOKEN.length>0,'FORMS_SOURCE_INVALID');const response=await fetch('https://api.github.com/repos/Markadw/SportCenter-mobile'+endpoint,{redirect:'error',headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});return JSON.parse((await boundedBody(response,1024*1024)).toString('utf8'));}
function readContext(config,env){const proof=JSON.parse(fs.readFileSync(PROOF_FILE,'utf8'));const phase=/^refs\/tags\/validation\/account-forms-(register|verify|reset|request)-[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.exec(env.GITHUB_REF||'');need(phase&&proof.phase===phase[1],'FORMS_SOURCE_INVALID');need(proof.artifactSourceCommit===config.sourceCommit&&proof.automationCommit===env.GITHUB_SHA&&proof.receiptSha256===provenance.fingerprint(config)&&proof.producerVerified===true&&proof.parentInspectionVerified===true&&proof.apkSha256===config.sha256&&proof.buildId===config.buildId&&proof.producerRun===config.producerRun&&proof.producerAttempt===config.producerAttempt,'FORMS_SOURCE_INVALID');return proof;}
async function prepareForms(config,env,run=strictRun){
 noFormSecrets(env);const files=filesFor(env);fs.mkdirSync(files.scratch,{recursive:true,mode:0o700});
 const context=provenance.verifyAutomation(config,{sha:env.GITHUB_SHA,ref:env.GITHUB_REF,repository:env.GITHUB_REPOSITORY,head:stdout(await run('git',['rev-parse','HEAD'])),changed:stdout(await run('git',['diff','--name-only','--no-renames',config.sourceCommit,'HEAD'])),dirty:stdout(await run('git',['status','--porcelain','--untracked-files=all']))});await run('git',['merge-base','--is-ancestor',config.sourceCommit,'HEAD']);
 const producer=await readGithub(env,'/actions/runs/'+config.producerRun),jobs=await readGithub(env,'/actions/runs/'+config.producerRun+'/attempts/'+config.producerAttempt+'/jobs?per_page=100'),metadata=await readGithub(env,'/actions/artifacts/'+config.artifactId);
 const response=await fetch('https://api.github.com/repos/'+config.repository+'/actions/artifacts/'+config.artifactId+'/zip',{redirect:'manual',headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});need(response.status===302,'FORMS_SOURCE_INVALID');const target=new URL(response.headers.get('location'));need(target.protocol==='https:'&&!target.username&&!target.password&&/(?:^|\.)(?:blob\.core\.windows\.net|actions\.githubusercontent\.com)$/.test(target.hostname),'FORMS_SOURCE_INVALID');
 const bytes=await boundedBody(await fetch(target,{redirect:'error',signal:AbortSignal.timeout(60000)}),config.artifactBytes),artifact=provenance.verifyArtifact(config,metadata,bytes),archive=path.join(files.scratch,'forms-parent.zip');fs.writeFileSync(archive,bytes,{flag:'wx',mode:0o600});
 try{const entries=stdout(await run('unzip',['-Z1',archive])).trim().split(/\r?\n/);const read=async name=>{const matches=entries.filter(e=>e===name||e.endsWith('/'+name));need(matches.length===1&&!matches[0].startsWith('/')&&!matches[0].split('/').includes('..'),'FORMS_SOURCE_INVALID');return JSON.parse(stdout(await run('unzip',['-p',archive,matches[0]])));};
  const verified=provenance.verifyProducer(config,producer,jobs,await read('android-build.json'),await read('android-inspection.json'));writeJson(files.proof,{...context,...verified,...artifact});
 }finally{fs.rmSync(archive,{force:true});}
}
async function probeForms(config,env,{run=strictRun,create=createSandbox,parent=account.sandboxParent,read=()=>readContext(config,env),save=writeJson}={}){
 noFormSecrets(env);need(!env.EXPO_TOKEN&&!env.GITHUB_TOKEN,'FORMS_SOURCE_INVALID');const context=read();let box,parentContext,attempted=false,failure,diagnostic=null,cleaned=false,probeStage='probe-adb-start-server';
 try{await run('adb',['start-server']);probeStage='sandbox-parent';parentContext=parent(env);await parentContext.verifyMaestro(run);parentContext.confirm(false);probeStage='sandbox-probes';attempted=true;box=await create({runnerTemp:parentContext.path,runId:env.GITHUB_RUN_ID,env});need(box.probes?.ipv4RejectedWithCounter===true&&box.probes?.adbLoopbackReachable===true,'FORMS_SANDBOX_FAILED');
  const version=await box.runAs(['maestro','--version'],{},30000);need(version.exitCode===0&&version.timedOut!==true&&version.stdout.trim().split(/\r?\n/).at(-1)==='2.12.0','FORMS_SANDBOX_FAILED');await box.createPrivateFile('forms-public-roundtrip.txt',account.PREFLIGHT_FILE);need(await box.readPrivateFile('forms-public-roundtrip.txt')===account.PREFLIGHT_FILE,'FORMS_SANDBOX_FAILED');
 }catch(error){failure=error;if(attempted)diagnostic=safeSandboxDiagnostic(error);}
 if(box){try{await box.cleanup();cleaned=true;if(diagnostic)diagnostic={sandboxCode:diagnostic.sandboxCode,cleanupCode:null,cleanupConfirmed:true};}catch(error){failure ||= error;diagnostic=safeSandboxDiagnostic(error);}}
 else cleaned=!attempted||diagnostic?.cleanupConfirmed===true;
 try{if(parentContext&&cleaned)parentContext.confirm(true);}catch(error){failure ||= error;cleaned=false;}
 if(failure||!cleaned){save(REPORT_FILE,publicReport({phase:context.phase,automationCommit:env.GITHUB_SHA,stage:STAGES.includes(probeStage)?probeStage:'sandbox-probes',status:'failed',sandboxDiagnostic:diagnostic,cleanup:{device:true,localSession:true,sandbox:cleaned},errors:[new FormsError(cleaned?safeCode(failure):'FORMS_SANDBOX_CLEANUP_FAILED')]},config));throw new FormsError(cleaned?safeCode(failure):'FORMS_SANDBOX_CLEANUP_FAILED');}
 save(PROOF_FILE,{...context,sandboxPreflight:{status:'passed',ipv4RejectedWithCounter:true,adbLoopbackReachable:true,maestroVersionVerified:true,privateFileRoundtripVerified:true,cleanupConfirmed:true}});
}
function verifyFinished(config,env,report){
 const currentPhase=/^refs\/tags\/validation\/account-forms-(register|verify|reset|request)-[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.exec(env.GITHUB_REF||'');need(currentPhase&&report.phase===currentPhase[1],'FORMS_SOURCE_INVALID');
 const clean=publicReport({phase:report.phase,status:report.status,stage:report.stage,automationCommit:report.automationCommit,cases:Object.fromEntries(report.cases.map(c=>[c.id,c.status])),evidence:report.evidence,operationUncertain:report.operationUncertain,recoveryUi:report.recoveryUi,maestroDiagnostic:report.maestroDiagnostic,scrollDiagnostic:report.scrollDiagnostic,syntaxDiagnostic:report.syntaxDiagnostic,cleanup:report.cleanup,errors:report.failureCodes.map(code=>new FormsError(code)),sandboxDiagnostic:report.sandboxDiagnostic},config);
 need(clean.status==='passed'&&report.artifactSourceCommit===config.sourceCommit&&report.automationCommit===env.GITHUB_SHA&&report.apkSha256===config.sha256&&report.buildId===config.buildId&&report.producerRun===config.producerRun&&report.producerAttempt===config.producerAttempt&&JSON.stringify(clean)===JSON.stringify(report),'FORMS_CASES_INCOMPLETE');return clean;
}
async function main(mode,env=process.env){
 if(mode==='cleanup'){noFormSecrets(env);return account.main('cleanup',env);}
 const config=provenance.readConfig();const files=filesFor(env);
 if(mode==='prepare')return prepareForms(config,env);
 if(mode==='runtime-dir'){noFormSecrets(env);return account.runtimeDirectory(env);}
 if(mode==='kvm'){noFormSecrets(env);return require('./android-16k.js').prepareKvm({env,save:()=>{}});}
 if(mode==='probe')return probeForms(config,env);
 if(mode==='view'){noFormSecrets(env);need(!env.GITHUB_TOKEN&&typeof env.EXPO_TOKEN==='string'&&env.EXPO_TOKEN.length>0,'FORMS_SOURCE_INVALID');readContext(config,env);const result=await strictRun('npx',['--yes','eas-cli@'+config.easCliVersion,'build:view',config.buildId,'--json'],{timeout:120000}),build=JSON.parse(result);provenance.verifyBuild(config,build,Date.now());writeJson(files.metadata,build);return;}
 if(mode==='download'){noFormSecrets(env);need(!env.EXPO_TOKEN&&!env.GITHUB_TOKEN,'FORMS_SOURCE_INVALID');readContext(config,env);try{const url=provenance.verifyBuild(config,JSON.parse(fs.readFileSync(files.metadata,'utf8')),Date.now()),downloaded=await require('./android-profiles.js').download(url,files.apk,config.sha256);need(downloaded===config.bytes,'FORMS_SOURCE_INVALID');fs.chmodSync(files.apk,0o600);}finally{fs.rmSync(files.metadata,{force:true});}return;}
 if(mode==='runtime'){need(!env.EXPO_TOKEN&&!env.GITHUB_TOKEN,'FORMS_SOURCE_INVALID');const context=readContext(config,env),{xmlTree}=require('./android-pinning.js');let result;try{result=await runPhase({env,config,context,apk:files.apk,xmlTree});}catch(error){result=publicReport({phase:context.phase,automationCommit:env.GITHUB_SHA,status:'failed',stage:'preflight',errors:[error]},config);}writeJson(REPORT_FILE,result);need(result.status==='passed','FORMS_CASES_INCOMPLETE');return;}
 if(mode==='finish'){noFormSecrets(env);verifyFinished(config,env,JSON.parse(fs.readFileSync(REPORT_FILE,'utf8')));return;}
 throw new FormsError('FORMS_SOURCE_INVALID');
}
Object.assign(module.exports,{REPORT_FILE,PROOF_FILE,filesFor,noFormSecrets,readContext,prepareForms,probeForms,verifyFinished,main});
if(require.main===module)main(process.argv[2]).catch(error=>{process.stderr.write((provenance.ERROR_CODES.includes(error?.code)?error.code:safeCode(error))+'\n');process.exitCode=1;});

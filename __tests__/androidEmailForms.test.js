/** @jest-environment node */
'use strict';
const test=globalThis.test||require('node:test').test;
const assert=require('node:assert/strict'),path=require('node:path');
const forms=require(path.join(process.env.EMAIL_FORMS_PREP_DIR||path.join(__dirname,'..','scripts'),'android-email-forms.cjs'));
const guard=require(path.join(process.env.EMAIL_FORMS_PREP_DIR||path.join(__dirname,'..','scripts'),'android-email-forms-source.cjs'));
const repo=process.env.ACCOUNT_REPO_ROOT||path.join(__dirname,'..');
const account=require(path.join(repo,'scripts','android-account.cjs'));
const {xmlTree}=require(path.join(repo,'scripts','android-pinning.js'));
const YAML=require('yaml');
const config=()=>({version:1,...guard.IDENTITY,sourceCommit:guard.EXPECTED_SOURCE,buildId:'11111111-2222-4333-8444-555555555555',sha256:'b'.repeat(64),bytes:10,fingerprint:'c'.repeat(64),producerRun:guard.EXPECTED_PRODUCER,producerAttempt:guard.EXPECTED_ATTEMPT,producerTag:guard.EXPECTED_PRODUCER_TAG,artifactId:202,artifactBytes:10,artifactSha256:'d'.repeat(64)});
const env=phase=>({ANDROID_FORMS_EMAIL:'qa+forms@example.com',ANDROID_FORMS_PASSWORD:'AnteriorSegura456!',ANDROID_FORMS_PHONE:'5551234567',ANDROID_FORMS_CODE:'654321',ANDROID_FORMS_NEW_PASSWORD:'NuevaSegura789!',GITHUB_SHA:'e'.repeat(40),GITHUB_REF:'refs/tags/validation/account-forms-'+phase+'-fixture'});
const node=(text,extra={})=>({package:forms.PACKAGE,text,enabled:'true',clickable:'true',...extra});
const state=phase=>({phase,status:'failed',stage:'preflight',automationCommit:'e'.repeat(40),cases:{},evidence:{},errors:[],cleanup:{},operationUncertain:false});
function driverFor(phase,secret,options={}){
 let screen='',notice='',checked=false,loggedIn=false,resetViewport='code';const fields={},calls=[],counters={registration:0,resend:0,recovery:0,reset:0,login:0,logout:0};
 const nodes=()=>{
  const values=Object.entries(fields).map(([key,value])=>node(value,{class:'android.widget.EditText','content-desc':forms.LABELS[key]}));
  if(screen==='register')return[...values,node('Crear cuenta'),node('',{'content-desc':'Acepto el tratamiento necesario para mi cuenta',checked:String(checked)})];
  if(screen==='verify')return[...values,node('Verificar correo'),node('Código de verificación'),...(notice?[node(notice)]:[])];
  if(screen==='verified')return[node('Cuenta verificada'),node('Tu correo quedó confirmado. Ya puedes iniciar sesión en Sport Center.')];
  if(screen==='email')return[...values,node('Recuperar contraseña'),node('Enviar código')];
  if(screen==='reset')return[...(resetViewport==='code'?[node('Código de recuperación')]:options.missingUpdateButton?[]:[node('Actualizar contraseña')]),...(notice?[node(notice)]:[])];
  if(screen==='done')return[node('Contraseña actualizada'),node('Tu contraseña se cambió correctamente. Inicia sesión con la nueva contraseña.')];
  if(screen==='login')return[...values,node('Iniciar sesión')];
  if(screen==='account')return[node('Mi cuenta'),node('Has iniciado sesión en Sport Center.')];
  return[node('Inicia sesión con tu cuenta verificada o regístrate para comenzar.')];
 };
 const driver={
  async open(route){calls.push(['open',route]);screen=route==='register'?'register':route==='forgot-password'?'email':route==='account'?(loggedIn?'account':'guest'):'login';notice='';},
  async fill(key,value){calls.push(['fill',key]);fields[key]=value;if(key==='recovery')resetViewport='code';if(['newPassword','confirmation'].includes(key))resetViewport='button';},
  async reveal(label){calls.push(['reveal',label]);assert.equal(label,'Actualizar contraseña');resetViewport='button';},
  async tap(label){calls.push(['tap',label]);
   if(options.failTap===label)throw new forms.FormsError('FORMS_UI_TIMEOUT');
   if(label==='Acepto el tratamiento necesario para mi cuenta')checked=true;
   else if(label==='Crear cuenta'){counters.registration++;assert.equal(checked,true);if(!options.registrationUnconfirmed)screen='verify';}
   else if(label==='Reenviar código'){counters.resend++;notice=forms.NOTICE_RESENT;}
   else if(label==='Ya tengo un código')screen='verify';
   else if(label==='Verificar cuenta'){if(fields.verification===secret.code||options.acceptWrongVerification)screen='verified';else notice='Código incorrecto. Intentos restantes: 2.';}
   else if(label==='Enviar código'){counters.recovery++;if(!options.recoveryUnconfirmed){screen='reset';resetViewport='code';}}
   else if(label==='Ya tengo un código de recuperación'){screen='reset';resetViewport='code';}
   else if(label==='Actualizar contraseña'){counters.reset++;if(fields.recovery===secret.code&&!options.resetUnconfirmed)screen='done';else notice=forms.RESET_ERROR;}
   else if(label==='Iniciar sesión'){counters.login++;if(!options.loginRejected){screen='account';loggedIn=true;}}
   else if(label==='Cerrar sesión'){counters.logout++;loggedIn=options.logoutSessionRemains===true;screen='login';}
   else throw new Error('unexpected public test action');
  },
  async wait(predicate){if(!predicate(nodes()))throw new forms.FormsError('FORMS_UI_TIMEOUT');return nodes();},
 };
 return{driver,calls,counters};
}
async function completed(phase,options={}){const c=config(),s=state(phase),secret=forms.credentials(env(phase),phase),d=driverFor(phase,secret,options);await forms.executePhase(d.driver,secret,s);s.status='passed';s.stage='completed';s.cleanup={device:true,sandbox:true,localSession:true};return{...d,s,c,report:forms.publicReport(s,c)};}
test('real registration and one resend are separate mandatory observations; no OTP or mailbox login is needed in this phase',async()=>{
 const result=await completed('register');assert.equal(result.report.status,'passed');assert.deepEqual(result.report.cases.map(c=>c.id),['EF01','EF02']);assert.equal(result.counters.registration,1);assert.equal(result.counters.resend,1);assert.equal(result.counters.recovery,0);assert.equal(result.report.gmailDelivery,'not-observed-by-runner');
});
test('verification uses the existing resume UI, observes incorrect code then verified account, and requests recovery once',async()=>{
 const result=await completed('verify');assert.equal(result.report.status,'passed');assert.equal(result.counters.registration,0);assert.equal(result.counters.resend,0);assert.equal(result.counters.recovery,1);assert.deepEqual(result.report.cases.map(c=>c.id),['EF03','EF04','EF05']);assert.equal(result.report.evidence.invalidVerificationDidNotComplete,true);
});
test('reset consumes the existing code before login, stable guest logout and exactly one new recovery request',async()=>{
 const result=await completed('reset');assert.equal(result.report.status,'passed');assert.equal(result.counters.recovery,1);assert.equal(result.counters.reset,2);assert.equal(result.counters.login,1);assert.equal(result.counters.logout,1);assert.equal(result.report.evidence.passwordUpdated,true);assert.equal(result.report.evidence.loggedOut,true);assert.equal(result.report.evidence.recoveryRequested,true);
 const guest=result.calls.findIndex(c=>c[0]==='open'&&c[1]==='account'),logout=result.calls.findIndex(c=>c[0]==='tap'&&c[1]==='Cerrar sesión'),request=result.calls.findIndex(c=>c[0]==='tap'&&c[1]==='Enviar código');
 assert.ok(guest>logout&&request>guest);assert.deepEqual(result.report.cases.map(c=>c.id),['EF06','EF07','EF08','EF09','EF05']);
 assert.deepEqual(result.report.recoveryUi,{codeObserved:true,updateButtonObserved:true,lastCodeVisible:false,lastUpdateButtonVisible:true});
});
test('recovery requires both real labels in successive viewports and missing the button cannot pass or submit reset',async()=>{
 const s=state('reset'),secret=forms.credentials(env('reset'),'reset'),d=driverFor('reset',secret,{missingUpdateButton:true});
 await assert.rejects(forms.executePhase(d.driver,secret,s),/FORMS_UI_TIMEOUT/);assert.equal(s.stage,'reset-resume');assert.equal(s.operationUncertain,false);assert.equal(d.counters.reset,0);assert.equal(d.counters.recovery,0);
 assert.deepEqual(s.recoveryUi,{codeObserved:true,updateButtonObserved:false,lastCodeVisible:false,lastUpdateButtonVisible:false});assert.equal(s.cases.EF06,undefined);
});
test('an unconfirmed recovery request after reset keeps EF05 failed and uncertain without repeating reset or mail',async()=>{
 const s=state('reset'),secret=forms.credentials(env('reset'),'reset'),d=driverFor('reset',secret,{recoveryUnconfirmed:true});
 await assert.rejects(forms.executePhase(d.driver,secret,s),/FORMS_UI_TIMEOUT/);assert.equal(s.cases.EF09,'passed');assert.equal(s.cases.EF05,undefined);assert.equal(s.evidence.loggedOut,true);assert.equal(s.evidence.recoveryRequested,undefined);assert.equal(s.operationUncertain,true);assert.equal(d.counters.recovery,1);assert.equal(d.counters.reset,2);
});
test('logout cannot pass from a login redirect while the account route still exposes a session',async()=>{
 const s=state('reset'),secret=forms.credentials(env('reset'),'reset'),d=driverFor('reset',secret,{logoutSessionRemains:true});
 await assert.rejects(forms.executePhase(d.driver,secret,s),/FORMS_UI_TIMEOUT/);assert.equal(s.stage,'logout-response');assert.equal(s.operationUncertain,true);assert.equal(s.evidence.loggedOut,undefined);assert.equal(s.cases.EF09,undefined);assert.equal(d.counters.logout,1);
});
test('response waiting rereads a transient invalid dump without relaxing the real UI parser or resubmitting an action',async()=>{
 let reads=0,clock=0,predicates=0;const valid='<hierarchy><node package="'+forms.PACKAGE+'" text="Código de recuperación"/></hierarchy>';
 const result=await forms.waitForUi(nodes=>{predicates++;return account.hasLabel(nodes,'Código de recuperación');},{readUi:async()=>account.parsePrivateUi(++reads===1?'<hierarchy><node':valid),now:()=>clock,wait:async duration=>{clock+=duration;}});
 assert.equal(reads,2);assert.equal(predicates,1);assert.equal(clock,250);assert.equal(account.hasLabel(result,'Código de recuperación'),true);
});
test('three invalid snapshots, malformed entities and DTDs still fail closed without raw content',async()=>{
 for(const invalid of ['<hierarchy><node','<!DOCTYPE hierarchy><hierarchy/>','<hierarchy><node text="&private;"/></hierarchy>']){
  let reads=0,clock=0;
  await assert.rejects(forms.waitForUi(()=>true,{readUi:async()=>{reads++;return account.parsePrivateUi(invalid);},now:()=>clock,wait:async duration=>{clock+=duration;}}),error=>error.code==='FORMS_UI_INVALID'&&!error.message.includes('private'));
  assert.equal(reads,3);assert.equal(clock,500);
 }
});
test('response waiting retains its deadline and never retries process failures as malformed UI',async()=>{
 let clock=0,reads=0;
 await assert.rejects(forms.waitForUi(()=>false,{readUi:async()=>[],now:()=>clock,wait:async duration=>{clock+=duration;}}),/FORMS_UI_TIMEOUT/);assert.equal(clock,45000);
 await assert.rejects(forms.waitForUi(()=>true,{readUi:async()=>{reads++;throw new forms.FormsError('FORMS_PROCESS_FAILED');},now:()=>0,wait:async()=>{throw new Error('must not wait');}}),/FORMS_PROCESS_FAILED/);assert.equal(reads,1);
});
test('a pending or unconfirmed registration cannot trigger a resend or be reported as account creation',async()=>{
 const s=state('register'),secret=forms.credentials(env('register'),'register'),d=driverFor('register',secret,{registrationUnconfirmed:true});await assert.rejects(forms.executePhase(d.driver,secret,s),/FORMS_UI_TIMEOUT/);assert.equal(d.counters.registration,1);assert.equal(d.counters.resend,0);assert.equal(s.cases.EF01,undefined);assert.equal(s.operationUncertain,true);
});
test('unexpected acceptance of the wrong verification code fails the negative case rather than passing the happy path',async()=>{
 const s=state('verify'),secret=forms.credentials(env('verify'),'verify'),d=driverFor('verify',secret,{acceptWrongVerification:true});await assert.rejects(forms.executePhase(d.driver,secret,s),/FORMS_UI_TIMEOUT/);assert.equal(s.cases.EF03,undefined);assert.equal(d.counters.recovery,0);
});
test('a reset not confirmed by the success screen never reaches login',async()=>{
 const s=state('reset'),secret=forms.credentials(env('reset'),'reset'),d=driverFor('reset',secret,{resetUnconfirmed:true});await assert.rejects(forms.executePhase(d.driver,secret,s),/FORMS_UI_TIMEOUT/);assert.equal(d.counters.login,0);assert.equal(s.cases.EF08,undefined);assert.equal(s.operationUncertain,true);
});
test('failure after changing password is preserved and cannot be hidden by a successful local cleanup',async()=>{
 const s=state('reset'),secret=forms.credentials(env('reset'),'reset'),d=driverFor('reset',secret,{loginRejected:true});await assert.rejects(forms.executePhase(d.driver,secret,s),/FORMS_UI_TIMEOUT/);s.cleanup={device:true,sandbox:true,localSession:true};s.status='passed';s.stage='completed';assert.equal(forms.publicReport(s,config()).status,'failed');assert.equal(s.evidence.passwordUpdated,true);assert.equal(s.evidence.loggedOut,undefined);
});
test('reports reject missing observations, incomplete cleanup, uncertain writes and an early stage',async()=>{
 const {s,c}=await completed('register');for(const mutate of[v=>{v.evidence.resent=false;},v=>{v.cleanup.sandbox=false;},v=>{v.operationUncertain=true;},v=>{v.stage='preflight';},v=>{v.cases.EF02='not_run';}]){const value=structuredClone(s);mutate(value);assert.equal(forms.publicReport(value,c).status,'failed');}
});
test('reset cannot pass without the separate post-logout recovery observation and EF05',async()=>{
 const {s,c}=await completed('reset');
 for(const mutate of [value=>{value.evidence.recoveryRequested=false;},value=>{value.cases.EF05='not_run';},value=>{value.recoveryUi.codeObserved=false;},value=>{value.recoveryUi.updateButtonObserved=false;}]){const value=structuredClone(s);mutate(value);assert.equal(forms.publicReport(value,c).status,'failed');}
});
test('public evidence exposes no private form data, raw UI or arbitrary exception/stage content',async()=>{
 const {s,c}=await completed('reset');s.stage='private@example.com';s.extra='private-password';s.errors=[new Error('654321 private@example.com')];const text=JSON.stringify(forms.publicReport(s,c));for(const value of['private@example.com','private-password','654321','qa+forms@example.com','NuevaSegura789!'])assert.equal(text.includes(value),false);assert.equal(JSON.parse(text).stage,'unknown');assert.deepEqual(JSON.parse(text).failureCodes,['FORMS_UNEXPECTED_FAILURE']);
});
test('secret validation is phase-specific, requires independent new password and never accepts malformed OTP or phone',()=>{
 assert.equal(forms.credentials({...env('register'),ANDROID_FORMS_CODE:undefined,ANDROID_FORMS_NEW_PASSWORD:undefined},'register').code,null);
 for(const[phase,patch]of[['register',{ANDROID_FORMS_PHONE:'invalid'}],['verify',{ANDROID_FORMS_CODE:'12345'}],['reset',{ANDROID_FORMS_NEW_PASSWORD:env('reset').ANDROID_FORMS_PASSWORD}],['reset',{ANDROID_FORMS_CODE:'${INJECTION}'}]])assert.throws(()=>forms.credentials({...env(phase),...patch},phase),/FORMS_FIXTURE_INVALID/);
 for(const code of['000000','999999','654321']){assert.match(forms.wrongCode(code),/^\d{6}$/);assert.notEqual(forms.wrongCode(code),code);}
});
test('Maestro receives only a whitelisted public label, while field values use the existing private environment',()=>{
 assert.match(forms.scrollBody('phone'),/Teléfono/);assert.match(forms.scrollBody('verification'),/visibilityPercentage: 100\n    centerElement: false/);assert.throws(()=>forms.scrollBody('${PRIVATE_VALUE}'),/FORMS_UI_INVALID/);assert.throws(()=>forms.scrollBody('phone','LEFT'),/FORMS_UI_INVALID/);assert.throws(()=>forms.noFormSecrets(env('register')),/FORMS_SOURCE_INVALID/);forms.noFormSecrets({PATH:'/usr/bin'});
});
test('Forms YAML uses its own exact IDs and rejects injected IDs, inline values and capture commands',()=>{
 const body=forms.scrollBody('name');
 for(const id of ['EF001','EF999']){
  const docs=YAML.parseAllDocuments(forms.formsYaml(id,body)).map(d=>d.toJSON());
  assert.deepEqual(docs[0],{appId:forms.PACKAGE,name:id+' private account'});
  assert.deepEqual(docs[1],YAML.parse(body));
 }
 for(const id of ['AC01','EF01','EF1000','EF001\n','EF001\nappId: other',null])assert.throws(()=>forms.formsYaml(id,body),/FORMS_MAESTRO_FAILED/);
 for(const unsafe of [body+'\n- takeScreenshot: private','- inputText: inline-private-value','- runScript: private.js','- startRecording: private'])assert.throws(()=>forms.formsYaml('EF001',unsafe),/FORMS_MAESTRO_FAILED/);
 assert.throws(()=>account.yaml('EF001',body),/ACCOUNT_MAESTRO_FAILED/);
});
test('finish enforces the phase tag and exact fixed report, and does not accept a fabricated success',async()=>{
 const {report,c}=await completed('register');assert.equal(forms.verifyFinished(c,env('register'),report).status,'passed');assert.throws(()=>forms.verifyFinished(c,env('reset'),report),/FORMS_SOURCE_INVALID/);assert.throws(()=>forms.verifyFinished(c,env('register'),{...report,extra:'private'}),/FORMS_CASES_INCOMPLETE/);
});
test('credential-free preflight tests private files and CLI under UID, then confirms cleanup before any emulator or email',async()=>{
 const c=config(),context={phase:'register',artifactSourceCommit:c.sourceCommit};let written,confirmed,cleaned=false;
 const box={probes:{ipv4RejectedWithCounter:true,adbLoopbackReachable:true},runAs:async()=>({exitCode:0,stdout:'Banner\n2.12.0\n'}),createPrivateFile:async()=>{},readPrivateFile:async()=>require(path.join(process.env.ACCOUNT_REPO_ROOT||path.join(__dirname,'..'),'scripts','android-account.cjs')).PREFLIGHT_FILE,cleanup:async()=>{cleaned=true;}};
 await forms.probeForms(c,{GITHUB_RUN_ID:'1',GITHUB_SHA:'e'.repeat(40)},{read:()=>context,run:async()=>'',parent:()=>({path:'/tmp/fixture',verifyMaestro:async()=>{},confirm:v=>{confirmed=v;}}),create:async()=>box,save:(file,value)=>{written={file,value};}});
 assert.equal(cleaned,true);assert.equal(confirmed,true);assert.equal(written.value.sandboxPreflight.privateFileRoundtripVerified,true);
});
test('failed sandbox setup with unconfirmed cleanup cannot be marked cleaned up by preflight',async()=>{
 const c=config(),context={phase:'register'};let report;
 const {SandboxError}=require(path.join(process.env.ACCOUNT_REPO_ROOT||path.join(__dirname,'..'),'scripts','account-sandbox.cjs'));
 await assert.rejects(forms.probeForms(c,{GITHUB_RUN_ID:'1',GITHUB_SHA:'e'.repeat(40)},{read:()=>context,run:async()=>'',parent:()=>({path:'/tmp/fixture',verifyMaestro:async()=>{},confirm:()=>{}}),create:async()=>{throw new SandboxError('SANDBOX_SETUP_CLEANUP_FAILED');},save:(file,value)=>{report=value;}}),/FORMS_SANDBOX_CLEANUP_FAILED/);
 assert.equal(report.cleanup.sandbox,false);assert.equal(report.status,'failed');
});
async function runtimeFailure(options={}){
 const c=config(),e={...env('register'),ACCOUNT_UNIT_TEST:true,GITHUB_RUN_ID:'1'},context={phase:'register',artifactSourceCommit:c.sourceCommit,automationCommit:e.GITHUB_SHA,producerVerified:true,parentInspectionVerified:true,producerRun:c.producerRun,producerAttempt:c.producerAttempt,apkSha256:c.sha256,buildId:c.buildId,receiptSha256:guard.fingerprint(c),sandboxPreflight:{status:'passed',ipv4RejectedWithCounter:true,adbLoopbackReachable:true,maestroVersionVerified:true,privateFileRoundtripVerified:true,cleanupConfirmed:true}};
 let installed=false,removed=false,boxCleaned=false,confirmed=false,fieldValue='',uiReads=0,clock=0,revealed=options.controlVisible===true;const calls=[],flows=[],privateField=options.landingRoute?env('register').ANDROID_FORMS_EMAIL:'Dato sintetico QA';
 const run=async(file,args)=>{calls.push([file,...args]);assert.equal(args.some(v=>Object.values(env('register')).includes(v)&&v!==e.GITHUB_SHA&&v!==e.GITHUB_REF),false);
  if(args[0]==='devices')return'List of devices attached\nemulator-5554\tdevice\n';const a=args.slice(2);
  if(a[0]==='shell'&&a[1]==='getprop')return'34\n';if(a[0]==='shell'&&a[1]==='pm'&&a[2]==='list')return installed?'package:'+forms.PACKAGE+'\n':'';
  if(a[0]==='shell'&&a[1]==='wm'&&a[2]==='size')return'Physical size: 360x800\n';
  if(a[0]==='exec-out'&&a[1]==='cat'){uiReads++;if(options.slowLanding&&(uiReads<=2||options.neverLanding))return'<hierarchy/>';const title=options.landingRoute?'<node package="'+forms.PACKAGE+'" text="Recuperar contraseña"/>':'',bounds=revealed?(options.edgeBounds||'[10,10][200,60]'):'[10,850][200,900]';return '<hierarchy>'+title+(options.controlAbsent?'':'<node package="'+forms.PACKAGE+'" class="android.widget.EditText" content-desc="'+(options.landingRoute?'Correo':'Nombre')+'" text="'+fieldValue+'" enabled="true" bounds="'+bounds+'"/>')+'</hierarchy>';}
  if(a[0]==='install'){installed=true;if(options.partialInstall)throw new forms.FormsError('FORMS_PROCESS_FAILED');return'Success\n';}
  if(a[0]==='uninstall'){installed=false;removed=true;return'Success\n';}return'';
 };
 const create=async()=>({root:'/private/forms',probes:{ipv4RejectedWithCounter:true,adbLoopbackReachable:true},
  createPrivateFile:async(name,body)=>{assert.equal(body.includes(privateField),false);const docs=YAML.parseAllDocuments(body).map(d=>d.toJSON());assert.equal(docs[0].appId,forms.PACKAGE);assert.match(docs[0].name,/^EF[0-9]{3} private account$/);assert.ok(Array.isArray(docs[1]));flows.push({name,body});return '/private/forms/'+name;},
  runMaestro:async(serial,args,callOptions)=>{assert.equal(serial,'emulator-5554');assert.equal(args.includes(privateField),false);if(options.slowLanding)assert.ok(uiReads>=3,'Maestro must not run before the real landing is visible');const action=flows.at(-1).body.includes('inputText:')?'input':'scroll';assert.deepEqual(Object.keys(callOptions.secretEnv),action==='input'?['MAESTRO_ACCOUNT_FIELD_VALUE']:[]);if(options.maestroFailure&&action===(options.failureAction||'scroll'))return options.maestroFailure;if(action==='scroll')revealed=true;if(callOptions.secretEnv.MAESTRO_ACCOUNT_FIELD_VALUE)fieldValue=callOptions.secretEnv.MAESTRO_ACCOUNT_FIELD_VALUE;return{exitCode:0,timedOut:false,stdout:'',stderr:''};},
  readPrivateFile:async filename=>{const name=filename.replace(/\.xml$/,'')+' private account';const xml='<testsuites><testsuite tests="1" failures="0"><testcase id="'+name+'" name="'+name+'" classname="'+name+'" status="SUCCESS"/></testsuite></testsuites>';return options.invalidJunit?xml.slice(0,-5):xml;},
  cleanup:async()=>{boxCleaned=true;if(options.cleanupFailed)throw new Error('private failure');}});
 const report=await forms.runPhase({env:e,config:c,context,apk:'/private/fixture.apk',run,create,parent:()=>({path:'/tmp/private-fixture',verifyMaestro:async()=>{},confirm:v=>{confirmed=v;}}),hash:async()=>c.sha256,xmlTree,now:()=>clock,wait:async duration=>{clock+=duration;},execute:async(driver,secret,phaseState)=>{if(options.landingRoute){forms.stage(phaseState,'reset-open');await driver.open(options.landingRoute);}if(options.realField)await driver.fill(options.landingRoute?'recoveryEmail':'name',privateField,{direction:options.landingRoute?'UP':'DOWN'});throw new forms.FormsError('FORMS_INPUT_MISMATCH');}});
 return{report,installed,removed,boxCleaned,confirmed,calls,flows,privateField,uiReads,clock};
}
test('a slow StartupGate must expose the real recovery title and input before the first UP scroll or input flow',async()=>{
 const r=await runtimeFailure({realField:true,landingRoute:'forgot-password',slowLanding:true});assert.equal(r.clock,500);assert.ok(r.uiReads>=3);assert.equal(r.flows.length,2);assert.equal(r.report.stage,'check-recoveryEmail');assert.equal(r.report.maestroDiagnostic,null);assert.deepEqual(r.report.failureCodes,['FORMS_INPUT_MISMATCH']);
});
test('a landing that never exposes accessibility keeps the 45s limit and never starts Maestro or writes',async()=>{
 const r=await runtimeFailure({realField:true,landingRoute:'forgot-password',slowLanding:true,neverLanding:true});assert.equal(r.clock,45000);assert.equal(r.flows.length,0);assert.equal(r.report.stage,'reset-open');assert.deepEqual(r.report.failureCodes,['FORMS_UI_TIMEOUT']);assert.equal(r.report.operationUncertain,false);assert.deepEqual(r.report.cleanup,{device:true,sandbox:true,localSession:true});
});
test('each public landing requires its own stable header and enabled input',()=>{
 for(const[route,header,label]of[['register','Crear cuenta','Nombre'],['forgot-password','Recuperar contraseña','Correo'],['login','Accede a tu cuenta de Sport Center.','Correo electrónico']]){const nodes=[node(header),node('',{class:'android.widget.EditText','content-desc':label})];assert.equal(forms.landingReady(route,nodes),true);assert.equal(forms.landingReady(route,nodes.slice(0,1)),false);nodes[1].enabled='false';assert.equal(forms.landingReady(route,nodes),false);}
 assert.throws(()=>forms.landingReady('https://remote.invalid',[]),/FORMS_UI_INVALID/);
});
test('fully visible controls at the top and bottom edges bypass scroll CLI but still require valid measured input',async()=>{
 for(const bounds of ['[0,0][100,40]','[0,760][100,800]']){
  const r=await runtimeFailure({realField:true,controlVisible:true,edgeBounds:bounds});assert.equal(r.flows.length,1);assert.match(r.flows[0].body,/inputText:/);assert.equal(r.report.stage,'check-name');assert.equal(r.report.maestroDiagnostic,null);
 }
});
test('a missing control still scrolls and cannot be entered after a fabricated successful scroll',async()=>{
 const r=await runtimeFailure({realField:true,controlAbsent:true});assert.equal(r.flows.length,1);assert.match(r.flows[0].body,/visibilityPercentage: 100\n    centerElement: false/);assert.deepEqual(r.report.failureCodes,['FORMS_UI_INVALID']);assert.equal(r.calls.some(c=>c.includes('input')&&c.includes('tap')),false);assert.equal(r.report.operationUncertain,false);
});
test('point visibility rejects partial, missing or ambiguous controls and honors the actual screen size',()=>{
 const make=bounds=>[node('',{class:'android.widget.EditText','content-desc':'Nombre',bounds})],viewport={width:360,height:800};
 assert.deepEqual(forms.visiblePoint(make('[0,0][100,40]'),'Nombre','input',viewport),[50,20]);assert.deepEqual(forms.visiblePoint(make('[0,760][100,800]'),'Nombre','input',viewport),[50,780]);
 for(const bounds of ['[0,780][100,820]','[-1,0][100,40]','[0,0][400,40]','broken'])assert.equal(forms.visiblePoint(make(bounds),'Nombre','input',viewport),null);
 assert.equal(forms.visiblePoint([],'Nombre','input',viewport),null);assert.throws(()=>forms.visiblePoint([...make('[0,0][100,40]'),...make('[0,80][100,120]')],'Nombre','input',viewport),/FORMS_UI_INVALID/);
 assert.deepEqual(forms.screenSize('Physical size: 1080x1920\nOverride size: 360x800\n'),viewport);for(const raw of ['','Physical size: 0x800','Physical size: 9999x800','Physical size: 360x800\nprivate extra'])assert.throws(()=>forms.screenSize(raw),/FORMS_PROCESS_FAILED/);
});
test('exception diagnostics classify only public JVM/transport classes or a fixed Maestro enum',()=>{
 for(const[raw,expected]of [['io.grpc.StatusRuntimeException: PRIVATE','grpc-status'],['java.net.ConnectException: PRIVATE','java-connect'],['java.lang.IllegalStateException: PRIVATE','java-illegal-state'],['maestro.orchestra.PublicFailure: PRIVATE','maestro-public-error'],['com.private.CustomerException: PRIVATE','none']]){const value=forms.maestroExceptionEnum({stderr:raw});assert.equal(value,expected);assert.equal(value.includes('PRIVATE'),false);}
 assert.equal(forms.maestroErrorEnum({stderr:'No visible element found: PRIVATE'}),'element-not-found');
});
test('failed scroll, failed input and host timeout have distinct fixed diagnostics without raw child output',async()=>{
 for(const[action,result,expected]of[['scroll',{exitCode:1,timedOut:false,stdout:'Element not found: PRIVATE_VALUE',stderr:''},'element-not-found'],['input',{exitCode:1,timedOut:false,stdout:'',stderr:'device offline PRIVATE_VALUE'},'device-offline'],['scroll',{exitCode:0,timedOut:true,stdout:'PRIVATE_VALUE',stderr:''},'timeout']]){
  const r=await runtimeFailure({realField:true,failureAction:action,maestroFailure:result});assert.deepEqual(r.report.failureCodes,['FORMS_MAESTRO_FAILED']);assert.deepEqual(r.report.maestroDiagnostic,{action,resultObserved:true,exitCode:result.exitCode,timedOut:result.timedOut,junitRead:false,junitValid:false,errorEnum:expected,exceptionEnum:'none'});assert.equal(JSON.stringify(r.report).includes('PRIVATE_VALUE'),false);assert.deepEqual(r.report.cleanup,{device:true,sandbox:true,localSession:true});
 }
});
test('diagnostic allowlist rejects extra fields, raw content and unbounded numbers and prevents fabricated success',async()=>{
 const good={action:'scroll',resultObserved:true,exitCode:1,timedOut:false,junitRead:false,junitValid:false,errorEnum:'other',exceptionEnum:'none'};
 assert.deepEqual(forms.safeMaestroDiagnostic(good),good);
 for(const bad of [{...good,stdout:'private'},{...good,exitCode:999},{...good,errorEnum:'raw-private'},{...good,exceptionEnum:'private.CustomerException'},{...good,timedOut:'false'}])assert.equal(forms.safeMaestroDiagnostic(bad),null);
 const {s,c}=await completed('register');s.maestroDiagnostic=good;assert.equal(forms.publicReport(s,c).status,'failed');
});
test('the runtime field adapter uses real Forms YAML, private UI parsing and strict real JUnit verification before input is observed',async()=>{
 const r=await runtimeFailure({realField:true});
 assert.equal(r.flows.length,2);assert.deepEqual(r.flows.map(f=>f.name),['EF001.yaml','EF002.yaml']);
 assert.match(r.flows[1].body,/inputText: \$\{MAESTRO_ACCOUNT_FIELD_VALUE\}/);assert.equal(r.flows.some(f=>/takeScreenshot|startRecording|runScript/.test(f.body)),false);
 assert.equal(r.report.stage,'check-name');assert.deepEqual(r.report.failureCodes,['FORMS_INPUT_MISMATCH']);assert.equal(JSON.stringify(r.report).includes(r.privateField),false);
 assert.equal(r.report.operationUncertain,false);assert.deepEqual(r.report.cleanup,{device:true,sandbox:true,localSession:true});
});
test('the runtime field adapter rejects a truncated JUnit report and cleans up without continuing to input',async()=>{
 const r=await runtimeFailure({realField:true,invalidJunit:true});
 assert.equal(r.flows.length,1);assert.equal(r.report.stage,'field-name');assert.deepEqual(r.report.failureCodes,['FORMS_MAESTRO_FAILED']);
 assert.equal(r.report.status,'failed');assert.deepEqual(r.report.cleanup,{device:true,sandbox:true,localSession:true});
 assert.deepEqual(r.report.maestroDiagnostic,{action:'scroll',resultObserved:true,exitCode:0,timedOut:false,junitRead:true,junitValid:false,errorEnum:'junit-invalid',exceptionEnum:'none'});
});
test('a private input mismatch stops the phase and still removes app data, package and isolated UID',async()=>{
 const r=await runtimeFailure();assert.equal(r.report.status,'failed');assert.deepEqual(r.report.failureCodes,['FORMS_INPUT_MISMATCH']);assert.equal(r.installed,false);assert.equal(r.removed,true);assert.equal(r.boxCleaned,true);assert.equal(r.confirmed,true);assert.deepEqual(r.report.cleanup,{device:true,sandbox:true,localSession:true});assert.equal(r.report.cases.some(c=>c.status==='passed'),false);
});
test('a partial install failure still checks and removes any resulting package before reporting cleanup',async()=>{
 const r=await runtimeFailure({partialInstall:true});assert.equal(r.report.status,'failed');assert.deepEqual(r.report.failureCodes,['FORMS_PROCESS_FAILED']);assert.equal(r.installed,false);assert.equal(r.removed,true);assert.equal(r.report.cleanup.device,true);assert.equal(r.report.cleanup.sandbox,true);
});
test('cleanup failure remains a mandatory failure rather than being hidden by a previous UI error',async()=>{
 const r=await runtimeFailure({cleanupFailed:true});assert.equal(r.report.status,'failed');assert.equal(r.report.cleanup.sandbox,false);assert.equal(r.confirmed,false);assert.deepEqual(r.report.failureCodes,['FORMS_INPUT_MISMATCH','FORMS_SANDBOX_CLEANUP_FAILED']);
});

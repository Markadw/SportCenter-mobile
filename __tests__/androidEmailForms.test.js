/** @jest-environment node */
'use strict';
const test=globalThis.test||require('node:test').test;
const assert=require('node:assert/strict'),path=require('node:path');
const forms=require(path.join(process.env.EMAIL_FORMS_PREP_DIR||path.join(__dirname,'..','scripts'),'android-email-forms.cjs'));
const guard=require(path.join(process.env.EMAIL_FORMS_PREP_DIR||path.join(__dirname,'..','scripts'),'android-email-forms-source.cjs'));
const config=()=>({version:1,...guard.IDENTITY,sourceCommit:guard.EXPECTED_SOURCE,buildId:'11111111-2222-4333-8444-555555555555',sha256:'b'.repeat(64),bytes:10,fingerprint:'c'.repeat(64),producerRun:guard.EXPECTED_PRODUCER,producerAttempt:guard.EXPECTED_ATTEMPT,producerTag:guard.EXPECTED_PRODUCER_TAG,artifactId:202,artifactBytes:10,artifactSha256:'d'.repeat(64)});
const env=phase=>({ANDROID_FORMS_EMAIL:'qa+forms@example.com',ANDROID_FORMS_PASSWORD:'AnteriorSegura456!',ANDROID_FORMS_PHONE:'5551234567',ANDROID_FORMS_CODE:'654321',ANDROID_FORMS_NEW_PASSWORD:'NuevaSegura789!',GITHUB_SHA:'e'.repeat(40),GITHUB_REF:'refs/tags/validation/account-forms-'+phase+'-fixture'});
const node=(text,extra={})=>({package:forms.PACKAGE,text,enabled:'true',clickable:'true',...extra});
const state=phase=>({phase,status:'failed',stage:'preflight',automationCommit:'e'.repeat(40),cases:{},evidence:{},errors:[],cleanup:{},operationUncertain:false});
function driverFor(phase,secret,options={}){
 let screen='',notice='',checked=false;const fields={},calls=[],counters={registration:0,resend:0,recovery:0,reset:0,login:0,logout:0};
 const nodes=()=>{
  const values=Object.entries(fields).map(([key,value])=>node(value,{class:'android.widget.EditText','content-desc':forms.LABELS[key]}));
  if(screen==='register')return[...values,node('Crear cuenta'),node('',{'content-desc':'Acepto el tratamiento necesario para mi cuenta',checked:String(checked)})];
  if(screen==='verify')return[...values,node('Verificar correo'),node('Código de verificación'),...(notice?[node(notice)]:[])];
  if(screen==='verified')return[node('Cuenta verificada'),node('Tu correo quedó confirmado. Ya puedes iniciar sesión en Sport Center.')];
  if(screen==='email')return[...values,node('Recuperar contraseña'),node('Enviar código')];
  if(screen==='reset')return[...values,node('Código de recuperación'),node('Actualizar contraseña'),...(notice?[node(notice)]:[])];
  if(screen==='done')return[node('Contraseña actualizada'),node('Tu contraseña se cambió correctamente. Inicia sesión con la nueva contraseña.')];
  if(screen==='login')return[...values,node('Iniciar sesión')];
  if(screen==='account')return[node('Mi cuenta'),node('Has iniciado sesión en Sport Center.')];
  return[node('Inicia sesión con tu cuenta verificada o regístrate para comenzar.')];
 };
 const driver={
  async open(route){calls.push(['open',route]);screen=route==='register'?'register':route==='forgot-password'?'email':'login';notice='';},
  async fill(key,value){calls.push(['fill',key]);fields[key]=value;},
  async tap(label){calls.push(['tap',label]);
   if(options.failTap===label)throw new forms.FormsError('FORMS_UI_TIMEOUT');
   if(label==='Acepto el tratamiento necesario para mi cuenta')checked=true;
   else if(label==='Crear cuenta'){counters.registration++;assert.equal(checked,true);if(!options.registrationUnconfirmed)screen='verify';}
   else if(label==='Reenviar código'){counters.resend++;notice=forms.NOTICE_RESENT;}
   else if(label==='Ya tengo un código')screen='verify';
   else if(label==='Verificar cuenta'){if(fields.verification===secret.code||options.acceptWrongVerification)screen='verified';else notice='Código incorrecto. Intentos restantes: 2.';}
   else if(label==='Enviar código'){counters.recovery++;screen='reset';}
   else if(label==='Ya tengo un código de recuperación')screen='reset';
   else if(label==='Actualizar contraseña'){counters.reset++;if(fields.recovery===secret.code&&!options.resetUnconfirmed)screen='done';else notice=forms.RESET_ERROR;}
   else if(label==='Iniciar sesión'){counters.login++;if(!options.loginRejected)screen='account';}
   else if(label==='Cerrar sesión'){counters.logout++;screen='guest';}
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
test('recovery resumes without another email, changes via UI, then confirms the new password by login and logout',async()=>{
 const result=await completed('reset');assert.equal(result.report.status,'passed');assert.equal(result.counters.recovery,0);assert.equal(result.counters.reset,2);assert.equal(result.counters.login,1);assert.equal(result.counters.logout,1);assert.equal(result.report.evidence.passwordUpdated,true);assert.equal(result.report.evidence.loggedOut,true);
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
test('public evidence exposes no private form data, raw UI or arbitrary exception/stage content',async()=>{
 const {s,c}=await completed('reset');s.stage='private@example.com';s.extra='private-password';s.errors=[new Error('654321 private@example.com')];const text=JSON.stringify(forms.publicReport(s,c));for(const value of['private@example.com','private-password','654321','qa+forms@example.com','NuevaSegura789!'])assert.equal(text.includes(value),false);assert.equal(JSON.parse(text).stage,'unknown');assert.deepEqual(JSON.parse(text).failureCodes,['FORMS_UNEXPECTED_FAILURE']);
});
test('secret validation is phase-specific, requires independent new password and never accepts malformed OTP or phone',()=>{
 assert.equal(forms.credentials({...env('register'),ANDROID_FORMS_CODE:undefined,ANDROID_FORMS_NEW_PASSWORD:undefined},'register').code,null);
 for(const[phase,patch]of[['register',{ANDROID_FORMS_PHONE:'invalid'}],['verify',{ANDROID_FORMS_CODE:'12345'}],['reset',{ANDROID_FORMS_NEW_PASSWORD:env('reset').ANDROID_FORMS_PASSWORD}],['reset',{ANDROID_FORMS_CODE:'${INJECTION}'}]])assert.throws(()=>forms.credentials({...env(phase),...patch},phase),/FORMS_FIXTURE_INVALID/);
 for(const code of['000000','999999','654321']){assert.match(forms.wrongCode(code),/^\d{6}$/);assert.notEqual(forms.wrongCode(code),code);}
});
test('Maestro receives only a whitelisted public label, while field values use the existing private environment',()=>{
 assert.match(forms.scrollBody('phone'),/Teléfono/);assert.match(forms.scrollBody('verification'),/centerElement: true/);assert.throws(()=>forms.scrollBody('${PRIVATE_VALUE}'),/FORMS_UI_INVALID/);assert.throws(()=>forms.scrollBody('phone','LEFT'),/FORMS_UI_INVALID/);assert.throws(()=>forms.noFormSecrets(env('register')),/FORMS_SOURCE_INVALID/);forms.noFormSecrets({PATH:'/usr/bin'});
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
 let installed=false,removed=false,boxCleaned=false,confirmed=false;const calls=[];
 const run=async(file,args)=>{calls.push([file,...args]);assert.equal(args.some(v=>Object.values(env('register')).includes(v)&&v!==e.GITHUB_SHA&&v!==e.GITHUB_REF),false);
  if(args[0]==='devices')return'List of devices attached\nemulator-5554\tdevice\n';const a=args.slice(2);
  if(a[0]==='shell'&&a[1]==='getprop')return'34\n';if(a[0]==='shell'&&a[1]==='pm'&&a[2]==='list')return installed?'package:'+forms.PACKAGE+'\n':'';
  if(a[0]==='install'){installed=true;if(options.partialInstall)throw new forms.FormsError('FORMS_PROCESS_FAILED');return'Success\n';}
  if(a[0]==='uninstall'){installed=false;removed=true;return'Success\n';}return'';
 };
 const create=async()=>({probes:{ipv4RejectedWithCounter:true,adbLoopbackReachable:true},cleanup:async()=>{boxCleaned=true;if(options.cleanupFailed)throw new Error('private failure');}});
 const report=await forms.runPhase({env:e,config:c,context,apk:'/private/fixture.apk',run,create,parent:()=>({path:'/tmp/private-fixture',verifyMaestro:async()=>{},confirm:v=>{confirmed=v;}}),hash:async()=>c.sha256,execute:async()=>{throw new forms.FormsError('FORMS_INPUT_MISMATCH');}});
 return{report,installed,removed,boxCleaned,confirmed,calls};
}
test('a private input mismatch stops the phase and still removes app data, package and isolated UID',async()=>{
 const r=await runtimeFailure();assert.equal(r.report.status,'failed');assert.deepEqual(r.report.failureCodes,['FORMS_INPUT_MISMATCH']);assert.equal(r.installed,false);assert.equal(r.removed,true);assert.equal(r.boxCleaned,true);assert.equal(r.confirmed,true);assert.deepEqual(r.report.cleanup,{device:true,sandbox:true,localSession:true});assert.equal(r.report.cases.some(c=>c.status==='passed'),false);
});
test('a partial install failure still checks and removes any resulting package before reporting cleanup',async()=>{
 const r=await runtimeFailure({partialInstall:true});assert.equal(r.report.status,'failed');assert.deepEqual(r.report.failureCodes,['FORMS_PROCESS_FAILED']);assert.equal(r.installed,false);assert.equal(r.removed,true);assert.equal(r.report.cleanup.device,true);assert.equal(r.report.cleanup.sandbox,true);
});
test('cleanup failure remains a mandatory failure rather than being hidden by a previous UI error',async()=>{
 const r=await runtimeFailure({cleanupFailed:true});assert.equal(r.report.status,'failed');assert.equal(r.report.cleanup.sandbox,false);assert.equal(r.confirmed,false);assert.deepEqual(r.report.failureCodes,['FORMS_INPUT_MISMATCH','FORMS_SANDBOX_CLEANUP_FAILED']);
});

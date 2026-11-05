/** @jest-environment node */
'use strict';
const test=globalThis.test||require('node:test').test,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),YAML=require('yaml');
const root=process.env.ACCOUNT_REPO_ROOT||path.join(__dirname,'..'),prep=process.env.EMAIL_FORMS_PREP_DIR;
const {validateWorkflows}=require(path.join(prep||path.join(root,'scripts'),'validate-test-configs.js'));
function workflows(){return new Map(fs.readdirSync(path.join(root,'.github/workflows')).filter(file=>/\.ya?ml$/.test(file)).map(file=>[file,YAML.parse(fs.readFileSync(file==='android-validation.yml'&&prep?path.join(prep,file):path.join(root,'.github/workflows',file),'utf8'))]));}
test('email phases reuse the authorized environment and auxiliary pipeline; account scope remains separate',()=>{assert.doesNotThrow(()=>validateWorkflows(workflows()));});
for(const[name,mutate]of[
 ['missing environment',w=>{delete w.jobs.email_forms.environment;}],
 ['another environment',w=>{w.jobs.email_forms.environment='production';}],
 ['account consumes forms tags',w=>{w.jobs.account.if="${{ startsWith(github.ref, 'refs/tags/validation/account-') }}";}],
 ['account gate consumes forms tags',w=>{w.jobs.account_result.if="${{ always() && startsWith(github.ref, 'refs/tags/validation/account-') }}";}],
 ['forms uses broad tags',w=>{w.jobs.email_forms.if=w.jobs.account.if;}],
 ['missing quality',w=>{w.jobs.email_forms.needs=['security'];}],
 ['missing security',w=>{w.jobs.email_forms.needs=['quality'];}],
 ['global code',w=>{w.jobs.email_forms.env.ANDROID_FORMS_CODE='${{ secrets.ANDROID_FORMS_CODE }}';}],
 ['code in EAS lookup',w=>{w.jobs.email_forms.steps.find(s=>s.run==='node scripts/android-email-forms.cjs view').env.ANDROID_FORMS_CODE='${{ secrets.ANDROID_FORMS_CODE }}';}],
 ['old QA credentials in setup',w=>{w.jobs.email_forms.steps.find(s=>s.run==='node scripts/android-email-forms.cjs download').env={ANDROID_TEST_PASSWORD:'${{ secrets.ANDROID_TEST_PASSWORD }}'};}],
 ['unrelated credential in setup',w=>{w.jobs.email_forms.steps.find(s=>s.run==='node scripts/android-email-forms.cjs download').env={OTHER:'${{ secrets.UNRELATED }}'};}],
 ['Expo token in runtime',w=>{w.jobs.email_forms.steps.find(s=>s.id==='email_forms_runtime').env.EXPO_TOKEN='${{ secrets.EXPO_TOKEN }}';}],
 ['request receives password',w=>{w.jobs.email_forms.steps.find(s=>s.id==='email_forms_runtime').env.ANDROID_FORMS_PASSWORD='${{ secrets.ANDROID_FORMS_PASSWORD }}';}],
 ['request receives phone',w=>{w.jobs.email_forms.steps.find(s=>s.id==='email_forms_runtime').env.ANDROID_FORMS_PHONE='${{ secrets.ANDROID_FORMS_PHONE }}';}],
 ['request receives code',w=>{w.jobs.email_forms.steps.find(s=>s.id==='email_forms_runtime').env.ANDROID_FORMS_CODE='${{ secrets.ANDROID_FORMS_CODE }}';}],
 ['request receives new password',w=>{w.jobs.email_forms.steps.find(s=>s.id==='email_forms_runtime').env.ANDROID_FORMS_NEW_PASSWORD='${{ secrets.ANDROID_FORMS_NEW_PASSWORD }}';}],
 ['GitHub token in runtime',w=>{w.jobs.email_forms.steps.find(s=>s.id==='email_forms_runtime').env.GITHUB_TOKEN='${{ github.token }}';}],
 ['runtime skipped',w=>{w.jobs.email_forms.steps.find(s=>s.id==='email_forms_runtime').if='false';}],
 ['private preflight omitted',w=>{w.jobs.email_forms.steps=w.jobs.email_forms.steps.filter(s=>s.run!=='node scripts/android-email-forms.cjs probe');}],
 ['disk preflight omitted',w=>{w.jobs.email_forms.steps=w.jobs.email_forms.steps.filter(s=>s.id!=='email_forms_disk');}],
 ['disk preflight duplicated',w=>{w.jobs.email_forms.steps.push({...w.jobs.email_forms.steps.find(s=>s.id==='email_forms_disk')});}],
 ['disk preflight after emulator',w=>{const s=w.jobs.email_forms.steps.find(s=>s.id==='email_forms_disk');w.jobs.email_forms.steps=[...w.jobs.email_forms.steps.filter(v=>v!==s),s];}],
 ['disk preflight before private probe',w=>{const s=w.jobs.email_forms.steps.find(s=>s.id==='email_forms_disk');w.jobs.email_forms.steps=[s,...w.jobs.email_forms.steps.filter(v=>v!==s)];}],
 ['disk preflight skipped',w=>{w.jobs.email_forms.steps.find(s=>s.id==='email_forms_disk').if='false';}],
 ['disk preflight ignores failure',w=>{w.jobs.email_forms.steps.find(s=>s.id==='email_forms_disk')['continue-on-error']=true;}],
 ['disk preflight missing ephemeral guard',w=>{delete w.jobs.email_forms.steps.find(s=>s.id==='email_forms_disk').env;}],
 ['disk preflight global ephemeral flag',w=>{w.jobs.email_forms.env.PINNING_EPHEMERAL_AVD='true';}],
 ['disk preflight receives account secret',w=>{w.jobs.email_forms.steps.find(s=>s.id==='email_forms_disk').env.ANDROID_FORMS_PASSWORD='${{ secrets.ANDROID_FORMS_PASSWORD }}';}],
 ['shared AVD',w=>{w.jobs.email_forms.steps.find(s=>s.id==='email_forms_runtime').with['force-avd-creation']=false;}],
 ['public private screenshots',w=>{w.jobs.email_forms.steps.find(s=>s.uses?.startsWith('actions/upload-artifact@')).with.path+='test-results/**/*.png\n';}],
 ['cleanup conditional',w=>{w.jobs.email_forms.steps.find(s=>s.run==='node scripts/android-email-forms.cjs cleanup').if='success()';}],
 ['Maestro integrity omitted',w=>{const s=w.jobs.email_forms.steps.find(s=>s.name?.startsWith('Instalar Maestro'));s.run=s.run.replace('sha256sum --check --strict','true');}],
 ['errors ignored',w=>{w.jobs.email_forms['continue-on-error']=true;}],
 ['result ignores security',w=>{w.jobs.email_forms_result.needs=['quality','email_forms'];}],
 ['result always successful',w=>{w.jobs.email_forms_result.steps[0].env.RESULT_EMAIL_FORMS='success';}],
])test('rejects unsafe email workflow: '+name,()=>{const value=workflows();mutate(value.get('android-validation.yml'));assert.throws(()=>validateWorkflows(value));});

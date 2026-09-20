process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = '1';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import * as lib from '../lib/brain.mjs';
const P=new URL('../',import.meta.url).pathname.replace(/\/$/,'');
const waitFor=async (fn)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,50))}assert.fail('timed out waiting for worker')};

test('a single saved change starts without a delay override, and another change during the run gets compiled serially',async()=>{
 const root=mkdtempSync(join(tmpdir(),'gtm-immediate-')),profile=mkdtempSync(join(tmpdir(),'gtm-immediate-profile-'));
 const env={...process.env,CODEX_HOME:profile,PLUGIN_ROOT:P,GTM_OS_NO_OPEN:'1',GTM_OS_NO_VERSION_CHECK:'1'};
 execFileSync('git',['init','-q',root]);
 execFileSync('bash',[join(P,'scripts/gtm-os-setup/setup.sh'),'--company','Demo','--one-liner','Test','--owner','Ann Lee <ann@example.invalid>','--dashboard','on-demand'],{cwd:root,env,stdio:'ignore'});
 // This fixture tests later changes with the setup checkpoint already summarized.
 const company=lib.readContext(root,'company');
 lib.writeContext(root,'company',{...company.fm,rule:company.rule,summary:'Onboarding is pending.',now:'Finish onboarding.',compiled_at:new Date().toISOString()});
 const bin=join(root,'fake-bin');mkdirSync(bin);
 const fake=join(bin,'codex');
 writeFileSync(fake,`#!${process.execPath}
 const {readFileSync,writeFileSync,existsSync,openSync,closeSync,unlinkSync}=require('node:fs');
 const {execFileSync}=require('node:child_process');
 const P=${JSON.stringify(P)};
 (async()=>{
 const lock=openSync('work/fake-active','wx');closeSync(lock);
 const n=existsSync('work/fake-count')?Number(readFileSync('work/fake-count','utf8'))+1:1;
 writeFileSync('work/fake-count',String(n));
 const facts=execFileSync(process.execPath,[P+'/scripts/gtm-os-compile/compile.mjs','.','--facts','icp'],{encoding:'utf8'});
 const key=facts.match(/^as_of: (\\S+)/m)[1];
 execFileSync(process.execPath,[P+'/scripts/gtm-os-compile/compile.mjs','.','--apply','icp','--by','background','--as-of',key,'--summary',n===1?'First change.':'First and second changes.','--now','Test guidance.'],{stdio:'ignore'});
 if(n===1){writeFileSync('work/first-ready','');while(!existsSync('work/release-first'))await new Promise(r=>setTimeout(r,20))}
 unlinkSync('work/fake-active');
 })().catch(e=>{console.error(e);process.exitCode=1});
 `,{mode:0o755});
 const live={...env,GTM_OS_NO_COMPILE:'',PATH:bin+':'+process.env.PATH,GTM_OS_COMPILE_RETRY:'0'};
 delete live.GTM_OS_COMPILE_DELAY;
 const remember=content=>execFileSync(process.execPath,[join(P,'scripts/gtm-os-remember/remember.mjs'),root,'--by','ann','--context','icp','--content',content],{env:live,encoding:'utf8'});
 remember('First change.');
 try{
  await waitFor(()=>existsSync(join(root,'work/first-ready')));
  // The first snapshot is already applied, but its worker still holds the brain lock.
  remember('Second change while the first worker is active.');
  assert.equal(readFileSync(join(root,'work/fake-count'),'utf8'),'1');
 }finally{writeFileSync(join(root,'work/release-first'),'')}
 await waitFor(()=>{
  try{return JSON.parse(readFileSync(join(root,'work/compile.json'),'utf8')).state==='done'&&!lib.readContext(root,'icp').stale&&!existsSync(join(root,'work/compile.lock'))}catch{return false}
 });
 assert.equal(readFileSync(join(root,'work/fake-count'),'utf8'),'2');
 assert.equal(lib.readContext(root,'icp').summary,'First and second changes.');
 const data=JSON.parse(readFileSync(join(root,'work/home/data.json'),'utf8'));
 assert.equal(data.contexts.find(c=>c.slug==='icp').stale,false);
 assert.equal(data.compile.state,'done');
 assert.equal(lib.readMemories(root,'icp').length,2);
});

process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = '1';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,mkdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import * as lib from '../lib/brain.mjs';
const P=new URL('../',import.meta.url).pathname.replace(/\/$/,'');
const waitFor=async (fn)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,50))}assert.fail('timed out waiting for worker')};

test('with no batching delay a saved change starts at once, and another change during the run gets compiled serially',async()=>{
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
 live.GTM_OS_COMPILE_DELAY='0';
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

test('a run that compiles nothing is blocked, not retried, and new notes wait out the cooldown; every run records its tokens (FDE OS, 2026-10-01)',async()=>{
 // The compile tools were hidden from the run (GTM_OS_RUN never reached the MCP server): every run said
 // "done", compiled nothing and the worker started again, 34 runs and 8M input tokens in one day.
 const root=mkdtempSync(join(tmpdir(),'gtm-blocked-')),profile=mkdtempSync(join(tmpdir(),'gtm-blocked-profile-'));
 const env={...process.env,CODEX_HOME:profile,PLUGIN_ROOT:P,GTM_OS_NO_OPEN:'1',GTM_OS_NO_VERSION_CHECK:'1'};
 execFileSync('git',['init','-q',root]);
 execFileSync('bash',[join(P,'scripts/gtm-os-setup/setup.sh'),'--company','Demo','--one-liner','Test','--owner','Ann Lee <ann@example.invalid>','--dashboard','on-demand'],{cwd:root,env,stdio:'ignore'});
 const bin=join(root,'fake-bin');mkdirSync(bin);
 // a codex that answers like the blocked runs did: one message, usage, and no compile call
 writeFileSync(join(bin,'codex'),`#!${process.execPath}
 const {appendFileSync}=require('node:fs');appendFileSync('work/fake-runs','x');
 for(const e of [{type:'thread.started',thread_id:'t-1'},{type:'item.completed',item:{type:'agent_message',text:'Compilation blocked: the compile tools are unavailable in this run.'}},{type:'turn.completed',usage:{input_tokens:241939,cached_input_tokens:203535,output_tokens:778}}])console.log(JSON.stringify(e));
 `,{mode:0o755});
 const live={...env,GTM_OS_NO_COMPILE:'',PATH:bin+':'+process.env.PATH,GTM_OS_COMPILE_RETRY:'0',GTM_OS_COMPILE_DELAY:'0'};
 execFileSync(process.execPath,[join(P,'scripts/gtm-os-remember/remember.mjs'),root,'--by','ann','--context','icp','--content','A note to compile.'],{env:live,encoding:'utf8'});
 await waitFor(()=>{try{return JSON.parse(readFileSync(join(root,'work/compile.json'),'utf8')).state==='blocked'&&!existsSync(join(root,'work/compile.lock'))}catch{return false}});
 assert.equal(readFileSync(join(root,'work/fake-runs'),'utf8'),'x','one run, no retries');
 const log=readFileSync(join(root,'work/hooks.log'),'utf8');
 assert.match(log,/scheduled-run  failed: no progress, the run compiled nothing/);
 assert.doesNotMatch(log,/scheduled-run  done/);
 assert.match(log,/scheduled-run  tokens in=241939 cached=203535 out=778 codex:\/\/threads\/t-1/);
 const run=JSON.parse(readFileSync(join(root,'work/runs.jsonl'),'utf8').trim().split('\n').at(-1));
 assert.deepEqual([run.by,run.thread,run.input,run.cached,run.output],['background','t-1',241939,203535,778]);
 // within the cooldown a new note starts nothing; the advisor's explicit start still may
 assert.equal(lib.compileBlocked(root),true);
 const saved=process.env.GTM_OS_NO_COMPILE;delete process.env.GTM_OS_NO_COMPILE;
 try{assert.equal(lib.kickCompile(root),false)}finally{process.env.GTM_OS_NO_COMPILE=saved}
 assert.equal(lib.compileBlocked(root,Date.now()+lib.COMPILE_COOLDOWN_MS+1000),false,'after the cooldown the next note tries again');
 assert.equal(lib.compileGaveUp(root),true,'the dashboard says the summaries are stuck');
});

test('the MCP server receives GTM_OS_RUN, or a scheduled run never sees the compile tools',()=>{
 const mcp=JSON.parse(readFileSync(join(P,'.mcp.json'),'utf8'));
 assert.ok(mcp.mcpServers.gtm_os.env_vars.includes('GTM_OS_RUN'),'Codex passes only listed variables to an MCP server');
});

test('notes are batched: the worker waits until no note has been saved for the delay, then compiles them in one run (2026-10-01)',async()=>{
 const root=mkdtempSync(join(tmpdir(),'gtm-batch-')),profile=mkdtempSync(join(tmpdir(),'gtm-batch-profile-'));
 const env={...process.env,CODEX_HOME:profile,PLUGIN_ROOT:P,GTM_OS_NO_OPEN:'1',GTM_OS_NO_VERSION_CHECK:'1'};
 execFileSync('git',['init','-q',root]);
 execFileSync('bash',[join(P,'scripts/gtm-os-setup/setup.sh'),'--company','Demo','--one-liner','Test','--owner','Ann Lee <ann@example.invalid>','--dashboard','on-demand'],{cwd:root,env,stdio:'ignore'});
 const company=lib.readContext(root,'company');
 lib.writeContext(root,'company',{...company.fm,rule:company.rule,summary:'Done.',now:'',compiled_at:new Date().toISOString()});
 const bin=join(root,'fake-bin');mkdirSync(bin);
 writeFileSync(join(bin,'codex'),`#!${process.execPath}
 const {appendFileSync}=require('node:fs');const {execFileSync}=require('node:child_process');const P=${JSON.stringify(P)};
 appendFileSync('work/fake-runs','x');
 const key=execFileSync(process.execPath,[P+'/scripts/gtm-os-compile/compile.mjs','.','--facts','icp'],{encoding:'utf8'}).match(/^as_of: (\\S+)/m)[1];
 execFileSync(process.execPath,[P+'/scripts/gtm-os-compile/compile.mjs','.','--apply','icp','--by','background','--as-of',key,'--summary','Both notes.','--now',''],{stdio:'ignore'});
 `,{mode:0o755});
 const live={...env,GTM_OS_NO_COMPILE:'',PATH:bin+':'+process.env.PATH,GTM_OS_COMPILE_RETRY:'0',GTM_OS_COMPILE_DELAY:'3'};
 const remember=content=>execFileSync(process.execPath,[join(P,'scripts/gtm-os-remember/remember.mjs'),root,'--by','ann','--context','icp','--content',content],{env:live,encoding:'utf8'});
 remember('First note.');
 await new Promise(r=>setTimeout(r,1500));
 assert.ok(!existsSync(join(root,'work/fake-runs')),'nothing runs while notes are still coming');
 remember('Second note, inside the delay.');
 await waitFor(()=>{try{return JSON.parse(readFileSync(join(root,'work/compile.json'),'utf8')).state==='done'&&!existsSync(join(root,'work/compile.lock'))}catch{return false}});
 assert.equal(readFileSync(join(root,'work/fake-runs'),'utf8'),'x','two notes, one run');
 assert.equal(lib.readContext(root,'icp').summary,'Both notes.');
});

test('a summary run keeps only GTM OS tools and the person\'s model while putting procedures on stdin',()=>{
 const home=mkdtempSync(join(tmpdir(),'gtm-run-args-'));
 const args=c=>{const dir=mkdtempSync(join(tmpdir(),'gtm-run-args-files-')),a=join(dir,'args'),p=join(dir,'prompt');writeFileSync(join(home,'config.toml'),c);execFileSync(process.execPath,[join(P,'scripts/gtm-os-compile/run-args.mjs'),'--files',a,p,P,'background','icp','e_1'],{env:{...process.env,CODEX_HOME:home}});assert.equal(statSync(a).mode&0o777,0o600);assert.equal(statSync(p).mode&0o777,0o600);return {argv:readFileSync(a,'utf8').split('\0').filter(Boolean),prompt:readFileSync(p,'utf8')}};
 const {argv:slim,prompt}=args('model = "gpt-5.6-luna"\nmodel_reasoning_effort = "medium"\n\n[plugins."slack@x"]\nenabled = true\n');
 assert.ok(slim.includes('--ignore-user-config'));
 assert.ok(slim.includes('model="gpt-5.6-luna"')&&slim.includes('model_reasoning_effort="medium"'));
 assert.ok(slim.some(a=>/^mcp_servers\.gtm_os\.env=\{GTM_OS_RUN="background",GTM_OS_TOOLSET="compile"\}$/.test(a)));
 assert.ok(slim.includes('project_doc_max_bytes=0'));
 assert.equal(slim.at(-1),'-');assert.ok(!slim.some(a=>a.includes('compile_apply')));
 assert.match(prompt,/# Compilation procedure/);assert.match(prompt,/# Entity compilation procedure/);assert.match(prompt,/compile_apply \{brain, context, by, as_of, summary, now\}/);
 // a custom provider is more than a few keys: the person's whole config is used instead
 const {argv:full}=args('model = "x"\nmodel_provider = "azure"\n');
 assert.ok(!full.includes('--ignore-user-config'));assert.ok(full.includes('--dangerously-bypass-hook-trust'));
});

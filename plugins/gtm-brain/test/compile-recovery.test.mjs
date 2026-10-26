import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const plugin=fileURLToPath(new URL('../',import.meta.url));
function fixture(t, data) {
 const scratch=mkdtempSync(join(tmpdir(),'gtm-compile-recovery-')),root=join(scratch,'brain'),fake=join(scratch,'plugin'),bin=join(scratch,'bin');
 t.after(()=>rmSync(scratch,{recursive:true,force:true}));
 for(const p of [join(root,'brain'),join(root,'work'),join(fake,'lib'),bin,...['gtm-brain-compile','gtm-brain-schedule','gtm-brain-entities','gtm-brain-render'].map(s=>join(fake,'scripts',s))])mkdirSync(p,{recursive:true});
 writeFileSync(join(root,'AGENTS.md'),'# Fixture');writeFileSync(join(root,'brain/admin.md'),'# Fixture');
 for(const file of ['background-compile.sh','compile-status.mjs','worker-lock.mjs','run-bounded.mjs','run-usage.mjs','run-args.mjs'])copyFileSync(join(plugin,'scripts/gtm-brain-compile',file),join(fake,'scripts/gtm-brain-compile',file));
 copyFileSync(join(plugin,'scripts/gtm-brain-schedule/scheduled-run.sh'),join(fake,'scripts/gtm-brain-schedule/scheduled-run.sh'));
 copyFileSync(join(plugin,'lib/process-lock.mjs'),join(fake,'lib/process-lock.mjs'));
 const dataPath=join(root,'work/test-data.json');writeFileSync(dataPath,JSON.stringify({contexts:['sales'],entities:[],calls:0,...data}));
 for(const [file,field,id] of [['gtm-brain-compile/compile.mjs','contexts','slug'],['gtm-brain-entities/compile-entity.mjs','entities','id']])writeFileSync(join(fake,'scripts',file),`import fs from 'node:fs'; const d=JSON.parse(fs.readFileSync('work/test-data.json','utf8')); if(d.bad==='${field}'){console.error('Cannot parse fixture ${field}');process.exit(7)} console.log(JSON.stringify(d.${field}.map(x=>({${id}:x})))); if(d.badExit==='${field}')process.exit(7);`);
 writeFileSync(join(fake,'scripts/gtm-brain-render/render.mjs'),`import fs from 'node:fs'; if(fs.existsSync('work/compile.json'))fs.appendFileSync('work/states.jsonl',fs.readFileSync('work/compile.json','utf8')+'\\n');`);
 writeFileSync(join(bin,'codex'),`#!${process.execPath}
 const fs=require('node:fs'),d=JSON.parse(fs.readFileSync('work/test-data.json','utf8'));d.calls++;
 if(d.capturePrompt){d.prompt=fs.readFileSync(0,'utf8');d.args=process.argv.slice(2)}
 if(d.mode==='progress'){if(d.contexts.length)d.contexts.shift();else d.entities.shift()}
 if(d.mode==='bad-after'){d.contexts=[];d.bad='entities'}
 fs.writeFileSync('work/test-data.json',JSON.stringify(d));
 if(d.mode==='hung'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000)}
 else process.exit(d.mode==='exit-error'?1:0);
 `,{mode:0o755});
 const env={...process.env,PLUGIN_ROOT:fake,PATH:bin+':'+process.env.PATH,GTM_BRAIN_COMPILE_RETRY:'0',GTM_BRAIN_COMPILE_TIMEOUT_MS:'2000'};
 return {root,fake,env,run:(scheduled=false)=>spawnSync('bash',[join(fake,'scripts',scheduled?'gtm-brain-schedule/scheduled-run.sh':'gtm-brain-compile/background-compile.sh'),root],{env,encoding:'utf8',timeout:30000}),data:()=>JSON.parse(readFileSync(dataPath,'utf8')),state:()=>JSON.parse(readFileSync(join(root,'work/compile.json'),'utf8'))};
}
for(const bad of ['contexts','entities'])test(`${bad} discovery failure cannot become nothing stale or done`,t=>{
 const f=fixture(t,{contexts:[],bad});
 const scheduled=f.run(true);assert.equal(scheduled.status,1);assert.doesNotMatch(scheduled.stdout,/nothing stale/);
 const background=f.run();assert.equal(background.status,1,background.stderr);assert.equal(f.state().state,'failed');assert.equal(f.state().attempt,3);assert.equal(f.data().calls,0);
 assert.equal(existsSync(join(f.root,'work/compile.lock')),false);
});
test('valid JSON from a failing probe still fails discovery',t=>{
 const f=fixture(t,{contexts:[],badExit:'entities'});assert.equal(f.run().status,1);assert.equal(f.state().state,'failed');assert.equal(f.data().calls,0);
});
test('a broken verification after a successful model exit never writes done',t=>{
 const f=fixture(t,{mode:'bad-after'});assert.equal(f.run().status,1);assert.equal(f.state().state,'failed');assert.equal(f.data().calls,1);
 assert.doesNotMatch(readFileSync(join(f.root,'work/states.jsonl'),'utf8'),/"state":"done"/);
});
test('productive context and entity passes can exceed three attempts without failure notices',t=>{
 const f=fixture(t,{mode:'progress',contexts:['one','two','three','four'],entities:['e_one','e_two']});
 const result=f.run();assert.equal(result.status,0,result.stderr);assert.equal(f.data().calls,6);assert.equal(f.state().state,'done');
 assert.doesNotMatch(readFileSync(join(f.root,'work/states.jsonl'),'utf8'),/"state":"failed"/);
});
test('the scheduled prompt reaches codex through stdin',t=>{
 const f=fixture(t,{mode:'progress',capturePrompt:true});
 const result=f.run();assert.equal(result.status,0,result.stderr);
 assert.match(f.data().prompt,/compile_apply \{brain, context, by, as_of, summary, now\}/);
 assert.ok(f.data().prompt.length>1000);
 assert.equal(f.data().args.at(-1),'-');assert.ok(!f.data().args.some(a=>a.includes('compile_apply')));
});
test('argument generation failure is logged before codex starts',t=>{
 const f=fixture(t,{});rmSync(join(f.fake,'scripts/gtm-brain-compile/run-args.mjs'));
 const result=f.run(true);assert.equal(result.status,1);assert.equal(f.data().calls,0);
 assert.match(readFileSync(join(f.root,'work/hooks.log'),'utf8'),/failed: cannot generate compilation arguments and prompt/);
});
test('empty argument generation is rejected before codex starts',t=>{
 const f=fixture(t,{});writeFileSync(join(f.fake,'scripts/gtm-brain-compile/run-args.mjs'),'');
 const result=f.run(true);assert.equal(result.status,1);assert.equal(f.data().calls,0);
 assert.match(readFileSync(join(f.root,'work/hooks.log'),'utf8'),/failed: invalid compilation arguments or prompt/);
});
test('bounded run sends only its prompt and EOF while caller stdin remains open',async t=>{
 const root=mkdtempSync(join(tmpdir(),'gtm-prompt-input-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const prompt=join(root,'prompt'),output=join(root,'received'),script=join(root,'reader.cjs');
 writeFileSync(prompt,'Expected prompt.');
 writeFileSync(script,`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(output)},fs.readFileSync(0,'utf8'));`);
 const child=spawn(process.execPath,[join(plugin,'scripts/gtm-brain-compile/run-bounded.mjs'),'--prompt-file',prompt,process.execPath,script],{stdio:['pipe','ignore','pipe']});
 let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
 child.stdin.on('error',()=>{});
 child.stdin.write('Caller input must stay private.');
 const result=await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve('timeout')},3000);child.on('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal})})});
 child.stdin.destroy();
 assert.deepEqual(result,{code:0,signal:null},stderr);
 assert.equal(readFileSync(output,'utf8'),'Expected prompt.');
});
test('a zero-progress pass stops at once, blocked, and releases the worker lock (FDE OS, 2026-10-01: no more retries of a run that compiles nothing)',t=>{
 const f=fixture(t,{mode:'no-progress'});assert.equal(f.run().status,1);assert.equal(f.data().calls,1);assert.equal(f.state().state,'blocked');assert.equal(existsSync(join(f.root,'work/compile.lock')),false);
});
test('hung model runs time out, exhaust retries and release the lock',t=>{
 const f=fixture(t,{mode:'hung'});f.env.GTM_BRAIN_COMPILE_TIMEOUT_MS='1000';
 const result=f.run();assert.equal(result.status,1,result.stderr);assert.ok(f.data().calls>=1 && f.data().calls<=3);assert.equal((result.stdout.match(/Compilation timed out/g)||[]).length,3,result.stdout);assert.equal(f.state().attempt,3);assert.equal(f.state().state,'failed');assert.equal(existsSync(join(f.root,'work/compile.lock')),false);assert.match(result.stdout,/timed out/);
});
test('the timeout kills a TERM-resistant descendant even when the group leader exits', {skip:process.platform==='win32'},async t=>{
 const root=mkdtempSync(join(tmpdir(),'gtm-process-timeout-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const beats=join(root,'beats'),script=join(root,'leader.cjs'),prompt=join(root,'prompt');writeFileSync(prompt,'');
 writeFileSync(script,`const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(`const fs=require('node:fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.appendFileSync(${JSON.stringify(beats)},'x'),20);`)}],{stdio:'inherit'});setInterval(()=>{},1000);`);
 const result=spawnSync(process.execPath,[join(plugin,'scripts/gtm-brain-compile/run-bounded.mjs'),'--prompt-file',prompt,process.execPath,script],{env:{...process.env,GTM_BRAIN_COMPILE_TIMEOUT_MS:'750'},encoding:'utf8',timeout:10000});
 assert.equal(result.status,124,result.stderr);const before=readFileSync(beats,'utf8');assert.ok(before.length);
 await new Promise(r=>setTimeout(r,150));assert.equal(readFileSync(beats,'utf8'),before);
});

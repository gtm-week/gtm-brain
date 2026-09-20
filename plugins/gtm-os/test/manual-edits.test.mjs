process.env.GTM_OS_NO_COMPILE='1';
process.env.GTM_OS_NO_WATCH='1';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawn} from 'node:child_process';
import * as lib from '../lib/brain.mjs';
const P=new URL('../',import.meta.url).pathname.replace(/\/$/,'');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'gtm-manual-edit-'));
 const env={...process.env,CODEX_HOME:mkdtempSync(join(tmpdir(),'gtm-manual-profile-')),PLUGIN_ROOT:P,GTM_OS_NO_OPEN:'1'};
 execFileSync('bash',[join(P,'scripts/gtm-os-setup/setup.sh'),'--company','Demo','--one-liner','Test','--owner','Ann Lee <ann@example.invalid>','--dashboard','on-demand'],{cwd:root,env,stdio:'ignore'});
 // This fixture tests later changes with the setup checkpoint already summarized.
 const company=lib.readContext(root,'company');
 lib.writeContext(root,'company',{...company.fm,rule:company.rule,summary:'Onboarding is pending.',now:'Finish onboarding.',compiled_at:new Date().toISOString()});
 lib.writeContext(root,'icp',{title:'Target customers',rule:'Original rule.',summary:'Original summary.',now:'Original guidance.',compiled_at:new Date().toISOString()});
 return {root,env,path:join(root,'brain/contexts/icp/context.md')};
}
const compile=(f,...args)=>execFileSync(process.execPath,[join(P,'scripts/gtm-os-compile/compile.mjs'),f.root,...args],{env:f.env,encoding:'utf8'});
const facts=f=>compile(f,'--facts','icp').match(/^as_of: (\S+)/m)[1];
const apply=(f,key,...extra)=>compile(f,'--apply','icp','--by','ann','--as-of',key,'--summary','Reviewed summary.','--now','Reviewed guidance.',...extra);
const waitFor=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,100))}assert.fail('observer timed out')};

test('manual summary edits pause compilation and require an exact reviewed version; the original is backed up',()=>{
 const f=fixture(),original=readFileSync(f.path,'utf8');
 writeFileSync(f.path,original.replace('Original summary.','Human correction.'));
 const edited=readFileSync(f.path,'utf8'),state=lib.manualCoverState(f.root,'icp');
 assert.equal(state.status,'review');assert.equal(lib.compilePlan(f.root).pending,0);
 assert.match(compile(f,'--facts','icp'),/PAUSED: manual edits need review/);
 assert.equal(JSON.parse(compile(f,'--stale')).find(c=>c.slug==='icp').manualEdit,'review');
 assert.throws(()=>apply(f,facts(f)),e=>e.status===5);
 assert.equal(readFileSync(f.path,'utf8'),edited);
 assert.throws(()=>lib.writeContext(f.root,'icp',{title:'New title',rule:'Rule',summary:'Human correction.'}),/Manual edits need review/);
 assert.throws(()=>compile(f,'--apply','icp','--by','background','--as-of',facts(f),'--summary','Automatic','--now','Automatic','--reviewed-cover',state.hash),e=>e.status===5);
 const c=lib.readContext(f.root,'icp');
 lib.writeContext(f.root,'icp',{...c.fm,rule:'Preserved human instruction.',now:c.now});
 assert.equal(lib.manualCoverState(f.root,'icp').blocked,true);
 apply(f,facts(f),'--reviewed-cover',lib.manualCoverState(f.root,'icp').hash);
 assert.equal(lib.manualCoverState(f.root,'icp').status,'ok');
 assert.equal(readFileSync(join(f.root,'work/manual-edits/icp',state.hash+'.md'),'utf8'),edited);
});

test('a rule edit refreshes and needs compiling; edits made after facts reject outdated output',()=>{
 const f=fixture(),key=facts(f);
 writeFileSync(f.path,readFileSync(f.path,'utf8').replace('Original rule.','New human rule.'));
 assert.equal(lib.manualCoverState(f.root,'icp').blocked,false);
 assert.equal(lib.compilePlan(f.root).pending,1);
 assert.throws(()=>apply(f,key),e=>e.status===4);
 apply(f,facts(f));assert.equal(lib.readContext(f.root,'icp').rule,'New human rule.');
 assert.equal(lib.compilePlan(f.root).pending,0);
});

test('invalid covers and unverified generated fingerprints cannot be silently replaced; extra sections require review',()=>{
 const f=fixture(),baseline=readFileSync(f.path,'utf8');
 writeFileSync(f.path,'---\nsummary: unfinished');
 assert.equal(lib.manualCoverState(f.root,'icp').status,'invalid');
 assert.equal(lib.readContext(f.root,'icp').summary,'Original summary.');
 assert.throws(()=>apply(f,facts(f)),e=>e.status===5);
 writeFileSync(f.path,baseline+'\n## My private draft\nDo not erase this.\n');
 assert.equal(lib.manualCoverState(f.root,'icp').status,'review');
 writeFileSync(f.path,baseline.replace('Original summary.','Changed before tracking recovered.'));rmSync(join(f.root,'work/cover-state/icp.json'));
 assert.equal(lib.manualCoverState(f.root,'icp').status,'untracked');
 assert.throws(()=>apply(f,facts(f)),e=>e.status===5);
});

test('the separate observer refreshes manual saves, preserves edits, and ignores unselected project Markdown',async t=>{
 const f=fixture();const watcher=spawn(process.execPath,[join(P,'server/brain-watch.mjs'),f.root],{env:f.env,stdio:'ignore'});
 t.after(()=>watcher.kill());
 const data=()=>{try{return JSON.parse(readFileSync(join(f.root,'work/home/data.json'),'utf8'))}catch{return null}};
 await waitFor(()=>data()?.contexts.some(c=>c.slug==='icp'));
 const baseline=readFileSync(f.path,'utf8');
 for(let i=0;i<5;i++)writeFileSync(f.path,baseline.replace('Original summary.',`Human edit ${i}.`));
 await waitFor(()=>data()?.manualEdits.some(e=>e.slug==='icp'&&e.status==='review'));
 assert.equal(data().contexts.find(c=>c.slug==='icp').summary,'Human edit 4.');
 assert.ok(readdirSync(join(f.root,'work/manual-edits/icp')).length>=1);
 const generation=data().generatedAt;mkdirSync(join(f.root,'project-files'));writeFileSync(join(f.root,'project-files','notes.md'),'Unselected document');
 await new Promise(r=>setTimeout(r,1200));assert.equal(data().generatedAt,generation);
 writeFileSync(f.path,'---\nsummary: unfinished');
 await waitFor(()=>data()?.manualEdits.some(e=>e.slug==='icp'&&e.status==='invalid'));
 assert.equal(data().contexts.find(c=>c.slug==='icp').summary,'Original summary.');
 assert.equal(readFileSync(f.path,'utf8'),'---\nsummary: unfinished');
});

test('generated covers sync to another machine without a manual-edit warning, but later human edits are detected',()=>{
 const f=fixture();
 rmSync(join(f.root,'work/cover-state/icp.json'));
 assert.equal(lib.manualCoverState(f.root,'icp').blocked,false);
 lib.adoptGeneratedCover(f.root,'icp');
 assert.ok(existsSync(join(f.root,'work/cover-state/icp.json')));
 writeFileSync(f.path,readFileSync(f.path,'utf8').replace('Original summary.','Changed by a person.'));
 assert.equal(lib.manualCoverState(f.root,'icp').status,'review');
});


test('legacy covers get a starting baseline without edits or review; later manual changes stay protected',()=>{
 const f=fixture();
 const legacy=readFileSync(f.path,'utf8').replace(/^gtm_generated:.*\n/m,'');
 writeFileSync(f.path,legacy);rmSync(join(f.root,'work/cover-state/icp.json'));
 const records=readFileSync(join(f.root,'brain/contexts/icp/memories.jsonl'),'utf8');
 const state=lib.manualCoverState(f.root,'icp');
 assert.equal(state.status,'ok');assert.equal(state.changed,false);assert.equal(state.blocked,false);
 assert.equal(readFileSync(f.path,'utf8'),legacy);
 const tracked=join(f.root,'work/cover-state/icp.json');
 const baseline=readFileSync(tracked,'utf8');assert.equal(JSON.parse(baseline).text,legacy);
 assert.equal(lib.compilePlan(f.root).pending,0,'starting tracking alone does not launch a model run');
 assert.equal(readFileSync(join(f.root,'brain/contexts/icp/memories.jsonl'),'utf8'),records);
 writeFileSync(f.path,legacy.replace('Original summary.','Manual correction after initial tracking.'));
 assert.equal(lib.manualCoverState(f.root,'icp').status,'review');
 lib.adoptGeneratedCover(f.root,'icp');
 assert.equal(readFileSync(tracked,'utf8'),baseline,'observer never blesses a later manual edit');
 assert.throws(()=>apply(f,facts(f)),e=>e.status===5);
});

test('first compile of a legacy cover needs no approval and preserves standing instructions',()=>{
 const f=fixture(),legacy=readFileSync(f.path,'utf8').replace(/^gtm_generated:.*\n/m,'');
 writeFileSync(f.path,legacy);rmSync(join(f.root,'work/cover-state/icp.json'));
 lib.appendMemory(f.root,'icp',{authors:['ann-lee'],content:'A newly saved fact.',at:new Date(Date.now()+1000).toISOString()});
 assert.ok(lib.compilePlan(f.root).contexts.includes('icp'));
 assert.doesNotMatch(compile(f,'--facts','icp'),/PAUSED/);
 compile(f,'--apply','icp','--by','background','--as-of',facts(f),'--summary','Updated from the saved fact.','--now','Keep the original instructions.');
 assert.equal(lib.readContext(f.root,'icp').rule,'Original rule.');
 assert.equal(lib.manualCoverState(f.root,'icp').blocked,false);
});

test('first observation preserves unsupported sections and corrupt tracking for review',()=>{
 const f=fixture(),legacy=readFileSync(f.path,'utf8').replace(/^gtm_generated:.*\n/m,'');
 const tracked=join(f.root,'work/cover-state/icp.json');rmSync(tracked);
 const extra=legacy+'\n## Working draft\nKeep these words.\n';writeFileSync(f.path,extra);
 assert.equal(lib.manualCoverState(f.root,'icp').blocked,true);assert.equal(existsSync(tracked),false);
 assert.equal(readFileSync(f.path,'utf8'),extra);
 writeFileSync(f.path,legacy);writeFileSync(tracked,'{broken');
 assert.equal(lib.manualCoverState(f.root,'icp').blocked,true);
 assert.equal(readFileSync(tracked,'utf8'),'{broken');
 assert.equal(readFileSync(f.path,'utf8'),legacy);
});

test('an editor save during initial tracking is compared with the first snapshot, never accepted as a new baseline',()=>{
 const f=fixture(),legacy=readFileSync(f.path,'utf8').replace(/^gtm_generated:.*\n/m,'');
 const tracked=join(f.root,'work/cover-state/icp.json');writeFileSync(f.path,legacy);rmSync(tracked);
 const script=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
 const link=fs.linkSync;
 fs.linkSync=(from,to)=>{if(to===${JSON.stringify(tracked)})fs.writeFileSync(${JSON.stringify(f.path)},${JSON.stringify(legacy.replace('Original summary.','Concurrent human edit.'))});return link(from,to)};
 syncBuiltinESMExports();
 const lib=await import(${JSON.stringify(new URL('../lib/brain.mjs',import.meta.url).href)});
 console.log(lib.manualCoverState(${JSON.stringify(f.root)},'icp').status);`;
 assert.equal(execFileSync(process.execPath,['--input-type=module','-e',script],{env:f.env,encoding:'utf8'}).trim(),'review');
 assert.equal(JSON.parse(readFileSync(tracked,'utf8')).text,legacy);
 assert.match(readFileSync(f.path,'utf8'),/Concurrent human edit/);
});

test('a paused summary is released from a chat after review: the edit is backed up, the baseline adopted, a wrong hash refused (ALL-204 step 1)',()=>{
 const f=fixture(),original=readFileSync(f.path,'utf8');
 writeFileSync(f.path,original.replace('Original summary.','Human correction.'));
 const state=lib.manualCoverState(f.root,'icp');assert.equal(state.status,'review');
 assert.throws(()=>compile(f,'--release','icp','--reviewed-cover','deadbeef'),e=>e.status===5&&/changed since|does not match/.test(String(e.stderr)));
 assert.equal(lib.manualCoverState(f.root,'icp').status,'review','a wrong hash releases nothing');
 const out=compile(f,'--release','icp','--reviewed-cover',state.hash);
 assert.match(out,/released/);
 const after=lib.manualCoverState(f.root,'icp');assert.equal(after.status,'ok');assert.equal(after.blocked,false);
 assert.equal(readFileSync(f.path,'utf8'),readFileSync(f.path,'utf8').replace(/\0/g,''),'the cover itself is not rewritten');
 assert.match(readFileSync(f.path,'utf8'),/Human correction\./);
 const backups=readdirSync(join(f.root,'work/manual-edits'));assert.ok(backups.length>=1,'the edit is backed up before release');
 assert.match(compile(f,'--release','icp','--reviewed-cover',after.hash),/nothing to release|already/);
});

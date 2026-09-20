process.env.GTM_OS_NO_COMPILE = '1';
process.env.GTM_OS_NO_WATCH = '1';
process.env.GTM_OS_NO_COMMIT = '1';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, renameSync, unlinkSync, symlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import * as lib from '../lib/brain.mjs';
import { prepareAsset, resolveAssetFile, assetRows, validateAsset } from '../lib/assets.mjs';
import { createFilesBackend } from '../server/files-backend.mjs';
import { loadOntology, buildTools } from '../vendor/allethic/index.mjs';
const P = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const logo = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="teal"/><text x="12" y="36" fill="white">DEMO</text></svg>';
function fixture() {
 const root = realpathSync(mkdtempSync(join(tmpdir(), 'gtm-assets-')));
 mkdirSync(join(root, 'brain')); mkdirSync(join(root, 'work'));
 writeFileSync(join(root, 'brain/admin.md'), lib.renderFrontmatter({company:'Demo',owner:'ann',dashboard:'on-demand',tools:[],team:[{name:'Ann Lee',handle:'ann',email:'ann@example.invalid'}]})+'\n# Demo\n');
 lib.writeContext(root, 'market', {title:'Market',rule:'Test attachments.',summary:'Nothing here yet.',now:''});
 lib.writeNames(root, [{name:'Demo',kind:'company',aliases:['Demo Ltd'],emails:[],not:[]},{name:'Product',kind:'product',aliases:[],emails:[],not:[]}]);
 writeFileSync(join(root,'logo.svg'),logo);
 const env = {...process.env, CODEX_HOME:join(root,'profile'), GTM_OS_NO_OPEN:'1'};
 const run = (script,...args) => execFileSync(process.execPath,[join(P,script),root,...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const input = (over={}) => ({entity:'Demo Ltd',label:'Demo logo',role:'primary-logo',status:'approved',path:'logo.svg',...over});
 const add = (over={}) => lib.appendMemory(root,'market',{authors:['ann'],people:['Demo'],content:'Demo logo '+Math.random(),asset:prepareAsset(root,input()),...over}).rec;
 return {root, env, run, input, add};
}
async function writer(f) {
 const backend = createFilesBackend({run:async(root,file,args)=>{try{return{code:0,out:f.run('scripts/'+file,...args),err:''}}catch(e){return{code:e.status,out:String(e.stdout),err:String(e.stderr)}}}});
 const model = await loadOntology(join(P,'ontology/gtm-os.ossie.json'));
 assert.deepEqual(model.datasets.map(d=>d.name),['contexts','memories','entities']);
 const tool = buildTools(model,{...backend,act:(name,args)=>backend.act(name,args,{brain:f.root})}).find(t=>t.name==='remember');
 return async fields=>tool.call({by:'ann',...fields});
}
const waitFor=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,100))}assert.fail('observer timed out')};

test('MCP attach, recall, replace and retire retain history and leave file bytes untouched',async()=>{
 const f=fixture(),remember=await writer(f);
 const first=await remember({content:'Demo approved its primary logo.',context:'market',asset:f.input()});
 assert.ok(!first.isError,JSON.stringify(first));
 const old=lib.readMemories(f.root,'market')[0];assert.equal(old.asset.entity,'Demo');assert.deepEqual(old.people,['Demo']);
 assert.deepEqual(old.asset.file,{base:'brain',path:'logo.svg'});
 const recall=f.run('scripts/gtm-os-recall/recall.mjs','--person','Demo');
 assert.ok(recall.includes(join(f.root,'logo.svg')));assert.match(recall,/approved/);
 // The resolved reference can be used directly in an authored document.
 writeFileSync(join(f.root,'brief.md'),`# Demo brief\n\n![Demo logo](${resolveAssetFile(f.root,old.asset)})\n`);
 assert.equal(readFileSync(resolveAssetFile(f.root,old.asset),'utf8'),logo);
 writeFileSync(join(f.root,'new-logo.svg'),logo.replace('teal','navy'));
 const replace=await remember({memories:[{content:'Demo replaced the primary logo.',context:'market',supersedes:old.id,asset:f.input({path:'new-logo.svg'})}]});
 assert.ok(!replace.isError,JSON.stringify(replace));
 let rows=assetRows(f.root);assert.equal(rows.filter(a=>a.active).length,1);assert.equal(rows.find(a=>a.id===old.id).history,'replaced');
 assert.equal(readFileSync(join(f.root,'logo.svg'),'utf8'),logo);
 const current=lib.effectiveMemories(lib.readMemories(f.root,'market'))[0];
 unlinkSync(join(f.root,'new-logo.svg'));
 const retired=await remember({content:'Demo retired its logo.',context:'market',supersedes:current.id,asset:{entity:'Demo',label:'Demo logo',role:'primary-logo',status:'retired'}});
 assert.ok(!retired.isError,JSON.stringify(retired));assert.equal(assetRows(f.root).filter(a=>a.active).length,0);
 assert.equal(lib.readMemories(f.root,'market').length,3);assert.deepEqual(lib.readMemories(f.root,'market')[0],old);
});

test('linked project paths survive a folder move; local paths cannot resolve on a different brain copy',()=>{
 const f=fixture(),folder=realpathSync(mkdtempSync(join(tmpdir(),'gtm-assets-project-')));
 lib.writePointer(folder,{brain:f.root,slug:'website',title:'Website',company:'Demo'});
 lib.writeProjects(f.root,[{slug:'website',path:folder,title:'Website',contexts:['market']}]);writeFileSync(join(folder,'photo.svg'),logo);
 const asset=prepareAsset(f.root,f.input({path:'photo.svg'}),'website');
 assert.deepEqual(asset.file,{base:'project',path:'photo.svg',project:'website'});
 const moved=folder+'-moved';renameSync(folder,moved);lib.writeProjects(f.root,[{slug:'website',path:moved,title:'Website',contexts:['market']}]);
 assert.equal(resolveAssetFile(f.root,asset),join(moved,'photo.svg'));
 const outside=prepareAsset(f.root,f.input({path:join(moved,'photo.svg')}));assert.equal(outside.file.base,'local');
 const other=fixture();assert.throws(()=>resolveAssetFile(other.root,outside),/another computer/);
 lib.removePointer(moved);lib.writePointer(moved,{brain:f.root,slug:'wrong',title:'Wrong',company:'Demo'});
 assert.throws(()=>resolveAssetFile(f.root,asset),/not linked/);
});

test('attachments reject unknown entities, malformed paths, directories and symlinks escaping their folder',async()=>{
 const f=fixture();
 for(const input of [f.input({entity:'Unknown'}),f.input({path:'../outside'}),f.input({path:'.'}),f.input({path:'missing.png'}),f.input({status:'automatic'}),f.input({file:{path:'/etc/passwd'}})])assert.throws(()=>prepareAsset(f.root,input));
 const outside=fixture();symlinkSync(join(outside.root,'logo.svg'),join(f.root,'redirect.svg'));
 assert.throws(()=>prepareAsset(f.root,f.input({path:'redirect.svg'})),/escapes/);
 const asset=prepareAsset(f.root,f.input());unlinkSync(join(f.root,'logo.svg'));symlinkSync(join(outside.root,'logo.svg'),join(f.root,'logo.svg'));
 assert.throws(()=>resolveAssetFile(f.root,asset),/outside/);
 assert.ok(validateAsset({...asset,file:{base:'brain',path:'../secret'}}).length);
 const remember=await writer(f),before=lib.readMemories(f.root,'market').length;
 const result=await remember({memories:[{content:'Must not partially write.',context:'market'},{content:'Invalid attachment.',context:'market',asset:f.input({path:'missing.png'})}]});
 assert.ok(result.isError);assert.equal(lib.readMemories(f.root,'market').length,before);
});

test('shared files keep independent entity roles, and ambiguous approved roles are visible',()=>{
 const f=fixture();f.add();f.add();f.add({people:['Product'],asset:prepareAsset(f.root,f.input({entity:'Product',role:'product-photo'}))});
 const rows=assetRows(f.root);assert.equal(rows.filter(a=>a.ambiguous).length,2);assert.equal(rows.find(a=>a.entity==='Product').ambiguous,false);
 assert.equal(new Set(lib.readMemories(f.root,'market').map(m=>resolveAssetFile(f.root,m.asset))).size,1);
 f.run('scripts/gtm-os-render/render.mjs');const data=JSON.parse(readFileSync(join(f.root,'work/home/data.json'),'utf8'));
 assert.equal(data.assets.length,3);assert.equal(data.assets[0].preview,true);
 assert.match(f.run('scripts/gtm-os-recall/recall.mjs','Demo'),/Attachments needing a choice/);
});

test('read-only server opens only recorded files, sandboxes SVG and denies substituted paths',async t=>{
 const f=fixture(),m=f.add();f.run('scripts/gtm-os-render/render.mjs');
 const url=f.run('server/dash.mjs','--start').trim();t.after(()=>f.run('server/dash.mjs','--stop'));
 const fetch=(path,options={})=>globalThis.fetch(url+path,{...options,headers:{connection:'close',...options.headers}});
 let res=await fetch(`assets/market/${m.id}?preview=1`);assert.equal(res.status,200);assert.equal(await res.text(),logo);
 assert.equal(res.headers.get('content-type'),'image/svg+xml');assert.match(res.headers.get('content-security-policy'),/sandbox/);
 res=await fetch(`assets/market/${m.id}`);assert.match(res.headers.get('content-disposition'),/^attachment/);await res.arrayBuffer();
 assert.equal((await fetch(`assets/market/${m.id}`,{method:'HEAD'})).status,200);
 assert.equal((await fetch(`assets/market/${m.id}`,{method:'POST'})).status,405);
 assert.equal((await fetch('assets/market/m_000000')).status,404);
 assert.equal((await fetch('assets/market/../../brain/admin.md')).status,404);
 assert.equal((await fetch(`assets/market/${m.id}`,{headers:{'sec-fetch-site':'cross-site'}})).status,403);
 const outside=fixture();unlinkSync(join(f.root,'logo.svg'));symlinkSync(join(outside.root,'brain/admin.md'),join(f.root,'logo.svg'));
 assert.equal((await fetch(`assets/market/${m.id}?preview=1`)).status,404);
});

test('file edits, deletion and restoration refresh attachments without editing memories or scanning folders',async t=>{
 const f=fixture(),m=f.add();const original=readFileSync(join(f.root,'brain/contexts/market/memories.jsonl'),'utf8');
 const watcher=spawn(process.execPath,[join(P,'server/brain-watch.mjs'),f.root],{env:f.env,stdio:'ignore'});t.after(()=>watcher.kill());
 const data=()=>{try{return JSON.parse(readFileSync(join(f.root,'work/home/data.json'),'utf8'))}catch{return null}};
 await waitFor(()=>data()?.assets.some(a=>a.id===m.id));const revision=data().assets[0].revision;
 writeFileSync(join(f.root,'logo.svg'),logo.replace('teal','blue'));await waitFor(()=>data()?.assets[0].revision!==revision);
 unlinkSync(join(f.root,'logo.svg'));await waitFor(()=>data()?.assets[0].issue);assert.equal(data().assets[0].url,null);
 writeFileSync(join(f.root,'logo.svg'),logo);await waitFor(()=>data()?.assets[0].preview);
 assert.equal(readFileSync(join(f.root,'brain/contexts/market/memories.jsonl'),'utf8'),original);
 assert.equal(existsSync(join(f.root,'work/compile.json')),false);
});

test('forked contexts retain attachment references and count each origin once',()=>{
 const f=fixture(),old=f.add();
 f.run('scripts/gtm-os-contexts/contexts.mjs','--fork','market','market-copy','Market copy');
 const copy=lib.readMemories(f.root,'market-copy').find(m=>m.asset);
 assert.ok(copy);assert.deepEqual(copy.asset,old.asset);assert.equal(assetRows(f.root).length,1);
 assert.equal(assetRows(f.root)[0].context,'market-copy');
 assert.ok(f.run('scripts/gtm-os-recall/recall.mjs','--person','Demo').includes(join(f.root,'logo.svg')));
 lib.appendMemory(f.root,'market-copy',{authors:['ann'],content:'Retired the copied relationship.',supersedes:copy.id,asset:{...copy.asset,status:'retired'}});
 assert.equal(assetRows(f.root).filter(a=>a.active).length,0);
 assert.equal(readFileSync(join(f.root,'logo.svg'),'utf8'),logo);
});

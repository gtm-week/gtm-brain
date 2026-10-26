import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyRuntime } from '../lib/plugin-runtime.mjs';
const moduleUrl = new URL('../../../scripts/migrate-install.mjs', import.meta.url);
const plugin = fileURLToPath(new URL('../', import.meta.url));
const oldId='gtm-os@gtm-os', nextId='gtm-brain@gtm-brain';
// The version this checkout ships: the migration verifies the installed files against it.
const VERSION=JSON.parse(readFileSync(join(plugin,'.codex-plugin/plugin.json'),'utf8')).version;
async function migration(t, host, fault) {
  const dir=mkdtempSync(join(tmpdir(),'brain-install-rename-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const cache=join(dir,'plugins/cache/gtm-brain/gtm-brain');mkdirSync(cache,{recursive:true});symlinkSync(plugin,join(cache,VERSION),'dir');
  const state={old:true,next:false,market:false,events:[]};
  const command=(name,args)=>{
    const cmd=args.join(' ');state.events.push(cmd);
    if(cmd==='plugin list --json') {
      const rows=[...(state.old?[{pluginId:oldId,id:oldId,installed:true,enabled:true,scope:'project',projectPath:process.cwd()}]:[]),...(state.next?[{pluginId:nextId,id:nextId,installed:true,enabled:true,scope:'project',projectPath:process.cwd(),version:VERSION,installPath:plugin}]:[])];
      return JSON.stringify(host==='codex'?{installed:rows}:rows);
    }
    if(cmd==='plugin marketplace list --json') {const rows=state.market?[{name:'gtm-brain'}]:[];return JSON.stringify(host==='codex'?{marketplaces:rows}:rows);}
    if(cmd==='plugin marketplace add gtm-week/gtm-brain') {state.market=true;return '';}
    if(cmd===`plugin ${host==='codex'?'add':'install'} ${nextId}${host==='claude'?' --scope project':''}`) {
      if(fault==='install') throw new Error('external private stderr');state.next=true;return '';
    }
    if(cmd===`plugin ${host==='codex'?'remove':'uninstall'} ${oldId}${host==='claude'?' --scope project --keep-data':''}`) {state.old=false;return '';}
    throw new Error(`Unexpected host command ${cmd}`);
  };
  const {migrateInstallation}=await import(moduleUrl);
  const run=()=>migrateInstallation({host,home:dir,command,verify:(root,version)=>{
    state.events.push('runtime verification');if(fault==='runtime')throw new Error('broken connector');return verifyRuntime(root,version);
  },trust:async()=>{state.events.push('hook verification');return fault==='hooks'?[]:[{enabled:true,status:'trusted'}];}});
  return {state,run};
}
for(const host of ['codex','claude'])test(`${host}: migration preserves the old plugin until new runtime and safety checks pass, then retries safely`,async t=>{
  const {state,run}=await migration(t,host);
  await run();assert.equal(state.old,false);assert.equal(state.next,true);
  assert.ok(state.events.indexOf('runtime verification')<state.events.findIndex(x=>x.includes(` ${oldId}`)));
  if(host==='codex')assert.ok(state.events.indexOf('hook verification')<state.events.findIndex(x=>x.includes(` ${oldId}`)));
  const removalCount=state.events.filter(x=>x.includes(` ${oldId}`)).length;
  await run();assert.equal(state.events.filter(x=>x.includes(` ${oldId}`)).length,removalCount);
});
for(const fault of ['install','runtime','hooks'])test(`migration keeps the existing plugin when ${fault} fails`,async t=>{
  const {state,run}=await migration(t,'codex',fault);await assert.rejects(run);assert.equal(state.old,true);
  assert.ok(!state.events.some(x=>x.startsWith('plugin remove')));
});

for(const scope of ['project','local']) test(`Claude executable migrates ${scope} in its original project and preserves plugin data`, t => {
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'brain-migration-cwd-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const bin=join(dir,'bin'), project=join(dir,'company');mkdirSync(bin);mkdirSync(project);
  writeFileSync(join(bin,'claude'),`#!${process.execPath}
const fs=require('node:fs');const args=process.argv.slice(2);const stateFile=${JSON.stringify(join(dir,'state.json'))};
let state={next:false,old:true,events:[]};try{state=JSON.parse(fs.readFileSync(stateFile))}catch{}
state.events.push({args,cwd:process.cwd()});
const old={id:'gtm-os@gtm-os',scope:${JSON.stringify(scope)},enabled:true,projectPath:${JSON.stringify(project)}};
const next={id:'gtm-brain@gtm-brain',scope:${JSON.stringify(scope)},enabled:true,version:${JSON.stringify(VERSION)},installPath:${JSON.stringify(plugin)},projectPath:${JSON.stringify(project)}};
let out='';
if(args[1]==='list')out=JSON.stringify([...(state.old?[old]:[]),...(state.next?[next]:[])]);
else if(args[1]==='marketplace')out='[]';
else if(args[1]==='install')state.next=true;
else if(args[1]==='uninstall')state.old=false;
else process.exit(90);
fs.writeFileSync(stateFile,JSON.stringify(state));console.log(out);
`,{mode:0o755});
  const out=execFileSync(process.execPath,[fileURLToPath(moduleUrl),'claude'],{cwd:project,env:{...process.env,PATH:`${bin}:${process.env.PATH}`},encoding:'utf8'});
  const state=JSON.parse(readFileSync(join(dir,'state.json')));
  assert.ok(state.events.every(e=>e.cwd===project));
  assert.deepEqual(state.events.find(e=>e.args[1]==='uninstall').args,['plugin','uninstall','gtm-os@gtm-os','--scope',scope,'--keep-data']);
  assert.equal(state.old,false);assert.equal(state.next,true);assert.match(out,/verified/);
});

test('Claude does not retire the old project plugin because a replacement exists in another project', async t=>{
  const {migrateInstallation}=await import(moduleUrl);
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'brain-migration-scope-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const project=join(dir,'current'), other=join(dir,'other');mkdirSync(project);mkdirSync(other);
  const events=[];
  await assert.rejects(()=>migrateInstallation({host:'claude',cwd:project,command:(host,args)=>{
    events.push(args);
    if(args[1]==='list')return JSON.stringify([
      {id:oldId,scope:'project',enabled:true,projectPath:project},
      {id:nextId,scope:'project',enabled:true,version:VERSION,installPath:plugin,projectPath:other}
    ]);
    if(args[1]==='marketplace')return JSON.stringify([{name:'gtm-brain'}]);
    if(args[1]==='install')throw new Error('installation failed');
    throw new Error('unexpected removal');
  }}),/installation failed/);
  assert.ok(!events.some(args=>args[1]==='uninstall'));
});

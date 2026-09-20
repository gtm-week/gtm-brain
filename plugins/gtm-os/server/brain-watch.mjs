#!/usr/bin/env node
// Local file observer, separate from the read-only dashboard HTTP server.
// It writes only work/ snapshots and derived dashboard files; compilation uses existing tools.
import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync,statSync,openSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as lib from '../lib/brain.mjs';
import { assetRows, resolveAssetFile } from '../lib/assets.mjs';
const root=resolve(process.argv[2]||'.'),mode=process.argv[3];
const work=join(root,'work'),stateFile=join(work,'brain-watch.json'),lock=join(work,'brain-watch.lock');
const state=()=>{try{return JSON.parse(readFileSync(stateFile,'utf8'))}catch{return null}};
const alive=pid=>{try{process.kill(pid,0);return true}catch{return false}};
if(mode==='--stop'){
 const old=state();if(old?.pid&&alive(old.pid))process.kill(old.pid);process.exit(0);
}
if(!existsSync(join(root,'brain','admin.md')))process.exit(1);
mkdirSync(work,{recursive:true});
if(mode==='--start'){
 const old=state();if(old?.pid&&alive(old.pid)&&old.script===fileURLToPath(import.meta.url))process.exit(0);
 if(old?.pid&&alive(old.pid))process.kill(old.pid);
 const log=openSync(join(work,'brain-watch.log'),'a');
 spawn(process.execPath,[fileURLToPath(import.meta.url),root],{detached:true,stdio:['ignore',log,log],env:{...process.env,GTM_OS_RUN:'',GTM_OS_COMPILE_BY:''}}).unref();
 process.exit(0);
}
try{mkdirSync(lock)}catch{
 const old=state();if(old?.pid&&alive(old.pid))process.exit(0);
 try{if(Date.now()-statSync(lock).mtimeMs<5000)process.exit(0);rmSync(lock,{recursive:true});mkdirSync(lock)}catch{process.exit(0)}
}
writeFileSync(stateFile,JSON.stringify({pid:process.pid,script:fileURLToPath(import.meta.url)}));
const finish=()=>{if(state()?.pid===process.pid){rmSync(stateFile,{force:true});rmSync(lock,{recursive:true,force:true})}process.exit(0)};
process.on('SIGTERM',finish);process.on('SIGINT',finish);
let attachmentKey = '', attachments = [];
function fingerprint(){
 const files=['brain/admin.md','brain/entities.md','AGENTS.md','work/projects.json','work/asset-machine.json'];
 try{for(const d of readdirSync(join(root,'brain','contexts'),{withFileTypes:true}))if(d.isDirectory()&&!d.isSymbolicLink()){
  files.push(`brain/contexts/${d.name}/context.md`,`brain/contexts/${d.name}/memories.jsonl`);
 }}catch{}
 try{for(const d of readdirSync(join(root,'brain','entities'),{withFileTypes:true}))if(d.isFile()&&d.name.endsWith('.md'))files.push(`brain/entities/${d.name}`)}catch{}
 const key = JSON.stringify(files.sort().map(file=>{try{const s=statSync(join(root,file));return[file,s.mtimeMs,s.size]}catch{return[file,null]}}));
 if (key !== attachmentKey) { try { attachments = assetRows(root).map(({id,entity,label,role,status,file}) => ({id,asset:{entity,label,role,status,file}})); attachmentKey = key; } catch {} }
 // Stat only explicitly attached files, never scan the folders they live in.
 return key + JSON.stringify(attachments.map(a => { try { const path = resolveAssetFile(root, a.asset), s = statSync(path); return [a.id, path, s.mtimeMs, s.ctimeMs, s.size]; } catch { return [a.id, null]; } }));
}
let observed=fingerprint(),rendered='',stableAt=Date.now();
function tick(){
 if(!existsSync(join(root,'brain','admin.md')))return; // An editor can temporarily rename this file.
 const current=fingerprint();
 if(current!==observed){observed=current;stableAt=Date.now();return}
 if(current===rendered||Date.now()-stableAt<500)return;
 try{
  for(const context of lib.listContexts(root))lib.adoptGeneratedCover(root,context.slug);
  for(const edit of lib.manualCoverChanges(root))if(edit.hash)lib.backupManualCover(root,edit.slug);
  lib.rerender(root);
  rendered=current;
 }catch(e){lib.logActivity(root,'manual-edit',`Refresh deferred: ${e.message}`)}
}
setInterval(tick,500);

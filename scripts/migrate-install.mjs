#!/usr/bin/env node
// Explicit, user-requested installation migration. Never edits a brain or its folders.
import { execFileSync } from 'node:child_process';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { verifyRuntime } from '../plugins/gtm-brain/lib/plugin-runtime.mjs';
import { hookTrust } from '../plugins/gtm-brain/hooks/trust-hooks.mjs';

const OLD_ID='gtm-os@gtm-os', ID='gtm-brain@gtm-brain';
const cli=(host,args,options={})=>execFileSync(host,args,{...options,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});
export async function migrateInstallation({host='codex',home,cwd=process.cwd(),command=cli,verify=verifyRuntime,trust=hookTrust}={}) {
  if(!['codex','claude'].includes(host))throw new Error('Choose codex or claude.');
  home ||= host==='codex' ? process.env.CODEX_HOME||join(homedir(),'.codex') : process.env.CLAUDE_CONFIG_DIR||join(homedir(),'.claude');
  const canonical=path=>{try{return realpathSync(path);}catch{return resolve(path);}};
  let operationCwd=canonical(cwd);
  const run=(...args)=>command(host,['plugin',...args],{cwd:operationCwd});
  const installed=()=>{const rows=JSON.parse(run('list','--json'));return host==='codex'?rows.installed||[]:rows;};
  const id=p=>host==='codex'?p.pluginId:p.id;
  const applies=p=>{
    if(host!=='claude'||p.scope==='user')return true;
    if(!p.projectPath)return false;
    const path=relative(canonical(p.projectPath),operationCwd);
    return path===''||(!path.startsWith('..')&&!isAbsolute(path));
  };
  const before=installed(), oldMatches=before.filter(p=>id(p)===OLD_ID&&applies(p));
  if(oldMatches.length>1)throw new Error('Multiple previous installation scopes apply here. Resolve the duplicate scopes in the host before migrating; all installations were kept.');
  const old=oldMatches[0];
  if(host==='claude'&&!old&&before.some(p=>id(p)===OLD_ID))
    throw new Error('The previous plugin belongs to another project. Run this migration from that project; all installations were kept.');
  if(host==='claude'&&old?.projectPath)operationCwd=canonical(old.projectPath);
  const sameScope=p=>host!=='claude'||(applies(p)&&(!old||(p.scope===old.scope&&(!old.projectPath||canonical(p.projectPath||operationCwd)===operationCwd))));
  const nextMatches=before.filter(p=>id(p)===ID&&sameScope(p));
  if(nextMatches.length>1)throw new Error('Multiple replacement installation scopes apply here. Resolve them in the host before migrating; all installations were kept.');
  let next=nextMatches[0];
  const scope=host==='claude'?['--scope',old?.scope||next?.scope||'user']:[];
  if(!next) {
    const listed=JSON.parse(run('marketplace','list','--json'));
    const markets=host==='codex'?listed.marketplaces||[]:listed;
    if(!markets.some(m=>m.name==='gtm-brain'))run('marketplace','add','gtm-week/gtm-brain');
    run(host==='codex'?'add':'install',ID,...scope);
    next=installed().find(p=>id(p)===ID&&sameScope(p));
  }
  if(!next?.enabled || (host==='codex'&&!next.installed) || !/^\d+\.\d+\.\d+$/.test(next.version||''))
    throw new Error('The new plugin is not installed and enabled. The previous plugin has been kept.');
  const root=host==='codex'?join(home,'plugins/cache/gtm-brain/gtm-brain',next.version):next.installPath;
  if(!root)throw new Error('The new installation has no verified path. The previous plugin has been kept.');
  const runtime=verify(root,next.version);
  if(host==='codex') {
    const hooks=await trust({trust:true,pluginId:ID});
    if(!hooks.length||hooks.some(h=>!h.enabled||!['trusted','managed'].includes(h.status)))
      throw new Error('The new safety hooks are not running. The previous plugin has been kept. Review hooks in Codex and retry.');
  }
  if(old)run(host==='codex'?'remove':'uninstall',OLD_ID,...scope,...(host==='claude'?['--keep-data']:[]));
  return {version:runtime.version,migrated:!!old};
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'.')).href) {
  const host=process.argv[2]||'codex';
  try {
    if(process.argv.length>3)throw new Error('Usage: node scripts/migrate-install.mjs [codex|claude]');
    // Codex installs globally; Claude project/local scopes must retain the caller's project.
    if(host==='codex')process.chdir(homedir());
    const result=await migrateInstallation({host});
    console.log(`GTM Brain ${result.version} is verified${result.migrated?'; the old plugin registration was removed':''}.`);
    console.log('Your working folders and brain files were not changed. Restart the host, open the same folder, and ask to refresh the brain rules. Do not run setup again.');
  } catch(error) {
    console.error(error.status!==undefined||error.code?'Migration stopped at a host command. Check access and retry; no unverified replacement is reported.':error.message);
    process.exitCode=1;
  }
}

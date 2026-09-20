// Opt-in real CLI installation into a disposable Codex profile. No change to the normal profile.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const profile=mkdtempSync(join(tmpdir(),'gtm-os-clean-install-'));
const env={...process.env,CODEX_HOME:profile};
const events=[];
const run=(args)=>{const at=Date.now();const output=execFileSync('codex',args,{encoding:'utf8',env,cwd:root,timeout:60000});events.push({args,ms:Date.now()-at,output});console.log(args.join(' ')+': '+output.trim());return output;};
try{
 run(['features','enable','hooks']);
 run(['plugin','marketplace','add',root]);
 run(['plugin','add','gtm-os@gtm-os']);
 // Exercise removal and reinstallation only inside this disposable profile.
 run(['plugin','remove','gtm-os@gtm-os']);
 const removed=run(['plugin','list']);
 assert.doesNotMatch(removed,/gtm-os@gtm-os\s+installed,\s*enabled/);
 run(['plugin','add','gtm-os@gtm-os']);
 const listed=run(['plugin','list']);
 assert.match(listed,/gtm-os@gtm-os\s+installed,\s*enabled/);
 const version=JSON.parse(readFileSync(join(root,'plugins/gtm-os/.codex-plugin/plugin.json'),'utf8')).version;
 const installed=join(profile,'plugins/cache/gtm-os/gtm-os',version);
 assert.ok(existsSync(join(installed,'skills/gtm-os-start/references/questions.md')));
 assert.equal(readFileSync(join(installed,'skills/gtm-os-start/references/questions.md'),'utf8'),readFileSync(join(root,'plugins/gtm-os/skills/gtm-os-start/references/questions.md'),'utf8'));
 console.log('PASS isolated installation: '+profile);
}catch(e){console.error(e.message);process.exitCode=1;}
finally{writeFileSync(join(profile,'install-events.json'),JSON.stringify({profile,events},null,2));}

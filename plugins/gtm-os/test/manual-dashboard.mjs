#!/usr/bin/env node
// Create a synthetic brain for manually testing the view-only dashboard and Codex handoff.
// No company records or installed preferences are used. Run from the contributor checkout.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import * as lib from '../lib/brain.mjs';
const plugin=new URL('../',import.meta.url).pathname;
const root=mkdtempSync(join(tmpdir(),'gtm-dashboard-manual-'));
const profile=mkdtempSync(join(tmpdir(),'gtm-dashboard-manual-profile-'));
const env={...process.env,CODEX_HOME:profile,GTM_OS_NO_COMPILE:'1',GTM_OS_NO_COMMIT:'1',GTM_OS_NO_OPEN:'1',PLUGIN_ROOT:plugin};
execFileSync('bash',[join(plugin,'scripts/gtm-os-setup/setup.sh'),'--company','Dashboard Demo','--one-liner','Synthetic records for testing the read-only dashboard','--owner','Manual Tester <tester@example.invalid>','--dashboard','on-demand'],{cwd:root,env,stdio:'ignore'});
lib.appendMemory(root,'company',{authors:['manual-tester'],content:'Onboarding: completed v1. This is a synthetic dashboard test brain.'});
const first=lib.appendMemory(root,'market',{authors:['manual-tester'],kind:'question',tags:['brain-question'],content:'Should our research notes record publication dates as a standing rule?'}).rec;
const second=lib.appendMemory(root,'offer',{authors:['manual-tester'],kind:'question',tags:['brain-question'],content:'Two sample notes disagree about the trial length. Should the brain record 14 days or 30 days?'}).rec;
lib.appendMemory(root,'market',{authors:['manual-tester'],content:'Sample CRM task: Artur is responsible for following up with the demo prospect. This is context information, not a request for the dashboard viewer.',source:[{kind:'test',ref:'synthetic-attio-task'}]});
lib.appendMemory(root,'market',{authors:['manual-tester'],content:'Demo sources: seven fictional Gmail references, three fictional Attio records and one example website. The email and CRM samples have no original to open. Expand Sources to try the website link.',source:[...Array.from({length:7},(_,i)=>({kind:'gmail',ref:'sample-mail-'+i})),...Array.from({length:3},(_,i)=>({kind:'attio',ref:'sample-record-'+i})),{kind:'url',ref:'https://example.com'}]});
lib.writeLoaded(root,['market']);
for(const slug of ['company','market','offer']){const c=lib.readContext(root,slug);lib.writeContext(root,slug,{...c.fm,rule:c.rule,now:c.now,compiled_at:new Date().toISOString(),summary:slug==='market'?'Research notes need a consistent date policy.':slug==='offer'?'The sample trial length needs clarification.':'This brain contains synthetic records for a manual dashboard test.'})}
writeFileSync(join(root,'MANUAL-TEST.md'),`# Read-only dashboard manual test\n\nThis folder contains synthetic records only.\n\n1. Open the served dashboard. Home has two brain questions; the sample CRM task stays in Market.\n2. Click Chat about this. Confirm Codex selects this folder and fills the composer. Press Send.\n3. Answer one question. Watch it disappear from the dashboard once Codex saves the answer.\n4. Repeat while searching or viewing a context. The viewer should retain its search and position.\n5. Browse proposal details, notes and entities. There must be no Add, Answer, Drop or approval controls.\n\nQuestion IDs: ${first.id}, ${second.id}.\n`);
execFileSync(process.execPath,[join(plugin,'scripts/gtm-os-render/render.mjs'),root],{env,stdio:'ignore'});
console.log(JSON.stringify({brain:root,profile,questions:[first.id,second.id],page:join(root,'work/home/index.html')},null,2));

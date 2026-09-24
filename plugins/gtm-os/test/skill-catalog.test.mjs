import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { skillCatalog } from '../scripts/gtm-os-render/skill-catalog.mjs';
import { page } from './helpers/dashboard-page.mjs';
const plugin=fileURLToPath(new URL('../',import.meta.url));

test('the real renderer publishes the skill catalog in both page and data',t=>{
 const scratch=mkdtempSync(join(tmpdir(),'gtm-skill-render-')),root=join(scratch,'brain-workspace');mkdirSync(root);
 t.after(()=>rmSync(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 const env={...process.env,CODEX_HOME:join(scratch,'profile'),PLUGIN_ROOT:plugin,GTM_OS_NO_OPEN:'1',GTM_OS_NO_COMPILE:'1',GTM_OS_NO_WATCH:'1',GTM_OS_NO_VERSION_CHECK:'1'};
 execFileSync('git',['init','-q',root],{env});
 execFileSync('bash',[join(plugin,'scripts/gtm-os-setup/setup.sh'),'--company','Skill Fixture','--one-liner','Test workflows','--owner','Alex Example <alex@example.invalid>','--language','en','--dashboard','on-demand'],{cwd:root,env,stdio:'pipe'});
 execFileSync(process.execPath,[join(plugin,'scripts/gtm-os-render/render.mjs'),root],{env});
 const data=JSON.parse(readFileSync(join(root,'work/home/data.json'),'utf8'));
 assert.deepEqual(data.skills,skillCatalog());
 for(const file of ['dashboard.js','dashboard.css'])assert.equal(readFileSync(join(root,'work/home/ui',file),'utf8'),readFileSync(join(plugin,'scripts/gtm-os-render/ui',file),'utf8'));
 const html=readFileSync(join(root,'work/home/index.html'),'utf8');assert.match(html,/id="admin-skills"/);assert.match(html,/gtm-os-sync/);assert.doesNotMatch(html,/__DATA__/);
});

test('the catalog covers exactly the shipped user skills',()=>{
 const shipped=readdirSync(join(plugin,'skills')).filter(id=>existsSync(join(plugin,'skills',id,'SKILL.md'))).sort();
 {
  const skills=skillCatalog();assert.deepEqual(skills.map(s=>s.id).sort(),shipped);
  assert.equal(new Set(skills.map(s=>s.id)).size,skills.length);assert.equal(skills.filter(s=>s.featured).length,4);
  for(const s of skills){assert.equal(s.command,'/'+s.id);assert.ok(s.title&&s.description&&s.example);assert.ok(['daily','knowledge','projects','setup'].includes(s.group));
   assert.match(readFileSync(join(plugin,'skills',s.id,'SKILL.md'),'utf8'),new RegExp('^name: '+s.id+'$','m'));
  }
 }
});
test('missing workflows and internal script folders are never advertised',t=>{
 const root=mkdtempSync(join(tmpdir(),'gtm-skill-catalog-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'skills/gtm-os-sync'),{recursive:true});writeFileSync(join(root,'skills/gtm-os-sync/SKILL.md'),'name: gtm-os-sync');
 mkdirSync(join(root,'skills/gtm-os-project'),{recursive:true});writeFileSync(join(root,'skills/gtm-os-project/project.mjs'),'');
 assert.deepEqual(skillCatalog(root).map(s=>s.id),['gtm-os-sync']);
});
const fixture=()=>({brain:'/tmp/FDE OS & Łódź #1',name:'FDE OS',generatedAt:'2026-09-13T10:00:00Z',
 contexts:[],names:[],recent:[],loaded:[],questions:[],decisions:[],tools:[],activity:[],projects:[],
 admin:{company:'FDE OS',owner:'alex',team:[],tools:[],body:'',dashboard:'on-demand'},skills:skillCatalog()});
test(`shortcuts and searchable examples open exact workflow drafts`,()=>{
 const D=fixture(),p=page(D);
 const home=p.node('#h-skills').innerHTML;assert.equal((home.match(/<article /g)||[]).length,0);assert.equal(home,'');assert.match(p.node('#nav').innerHTML,/data-v="skills"/);
 assert.match(p.node('#nav').innerHTML,/Help/);
 assert.match(p.node('#admin-skills').innerHTML,/press Send/);
 const results=p.node('#skill-results').innerHTML;assert.equal((results.match(/<article /g)||[]).length,D.skills.length);
 const links=[...results.matchAll(/href="([^"]+)"/g)].map(m=>new URL(m[1].replaceAll('&amp;','&')));
 for(let i=0;i<links.length;i++){const url=links[i],s=D.skills[i];assert.equal(url.protocol,'codex:');assert.equal(url.hostname,'threads');assert.equal(url.pathname,'/new');
  assert.equal(url.searchParams.get('path'),D.brain);assert.equal(url.searchParams.get('prompt'),s.command+'\n\n'+s.example);assert.deepEqual([...url.searchParams.keys()],['path','prompt']);}
 p.node('#skill-search').oninput({target:{value:'gtm-os-sync'}});
 assert.equal((p.node('#skill-results').innerHTML.match(/<article /g)||[]).length,1);
 assert.ok(p.node('#skill-results').innerHTML.includes(D.skills.find(s=>s.id==='gtm-os-sync').example));
 p.run('renderSkillLibrary("zzzz-no-match")');assert.match(p.node('#skill-results').innerHTML,/No matching skills/);
 p.run('show("admin")');p.node('#skill-search').value='gtm-os-sync';p.run('refreshPage()');
 const fresh=page(D,{saved:p.saved});assert.equal(fresh.node('#skill-search').value,'gtm-os-sync');
 assert.equal((fresh.node('#skill-results').innerHTML.match(/<article /g)||[]).length,1);
 assert.doesNotMatch(results,/<form|data-say=|onclick=|https?:/);
});
test('skill text is escaped, malformed commands are hidden, and old dashboard data degrades safely',()=>{
 const D=fixture();D.skills[0]={...D.skills[0],title:'<script>bad()</script>',example:'A & B "quoted" <task>'};D.skills.push({id:'../escape',command:'/wrong'});
 const p=page(D);assert.match(p.node('#skill-results').innerHTML,/&lt;script&gt;/);assert.doesNotMatch(p.node('#skill-results').innerHTML,/<script>|escape/);
 delete D.skills;const old=page(D);assert.equal(old.node('#h-skills').innerHTML,'');assert.match(old.node('#admin-skills').innerHTML,/unavailable/);
});

test('copy prompt copies the exact command and example without navigating',async()=>{
 const D=fixture(),p=page(D),s=D.skills[0];
 p.run('globalThis.copiedPrompt="";globalThis.navigator={clipboard:{writeText:async text=>{globalThis.copiedPrompt=text}}}');
 await Promise.all(p.listeners.click.map(fn=>fn({target:{closest:selector=>selector==='[data-skill-copy]'?{dataset:{skillCopy:s.id}}:null}})));
 assert.equal(p.run('copiedPrompt'),s.command+'\n\n'+s.example);
 assert.match(p.node('#copy-status-'+s.id).textContent,/Copied/);assert.equal(p.run('view'),'home');
});

test('the person can ask for nine skills, the ones onboarding and rule 7b name; the rest are references (ALL-204 step 4, ALL-218)',()=>{
 assert.deepEqual(skillCatalog().map(s=>s.id).sort(),['gtm-os-configure','gtm-os-deepdive','gtm-os-document','gtm-os-project','gtm-os-skill','gtm-os-start','gtm-os-sync','gtm-os-todo','gtm-os-use-brain']);
});

test('a brain with a skill of its own gets a "yours" group after the shipped ones; the shipped set is unchanged',()=>{
 const scratch=mkdtempSync(join(tmpdir(),'gtm-skill-yours-')),root=join(scratch,'brain');mkdirSync(join(root,'.agents','skills','gtm-os-weekly-update'),{recursive:true});
 writeFileSync(join(root,'.agents','skills','gtm-os-weekly-update','SKILL.md'),'---\nname: gtm-os-weekly-update\ndescription: "Draft the weekly account update."\nmetadata:\n  short-description: "Weekly update"\n---\n\n# GTM OS skill: Weekly update\n');
 const shipped=skillCatalog(),all=skillCatalog(undefined,root);
 assert.deepEqual(all.slice(0,shipped.length),shipped);
 const yours=all.filter(s=>s.group==='yours');assert.equal(yours.length,1);
 assert.deepEqual(yours[0],{id:'gtm-os-weekly-update',command:'/gtm-os-weekly-update',group:'yours',featured:false,title:'Weekly update',description:'Draft the weekly account update.',example:'/gtm-os-weekly-update'});
 // a user skill id may carry digits (the validator allows them): the page must list it under Your skills
 const D=fixture();D.skills.push({id:'gtm-os-q3-update',command:'/gtm-os-q3-update',group:'yours',featured:false,title:'Q3 update',description:'Draft the Q3 update.',example:'/gtm-os-q3-update'});
 const p=page(D);assert.match(p.node('#skill-results').innerHTML,/gtm-os-q3-update/);assert.match(p.node('#skill-groups').innerHTML,/Your skills/);
 rmSync(scratch,{recursive:true,force:true});
});

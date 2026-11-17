// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { skillCatalog, skillsByRole, SKILL_ROLES } from '../scripts/gtm-brain-render/skill-catalog.mjs';
import { page } from './helpers/dashboard-page.mjs';
const plugin=fileURLToPath(new URL('../',import.meta.url));

// A brain made by setup and rendered by the real renderer; its dashboard data.
function renderedBrain(t,prefix){
 const scratch=mkdtempSync(join(tmpdir(),prefix)),root=join(scratch,'brain-workspace');mkdirSync(root);
 t.after(()=>{ try { rmSync(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:100}); } catch {} });
 const env={...process.env,CODEX_HOME:join(scratch,'profile'),PLUGIN_ROOT:plugin,GTM_BRAIN_NO_OPEN:'1',GTM_BRAIN_NO_COMPILE:'1',GTM_BRAIN_NO_WATCH:'1',GTM_BRAIN_NO_VERSION_CHECK:'1'};
 execFileSync('git',['init','-q',root],{env});
 execFileSync('bash',[join(plugin,'scripts/gtm-brain-setup/setup.sh'),'--company','Skill Fixture','--one-liner','Test workflows','--owner','Alex Example <alex@example.invalid>','--language','en','--dashboard','on-demand'],{cwd:root,env,stdio:'pipe'});
 execFileSync(process.execPath,[join(plugin,'scripts/gtm-brain-render/render.mjs'),root],{env});
 return root;
}
test('the real renderer publishes the skill catalog in both page and data',t=>{
 const root=renderedBrain(t,'gtm-skill-render-');
 const data=JSON.parse(readFileSync(join(root,'work/home/data.json'),'utf8'));
 assert.deepEqual(data.skills,skillCatalog());
 for(const file of ['dashboard.js','dashboard.css'])assert.equal(readFileSync(join(root,'work/home/ui',file),'utf8'),readFileSync(join(plugin,'scripts/gtm-brain-render/ui',file),'utf8'));
 const html=readFileSync(join(root,'work/home/index.html'),'utf8');assert.match(html,/id="admin-skills"/);assert.match(html,/gtmb-sync/);assert.doesNotMatch(html,/__DATA__/);
});

test('the catalog covers exactly the shipped user skills',()=>{
 const shipped=readdirSync(join(plugin,'skills')).filter(id=>existsSync(join(plugin,'skills',id,'SKILL.md'))).sort();
 {
  const skills=skillCatalog();assert.deepEqual(skills.map(s=>s.id).sort(),shipped);
  assert.equal(new Set(skills.map(s=>s.id)).size,skills.length);assert.equal(skills.filter(s=>s.featured).length,4);
  for(const s of skills){assert.equal(s.command,'/'+s.id);assert.ok(s.title&&s.description&&s.example);assert.ok(['mentor','daily','knowledge','projects','setup'].includes(s.group));assert.ok(SKILL_ROLES.includes(s.role),s.id+' has a role');assert.equal(s.group==='mentor',s.role==='mentor',s.id+': the mentor group is the mentor role');
   assert.match(readFileSync(join(plugin,'skills',s.id,'SKILL.md'),'utf8'),new RegExp('^name: '+s.id+'$','m'));
  }
 }
});
test('missing workflows and internal script folders are never advertised',t=>{
 const root=mkdtempSync(join(tmpdir(),'gtm-skill-catalog-'));t.after(()=>{ try { rmSync(root,{recursive:true,force:true}); } catch {} });
 mkdirSync(join(root,'skills/gtmb-sync'),{recursive:true});writeFileSync(join(root,'skills/gtmb-sync/SKILL.md'),'name: gtmb-sync');
 mkdirSync(join(root,'skills/gtmb-project'),{recursive:true});writeFileSync(join(root,'skills/gtmb-project/project.mjs'),'');
 assert.deepEqual(skillCatalog(root).map(s=>s.id),['gtmb-sync']);
});
const fixture=()=>({brain:'/tmp/FDE OS & Łódź #1',name:'FDE OS',generatedAt:'2026-09-13T10:00:00Z',
 contexts:[],names:[],recent:[],loaded:[],questions:[],decisions:[],tools:[],activity:[],projects:[],
 admin:{company:'FDE OS',owner:'alex',team:[],tools:[],body:'',dashboard:'on-demand'},skills:skillCatalog()});
test(`shortcuts and searchable examples open exact workflow drafts`,()=>{
 const D=fixture(),p=page(D);
 const home=p.node('#h-skills').innerHTML;assert.equal((home.match(/<article /g)||[]).length,0);assert.equal(home,'');p.run('show("skills")');assert.equal(p.run('view'),'skills','Help opens from its own link in the header');assert.equal(p.node('#subnav').hidden,true);
 assert.match(p.node('#admin-skills').innerHTML,/press Send/);
 const results=p.node('#skill-results').innerHTML;assert.equal((results.match(/<article /g)||[]).length,D.skills.length);
 const links=[...results.matchAll(/href="([^"]+)"/g)].map(m=>new URL(m[1].replaceAll('&amp;','&')));
 for(let i=0;i<links.length;i++){const url=links[i],s=D.skills[i];assert.equal(url.protocol,'codex:');assert.equal(url.hostname,'threads');assert.equal(url.pathname,'/new');
  assert.equal(url.searchParams.get('path'),D.brain);assert.equal(url.searchParams.get('prompt'),s.command+'\n\n'+s.example);assert.deepEqual([...url.searchParams.keys()],['path','prompt']);}
 p.node('#skill-search').oninput({target:{value:'gtmb-sync'}});
 assert.equal((p.node('#skill-results').innerHTML.match(/<article /g)||[]).length,1);
 assert.ok(p.node('#skill-results').innerHTML.includes(D.skills.find(s=>s.id==='gtmb-sync').example));
 p.run('renderSkillLibrary("zzzz-no-match")');assert.match(p.node('#skill-results').innerHTML,/No matching skills/);
 p.run('show("admin")');p.node('#skill-search').value='gtmb-sync';p.run('refreshPage()');
 const fresh=page(D,{saved:p.saved});assert.equal(fresh.node('#skill-search').value,'gtmb-sync');
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
 assert.match(p.node('#copy-status-'+s.id).textContent,/Copied/);assert.equal(p.run('view'),'home','copying does not navigate away from the front page');
});

test('the person can ask for twenty-nine shipped workflows; internal procedures remain references',()=>{
 assert.deepEqual(skillCatalog().map(s=>s.id).sort(),['gtmb-add-section','gtmb-build-landing-page','gtmb-clay-setup','gtmb-configure','gtmb-deepdive','gtmb-design-system','gtmb-freckle-setup','gtmb-heyreach-setup','gtmb-housekeeping','gtmb-icp','gtmb-interaction','gtmb-market','gtmb-market-research','gtmb-project','gtmb-publish-website','gtmb-rules','gtmb-schema','gtmb-skill','gtmb-start','gtmb-strategy','gtmb-surfer-setup','gtmb-sync','gtmb-todo','gtmb-unit-economics','gtmb-use-brain','gtmb-voice','gtmb-woodpecker-setup','gtmb-workflow','gtmb-zynt-setup']);
});

test('the catalogue is the one place that says which skills are mentors, everyday or setup; mentors lead and say what they fill',()=>{
 const all=skillCatalog(),mentors=skillsByRole('mentor');
 assert.deepEqual(mentors.map(s=>s.id),['gtmb-strategy','gtmb-icp','gtmb-market','gtmb-voice','gtmb-design-system','gtmb-market-research','gtmb-unit-economics','gtmb-deepdive','gtmb-build-landing-page']);
 assert.deepEqual(all.slice(0,mentors.length),mentors,'mentors come first in the catalogue');
 assert.deepEqual(skillsByRole('everyday').map(s=>s.id).sort(),['gtmb-add-section','gtmb-housekeeping','gtmb-interaction','gtmb-project','gtmb-publish-website','gtmb-skill','gtmb-sync','gtmb-todo','gtmb-use-brain','gtmb-workflow']);
 assert.equal(skillsByRole('setup').length,10);assert.ok(skillsByRole('setup').some(s=>s.id==='gtmb-clay-setup'),'a tool setup skill is not a mentor');
 assert.equal(mentors.length+skillsByRole('everyday').length+skillsByRole('setup').length,all.length);
 const starters=['strategy','icp','voice','design-system','market'];
 assert.deepEqual(mentors.filter(s=>s.fills).map(s=>s.fills).sort(),[...starters].sort(),'each of the five base documents has the mentor that fills it');
 for(const s of mentors){assert.ok(s.promise&&s.promise.length>30,s.id+' says its promise');assert.ok(s.fills||s.produces,s.id+' fills a document or says what it produces');assert.ok(Array.isArray(s.reads));for(const r of s.reads)assert.ok(starters.includes(r),s.id+' reads a base document: '+r);
  assert.doesNotMatch(s.promise+(s.produces||''),/[\u2013\u2014]/);}
 for(const s of all.filter(s=>s.role!=='mentor'))assert.equal(s.promise,undefined,s.id+' is not a mentor');
});

test('the Help view and the Overview lead with the mentors: promise, the document and whether it is filled, a prepared chat and no action',t=>{
 const D=JSON.parse(readFileSync(join(renderedBrain(t,'gtm-skill-mentors-'),'work/home/data.json'),'utf8')),docs=D.pillars.configuration.documents;
 assert.deepEqual(docs.filter(d=>d.starter).map(d=>d.state),Array(5).fill('not written'),'setup leaves the five starters unfilled');
 docs.find(d=>d.slug==='strategy').state='draft';docs.find(d=>d.slug==='voice').state='approved';
 const p=page(D),mentors=D.skills.filter(s=>s.role==='mentor');
 const ov=p.node('#ov-mentors').innerHTML;assert.match(ov,/Work with a mentor/);assert.equal((ov.match(/<article /g)||[]).length,mentors.length);
 assert.ok(ov.indexOf('data-mentor="gtmb-icp"')<ov.indexOf('data-mentor="gtmb-strategy"'),'a mentor whose document is not filled yet comes first');
 // the Overview's cards name the document; whether it is written is said once, in Foundations above them
 assert.match(ov,/Fills <b>Ideal customer profile<\/b><\/span>/);assert.match(ov,/Fills <b>Strategy<\/b><\/span>/);assert.doesNotMatch(ov,/data-mentor-doc|not filled yet/);assert.match(ov,/Mentors are how you fill the base documents above/);
 const fd=p.node('#ov-foundations').innerHTML;
 assert.match(fd,/data-fd-doc="icp" data-state="not written"/);assert.match(fd,/data-fd-doc="strategy" data-state="draft"/);assert.match(fd,/data-fd-doc="voice" data-state="approved"/);
 assert.match(ov,/You get: <b>A one-page sourced brief<\/b>/);
 for(const s of mentors){assert.ok(ov.includes(s.promise.replaceAll('&','&amp;')),s.id+' promise on the Overview');
  const href=ov.slice(ov.indexOf('data-mentor="'+s.id+'"')).match(/href="([^"]+)"/)[1].replaceAll('&amp;','&'),url=new URL(href);assert.equal(url.protocol,'codex:');assert.equal(url.searchParams.get('prompt'),s.command+'\n\n'+s.example);}
 assert.doesNotMatch(ov,/<form|<input|onclick=|https?:/,'the Overview group is links to a prepared chat, never an action');
 const results=p.node('#skill-results').innerHTML,groups=p.node('#skill-groups').innerHTML;
 assert.ok(groups.indexOf('Work with a mentor')>0&&groups.indexOf('Work with a mentor')<groups.indexOf('Everyday work'));
 assert.ok(results.indexOf('Work with a mentor')<results.indexOf('Everyday work'),'the mentor group is the first group of the Help view');
 assert.equal((results.match(/data-mentor="/g)||[]).length,mentors.length);assert.match(results,/data-mentor-doc="icp">not filled yet/);
 p.run('skillGroup="mentor";renderSkillLibrary("")');assert.equal((p.node('#skill-results').innerHTML.match(/<article /g)||[]).length,mentors.length);
 // an older data file without roles, or without the pillars, still renders: no group, no badge
 const bare=fixture();for(const s of bare.skills){delete s.role;delete s.promise}const q=page(bare);assert.equal(q.node('#ov-mentors').innerHTML,'');
 const noDocs=page(fixture());assert.match(noDocs.node('#ov-mentors').innerHTML,/Fills <b>Strategy<\/b><\/span>/);assert.doesNotMatch(noDocs.node('#ov-mentors').innerHTML,/data-mentor-doc/);
});

test('a brain with a skill of its own gets a "yours" group after the shipped ones; the shipped set is unchanged',()=>{
 const scratch=mkdtempSync(join(tmpdir(),'gtm-skill-yours-')),root=join(scratch,'brain');mkdirSync(join(root,'.agents','skills','gtm-brain-weekly-update'),{recursive:true});
 writeFileSync(join(root,'.agents','skills','gtm-brain-weekly-update','SKILL.md'),'---\nname: gtm-brain-weekly-update\ndescription: "Draft the weekly account update."\nmetadata:\n  short-description: "Weekly update"\n---\n\n# GTM Brain skill: Weekly update\n');
 const shipped=skillCatalog(),all=skillCatalog(undefined,root);
 assert.deepEqual(all.slice(0,shipped.length),shipped);
 const yours=all.filter(s=>s.group==='yours');assert.equal(yours.length,1);
 assert.deepEqual(yours[0],{id:'gtm-brain-weekly-update',command:'/gtm-brain-weekly-update',group:'yours',featured:false,title:'Weekly update',description:'Draft the weekly account update.',example:'/gtm-brain-weekly-update'});
 // a user skill id may carry digits (the validator allows them): the page must list it under Your skills
 const D=fixture();D.skills.push({id:'gtm-brain-q3-update',command:'/gtm-brain-q3-update',group:'yours',featured:false,title:'Q3 update',description:'Draft the Q3 update.',example:'/gtm-brain-q3-update'});
 const p=page(D);assert.match(p.node('#skill-results').innerHTML,/gtm-brain-q3-update/);assert.match(p.node('#skill-groups').innerHTML,/Your skills/);
 rmSync(scratch,{recursive:true,force:true});
});

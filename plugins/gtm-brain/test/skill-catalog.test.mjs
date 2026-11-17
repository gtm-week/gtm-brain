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
test(`the skills are one searchable list in the Workflows tab; each card opens its exact prepared chat; Help links to it`,()=>{
 const D=fixture(),p=page(D);
 assert.equal(p.node('#h-skills').innerHTML,'');p.run('show("skills")');assert.equal(p.run('view'),'skills','Help opens from its own link in the header');assert.equal(p.node('#subnav').hidden,true);
 const help=p.node('#admin-skills').innerHTML;assert.match(help,/press Send/);assert.doesNotMatch(help,/<article /,'Help lists no skills of its own');
 assert.match(help,new RegExp('data-v="workflows" data-wf-part="skills">Browse all '+D.skills.length+' skills'),'Help leads to the one list');
 const results=p.node('#skill-results').innerHTML,cards=[...results.matchAll(/<article class="sk-card" data-skill="([^"]+)"[\s\S]*?<\/article>/g)];
 assert.equal(cards.length,D.skills.length);assert.equal(new Set(cards.map(c=>c[1])).size,D.skills.length);
 assert.equal(p.node('#skill-count').textContent,D.skills.length+' skills');assert.ok(p.node('#pw-skills').innerHTML.includes('Skills <span class="pl-count">'+D.skills.length+'</span>'));
 for(const [card,id] of cards){const s=D.skills.find(x=>x.id===id),hrefs=[...card.matchAll(/href="([^"]+)"/g)];assert.equal(hrefs.length,1,id+': one link');const url=new URL(hrefs[0][1].replaceAll('&amp;','&'));
  assert.equal(url.protocol,'codex:');assert.equal(url.hostname,'threads');assert.equal(url.pathname,'/new');assert.equal(url.searchParams.get('path'),D.brain);assert.equal(url.searchParams.get('prompt'),s.command+'\n\n'+s.example);assert.deepEqual([...url.searchParams.keys()],['path','prompt']);
  assert.ok(card.includes('<h3>'+s.title.replaceAll('&','&amp;')+'</h3>'),id+': the human title');assert.ok(card.includes('<code>'+s.command+'</code>'));assert.match(card,/>(Open|Update) in Codex<span/);}
 p.node('#skill-search').oninput({target:{value:'gtmb-sync'}});
 assert.equal((p.node('#skill-results').innerHTML.match(/<article /g)||[]).length,1);
 assert.ok(p.node('#skill-results').innerHTML.includes(D.skills.find(s=>s.id==='gtmb-sync').example));assert.equal(p.node('#skill-count').textContent,'1 of '+D.skills.length+' skills');assert.equal(p.node('#skill-clear').hidden,false);
 p.run('renderSkillLibrary("zzzz-no-match")');assert.match(p.node('#skill-results').innerHTML,/No skill matches “zzzz-no-match”\. Try one word for the work/);assert.match(p.node('#skill-results').innerHTML,/data-skill-clear>Show all skills/);
 p.run('renderSkillLibrary("")');assert.equal(p.node('#skill-clear').hidden,true);
 p.run('show("admin")');p.node('#skill-search').value='gtmb-sync';p.run('refreshPage()');
 const fresh=page(D,{saved:p.saved});assert.equal(fresh.node('#skill-search').value,'gtmb-sync');
 assert.equal((fresh.node('#skill-results').innerHTML.match(/<article /g)||[]).length,1);
 assert.doesNotMatch(results,/<form|<input|data-say=|onclick=|https?:/);
});
test('search reads names, commands, promises, documents and examples; a chip counts the cards it shows; mentors come first',()=>{
 const D=fixture(),p=page(D),ids=()=>[...p.node('#skill-results').innerHTML.matchAll(/data-skill="([^"]+)"/g)].map(m=>m[1]);
 const mentors=D.skills.filter(s=>s.role==='mentor').map(s=>s.id);
 assert.deepEqual(ids().slice(0,mentors.length),mentors,'under All the mentors lead, in catalogue order');
 assert.match(p.node('#skill-results').innerHTML,/^<h3 class="sk-cat" data-sk-cat="mentor">Mentors <span class="pl-count">9<\/span><\/h3>/);
 assert.match(p.node('#skill-groups').innerHTML,/^<button[^>]*data-skill-group="all"[^>]*>All<span class="pill-count">29<\/span><\/button><button[^>]*data-skill-group="mentor"[^>]*>Mentors</);
 assert.doesNotMatch(p.node('#skill-groups').innerHTML,/Your skills/,'no chip for a category with nothing in it');
 p.node('#skill-search').oninput({target:{value:'voice'}});
 assert.ok(ids().includes('gtmb-voice'),'the tone of voice mentor');assert.ok(!ids().includes('gtmb-sync'),'not an unrelated skill');
 p.node('#skill-search').oninput({target:{value:'Acme Northfold'}});assert.deepEqual(ids(),['gtmb-market'],'every word, from the example sentence');
 p.node('#skill-search').oninput({target:{value:'/gtmb-clay'}});assert.deepEqual(ids(),['gtmb-clay-setup'],'the command');
 for(const [cat,label] of [['mentor','Mentors'],['everyday','Everyday'],['setup','Set up and connect']]){
  p.run('skillGroup='+JSON.stringify(cat)+';renderSkillLibrary("")');
  const n=Number(p.node('#skill-groups').innerHTML.match(new RegExp('data-skill-group="'+cat+'"[^>]*>'+label+'<span class="pill-count">(\\d+)<'))[1]);
  assert.ok(n>0);assert.equal(ids().length,n,label+': the chip says the cards shown');
  assert.equal((p.node('#skill-results').innerHTML.match(new RegExp('data-skill-cat="'+cat+'"','g'))||[]).length,n);}
 p.run('skillGroup="mentor";renderSkillLibrary("clay")');assert.match(p.node('#skill-results').innerHTML,/Nothing in Mentors matches “clay”\..*Show all categories \(1\)/s);
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

test('the Overview has no mentor grid, only a line to the skills; a mentor card says its promise, its document and whether it is written',t=>{
 const D=JSON.parse(readFileSync(join(renderedBrain(t,'gtm-skill-mentors-'),'work/home/data.json'),'utf8')),docs=D.pillars.configuration.documents;
 assert.deepEqual(docs.filter(d=>d.starter).map(d=>d.state),Array(5).fill('not written'),'setup leaves the five starters unfilled');
 docs.find(d=>d.slug==='strategy').state='draft';docs.find(d=>d.slug==='voice').state='approved';
 const p=page(D),mentors=D.skills.filter(s=>s.role==='mentor');
 // the Overview: Foundations, then one quiet line to the Workflows tab's Skills, and no card of a skill
 assert.equal(p.node('#ov-mentors').innerHTML,'','no mentor grid on the Overview');
 const line=p.node('#ov-skills').innerHTML;assert.match(line,/<button type="button" class="linkbtn" data-v="workflows" data-wf-part="skills">All skills, mentors first/);assert.doesNotMatch(line,/<article/);
 const fd=p.node('#ov-foundations').innerHTML;
 assert.match(fd,/data-fd-doc="icp" data-state="not written"/);assert.match(fd,/data-fd-doc="strategy" data-state="draft"/);assert.match(fd,/data-fd-doc="voice" data-state="approved"/);
 // the base document's own card links to the mentor that writes the next one
 assert.match(decodeURIComponent(fd.match(/class="fd-go" href="([^"]+)">Write Ideal customer profile in Codex/)[1]),/prompt=\/gtmb-icp\n\n/);
 // the Skills cards
 const results=p.node('#skill-results').innerHTML,card=id=>results.slice(results.indexOf('data-skill="'+id+'"')).split('</article>')[0];
 assert.equal((results.match(/data-mentor="/g)||[]).length,mentors.length);
 assert.match(card('gtmb-icp'),/Fills <b>Ideal customer profile<\/b> <span class="pl-state missing" data-mentor-doc="icp">not written<\/span>/);assert.match(card('gtmb-icp'),/>Open in Codex<span/);
 assert.match(card('gtmb-strategy'),/data-mentor-doc="strategy">written, draft</);assert.match(card('gtmb-strategy'),/aria-label="Update in Codex: Run the strategic intake">Update in Codex<span/);
 assert.match(card('gtmb-voice'),/data-mentor-doc="voice">written, approved</);assert.match(card('gtmb-voice'),/>Update in Codex<span/);
 assert.match(card('gtmb-deepdive'),/You get <b>A one-page sourced brief<\/b>/);assert.match(card('gtmb-deepdive'),/Reads Ideal customer profile <span class="pl-age">\(not written\)<\/span>/);
 for(const s of mentors){assert.ok(card(s.id).includes(s.promise.replaceAll('&','&amp;')),s.id+' promise on its card');
  const url=new URL(card(s.id).match(/href="([^"]+)"/)[1].replaceAll('&amp;','&'));assert.equal(url.protocol,'codex:');assert.equal(url.searchParams.get('prompt'),s.command+'\n\n'+s.example,'update or open: the same prepared chat');}
 p.run('skillGroup="mentor";renderSkillLibrary("")');assert.equal((p.node('#skill-results').innerHTML.match(/<article /g)||[]).length,mentors.length);
 // an older data file without roles, or without the pillars, still renders: no badge, the line stays
 const bare=fixture();for(const s of bare.skills){delete s.role;delete s.promise}const q=page(bare);assert.equal(q.node('#ov-mentors').innerHTML,'');assert.match(q.node('#skill-results').innerHTML,/data-sk-cat="mentor"/);
 const noDocs=page(fixture()).node('#skill-results').innerHTML;assert.match(noDocs,/Fills <b>Strategy<\/b><\/span>/);assert.doesNotMatch(noDocs,/data-mentor-doc|Update in Codex/);
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

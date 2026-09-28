process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// Execute the actual dashboard client with a minimal DOM to test navigation and refresh state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { page } from './helpers/dashboard-page.mjs';
const question=(id,context)=>({id,context,at:'2026-09-11T10:00:00.000Z',kind:'question',tags:['brain-question'],content:'Which fact should we remember?',authors:['alex'],people:[],tools:[],actions:[],source:[]});
const context=(slug,id)=>({slug,title:slug,label:slug,status:'active',summary:'Recorded fact.',now:'',rule:'',whenLoaded:'',related:[],tools:[],people:[],names:[],memories:[question(id,slug)],stored:1,loaded:true});
const data=()=>({brain:'/tmp/Brain & team/Zażółć #1',generatedAt:'2026-09-11T10:00:00.000Z',contexts:[context('market','m_aaaaaa'),context('icp','m_bbbbbb')],questions:[question('m_aaaaaa','market'),question('m_bbbbbb','icp')],decisions:[],names:[],recent:[],loaded:['market'],tools:[],admin:{company:'Example',owner:'alex',team:[],tools:[],body:'Company info',dashboard:'always'},activity:[],merges:[{a:'Acme',b:'Acme Ltd',kind:'company'}],proposal:{diff:['- old','+ new']},interaction:{title:'Move deal',tool:'attio',name:'move_deal',inputs:['deal'],operation:'Move deal',context:'icp',records:'Moved deal'},onboarding:{status:'pending',steps:[]}});
test('older context pages append to the visible list and retain usable citations', async () => {
 const D=data();D.contexts[0].history=['history/market/0.json','history/market/1.json'];D.contexts[0].historyPage=0;D.contexts[0].totalMemories=2;
 const older={...question('m_cccccc','market'),content:'Earlier source evidence.'};
 const p=page(D,{fetcher:async()=>({ok:true,json:async()=>({memories:[older]})})});
 const button={disabled:false,dataset:{history:'market',step:'1'}};
 await Promise.all(p.listeners.click.map(fn=>fn({target:{closest:selector=>selector==='[data-history]'?button:null}})));
 assert.equal(p.run('D.contexts[0].historyPage'),1);assert.equal(p.run('D.contexts[0].memories.length'),2);
 assert.match(p.node('#ch-pane').innerHTML,/Earlier source evidence/);
 assert.match(p.run('citePill("m_cccccc")'),/data-mem="m_cccccc"/);
});
test(`the complete viewer has no write controls and opens a scoped draft in the brain folder`,()=>{
 const D=data();const p=page(D);
 const rendered=[...p.nodes.values()].map(n=>n.innerHTML).join('\n');assert.doesNotMatch(rendered,/<form|data-say=|>Add<|>Answer<|>Drop<|>Approve</);
 assert.match(rendered,/Move deal/);assert.match(rendered,/data-exact/);
 let link=new URL(p.run('chatDraft().href'));assert.equal(link.protocol,'codex:');assert.equal(link.hostname,'threads');assert.equal(link.pathname,'/new');assert.equal(link.searchParams.get('path'),D.brain);
 assert.deepEqual([...link.searchParams.keys()],['path','prompt']);
 assert.match(link.searchParams.get('prompt'),/open questions|otwarte pytania/);assert.doesNotMatch(link.searchParams.get('prompt'),/m_aaaaaa|m_bbbbbb|AGENTS|retracts/);
 p.run('contextDirectory=false;chan="icp";show("contexts");updateChatLink()');link=new URL(p.run('chatDraft().href'));
 assert.match(link.searchParams.get('prompt'),/"icp"/);assert.match(link.searchParams.get('prompt'),/open questions|otwarte pytania/);assert.doesNotMatch(link.searchParams.get('prompt'),/market/);
 p.node('#gq').value='Artur <script> & Attio';p.run('show("search");updateChatLink()');
 assert.match(new URL(p.run('chatDraft().href')).searchParams.get('prompt'),/Artur <script> & Attio/);
});

test(`a context shows one instructions field and keeps its generated guidance`,()=>{
 const D=data();
 D.contexts[0].rule='Work on our offer here. Keep <competitor> pricing in Market.';
 D.contexts[0].now='Use the release checklist to verify approval (m_aaaaaa).';
 D.contexts[0].whenLoaded=D.contexts[0].rule+'\n\nWorking guidance: '+D.contexts[0].now;
 const p=page(D);p.run('chan="market";renderChannels()');
 const html=p.node('#ch-pane').innerHTML;
 assert.match(html,/<b>Instructions<\/b>/);
 assert.match(html,/Keep &lt;competitor&gt; pricing in Market/);
 assert.match(html,/Use the release checklist/);
 assert.match(html,/<h3>Working guidance<\/h3>/);
 assert.match(html,/data-mem="m_aaaaaa"/);
 assert.doesNotMatch(html,/<b>scope<\/b>|<b>rule<\/b>|<b>Next:<\/b>|what belongs here/);
 assert.equal(p.run('D.contexts[0].now'),D.contexts[0].now);
 p.run('D.contexts[0].now="";renderChannels()');
 assert.doesNotMatch(p.node('#ch-pane').innerHTML,/<h3>Working guidance<\/h3>|<h3>Wskazówki do pracy<\/h3>|Use the release checklist/);
});

test('a revision refreshes even during search, preserves browsing state and restores it with fresh records',async()=>{
 const D=data();const p=page(D,{live:true});await new Promise(r=>setImmediate(r));
 p.node('#gq').value='remember';p.node('#q').value='alex';p.run('show("search");chan="icp";entQ="Acme";entFilter="company";document.activeElement=document.querySelector("#gq")');
 p.streams[0].events.revision({data:JSON.stringify({generatedAt:'2026-09-11T10:01:00.000Z'})});
 assert.equal(p.reloads,1);const st=JSON.parse(p.saved.get('gtm-refresh:'+D.brain));assert.equal(st.gq,'remember');assert.equal(st.q,'alex');assert.equal(st.chan,'icp');assert.equal(st.focus,'gq');
 const updated=data();updated.generatedAt='2026-09-11T10:01:00.000Z';updated.questions=[];updated.contexts.forEach(c=>c.memories=[]);
 const fresh=page(updated,{saved:p.saved});assert.equal(fresh.node('#gq').value,'remember');assert.equal(fresh.run('view'),'search');assert.equal(fresh.run('chan'),'icp');assert.equal(fresh.run('entQ'),'Acme');assert.equal(fresh.scroll,420);assert.equal(fresh.saved.has('gtm-refresh:'+D.brain),false);
 assert.doesNotMatch(new URL(fresh.run('chatDraft().href')).searchParams.get('prompt'),/m_aaaaaa|m_bbbbbb/);
 assert.equal(fresh.run('entFilter'),'organization','a saved legacy company filter survives the ontology upgrade');
});

test(`entity directory hides subtypes and distinguishes team membership`,()=>{
 const D=data();
 D.names=[['Acme','organization','company'],['Acme Sales','organization','team'],['Widget','product',null],['Ann Lee','person',null]].map(([name,kind,subtype])=>({name,kind,subtype,aliases:[],emails:[],contexts:[],mentions:0,team:name==="Ann Lee"}));
 const p=page(D);p.run('entFilter="organization";renderEntities()');
 const html=p.node('#people-list').innerHTML;
 assert.match(html,/Organizations|Organizacje/);assert.match(html,/Acme Sales/);
 assert.match(html,/organization/);
 assert.doesNotMatch(html,/\(company\)|\(team\)|\(firma\)|\(zespół\)/);
 assert.equal(D.names[0].subtype,'company');assert.equal(D.names[1].subtype,'team');
 p.run('entFilter="person";renderEntities()');
 assert.match(p.node('#people-list').innerHTML,/Team member/);
 assert.doesNotMatch(html,/data-entity="Widget"|data-entity="Ann Lee"/);
});

test('polling recovers missed events without suppressing updates during typing and reports connection loss',async()=>{
 const D=data();let reply=D,offline=false;
 const p=page(D,{live:true,fetcher:async()=>{if(offline)throw Error('offline');return{ok:true,json:async()=>reply}}});await new Promise(r=>setImmediate(r));
 offline=true;await p.intervals[0]();assert.match(p.node('#freshness').textContent,/Connection lost\. Dashboard last refreshed: /);
 offline=false;p.node('#gq').value='keep searching';p.run('document.activeElement=document.querySelector("#gq")');reply={...D,generatedAt:'2026-09-11T10:02:00.000Z'};
 await p.intervals[0]();assert.equal(p.reloads,1);
});

test(`project browsing filters central notes and hands off the selected folder`,()=>{
 const D=data();
 D.projects=[{slug:'curriculum',title:'Curriculum',path:'/tmp/My project & team/Zażółć #1',loaded:['market'],contexts:['market'],pointer:true,notes:1},{slug:'website',title:'Website',path:'/tmp/website',loaded:['icp'],contexts:['icp'],pointer:true,notes:1}];
 D.contexts[0].memories[0].tags.push('project:curriculum');D.questions[0].tags.push('project:curriculum');
 D.contexts[1].memories[0].tags.push('project:website');D.questions[1].tags.push('project:website');
 const p=page(D);p.run('projectSlug="curriculum";renderProject();show("projects");updateChatLink()');
 assert.match(p.node('#project-detail').innerHTML,/data-id="m_aaaaaa"/);assert.doesNotMatch(p.node('#project-detail').innerHTML,/data-id="m_bbbbbb"/);
 let link=new URL(p.run('chatDraft().href'));
 assert.equal(link.searchParams.get('path'),D.projects[0].path);
 assert.match(link.searchParams.get('prompt'),/"Curriculum"/);assert.match(link.searchParams.get('prompt'),/open questions|otwarte pytania/);assert.doesNotMatch(link.searchParams.get('prompt'),/Website/);
 assert.doesNotMatch(link.searchParams.get('prompt'),/tool call|brain.*path|retracts/);
 p.run('projectSlug="website";renderProject();updateChatLink();refreshPage()');
 const fresh=page(D,{saved:p.saved});
 assert.equal(fresh.run('projectSlug'),'website');assert.equal(fresh.run('view'),'projects');
 assert.equal(new URL(fresh.run('chatDraft().href')).searchParams.get('path'),'/tmp/website');
 const broken=structuredClone(D);broken.projects[1].pointer=false;
 fresh.run('refreshPage()');const repaired=page(broken,{saved:fresh.saved});
 link=new URL(repaired.run('chatDraft().href'));assert.equal(link.searchParams.get('path'),D.brain);
 assert.match(link.searchParams.get('prompt'),/needs repair|wymaga naprawy/);assert.match(link.searchParams.get('prompt'),/\/tmp\/website/);
 repaired.run('show("home");updateChatLink()');assert.equal(new URL(repaired.run('chatDraft().href')).searchParams.get('path'),D.brain);
});

test(`entity attachments show readable fields, file links and collapsed history`,()=>{
 const D=data();
 const asset={id:'m_cccccc',context:'market',entity:'Demo',label:'Logo <sample>',role:'primary-logo',status:'approved',active:true,authors:['alex'],at:'2026-09-11T10:00:00.000Z',preview:true,url:'/assets/market/m_cccccc',revision:'1',ambiguous:true,local:false};
 D.assets=[asset,{...asset,id:'m_dddddd',label:'Previous logo',status:'retired',active:false,history:'replaced'},{...asset,id:'m_eeeeee',label:'Missing photo',context:'icp',preview:false,url:null,issue:'missing',ambiguous:false}];
 const p=page(D),html=p.run('entityAssets("Demo")');
 assert.match(html,/Logo &lt;sample&gt;/);assert.match(html,/primary logo/);assert.match(html,/<img loading="lazy"/);assert.match(html,/preview=1/);
 assert.match(html,/<details class="fold"><summary>/);assert.doesNotMatch(html,/<details[^>]* open|data-say|<form|>m_cccccc</);
 assert.ok(html.includes('Several approved'));
 assert.ok(html.includes('File unavailable'));
 p.run('entContext="market"');assert.doesNotMatch(p.run('entityAssets("Demo")'),/Missing photo/);
 p.run('entName="Demo";show("people");updateChatLink()');const prompt=new URL(p.run('chatDraft().href')).searchParams.get('prompt');
 assert.match(prompt,/"Demo"/);assert.doesNotMatch(prompt,/attachment memories|open questions|otwarte pytania/);
});

test(`review notices distinguish older summaries from edited or damaged files`,()=>{
 const cases=[
  {statuses:['untracked'],heading:'Summary tracking needs attention'},
  {statuses:['review'],heading:'Summary needs updating due to manual editing'},
  {statuses:['untracked','review','missing','invalid'],heading:'Context files need review'},
 ];
 for(const {statuses,heading} of cases){
  const D=data();
  D.manualEdits=statuses.map((status,i)=>({slug:i===0?'market':'icp',status,hash:'example'}));
  const p=page(D),html=p.node('#manual-edits').innerHTML;
  assert.ok(html.includes(`<b>${heading}</b>`),html);
  if(statuses.includes('untracked'))assert.ok(html.includes('Tracking information is missing or inconsistent'),html);
  if(statuses.every(s=>s==='untracked')){
   assert.doesNotMatch(html,/Manual edits|Your edits|Ręczne zmiany|Twoje zmiany/);
   assert.ok(html.includes('does not mean'),html);
  }
  const prompt=new URL(p.run('chatDraft().href')).searchParams.get('prompt');
  assert.doesNotMatch(prompt,/Manual Markdown edits awaiting review/);
  assert.match(prompt,/summary notices|powiadomienia/);
  assert.doesNotMatch(prompt,/reviewed_cover|untracked|\[\]|m_aaaaaa/);
 }
});

test(`dashboard refresh, compilation failure and damaged files have distinct recovery messages`,async()=>{
 const D=data();
 D.compile={state:'failed',gaveUp:true,contexts:'market',attempt:3,tries:3};
 D.manualEdits=[{slug:'icp',status:'invalid',reason:'summary must be text <script>alert(1)</script>'}];
 const p=page(D,{live:true});await new Promise(r=>setImmediate(r));
 assert.ok(p.node('#freshness').textContent.startsWith('Dashboard refreshed: '));
 const notice=p.node('#compile-notice').innerHTML;
 assert.ok(notice.includes('Your notes are saved'));
 assert.ok(notice.includes('retry'));
 assert.match(p.node('#manual-edits').innerHTML,/icp.*summary must be text &lt;script&gt;/);
 assert.doesNotMatch(p.node('#manual-edits').innerHTML,/<script>/);
 const prompt=new URL(p.run('chatDraft().href')).searchParams.get('prompt');
 assert.match(prompt,/retry if needed|ponowić ją/);
 assert.doesNotMatch(prompt,/attempt|tries|manual-edit protection/);
 for(const compile of [undefined,{state:'running',gaveUp:false},{state:'failed',gaveUp:false},{state:'done',gaveUp:false}]){
  const fresh=page({...D,compile});assert.equal(fresh.node('#compile-notice').innerHTML,'');
  assert.doesNotMatch(new URL(fresh.run('chatDraft().href')).searchParams.get('prompt'),/The summary update failed|Aktualizacja podsumowania nie powiodła się/);
 }
 assert.ok(page(D).node('#freshness').textContent.startsWith('Saved dashboard copy.'));
});

test(`optional chat stays short and excludes unrelated attention items`,()=>{
 const D=data();
 D.manualEdits=[{slug:'market',status:'review',hash:'opaque'}];
 D.compile={state:'failed',gaveUp:true,contexts:'market'};
 const p=page(D);const prompt=()=>new URL(p.run('chatDraft().href')).searchParams.get('prompt');
 p.run('show("projects");updateChatLink()');
 assert.equal(prompt(),"Use GTM OS. Let's discuss my projects.\n\nHelp me create or link a project.");
 p.run('contextDirectory=false;chan="icp";show("contexts");updateChatLink()');
 assert.doesNotMatch(prompt(),/market|summary notices|retry|powiadomienia|ponowić/);
 assert.match(prompt(),/open questions|otwarte pytania/);
 p.node('#gq').value='A quoted "topic"';p.run('show("search");updateChatLink()');
 assert.match(prompt(),/search results|wyniki wyszukiwania/);assert.doesNotMatch(prompt(),/open questions|summary notices|otwarte pytania|powiadomienia/);
 const quiet=data();quiet.questions=[];quiet.proposal=null;quiet.interaction=null;
 const q=page(quiet);const text=new URL(q.run('chatDraft().href')).searchParams.get('prompt');
 assert.ok(text.length<100);assert.equal(text.split('\n\n').length,1);
 assert.ok(q.run('chatDraft().href'));
});

test(`empty lists hide unusable controls and populated lists retain search recovery`,()=>{
 const D=data();D.contexts.forEach(c=>c.memories=[]);D.questions=[];
 const empty=page(D);
 assert.equal(empty.node('#project-picker').hidden,false);
 assert.match(empty.node('#project-detail').innerHTML,/No projects linked|Brak podłączonych projektów/);
 assert.equal(empty.node('#memory-filter').hidden,true);
 assert.match(empty.node('#mem-list').innerHTML,/No notes yet|Nie ma jeszcze notatek/);
 assert.doesNotMatch(empty.node('#people-list').innerHTML,/<input|<button/);
 assert.equal(empty.node('#people-toolbar').hidden,true);
 // A newly linked project restores the complete picker; removing the last link hides it again.
 empty.run('D.projects=[{slug:"website",title:"Website",path:"/tmp/website",contexts:[],loaded:[],pointer:true}];renderProject()');
 assert.equal(empty.node('#project-picker').hidden,false);
 assert.match(empty.node('#project-select').innerHTML,/Website/);
 empty.run('D.projects=[];renderProject()');assert.equal(empty.node('#project-picker').hidden,false);
 const populated=data();
 populated.names=[{name:'Example',kind:'company',aliases:[],emails:[],contexts:[],mentions:0}];
 const full=page(populated);
 assert.equal(full.node('#memory-filter').hidden,false);
 full.node('#q').value='does-not-exist';full.run('mems()');
 assert.equal(full.node('#memory-filter').hidden,false);
 assert.match(full.node('#mem-list').innerHTML,/Nothing matches|Brak wyników/);
 full.node('#q').value='';full.run('mems()');assert.match(full.node('#mem-list').innerHTML,/Which fact/);
 full.run('entQ="does-not-exist";renderEntities()');
 assert.equal(full.node('#people-toolbar').hidden,false);
 assert.match(full.node('#people-toolbar').innerHTML,/<input id="entity-search" type="search"/);
 full.run('entQ="";renderEntities()');assert.match(full.node('#people-list').innerHTML,/Example/);
});

test(`long questions lead with the exact question and preserve the full record in closed details`,()=>{
 const D=data();D.admin.team=[{handle:'alex',name:'Alex Example'}];
 const content='Confirm the six reviewed context versions and resume their summary updates? Preserve every standing rule. Reviewed versions: icp='+ 'a'.repeat(64)+'; market='+ 'b'.repeat(64)+'. <script>not markup</script>';
 D.questions=[{...question('m_cccccc','market'),content}];
 const original=JSON.stringify(D.questions),p=page(D),html=p.node('#dq-questions').innerHTML;
 assert.match(html,/<h3>Confirm the six reviewed context versions and resume their summary updates\?<\/h3>/);
 assert.doesNotMatch(html.split('<details')[0],/aaaaaa|bbbbbb|<script>/);
 assert.match(html,/<details class="fold"><summary>/);assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
 assert.ok(html.includes('a'.repeat(64)));assert.ok(html.includes('b'.repeat(64)));
 assert.match(html,/&lt;script&gt;not markup&lt;\/script&gt;/);
 assert.match(html,/Alex Example/);assert.equal(JSON.stringify(D.questions),original);
 assert.ok(p.node('#h-input').innerHTML.includes(html));
 assert.doesNotMatch(p.run('questionCard(D.contexts[0].memories[0])'),/<details/);
 const technical=p.run('questionCard({...D.questions[0],content:"Confirm "+"a".repeat(64)+"?"})');
 assert.doesNotMatch(technical.split('<details')[0],/aaaaaa/);
 assert.match(p.run('citePill("m_aaaaaa")'),/aria-hidden="true"> · <\/span>/);
});

test(`reviewed versions expand in place without navigation or changing the source record`,()=>{
 const D=data();
 const text='Keep the approved guidance. Reviewed versions: icp='+ 'a'.repeat(64)+'; market='+ 'b'.repeat(64)+'. Keep this final instruction.';
 D.contexts[0].memories[0].content=text;D.questions=[D.contexts[0].memories[0]];
 const p=page(D),html=p.run('cite(D.questions[0].content)');
 assert.match(html,/data-technical aria-expanded="false"/);assert.match(html,/class="technical-values" hidden/);
 assert.ok(html.includes('Keep this final instruction.'));assert.ok(html.includes('a'.repeat(64)));
 assert.doesNotMatch(html,/<a /);assert.equal(p.run('D.questions[0].content'),text);
 const citation=p.run('cite(D.questions[0].id)');
 assert.doesNotMatch(citation,/data-technical/,'citation tooltip remains plain escaped text');
 assert.ok(citation.includes('Reviewed versions: icp='));
 const values={hidden:true},attributes={},button={nextElementSibling:values,setAttribute:(key,value)=>attributes[key]=value};
 const click=()=>p.listeners.click.forEach(fn=>fn({target:{closest:selector=>selector==='[data-technical]'?button:null}}));
 click();assert.equal(values.hidden,false);assert.equal(attributes['aria-expanded'],'true');
 click();assert.equal(values.hidden,true);assert.equal(attributes['aria-expanded'],'false');assert.equal(p.reloads,0);
 assert.doesNotMatch(p.run('cite("Reviewed versions: check with the team before proceeding.")'),/data-technical/);
});

test(`copying a source reports success or provides a selectable fallback without navigating`,async()=>{
 const D=data();const p=page(D);let copied=null;
 p.ui.navigator={clipboard:{writeText:async value=>{copied=value}}};
 const status={textContent:''},button={dataset:{threadCopy:'codex://threads/known-task'},nextElementSibling:status};
 const click=async()=>{for(const fn of p.listeners.click)await fn({target:{closest:s=>s==='[data-thread-copy]'?button:null}})};
 await click();assert.equal(copied,button.dataset.threadCopy);assert.match(status.textContent,/Copied|Skopiowano/);assert.equal(p.reloads,0);
 p.ui.navigator.clipboard.writeText=async()=>{throw Error('denied')};await click();
 assert.match(status.textContent,/Copy this link|Skopiuj ten link/);assert.ok(status.textContent.includes(button.dataset.threadCopy));
 assert.doesNotMatch(status.textContent,/Copied|Skopiowano/);assert.equal(p.reloads,0);
});

test(`archived entities have a separate directory filter and remain in viewer data`,()=>{
 const D=data();D.merges=[];
 D.names=[['Current Person','active'],['Former Person','archived']].map(([name,status])=>({name,status,kind:'person',aliases:[],emails:[],contexts:[],mentions:0}));
 const p=page(D);p.run('renderEntities()');
 assert.match(p.node('#people-list').innerHTML,/data-entity="Current Person"/);
 assert.doesNotMatch(p.node('#people-list').innerHTML,/data-entity="Former Person"/);
 p.run('entFilter="archived";renderEntities()');
 assert.match(p.node('#people-list').innerHTML,/data-entity="Former Person"/);
 assert.doesNotMatch(p.node('#people-list').innerHTML,/data-entity="Current Person"/);
 assert.equal(p.run('D.names.length'),2);
 assert.match(p.node('#people-filters').innerHTML,/Archived/);
});

test('context feed deduplicates pages, preserves progress on error and can retry',async()=>{
 const D=data();D.contexts[0].history=['history/market/0.json','history/market/1.json','history/market/2.json'];
 let calls=0,fail=true;
 const p=page(D,{fetcher:async()=>{calls++;if(fail)throw new Error('offline');return {ok:true,json:async()=>({memories:[question('m_aaaaaa','market'),question('m_cccccc','market')]})}}});
 await p.run('loadContextHistory("market")');
 assert.equal(p.run('D.contexts[0].historyPage||0'),0);
 assert.equal(p.run('D.contexts[0].historyError'),true);
 assert.match(p.node('#ch-pane').innerHTML,/Retry/);
 fail=false;await p.run('loadContextHistory("market")');
 assert.equal(p.run('D.contexts[0].memories.length'),2);
 assert.equal(p.run('D.contexts[0].historyPage'),1);
 await p.run('loadContextHistory("market")');
 assert.equal(p.run('D.contexts[0].memories.length'),2);
 assert.match(p.node('#ch-pane').innerHTML,/All memories loaded/);
 await p.run('loadContextHistory("market")');assert.equal(calls,3);
});

test('the attention view lists workflow runs with their steps, read-only, and says when there are none', () => {
  const D = data();
  let ui = page(D);   // renderQuestions() runs when the client loads, so the panel is filled without navigating
  assert.match(ui.node('#dq-runs').innerHTML, /No workflow runs yet/);
  D.runs = [{ id: 'outbound-2026-09-28-q4', workflow: 'outbound', context: 'offer', contextTitle: 'Our offer', startedAt: '2026-09-28T09:00:00.000Z', by: 'alex', brief: '', ended: null,
    steps: [{ n: 1, status: 'done', due: null }, { n: 2, status: 'pending', due: '2026-10-08' }], open: null, current: { n: 2, status: 'pending', due: '2026-10-08' } }];
  ui = page(D);
  const html = ui.node('#dq-runs').innerHTML;
  assert.match(html, /Workflow runs · 1/); assert.match(html, /outbound-2026-09-28-q4 · Our offer/); assert.match(html, /1 done/); assert.match(html, /2 pending · 2026-10-08/);
  assert.doesNotMatch(html, /<button|<input|<form/, 'read-only');
});

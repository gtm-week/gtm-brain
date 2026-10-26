import {test} from 'node:test';
import assert from 'node:assert/strict';
import {page} from './helpers/dashboard-page.mjs';
import {readFileSync} from 'node:fs';
const memory=(id,content,context='market')=>({id,content,context,at:'2026-09-14T10:00:00Z',kind:'note',authors:['alex'],people:[],tools:[],tags:[],source:[],actions:[]});
const context=(slug,memories=[])=>({slug,title:slug,label:slug,status:'active',summary:'Evidence about '+slug+'.',rule:'Knowledge about '+slug,now:'',whenLoaded:'',people:[],tools:[],related:[],names:[],memories,stored:memories.length,totalMemories:memories.length,loaded:true});
const fixture=()=>({brain:'/tmp/Company & Team',generatedAt:'2026-09-14T10:00:00Z',contexts:[context('market',[memory('m_aaaaaa','Recent research')])],names:[],recent:[],loaded:['market'],questions:[],decisions:[],tools:[],activity:[],projects:[],admin:{company:'Test Co',owner:'alex',team:[{handle:'alex',name:'Alex Example'}],tools:[],body:'Company profile',dashboard:'on-demand'}});
const click=(p,selector,button)=>Promise.all(p.listeners.click.map(fn=>fn({target:{closest:sel=>sel===selector?button:null}})));
test(`navigation has four primary destinations and classifies details consistently`,()=>{
 const D=fixture();const p=page(D);
 assert.equal((p.node('#nav').innerHTML.match(/<button /g)||[]).length,3);
 assert.doesNotMatch(p.node('#nav').innerHTML,/data-v="(?:contexts|projects|people|customers|meetings|questions|admin)"/);
 p.run('show("customers")');assert.match(p.node('#nav').innerHTML,/data-v="explore"[^>]*aria-current="page"/);
 p.run('show("contexts")');assert.match(p.node('#nav').innerHTML,/data-v="explore"[^>]*aria-current="page"/);
 assert.match(p.node('#location').innerHTML,/data-v="explore"/);
 assert.match(p.node('#location').innerHTML,/data-v="explore"/);
 p.run('show("projects")');assert.equal(p.node('#workspace-link').getAttribute('aria-current'),'false');assert.match(p.node('#nav').innerHTML,/data-v="home"[^>]*aria-current="page"/);
 assert.match(p.node('#explore-grid').innerHTML,/data-v="contexts"/);assert.match(p.node('#explore-grid').innerHTML,/data-v="people"/);assert.match(p.node('#explore-grid').innerHTML,/data-v="meetings"/);
 assert.equal((p.node('#explore-grid').innerHTML.match(/class="explore-count"/g)||[]).length,4);
 assert.match(p.node('#explore-grid').innerHTML,/data-v="contexts"[^>]*>[^<]*<strong>[^<]*<span class="explore-count">1<\/span>/);
 assert.match(p.node('#context-directory').innerHTML,/data-ch="market"/);
 assert.equal(p.run('D.loaded.join(",")'),'market');
 for(const [view,en] of [['explore','company knowledge'],['skills','ways to work'],['meetings','recorded meetings'],['customers','customer relationships']]){
  p.run('show('+JSON.stringify(view)+');updateChatLink()');
  assert.ok(new URL(p.run('chatDraft().href')).searchParams.get('prompt').includes(en));
 }
});

test('working folders remain explicitly linked to knowledge contexts and preserve Codex destination',()=>{
 const D=fixture();D.projects=[{slug:'research',title:'Research',path:'/tmp/Research & team',contexts:['market'],loaded:['market'],notes:0,pointer:true}];
 const p=page(D);assert.match(p.node('#workspace-folders').innerHTML,/Projects are the folders you open in Codex/);
 assert.match(p.node('#ch-pane').innerHTML,/Used in working folders/);assert.match(p.node('#ch-pane').innerHTML,/data-project="research"/);
 p.run('projectSlug="research";renderProject();show("projects");updateChatLink()');assert.match(p.node('#project-detail').innerHTML,/data-ch="market"/);
 assert.equal(new URL(p.run('chatDraft().href')).searchParams.get('path'),'/tmp/Research & team');
 p.run('show("contexts");updateChatLink()');assert.equal(new URL(p.run('chatDraft().href')).searchParams.get('path'),'/tmp/Research & team');
 assert.equal(p.run('D.loaded.join(",")'),'market');
});

test('overview bounds content, keeps full questions accessible and uses human names only for generated personal titles',()=>{
 const D=fixture();D.contexts=Array.from({length:16},(_,i)=>context('topic-'+i));
 D.contexts.push({...context('personal-alex'),title:'Personal: alex',label:'Personal: alex'});
 D.questions=Array.from({length:9},(_,i)=>({...memory('m_'+String(i).padStart(6,'0'),'Question '+i+'?'),kind:'question',tags:['brain-question']}));
 const p=page(D);assert.equal((p.node('#context-directory').innerHTML.match(/class="context-row"/g)||[]).length,17);
 const template=readFileSync(new URL('../scripts/gtm-brain-render/home.template.html',import.meta.url),'utf8');
 assert.doesNotMatch(template,/id="h-working"|Your contexts|Twoje konteksty/);
 assert.equal((p.node('#h-input').innerHTML.match(/class="question-card"/g)||[]).length,3);
 assert.match(p.node('#dq-questions').innerHTML,/Question 8/);
 assert.equal(p.run('contextTitle(D.contexts[16])'),'Personal: Alex Example');
 p.run('D.contexts[16].label="My private reading"');assert.equal(p.run('contextTitle(D.contexts[16])'),'My private reading');
});

test('older notes become searchable without changing the loaded contexts or current history page',async()=>{
 const D=fixture();D.contexts[0].history=['history/market-abc/0.json','history/market-abc/1.json'];D.contexts[0].totalMemories=2;
 const requests=[];const old=memory('m_bbbbbb','A forgotten cobalt customer interview.');
 const p=page(D,{fetcher:async path=>{requests.push(path);return {ok:true,json:async()=>({memories:path.endsWith('1.json')?[old]:D.contexts[0].memories})}}});
 await p.run('gsearch("cobalt");loadSearchHistory()');
 assert.equal(requests.length,2);assert.match(p.node('#s-grid').innerHTML,/forgotten <mark>cobalt<\/mark>/);
 assert.match(p.node('#s-status').textContent,/Search complete/);assert.equal(p.run('D.contexts[0].memories.length'),1);
 assert.equal(p.run('D.loaded.join(",")'),'market');
 await click(p,'[data-search-memory]',{dataset:{searchMemory:old.id}});
 assert.equal(p.run('view'),'contexts');assert.match(p.node('#ch-pane').innerHTML,/forgotten cobalt/);
 assert.match(new URL(p.run('chatDraft().href')).searchParams.get('prompt'),/"market"/);
});

test('history reads have bounded concurrency, reuse completed pages, and leave navigation intact',async()=>{
 const D=fixture();D.contexts[0].history=Array.from({length:10},(_,i)=>`history/market-abc/${i}.json`);
 let active=0,peak=0,calls=0;
 const p=page(D,{fetcher:async()=>{calls++;peak=Math.max(peak,++active);await new Promise(resolve=>setImmediate(resolve));active--;return{ok:true,json:async()=>({memories:[]})}}});
 await p.run('gsearch("research");loadSearchHistory()');assert.equal(calls,10);assert.equal(peak,4);
 await p.run('gsearch("different");loadSearchHistory()');assert.equal(calls,10);
 const pending=[];const q=page(D,{fetcher:()=>new Promise(resolve=>pending.push(resolve))});
 q.run('gsearch("research")');q.run('show("contexts")');
 pending.forEach(resolve=>resolve({ok:true,json:async()=>({memories:[]})}));await q.run('loadSearchHistory()');
 assert.equal(q.run('view'),'contexts');assert.equal(pending.length,4,'do not fetch the next batch after leaving search');
});

test('unreadable history is explicitly partial and a retry can recover it',async()=>{
 const D=fixture();D.contexts[0].history=['history/market-abc/0.json'];let fail=true;
 const p=page(D,{fetcher:async()=>({ok:!fail,json:async()=>({memories:[memory('m_bbbbbb','recovered nebula evidence')]})})});
 await p.run('gsearch("nebula");loadSearchHistory()');assert.match(p.node('#s-status').textContent,/incomplete/);assert.match(p.node('#s-pages').innerHTML,/data-search-retry/);
 fail=false;await click(p,'[data-search-retry]',{dataset:{}});await p.run('loadSearchHistory()');
 assert.match(p.node('#s-status').textContent,/Search complete/);assert.match(p.node('#s-grid').innerHTML,/recovered <mark>nebula/);
 const preview=fixture();preview.contexts[0].totalMemories=100;const q=page(preview);q.run('gsearch("research")');assert.match(q.node('#s-status').textContent,/Only preview notes/);
});

test('search results are bounded, escaped, navigable and omit copied originals consistently',async()=>{
 const D=fixture();D.contexts[0].memories=Array.from({length:70},(_,i)=>memory('m_'+i.toString(16).padStart(6,'0'),'cobalt <img src=x onerror=alert(1)> '+i));
 const original=memory('m_aaaaaa','cobalt original'),copy={...memory('m_bbbbbb','cobalt copied'),tags:['forked:source'],source:[{kind:'memory',ref:original.id}]};
 D.contexts[0].memories.push(original,copy);
 const p=page(D);p.run('gsearch("cobalt")');assert.equal((p.node('#s-grid').innerHTML.match(/class="search-hit"/g)||[]).length,5);
 assert.doesNotMatch(p.node('#s-grid').innerHTML,/<img/);assert.match(p.node('#s-grid').innerHTML,/&lt;img/);
 await click(p,'[data-search-kind]',{dataset:{searchKind:'notes'}});
 assert.equal((p.node('#s-grid').innerHTML.match(/class="search-hit"/g)||[]).length,20);assert.match(p.node('#s-pages').innerHTML,/1 \/ 4/);
 assert.equal(p.run('searchMatches("cobalt").notes.length'),71);
 assert.equal(p.run('hi("A <b> [x]", "[x]")'),'A &lt;b&gt; <mark>[x]</mark>');
 assert.equal(p.run('hi("İ Acme", "Acme")'),'İ <mark>Acme</mark>');
 p.run('show("contexts");gsearch("cobalt");gsearch("")');assert.equal(p.run('view'),'contexts');
});


test('desktop appearance is dark-only with no saved theme or palette overrides',()=>{
 const html=readFileSync(new URL('../scripts/gtm-brain-render/home.template.html',import.meta.url),'utf8');
 assert.match(html,/color-scheme:dark/);
 assert.doesNotMatch(html,/data-theme|gtm-theme|gtm-palette|prefers-color-scheme|localStorage/);
});

test('browser history and copied links preserve the context, folder and search selection',()=>{
 const D=fixture();D.projects=[{slug:'research',title:'Research',path:'/tmp/Research',contexts:['market'],loaded:['market'],pointer:true}];
 const p=page(D,{route:'#view=contexts&context=market'});
 assert.equal(p.run('view'),'contexts');assert.equal(p.run('chan'),'market');
 p.run('projectSlug="research";renderProject();show("projects");publishRoute()');assert.match(p.location.hash,/project=research/);
 p.run('gsearch("research");searchFilter="notes";publishRoute()');
 assert.match(p.location.hash,/search=research&type=notes/);
 p.history.back();assert.equal(p.run('view'),'projects');
 assert.equal(new URL(p.run('chatDraft().href')).searchParams.get('path'),'/tmp/Research');
 p.history.back();assert.equal(p.run('view'),'contexts');p.history.forward();assert.equal(p.run('view'),'projects');
 const q=page(D,{route:'#view=search&search=research&type=notes'});
 assert.equal(q.run('view'),'search');assert.equal(q.node('#gq').value,'research');assert.equal(q.run('searchFilter'),'notes');
 assert.match(q.node('#s-grid').innerHTML,/Recent <mark>research/);
 assert.equal(page(D,{route:'#view=nonexistent'}).run('view'),'home');
});

test('a revision restores detailed browsing state instead of replacing it with the shorter URL',()=>{
 const D=fixture();D.contexts[0].memories=Array.from({length:50},(_,i)=>memory('m_'+i.toString(16).padStart(6,'0'),'research '+i));
 const p=page(D,{route:'#view=search&search=research&type=notes'});
 p.run('searchPage=2;searchReturn="contexts";paintSearch();refreshPage()');
 const q=page(D,{saved:p.saved,route:p.location.hash});
 assert.equal(q.run('view'),'search');assert.equal(q.run('searchPage'),2);assert.equal(q.run('searchReturn'),'contexts');assert.equal(q.scroll,420);
 assert.match(q.node('#s-pages').innerHTML,/3 \/ 3/);
});


test('context links preserve custom titles, archived topics and loaded state without a redundant selector',async()=>{
 const D=fixture();D.contexts.push({...context('archived-topic',[memory('m_bbbbbb','Earlier evidence','archived-topic')]),title:'Earlier work',label:'Earlier work',status:'archived',loaded:false});
 const p=page(D,{route:'#view=contexts&context=market'});
 assert.doesNotMatch(readFileSync(new URL('../scripts/gtm-brain-render/home.template.html',import.meta.url),'utf8'),/context-select|context-picker/);
 await click(p,'[data-v]',{dataset:{v:'contexts',ch:'archived-topic'}});
 assert.match(p.node('#ch-pane').innerHTML,/Earlier work/);
 assert.equal(p.run('chan'),'archived-topic');assert.match(p.node('#ch-pane').innerHTML,/Earlier evidence/);
 assert.match(p.location.hash,/context=archived-topic/);assert.equal(p.run('D.loaded.join(",")'),'market');
 p.history.back();assert.equal(p.run('chan'),'market');
 const empty=fixture();empty.contexts=[];const q=page(empty);assert.match(q.node('#ch-pane').innerHTML,/No contexts yet/);
});

test('Contexts opens a searchable directory with more rows, archived filtering and a route back from the reader',async()=>{
 const D=fixture();D.contexts=Array.from({length:45},(_,i)=>context('topic-'+String(i).padStart(2,'0')));D.contexts[44].status='archived';
 const p=page(D,{route:'#view=contexts'});
 assert.equal(p.node('#context-reader').hidden,true);
 assert.equal((p.node('#context-directory').innerHTML.match(/class="context-row"/g)||[]).length,44);
 assert.doesNotMatch(p.node('#context-directory').innerHTML,/context-show-more/);
 p.node('#context-search').oninput({target:{value:'topic-03',selectionStart:8}});
 assert.equal((p.node('#context-directory').innerHTML.match(/class="context-row"/g)||[]).length,1);
 await click(p,'[data-v]',{dataset:{v:'contexts',ch:'topic-03'}});
 assert.equal(p.node('#context-directory').hidden,true);assert.match(p.location.hash,/context=topic-03/);
 p.history.back();assert.equal(p.node('#context-reader').hidden,true);assert.equal(p.run('contextQuery'),'topic-03');
 p.node('#context-search').oninput({target:{value:'',selectionStart:0}});p.node('#context-status').onchange({target:{value:'archived'}});
 assert.match(p.node('#context-directory').innerHTML,/data-ch="topic-44"/);assert.doesNotMatch(p.node('#context-directory').innerHTML,/data-ch="topic-03"/);
 assert.equal(p.run('D.loaded.join(",")'),'market');
});


test('recent references use recorded entity evidence and tools, with working exploration links',async()=>{
 const D=fixture(),m={...memory('m_aaaaaa','Customer research'),tools:['CRM'],source:[{kind:'url',ref:'https://example.com/record'}]};D.recent=[m];
 D.entityGraph={nodes:[{name:'Acme',contexts:[{context:'market',evidence:[{id:m.id}]}]},{name:'Unrelated',contexts:[]}],links:[]};
 const p=page(D),html=p.node('#h-recent').innerHTML;
 assert.match(html,/data-entity="Acme" data-entity-context="market"/);assert.doesNotMatch(html,/Unrelated/);
 assert.match(html,/data-recent-tool="CRM"/);assert.match(html,/https:\/\/example.com\/record/);
 assert.match(html,/<article class="recent-item"/);
 await click(p,'[data-recent-tool]',{dataset:{recentTool:'CRM'}});
 assert.equal(p.run('view'),'search');assert.equal(p.node('#gq').value,'CRM');
});

test('previous dashboard metadata remains accessible after regrouping navigation',()=>{
 const D=fixture();D.contexts[0].whenLoaded='Historical instruction keyword';
 D.projects=[{slug:'research',title:'Research',path:'/tmp/Research',contexts:['market'],loaded:['market'],notes:82,lastNote:'2026-09-12T10:00:00Z',pointer:true}];
 D.admin.team[0].handle='unique-team-handle';
 const p=page(D);
 p.run('projectSlug="research";renderProject()');assert.match(p.node('#project-detail').innerHTML,/82 notes/);
 assert.match(p.node('#project-detail').innerHTML,/Last recorded.*12 Sep/);
 assert.equal(p.run('searchMatches("Historical instruction keyword").contexts.length'),1);
 assert.equal(p.run('searchMatches("unique-team-handle").workspace.length'),1);
});

test('Settings omits the retired browser preference and the language row',()=>{
 const D=fixture();D.admin.dashboardBrowser='chrome';
 const p=page(D),html=p.node('#settings-preferences').innerHTML;
 assert.doesNotMatch(html,/Google Chrome|Dashboard browser|dashboard browser preference|Your language|Polski/);
 assert.match(html,/codex:\/\/threads\/new\?path=/);assert.doesNotMatch(html,/<select|<input/);
 assert.equal(p.run('viewLabel("admin")'),'Settings');
});

test('customer relationships filter the entity directory and preserve evidence',()=>{
 const D=fixture();D.names=['Acme','Other'].map((name,i)=>({id:'e'+i,name,kind:'organization',aliases:[],emails:[],contexts:[],mentions:0}));
 D.customers={customers:[{id:'e0',name:'Acme',status:'customer',summary:'Paid pilot confirmed',memory:'m_aaaaaa',observed_at:'2026-09-12',recorded_at:'2026-09-14',basis:'user',references:[{kind:'url',ref:'https://example.com/crm'}],conflicts:[]}],coverage:[],suggestions:[],unresolved:[]};
 const p=page(D);assert.doesNotMatch(p.node('#explore-grid').innerHTML,/data-v="customers"/);
 p.run('entRelationship="customer";renderEntities()');
 assert.match(p.node('#people-list').innerHTML,/data-entity="Acme"/);assert.doesNotMatch(p.node('#people-list').innerHTML,/data-entity="Other"/);
 assert.match(p.run('relationshipEvidence(D.names[0])'),/Paid pilot confirmed/);assert.match(p.run('relationshipEvidence(D.names[0])'),/https:\/\/example.com\/crm/);
 assert.match(p.node('#people-list').innerHTML,/Customer evidence coverage/);
});

test('Explore groups questions and decisions under the Memories type filter',()=>{
 const D=fixture();D.contexts[0].memories=[memory('m_aaaaaa','A note'),{...memory('m_bbbbbb','A question?'),kind:'question'},{...memory('m_cccccc','A decision'),kind:'decision'}];
 const p=page(D,{route:'#view=memories&type=decision'});
 assert.match(p.node('#explore-grid').innerHTML,/data-v="memories"/);assert.doesNotMatch(p.node('#explore-grid').innerHTML,/data-v="questions"/);
 assert.match(p.node('#mem-list').innerHTML,/A decision/);assert.doesNotMatch(p.node('#mem-list').innerHTML,/A question|A note/);
 p.run('memoryKinds=["question"];mems()');assert.match(p.node('#mem-list').innerHTML,/A question/);assert.doesNotMatch(p.node('#mem-list').innerHTML,/A decision/);
 p.run('show("questions")');assert.equal(p.run('view'),'memories');assert.equal(p.run('memoryKinds.join(",")'),'question');
 p.run('show("decisions")');assert.equal(p.run('view'),'memories');assert.equal(p.run('memoryKinds.join(",")'),'decision');
 assert.match(p.node('#mem-list').innerHTML,/A decision/);assert.doesNotMatch(p.node('#mem-list').innerHTML,/A question|A note/);
 assert.match(p.node('#nav').innerHTML,/data-v="explore"[^>]*aria-current="page"/);
});

test('memory pills combine multiple types and contexts and toggle independently',async()=>{
 const D=fixture();D.contexts=[context('market',[memory('m_aaaaaa','Market note'),{...memory('m_bbbbbb','Market decision'),kind:'decision'}]),context('strategy',[{...memory('m_cccccc','Strategy question','strategy'),kind:'question'}]),context('offer',[{...memory('m_dddddd','Offer decision','offer'),kind:'decision'}])];
 const p=page(D,{route:'#view=memories'});
 await click(p,'[data-memory-type]',{dataset:{memoryType:'decision'}});
 await click(p,'[data-memory-type]',{dataset:{memoryType:'question'}});
 await click(p,'[data-memory-context]',{dataset:{memoryContext:'market'}});
 await click(p,'[data-memory-context]',{dataset:{memoryContext:'strategy'}});
 const html=p.node('#mem-list').innerHTML;assert.match(html,/Market decision|Strategy question/);assert.doesNotMatch(html,/Market note|Offer decision/);
 assert.match(p.node('#memory-types').innerHTML,/data-memory-type="decision" aria-pressed="true"/);
 const restored=page(D,{route:p.location.hash});assert.equal(restored.run('memoryContexts.join(",")'),'market,strategy');assert.equal(restored.run('memoryKinds.join(",")'),'decision,question');
 await click(p,'[data-memory-type]',{dataset:{memoryType:'decision'}});assert.doesNotMatch(p.node('#mem-list').innerHTML,/Market decision/);
 await click(p,'[data-memory-context]',{dataset:{memoryContext:'all'}});assert.equal(p.run('memoryContexts.length'),0);assert.equal(p.run('memoryKinds.join(",")'),'question');
});

test('context dropdown searches a large directory without clearing selected contexts',()=>{
 const D=fixture();D.contexts=Array.from({length:100},(_,i)=>context('topic-'+i));
 const p=page(D);p.run('memoryContexts=["topic-4","topic-8"];memoryContextOpen=true;mems()');
 assert.match(p.node('#memory-contexts').innerHTML,/2 contexts selected/);
 p.node('#memory-context-search').oninput({target:{value:'topic-99'}});
 assert.match(p.node('#memory-context-options').innerHTML,/data-memory-context="topic-99"/);
 assert.doesNotMatch(p.node('#memory-context-options').innerHTML,/data-memory-context="topic-4"/);
 assert.equal(p.run('memoryContexts.join(",")'),'topic-4,topic-8');
 p.node('#memory-context-search').oninput({target:{value:'no-match'}});assert.match(p.node('#memory-context-options').innerHTML,/No matching contexts/);
});


test('project lens separates tagged notes from shared knowledge and survives navigation',()=>{
 const D=fixture();
 const own={...memory('m_bbbbbb','Research project finding'),tags:['project:research']};
 const other={...memory('m_cccccc','Website project finding'),tags:['project:website']};
 D.contexts=[context('market',[own,other]),context('unrelated')];
 D.projects=[{slug:'research',title:'Customer research',path:'/tmp/Research',contexts:['market'],loaded:['market'],pointer:true}];
 const p=page(D,{route:'#view=home'});
 assert.equal(p.run('projectSlug'),'');assert.match(p.node('#project-select').innerHTML,/All company/);
 p.node('#project-select').value='research';p.listeners.change.forEach(fn=>fn({target:p.node('#project-select')}));
 assert.equal(p.run('view'),'home');
 const html=p.node('#project-detail').innerHTML;
 assert.match(html,/Research project finding/);assert.doesNotMatch(html,/Website project finding/);
 assert.match(html,/Shared across projects/);assert.match(html,/Evidence about market/);
 assert.doesNotMatch(p.node('#context-directory').innerHTML,/data-ch="unrelated"/);
 p.run('show("memories");publishRoute()');assert.match(p.location.hash,/project=research/);
 assert.match(p.node('#mem-list').innerHTML,/Research project finding/);assert.doesNotMatch(p.node('#mem-list').innerHTML,/Website project finding/);
 p.run('show("home")');assert.equal(p.run('view'),'home');
 p.node('#project-select').value='';p.listeners.change.forEach(fn=>fn({target:p.node('#project-select')}));
 assert.equal(p.run('view'),'home');assert.match(p.node('#context-directory').innerHTML,/data-ch="unrelated"/);
 assert.equal(p.run('D.loaded.join(",")'),'market');
});


test('Codex project opening selects its overview while plain links keep All company',()=>{
 const D=fixture();D.projects=[{slug:'research',title:'Research',path:'/tmp/Research',contexts:['market'],loaded:['market'],pointer:true}];
 const p=page(D,{route:'#view=home&project=research'});
 assert.equal(p.run('view'),'home');assert.equal(p.node('#project-select').value,'research');
 assert.equal(new URL(p.run('chatDraft().href')).searchParams.get('path'),'/tmp/Research');
 assert.equal(page(D,{route:'#view=home'}).run('projectSlug'),'');
 assert.equal(page(D,{route:'#view=home&project=missing'}).run('view'),'home');
});


test('Back appears only inside a detail and returns to its parent directory',()=>{
 const p=page(fixture(),{route:'#view=home'});
 for(const view of ['home','explore','memories','people','contexts','skills','admin']){
  p.run('show('+JSON.stringify(view)+');publishRoute()');assert.equal(p.node('#view-back').hidden,true,view);
 }
 const direct=page(fixture(),{route:'#view=contexts&context=market'});
 assert.equal(direct.node('#view-back').hidden,false);
 direct.node('#view-back').onclick();assert.equal(direct.run('contextDirectory'),true);
 assert.equal(direct.run('view'),'contexts');assert.equal(direct.node('#view-back').hidden,true);
});


test('project selector preserves the active page and restores company notes when cleared',()=>{
 const D=fixture();D.projects=[{slug:'research',title:'Research',path:'/tmp/Research',contexts:['market'],loaded:[],pointer:true}];
 D.recent=[memory('m_aaaaaa','Company finding')];
 const p=page(D,{route:'#view=memories'});
 p.node('#project-select').value='research';p.listeners.change.forEach(fn=>fn({target:p.node('#project-select')}));
 assert.equal(p.run('view'),'memories');assert.equal(p.run('overviewRecent().length'),0);
 p.node('#project-select').value='';p.listeners.change.forEach(fn=>fn({target:p.node('#project-select')}));
 assert.equal(p.run('view'),'memories');assert.equal(p.run('overviewRecent()[0].content'),'Company finding');
 p.history.back();assert.equal(p.run('projectSlug'),'research');assert.equal(p.node('#project-select').value,'research');
});


test('overview feed appends deduplicated history, filters projects and retries failed pages',async()=>{
 const D=fixture();const first=memory('m_aaaaaa','Newest'),older={...memory('m_bbbbbb','Older'),at:'2026-09-13',tags:['project:research']};D.recent=[first];D.listHistory={recent:['history/feed/0.json','history/feed/1.json']};
 let fail=true,calls=0;const p=page(D,{fetcher:async()=>{calls++;if(fail)throw Error('offline');return {ok:true,json:async()=>({memories:[first,older]})}}});
 await assert.rejects(p.run('loadOverviewFeed("recent",6)'));
 fail=false;const loaded=await p.run('loadOverviewFeed("recent",6)');
 assert.equal(loaded.records.length,2);assert.equal(loaded.hasMore,false);
 assert.equal((await p.run('loadOverviewFeed("recent",6,"research")')).records.length,1);
 assert.equal(calls,2);assert.equal(p.run('MEMS.has("m_bbbbbb")'),true);
});


test('feed search includes older records and respects its project filter',async()=>{
 const D=fixture();D.recent=[memory('m_aaaaaa','New note')];D.listHistory={recent:['history/feed/0.json','history/feed/1.json']};
 const older={...memory('m_bbbbbb','Older cobalt finding'),tags:['project:research']};
 const p=page(D,{fetcher:async()=>({ok:true,json:async()=>({memories:[older]})})});
 const result=await p.run('loadOverviewFeed("recent",6,"research","cobalt")');
 assert.equal(result.records.length,1);assert.equal(result.records[0].id,older.id);assert.equal(result.hasMore,false);
 assert.equal((await p.run('loadOverviewFeed("recent",6,"other","cobalt")')).records.length,0);
 assert.match(p.node('#h-recent').innerHTML,/data-v="memories"/);
});

test(`resolution draft contains only displayed questions, without record IDs or a sync request`,async()=>{
 const D=fixture();
 D.questions=Array.from({length:5},(_,i)=>({...memory('m_'+String(i).repeat(6),'Question '+i+'?', 'market'),kind:'question',tags:['brain-question'],at:`2026-09-${14-i}T10:00:00Z`}));
 const p=page(D);const rows=await p.run('loadOverviewFeed("questions",3)');
 assert.equal(JSON.stringify(p.run('initialAttentionRows()')),JSON.stringify(rows.records));
 p.ui.displayed=rows.records;
 const url=new URL(p.run('resolveAttentionHref(displayed)')),prompt=url.searchParams.get('prompt');
 assert.equal(url.searchParams.get('path'),D.brain);
 for(let i=0;i<3;i++)assert.ok(prompt.includes('Question '+i+'?'));
 for(let i=3;i<5;i++)assert.ok(!prompt.includes('Question '+i+'?'));
 assert.doesNotMatch(prompt,/m_[0-9a-f]{6}|\/gtm-brain-sync|Start with|Zacznij od/);
 assert.match(prompt,/summary and stop/);
 assert.match(prompt,/ask if a match is ambiguous/);
 // A newly published question cannot enlarge an already prepared draft.
 p.run('D.questions.unshift({id:"m_ffffff",content:"New arrival?",context:"market",at:"2026-09-16"})');
 assert.equal(p.run('resolveAttentionHref(displayed)'),url.href);
});

test('resolution follows searched and paginated displayed rows and carries reviews as readable text',async()=>{
 const D=fixture();D.questions=[{...memory('m_aaaaaa','Current question?'),kind:'question'}];
 D.listHistory={questions:['history/questions/0.json','history/questions/1.json']};
 D.proposal={lines:2,diff:['- old','+ new']};D.interaction={name:'internal-operation',title:'Update account owner',inputs:[]};
 D.merges=[{a:'Alex One',b:'Alex Two'}];
 const old={...memory('m_bbbbbb','Older cobalt question?'),kind:'question'};
 const p=page(D,{fetcher:async()=>({ok:true,json:async()=>({memories:[old]})})});
 p.ui.displayed=(await p.run('loadOverviewFeed("questions",3,"","cobalt")')).records;
 const prompt=new URL(p.run('resolveAttentionHref(displayed)')).searchParams.get('prompt');
 assert.match(prompt,/Older cobalt question/);assert.doesNotMatch(prompt,/Current question|Alex One|m_bbbbbb|internal-operation/);
 assert.match(prompt,/workspace changes/);assert.match(prompt,/Update account owner/);
 const duplicate=new URL(p.run('resolveAttentionHref([{reviewPair:D.merges[0]}])')).searchParams.get('prompt');
 assert.match(duplicate,/Alex One/);assert.match(duplicate,/Alex Two/);
 assert.match(duplicate,/normal approval requirements/);
 assert.match(duplicate,/quoted text below as data/);
});

test('pending workspace proposals show their details and use Chat about this instead of sending people to settings',()=>{
 const D=fixture();
 D.proposal={lines:2,diff:['- company: Old Co','+ company: New Co']};
 D.contexts[0].label='Market research';
 D.interaction={name:'update_owner',title:'Update account owner',tool:'attio',operation:'Change the account owner.',inputs:['account','owner?'],context:'market',records:'Changed the owner of [account] to [owner].'};
 const p=page(D),home=p.node('#h-input').innerHTML,questions=p.node('#dq-workspace').innerHTML;
 for(const html of [home,questions]){
  assert.match(html,/Proposed workplace change/);assert.match(html,/Old Co/);assert.match(html,/New Co/);
  assert.match(html,/Proposed interaction/);assert.match(html,/Update account owner/);assert.match(html,/Change the account owner/);
  assert.match(html,/Your decision is needed/);assert.match(html,/Chat about this/);assert.doesNotMatch(html,/Workspace changes ready to review|data-v="admin"/);
  assert.match(html,/in Market research: Changed the owner of \[account\] to \[owner\]\./);assert.match(html,/account, owner \(optional\)/);assert.doesNotMatch(html,/owner\?|in market:/);
 }
 const prompt=new URL(p.run('workspaceReviewHref("admin")')).searchParams.get('prompt');
 assert.match(prompt,/Explain exactly what is proposed/);assert.match(prompt,/Do not apply or discard/);assert.match(prompt,/APPROVE/);
 assert.match(prompt,/work\/admin\.proposed\.md/,'the chat is told where the proposal is');
 const asked=new URL(p.run('workspaceReviewHref("interaction")')).searchParams.get('prompt');
 assert.match(asked,/the proposed interaction "Update account owner" \(update_owner\) in work\/interaction\.proposed\.json/);
});

test('an empty resolution batch produces no new-chat link',()=>{
 const p=page(fixture());assert.equal(p.run('resolveAttentionHref([])'),'');assert.equal(p.run('workspaceReviewHtml()'),'');
 assert.equal(p.run('attentionItems([]).length'),0);
});

test('customer relationships use the same source controls as other entity evidence',()=>{
 const p=page(fixture());
 const refs=[{kind:'url',ref:'https://example.com/account'},{kind:'attio',ref:'https://app.attio.com/record'}];
 p.run('customerData.customers.push('+JSON.stringify({name:'Test person',status:'customer',summary:'Confirmed relationship',memory:'m_aaaaaa',observed_at:'2026-09-01',recorded_at:'2026-09-02',references:refs,conflicts:[]})+')');
 const html=p.run('relationshipEvidence({name:"Test person",kind:"person"})');
 assert.ok(html.includes(p.run('sourcesHtml('+JSON.stringify(refs)+')')));
 assert.match(html,/example.com/);assert.match(html,/Attio/);
 assert.doesNotMatch(html,/Open in url|open_with_url/);
});

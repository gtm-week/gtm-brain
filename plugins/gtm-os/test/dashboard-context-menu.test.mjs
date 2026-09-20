import {test} from 'node:test';
import assert from 'node:assert/strict';
import {page} from './helpers/dashboard-page.mjs';

const fixture=()=>{
 const note={id:'m_abcdef',context:'market',content:'Acme confirmed a 30-day pilot. <script>quoted evidence</script>',kind:'note',at:'2026-09-14T10:00:00Z',authors:['alex'],people:[],tools:[],tags:['project:research'],actions:[],source:[{kind:'web',ref:'https://example.com/evidence?a=1&b=2'}]};
 return {brain:'/tmp/Company & Team',generatedAt:'2026-09-14T10:00:00Z',contexts:[{slug:'market',title:'Market & research',status:'active',summary:'Customer research.',rule:'Keep the evidence.',now:'',people:[],tools:[],related:[],names:[],memories:[note],loaded:true}],names:[],recent:[note],loaded:['market'],questions:[],decisions:[],tools:[],activity:[],projects:[{slug:'research',title:'Research pilot',path:'/tmp/Research & Team',contexts:['market'],loaded:['market'],pointer:true}],admin:{company:'Test',owner:'alex',team:[{name:'Alex Example',handle:'alex'}],tools:[],body:''}};
};
const element=(dataset={},parentElement=null,blocks={})=>({dataset,parentElement,tagName:'SPAN',isConnected:true,closest(selector){if(blocks[selector])return blocks[selector];return parentElement?.closest?.(selector)||null},getBoundingClientRect:()=>({left:30,bottom:80})});
const draft=(p,target)=>{p.ui.target=target;return new URL(p.run('chatDraft(chatTarget(target)).href'))};
const prompt=url=>url.searchParams.get('prompt');
const inMarket=/(Context|Kontekst): "Market & research"\./;
const fire=(p,type,e={})=>{for(const fn of p.listeners[type]||[])fn(e)};

test(`right-click uses the nearest context, entity or note without navigating`,()=>{
 const p=page(fixture(),{route:'#view=home'}),before=p.run('chatDraft().href');
 let url=draft(p,element({},element({ch:'market',v:'contexts'})));
 assert.equal(url.searchParams.get('path'),'/tmp/Company & Team');assert.match(prompt(url),inMarket);assert.doesNotMatch(prompt(url),/\(market\)/,'no internal context name');
 const record=element({id:'m_abcdef'}),person=element({chatEntity:'Alex Example'},record,{'[data-id],[data-chat-memory]':record});
 url=draft(p,person);assert.match(prompt(url),/Alex Example/);assert.match(prompt(url),inMarket);assert.doesNotMatch(prompt(url),/Saved note|Zapisana notatka/);
 url=draft(p,element({},record));assert.doesNotMatch(prompt(url),/m_abcdef|"kind"|"ref"/,'no raw ids or JSON in the draft');assert.match(prompt(url),/recorded 14 Sep by Alex Example/);assert.match(prompt(url),/example\.com \(https:\/\/example.com\/evidence\?a=1&b=2\)/);assert.match(prompt(url),/<script>quoted evidence<\/script>/);
 assert.match(prompt(url),/cite the sources/);
 assert.equal(p.run('view'),'home');assert.equal(p.location.hash,'#view=home');assert.equal(p.run('D.loaded.join(",")'),'market');assert.equal(p.run('chatDraft().href'),before);
});

test('a working folder and its notes use its absolute path; a broken pointer uses the brain',()=>{
 const D=fixture('en'),p=page(D,{route:'#view=home'});
 assert.equal(draft(p,element({project:'research'})).searchParams.get('path'),D.projects[0].path);
 p.run('projectSlug="research";show("projects")');
 const note=draft(p,element({id:'m_abcdef'}));assert.equal(note.searchParams.get('path'),D.projects[0].path);assert.match(prompt(note),/Acme confirmed a 30-day pilot/);
 D.projects[0].pointer=false;const q=page(D);
 const broken=draft(q,element({project:'research'}));assert.equal(broken.searchParams.get('path'),D.brain);assert.match(prompt(broken),/connection needs repair/);
});

test('search-result bodies and old records retain their own identity without a history fetch',()=>{
 let reads=0;const p=page(fixture('en'),{fetcher:()=>{reads++;throw Error('Unexpected fetch')}});
 p.run('searchRecords.set("m_123456",{id:"m_123456",context:"market",kind:"note",content:"Earlier evidence "+"x".repeat(10000),source:[]})');
 const old=draft(p,element({},element({chatKind:'notes',chatRef:'m_123456'})));
 assert.doesNotMatch(prompt(old),/m_123456/);assert.match(prompt(old),/Earlier evidence/);assert.ok(old.href.length<2500);assert.equal(reads,0);
 const person=draft(p,element({},element({chatKind:'people',chatRef:'Acme Studio'})));assert.match(prompt(person),/Acme Studio/);
});

test('blank space shares the current view; prose and sources preserve the clicked excerpt',()=>{
 const p=page(fixture('en'),{route:'#view=contexts&context=market'});
 assert.equal(draft(p,element()).href,p.run('chatDraft().href'));
 const target=element({},null,{'p,li,blockquote,td,h1,h2,h3,h4,summary,.asset-card':{innerText:'A particular claim.'},'[data-sources]':{dataset:{sources:'[["web","https://example.com/source"]]'}}});
 const url=draft(p,target);assert.match(prompt(url),/A particular claim/);assert.match(prompt(url),/https:\/\/example.com\/source/);assert.match(prompt(url),inMarket);
});

test('context menu stays on screen and supports keyboard dismissal and focus restoration',()=>{
 const p=page(fixture('en'));
 const menu=p.node('#context-menu'),link=p.node('#context-chat'),origin=p.node('#origin');
 menu.style={};menu.getBoundingClientRect=()=>({width:260,height:85});
 p.ui.innerWidth=700;p.ui.innerHeight=600;origin.isConnected=true;origin.tagName='BUTTON';origin.focus();
 const target=element({ch:'market',v:'contexts'});let prevented=0;
 fire(p,'contextmenu',{target,clientX:695,clientY:598,preventDefault:()=>prevented++});
 assert.equal(prevented,1);assert.equal(menu.hidden,false);assert.equal(menu.style.left,'432px');assert.equal(menu.style.top,'507px');assert.equal(p.ui.document.activeElement,link);
 assert.match(prompt(new URL(link.href)),inMarket);
 fire(p,'keydown',{target:link,key:'Escape',preventDefault(){}});assert.equal(menu.hidden,true);assert.equal(p.ui.document.activeElement,origin);
 fire(p,'keydown',{target,key:'F10',shiftKey:true,preventDefault(){}});assert.equal(menu.hidden,false);assert.equal(menu.style.left,'30px');assert.equal(menu.style.top,'80px');
 fire(p,'scroll');assert.equal(menu.hidden,true);
 fire(p,'contextmenu',{target,clientX:10,clientY:10,preventDefault(){}});fire(p,'pointerdown',{target:element()});assert.equal(menu.hidden,true);
});

test('buttons and links are plain actions: right-click opens no chat menu and no browser menu (ALL-199)',()=>{
 const p=page(fixture('en'));const menu=p.node('#context-menu');menu.style={};menu.getBoundingClientRect=()=>({width:260,height:85});p.ui.innerWidth=700;p.ui.innerHeight=600;
 let prevented=0;const action=element({},null,{'button,a[href],[role="button"]':{tagName:'A',href:'codex://threads/new?path=x'}});
 fire(p,'contextmenu',{target:action,clientX:40,clientY:40,preventDefault:()=>prevented++});
 assert.equal(prevented,1);assert.equal(menu.hidden,true);
 fire(p,'contextmenu',{target:element({ch:'market',v:'contexts'}),clientX:40,clientY:40,preventDefault:()=>prevented++});
 assert.equal(menu.hidden,false,'ordinary items keep the right-click menu');
});

test(`a Codex handoff shows an immediate opening notice until Codex takes focus (ALL-199)`,()=>{
 const p=page(fixture(),{route:'#view=home'});const notice=p.node('#codex-notice');
 assert.equal(notice.hidden,true);
 fire(p,'click',{target:element({},null,{'a[href^="codex:"]':{href:'codex://threads/new?path=x'}})});
 assert.equal(notice.hidden,false);assert.match(notice.textContent,/Opening Codex/);
 fire(p,'blur');assert.equal(notice.hidden,true);
 fire(p,'click',{target:element({ch:'market'})});assert.equal(notice.hidden,true,'ordinary clicks show nothing');
});

test('the chat receives the whole highlighted card, not only its header line (ALL-199)',()=>{
 const p=page(fixture('en'));const cards=p.run('CARD_SELECTOR');
 const card={innerText:'Customer  Market & research\nAcme Studio\nPilot length still open: 30 or 60 days?\nLast note by alex on 14 Sep 2026'};
 const entity=element({chatEntity:'Acme Studio'});
 const url=draft(p,element({},entity,{[cards]:card}));
 assert.match(prompt(url),/Pilot length still open: 30 or 60 days\? Last note by alex/);assert.ok(url.href.length<4000);
 assert.doesNotMatch(prompt(draft(p,element({},entity))),/Last note by alex/,'no card, no card block');
 // A saved note already sends its full text, author and sources, so its card is not repeated.
 const note=prompt(draft(p,element({},element({id:'m_abcdef'}),{[cards]:{innerText:'Note Market & research Acme confirmed a 30-day pilot. 14 Sep · Alex Example · 1 source'}})));
 assert.match(note,/Acme confirmed a 30-day pilot/);assert.doesNotMatch(note,/What I see on the dashboard/);
});

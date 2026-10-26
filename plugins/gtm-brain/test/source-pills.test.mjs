process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
const template=readFileSync(new URL('../scripts/gtm-brain-render/home.template.html',import.meta.url),'utf8');
function render(data={}){
 const ctx=createContext({D:{threads:{'known-task':{name:'Pricing discussion',foreign:true}},...data},URL});
 const source=template;
 runInContext(source.slice(source.indexOf('const esc=s=>'),source.indexOf('const contextTitle=')),ctx);
 runInContext(source.slice(source.indexOf('const threadHtml='),source.indexOf('const projectOf=')),ctx);
 return (sources,expression='sourcesHtml(list)')=>{ctx.list=sources;return runInContext(expression,ctx)};
}
test('many references collapse into one counted disclosure with provider pills and no visible IDs',()=>{
 const sources=[...Array.from({length:7},(_,i)=>({kind:'gmail',ref:'mail-id-'+i})),...Array.from({length:4},(_,i)=>({kind:'attio',ref:'record-id-'+i}))];
 const html=render()(sources);const summary=html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)[1];
 assert.match(summary,/Sources · 11/);assert.match(summary,/Gmail.*7.*Attio.*4/);assert.doesNotMatch(summary,/mail-id|record-id/);
 assert.doesNotMatch(html,/<details[^>]*\sopen(?:\s|>)/);assert.equal((html.match(/class="source-row"/g)||[]).length,11);
 assert.doesNotMatch(html,/<a /);assert.match(html,/No direct link saved/);assert.doesNotMatch(html,/Reference details|source-reference|<code>/);
 assert.match(render()([sources[0],sources[0]]),/Sources · 1/);
});
test('real source URLs open separately and disclose their actual host; Codex sources name the conversation',()=>{
 const html=render()([{kind:'gmail',ref:'https://mail.google.com/mail/u/1/#all/known-id'},{kind:'attio',ref:'https://app.attio.com/workspace/record/known-id'},{kind:'codex',ref:'known-task'}]);
 assert.match(html,/href="https:\/\/mail.google.com\/mail\/u\/1\/#all\/known-id" target="_blank" rel="noopener noreferrer"/);
 assert.match(html,/Opens mail.google.com in a new tab/);assert.match(html,/Opens app.attio.com in a new tab/);
 assert.match(html,/data-thread-copy="codex:\/\/threads\/known-task"/);assert.match(html,/Source conversation: “Pricing discussion”/);assert.match(html,/Paste the link into Codex chat/);
 assert.doesNotMatch(html,/<a[^>]*href="codex:/);assert.match(html,/Copy conversation link/);
});
test('untrusted references stay escaped and cannot create executable or credential-bearing links',()=>{
 const html=render()([{kind:'gmail',ref:'javascript:alert(1)'},{kind:'attio',ref:'https://user:secret@example.com/path'},{kind:'<img onerror=alert(1)>',ref:'"><script>alert(1)</script>'},{kind:'url',ref:'data:text/html,test'}]);
 assert.doesNotMatch(html,/<a |<script|<img/);assert.match(html,/&lt;script&gt;/);
});
test('unknown references and nameless conversations never expose IDs as their labels',()=>{
 const html=render()([{kind:'codex',ref:'unknown-task'},{kind:'other-tool',ref:'opaque-123'}]);
 assert.match(html,/>Conversation</);assert.doesNotMatch(html,/<a |↗/);assert.match(html,/Source task unavailable/);assert.doesNotMatch(html,/>unknown-task<|>opaque-123</);
 assert.match(render()([], 'threadHtml("unknown-task")'),/Source task unavailable/);
});

test('Codex sources and run references provide copy controls instead of broken browser navigation',()=>{
 const html=render()([{kind:'codex',ref:'known-task'}]);
 assert.match(html,/data-thread-copy="codex:\/\/threads\/known-task"/);
 assert.doesNotMatch(html,/<a |↗|Opens in Codex|Open task:/);
 const run=render()([], 'threadHtml("known-task")');
 assert.match(run,/data-thread-copy=/);assert.doesNotMatch(run,/<a /);
 assert.match(run,/Source conversation: “Pricing discussion”/);
});

const crmNames=[
 {name:'Michał Kramarz',kind:'person',references:[{kind:'Attio',ref:'attio:people/1b5c62bb-2971-4777-b21a-09fb4f79491a'}]},
 {name:'Google',kind:'organization',references:[{kind:'Attio',ref:'attio:companies/c765f1fb-48c2-4817-a77f-ed890fbc0308'}]},
 {name:'<b>Bek</b> Ventures',kind:'organization',references:[{kind:'hubspot',ref:'companies/42'}]}];
const rows=html=>[...html.matchAll(/<div class="source-heading">([\s\S]*?)<\/div>/g)].map(m=>m[1].replace(/<[^>]+>/g,'').trim());
test('CRM ID references name the record type and the linked entity so sibling records are distinguishable',()=>{
 const html=render({names:crmNames})([{kind:'attio',ref:'people/1b5c62bb-2971-4777-b21a-09fb4f79491a'},{kind:'attio',ref:'companies/c765f1fb-48c2-4817-a77f-ed890fbc0308'},{kind:'attio',ref:'deal/123'},{kind:'attio',ref:'record-id-0'}]);
 assert.deepEqual(rows(html),['AttioPerson record · Michał Kramarz','AttioCompany record · Google','AttioDeal record','AttioRecord']);
 assert.match(html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)[1],/Attio <span>4<\/span>/);
 assert.doesNotMatch(html.slice(html.indexOf('class="source-list"')),/1b5c62bb|c765f1fb|record-id-0/);
});
test('HubSpot sources get their provider name and record types from IDs and record URLs',()=>{
 const html=render({names:crmNames})([{kind:'hubspot',ref:'contacts/101'},{kind:'hubspot',ref:'companies/42'},{kind:'HubSpot',ref:'hubspot:deals/7'},{kind:'hubspot',ref:'portal-fixture/pipelines/sponsorships'},
  {kind:'hubspot',ref:'https://app-eu1.hubspot.com/contacts/1234/record/0-3/456'},{kind:'url',ref:'https://app.hubspot.com/contacts/1234/company/789'},{kind:'hubspot',ref:'opaque-9'}]);
 assert.deepEqual(rows(html),['HubSpotContact record','HubSpotCompany record · &lt;b&gt;Bek&lt;/b&gt; Ventures','HubSpotDeal record','HubSpotPipeline','HubSpotDeal record ↗','HubSpotCompany record ↗','HubSpotRecord']);
 assert.match(html,/Opens app-eu1.hubspot.com in a new tab/);assert.match(html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)[1],/HubSpot <span>7<\/span>/);
 assert.doesNotMatch(html.slice(html.indexOf('class="source-list"')),/<b>Bek|>Source<|Saved reference|opaque-9|sponsorships/);
});
test('HubSpot object codes decide link labels; unknown objects never borrow the contacts app path',()=>{
 const html=render()([{kind:'hubspot',ref:'https://app.hubspot.com/contacts/123/record/0-47/8'},{kind:'hubspot',ref:'https://app.hubspot.com/contacts/123/record/0-48/4'},{kind:'hubspot',ref:'https://app.hubspot.com/contacts/123/record/0-49/2'},
  {kind:'hubspot',ref:'https://app.hubspot.com/contacts/123/record/0-27/5'},{kind:'hubspot',ref:'https://app.hubspot.com/contacts/123/record/0-46/3'},{kind:'hubspot',ref:'https://app.hubspot.com/contacts/123/record/2-1234567/5'},{kind:'hubspot',ref:'https://app.hubspot.com/contacts/123/record/0-7/1'},
  {kind:'hubspot',ref:'meetings/8'},{kind:'hubspot',ref:'calls/4'},{kind:'hubspot',ref:'emails/2'},{kind:'hubspot',ref:'contact:101'},{kind:'HubSpot',ref:'hubspot:deal:7'},{kind:'hubspot',ref:'0-47/9'},{kind:'hubspot',ref:'2-1234567/5'}]);
 assert.deepEqual(rows(html),['HubSpotMeeting ↗','HubSpotCall ↗','HubSpotEmail ↗','HubSpotTask ↗','HubSpotNote ↗','HubSpotRecord ↗','HubSpotRecord ↗','HubSpotMeeting','HubSpotCall','HubSpotEmail','HubSpotContact record','HubSpotDeal record','HubSpotMeeting','HubSpotRecord']);
});

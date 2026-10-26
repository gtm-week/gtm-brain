// Real stdio MCP, disk writes, generated dashboard and shipped client. No production sources.
process.env.GTM_BRAIN_NO_HOOK_CHECK = "1"; // the hooks-off check talks to a real Codex; hooks-notice.test covers it with a fake one
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import * as lib from '../lib/brain.mjs';
import { dailyRefreshPrompt } from '../scripts/gtm-brain-schedule/daily-run.mjs';
import { page } from './helpers/dashboard-page.mjs';

const plugin = new URL('../', import.meta.url).pathname;
test('MCP E2E: transcript -> anchor -> findings -> correction -> refresh -> dashboard, with calendar failure', async t => {
  const brain = mkdtempSync(join(tmpdir(), 'gtm-meeting-e2e-'));
  const env = { ...process.env, CODEX_HOME: join(brain, 'profile'), GTM_BRAIN_NO_COMMIT: '1', GTM_BRAIN_NO_COMPILE: '1', GTM_BRAIN_NO_WATCH: '1', GTM_BRAIN_NO_OPEN: '1' };
  mkdirSync(join(brain, 'brain')); mkdirSync(join(brain, 'work'));
  writeFileSync(join(brain, 'brain/admin.md'), lib.renderFrontmatter({ company: 'Meeting Fixture', tools: ['granola', 'calendar'], team: [{ name: 'Ann Lee', handle: 'ann', email: 'ann@fixture.test' }] }));
  lib.writeContext(brain, 'offer', { title: 'Offer' }); lib.writeContext(brain, 'strategy', { title: 'Strategy' });
  lib.writeContext(brain, 'personal-ann', { title: 'Ann', personal_owner: 'ann' });
  const server = spawn(process.execPath, [join(plugin, 'server/server.mjs')], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { server.stdin.end(); server.kill(); });
  let sequence = 0, stderr = ''; const pending = new Map();
  server.stderr.on('data', data => stderr += data);
  createInterface({ input: server.stdout }).on('line', line => { const msg = JSON.parse(line), item = pending.get(msg.id); if (item) { clearTimeout(item.timer); pending.delete(msg.id); item.resolve(msg); } });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP timed out: ${method}: ${stderr}`)); }, 15000);
    pending.set(id, { resolve, timer }); server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const call = async (name, args, fail = false) => { const msg = await rpc('tools/call', { name, arguments: { brain, ...args } });
    const text = msg.result?.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || JSON.stringify(msg.error);
    assert.equal(!!(msg.error || msg.result?.isError), fail, text); return text; };
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'meetings-e2e', version: '1' } });
  const catalog = (await rpc('tools/list')).result.tools;
  assert.equal(catalog.find(x => x.name === 'query').annotations.readOnlyHint, true);   // meetings is an object of query now
  const data = { by: 'ann', context: 'offer', content: 'Nadia described a difficult onboarding conversation on September 9.', people: ['Nadia Solberg'], sources: ['granola:https://notes.test/one?workspace=work#transcript'],
    meeting: { title: 'Discovery with Nadia', reference: { kind: 'granola', account: 'work', ref: 'note-1' }, evidence: 'transcript', occurrence: 'happened', basis: 'source', observed_at: '2026-09-10T10:00:00Z', occurred_at: '2026-09-09', capture: 'complete', participants: [{ name: 'Nadia Solberg', role: 'attended' }] } };
  await call('remember', data);
  let overview = JSON.parse(await call('query', { object: 'meetings', filters: { by: 'ann' } }));
  const id = overview.meetings[0].id;
  assert.match(id, /^m_/); assert.equal(overview.meetings[0].occurrence, 'happened');
  const before = readFileSync(join(brain, 'brain/contexts/offer/memories.jsonl'), 'utf8');
  await call('remember', data);
  assert.equal(readFileSync(join(brain, 'brain/contexts/offer/memories.jsonl'), 'utf8'), before);
  await call('remember', { by: 'ann', memories: [
    { context: 'offer', content: 'Nadia needs onboarding in one day.', kind: 'note', meeting_id: id, people: ['Nadia Solberg'], sources: data.sources },
    { context: 'strategy', content: 'Which onboarding steps can be removed?', kind: 'question', meeting_id: id, sources: data.sources },
  ] });
  const correction = { ...data, content: 'The conversation actually happened on September 8.', sources: ['user:ann'], supersedes: id, meeting: { ...data.meeting, basis: 'user', occurred_at: '2026-09-08', observed_at: '2026-09-11T10:00:00Z' } };
  await call('remember', correction);
  await call('remember', { ...data, content: 'Provider transcript was regenerated.', meeting: { ...data.meeting, revision: 'v2', observed_at: '2026-09-12T10:00:00Z' } });
  await call('remember', { by: 'ann', context: 'offer', content: 'Calendar is unavailable; transcript capture succeeded.', sources: ['calendar:primary'], meeting_coverage: { by: 'ann', tool: 'calendar', account: 'work', scope: 'Current week', checked_at: '2026-09-12T11:00:00Z', status: 'unavailable', scanned: 0, captured: 0, skipped: 0, unresolved: 0, remaining: true } });
  overview = JSON.parse(await call('query', { object: 'meetings', filters: { by: 'ann', entity: 'Nadia Solberg' } }));
  assert.equal(overview.meetings.length, 1); assert.equal(overview.meetings[0].occurred_at, '2026-09-08');
  assert.equal(overview.meetings[0].outcomes.length, 2); assert.equal(overview.coverage[0].status, 'unavailable');
  const exact = await call('query', { object: 'memories', filters: { meeting_id: id, context: 'strategy' } });
  assert.match(exact, /Which onboarding steps/);
  await call('remember', { ...data, meeting: { ...data.meeting, evidence: 'calendar' } }, true);
  // A calendar failure cannot block the production compile/read path.
  assert.match(await call('compile_facts', { context: 'offer' }), /Nadia/);
  execFileSync(process.execPath, [join(plugin, 'scripts/gtm-brain-render/render.mjs'), brain], { env });
  const D = JSON.parse(readFileSync(join(brain, 'work/home/data.json'), 'utf8'));
  assert.equal(D.meetings.meetings.length, 1); assert.equal(D.meetings.meetings[0].outcomes.length, 2);
  {
    const ui = page({ ...D });
    assert.match(ui.node('#meetings-list').innerHTML, /Discovery with Nadia/);
    assert.match(ui.node('#meetings-list').innerHTML, /https:\/\/notes.test\/one\?workspace=work#transcript/);
    assert.match(ui.node('#meetings-list').innerHTML, /codex:\/\/threads\/new\?path=/);
    assert.match(ui.node('#meetings-list').innerHTML, /Nadia needs onboarding in one day/);
    assert.match(ui.node('#meetings-coverage').innerHTML, /Unavailable/);
    ui.node('#meeting-query').oninput({ target: { value: 'no such conversation', selectionStart: 20 } });
    assert.doesNotMatch(ui.node('#meetings-list').innerHTML, /Discovery with Nadia/);
  }
  const policy = { by: 'ann', sources: ['granola/work'], calendars: ['primary'], include: ['Customer conversations'], exclude: ['Personal'], calendar_refresh: 'daily' };
  await call('remember', { by: 'ann', context: 'personal-ann', content: 'Daily refresh of work conversations and calendar.', sources: ['user:ann'], meeting_policy: policy });
  const prompt = dailyRefreshPrompt(brain, 'ann'); assert.match(prompt, /submitted policy/); assert.match(prompt, /must not stop other sources or compilation/);
  assert.ok(readFileSync(join(brain, 'brain/contexts/offer/memories.jsonl'), 'utf8').startsWith(before));
});
test('daily run closes prompt input without reading an open caller stdin',async t=>{
  const root=mkdtempSync(join(tmpdir(),'gtm-daily-input-')),bin=join(root,'bin');t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'brain'));mkdirSync(join(root,'work'));mkdirSync(bin);
  writeFileSync(join(root,'brain/admin.md'),lib.renderFrontmatter({company:'Daily Fixture',team:[{name:'Ann Lee',handle:'ann',email:'ann@fixture.test'}]}));
  writeFileSync(join(bin,'codex'),`#!${process.execPath}\nconst fs=require('node:fs');fs.writeFileSync('work/daily-invocation.json',JSON.stringify({args:process.argv.slice(2),prompt:fs.readFileSync(0,'utf8')}));`,{mode:0o755});
  const child=spawn(process.execPath,[join(plugin,'scripts/gtm-brain-schedule/daily-run.mjs'),root,'ann'],{env:{...process.env,PATH:bin+':'+process.env.PATH},stdio:['pipe','ignore','pipe'],detached:process.platform!=='win32'});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);child.stdin.on('error',()=>{});
  child.stdin.write('Caller input must stay private.');
  const result=await new Promise(resolve=>{const timer=setTimeout(()=>{try{process.platform==='win32'?child.kill('SIGKILL'):process.kill(-child.pid,'SIGKILL')}catch{}resolve('timeout')},6000);child.on('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal})})});
  child.stdin.destroy();assert.deepEqual(result,{code:0,signal:null},stderr);
  const invocation=JSON.parse(readFileSync(join(root,'work/daily-invocation.json'),'utf8'));
  assert.equal(invocation.args.at(-1),'-');assert.ok(!invocation.args.some(arg=>arg.includes('Daily Fixture')));
  assert.match(invocation.prompt,/Run GTM Brain daily maintenance/);
  assert.doesNotMatch(invocation.prompt,/Caller input must stay private/);
});

// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// Review of search that answers in one call (0.35.0, lane R1): the cases a question meets on a real
// brain that the lane's own tests do not. Each one failed on the lane as delivered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import * as lib from '../lib/brain.mjs';
import { answer, search, parsePeriod, SEARCH_MAX_BYTES, ANSWER_ALL_BYTES } from '../lib/memory-search.mjs';
process.env.TZ = 'UTC';
process.env.GTM_BRAIN_NO_COMMIT = '1';
process.env.GTM_BRAIN_NO_COMPILE = '1';
process.env.GTM_BRAIN_NOW = '2026-11-14T12:00:00Z';   // a Saturday
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const now = new Date(process.env.GTM_BRAIN_NOW);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gtm-memory-search-review-'));
  mkdirSync(join(root, 'brain'));
  writeFileSync(join(root, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Search Fixture', team: [{ name: 'Ann Lee', handle: 'ann', email: 'ann@fixture.test' }] }));
  for (const slug of ['sales', 'events']) lib.writeContext(root, slug, { title: slug });
  return root;
}
const note = (root, content, extra = {}, slug = 'sales') => lib.appendMemory(root, slug, { authors: ['ann'], content, ...extra }).rec;
const ids = s => [...new Set((String(s).match(/^(?:\d+\. )?(?:\{"id":")?m_[0-9a-f]{12}/gm) || []).map(x => x.match(/m_[0-9a-f]{12}/)[0]))];

test('a kind, a tag or a period the question names never hides the note that has its words', () => {
  const root = fixture();
  note(root, 'Decided to drop the hackathon.', { kind: 'decision', at: '2026-11-05T10:00:00Z' });
  note(root, 'Decided to keep the dinner.', { kind: 'decision', at: '2026-11-06T10:00:00Z' });
  const hoodies = note(root, 'We agreed the hoodies are ordered in black only.', { at: '2026-10-02T10:00:00Z' });   // saved as a plain note
  const r = answer(root, 'What was the decision on the hoodies?');
  assert.equal(ids(r)[0], hoodies.id, r);
  assert.match(r, /without decisions/, 'and the reply says the kind was dropped');
  const w = answer(root, 'hoodies last week');
  assert.equal(ids(w)[0], hoodies.id, w);
  assert.match(w, /without last week/);
});

test('a first name that is also a month is the person: Jan, April, June, August', () => {
  const root = fixture();
  lib.addName(root, 'Jan Kowalski', { kind: 'person' });
  lib.addName(root, 'April Chen', { kind: 'person' });
  const j = note(root, 'Jan Kowalski wants the contract by Friday.', { people: ['Jan Kowalski'], at: '2026-11-10T10:00:00Z' });
  const a = note(root, 'April Chen asked for a second seat.', { people: ['April Chen'], at: '2026-11-11T10:00:00Z' });
  const r = answer(root, 'What did Jan want?');
  assert.deepEqual(ids(r), [j.id], r);
  assert.doesNotMatch(r, /January/);
  assert.deepEqual(ids(answer(root, 'What did April ask for?')), [a.id]);
  // still a month when it is written as one, or when nobody has that name
  const names = lib.readNames(root), isName = w => !!lib.canonicalName(names, w);
  assert.equal(parsePeriod('what happened in April', now, isName).period.label, 'April 2026');
  assert.equal(parsePeriod('October numbers', now, isName).period.label, 'October 2026');
  assert.equal(parsePeriod('What did Jan want', now, isName).period, null);
});

test('a capitalized first word taken for a name does not hide the notes that have the words', () => {
  const root = fixture();
  lib.addName(root, 'Partner Works', { kind: 'organization' });
  note(root, 'Partner Works renewed for a year.', { people: ['Partner Works'], at: '2026-11-12T10:00:00Z' });
  const real = note(root, 'The reseller onboarding checklist has six steps.', { at: '2026-10-01T10:00:00Z' });
  const r = answer(root, 'Partner onboarding checklist?');
  assert.ok(ids(r).includes(real.id), r);
  assert.equal(ids(r)[0], real.id, r);
});

test('following the last line of a capped reply never asks for a reply many times the cap', () => {
  const root = fixture();
  const long = 'Pipeline review: ' + 'the buyer asked about pricing, onboarding and the security questionnaire. '.repeat(12);
  for (let i = 0; i < 300; i++) note(root, `${long} (${i})`, { at: new Date(Date.UTC(2026, 9, 1 + (i % 28), 10, i % 60)).toISOString() });
  // win-a: the answer reply holds up to its budget and names one sql read of exactly the notes that did not fit
  const a = answer(root, 'pipeline review');
  assert.ok(Buffer.byteLength(a) <= ANSWER_ALL_BYTES, `${Buffer.byteLength(a)} bytes`);
  const rest = a.match(/(\d+) more matching notes? did not fit this reply\. All of them in one more call: query sql SELECT at, context, kind, content, id FROM memories WHERE id IN \(([^)]*)\)/);
  assert.ok(rest, a.slice(-400));
  const listed = rest[2].split(', ').length;
  assert.ok(listed > 0 && listed <= 150, `${listed} ids in the follow-up read`);
  const rows = search(root, 'pipeline review');
  const more = Number(rows.match(/with limit (\d+)/)?.[1]);
  const c = search(root, 'pipeline review', { limit: more });
  assert.ok(Buffer.byteLength(c) <= 3 * SEARCH_MAX_BYTES, `the suggested limit ${more} returned ${Buffer.byteLength(c)} bytes`);
  assert.ok(ids(c).length > ids(rows).length);
});

test('a tag or a source typed as-is is still found when its words also appear in other notes', () => {
  const root = fixture();
  for (let i = 0; i < 5; i++) note(root, `The alpha project deal number ${i} moved a stage.`);
  const tagged = note(root, 'Kickoff is on the ninth.', { tags: ['project:alpha'] });
  const sourced = note(root, 'Renewal signed.', { source: [{ kind: 'hubspot', ref: 'deal/7731' }] });
  assert.equal(ids(search(root, 'project:alpha'))[0], tagged.id);
  assert.equal(ids(search(root, 'deal/7731'))[0], sourced.id);
});

test('a memories search made only of everyday words searches for them, not for every note', () => {
  const root = fixture();
  const hit = note(root, 'The current plan keeps two seats.', { at: '2026-10-01T10:00:00Z' });
  for (let i = 0; i < 5; i++) note(root, `Unrelated note number ${i}.`, { at: '2026-11-10T10:00:00Z' });
  assert.deepEqual(ids(search(root, 'current')), [hit.id]);
  assert.match(search(root, 'whether'), /^no rows/);
});

test('Not found under a filter does not say the whole brain holds nothing', () => {
  const root = fixture();
  note(root, 'The hackathon budget is 2,000 EUR.');
  const r = answer(root, 'hackathon budget', { filters: { context: 'events' } });
  assert.match(r, /^Not found: /);
  assert.doesNotMatch(r, /The brain holds nothing on this/);
  assert.match(r, /filters/);
});

test('odd input never throws: quotes, operators, punctuation, other scripts', () => {
  const root = fixture();
  note(root, 'Pricing review with the buyer. NEAR the end AND OR NOT.');
  for (const s of ['"', '""', '"--"', '"a" "b', 'NEAR(a b)', 'a AND', 'OR', 'NOT x', '*', 'pric*', 'content:pricing', '(', ')', "o'brien's", '#', 'tag:', '#x #y', '^pricing', '-pricing', 'a-b-c-d', '....', '日本語 の メモ', 'żółć gęślą', '🙂 🙂', 'x'.repeat(5000), '2026-99-99', '31 February', 'in 0000', 'last 999 days', 'e_0000000000000000', '{"a":1}', '\\', 'a:b:c', '--', '- -', '" OR 1=1 --', 'pricing "', '@', 'ann@', '.test']) {
    for (const run of [answer, search]) assert.doesNotThrow(() => run(root, s), `${run.name} ${JSON.stringify(s.slice(0, 40))}`);
  }
});

test('the query description fits what Claude Code keeps of a tool description (2048 characters)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gtm-answer-desc-'));
  for (const host of ['', 'claude']) {
    const env = { ...process.env, GTM_BRAIN_NO_OPEN: '1', GTM_BRAIN_NO_SESSION_START: '1', GTM_BRAIN_NO_SAVE_NUDGE: '1', CODEX_HOME: mkdtempSync(join(tmpdir(), 'gtm-answer-home-')), ...(host ? { GTM_BRAIN_HOST: host } : {}) };
    const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ['pipe', 'pipe', 'pipe'], env, cwd: root });
    try {
      const reply = await new Promise(res => { createInterface({ input: server.stdout }).on('line', line => { const m = JSON.parse(line); if (m.id === 1) res(m); }); server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) + '\n'); });
      const query = reply.result.tools.find(t => t.name === 'query');
      assert.ok(query.description.length <= 2048, `${host || 'codex'}: query description is ${query.description.length} characters; the host drops what is past 2048`);
      assert.match(query.description, /^To answer a question from the brain, call query with object answer/);
      assert.match(query.description, /no rows means say so\.$/, 'the last rule is kept');
      for (const view of ['status', 'brief', 'deal', 'relations', 'why', 'rules', 'health', 'population', 'customers', 'meetings', 'SQL']) assert.ok(query.description.includes(view), `${view} is still described`);
    } finally { server.kill(); }
  }
});

// Round three review: what a question meets that the earlier tests did not.
test('one long note never takes a memories search past the cap; the row says where the full text is', () => {
  const root = fixture();
  const big = note(root, 'Transcript: ' + 'the customer talked about onboarding and pricing at length. '.repeat(400));
  const small = note(root, 'Short note on onboarding.');
  const s = search(root, 'onboarding');
  assert.ok(Buffer.byteLength(s) <= SEARCH_MAX_BYTES + 300, `${Buffer.byteLength(s)} bytes`);
  assert.deepEqual(new Set(ids(s)), new Set([big.id, small.id]), s);
  const row = JSON.parse(s.split('\n').find(l => l.includes(big.id)));
  assert.ok(row.content.length < 12000 && row.content_cut > 0, 'the content is cut and says by how much');
  assert.match(s, new RegExp(`${big.id}: content cut .*sql`));
});

test('periods ahead and open-ended: next Thursday, tomorrow, next week, since October, a quarter', () => {
  const p = s => parsePeriod(s, now).period;   // now is Saturday 2026-11-14
  assert.equal(p('what is on next Thursday').label, 'Thursday 2026-11-19');
  assert.equal(p('what is on tomorrow').label, 'tomorrow');
  assert.equal(ymdOf(p('what is on tomorrow').from), '2026-11-15');
  assert.equal(p('plans for next week').label, 'next week');
  assert.equal(ymdOf(p('plans for next week').from), '2026-11-16');
  const since = p('everything since October');
  assert.equal(ymdOf(since.from), '2026-10-01'); assert.equal(ymdOf(since.to), '2026-11-15');
  assert.equal(p('pipeline in Q3').label, 'Q3 2026');
  assert.equal(ymdOf(p('pipeline in Q3').from), '2026-07-01'); assert.equal(ymdOf(p('pipeline in Q3').to), '2026-10-01');
  assert.equal(p('last quarter numbers').label, 'Q3 2026');
  assert.equal(p('this quarter numbers').label, 'Q4 2026');
  // a note about an event next week is found, though nothing was recorded then
  const root = fixture();
  const ev = note(root, 'The partner dinner is on 18 November at 19:00.', { at: '2026-11-02T10:00:00Z' });
  note(root, 'Unrelated note about the venue.', { at: '2026-11-03T10:00:00Z' });
  const r = answer(root, 'What is on next week?');
  assert.deepEqual(ids(r), [ev.id], r);
});
const ymdOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('an answer that cuts a long note says how to read the rest', () => {
  const root = fixture();
  const big = note(root, 'Transcript: ' + 'the customer talked about onboarding and pricing at length. '.repeat(100));
  // win-a: a small brain comes back whole, so the long note is there in full; its best-match pointer is cut
  const a = answer(root, 'onboarding');
  assert.ok(a.includes(big.content.replace(/\s+$/, '')), 'the full note in the list');
  assert.match(a, /more characters\)/);
  assert.ok(Buffer.byteLength(a) <= ANSWER_ALL_BYTES, `${Buffer.byteLength(a)} bytes`);
  assert.doesNotMatch(answer(root, 'nothing like zqxjvbnonsenseword'), /query sql/);
});

test('a first name two people share is said in the reply, not guessed and not searched again', () => {
  const root = fixture();
  lib.addName(root, 'Max Weber', { kind: 'person' });
  lib.addName(root, 'Max Planck', { kind: 'person' });
  const w = note(root, 'Max Weber signed the order form.', { people: ['Max Weber'] });
  const p = note(root, 'Max Planck asked for a demo.', { people: ['Max Planck'] });
  const r = answer(root, 'What did Max sign?');
  assert.match(r, /"Max" could be Max (Weber|Planck) or Max (Weber|Planck); the notes below match the word/);
  assert.equal(ids(r)[0], w.id, r);
  assert.doesNotMatch(r, /narrowed to/);
  assert.doesNotMatch(answer(root, 'What did Max Weber sign?'), /could be/);
  void p;
});

test('a relationship or customer status that changed later: the later note comes with it and the old one says it is no longer current', () => {
  const root = fixture();
  const org = lib.addName(root, 'Saltmarsh Partners', { kind: 'organization' });
  const began = note(root, 'Saltmarsh Partners became a referral partner of ours.', { people: ['Saltmarsh Partners'], at: '2026-01-06T10:00:00Z', source: [{ kind: 'user', ref: 'ann' }], relation: { from: org.id, type: 'partner_of', to: 'us', status: 'current', basis: 'user', observed_at: '2026-01-06T10:00:00Z' } });
  const ended = note(root, 'The partnership with Saltmarsh Partners ended: no co-sold deals in two quarters.', { people: ['Saltmarsh Partners'], at: '2026-06-19T10:00:00Z', source: [{ kind: 'user', ref: 'ann' }], relation: { from: org.id, type: 'partner_of', to: 'us', status: 'ended', basis: 'user', observed_at: '2026-06-19T10:00:00Z' } });
  for (let i = 0; i < 12; i++) note(root, `Saltmarsh Partners partner portal update ${i}.`, { people: ['Saltmarsh Partners'], at: `2026-0${1 + (i % 8)}-1${i % 9}T10:00:00Z` });
  const r = answer(root, 'Is Saltmarsh Partners a partner of ours?');
  const got = ids(r);
  assert.ok(got.includes(ended.id), r);
  if (got.includes(began.id)) {
    assert.equal(got.indexOf(ended.id), got.indexOf(began.id) + 1, 'the later note follows the old one');
    assert.match(r, new RegExp(`${began.id} .*no longer current: partner_of ended 2026-06-19 \\(${ended.id}\\)`));
  }
  assert.match(r, /Ended: partner_of us \(2026-06-19, m_[0-9a-f]{12}\)/, 'the card names the ended relationship');
  const s = search(root, 'partner of ours');
  assert.ok(ids(s).includes(ended.id), s);
  // a customer status: prospect, then customer
  const acme = lib.addName(root, 'Quarry Foods', { kind: 'organization' });
  const was = note(root, 'Attio shows Quarry Foods as prospect.', { people: ['Quarry Foods'], at: '2026-02-01T10:00:00Z', source: [{ kind: 'attio', ref: 'companies/quarry' }], customer: { entity: acme.id, status: 'prospect', basis: 'source', observed_at: '2026-02-01T10:00:00Z' } });
  const now2 = note(root, 'Quarry Foods signed: a customer from today.', { people: ['Quarry Foods'], at: '2026-06-01T10:00:00Z', source: [{ kind: 'attio', ref: 'companies/quarry' }], customer: { entity: acme.id, status: 'customer', basis: 'source', observed_at: '2026-06-01T10:00:00Z' } });
  const q = answer(root, 'Is Quarry Foods a prospect?');
  assert.ok(ids(q).includes(now2.id), q);
  assert.ok(ids(q).indexOf(now2.id) < ids(q).indexOf(was.id) || ids(q).indexOf(now2.id) === ids(q).indexOf(was.id) + 1, q);
  assert.match(q, new RegExp(`${was.id} .*no longer current: customer status customer 2026-06-01 \\(${now2.id}\\)`));
});

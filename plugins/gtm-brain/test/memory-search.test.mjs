// Search that answers in one call (0.35.0, lane R1): stemmed words, one typo, names and periods
// narrowing first, ranking, the byte cap, and query object answer through the MCP server.
// Each test fails on 0.34.5, where search matched the whole text literally and newest first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import * as lib from '../lib/brain.mjs';
import { MemoryIndex, withMemoryIndex, MEMORY_INDEX_VERSION } from '../lib/memory-index.mjs';
import { answer, search, parsePeriod, parseQuestion, SEARCH_MAX_BYTES } from '../lib/memory-search.mjs';
process.env.TZ = 'UTC';
process.env.GTM_BRAIN_NO_COMMIT = '1';
process.env.GTM_BRAIN_NO_COMPILE = '1';
process.env.GTM_BRAIN_NOW = '2026-11-14T12:00:00Z';   // a Saturday
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const now = new Date(process.env.GTM_BRAIN_NOW);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gtm-memory-search-'));
  mkdirSync(join(root, 'brain'));
  writeFileSync(join(root, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Search Fixture', team: [{ name: 'Ann Lee', handle: 'ann', email: 'ann@fixture.test' }] }));
  for (const slug of ['sales', 'events']) lib.writeContext(root, slug, { title: slug });
  return root;
}
const note = (root, content, extra = {}, slug = 'sales') => lib.appendMemory(root, slug, { authors: ['ann'], content, ...extra }).rec;
const ids = s => [...new Set((String(s).match(/^(?:\d+\. )?(?:\{"id":")?m_[0-9a-f]{12}/gm) || []).map(x => x.match(/m_[0-9a-f]{12}/)[0]))];

test('stemmed words: invoice finds invoicing and invoiced, presenting finds presentation, sign-ups finds signups', () => {
  const root = fixture();
  const a = note(root, 'Invoicing for Circuit moves to the first of the month.');
  const b = note(root, 'Circuit invoiced us twice in October.');
  const c = note(root, 'The presentation for the board is ready.');
  const d = note(root, 'The Merantix opening had 350 signups.');
  const e = note(root, 'Unrelated note about the venue.');
  const inv = search(root, 'invoice');
  assert.deepEqual(new Set(ids(inv)), new Set([a.id, b.id]), inv);
  assert.deepEqual(ids(search(root, 'presenting')), [c.id]);
  assert.deepEqual(ids(search(root, 'sign-ups')), [d.id]);
  assert.ok(!ids(search(root, 'invoice')).includes(e.id));
});

test('one typo in a word of five letters or more finds the word, ranked below exact matches, and says what was searched', () => {
  const root = fixture();
  const right = note(root, 'The heliograph demo convinced the buyer.');
  const r = answer(root, 'what about the heliograf');
  assert.deepEqual(ids(r), [right.id], r);
  assert.match(r, /No note has "heliograf"; searched "heliograph" instead\./);
  const t = answer(root, 'the heliogrpah demo');   // two letters swapped
  assert.ok(ids(t).includes(right.id), t);
  // short words are not corrected: "demp" stays a word no note has
  assert.doesNotMatch(answer(root, 'demp'), /searched "demo"/);
  // an exact match outranks a note found through a corrected word
  const exact = note(root, 'Pricing review: the buyer liked the pricing.', { at: '2026-01-01T00:00:00Z' });
  const fuzzy = note(root, 'Pricng review happened.', {});
  const both = ids(search(root, 'pricing review'));
  assert.equal(both[0], exact.id, 'exact first'); assert.ok(both.includes(fuzzy.id) === false || both.indexOf(fuzzy.id) > 0);
});

test('names narrow first: a first name, an alias and a product resolve through the registry; the card has kind, id and age', () => {
  const root = fixture();
  lib.addName(root, 'Zak Borg', { kind: 'person' });
  lib.addName(root, 'GTM Tech Week', { kind: 'organization', aliases: ['GTM Week'] });
  const z1 = note(root, 'Zak Borg wants VIP dinner access in Berlin.', { people: ['Zak Borg'], at: '2026-11-04T10:00:00Z' });
  const z2 = note(root, 'We asked Zak Borg to put his side event on Luma.', { people: ['Zak Borg'], at: '2026-11-12T10:00:00Z' });
  const other = note(root, 'Someone else wants VIP dinner access.');
  const r = answer(root, 'What did Zak want?');
  assert.deepEqual(ids(r).sort(), [z1.id, z2.id].sort(), r);
  assert.match(r, /^Zak Borg · person · e_[0-9a-f]{16} · 2 notes, newest 2026-11-12 \(2 days ago\) · "Zak" is Zak Borg$/m);
  assert.ok(!ids(r).includes(other.id));
  const dinner = answer(root, 'Zak dinner');
  assert.equal(ids(dinner)[0], z1.id, 'the words rank inside the narrowed notes');
  const w = note(root, 'GTM Tech Week Berlin catering is booked.', { people: ['GTM Tech Week'] });
  assert.ok(ids(answer(root, 'GTM Week catering')).includes(w.id));
  // a product stands for its company: the company's notes are found by the product's name
  const kit = lib.addName(root, 'Ultimate Toolkit', { kind: 'product' });
  const org = lib.readNames(root).find(e => e.name === 'GTM Tech Week');
  note(root, 'Ultimate Toolkit belongs to GTM Tech Week.', { people: ['Ultimate Toolkit', 'GTM Tech Week'], source: [{ kind: 'user', ref: 'ann' }], relation: { from: kit.id, type: 'product_of', to: org.id, status: 'current', basis: 'user', observed_at: '2026-11-01T00:00:00Z' } });
  const k = answer(root, 'Ultimate Toolkit catering');
  assert.ok(ids(k).includes(w.id), k); assert.match(k, /GTM Tech Week \(by its product Ultimate Toolkit\)/);
  // lowercase single words are not taken for an alias ("week" is no entity)
  assert.equal(parseQuestion('what happened this week in sales', lib.readNames(root)).entities.length, 0);
});

test('periods: last week, a month and a date narrow by recording time; a weekday also finds notes that mention it', () => {
  const p = (s) => parsePeriod(s, now).period;
  assert.equal(p('decisions last week').label, 'last week');
  assert.equal(p('decisions last week').from.toISOString().slice(0, 10), '2026-11-02');
  assert.equal(p('in October').label, 'October 2026');
  assert.equal(p('what happened on 3 November').label, '3 November 2026');
  assert.equal(p('Thursday night').label, 'Thursday 2026-11-12');
  assert.equal(p('Thursday night').part, 'night');
  assert.equal(p('we may need this'), null, '"may" alone is a verb');
  const root = fixture();
  const lastWeek = note(root, 'Decided to drop the hackathon.', { kind: 'decision', at: '2026-11-05T10:00:00Z' });
  note(root, 'Decided to keep the dinner.', { kind: 'decision', at: '2026-10-20T10:00:00Z' });
  note(root, 'A plain note from last week.', { at: '2026-11-06T10:00:00Z' });
  const r = answer(root, 'What did we decide last week?');
  assert.deepEqual(ids(r), [lastWeek.id], r);
  assert.match(r, /narrowed to last week/);
  const evening = note(root, 'Thursday 19 November at 21:00 is the panel with Markus.', { at: '2026-11-07T10:00:00Z' }, 'events');
  const morning = note(root, 'Thursday breakfast is at 08:00.', { at: '2026-11-07T09:00:00Z' }, 'events');
  note(root, 'Recorded on Thursday, about nothing in particular.', { at: '2026-11-12T10:00:00Z' }, 'events');
  const t = answer(root, 'What is on Thursday night?');
  assert.equal(ids(t)[0], evening.id, t);
  assert.ok(ids(t).indexOf(morning.id) > 0);
  // nothing in the period: said plainly, then the period is dropped
  const old = note(root, 'The hackathon budget is 2,000 EUR.', { at: '2026-09-01T10:00:00Z' });
  const w = answer(root, 'hackathon budget yesterday');
  assert.match(w, /Nothing for yesterday; without yesterday:/);
  assert.equal(ids(w)[0], old.id);
});

test('ranking: the exact phrase over scattered words, newer over older on ties; retracted and superseded notes never appear', () => {
  const root = fixture();
  const scattered = note(root, 'The data team reviewed residency rules, then an audit was planned.', { at: '2026-11-10T10:00:00Z' });
  const phrase = note(root, 'The data residency audit is due in December.', { at: '2026-10-01T10:00:00Z' });
  const r = ids(search(root, 'data residency audit'));
  assert.deepEqual(r.slice(0, 2), [phrase.id, scattered.id]);
  const older = note(root, 'Quartz pilot starts.', { at: '2026-10-01T10:00:00Z' });
  const newer = note(root, 'Quartz pilot starts.', { at: '2026-11-01T10:00:00Z' });
  assert.deepEqual(ids(search(root, 'quartz pilot')), [newer.id, older.id]);
  const wrong = note(root, 'Saltmarsh renewal is 40k.');
  const fixed = note(root, 'Saltmarsh renewal is 45k.', { supersedes: wrong.id });
  const gone = note(root, 'Saltmarsh churned.');
  note(root, 'Withdrawn: the churn note was wrong.', { retracts: gone.id });
  const s = answer(root, 'Saltmarsh renewal');
  assert.ok(ids(s).includes(fixed.id) && !ids(s).includes(wrong.id) && !ids(s).includes(gone.id), s);
  assert.match(s, new RegExp(`${fixed.id} .* replaces ${wrong.id}`));
});

test('one reply stays under the cap, shows date, age, id and source, and its last line says how many more matched', () => {
  const root = fixture();
  const long = 'Pipeline review: ' + 'the buyer asked about pricing, onboarding and the security questionnaire. '.repeat(12);
  for (let i = 0; i < 60; i++) note(root, `${long} (${i})`, { at: new Date(Date.UTC(2026, 9, 1 + (i % 28), 10)).toISOString(), source: [{ kind: 'hubspot', ref: `deal/${i}` }] });
  const a = answer(root, 'pipeline review');
  assert.ok(Buffer.byteLength(a) <= SEARCH_MAX_BYTES, `${Buffer.byteLength(a)} bytes`);
  assert.match(a, /^1\. m_[0-9a-f]{12} · 2026-10-\d\d \(\d+ days ago\) · sales · note · by ann · source: hubspot:deal\/\d+$/m);
  assert.match(a, /\n\d+ more match(es)?\. For them: query object answer with the same search and limit \d+/);
  const rows = search(root, 'pipeline review');
  assert.ok(Buffer.byteLength(rows) <= SEARCH_MAX_BYTES + 300, `${Buffer.byteLength(rows)} bytes`);
  assert.match(rows, /^\d+ rows:\n\{/);
  assert.match(rows, /\n\d+ more match(es)? \(best first above\)\. For more: the same search with limit \d+/);
  const more = search(root, 'pipeline review', { limit: 60 });
  assert.equal(ids(more).length, 60, 'a limit raises the cap');
});

test('a negative answer is cheap and plain', () => {
  const root = fixture();
  note(root, 'Something about pricing.');
  const r = answer(root, 'Did anyone mention zqxjvbnonsenseword?');
  assert.match(r, /^Not found: no note matches "Did anyone mention zqxjvbnonsenseword\?" \(1 notes searched; words: zqxjvbnonsenseword; no note has "zqxjvbnonsenseword" or a spelling one letter off\)\.\nThe brain holds nothing on this\./);
  assert.ok(Buffer.byteLength(r) < 400);
  assert.match(search(root, 'zqxjvbnonsenseword'), /^no rows/);
  // an id, a tag or a source is still found as typed
  const tagged = note(root, 'Tagged note.', { tags: ['launch-x'] });
  assert.deepEqual(ids(search(root, tagged.id)), [tagged.id]);
});

test('the index is version 6 with a stemming tokenizer; a version 5 cache is rebuilt from the source files', () => {
  const root = fixture();
  const n = note(root, 'Invoicing moved.');
  assert.equal(MEMORY_INDEX_VERSION, 8);
  const i = new MemoryIndex(root); i.db.exec('PRAGMA user_version=5'); i.close();
  withMemoryIndex(root, index => {
    assert.equal(index.db.prepare('PRAGMA user_version').get().user_version, 8);
    assert.match(index.db.prepare("SELECT sql FROM sqlite_master WHERE name='keywords'").get().sql, /porter/);
  });
  assert.deepEqual(ids(search(root, 'invoice')), [n.id]);
});

test('query object answer through the MCP server: one call, and the tool says one call is enough', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gtm-answer-mcp-'));
  const env = { ...process.env, GTM_BRAIN_NO_OPEN: '1', GTM_BRAIN_NO_SESSION_START: '1', GTM_BRAIN_NO_SAVE_NUDGE: '1', CODEX_HOME: mkdtempSync(join(tmpdir(), 'gtm-answer-home-')) };
  const { execFileSync } = await import('node:child_process');
  execFileSync('bash', [`${P}/scripts/gtm-brain-setup/setup.sh`, '--company', 'Answer Fixture', '--one-liner', 'Synthetic', '--owner', 'Ann Lee <ann@fixture.test>', '--dashboard', 'on-demand'], { cwd: root, env });
  const by = lib.readAdmin(root).team[0].handle;
  lib.appendMemory(root, 'company', { authors: [by], content: 'Circuit sent the final invoicing reminder.', source: [{ kind: 'gmail', ref: 'thread/1' }] });
  const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ['pipe', 'pipe', 'pipe'], env });
  const pending = new Map(); let seq = 0;
  createInterface({ input: server.stdout }).on('line', line => { const m = JSON.parse(line); pending.get(m.id)?.(m); pending.delete(m.id); });
  const rpc = (method, params) => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const call = (name, args) => rpc('tools/call', { name, arguments: args }).then(m => ({ text: m.result.content.map(c => c.text).join('\n'), isError: !!m.result.isError }));
  try {
    const { result } = await rpc('tools/list', {});
    const query = result.tools.find(t => t.name === 'query');
    assert.ok(query.inputSchema.properties.object.enum.includes('answer'));
    assert.match(query.description, /^To answer a question from the brain, call query with object answer and search = the question as asked: one call/);
    const a = await call('query', { brain: root, object: 'answer', search: 'Did Circuit send an invoice?' });
    assert.ok(!a.isError, a.text); assert.match(a.text, /Circuit sent the final invoicing reminder\./); assert.match(a.text, /source: gmail:thread\/1/);
    const m = await call('query', { brain: root, object: 'memories', search: 'invoice' });
    assert.match(m.text, /^1 row:\n\{/);
    const empty = await call('query', { brain: root, object: 'answer', search: 'zqxjvbnonsenseword' });
    assert.match(empty.text, /^Not found: /);
    const bad = await call('query', { brain: root, object: 'answer', search: 'x', filters: { nope: 1 } });
    assert.ok(bad.isError); assert.match(bad.text, /memories has no field nope/);
    const d = await call('describe_object', { brain: root, name: 'answer' });
    assert.match(d.text, /^answer: a derived read/);
    assert.ok(existsSync(join(root, 'work', 'memory-index.sqlite')));
  } finally { server.kill(); }
});

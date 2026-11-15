// Fewer calls for maintenance work (pass four): several entities in one read (query object entities with
// filters.id / filters.name as lists) and a housekeeping view that carries its evidence (query object
// housekeeping). Both stay under the answer read's 12 KB cap, whatever limit is passed, and end with what to do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
process.env.TZ = 'UTC';
process.env.GTM_BRAIN_NO_COMMIT = '1';
process.env.GTM_BRAIN_NO_COMPILE = '1';
process.env.GTM_BRAIN_NO_WATCH = '1';
process.env.GTM_BRAIN_NOW = '2026-11-14T12:00:00Z';
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), 'gtm-brain-test-home-'));
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const lib = await import(`${P}/lib/brain.mjs`);
const { entityCards, resolveAsked, CARDS_MAX_BYTES, CARDS_MAX_ENTITIES } = await import(`${P}/lib/entity-cards.mjs`);
const { housekeepingText, HOUSEKEEPING_ITEMS } = await import(`${P}/lib/housekeeping.mjs`);
const { rulesReport, ONE_AT_A_TIME } = await import(`${P}/lib/rules-check.mjs`);
const { SEARCH_MAX_BYTES } = await import(`${P}/lib/memory-search.mjs`);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gtm-batch-reads-'));
  mkdirSync(join(root, 'brain'));
  writeFileSync(join(root, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Batch Fixture', team: [{ name: 'Ann Lee', handle: 'ann', email: 'ann@fixture.test' }] }));
  for (const slug of ['sales', 'events']) lib.writeContext(root, slug, { title: slug });
  return root;
}
const note = (root, content, extra = {}, slug = 'sales') => lib.appendMemory(root, slug, { authors: ['ann'], content, ...extra }).rec;
const idOf = (root, name) => lib.readNames(root).find(e => e.name === name).id;
const relation = (from, type, to, at = '2026-10-02T00:00:00Z') => ({ relation: { from, type, to, status: 'current', basis: 'user', observed_at: at }, source: [{ kind: 'user', ref: 'ann' }] });
const bytes = s => Buffer.byteLength(s);

/* people, a company they work at, a partner, two people who share a first name, and a name with a Polish letter */
function people() {
  const root = fixture();
  lib.addName(root, 'Northwind', { kind: 'organization', aliases: ['NW'] });
  lib.addName(root, 'Zak Borg', { emails: ['zak@northwind.test'] });
  lib.addName(root, 'Łukasz Nowak');
  lib.addName(root, 'Tomasz Hill'); lib.addName(root, 'Tomasz Reed');
  lib.addName(root, 'Mira Stone', { aliases: ['Mimi'] });
  const nw = idOf(root, 'Northwind'), zak = idOf(root, 'Zak Borg');
  note(root, 'Northwind became a partner for the Berlin week.', { people: ['Northwind'], ...relation(nw, 'partner_of', 'us') });
  note(root, 'Zak Borg works at Northwind as head of events.', { people: ['Zak Borg', 'Northwind'], ...relation(zak, 'works_at', nw), at: '2026-10-02T10:00:00Z' });
  const long = note(root, `Zak Borg asked for VIP dinner access. ${'He repeated the request in every thread. '.repeat(12)}`, { people: ['Zak Borg'], at: '2026-11-04T10:00:00Z' });
  const newest = note(root, 'We asked Zak Borg to put his side event on Luma.', { people: ['Zak Borg'], at: '2026-11-12T10:00:00Z' });
  note(root, 'Zak Borg sent the floor plan.', { people: ['Zak Borg'], at: '2026-09-01T10:00:00Z' });
  const lukasz = note(root, 'Łukasz Nowak confirmed the workshop slot.', { people: ['Łukasz Nowak'], at: '2026-11-10T10:00:00Z' }, 'events');
  note(root, 'Tomasz Hill runs the Berlin team.', { people: ['Tomasz Hill'] });
  note(root, 'Tomasz Reed handles invoices.', { people: ['Tomasz Reed'] });
  return { root, nw, zak, long, newest, lukasz };
}

test('several entities by id: one card each in the order asked, with kind, id, relation to us, employer and the newest notes cut to 200 characters', () => {
  const { root, nw, zak, long, newest } = people();
  const r = entityCards(root, { ids: [zak, nw] });
  const lines = r.split('\n');
  assert.match(lines[0], /^Entities: 2 asked, 2 found\./);
  assert.match(lines[1], new RegExp(`^1\\. Zak Borg · person · ${zak} · relation to us: partner · works at Northwind \\(since 2026-10-02, m_[0-9a-f]{12}\\) · zak@northwind\\.test · 4 notes$`), lines[1]);
  // newest first, three of the four, each with id, date and age
  assert.match(lines[2], new RegExp(`^   - ${newest.id} · 2026-11-12 \\(2 days ago\\) · sales: We asked Zak Borg`));
  assert.match(lines[3], new RegExp(`^   - ${long.id} · 2026-11-04 \\(10 days ago\\) · sales: Zak Borg asked for VIP dinner access`));
  assert.ok(lines[3].split(': ').slice(1).join(': ').length <= 205 && lines[3].endsWith(' ...'), 'a long note is cut to about 200 characters');
  assert.equal(lines.filter(l => l.startsWith('   - ')).length, 3 + 2, 'three notes for Zak, two for Northwind');
  const org = lines.find(l => l.startsWith('2. '));
  assert.match(org, new RegExp(`^2\\. Northwind · organization · ${nw} · relation to us: partner · people here: Zak Borg · also: NW · 2 notes$`), org);
  assert.match(lines.at(-1), /^Answer from these cards; no second read per entity\..*never search the web/);
});

test('names, aliases, emails and a mix with ids resolve like the single read; the same entity asked twice is one card', () => {
  const { root, nw, zak } = people();
  const r = entityCards(root, { ids: [nw], names: ['Mimi', 'zak@northwind.test', 'zak borg', 'NW'] });
  assert.match(r, /^Entities: 5 asked, 3 found\./);
  assert.match(r, new RegExp(`^1\\. Northwind · organization · ${nw}`, 'm'));
  assert.match(r, /^2\. Mira Stone · person · e_[0-9a-f]{16} · "Mimi" is Mira Stone · relation to us: other · works at: not recorded · also: Mimi · no notes$/m);
  assert.match(r, new RegExp(`^3\\. Zak Borg · person · ${zak} · "zak@northwind\\.test" is Zak Borg`, 'm'));
  assert.match(r, /^4\. "zak borg" is Zak Borg: card 3 above\.$/m);
  assert.match(r, /^5\. "NW" is Northwind: card 1 above\.$/m);
});

test('a name several entities share lists them in one line; a name nobody has says so; neither is guessed', () => {
  const { root } = people();
  const r = entityCards(root, { names: ['Tomasz', 'Nobody Atall', 'Zak Brog'] });
  const amb = r.split('\n').find(l => l.startsWith('1. '));
  assert.match(amb, /^1\. "Tomasz": 2 entities share this name: Tomasz Hill \(person, e_[0-9a-f]{16}\); Tomasz Reed \(person, e_[0-9a-f]{16}\)\. Ask the person which one, or read one by its id\.$/);
  assert.match(r, /^2\. "Nobody Atall": not in the brain \(no name, alias or email matches\)\.$/m);
  assert.match(r, /^3\. "Zak Brog": not in the brain \(no name, alias or email matches; nearest spelling, not confirmed: Zak Borg \(person, e_[0-9a-f]{16}\)\)\.$/m);
  assert.match(r, /^Entities: 3 asked, 0 found, 1 ambiguous, 2 not in the brain\./);
  assert.equal(entityCards(root, { ids: ['e_0000000000000000'] }).split('\n')[1], '1. "e_0000000000000000": not in the brain (no entity has this id).');
});

test('letters folded: "Lukasz" and "Lukasz Nowak" find "Łukasz Nowak"', () => {
  const { root, lukasz } = people();
  const names = lib.readNames(root);
  assert.equal(resolveAsked(names, 'Lukasz Nowak').entity.name, 'Łukasz Nowak');
  assert.equal(resolveAsked(names, 'lukasz').entity.name, 'Łukasz Nowak');
  const r = entityCards(root, { names: ['Lukasz Nowak', 'Lukasz'] });
  assert.match(r, /^1\. Łukasz Nowak · person · e_[0-9a-f]{16} · "Lukasz Nowak" is Łukasz Nowak · /m);
  assert.match(r, new RegExp(`^   - ${lukasz.id} · 2026-11-10 \\(4 days ago\\) · events: Łukasz Nowak confirmed`, 'm'));
  assert.match(r, /^2\. "Lukasz" is Łukasz Nowak: card 1 above\.$/m);
});

test('more than 25 entities: the first 25 are read and the last lines name the rest', () => {
  const root = fixture();
  const all = Array.from({ length: 30 }, (_, i) => `Person${String(i).padStart(2, '0')} Example`);
  for (const n of all) lib.addName(root, n);
  note(root, 'Person00 Example opened the list.', { people: [all[0]] });
  const r = entityCards(root, { names: all });
  assert.equal(CARDS_MAX_ENTITIES, 25);
  assert.match(r, /^Entities: 30 asked, the first 25 read, 25 found\./);
  assert.equal(r.split('\n').filter(l => /^\d+\. Person\d\d Example · person/.test(l)).length, 25);
  assert.match(r, /^Not read \(one call reads at most 25 entities\): Person25 Example, Person26 Example, Person27 Example, Person28 Example, Person29 Example\. Read them with the same call and only these\.$/m);
});

test('the size cap holds with a large limit: notes are dropped before entities, and the reply says so', () => {
  const root = fixture();
  const all = Array.from({ length: 25 }, (_, i) => `Person${String(i).padStart(2, '0')} Example`);
  for (const n of all) lib.addName(root, n);
  for (const n of all) for (let k = 0; k < 4; k++) note(root, `${n} said this in thread ${k}. ${'A long line about the venue and the budget. '.repeat(10)}`, { people: [n], at: `2026-11-0${k + 1}T10:00:00Z` });
  assert.equal(CARDS_MAX_BYTES, SEARCH_MAX_BYTES, 'the same budget as query object answer');
  for (const limit of [undefined, 3, 500]) {
    const r = entityCards(root, { names: all, limit });
    assert.ok(bytes(r) <= CARDS_MAX_BYTES, `limit ${limit}: ${bytes(r)} bytes`);
    assert.equal(r.split('\n').filter(l => /^\d+\. Person\d\d Example · person/.test(l)).length, 25, 'every entity keeps its card');
    const shown = r.split('\n').filter(l => l.startsWith('   - ')).length;
    assert.ok(shown >= 25 && shown < 75, `some notes are shown and some dropped (${shown})`);
    assert.match(r, /^To fit one reply, fewer lines are shown for every card; a larger limit does not change that\. Ask for fewer entities in one call to see three notes each\.$/m);
  }
  // a few entities: three notes each, never more whatever the limit
  const few = entityCards(root, { names: all.slice(0, 3), limit: 500 });
  assert.equal(few.split('\n').filter(l => l.startsWith('   - ')).length, 9);
  assert.doesNotMatch(few, /To fit one reply/);
});

test('a question that names several gets a card for each in the answer read, and what is not recorded is said', async () => {
  const { answer } = await import(`${P}/lib/memory-search.mjs`);
  const { root, zak } = people();
  const r = answer(root, 'Who are Zak Borg, Mira Stone and Tomasz Hill, and where do they work?');
  for (const name of ['Zak Borg', 'Mira Stone', 'Tomasz Hill']) assert.match(r, new RegExp(`^${name} · person · e_[0-9a-f]{16}`, 'm'), name);
  assert.match(r, new RegExp(`^  Relations: works_at Northwind \\(observed 2026-10-02, m_[0-9a-f]{12}\\)$`, 'm'));
  assert.match(r, /^Each one named has its card above; no employer is recorded as a relationship for Mira Stone, Tomasz Hill \(a brief or a note below may name one: say it as written, else say it is not recorded\)\. The cards and the notes below are what the brain holds on them: no brief or search per person is needed\.$/m);
  // one or two names: the answer is as it was
  assert.doesNotMatch(answer(root, 'What did Zak Borg ask Northwind?'), /Each one named/);
  assert.ok(zak);
});

/* seven people known by a first name only (notes with a company and an email) and seven look-alike pairs */
const FIRST = ['Bruno', 'Carla', 'Dario', 'Elena', 'Fabio', 'Greta', 'Hugo'];
const PAIRS = [['Anna Keller', 'Ana Keller'], ['Bea Lind', 'Bee Lind'], ['Cyril Moreau', 'Cyrill Moreau'], ['Dana Novak', 'Danna Novak'], ['Emil Okafor', 'Emile Okafor'], ['Fenna Pruitt', 'Fena Pruitt'], ['Gus Quimby', 'Guss Quimby']];
function untidy({ long = false } = {}) {
  const root = fixture();
  lib.addName(root, 'Northwind', { kind: 'organization' });
  lib.addName(root, 'Bruno Vance', { emails: ['bruno.vance@acme.test'] });
  for (const n of FIRST) lib.addName(root, n);
  for (const [a, b] of PAIRS) { lib.addName(root, a, { emails: [`${a.split(' ')[0].toLowerCase()}@pairs.test`] }); lib.addName(root, b); }
  const notes = {};
  FIRST.forEach((n, i) => {
    notes[n] = [0, 1, 2, 3].map(k => note(root, `${n} from Northwind asked about the stage, write to ${n.toLowerCase()}@northwind.test (thread ${k}).${long ? ' ' + 'More about the stage and the lights. '.repeat(20) : ''}`, { people: [n, 'Northwind'], at: `2026-11-0${k + 1}T0${i}:00:00Z` }));
  });
  for (const [a, b] of PAIRS) {
    note(root, `${a} signed the venue contract.${long ? ' ' + 'More about the contract. '.repeat(20) : ''}`, { people: [a], at: '2026-11-05T10:00:00Z' });
    note(root, `${a} asked for the invoice.`, { people: [a], at: '2026-11-06T10:00:00Z' });
    note(root, `${b} was on the guest list.`, { people: [b], at: '2026-10-01T10:00:00Z' });
  }
  return { root, notes };
}

test('housekeeping: the work list in three groups with counts, and for the first five of each everything needed to ask', () => {
  const { root, notes } = untidy();
  const r = housekeepingText(root);
  const lines = r.split('\n');
  assert.match(lines[0], /^Housekeeping: \d+ things to settle \(7 people known by a first name only, 7 pairs of names that may be the same, \d+ other findings?\)\. Reads only; nothing was changed\.$/);
  assert.match(lines[1], /the first 5 items with their evidence\. This reply is all that is needed to ask about them: no skill file, rule page \(the questions page included\), health or status read and no notes lookup first\. Ask with the question box when the chat has one, else in plain text with numbered choices, and end the turn; preview or change nothing \(no merge preview either\) before the person answers\./);
  assert.ok(lines.includes('People known by a first name only (7; shown 1-5):'));
  assert.ok(lines.includes('Names that may be the same person or company (7; shown 1-5):'));
  // a first-name person: id, the notes that mention them (id, date, age, text), the company and email in those notes, a full name it could be
  const at = lines.findIndex(l => l.startsWith('1. "Bruno" · person · e_'));
  assert.ok(at > 0, r);
  assert.match(lines[at], /· 4 notes, the first 2026-11-01$/);
  assert.match(lines[at + 1], new RegExp(`^   - ${notes.Bruno[3].id} · 2026-11-04 \\(10 days ago\\) · sales: Bruno from Northwind asked about the stage`));
  assert.equal(lines.slice(at + 1, at + 4).every(l => l.startsWith('   - m_')), true, 'three notes');
  assert.equal(lines[at + 4], '   (1 more note not shown)');
  assert.equal(lines[at + 5], '   Companies in those notes: Northwind. Emails in those notes: bruno@northwind.test.');
  assert.match(lines[at + 6], /^   Could be: Bruno Vance · person · e_[0-9a-f]{16} · no notes · bruno\.vance@acme\.test$/);
  assert.match(lines[at + 7], /^   Ask who Bruno is\. 1\) They give the full name: add_name \(name: the full name, aliases: \["Bruno"\]\) 2\) Same as Bruno Vance: merge_entities \(source: e_[0-9a-f]{16}, target: e_[0-9a-f]{16}; preview, then apply with its as_of\) 3\) Not a person: add_name/);
  // a pair: both cards side by side, what a merge would keep, and the two tool calls with ids
  const pair = lines.findIndex(l => l.startsWith('1. Anna Keller / Ana Keller · person'));
  assert.ok(pair > 0, r);
  assert.match(lines[pair + 1], /^   A: Anna Keller · person · e_[0-9a-f]{16} · 2 notes · anna@pairs\.test$/);
  assert.match(lines[pair + 2], /^      newest: m_[0-9a-f]{12} · 2026-11-06 \(8 days ago\) · sales: Anna Keller asked for the invoice\.$/);
  assert.match(lines[pair + 3], /^   B: Ana Keller · person · e_[0-9a-f]{16} · 1 note · no email$/);
  assert.match(lines[pair + 4], /^      newest: m_[0-9a-f]{12} · 2026-10-01 \(44 days ago\) · sales: Ana Keller was on the guest list\.$/);
  const [a, b] = ['Anna Keller', 'Ana Keller'].map(n => idOf(root, n));
  assert.equal(lines[pair + 5], `   A merge would keep Anna Keller (${a}) with "Ana Keller" as an alias, the email anna@pairs.test and 3 notes; ${b} is retired and still resolves. Notes keep their text.`);
  assert.equal(lines[pair + 6], `   Ask whether they are the same. 1) Same: merge_entities (source: ${b}, target: ${a}; preview, then apply with its as_of) 2) Different: add_name (name: "Ana Keller", not_same: ["Anna Keller"]), so it is never asked again`);
  // only five of each, the rest counted with how to get them; the instruction is the last line, in the rules check's words
  assert.equal(lines.filter(l => /^\d+\. "\w+" · person · e_/.test(l)).length, HOUSEKEEPING_ITEMS);
  assert.equal(lines.filter(l => /^\d+\. .* \/ .* · person · nobody has said/.test(l)).length, HOUSEKEEPING_ITEMS);
  assert.match(r, /^Not shown: 2 in "first names", 2 in "same names"\. The same call with filters\.offset 5 returns the next ones; search = "first names", "same names", "other" returns one group\./m);
  assert.equal(lines.at(-1), ONE_AT_A_TIME);
  assert.match(ONE_AT_A_TIME, /^Start with the first item only: say in one line what it is and ask the person, with numbered choices, the first recommended\. Carry out the answer with the tool named, then offer the next\. Do not work through the list by yourself and never search the web to find out who a person is: what the notes do not say stays unknown until the person says it\.$/);
  assert.ok(rulesReport(root).includes(ONE_AT_A_TIME), 'one source for the wording: the rules check ends with the same words');
  assert.ok(bytes(r) <= CARDS_MAX_BYTES, `${bytes(r)} bytes`);
});

test('housekeeping pages with filters.offset and narrows to one group with search', () => {
  const { root } = untidy();
  const next = housekeepingText(root, { offset: 5 });
  assert.ok(next.includes('People known by a first name only (7; shown 6-7):'), next);
  assert.match(next, /^6\. "Greta" · person/m); assert.match(next, /^7\. "Hugo" · person/m);
  assert.doesNotMatch(next, /^\d+\. "Bruno" · person/m);
  assert.doesNotMatch(next, /^Not shown: .*first names/m);
  const same = housekeepingText(root, { search: 'same names' });
  assert.ok(same.includes('Names that may be the same person or company (7; shown 1-5):'));
  assert.ok(!same.includes('People known by a first name only (7'), 'only the group asked for');
  assert.match(same, /^Other groups, not asked for: 7 in "first names"/m);
  assert.match(housekeepingText(root, { search: 'clean up the duplicates' }), /Names that may be the same person or company \(7; shown 1-5\):/);
  assert.equal(same.split('\n').at(-1), ONE_AT_A_TIME);
  const past = housekeepingText(root, { search: 'first names', offset: 50 });
  assert.match(past, /no item 51: the group has 7/);
});

test('housekeeping keeps under the cap with long notes: notes are dropped before items', () => {
  const { root } = untidy({ long: true });
  const r = housekeepingText(root);
  assert.ok(bytes(r) <= CARDS_MAX_BYTES, `${bytes(r)} bytes`);
  assert.equal(r.split('\n').filter(l => /^\d+\. "\w+" · person · e_/.test(l)).length, HOUSEKEEPING_ITEMS, 'five people still shown');
  assert.equal(r.split('\n').at(-1), ONE_AT_A_TIME);
});

test('housekeeping on a tidy brain says there is nothing to settle', () => {
  const root = fixture();
  lib.addName(root, 'Zak Borg');
  note(root, 'Zak Borg sent the floor plan.', { people: ['Zak Borg'] });
  assert.match(housekeepingText(root), /^Housekeeping: nothing to settle\./);
});

/* through the MCP server */
function server() {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(P, 'server', 'server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, GTM_BRAIN_NO_SESSION_START: '1', GTM_BRAIN_NO_SAVE_NUDGE: '1', GTM_BRAIN_NO_RULE_PAGES: '1' } });
  const waiting = new Map(); let next = 0;
  createInterface({ input: child.stdout }).on('line', line => { const m = JSON.parse(line); waiting.get(m.id)?.(m); waiting.delete(m.id); });
  const rpc = (method, params = {}) => new Promise(res => { const id = ++next; waiting.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const query = async args => { const r = (await rpc('tools/call', { name: 'query', arguments: args })).result; return { text: r.content.map(c => c.text).join('\n'), isError: !!r.isError }; };
  return { rpc, query, close: () => child.stdin.end() };
}

test('the server: query entities takes lists (and names typed with commas), query housekeeping is a view, and the descriptions say so within their limits', async () => {
  const { root, zak, nw } = people();
  const s = server();
  try {
    const init = (await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } })).result;
    assert.match(init.instructions, /Housekeeping, tidying or cleaning up the brain \(duplicates included\) starts with query \(object housekeeping\)/);
    assert.match(init.instructions, /Several people or companies are read in one query \(object entities, filters\.name or filters\.id as a list\), never one call each\./);
    const tools = (await s.rpc('tools/list')).result.tools, q = tools.find(t => t.name === 'query');
    assert.ok(q.description.length <= 2048, `query description is ${q.description.length} characters`);
    assert.match(q.description, /housekeeping \(tidying, clean-up, duplicates: the work list with its evidence; start there\)/);
    assert.match(q.description, /Several people or companies in one call: entities with filters\.name or filters\.id as a list \(up to 25\)/);
    assert.ok(q.inputSchema.properties.object.enum.includes('housekeeping'));
    // the sql parameter names its tables with their columns and gives one worked example: no describe_object call first
    const sql = q.inputSchema.properties.sql.description;
    for (const table of ['memories(id, context, kind, at, content', 'members(memory_id, field, value)', 'entities(id, name, kind', 'contexts(slug, title', 'relations(id, from_id, type, to_id', 'keywords: full text']) assert.ok(sql.includes(table), table);
    assert.match(sql, /Example, the notes naming any of several entities: SELECT .* FROM members v JOIN memories m ON m\.id = v\.memory_id .* WHERE v\.field = 'entities' AND v\.value IN \(/);
    assert.ok(sql.length <= 2048, `sql description is ${sql.length} characters`);

    const listed = await s.query({ brain: root, object: 'entities', filters: { id: [zak], name: ['Northwind', 'Tomasz'] }, limit: 500 });
    assert.equal(listed.isError, false, listed.text);
    assert.match(listed.text, /^Entities: 3 asked, 2 found, 1 ambiguous\./);
    assert.match(listed.text, new RegExp(`^1\\. Zak Borg · person · ${zak} · relation to us: partner · works at Northwind`, 'm'));
    assert.match(listed.text, new RegExp(`^2\\. Northwind · organization · ${nw}`, 'm'));
    const typed = await s.query({ brain: root, object: 'entities', search: 'Zak Borg, Northwind and Mira Stone' });
    assert.match(typed.text, /^Entities: 3 asked, 3 found\./);
    // the worked example runs as written, with real ids
    const example = sql.match(/several entities: (SELECT .*)$/)[1].replace("'e_1a2b3c4d5e6f7a8b', 'e_8b7a6f5e4d3c2b1a'", `'${zak}', '${nw}'`);
    const rows = await s.query({ brain: root, sql: example });
    assert.equal(rows.isError, false, rows.text);
    assert.match(rows.text, /^id \| at \| context \| name \| text\n/); assert.match(rows.text, /Zak Borg \| We asked Zak Borg/);
    // the single reads are as they were: one name resolves, a scalar filter returns rows
    const one = await s.query({ brain: root, object: 'entities', search: 'Zak Borg' });
    assert.equal(JSON.parse(one.text).status, 'resolved');
    const rowsOf = await s.query({ brain: root, object: 'entities', filters: { kind: 'organization' } });
    assert.match(rowsOf.text, /"name":"Northwind"/);

    const hk = await s.query({ brain: untidy().root, object: 'housekeeping', filters: { offset: 5 }, search: 'first names' });
    assert.equal(hk.isError, false, hk.text);
    assert.match(hk.text, /People known by a first name only \(7; shown 6-7\):/);
    assert.equal(hk.text.split('\n').at(-1), ONE_AT_A_TIME);
    const described = (await s.rpc('tools/call', { name: 'describe_object', arguments: { brain: root, name: 'housekeeping' } })).result.content[0].text;
    assert.match(described, /^housekeeping: a derived read \(query with object housekeeping/);
    // rules and health are still there
    assert.match((await s.query({ brain: root, object: 'rules' })).text, /^Rules check: /);
  } finally { s.close(); }
});

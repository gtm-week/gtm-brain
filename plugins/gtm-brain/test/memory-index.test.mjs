import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, unlinkSync, statSync, utimesSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import * as lib from '../lib/brain.mjs';
import { MemoryIndex, withMemoryIndex, MAX_RECORD_BYTES } from '../lib/memory-index.mjs';
import { keywordRecall } from '../lib/keyword-recall.mjs';
import { createMemoryReader } from '../server/memory-reader.mjs';
import { memoryIndexMaintenance } from '../lib/memory-maintenance.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
process.env.GTM_BRAIN_NO_COMMIT = '1';
process.env.GTM_BRAIN_NO_COMPILE = '1';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gtm-memory-index-'));
  mkdirSync(join(root, 'brain'));
  writeFileSync(join(root, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Index Fixture', team: [{ name: 'Ann Lee', handle: 'ann', email: 'ann@fixture.test' }] }));
  for (const slug of ['sales', 'partners']) lib.writeContext(root, slug, { title: slug });
  return root;
}
const file = (root, slug = 'sales') => join(root, 'brain/contexts', slug, 'memories.jsonl');
const note = (root, content, extra = {}) => lib.appendMemory(root, 'sales', { authors: ['ann'], content, ...extra }).rec;
function reference(root, filters = {}, search = '', limit = 50) {
  const names = lib.readNames(root);
  let rows = lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories).map(m => ({ ...m, entities: names.filter(n => lib.mentionsIn(names, m).includes(n.name)).map(n => n.id) })));
  rows = rows.filter(row => Object.entries(filters).every(([key, expected]) => (Array.isArray(row[key]) ? row[key] : [row[key]]).some(v => (Array.isArray(expected) ? expected : [expected]).some(w => isDeepStrictEqual(v, w)))));
  if (!Object.hasOwn(filters, 'context')) rows = lib.hideForkCopies(rows);
  if (search) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id)).slice(0, limit);
}

test('indexed queries preserve exact filters, correction scope, fork precedence and text-search order', () => {
  const root = fixture(), entity = lib.addName(root, 'Chris Taylor', { aliases: ['Chris'] });
  const first = note(root, 'Chris discussed procurement approval.', { people: ['Chris'], tags: ['project:launch'], at: '2026-01-01T10:00Z', source: [{ kind: 'fixture', ref: 'https://fixture.test/1' }] });
  const second = note(root, 'Chris approved the procurement.', { supersedes: first.id, kind: 'decision', at: '2026-01-01T10:01:00.001Z' });
  const origin = note(root, 'Original launch planning.', { at: '2026-01-02T10:00Z' });
  lib.appendMemory(root, 'partners', { authors: ['ann'], content: 'Fork launch planning.', kind: 'decision', tags: ['forked:sales'], source: [{ kind: 'memory', ref: origin.id }] });
  // A correction in another context must not suppress this sales record.
  lib.appendMemory(root, 'partners', { authors: ['ann'], content: 'Other context correction.', retracts: second.id });
  for (const filters of [{}, { context: 'sales' }, { context: ['sales', 'partners'] }, { kind: 'note' }, { entities: entity.id }, { authors: ['ann', 'nobody'] }, { tags: 'project:launch' }, { supersedes: first.id }, { source: { ref: origin.id, kind: 'memory' } }, { kind: [] }]) {
    for (const search of ['', 'original', 'procurement']) assert.deepEqual(withMemoryIndex(root, i => i.query({ filters, search })), reference(root, filters, search));
  }
  assert.equal(withMemoryIndex(root, i => i.count()), reference(root).length);
  assert.doesNotMatch(keywordRecall(root, 'procurement'), /discussed procurement/);
  assert.match(keywordRecall(root, 'procurement'), /approved the procurement/);
});

test('warm reads skip parsing; appends, same-size edits, replacement and removed contexts refresh the cache', () => {
  const root = fixture(); note(root, 'Original needle.');
  withMemoryIndex(root, i => assert.equal(i.stats.recordsRead, 1));
  withMemoryIndex(root, i => assert.equal(i.stats.recordsRead, 0));
  note(root, 'Another needle.');
  withMemoryIndex(root, i => { assert.equal(i.stats.recordsRead, 1); assert.equal(i.count(), 2); });
  const before = statSync(file(root)), old = readFileSync(file(root), 'utf8');
  writeFileSync(file(root), old.replace('Original', 'Modified')); utimesSync(file(root), before.atime, before.mtime);
  assert.match(keywordRecall(root, 'Modified'), /Modified needle/);
  assert.doesNotMatch(keywordRecall(root, 'Original'), /Original needle/);
  // A changed prefix followed by appended bytes is a rewrite, not a safe append.
  writeFileSync(file(root), old.replace('Original', 'Replaced'));
  note(root, 'Final needle.');
  withMemoryIndex(root, i => { assert.equal(i.stats.recordsRead, 3); assert.equal(i.stats.rebuiltFiles, 1); });
  unlinkSync(join(root, 'brain/contexts/sales/context.md'));
  assert.equal(withMemoryIndex(root, i => i.count()), 0);
});

test('identity edits and retired IDs refresh projected links while canonical memories keep their bytes', () => {
  const root = fixture(), a = lib.addName(root, 'Christopher Taylor');
  note(root, 'Chrissy discussed the contract.');
  const bytes = readFileSync(file(root), 'utf8');
  assert.equal(withMemoryIndex(root, i => i.query({ filters: { entities: a.id } })).length, 0);
  lib.addName(root, 'Christopher Taylor', { aliases: ['Chrissy'] });
  assert.equal(withMemoryIndex(root, i => i.query({ filters: { entities: a.id } })).length, 1);
  const b = lib.addName(root, 'Chris Taylor');
  const merge = { source: a.id, target: b.id };
  lib.mergeEntities(root, { ...merge, by: 'ann', as_of: lib.mergeEntities(root, merge).as_of });
  assert.equal(withMemoryIndex(root, i => i.query({ filters: { entities: a.id } }))[0].entities[0], b.id);
  assert.equal(readFileSync(file(root), 'utf8'), bytes);
  const path = join(root, lib.resolveEntity(lib.readNames(root), b.id)._path);
  writeFileSync(path, readFileSync(path, 'utf8').replace('kind: person', 'kind: invalid'));
  assert.throws(() => withMemoryIndex(root, i => i.query()), /kind|repair/i);
});

test('streamed parsing rolls back malformed input and reports oversized records or results explicitly', () => {
  const root = fixture(); note(root, 'Keep this record.');
  withMemoryIndex(root, i => assert.equal(i.count(), 1));
  const original = readFileSync(file(root), 'utf8');
  appendFileSync(file(root), '{broken\n');
  assert.throws(() => withMemoryIndex(root, i => i.query()), /Invalid memory JSON.*:2/);
  writeFileSync(file(root), original);
  assert.equal(withMemoryIndex(root, i => i.count()), 1);
  const r = JSON.parse(original.trim());
  writeFileSync(file(root), JSON.stringify({ ...r, content: 'x'.repeat(MAX_RECORD_BYTES + 1) }));
  assert.throws(() => withMemoryIndex(root, i => i.query()), /4 MiB/);
  writeFileSync(file(root), JSON.stringify({ ...r, content: 'x'.repeat(3 * 1024 * 1024) }) + '\n');
  assert.throws(() => withMemoryIndex(root, i => i.query()), /2 MiB/);
  writeFileSync(file(root), original);
  const index = new MemoryIndex(root); index.close();
  unlinkSync(join(root, 'work/memory-index.sqlite'));
  assert.equal(withMemoryIndex(root, i => i.count()), 1);
});

test('prepared entity matcher agrees with the original on ambiguous names, aliases, accents and IDs', () => {
  const names = [
    { id: 'e_1111111111111111', name: 'Chris Taylor', aliases: ['Chrissy', 'Shared', 'CT'], emails: ['chris@fixture.test'], previous_ids: ['e_aaaaaaaaaaaaaaaa'] },
    { id: 'e_2222222222222222', name: 'Chris Jones', aliases: ['Shared'], emails: [] },
    { id: 'e_3333333333333333', name: 'Élodie Dupont', aliases: ['Elodie'], emails: [] },
  ];
  const matcher = lib.createMentionMatcher(names);
  for (const content of ['Chris Taylor met Élodie.', 'Shared and CT are ambiguous.', 'Elodie contacted chris@fixture.test.', 'Chrissy spoke.']) {
    for (const people of [[], ['Chris'], ['Shared'], ['Chrissy', 'Unknown'], ['chris@fixture.test'], ['e_aaaaaaaaaaaaaaaa']]) {
      const memory = { content, people, entities: ['e_2222222222222222'] };
      assert.deepEqual(matcher(memory), lib.mentionsIn(names, memory));
    }
  }
});

test('keyword rank ties retain context order after archive changes and project hits keep their own quota', () => {
  const root = fixture();
  note(root, 'Identical pipeline text.');
  lib.appendMemory(root, 'partners', { authors: ['ann'], content: 'Identical pipeline text.' });
  assert.deepEqual(withMemoryIndex(root, i => i.keywords(['pipeline']).groups[0].map(m => m.context)), ['partners', 'sales']);
  lib.setContextStatus(root, 'partners', 'archived');
  assert.deepEqual(withMemoryIndex(root, i => i.keywords(['pipeline']).groups[0].map(m => m.context)), ['sales', 'partners']);
  for (let i = 0; i < 45; i++) note(root, `Launch evidence ${i}.`, { tags: ['project:launch'] });
  for (let i = 0; i < 44; i++) note(root, `Launch elsewhere ${i}.`);
  withMemoryIndex(root, i => {
    const result = i.keywords(['launch'], 'launch');
    assert.deepEqual(result.counts, [45, 44]);
    assert.deepEqual(result.groups.map(g => g.length), [40, 40]);
    assert.ok(result.groups[0].every(m => m.tags.includes('project:launch')));
    assert.ok(result.groups[1].every(m => !m.tags.includes('project:launch')));
  });
});

test('one queued worker returns stable concurrent search results, bounds admission, and restarts after idle', async () => {
  const root = fixture(); for (let i = 0; i < 12; i++) note(root, `Pipeline approval ${i}.`);
  const reader = createMemoryReader({ idleMs: 10 });
  try {
    const expected = await reader.read(root, 'recall', { query: 'pipeline' });
    const results = await Promise.all(Array.from({ length: 8 }, () => reader.read(root, 'recall', { query: 'pipeline' })));
    assert.ok(results.every(r => r === expected));
    await new Promise(done => setTimeout(done, 30));
    assert.equal(await reader.read(root, 'count'), 12);
    await assert.rejects(reader.read(root, 'recall', { query: 'x'.repeat(65537) }), /64 KiB/);
  } finally { await reader.close(); }
  const bounded = createMemoryReader({ maxPending: 1 });
  try {
    const first = bounded.read(root, 'count');
    await assert.rejects(bounded.read(root, 'count'), /busy/);
    assert.equal(await first, 12);
  } finally { await bounded.close(); }
});

test('the reader still starts after the folder the server was started in is replaced (a Git marketplace refresh)', () => {
  const root = fixture(); note(root, 'Pilot signed.');
  const started = mkdtempSync(join(tmpdir(), 'gtm-memory-cwd-'));
  const script = join(mkdtempSync(join(tmpdir(), 'gtm-memory-cwd-script-')), 'replace.mjs');
  writeFileSync(script, `import { rmSync, mkdirSync } from 'node:fs'; import { createMemoryReader } from ${JSON.stringify(new URL('../server/memory-reader.mjs', import.meta.url).href)};
rmSync(process.cwd(), { recursive: true }); mkdirSync(process.cwd());
const r = createMemoryReader(); console.log(await r.read(${JSON.stringify(root)}, 'count')); await r.close();\n`);
  const out = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', script], { cwd: started, encoding: 'utf8' });
  assert.equal(out.trim(), '1');
});

test('normal appends and corrections touch only affected visibility rows and require no historical hashing', () => {
  const root = fixture(), origin = note(root, 'Origin quartz.');
  for (let n = 0; n < 60; n++) note(root, `Unrelated evidence ${n}.`);
  withMemoryIndex(root, i => i.count());
  note(root, 'A small addition.');
  withMemoryIndex(root, i => { assert.equal(i.stats.recordsRead, 1); assert.equal(i.stats.hashedBytes, 0); assert.equal(i.stats.trustedAppends, 1); assert.equal(i.stats.visibilityRows, 1); });
  const copy = lib.appendMemory(root, 'partners', { authors: ['ann'], content: 'Fork quartz.', tags: ['forked:sales'], source: [{ kind: 'memory', ref: origin.id }] }).rec;
  withMemoryIndex(root, i => { assert.equal(i.stats.visibilityRows, 2); assert.deepEqual(i.keywords(['quartz']).groups[0].map(m => m.id), [copy.id]); });
  lib.appendMemory(root, 'partners', { authors: ['ann'], content: 'Withdraw the fork.', retracts: copy.id });
  withMemoryIndex(root, i => { assert.equal(i.stats.visibilityRows, 3); assert.deepEqual(i.keywords(['quartz']).groups[0].map(m => m.id), [origin.id]); });
  // Removing a context that contains a visible fork restores its origin too.
  const copy2 = lib.appendMemory(root, 'partners', { authors: ['ann'], content: 'Second fork quartz.', tags: ['forked:sales'], source: [{ kind: 'memory', ref: origin.id }] }).rec;
  assert.equal(withMemoryIndex(root, i => i.keywords(['quartz']).groups[0][0].id), copy2.id);
  unlinkSync(join(root, 'brain/contexts/partners/context.md'));
  assert.equal(withMemoryIndex(root, i => i.keywords(['quartz']).groups[0][0].id), origin.id);
});

test('targeted identity refresh preserves shared aliases, first names, accents and historical explicit references', () => {
  const root = fixture(), chris = lib.addName(root, 'Chris Taylor', { aliases: ['Chrissy', 'Élodie-Vendor'] });
  note(root, 'Chrissy discussed quartz.');
  note(root, 'An explicit person.', { people: ['Chris'] });
  note(root, 'Elodie Vendor discussed quartz.');
  for (let n = 0; n < 80; n++) note(root, `Unrelated pipeline evidence ${n}.`);
  withMemoryIndex(root, i => i.count());
  lib.addName(root, 'Chris Jones');
  withMemoryIndex(root, i => { assert.ok(i.stats.relinkedRecords < 10); assert.deepEqual(i.query({ limit: 200 }), reference(root, {}, '', 200)); });
  const names = lib.readNames(root);
  names.find(n => n.name === 'Chris Jones').aliases.push('Chrissy', 'Elodie Vendor');
  lib.writeNames(root, names);
  withMemoryIndex(root, i => { assert.ok(i.stats.relinkedRecords < 10); assert.deepEqual(i.query({ limit: 200 }), reference(root, {}, '', 200)); });
  const reset = lib.readNames(root); reset.find(n => n.name === 'Chris Jones').aliases = [];
  lib.writeNames(root, reset);
  withMemoryIndex(root, i => assert.deepEqual(i.query({ filters: { entities: chris.id } }), reference(root, { entities: chris.id })));
  // A newly registered name discovers content captured before the entity existed.
  note(root, 'Nova Vendor already requested a proposal.');
  withMemoryIndex(root, i => i.count());
  const nova = lib.addName(root, 'Nova Vendor');
  withMemoryIndex(root, i => { assert.equal(i.stats.relinkedRecords, 0, "the entity writer already refreshed its historical links"); assert.equal(i.query({ filters: { entities: nova.id } }).length, 1); });
});

test('rebuild checkpoints survive process death, hide partial results and expose accurate maintenance status', () => {
  const root = fixture(); note(root, 'Checkpoint evidence.');
  const template = JSON.parse(readFileSync(file(root), 'utf8').trim());
  writeFileSync(file(root), Array.from({ length: 1100 }, (_, n) => JSON.stringify({ ...template, id: 'm_' + n.toString(16).padStart(12, '0') })).join('\n') + '\n');
  assert.equal(memoryIndexMaintenance(root).status, 'missing');
  const module = new URL('../lib/memory-index.mjs', import.meta.url).href;
  execFileSync(process.execPath, ['--input-type=module', '-e', `import { MemoryIndex } from ${JSON.stringify(module)}; const index = new MemoryIndex(process.argv[1]); index.sync({ onCheckpoint: stats => { if (stats.recordsRead >= 1000) process.exit(0); } });`, root]);
  const partial = memoryIndexMaintenance(root);
  assert.equal(partial.status, 'rebuilding'); assert.equal(partial.indexed_records, 1000);
  const index = new MemoryIndex(root);
  try { assert.throws(() => index.query(), /No partial search/); index.sync(); assert.equal(index.stats.recordsRead, 100); assert.equal(index.count(), 1100); } finally { index.close(); }
  const ready = memoryIndexMaintenance(root);
  assert.equal(ready.status, 'ready'); assert.equal(ready.indexed_bytes, ready.source_bytes); assert.ok(ready.disk_bytes.database > 0);
  const source = readFileSync(file(root));
  assert.equal(memoryIndexMaintenance(root, { mode: 'rebuild', budget_ms: 5000 }).status, 'ready');
  assert.deepEqual(readFileSync(file(root)), source);
  assert.ok(memoryIndexMaintenance(root).disk_bytes.previous > 0);
});

test('checkpointed refresh recovers changed sources, invalid suffixes and interrupted entity linking', () => {
  const root = fixture();
  for (let n = 0; n < 8; n++) note(root, `Quasar alias evidence ${n}.`);
  let index = new MemoryIndex(root);
  try { index.sync({ maxRecords: 2 }); assert.equal(index.ready, false); assert.throws(() => index.count(), /in progress/); } finally { index.close(); }
  const before = readFileSync(file(root), 'utf8');
  writeFileSync(file(root), before.replace('Quasar', 'Edited'));
  assert.equal(withMemoryIndex(root, i => i.count()), 8);
  assert.match(keywordRecall(root, 'Edited'), /Edited alias/);
  const entity = lib.addName(root, 'Quasar Alias');
  // Simulate a valid manual alias edit, which readers must discover incrementally.
  const identityFile = join(root, entity._path);
  writeFileSync(identityFile, readFileSync(identityFile, 'utf8').replace('aliases: []', 'aliases: [Quasar]'));
  index = new MemoryIndex(root);
  try { index.sync({ maxRecords: 1 }); assert.equal(index.stats.relinkedRecords, 1); assert.equal(index.ready, false); } finally { index.close(); }
  assert.ok(memoryIndexMaintenance(root).pending_entity_records > 0);
  assert.deepEqual(withMemoryIndex(root, i => i.query({ filters: { entities: entity.id } })), reference(root, { entities: entity.id }));
  appendFileSync(file(root), '{invalid\n');
  assert.throws(() => memoryIndexMaintenance(root, { mode: 'refresh' }), /Invalid memory JSON/);
  writeFileSync(file(root), before);
  assert.equal(memoryIndexMaintenance(root, { mode: 'refresh' }).status, 'ready');
});

test('maintenance recovers old schema and corrupt caches without touching source records', () => {
  const root = fixture(); note(root, 'Never lose this evidence.');
  withMemoryIndex(root, i => i.count());
  const source = readFileSync(file(root));
  const index = new MemoryIndex(root); index.db.exec('PRAGMA user_version=1'); index.close();
  assert.equal(memoryIndexMaintenance(root).status, 'incompatible');
  assert.equal(memoryIndexMaintenance(root, { mode: 'refresh' }).status, 'ready');
  writeFileSync(join(root, 'work/memory-index.sqlite'), 'not a SQLite database');
  assert.equal(memoryIndexMaintenance(root).status, 'corrupt');
  assert.equal(memoryIndexMaintenance(root, { mode: 'rebuild' }).status, 'ready');
  assert.deepEqual(readFileSync(file(root)), source);
  assert.equal(withMemoryIndex(root, i => i.count()), 1);
});

test('large normal imports keep an append receipt and a held cache prevents replacement', () => {
  const root = fixture(); note(root, 'Before the import.');
  withMemoryIndex(root, i => i.count());
  for (let n = 0; n < 300; n++) note(root, `Imported note ${n}.`);
  withMemoryIndex(root, i => { assert.equal(i.stats.recordsRead, 300); assert.equal(i.stats.hashedBytes, 0); assert.equal(i.stats.rebuiltFiles, 0); });
  const index = new MemoryIndex(root);
  try {
    assert.equal(memoryIndexMaintenance(root).status, 'busy');
    assert.throws(() => memoryIndexMaintenance(root, { mode: 'rebuild' }), /busy/);
    index.sync(); assert.equal(index.count(), 301);
  } finally { index.close(); }
  assert.equal(memoryIndexMaintenance(root, { mode: 'rebuild' }).status, 'ready');
});

test('queued requests share a total deadline and a terminated worker releases its cache lock', async () => {
  const root = fixture(); note(root, 'Deadline evidence.');
  const reader = createMemoryReader({ timeoutMs: 1 });
  try {
    const outcomes = await Promise.allSettled([reader.read(root, 'count'), reader.read(root, 'count')]);
    assert.ok(outcomes.every(o => o.status === 'rejected' && /including queue wait/.test(o.reason.message)));
  } finally { await reader.close(); }
  const fresh = createMemoryReader();
  try { assert.equal(await fresh.read(root, 'count'), 1); } finally { await fresh.close(); }
});

test('streamed entity evidence snapshots keep the exact existing JSON hash', () => {
  const root = fixture(), entity = lib.addName(root, 'Élodie Quartz');
  note(root, 'Élodie Quartz said "hello".\nA second line.', { people: [entity.name] });
  lib.appendMemory(root, 'partners', { authors: ['ann'], content: 'Élodie Quartz discussed follow-up.', people: [entity.name] });
  const facts = lib.entityFacts(root, entity.id), { path, ...identity } = facts.entity;
  const original = { identity, related_identities: facts.related_identities, contexts: facts.contexts.map(({ refreshed_at, ...c }) => c), file_notes: facts.file_notes };
  assert.equal(facts.as_of, 's_' + createHash('sha256').update(JSON.stringify(original)).digest('hex').slice(0, 16));
});

test('an interrupted cache replacement finishes retiring old sidecars before opening a new database', () => {
  const root = fixture(); note(root, 'Preserved during replacement.');
  withMemoryIndex(root, i => i.count());
  writeFileSync(join(root, 'work/memory-index.reset'), 'reset in progress\n');
  renameSync(join(root, 'work/memory-index.sqlite'), join(root, 'work/memory-index.previous.sqlite'));
  writeFileSync(join(root, 'work/memory-index.sqlite-wal'), 'leftover damaged WAL');
  assert.equal(withMemoryIndex(root, i => i.count()), 1);
  assert.ok(!existsSync(join(root, 'work/memory-index.reset')));
  assert.equal(memoryIndexMaintenance(root).status, 'ready');
});

// The entity registry is parsed once per change, not on every save: saving stays fast as a brain
// gains entities, and every kind of change (a lib write, a hand edit, a same-size edit, a deleted
// file, a new kind in SCHEMA.md, the team in admin.md) is seen on the next read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, utimesSync, unlinkSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { deserialize } from 'node:v8';
import * as lib from '../lib/brain.mjs';
process.env.GTM_BRAIN_NO_COMMIT = '1';
process.env.GTM_BRAIN_NO_COMPILE = '1';
const brainModule = new URL('../lib/brain.mjs', import.meta.url).href;
function fixture(entities = 0) {
  const root = mkdtempSync(join(tmpdir(), 'gtm-registry-cache-'));
  mkdirSync(join(root, 'brain'));
  writeFileSync(join(root, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Cache Fixture', team: [{ name: 'Ann Lee', handle: 'ann', email: 'ann@fixture.test' }] }));
  lib.writeContext(root, 'sales', { title: 'sales' });
  if (entities) lib.writeNames(root, Array.from({ length: entities }, (_, i) => i % 3 === 2
    ? { name: `Company${i} Labs`, kind: 'organization', aliases: [`C${i}`], emails: [] }
    : { name: `Person${i} Surname${i}`, kind: 'person', aliases: [], emails: [`p${i}@fixture.test`] }));
  return root;
}
// The registry as a process that has never read it sees it: the reference for every cached read.
const fresh = root => deserialize(Buffer.from(execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e',
  `const lib = await import(${JSON.stringify(brainModule)}); const { serialize } = await import('node:v8'); process.stdout.write(serialize(lib.readNames(process.argv[1])).toString('base64'));`, root], { encoding: 'utf8' }), 'base64'));
const same = (root, why) => assert.deepStrictEqual(lib.readNames(root), fresh(root), why);

test('a cached registry read is identical to a fresh read after every kind of change', () => {
  const root = fixture();
  const chris = lib.addName(root, 'Chris Taylor', { aliases: ['Chris'], emails: ['chris@acme.test'] });
  lib.addName(root, 'Acme', { kind: 'organization', subtype: 'company' });
  same(root, 'after lib writes');
  const shared = lib.readNamesShared(root);
  assert.equal(lib.readNamesShared(root), shared, 'an unchanged registry is not read again');
  assert.ok(Object.isFrozen(shared) && Object.isFrozen(shared[0]) && Object.isFrozen(shared[0].aliases), 'the shared registry cannot be changed by a reader');

  // A caller may change its copy; the next read is unaffected.
  const copy = lib.readNames(root); copy[0].aliases.push('Changed'); copy.push({ name: 'Ghost' });
  same(root, 'a changed copy does not leak into the cache');

  // A hand edit in place (an editor), then one of the same size with the old modification time put back.
  const file = join(root, lib.readNames(root).find(e => e.id === chris.id)._path), text = readFileSync(file, 'utf8');
  writeFileSync(file, text.replace('aliases: [Chris]', 'aliases: [Chris, CT]'));
  same(root, 'after a hand edit');
  assert.ok(lib.readNames(root).find(e => e.id === chris.id).aliases.includes('CT'));
  const before = statSync(file), edited = readFileSync(file, 'utf8').replace('CT', 'KT');
  writeFileSync(file, edited); utimesSync(file, before.atime, before.mtime);
  same(root, 'after a same-size edit with the old modification time');
  assert.ok(lib.readNames(root).find(e => e.id === chris.id).aliases.includes('KT'));

  // The team in admin.md is part of the registry.
  const admin = join(root, 'brain', 'admin.md');
  writeFileSync(admin, readFileSync(admin, 'utf8').replace('team:', 'team:\n  - { name: "Bo Diaz", handle: bo, email: "bo@fixture.test" }'));
  same(root, 'after a team change in admin.md');
  assert.ok(lib.readNames(root).some(e => e.name === 'Bo Diaz'));

  // A legacy registry file, then a deleted entity file.
  writeFileSync(join(root, 'brain', 'names.md'), '- Dana Fox | aliases: Dana\n');
  same(root, 'after a legacy names.md appears');
  unlinkSync(join(root, 'brain', 'names.md'));
  unlinkSync(file);
  same(root, 'after an entity file is deleted');
  assert.ok(!lib.readNames(root).some(e => e.id === chris.id));

  // A broken file is reported on every read, never served from the cache.
  const acme = join(root, lib.readNames(root).find(e => e.name === 'Acme')._path), good = readFileSync(acme, 'utf8');
  writeFileSync(acme, good.replace(/^id: .*$/m, 'id: broken'));
  assert.throws(() => lib.readNames(root), /Cannot parse/);
  assert.throws(() => lib.readNames(root), /Cannot parse/);
  writeFileSync(acme, good);
  same(root, 'after the broken file is repaired');
});

test('saving a note does not get slower as the registry grows', () => {
  const timed = root => {
    const reg = lib.readNames(root), times = [];
    for (let i = 0; i < 25; i++) {
      const started = performance.now();
      lib.appendMemory(root, 'sales', { authors: ['ann'], content: `Note ${i}: ${reg[(i * 7) % reg.length].name} asked for the pilot price.` });
      times.push(performance.now() - started);
    }
    return times.sort((a, b) => a - b)[12];
  };
  const small = timed(fixture(20)), large = timed(fixture(600));
  // Parsing 600 entity files on every save took about 40 ms a note on main; reading them once
  // leaves a stat per file. The bound is loose for a loaded machine, the growth bound is the point.
  assert.ok(large < 30, `600 entities: ${large.toFixed(1)} ms a note`);
  assert.ok(large < small * 4 + 10, `20 entities ${small.toFixed(1)} ms, 600 entities ${large.toFixed(1)} ms a note`);
});

// Review additions. The lookup tables behind mentionsIn must give the answers the plain scan gave,
// on registries built to collide: shared first names, an alias two entities claim, a name that is
// another entity's alias, emails, retired IDs, accents, two-letter aliases, an empty alias.
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function scanMentions(names, memory) {   // the implementation before the tables, kept as the reference
  const mentions = [...(memory.entities || []), ...(memory.people || [])].filter(p => names.filter(n => lib.exactName([n], p)).length <= 1);
  const out = lib.resolvePeople(names, mentions), text = ' ' + fold(memory.content).replace(/[^a-z0-9]+/g, ' ') + ' ';
  const owners = new Map(), normalized = s => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
  for (const n of names) for (const form of [n.name, ...n.aliases].map(normalized)) { if (!owners.has(form)) owners.set(form, new Set()); owners.get(form).add(n.name); }
  for (const n of names) {
    if (out.includes(n.name)) continue;
    const forms = [n.name, ...n.aliases].filter(f => !f.includes('@')).map(normalized).filter(f => f.length >= 3 && owners.get(f).size === 1);
    if (forms.some(f => text.includes(' ' + f + ' '))) out.push(n.name);
  }
  return out;
}
const frozen = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(frozen); } return value; };
test('mentionsIn with lookup tables answers as the plain scan did, on colliding registries', () => {
  let seed = 20261114;
  const rnd = n => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) % n; }, pick = list => list[rnd(list.length)];
  const norm = s => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
  let sharedAliasInText = 0, sharedExactMention = 0, firstNameOnly = 0;
  const firsts = ['Chris', 'chris', 'Zoë', 'Zoe', 'Ann', 'Łukasz', 'Jo', 'Maria-Luisa', 'O\'Neil', ' Sam'], lasts = ['Taylor', 'Evans', 'Lee', 'Nowak', 'de la Cruz', 'Labs', 'Group GmbH', ''];
  const hex = () => 'e_' + Array.from({ length: 16 }, () => '0123456789abcdef'[rnd(16)]).join('');
  let compared = 0, found = 0;
  for (let round = 0; round < 60; round++) {
    const ids = Array.from({ length: 14 }, hex), names = [];
    for (let i = 0; i < 12; i++) {
      const name = `${pick(firsts)} ${pick(lasts)}`.replace(/ $/, '') || 'Solo';
      const pool = [pick(firsts), `${pick(firsts)} ${pick(lasts)}`.trim(), 'CT', 'X', '', `${pick(firsts).trim().toLowerCase()}@acme.test`, 'ACME', 'Acme Labs', pick(lasts)];
      names.push({ id: ids[i], name, aliases: Array.from({ length: rnd(4) }, () => pick(pool)), emails: rnd(3) ? [] : [`${pick(firsts).trim()}@Acme.test`], previous_ids: rnd(4) ? [] : [pick(ids)], kind: 'person' });
    }
    const shared = frozen(JSON.parse(JSON.stringify(names)));
    for (let m = 0; m < 25; m++) {
      const n = pick(names), forms = [n.name, ...n.aliases, ...n.emails, n.id, ...n.previous_ids, n.name.split(/\s+/)[0], n.name.toUpperCase(), ` ${n.name} `, 'Nobody Known', '', null, 'chris', 'Chris'];
      const memory = { people: Array.from({ length: rnd(4) }, () => pick(forms)), entities: rnd(3) ? undefined : [pick(forms)],
        content: Array.from({ length: 1 + rnd(4) }, () => { const x = pick(names); return `met ${pick([x.name, ...x.aliases, x.name.toUpperCase(), fold(x.name)])}, then`; }).join(' ') + ' left.' };
      const expected = scanMentions(names, memory);
      assert.deepStrictEqual(lib.mentionsIn(names, memory), expected, `plain registry, round ${round}: ${JSON.stringify(memory)}`);
      assert.deepStrictEqual(lib.mentionsIn(shared, memory), expected, `frozen registry, round ${round}: ${JSON.stringify(memory)}`);
      compared++; found += expected.length;
      // What the notes exercised: a name form two entities own in the text, a mention two entities
      // match exactly, a first name that resolves only by inference.
      const text = ' ' + norm(memory.content) + ' ', owned = form => new Set(names.filter(x => [x.name, ...x.aliases].map(norm).includes(form)).map(x => x.name)).size;
      if (names.some(x => [x.name, ...x.aliases].map(norm).some(f => f.length >= 3 && text.includes(' ' + f + ' ') && owned(f) > 1))) sharedAliasInText++;
      for (const p of [...(memory.entities || []), ...memory.people]) {
        if (names.filter(x => lib.exactName([x], p)).length > 1) sharedExactMention++;
        else if (!lib.exactName(names, p) && lib.inferredName(names, p)) firstNameOnly++;
      }
    }
  }
  assert.ok(compared === 1500 && found > 1500, `the comparison saw real mentions (${found} over ${compared} notes)`);
  assert.ok(sharedAliasInText > 50 && sharedExactMention > 50 && firstNameOnly > 10, `the hard cases were present: ${JSON.stringify({ sharedAliasInText, sharedExactMention, firstNameOnly })}`);
});

test('a kind added to or taken out of SCHEMA.md is seen by the next registry read', () => {
  const root = fixture();
  const venue = lib.addName(root, 'Hala Stulecia', { kind: 'organization' });
  const file = join(root, lib.readNames(root).find(e => e.id === venue.id)._path), text = readFileSync(file, 'utf8');
  const schemaFile = join(root, 'SCHEMA.md'), template = readFileSync(new URL('../templates/SCHEMA.md', import.meta.url), 'utf8');
  const withVenue = template.replace('## Relationships', '## Venue\n\n| Field | What it means | Required |\n| --- | --- | --- |\n| capacity | Seats | no |\n\n## Relationships');
  writeFileSync(schemaFile, withVenue);
  writeFileSync(file, text.replace(/^kind: .*$/m, 'kind: venue').replace(/^subtype: .*\n/m, ''));
  assert.equal(lib.readNames(root).find(e => e.id === venue.id).kind, 'venue', 'a kind SCHEMA.md declares is accepted');
  same(root, 'with a kind from SCHEMA.md');
  assert.equal(lib.readNamesShared(root).find(e => e.id === venue.id).kind, 'venue');
  // The entity file is untouched; only SCHEMA.md changes. The cached parse must not be served.
  writeFileSync(schemaFile, template);
  assert.throws(() => lib.readNames(root), /venue/, 'a kind taken out of SCHEMA.md is not served from the cache');
  assert.throws(() => lib.readNamesShared(root), /venue/);
  writeFileSync(schemaFile, withVenue);
  assert.equal(lib.readNames(root).find(e => e.id === venue.id).kind, 'venue', 'and is back when the section is');
  same(root, 'after the kind is back in SCHEMA.md');
});

test('a save sees an entity another process added, and never changes the shared registry', () => {
  const root = fixture(30);
  const before = lib.readNamesShared(root), snapshot = JSON.stringify(before);
  lib.appendMemory(root, 'sales', { authors: ['ann'], content: 'Person0 Surname0 asked about Company2 Labs.', people: ['Person1 Surname1'] });
  execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e',
    `process.env.GTM_BRAIN_NO_COMMIT = '1'; process.env.GTM_BRAIN_NO_COMPILE = '1'; const lib = await import(${JSON.stringify(brainModule)}); lib.addName(process.argv[1], 'Quentin Outsider', { aliases: ['Quentin O'] });`, root]);
  const saved = lib.appendMemory(root, 'sales', { authors: ['ann'], content: 'Quentin Outsider wants the pilot.' });
  const added = lib.readNames(root).find(e => e.name === 'Quentin Outsider');
  assert.ok(added, 'the entity the other process wrote is in the registry');
  const record = JSON.parse(readFileSync(join(root, 'brain', 'contexts', 'sales', 'memories.jsonl'), 'utf8').trim().split('\n').pop());
  assert.ok(record.content.includes('Quentin') && record.entities.includes(added.id), 'the save right after links the new entity');
  assert.equal(JSON.stringify(before), snapshot, 'the registry handed out before is unchanged');
  assert.notEqual(lib.readNamesShared(root), before, 'and a new one replaced it');
  void saved;
});

// Round three review. The memory reader is a worker with a 64 MB heap: a registry whose files
// are a large part of that heap is not held between reads there (it would leave no room for
// the read itself), while the main process keeps it.
test('entity files too large for a small heap are read again each time instead of being kept', async () => {
  const root = fixture(), pad = '\n' + 'Handwritten account history, kept as the person wrote it. '.repeat(1500) + '\n';
  for (let i = 0; i < 40; i++) lib.addName(root, `Big${i} Person${i}`);
  for (const e of lib.readNames(root)) if (e._path) appendFileSync(join(root, e._path), pad);
  assert.equal(lib.readNamesShared(root), lib.readNamesShared(root), 'the main process keeps the registry');
  const { Worker } = await import('node:worker_threads');
  const result = await new Promise((resolve, reject) => {
    const w = new Worker(`const { workerData, parentPort } = require('node:worker_threads');
      import(workerData.brainModule).then(lib => { const a = lib.readNamesShared(workerData.root), b = lib.readNamesShared(workerData.root);
        parentPort.postMessage({ kept: a === b, count: a.length, same: JSON.stringify(a) === JSON.stringify(b) }); }, e => parentPort.postMessage({ error: e.message }));`,
      { eval: true, workerData: { brainModule, root }, resourceLimits: { maxOldGenerationSizeMb: 12, maxYoungGenerationSizeMb: 4 } });
    w.once('message', m => { w.terminate(); resolve(m); }); w.once('error', reject);
  });
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result, { kept: false, count: lib.readNames(root).length, same: true });
});

// compile, the entities listing and the meetings view call mentionsIn once per note with a
// registry they may change: that path keeps nothing, and with the name forms folded once per
// process it costs clearly less than the plain scan (which folds every name on every note).
test('mentionsIn on a changeable registry is faster than the plain scan it replaced', () => {
  const names = lib.readNames(fixture(900));
  const notes = Array.from({ length: 40 }, (_, i) => ({ people: [names[i * 7].name], content: `${names[i * 11].name} met ${names[i * 13].name} about the pilot.` }));
  const time = fn => { const runs = []; for (let r = 0; r < 5; r++) { const t = performance.now(); for (const m of notes) fn(names, m); runs.push(performance.now() - t); } return runs.sort((a, b) => a - b)[2]; };
  for (const m of notes) assert.deepStrictEqual(lib.mentionsIn(names, m), scanMentions(names, m));
  const plain = time(scanMentions), now = time(lib.mentionsIn);
  assert.ok(now < plain * 0.8, `plain scan ${plain.toFixed(1)} ms, mentionsIn ${now.toFixed(1)} ms for ${notes.length} notes`);
});

// The first save after an index rebuild (an upgrade that changes the index version does one)
// rewrites every entity page inside that save. Each page built a name matcher over the whole
// registry it never used, so that save grew with the square of the entities: 20 s at 1,750.
test('rewriting every entity page costs the same per page as the registry grows', async () => {
  const { refreshEntityPages } = await import('../lib/entities.mjs');
  const perPage = count => {
    const root = fixture(count);
    for (const e of lib.readNames(root).slice(0, count)) lib.appendMemory(root, 'sales', { authors: ['ann'], content: `${e.name} asked about the pilot.` });
    refreshEntityPages(root);
    unlinkSync(join(root, 'work', 'entity-pages.json'));   // as after a rebuild: no page is known to be current
    const started = performance.now(); refreshEntityPages(root);
    return (performance.now() - started) / count;
  };
  const small = perPage(100), large = perPage(800);
  assert.ok(large < small * 1.8 + 0.2, `100 entities ${small.toFixed(2)} ms a page, 800 entities ${large.toFixed(2)} ms a page`);
});

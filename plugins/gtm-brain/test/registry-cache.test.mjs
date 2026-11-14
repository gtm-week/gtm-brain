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

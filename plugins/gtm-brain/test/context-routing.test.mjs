process.env.GTM_BRAIN_NO_WATCH = '1';
process.env.GTM_BRAIN_NO_COMPILE = '1';
process.env.GTM_BRAIN_NO_COMMIT = '1';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as lib from '../lib/brain.mjs';
import { keywordRecall } from '../lib/keyword-recall.mjs';
import { contextRoutingCases } from './live/context-routing-cases.mjs';
const P = new URL('../', import.meta.url).pathname;

test('routing references resolve from every owning workflow', () => {
  for (const relative of ['gtm-brain-use-brain/SKILL.md', 'gtm-brain-use-brain/references/load-context.md', 'gtm-brain-use-brain/references/create-context.md',
    'gtm-brain-use-brain/references/recall.md', 'gtm-brain-use-brain/references/remember.md']) {
    const file = join(P, 'skills', relative);
    const links = [...readFileSync(file, 'utf8').matchAll(/\]\(([^)]*context-routing\.md)\)/g)];
    assert.equal(links.length, 1, relative);
    assert.ok(existsSync(resolve(dirname(file), links[0][1])), relative);
  }
  assert.equal(new Set(contextRoutingCases.map(c => c.name)).size, contextRoutingCases.length);
  for (const c of contextRoutingCases) assert.ok(c.prompt && c.expect && typeof c.calls === 'function' && typeof c.verify === 'function');
});

test('supporting recall preserves loaded scope and records while applying corrections', () => {
  const root = mkdtempSync(join(tmpdir(), 'gtm-context-routing-'));
  mkdirSync(join(root, 'brain'), { recursive: true });
  writeFileSync(join(root, 'brain/admin.md'), '---\ncompany: Fixture\n---\n');
  lib.writeContext(root, 'strategy', { title: 'Strategy', rule: 'Strategic decisions.' });
  lib.writeContext(root, 'offer', { title: 'Our offer', rule: 'Pricing and packaging.' });
  const { rec: old } = lib.appendMemory(root, 'offer', { authors: ['tester'], content: 'Pilot pricing is per user.' });
  lib.appendMemory(root, 'offer', { authors: ['tester'], content: 'Pilot pricing is per store.', supersedes: old.id });
  lib.writeLoaded(root, ['strategy']);
  const path = join(root, 'brain/contexts/offer/memories.jsonl');
  const before = readFileSync(path, 'utf8');
  const hits = keywordRecall(root, 'Pilot');
  assert.match(hits, /per store/);
  assert.doesNotMatch(hits, /per user/);
  assert.deepEqual(lib.readLoaded(root), ['strategy']);
  assert.equal(readFileSync(path, 'utf8'), before);
  execFileSync(process.execPath, [join(P, 'scripts/gtm-brain-load/load.mjs'), root, 'offer', '--last', '0'],
    { env: process.env, stdio: 'pipe' });
  assert.deepEqual(lib.readLoaded(root), ['strategy', 'offer']);
  assert.equal(readFileSync(path, 'utf8'), before);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const plugin = fileURLToPath(new URL('../', import.meta.url));
test('research methods are self-contained and match the reviewed export receipt', () => {
  const repo = resolve(plugin, '../..');
  const receipt = JSON.parse(readFileSync(resolve(repo, 'docs/research-source.json')));
  for (const file of receipt.files) {
    const data = readFileSync(resolve(repo, file.target));
    assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256, file.target);
  }
  for (const name of ['gtmb-topic-analyzer', 'gtmb-audience-loop']) {
    const file = resolve(plugin, 'skills', name, 'SKILL.md');
    const body = readFileSync(file, 'utf8');
    for (const match of body.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
      if (!match[1].includes('://')) assert.ok(existsSync(resolve(dirname(file), match[1])), match[1]);
    }
  }
});

test('mock evaluation cases reference only pinned existing files, with separate expected outcomes', () => {
  const root = new URL('./research/', import.meta.url);
  const cases = JSON.parse(readFileSync(new URL('cases.json', root)));
  const fixture = JSON.parse(readFileSync(new URL('fixture.json', root)));
  const gold = JSON.parse(readFileSync(new URL('gold.json', root)));
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  for (const item of cases) {
    assert.ok(gold.cases[item.id]);
    assert.ok(!Object.hasOwn(item, 'expect'));
    for (const file of item.files) assert.match(fixture.files[file], /^[0-9a-f]{64}$/);
  }
  assert.equal(fixture.revision, '2a1e5c7bd6c4d47e30b7f30942bd300147b55bf7');
});

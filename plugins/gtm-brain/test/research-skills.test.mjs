import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const plugin = fileURLToPath(new URL('../', import.meta.url));
test('research skill references resolve within the plugin', () => {
  for (const name of ['gtmb-topic-analyzer', 'gtmb-audience-loop']) {
    const root = resolve(plugin, 'skills', name);
    for (const relative of readdirSync(root, { recursive: true }).filter(p => p.endsWith('.md'))) {
      const file = resolve(root, relative), body = readFileSync(file, 'utf8');
      for (const match of body.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
        if (match[1].includes('://')) continue;
        const target = resolve(dirname(file), match[1]);
        assert.ok(target.startsWith(plugin), `Reference leaves plugin: ${match[1]}`);
        assert.ok(existsSync(target), `Missing reference: ${match[1]}`);
      }
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

import { citationChecks } from './research/reader-checks.mjs';
test('evaluation rejects invented post and reply citations while allowing tracking variants', () => {
  const post = 'https://www.linkedin.com/posts/example_a-topic-activity-123-abc';
  const comment = `${post}?commentUrn=urn%3Ali%3Acomment%3A456`;
  const snapshots = [{ data: { url: post, comments: [{ url: comment }] } }];
  const check = text => citationChecks(text, snapshots).source_citations;
  assert.equal(check(`[source](${post}?utm_source=share)`), true);
  assert.equal(check(`[reply](<${comment}&utm_medium=web>)`), true);
  assert.equal(check(`Source: ${comment}.`), true);
  assert.equal(check('[source](https://www.linkedin.com/posts/example)'), false);
  assert.equal(check(`[reply](${comment}&replyUrn=urn%3Ali%3Acomment%3A999)`), false);
  assert.equal(check('Source: https://www.linkedin.com/posts/invented.'), false);
  assert.equal(check('Source: saved-post.json'), true);
});

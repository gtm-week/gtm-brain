// gtm-brain-clay-setup (0.35.0): Clay connected on the person's yes (its MCP, or its plugin and CLI),
// a free search from the brain first, credits spent only on a yes, and Clay ends up in the brain's tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const R = resolve(P, '../..');
const file = join(P, 'skills/gtm-brain-clay-setup/SKILL.md');
const skill = readFileSync(file, 'utf8');

test('the Clay setup skill follows the shipped-skill template: name, links, openai.yaml, catalog and docs', () => {
  assert.match(skill, /^---\nname: gtm-brain-clay-setup\n/);
  for (const [, ref] of skill.matchAll(/\]\(([^)]+\.md)\)/g)) assert.ok(existsSync(resolve(dirname(file), ref)), ref);
  assert.match(readFileSync(join(P, 'skills/gtm-brain-clay-setup/agents/openai.yaml'), 'utf8'), /display_name: "GTM Brain: Set up Clay"/);
  const catalog = JSON.parse(readFileSync(join(P, 'scripts/gtm-brain-render/skill-catalog.json'), 'utf8'));
  const i = catalog.findIndex(s => s.id === 'gtm-brain-clay-setup');
  assert.ok(i > 0 && catalog[i].group === 'setup' && catalog[i].featured === false);
  for (const doc of ['README.md', 'COMMANDS.md', 'ONBOARDING.md']) assert.match(readFileSync(join(R, doc), 'utf8'), /gtm-brain-clay-setup/, doc);
});

test('Clay is added on the person\'s yes and the sign-in stays theirs', () => {
  assert.match(skill, /codex plugin marketplace add clay-run\/agent-plugins/);
  assert.match(skill, /Never run\s+the sign-in yourself/);
  assert.match(skill, /Never ask for a Clay API key/);
});

test('reads the brain before asking and never invents companies or personas', () => {
  assert.match(skill, /slug `icp`/);
  assert.match(skill, /Never add\s+a company the brain does not name, and never invent a persona/);
});

test('search is free and first; credits are spent only on a yes for that enrichment', () => {
  assert.match(skill, /## 3\. Search first, free/);
  assert.match(skill, /Never spends credits without a yes for that enrichment/);
});

test('Clay ends up in the brain tools: a read test with mark_tool, a note naming it, then check_tools', () => {
  assert.match(skill, /call\s+`mark_tool` with tool `Clay`, status `ok`/);
  assert.match(skill, /tools: \["Clay"\]/);
  assert.match(skill, /Then call `check_tools`\./);
});

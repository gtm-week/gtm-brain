// gtmb-freckle-setup (0.35.0): Freckle connected over its MCP on the person's yes, its first plan
// drafted from the brain, credits spent only on a yes, and Freckle ends up in the brain's tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const R = resolve(P, '../..');
const file = join(P, 'skills/gtmb-freckle-setup/SKILL.md');
const skill = readFileSync(file, 'utf8');

test('the Freckle setup skill follows the shipped-skill template: name, links, openai.yaml, catalog and docs', () => {
  assert.match(skill, /^---\nname: gtmb-freckle-setup\n/);
  for (const [, ref] of skill.matchAll(/\]\(([^)]+\.md)\)/g)) assert.ok(existsSync(resolve(dirname(file), ref)), ref);
  assert.match(readFileSync(join(P, 'skills/gtmb-freckle-setup/agents/openai.yaml'), 'utf8'), /display_name: "GTM Brain: Set up Freckle"/);
  const catalog = JSON.parse(readFileSync(join(P, 'scripts/gtm-brain-render/skill-catalog.json'), 'utf8'));
  const i = catalog.findIndex(s => s.id === 'gtmb-freckle-setup');
  assert.ok(i > 0 && catalog[i].group === 'setup' && catalog[i].featured === false);
  for (const doc of ['README.md', 'docs/COMMANDS.md', 'docs/ONBOARDING.md']) assert.match(readFileSync(join(R, doc), 'utf8'), /gtmb-freckle-setup/, doc);
});

test('the MCP is added on the person\'s yes and the sign-in stays theirs', () => {
  assert.match(skill, /codex mcp add freckle --url https:\/\/next-api\.freckle\.io\/mcp\/full/);
  assert.match(skill, /Never run the login yourself/);
  assert.match(skill, /never ask for one/);
});

test('reads the brain before asking and never invents companies or personas', () => {
  assert.ok(skill.includes('`icp`'));
  assert.match(skill, /slug `icp`/);
  assert.match(skill, /Never add a company the brain does not name, and never invent a persona/);
});

test('credits are spent only on a yes for that run', () => {
  assert.match(skill, /Build on a yes, run on a second yes/);
  assert.match(skill, /Never spends credits without a yes for that run/);
});

test('Freckle ends up in the brain tools: a read test with mark_tool, a note naming it, then check_tools', () => {
  assert.match(skill, /call\s+`mark_tool` with tool `Freckle`, status `ok`/);
  assert.match(skill, /tools: \["Freckle"\]/);
  assert.match(skill, /Then call `check_tools`\./);
});

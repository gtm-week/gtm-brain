// gtmb-woodpecker-setup (0.35.0): Woodpecker's hosted MCP connected on the person's yes, one
// sequence drafted from the brain and saved as a draft, never started; Woodpecker ends up in the brain's tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const R = resolve(P, '../..');
const file = join(P, 'skills/gtmb-woodpecker-setup/SKILL.md');
const skill = readFileSync(file, 'utf8');

test('the Woodpecker setup skill follows the shipped-skill template: name, links, openai.yaml, catalog and docs', () => {
  assert.match(skill, /^---\nname: gtmb-woodpecker-setup\n/);
  for (const [, ref] of skill.matchAll(/\]\(([^)]+\.md)\)/g)) assert.ok(existsSync(resolve(dirname(file), ref)), ref);
  assert.match(readFileSync(join(P, 'skills/gtmb-woodpecker-setup/agents/openai.yaml'), 'utf8'), /display_name: "GTM Brain: Set up Woodpecker"/);
  const catalog = JSON.parse(readFileSync(join(P, 'scripts/gtm-brain-render/skill-catalog.json'), 'utf8'));
  const i = catalog.findIndex(s => s.id === 'gtmb-woodpecker-setup');
  assert.ok(i > 0 && catalog[i].group === 'setup' && catalog[i].featured === false);
  for (const doc of ['docs/SKILLS.md', 'docs/COMMANDS.md', 'docs/ONBOARDING.md']) assert.match(readFileSync(join(R, doc), 'utf8'), /gtmb-woodpecker-setup/, doc);
});

test('the hosted MCP is added on the person\'s yes and the sign-in stays theirs, no key or Docker', () => {
  assert.match(skill, /codex mcp add woodpecker --url https:\/\/api\.woodpecker\.co\/mcp\/v1/);
  assert.match(skill, /Never run the login yourself/);
  assert.match(skill, /Never ask for a Woodpecker API key or offer the Docker server/);
});

test('a campaign is saved as a draft and never started', () => {
  assert.match(skill, /never calls `runCampaign`/);
  assert.match(skill, /if it is RUNNING, call `pauseCampaign` at once/);
  assert.match(skill, /never adds, updates or deletes prospects/);
});

test('an agency account acts on the chosen client company only', () => {
  assert.match(skill, /pass that `companyId` on every call after/);
});

test('Woodpecker ends up in the brain tools: a read test with mark_tool, a note naming it, then check_tools', () => {
  assert.match(skill, /call `mark_tool` with tool `Woodpecker`, status\s+`ok`/);
  assert.match(skill, /tools: \["Woodpecker"\]/);
  assert.match(skill, /Then call `check_tools`\./);
});

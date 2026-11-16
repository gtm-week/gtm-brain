// gtmb-zynt-setup (0.35.0): ZYNT set up from the brain when the person pastes ZYNT's prompt;
// the key stays in the chat and ZYNT ends up in the brain's tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const R = resolve(P, '../..');
const file = join(P, 'skills/gtmb-zynt-setup/SKILL.md');
const skill = readFileSync(file, 'utf8');

test('the ZYNT setup skill follows the shipped-skill template: name, links, openai.yaml, catalog and tables', () => {
  assert.match(skill, /^---\nname: gtmb-zynt-setup\n/);
  for (const [, ref] of skill.matchAll(/\]\(([^)]+\.md)\)/g)) assert.ok(existsSync(resolve(dirname(file), ref)), ref);
  assert.match(readFileSync(join(P, 'skills/gtmb-zynt-setup/agents/openai.yaml'), 'utf8'), /display_name: "GTM Brain: Set up ZYNT"/);
  const catalog = JSON.parse(readFileSync(join(P, 'scripts/gtm-brain-render/skill-catalog.json'), 'utf8'));
  const i = catalog.findIndex(s => s.id === 'gtmb-zynt-setup');
  assert.ok(i > 0 && catalog[i].group === 'setup' && catalog[i].featured === false);
  assert.ok(catalog.slice(i + 1).every(s => s.group === 'setup'), 'after the last one of its group');
  for (const doc of ['README.md', 'docs/COMMANDS.md', 'docs/ONBOARDING.md']) assert.match(readFileSync(join(R, doc), 'utf8'), /gtmb-zynt-setup/, doc);
});

test('a pasted ZYNT prompt reaches the skill: its first line is a trigger', () => {
  assert.match(skill.split('---')[1], /Triggers: "Set up ZYNT for me"/);
});

test('the key is used in the chat only and never kept', () => {
  assert.match(skill, /The key is used in this chat only\. Never write it to a file, a note, a document, a commit or\s+the dashboard/);
  assert.match(skill, /Not the answers sent, not the key\./);
});

test('ZYNT ends up in the brain tools without MCP: a read test with mark_tool, a note naming it, then check_tools', () => {
  assert.match(skill, /call\s+`mark_tool` with tool `ZYNT`, status `ok`/);
  assert.match(skill, /with status `fail` and the exact error/);
  assert.match(skill, /tools: \["ZYNT"\]/);
  assert.match(skill, /Then call `check_tools`\./);
  assert.match(skill, /Do not offer MCP/);
  assert.doesNotMatch(skill, /codex mcp add/);
});

test('reads the brain before asking, sends guesses as drafts and lets the person confirm in ZYNT', () => {
  for (const ref of ['`strategy`', '`icp`', '`market`', '`voice`']) assert.ok(skill.includes(ref), ref);
  assert.match(skill, /goes as a draft, never as a confirmed fact/);
  assert.match(skill, /Never confirm on the person's behalf/);
  assert.match(skill, /slug `icp`/);
});

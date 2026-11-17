// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// gtmb-zynt-setup (0.35.0): ZYNT set up from the brain when the person pastes ZYNT's prompt;
// ZYNT set up from the brain through ZYNT's own plugin only (no key); install steps when it is missing.
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
  for (const doc of ['docs/SKILLS.md', 'docs/COMMANDS.md', 'docs/ONBOARDING.md']) assert.match(readFileSync(join(R, doc), 'utf8'), /gtmb-zynt-setup/, doc);
});

test('a pasted ZYNT prompt reaches the skill: its first line is a trigger', () => {
  assert.match(skill.split('---')[1], /Triggers: "Set up ZYNT for me"/);
});

test('the key path is gone: a pasted key is never used or kept', () => {
  assert.match(skill, /\*\*The person pasted a ZYNT key\*\*: do not use it, and do not repeat it\./);
  assert.doesNotMatch(skill, /agent-setup\.md|mark_tool/);
  assert.match(skill, /Never connect ZYNT another way: no `codex mcp add`, no key in a header, no curl\./);
});

// ZYNT's plugin (getzynt/zynt-plugins, 2026-11-16): browser sign-in, so a key never reaches the chat.
test('ZYNT is set up only through its plugin; without it, the install steps for both hosts', () => {
  for (const tool of ['add_setup_context', 'get_setup', 'answer_setup']) assert.ok(skill.includes('`' + tool + '`'), tool);
  for (const step of ['codex plugin marketplace add getzynt/zynt-plugins', 'codex plugin add zynt@zynt', 'codex mcp login zynt',
    '/plugin marketplace add getzynt/zynt-plugins', '/plugin install zynt@zynt']) assert.ok(skill.includes('`' + step + '`'), step);
  assert.match(skill, /give the install steps and stop/);
  assert.match(skill, /tools: \["ZYNT"\]/);
  assert.match(skill, /Then call `check_tools`\./);
});

test('reads the brain before asking, sends guesses as drafts and lets the person confirm in ZYNT', () => {
  for (const ref of ['`strategy`', '`icp`', '`market`', '`voice`']) assert.ok(skill.includes(ref), ref);
  assert.match(skill, /goes as a draft, never as a confirmed fact/);
  assert.match(skill, /Never confirm on the person's behalf/);
  assert.match(skill, /only with the person's yes to that question/);
  assert.match(skill, /slug `icp`/);
});

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
  assert.match(skill, /Never put a ZYNT key in a header and never use curl: the tools are the only way\./);
});

// ZYNT's tools from any connection (2026-11-19): in Codex the agent connects ZYNT itself, no plugin, and checks the sign-in.
test('ZYNT is set up through its tools from any connection; in Codex the agent connects it and checks the sign-in', () => {
  for (const tool of ['add_setup_context', 'get_setup', 'answer_setup']) assert.ok(skill.includes('`' + tool + '`'), tool);
  for (const step of ['codex mcp list --json', 'codex mcp add zynt --url https://app.getzynt.com/mcp', 'codex mcp login zynt',
    'claude mcp add --transport http zynt https://app.getzynt.com/mcp', 'https://app.getzynt.com/mcp']) assert.ok(skill.includes('`' + step + '`'), step);
  assert.match(skill, /The tool names decide, not where they came\s+from\./);
  assert.match(skill, /No plugin is needed\./);
  assert.doesNotMatch(skill, /codex plugin add/, 'the plugin is never required');
  assert.match(skill, /Only `zynt` with `auth_status` `o_auth` is signed in\./);
  assert.match(skill, /Never say\s+"signed in" before `codex mcp list --json` shows it\./);
  assert.match(skill, /codex:\/\/threads\/new\?path=/);
  assert.match(skill, /tools: \["ZYNT"\]/);
  assert.match(skill, /Then call `check_tools`\./);
});

test('reads the brain before asking, sends guesses as drafts and lets the person confirm in ZYNT', () => {
  for (const ref of ['`strategy`', '`icp`', '`market`', '`voice`']) assert.ok(skill.includes(ref), ref);
  assert.match(skill, /is sent as what it is: write\s+"hypothesis" in the text, never a confirmed fact/);
  assert.match(skill, /`get_setup` first/);
  assert.match(skill, /Business facts only: never passwords, keys, personal emails, other\s+people's phone numbers, deal amounts or copied conversations\./);
  assert.match(skill, /The\s+setup is done only when ZYNT's step is `done`/);
  assert.match(skill, /Never confirm on the person's behalf/);
  assert.match(skill, /only with the person's yes to that question/);
  assert.match(skill, /slug `icp`/);
});

test('puts the brain\'s companies and people on two ZYNT lists after a yes, and ends with what to ask', () => {
  for (const tool of ['list_audiences', 'create_audience', 'add_companies', 'lookup_person', 'add_to_audience']) assert.ok(skill.includes('`' + tool + '`'), tool);
  assert.match(skill, /"GTM Brain · <segment> · Companies"/);
  assert.match(skill, /Yes, add them;\s+No, skip\./);
  assert.match(skill, /"Signals for me"/);
});

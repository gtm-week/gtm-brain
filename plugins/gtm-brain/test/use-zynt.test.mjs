// gtmb-use-zynt (0.38.1): the daily ZYNT skill. Works from any ZYNT connection, independent of
// gtmb-zynt-setup; speaks in the words of ZYNT's signals workshop (news vs signals).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const R = resolve(P, '../..');
const file = join(P, 'skills/gtmb-use-zynt/SKILL.md');
const skill = readFileSync(file, 'utf8');
const method = readFileSync(join(P, 'skills/gtmb-use-zynt/references/method.md'), 'utf8');

test('the use skill follows the shipped-skill template: name, links, openai.yaml, catalog and tables', () => {
  assert.match(skill, /^---\nname: gtmb-use-zynt\n/);
  for (const [, ref] of skill.matchAll(/\]\(([^)]+\.md)\)/g)) assert.ok(existsSync(resolve(dirname(file), ref)), ref);
  assert.match(readFileSync(join(P, 'skills/gtmb-use-zynt/agents/openai.yaml'), 'utf8'), /display_name: "GTM Brain: Use ZYNT"/);
  const catalog = JSON.parse(readFileSync(join(P, 'scripts/gtm-brain-render/skill-catalog.json'), 'utf8'));
  const entry = catalog.find(s => s.id === 'gtmb-use-zynt');
  assert.ok(entry && entry.group === 'daily' && entry.featured === false);
  for (const doc of ['docs/SKILLS.md', 'docs/COMMANDS.md', 'docs/ONBOARDING.md']) assert.match(readFileSync(join(R, doc), 'utf8'), /gtmb-use-zynt/, doc);
});

test('plain requests reach it, and it leaves setup to gtmb-zynt-setup', () => {
  const front = skill.split('---')[1];
  for (const phrase of ['"signals for me"', '"any news on my list?"', '"who on my\n  list has a reason to hear from me now?"']) assert.ok(front.includes(phrase), phrase);
  assert.match(front, /Not setting ZYNT up \(gtmb-zynt-setup\)/);
});

test('any ZYNT connection works; without one it gives the site guide and changes nothing', () => {
  assert.match(skill, /The tool names decide, not where they came from\./);
  assert.match(skill, /https:\/\/getzynt\.com\/agent-setup\.md/);
  assert.match(skill, /Do not change the person's settings or config\s+yourself, and never ask for or use a ZYNT key\./);
  assert.doesNotMatch(skill, /codex plugin add|codex mcp add/, 'connecting is the setup skill and the site guide');
});

test('news and signals stay two things, in the workshop words', () => {
  assert.match(method, /A signal is news that gives you a reason to talk to\s+a company now\. A company in the news is not a signal yet\./);
  assert.match(skill, /When `list_signals` returns a `note`, use it\./);
  assert.match(skill, /Never call news a signal, and never add that a source was not checked or proves no intent\./);
  for (const part of ['What happened', 'when it happened', 'why it\nmatters', 'who to contact']) assert.ok(method.includes(part), part);
});

test('adds records only on request, never invents people', () => {
  assert.match(skill, /Only on the person's request\. Show the exact records and the list,\s+ask once, and wait\./);
  assert.match(skill, /never invent them/);
});

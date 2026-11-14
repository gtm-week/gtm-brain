// gtm-brain-voice (0.35.0): the shipped skill that drafts voice.md from the company's own writing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { voiceRoute, voiceBodyChecks, voiceCases, VOICE_POSTS } from './live/voice-cases.mjs';
import { skillCases } from './live/skill-cases.mjs';
import { documentsLine } from '../lib/documents.mjs';
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const R = resolve(P, '../..');
const file = join(P, 'skills/gtm-brain-voice/SKILL.md');
const skill = readFileSync(file, 'utf8');
const method = readFileSync(join(P, 'skills/gtm-brain-voice/references/method.md'), 'utf8');
const call = (tool, args = {}) => ({ tool, arguments: args });

test('the voice skill follows the shipped-skill template: name, links, openai.yaml, catalog, counts and tables', () => {
  assert.match(skill, /^---\nname: gtm-brain-voice\n/);
  for (const [, ref] of skill.matchAll(/\]\(([^)]+\.md)\)/g)) assert.ok(existsSync(resolve(dirname(file), ref)), ref);
  assert.match(readFileSync(join(P, 'skills/gtm-brain-voice/agents/openai.yaml'), 'utf8'), /display_name: "GTM Brain: Voice"/);
  const catalog = JSON.parse(readFileSync(join(P, 'scripts/gtm-brain-render/skill-catalog.json'), 'utf8'));
  const i = catalog.findIndex(s => s.id === 'gtm-brain-voice');
  assert.ok(i > 0 && catalog[i].group === 'setup' && catalog[i].featured === false);
  assert.ok(catalog.slice(i + 1).every(s => s.group === 'setup'), 'after the last one of its group');
  for (const doc of ['README.md', 'COMMANDS.md', 'ONBOARDING.md']) assert.match(readFileSync(join(R, doc), 'utf8'), /gtm-brain-voice/, doc);
  for (const doc of ['README.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'USER-SKILLS.md']) assert.match(readFileSync(join(R, doc), 'utf8'), /twenty/, doc);
  assert.match(readFileSync(join(R, 'GUIDE.md'), 'utf8'), /\/gtm-brain-voice/);
});

test('the skill reads connectors first, the public web only, and saves through the document path on a yes', () => {
  for (const source of ['website', 'Public posts', 'Sent mail', 'Slack']) assert.match(skill, new RegExp(source));
  assert.match(skill, /never Computer Use/); assert.match(skill, /only when a mail connector \(Gmail, Outlook\) is connected/);
  assert.match(skill, /only when the Slack connector is connected/);
  assert.match(skill, /`document` with `action: update`, `ref: voice`/);
  assert.match(skill, /"Save it as a draft"\s*\n?\s*\(recommended\), "Change something"/);
  assert.match(skill, /Nothing is written before that answer/);
  assert.match(skill, /no `remember` call follows/);
  assert.match(skill, /exactly three short before and after pairs drawn from real text, each with\s+its source/);
  assert.match(skill, /Re-run any time|revises it any time/);
  assert.match(method, /Exactly three short pairs/); assert.match(method, /copied word for\s+word from a real text/);
  assert.match(skill, /Not saving a voice guide the\s+person already wrote/, 'the overlap is named in both descriptions');
  assert.match(readFileSync(join(P, 'skills/gtm-brain-use-brain/references/documents.md'), 'utf8'), /Voice: run \[gtm-brain-voice\]/);
});

test('onboarding offers the voice skill at the end, skippable, and the chat line points to it', () => {
  const tour = readFileSync(join(P, 'skills/gtm-brain-start/references/skills-tour.md'), 'utf8');
  assert.match(tour, /the voice is \[gtm-brain-voice\]\(\.\.\/\.\.\/gtm-brain-voice\/SKILL\.md\), skippable/);
  assert.match(tour, /"Later"/);
  assert.match(documentsLine.toString(), /voice: \/gtm-brain-voice/);
});

test('the live case gates reject the wrong route and an unsourced or invented draft', () => {
  for (const name of ['skill-voice', 'skill-voice-save']) assert.ok(skillCases.some(c => c.name === name && c.workflow === 'gtm-brain-voice'), `${name} is listed in skill-cases.mjs, so tool-routing.mjs skills runs it`);
  const show = call('document', { action: 'show', ref: 'voice' }), update = call('document', { action: 'update', ref: 'voice', status: 'draft' });
  // asking: the draft is read and shown, nothing is written before the answer
  assert.ok(voiceRoute([call('query', { object: 'status' }), show]));
  assert.equal(voiceRoute([show, update]), false, 'no write before the answer');
  assert.equal(voiceRoute([update]), false, 'the voice document is read first');
  // saving on a yes already given in the request
  assert.ok(voiceRoute([show, update, show], { save: true }));
  assert.equal(voiceRoute([show], { save: true }), false, 'the yes is used');
  for (const extra of [call('remember'), call('document', { action: 'create' }), call('computer_use')]) assert.equal(voiceRoute([show, update, extra], { save: true }), false, extra.tool);
  assert.equal(voiceRoute([show, call('document', { action: 'update', ref: 'voice', status: 'approved' })], { save: true }), false, 'approved only on the person\'s own word');
  const [a, b, c] = VOICE_POSTS;
  const body = `# Tone of voice\n\n## How we sound, in three words\nPlain. Specific. Calm.\n\n## Do\nTen words a sentence.\n\n## Do not\nNo exclamation marks.\n\n## Words we use, words we avoid\nUse: rollout. Avoid: seamless.\n\n## Examples we like\n1. Before: Unlock seamless rollouts! After: ${a.text}\nSource: ${a.url}\n2. Before: Our platform empowers launches. After: ${b.text}\nSource: ${b.url}\n3. Before: Dashboards for everything. After: ${c.text}\nSource: ${c.url}\n\n## Read from\nThree public posts; sent mail and Slack not connected.\n`;
  assert.ok(voiceBodyChecks(body));
  assert.equal(voiceBodyChecks(body.replace(/Source: [^\n]+\n/g, '')), false, 'every example has its source');
  assert.equal(voiceBodyChecks(body.replaceAll(a.text, 'x').replaceAll(b.text, 'y').replaceAll(c.text, 'z')), false, 'a quote must be real text');
  assert.equal(voiceBodyChecks(body.replace(/## Do not\nNo exclamation marks\.\n/, '## Do not\n')), false, 'an empty heading is not a filled voice');
  assert.equal(voiceBodyChecks(body.replaceAll('"', '“')), true, 'curly quotes read as straight ones');
  const ask = voiceCases.find(c => c.name === 'skill-voice').responseCheck;
  assert.ok(ask(`${body}\nSave it as a draft (recommended), or Change something?`));
  assert.equal(ask(body), false, 'the draft ends with the question');
  assert.match(skill, /An explicit\s+instruction already in the request to save this draft/);
});

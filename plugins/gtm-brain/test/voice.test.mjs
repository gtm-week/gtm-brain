// gtm-brain-voice (0.35.0): the shipped skill that settles whose voice it is, drafts it from fitting evidence,
// tests it on fresh work and checks that a new chat uses it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { voiceRoute, voiceBodyChecks, voiceDocChecks, whoseVoiceAsked, voiceCases, VOICE_POSTS } from './live/voice-cases.mjs';
import { skillCases } from './live/skill-cases.mjs';
import { documentsLine } from '../lib/documents.mjs';
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const R = resolve(P, '../..');
const file = join(P, 'skills/gtm-brain-voice/SKILL.md');
const skill = readFileSync(file, 'utf8');
const method = readFileSync(join(P, 'skills/gtm-brain-voice/references/method.md'), 'utf8');
const call = (tool, args = {}) => ({ tool, arguments: args });
const section = (from, to) => { const i = skill.indexOf(from); assert.ok(i >= 0, from); return skill.slice(i, to ? skill.indexOf(to, i) : undefined); };

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
  for (const source of ['website', 'public posts', 'sent mail', 'Slack']) assert.match(skill, new RegExp(source, 'i'));
  assert.match(skill, /never Computer Use/); assert.match(skill, /only when a mail connector \(Gmail, Outlook\) is\s+connected/);
  assert.match(skill, /only when the Slack connector is connected/);
  assert.match(skill, /error is reported with its exact text/);
  assert.match(skill, /`document` with `action: update`, `ref: voice`/);
  assert.match(skill, /"Save it as a draft"\s*\n?\s*\(recommended\), "Change something"/);
  assert.match(skill, /Nothing is written before that\s+answer/);
  assert.match(skill, /no `remember` call\s+follows/);
  assert.match(skill, /Re-run any time|revises it any time/);
  assert.match(method, /copied word for word from a real text/);
  assert.match(skill, /Not saving a voice guide the\s+person already wrote/, 'the overlap is named in both descriptions');
  assert.match(readFileSync(join(P, 'skills/gtm-brain-use-brain/references/documents.md'), 'utf8'), /Voice: run \[gtm-brain-voice\]/);
});

test('whose voice is settled first, with one question under the shared policy, and reused on a re-run', () => {
  const one = section('## 1. Whose voice', '## 2.');
  assert.ok(skill.indexOf('## 1. Whose voice') < skill.indexOf('## 2. Evidence'), 'whose voice comes before any evidence');
  assert.match(one, /this\s+question comes first, before reading or asking for texts, with one line on why/);
  assert.match(one, /"our voice" is not one/, 'a bare "our voice" does not settle whose it is');
  assert.match(one, /"The company's voice"\s+\(recommended; one standard for everything we publish and send, no separate persona per medium\), "My own\s+voice", "A team's voice"/);
  assert.match(one, /reuse that, or an\s+answer already in the request \("our voice" is not one\), and never ask again/);
  assert.match(one, /whose voice it is and what it governs/);
  assert.match(skill, /\[question handling\]\(\.\.\/gtm-brain-start\/references\/questions\.md\)/);
  assert.match(method, /one standard for what the company publishes and sends, in every\s+medium/);
  assert.match(method, /never a separate persona/);
});

test('evidence fits the choice: internal chat is not company evidence, pasted texts count at once, gaps are shown', () => {
  assert.match(skill, /Internal chat \(Slack, Teams\) is not evidence of the company voice/);
  assert.match(method, /internal chat is never evidence of the company voice/);
  assert.match(skill, /\*\*A person's voice\*\*: their own writing only/);
  assert.ok(skill.indexOf('Slack connector') > skill.indexOf("**A person's voice**"), 'Slack is read only for a personal voice');
  assert.match(skill, /Texts the person pastes or drops count at once; connectors only deepen them/);
  assert.match(skill, /show what was reviewed \(source, count, dates, kind\) and what is missing/);
});

test('texts are sorted by kind, corrections outweigh habits, observed is kept apart from suggested', () => {
  for (const kind of [/Authored by the person or the company/, /AI-assisted text they approved/, /Automated messages and templates/, /Quotations/]) assert.match(method, kind);
  assert.match(method, /An explicit correction outweighs any inferred habit/);
  assert.match(method, /quoted in their exact words/);
  assert.match(skill, /an explicit correction outweighs an inferred habit/);
  assert.match(skill, /Keep observed patterns apart\s+from suggested improvements; quote every correction in the person's\s+exact words/);
  assert.match(method, /Observed and suggested stay apart/);
});

test('no fixed section count, length rule or register; voice.md stays concise and private references stay out', () => {
  assert.match(skill, /Use\s+the structure the evidence supports, with no fixed sections, counts, length rules or registers/);
  assert.match(method, /No fixed number of sections or examples, no length\s+rule or register unless the texts show one/);
  assert.doesNotMatch(skill + method, /\b(exactly three|in three words|six sections)\b/i, 'no prescribed counts survive');
  assert.match(skill, /Keep voice\.md concise; detailed evidence\s+and private source references/);
});

test('the guide is tested on fresh work before it is done, and a one-off edit never silently becomes a rule', () => {
  const five = section('## 6. Test it on fresh work');
  assert.match(five, /The guide is not done until it has written something/);
  assert.match(five, /"A short email" \(recommended\), "A post"/);
  assert.match(five, /ask the person to\s+edit it/);
  assert.match(five, /never silently becomes a rule: ask "Make it a rule" or "Just this once", or\s+leave it out/);
  assert.match(five, /Approved only on the person's own\s+word \("approve the voice"\), after this test/);
  assert.match(method, /## 5\. The fresh-work test/);
});

test('reuse is verified: the kinds of work from applies_to, one sentence for a new chat, no claim before it is seen', () => {
  const six = section('## 5. Check that later chats use it', '## 6.');
  assert.match(six, /The message after each save gives: the path; exactly which kinds of work it governs, from the\s+document's `applies_to`/);
  assert.match(six, /the one sentence to type in a new chat/);
  assert.match(six, /Do not say it is in use until the person has seen that/);
  assert.match(readFileSync(join(R, 'DOCUMENTS.md'), 'utf8'), /say which one you followed/, 'the document mechanism names the followed document');
});

test('an update run reuses the guide, keeps approved rules and shows the proposed changes', () => {
  assert.match(skill, /on a re-run, first the proposed changes, per the method/);
  assert.match(method, /A re-run starts from the saved guide\. Keep every approved rule, quoted correction and hand-written\s+rule/);
  assert.match(method, /Show the proposed changes as\s+added, changed and dropped before saving/);
});

test('the skill and its method stay short: no longer than the 0.35.0 files combined, no long dashes', () => {
  const bytes = Buffer.byteLength(skill) + Buffer.byteLength(method);
  assert.ok(bytes <= 9248, `${bytes} bytes`);
  assert.doesNotMatch(skill + method, new RegExp('[\\u2013\\u2014]'));
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
  const body = `# Tone of voice\n\nThe company's voice: one standard for copy, outreach, emails, posts and landing pages.\n\n## How we write\n- Name the week or the number, not the adjective.\n- No exclamation marks.\n\n## Examples\n1. Before: Unlock seamless rollouts! After: ${a.text}\nSource: ${a.url}\n2. Before: Our platform empowers launches. After: ${b.text}\nSource: ${b.url}\n3. Before: Dashboards for everything. After: ${c.text}\nSource: ${c.url}\n\n## Suggested, not yet in our writing\n- Close posts with one short sentence.\n\nRead from: three public posts.\n`;
  assert.ok(voiceBodyChecks(body)); assert.ok(voiceDocChecks(body));
  assert.equal(voiceBodyChecks(body.replaceAll(a.url, '').replaceAll(b.url, '')), false, 'quotes carry their links');
  assert.equal(voiceBodyChecks(body.replaceAll(a.text, 'x').replaceAll(b.text, 'y').replaceAll(c.text, 'z')), false, 'a quote must be real text');
  assert.equal(voiceBodyChecks(body.replaceAll('"', '“')), true, 'curly quotes read as straight ones');
  assert.ok(voiceBodyChecks(body.replace('## How we write', '## Rules')), 'no fixed headings are required');
  assert.equal(voiceDocChecks(`${body}\nSource: gmail:19fa01\n`), false, 'no private source reference in the document');
  assert.equal(voiceDocChecks(body.replace("The company's voice: one standard", 'One standard')), false, 'the document says whose voice it is');
  assert.equal(voiceDocChecks(body + 'x'.repeat(6000)), false, 'the document stays concise');
  // the two-turn case: the whose-voice answer, then pasted examples
  const whose = "Whose voice is this guide for? It decides which writing counts as evidence.\n1. The company's voice (recommended)\n2. My own voice\n3. A team's voice";
  assert.ok(whoseVoiceAsked(whose)); assert.equal(whoseVoiceAsked('Here is the draft.'), false);
  const two = voiceCases.find(c => c.name === 'skill-voice');
  assert.equal(two.followUps.length, 1, 'two turns');
  assert.match(two.followUps[0], /The company's voice/); assert.ok(VOICE_POSTS.every(p => two.followUps[0].includes(p.url)));
  assert.doesNotMatch(two.prompt, /example\.com/, 'the first turn carries no evidence');
  const ask = `${body}\nSave it as a draft (recommended), or Change something?`;
  assert.ok(two.responseCheck(ask, { turns: [{ calls: [], final: whose }, { calls: [], final: ask }] }));
  assert.equal(two.responseCheck(ask, { turns: [{ calls: [], final: ask }, { calls: [], final: ask }] }), false, 'the first turn asks whose voice, it does not draft');
  assert.equal(two.responseCheck(body, { turns: [{ calls: [], final: whose }, { calls: [], final: body }] }), false, 'the draft ends with the question');
  assert.ok(two.calls([show], { turns: [{ calls: [show], final: whose }, { calls: [], final: ask }] }));
  assert.equal(two.calls([show, update], { turns: [{ calls: [show, update], final: whose }, { calls: [], final: ask }] }), false, 'nothing written in either turn');
  const save = voiceCases.find(c => c.name === 'skill-voice-save');
  assert.match(save.prompt, /The company's voice/, 'whose voice is settled in the request, so it is not asked');
  assert.ok(save.responseCheck('Saved voice.md as a draft. It applies to copy, outreach, emails, posts and landing pages. In a new chat, type: "Write a two-line follow-up to a prospect who went quiet." Shall I test it on a short email first? /gtm-brain-voice revises it.'));
  assert.equal(save.responseCheck('Saved voice.md; it is now in use for posts. Test it on a short email? In a new chat. /gtm-brain-voice'), false, 'no claim of use before it is seen');
  assert.match(skill, /An explicit instruction already in the request to save this draft/);
});

// A draft is written from the brain, not from the web. Two runs in the Codex app on 2026-11-16: asked for a
// short invitation to a workshop "in our voice", Codex read the notes and the voice document and then made
// three and six web searches for the event's public page, whose address the notes carried as a source. Core
// rule 5 covered a person or a company only, and the answer's last line asked for a fact in one to three
// sentences. Each test here fails on the code before this change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as lib from '../lib/brain.mjs';
import { answer, asksForDraft, SEARCH_MAX_BYTES, ANSWER_ALL_BYTES } from '../lib/memory-search.mjs';
process.env.TZ = 'UTC';
process.env.GTM_BRAIN_NO_COMMIT = '1';
process.env.GTM_BRAIN_NO_COMPILE = '1';
process.env.GTM_BRAIN_NOW = '2026-11-14T12:00:00Z';
const P = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gtm-answer-draft-'));
  mkdirSync(join(root, 'brain'));
  writeFileSync(join(root, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Draft Fixture', team: [{ name: 'Ann Lee', handle: 'ann', email: 'ann@fixture.test' }] }));
  lib.writeContext(root, 'events', { title: 'events' });
  // the shape that sent Codex to the web: the event is known by title and day, its public page is a note's source
  lib.appendMemory(root, 'events', { authors: ['ann'], content: 'Harbour Week in Lisbon runs 16 to 20 March. The Wednesday workshop "Pricing for small teams" has 50 seats.', source: [{ kind: 'url', ref: 'https://events.fixture.test/harbour-workshop' }] });
  lib.appendMemory(root, 'events', { authors: ['ann'], content: 'Northfold is a partner of the Lisbon pricing workshop.' });
  return root;
}
const last = s => s.trimEnd().split('\n').pop();
const ASK = 'draft a short linkedin message to a head of growth at a b2b saas company inviting them to the Lisbon workshop, in our voice';

test('a request for a draft is told apart from a question about one', () => {
  for (const q of [ASK, 'Draft an email to Northfold about the workshop', 'write a LinkedIn post about Harbour Week', 'please write a follow-up to the Lisbon speakers', 'Can you compose an invitation for the workshop?', 'rewrite our announcement for the workshop', 'draft two subject lines for the workshop'])
    assert.equal(asksForDraft(q), true, q);
  for (const q of ['what did Ann write in her email about the workshop', 'who is speaking at the Lisbon workshop', 'when is the workshop', 'is the Northfold contract still a draft', 'which posts mention Harbour Week', 'write up what we know about Northfold', ''])
    assert.equal(asksForDraft(q), false, q);
});

test('the answer to a draft request ends with: write it from these notes, nothing from the web, name what is missing', () => {
  const root = fixture();
  const a = answer(root, ASK);
  assert.match(a, /^1\. m_[0-9a-f]{12} /m, a);
  assert.match(a, /source: url:https:\/\/events\.fixture\.test\/harbour-workshop/, 'the page that was opened is still shown as the source');
  const end = last(a);
  assert.match(end, /^A draft is asked for: write it now from these notes and the document this kind of work follows, at the length asked/);
  assert.match(end, /Nothing is looked up on the web and no source link above is opened for a draft unless the person asks for exactly that/);
  assert.match(end, /a detail these notes do not hold \(an agenda, a time, a link\) is left out of the draft, and one line after the draft says what is missing\.$/);
  // a draft is not a fact in one to three sentences: the question's closing line would cut it short
  assert.doesNotMatch(a, /one to three sentences/);
  assert.doesNotMatch(a, /[\u2013\u2014]/);
});

test('the second search of a draft turn, worded as a question, also ends with nothing from the web', () => {
  const root = fixture();
  // what Codex asked next in both runs: the event's details, with no word that says draft
  const a = answer(root, 'Lisbon workshop agenda');
  const end = last(a);
  assert.match(end, /^Answer from all the notes shown: they are what the brain holds on this\. For a list question .*list every item that fits/);
  assert.doesNotMatch(end, /one to three sentences|no second search/, 'nothing limits the answer to a few sentences (win-a)');
  assert.match(end, /What these notes do not hold is not recorded: nothing is looked up on the web and no source link above is opened unless the person asks for exactly that\.$/);
});

test('nothing found keeps its own two lines, and a full reply with the longer last line stays under the cap', () => {
  const root = fixture();
  const none = answer(root, 'draft an email about the zeppelin');
  assert.match(none, /^Not found: /); assert.match(none, /say plainly that the brain holds nothing on this/);
  const long = 'Lisbon workshop planning: ' + 'the venue asked about seating, catering and the recording room. '.repeat(14);
  for (let i = 0; i < 40; i++) lib.appendMemory(root, 'events', { authors: ['ann'], content: `${long} (${i})`, source: [{ kind: 'url', ref: `https://events.fixture.test/listing-${i}` }] });
  for (const q of [ASK, 'Lisbon workshop planning']) {
    const a = answer(root, q);
    assert.ok(Buffer.byteLength(a) <= ANSWER_ALL_BYTES, `${q}: ${Buffer.byteLength(a)} bytes`);
    assert.match(last(a), /on the web/);
  }
});

test('the server says it once, after the call shapes: a draft comes from the brain, not the web', () => {
  const server = readFileSync(join(P, 'server/server.mjs'), 'utf8');
  const line = server.split('\n').find(l => l.startsWith('const INSTRUCTIONS = '));
  assert.match(line, /A draft \(a message, a post, an email\) is written from the brain's notes and the document it follows: nothing is looked up on the web and no link in a note is opened for it unless the person asks for exactly that; a detail the brain does not hold is left out and named in one line\./);
  assert.ok(line.indexOf('A draft (a message') > line.indexOf('CALL_SHAPES'), 'past the part a host may cut, the core and the shapes come first');
  // the core rule itself is unchanged: widening it changes every brain's AGENTS.md, which needs a release
  assert.match(readFileSync(join(P, 'policies/core.md'), 'utf8'), /5\. Nothing about a person or company is looked up on the web unless the person asks for exactly\n   that: what the notes do not say is unknown\./);
});

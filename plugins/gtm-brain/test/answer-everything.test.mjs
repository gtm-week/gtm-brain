// query object answer returns everything recorded (win-a): measured on real Codex, a chat calls query answer and
// nothing else, so the reply itself must never know less than the same notes in one flat file. A small brain comes
// back whole; a larger one brings every note of a named company, then every note the other words, the period (also a
// date in the note text) or the kind match, under the budget. Made-up notes only.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as lib from '../lib/brain.mjs';
import { answer, ANSWER_ALL_BYTES, datesInText } from '../lib/memory-search.mjs';
process.env.TZ = 'UTC';
process.env.GTM_BRAIN_NO_COMMIT = '1';
process.env.GTM_BRAIN_NO_COMPILE = '1';
process.env.GTM_BRAIN_NOW = '2026-11-14T12:00:00Z';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gtm-answer-all-'));
  mkdirSync(join(root, 'brain'));
  writeFileSync(join(root, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Everything Fixture', team: [{ name: 'Anna Lind', handle: 'anna', email: 'anna@fixture.test' }] }));
  for (const slug of ['sales', 'partners']) lib.writeContext(root, slug, { title: slug });
  return root;
}
const note = (root, content, extra = {}, slug = 'sales') => lib.appendMemory(root, slug, { authors: ['anna'], content, ...extra }).rec;
const day = i => new Date(Date.UTC(2026, 3, 1) + i * 86400000).toISOString();
const TOPICS = ['shipping lanes', 'warehouse staffing', 'invoice terms', 'label printers', 'returns desk', 'pallet counts'];

test('a 60-note brain returns all 60 notes in one answer, oldest to newest, with no ranking window', () => {
  const root = fixture();
  const made = [];
  for (let i = 0; i < 60; i++) made.push(note(root, `Weekly check ${i}: the team reviewed ${TOPICS[i % TOPICS.length]} with the depot lead.`, { at: day(i) }, i % 2 ? 'sales' : 'partners'));
  const a = answer(root, 'What changed about the label printers?');
  for (const m of made) assert.ok(a.includes(m.id), `${m.id} missing`);
  assert.match(a, /Everything recorded in the brain: all 60 current notes, oldest to newest/);
  assert.ok(a.indexOf(made[0].id + '\n') < a.indexOf(made[59].id + '\n') || a.lastIndexOf(made[0].id) < a.lastIndexOf(made[59].id), 'oldest first');
  assert.doesNotMatch(a, /more match/);
  assert.doesNotMatch(a, /one to three sentences|no second search/i);
  assert.match(a, /Answer from all the notes shown/);
  assert.match(a, /list every item that fits/);
  assert.ok(Buffer.byteLength(a) <= ANSWER_ALL_BYTES, `${Buffer.byteLength(a)} bytes`);
});

test('a question word that appears nowhere still returns every note of the named company', () => {
  const root = fixture();
  lib.addName(root, 'Northfold', { kind: 'organization' });
  const own = [];
  for (let i = 0; i < 7; i++) own.push(note(root, `Northfold call ${i}: they asked for a second depot quote.`, { people: ['Northfold'], at: day(i) }));
  note(root, 'Acme Retail wants the spring catalogue.', { at: day(9) });
  const a = answer(root, 'What is the zebracorn status for Northfold?');
  for (const m of own) assert.ok(a.includes(m.id), `${m.id} missing\n${a}`);
  assert.match(a, /Northfold · organization/);
});

test('a "what is due in <month>" question returns notes whose text holds a date in that month', () => {
  const root = fixture();
  lib.addName(root, 'Northfold', { kind: 'organization' });
  // big enough that the brain is not shown whole, so the dates in the text must carry the match
  const filler = 'The depot walk covered racking, lighting, the loading bay and the staff room in detail. '.repeat(6);
  for (let i = 0; i < 80; i++) note(root, `${filler} (${i})`, { at: day(i) });
  const a1 = note(root, 'Anna Lind promised the revised contract by 12 December 2026.', { at: '2026-09-02T10:00:00Z' });
  const a2 = note(root, 'Acme Retail renewal paperwork must be signed before 2026-12-20.', { at: '2026-08-10T10:00:00Z' });
  const a3 = note(root, 'Northfold expects the pilot report on 3.12.2026.', { at: '2026-07-01T10:00:00Z', people: ['Northfold'] });
  const no = note(root, 'Acme Retail paid the October invoice.', { at: '2026-10-05T10:00:00Z' });
  const a = answer(root, 'What is due in December 2026?');
  assert.doesNotMatch(a, /Everything recorded in the brain: all/, 'not the whole brain');
  for (const m of [a1, a2, a3]) assert.ok(a.includes(m.id), `${m.id} missing\n${a.slice(0, 3000)}`);
  const firstMatch = a.indexOf('Every other note matching');
  assert.ok(firstMatch > 0 && a.indexOf(a1.id, firstMatch) > 0);
  assert.ok(!a.slice(firstMatch).split('\n').slice(1, 4).some(l => l.includes(no.id)), 'an October note is not among the first');
  assert.ok(datesInText('due 12 December', '2026-09-02T10:00:00Z').some(d => d.y === 2026 && d.mo === 11 && d.d === 12));
  assert.ok(datesInText('we may ship', '2026-09-02T10:00:00Z').length === 0, '"may" alone is no date');
});

test('a 600-note brain stays under the budget and returns all notes of the named company', () => {
  const root = fixture();
  lib.addName(root, 'Northfold', { kind: 'organization' });
  const own = [];
  for (let i = 0; i < 600; i++) {
    const about = i % 40 === 0;
    const m = note(root, about ? `Northfold review ${i}: the buyer wants weekly pallet counts and a named contact.` : `Depot log ${i}: ${TOPICS[i % TOPICS.length]} checked, nothing unusual on the floor today.`, { at: day(i % 220), ...(about ? { people: ['Northfold'] } : {}) });
    if (about) own.push(m);
  }
  const a = answer(root, 'What has Northfold asked about the floor?');   // "floor" is in every depot log: more than one reply
  assert.ok(Buffer.byteLength(a) <= ANSWER_ALL_BYTES + 200, `${Buffer.byteLength(a)} bytes`);
  assert.match(a, /Every note about Northfold \(15\), oldest to newest:/);
  for (const m of own) assert.ok(a.includes(m.id), `${m.id} missing`);
  assert.match(a, /did not fit this reply\. All of them in one more call: query sql/);
});

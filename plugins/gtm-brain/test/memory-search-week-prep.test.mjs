// "this week" and getting ready for a call (0.35.1, app run of 16 November): "this week" also finds what
// is planned for its seven days, by the dates the notes mention; a prep question about a known name
// returns that name's card and newest notes, whatever day the call is on. Every name here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as lib from '../lib/brain.mjs';
import { answer, search, parsePeriod, parseQuestion, ANSWER_NOTES } from '../lib/memory-search.mjs';
process.env.TZ = 'UTC';
process.env.GTM_BRAIN_NO_COMMIT = '1';
process.env.GTM_BRAIN_NO_COMPILE = '1';
process.env.GTM_BRAIN_NOW = '2026-11-18T09:00:00Z';   // a Wednesday; its week is Monday 16 to Sunday 22 November
const now = new Date(process.env.GTM_BRAIN_NOW);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gtm-memory-search-week-'));
  mkdirSync(join(root, 'brain'));
  writeFileSync(join(root, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Search Fixture', team: [{ name: 'Ann Lee', handle: 'ann', email: 'ann@fixture.test' }] }));
  for (const slug of ['sales', 'events']) lib.writeContext(root, slug, { title: slug });
  return root;
}
const note = (root, content, extra = {}, slug = 'sales') => lib.appendMemory(root, slug, { authors: ['ann'], content, ...extra }).rec;
const ids = s => [...new Set((String(s).match(/^(?:\d+\. )?(?:\{"id":")?m_[0-9a-f]{12}/gm) || []).map(x => x.match(/m_[0-9a-f]{12}/)[0]))];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const period = (s, at = now) => parsePeriod(s, at).period;

test('this week is the seven days from Monday, marked as partly ahead, with the date words of each day', () => {
  const p = period('What should I focus on this week?');
  assert.equal(p.label, 'this week');
  assert.equal(iso(p.from), '2026-11-16'); assert.equal(iso(p.to), '2026-11-23');
  assert.equal(p.ahead, true);
  assert.equal(p.mention.length, 21, 'three ways to write each of seven days');
  for (const day of [16, 17, 18, 19, 20, 21, 22]) for (const w of [`${day} november`, `november ${day}`, `2026-11-${day}`]) assert.ok(p.mention.includes(w), w);
  assert.ok(!p.mention.includes('15 november') && !p.mention.includes('23 november'), 'no day of another week');
  // on a Monday and on a Sunday the week is the same one
  assert.equal(iso(period('this week', new Date('2026-11-16T00:30:00Z')).from), '2026-11-16');
  assert.equal(iso(period('this week', new Date('2026-11-22T23:30:00Z')).from), '2026-11-16');
  assert.equal(parsePeriod('my priorities this week', now).rest, 'my priorities', 'the period is taken out of the question');
});

test('last week and next week are as they were: last week by recording time only, next week by its dates', () => {
  const last = period('what did we decide last week');
  assert.deepEqual({ ...last }, { from: new Date(2026, 10, 9), to: new Date(2026, 10, 16), label: 'last week' });
  assert.equal(last.ahead, undefined); assert.equal(last.mention, undefined);
  assert.deepEqual({ ...period('the past week') }, { ...last }, 'past week is last week');
  const next = period('what is on next week');
  assert.equal(next.label, 'next week');
  assert.equal(iso(next.from), '2026-11-23'); assert.equal(iso(next.to), '2026-11-30');
  assert.equal(next.ahead, undefined);
  assert.equal(next.mention.length, 21);
  assert.ok(next.mention.includes('23 november') && next.mention.includes('november 29') && next.mention.includes('2026-11-26'));
  assert.ok(!next.mention.includes('22 november') && !next.mention.includes('30 november'));

  const root = fixture();
  const recorded = note(root, 'Decided to drop the hackathon.', { at: '2026-11-11T10:00:00Z' });
  const mentions = note(root, 'The venue walk-through was on 12 November.', { at: '2026-10-20T10:00:00Z' });
  const planned = note(root, 'Board dinner is on 25 November.', { at: '2026-11-03T10:00:00Z' });
  const r = answer(root, 'What happened last week?', { now });
  assert.deepEqual(ids(r), [recorded.id], r);
  assert.match(r, /narrowed to last week\.$/m, 'no "or mentioning it": last week is recording time');
  assert.ok(!ids(r).includes(mentions.id));
  const n = answer(root, 'What is on next week?', { now });
  assert.deepEqual(ids(n), [planned.id], n);
  assert.match(n, /narrowed to next week \(recorded then or mentioning it\)\.$/m);
});

test('this week finds a note that mentions one of its days and ranks it above the notes only recorded this week', () => {
  const root = fixture();
  const old = note(root, 'Stale pipeline cleanup idea.', { at: '2026-10-01T10:00:00Z' });
  const otherWeek = note(root, 'Offsite is on 27 November in Lisbon.', { at: '2026-11-05T10:00:00Z' });
  const planned = note(root, 'Northwind renewal call is on 19 November at 15:00.', { at: '2026-10-28T10:00:00Z' });
  const sunday = note(root, 'Volunteer briefing happens November 22 at the venue.', { at: '2026-11-02T10:00:00Z' }, 'events');
  const typedIso = note(root, 'Deadline 2026-11-20 for the sponsor deck.', { at: '2026-11-10T10:00:00Z' });
  const monday = note(root, 'Typed on Monday: the espresso machine is broken.', { at: '2026-11-16T07:00:00Z' });
  const today = note(root, 'Typed today: lunch order placed.', { at: '2026-11-18T08:00:00Z' });
  const both = note(root, 'Typed on Tuesday: the investor update goes out on 20 November.', { at: '2026-11-17T08:00:00Z' });

  const r = answer(root, 'Good morning! What should I focus on this week?', { now });
  const got = ids(r);
  assert.deepEqual(new Set(got), new Set([planned.id, sunday.id, typedIso.id, monday.id, today.id, both.id]), r);
  assert.ok(!got.includes(old.id) && !got.includes(otherWeek.id), 'nothing from outside the week');
  // the four that mention a day of the week come first, newest first among them; the two only recorded then follow
  assert.deepEqual(got, [both.id, typedIso.id, sunday.id, planned.id, today.id, monday.id], r);
  assert.match(r, /^Answer for ".*": 6 notes match of 8, best first; narrowed to this week \(recorded then or mentioning it\)\.$/m);
  assert.doesNotMatch(r, /No note has/);
  assert.doesNotMatch(r, /Nothing for|without this week/);

  // with a word of the question, the notes that have it are the ones found, and a planned day still lifts a note
  const w = answer(root, 'which call is this week?', { now });
  assert.deepEqual(ids(w), [planned.id], w);
  // the rows form of search takes the same period
  assert.deepEqual(ids(search(root, 'this week', { now })).slice(0, 4), [both.id, typedIso.id, sunday.id, planned.id]);
});

test('a planned day outranks a note only recorded this week when both have the word asked for', () => {
  const root = fixture();
  const plannedDemo = note(root, 'The Lumen demo is on 20 November.', { at: '2026-10-15T10:00:00Z' });
  const recordedDemo = note(root, 'The Lumen demo went fine, they want a second one.', { at: '2026-11-17T10:00:00Z' });
  note(root, 'A demo from long ago.', { at: '2026-08-01T10:00:00Z' });
  const r = answer(root, 'demo this week', { now });
  assert.deepEqual(ids(r), [plannedDemo.id, recordedDemo.id], r);
});

test('a week that crosses a month, and one that crosses a year, carries the dates of both sides', () => {
  const dec1 = new Date('2026-12-01T09:00:00Z');   // a Tuesday; Monday 30 November to Sunday 6 December
  const p = period('this week', dec1);
  assert.equal(iso(p.from), '2026-11-30'); assert.equal(iso(p.to), '2026-12-07');
  assert.deepEqual(p.mention.filter(w => /^\d+ /.test(w)), ['30 november', '1 december', '2 december', '3 december', '4 december', '5 december', '6 december']);
  assert.ok(p.mention.includes('november 30') && p.mention.includes('december 6') && p.mention.includes('2026-11-30') && p.mention.includes('2026-12-06'));
  assert.ok(!p.mention.some(w => /\b(31 november|0 december|29 november|7 december)\b/.test(w)));
  const next = period('next week', new Date('2026-11-25T09:00:00Z'));
  assert.equal(iso(next.from), '2026-11-30'); assert.equal(iso(next.to), '2026-12-07');
  assert.deepEqual(next.mention, p.mention, 'next week seen from the week before is the same seven days');
  const last = period('last week', new Date('2026-12-08T09:00:00Z'));
  assert.equal(iso(last.from), '2026-11-30'); assert.equal(iso(last.to), '2026-12-07'); assert.equal(last.mention, undefined);
  const newYear = period('this week', new Date('2026-12-31T09:00:00Z'));   // a Thursday; 28 December to 3 January
  assert.equal(iso(newYear.from), '2026-12-28'); assert.equal(iso(newYear.to), '2027-01-04');
  assert.ok(newYear.mention.includes('31 december') && newYear.mention.includes('january 1') && newYear.mention.includes('2027-01-03'));

  const root = fixture();
  const november = note(root, 'Kickoff with Quillfeather is on 30 November.', { at: '2026-11-12T10:00:00Z' });
  const december = note(root, 'Contract review is due December 4.', { at: '2026-11-10T10:00:00Z' });
  const recorded = note(root, 'Typed on the first of the month: parking permit renewed.', { at: '2026-12-01T08:00:00Z' });
  const before = note(root, 'Workshop was on 27 November.', { at: '2026-11-13T10:00:00Z' });
  const after = note(root, 'Holiday party is on 11 December.', { at: '2026-11-14T10:00:00Z' });
  const r = answer(root, 'What are my priorities this week?', { now: dec1 });
  assert.deepEqual(ids(r), [november.id, december.id, recorded.id], r);
  assert.ok(!ids(r).includes(before.id) && !ids(r).includes(after.id));
});

test('focus, priority, morning, hi, brief and prep are not search words: alone they bring no "No note has" line', () => {
  const root = fixture();
  lib.addName(root, 'Acme Robotics', { kind: 'organization', aliases: ['Acme'] });
  const planned = note(root, 'Pricing workshop is on 19 November.', { at: '2026-11-03T10:00:00Z' });
  const acme = note(root, 'Acme Robotics asked for a two-year term.', { people: ['Acme Robotics'], at: '2026-11-09T10:00:00Z' });
  const names = lib.readNames(root);
  for (const w of ['focus', 'priority', 'priorities', 'morning', 'hi', 'hello', 'hey', 'brief', 'briefing', 'prep', 'prepare']) {
    assert.deepEqual(parseQuestion(`${w} this week`, names, { now }).terms, [], w);
    assert.deepEqual(parseQuestion(w[0].toUpperCase() + w.slice(1), names, { now }).terms, [], `${w} capitalized`);
  }
  for (const question of ['Hi, what should I focus on this week?', 'Good morning, my priorities this week?', 'What is the priority this week?']) {
    const r = answer(root, question, { now });
    assert.doesNotMatch(r, /No note has/, r);
    assert.doesNotMatch(r, /^Not found/, r);
    assert.equal(ids(r)[0], planned.id, r);
  }
  // a greeting is not searched either, wherever it stands; "good" on its own stays a word
  assert.deepEqual(parseQuestion('Good morning, my priorities this week?', names, { now }).terms, []);
  assert.deepEqual(parseQuestion('Hi, good afternoon. What is planned this week?', names, { now }).terms, ['planned']);
  assert.deepEqual(parseQuestion('is Acme a good fit', names, { now }).terms, ['good', 'fit']);
  // with a name, the ignored word leaves the name's notes as they are
  const b = answer(root, 'Brief me on Acme', { now });
  assert.deepEqual(ids(b), [acme.id], b);
  assert.doesNotMatch(b, /No note has|None of the notes/);
  // a word the notes do not have and that is not ignored still gets its line
  assert.match(answer(root, 'focus on the zeppelin this week', { now }), /no note has "zeppelin"/i);
  // the rows form of search, given only such a word, searches for it as typed
  const word = note(root, 'Our focus for the quarter is retention.', { at: '2026-09-01T10:00:00Z' });
  assert.deepEqual(ids(search(root, 'focus', { now })), [word.id]);
});

function acmeBrain() {
  const root = fixture();
  lib.addName(root, 'Acme Robotics', { kind: 'organization', aliases: ['Acme'] });
  lib.addName(root, 'Dana Whitlock', { kind: 'person' });
  const at = d => `2026-${d}T10:00:00Z`;
  const about = { people: ['Acme Robotics'] };
  const notes = [
    note(root, 'Acme Robotics signed the pilot for two warehouses.', { ...about, at: at('08-03') }),
    note(root, 'Acme Robotics pays by invoice, net 30.', { ...about, at: at('08-20') }),
    note(root, 'Their champion at Acme Robotics is the head of operations.', { ...about, at: at('09-02') }),
    note(root, 'Acme Robotics asked about single sign-on.', { ...about, at: at('09-15') }),
    note(root, 'Intro call with Acme Robotics went well.', { ...about, at: at('09-28') }),
    note(root, 'Acme Robotics wants a quarterly business review.', { ...about, at: at('10-06') }),
    note(root, 'Acme Robotics flagged slow exports in the dashboard.', { ...about, at: at('10-14') }),
    note(root, 'Export fix shipped for Acme Robotics.', { ...about, at: at('10-22') }),
    note(root, 'Acme Robotics is comparing us with a cheaper vendor.', { ...about, at: at('11-02') }),
    note(root, 'Renewal call with Acme Robotics is on 19 November at 14:00.', { ...about, at: at('11-05') }),
    note(root, 'Acme Robotics budget for next year is flat.', { ...about, at: at('11-10') }),
    note(root, 'Acme Robotics asked for a discount on the third warehouse.', { ...about, at: at('11-16') }),
  ];
  const dana = note(root, 'Dana Whitlock prefers short emails.', { people: ['Dana Whitlock'], at: at('11-12') });
  const elsewhere = note(root, 'Team standup call moves to 19 November.', { at: at('11-15') });
  return { root, notes, dana, elsewhere, tomorrowNote: notes[9] };
}
const CARD = /^Acme Robotics · organization · e_[0-9a-f]{16} · also: Acme · 12 notes, newest 2026-11-16 \(2 days ago\)/m;

test('a prep question about a known name with a day ahead returns the card and the newest notes, not the day\'s one note', () => {
  const { root, notes, dana, elsewhere, tomorrowNote } = acmeBrain();
  const newestFirst = [...notes].reverse().map(n => n.id);
  const r = answer(root, 'I have a call with Acme tomorrow, brief me', { now });
  assert.match(r, CARD);
  assert.match(r, /^Answer for ".*": 12 notes match of 14, best first; narrowed to Acme Robotics \("Acme"\)\.$/m);
  assert.deepEqual(ids(r), newestFirst.slice(0, ANSWER_NOTES), r);
  assert.ok(ids(r).includes(tomorrowNote.id), 'the note about the call is among them, in its place by date');
  assert.ok(!ids(r).includes(dana.id) && !ids(r).includes(elsewhere.id), 'only the notes of the name');
  assert.doesNotMatch(r, /tomorrow \(recorded|Nothing for|None of the notes|No note has/);
  assert.match(r, /^4 more match\. For them: query object answer with the same search and limit 12 /m);
  const all = answer(root, 'I have a call with Acme tomorrow, brief me', { now, limit: 20 });
  assert.deepEqual(ids(all), newestFirst, 'all twelve, newest first');

  // the same from other wordings and other days ahead
  for (const question of [
    'Prep me for the Acme meeting tomorrow',
    'Help me prepare for my sync with Acme Robotics on 19 November',
    'I need a briefing for the Acme call next week',
    'Get ready for the chat with Acme on 2026-11-24',
    'Brief me for the Acme meeting next Friday',
  ]) {
    const x = answer(root, question, { now });
    assert.match(x, CARD, question);
    assert.deepEqual(ids(x), newestFirst.slice(0, ANSWER_NOTES), `${question}\n${x}`);
    assert.doesNotMatch(x, /Nothing for|None of the notes|No note has/, question);
  }
});

test('the parsed prep question has no period and no call or meeting word; the day it was for is kept as prep', () => {
  const { root } = acmeBrain();
  const names = lib.readNames(root);
  const q = parseQuestion('I have a call with Acme tomorrow, brief me', names, { now });
  assert.equal(q.period, null); assert.equal(q.prep, 'tomorrow');
  assert.deepEqual(q.entities.map(e => e.name), ['Acme Robotics']);
  assert.deepEqual(q.terms, []);
  const kept = parseQuestion('Prep me for the pricing meeting and the calls with Acme tomorrow', names, { now });
  assert.equal(kept.prep, 'tomorrow');
  assert.deepEqual(kept.terms, ['pricing'], 'a word about the subject stays');
  for (const w of ['call', 'calls', 'meeting', 'meetings', 'chat', 'sync']) assert.deepEqual(parseQuestion(`brief me for the ${w} with Acme tomorrow`, names, { now }).terms, [], w);
  // the words of the asking are not searched: "get ready", "help me prepare", "I need a briefing"
  for (const question of ['Get ready for the chat with Acme tomorrow', 'Help me prepare for Acme tomorrow', 'I need a briefing for the Acme call tomorrow']) assert.deepEqual(parseQuestion(question, names, { now }).terms, [], question);
  assert.deepEqual(parseQuestion('what help does Acme need tomorrow', names, { now }).terms, ['help', 'need'], 'outside a prep question they are words');
  // a subject word ranks inside the name's notes
  const { root: r2, notes } = acmeBrain();
  const d = answer(r2, 'Brief me for the Acme call tomorrow about the discount', { now });
  assert.equal(ids(d)[0], notes[11].id, d);
});

test('control: a plain question with the same name and day still narrows by the day', () => {
  const { root, notes, tomorrowNote, elsewhere } = acmeBrain();
  const names = lib.readNames(root);
  const q = parseQuestion('what happened with Acme tomorrow', names, { now });
  assert.equal(q.prep, undefined);
  assert.equal(q.period.label, 'tomorrow');
  assert.equal(iso(q.period.from), '2026-11-19');
  const r = answer(root, 'what happened with Acme tomorrow', { now });
  assert.deepEqual(ids(r), [tomorrowNote.id], r);
  assert.match(r, /^Answer for ".*": 1 note matches of 14, best first; narrowed to Acme Robotics \("Acme"\), tomorrow \(recorded then or mentioning it\)\.$/m);
  assert.match(r, CARD);
  assert.ok(!ids(r).includes(elsewhere.id), 'another note about that day is not Acme\'s');
  // and the words call and meeting are search words again
  const c = parseQuestion('which call with Acme is tomorrow', names, { now });
  assert.deepEqual(c.terms, ['call']); assert.equal(c.period.label, 'tomorrow');
  assert.deepEqual(ids(answer(root, 'which call with Acme is tomorrow', { now })), [tomorrowNote.id]);
  assert.deepEqual(ids(answer(root, 'Acme call', { now })).slice(0, 2).sort(), [notes[4].id, notes[9].id].sort(), 'without a day, call ranks the two notes that have it');
});

test('not a prep question: no known name, a day that is past, or a period that is not a day ahead', () => {
  const { root, notes, tomorrowNote, elsewhere } = acmeBrain();
  const names = lib.readNames(root);
  // no name the brain knows: the day and the word call narrow as before
  const unknown = parseQuestion('I have a call with Globex tomorrow, brief me', names, { now });
  assert.equal(unknown.prep, undefined); assert.equal(unknown.period.label, 'tomorrow');
  assert.ok(unknown.terms.includes('call') && unknown.terms.includes('globex'));
  const u = answer(root, 'I have a call tomorrow, brief me', { now });
  assert.deepEqual(new Set(ids(u)), new Set([tomorrowNote.id, elsewhere.id]), u);
  // a day that is past: "brief me on the Acme call on 28 September" is about that day
  const past = parseQuestion('brief me on the Acme call on 28 September', names, { now });
  assert.equal(past.prep, undefined); assert.equal(past.period.label, '28 September 2026');
  assert.deepEqual(past.terms, ['call']);
  assert.deepEqual(ids(answer(root, 'brief me on the Acme call on 28 September', { now })), [notes[4].id]);
  // a period with no dates to mention (last week, yesterday) stays a period
  const last = parseQuestion('brief me on Acme last week', names, { now });
  assert.equal(last.prep, undefined); assert.equal(last.period.label, 'last week');
  assert.deepEqual(ids(answer(root, 'brief me on Acme last week', { now })), [notes[10].id]);
  assert.equal(parseQuestion('prep for the Acme call yesterday', names, { now }).period.label, 'yesterday');
  // no prep word: the day narrows
  assert.equal(parseQuestion('I have a call with Acme tomorrow', names, { now }).period.label, 'tomorrow');
});

test('this week in a question about the past: what was recorded comes first, and another year\'s same date is not found', () => {
  const root = fixture();
  const y2024 = note(root, 'In 2024 we decided on 18 November to stop the newsletter.', { at: '2024-11-25T10:00:00Z' });
  const y2023 = note(root, 'The outage was on November 20 and we decided never again.', { at: '2023-11-21T10:00:00Z' });
  const invoice = note(root, 'Invoice 114 is dated 2026-11-17.', { at: '2026-09-10T10:00:00Z' });
  const d1 = note(root, 'We decided to move the launch.', { kind: 'decision', at: '2026-11-16T10:00:00Z' });
  const d2 = note(root, 'We decided to hire a second designer.', { kind: 'decision', at: '2026-11-17T10:00:00Z' });
  const typed = note(root, 'The printer is out of toner.', { at: '2026-11-18T08:00:00Z' });
  for (const at of [now, new Date('2026-11-22T21:00:00Z')]) {
    const d = answer(root, 'what did we decide this week', { now: at });
    assert.deepEqual(new Set(ids(d)), new Set([d1.id, d2.id]), d);
    const h = answer(root, 'what happened this week', { now: at });
    assert.deepEqual(ids(h), [typed.id, d2.id, d1.id, invoice.id], h);
    assert.ok(!ids(h).includes(y2024.id) && !ids(h).includes(y2023.id), 'a date without a year in a note more than a year old is another year\'s');
    // looking ahead, the note that mentions a day of the week still comes first, and the old years stay out
    const f = answer(root, 'What should I focus on this week?', { now: at });
    assert.equal(ids(f)[0], invoice.id, f);
    assert.ok(!ids(f).includes(y2024.id) && !ids(f).includes(y2023.id));
  }
  assert.equal(parseQuestion('what did we decide this week', [], { now }).past, true);
  assert.equal(parseQuestion('What should I focus on this week?', [], { now }).past, undefined);
});

test('a prep question for today, later today, this week on any day, and a bare or "this" weekday returns the newest notes', () => {
  const { root, notes } = acmeBrain();
  const names = lib.readNames(root), newestFirst = [...notes].reverse().map(n => n.id);
  for (const [question, label] of [
    ['I have a call with Acme today, brief me', 'today'],
    ['Brief me for the Acme call later this afternoon', 'today'],
    ['Prep me for the Acme meeting tonight', 'today'],
    ['Prep me for the Acme call this week', 'this week'],
    ['Brief me for the Acme call on Friday', 'Friday 2026-11-20'],
    ['Brief me for the Acme call this Friday', 'Friday 2026-11-20'],
    ['Brief me for the Acme call on Wednesday', 'Wednesday 2026-11-18'],
    ['Brief me for the Acme call on Monday', 'Monday 2026-11-23'],
  ]) {
    const q = parseQuestion(question, names, { now });
    assert.equal(q.prep, label, question); assert.equal(q.period, null, question); assert.deepEqual(q.terms, [], question);
    const x = answer(root, question, { now });
    assert.match(x, CARD, question);
    assert.deepEqual(ids(x), newestFirst.slice(0, ANSWER_NOTES), `${question}\n${x}`);
    assert.doesNotMatch(x, /Nothing for|None of the notes|No note has/, question);
  }
  // this week is prep on Monday and on Sunday alike
  for (const at of ['2026-11-16T09:00:00Z', '2026-11-22T21:00:00Z']) assert.equal(parseQuestion('Prep me for the Acme call this week', names, { now: new Date(at) }).prep, 'this week', at);
  // not prep: the weekday said to be the last one, a question in the past tense, a past stretch that reaches today, the running month
  for (const [question, label] of [
    ['Brief me on the Acme call last Friday', 'Friday 2026-11-13'],
    ['Brief me on what Acme said on Friday', 'Friday 2026-11-13'],
    ['Brief me on what Acme said today', 'today'],
    ['Brief me on what Acme decided this week', 'this week'],
    ['Brief me on Acme in the last 7 days', 'the last 7 days'],
    ['Brief me on Acme in November', 'November 2026'],
  ]) {
    const q = parseQuestion(question, names, { now });
    assert.equal(q.prep, undefined, question); assert.equal(q.period?.label, label, question);
  }
});

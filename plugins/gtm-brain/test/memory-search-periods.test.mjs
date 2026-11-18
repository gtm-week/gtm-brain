// Questions about a period of time (w81, a real brain on 2026-11-17: the time tasks scored 25 percent, and "what
// is slipping this week, today is <date>" was read as that one day). Every period form, counted from the day the
// question says it is or the real date, weeks from Monday; a note counts by the day it was said or happened
// (said_on), else the day it was recorded; a due or slipping question also finds dated commitments inside the
// period. Every name here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as lib from '../lib/brain.mjs';
import { answer, search, parsePeriod, parseQuestion, statedToday, periodParams } from '../lib/memory-search.mjs';
process.env.TZ = 'UTC';
process.env.GTM_BRAIN_NO_COMMIT = '1';
process.env.GTM_BRAIN_NO_COMPILE = '1';
process.env.GTM_BRAIN_NOW = '2026-11-18T09:00:00Z';   // a Wednesday; its week is Monday 16 to Sunday 22 November
const now = new Date(process.env.GTM_BRAIN_NOW);

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const last = d => iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
const range = (s, at = now) => { const p = parsePeriod(s, at).period; return p && `${iso(p.from)}..${last(p.to)}`; };
const ids = s => [...new Set((String(s).match(/m_[0-9a-f]{12}/g) || []))];
// the ids the reply lists as in the period: dated inside it (said before) and said or recorded in it
const periodIds = r => ({ ahead: ids(/^Naming a day inside the period[^\n]*/m.exec(r)?.[0] || ''), said: ids(/^(?:Other notes in the period|In the period)[^\n]*/m.exec(r)?.[0] || '') });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gtm-memory-search-periods-'));
  mkdirSync(join(root, 'brain'));
  writeFileSync(join(root, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Northfold', team: [{ name: 'Anna Lind', handle: 'anna', email: 'anna@northfold.test' }] }));
  for (const slug of ['sales', 'events']) lib.writeContext(root, slug, { title: slug });
  return root;
}
const note = (root, content, extra = {}, slug = 'sales') => lib.appendMemory(root, slug, { authors: ['anna'], content, ...extra }).rec;

test('every period form resolves to the right days, weeks from Monday', () => {
  assert.equal(range('what happened this week'), '2026-11-16..2026-11-22');
  assert.equal(range('what happened last week'), '2026-11-09..2026-11-15');
  assert.equal(range('the previous week'), '2026-11-09..2026-11-15');
  assert.equal(range('what is on next week'), '2026-11-23..2026-11-29');
  assert.equal(range('the week before last'), '2026-11-02..2026-11-08');
  assert.equal(range('2 weeks ago'), '2026-11-02..2026-11-08');
  assert.equal(range('What did we settle during the week of 9 November?'), '2026-11-09..2026-11-15');
  assert.equal(range('in the week of 12 November'), '2026-11-09..2026-11-15', 'a Thursday: its week from Monday');
  assert.equal(range('the week of 26 October'), '2026-10-26..2026-11-01');
  assert.equal(range('this month'), '2026-11-01..2026-11-30');
  assert.equal(range('last month'), '2026-10-01..2026-10-31');
  assert.equal(range('month to date'), '2026-11-01..2026-11-18');
  assert.equal(range('in the last 7 days'), '2026-11-11..2026-11-18');
  assert.equal(range('over the past 2 weeks'), '2026-11-04..2026-11-18');
  assert.equal(range('the last 3 months'), '2026-08-18..2026-11-18');
  assert.equal(range('next 5 days'), '2026-11-18..2026-11-23');
  assert.equal(range('what changed since 3 November'), '2026-11-03..2026-11-18');
  assert.equal(range('what changed since 2026-11-03'), '2026-11-03..2026-11-18');
  assert.equal(range('what changed since last week'), '2026-11-09..2026-11-18');
  assert.equal(range('anything new since Monday'), '2026-11-16..2026-11-18');
  assert.equal(range('everything since October'), '2026-10-01..2026-11-18');
  assert.equal(range('what happened after 10 November'), '2026-11-11..2026-11-18');
  assert.equal(range('between 2 and 6 November'), '2026-11-02..2026-11-06');
  assert.equal(range('from 9-13 November'), '2026-11-09..2026-11-13');
  assert.equal(range('between 2 November and 6 November'), '2026-11-02..2026-11-06');
  assert.equal(range('from 2026-11-02 to 2026-11-06'), '2026-11-02..2026-11-06');
  assert.equal(range('2026-11-02 - 2026-11-06'), '2026-11-02..2026-11-06');
  assert.equal(range('from 28 October to 4 November'), '2026-10-28..2026-11-04', 'across a month');
  assert.equal(range('between September and October'), '2026-09-01..2026-10-31');
  assert.equal(range('pipeline in Q3'), '2026-07-01..2026-09-30');
  assert.equal(range('Q2 2025 numbers'), '2025-04-01..2025-06-30');
  assert.equal(range('the third quarter of 2025'), '2025-07-01..2025-09-30');
  assert.equal(range('last quarter'), '2026-07-01..2026-09-30');
  assert.equal(range('this quarter'), '2026-10-01..2026-12-31');
  assert.equal(range('this year'), '2026-01-01..2026-12-31');
  assert.equal(range('what is due on 20 November'), '2026-11-20..2026-11-20', 'one day stays one day');
  assert.equal(range('what did we say yesterday'), '2026-11-17..2026-11-17');
  // a Sunday and a Monday: the week is still Monday to Sunday
  assert.equal(range('this week', new Date('2026-11-22T20:00:00Z')), '2026-11-16..2026-11-22');
  assert.equal(range('this week', new Date('2026-11-23T08:00:00Z')), '2026-11-23..2026-11-29');
});

test('the day the question says it is moves the period; it is never read as a one-day filter', () => {
  for (const [q, want, today] of [
    ['What is slipping this week, today is 2026-11-18', '2026-11-16..2026-11-22', '2026-11-18'],
    ['What is slipping this week? Today is 25 November 2026.', '2026-11-23..2026-11-29', '2026-11-25'],
    ['what happened last week (today: 2026-11-25)', '2026-11-16..2026-11-22', '2026-11-25'],
    ['It is 2026-12-02. What is due this month?', '2026-12-01..2026-12-31', '2026-12-02'],
    ['Today is Wednesday, 4 November 2026: what did we decide in the last 7 days?', '2026-10-28..2026-11-04', '2026-11-04'],
    ['slipping this week 2026-11-25', '2026-11-23..2026-11-29', '2026-11-25'],   // a lone date beside a period word
    ['what slipped last month, 2026-12-10', '2026-11-01..2026-11-30', '2026-12-10'],
  ]) {
    const r = parsePeriod(q, now);
    assert.equal(`${iso(r.period.from)}..${last(r.period.to)}`, want, q);
    assert.equal(iso(r.today), today, q);
    assert.doesNotMatch(r.rest, /\d{4}-\d{2}-\d{2}|today/i, `the stated day is taken out of the words: ${r.rest}`);
  }
  // a date that is the period itself is not today
  assert.equal(statedToday('what did we decide on 12 November last week', now).today, null);
  assert.equal(statedToday('what happened in the week of 9 November', now).today, null);
  assert.equal(statedToday('what happened on 2026-11-12', now).today, null, 'no period word: the date is the day asked about');
  assert.equal(range('what happened on 2026-11-12'), '2026-11-12..2026-11-12');
});

test('a single day passed with a period word is today; two days are the period; bad days are refused', () => {
  const names = [];
  const day = s => new Date(`${s}T00:00:00`);
  const p = (q, o) => { const x = parseQuestion(q, names, { now, ...o }).period; return `${iso(x.from)}..${last(x.to)}`; };
  assert.equal(p('what is slipping this week', { from: day('2026-11-25'), to: day('2026-11-25') }), '2026-11-23..2026-11-29');
  assert.equal(p('what happened', { from: day('2026-11-25'), to: day('2026-11-25') }), '2026-11-25..2026-11-25');
  assert.equal(p('what happened', { from: day('2026-11-02'), to: day('2026-11-06') }), '2026-11-02..2026-11-06');
  assert.equal(p('what happened in the week of 9 November', { from: day('2026-11-09'), to: day('2026-11-09') }), '2026-11-09..2026-11-15', 'the week the question names stays');
  assert.match(periodParams({ today: '18 November' }).error, /today: a day as YYYY-MM-DD/);
  assert.match(periodParams({ from: '2026-11-10', to: '2026-11-02' }).error, /after/);
  assert.equal(periodParams({ today: '2026-11-18' }).error, undefined);
});

test('a period selects notes by the day they were said or happened, not the day they were typed', () => {
  const root = fixture();
  // said in the week of 9 November, typed a week later
  const said = note(root, 'Acme Retail agreed the pilot price with Anna Lind.', { at: '2026-11-17T10:00:00Z', tags: ['said:2026-11-11'] });
  // typed in the week of 9 November about something said in October
  const old = note(root, 'Acme Retail asked about the onboarding plan.', { at: '2026-11-12T10:00:00Z', tags: ['said:2026-10-20'] });
  const plain = note(root, 'Acme Retail sent the signed order form.', { at: '2026-11-13T10:00:00Z' });
  note(root, 'Northfold hired a second designer.', { at: '2026-11-17T11:00:00Z' });
  const r = answer(root, 'What happened in the week of 9 November?', { now });
  const best = ids(r.split('Best matches')[1].split('Period asked')[0]);
  assert.deepEqual(best.sort(), [said.id, plain.id].sort(), r);
  assert.match(r, /Period asked: the week of 2026-11-09 = Mon 2026-11-09 to Sun 2026-11-15, both included/);
  const hits = periodIds(r).said;
  assert.ok(hits.includes(said.id) && hits.includes(plain.id) && !hits.includes(old.id), r);
  // the line shows the day it was said
  assert.match(r, new RegExp(`- 2026-11-11 · sales · anna · Acme Retail agreed the pilot price with Anna Lind\\. · ${said.id}`));
  // a memories search is narrowed the same way
  const s = search(root, 'last week', { now });
  assert.ok(s.includes(said.id) && s.includes(plain.id) && !s.includes(old.id), s);
});

test('what is slipping this week, today is a date: the week, with the commitments dated inside it', () => {
  const root = fixture();
  // promised earlier, due on days of the week of 23 November
  const due1 = note(root, 'Anna Lind promised Acme Retail the revised quote by 24 November.', { at: '2026-11-10T09:00:00Z' });
  const due2 = note(root, 'The Northfold workshop deck is due 2026-11-27.', { at: '2026-11-05T09:00:00Z' });
  // due outside the week
  const later = note(root, 'Contract renewal for Acme Retail is due 15 December.', { at: '2026-11-06T09:00:00Z' });
  // recorded in the week, not a due date
  const inWeek = note(root, 'Acme Retail opened the proposal twice.', { at: '2026-11-24T09:00:00Z' });
  // the stated day itself: under the old reading only this note was in scope
  const sameDay = note(root, 'Coffee with the Northfold board.', { at: '2026-11-25T09:00:00Z' });
  for (const q of ['What is slipping this week, today is 2026-11-25', 'What is due this week? Today is 25 November 2026']) {
    const r = answer(root, q, { now });
    assert.match(r, /Period asked: this week = Mon 2026-11-23 to Sun 2026-11-29, both included \(today 2026-11-25/, r);
    assert.match(r, /has slipped/);
    const { ahead, said } = periodIds(r);
    assert.deepEqual(ahead.sort(), [due1.id, due2.id].sort(), 'the commitments dated in the week, said before it');
    for (const m of [inWeek, sameDay]) assert.ok(said.includes(m.id), `${m.content} in ${said}`);
    assert.ok(![...ahead, ...said].includes(later.id), 'a later due date is outside the week');
    // the dated commitments are the best matches, before what was only said in the week
    assert.deepEqual(ids(r.split('Best matches')[1].split('Period asked')[0]).slice(0, 2).sort(), [due1.id, due2.id].sort(), r);
  }
  // the today parameter does the same, and a single day passed with the period word is today
  const viaParam = answer(root, 'What is slipping this week?', { now, today: '2026-11-25' });
  assert.match(viaParam, /this week = Mon 2026-11-23 to Sun 2026-11-29/);
  const tolerant = answer(root, 'What is slipping this week?', { now, from: '2026-11-25', to: '2026-11-25' });
  assert.match(tolerant, /this week = Mon 2026-11-23 to Sun 2026-11-29/);
  const s = search(root, 'slipping this week', { now, today: '2026-11-25', limit: 20 });
  for (const m of [due1, due2]) assert.ok(s.includes(m.id), `a memories search finds ${m.content}`);
  assert.ok(!s.includes(later.id));
  assert.match(answer(root, 'What is slipping?', { now, today: 'next week' }), /today: a day as YYYY-MM-DD/);
});

test('a due question for last week and for a month also counts commitments dated inside them', () => {
  const root = fixture();
  const lastWeek = note(root, 'Anna Lind owes Acme Retail the security answers by 12 November.', { at: '2026-11-02T09:00:00Z' });
  const month = note(root, 'Northfold invoice for the summit is due 30 November.', { at: '2026-10-15T09:00:00Z' });
  note(root, 'Acme Retail likes the new logo.', { at: '2026-10-16T09:00:00Z' });
  const a = answer(root, 'What was due last week?', { now });
  assert.deepEqual(periodIds(a).ahead, [lastWeek.id], a);
  const b = answer(root, 'What is due this month?', { now });
  assert.deepEqual(periodIds(b).ahead.sort(), [lastWeek.id, month.id].sort(), 'both fall due in November: 12 and 30 November');
  // a note carrying its own date in its text is said then, not due then; a month named without a day is no day of a week
  const own = note(root, '2026-11-17, Anna Lind: Petra Novak sent the November newsletter.', { at: '2026-11-17T09:00:00Z' });
  const w = answer(root, 'What is due this week?', { now });
  assert.ok(!periodIds(w).ahead.includes(own.id) && periodIds(w).said.includes(own.id), w);
  assert.equal(answer(root, 'What is due next week?', { now }).includes(`Naming a day inside the period, said before it (1): ${own.id}`), false, '"Novak" and "November" name no day of next week');
  // without a due word, last week is what was said then: an older note naming a date is not "what happened"
  assert.equal(parseQuestion('What happened last week?', [], { now }).period.mention, undefined);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import * as lib from '../lib/brain.mjs';
process.env.GTM_BRAIN_NO_COMMIT = '1'; process.env.GTM_BRAIN_NO_COMPILE = '1';
const plugin = new URL('../', import.meta.url).pathname;
const env = { ...process.env, GTM_BRAIN_NO_COMMIT: '1', GTM_BRAIN_NO_COMPILE: '1', GTM_BRAIN_NO_OPEN: '1' };
const at = day => `2026-09-${String(day).padStart(2, '0')}T10:00:00Z`;
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'gtm-meetings-'));
  mkdirSync(join(root, 'brain')); mkdirSync(join(root, 'work'));
  writeFileSync(join(root, 'brain/admin.md'), lib.renderFrontmatter({ company: 'Fixture', tools: ['granola', 'calendar'], team: [
    { name: 'Ann Lee', handle: 'ann', email: 'ann@fixture.test' }, { name: 'Bob Yu', handle: 'bob', email: 'bob@fixture.test' }] }));
  for (const slug of ['offer', 'strategy']) lib.writeContext(root, slug, { title: slug });
  for (const handle of ['ann', 'bob']) lib.writeContext(root, `personal-${handle}`, { title: handle, personal_owner: handle });
  lib.addName(root, 'Unknown Buyer');
  return root;
}
const meeting = (extra = {}) => ({ title: 'Customer discovery', reference: { kind: 'granola', account: 'work', ref: 'note-1' },
  evidence: 'transcript', occurrence: 'happened', basis: 'source', observed_at: at(10), occurred_at: '2026-09-09', capture: 'complete',
  participants: [{ name: 'Unknown Buyer', role: 'attended' }], ...extra });
const source = [{ kind: 'granola', ref: 'https://notes.test/note-1?workspace=work#summary' }];
const record = (root, extra = {}) => lib.appendMemory(root, 'offer', { authors: ['ann'], content: 'A customer discovery conversation took place.', at: at(10), people: ['Unknown Buyer'], source, meeting: meeting(), ...extra }).rec;
const memories = root => lib.listContexts(root).flatMap(c => c.memories);
function remember(root, entries) {
  const file = join(root, 'work/input.json'); writeFileSync(file, JSON.stringify(entries));
  return spawnSync(process.execPath, [join(plugin, 'scripts/gtm-brain-remember/remember.mjs'), root, '--by', 'ann', '--batch', file], { env, encoding: 'utf8' });
}

test('a transcript anchors a meeting without calendar/CRM, links cross-context outcomes, and retries do not append', () => {
  const root = setup(), first = record(root), before = memories(root).length;
  assert.equal(first.meeting_id, first.id);
  assert.equal(record(root, { at: at(11), meeting: meeting({ observed_at: at(11) }) }).id, first.id);
  assert.equal(memories(root).length, before);
  const outcome = lib.appendMemory(root, 'strategy', { authors: ['ann'], content: 'Buyer needs a shorter onboarding process.', kind: 'note', meeting_id: first.id, people: ['Unknown Buyer'], source }).rec;
  const row = lib.meetingOverview(root, { entity: 'Unknown Buyer' }).meetings[0];
  assert.equal(row.state, 'captured'); assert.equal(row.occurrence, 'happened'); assert.equal(row.occurred_at, '2026-09-09');
  assert.deepEqual(row.outcomes.map(m => m.id), [outcome.id]); assert.deepEqual(row.sources, source);
});

test('updated transcripts preserve the anchor and history, while source identity is scoped by account', () => {
  const root = setup(), first = record(root);
  record(root, { at: at(12), content: 'Updated transcript: buyer confirmed the date.', meeting: meeting({ revision: 'v2', observed_at: at(12) }) });
  let view = lib.meetingOverview(root); assert.equal(view.meetings.length, 1); assert.equal(view.meetings[0].id, first.id);
  assert.equal(view.meetings[0].evidence.length, 1); assert.equal(view.meetings[0].history.length, 2);
  record(root, { meeting: meeting({ reference: { kind: 'granola', account: 'other-workspace', ref: 'note-1' } }) });
  assert.equal(lib.meetingOverview(root).meetings.length, 2);
});

test('calendar plans and pending notes cannot establish occurrence, attendance, or a missing-transcript task', () => {
  const root = setup();
  assert.throws(() => record(root, { meeting: meeting({ evidence: 'calendar' }) }), /cannot establish/);
  assert.throws(() => record(root, { meeting: meeting({ evidence: 'pending' }) }), /cannot establish/);
  const calendar = meeting({ evidence: 'calendar', occurrence: 'planned', occurred_at: null, scheduled_at: at(2), reference: { kind: 'calendar', account: 'work:primary', ref: 'event-1' }, participants: [{ name: 'Unknown Buyer', role: 'invited' }] });
  assert.throws(() => record(root, { source: [{ kind: 'calendar', ref: 'event-1' }], meeting: { ...calendar, participants: [{ name: 'Unknown Buyer', role: 'attended' }] } }), /attendance/);
  record(root, { source: [{ kind: 'calendar', ref: 'event-1' }], meeting: calendar });
  const view = lib.meetingOverview(root); assert.equal(view.meetings[0].state, 'planned'); assert.equal(view.meetings[0].outcomes.length, 0);
});

test('processing gaps derive from actual source records and resolve when their transcript arrives', () => {
  const root = setup(), first = record(root, { meeting: meeting({ evidence: 'recording', capture: 'pending', occurred_at: null }) });
  assert.equal(lib.meetingOverview(root).meetings[0].state, 'processing');
  record(root, { at: at(12), meeting: meeting({ observed_at: at(12), revision: 'ready' }) });
  const view = lib.meetingOverview(root).meetings; assert.equal(view.length, 1); assert.equal(view[0].id, first.id); assert.equal(view[0].state, 'captured');
});

test('a future agenda with available notes stays planned and never enters the processing queue', () => {
  const root = setup();
  const agenda = meeting({ evidence: 'notes', occurrence: 'planned', occurred_at: null, scheduled_at: at(20), participants: [], capture: 'complete' });
  assert.throws(() => record(root, { meeting: { ...agenda, capture: 'pending' } }), /not a processing gap/);
  record(root, { meeting: agenda });
  const row = lib.meetingOverview(root).meetings[0]; assert.equal(row.state, 'planned'); assert.equal(row.occurrence, 'planned');
  assert.equal(lib.meetingOverview(root, { state: 'processing' }).meetings.length, 0);
});

test('a matched calendar reference does not replace evidence that the conversation happened', () => {
  const root = setup(), first = record(root);
  record(root, { meeting_id: first.id, source: [{ kind: 'calendar', ref: 'https://calendar.test/event-1' }], meeting: meeting({ reference: { kind: 'calendar', account: 'primary', ref: 'event-1' }, evidence: 'calendar', occurrence: 'cancelled', observed_at: at(12), occurred_at: null, participants: [] }) });
  const row = lib.meetingOverview(root).meetings[0]; assert.equal(row.occurrence, 'happened'); assert.equal(row.sources.length, 2);
  assert.equal(row.evidence.length, 2);
});

test('user corrections survive source refresh even for the same source reference', () => {
  const root = setup(), first = record(root);
  const correction = record(root, { at: at(11), content: 'The conversation happened on September 8.', source: [{ kind: 'user', ref: 'ann' }], supersedes: first.id,
    meeting: meeting({ basis: 'user', observed_at: at(11), occurred_at: '2026-09-08' }) });
  assert.throws(() => record(root, { supersedes: correction.id }), /Source refresh/);
  record(root, { at: at(12), meeting: meeting({ observed_at: at(12), revision: 'v3' }) });
  assert.equal(lib.meetingOverview(root).meetings[0].occurred_at, '2026-09-08');
  assert.throws(() => lib.appendMemory(root, 'offer', { authors: ['ann'], content: 'Gone from source.', retracts: correction.id }), /Source refresh/);
});

test('per-person meeting overrides beat series rules and do not suppress a teammate or shared evidence', () => {
  const root = setup(), first = record(root, { meeting: meeting({ series: 'calendar/work/primary/series-1' }) });
  const decide = (by, scope, target, status, day) => lib.appendMemory(root, 'offer', { authors: [by], content: `${by} chooses ${status}.`, at: at(day), source: [{ kind: 'user', ref: by }], meeting_capture: { by, scope, target, status, basis: 'user', reason: 'User choice' } });
  decide('ann', 'series', 'calendar/work/primary/series-1', 'include', 10);
  decide('ann', 'meeting', first.id, 'skip', 11);
  decide('bob', 'meeting', first.id, 'include', 12);
  assert.equal(lib.meetingOverview(root, { by: 'ann' }).meetings[0].state, 'skipped');
  assert.equal(lib.meetingOverview(root, { by: 'bob' }).meetings[0].state, 'captured');
  assert.equal(lib.meetingOverview(root).meetings[0].state, 'captured');
});

test('policy requires a submitted user source and the matching personal context', () => {
  const root = setup(), policy = { by: 'ann', sources: ['granola/work'], calendars: ['calendar/primary'], include: ['Customer conversations', 'Internal decisions'], exclude: ['Personal'], calendar_refresh: 'daily' };
  const entry = { authors: ['ann'], content: 'Capture work conversations and refresh calendar daily.', source: [{ kind: 'user', ref: 'ann' }], meeting_policy: policy };
  assert.throws(() => lib.appendMemory(root, 'offer', entry), /personal context/);
  assert.throws(() => lib.appendMemory(root, 'personal-ann', { ...entry, source: [] }), /submitted/);
  lib.appendMemory(root, 'personal-ann', entry);
  assert.equal(lib.meetingOverview(root, { by: 'ann' }).policies.length, 1);
  assert.equal(lib.meetingOverview(root, { by: 'bob' }).policies.length, 0);
});

test('scoped source coverage reports failures independently and cannot claim unfinished capture complete', () => {
  const root = setup();
  const v = { by: 'ann', tool: 'granola', account: 'work', scope: 'September', checked_at: at(12), status: 'partial', scanned: 3, captured: 1, skipped: 1, unresolved: 1, remaining: true, cursor: 'page-2' };
  const entry = { authors: ['ann'], content: 'Source refresh.', source, meeting_coverage: v };
  lib.appendMemory(root, 'offer', entry);
  assert.throws(() => lib.appendMemory(root, 'offer', { ...entry, meeting_coverage: { ...v, status: 'complete' } }), /complete meeting coverage/);
  assert.throws(() => lib.appendMemory(root, 'offer', { ...entry, meeting_coverage: { ...v, captured: 3 } }), /every scanned/);
  lib.appendMemory(root, 'offer', { ...entry, meeting_coverage: { ...v, tool: 'calendar', status: 'unavailable', scanned: 0, captured: 0, skipped: 0, unresolved: 0 } });
  assert.equal(lib.meetingOverview(root).coverage.length, 2);
});

test('invalid batches write nothing, unknown anchors fail, and retrying a valid batch keeps the same bytes', () => {
  const root = setup(), good = { context: 'offer', content: 'Unknown Buyer discussed onboarding.', sources: source.map(s => `${s.kind}:${s.ref}`), meeting: meeting() };
  assert.notEqual(remember(root, [good, { ...good, meeting: meeting({ occurred_at: '2026-02-31' }) }]).status, 0);
  assert.equal(memories(root).length, 0);
  assert.notEqual(remember(root, [{ context: 'offer', content: 'Unlinked outcome.', meeting_id: 'm_123456789abc' }]).status, 0);
  const first = remember(root, [good]); assert.equal(first.status, 0, first.stderr);
  const path = join(root, 'brain/contexts/offer/memories.jsonl'), before = readFileSync(path, 'utf8');
  const retry = remember(root, [good]); assert.equal(retry.status, 0, retry.stderr); assert.match(retry.stdout, /already recorded/);
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('recollections retain unknown dates, recurring instances stay separate and source conflicts are refused', () => {
  const root = setup();
  const first = record(root, { source: [{ kind: 'user', ref: 'ann' }], meeting: meeting({ reference: { kind: 'user', account: 'ann', ref: 'corridor-1' }, basis: 'user', evidence: 'recollection', occurred_at: null }) });
  const second = record(root, { meeting: meeting({ reference: { kind: 'granola', account: 'work', ref: 'next-week' }, series: 'weekly' }) });
  assert.equal(lib.meetingOverview(root).meetings.length, 2);
  assert.throws(() => record(root, { meeting_id: first.id, meeting: second.meeting }), /another anchor/);
});

test('forks preserve cross-context links without duplicating the meeting or losing user corrections', () => {
  const root = setup(), first = record(root);
  const result = spawnSync(process.execPath, [join(plugin, 'scripts/gtm-brain-contexts/contexts.mjs'), root, '--fork', 'offer', 'account', 'Account'], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(lib.readMemories(root, 'account')[0].meeting_id, first.id);
  assert.equal(lib.meetingOverview(root).meetings.length, 1);
  lib.appendMemory(root, 'strategy', { authors: ['ann'], content: 'Independent follow-up.', meeting_id: first.id });
  lib.appendMemory(root, 'offer', { authors: ['ann'], content: 'Withdraw original account.', retracts: first.id });
  const row = lib.meetingOverview(root).meetings[0]; assert.equal(row.state, 'withdrawn'); assert.equal(row.outcomes.length, 1);
});

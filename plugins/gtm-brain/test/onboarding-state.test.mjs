// Legacy onboarding evidence must never turn ordinary work into a new setup interview.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOnboarding, onboardingInstruction } from '../lib/onboarding.mjs';

function fixture(t, entries) {
  const root = mkdtempSync(join(tmpdir(), 'gtm-onboarding-state-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const records = entries.map((entry, i) => ({
    id: `m_${(i + 1).toString(16).padStart(12, '0')}`, context: 'company',
    at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(), authors: ['alex'],
    content: '', supersedes: null, retracts: null, ...entry,
  }));
  for (const context of ['gtm', 'company']) {
    const dir = join(root, 'brain/contexts', context);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'memories.jsonl'), records.filter(m => m.context === context).map(m => JSON.stringify(m) + '\n').join(''));
  }
  return root;
}
const outcome = n => ({ content: `Onboarding step ${n} (Saved outcome): Completed or explicitly skipped by Alex.` });
const marker = (status, version = 2, extra = {}) => ({ content: `Onboarding: ${status} v${version} on 2026-09-01.`, ...extra });

test('missing markers and partial historical outcomes stay passive without inventing completion', t => {
  const root = fixture(t, [outcome(1), { content: 'We already use this brain for customer work.' }]);
  const state = readOnboarding(root);
  assert.equal(state.status, null);
  assert.equal(state.required, false);
  assert.equal(state.next, null);
  assert.equal(state.continuation, null);
  assert.equal(state.completion, null);
  assert.match(onboardingInstruction(root), /No active onboarding request is recorded/);
  assert.doesNotMatch(onboardingInstruction(root), /ONBOARDING |Resume link:/);
});

for (const version of [1, 2, 3]) test(`v${version} completion needs no retrospective checklist`, t => {
  const root = fixture(t, [marker('pending'), marker('completed', version), {
    content: 'Onboarding continuation v2 step 1: Ask the person their name again.',
  }]);
  const before = readFileSync(join(root, 'brain/contexts/company/memories.jsonl'), 'utf8');
  const state = readOnboarding(root);
  assert.equal(state.status, 'completed');
  assert.equal(state.version, version);
  assert.equal(state.completion, 'marker');
  assert.equal(state.required, false);
  assert.equal(state.next, null);
  assert.equal(state.continuation, null);
  assert.deepEqual(state.steps, []);
  assert.match(onboardingInstruction(root), /Continue ordinary work/);
  assert.equal(readFileSync(join(root, 'brain/contexts/company/memories.jsonl'), 'utf8'), before);
});

for (const [version, count] of [[1, 5], [2, 6]]) test(`v${version} outcomes recover a missing closing marker`, t => {
  const root = fixture(t, [marker('pending', version, { context: 'gtm' }),
    ...Array.from({ length: count }, (_, i) => ({ ...outcome(i + 1), context: i % 2 ? 'company' : 'gtm' })),
  ]);
  const state = readOnboarding(root);
  assert.equal(state.status, 'completed');
  assert.equal(state.completion, 'outcomes');
  assert.equal(state.required, false);
  assert.equal(state.next, null);
});

test('five outcomes do not silently complete new v2 onboarding', t => {
  const root = fixture(t, [marker('pending'), ...Array.from({ length: 5 }, (_, i) => outcome(i + 1))]);
  const state = readOnboarding(root);
  assert.equal(state.status, 'pending');
  assert.equal(state.required, true);
  assert.equal(state.next.n, 6);
  assert.equal(state.completion, null);
});

test('incomplete legacy onboarding is preserved without automatic prompts or invented completion', t => {
  const root = fixture(t, [marker('pending', 1), outcome(1)]);
  const state = readOnboarding(root);
  assert.equal(state.status, 'pending');
  assert.equal(state.version, 1);
  assert.equal(state.required, false);
  assert.equal(state.next, null);
  assert.equal(state.steps.length, 1);
  assert.equal(state.completion, null);
  assert.match(onboardingInstruction(root), /inactive until the person explicitly asks to resume/);
  assert.doesNotMatch(onboardingInstruction(root), /ONBOARDING |Resume link:/);
});

test('a future pending workflow is passive and cannot be completed with an older checklist', t => {
  const root = fixture(t, [marker('pending', 3), ...[1, 2, 3, 4, 5, 6].map(outcome)]);
  assert.equal(readOnboarding(root).status, 'pending');
  assert.equal(readOnboarding(root).required, false);
  assert.equal(readOnboarding(root).completion, null);
});

for (const status of ['completed', 'dismissed']) test(`${status} beats unrelated pending notes in either context`, t => {
  const root = fixture(t, [marker('pending', 1, { context: 'gtm' }),
    marker(status, 1, { context: 'gtm' }), marker('pending', 2), marker('pending', 2, { context: 'gtm' })]);
  assert.equal(readOnboarding(root).status, status);
  assert.equal(readOnboarding(root).required, false);
  assert.equal(readOnboarding(root).marker_id, 'm_000000000002');
});

test('explicit resume supersedes the closing marker and preserves saved outcomes', t => {
  const root = fixture(t, [marker('completed', 1), outcome(1),
    marker('pending', 2, { context: 'gtm', supersedes: 'm_000000000001' })]);
  const state = readOnboarding(root);
  assert.equal(state.status, 'pending');
  assert.equal(state.required, true);
  assert.equal(state.next.n, 2);
});

test('explicit resume also works when older unsuperseded closing markers remain', t => {
  const root = fixture(t, [marker('completed', 1), marker('dismissed', 2),
    marker('pending', 2, { supersedes: 'm_000000000002' })]);
  assert.equal(readOnboarding(root).status, 'pending');
  assert.equal(readOnboarding(root).next.n, 1);
});

test('resuming an older marker cannot override a later dismissal', t => {
  const root = fixture(t, [marker('completed', 1), marker('dismissed', 2),
    marker('pending', 2, { supersedes: 'm_000000000001' })]);
  assert.equal(readOnboarding(root).status, 'dismissed');
});

test('marker order follows recording time across contexts, including timestamp offsets', t => {
  const root = fixture(t, [marker('pending', 2, { at: '2026-09-01T10:00:00+02:00' }),
    marker('pending', 1, { context: 'gtm', at: '2026-09-01T09:00Z' }), ...[1, 2, 3, 4, 5].map(outcome)]);
  assert.equal(readOnboarding(root).version, 1);
  assert.equal(readOnboarding(root).status, 'completed');
});

test('retracted outcomes cannot count toward automatic completion', t => {
  const root = fixture(t, [marker('pending'), ...[1, 2, 3, 4, 5, 6].map(outcome), {
    content: 'The project outcome was recorded in error.', retracts: 'm_000000000007',
  }]);
  assert.equal(readOnboarding(root).status, 'pending');
  assert.equal(readOnboarding(root).next.n, 6);
});

test('retracting a pending marker does not create an implicit new workflow', t => {
  const root = fixture(t, [marker('pending'), { content: 'The pending marker was a mistake.', retracts: 'm_000000000001' }]);
  assert.equal(readOnboarding(root).status, null);
  assert.equal(readOnboarding(root).required, false);
});

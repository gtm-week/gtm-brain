import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { interviewRoute, updateRoute, icpBodyChecks } from './live/icp-cases.mjs';
import { documentSlug, documentPathFor } from '../lib/documents.mjs';
const file = fileURLToPath(new URL('../skills/gtm-brain-define-icp/SKILL.md', import.meta.url));
const skill = readFileSync(file, 'utf8');
const method = readFileSync(new URL('../skills/gtm-brain-define-icp/references/method.md', import.meta.url), 'utf8');
const call = (tool, args = {}) => ({ tool, arguments: args });
const reads = [call('load_context', { contexts: ['icp'], mode: 'add' }), call('document', { action: 'list' })];

test('Define ICP references resolve and its output name uses the document API', () => {
  for (const [, ref] of skill.matchAll(/\]\(([^)]+\.md)\)/g)) assert.ok(existsSync(resolve(dirname(file), ref)), ref);
  assert.equal(documentPathFor(documentSlug('Ideal customer profile')), 'ideal-customer-profile.md');
  assert.match(skill, /By Chris Pawlak/);
  assert.match(skill, /conversation and author the document and brain records in English/);
  assert.match(skill, /do not duplicate the synthesized document as memories/);
  assert.match(method, /cannot name three or declines, continue/);
  assert.equal((method.match(/^## \d+\./gm) || []).length, 10);
  assert.equal((method.match(/^### \d+\./gm) || []).length, 5);
});
test('interview behavioral gate rejects writing, setup forms and repeated questions', () => {
  const valid = [...reads, call('question', { message: 'Which company pattern fits?' })];
  assert.ok(interviewRoute(valid));
  for (const extra of [call('remember'), call('document', { action: 'create' }), call('question'), call('new_context'), call('onboarding_question'), call('attio_move_deal')]) assert.equal(interviewRoute([...valid, extra]), false);
  assert.equal(interviewRoute(valid.slice(1)), false);
});
test('update behavioral gate requires existing-document read, consent, draft write and readback', () => {
  const valid = [...reads, call('document', { action: 'show', ref: 'customer-fit' }), call('question'), call('document', { action: 'update', ref: 'customer-fit', status: 'draft' }), call('document', { action: 'show', ref: 'customer-fit' })];
  assert.ok(updateRoute(valid));
  for (const index of [0, 1, 2, 3, 4, 5]) assert.equal(updateRoute(valid.filter((_, i) => i !== index)), false, `missing step ${index}`);
  assert.equal(updateRoute([...valid, call('remember')]), false);
  assert.equal(updateRoute([...valid, call('document', { action: 'create' })]), false);
  assert.equal(updateRoute(valid.map(c => c.arguments.action === 'update' ? call('document', { action: 'update', status: 'approved' }) : c)), false);
});
test('persisted-output gate detects lost evidence and missing method sections', () => {
  const text = 'Reconciliation reviews happen every Monday. Cedar Demo current customer. Birch Demo desired account. Only two examples. Future-fit. Influencers Champions Main decision makers Blockers. Unaware Problem aware Solution aware Your solution aware Most aware. Need now Budget Trust in us. Unknown authority.';
  assert.ok(icpBodyChecks(text));
  for (const part of ['Monday', 'Birch Demo', 'Future-fit', 'Most aware', 'Need now', 'Trust in us']) assert.equal(icpBodyChecks(text.replace(part, '')), false, part);
  assert.equal(icpBodyChecks(text + ' Market-validated.'), false);
});

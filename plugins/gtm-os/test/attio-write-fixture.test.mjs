import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttioWriteFixture, verifyAttioState, verifyAttioMapping, attioMetrics } from './live/attio-write-fixture.mjs';

const deal = { object: 'deals', name: 'Bek Ventures Berlin', company_id: 'company-1', person_id: 'person-1', event: 'Berlin', status: 'Lead' };
const entry = { list: 'sponsors-berlin', record_id: 'deal-1', stage: 'Contacted', event: 'Berlin' };
const task = { record_id: 'deal-1', content: 'Send the offer', assignee: 'member-marta', due_date: '2026-09-18' };
function complete(f) {
  f.call('attio_create_record', deal);
  f.call('attio_add_record_to_list', entry);
  f.call('attio_create_note', { record_id: 'deal-1', content: 'Had a call with Viktor.' });
  return f.call('attio_create_task', task);
}
test('independent outcome oracle rejects missing fields, wrong identity, date and duplicates', () => {
  const f = createAttioWriteFixture(); complete(f); assert.equal(verifyAttioState(f.state), true);
  for (const mutate of [s => s.records.find(r => r.id === 'deal-1').person_id = 'person-2', s => s.tasks[0].due_date = '2026-09-19', s => s.entries[0].stage = 'Lead', s => s.notes = [], s => s.tasks.push(s.tasks[0]), s => s.records.push(s.records.find(r => r.id === 'deal-1'))]) {
    const state = structuredClone(f.state); mutate(state); assert.equal(verifyAttioState(state), false);
  }
});
test('schema rejection does not write, uncertain task result does write and can be resolved', () => {
  const f = createAttioWriteFixture('recovery');
  assert.ok(f.call('attio_create_record', { ...deal, person_id: 'person-2' }).error);
  f.call('attio_create_record', deal);
  assert.ok(f.call('attio_add_record_to_list', { ...entry, stage: 'Initial contact' }).error);
  assert.equal(f.state.entries.length, 0);
  f.call('attio_add_record_to_list', entry);
  f.call('attio_create_note', { record_id: 'deal-1', content: 'Call with Viktor' });
  assert.match(f.call('attio_create_task', task).error, /Timeout/);
  assert.equal(f.call('attio_list_tasks', { record_id: 'deal-1' }).tasks.length, 1);
  assert.equal(verifyAttioState(f.state), true);
  f.call('attio_create_task', task);
  assert.equal(verifyAttioState(f.state), false);
});
test('invalid arguments preserve state and metrics count executions, not mentions', () => {
  const f = createAttioWriteFixture();
  assert.ok(f.call('attio_create_task', { ...task, invented: true }).error);
  assert.equal(f.state.tasks.length, 0);
  f.call('attio_list_lists'); f.call('attio_list_lists');
  assert.deepEqual(attioMetrics(f.state.calls), { calls: 3, discovery: 2, writes: 1, searches: 0, readbacks: 0, repeated_reads: 1 });
  assert.ok(f.call('attio_search_records', { object: 'people', query: 'Viktor', event: 'Berlin' }).error);
  assert.equal(f.call('attio_search_records', { object: 'people', query: 'Viktor' }).records.length, 2);
});
test('configuration must be retained with source and scope, with stale evidence superseded', () => {
  const good = { id: 'new', tags: ['attio-schema'], content: 'workspace-fixture sponsors-berlin Contacted Lead', source: [{ kind: 'attio', ref: 'fixture-schema' }] };
  assert.equal(verifyAttioMapping([]), false);
  assert.equal(verifyAttioMapping([{ ...good, source: [] }]), false);
  assert.equal(verifyAttioMapping([{ ...good, content: good.content.replace('workspace-fixture', 'other-workspace') }]), false);
  assert.equal(verifyAttioMapping([good]), true);
  const stale = { ...good, id: 'old', content: good.content.replace('Contacted', 'Initial contact') };
  assert.equal(verifyAttioMapping([stale, good], ['old']), false);
  assert.equal(verifyAttioMapping([good], ['old']), true);
});

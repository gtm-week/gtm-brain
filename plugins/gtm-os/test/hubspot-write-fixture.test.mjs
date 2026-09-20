import test from 'node:test';
import assert from 'node:assert/strict';
import { createHubspotWriteFixture, verifyHubspotState, verifyHubspotMapping, hubspotMetrics } from './live/hubspot-write-fixture.mjs';
function finish(f) {
  const call = (name, args) => f.call(`hubspot_${name}`, args);
  const d = call('create_deal', { name: 'Bek Berlin', pipeline: 'sponsorships', dealstage: 'contacted-2', event: 'Berlin' }).record;
  call('associate', { from: d.id, to: 'company-1' });
  const link = { from: d.id, to: 'contact-1' };
  if (call('associate', link).error) call('associate', link);
  const n = call('create_note', { content: 'Call with Viktor at Bek Ventures' }).record;
  call('associate', { from: n.id, to: d.id });
  const result = call('create_task', { content: 'Send offer', owner: 'owner-marta', due_date: '2026-09-18' });
  const t = result.record || call('get', { id: result.record_id }).record;
  call('associate', { from: t.id, to: d.id });
  return f.state;
}
test('HubSpot outcome oracle rejects wrong identity, missing links, wrong stage and duplicate writes', () => {
  const state = finish(createHubspotWriteFixture());
  assert.equal(verifyHubspotState(state), true);
  for (const mutate of [
    s => s.associations.pop(),
    s => { s.associations.find(a => a.to === 'contact-1').to = 'contact-2'; },
    s => { s.records.find(r => r.object === 'deals').dealstage = 'sales-contacted'; },
    s => { s.records.push({ ...s.records.find(r => r.object === 'tasks'), id: 'duplicate' }); },
    s => { s.records.find(r => r.object === 'tasks').owner = 'user-marta'; },
    s => { s.records.find(r => r.object === 'tasks').due_date = '2026-09-19'; },
  ]) { const broken = structuredClone(state); mutate(broken); assert.equal(verifyHubspotState(broken), false); }
});
test('HubSpot recovery preserves saved deal and resolves timed-out task without duplicate creation', () => {
  const f = createHubspotWriteFixture('recovery');
  assert.match(f.call('hubspot_create_deal', { name: 'Bek', pipeline: 'sponsorships', dealstage: 'old-contacted', event: 'Berlin' }).error, /stage/);
  assert.equal(f.state.records.length, 3);
  assert.equal(verifyHubspotState(finish(f)), true);
  assert.equal(f.state.timeoutSent, true);
  assert.equal(f.state.associationFailureSent, true);
  assert.equal(f.state.records.filter(r => r.object === 'deals').length, 1);
  f.call('hubspot_create_task', { content: 'Send offer', owner: 'owner-marta', due_date: '2026-09-18' });
  assert.equal(verifyHubspotState(f.state), false);
});
test('HubSpot contracts reject invented filters and reverse association directions', () => {
  const f = createHubspotWriteFixture();
  assert.ok(f.call('hubspot_search', { object: 'contacts', query: 'Viktor', event: 'Berlin' }).error);
  assert.equal(f.call('hubspot_search', { object: 'contacts', query: 'Viktor' }).records.length, 2);
  finish(f);
  assert.ok(f.call('hubspot_associate', { from: 'company-1', to: 'deals-1' }).error);
  const reads = [{ tool: 'hubspot_pipelines', arguments: {} }, { tool: 'hubspot_pipelines', arguments: {} }];
  assert.equal(hubspotMetrics(reads).repeated_reads, 1);
});
test('HubSpot mapping retention requires provider, portal, pipeline and corrected stage', () => {
  const m = { id: 'new', tags: ['hubspot-schema'], content: 'portal-fixture sponsorships contacted-2', source: [{ kind: 'hubspot', ref: 'fixture/settings' }] };
  assert.equal(verifyHubspotMapping([m]), true);
  assert.equal(verifyHubspotMapping([{ ...m, source: [{ kind: 'attio' }] }]), false);
  assert.equal(verifyHubspotMapping([{ ...m, content: 'other-portal sponsorships contacted-2' }]), false);
  assert.equal(verifyHubspotMapping([m, { ...m, id: 'stale' }], ['stale']), false);
});

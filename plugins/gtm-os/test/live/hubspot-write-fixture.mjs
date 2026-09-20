// Evaluation-only contracts. These are not installed HubSpot tool schemas or REST payloads.
import { validateValue } from '../../vendor/allethic/validation.mjs';
const str = { type: 'string' };
const object = { type: 'string', enum: ['contacts', 'companies', 'deals', 'notes', 'tasks'] };
const tool = (name, description, properties, required, write = false) => ({ name: `hubspot_${name}`, description: `${description} Synthetic CRM only.`, inputSchema: { type: 'object', properties, required, additionalProperties: false }, annotations: { readOnlyHint: !write, destructiveHint: false, openWorldHint: false } });
export const hubspotMapping = { portal: 'portal-fixture', pipeline: 'sponsorships', dealstage: 'contacted-2', owner: 'owner-marta' };
export const hubspotWriteTools = [
  tool('account', 'Current authenticated portal and owner mapping', {}, []),
  tool('properties', 'Read property names and allowed values for one object', { object }, ['object']),
  tool('pipelines', 'Read deal pipelines and stages', {}, []),
  tool('search', 'Search one object by name/content; returned contact details include company identity', { object, query: str }, ['object', 'query']),
  tool('get', 'Read one record including complete properties', { id: str }, ['id']),
  tool('create_deal', 'Create deal properties only, without associations. Returns complete saved properties.', { name: str, pipeline: str, dealstage: str, event: str }, ['name', 'pipeline', 'dealstage', 'event'], true),
  tool('associate', 'Set an unlabeled directional association from deal to contact/company or activity to deal. Returns saved link. May fail before writing.', { from: str, to: str }, ['from', 'to'], true),
  tool('associations', 'Read links from a record', { from: str }, ['from']),
  tool('create_note', 'Create call note, without associations', { content: str }, ['content'], true),
  tool('create_task', 'Create follow-up, without associations; timeout can follow a saved write', { content: str, owner: str, due_date: str }, ['content', 'owner', 'due_date'], true),
];
export function createHubspotWriteFixture(mode = 'known') {
  const state = { records: [
    { id: 'company-1', object: 'companies', name: 'Bek Ventures', domain: 'bek.fixture.test' },
    { id: 'contact-1', object: 'contacts', name: 'Viktor Szafraniec', company_id: 'company-1', email: 'viktor@bek.fixture.test' },
    { id: 'contact-2', object: 'contacts', name: 'Viktor Szafraniec', company_id: 'elsewhere', email: 'viktor@elsewhere.fixture.test' },
  ], associations: [], calls: [], timeoutSent: false, associationFailureSent: false };
  const record = id => state.records.find(r => r.id === id);
  function save(object, values) {
    const id = `${object}-${state.records.filter(r => r.object === object).length + 1}`;
    const saved = { ...values, id, object, url: `https://hubspot.fixture.test/portal-fixture/${id}` };
    state.records.push(saved); return { record: saved };
  }
  function execute(name, a) {
    if (name === 'account') return { ...hubspotMapping, user: 'user-marta' };
    if (name === 'properties') return { object: a.object, fields: a.object === 'deals' ? { name: 'text', pipeline: 'pipeline ID', dealstage: 'stage ID within pipeline', event: ['Berlin'] } : a.object === 'tasks' ? { content: 'text', owner: 'CRM owner ID', due_date: 'YYYY-MM-DD' } : { name: 'text', content: 'text' } };
    if (name === 'pipelines') return { pipelines: [{ id: hubspotMapping.pipeline, label: 'Sponsorships', stages: [{ id: hubspotMapping.dealstage, label: 'Contacted' }] }, { id: 'sales', stages: [{ id: 'sales-contacted', label: 'Contacted' }] }] };
    if (name === 'search') return { records: state.records.filter(r => r.object === a.object && (r.name || r.content).toLowerCase().includes(a.query.toLowerCase())) };
    if (name === 'get') return record(a.id) ? { record: record(a.id) } : { error: 'Unknown ID' };
    if (name === 'create_deal') {
      if (a.pipeline !== hubspotMapping.pipeline || a.dealstage !== hubspotMapping.dealstage || a.event !== 'Berlin') return { error: 'Invalid pipeline/stage/event; no record written' };
      return save('deals', a);
    }
    if (name === 'associations') return { associations: state.associations.filter(r => r.from === a.from) };
    if (name === 'associate') {
      const f = record(a.from), t = record(a.to);
      if (!(f?.object === 'deals' && ['contacts', 'companies'].includes(t?.object) || ['notes', 'tasks'].includes(f?.object) && t?.object === 'deals')) return { error: 'Unsupported association direction' };
      if (mode === 'recovery' && t.object === 'contacts' && !state.associationFailureSent) { state.associationFailureSent = true; return { error: 'Temporary failure; no association written' }; }
      if (!state.associations.some(r => r.from === a.from && r.to === a.to)) state.associations.push({ ...a });
      return { association: { ...a } };
    }
    if (name === 'create_note') return save('notes', a);
    if (name === 'create_task') {
      if (a.owner !== hubspotMapping.owner || !/^\d{4}-\d{2}-\d{2}$/.test(a.due_date)) return { error: 'Invalid owner/date' };
      const result = save('tasks', a);
      if (mode === 'recovery' && !state.timeoutSent) { state.timeoutSent = true; return { error: 'Timeout after request; outcome unknown', record_id: result.record.id }; }
      return result;
    }
    return { error: 'Unknown tool' };
  }
  return { state, call(name, args = {}) {
    const definition = hubspotWriteTools.find(t => t.name === name);
    const invalid = definition ? validateValue(definition.inputSchema, args) : 'Unknown tool';
    const result = invalid ? { error: invalid } : execute(name.replace(/^hubspot_/, ''), args);
    state.calls.push({ tool: name, arguments: args, result }); return result;
  } };
}
export function verifyHubspotState(state) {
  const deals = state.records.filter(r => r.object === 'deals'), notes = state.records.filter(r => r.object === 'notes'), tasks = state.records.filter(r => r.object === 'tasks');
  const d = deals[0], n = notes[0], t = tasks[0];
  const linked = (from, to) => state.associations.some(a => a.from === from && a.to === to);
  return deals.length === 1 && notes.length === 1 && tasks.length === 1 && d.pipeline === 'sponsorships' && d.dealstage === 'contacted-2' && d.event === 'Berlin'
    && /call/i.test(n.content) && /offer/i.test(t.content) && t.owner === 'owner-marta' && t.due_date === '2026-09-18'
    && state.associations.length === 4 && linked(d.id, 'company-1') && linked(d.id, 'contact-1') && linked(n.id, d.id) && linked(t.id, d.id);
}
export function hubspotMetrics(calls) {
  const rows = calls.filter(c => c.tool.startsWith('hubspot_'));
  const reads = rows.filter(c => !/create_|associate$/.test(c.tool));
  return { calls: rows.length, discovery: rows.filter(c => /_(properties|pipelines)$/.test(c.tool)).length,
    identity: rows.filter(c => c.tool === 'hubspot_account').length,
    writes: rows.length - reads.length, repeated_reads: reads.length - new Set(reads.map(c => JSON.stringify([c.tool, c.arguments]))).size };
}
export function verifyHubspotMapping(memories, staleIds = []) {
  const rows = memories.filter(m => m.tags?.includes('hubspot-schema'));
  return rows.some(m => ['portal-fixture', 'sponsorships', 'contacted-2'].every(s => m.content.includes(s)) && m.source?.some(s => s.kind === 'hubspot')) && !rows.some(m => staleIds.includes(m.id));
}

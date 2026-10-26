// Evaluation-only contracts, not a claim about the installed Attio app's schemas.
import { validateValue } from '../../lib/ontology/validation.mjs';
const string = { type: 'string' };
const object = { type: 'string', enum: ['people', 'companies', 'deals'] };
const tool = (name, description, properties, required, write = false) => ({ name: `attio_${name}`,
  description: `${description} Synthetic Attio workspace only.`,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
  annotations: { readOnlyHint: !write, destructiveHint: false, openWorldHint: false } });
export const mapping = { workspace: 'workspace-fixture', list: 'sponsors-berlin', stage: 'Contacted', event: 'Berlin', deal_status: 'Lead' };
export const attioWriteTools = [
  tool('whoami', 'Read authenticated workspace and user', {}, []),
  tool('list_lists', 'Find workspace lists', {}, []),
  tool('list_attribute_definitions', 'Read object fields and allowed status values', { object }, ['object']),
  tool('list_list_attribute_definitions', 'Read list entry fields and allowed values', { list: string }, ['list']),
  tool('search_records', 'Search one object by name. Returns identifying details, including company and event when present; inspect those returned fields to select a match.', { object, query: string }, ['object', 'query']),
  tool('get_records_by_ids', 'Read current records by returned IDs', { ids: { type: 'array', items: string } }, ['ids']),
  tool('create_record', 'Create an opportunity. Returns the saved record including all values.', { object: { type: 'string', enum: ['deals'] }, name: string, company_id: string, person_id: string, event: string, status: string }, ['object', 'name', 'company_id', 'person_id', 'event', 'status'], true),
  tool('list_records_in_list', 'Read entries for a specific record in a list', { list: string, record_id: string }, ['list', 'record_id']),
  tool('add_record_to_list', 'Add a record with stage and event. Returns saved entry values.', { list: string, record_id: string, stage: string, event: string }, ['list', 'record_id', 'stage', 'event'], true),
  tool('create_note', 'Save a call note linked to a record; returns complete note', { record_id: string, content: string }, ['record_id', 'content'], true),
  tool('create_task', 'Create a follow-up; returns task values. A timeout may occur after saving.', { record_id: string, content: string, assignee: string, due_date: string }, ['record_id', 'content', 'assignee', 'due_date'], true),
  tool('list_tasks', 'Read current tasks linked to a record', { record_id: string }, ['record_id']),
];
export function createAttioWriteFixture(mode = 'known') {
  const link = id => `https://crm.fixture.test/workspace-fixture/${id}`;
  const state = { workspace: mapping.workspace, records: [
    { id: 'company-1', object: 'companies', name: 'Bek Ventures', domain: 'bek.fixture.test', url: link('company-1') },
    { id: 'person-1', object: 'people', name: 'Viktor Szafraniec', company_id: 'company-1', email: 'viktor@bek.fixture.test', url: link('person-1') },
    { id: 'person-2', object: 'people', name: 'Viktor Szafraniec', company_id: 'elsewhere', email: 'viktor@elsewhere.fixture.test', url: link('person-2') },
  ], entries: [], notes: [], tasks: [], calls: [], taskTimeoutSent: false };
  function call(name, args = {}) {
    const definition = attioWriteTools.find(t => t.name === name);
    const invalid = definition ? validateValue(definition.inputSchema, args) : 'Unknown tool';
    const result = invalid ? { error: invalid } : execute(name.replace(/^attio_/, ''), args);
    state.calls.push({ tool: name, arguments: args, result });
    return result;
  }
  function execute(name, a) {
    const record = id => state.records.find(r => r.id === id);
    if (name === 'whoami') return { workspace: mapping.workspace, user: 'member-marta' };
    if (name === 'list_lists') return { lists: [{ id: mapping.list, name: 'Berlin sponsors', object: 'deals' }] };
    if (name === 'list_attribute_definitions') return { object: a.object, fields: a.object === 'deals' ? { name: 'text', company_id: 'companies reference', person_id: 'people reference', event: ['Berlin'], status: ['Lead'] } : { name: 'text', company_id: 'companies reference' } };
    if (name === 'list_list_attribute_definitions') return a.list === mapping.list ? { list: a.list, fields: { stage: ['Contacted'], event: ['Berlin'] } } : { error: 'Unknown list' };
    if (name === 'search_records') return { records: state.records.filter(r => r.object === a.object && r.name.toLowerCase().includes(a.query.toLowerCase())) };
    if (name === 'get_records_by_ids') return { records: a.ids.map(record).filter(Boolean) };
    if (name === 'create_record') {
      if (record(a.company_id)?.object !== 'companies' || record(a.person_id)?.object !== 'people' || record(a.person_id)?.company_id !== a.company_id) return { error: 'Invalid company/person relationship' };
      if (a.status !== mapping.deal_status || a.event !== mapping.event) return { error: 'Invalid schema value for status/event' };
      const saved = { ...a, id: `deal-${state.records.filter(r => r.object === 'deals').length + 1}` };
      saved.url = link(saved.id); state.records.push(saved); return { record: saved };
    }
    if (name === 'list_records_in_list') return a.list === mapping.list ? { entries: state.entries.filter(e => e.record_id === a.record_id) } : { error: 'Unknown list' };
    if (name === 'add_record_to_list') {
      if (a.list !== mapping.list || a.stage !== mapping.stage || a.event !== mapping.event) return { error: 'Invalid list/stage/event schema; no entry written' };
      if (record(a.record_id)?.object !== 'deals') return { error: 'Expected a deal record' };
      const entry = { ...a, id: `entry-${state.entries.length + 1}`, url: link(`entry-${state.entries.length + 1}`) };
      state.entries.push(entry); return { entry };
    }
    if (name === 'create_note' || name === 'create_task') {
      if (record(a.record_id)?.object !== 'deals') return { error: 'Expected a deal record' };
      if (name === 'create_task' && (a.assignee !== 'member-marta' || !/^\d{4}-\d{2}-\d{2}$/.test(a.due_date))) return { error: 'Invalid assignee or date' };
      const collection = name === 'create_task' ? state.tasks : state.notes;
      const saved = { ...a, id: `${name}-${collection.length + 1}`, url: link(`${name}-${collection.length + 1}`) };
      collection.push(saved);
      if (mode === 'recovery' && name === 'create_task' && !state.taskTimeoutSent) { state.taskTimeoutSent = true; return { error: 'Timeout; write outcome unknown. Check existing tasks before retrying.' }; }
      return { [name === 'create_task' ? 'task' : 'note']: saved };
    }
    if (name === 'list_tasks') return { tasks: state.tasks.filter(t => t.record_id === a.record_id) };
    return { error: 'Unknown operation' };
  }
  return { state, call };
}

export function verifyAttioState(state) {
  const deals = state.records.filter(r => r.object === 'deals'), d = deals[0];
  return deals.length === 1 && d.company_id === 'company-1' && d.person_id === 'person-1' && d.event === 'Berlin' && d.status === 'Lead'
    && state.entries.length === 1 && state.entries[0].record_id === d.id && state.entries[0].stage === 'Contacted' && state.entries[0].list === mapping.list && state.entries[0].event === 'Berlin'
    && state.notes.length === 1 && state.notes[0].record_id === d.id && /call/i.test(state.notes[0].content)
    && state.tasks.length === 1 && state.tasks[0].record_id === d.id && state.tasks[0].assignee === 'member-marta' && state.tasks[0].due_date === '2026-09-18' && /offer/i.test(state.tasks[0].content);
}

export function attioMetrics(calls) {
  const attio = calls.filter(c => c.tool.startsWith('attio_'));
  const discovery = attio.filter(c => /whoami|definitions|list_lists/.test(c.tool)).length;
  const writes = attio.filter(c => /create_|add_record/.test(c.tool)).length;
  const searches = attio.filter(c => /search_records/.test(c.tool)).length;
  const reads = attio.filter(c => !/create_|add_record/.test(c.tool));
  const unique = new Set(reads.map(c => JSON.stringify([c.tool, c.arguments])));
  return { calls: attio.length, discovery, writes, searches, readbacks: attio.length - discovery - writes - searches, repeated_reads: reads.length - unique.size };
}

// Input must be effective memories, after applying append-only corrections.
export function verifyAttioMapping(memories, staleIds = []) {
  const mappings = memories.filter(m => m.tags?.includes('attio-schema'));
  return mappings.some(m => ['sponsors-berlin', 'Contacted', 'Lead'].every(s => m.content.includes(s)) && m.source?.some(s => s.kind === 'attio')
    && `${m.content} ${JSON.stringify(m.source)}`.includes('workspace-fixture'))
    && !mappings.some(m => staleIds.includes(m.id));
}

// Synthetic connector contracts. These do not call Attio, HubSpot, mail or calendar.
import { validateValue } from '../../lib/ontology/validation.mjs';
const text = { type: 'string' };
const tool = (name, description, properties, required = []) => ({ name, description: `${description} Synthetic test only.`, inputSchema: { type: 'object', properties, required, additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false } });
const limit = { type: 'integer', minimum: 1, maximum: 25 };
const records = [
  { id: 'person-1', name: 'Artur Ziętara', email: 'artur@northstar.fixture.test', company: 'Northstar', url: 'https://crm.fixture.test/work/people/person-1' },
  { id: 'person-2', name: 'Anna Ziętara', email: 'anna@elsewhere.fixture.test', company: 'Elsewhere', url: 'https://crm.fixture.test/work/people/person-2' },
  { id: 'person-3', name: 'Artur Zieliński', email: 'artur@another.fixture.test', company: 'Another', url: 'https://crm.fixture.test/work/people/person-3' },
];
const fold = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function crmFixtureTools(mode) {
  const extra = [tool('fixture_mail_search', 'Search connected email messages', { query: text }, ['query']), tool('fixture_calendar_search', 'Search connected calendar events', { query: text }, ['query'])];
  if (mode === 'hubspot') return [
    tool('hubspot_search_contacts', 'Search contact default text properties using query, or property filters. EQ is exact; CONTAINS_TOKEN supports prefix *. No typo matching.', { query: text, filters: { type: 'array', items: { type: 'object', properties: { propertyName: { type: 'string', enum: ['firstname', 'lastname', 'email'] }, operator: { type: 'string', enum: ['EQ', 'CONTAINS_TOKEN'] }, value: text }, required: ['propertyName', 'operator', 'value'], additionalProperties: false } }, limit }),
    tool('hubspot_get_contact', 'Read a contact by its returned record ID', { id: text }, ['id']), ...extra,
  ];
  return [
    tool('attio_search_records', 'Fuzzy/full-text record search over people and companies by name, email or domain', { query: text, objects: { type: 'array', items: { type: 'string', enum: ['people', 'companies'] } }, limit }, ['query', 'objects']),
    tool('attio_list_records', 'List records with optional exact name equality. Does not fuzzy match.', { object: { type: 'string', enum: ['people', 'companies'] }, name: text, limit }, ['object']),
    tool('attio_get_record', 'Read current record by its returned ID', { id: text }, ['id']), ...extra,
  ];
}
export function crmFixtureResult(mode, name, args = {}) {
  const definition = crmFixtureTools(mode).find(t => t.name === name);
  const invalid = definition ? validateValue(definition.inputSchema, args) : 'Unknown fixture tool';
  if (invalid) return { error: invalid };
  if (/fixture_(mail|calendar)/.test(name)) return { results: [], scope: 'Synthetic unrelated connector', complete: true };
  if (/get_(record|contact)/.test(name)) return records.find(r => r.id === args.id && (mode !== 'empty' || r.id === 'person-3')) || { error: 'Record not found' };
  if (mode === 'empty') {
    if (name === 'attio_list_records' && !args.name) return { results: [records[2]], total: null, complete: false, next_cursor: 'unrelated-next-page', scope: 'First page of the work CRM' };
    return { results: [], total: 0, complete: true, scope: `Work CRM search: ${args.query || args.name}` };
  }
  let rows = [];
  if (name === 'attio_list_records') rows = args.object === 'people' ? records.filter(r => !args.name || r.name === args.name) : [];
  if (name === 'attio_search_records' && args.objects?.includes('people')) {
    const q = fold(args.query);
    rows = /zientara|zietara/.test(q) ? records.slice(0, 2) : records.filter(r => fold(`${r.name} ${r.email}`).includes(q));
  }
  if (name === 'hubspot_search_contacts') {
    rows = records.filter(r => !args.query || fold(`${r.name} ${r.email}`).includes(fold(args.query)));
    for (const f of args.filters || []) rows = rows.filter(r => {
      const value = f.propertyName === 'firstname' ? r.name.split(' ')[0] : f.propertyName === 'lastname' ? r.name.split(' ')[1] : r.email;
      return f.operator === 'EQ' ? fold(value) === fold(f.value) : fold(value).startsWith(fold(f.value).replace(/\*$/, ''));
    });
  }
  return { results: rows.slice(0, args.limit || 25), total: rows.length, complete: rows.length <= (args.limit || 25), scope: 'Connected work CRM' };
}

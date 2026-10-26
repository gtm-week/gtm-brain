import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankEntityCandidates, foldEntityName } from '../lib/entity-search.mjs';
import * as lib from '../lib/brain.mjs';
import { crmFixtureResult } from './live/crm-search-fixture.mjs';

const person = (name, extra = {}) => ({ id: `record-${name}`, name, aliases: [], emails: [], kind: 'person', ...extra });
const names = [person('Artur Ziętara', { emails: ['artur@fixture.test'] }), person('Anna Ziętara'), person('Artur Kowalski'), person('Łukasz Kończal')];
const hits = (q, entries = names, options) => rankEntityCandidates(entries, q, options).matches.map(x => x.entry.name);

test('CRM fixtures distinguish fuzzy search, exact filters, partial tokens and incomplete coverage', () => {
  assert.equal(crmFixtureResult('attio', 'attio_list_records', { object: 'people', name: 'Artur Zientara' }).results.length, 0);
  assert.equal(crmFixtureResult('attio', 'attio_search_records', { objects: ['people'], query: 'Artur Zientara' }).results.length, 2);
  assert.equal(crmFixtureResult('hubspot', 'hubspot_search_contacts', { query: 'Artur Zientara' }).results.length, 0);
  assert.equal(crmFixtureResult('hubspot', 'hubspot_search_contacts', { filters: [{ propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: 'Artur*' }] }).results.length, 2);
  assert.ok(crmFixtureResult('attio', 'attio_search_records', { objects: ['people'], query: 'Artur', limit: 100 }).error);
  assert.equal(crmFixtureResult('empty', 'attio_search_records', { objects: ['people'], query: 'Zientara' }).results.length, 0);
  assert.equal(crmFixtureResult('empty', 'attio_list_records', { object: 'people' }).complete, false);
});

test('ALL-152: accent plus missing letter returns surname candidates without resolving identity', () => {
  assert.deepEqual(hits('Zientara'), ['Anna Ziętara', 'Artur Ziętara']);
  assert.deepEqual(hits('Artur Zientara'), ['Artur Ziętara']);
  assert.match(rankEntityCandidates(names, 'Zientara').matches[0].reason, /after accent normalization/);
  assert.equal(lib.canonicalName(names, 'Zientara'), null);
  assert.equal(lib.exactName(names, 'Artur Zientara'), null);
  assert.ok(lib.similarNames(names, 'Zientara').some(n => n.name === 'Artur Ziętara'));
});

test('normalization, spacing, alias and adjacent transposition retain original spelling', () => {
  assert.equal(foldEntityName('ŁUKASZ KOŃCZAL'), 'lukasz konczal');
  assert.deepEqual(hits('Lukasz Konczal'), ['Łukasz Kończal']);
  assert.deepEqual(hits('Kończla'), ['Łukasz Kończal']);
  assert.deepEqual(hits('Open AI', [person('OpenAI', { kind: 'organization' })]), ['OpenAI']);
  assert.deepEqual(hits('Bergstom', [person('Bergstrom Home', { aliases: ['Nordic Home'] })]), ['Bergstrom Home']);
  assert.deepEqual(hits('Nordic'), []);
  assert.deepEqual(hits('Nordic', [person('Bergstrom Home', { aliases: ['Nordic Home'] })]), ['Bergstrom Home']);
});

test('short tokens and conflicting surnames do not create fuzzy matches', () => {
  assert.deepEqual(hits('Ar'), []);
  assert.deepEqual(hits('The Group'), []);
  assert.deepEqual(hits('Artur Nowak'), []);
  assert.deepEqual(hits('Artur Li'), []);
  assert.deepEqual(hits('Jo Smith', [person('Jane Smith')]), []);
  assert.deepEqual(hits('Member2 Surname2', [person('Member1 Surname1')]), []);
  assert.deepEqual(hits('Product 2', [person('Product 3')]), []);
  assert.deepEqual(hits('Anna Anna'), []);
  assert.deepEqual(hits('李雷', [person('李雷')]), ['李雷']);
  assert.deepEqual(hits('Zię', names), ['Anna Ziętara', 'Artur Ziętara']);
});

test('exact IDs and emails rank first; typos in identifiers never match, shared mailboxes stay ambiguous', () => {
  const entries = [person('One', { id: 'e_123abc', emails: ['shared@fixture.test'] }), person('Two', { emails: ['shared@fixture.test'] })];
  assert.deepEqual(hits('e_123abc', entries), ['One']);
  assert.deepEqual(hits('e_123abd', entries), []);
  assert.deepEqual(hits('SHARED@fixture.test', entries), ['One', 'Two']);
  assert.deepEqual(hits('shraed@fixture.test', entries), []);
  assert.equal(lib.exactName(entries, 'shared@fixture.test'), null);
});

test('ranking is bounded and reports ties, truncation and absence without mutating source candidates', () => {
  const entries = Array.from({ length: 9 }, (_, i) => person(`Person${i} Ziętara`));
  const before = JSON.stringify(entries), result = rankEntityCandidates(entries, 'Zientara', { limit: 3 });
  assert.equal(result.total, 9); assert.equal(result.truncated, true); assert.equal(result.matches.length, 3);
  assert.equal(JSON.stringify(entries), before);
  assert.equal(rankEntityCandidates([], 'Zientara').total, 0);
  assert.throws(() => rankEntityCandidates(entries, ' '.repeat(5)), /1 to 256/);
  assert.throws(() => rankEntityCandidates(entries, 'Zientara', { limit: 11 }), /1 to 10/);
});

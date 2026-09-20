import { readFileSync, existsSync } from 'node:fs';
import * as lib from '../../lib/brain.mjs';
import { mapping, verifyAttioState, verifyAttioMapping, attioMetrics } from './attio-write-fixture.mjs';

export const attioWriteCases = ['known', 'missing', 'recovery'].map(mode => ({
  name: `attio-write-${mode}`, crm: `write-${mode}`,
  prompt: 'Today is September 16, 2026 in Europe/Warsaw. I just had a call with Viktor Szafraniec from Bek Ventures. Add them as potential sponsors for Berlin in Attio and make me a task to send the offer in two days. Keep a note of the call.',
  prepare(root, by) {
    lib.appendMemory(root, 'offer', { authors: [by], kind: 'decision', content: 'Our sponsorship workflow: use an existing person/company when matched; create one Berlin opportunity if absent using the configured initial deal status, put it in the Berlin sponsors list at the configured contacted stage with event Berlin, link the call note and offer follow-up to that opportunity. Do not rename existing contacts or companies unless needed.', source: [{ kind: 'user', ref: by }] });
    lib.appendMemory(root, `personal-${by}`, { authors: [by], content: 'This session uses the synthetic Attio connection workspace-fixture, authenticated as Marta Nowak (member-marta).', source: [{ kind: 'attio', ref: 'https://crm.fixture.test/workspace-fixture/me' }] });
    if (mode !== 'missing') lib.appendMemory(root, 'offer', { authors: [by], tags: ['attio-schema'], content: `Verified Attio mapping for workspace-fixture: ${JSON.stringify({ ...mapping, ...(mode === 'recovery' ? { stage: 'Initial contact' } : {}) })}. Objects people, companies, deals. Deal fields name, company_id, person_id, event, status. List entry fields record_id, stage, event. Checked 2026-09-15.`, source: [{ kind: 'attio', ref: 'https://crm.fixture.test/workspace-fixture/settings' }] });
  },
  verify(root, { trace }) {
    const file = `${trace}.attio-state.json`;
    const memories = lib.effectiveMemories(lib.readMemories(root, 'offer'));
    return existsSync(file) && verifyAttioState(JSON.parse(readFileSync(file, 'utf8')))
      && memories.some(m => /Bek Ventures/.test(m.content) && m.source?.some(s => s.kind === 'attio'));
  },
  retention(root, { before }) {
    return verifyAttioMapping(lib.effectiveMemories(lib.readMemories(root, 'offer')), mode === 'recovery' ? before.filter(m => m.tags?.includes('attio-schema')).map(m => m.id) : []);
  },
  calls(calls) {
    const metrics = attioMetrics(calls);
    return !calls.some(c => ['computer_use', 'open_dashboard', 'render_dashboard', 'compile_apply'].includes(c.tool))
      && metrics.repeated_reads === 0 && calls.filter(c => c.tool === 'remember').length <= 2
      && (mode !== 'known' || metrics.discovery === 0)
      && (mode !== 'recovery' || calls.some(c => c.tool === 'attio_list_tasks'));
  },
  responseCheck: text => /September 18|18 September|2026-09-18/i.test(text) && /Bek|Viktor/i.test(text),
  expect: 'One Berlin sponsorship opportunity linked to Bek Ventures and the correct Viktor, one Contacted list entry, one call note and one offer task assigned to Marta due September 18, 2026. Confirm only established outcomes. No duplicates, unrelated updates or browser work. Recover stale mappings and uncertain writes through targeted reads when present.',
}));

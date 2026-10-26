import { readFileSync, existsSync } from 'node:fs';
import * as lib from '../../lib/brain.mjs';
import { hubspotMapping, verifyHubspotState, verifyHubspotMapping, hubspotMetrics } from './hubspot-write-fixture.mjs';

export const hubspotWriteCases = ['known', 'missing', 'recovery'].map(mode => ({
  name: `hubspot-write-${mode}`, crm: `hubspot-write-${mode}`, provider: 'hubspot',
  prompt: 'Today is September 16, 2026 in Europe/Warsaw. I just had a call with Viktor Szafraniec from Bek Ventures. Add them as potential sponsors for Berlin in HubSpot and make me a task to send the offer in two days. Keep a note of the call.',
  prepare(root, by) {
    lib.appendMemory(root, 'offer', { authors: [by], kind: 'decision', content: 'Our sponsorship workflow: use an existing person/company when matched; create one Berlin opportunity if absent in the Sponsorships pipeline at its configured Contacted stage with event Berlin. Associate the deal with the company and contact; associate the call note and offer follow-up with the deal. Do not rename existing contacts or companies unless needed.', source: [{ kind: 'user', ref: by }] });
    lib.appendMemory(root, `personal-${by}`, { authors: [by], content: 'This session uses the synthetic HubSpot connection portal-fixture, authenticated as Marta Nowak (user-marta), CRM owner owner-marta.', source: [{ kind: 'hubspot', ref: 'https://crm.fixture.test/portal-fixture/me' }] });
    if (mode !== 'missing') lib.appendMemory(root, 'offer', { authors: [by], tags: ['hubspot-schema'], content: `Verified HubSpot mapping: ${JSON.stringify({ ...hubspotMapping, ...(mode === 'recovery' ? { dealstage: 'old-contacted' } : {}) })}. Deal properties name, pipeline, dealstage, event=Berlin. Tasks use content, owner and due_date YYYY-MM-DD. Default unlabeled associations: deals to companies/contacts; notes/tasks to deals. Checked 2026-09-15.`, source: [{ kind: 'hubspot', ref: 'https://hubspot.fixture.test/portal-fixture/settings' }] });
  },
  verify(root, { trace }) {
    const file = `${trace}.hubspot-state.json`;
    const memories = lib.effectiveMemories(lib.readMemories(root, 'offer'));
    return existsSync(file) && verifyHubspotState(JSON.parse(readFileSync(file, 'utf8')))
      && memories.some(m => /Bek Ventures/.test(m.content) && m.source?.some(s => s.kind === 'hubspot'));
  },
  retention(root, { before }) {
    return verifyHubspotMapping(lib.effectiveMemories(lib.readMemories(root, 'offer')), mode === 'recovery' ? before.filter(m => m.tags?.includes('hubspot-schema')).map(m => m.id) : []);
  },
  calls(calls) {
    const metrics = hubspotMetrics(calls);
    return !calls.some(c => ['computer_use', 'open_dashboard', 'render_dashboard', 'compile_apply'].includes(c.tool))
      && metrics.repeated_reads === 0 && calls.filter(c => c.tool === 'remember').length <= 2
      && (mode !== 'known' || metrics.discovery === 0)
      && (mode !== 'recovery' || calls.some(c => c.tool === 'hubspot_get'));
  },
  responseCheck: text => /September 18|18 September|2026-09-18/i.test(text) && /Bek|Viktor/i.test(text),
  expect: 'One Berlin deal in Sponsorships at contacted-2, associated with Bek Ventures and the correct Viktor. One call note and one offer task associated with that deal, assigned to owner-marta due September 18, 2026. Confirm only established outcomes. No duplicates, unrelated updates or browser work. Recover stale mappings and uncertain writes through targeted reads when present.',
}));

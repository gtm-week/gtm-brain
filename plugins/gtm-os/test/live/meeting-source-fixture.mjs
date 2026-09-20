// Evaluation-only connector. Records are fictional; no real accounts or UI are accessed.
const tool = (name, description, properties = {}) => ({ name, description, inputSchema: { type: 'object', properties, additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false } });
export const meetingFixtureTools = [
  tool('fixture_notes_list', 'Meeting notes (simulated): list new/updated records in account work. Returns one page and a next_cursor. Read each record for evidence; list entries alone do not prove occurrence.', { cursor: { type: 'string' } }),
  tool('fixture_notes_read', 'Meeting notes (simulated): read the source content by ID. Preserves direct source link and known event dates.', { id: { type: 'string' } }),
  tool('fixture_calendar_list', 'Calendar (simulated): read current/upcoming events for the selected primary work calendar.'),
];
export function meetingFixtureResult(name, args) {
  if (name === 'fixture_notes_list') return args?.cursor === 'page-2'
    ? { account: 'work', records: [{ id: 'empty-2', title: 'Upcoming planning' }], next_cursor: null }
    : { account: 'work', records: [{ id: 'recording-1', title: 'Bergstrom onboarding discussion' }], next_cursor: 'page-2' };
  if (name === 'fixture_calendar_list') return { error: 'temporarily_unavailable', message: 'Calendar connection could not be refreshed. This says nothing about whether a meeting happened.' };
  if (name === 'fixture_notes_read' && args?.id === 'recording-1') return {
    provider: 'fixture-notes', account: 'work', id: 'recording-1', url: 'https://meetings.example.test/recording-1?account=work#transcript', revision: 'v1',
    observed_at: '2026-09-13T09:00:00Z', occurred_at: '2026-09-12', status: 'completed',
    attendees: ['Krzysztof Pawlak', 'Marta Nowak'], company: 'Bergstrom Home', calendar_event_id: null,
    transcript: 'Marta: What makes onboarding difficult?\nKrzysztof: Configuring the returns rules takes too long. We need a reusable setup template.\nMarta: I will send a sample template by September 16, 2026.\nKrzysztof: Thank you. I cannot promise a pilot date yet.',
  };
  if (name === 'fixture_notes_read' && args?.id === 'empty-2') return { provider: 'fixture-notes', account: 'work', id: 'empty-2', url: 'https://meetings.example.test/empty-2',
    observed_at: '2026-09-13T09:00:00Z', title: 'Upcoming planning', status: 'scheduled', scheduled_at: '2026-09-20T10:00:00Z', transcript: '', notes: 'Agenda: discuss next month.', occurred_at: null };
  return { error: 'not_found' };
}

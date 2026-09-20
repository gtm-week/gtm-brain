// Meeting evidence remains append-only memories. This module never writes a second store.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as lib from './brain.mjs';

export const MEETING_FIELDS = ['meeting', 'meeting_id', 'meeting_capture', 'meeting_policy', 'meeting_coverage'];
export const MEETING_EVIDENCE = ['transcript', 'recording', 'notes', 'summary', 'recollection', 'calendar', 'pending'];
const str = v => typeof v === 'string' && !!v.trim();
const obj = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k));
const strs = v => Array.isArray(v) && v.every(str);
const idOK = v => /^m_[0-9a-f]{6,12}$/.test(v || '');
const instant = v => str(v) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 19) === v.slice(0, 19);
const date = v => instant(v) || (str(v) && /^\d{4}-\d\d-\d\d$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
const refOK = v => obj(v, ['kind', 'ref', 'account']) && str(v.kind) && str(v.ref) && str(v.account);
export const meetingSourceKey = r => JSON.stringify([r.kind, r.account, r.ref]);
const userEvidence = r => Array.isArray(r.source) && r.source.some(s => s?.kind === 'user' && str(s.ref));
const hasMeeting = r => MEETING_FIELDS.some(k => r[k] !== undefined);
const metadata = r => Object.fromEntries(MEETING_FIELDS.filter(k => r[k] !== undefined).map(k => [k, r[k]]));
export const meetingMetadata = metadata;

export function validateMeetingEvidence(r) {
  const errors = [], m = r.meeting, c = r.meeting_capture, p = r.meeting_policy, v = r.meeting_coverage;
  if (r.meeting_id !== undefined && !idOK(r.meeting_id)) errors.push('meeting_id must be the original meeting anchor memory ID');
  if (m !== undefined) {
    if (!obj(m, ['title', 'reference', 'evidence', 'occurrence', 'basis', 'observed_at', 'occurred_at', 'scheduled_at', 'participants', 'series', 'revision', 'capture']) ||
      !str(m.title) || !refOK(m.reference) || !MEETING_EVIDENCE.includes(m.evidence) || !['happened', 'planned', 'unknown', 'cancelled'].includes(m.occurrence) ||
      !['source', 'user'].includes(m.basis) || !instant(m.observed_at) || !(m.occurred_at === null || date(m.occurred_at)) ||
      (m.scheduled_at !== undefined && !date(m.scheduled_at)) || (m.series !== undefined && !str(m.series)) || (m.revision !== undefined && !str(m.revision)) ||
      !['complete', 'partial', 'pending', 'unavailable'].includes(m.capture) || !Array.isArray(m.participants) ||
      !m.participants.every(p => obj(p, ['name', 'role']) && str(p.name) && ['attended', 'invited', 'mentioned'].includes(p.role))) errors.push('meeting needs title, reference {kind, account, ref}, evidence, occurrence, basis, observed_at (UTC), occurred_at (UTC, date or null), capture and participants [{name, role}]');
    if (m?.occurrence === 'happened' && ['calendar', 'pending'].includes(m.evidence)) errors.push('calendar or pending evidence cannot establish that a meeting happened');
    if (m?.occurrence === 'planned' && ['pending', 'unavailable'].includes(m.capture)) errors.push('A planned agenda is not a processing gap. Record its available notes/reference with capture=complete or partial; pending is for an actual source still processing');
    if (m?.occurrence !== 'happened' && m?.occurred_at !== null) errors.push('only happened meetings can have occurred_at; keep planned dates in scheduled_at');
    if (m?.evidence === 'calendar' && Array.isArray(m.participants) && m.participants.some(p => p.role === 'attended')) errors.push('calendar invitations do not establish attendance');
    if (m?.evidence === 'recollection' && m?.basis !== 'user') errors.push('recollection needs basis=user');
    if (m?.basis === 'user' && !userEvidence(r)) errors.push('user meeting evidence needs a user source');
    if (m?.basis === 'source' && (!Array.isArray(r.source) || !r.source.some(s => s?.kind === m.reference?.kind) || ['user', 'memory', 'codex'].includes(m.reference?.kind))) errors.push('source meeting evidence needs its external provider in sources');
    if (r.kind && r.kind !== 'note') errors.push('meeting observations must be notes; record outcomes separately with meeting_id');
  }
  if (c !== undefined) {
    if (!obj(c, ['by', 'scope', 'target', 'status', 'basis', 'reason']) || !str(c.by) || !['meeting', 'series'].includes(c.scope) || !str(c.target) ||
      (c.scope === 'meeting' && !idOK(c.target)) || !['include', 'skip', 'review'].includes(c.status) || !['user', 'source'].includes(c.basis) || !str(c.reason)) errors.push('meeting_capture needs by, scope (meeting|series), target, status (include|skip|review), basis and reason');
    if (c?.basis === 'user' && !userEvidence(r)) errors.push('user capture override needs a user source');
    if (c?.basis === 'source' && !r.source?.length) errors.push('capture assessment needs sources');
  }
  if (p !== undefined) {
    if (!obj(p, ['by', 'sources', 'calendars', 'include', 'exclude', 'calendar_refresh']) || !str(p.by) || !strs(p.sources) || !strs(p.calendars) || !strs(p.include) || !strs(p.exclude) || !['daily', 'off'].includes(p.calendar_refresh)) errors.push('meeting_policy needs by, sources, calendars, include, exclude (string lists), calendar_refresh (daily|off)');
    if (!userEvidence(r)) errors.push('meeting policy needs submitted user evidence');
  }
  if (v !== undefined) {
    const counts = ['scanned', 'captured', 'skipped', 'unresolved'];
    if (!obj(v, ['by', 'tool', 'account', 'scope', 'checked_at', 'status', ...counts, 'remaining', 'cursor']) || !str(v.by) || !str(v.tool) || !str(v.account) || !str(v.scope) || !instant(v.checked_at) ||
      !['complete', 'partial', 'unavailable'].includes(v.status) || !counts.every(k => Number.isSafeInteger(v[k]) && v[k] >= 0) || typeof v.remaining !== 'boolean' || (v.cursor !== undefined && !str(v.cursor))) errors.push('meeting_coverage needs by, tool, account, scope, checked_at, status, nonnegative scanned/captured/skipped/unresolved counts and remaining');
    else if (v.captured + v.skipped + v.unresolved !== v.scanned) errors.push('meeting coverage counts must account for every scanned record');
    else if (v.status === 'complete' && (v.remaining || v.unresolved || v.cursor)) errors.push('complete meeting coverage cannot have pending pages, unresolved records or a retry cursor');
    if (!r.source?.length) errors.push('meeting coverage needs sources');
  }
  if ([m, c, p, v].filter(x => x !== undefined).length > 1) errors.push('record meeting observations, capture decisions, policy and coverage as separate memories');
  if ([c, p, v].some(x => x !== undefined) && r.kind && r.kind !== 'note') errors.push('meeting metadata must be a note');
  return errors;
}

const allRows = root => lib.listContexts(root).flatMap(c => c.memories);
// Read original anchors as well as their revisions. Their IDs remain valid after a correction.
function anchor(rows, id) {
  const m = rows.find(r => r.id === id);
  return m?.meeting && (!m.meeting_id || m.meeting_id === m.id) ? m : null;
}
const effective = root => lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories)).filter(m => !lib.isForkCopy(m));

export function prepareMeetingMemory(root, context, entry) {
  if (!hasMeeting(entry) && !entry.supersedes && !entry.retracts) return entry;
  const r = { ...entry }, errors = validateMeetingEvidence(r);
  if (errors.length) throw new Error(errors.join('; '));
  const rows = allRows(root);
  if (r.meeting) {
    const matches = [...new Set(rows.filter(m => m.meeting && !lib.isForkCopy(m) && meetingSourceKey(m.meeting.reference) === meetingSourceKey(r.meeting.reference)).map(m => m.meeting_id || m.id))];
    if (matches.length > 1) throw new Error('Meeting source points to multiple anchors; resolve the duplicate before capture');
    if (r.meeting_id && matches.length && r.meeting_id !== matches[0]) throw new Error('Meeting source already belongs to another anchor; do not merge by title or time');
    if (!r.meeting_id && matches.length) r.meeting_id = matches[0];
  }
  if (r.meeting_id && !anchor(rows, r.meeting_id)) throw new Error('No meeting anchor for meeting_id; save the anchor first and use its returned ID');
  if (r.meeting_capture?.scope === 'meeting' && !anchor(rows, r.meeting_capture.target)) throw new Error('No meeting anchor for capture target');
  for (const field of ['meeting_capture', 'meeting_policy', 'meeting_coverage']) {
    const value = r[field];
    if (value && (!lib.teamHandle(root, value.by) || lib.teamHandle(root, value.by) !== value.by || !r.authors?.includes(value.by))) throw new Error(`${field}.by must be the confirmed author handle`);
  }
  if (r.meeting_policy) {
    const c = lib.readContext(root, context);
    if (c?.fm.personal_owner !== r.meeting_policy.by) throw new Error('Save meeting_policy in the author\'s existing personal context');
  }
  for (const field of ['supersedes', 'retracts']) {
    if (!r[field]) continue;
    const old = rows.find(m => m.id === r[field]);
    if (!hasMeeting(r) && !hasMeeting(old || {})) continue;
    if (!old || old.context !== context) throw new Error('Meeting corrections must reference a memory in the same context');
    if ((old.meeting?.basis === 'user' || old.meeting_capture?.basis === 'user' || old.meeting_policy) &&
      !(userEvidence(r) && (r.meeting?.basis === 'user' || r.meeting_capture?.basis === 'user' || r.meeting_policy || r.retracts))) throw new Error('Source refresh cannot replace user meeting evidence or preferences');
    const owner = old.meeting_capture?.by || old.meeting_policy?.by;
    if (owner && !r.authors?.includes(owner)) throw new Error('Only that person can replace their meeting preference');
    if (old.meeting) {
      const stable = old.meeting_id || old.id;
      if (r.meeting_id && r.meeting_id !== stable) throw new Error('A correction cannot change the meeting anchor');
      r.meeting_id = stable;
      if (r.supersedes && !r.meeting) throw new Error('A meeting correction must preserve meeting metadata; use retracts to withdraw it');
    }
  }
  return r;
}

// Compare semantic input, excluding recording time and this chat's automatic source pointer.
export function duplicateMeetingMemory(root, r) {
  if (!hasMeeting(r)) return null;
  const shape = m => ({ ...metadata(m), ...(m.meeting ? { meeting: { ...m.meeting, observed_at: undefined } } : {}), content: m.content.trim(), kind: m.kind || 'note',
    people: [...(m.people || [])].sort(), sources: (m.source || []).filter(s => s.kind !== 'codex').map(s => JSON.stringify(s)).sort(),
    supersedes: m.supersedes || null, retracts: m.retracts || null });
  return effective(root).find(m => m.context === r.context && isDeepStrictEqual(shape(m), shape(r))) || null;
}

const newest = (a, b) => Date.parse(b.meeting?.observed_at || b.meeting_coverage?.checked_at || b.at) - Date.parse(a.meeting?.observed_at || a.meeting_coverage?.checked_at || a.at) || Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id);
const recordedNewest = (a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id);
const evidenceRow = m => ({ id: m.id, context: m.context, at: m.at, content: m.content, sources: m.source, ...metadata(m) });
const unique = values => [...new Map(values.map(v => [JSON.stringify(v), v])).values()];

export function meetingOverview(root, { by, meeting_id, entity, from, to, state, contexts, registry = lib.readNames(root) } = {}) {
  if (by && !lib.teamHandle(root, by)) throw new Error('Unknown person for meeting overview');
  const person = by ? lib.teamHandle(root, by) : null, rows = contexts ? contexts.flatMap(c => c.memories) : allRows(root), current = contexts ? contexts.flatMap(c => lib.effectiveMemories(c.memories)).filter(m => !lib.isForkCopy(m)) : effective(root);
  const observations = current.filter(m => m.meeting && !m.retracts), groups = new Map();
  for (const m of observations) {
    const id = m.meeting_id || m.id;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(m);
  }
  // Keep the withdrawal visible even when it leaves only independent outcomes.
  for (const m of rows.filter(m => m.meeting && !lib.isForkCopy(m))) if (!groups.has(m.meeting_id || m.id)) groups.set(m.meeting_id || m.id, []);
  const meetings = [];
  for (const [id, history] of groups) {
    const first = anchor(rows, id); if (!first || (meeting_id && meeting_id !== id)) continue;
    const ordered = [...history].sort(newest), bySource = new Map();
    for (const m of ordered) { const key = meetingSourceKey(m.meeting.reference); if (!bySource.has(key)) bySource.set(key, m); }
    const latest = [...bySource.values()], user = ordered.filter(m => m.meeting.basis === 'user').sort(recordedNewest)[0];
    const visible = user && !latest.some(m => m.id === user.id) ? [user, ...latest] : latest;
    const chosen = user || latest.find(m => m.meeting.occurrence === 'happened') || latest[0] || first;
    const outcomes = current.filter(m => m.meeting_id === id && !m.meeting && !m.meeting_capture && !m.retracts);
    const series = new Set(latest.map(m => m.meeting.series).filter(Boolean));
    const decisions = current.filter(m => !m.retracts && m.meeting_capture && (!person || m.meeting_capture.by === person) &&
      (m.meeting_capture.scope === 'meeting' ? m.meeting_capture.target === id : series.has(m.meeting_capture.target)));
    const precedence = m => (m.meeting_capture.basis === 'user' ? 2 : 0) + (m.meeting_capture.scope === 'meeting' ? 1 : 0);
    decisions.sort((a, b) => precedence(b) - precedence(a) || recordedNewest(a, b));
    const assessment = person ? decisions[0] : null;
    const sources = unique(history.flatMap(m => m.source));
    const happened = history.length && chosen.meeting.occurrence === 'happened';
    const capture = visible.some(m => ['transcript', 'notes', 'summary', 'recollection'].includes(m.meeting.evidence) && ['complete', 'partial'].includes(m.meeting.capture)) ? 'captured'
      : visible.some(m => m.meeting.evidence !== 'calendar' && ['pending', 'unavailable'].includes(m.meeting.capture)) ? 'processing' : happened ? 'recorded' : 'planned';
    const participants = user ? user.meeting.participants : unique(latest.flatMap(m => m.meeting.participants));
    const ids = [...new Set([...history, ...outcomes].flatMap(m => lib.mentionsIn(registry, m).map(n => lib.resolveEntity(registry, n)?.id).filter(Boolean)))];
    const day = chosen.meeting.occurred_at || chosen.meeting.scheduled_at;
    const viewState = !history.length ? 'withdrawn' : assessment?.meeting_capture.status === 'skip' ? 'skipped' : assessment?.meeting_capture.status === 'review' ? 'review'
      : ['planned', 'cancelled'].includes(chosen.meeting.occurrence) ? 'planned' : capture;
    if (entity && !ids.includes(lib.resolveEntity(registry, entity)?.id)) continue;
    if ((from && (!day || day.slice(0, 10) < from)) || (to && (!day || day.slice(0, 10) > to)) || (state && viewState !== state)) continue;
    meetings.push({ id, title: chosen.meeting.title, context: first.context, occurrence: history.length ? chosen.meeting.occurrence : 'unknown',
      occurred_at: chosen.meeting.occurred_at, scheduled_at: chosen.meeting.scheduled_at || null, state: viewState, capture,
      relevance: assessment?.meeting_capture.status || 'unassessed', assessment: assessment ? evidenceRow(assessment) : null,
      participants, entities: ids, sources, evidence: visible.map(evidenceRow), outcomes: outcomes.map(evidenceRow),
      decisions: decisions.map(evidenceRow), history: rows.filter(m => (m.meeting_id || (m.meeting && m.id)) === id && !lib.isForkCopy(m)).map(evidenceRow),
      conflicts: user ? latest.filter(m => m.meeting.basis !== 'user' && (m.meeting.occurrence !== user.meeting.occurrence || m.meeting.occurred_at !== user.meeting.occurred_at)).map(evidenceRow) : [],
      recorded_at: chosen.at });
  }
  const coverage = [], seen = new Set();
  for (const m of current.filter(m => m.meeting_coverage && !m.retracts && (!person || m.meeting_coverage.by === person)).sort(newest)) {
    const v = m.meeting_coverage, key = JSON.stringify([v.by, v.tool, v.account, v.scope]);
    if (seen.has(key)) continue; seen.add(key); coverage.push({ ...v, memory: m.id, sources: m.source });
  }
  const policies = current.filter(m => m.meeting_policy && !m.retracts && (!person || m.meeting_policy.by === person)).sort(recordedNewest);
  const policyBy = new Set();
  return { meetings: meetings.sort((a, b) => (b.occurred_at || b.scheduled_at || '').localeCompare(a.occurred_at || a.scheduled_at || '')), coverage,
    policies: policies.filter(m => { const key = m.meeting_policy.by; if (policyBy.has(key)) return false; policyBy.add(key); return true; }).map(evidenceRow),
    suggestions: meetingSourceSuggestions(root), notice: 'Source evidence establishes occurrence. Calendar references describe plans. Coverage is scoped to the named source and window; missing calendar entries do not establish cancellation. No external tools were queried by this view.' };
}

export function meetingSourceSuggestions(root) {
  let states; try { states = JSON.parse(readFileSync(join(root, 'work/tools.json'), 'utf8')); } catch { return []; }
  return Object.entries(states).filter(([, s]) => s?.status === 'installed' && s.test === 'ok' && !s.declined).flatMap(([key, s]) => {
    const tool = s.tool || key;
    const role = /granola|wispr|fireflies|otter|fathom|pocket|transcript|meeting|recorder/i.test(tool) ? 'meeting evidence'
      : /calendar/i.test(tool) ? 'calendar references' : /gmail|outlook|email|mail|notion|drive|slack|document/i.test(tool) ? 'notes and recaps' : null;
    return role ? [{ tool, role }] : [];
  });
}

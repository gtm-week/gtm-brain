// A meeting is an entity of kind meeting: one per meeting anchor (the first note of a captured meeting, its
// id is the meeting_id every later note about it carries; lib/meetings.mjs). The id is derived from the
// anchor, so the same meeting always finds the same entity and nothing is guessed from a title or a time.
// The page collects the notes with that meeting id (the mention matcher links them, lib/brain.mjs); the
// participants who attended link to it as `attended` (relationOverview); the transcript stays in its tool,
// pointed to by the meeting's reference. Meeting notes are never rewritten: an entity for a meeting saved
// before 0.35 is made at the upgrade (deriveMeetingEntities) or when its meeting is captured again.
import * as lib from "./brain.mjs";
import { entityId, withEntityLock } from "./entities.mjs";

export const MEETING_REF = "meeting";
export const meetingEntityId = anchor => entityId(`meeting:${anchor}`);
/* The meeting a note belongs to: its meeting_id, or its own id when it is the anchor. */
export const anchorOf = m => m?.meeting_id || (m?.meeting ? m.id : null);
const isAnchor = m => !!m?.meeting && (!m.meeting_id || m.meeting_id === m.id);
/* The anchors a meeting entity stands for (references of kind meeting). */
export const meetingAnchors = e => (e.meetings || (e.references || []).filter(r => r?.kind === MEETING_REF).map(r => r.ref)).filter(Boolean);
const day = m => String(m.meeting.occurred_at || m.meeting.scheduled_at || m.meeting.observed_at || m.at || "").slice(0, 10);
export const meetingName = m => `${String(m.meeting.title).replace(/\s+/g, " ").trim()}${day(m) ? ` ${day(m)}` : ""}`;

/* Create the meeting entity of each anchor that has none yet. Returns the entities added. */
export function ensureMeetingEntities(root, anchors) {
  const list = anchors.filter(isAnchor).filter(m => !lib.isForkCopy(m));
  if (!list.length) return [];
  return withEntityLock(root, () => {
    const registry = lib.readNames(root), taken = new Set(registry.flatMap(e => [e.id, ...(e.previous_ids || [])]));
    const owned = new Set(registry.flatMap(meetingAnchors)), names = new Set(registry.map(e => e.name.toLowerCase())), add = [];
    for (const m of list) {
      const id = meetingEntityId(m.id);
      if (taken.has(id) || owned.has(m.id)) continue;
      // two meetings of the same title on one day stay two entities: the second carries its anchor id
      let name = meetingName(m); if (names.has(name.toLowerCase())) name = `${name} (${m.id})`;
      taken.add(id); owned.add(m.id); names.add(name.toLowerCase());
      add.push({ id, name, kind: "meeting", subtype: null, aliases: [], emails: [], not: [], previous_ids: [], references: [{ kind: MEETING_REF, ref: m.id }], identity_sources: [] });
    }
    if (add.length) lib.writeNames(root, [...registry, ...add]);
    return add;
  });
}
/* Every meeting already in the brain gets its entity: the upgrade, and a brain read before 0.35. */
export function deriveMeetingEntities(root) {
  return ensureMeetingEntities(root, lib.listContexts(root).flatMap(c => c.memories).filter(isAnchor));
}
/* The attendees of a meeting entity, from the latest meeting record among its notes (the person's word first). */
export function meetingAttendees(evidence) {
  const records = evidence.filter(m => m.meeting && !m.retracts).sort((a, b) => (b.meeting.basis === "user") - (a.meeting.basis === "user") || Date.parse(b.meeting.observed_at) - Date.parse(a.meeting.observed_at) || Date.parse(b.at) - Date.parse(a.at));
  const chosen = records[0];
  return chosen ? { record: chosen, attended: chosen.meeting.participants.filter(p => p.role === "attended").map(p => p.name), invited: chosen.meeting.participants.filter(p => p.role === "invited").map(p => p.name) } : null;
}

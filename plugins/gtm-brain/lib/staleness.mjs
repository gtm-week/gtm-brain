/* How old what the brain says is, in the words people and the model read: "last note 12 days ago" on a
   context, "as of 2026-09-02, 73 days ago" on a fact, one line when the whole brain has been quiet.
   Read-time text only: nothing here is stored, so a page in brain/ never changes because a day passed.
   GTM_BRAIN_NOW fixes the clock for tests, as in summaryState and dots.today. Depends on nothing in lib/. */

export const QUIET_BRAIN_DAYS = 7;   // nothing saved in the brain for longer than this is said once
export const OLD_FACT_DAYS = 30;     // a fact or relation older than this carries its age

export const nowMs = () => process.env.GTM_BRAIN_NOW ? Date.parse(process.env.GTM_BRAIN_NOW) : Date.now();
/* Whole days between a timestamp and now; null when there is no readable date. Never negative. */
export function daysSince(at, now = nowMs()) {
  const t = Date.parse(at || "");
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 864e5)) : null;
}
export const agoText = days => days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
const newest = memories => memories.map(m => m.at).filter(a => Number.isFinite(Date.parse(a))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;

/* "last note 12 days ago" for a list line; "" for a context without notes. */
export function lastNoteAgo(memories, now = nowMs()) {
  const d = daysSince(newest(memories), now);
  return d === null ? "" : `last note ${agoText(d)}`;
}
/* "last note 2026-11-02 (12 days ago)" for a header; day = the local date of a timestamp (lib.localDateTime). */
export function lastNoteDated(memories, day, now = nowMs()) {
  const at = newest(memories), d = daysSince(at, now);
  return d === null ? "" : `last note ${day(at)} (${agoText(d)})`;
}
/* The one line for a quiet brain: contexts = [{slug, memories}]. "" while something was saved in the last week,
   and for a brain with no notes at all. */
export function quietBrainLine(contexts, day, now = nowMs()) {
  const last = contexts.map(c => ({ slug: c.slug, at: newest(c.memories) })).filter(x => x.at).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const d = last ? daysSince(last.at, now) : null;
  return d !== null && d > QUIET_BRAIN_DAYS ? `Nothing has been saved in this brain for ${d} days (last note ${day(last.at)}, in ${last.slug}): what it says may be behind what happened since.` : "";
}
/* " (as of 2026-09-02, 73 days ago)" for a fact older than OLD_FACT_DAYS, else "". */
export function oldFact(at, day, now = nowMs()) {
  const d = daysSince(at, now);
  return d !== null && d > OLD_FACT_DAYS ? ` (as of ${day(at)}, ${agoText(d)})` : "";
}

/* The save nudge: a chat that keeps reading the brain and saves nothing is reminded once, in the reply
   of a read. GTM Brain has no hooks, so the tools carry it: the server counts its own calls per chat
   (the same brain and project key as the chat start) and appends one line when the count is reached.
   A decision said in passing while asking for something else was not saved (live capture test, 2026-11-14):
   the model called query a few times and never remember.
   Pure state and text; the server decides when a call is a chat's (never GTM_BRAIN_RUN or the compile
   toolset) and reads save_nudge from admin.md. Depends on nothing in lib/. */

export const NUDGE_AFTER_READS = 3;    // reads since the last save, or since the chat started, before the line
export const NUDGE_AGAIN_READS = 5;    // after it was said: this many more reads before it is said again
/* The reads that count and that carry the line: query, load_context and the reads query replaced. */
export const NUDGE_READS = new Set(["query", "load_context", "recall", "who_is", "list_contexts", "where_we_are", "customer_overview", "meeting_overview", "list_projects"]);
/* A successful call of one of these saved a note: the stretch starts again. */
export const NUDGE_SAVES = new Set(["remember", "interact", "keep_approved_file"]);

const clock = at => { const d = new Date(at), p = n => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
export const nudgeLine = since => `Nothing saved in this chat since ${clock(since)}: if this turn established a decision, a change, a commitment or an answer, save it now with remember (one note per outcome); otherwise carry on.`;

/* One tracker per server. note(key, tool, {ok, now}) records a call and returns the line to append, or "".
   quietMs: a key silent for longer is a new chat (the server opens a chat again after the same pause). */
export function createSaveNudge({ after = NUDGE_AFTER_READS, again = NUDGE_AGAIN_READS, quietMs = 30 * 60 * 1000 } = {}) {
  const chats = new Map();
  return {
    note(key, tool, { ok = true, now = Date.now() } = {}) {
      let s = chats.get(key);
      if (!s || now - s.last > quietMs) { s = { since: now, reads: 0, next: after, last: now }; chats.set(key, s); }
      s.last = now;
      if (!ok) return "";
      if (NUDGE_SAVES.has(tool)) { s.since = now; s.reads = 0; s.next = after; return ""; }
      if (!NUDGE_READS.has(tool)) return "";
      s.reads++;
      if (s.reads < s.next) return "";
      s.next = s.reads + again;
      return nudgeLine(s.since);
    },
  };
}

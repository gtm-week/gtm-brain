/* Connecting the dots on a note (2026-11-12, new-brain test): what the brain can settle by itself it
   settles and says in one line; what has two answers it asks, all in one question. Nothing here guesses.
   - dates: "Thursday", "tomorrow", "next week" mean nothing a week later, so a note never keeps them bare.
   - projects: a note about a known person whose notes all sit in one project belongs there too.
   - companies: a new company is known by its website, the way a person is known by a full name. */

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const ABSOLUTE = new RegExp(`\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b|\\b(?:${MONTHS})\\s+\\d{1,2}\\b|\\b\\d{1,2}[./]\\d{1,2}(?:[./]\\d{2,4})?\\b`, "i");
const RELATIVE = new RegExp(`\\b(?:(this|next|last|coming)\\s+)?(${DAYS.join("|")})(s?)\\b|\\b(today|tonight|tomorrow|yesterday)\\b|\\b(next|last|this)\\s+week\\b`, "gi");

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const label = d => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${iso(d)}`;
const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const today = () => { const n = process.env.GTM_BRAIN_NOW ? new Date(process.env.GTM_BRAIN_NOW) : new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

/* Each relative date in the note, with what it can mean counted from `now`:
   {word, means: [labels], ask: true when two readings are both plain}. A note that already carries an
   absolute date, or says "Mondays" / "every Monday", is left alone. */
export function relativeDates(content, now = today()) {
  const text = String(content || "");
  if (ABSOLUTE.test(text)) return [];
  const out = [];
  for (const m of text.matchAll(RELATIVE)) {
    const word = m[0], before = text.slice(Math.max(0, m.index - 7), m.index).toLowerCase();
    if (m[3] || /every\s+$/.test(before)) continue;   // a habit, not a date
    if (out.some(o => o.word.toLowerCase() === word.toLowerCase())) continue;
    if (m[4]) { const k = m[4].toLowerCase(); const d = shift(now, k === "tomorrow" ? 1 : k === "yesterday" ? -1 : 0); out.push({ word, means: [label(d)], ask: false }); continue; }
    if (m[5]) { const monday = shift(now, -((now.getDay() + 6) % 7)), off = { next: 7, last: -7, this: 0 }[m[5].toLowerCase()]; out.push({ word, means: [`the week of ${label(shift(monday, off))}`], ask: false }); continue; }
    const target = DAYS.indexOf(m[2].toLowerCase()), ahead = (target - now.getDay() + 7) % 7, mod = (m[1] || "").toLowerCase();
    const coming = shift(now, ahead || 7), last = shift(now, -(((now.getDay() - target + 7) % 7) || 7));
    if (mod === "last") out.push({ word, means: [label(last)], ask: false });
    else if (mod === "this") out.push({ word, means: [label(ahead ? coming : now)], ask: false });
    else if (mod === "next" || mod === "coming") out.push({ word, means: ahead > 0 && ahead <= 2 && mod === "next" ? [label(coming), label(shift(coming, 7))] : [label(coming)], ask: ahead > 0 && ahead <= 2 && mod === "next" });
    else if (!ahead) out.push({ word, means: [label(now), label(shift(now, 7))], ask: true });   // said on that very day: today or next week; a past date is never an option ("moved to" a week ago means nothing)
    else out.push({ word, means: [label(coming), `${label(last)} if it already happened`], ask: false });
  }
  return out;
}

/* The hold text for a note with bare relative dates: the model writes the date into the note and
   sends it again; a date with two plain readings goes into the one question to the person. */
export function datesHold(found, { sourced = false } = {}) {
  if (sourced) return `${found.map(f => `"${f.word}"`).join(", ")} ${found.length > 1 ? "are" : "is"} relative: write the date ${found.length > 1 ? "each" : "it"} means into the note, counted from the source's own date, not today`;
  return found.map(f => f.ask
    ? `"${f.word}" can be ${f.means.join(" or ")}: ask which, in the same question as anything else`
    : `"${f.word}" is ${f.means[0]}${f.means[1] ? ` (or ${f.means.slice(1).join(", ")}; take it from the person's words, ask only if they do not say)` : ""}: write it into the note`).join("; ");
}

/* The one project the named known people all belong to: every project tag on their effective notes is
   the same, and that project is still linked. null when there are none, several, or nobody known. */
export function projectOfPeople(memories, people, linked) {
  if (!people.length) return { one: null, several: [] };
  const named = new Set(people);
  const seen = new Set(memories.filter(m => (m.people || []).some(p => named.has(p))).flatMap(m => (m.tags || []).filter(t => t.startsWith("project:")).map(t => t.slice(8))).filter(s => linked.includes(s)));
  return seen.size === 1 ? { one: [...seen][0], several: [] } : { one: null, several: [...seen].sort() };
}

const WEBSITE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i;
export const hasWebsite = entity => (entity?.references || []).some(r => r.kind === "website" || WEBSITE.test(String(r.ref || "")));

/* Facts for Codex to judge, never decisions (connect-dots.md): the open questions a note may answer,
   the meetings around it, and what the brain last said about the people in it. Each list is short and
   says where it came from; Codex decides what, if anything, it means for this note. */
const STOP = new Set(["about", "after", "again", "their", "there", "these", "this", "that", "with", "will", "from", "have", "what", "when", "which", "would", "still", "need", "needs", "should", "could", "into", "your", "ours", "they", "them", "were", "been", "being", "decide", "make", "made", "does"]);
const stem = w => w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;   // tickets = ticket
const words = s => new Set(String(s || "").toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)?.filter(w => !STOP.has(w)).map(stem) || []);
const projectsOf = m => (m.tags || []).filter(t => t.startsWith("project:"));

export function openQuestions(memories, rec, limit = 3) {
  const mine = words(rec.content), proj = projectsOf(rec), people = new Set(rec.people || []);
  return memories.filter(m => m.kind === "question" && m.id !== rec.id && !m.retracts)
    .map(m => { const shared = [...words(m.content)].filter(w => mine.has(w)).length; return { m, score: shared * 2 + (projectsOf(m).some(t => proj.includes(t)) ? 2 : 0) + ((m.people || []).some(p => people.has(p)) ? 2 : 0), shared }; })
    .filter(x => x.shared >= 1 && x.score >= 3).sort((a, b) => b.score - a.score || b.m.at.localeCompare(a.m.at)).slice(0, limit).map(x => x.m);
}

export function nearbyMeetings(meetings, entityIds, now = today(), days = 14, limit = 3) {
  const ids = new Set(entityIds), lo = now.getTime() - days * 864e5, hi = now.getTime() + days * 864e5;
  return meetings.filter(m => (m.entities || []).some(e => ids.has(e)) && (d => d >= lo && d <= hi)(Date.parse(m.occurred_at || m.scheduled_at || ""))).slice(0, limit);
}

export function lastNotesAbout(memories, person, rec, limit = 2) {
  return memories.filter(m => m.id !== rec.id && (m.people || []).includes(person) && m.kind !== "question" && !m.meeting)
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/* The chat's opening line about dates: "next Saturday" said on a Thursday is this Saturday or the one
   after, and a request (a calendar search, a draft) never passes remember's date check (scenario run,
   2026-11-12: Codex took the calendar's free 14 Nov without asking). */
export function datesLine(now = today()) {
  const day = d => { const x = new Date(now); x.setDate(now.getDate() + d); return x; };
  const short = d => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const left = []; for (let d = 1; now.getDay() + d <= 6 + 1 && (now.getDay() + d) % 7 !== 1; d++) left.push(d);
  const two = left.map(d => `"next ${DAYS[(now.getDay() + d) % 7][0].toUpperCase()}${DAYS[(now.getDay() + d) % 7].slice(1)}" (${short(day(d))} or ${short(day(d + 7))})`);
  return `Today is ${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.${two.length ? ` ${two.join(", ")} ${two.length > 1 ? "each have" : "has"} two readings: in any request, not only a note, ask which before acting on it; a free calendar slot is no answer.` : ""}`;
}

/* A compiled summary: 2-4 sentences, each ending with the ids of the notes it rests on ("[m_1a2b3c, m_4d5e6f]"),
   no relative dates. Returns {text without the ids, sources: one "m_.. m_.." string per sentence, problems}. */
export function summaryCheck(summary, ids) {
  const known = new Set(ids), problems = [];
  // a sentence ends at . ! or ? (a closing quote may follow), then any [m_...] groups, then a capital
  const sentences = String(summary || "").trim().replace(/([.!?]["”’)]?(?:\s*\[[^\]]*\])*)\s+(?=[A-Z0-9"“])/g, "$1\n").split("\n").map(s => s.trim()).filter(Boolean);
  if (sentences.length < 1 || sentences.length > 4) problems.push(`${sentences.length} sentences; write 2-4 (1 when there is one note): what is going on, what is open, what changed`);
  const words = String(summary || "").replace(/\[[^\]]*\]/g, "").split(/\s+/).filter(Boolean).length;
  if (words > 90) problems.push(`${words} words; keep it under 90: say what matters, not every note (a run of facts joined by semicolons is still a list)`);
  const out = sentences.map(s => {
    const cited = [...s.matchAll(/\bm_[0-9a-f]{6,12}\b/g)].map(m => m[0]), text = s.replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\((?:m_[0-9a-f]{6,12}[,\s]*)+\)/g, "").trim();
    if (!cited.length) problems.push(`"${text.slice(0, 60)}" cites no note: end each sentence with the ids it rests on, like [m_1a2b3c]`);
    const unknown = cited.filter(id => !known.has(id)); if (unknown.length) problems.push(`${unknown.join(", ")} not among this context's notes in force`);
    for (const d of relativeDates(text)) problems.push(`"${d.word}" in "${text.slice(0, 60)}" is a relative date: write the date itself (${d.means[0]})`);
    return { text, ids: [...new Set(cited)] };
  });
  return { text: out.map(o => o.text).join(" "), sources: out.map(o => o.ids.join(" ")), problems: [...new Set(problems)] };
}

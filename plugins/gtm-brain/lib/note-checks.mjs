/* Checks remember runs on a note before it is written (0.35.0 round three, live benchmark 2026-11-14):
   - restatement: the same fact said again is "already kept" and writes nothing (s08: a coupon's terms saved
     twice); the same fact with a different value of the same type (a date, an amount, a code, a count) is a
     correction that replaces the kept note.
   - no outcome: a note that only says a conversation happened, while the person said what came of it, is
     refused with the reason (s09: three "recounted a call" records and none of the four outcomes).
   Facts only: no model, no network; the words are compared as plain text. */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MONTH_WORD = new RegExp(`^(?:${MONTH})$`);
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const CURRENCY = { eur: "EUR", "€": "EUR", euro: "EUR", euros: "EUR", usd: "USD", "$": "USD", dollars: "USD", pln: "PLN", "zł": "PLN", zl: "PLN", gbp: "GBP", "£": "GBP", chf: "CHF" };
const UNITS = /^(minute|min|hour|hr|day|week|month|year|seat|ticket|people|person|registration|speaker|guest|attendee|floor|room|session|slot|page|copy|copie|unit|license|user)s?$/;
const NEGATION = new Set(["not", "no", "never", "none", "cannot", "can't", "won't", "isn't", "aren't", "doesn't", "don't", "didn't", "wasn't", "weren't", "without", "instead", "longer", "cancelled", "canceled", "postponed", "declined", "refused"]);
const STOP = new Set(("a an the and or but if then than so as at by for from in into of on onto to with within without about above after again against all also am any are be been before being below both can could did do does doing done down during each few further had has have having he her here hers herself him himself his how i im its it itself just me more most my myself nor now off once only other our ours out over own same she should some such that their theirs them themselves there these they this those through too under until up very was we were what when where which while who whom why will would you your yours "
  + "today tomorrow yesterday tonight week weeks still again also really just got get gets per via re plus").split(/\s+/));
// Words that say a conversation happened, not what came of it.
const FILLER = new Set(("recounted recount recounts reported reports report said says say told tell tells mentioned mention had held took place happened happen call calls calling meeting meetings meet met conversation conversations chat chatted spoke speak talked talk talks discussed discuss discussion catch sync synced quick brief short intro first second follow followup "
  + "recollection partial notes note representative contact named unnamed someone person company team night morning afternoon evening earlier later last next session").split(/\s+/));

const fold = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const stem = w => w.length > 5 && w.endsWith("ing") ? w.slice(0, -3) : w.length > 4 && w.endsWith("ed") ? w.slice(0, -2) : w.length > 4 && w.endsWith("es") && !w.endsWith("ses") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
const FILLED = new Set([...FILLER].flatMap(w => [w, stem(w)]));
const tokens = s => fold(s).replace(/'s\b/g, "").match(/[\p{L}\p{N}']+/gu) || [];

/* The values a note states, by type: dates (month-day), times, amounts, percents, codes, counts, weekdays. */
export function noteValues(text) {
  const t = String(text || ""), low = fold(t), out = new Map();
  const add = (type, v) => { if (!out.has(type)) out.set(type, new Set()); out.get(type).add(v); };
  const month = m => String(MONTHS.indexOf(fold(m).slice(0, 3)) + 1).padStart(2, "0");
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add("date", `${m[2]}-${m[3]}`);
  for (const m of low.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH})\\b`, "g"))) add("date", `${month(m[2])}-${m[1].padStart(2, "0")}`);
  for (const m of low.matchAll(new RegExp(`\\b(${MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!:)`, "g"))) add("date", `${month(m[1])}-${m[2].padStart(2, "0")}`);
  for (const m of t.matchAll(/\b(\d{1,2})[:.](\d{2})\b(?![.:]\d)/g)) if (+m[1] < 25 && +m[2] < 60 && /:/.test(m[0])) add("time", `${m[1].padStart(2, "0")}:${m[2]}`);
  const num = s => s.replace(/[\s,]/g, "").replace(/\.(?=\d{3}\b)/g, "");
  for (const m of low.matchAll(/(eur|usd|pln|gbp|chf|€|\$|£|zł)\s?(\d[\d,.\s]*\d|\d)(\s?k\b)?/g)) add("amount", `${CURRENCY[m[1]]} ${+num(m[2]) * (m[3] ? 1000 : 1)}`);
  for (const m of low.matchAll(/(\d[\d,.]*\d|\d)(\s?k)?\s?(eur|euros?|usd|dollars|pln|zł|zl|gbp|chf)\b/g)) add("amount", `${CURRENCY[m[3]]} ${+num(m[1]) * (m[2] ? 1000 : 1)}`);
  for (const m of low.matchAll(/(\d+(?:\.\d+)?)\s?(?:%|percent\b|per cent\b)/g)) add("percent", String(+m[1]));
  if (/\bhalf (?:off|price)\b|\b50 ?off\b/.test(low)) add("percent", "50");
  if (/\b(?:a )?quarter off\b/.test(low)) add("percent", "25");
  for (const m of t.matchAll(/\b[A-Z][A-Z0-9-]*\d[A-Z0-9-]*\b|\b[A-Z]{2,}\d+\b/g)) if (m[0].length >= 4 && !/^\d{4}-\d{2}/.test(m[0])) add("code", m[0]);
  for (const m of low.matchAll(/\b(\d+)\s+([a-z]+)\b/g)) { const unit = m[2]; if (UNITS.test(unit)) add(unit.replace(/s$/, "").replace(/^min$/, "minute").replace(/^hr$/, "hour").replace(/^copie$/, "copy"), m[1]); }
  for (const m of low.matchAll(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g)) add("weekday", m[1].slice(0, 3));
  return out;
}

const nameWords = names => new Set(names.flatMap(n => tokens(n)));
/* The words that carry the note's meaning: no stop words, no names, no numbers or months, stemmed. */
export function meaningWords(text, names = []) {
  const skip = nameWords(names);
  // a value's unit or currency ("minutes", "PLN") is part of the value, not of what the note is about
  return new Set(tokens(text).filter(w => !STOP.has(w) && !skip.has(w) && !/\d/.test(w) && !NEGATION.has(w) && !DAYS.includes(w) && !MONTH_WORD.test(w) && !UNITS.test(w) && !Object.hasOwn(CURRENCY, w) && w.length > 1).map(stem));
}
const negations = text => new Set(tokens(text).filter(w => NEGATION.has(w)));
const overlap = (a, b) => !a.size ? 1 : [...a].filter(w => b.has(w)).length / a.size;
const subset = (a, b) => [...a].every(x => b.has(x));
const same = (a, b) => subset(a, b) && subset(b, a);
const projectOf = tags => (tags || []).filter(t => String(t).startsWith("project:")).sort().join(",");
const shown = s => { const t = String(s).replace(/\s+/g, " ").trim(); return t.length > 140 ? t.slice(0, 137) + "..." : t; };

/* The kept note this one restates, or the one it changes.
   pool: notes in force across the brain (each with id, context, kind, content, people, source);
   note: { content, people (resolved names), sources, tags }; speakers: the authors' names, never an anchor.
   Returns { kept: m } when every value and almost every word is already in a kept note, { changed: m, type,
   was, now } when the same fact has a different value of one type, else null. */
export function restatement(pool, note, { speakers = [], cache = new Map() } = {}) {
  const text = String(note.content || ""), flat = s => fold(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const spoke = new Set(speakers.map(fold));
  const who = list => new Set((list || []).filter(p => !spoke.has(fold(p))));
  const mine = { values: noteValues(text), people: who(note.people), neg: negations(text), flat: flat(text) };
  mine.words = meaningWords(text, [...(note.people || []), ...speakers]);
  const evidence = list => (list || []).filter(s => s && !["user", "codex", "claude", "memory"].includes(s.kind)).map(s => `${s.kind}:${s.ref}`);
  const ours = evidence(note.sources);
  const facts = m => { if (!cache.has(m.id)) cache.set(m.id, { values: noteValues(m.content), people: who(m.people), neg: negations(m.content), flat: flat(m.content), words: meaningWords(m.content, [...(m.people || []), ...speakers]) }); return cache.get(m.id); };
  // another project's note with the same words is that project's fact, never this one's
  const project = projectOf(note.tags);
  const plain = m => (m.kind === "note" || m.kind === "decision") && !m.retracts && !(m.tags || []).includes("brain-question") && projectOf(m.tags) === project;
  let best = null, cand = null;
  const codes = mine.values.get("code");
  for (const m of pool) {
    if (!plain(m)) continue;
    // cheap tests first: most notes share neither a code nor the people, and are never parsed
    if (flat(m.content) === mine.flat) { if (subset(new Set(ours), new Set(evidence(m.source)))) return { kept: m }; continue; }
    const mayCode = !!codes && [...codes].some(c => m.content.includes(c)), sameWho = mine.people.size > 0 && subset(mine.people, who(m.people));
    if (!mayCode && !sameWho) continue;
    const f = facts(m), sharedCode = !!codes && [...codes].some(c => f.values.get("code")?.has(c));
    if (!sharedCode && !sameWho) continue;
    const ov = overlap(mine.words, f.words), types = [...mine.values.keys()].filter(t => t !== "code" || !sharedCode);
    const covered = [...mine.values].every(([t, vs]) => subset(vs, f.values.get(t) || new Set()));
    // the same fact again: nothing new in its values or its words, the same denials (a "won't" dropped is a
    // reversal, never a restatement), and no new source. Without a shared code nearly every word must be the
    // kept note's: "invoiced EUR 600" is not "agreed to EUR 600"
    const quiet = same(mine.neg, f.neg) && subset(new Set(ours), new Set(evidence(m.source)));
    if (covered && quiet && (sharedCode ? types.length > 0 || ov >= 0.6 : ov >= 0.85)) return { kept: m };
    // said in other words: the same people, no value the kept note lacks, the same denials, and enough of the
    // words. Not decided here: the caller shows the kept note once
    // and the model, which reads both, says whether anything is new.
    // Only in the band where wording really differs: nearly the same words with one changed ("invoiced EUR 600"
    // after "agreed to EUR 600") is another fact and is saved as it is.
    // Only for a note that states a value (an amount, a date, a count): without one there is nothing to compare,
    // and "approved the annual discount" beside "approved the volume discount" would be held for nothing.
    // A shared code (a coupon, a ticket) anchors the fact by itself, whatever the wording and with no person named
    // ("half off" for "50%", "no usage cap" for "unlimited uses": benchmark case s08).
    // With a shared code the denials need not match word for word ("never expires" for "no expiry"): the model reads both.
    if (mine.values.size && covered && (sharedCode ? ov < 0.6 : (quiet && sameWho && ov >= 0.34 && ov < 0.7)) && (!cand || ov > cand.ov)) cand = { m, ov };
    // the same fact with another value: one type whose values all differ from the kept note's
    const changable = !m.meeting && !m.meeting_id && !m.asset && !m.customer && !m.relation;
    // the same fact, not two of a kind: a shared code, most of the words, or another value in common with all
    // that the kept note says ("the closing panel" on the same day is not "the opening panel")
    if (!changable) continue;
    const back = overlap(f.words, mine.words);
    const differs = types.find(t => f.values.get(t)?.size && ![...mine.values.get(t)].some(v => f.values.get(t).has(v)));
    if (!differs) continue;
    const sharedOther = types.some(t => t !== differs && [...mine.values.get(t)].some(v => f.values.get(t)?.has(v)));
    if (!sharedCode && ov < 0.6 && !(sharedOther && back >= 0.75)) continue;
    const score = ov + (sharedCode ? 1 : 0) + (sharedOther ? 0.5 : 0);
    if (!best || score > best.score || (score === best.score && Date.parse(m.at) > Date.parse(best.m.at))) best = { m, score, type: differs, was: [...f.values.get(differs)], now: [...mine.values.get(differs)] };
  }
  // a note that rests on a source (an email, a CRM record) stays true of its moment: the new note is saved beside it, and the reply names it
  if (best) return { changed: best.m, type: best.type, was: best.was, now: best.now, auto: !evidence(best.m.source).length };
  if (cand) return { candidate: cand.m };
  // Worded as a correction ("13:00-17:00, replacing 10:00-14:00") but sent as a new note: the kept note that holds
  // the old value. The changed-value test above cannot see it, because the new note repeats the old value beside
  // the new one (benchmark case s06: both notes stayed in force). Looked for only when the wording says so.
  if (CORRECTS.test(text) && mine.values.size) {
    let target = null;
    for (const m of pool) {
      if (!plain(m) || m.meeting || m.asset || m.customer || m.relation) continue;
      const f = facts(m);
      let shared = 0, added = 0;
      for (const [t, vs] of mine.values) { const theirs = f.values.get(t); if (!theirs) continue; for (const v of vs) { if (theirs.has(v)) shared++; else added++; } }
      if (!shared || !added) continue;   // it must repeat a value the kept note has and bring one it lacks
      const ov = overlap(mine.words, f.words), named = mine.people.size > 0 && subset(mine.people, who(m.people));
      if (ov < 0.2 && !named && shared < 2) continue;   // tied to the kept note by its words, its people, or two values it repeats
      const score = shared + ov + (named ? 1 : 0);
      if (!target || score > target.score || (score === target.score && Date.parse(m.at) > Date.parse(target.m.at))) target = { m, score };
    }
    if (target) return { corrects: target.m };
  }
  return null;
}
const CORRECTS = /\b(replac(?:es|ed|ing)|instead of|rather than|no longer|not anymore|chang(?:ed|es) (?:from|to)|mov(?:ed|es) (?:from|to)|push(?:ed)? (?:back|forward) (?:from|to)|correct(?:ion|ed|ing)|was wrong|it is now|is now|not .{1,40}? but)\b/i;
export const correctsLine = (m, title) => `not saved yet: this reads as a correction of ${m.id} in ${title}: "${shown(m.content)}". Send it again with supersedes: ${m.id}; if the old note stays true, send it again as it is.`;
export const candidateLine = (m, title) => `not saved yet: this looks already recorded in ${title}, ${m.id}: "${shown(m.content)}". Nothing new: say it is already recorded. Something new: send it again as it is, or with supersedes: ${m.id} when it corrects that note.`;

export const keptLine = (m, title) => `already kept in ${title}, ${m.id}: "${shown(m.content)}". Nothing written; tell the person it was already there.`;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const said = (type, v) => type === "date" ? `${+v.slice(3)} ${MONTH_NAMES[+v.slice(0, 2) - 1]}` : type === "percent" ? `${v}%` : type === "weekday" ? v[0].toUpperCase() + v.slice(1) : ["code", "amount", "time"].includes(type) ? v : `${v} ${type}${v === "1" ? "" : "s"}`;
export const mayChangeLine = (r, title) => `this looks like ${r.changed.id} in ${title} ("${shown(r.changed.content)}"): ${r.was.map(v => said(r.type, v)).join(", ")} there, ${r.now.map(v => said(r.type, v)).join(", ")} here. Both are kept. Only if the person corrected that exact fact, remember this again with supersedes: ${r.changed.id}; never on your own guess.`;
export const changedLine = (r, title, id) => `this changes ${r.changed.id} in ${title} ("${shown(r.changed.content)}"): ${r.was.map(v => said(r.type, v)).join(", ")} is now ${r.now.map(v => said(r.type, v)).join(", ")}, so ${id} replaces it. Say what changed in one line; if both are true, remember the old note again.`;

/* A note that only says a conversation happened: after the names, the dates, the meeting's own title and the
   words for "we talked", no word is left. One word is an outcome ("Lena agreed", "Nina signed"), and so is a
   denial ("declined", "cancelled"): those are kept here, though the restatement check sets them aside. */
const outcomeWords = (text, names) => { const skip = nameWords(names);
  return new Set(tokens(text).filter(w => !STOP.has(w) && !skip.has(w) && !/\d/.test(w) && !DAYS.includes(w) && !MONTH_WORD.test(w) && w.length > 1 && !["not", "no"].includes(w)).map(stem)); };
export function statesNoOutcome(entry, { speakers = [] } = {}) {
  const names = [...(entry.people || []), ...(entry.companies || []), ...(entry.meeting?.participants || []).map(p => p.name), ...speakers];
  const title = outcomeWords(entry.meeting?.title || "", names);
  const left = [...outcomeWords(entry.content, names)].filter(w => !FILLED.has(w) && !title.has(w));
  return left.length === 0;
}
/* Whether the person said more than the note holds: their message has outcome words the note lacks. */
export function saidMore(personText, contents, names = []) {
  if (!personText) return false;
  const have = new Set(contents.flatMap(c => [...meaningWords(c, names)]));
  return [...meaningWords(personText, names)].filter(w => !FILLED.has(w) && !have.has(w)).length >= 3;
}
export const noOutcomeLine = content => `says only that a conversation happened ("${shown(content)}"), not what came of it: write the outcome (offered, agreed, decided, declined, learned) into content and keep the meeting block, one entry per outcome. If nothing came of it, leave it out`;

/* What a held entry waited on, so only a resend of that entry waits for the person's reply (Q3), not an
   unrelated note in the same turn (s09: three outcomes refused while one name was asked about). */
export function relatedToHeld(entry, held) {
  if (!held) return false;
  const many = v => Array.isArray(v) ? v : String(v || "").split(",").map(x => x.trim()).filter(Boolean);
  const words = (held.words || []).map(fold).filter(Boolean);
  const companies = many(entry.companies).map(fold), persons = [...many(entry.people), ...many(entry.new_names)].map(fold);
  const names = [...many(entry.people), ...many(entry.companies), ...(entry.meeting?.participants || []).map(p => p.name)].map(fold);
  const text = ` ${fold(entry.content).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const hit = words.filter(w => text.includes(` ${w.replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `) || names.some(n => n === w || n.split(/\s+/)[0] === w.split(/\s+/)[0]));
  // the model's own repair: every held word in this entry is now filed as a company, none as a person
  const repaired = w => companies.includes(w) && !persons.includes(w), left = words.filter(w => !repaired(w));
  if (hit.some(w => !repaired(w))) return true;
  if (hit.length && !left.length) return false;
  // The repair settles only the words it files. A held text this entry rewrites, which also held a word the repair
  // does not cover ("Max moved the call to next Tuesday" resent with Max as a company and a date the model picked),
  // still waits for the person; an unrelated entry of the same turn does not.
  const spaced = s => ` ${fold(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  const mine = meaningWords(entry.content);
  return (held.texts || []).some(t => { const other = meaningWords(t), both = [...mine].filter(w => other.has(w)).length;
    return both / Math.max(1, new Set([...mine, ...other]).size) >= 0.5 && (!hit.length || left.some(w => spaced(t).includes(spaced(w)))); });
}

/* Whether a name sent under people reads as a company, not a person: a digit, an inner capital or all capitals
   ("Volt9", "HubSpot", "IBM"), a domain or an ampersand, a company word at its end ("Acme Labs"), or the note
   saying so about a single word ("joined Lumio", "at Lumio"; not "works for Max", as often a person). Used only
   beside a full personal name; a known name never reaches it. */
const ORG_END = /\s(inc|llc|ltd|gmbh|ag|plc|corp|corporation|company|group|holdings|labs|technologies|technology|systems|solutions|software|payments|capital|ventures|partners|bank|studio|studios|media|agency|consulting|university|foundation|institute)\.?$/i;
export function looksLikeCompany(name, content = "") {
  const t = String(name || "").trim(); if (!t) return false;
  if (/\d/.test(t) || /&|@|\.(com|io|ai|co|pl|de|org|net|eu)$/i.test(t) || ORG_END.test(t)) return true;
  if (/\s/.test(t)) return false;
  if (/^\p{Lu}{2,}$/u.test(t)) return true;
  if (/^\p{L}+\p{Ll}\p{Lu}/u.test(t) && !/^(Mc|Mac|De|Di|Le|La|Van|O)\p{Lu}/u.test(t)) return true;
  const w = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:at|joined|works at|employed by)\\s+${w}(?![\\p{L}\\p{N}])`, "u").test(String(content));
}

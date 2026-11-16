/* Topic summaries on demand (0.35.0). A context's summary (brain/contexts/<slug>/context.md) is no longer
   written by a background model run after each save: that run failed for weeks on a real team's machine
   (a read-only Codex state database, a compiler tool that could not be called, an interrupted write)
   while the chat said "summary updating shortly". Now it is written when someone asks, in that chat, and
   cached in context.md until new notes arrive:
     contextFacts      what compile --facts and compile_apply read (names, tools, related, as_of, ...)
     summaryDigest     the digest of notes a summary is written from, within a budget
     recordSummaryRun  one line per written or failed summary in work/runs.jsonl (the health line reads it)
     explainFailure    a failure in the person's words, with what to do
   Reads only, except recordSummaryRun (work/, local, never committed). */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as lib from "./brain.mjs";
import { assetSummary } from "./assets.mjs";
import { workDir } from './brain-paths.mjs';

const count = arrs => { const m = new Map(); for (const a of arrs) for (const x of a) m.set(x, (m.get(x) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };

/* everything the prose is written from, and the values compile_apply writes itself */
export function contextFacts(root, slug) {
  const c = lib.readContext(root, slug); if (!c) return null;
  const mem = lib.effectiveMemories(c.memories);
  const reg = lib.readNamesShared(root);   // names as the registry knows them now: "Chris" counts for Krzysztof Pawlak once the alias exists
  const people = count(mem.map(m => lib.mentionsIn(reg, m))), tools = count(mem.map(m => m.tools));
  const kinds = new Map(reg.map(n => [n.name.toLowerCase(), n.kind || "person"]));
  const names = people.map(([name, mentions]) => ({ name, kind: kinds.get(name.toLowerCase()) || "person", mentions }));
  const others = lib.activeContexts(root).filter(o => o.slug !== slug);
  const mine = new Set(people.map(([p]) => p));
  const related = others.filter(o => lib.effectiveMemories(o.memories).some(m => lib.mentionsIn(reg, m).some(p => mine.has(p)))).map(o => o.slug);
  const authors = new Set(mem.flatMap(m => m.authors));
  const confidence = mem.length === 0 ? "none" : mem.length < 3 ? `low (N=${mem.length})` : mem.length < 10 ? `medium (N=${mem.length})` : `high (N=${mem.length})`;
  const asOf = lib.compileSnapshot(root, slug);
  return { c, mem, people, names, tools, related, authors: [...authors], confidence, asOf, questions: mem.filter(m => m.kind === "question"), decisions: mem.filter(m => m.kind === "decision"), actions: mem.filter(m => m.kind === "action"), newSince: c.compiledAt ? mem.filter(m => lib.newer(m.at, c.compiledAt)) : mem };
}

export const noteText = (root, m, sources = s => s.map(s => `${s.kind}:${s.ref}`).join(", ")) => `- ${m.id} · ${lib.memoryTimeText(m)} · ${m.authors.join(",")} · ${m.kind}${m.people.length ? " · " + m.people.join(", ") : ""}${m.tools.length ? " · tools: " + m.tools.join(", ") : ""}\n  ${m.content}${assetSummary(root, m)}${m.actions.length ? "\n  actions: " + m.actions.map(a => `${a.tool}: ${a.action}${a.ref ? " (" + a.ref + ")" : ""}`).join("; ") : ""}${m.source.length ? "\n  sources: " + sources(m.source) : ""}`;

const shortNote = m => { const t = String(m.content || "").replace(/\s+/g, " ").trim(); return `- ${m.id} · ${lib.memoryTimeText(m)} · ${m.kind}: ${t.length > 140 ? t.slice(0, 140) + " ..." : t}`; };

export const COMPILATION_GUIDANCE = "Keep only reusable methods supported by effective memories in working guidance (the now argument). Cite the memory IDs for each method. Write the summary in 2-4 sentences, each ending with the ids of the notes it rests on in brackets ([m_...]), with absolute dates only (never next Tuesday or tomorrow). Put supported immediate actions, owners and dates in the summary; their source memories remain the follow-ups. Previous guidance may mix methods with next steps: reassess both against the evidence. Do not copy standing instructions or invent methods. Pass now as an empty string when no useful methods remain.";

/* The notes a summary is written from: those since the last summary, newest first, then the older notes
   the current summary and guidance cite, then other older notes while the budget lasts. Returns the
   sections as text and the counts. compile --facts uses the full budget (300 lines, 48 KiB); a topic
   load a smaller one, so a chat that answers from it stays quick. */
export function summaryDigest(root, f, { lines: maxLines = 300, bytes: maxBytes = 48 * 1024, notes: maxNotes = Infinity, sources } = {}) {
  const noteLine = (root, m) => noteText(root, m, sources);
  const shown = [], fresh = [...f.newSince].reverse().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)); let lines = 0, bytes = 0;
  for (const m of fresh) {
    const t = noteLine(root, m), n = t.split("\n").length, b = Buffer.byteLength(t);
    if (shown.length && (shown.length >= maxNotes || lines + n > maxLines || bytes + b > maxBytes)) break;
    shown.push(t); lines += n; bytes += b;
  }
  const listed = new Set(fresh.slice(0, shown.length).map(m => m.id)), byId = new Map(f.mem.map(m => [m.id, m]));
  const citedIds = [...new Set([...[f.c.fm?.summary_sources || []].flat().map(String), ...String(f.c.summary || "").match(/\bm_[0-9a-z]+\b/g) || [], ...String(f.c.now || "").match(/\bm_[0-9a-z]+\b/g) || []])];
  const cited = citedIds.filter(id => byId.has(id) && !listed.has(id)).slice(0, maxNotes === Infinity ? 40 : Math.max(0, maxNotes - shown.length)), gone = citedIds.filter(id => !byId.has(id));
  const newIds = new Set(f.newSince.map(m => m.id)); const older = [];
  // a load's budget holds the cited notes too; compile --facts keeps up to 40 whatever their size
  for (let i = 0; i < cited.length; i++) { const t = noteLine(root, byId.get(cited[i])), n = t.split("\n").length, b = Buffer.byteLength(t); if (maxNotes !== Infinity && (lines + n > maxLines || bytes + b > maxBytes)) { cited.length = i; break; } lines += n; bytes += b; }
  const citedSet = new Set(cited);
  if (shown.length === f.newSince.length) for (const m of [...f.mem].filter(m => !newIds.has(m.id) && !citedSet.has(m.id)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    const t = noteLine(root, m), n = t.split("\n").length, b = Buffer.byteLength(t);
    if (shown.length + cited.length + older.length >= maxNotes || lines + n > maxLines || bytes + b > maxBytes) break;
    older.push(t); lines += n; bytes += b;
  }
  // A load (maxNotes set) also lists the new notes that did not fit in full, one shortened line each within a
  // budget of their own, and only when all of them fit: a summary marked current must not pass over notes its
  // writer never saw (the real brain, 2026-11-14: 79 new notes in one context, 15 shown, 64 never read).
  // When they do not all fit, none is listed and onDemandBlock sends the chat to compile_facts instead.
  const short = [];
  if (maxNotes !== Infinity && shown.length < f.newSince.length) {
    let b = 0;
    for (const m of fresh.slice(shown.length)) { const t = shortNote(m); b += Buffer.byteLength(t) + 1; if (b > maxBytes) { short.length = 0; break; } short.push(t); }
  }
  const lookup = `query: object memories, filters.context=${f.c.slug} (add search or filters.entities=<id>)`;
  const hiddenNew = f.newSince.length - shown.length - short.length, carried = f.mem.filter(m => !newIds.has(m.id) && !citedSet.has(m.id)).length - older.length;
  const out = [`\n## Effective notes since the last compile, newest first (${shown.length} of ${f.newSince.length} new)`, ...shown];
  if (short.length) out.push(`\n## The other ${short.length} new note${short.length === 1 ? "" : "s"}, older, one shortened line each (in full: ${lookup})`, ...short);
  if (cited.length || gone.length) out.push(`\n## Older notes the current summary and working guidance cite (${cited.length} still in force)`, ...cited.map(id => noteLine(root, byId.get(id))), ...(gone.length ? [`No longer in force (superseded or withdrawn), do not rest on them: ${gone.join(", ")}`] : []));
  if (older.length) out.push(`\n## Other older notes the current summary carries, newest first (${older.length})`, ...older);
  if (hiddenNew) out.push(maxNotes === Infinity ? `\n${hiddenNew} more note${hiddenNew === 1 ? "" : "s"} newer than compiled_at ${hiddenNew === 1 ? "is" : "are"} not shown and ${hiddenNew === 1 ? "is" : "are"} not in the current summary: read them with ${lookup} before writing.`
    : `\n${hiddenNew} older new note${hiddenNew === 1 ? " is" : "s are"} not shown here and ${hiddenNew === 1 ? "is" : "are"} not in the current summary; compile_facts lists them.`);
  if (carried) out.push(`\n${carried} older note${carried === 1 ? " is" : "s are"} not shown; the current summary carries them. Look one up with ${lookup}.`);
  return { text: out.join("\n"), shown: shown.length, hiddenNew, carried };
}

const day = iso => String(iso || "").slice(0, 10);
const nowMs = () => process.env.GTM_BRAIN_NOW ? Date.parse(process.env.GTM_BRAIN_NOW) : Date.now();
export const ageText = (iso, now = nowMs()) => { const d = Math.floor((now - Date.parse(iso)) / 864e5); return !Number.isFinite(d) ? "" : d <= 0 ? "today" : d === 1 ? "1 day old" : `${d} days old`; };

/* What a failed summary run means to the person, and what to do. raw is whatever the run or the tool said. */
export function explainFailure(raw, title = "the") {
  const s = String(raw || "");
  const t = title === "the" ? "the summary" : `the ${title} summary`;
  if (/read-?only|readonly/i.test(s) && /database|sqlite|state/i.test(s)) return { what: "Codex could not write its own state database (it is read-only)", todo: `quit and reopen Codex; ${t} is then written in the chat the next time you ask about the topic` };
  if (/unknown tool|tool .*not (found|available|offered)|could not be called|no such tool|not offered/i.test(s)) return { what: "the summary tool could not be called", todo: `ask in a chat where we stand on the topic; Codex writes ${t} there` };
  if (/timed out|timeout|interrupted|SIGTERM|SIGKILL|killed|aborted/i.test(s)) return { what: "the run was interrupted before it saved anything", todo: `ask about the topic again; ${t} is written in that chat` };
  // the summary check before the as_of rule: its refusals end "apply again with the same as_of" and are no arrival of notes
  if (/cites no note|not among this context's notes|relative date|sentences; write|words; keep it under|long dash|Invalid entity brief/i.test(s)) return { what: "the text did not pass the summary check (note ids, dates or length)", todo: `ask again; Codex rewrites ${t}` };
  if (/changed since --facts|changed since compile_facts|notes changed after as_of|evidence or identity changed/i.test(s)) return { what: "new notes arrived while it was being written", todo: "nothing: it is written from the newest notes when you next ask" };
  if (/manual edits?|edited by hand|paused/i.test(s)) return { what: "it was edited by hand, so it is paused", todo: `say "review the summary edit"; Codex shows the edit and asks before replacing it` };
  if (/invalid Markdown|frontmatter/i.test(s)) return { what: "the context file has a format error", todo: "say \"check the context file\"; Codex shows the line to fix" };
  if (/not a team member|by must identify a team member/i.test(s)) return { what: "it was written under a name that is not on the team", todo: "ask again; Codex writes it under your handle" };
  if (/^failed\b/i.test(s)) return { what: `the background summary run failed${s.slice(6).trim() ? ` ${s.slice(6).trim()}` : ""}`, todo: `ask in a chat where we stand on the topic; Codex writes ${t} there` };
  if (/compiled nothing|did no work|no work/i.test(s)) return { what: "the run finished without writing any summary", todo: `ask in a chat where we stand on the topic; Codex writes ${t} there` };
  return { what: `writing it failed (${s.replace(/\s+/g, " ").trim().slice(0, 100) || "no reason given"})`, todo: "ask again; if it fails again, work/runs.jsonl has the details" };
}

/* one line per summary written or failed in a chat; the health line (lib/health-line.mjs) reads it with the background runs' lines */
export function recordSummaryRun(root, { context, by = "chat", ok, error = "", foreground = true, why = null }) {
  try {
    mkdirSync(workDir(root), { recursive: true });
    // what and todo: the words the person was given, kept so the health line repeats them and never explains an explanation
    const said = ok ? {} : { error: String(error).replace(/\s+/g, " ").slice(0, 300), ...(why || explainFailure(error)) };
    appendFileSync(join(workDir(root), "runs.jsonl"), JSON.stringify({ at: new Date().toISOString(), by: foreground ? "chat" : "compile", handle: by, context, foreground, turns: ok ? 1 : 0, ...said }) + "\n");
  } catch {}
}

/* The block a topic load ends with when the cached summary is older than the newest note: the digest
   and the one instruction to write it now, in this chat, once. Paused summaries are never written here. */
export function onDemandBlock(root, slug, { notes = 15, bytes = 16 * 1024 } = {}) {
  const f = contextFacts(root, slug); if (!f) return null;
  const c = f.c;
  if (c.manualEdit.blocked) return { text: `\n## Summary paused\nThe ${c.title} summary was edited by hand, so it is not rewritten until the edit is reviewed: say "review the ${c.title} summary edit". The notes below are current.`, written: false, paused: true };
  // a chat gets each source with its link (a codex: thread as codex://threads/...), as the last-N list gave it
  const d = summaryDigest(root, f, { notes, bytes, lines: notes * 8, sources: lib.sourceText });   // about the last-15 list it replaces
  const since = c.compiledAt ? `the summary of ${day(c.compiledAt)}` : "any summary";
  // a brain's AGENTS.md written before 0.35.0 says "never compile in the chat": this load is the ask it allows
  const ask = "This load is the person's ask that AGENTS.md rule 1b allows: write it here.";
  const refusal = "If compile_apply refuses, fix what it names and apply again once; if it still refuses, say the one line it gives for the person and stop.";
  // More new notes than a load holds, even shortened: no as_of here, so nothing is marked current from a part of them.
  if (d.hiddenNew) return { written: false, asOf: null, shown: d.shown, text: [`\n## Summary behind: write it now, in this chat`,
    `${f.newSince.length} notes are newer than ${since}, more than fit in a load (${d.hiddenNew} not shown). Tell the person in one line: "The ${c.title} summary is being written now in this chat." Answer their request from the notes below first. Then call compile_facts once (context ${c.slug}): it gives the notes and the id to apply with. Write the summary from it and call compile_apply once. It is cached until new notes arrive; do not write it again in this chat. ${ask} ${refusal}`,
    d.text].join("\n") };
  const text = [`\n## Summary behind: write it now, in this chat`,
    `${f.newSince.length} note${f.newSince.length === 1 ? " is" : "s are"} newer than ${since}. Tell the person in one line: "The ${c.title} summary is being written now in this chat." Answer their request from the notes below first. Then call compile_apply once: context ${c.slug}, by your handle, as_of ${f.asOf}, summary and now as below. It is cached until new notes arrive; do not write it again in this chat. ${ask} ${refusal}`,
    `summary: 2-4 sentences, each ending with the ids of the notes it rests on ([m_...]), absolute dates only. now: the Working guidance above revalidated against these notes (reusable methods with their note ids), or "" when none.`,
    d.text].join("\n");
  return { text, written: false, asOf: f.asOf, shown: d.shown };
}

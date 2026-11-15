// A confirmed action is one call. Two operations for lifecycle.mjs, both made of the library's own writers:
//
//   mergeConfirmed   merge_entities with confirmed: true. Calls lib.mergeEntities for the preview and, when
//                    nothing in it needs the person's choice, lib.mergeEntities again with that preview's as_of.
//                    The merge record (brain/entities, written by the library) carries who confirmed it, so no
//                    note is saved about it.
//   answerQuestion   closes an open question with the person's answer. The answer is the note that retracts
//                    the question, the convention everywhere else (remember, the dashboard's answer):
//                      a plain question      lib.appendMemory (decision, retracts) + lib.commit
//                      same person or not    lib.mergeEntities or lib.addName first, then the same note, one commit
//                      "Who is Anna?"        one run of scripts/gtm-brain-remember/remember.mjs with retracts,
//                                            because the relinking of the note the question is about lives there
//                    Without a question id it lists the open questions and writes nothing.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as lib from "../../lib/brain.mjs";
import { sourceKind } from "../../lib/pointers.mjs";

const one = s => String(s ?? "").replace(/\s+/g, " ").trim();
const cut = (s, n = 160) => { const t = one(s); return t.length > n ? `${t.slice(0, n - 3)}...` : t; };
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const object = v => v && typeof v === "object" && !Array.isArray(v);
const strings = (v, what) => { if (v === undefined || v === null) return []; if (!Array.isArray(v) || v.some(x => typeof x !== "string" || !x.trim() || /[\r\n]/.test(x))) throw new Error(`${what} is a list of names, one line each`); return v.map(x => x.trim()); };

// An entity by its current ID or, when exactly one active entity carries it, by its exact name or alias.
function entityOf(registry, ref) {
  const w = one(ref); if (!w) return null;
  const byId = registry.find(e => e.id === w); if (byId) return byId;
  const hits = registry.filter(e => e.status !== "archived" && [e.name, ...(e.aliases || [])].some(n => n.toLowerCase() === w.toLowerCase()));
  if (hits.length > 1) throw new Error(`${hits.length} entities are named "${w}": ${hits.map(e => `${e.id} (${e.subtype || e.kind})`).join(", ")}. Pass the ID of the one meant.`);
  return hits[0] || null;
}
function person(root, by) {
  const who = lib.currentPerson(root, by);
  if (!who) throw new Error(by ? "by must identify a team member" : "by is missing and the brain does not know who is in this chat: pass by, the person's team handle");
  return who;
}

/* ---------- merge ---------- */
// The one thing only the person can decide, as a question with numbered choices, and the call that carries each answer.
function mergeChoice(preview, names, resolution) {
  const field = preview.unresolved[0], carry = more => JSON.stringify({ ...resolution, ...more });
  if (field === "allow_distinct") return {
    question: `"${names.source}" and "${names.target}" were marked as different earlier. Merge them anyway? 1. Yes, merge them 2. No, keep them separate`,
    next: `Ask that one question and wait. On 1: merge_entities again with confirmed true and resolution ${carry({ allow_distinct: true })}. On 2: nothing to do.` };
  if (field === "references") {
    const c = preview.conflicts.find(x => x.field === "references"), of = list => list.filter(r => c.kinds.includes(sourceKind(r))).map(r => `${r.kind}:${r.ref}`).join(", ");
    return {
      question: `Both have a ${c.kinds.join(" and ")} record ("${names.source}": ${of(c.source)}; "${names.target}": ${of(c.target)}). Which stays? 1. Both 2. The one of "${names.target}" 3. The one of "${names.source}"`,
      next: `Ask that one question and wait. Then merge_entities again with confirmed true and resolution ${carry({ references: "combine" })} for 1 (references "target" for 2, "source" for 3).` };
  }
  return { question: `Which ${field} is right for "${names.target}"?`, next: `Ask that one question and wait. Then merge_entities again with confirmed true and the ${field} in resolution.` };
}
// Preview, and apply when the preview leaves nothing open. The target's kind and subtype survive with its ID and name.
function mergeNow(root, { source, target, who, resolution }) {
  const registry = lib.readNames(root), id = ref => entityOf(registry, ref)?.id || ref;
  const pair = { source: id(source), target: id(target) };
  let res = { ...resolution }, preview = lib.mergeEntities(root, { ...pair, resolution: res });
  const typed = preview.unresolved.filter(f => f === "kind" || f === "subtype");
  if (typed.length) { for (const f of typed) res[f] = preview.conflicts.find(c => c.field === f).target; preview = lib.mergeEntities(root, { ...pair, resolution: res }); }
  const names = { source: preview.impact[0].name, target: preview.impact[1].name };
  if (preview.unresolved.length) return { applied: false, preview, names, ...mergeChoice(preview, names, res) };
  const done = lib.mergeEntities(root, { ...pair, by: who, as_of: preview.as_of, resolution: res });
  const e = done.entity, notes = preview.impact.map(i => i.memories.length), all = new Set(preview.impact.flatMap(i => i.memories)).size;
  const kept = { name: e.name, kind: e.subtype || e.kind, aliases: e.aliases || [], emails: e.emails || [], references: (e.references || []).map(r => `${r.kind}:${r.ref}`), notes: all };
  const line = `Merged "${names.source}" into "${names.target}": also known as ${kept.aliases.join(", ") || "nothing else"}; ${kept.emails.length ? `emails ${kept.emails.join(", ")}` : "no email"}; ${plural(kept.references.length, "tool record")}; ${plural(all, "note")} now count together (${notes[1]} + ${notes[0]}).`;
  return { applied: true, done, names, kept, line, typed };
}
export function mergeConfirmed(root, { source, target, by, resolution = {} }) {
  const who = person(root, by), m = mergeNow(root, { source, target, who, resolution });
  if (!m.applied) return { ...m.preview, question: m.question, next: m.next };
  const { done } = m;
  return { status: done.status, source: done.source, target: done.target, merge_id: done.merge_id, kept: m.kept, changed: done.changed,
    say: m.line, recorded: `recorded as ${done.merge_id}, confirmed by ${who}; do not save a note about this merge`,
    ...(done.warning ? { warning: done.warning, note: done.note } : {}),
    next: "Tell the person that one line. Nothing else to do; undo_entity_merge with this merge_id reverses it." };
}

/* ---------- open questions ---------- */
const days = at => { const d = Math.floor((Date.now() - Date.parse(at)) / 864e5); return !(d > 0) ? "today" : d === 1 ? "1 day old" : `${d} days old`; };
const tagValues = (m, key) => (m.tags || []).filter(t => t.startsWith(`${key}:`)).map(t => t.slice(key.length + 1));
function questions(root) {
  const contexts = lib.listContexts(root).filter(c => c.status !== "archived");
  const all = contexts.flatMap(c => (c.memories || []).map(m => ({ ...m, context: c.slug, title: c.title || c.slug })));
  const closedBy = new Map(all.flatMap(m => [m.retracts, m.supersedes].filter(Boolean).map(id => [id, m])));
  return { all, closedBy, open: all.filter(m => m.kind === "question" && !m.retracts && !closedBy.has(m.id)).sort((a, b) => String(b.at).localeCompare(String(a.at))) };
}
function aboutOf(m, all, registry) {
  const noteId = tagValues(m, "about")[0], note = noteId ? all.find(x => x.id === noteId) : null;
  const names = [...new Set([...tagValues(m, "name"), ...tagValues(m, "pick"), ...(m.people || []), ...(m.entities || []).map(id => registry.find(e => e.id === id)?.name).filter(Boolean)])];
  const project = tagValues(m, "project")[0];
  return [names.length ? names.join(", ") : "", note ? `the note ${note.id} "${cut(note.content, 80)}"` : "", project ? `project ${project}` : ""].filter(Boolean).join("; ") || `the topic ${m.title}`;
}
function listOpen(root, { limit = 20 } = {}) {
  const { all, open } = questions(root), asked = open.filter(m => (m.tags || []).includes("brain-question"));
  if (!asked.length) return "No open questions: nothing is waiting for an answer.";
  const registry = lib.readNames(root);
  return [`Open questions: ${asked.length}${asked.length > limit ? ` (the ${limit} newest)` : ""}`,
    ...asked.slice(0, limit).map((m, i) => `${i + 1}. ${m.id} | ${m.title} | ${days(m.at)} | about ${aboutOf(m, all, registry)} | "${cut(m.content, 220)}"`),
    "Next: tell the person these in plain words. When they answer one: answer_question with question = its id and answer = their words (same person or not: add outcome, name and other)."].join("\n");
}

/* ---------- answer ---------- */
const sources = (who, q) => { const seen = new Set(), out = []; for (const s of [{ kind: "user", ref: who }, ...(Array.isArray(q.source) ? q.source : [])]) { if (!s || typeof s.kind !== "string" || typeof s.ref !== "string") continue; const k = `${s.kind}\n${s.ref}`; if (seen.has(k)) continue; seen.add(k); out.push(s); } return out; };
// "Who is Anna?" is answered where the note it is about gets relinked: one run of the remember script, as the tool does it.
function answerName(root, q, { answer, who, people, companies }) {
  const registry = lib.readNames(root), fresh = [...people, ...companies].filter(n => !lib.exactName(registry, n));
  mkdirSync(join(root, "work"), { recursive: true });
  const batch = join(root, "work", `remember-${randomUUID()}.json`);
  try {
    writeFileSync(batch, JSON.stringify([{ context: q.context, retracts: q.id, kind: "decision", content: answer, people, companies, ...(fresh.length ? { new_names: fresh } : {}) }]));
    const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("../gtm-brain-remember/remember.mjs", import.meta.url)), root, "--by", who, "--batch", batch], { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 1 << 22 });
    const said = [r.stdout, r.stderr].map(s => String(s || "").trim()).filter(Boolean).join("\n");
    if (r.status !== 0) { const e = new Error(said || "the answer could not be saved"); e.code = r.status === 2 ? 2 : 1; throw e; }
    return { text: said, changed: true };
  } finally { try { rmSync(batch, { force: true }); } catch {} }
}
// Same or different, carried out before the answer is written: when it cannot be, nothing is written at all.
function settle(root, { outcome, name, other, kind, subtype, resolution, who }) {
  const registry = lib.readNames(root), a = entityOf(registry, name), b = entityOf(registry, other);
  const said = { a: a?.name || one(name), b: b?.name || one(other) };
  if (said.a.toLowerCase() === said.b.toLowerCase() && !(a && b && a.id !== b.id)) throw new Error("name and other are the same name: pass the two names the question compares");
  if (outcome === "different") {
    const typed = a ? {} : { kind: kind || b?.kind || "person", ...(subtype !== undefined ? { subtype } : !kind && b?.subtype ? { subtype: b.subtype } : {}) };
    const e = lib.addName(root, said.a, { ...typed, not: [said.b] });
    return { people: [e.name, ...(b ? [b.name] : [])], line: `${a ? `"${e.name}"` : `"${e.name}" is now its own ${e.subtype || e.kind}`} and "${said.b}" are kept separate and will not be suggested as one again.` };
  }
  if (a && b && a.id === b.id) return { people: [b.name], line: `"${one(name)}" already is "${b.name}".` };
  if (a && b) {
    const m = mergeNow(root, { source: a.id, target: b.id, who, resolution });
    if (!m.applied) return { open: m };
    return { people: [m.kept.name], line: `${m.line} Merge recorded as ${m.done.merge_id}.`, merged: true };
  }
  if (!a && !b) { const e = lib.addName(root, said.b, { kind: kind || "person", ...(subtype !== undefined ? { subtype } : {}), aliases: [said.a] }); return { people: [e.name], line: `"${e.name}" is saved as one ${e.subtype || e.kind}, also known as "${said.a}".` }; }
  const known = a || b, alias = a ? said.b : said.a;
  const e = lib.addName(root, known.name, { aliases: [alias] });
  return { people: [e.name], line: `"${alias}" is now another name of "${e.name}".` };
}
export function answerQuestion(root, args) {
  if (!object(args)) throw new Error("Expected answer_question arguments");
  const extra = Object.keys(args).filter(k => !["question", "answer", "by", "outcome", "name", "other", "kind", "subtype", "people", "companies", "resolution"].includes(k));
  if (extra.length) throw new Error(`unknown argument ${extra.join(", ")}`);
  const { question, answer, by, outcome, name, other, kind, subtype, resolution = {} } = args;
  if (question === undefined || question === null || question === "") {
    if (answer !== undefined) throw new Error("question is missing: pass the id of the open question this answers (answer_question without arguments lists them)");
    return { text: listOpen(root), changed: false };
  }
  if (typeof question !== "string" || !/^m_[0-9a-f]{6,12}$/.test(question)) throw new Error("question is the id of the open question (m_...)");
  if (typeof answer !== "string" || !answer.trim()) throw new Error("answer is missing: the person's answer in their own words. Nothing was written.");
  if (answer.trim().length > 8000) throw new Error("answer is at most 8,000 characters");
  if (outcome !== undefined && !["same", "different"].includes(outcome)) throw new Error("outcome is same or different");
  if (outcome && (!one(name) || !one(other))) throw new Error("outcome needs name and other: the two names the question compares");
  if (!object(resolution)) throw new Error("resolution is an object");
  const people = strings(args.people, "people"), companies = strings(args.companies, "companies");
  const { all, closedBy, open } = questions(root), q = all.find(m => m.id === question);
  if (!q) throw new Error(`no note ${question} in this brain; answer_question without arguments lists the open questions`);
  if (q.kind !== "question") throw new Error(`${question} is a ${q.kind || "note"}, not a question; answer_question without arguments lists the open questions`);
  const closer = closedBy.get(q.id);
  if (closer) return { text: `${q.id} was already answered (${closer.id}: "${cut(closer.content, 120)}"). Nothing written; do not ask the person again.`, changed: false };
  const who = person(root, by), left = open.filter(m => m.id !== q.id && (m.tags || []).includes("brain-question")).length;
  const still = left ? ` Still open: ${plural(left, "other question")}.` : "";
  if ((q.tags || []).includes("name-question")) {
    const registry = lib.readNames(root), known = outcome === "same" ? entityOf(registry, other)?.name || one(other) : outcome === "different" ? one(name) : null;
    const r = answerName(root, q, { answer: answer.trim(), who, people: [...new Set([...people, ...(known && !companies.includes(known) ? [known] : [])])], companies });
    return { ...r, text: `${r.text}\nanswered ${q.id}: the question is closed. Do not ask it again.${still}` };
  }
  const done = outcome ? settle(root, { outcome, name, other, kind, subtype, resolution, who }) : { people: [], line: "" };
  if (done.open) return { text: `Not answered yet, nothing written: the merge needs one choice first.\n${done.open.question}\n${done.open.next.replace(/merge_entities again with confirmed true and/g, "answer_question again with the same arguments and")}`, changed: false };
  const registry = lib.readNames(root), named = [...new Set([...done.people, ...people, ...companies])].filter(n => lib.exactName(registry, n));
  let rec;
  try {
    ({ rec } = lib.appendMemory(root, q.context, { authors: [who], via: "codex", kind: "decision", tools: [], people: named, content: answer.trim(), source: sources(who, q), actions: [], supersedes: null, retracts: q.id, tags: tagValues(q, "project").map(p => `project:${p}`) }));
  } catch (error) {
    if (!done.line) throw error;
    throw new Error(`${done.line} The answer itself was not saved (${error.message}): call answer_question again with question and answer only.`);
  }
  const commit = lib.commit(root, [`brain/contexts/${q.context}/memories.jsonl`, ...lib.ENTITIES_PATHS], `answer: ${q.context} decision by ${who}`);
  return { changed: true, text: `answered ${q.id} in ${q.title}: the question is closed by ${rec.id}. ${done.line ? `${done.line} ` : ""}Recorded (${commit.note}); do not save a note about this${done.merged ? " or about the merge" : ""}, and do not ask it again.${still}\nNext: tell the person in one line.` };
}

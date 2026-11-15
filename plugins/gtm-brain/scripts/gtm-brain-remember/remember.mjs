#!/usr/bin/env node
// Append memories to a context. The only writer of memories.jsonl.
//
// One note, from flags:
//   node remember.mjs <root> --by <handle|name|email> --content "<text>"
//        [--context <slug>]           default: the single loaded context
//        [--kind note|decision|question]          default note
//        [--tools "attio, gmail"] [--people "Pierre Aubert, Ingrid Solberg"]
//        [--source gmail:19faef...]  (repeatable)   [--action "gmail:sent email:19faef..."] (repeatable)
//          a source is provider:reference, a direct URL, or an object as JSON text
//          ('{"kind":"gmail","account":"sales@acme.com","ref":"19faef"}') when the record lives in a
//          named mailbox, workspace or portal; in a batch file the object is given as it is
//        [--supersedes m_xxxxxx] [--retracts m_xxxxxx] [--tags "synthetic"]
//        [--new "Pierre Dupont"]  names the person confirmed as new, when one looked like a known name
//
// A whole turn's notes, from a file:
//   node remember.mjs <root> --by <handle> --batch <path to json>
//        The json is a list of entries (or {"memories": [...]}), each with the same fields as the
//        flags above: content, kind, context, people, companies, tools, sources, actions,
//        supersedes, retracts, tags, new_names.
//
// Every memory written gets its own commit, so git history stays one commit per memory. What is
// batched is the work around them: one pass over the names, one dashboard render, one kick of the
// background summary run, instead of one of each per note. An entry whose name looks like someone
// already known holds back only itself; the rest are written and the report names it by position.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { prepareAsset, assetSummary, assetRows, currentApproved } from '../../lib/assets.mjs';
import { meetingOverview, meetingSourceKey } from '../../lib/meetings.mjs';
import { join } from "node:path";
import { spawn } from "node:child_process";
import { isChatSource, host } from "../../lib/host.mjs";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const dots = await import(new URL("../../lib/dots.mjs", import.meta.url));
const checks = await import(new URL("../../lib/note-checks.mjs", import.meta.url));
const ourRules = await import(new URL("../../lib/our-rules.mjs", import.meta.url));   // RULES.md Our rules tagged check (S4)
// One-word names held under P3, so a later new_names for the same word is the person's answer, not a guess.
const ASKED_DAYS = 7, askedFile = () => join(root, "work", "asked-names.json"), fold = n => String(n).trim().toLowerCase();
const readAsked = () => { try { return JSON.parse(readFileSync(askedFile(), "utf8")); } catch { return {}; } };
const wasAsked = (name, days = ASKED_DAYS) => { const at = readAsked()[fold(name)]; return !!at && Date.now() - Date.parse(at) < days * 86400000; };
const foldName = fold;
const noteAsked = names => { if (!names.length) return; const m = readAsked(); for (const n of names) m[fold(n)] = new Date().toISOString(); try { mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(askedFile(), JSON.stringify(m, null, 2) + "\n"); } catch {} };
// Save, then ask (0.35.0): a note naming someone by a bare first name nobody known has (P3), or one several
// known people have (P2), is saved with the name as written, and the brain keeps the question "Who is Anna?"
// as a brain-question memory tagged about:<note id>. The answer retracts that question; the brain then writes a
// note that supersedes the first one with the name attached (the same words, never an edit of the old line).
const NAME_Q = "name-question";
const tagValues = (m, key) => (m.tags || []).filter(t => t.startsWith(`${key}:`)).map(t => t.slice(key.length + 1));
const wordsOf = q => [...tagValues(q, "name"), ...tagValues(q, "pick")];
const openNameQuestions = ctx => lib.effectiveMemories(lib.readMemories(root, ctx)).filter(m => m.kind === "question" && !m.retracts && (m.tags || []).includes(NAME_Q));
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
const opt = { source: [], action: [] };
for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { const k = args[i].slice(2), v = args[i + 1]; if (k === "source" || k === "action") opt[k].push(v); else opt[k] = v; i++; }
const list = s => Array.isArray(s) ? s.map(x => String(x).trim()).filter(Boolean) : (s || "").split(",").map(x => x.trim()).filter(Boolean);
const die = (m, code = 1) => { console.error(m); process.exit(code); };

/* the entries to write: a batch file, or the one note the flags describe */
let entries;
if (opt.batch) {
  let raw; try { raw = JSON.parse(readFileSync(opt.batch, "utf8")); } catch (e) { die(`--batch ${opt.batch}: ${e.message}`); }
  entries = Array.isArray(raw) ? raw : Array.isArray(raw.memories) ? raw.memories : null;
  if (!entries) die("--batch json must be a list of memories, or {\"memories\": [...]}");
  if (!entries.length) die("--batch json has no memories");
} else {
  entries = [{ content: opt.content, kind: opt.kind, context: opt.context, people: opt.people, companies: opt.companies, tools: opt.tools, sources: opt.source, actions: opt.action, supersedes: opt.supersedes, retracts: opt.retracts, tags: opt.tags, new_names: opt.new, via: opt.via }];
}

if (args.includes("--project") && (opt.project === undefined || opt.project === "")) die("--project needs a value", 2);
const project = opt.project || null;
if (project) { const known = lib.readProjects(root).map(p => p.slug); if (!known.includes(project)) die(`no project ${project}; projects: ${known.join(", ") || "none"}`, 2); }
const loaded = lib.readLoaded(root, project);
// The chat this note came from is a source too: codex:<thread id> or claude:<session id>, from
// work/session.json (the chat start writes it with its host). A separate run (GTM_BRAIN_RUN: the
// background summary run, a dashboard job, a scheduled run) is nobody's conversation, so it attaches nothing.
const session = process.env.GTM_BRAIN_RUN ? null : lib.readSession(root, project);
const chat = session?.session_id || null, chatKind = session?.host || "codex";
const authors = list(opt.by).map(w => { const h = lib.teamHandle(root, w); if (!h) die(`"${w}" is not in admin.md team`); return h; });
// by is optional: the person in this chat is known (work/person.json, else the brain's git identity), so a save needs no read of admin.md first
if (!authors.length) { const me = lib.currentPerson(root); if (me) authors.push(me); }
// Nobody selected here (a fresh clone of a shared brain, before its first chat start): a team of one is that
// person; otherwise the refusal carries the handles, so the same call repeats once with by and no note is lost
// (live benchmark on a real brain, 2026-11-15: 12 of 14 saves were refused and never repeated).
if (!authors.length) {
  const team = (lib.readAdmin(root)?.team || []).map(p => p.handle).filter(Boolean);
  if (team.length === 1) authors.push(team[0]);
  else die(`nothing saved yet: this brain does not know who is in this chat. Call remember again now, with the same content and by = the handle of the person speaking, one of: ${team.join(", ") || "(no team in admin.md)"}. If the chat does not say who that is, ask once: "Who is saving this?"`);
}
// the speaker is known from the session: their own name is never an unclear name (s07: "which Artur?" asked of Artur himself)
const speakers = (lib.readAdmin(root)?.team || []).filter(p => p && authors.includes(p.handle) && p.name).map(p => p.name);

// a conversation the person told (meeting basis user) rests on their word: the user source is the author, added
// when it is missing, so the outcome is not refused for a field the brain already knows
if (!process.env.GTM_BRAIN_RUN) for (const e of entries) if (e && e.meeting?.basis === "user") {
  let src = []; try { src = lib.parseSources(e.sources); } catch { continue; }
  if (!src.some(s => s.kind === "user" && s.ref)) e.sources = [...(Array.isArray(e.sources) ? e.sources : e.sources ? [e.sources] : []), `user:${authors[0]}`];
}
// numbering only where it helps: one note reads exactly as it always did
const batched = entries.length > 1;
if (entries.some(e => e?.customer) && entries.some(e => e?.customer_coverage)) die("Record customer coverage in a separate call after checking which customer entries were kept or held.");
const kept = [], held = [], failed = [], lines = [], asks = [];
const toolsNamed = []; // the tools and source kinds of the notes kept in this call, for the tools check below
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const personText = chat && !process.env.GTM_BRAIN_RUN ? (host().lastPersonText?.(chat) || "") : "";
// where the one question goes: Codex's own question box when the person turned it on, else plain chat text
const askIn = host().nativeQuestions?.() ? "in Codex's question box (request_user_input), numbered parts as its options" : "in Codex's question box (request_user_input) when that tool is available in this chat (Plan mode, or a Codex where it is on by default), otherwise as plain chat text with numbered parts, then end the turn";
// what the held entries of this message waited on: only a resend of one of those waits for the person's reply (Q3),
// an unrelated note in the same turn is written (s09: three outcomes refused while one name was asked about)
const heldFile = () => join(root, "work", "held-replies.json");
const readHeld = () => { try { return JSON.parse(readFileSync(heldFile(), "utf8")); } catch { return {}; } };
const fresh = h => h && Date.now() - Date.parse(h.at) < 3600000;
const heldBefore = personText && fresh(readHeld()[personText]) ? readHeld()[personText] : null;   // read once, before this call holds anything
const markHeld = (words, text) => {
  if (!personText) return;
  const all = readHeld(), h = fresh(all[personText]) ? all[personText] : { words: [], texts: [] };
  all[personText] = { at: new Date().toISOString(), words: [...new Set([...h.words, ...words.filter(Boolean)])], texts: [...new Set([...h.texts, ...(text ? [String(text)] : [])])] };
  const keep = Object.entries(all).sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at)).slice(0, 20);
  try { mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(heldFile(), JSON.stringify(Object.fromEntries(keep), null, 1) + "\n"); } catch {}
};
const FORGET = /\b(forget|scratch|withdraw|never ?mind|disregard|ignore that|delete that|remove that|drop that|undo that)\b/i;
// the saving rules ride along once per chat, on whichever reply comes first (saving-rules.md)
let rulesText; const rules = () => rulesText ??= (process.env.GTM_BRAIN_RUN ? "" : dots.rulebookOnce(root, chat));
const at = n => batched ? `#${n} ` : "";
// every entry is checked before the first one is written: a bad entry in the middle must not leave the ones before it kept and unreported
// The context is optional: the one named, else the single loaded one, else the one context where the
// note's people and companies already have evidence. Anything else is held with the candidates in one
// line, never guessed.
const evidenceCtx = new Map();
let evidenceBase;   // read once per call: a batch of placeless entries must not re-read every context each time
const evidenceOf = e => {
  if (evidenceCtx.has(e)) return evidenceCtx.get(e);
  evidenceBase ??= { reg: lib.readNames(root), active: lib.listContexts(root).filter(c => c.status === "active").map(c => ({ slug: c.slug, notes: lib.effectiveMemories(c.memories).filter(m => !m.retracts).map(m => new Set(m.people || [])) })) };
  const { reg, active } = evidenceBase;
  // the speaker is in most of their own notes: never evidence of where a note belongs
  const wanted = new Set([...list(e.people), ...list(e.companies), ...(e.customer?.entity ? [e.customer.entity] : [])]
    .map(n => lib.exactName(reg, n) || lib.inferredName(reg, n)).filter(n => n && !speakers.includes(n)));
  const counted = !wanted.size ? [] : active.map(c => ({ slug: c.slug, n: c.notes.filter(p => [...wanted].some(w => p.has(w))).length })).filter(c => c.n).sort((a, b) => b.n - a.n);
  const homes = counted.map(c => c.slug);
  // several homes: the one that holds most of their notes, when it clearly does (three or more, at least twice the next)
  const clear = counted.length === 1 || (counted.length > 1 && counted[0].n >= 3 && counted[0].n >= 2 * counted[1].n);
  const found = { slug: clear ? homes[0] : null, candidates: homes, why: clear ? (counted.length === 1 ? "the people in it have their notes there" : `the people in it have most of their notes there (${counted[0].n} of ${counted.reduce((a, c) => a + c.n, 0)})`) : null };
  evidenceCtx.set(e, found); return found;
};
const ctxOf = e => e.context || opt.context || (loaded.length === 1 ? loaded[0] : null) || (loaded.length ? null : evidenceOf(e).slug);
const titleOf = slug => { try { return lib.readContext(root, slug, { includeMemories: false })?.title || slug; } catch { return slug; } };
// entries with no context to go to: held with the candidates named; the rest of the call is still written
const placeless = new Map();
if (entries.some(e => e?.meeting_coverage) && entries.some(e => e?.meeting || e?.meeting_id)) die("Record meeting coverage in a separate call after checking kept, held and failed entries.");
const preparedAssets = new Map(), changedAssets = new Set();
const sourceOf = e => lib.parseSources(e.sources);
// A new approved file for an entity and role replaces the current one, wherever that attachment lives: the
// person said "use this one" and the old file must not keep winning (Artur, 2026-11-10). Exactly one current
// approved file is replaced; with two, the person picks (the opening lines say so).
const replacing = new Map();
{
  let rows = null;
  entries.forEach((e, i) => {
    if (!e?.asset || e.asset.status !== "approved" || e.supersedes || e.retracts) return;
    rows ??= assetRows(root);
    const now = currentApproved(root, e.asset.entity, e.asset.role, rows);
    if (now.length !== 1) return;
    e.supersedes = now[0].id; e.context = now[0].context; replacing.set(i, now[0]);
  });
}
const problems = entries.map((e, i) => {
  e = e || {}; const n = i + 1;
  if (e.kind === "action") return `${at(n)}"action" is no longer a kind: record what was done as a note (say what was sent or moved in the text).`;
  if (!e.content || !String(e.content).trim()) return `${at(n)}needs content`;
  if (/[\u2013\u2014\u2015\u2212]/.test(e.content)) return `${at(n)}contains a long dash; use a plain hyphen`;
  if (e.kind && !lib.KINDS.includes(e.kind)) return `${at(n)}kind must be one of ${lib.KINDS.join(", ")}`;
  try { lib.parseSources(e.sources); } catch (err) { return `${at(n)}${err.message}`; }
  const ctx = ctxOf(e);
  if (!ctx) {
    const { candidates } = loaded.length > 1 ? { candidates: loaded } : evidenceOf(e);
    const pool = candidates.length ? candidates : lib.listContexts(root, { includeMemories: false }).filter(c => c.status === "active").map(c => c.slug);
    placeless.set(i, { n, why: `which context is this for: ${pool.map(s => `${titleOf(s)} (${s})`).join(" or ")}? ${candidates.length > 1 ? (loaded.length > 1 ? "Several contexts are loaded" : "The people in it have notes in each") : "Nothing in the note points at one"}; send it again with context: the slug that fits what the person said, and ask them only when two fit equally`, mentions: [], ask: false });
    return null;
  }
  if (!existsSync(join(root, "brain", "contexts", ctx, "context.md"))) return `${at(n)}no such context: ${ctx}`;
  try { entries[i] = e = lib.prepareMeetingMemory(root, ctx, { ...e, authors, source: sourceOf(e) }); }
  catch (err) { return `${at(n)}${err.message}`; }
  const customerErrors = lib.validateCustomerEvidence({ ...e, source: sourceOf(e) });
  if (customerErrors.length) return `${at(n)}${customerErrors.join("; ")}`;
  try { lib.guardCustomerCorrection(root, ctx, { ...e, source: sourceOf(e) }); }
  catch (err) { return `${at(n)}${err.message}`; }
  const relationErrors = lib.validateRelationEvidence({ ...e, source: sourceOf(e) }, { stored: false });
  if (relationErrors.length) return `${at(n)}${relationErrors.join("; ")}`;
  try { lib.guardRelationCorrection(root, ctx, { ...e, source: sourceOf(e) }); }
  catch (err) { return `${at(n)}${err.message}`; }
  const ruled = ourRules.saveRefusals(root, e, { siblings: entries }); if (ruled.length) return `${at(n)}${ruled.join("; ")}`;
  // a correction points at a note that exists, in this context: readers resolve supersedes and
  // retracts per context, so a pointer into another one corrects nothing and the brain says both
  for (const [field, verb] of [["supersedes", "replace"], ["retracts", "withdraw"]]) {
    const id = e[field]; if (!id) continue;
    const home = lib.listContexts(root).find(c => c.memories.some(m => m.id === id));
    if (!home) return `${at(n)}no memory ${id} to ${verb}`;
    if (home.slug !== ctx) return `${at(n)}${id} is in ${home.slug}, not ${ctx}: a correction lives with the note it corrects; remember it in ${home.slug}`;
  }
  if (e.asset !== undefined) {
    try {
      const prior = e.supersedes ? lib.readMemories(root, ctx).find(m => m.id === e.supersedes) : null;
      if (e.retracts) throw new Error('Use supersedes for an attachment replacement, or retracts without asset to withdraw it.');
      if (e.supersedes && (!prior?.asset || !lib.effectiveMemories(lib.readMemories(root, ctx)).some(m => m.id === prior.id))) throw new Error('Replace a current attachment memory. Read its latest state first.');
      if (e.supersedes && changedAssets.has(e.supersedes)) throw new Error('Replace each attachment only once per batch.');
      preparedAssets.set(i, prepareAsset(root, e.asset, project, prior?.asset));
      if (e.supersedes) changedAssets.add(e.supersedes);
    } catch (err) { return `${at(n)}${err.message}`; }
  }
  return null;
}).filter(Boolean);
// every note in force across the brain, read once per call, for the restatement check
let pool = null; const factsCache = new Map(), anchors = new Map();
const poolOf = () => pool ??= lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories).map(m => ({ ...m, context: m.context || c.slug }))).filter(m => !lib.isForkCopy(m));
// a conversation record the person told (a meeting block with basis user), or a chat note that narrates a call, with no outcome in it
const NARRATES = /\b(recounted|had (?:a|the|our) (?:call|meeting|chat)|(?:call|meeting|conversation|chat) with|met with|spoke (?:with|to)|talked (?:with|to))\b/i;
const shell = e => !!e && !e.supersedes && !e.retracts && (e.kind || "note") === "note" && !e.asset && !e.customer && !e.relation && !e.meeting_capture && !e.meeting_policy && !e.meeting_coverage && !e.customer_coverage
  && ((e.meeting && e.meeting.basis === "user" && e.meeting.occurrence === "happened") || (!e.meeting && !!personText && NARRATES.test(e.content)))
  && checks.statesNoOutcome({ ...e, people: list(e.people), companies: list(e.companies) }, { speakers });
const withChat = source => chat && !source.some(isChatSource) ? [...source, { kind: chatKind, ref: chat }] : source;
if (problems.length) die(`nothing remembered: ${problems.join("; ")}. Fix these and call again with all the entries.`);
for (let i = 0; i < entries.length; i++) {
  const e = entries[i] || {}, n = i + 1;
  if (placeless.has(i)) { held.push(placeless.get(i)); continue; }
  // a held question needs the person's reply: while their last message is still the one the question was
  // held on, a resend is the model answering for them (new-brain rerun, 2026-11-12: "Thursday" sent back as the
  // 19th with no reply). Only when the chat can be read; an answer in the same message passes.
  if (heldBefore && checks.relatedToHeld(e, heldBefore)) { held.push({ n, why: "the person has not answered the question yet (their last message is the one this was held on): ask it and wait for their reply; never pick the answer yourself (Q3)", mentions: [], ask: true }); continue; }
  // "forget that Lena runs the workshop" withdraws the note; a supersedes with "Lena does not run the workshop"
  // puts a claim in the brain the person never made (scenario run, 2026-11-12)
  if (e.supersedes && !e.retracts && FORGET.test(personText)) { held.push({ n, why: `the person asked to forget it, not to correct it: send retracts: ${e.supersedes} (not supersedes), with content saying what was withdrawn and why in their words, never the opposite claim (F1)`, mentions: [], withdraw: true }); continue; }
  // a note that says only that a conversation happened, while the person said what came of it or the call
  // carries the outcomes beside it, is refused with the reason: the outcome goes into the note (s09, s14)
  if (shell(e) && (checks.saidMore(personText, [e.content], [...list(e.people), ...list(e.companies), ...speakers]) || entries.some(o => o && o !== e && !shell(o) && !checks.statesNoOutcome(o, { speakers })))) {
    held.push({ n, why: checks.noOutcomeLine(e.content), mentions: [], ask: false }); continue;
  }
  let ctx = ctxOf(e);
  // a correction of a note something already replaced (the brain linked the name itself, s04): the newer note is the one to change
  if (e.supersedes && !e.retracts && !e.asset && !e.customer && !e.relation && !e.meeting && !e.meeting_id) {
    const here = lib.readMemories(root, ctx), by = here.find(m => m.supersedes === e.supersedes);
    if (by && !lib.effectiveMemories(here).some(m => m.id === e.supersedes)) { kept.push({ n, id: by.id, ctx }); lines.push(`${at(n)}${e.supersedes} was already replaced by ${by.id} in ${titleOf(ctx)}: "${String(by.content).replace(/\s+/g, " ").slice(0, 160)}". Nothing written; if this still changes it, remember again with supersedes: ${by.id}.`); continue; }
  }
  // the answer to "Who is Anna?": an entry that retracts the name question; the brain links the name to the note after it is written
  const answering = e.retracts ? openNameQuestions(ctx).find(q => q.id === e.retracts) || null : null;
  // the same note sent again word for word while its name question is open is the answer, not a second note
  // (decided below, once the names are read: a resend that settles nothing writes nothing)
  let resent = null;
  if (!e.supersedes && !e.retracts) {
    const mine = lib.effectiveMemories(lib.readMemories(root, ctx)), same = String(e.content).trim();
    resent = openNameQuestions(ctx).find(q => tagValues(q, "about").some(id => mine.find(m => m.id === id)?.content === same)) || null;
  }

  const companies = list(e.companies);
  let customerName;
  if (e.customer) {
    try { customerName = lib.customerIdentity(root, e.customer); }
    catch (err) { held.push({ n, why: err.message, mentions: [e.customer.entity] }); continue; }
  }
  // Names as the person typed them: when they wrote only "Florian" and the model sent the known "Florian
  // Weber", the note keeps "Florian" taken by rule P2, so "who is Florian, and why" stays honest.
  const typed = name => {
    if (!personText || !/\s/.test(name) || new RegExp(`\\b${esc(name)}\\b`, "i").test(personText)) return name;
    const first = name.split(/\s+/)[0], known = lib.readNames(root);
    return lib.exactName(known, name) === name && new RegExp(`\\b${esc(first)}\\b`).test(personText) && lib.inferredName(known, first) === name ? first : name;
  };
  // the speaker's own name, or their first name when the person did not type it, is the speaker: never asked about (s07)
  const speaker = name => {
    const f = fold(name); if (!f) return null;
    const full = speakers.find(s => fold(s) === f); if (full) return full;
    if (/\s/.test(f) || (personText && new RegExp(`\\b${esc(String(name).trim())}\\b`, "i").test(personText))) return null;
    const firsts = speakers.filter(s => fold(s).split(/\s+/)[0] === f); return firsts.length === 1 ? firsts[0] : null;
  };
  const mapped = name => e.customer && name === e.customer.entity ? customerName : speaker(name) || typed(name);
  // Codex picked one of several people with that first name although the person never wrote the full name
  // or the surname ("lorian called me about the venue" saved as Florian Kim; Florian Weber is known too; new-brain, 2026-11-12)
  const picked = !personText ? [] : list(e.people).filter(name => {
    if (speaker(name)) return false;
    const parts = String(name).trim().split(/\s+/); if (parts.length < 2) return false;
    const said = new RegExp(`\\b${esc(name)}\\b|\\b${esc(parts[parts.length - 1])}\\b`, "i"); if (said.test(personText)) return false;
    return lib.readNames(root).filter(x => x.kind === "person" && x.name.split(/\s+/)[0].toLowerCase() === parts[0].toLowerCase()).length > 1 && !wasAsked(`pick:${name}`, 1 / 24);   // asked within the hour: the reply ("2", "Kim") is the answer
  });
  if (picked.length) {
    const first = picked[0].split(/\s+/)[0], all = lib.readNames(root).filter(x => x.kind === "person" && x.name.split(/\s+/)[0].toLowerCase() === first.toLowerCase()).map(x => x.name);
    noteAsked(picked.map(p => `pick:${p}`)); markHeld([first, ...picked], e.content);
    held.push({ n, why: `the person did not write which ${first}: ${all.join(" or ")} (W1, P2: a first name with several known people is asked, never taken from the chat so far)`, mentions: [], ask: true }); continue;
  }
  const mappedCompanies = companies.map(mapped);
  // P3: a one-word name in new_names counts only after it was held and asked about ("Max who?"); listing it
  // up front skips the question (2026-11-12, Codex sent new_names ["Max"] on the first try).
  const confirmed = list(e.new_names).map(mapped).filter(name => /\s/.test(String(name).trim()) || mappedCompanies.includes(name) || wasAsked(name));
  // only a plain note is saved before the name is settled: an answer, a customer, a relationship or an attachment needs it resolved first
  const saveUnclear = !answering && !e.customer && !e.relation && !preparedAssets.has(i);
  const { people, added, similar: alike, unnamed: loose, inferred, mentions, unclear } = lib.normalisePeople(root, [...list(e.people).map(mapped), ...(e.meeting?.participants || []).map(p => speaker(p.name) || p.name), ...mappedCompanies, ...(customerName ? [customerName] : []), ...(e.relation ? [e.relation.from, e.relation.to].filter(x => x && x !== "us").map(mapped) : []), ...(preparedAssets.has(i) ? [preparedAssets.get(i).entity] : [])], { confirmedNew: confirmed, companies: mappedCompanies, trusted: [...(customerName ? [customerName] : []), ...(preparedAssets.has(i) ? [preparedAssets.get(i).entity] : [])], saveUnclear });
  // held for another reason: the unclear names go in the same one question, as before
  const heldAnyway = alike.length || loose.length || (!e.retracts && dots.relativeDates(e.content).length);
  const similar = [...alike, ...(heldAnyway ? unclear.filter(u => u.candidates.length).map(u => ({ mention: u.mention, matches: u.candidates.map(name => ({ name, kind: "person" })) })) : [])];
  const unnamed = [...loose, ...(heldAnyway ? unclear.filter(u => !u.candidates.length).map(u => u.mention) : [])];
  if (resent && !heldAnyway) {
    const about = tagValues(resent, "about")[0], open = wordsOf(resent).map(fold).sort().join("|");
    // still the same unclear names: the note and its question are already there, a second copy would only close and reopen it
    if (unclear.length && unclear.map(u => fold(u.mention)).sort().join("|") === open) { kept.push({ n, id: about, ctx }); lines.push(`${at(n)}already recorded ${about} in ${ctx}; its question is still open (${resent.id}): ${String(resent.content).split(" (about ")[0]} Ask it and wait for the person's answer.`); continue; }
    e.supersedes = about;
  }
  // a bare "Thursday" means nothing next week: the note carries the date, or the person is asked which
  const dated = e.retracts ? [] : dots.relativeDates(e.content), sourced = !!e.meeting || lib.parseSources(e.sources).some(s => !isChatSource(s));
  if (similar.length || unnamed.length || dated.length) {
    noteAsked(unnamed);
    if (similar.length || unnamed.length || dated.some(d => d.ask)) markHeld([...similar.map(s => s.mention), ...unnamed, ...dated.filter(d => d.ask).map(d => d.word)], e.content);
    held.push({ n, why: [...similar.map(s => `"${s.mention}" looks like ${s.matches.map(x => `${x.name}${x.kind !== "person" ? ` (${x.kind})` : ""}`).join(" or ")} (P4)`), ...unnamed.map(u => `"${u}" is one word and nobody known has it (rule P3: a first name alone is never a new person)`), ...(dated.length ? [dots.datesHold(dated, { sourced })] : [])].join("; "), mentions: [...similar.map(s => s.mention), ...unnamed], unnamed, ask: similar.length + unnamed.length > 0 || dated.some(d => d.ask) });
    continue;
  }
  // a note about known people whose notes all sit in one project belongs there too; several: ask
  // a bare tag that is a linked project's slug ("berlin-event-2026") is that project (new-brain rerun, 2026-11-12)
  const slugs = lib.readProjects(root).map(p => p.slug);
  e.tags = list(e.tags).map(t => slugs.includes(t) ? `project:${t}` : t);
  const tagged = project || list(e.tags).some(t => t.startsWith("project:"));
  const known = people.filter(p => !added.includes(p) && lib.readNames(root).find(x => x.name === p)?.kind === "person");
  const linked = lib.readProjects(root).map(p => p.slug);
  const where = tagged || !known.length || !linked.length ? { one: null, several: [] } : dots.projectOfPeople(lib.listContexts(root).flatMap(c => lib.effectiveMemories(lib.readMemories(root, c.slug))), known, linked);
  if (e.customer) {
    const entity = lib.resolveEntity(lib.readNames(root), customerName);
    const refs = list => JSON.stringify(list.filter(s => !isChatSource(s)).map(s => [s.kind, s.ref]).sort());
    const prior = lib.effectiveMemories(lib.readMemories(root, ctx)).find(m => m.customer && !m.retracts &&
      lib.resolveEntity(lib.readNames(root), m.customer.entity)?.id === entity?.id && m.content === e.content.trim() &&
      ["status", "basis", "observed_at"].every(k => m.customer[k] === e.customer[k]) &&
      JSON.stringify(m.customer.reference || null) === JSON.stringify(e.customer.reference || null) && refs(m.source) === refs(sourceOf(e)) && !e.supersedes && !e.retracts);
    if (prior) { kept.push({ n, id: prior.id, ctx }); lines.push(`${at(n)}already recorded ${prior.id} in ${ctx}`); continue; }
  }
  // a relationship's ends are the names the rules above settled (P1-P4, C1): "Max" taken as Max Weber stays Max Weber
  const endpoint = name => name === "us" ? "us" : mentions.find(x => x.mention === mapped(name))?.name || lib.exactName(lib.readNames(root), mapped(name)) || mapped(name);
  const relation = e.relation ? { ...e.relation, from: endpoint(e.relation.from), to: endpoint(e.relation.to) } : undefined;
  if (relation) {
    const reg = lib.readNames(root), id = v => v === "us" ? "us" : lib.resolveEntity(reg, v)?.id;
    const prior = lib.effectiveMemories(lib.readMemories(root, ctx)).find(m => m.relation && !m.retracts && m.content === e.content.trim() && m.relation.type === relation.type &&
      id(m.relation.from) === id(relation.from) && id(m.relation.to) === id(relation.to) && ["status", "basis", "observed_at"].every(k => m.relation[k] === relation[k]) && !e.supersedes && !e.retracts);
    if (prior) { kept.push({ n, id: prior.id, ctx }); lines.push(`${at(n)}already recorded ${prior.id} in ${ctx}`); continue; }
  }
  // the same fact said again, anywhere in the brain: "already kept", nothing written; the same fact with another
  // value of one type: a correction that replaces the kept note (s08: a coupon's terms saved twice)
  let changes = null;
  // a meeting record sent again word for word keeps its own check ("already recorded"); reworded, it is a restatement too (s07)
  const plainEntry = !e.supersedes && !e.retracts && !answering && !resent && !e.asset && !e.customer && !e.relation && !e.customer_coverage && !e.meeting_capture && !e.meeting_policy && !e.meeting_coverage && (e.kind || "note") !== "question";
  if (plainEntry) {
    let found = checks.restatement(poolOf(), { content: e.content, people, sources: lib.parseSources(e.sources), tags: [...list(e.tags), ...(project ? [`project:${project}`] : []), ...(where.one ? [`project:${where.one}`] : [])] }, { speakers, cache: factsCache });
    if (e.meeting && (found?.changed || String(found?.kept?.content || "").trim() === String(e.content).trim())) found = null;
    if (found?.kept) { kept.push({ n, id: found.kept.id, ctx: found.kept.context }); lines.push(`${at(n)}${checks.keptLine(found.kept, titleOf(found.kept.context))}`); continue; }
    if (found?.changed && found.auto && (!(e.meeting || e.meeting_id) || found.changed.context === ctx)) { changes = found; e.supersedes = found.changed.id; ctx = found.changed.context; }
    else if (found?.changed) changes = { ...found, beside: true };
  }
  // the answer reads on its own: the question it answers, then the person's words ("Fabian Struck, the Zauber one" alone says nothing, s05)
  // (only the asked word: "Which Fabian?", never the candidates, so the answer links nobody it rules out)
  if (answering) { const ask = String(answering.content).split(" (about ")[0].replace(/\b(Which [^:?]+):[^?]*\?/g, "$1?").replace(/\s*Full name or company\.$/, "").trim(); if (ask && !String(e.content).includes(ask)) e.content = `${ask} ${String(e.content).trim()}`; }
  // outcomes of one conversation in one call: the first one written is the meeting, the others link to it
  // (an outcome carries meeting_id and no meeting block of its own: with the block it would read as a revision of the meeting, not an outcome of it)
  if (e.meeting && !e.meeting_id && anchors.has(meetingSourceKey(e.meeting.reference))) { e.meeting_id = anchors.get(meetingSourceKey(e.meeting.reference)); delete e.meeting; }
  let rec, warnings, alreadyRecorded;
  try {
    ({ rec, warnings, alreadyRecorded } = lib.appendMemory(root, ctx, {
      ...lib.meetingMetadata(e),
      asset: preparedAssets.get(i),
      authors, via: e.via || opt.via || "codex", kind: e.kind || "note", tools: list(e.tools), people, mentions, content: e.content,
      source: withChat(lib.parseSources(e.sources)),
      actions: list(e.actions).map(a => { const [tool, action, ...ref] = a.split(":"); return ref.length ? { tool, action, ref: ref.join(":") } : { tool, action }; }),
      supersedes: e.supersedes || null, retracts: e.retracts || null, tags: [...new Set([...list(e.tags), ...(project ? [`project:${project}`] : []), ...(where.one ? [`project:${where.one}`] : [])])],
      ...(e.customer ? { customer: { ...e.customer, entity: customerName } } : {}),
      ...(e.customer_coverage ? { customer_coverage: e.customer_coverage } : {}),
      ...(relation ? { relation } : {}),
    }));
  } catch (err) { failed.push({ n, why: err.message }); lines.push(`${at(n)}not remembered: ${err.message}`); continue; }
  if (alreadyRecorded) { kept.push({ n, id: rec.id, ctx }); lines.push(`${at(n)}already recorded ${rec.id} in ${ctx}`); continue; }
  if (rec.meeting) anchors.set(meetingSourceKey(rec.meeting.reference), rec.meeting_id || rec.id);
  if (pool) { pool = pool.filter(m => m.id !== rec.supersedes); pool.push(rec); }
  if (e.customer?.reference) lib.addName(root, rec.customer.entity, { references: [e.customer.reference], sources: sourceOf(e) });

  // The person sees this line through the model: the note itself, so they know what landed (ALL-209)
  const said = String(rec.content).replace(/\s+/g, " ").trim(), shown = said.length > 240 ? said.slice(0, 237) + "..." : said;
  if (replacing.has(i)) lines.push(`${at(n)}replaced the approved ${replacing.get(i).role} of ${replacing.get(i).entity} (${replacing.get(i).label}, ${replacing.get(i).id}): every chat now uses the new file`);
  // one short line for the person; the detail line after it is for the model
  lines.push(`${at(n)}saved in ${titleOf(ctx)}: ${shown.length > 100 ? shown.slice(0, 97) + "..." : shown}`);
  if (changes) lines.push(`${at(n)}${changes.beside ? checks.mayChangeLine(changes, titleOf(changes.changed.context)) : checks.changedLine(changes, titleOf(ctx), rec.id)}`);
  else if (!e.context && !opt.context && !(loaded.length === 1 && loaded[0] === ctx) && evidenceOf(e).why) lines.push(`${at(n)}put in ${titleOf(ctx)}: ${evidenceOf(e).why}.`);
  lines.push(`${at(n)}remembered ${rec.id} in ${ctx} · ${rec.kind} · ${rec.authors.join(", ")}${rec.people.length ? " · people: " + rec.people.join(", ") : ""} · "${shown}"`);
  if (rec.asset) lines.push(assetSummary(root, rec).trim());
  for (const w of warnings) lines.push(`${at(n)}warning: ${w}`);
  const names = lib.readNames(root);
  for (const a of added) {
    const kind = names.find(x => x.name === a)?.kind || "person";
    lines.push(`${at(n)}new ${kind} in entities/: ${a}.${kind === "person" ? " If it is not a person, set its kind with add_name (organization, product; company/team are organization subtypes)." : ""}`);
  }
  if (where.one) lines.push(`${at(n)}tagged project:${where.one}: ${known.join(", ")}'s notes are all in that project. Say so in your reply; if this note is not about it, remember a correction.`);
  if (where.several.length) asks.push(`which project is "${shown.slice(0, 60)}" about: ${where.several.join(" or ")}, or none? (then remember a correction with the project tag)`);
  // every company in the note with no website is asked once, however it was added (add_name first or here);
  // our own company and one already asked ("don't know") are not asked again
  const own = foldName(lib.readAdmin(root)?.company || "");
  for (const a of rec.people) { const ent = names.find(x => x.name === a); if (ent && ent.kind === "organization" && foldName(a) !== own && !dots.hasWebsite(ent) && !wasAsked(`website:${a}`, Infinity)) { noteAsked([`website:${a}`]); asks.push(`${a}'s website, so the brain knows which ${a} this is ("don't know" is a fine answer; with a website: add_name ${a} with references [{kind: "website", ref: the URL}], then offer a short look-up)`); } }
  // facts for Codex to judge (connect-dots.md): what this note may answer, the meetings around it, what changed
  // one sentence from the person, not a batch of meeting notes or a background run: those would be noise
  const curious = !batched && !e.meeting && !process.env.GTM_BRAIN_RUN;
  const everything = curious ? lib.listContexts(root).flatMap(c => lib.effectiveMemories(lib.readMemories(root, c.slug))) : [];
  const open = dots.openQuestions(everything, rec);
  if (open.length) lines.push(`${at(n)}open questions this note may answer: ${open.map(q => `"${q.content.replace(/\s+/g, " ").slice(0, 120)}" (${q.id}, in ${q.context})`).join("; ")}. If it answers one, remember the answer in that question's context with retracts: its id and kind decision, and say so in one line; if not, say nothing about it.`);
  const knownIds = rec.people.map(p => names.find(x => x.name === p)).filter(x => x && !added.includes(x.name)).map(x => x.id);
  if (curious && knownIds.length) { let meets = []; try { meets = dots.nearbyMeetings(meetingOverview(root, { registry: names }).meetings, knownIds); } catch {}
    if (meets.length) lines.push(`${at(n)}meetings around now with these people: ${meets.map(m => `"${m.title}" ${String(m.occurred_at || m.scheduled_at).slice(0, 10)} (${m.id})`).join("; ")}. If this note is about one, remember it with meeting_id: that id; otherwise ignore.`); }
  for (const p of curious ? rec.people.filter(p => !added.includes(p) && names.find(x => x.name === p)?.kind === "person") : []) {
    const before = dots.lastNotesAbout(everything, p, rec);
    if (before.length) lines.push(`${at(n)}the brain last said about ${p}: ${before.map(m => `"${m.content.replace(/\s+/g, " ").slice(0, 100)}" (${m.at.slice(0, 10)})`).join("; ")}. If this note changes one of these, say what changed in one line.`);
  }
  for (const inf of inferred) lines.push(`${at(n)}took "${inf.mention}" as ${inf.name} (rule P2: the one known person with that first name). If it is someone else, say so: remember again with new_names ["${inf.mention}"].`);
  const missed = answering ? [] : lib.candidateEntities(e.content, people, names);   // an answer's words are the question's, already settled
  if (missed.length) lines.push(`${at(n)}words in this note not linked to anything in the brain: ${missed.map(x => `"${x}"`).join(", ")}. Only one that is a person, company or product the note is about gets add_name with its kind (company and team are organization subtypes; ask only when it is not plain); a place, event, project, code or plain word needs nothing, and no read is needed to decide.`);
  // The last step outcome closes onboarding in the same commit: no separate marker to forget.
  const closed = /^Onboarding step [1-6][ :]/.test(rec.content) ? lib.closeOnboardingFromOutcomes(root, rec.authors) : null;
  const closedIn = closed && lib.readOnboarding(root).context;
  if (closed) lines.push(`${at(n)}all onboarding steps saved: recorded "${closed.content}" in ${closedIn} (${closed.id}); do not write another completion marker. Onboarding just finished in this chat: end this reply with the closing gtm-brain-start describes (what connected, what was learned, the first task).`);
  // one commit per memory: git history stays readable as one commit, one memory
  const closedPath = closed ? [`brain/contexts/${closedIn}/memories.jsonl`] : [];
  lines.push(`${at(n)}${lib.commit(root, [`brain/contexts/${ctx}/memories.jsonl`, ...closedPath, ...lib.ENTITIES_PATHS], `remember: ${ctx} ${rec.kind} by ${rec.authors.join(",")}`).note}`);
  kept.push({ n, id: rec.id, ctx }); toolsNamed.push(...(rec.tools || []), ...(rec.source || []).filter(s => s && !isChatSource(s)).map(s => s.kind));
  const memPaths = [`brain/contexts/${ctx}/memories.jsonl`, ...lib.ENTITIES_PATHS];
  const sharing = w => { const s = lib.readNames(root).filter(x => x.kind === "person" && [x.name, ...(x.aliases || [])].some(a => fold(a).split(/\s+/)[0] === fold(w))).map(x => x.name); return s.length > 1 ? s : []; };
  // the question about a saved note, kept in the brain until the person answers it: on the first save, for the
  // names an answer left out, and for a correction that named nobody
  const askNames = (about, list) => {
    const ask = list.map(u => u.candidates.length ? `Which ${u.mention}: ${u.candidates.join(" or ")}?` : `Who is ${u.mention}?`).join(" ") + (list.some(u => !u.candidates.length) ? " Full name or company." : "");
    const quote = String(about.content).replace(/\s+/g, " ").trim(), several = list.some(u => u.candidates.length);
    const { rec: q } = lib.appendMemory(root, ctx, { authors, via: e.via || opt.via || "codex", kind: "question", tools: [], people: [], content: `${ask} (about ${about.id}: "${quote.length > 120 ? quote.slice(0, 117) + "..." : quote}")`, source: rec.source, actions: [], supersedes: null, retracts: null,
      tags: ["brain-question", NAME_Q, `about:${about.id}`, ...list.map(u => `${u.candidates.length ? "pick" : "name"}:${u.mention}`), ...about.tags.filter(t => t.startsWith("project:"))] });
    lines.push(`${at(n)}${lib.commit(root, memPaths, `remember: ${ctx} question by ${q.authors.join(",")}`).note}`);
    noteAsked([...list.map(u => u.mention), ...list.flatMap(u => u.candidates.map(c => `pick:${c}`))]); markHeld(list.map(u => u.mention), null);
    // the person's line, right under "saved in ...": the question follows the confirmation
    const savedAt = lines.findIndex(l => l.startsWith(`${at(n)}saved in `));
    lines.splice(savedAt + 1, 0, `${at(n)}${ask}`);
    lines.push(`${at(n)}${list.map(u => `"${u.mention}"`).join(", ")} ${several ? "could be several known people" : `${list.length > 1 ? "are each" : "is"} one word and nobody known has it`} (rule ${several ? "P2" : "P3"}): the note is saved with the name as written and no new person; the question is kept as ${q.id} in ${ctx}, a pending brain question. Never answer it yourself. When the person answers: remember one entry with context: ${ctx}, retracts: ${q.id}, kind decision, content: their answer in their words, and the full name in people (someone new: new_names too), or the company in companies; ${about.meeting || about.meeting_id ? `then remember ${about.id} again with supersedes: ${about.id} and that name in people (a meeting note is not relinked by the brain)` : `the brain then attaches it to ${about.id} by itself`}.`);
    if (!asks.includes(ask)) asks.unshift(ask);   // two notes in one call about the same name: one part of the question
  };
  // the answer to a name question: the note it was about, again, with the name attached
  if (answering) {
    const about = tagValues(answering, "about")[0], words = wordsOf(answering), picks = tagValues(answering, "pick");
    const note = lib.effectiveMemories(lib.readMemories(root, ctx)).find(m => m.id === about);
    // a name question is about a person: the people the answer names, not the company it adds ("Jakub Sadowski, from SurferSEO", s04)
    const reg = lib.readNames(root), newly = rec.people.filter(p => !(note?.people || []).includes(p) && !speakers.includes(p));
    const persons = newly.filter(p => reg.find(r => r.name === p)?.kind === "person"), named = persons.length ? persons : newly;
    const first = p => foldName(p).split(/\s+/)[0];
    // each word asked about takes the name that starts with it; one word and one name need no match (a nickname, a company).
    // Anyone else the answer names ("she reports to Piotr Nowak") stays with the answer, not with the note.
    const answered = words.map(w => ({ w, name: named.find(p => first(p) === foldName(w)) || (words.length === 1 && named.length === 1 ? named[0] : null) })).filter(x => x.name);
    const plain = note && !note.asset && !note.customer && !note.relation && !note.meeting && !note.meeting_id;
    if (plain && answered.length) {
      const kept0 = (note.entity_mentions || []).map(x => ({ mention: x.mention, name: reg.find(r => r.id === x.entity)?.name, resolution: x.resolution, rule: x.rule })).filter(x => x.name);
      const attach = [...new Set(answered.map(x => x.name))];
      // resolution stays one a released lib reads (confirmed_new: on the person's word); a new value would stop an older teammate's index
      const said = answered.map(({ w, name }) => ({ mention: w, name, resolution: "confirmed_new", rule: picks.includes(w) ? "P2" : "P3" }));
      try {
        // the note that replaces it reads with the full name: "Fabian says" becomes "Fabian Struck says", "Kuba agreed" becomes "Jakub Sadowski (Kuba) agreed"
        let content = note.content;
        for (const { w, name } of answered) {
          if (new RegExp(`\\b${esc(name)}\\b`, "i").test(content)) continue;
          content = content.replace(new RegExp(`\\b${esc(w)}\\b`), first(name) === foldName(w) ? name : `${name} (${w})`);
        }
        const { rec: linked } = lib.appendMemory(root, ctx, { authors: note.authors, via: note.via, kind: note.kind, tools: note.tools, people: [...note.people, ...attach], mentions: [...kept0, ...said], content, source: note.source, actions: note.actions, supersedes: note.id, retracts: null, tags: note.tags });
        lines.push(`${at(n)}linked ${answered.map(x => `"${x.w}"`).join(", ")} in ${note.id} to ${attach.join(", ")}: ${linked.id} replaces it, now reading "${String(linked.content).replace(/\s+/g, " ").slice(0, 160)}". Say so in one line; nothing else to save for this answer.`);
        lines.push(`${at(n)}${lib.commit(root, memPaths, `remember: ${ctx} ${linked.kind} by ${linked.authors.join(",")}`).note}`);
        // a name the answer left out is still asked, now about the note that replaced the first one
        const rest = words.filter(w => !answered.some(x => x.w === w));
        if (rest.length) askNames(linked, rest.map(w => ({ mention: w, candidates: picks.includes(w) ? sharing(w) : [] })));
      } catch (err) { lines.push(`${at(n)}the question is closed, but ${note.id} could not be linked (${err.message}): remember it again with supersedes: ${note.id} and the full name in people.`); }
    } else if (note) lines.push(`${at(n)}the question is closed; ${!named.length ? "no new name came with the answer, so" : !plain ? `${note.id} is not a plain note, so` : `the answer does not say which of ${named.join(", ")} is ${words.map(w => `"${w}"`).join(", ")}, so`} attach it by remembering ${note.id} again with supersedes: ${note.id} and the full name in people.`);
  }
  // a note replaced or withdrawn by hand closes the name question about it
  if (!answering && (e.supersedes || e.retracts)) for (const q of openNameQuestions(ctx).filter(q => tagValues(q, "about").includes(e.supersedes || e.retracts))) {
    // a correction that still has the word and names nobody new has not said who it is: the question moves to the new note
    const old = e.supersedes ? lib.readMemories(root, ctx).find(m => m.id === e.supersedes) : null;
    const carried = !old || rec.people.some(p => !(old.people || []).includes(p)) ? [] : wordsOf(q).filter(w => fold(rec.content).includes(fold(w)));
    for (const w of carried) if (!unclear.some(u => fold(u.mention) === fold(w))) unclear.push({ mention: w, candidates: tagValues(q, "pick").includes(w) ? sharing(w) : [] });
    const again = wordsOf(q).some(w => unclear.some(u => fold(u.mention) === fold(w)));
    const { rec: closedQ } = lib.appendMemory(root, ctx, { authors, via: e.via || opt.via || "codex", kind: "decision", tools: [], people: rec.people.filter(p => names.find(x => x.name === p)?.kind === "person"), content: e.retracts ? `Not asked any more: ${e.retracts} was withdrawn (${rec.id}).` : again ? `Asked again about ${rec.id}, which replaces ${e.supersedes}.` : `Answered by ${rec.id}, which replaces ${e.supersedes}${rec.people.length ? ` and names ${rec.people.join(", ")}` : ""}.`, source: rec.source, actions: [], supersedes: null, retracts: q.id, tags: [] });
    lines.push(`${at(n)}closed the name question ${q.id} (${closedQ.id}).`);
    lines.push(`${at(n)}${lib.commit(root, memPaths, `remember: ${ctx} ${closedQ.kind} by ${closedQ.authors.join(",")}`).note}`);
  }
  // saved with the name as written: the question is kept in the brain until the person answers it
  if (unclear.length && !heldAnyway) askNames(rec, unclear);
}

/* what the brain cannot settle by itself, for one question with numbered parts */
/* the look-alike names, in one place, so only the entries that need an answer are re-sent */
const holdReport = () => { const loose = held.flatMap(h => h.unnamed || []), alike = held.flatMap(h => h.mentions.filter(m => !(h.unnamed || []).includes(m)));
  const decide = [
    alike.length ? `${alike.map(m => `"${m}"`).join(", ")}: decide by P4. One or two letters off a known name: ask "same as X?" (yes: add_name with aliases [this spelling]; no: new_names). A clearly different surname: someone else, send it in new_names without asking` : "",
    loose.length ? `${loose.map(m => `"${m}"`).join(", ")}: decide by P3. A company, product or team the note plainly names goes in companies (or new_names with add_name for its kind); a person: ask for the full name ("${loose[0]} who?")` : "",
  ].filter(Boolean);
  return `${batched ? `not kept (${held.length} of ${entries.length})` : "not remembered yet"}: ${held.map(h => `${at(h.n)}${h.why}`).join(batched ? "\n" : "; ")}.${decide.length ? ` ${decide.join(". ")}.` : ""} ${held.some(h => h.ask) || alike.length || loose.length ? `Whatever is still unclear: one question (Q2), ${askIn} (Q1), and wait for the reply (Q3).` : "No question needed: change the note as the rule says and send it again."} Then remember ${batched ? "the held-back entries" : "again"}.${rules()}`; };

if (!kept.length) { console.error(held.length ? holdReport() : lines.join("\n") + rules()); process.exit(2); }

if (batched) console.log(`kept ${kept.length} of ${entries.length}: ${kept.map(k => `${k.id} in ${k.ctx}`).join(", ")}${failed.length ? `; not kept: ${failed.map(f => "#" + f.n).join(", ")} (see below; call again with only those)` : ""}`);
for (const l of lines) console.log(l);
if (held.length) console.log(holdReport());
if (asks.length) console.log(`Ask the person once, ${askIn}, after quoting the note${held.some(h => h.ask) ? ", in the same question as the held entries" : ""}, one numbered part each: ${asks.map((a, k) => `${k + 1}) ${a}`).join(" ")}. Never more than this one question.`);

// 0.35.0: no summary is promised after a save; a topic's summary is written when someone asks (lib/summaries.mjs)
if (!held.length && rules()) console.log(rules().trim());
// A note from a tool the brain's tools list does not know yet (MagicPath, ZYNT): check the tools in the
// background, so the dashboard lists it without waiting for someone to ask (connect.mjs: "a memory came from it").
if (!process.env.GTM_BRAIN_NO_TOOLS_CHECK && !process.env.GTM_BRAIN_NO_COMMIT && !process.env.NODE_TEST_CONTEXT) {   // never from tests or dry runs
  let known = []; try { known = Object.entries(JSON.parse(readFileSync(join(root, "work", "tools.json"), "utf8"))).flatMap(([k, s]) => [k, s && s.tool, s && s.plugin, s && s.display]); } catch {}
  const flat = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const has = new Set(known.map(flat).filter(Boolean)), NEVER = new Set(["memory", "file", "url", "web", "person", "manual", "document"]);
  if (toolsNamed.map(flat).some(x => x.length >= 3 && !NEVER.has(x) && !has.has(x))) spawn(process.execPath, [new URL("../gtm-brain-connect/connect.mjs", import.meta.url).pathname, root, "--check"], { detached: true, stdio: "ignore", env: { ...process.env, GTM_BRAIN_CODEX_TIMEOUT: "20000" } }).unref();
}
lib.rerender(root);

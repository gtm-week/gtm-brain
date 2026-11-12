#!/usr/bin/env node
// Append memories to a context. The only writer of memories.jsonl.
//
// One note, from flags:
//   node remember.mjs <root> --by <handle|name|email> --content "<text>"
//        [--context <slug>]           default: the single loaded context
//        [--kind note|decision|question]          default note
//        [--tools "attio, gmail"] [--people "Pierre Aubert, Ingrid Solberg"]
//        [--source gmail:19faef...]  (repeatable)   [--action "gmail:sent email:19faef..."] (repeatable)
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
import { meetingOverview } from '../../lib/meetings.mjs';
import { join } from "node:path";
import { isChatSource, host } from "../../lib/host.mjs";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const dots = await import(new URL("../../lib/dots.mjs", import.meta.url));
// One-word names held under P3, so a later new_names for the same word is the person's answer, not a guess.
const ASKED_DAYS = 7, askedFile = () => join(root, "work", "asked-names.json"), fold = n => String(n).trim().toLowerCase();
const readAsked = () => { try { return JSON.parse(readFileSync(askedFile(), "utf8")); } catch { return {}; } };
const wasAsked = (name, days = ASKED_DAYS) => { const at = readAsked()[fold(name)]; return !!at && Date.now() - Date.parse(at) < days * 86400000; };
const foldName = fold;
const noteAsked = names => { if (!names.length) return; const m = readAsked(); for (const n of names) m[fold(n)] = new Date().toISOString(); try { mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(askedFile(), JSON.stringify(m, null, 2) + "\n"); } catch {} };
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
if (!authors.length) die("need --by <person>");

// numbering only where it helps: one note reads exactly as it always did
const batched = entries.length > 1;
if (entries.some(e => e?.customer) && entries.some(e => e?.customer_coverage)) die("Record customer coverage in a separate call after checking which customer entries were kept or held.");
const kept = [], held = [], failed = [], lines = [], asks = [];
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const personText = chat && !process.env.GTM_BRAIN_RUN ? (host().lastPersonText?.(chat) || "") : "";
// where the one question goes: Codex's own question box when the person turned it on, else plain chat text
const askIn = host().nativeQuestions?.() ? "in Codex's question box (request_user_input), numbered parts as its options" : "as plain chat text with numbered parts, then end the turn";
const waitingForReply = !!personText && wasAsked(`reply:${personText}`, 1 / 24);   // read once, before this call holds anything
const at = n => batched ? `#${n} ` : "";
// every entry is checked before the first one is written: a bad entry in the middle must not leave the ones before it kept and unreported
const ctxOf = e => e.context || opt.context || (loaded.length === 1 ? loaded[0] : null);
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
  if (!ctx) return loaded.length > 1 ? `${at(n)}several contexts loaded (${loaded.join(", ")}); name the context` : `${at(n)}no context loaded and none given. Load a context first.`;
  if (!existsSync(join(root, "brain", "contexts", ctx, "context.md"))) return `${at(n)}no such context: ${ctx}`;
  try { entries[i] = e = lib.prepareMeetingMemory(root, ctx, { ...e, authors, source: sourceOf(e) }); }
  catch (err) { return `${at(n)}${err.message}`; }
  const customerErrors = lib.validateCustomerEvidence({ ...e, source: sourceOf(e) });
  if (customerErrors.length) return `${at(n)}${customerErrors.join("; ")}`;
  try { lib.guardCustomerCorrection(root, ctx, { ...e, source: sourceOf(e) }); }
  catch (err) { return `${at(n)}${err.message}`; }
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
const withChat = source => chat && !source.some(isChatSource) ? [...source, { kind: chatKind, ref: chat }] : source;
if (problems.length) die(`nothing remembered: ${problems.join("; ")}. Fix these and call again with all the entries.`);
for (let i = 0; i < entries.length; i++) {
  const e = entries[i] || {}, n = i + 1;
  // a held question needs the person's reply: while their last message is still the one the question was
  // held on, a resend is the model answering for them (new-brain rerun, 2026-11-12: "Thursday" sent back as the
  // 19th with no reply). Only when the chat can be read; an answer in the same message passes.
  if (waitingForReply) { held.push({ n, why: "the person has not answered the question yet (their last message is the one this was held on): ask it and wait for their reply; never pick the answer yourself", mentions: [], ask: true }); continue; }
  const ctx = ctxOf(e);

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
  const mapped = name => e.customer && name === e.customer.entity ? customerName : typed(name);
  const mappedCompanies = companies.map(mapped);
  // P3: a one-word name in new_names counts only after it was held and asked about ("Max who?"); listing it
  // up front skips the question (2026-11-12, Codex sent new_names ["Max"] on the first try).
  const confirmed = list(e.new_names).map(mapped).filter(name => /\s/.test(String(name).trim()) || mappedCompanies.includes(name) || wasAsked(name));
  const { people, added, similar, unnamed, inferred, mentions } = lib.normalisePeople(root, [...list(e.people).map(mapped), ...(e.meeting?.participants || []).map(p => p.name), ...mappedCompanies, ...(customerName ? [customerName] : []), ...(preparedAssets.has(i) ? [preparedAssets.get(i).entity] : [])], { confirmedNew: confirmed, companies: mappedCompanies, trusted: [...(customerName ? [customerName] : []), ...(preparedAssets.has(i) ? [preparedAssets.get(i).entity] : [])] });
  // a bare "Thursday" means nothing next week: the note carries the date, or the person is asked which
  const dated = e.retracts ? [] : dots.relativeDates(e.content), sourced = !!e.meeting || lib.parseSources(e.sources).some(s => !isChatSource(s));
  if (similar.length || unnamed.length || dated.length) {
    noteAsked(unnamed);
    if (personText && (similar.length || unnamed.length || dated.some(d => d.ask))) noteAsked([`reply:${personText}`]);
    held.push({ n, why: [...similar.map(s => `"${s.mention}" may be ${s.matches.map(x => `${x.name}${x.kind !== "person" ? ` (${x.kind})` : ""}`).join(" or ")}`), ...unnamed.map(u => `"${u}" is one word and nobody known has it (rule P3: a first name alone is never a new person)`), ...(dated.length ? [dots.datesHold(dated, { sourced })] : [])].join("; "), mentions: [...similar.map(s => s.mention), ...unnamed], unnamed, ask: similar.length + unnamed.length > 0 || dated.some(d => d.ask) });
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
    }));
  } catch (err) { failed.push({ n, why: err.message }); lines.push(`${at(n)}not remembered: ${err.message}`); continue; }
  if (alreadyRecorded) { kept.push({ n, id: rec.id, ctx }); lines.push(`${at(n)}already recorded ${rec.id} in ${ctx}`); continue; }
  if (e.customer?.reference) lib.addName(root, rec.customer.entity, { references: [e.customer.reference], sources: sourceOf(e) });

  // The person sees this line through the model: the note itself, so they know what landed (ALL-209)
  const said = String(rec.content).replace(/\s+/g, " ").trim(), shown = said.length > 240 ? said.slice(0, 237) + "..." : said;
  if (replacing.has(i)) lines.push(`${at(n)}replaced the approved ${replacing.get(i).role} of ${replacing.get(i).entity} (${replacing.get(i).label}, ${replacing.get(i).id}): every chat now uses the new file`);
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
  const missed = lib.candidateEntities(e.content, people, names);
  if (missed.length) lines.push(`${at(n)}words in this note not linked to anything in the brain: ${missed.map(x => `"${x}"`).join(", ")}. Decide what each is, by connect-dots.md: a person, company or product the note is about gets add_name with its kind (company and team are organization subtypes; ask only when it is not plain); a place, event, project or plain word gets nothing.`);
  // The last step outcome closes onboarding in the same commit: no separate marker to forget.
  const closed = /^Onboarding step [1-6][ :]/.test(rec.content) ? lib.closeOnboardingFromOutcomes(root, rec.authors) : null;
  const closedIn = closed && lib.readOnboarding(root).context;
  if (closed) lines.push(`${at(n)}all onboarding steps saved: recorded "${closed.content}" in ${closedIn} (${closed.id}); do not write another completion marker. Onboarding just finished in this chat: end this reply with the closing gtm-brain-start describes (what connected, what was learned, the first task).`);
  // one commit per memory: git history stays readable as one commit, one memory
  const closedPath = closed ? [`brain/contexts/${closedIn}/memories.jsonl`] : [];
  lines.push(`${at(n)}${lib.commit(root, [`brain/contexts/${ctx}/memories.jsonl`, ...closedPath, ...lib.ENTITIES_PATHS], `remember: ${ctx} ${rec.kind} by ${rec.authors.join(",")}`).note}`);
  kept.push({ n, id: rec.id, ctx });
}

/* what the brain cannot settle by itself, for one question with numbered parts */
/* the look-alike names, in one place, so only the entries that need an answer are re-sent */
const holdReport = () => { const loose = held.flatMap(h => h.unnamed || []), alike = held.flatMap(h => h.mentions.filter(m => !(h.unnamed || []).includes(m)));
  return `${batched ? `not kept (${held.length} of ${entries.length})` : "not remembered yet"}: ${held.map(h => `${at(h.n)}${h.why}`).join(batched ? "\n" : "; ")}. ${held.some(h => h.ask) ? `Ask the person once, everything in one question, ${askIn}.` : "No question needed: write the dates into the note."}${alike.length ? ` For ${alike.map(m => `"${m}"`).join(", ")} ("same as X?"): yes, add_name with that name and aliases [the spelling used here]; no, list it in new_names.` : ""}${loose.length ? ` For ${loose.map(m => `"${m}"`).join(", ")}: if the note or source plainly says it is a company, product or team, do not ask; send it in companies, or in new_names with add_name for its kind. A person: ask for the full name ("${loose[0]} who? The full name, so the brain knows them later") and remember again with that full name in people; only if the person insists on the one word, list it in new_names.` : ""} Then remember ${batched ? "the held-back entries" : "again"}. Never merge or create on a guess.`; };

if (!kept.length) { console.error(held.length ? holdReport() : lines.join("\n")); process.exit(2); }

if (batched) console.log(`kept ${kept.length} of ${entries.length}: ${kept.map(k => `${k.id} in ${k.ctx}`).join(", ")}${failed.length ? `; not kept: ${failed.map(f => "#" + f.n).join(", ")} (see below; call again with only those)` : ""}`);
for (const l of lines) console.log(l);
if (held.length) console.log(holdReport());
if (asks.length) console.log(`Ask the person once, ${askIn}, after quoting the note${held.some(h => h.ask) ? ", in the same question as the held entries" : ""}, one numbered part each: ${asks.map((a, k) => `${k + 1}) ${a}`).join(" ")}. Never more than this one question.`);

// once for the whole call, not once per memory
// The shared refresh path starts compilation for saved changes.
if (!process.env.GTM_BRAIN_NO_COMPILE) console.log("the summaries update by themselves after each saved change; do not compile in this chat and do not offer to.");
lib.rerender(root);

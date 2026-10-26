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
import { existsSync, readFileSync } from "node:fs";
import { prepareAsset, assetSummary } from '../../lib/assets.mjs';
import { join } from "node:path";
import { isChatSource } from "../../lib/host.mjs";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
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
// work/session.json (the session hook writes it with its host). A separate run (GTM_BRAIN_RUN: the
// background summary run, a dashboard job, a scheduled run) is nobody's conversation, so it attaches nothing.
const session = process.env.GTM_BRAIN_RUN ? null : lib.readSession(root, project);
const chat = session?.session_id || null, chatKind = session?.host || "codex";
const authors = list(opt.by).map(w => { const h = lib.teamHandle(root, w); if (!h) die(`"${w}" is not in admin.md team`); return h; });
if (!authors.length) die("need --by <person>");

// numbering only where it helps: one note reads exactly as it always did
const batched = entries.length > 1;
if (entries.some(e => e?.customer) && entries.some(e => e?.customer_coverage)) die("Record customer coverage in a separate call after checking which customer entries were kept or held.");
const kept = [], held = [], failed = [], lines = [];
const at = n => batched ? `#${n} ` : "";
// every entry is checked before the first one is written: a bad entry in the middle must not leave the ones before it kept and unreported
const ctxOf = e => e.context || opt.context || (loaded.length === 1 ? loaded[0] : null);
if (entries.some(e => e?.meeting_coverage) && entries.some(e => e?.meeting || e?.meeting_id)) die("Record meeting coverage in a separate call after checking kept, held and failed entries.");
const preparedAssets = new Map(), changedAssets = new Set();
const sourceOf = e => lib.parseSources(e.sources);
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
  const ctx = ctxOf(e);

  const companies = list(e.companies);
  let customerName;
  if (e.customer) {
    try { customerName = lib.customerIdentity(root, e.customer); }
    catch (err) { held.push({ n, why: err.message, mentions: [e.customer.entity] }); continue; }
  }
  const mapped = name => e.customer && name === e.customer.entity ? customerName : name;
  const mappedCompanies = companies.map(mapped);
  const { people, added, similar, inferred } = lib.normalisePeople(root, [...list(e.people).map(mapped), ...(e.meeting?.participants || []).map(p => p.name), ...mappedCompanies, ...(customerName ? [customerName] : []), ...(preparedAssets.has(i) ? [preparedAssets.get(i).entity] : [])], { confirmedNew: list(e.new_names).map(mapped), companies: mappedCompanies });
  if (similar.length) {
    held.push({ n, why: similar.map(s => `"${s.mention}" may be ${s.matches.map(x => `${x.name}${x.kind !== "person" ? ` (${x.kind})` : ""}`).join(" or ")}`).join("; "), mentions: similar.map(s => s.mention) });
    continue;
  }
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
      authors, via: e.via || opt.via || "codex", kind: e.kind || "note", tools: list(e.tools), people, content: e.content,
      source: withChat(lib.parseSources(e.sources)),
      actions: list(e.actions).map(a => { const [tool, action, ...ref] = a.split(":"); return ref.length ? { tool, action, ref: ref.join(":") } : { tool, action }; }),
      supersedes: e.supersedes || null, retracts: e.retracts || null, tags: [...new Set([...list(e.tags), ...(project ? [`project:${project}`] : [])])],
      ...(e.customer ? { customer: { ...e.customer, entity: customerName } } : {}),
      ...(e.customer_coverage ? { customer_coverage: e.customer_coverage } : {}),
    }));
  } catch (err) { failed.push({ n, why: err.message }); lines.push(`${at(n)}not remembered: ${err.message}`); continue; }
  if (alreadyRecorded) { kept.push({ n, id: rec.id, ctx }); lines.push(`${at(n)}already recorded ${rec.id} in ${ctx}`); continue; }
  if (e.customer?.reference) lib.addName(root, rec.customer.entity, { references: [e.customer.reference], sources: sourceOf(e) });

  // The person sees this line through the model: the note itself, so they know what landed (ALL-209)
  const said = String(rec.content).replace(/\s+/g, " ").trim(), shown = said.length > 240 ? said.slice(0, 237) + "..." : said;
  lines.push(`${at(n)}remembered ${rec.id} in ${ctx} · ${rec.kind} · ${rec.authors.join(", ")}${rec.people.length ? " · people: " + rec.people.join(", ") : ""} · "${shown}"`);
  if (rec.asset) lines.push(assetSummary(root, rec).trim());
  for (const w of warnings) lines.push(`${at(n)}warning: ${w}`);
  const names = lib.readNames(root);
  for (const a of added) {
    const kind = names.find(x => x.name === a)?.kind || "person";
    lines.push(`${at(n)}new ${kind} in entities/: ${a}.${kind === "person" ? " If it is not a person, set its kind with add_name (organization, product; company/team are organization subtypes)." : ""}`);
  }
  for (const inf of inferred) lines.push(`${at(n)}took "${inf.mention}" as ${inf.name} (first name of one known entity). If it is someone else, say so: remember again with new_names ["${inf.mention}"].`);
  const missed = lib.candidateEntities(e.content, people, names);
  if (missed.length) lines.push(`${at(n)}names in this note not yet registered as entities: ${missed.map(x => `"${x}"`).join(", ")}. For each that is a person, organization or product, call add_name with its kind now (company and team are organization subtypes; no need to ask when it is plain from the note); the note counts for it from then on. Skip the rest.`);
  // The last step outcome closes onboarding in the same commit: no separate marker to forget.
  const closed = /^Onboarding step [1-6][ :]/.test(rec.content) ? lib.closeOnboardingFromOutcomes(root, rec.authors) : null;
  const closedIn = closed && lib.readOnboarding(root).context;
  if (closed) lines.push(`${at(n)}all onboarding steps saved: recorded "${closed.content}" in ${closedIn} (${closed.id}); do not write another completion marker. Onboarding just finished in this chat: end this reply with the closing gtm-brain-start describes (what connected, what was learned, the first task).`);
  // one commit per memory: git history stays readable as one commit, one memory
  const closedPath = closed ? [`brain/contexts/${closedIn}/memories.jsonl`] : [];
  lines.push(`${at(n)}${lib.commit(root, [`brain/contexts/${ctx}/memories.jsonl`, ...closedPath, ...lib.ENTITIES_PATHS], `remember: ${ctx} ${rec.kind} by ${rec.authors.join(",")}`).note}`);
  kept.push({ n, id: rec.id, ctx });
}

/* the look-alike names, in one place, so only the entries that need an answer are re-sent */
const holdReport = () => `${batched ? `not kept (${held.length} of ${entries.length})` : "not remembered yet"}: ${held.map(h => `${at(h.n)}${h.why}`).join(batched ? "\n" : "; ")}. Ask the person in one line ("same as X?"). Yes: add_name with that name and aliases [the spelling used here], then remember ${batched ? "the held-back entries" : "again"}. No: remember again with new_names [${held.flatMap(h => h.mentions).map(m => `"${m}"`).join(", ")}]. Never merge on a guess.`;

if (!kept.length) { console.error(held.length ? holdReport() : lines.join("\n")); process.exit(2); }

if (batched) console.log(`kept ${kept.length} of ${entries.length}: ${kept.map(k => `${k.id} in ${k.ctx}`).join(", ")}${failed.length ? `; not kept: ${failed.map(f => "#" + f.n).join(", ")} (see below; call again with only those)` : ""}`);
for (const l of lines) console.log(l);
if (held.length) console.log(holdReport());

// once for the whole call, not once per memory
// The shared refresh path starts compilation for saved changes.
if (!process.env.GTM_BRAIN_NO_COMPILE) console.log("the summaries update by themselves after each saved change; do not compile in this chat and do not offer to.");
lib.rerender(root);

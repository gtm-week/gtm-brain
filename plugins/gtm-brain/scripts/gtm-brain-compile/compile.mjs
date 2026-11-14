#!/usr/bin/env node
import { assetSummary } from '../../lib/assets.mjs';
// compile: rewrite a context's cover from its memories. The script does the deterministic part;
// the model writes the summary and working guidance (see ../../skills/gtm-brain-use-brain/references/compile.md).
//   node compile.mjs <root> --stale                       which contexts need compiling (json)
//   node compile.mjs <root> --facts <slug>                everything the model needs to write the prose
//   node compile.mjs <root> --apply <slug> --by <handle> --as-of <id> --summary "<2-4 sentences, each ending [m_...]>" --now "<learned methods, or empty>"
//                                                         writes summary, now, people, tools, related,
//                                                         last_active, confidence, compiled_at; commits.
//                                                         --as-of is the key --facts printed: the memories the prose
//                                                         was written from. A memory that arrived in between makes
//                                                         --apply refuse, so a cover is never marked current by mistake.
//   node compile.mjs <root> --release <slug> --reviewed-cover <hash>
//                                                         from a chat, after the person reviewed a manually edited summary:
//                                                         back the edit up, adopt it as the baseline, queue the background compile.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as dots from "../../lib/dots.mjs";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
// Write all of stdout before exiting: console.log then process.exit cut a piped --facts at 64 KiB.
const finish = (text, code = 0) => new Promise(r => process.stdout.write(text + "\n", r)).then(() => process.exit(code));
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { const v = args[i + 1], hasValue = v !== undefined && !v.startsWith("--"); opt[args[i].slice(2)] = hasValue ? v : true; if (hasValue) i++; }

if (opt.release) {
  const slug = opt.release;
  if (!lib.readContext(root, slug)) { console.error(`no context ${slug}`); process.exit(1); }
  let result; try { result = lib.releaseManualCover(root, slug, opt["reviewed-cover"] || ""); } catch (e) { console.error(e.message); process.exit(5); }
  if (!result.released) await finish(`${slug}: ${result.note}`);
  lib.rerender(root);
  await finish(`${slug}: released; the manual edit is backed up under work/manual-edits/ and the next compile may replace the generated prose. Summaries update by themselves after the next saved change.`);
}
const count = (arrs) => { const m = new Map(); for (const a of arrs) for (const x of a) m.set(x, (m.get(x) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
function facts(slug) {
  const c = lib.readContext(root, slug); if (!c) { console.error(`no context ${slug}`); process.exit(1); }
  const mem = lib.effectiveMemories(c.memories);
  const reg = lib.readNames(root);   // names as the registry knows them now: "Chris" counts for Krzysztof Pawlak once the alias exists
  const people = count(mem.map(m => lib.mentionsIn(reg, m))), tools = count(mem.map(m => m.tools));
  // every name mentioned, with its kind from the registry: these go on the cover
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

if (opt.stale) {
  const cs = lib.activeContexts(root).filter(c => c.stale).map(c => ({ slug: c.slug, manualEdit: c.manualEdit.blocked ? c.manualEdit.status : null, memories: lib.effectiveMemories(c.memories).length, lastMemory: c.lastMemory, compiledAt: c.compiledAt }));
  await finish(JSON.stringify(cs, null, 1));
}
const FACTS_LINES = Number(process.env.GTM_BRAIN_FACTS_LINES) || 300, FACTS_BYTES = 48 * 1024;
const noteLines = m => `- ${m.id} · ${lib.memoryTimeText(m)} · ${m.authors.join(",")} · ${m.kind}${m.people.length ? " · " + m.people.join(", ") : ""}${m.tools.length ? " · tools: " + m.tools.join(", ") : ""}\n  ${m.content}${assetSummary(root, m)}${m.actions.length ? "\n  actions: " + m.actions.map(a => `${a.tool}: ${a.action}${a.ref ? " (" + a.ref + ")" : ""}`).join("; ") : ""}${m.source.length ? "\n  sources: " + m.source.map(s => `${s.kind}:${s.ref}`).join(", ") : ""}`;
if (opt.facts) {
  const f = facts(opt.facts); const rule = f.c.rule;
  const out = [`# ${f.c.title} (${f.c.slug})`, `compiled_at: ${lib.localDateTime(f.c.compiledAt) || "never"} (context refreshed)   memories: ${f.mem.length} effective   new since last compile: ${f.newSince.length}   confidence: ${f.confidence}`, `as_of: ${f.asOf}   (pass this to --apply --as-of)`,
    `\n## Manual edit status\n${f.c.manualEdit.blocked ? "PAUSED: manual edits need review in Codex. Preserve the edit as sourced memories or standing instructions before explicitly confirming replacement. Background and scheduled runs must skip this context. reviewed_cover: " + f.c.manualEdit.hash : "No manual generated-section edits detected."}`,
    `\n## Standing rule (never rewrite)\n${rule}`, `\n## Current summary\n${f.c.summary}`,
    `\n## Previous working guidance (revalidate against effective memories)\n${f.c.now || "none"}`,
    `\n## Compilation guidance\nKeep only reusable methods supported by effective memories in working guidance (the now argument). Cite the memory IDs for each method. Write the summary in 2-4 sentences, each ending with the ids of the notes it rests on in brackets ([m_...]), with absolute dates only (never next Tuesday or tomorrow). Put supported immediate actions, owners and dates in the summary; their source memories remain the follow-ups. Previous guidance may mix methods with next steps: reassess both against the evidence. Do not copy standing instructions or invent methods. Pass now as an empty string when no useful methods remain.`,
    `\n## Names mentioned (kind, mentions)\n${f.names.map(n => `${n.name} (${n.kind}, ${n.mentions})`).join(", ") || "none"}`, `\n## Tools used\n${f.tools.map(([t, n]) => `${t} (${n})`).join(", ") || "none"}`, `\n## Related contexts (share names)\n${f.related.join(", ") || "none"}`,
    `\n## Open questions in force (${f.questions.length})`, ...f.questions.map(m => `- ${m.id} · ${lib.memoryTimeText(m)} ${m.authors.join(",")}: ${m.content}`),
    `\n## Decisions in force (${f.decisions.length})`, ...f.decisions.map(m => `- ${m.id} · ${lib.memoryTimeText(m)} ${m.authors.join(",")}: ${m.content}`)];
  // A digest, not the whole context: the notes since the last compile, newest first, within a budget.
  // The current summary carries the older ones; the run looks them up with query (memories).
  const shown = [], fresh = [...f.newSince].reverse().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)); let lines = 0, bytes = 0;
  for (const m of fresh) {
    const t = noteLines(m), n = t.split("\n").length, b = Buffer.byteLength(t);
    if (shown.length && (lines + n > FACTS_LINES || bytes + b > FACTS_BYTES)) break;
    shown.push(t); lines += n; bytes += b;
  }
  // The notes the current summary and working guidance rest on stay in view, so both can be revalidated
  // without a lookup; a cited note that was superseded or withdrawn is named instead.
  const listed = new Set(fresh.slice(0, shown.length).map(m => m.id)), byId = new Map(f.mem.map(m => [m.id, m]));
  const citedIds = [...new Set([...[f.c.fm?.summary_sources || []].flat().map(String), ...String(f.c.summary || "").match(/\bm_[0-9a-z]+\b/g) || [], ...String(f.c.now || "").match(/\bm_[0-9a-z]+\b/g) || []])];
  const cited = citedIds.filter(id => byId.has(id) && !listed.has(id)).slice(0, 40), gone = citedIds.filter(id => !byId.has(id));
  // Room left in the budget goes to the other older notes, newest first, so a small context is shown whole.
  const newIds = new Set(f.newSince.map(m => m.id)), citedSet = new Set(cited); const older = [];
  for (const id of cited) { const t = noteLines(byId.get(id)); lines += t.split("\n").length; bytes += Buffer.byteLength(t); }
  if (shown.length === f.newSince.length) for (const m of [...f.mem].filter(m => !newIds.has(m.id) && !citedSet.has(m.id)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    const t = noteLines(m), n = t.split("\n").length, b = Buffer.byteLength(t);
    if (lines + n > FACTS_LINES || bytes + b > FACTS_BYTES) break;
    older.push(t); lines += n; bytes += b;
  }
  const hiddenNew = f.newSince.length - shown.length, carried = f.mem.filter(m => !newIds.has(m.id) && !citedSet.has(m.id)).length - older.length;
  out.push(`\n## Effective notes since the last compile, newest first (${shown.length} of ${f.newSince.length} new)`, ...shown);
  if (cited.length || gone.length) out.push(`\n## Older notes the current summary and working guidance cite (${cited.length} still in force)`, ...cited.map(id => noteLines(byId.get(id))), ...(gone.length ? [`No longer in force (superseded or withdrawn), do not rest on them: ${gone.join(", ")}`] : []));
  if (older.length) out.push(`\n## Other older notes the current summary carries, newest first (${older.length})`, ...older);
  const lookup = `query: object memories, filters.context=${f.c.slug} (add search or filters.entities=<id>)`;
  if (hiddenNew) out.push(`\n${hiddenNew} more note${hiddenNew === 1 ? "" : "s"} newer than compiled_at ${hiddenNew === 1 ? "is" : "are"} not shown and ${hiddenNew === 1 ? "is" : "are"} not in the current summary: read them with ${lookup} before writing.`);
  if (carried) out.push(`\n${carried} older note${carried === 1 ? " is" : "s are"} not shown; the current summary carries them. Look one up with ${lookup}.`);
  await finish(out.join("\n"));
}
if (opt.apply) {
  const slug = opt.apply;
  if (typeof slug !== "string" || !slug.trim() || ["summary", "by", "as-of"].some(k => typeof opt[k] !== "string" || !opt[k].trim()) || typeof opt.now !== "string") {
    console.error('--apply needs --by, --as-of <id from --facts>, --summary and --now (use --now "" when there are no learned methods)'); process.exit(1);
  }
  if (/[\u2013\u2014\u2015\u2212]/.test(opt.summary + opt.now)) { console.error("long dash in text; use a plain hyphen"); process.exit(1); }
  const by = lib.teamHandle(root, opt.by) || ((opt.by === "schedule" || opt.by === "background") ? opt.by : null); if (!by) { console.error(`--by "${opt.by}" is not a team member`); process.exit(1); }
  const f = facts(slug); const c = f.c;
  if (opt["as-of"] !== f.asOf) { console.error(`not applied: ${slug} changed since --facts (as_of ${opt["as-of"]}, now ${f.asOf}: memories or context Markdown changed; ${f.mem.length} in force now). Run --facts again and rewrite the summary.`); process.exit(4); }
  if (c.manualEdit.blocked && (opt["reviewed-cover"] !== c.manualEdit.hash || ["background", "schedule"].includes(by) || process.env.GTM_BRAIN_RUN)) {
    console.error("not applied: manual edits need review in Codex; preserve the changes and confirm replacement first"); process.exit(5);
  }
  if (["invalid", "missing"].includes(c.manualEdit.status)) { console.error("not applied: fix the invalid Markdown before compiling"); process.exit(5); }
  // The summary is read as current truth: 2-4 sentences, each with the note ids it rests on, absolute
  // dates only ("Max will run the demo next Tuesday" was wrong a week later; new-brain, 2026-11-12)
  // checked where a model writes it (the compile_apply tool passes --checked); a person at a terminal is not held
  const checked = opt.checked ? dots.summaryCheck(opt.summary, f.mem.map(m => m.id)) : { text: opt.summary.trim(), sources: [], problems: [] };
  if (checked.problems.length) { console.error(`not applied: ${checked.problems.join("; ")}. Rewrite the summary and apply again with the same as_of.`); process.exit(6); }
  const rule = c.rule;
  const now = new Date().toISOString();
  // tools: what the cover already names (seeded at setup) plus what the memories used
  const tools = lib.mergeTools(c.tools, f.tools.map(([t]) => t));
  const prior = { ...c.fm }; delete prior.summary_sources;   // sources belong to the summary they were checked with
  const fm = { ...prior, summary: checked.text, ...(checked.sources.length ? { summary_sources: checked.sources } : {}), names: f.names.map(n => ({ name: n.name, kind: n.kind })), people: f.names.filter(n => n.kind === "person").map(n => n.name), tools, related: f.related, last_active: c.lastMemory, confidence: f.confidence, compiled_at: now, compiled_by: `compile@${by}` };
  lib.writeContext(root, slug, { ...fm, rule, now: opt.now }, { expectedCover: c.manualEdit.hash, reviewedCover: opt["reviewed-cover"] });
  const committed = lib.commit(root, [c.path], `compile: ${slug} (${f.mem.length} memories, by ${by})`).note;
  lib.rerender(root); await finish(`compiled ${slug}: ${f.mem.length} memories, people ${fm.people.length}, names ${fm.names.length}, tools ${fm.tools.length}, related ${fm.related.join(", ") || "none"}, confidence ${f.confidence} · ${committed}`);
}
console.error("usage: --stale | --facts <slug> | --apply <slug> --by <handle> --as-of <id from --facts> --summary ... --now ..."); process.exit(1);

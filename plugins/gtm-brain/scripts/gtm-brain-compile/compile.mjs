#!/usr/bin/env node
import { assetSummary } from '../../lib/assets.mjs';
// compile: rewrite a context's cover from its memories. The script does the deterministic part;
// the model writes the summary and working guidance (see ../../skills/gtm-brain-use-brain/references/compile.md).
//   node compile.mjs <root> --stale                       which contexts need compiling (json)
//   node compile.mjs <root> --facts <slug>                everything the model needs to write the prose
//   node compile.mjs <root> --apply <slug> --by <handle> --as-of <id> --summary "<3-6 sentences>" --now "<learned methods, or empty>"
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
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { const v = args[i + 1], hasValue = v !== undefined && !v.startsWith("--"); opt[args[i].slice(2)] = hasValue ? v : true; if (hasValue) i++; }

if (opt.release) {
  const slug = opt.release;
  if (!lib.readContext(root, slug)) { console.error(`no context ${slug}`); process.exit(1); }
  let result; try { result = lib.releaseManualCover(root, slug, opt["reviewed-cover"] || ""); } catch (e) { console.error(e.message); process.exit(5); }
  if (!result.released) { console.log(`${slug}: ${result.note}`); process.exit(0); }
  lib.rerender(root);
  console.log(`${slug}: released; the manual edit is backed up under work/manual-edits/ and the next compile may replace the generated prose. Summaries update by themselves after the next saved change.`);
  process.exit(0);
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
  console.log(JSON.stringify(cs, null, 1)); process.exit(0);
}
if (opt.facts) {
  const f = facts(opt.facts); const rule = f.c.rule;
  const out = [`# ${f.c.title} (${f.c.slug})`, `compiled_at: ${lib.localDateTime(f.c.compiledAt) || "never"} (context refreshed)   memories: ${f.mem.length} effective   new since last compile: ${f.newSince.length}   confidence: ${f.confidence}`, `as_of: ${f.asOf}   (pass this to --apply --as-of)`,
    `\n## Manual edit status\n${f.c.manualEdit.blocked ? "PAUSED: manual edits need review in Codex. Preserve the edit as sourced memories or standing instructions before explicitly confirming replacement. Background and scheduled runs must skip this context. reviewed_cover: " + f.c.manualEdit.hash : "No manual generated-section edits detected."}`,
    `\n## Standing rule (never rewrite)\n${rule}`, `\n## Current summary\n${f.c.summary}`,
    `\n## Previous working guidance (revalidate against effective memories)\n${f.c.now || "none"}`,
    `\n## Compilation guidance\nKeep only reusable methods supported by effective memories in working guidance (the now argument). Cite the memory IDs for each method. Put supported immediate actions, owners and dates in the summary; their source memories remain the follow-ups. Previous guidance may mix methods with next steps: reassess both against the evidence. Do not copy standing instructions or invent methods. Pass now as an empty string when no useful methods remain.`,
    `\n## Names mentioned (kind, mentions)\n${f.names.map(n => `${n.name} (${n.kind}, ${n.mentions})`).join(", ") || "none"}`, `\n## Tools used\n${f.tools.map(([t, n]) => `${t} (${n})`).join(", ") || "none"}`, `\n## Related contexts (share names)\n${f.related.join(", ") || "none"}`,
    `\n## Open questions (${f.questions.length})`, ...f.questions.map(m => `- ${lib.memoryTimeText(m)} ${m.authors.join(",")}: ${m.content}`),
    `\n## Decisions (${f.decisions.length})`, ...f.decisions.map(m => `- ${lib.memoryTimeText(m)} ${m.authors.join(",")}: ${m.content}`),
    `\n## All effective memories, recording order (oldest first)`, ...f.mem.map(m => `- ${m.id} · ${lib.memoryTimeText(m)} · ${m.authors.join(",")} · ${m.kind}${m.people.length ? " · " + m.people.join(", ") : ""}${m.tools.length ? " · tools: " + m.tools.join(", ") : ""}\n  ${m.content}${assetSummary(root, m)}${m.actions.length ? "\n  actions: " + m.actions.map(a => `${a.tool}: ${a.action}${a.ref ? " (" + a.ref + ")" : ""}`).join("; ") : ""}${m.source.length ? "\n  sources: " + m.source.map(s => `${s.kind}:${s.ref}`).join(", ") : ""}`)];
  console.log(out.join("\n")); process.exit(0);
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
  const rule = c.rule;
  const now = new Date().toISOString();
  // tools: what the cover already names (seeded at setup) plus what the memories used
  const tools = lib.mergeTools(c.tools, f.tools.map(([t]) => t));
  const fm = { ...c.fm, summary: opt.summary.trim(), names: f.names.map(n => ({ name: n.name, kind: n.kind })), people: f.names.filter(n => n.kind === "person").map(n => n.name), tools, related: f.related, last_active: c.lastMemory, confidence: f.confidence, compiled_at: now, compiled_by: `compile@${by}` };
  lib.writeContext(root, slug, { ...fm, rule, now: opt.now }, { expectedCover: c.manualEdit.hash, reviewedCover: opt["reviewed-cover"] });
  const committed = lib.commit(root, [c.path], `compile: ${slug} (${f.mem.length} memories, by ${by})`).note;
  console.log(`compiled ${slug}: ${f.mem.length} memories, people ${fm.people.length}, names ${fm.names.length}, tools ${fm.tools.length}, related ${fm.related.join(", ") || "none"}, confidence ${f.confidence} · ${committed}`); lib.rerender(root); process.exit(0);
}
console.error("usage: --stale | --facts <slug> | --apply <slug> --by <handle> --as-of <id from --facts> --summary ... --now ..."); process.exit(1);

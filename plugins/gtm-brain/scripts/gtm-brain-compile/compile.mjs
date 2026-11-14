#!/usr/bin/env node
// compile: rewrite a context's cover from its memories. The script does the deterministic part;
// the model writes the summary and working guidance (see ../../skills/gtm-brain-use-brain/references/compile.md).
// Since 0.35.0 a summary is written on demand, in the chat that asks (load_context prints the digest and as_of
// when the cached summary is older than the newest note); no background run starts after a save.
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
//                                                         back the edit up, adopt it as the baseline; the next ask rewrites it.
import * as dots from "../../lib/dots.mjs";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const summaries = await import(new URL("../../lib/summaries.mjs", import.meta.url));
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
  await finish(`${slug}: released; the manual edit is backed up under work/manual-edits/ and the next summary written may replace the generated prose. It is rewritten the next time someone asks about this topic (load_context).`);
}
function facts(slug) {
  const f = summaries.contextFacts(root, slug); if (!f) { console.error(`no context ${slug}`); process.exit(1); }
  return f;
}
// A failure in the person's words, said once, and recorded for the health line (work/runs.jsonl).
// Only the model's path (--checked, the compile_apply tool) records: a person at a terminal reads the error itself.
async function refuse(slug, message, code) {
  if (opt.checked) {
    const title = lib.readContext(root, slug)?.title || slug, why = summaries.explainFailure(message, title);
    summaries.recordSummaryRun(root, { context: slug, by: opt.by, ok: false, error: `${why.what} (${message.split("\n")[0].slice(0, 160)})` });
    message += `\nFor the person, once, if this attempt is the last: The ${title} summary was not saved: ${why.what}. What to do: ${why.todo}.`;
  }
  console.error(message); process.exit(code);
}

if (opt.stale) {
  const cs = lib.activeContexts(root).filter(c => c.stale).map(c => ({ slug: c.slug, manualEdit: c.manualEdit.blocked ? c.manualEdit.status : null, memories: lib.effectiveMemories(c.memories).length, lastMemory: c.lastMemory, compiledAt: c.compiledAt }));
  await finish(JSON.stringify(cs, null, 1));
}
const FACTS_LINES = Number(process.env.GTM_BRAIN_FACTS_LINES) || 300, FACTS_BYTES = 48 * 1024;
if (opt.facts) {
  const f = facts(opt.facts); const rule = f.c.rule;
  const out = [`# ${f.c.title} (${f.c.slug})`, `compiled_at: ${lib.localDateTime(f.c.compiledAt) || "never"} (context refreshed)   memories: ${f.mem.length} effective   new since last compile: ${f.newSince.length}   confidence: ${f.confidence}`, `as_of: ${f.asOf}   (pass this to --apply --as-of)`,
    `\n## Manual edit status\n${f.c.manualEdit.blocked ? "PAUSED: manual edits need review in Codex. Preserve the edit as sourced memories or standing instructions before explicitly confirming replacement. Background and scheduled runs must skip this context. reviewed_cover: " + f.c.manualEdit.hash : "No manual generated-section edits detected."}`,
    `\n## Standing rule (never rewrite)\n${rule}`, `\n## Current summary\n${f.c.summary}`,
    `\n## Previous working guidance (revalidate against effective memories)\n${f.c.now || "none"}`,
    `\n## Compilation guidance\n${summaries.COMPILATION_GUIDANCE}`,
    `\n## Names mentioned (kind, mentions)\n${f.names.map(n => `${n.name} (${n.kind}, ${n.mentions})`).join(", ") || "none"}`, `\n## Tools used\n${f.tools.map(([t, n]) => `${t} (${n})`).join(", ") || "none"}`, `\n## Related contexts (share names)\n${f.related.join(", ") || "none"}`,
    `\n## Open questions in force (${f.questions.length})`, ...f.questions.map(m => `- ${m.id} · ${lib.memoryTimeText(m)} ${m.authors.join(",")}: ${m.content}`),
    `\n## Decisions in force (${f.decisions.length})`, ...f.decisions.map(m => `- ${m.id} · ${lib.memoryTimeText(m)} ${m.authors.join(",")}: ${m.content}`)];
  // A digest, not the whole context: the notes since the last compile, newest first, within a budget.
  // The current summary carries the older ones; the run looks them up with query (memories).
  out.push(summaries.summaryDigest(root, f, { lines: FACTS_LINES, bytes: FACTS_BYTES }).text);
  await finish(out.join("\n"));
}
if (opt.apply) {
  const slug = opt.apply;
  if (typeof slug !== "string" || !slug.trim() || ["summary", "by", "as-of"].some(k => typeof opt[k] !== "string" || !opt[k].trim()) || typeof opt.now !== "string") {
    await refuse(slug || "?", '--apply needs --by, --as-of <id from --facts>, --summary and --now (use --now "" when there are no learned methods)', 1);
  }
  if (/[\u2013\u2014\u2015\u2212]/.test(opt.summary + opt.now)) await refuse(slug, "not applied: long dash in text; use a plain hyphen and apply again with the same as_of", 1);
  const by = lib.teamHandle(root, opt.by) || ((opt.by === "schedule" || opt.by === "background") ? opt.by : null); if (!by) await refuse(slug, `not applied: --by "${opt.by}" is not a team member; pass the person's handle`, 1);
  const f = facts(slug); const c = f.c;
  if (opt["as-of"] !== f.asOf) await refuse(slug, `not applied: ${slug} changed since --facts (as_of ${opt["as-of"]}, now ${f.asOf}: memories or context Markdown changed; ${f.mem.length} in force now). Read it again (compile_facts, or load_context) and rewrite the summary.`, 4);
  if (c.manualEdit.blocked && (opt["reviewed-cover"] !== c.manualEdit.hash || ["background", "schedule"].includes(by) || process.env.GTM_BRAIN_RUN)) {
    await refuse(slug, "not applied: manual edits need review in Codex; preserve the changes and confirm replacement first", 5);
  }
  if (["invalid", "missing"].includes(c.manualEdit.status)) await refuse(slug, "not applied: fix the invalid Markdown before compiling", 5);
  // The summary is read as current truth: 2-4 sentences, each with the note ids it rests on, absolute
  // dates only ("Max will run the demo next Tuesday" was wrong a week later; new-brain, 2026-11-12)
  // checked where a model writes it (the compile_apply tool passes --checked); a person at a terminal is not held
  const checked = opt.checked ? dots.summaryCheck(opt.summary, f.mem.map(m => m.id)) : { text: opt.summary.trim(), sources: [], problems: [] };
  if (checked.problems.length) await refuse(slug, `not applied: ${checked.problems.join("; ")}. Rewrite the summary and apply again with the same as_of.`, 6);
  const rule = c.rule;
  const now = new Date().toISOString();
  // tools: what the cover already names (seeded at setup) plus what the memories used
  const tools = lib.mergeTools(c.tools, f.tools.map(([t]) => t));
  const prior = { ...c.fm }; delete prior.summary_sources;   // sources belong to the summary they were checked with
  const fm = { ...prior, summary: checked.text, ...(checked.sources.length ? { summary_sources: checked.sources } : {}), names: f.names.map(n => ({ name: n.name, kind: n.kind })), people: f.names.filter(n => n.kind === "person").map(n => n.name), tools, related: f.related, last_active: c.lastMemory, confidence: f.confidence, compiled_at: now, compiled_by: `compile@${by}` };
  try { lib.writeContext(root, slug, { ...fm, rule, now: opt.now }, { expectedCover: c.manualEdit.hash, reviewedCover: opt["reviewed-cover"] }); }
  catch (e) { await refuse(slug, `not applied: the summary could not be written: ${e.message}`, 7); }
  const committed = lib.commit(root, [c.path], `compile: ${slug} (${f.mem.length} memories, by ${by})`).note;
  // every write counts as the last good one (a hand or scheduled write clears an older failure); failures are recorded only on the model path
  summaries.recordSummaryRun(root, { context: slug, by, ok: true, foreground: !!opt.checked });
  lib.rerender(root); await finish(`compiled ${slug}: ${f.mem.length} memories, people ${fm.people.length}, names ${fm.names.length}, tools ${fm.tools.length}, related ${fm.related.join(", ") || "none"}, confidence ${f.confidence} · ${committed}`);
}
console.error("usage: --stale | --facts <slug> | --apply <slug> --by <handle> --as-of <id from --facts> --summary ... --now ..."); process.exit(1);

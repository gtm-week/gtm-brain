#!/usr/bin/env node
// Load one or more contexts into the conversation: cover + last N effective memories.
// Adds to the loaded set (work/loaded-contexts.json) so remember and the hook know; --only
// replaces the set with what you name ("instead"), --clear empties it. AGENTS.md rule 1.
//   node load.mjs <root> <slug> [<slug>...] [--last 15] [--only]      node load.mjs <root> --clear
//   --last 0: cover and what is new only, no memories list (the session hook, so a chat opens light)
//   node load.mjs <root> --drop <slug> [<slug>...]                     unload these, keep the rest
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const args = process.argv.slice(2); const root = args.shift() || ".";
// --project <slug>: this chat runs in a linked folder; its loaded set is its own (lib.readLoaded(root, project))
let project = null; { const pi = args.indexOf("--project"); if (pi >= 0) { project = args[pi + 1] || ""; args.splice(pi, 2); const known = lib.readProjects(root).map(p => p.slug); if (!known.includes(project)) { console.error(`no project ${project}; projects: ${known.join(", ") || "none"}`); process.exit(2); } } }
let last = 15; const li = args.indexOf("--last"); if (li >= 0) { const v = Number(args[li + 1]); last = Number.isInteger(v) && v >= 0 ? v : 15; args.splice(li, 2); }
const only = args.includes("--only"); if (only) args.splice(args.indexOf("--only"), 1);
if (args.includes("--clear")) { lib.writeLoaded(root, [], project); console.log(`loaded contexts cleared${project ? ` (project ${project})` : ""}`); lib.rerender(root); process.exit(0); }
if (args[0] === "--drop") {
  const drop = args.slice(1); const kept = lib.readLoaded(root, project).filter(s => !drop.includes(s)); lib.writeLoaded(root, kept, project);
  console.log(`unloaded ${drop.join(", ") || "nothing"}. Loaded now: admin + ${kept.join(", ") || "none"}${project ? ` (project ${project})` : ""}.`); lib.rerender(root); process.exit(0);
}
if (!args.length) { console.error("usage: load.mjs <root> <slug>... [--only] | --clear"); process.exit(1); }
const out = [], loaded = only ? [] : lib.readLoaded(root, project).filter(s => lib.readContext(root, s));
for (const slug of args) {
  const c = lib.readContext(root, slug);
  if (!c) { out.push(`(no context named "${slug}"; run contexts to see the list)`); continue; }
  if (c.status !== "active") { out.push(`(${slug} is archived; say "unarchive ${slug}" to work in it again)`); continue; }
  if (!loaded.includes(slug)) loaded.push(slug);
  const eff = lib.effectiveMemories(c.memories); const mem = last ? eff.slice(-last) : [];
  const fresh = c.compiledAt ? eff.filter(m => lib.newer(m.at, c.compiledAt)) : eff;
  out.push(`# Context loaded: ${c.title} (${c.slug})${c.stale ? `   [summary updating shortly: ${fresh.length} new since it was written]` : "   [summary up to date]"}`);
  if (c.stale) { out.push(`\n## New since the last compile (${fresh.length}), not yet in the summary`); for (const m of fresh.slice(-6)) out.push(`- ${lib.memoryTimeText(m)} · ${m.kind} · ${m.content}`); if (fresh.length > 6) out.push(`- ... and ${fresh.length - 6} more`); }
  out.push(`Context refreshed: ${lib.localDateTime(c.compiledAt) || "never"}`);
  out.push(`Summary: ${c.summary}`);
  if (c.people.length) out.push(`People mentioned: ${c.people.join(", ")}`);
  if (c.tools.length) out.push(`Tools used: ${c.tools.join(", ")}`);
  if (c.related.length) out.push(`Related contexts: ${c.related.join(", ")}`);
  out.push(`\n## When loaded\n${c.whenLoaded}`);
  if (!last) { out.push(`\n${eff.length} memories; call load_context or recall for them.`); out.push(""); continue; }
  out.push(`\n## Last ${mem.length} of ${lib.effectiveMemories(c.memories).length} memories`);
  for (const m of mem) out.push(`- ${lib.memoryTimeText(m)} · ${m.authors.join(", ")} · ${m.kind}${m.tools.length ? " · tools: " + m.tools.join(", ") : ""}${m.people.length ? " · people: " + m.people.join(", ") : ""}\n  ${m.content}${m.actions.length ? "\n  actions: " + m.actions.map(a => `${a.tool}: ${a.action}${a.ref ? " (" + a.ref + ")" : ""}`).join("; ") : ""}${m.source.length ? "\n  source: " + lib.sourceText(m.source) : ""}`);
  out.push("");
}
lib.writeLoaded(root, loaded, project);
out.push(`Loaded now: admin + ${loaded.join(", ") || "none"}${project ? ` (project ${project})` : ""}. Record outcomes with remember into one of these.${loaded.length > 1 ? " To work in one only: load <slug> --only." : ""}`);
console.log(out.join("\n"));
lib.rerender(root);

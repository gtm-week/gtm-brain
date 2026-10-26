#!/usr/bin/env node
// List the contexts, or create one.
//   node contexts.mjs <root>                      list: slug, memories, stale, summary
//   node contexts.mjs <root> --json
//   node contexts.mjs <root> --new <slug> "<Title>" ["<one rule for When loaded>"]
//   node contexts.mjs <root> --archive <slug> | --unarchive <slug>   (status on the cover; archived is unloaded, not offered)
//   node contexts.mjs <root> --edit <slug> [--title "..."] [--rule "..."]   the cover's title and standing rule; summary and working guidance kept
import { existsSync } from "node:fs";
import { join } from "node:path";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
if (!existsSync(join(root, "brain", "admin.md"))) { console.error("no brain here (brain/admin.md missing). Run setup."); process.exit(1); }
// --project <slug>: this chat runs in a linked folder; its loaded set is its own (lib.readLoaded(root, project))
let project = null; { const pi = args.indexOf("--project"); if (pi >= 0) { project = args[pi + 1] || ""; args.splice(pi, 2); const known = lib.readProjects(root).map(p => p.slug); if (!known.includes(project)) { console.error(`no project ${project}; projects: ${known.join(", ") || "none"}`); process.exit(2); } } }

if (args[0] === "--new") {
  const slug = (args[1] || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); const title = args[2] || slug; const rule = args[3] || "";
  if (!slug) { console.error('usage: --new <slug> "<Title>" ["<rule>"]'); process.exit(1); }
  const dir = join(root, "brain", "contexts", slug); if (existsSync(dir)) { console.error(`context exists: ${slug}`); process.exit(1); }
  lib.writeContext(root, slug, { title, rule });
  // A new context is loaded right away: you created it because you are about to work in it.
  const loaded = lib.readLoaded(root, project); if (!loaded.includes(slug)) loaded.push(slug); lib.writeLoaded(root, loaded, project);
  console.log(`created context ${slug}  ·  brain/contexts/${slug}/context.md · ${lib.commit(root, [dir], `context: new ${slug}`).note}\nloaded now: admin + ${loaded.join(", ")}${project ? ` (project ${project})` : ""}`); lib.rerender(root); process.exit(0);
}

if (args[0] === "--edit") {
  const slug = args[1] || ""; const c = lib.readContext(root, slug); if (!c) { console.error(`no context ${slug || "(none given)"}`); process.exit(1); }
  const opt = {}; for (let i = 2; i < args.length; i++) if (args[i].startsWith("--")) { opt[args[i].slice(2)] = args[i + 1]; i++; }
  const unknown = Object.keys(opt).filter(k => !["title", "rule"].includes(k));
  if (unknown.length) { console.error(`unknown context fields: ${unknown.join(", ")}; use --title or --rule (including boundaries)`); process.exit(1); }
  const changes = ["title", "rule"].filter(k => opt[k] !== undefined && String(opt[k]).trim());
  if (!changes.length) { console.error("nothing to change: give --title or --rule"); process.exit(1); }
  for (const k of changes) if (/[\u2013\u2014\u2015\u2212]/.test(opt[k])) { console.error(`${k} contains a long dash; use a plain hyphen`); process.exit(1); }
  const fm = { ...c.fm }; delete fm.title; delete fm.slug;
  lib.writeContext(root, slug, { ...fm, title: opt.title ? opt.title.trim() : c.title, rule: opt.rule ? opt.rule.trim() : c.rule, now: c.now });
  console.log(`edited ${slug}: ${changes.join(", ")} · brain/contexts/${slug}/context.md · ${lib.commit(root, [c.path], `context: edit ${slug} (${changes.join(", ")})`).note}`);
  lib.rerender(root); process.exit(0);
}

if (args[0] === "--archive" || args[0] === "--unarchive") {
  const slug = args[1] || "", status = args[0] === "--archive" ? "archived" : "active";
  const c = lib.readContext(root, slug); if (!c) { console.error(`no context ${slug || "(none given)"}`); process.exit(1); }
  if (c.status === status) { console.log(`${slug} is already ${status}`); process.exit(0); }
  lib.setContextStatus(root, slug, status);
  if (status === "archived") lib.unloadEverywhere(root, slug); const loaded = lib.readLoaded(root, project);
  console.log(`${slug} ${status}${status === "archived" ? " (unloaded; its memories stay searchable)" : " again"} · ${lib.commit(root, [c.path], `context: ${status} ${slug}`).note}\nloaded now: admin + ${loaded.join(", ") || "none"}`);
  lib.rerender(root); process.exit(0);
}

if (args[0] === "--fork") {
  // --fork <from> <new-slug> "<Title>" [--filter <keyword>]  copies the rule and the memories
  // that match the filter (content or people, case-insensitive), as new records tagged forked:<from>
  // with source memory:<origin id>. Readers across contexts count origin and copy once (lib.hideForkCopies).
  const from = args[1], slug = (args[2] || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), title = args[3] || slug;
  const fi = args.indexOf("--filter"); const filter = fi >= 0 ? (args[fi + 1] || "").toLowerCase() : "";
  const src = lib.readContext(root, from); if (!src) { console.error(`no context ${from}`); process.exit(1); }
  if (!slug) { console.error('usage: --fork <from> <new-slug> "<Title>" [--filter <keyword>]'); process.exit(1); }
  const dir = join(root, "brain", "contexts", slug); if (existsSync(dir)) { console.error(`context exists: ${slug}`); process.exit(1); }
  const rule = src.rule + `\n\nThis context was forked from ${from}${filter ? ` for everything about "${filter}"` : ""}; it now has its own memories and summary.`;
  lib.writeContext(root, slug, { title, forked_from: from, summary: `Forked from ${from}${filter ? ` for "${filter}"` : ""}. Not compiled yet.`, tools: src.tools, related: [from], rule });
  const picked = lib.effectiveMemories(src.memories).filter(m => !filter || (m.content + " " + m.people.join(" ")).toLowerCase().includes(filter));
  for (const m of picked) lib.appendMemory(root, slug, { ...lib.meetingMetadata(m), authors: m.authors, via: m.via, kind: m.kind, tools: m.tools, people: m.people, content: m.content, asset: m.asset, source: [...m.source, { kind: "memory", ref: m.id }], actions: m.actions, tags: [...m.tags, `forked:${from}`], at: m.at, ...(m.customer ? { customer: m.customer } : {}), ...(m.customer_coverage ? { customer_coverage: m.customer_coverage } : {}) });
  const loaded = lib.readLoaded(root, project); if (!loaded.includes(slug)) loaded.push(slug); lib.writeLoaded(root, loaded, project);
  console.log(`forked ${from} -> ${slug}: ${picked.length} of ${lib.effectiveMemories(src.memories).length} memories copied${filter ? ` (matching "${filter}")` : ""} · brain/contexts/${slug}/context.md · ${lib.commit(root, [dir], `context: fork ${from} -> ${slug}`).note}\nloaded now: admin + ${loaded.join(", ")}${project ? ` (project ${project})` : ""}`); lib.rerender(root); process.exit(0);
}

const cs = lib.listContexts(root);
if (args.includes("--json")) { console.log(JSON.stringify(cs.map(c => ({ slug: c.slug, title: c.title, rule: c.rule, status: c.status, summary: c.summary, memories: lib.effectiveMemories(c.memories).length, stored: c.memories.length, lastMemory: c.lastMemory, compiledAt: c.compiledAt, stale: c.stale, people: c.people, tools: c.tools, related: c.related })), null, 1)); process.exit(0); }
// Same words as the dashboard: "summary up to date" / "summary updating (shortly)", "loaded in this chat". Never "behind".
console.log("admin: brain/admin.md (always loaded)");
const loadedNow = lib.readLoaded(root, project); const busy = lib.compileBusy(root);
// --brief-loaded: the session hook prints each loaded context in full right after this list, so its
// summary excerpt and standing rule are left out here instead of reaching the chat twice.
const briefLoaded = args.includes("--brief-loaded");
for (const c of cs.filter(c => c.status === "active")) {
  const eff = lib.effectiveMemories(c.memories); const fresh = c.compiledAt ? eff.filter(m => lib.newer(m.at, c.compiledAt)).length : eff.length;
  const state = !eff.length ? "nothing recorded yet" : c.stale ? (busy ? `summary updating (${fresh} new, in the background)` : `summary updating shortly (${fresh} new)`) : "summary up to date";
  console.log(`• ${c.title} (${c.slug}) · ${eff.length} memories · ${state}${loadedNow.includes(c.slug) ? (project ? " · loaded in this project" : " · loaded in this chat") : ""}${eff.length && !c.stale && !(briefLoaded && loadedNow.includes(c.slug)) ? `  ${c.summary.slice(0, 80)}` : ""}`);
  if (c.rule && !(briefLoaded && loadedNow.includes(c.slug))) console.log(`  ${c.rule}`);
}
const archived = cs.filter(c => c.status !== "active");
if (archived.length) console.log(`archived (searchable, not offered): ${archived.map(c => `${c.slug} (${lib.effectiveMemories(c.memories).length} memories)`).join(", ")}`);

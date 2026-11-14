#!/usr/bin/env node
// recall: search memories across contexts or read a permanent entity brief.
//   node recall.mjs <root> "<query>"                 keyword search (persistent FTS5 cache under work/)
//   node recall.mjs <root> --person "<name>"         read a permanent entity brief (no writes)
// Names in the query are expanded through the entity registry ("Chris" also finds "Krzysztof Pawlak").
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { assetSummary, assetRows } from "../../lib/assets.mjs";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
if (!existsSync(join(root, "brain", "admin.md"))) { console.error("no brain here"); process.exit(1); }
// --project <slug>: this chat runs in a linked folder; recall sees the whole brain; this project's hits come first
let project = null; { const pi = args.indexOf("--project"); if (pi >= 0) { project = args[pi + 1] || ""; args.splice(pi, 2); const known = lib.readProjects(root).map(p => p.slug); if (!known.includes(project)) { console.error(`no project ${project}; projects: ${known.join(", ") || "none"}`); process.exit(2); } } }
if (args[0] !== "--person" && args[0] !== "--entity") {
  try {
    const { keywordRecall } = await import("../../lib/keyword-recall.mjs");
    const output = keywordRecall(root, args.join(" "), project);
    await new Promise(done => process.stdout.write(output + "\n", done));
  } catch (error) {
    await new Promise(done => process.stderr.write(error.message + "\n", done));
    process.exit(1);
  }
  process.exit(0);
}
const contexts = lib.listContexts(root);
let names;
try { names = lib.readNames(root); } catch (error) { console.error(error.message); process.exit(1); }
const conflicts = assetRows(root, contexts).filter(a => a.ambiguous);
if (conflicts.length) console.log(`Attachments needing a choice: ${[...new Set(conflicts.map(a => `${a.entity}: ${a.role}`))].join(', ')}. Ask which approved file to use.`);

/* ---------- entity brief: person remains a compatible spelling ---------- */
if (args[0] === "--person" || args[0] === "--entity") {
  const who = args[1], scoped = args.indexOf("--context"), context = scoped >= 0 ? args[scoped + 1] : undefined;
  try {
    const view = lib.entityBrief(root, who, { context, absoluteLinks: true });
    const count = view.evidence.filter(m => !context || m.context === context).length;
    console.log(view.entity.name + (context ? " in " + context : "") + ": " + count + " memories · " + (view.path ? resolve(root, view.path) : "identity has not been migrated yet"));
    // a byte budget on what reaches the chat: one brief reached 4 MB on a big brain
    const BUDGET = Number(process.env.GTM_BRAIN_BRIEF_BYTES) || 64 * 1024;
    let text = view.markdown;
    const attachments = view.evidence.filter(m => m.asset && (!context || m.context === context));
    if (attachments.length) text += "\n\n## Attachments\n" + attachments.map(m => assetSummary(root, m)).join("\n");
    if (Buffer.byteLength(text) > BUDGET) {
      const lines = text.split("\n"), kept = []; let bytes = 0;
      for (const l of lines) { const b = Buffer.byteLength(l) + 1; if (bytes + b > BUDGET) break; kept.push(l); bytes += b; }
      text = kept.join("\n") + `\n\nBrief cut at ${Math.round(BUDGET / 1024)} KB; ${lines.length - kept.length} more lines: query memories with filters.entities=${view.entity.id}${context ? ` and filters.context=${context}` : ""}.`;
    }
    console.log(text);
  } catch (e) { console.error(e.message); process.exit(1); }
  await new Promise(done => process.stdout.write("", done));
  process.exit(0);
}

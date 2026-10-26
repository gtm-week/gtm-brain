#!/usr/bin/env node
// deal-health: one deal's MEDDPICC rubric and the memories to score it from. Reads only.
//   node deal-health.mjs <root> --entity "<company>"
// The model scores; this read gives it the rubric (skills/gtm-brain-use-brain/references/deal-health.md)
// and every memory about the company, newest first, each with its ID. admin.md deal_scoring: off turns it off.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
if (!existsSync(join(root, "brain", "admin.md"))) { console.error("no brain here"); process.exit(1); }
if (String(lib.readAdmin(root)?.deal_scoring ?? "on").toLowerCase() === "off") {
  console.log("Deal scoring is off in this brain (deal_scoring: off in brain/admin.md). Do not score by hand. To turn it on, change that line through the workplace-change procedure.");
  process.exit(0);
}
const who = args[args.indexOf("--entity") + 1];
if (args.indexOf("--entity") < 0 || !who) { console.error("deal needs search: the company name, alias or id"); process.exit(2); }
const rubric = readFileSync(new URL("../../skills/gtm-brain-use-brain/references/deal-health.md", import.meta.url), "utf8")
  .split(/^## Turning it off/m)[0].replace(/^# .*\n+/, "").trim();
let view;
try { view = lib.entityBrief(root, who, {}); } catch (e) { console.error(e.message); process.exit(1); }
const memories = view.evidence;
const day = at => String(at || "").slice(0, 10);
const quote = s => String(s || "").replace(/\s+/g, " ").trim().slice(0, 400);
console.log(`deal: ${view.entity.name} (${view.entity.id}) · ${memories.length} memories${memories.length ? `, newest ${day(memories[0].at)}` : ""}`);
if (!memories.length) {
  console.log(`Nothing is recorded about ${view.entity.name} yet, so every element is missing. Ask the person what they know, or sync their meeting notes and CRM first.`);
  process.exit(0);
}
console.log(`\n${rubric}\n\n## Memories about ${view.entity.name}\n`);
for (const m of memories) console.log(`[${m.id}] ${day(m.at)} · ${m.context} · ${m.kind} · ${quote(m.content)}`);

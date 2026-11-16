#!/usr/bin/env node
// A change people should receive needs a version bump, or nobody is offered it (AGENTS.md).
// Compares this checkout with a base ref: when anything under plugins/gtm-brain/ but test/ changed,
// .codex-plugin/plugin.json must carry a higher version than the base.
//   node scripts/check-version-bump.mjs [base-ref]     default: origin/main
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.argv[2] || "origin/main";
const MANIFEST = "plugins/gtm-brain/.codex-plugin/plugin.json";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

const changed = git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean)
  .filter(f => f.startsWith("plugins/gtm-brain/") && !f.startsWith("plugins/gtm-brain/test/"));
if (!changed.length) { console.log("No shipped plugin files changed: no version bump needed."); process.exit(0); }

const version = text => JSON.parse(text).version;
const parse = v => String(v).split(".").map(Number);
const higher = (a, b) => { const x = parse(a), y = parse(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

const now = version(readFileSync(MANIFEST, "utf8"));
let was; try { was = version(git("show", `${base}:${MANIFEST}`)); } catch { console.log(`No ${MANIFEST} at ${base}: nothing to compare.`); process.exit(0); }

const list = changed.slice(0, 10).map(f => `  ${f}`).join("\n") + (changed.length > 10 ? `\n  ... and ${changed.length - 10} more` : "");
if (higher(now, was)) { console.log(`Version ${was} -> ${now}, ${changed.length} shipped file(s) changed.`); process.exit(0); }
console.log(`These shipped files changed, but ${MANIFEST} is still ${now} (${base} has ${was}):\n${list}\n
Bump the version in ${MANIFEST}, the same number in the cache paths in docs/SETUP.md and docs/COMMANDS.md,
then run node scripts/sync-derived.mjs. Without a bump nobody is offered the change.`);
process.exit(1);

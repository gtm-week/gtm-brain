#!/usr/bin/env node
// check-version: is a newer GTM OS available where this install came from?
//   node check-version.mjs <root>            writes work/plugin-version.json, prints one line, never fails the caller
// Installed: the version Codex reports for gtm-os@gtm-os (fallback: this plugin's own plugin.json).
// Latest: the plugin.json of the marketplace source. A Git source is fetched shallowly into a bare cache
// under CODEX_HOME (one ref, a few seconds, 20s cap); a local checkout is read from disk.
// Tests: GTM_OS_SOURCE=<path or git url> [GTM_OS_SOURCE_REF=<ref>] skips the codex call.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sourceVersion, retiredSource, SHIPPING_SOURCE } from "../../lib/plugin-source.mjs";
const root = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
const P = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const out = join(root, "work", "plugin-version.json");
const run = (cmd, args, ms = 20000) => execFileSync(cmd, args, { encoding: "utf8", timeout: ms, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 4 * 1024 * 1024 });
const version = json => { try { return JSON.parse(json).version || null; } catch { return null; } };
export const newer = (a, b) => { // is a newer than b? numeric per part, missing parts are 0
  if (!a || !b) return false; const pa = String(a).split(/[.-]/).map(Number), pb = String(b).split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y; } return false;
};

let previous = {}; try { previous = JSON.parse(readFileSync(out, "utf8")); } catch {}
const state = { installed: null, latest: null, source: null, ref: null, status: "unknown", note: "", checkedAt: new Date().toISOString() };
try {
  // installed
  try { state.installed = JSON.parse(run("codex", ["plugin", "list", "--marketplace", "gtm-os", "--json"])).installed?.find(p => p.pluginId === "gtm-os@gtm-os" && p.installed)?.version || null; } catch {}
  if (!state.installed) state.installed = version(readFileSync(join(P, ".codex-plugin", "plugin.json"), "utf8"));
  // source
  let src = process.env.GTM_OS_SOURCE || null, ref = process.env.GTM_OS_SOURCE_REF || null, type = null;
  if (src) type = existsSync(join(src, "plugins", "gtm-os")) ? "local" : "git";
  else {
    const m = JSON.parse(run("codex", ["plugin", "marketplace", "list", "--json"])).marketplaces?.find(x => x.name === "gtm-os");
    const s = m && m.marketplaceSource; if (!s) throw new Error("no gtm-os marketplace configured");
    type = s.sourceType; src = s.source || s.url || s.repo || null; ref = s.ref || s.branch || null;
    if (!src) throw new Error("the marketplace source has no location");
  }
  // A retired source stays at its last release; the latest is the shipping one's, and the update moves the install there.
  if (type === "git" && retiredSource(src)) { src = SHIPPING_SOURCE; ref = null; }
  state.source = type; state.ref = ref;
  const remote = sourceVersion({ type, source: src, ref, codexHome });   // lib/plugin-source.mjs: the same fetch update.mjs relies on
  if (!remote.version) throw new Error(remote.error);
  state.latest = remote.version;
  state.status = newer(state.latest, state.installed) ? "newer" : "current";
} catch (e) {
  state.status = "unknown"; state.note = String(e && e.message || e).split("\n")[0].slice(0, 160);
  if (previous.latest && previous.installed === state.installed) { state.latest = previous.latest; state.status = newer(previous.latest, state.installed) ? "newer" : "current"; state.note = `last check kept (${state.note})`; state.checkedAt = previous.checkedAt || state.checkedAt; }
}
mkdirSync(join(root, "work"), { recursive: true });
try { writeFileSync(out, JSON.stringify(state, null, 1)); } catch {}
console.log(state.status === "newer" ? `GTM OS ${state.latest} is available (installed ${state.installed}); say: update GTM OS`
  : state.status === "current" ? `GTM OS ${state.installed} is the latest` : `GTM OS ${state.installed || "?"}: latest not known (${state.note})`);

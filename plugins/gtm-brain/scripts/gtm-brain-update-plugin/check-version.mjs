#!/usr/bin/env node
// check-version: is a newer GTM Brain available where this install came from?
//   node check-version.mjs <root>            writes work/plugin-version.json, prints one line, never fails the caller
// Installed: the version the host (Codex or Claude Code, lib/host.mjs) reports for gtm-brain@gtm-brain (fallback:
// this plugin's own plugin.json). Latest: the plugin.json of the marketplace source. A Git source is fetched
// shallowly into a bare cache under the host's home (one ref, a few seconds, 20s cap); a local checkout is read from disk.
// Tests: GTM_BRAIN_SOURCE=<path or git url> [GTM_BRAIN_SOURCE_REF=<ref>] skips the host call.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceVersion, retiredSource, SHIPPING_SOURCE } from "../../lib/plugin-source.mjs";
import { host } from "../../lib/host.mjs";
const root = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
const P = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const { plugin } = host(), codexHome = plugin.home();
const out = join(root, "work", "plugin-version.json");
const version = json => { try { return JSON.parse(json).version || null; } catch { return null; } };
export const newer = (a, b) => { // is a newer than b? numeric per part, missing parts are 0
  if (!a || !b) return false; const pa = String(a).split(/[.-]/).map(Number), pb = String(b).split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y; } return false;
};

let previous = {}; try { previous = JSON.parse(readFileSync(out, "utf8")); } catch {}
const state = { installed: null, latest: null, source: null, ref: null, status: "unknown", note: "", checkedAt: new Date().toISOString() };
try {
  // installed
  try { state.installed = plugin.installed(); } catch {}
  if (!state.installed) state.installed = version(readFileSync(join(P, ".codex-plugin", "plugin.json"), "utf8"));
  // source
  let src = process.env.GTM_BRAIN_SOURCE || null, ref = process.env.GTM_BRAIN_SOURCE_REF || null, type = null;
  if (src) type = existsSync(join(src, "plugins", "gtm-brain")) ? "local" : "git";
  else {
    const s = plugin.marketplace(); if (!s) throw new Error("no gtm-brain marketplace configured");
    ({ type, source: src, ref } = s);
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
console.log(state.status === "newer" ? `GTM Brain ${state.latest} is available (installed ${state.installed}); say: update GTM Brain`
  : state.status === "current" ? `GTM Brain ${state.installed} is the latest` : `GTM Brain ${state.installed || "?"}: latest not known (${state.note})`);

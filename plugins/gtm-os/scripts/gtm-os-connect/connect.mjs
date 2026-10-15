#!/usr/bin/env node
// connect: for every tool in brain/admin.md, is its official Codex plugin installed and enabled?
//   node connect.mjs <root> --check            report per tool; writes work/tools.json (personal, ignored)
//   node connect.mjs <root> --mark <tool> ok|fail "<note>"   record the read test result the model performed
//   node connect.mjs <root> --skip <tool> [<tool>...]      the person declined this connection: never offered again
// Tools are matched against the live catalog, not a table kept here:
//   - `codex plugin list` says which plugins exist in each marketplace and which are installed;
//   - Codex's own cache of the remote catalog (~/.codex/cache/remote_plugin_catalog/*.json, refreshed by
//     the app) carries the display names, so "Wispr Flow" finds the app-... plugin that has that name.
// Installing one: codex plugin add <id>@<marketplace>, then sign in when the app asks.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
const admin = lib.readAdmin(root); if (!admin) { console.error("no brain here"); process.exit(1); }
const key = t => t.toLowerCase().replace(/\s*\(.*\)\s*$/, "").trim();
const wf = join(root, "work", "tools.json"); mkdirSync(join(root, "work"), { recursive: true });
let state = {}; try { state = JSON.parse(readFileSync(wf, "utf8")); } catch {}

if (args[0] === "--skip") {
  const names = args.slice(1).filter(Boolean); if (!names.length) { console.error("--skip needs a tool name"); process.exit(1); }
  for (const t of names) state[key(t)] = { ...(state[key(t)] || { tool: t, status: "not checked" }), declined: true, declined_at: new Date().toISOString() };
  writeFileSync(wf, JSON.stringify(state, null, 1)); console.log(`${names.join(", ")}: declined; not offered again (say "connect ${names[0]}" to change your mind)`); process.exit(0);
}

// A successful call in chat counts as the read test (PostToolUse hook, ALL-211). The server is the
// tool itself (mcp__attio__...) or Codex's connector bus, whose tool names start with the app
// (mcp__codex_apps__attio_whoami, gmail.search_emails): the longest tool key or plugin id that the
// call name starts with wins. Only an installed, not yet tested tool is written; nothing else moves.
if (args[0] === "--used") {
  const [server, name] = args.slice(1); const flat = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const heads = server === "codex_apps" ? [flat(name)] : [flat(server)];
  const match = Object.entries(state).map(([k, s]) => ({ k, s, id: [flat(k), flat(s && s.plugin)].filter(x => x.length >= 3).sort((a, b) => b.length - a.length).find(x => heads.some(h => server === "codex_apps" ? h.startsWith(x) : h === x)) })).filter(m => m.id).sort((a, b) => b.id.length - a.id.length)[0];
  if (!match || match.s.status !== "installed" || match.s.test === "ok") process.exit(0);
  state[match.k] = { ...match.s, test: "ok", note: `used in chat: ${name}`, at: new Date().toISOString() };
  writeFileSync(wf, JSON.stringify(state, null, 1));
  const { requestDashboardRefresh } = await import(new URL("../../lib/dashboard-refresh.mjs", import.meta.url));
  requestDashboardRefresh(root, fileURLToPath(new URL("../gtm-os-render/render.mjs", import.meta.url)));
  console.log(`${match.s.tool}: read test ok (${name})`); process.exit(0);
}

if (args[0] === "--mark") {
  const [tool, result, ...note] = args.slice(1); const { declined, declined_at, ...was } = state[key(tool)] || {};
  // a test result is the person changing their mind about a tool they had declined: it is offered again
  state[key(tool)] = { ...was, tool: was.tool || tool, status: was.status || "not checked", test: result, note: note.join(" "), at: new Date().toISOString() };
  writeFileSync(wf, JSON.stringify(state, null, 1)); console.log(`${tool}: ${result}${note.length ? " · " + note.join(" ") : ""}${declined ? " (no longer declined)" : ""}`); process.exit(0);
}

/* ---------- the catalog: every plugin Codex knows, with install state and display name ---------- */
const REMOTE = "openai-curated-remote";
const plugins = new Map();   // id -> { id, marketplace, display, state: enabled|disabled|not installed|unknown, policy }
const put = (id, more) => plugins.set(id, { id, marketplace: REMOTE, display: null, state: "unknown", policy: "AVAILABLE", ...(plugins.get(id) || {}), ...more });
let listed = false;
try {
  // The full list runs past 1 MB (node's default buffer, ENOBUFS) once the curated catalog is listed.
  const output = execFileSync("codex", ["plugin", "list"], { encoding: "utf8", timeout: Number(process.env.GTM_OS_CODEX_TIMEOUT) || 60000, maxBuffer: 64 * 1024 * 1024 });
  listed = true; // A successful empty list is still a successful check.
  for (const line of output.split("\n")) {
    const m = line.match(/^(\S+)@(\S+)\s+(installed|not installed)(?:,\s*(enabled|disabled))?/); if (!m) continue;
    put(m[1], { marketplace: m[2], state: m[3] === "installed" ? (m[4] || "enabled") : "not installed" });
  }
} catch (e) { console.error("could not run `codex plugin list`: " + e.message.split("\n")[0]); }
// Codex's cache of the remote catalog: display names and availability, refreshed by the app itself.
const catalogDir = process.env.GTM_OS_CATALOG_DIR || join(process.env.CODEX_HOME || join(homedir(), ".codex"), "cache", "remote_plugin_catalog");
let catalogAt = null;
try {
  for (const f of readdirSync(catalogDir).filter(f => f.endsWith(".json"))) {
    let c; try { c = JSON.parse(readFileSync(join(catalogDir, f), "utf8")); } catch { continue; }
    for (const p of c.plugins || []) if (p && p.name) put(p.name, { display: (p.release && p.release.display_name) || null, policy: p.installation_policy || p.status || "AVAILABLE", ...(plugins.has(p.name) ? {} : { state: "not installed" }) });
    if (c.fetched_at && (!catalogAt || c.fetched_at > catalogAt)) catalogAt = c.fetched_at;
  }
} catch {}
for (const p of plugins.values()) if (!p.display) p.display = p.id.startsWith("app-") ? null : p.id.replace(/-/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());

/* ---------- matching a tool name to a plugin ---------- */
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
// short forms people write that are not the plugin's name; the catalog still decides whether the plugin exists
const SHORT = { calendar: "google-calendar", gcal: "google-calendar", drive: "google-drive", gdrive: "google-drive", contacts: "google-contacts", outlook: "outlook-email", email: "gmail", mail: "gmail", crm: null };
const marketplaceOnly = [REMOTE];   // where the official integrations live; bundled/runtime plugins are Codex's own
const candidates = () => [...plugins.values()].filter(p => marketplaceOnly.includes(p.marketplace));
function findPlugin(tool) {
  const k = key(tool), nk = norm(k), pool = candidates();
  if (!nk) return { plugin: null, also: [] };
  const exactId = pool.find(p => norm(p.id) === nk); if (exactId) return { plugin: exactId, also: [] };
  const exactName = pool.filter(p => p.display && norm(p.display) === nk);
  if (exactName.length) { const best = prefer(exactName, nk); return { plugin: best, also: exactName.filter(p => p !== best) }; }
  if (k in SHORT) { const p = SHORT[k] && pool.find(x => x.id === SHORT[k]); return { plugin: p || null, also: [] }; }
  // the tool name as the first words of a display name: "Apollo" -> "Apollo.io", "Todoist" -> "Todoist: To Do List"
  const words = k.split(/\s+/).map(norm).filter(Boolean);
  const starts = pool.filter(p => p.display && words.every((w, i) => norm(p.display.split(/[\s:.,/&-]+/)[i]) === w));
  if (starts.length) { const best = prefer(starts, nk); return { plugin: best, also: starts.filter(p => p !== best) }; }
  return { plugin: null, also: [] };
}
// several plugins share a name: installed first, then a named id over an app-... id, then the one whose
// own name (before ":" or " - ", the store's "Name: tagline" habit) is the tool name, then the shortest
const head = s => norm(String(s || "").split(/:| - /)[0]);
const prefer = (list, nk) => [...list].sort((a, b) => (b.state === "enabled") - (a.state === "enabled") || a.id.startsWith("app-") - b.id.startsWith("app-") || (head(b.display) === nk) - (head(a.display) === nk) || (a.display || "").length - (b.display || "").length)[0];

/* ---------- the report ---------- */
const previous = Object.values(state);
const rows = [];
for (const tool of admin.tools || []) {
  const { plugin: p, also } = findPlugin(tool); const prev = state[key(tool)] || {};
  let status = !p ? "no official plugin" : p.policy === "NOT_AVAILABLE" || p.policy === "DISABLED_BY_ADMIN" ? "not available (disabled by your workspace admin)"
    : p.state === "enabled" ? "installed" : p.state === "disabled" ? "installed, disabled" : "available, not installed";
  // Without `codex plugin list` the install state is unknown: the last known one stands, never a guess.
  if (!listed) status = prev.status && prev.status !== "not checked" ? prev.status : "not checked (codex plugin list failed)";
  state[key(tool)] = { ...prev, suggested: false, tool, plugin: p ? p.id : prev.plugin || null, marketplace: p ? p.marketplace : prev.marketplace || null, display: p ? p.display : prev.display || null, status, ...(listed ? { checked_at: new Date().toISOString() } : {}) };
  rows.push({ tool, p, also, status, test: prev.test || null, note: prev.note || "", stale: !listed && !!prev.checked_at ? prev.checked_at : null });
}
/* ---------- the floor: email, calendar and the CRM are suggested even before admin.md names them ----------
   Every company has all three, and without them the brain is blind. HubSpot is the CRM the course
   gives every participant, so it is the default suggestion; Attio is suggested instead when it is the
   one installed. A decline (--skip, or the card's unchecked box) sticks to the record and is never
   offered again. When no admin tool covers one,
   the best catalog plugin is written to tools.json as a suggested candidate, so the dashboard's
   connect picker and the session status line show it from the very first check. Recomputed each
   run; disappears the moment admin.md names a tool that covers it. */
if (listed) for (const k of Object.keys(state)) if (state[k] && state[k].suggested) delete state[k];
const covered = re => rows.some(r => re.test(norm(r.tool)) || (r.p && re.test(norm(r.p.id))));
const SUGGEST = [{ re: /mail/, ids: ["gmail", "outlook-email"] }, { re: /calendar/, ids: ["google-calendar"] },
  { re: /crm|hubspot|attio|salesforce|pipedrive|zoho|freshsales|^close$|closeio|folk|nutshell/, ids: ["hubspot", "attio"], why: p => p.id === "hubspot" ? "the CRM: the course gives you HubSpot; say so if yours is Attio" : `the CRM: ${p.display || p.id} is installed here` }];
const suggested = [];
if (listed) for (const { re, ids, why } of SUGGEST) {
  if (covered(re)) continue;
  const pool = ids.map(id => plugins.get(id)).filter(p => p && marketplaceOnly.includes(p.marketplace) && p.policy !== "NOT_AVAILABLE" && p.policy !== "DISABLED_BY_ADMIN");
  const p = pool.find(x => x.state === "enabled") || pool[0]; if (!p) continue;
  const tool = p.display || p.id;
  const status = p.state === "enabled" ? "installed" : p.state === "disabled" ? "installed, disabled" : "available, not installed";
  const prev = previous.find(x => (x.plugin === p.id && x.marketplace === p.marketplace) || key(String(x.tool || "")) === key(tool)) || {};   // a decline recorded before any check has no plugin id yet
  state[key(tool)] = { ...prev, tool, plugin: p.id, marketplace: p.marketplace, display: p.display, status, suggested: true, checked_at: new Date().toISOString() };
  suggested.push({ tool, status, p, why: typeof why === "function" ? why(p) : why, declined: !!prev.declined });
}
for (const k of Object.keys(state)) if (!(state[k] && state[k].suggested) && !(admin.tools || []).some(t => key(t) === k)) delete state[k]; // a tool removed from admin.md leaves the record
writeFileSync(wf, JSON.stringify(state, null, 1));
console.log(`tools in admin.md: ${rows.length}${listed ? "" : " · codex plugin list failed: install state as last checked, not re-checked now"}${catalogAt ? ` · catalog as of ${lib.localDateTime(catalogAt)}` : " · no catalog cache yet (open the Codex app once)"}`);
for (const r of rows) {
  console.log(`- ${r.tool.padEnd(22)} ${r.status.padEnd(26)}${r.stale ? ` (as of ${lib.localDateTime(r.stale)})` : ""}${r.p && r.p.display && norm(r.p.display) !== norm(key(r.tool)) ? ` plugin "${r.p.display}"` : ""}${r.test ? ` read test: ${r.test}${r.note ? " (" + r.note + ")" : ""}` : ""}`);
  if (r.status === "available, not installed" && r.p) console.log(`    install: codex plugin add ${r.p.id}@${r.p.marketplace}   (then sign in when Codex asks)`);
  if (r.also.length) console.log(`    also matches: ${r.also.map(p => `"${p.display}" (${p.id})`).join(", ")}; say which if the first is not it`);
  if (r.status === "no official plugin") console.log(`    fallback: export or paste; the context rule should say so`);
}
// installed official plugins that admin.md does not mention: offer to add them. Codex's own defaults
// (installed by default) and developer plugins are left out; they are not a GTM person's tools.
const DEV = new Set(["github", "vercel", "supabase", "data-analytics", "openai-developers"]);
const known = new Set(rows.map(r => r.p && r.p.id).filter(Boolean));
const extra = candidates().filter(p => p.state === "enabled" && !known.has(p.id) && !DEV.has(p.id) && p.policy !== "INSTALLED_BY_DEFAULT").map(p => p.display || p.id);
if (extra.length) console.log(`\ninstalled in Codex but not in admin.md tools: ${extra.join(", ")}. Offer to add them (gtm-os-configure workplace-change procedure).`);
for (const s of suggested) {
  if (s.declined) { console.log(`\ndeclined earlier: ${s.tool} (not offered again unless they ask)`); continue; }
  console.log(`\nsuggested (${s.why || "the pulse of the company"}, not yet in admin.md): ${s.tool}  ${s.status}`);
  if (s.status === "available, not installed") console.log(`    install: codex plugin add ${s.p.id}@${s.p.marketplace}   (then sign in when Codex asks)`);
}
const ready = rows.filter(r => r.status === "installed").length;
console.log(`\n${ready} of ${rows.length} connected. Status line: ${rows.map(r => `${key(r.tool)} ${r.status === "installed" ? (r.test === "ok" ? "●" : "○") : "✕"}`).join("  ")}`);

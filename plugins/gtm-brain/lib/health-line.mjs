// The one health line at chat start: meeting capture (meetingCaptureStatus), the nightly chat capture, the summary runs
// (work/runs.jsonl and work/compile.json), the last sync per tool (work/sync.json and meeting
// coverage, marked when older than its window), the open meeting gaps and, when a number is out of
// range, the population (lib/population.mjs). Reads only (the population keeps its cache in work/); every part is left out when nothing is recorded.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { meetingCaptureStatus, toolKey } from "./brain.mjs";   // through brain.mjs: meetings.mjs imports it back
import { normalizeKind } from "./pointers.mjs";
import { populationPart, SYNC_WINDOW_DAYS } from "./population.mjs";
import { captureHealth } from "./capture.mjs";

const readJson = f => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const readRuns = root => { try { return readFileSync(join(root, "work", "runs.jsonl"), "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(r => r && r.at); } catch { return []; } };
const when = at => { const t = Date.parse(at); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC" : null; };
const newest = list => list.filter(x => x && Number.isFinite(Date.parse(x.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;

/* the summary runs: the last good one and the last error, from both records */
export function summaryRuns(root) {
  const runs = readRuns(root), state = readJson(join(root, "work", "compile.json"));
  const good = newest([...runs.filter(r => r.turns > 0 && !r.error), ...(state?.state === "done" ? [state] : [])]);
  const bad = newest([...runs.filter(r => r.error || !r.turns).map(r => ({ at: r.at, why: r.error || "the run did no work" })),
    ...(["failed", "blocked"].includes(state?.state) ? [{ at: state.at, why: `${state.state === "blocked" ? "compiled nothing" : "failed"}${state.contexts ? ` (${state.contexts})` : ""}` }] : [])]);
  return { good: good?.at || null, error: bad && (!good || Date.parse(bad.at) > Date.parse(good.at)) ? bad : null };
}

/* The source sync's checkpoints (work/sync.json, written by gtm-brain-sync). Since 0.35.0 one per source kind
   and account, the same {kind, account} as a note's source pointer:
     {"at": "<last run that read every source>", "tools": [...], "sources": {"gmail": {"at": "..."}, "hubspot:12345": {"at": "...", "window_days": 2}}}
   A brain from before has only the global at and tools: each listed tool reads as synced at that time. */
export function syncCheckpoints(root) {
  const sync = readJson(join(root, "work", "sync.json")); if (!sync || typeof sync !== "object") return [];
  const out = [], seen = new Set();
  for (const [key, v] of Object.entries(sync.sources && typeof sync.sources === "object" && !Array.isArray(sync.sources) ? sync.sources : {})) {
    const at = typeof v === "string" ? v : v?.at; if (!Number.isFinite(Date.parse(at))) continue;
    const colon = key.indexOf(":"), kind = normalizeKind(colon > 0 ? key.slice(0, colon) : key), account = colon > 0 ? key.slice(colon + 1).trim().toLowerCase() || null : null;
    if (!kind || colon === 0) continue;
    const window = Number(v?.window_days);
    out.push({ kind, account, at, ...(window > 0 ? { window_days: window } : {}) }); seen.add(kind);
  }
  if (Number.isFinite(Date.parse(sync.at))) for (const t of Array.isArray(sync.tools) && sync.tools.length ? sync.tools : ["sync"]) {
    const kind = normalizeKind(toolKey(typeof t === "string" ? t : t?.tool));
    if (kind && !seen.has(kind)) { out.push({ kind, account: null, at: sync.at, legacy: true }); seen.add(kind); }
  }
  return out;
}
/* Where a sync of one source starts reading: its own checkpoint (with the account, then the kind alone),
   the old global one, or null (the skill then reads the last 7 days). */
export function syncCheckpoint(root, kind, account = null) {
  const k = normalizeKind(kind), a = account ? String(account).trim().toLowerCase() : null, list = syncCheckpoints(root);
  const own = list.find(c => c.kind === k && c.account === a && !c.legacy) || list.find(c => c.kind === k && !c.account && !c.legacy);
  if (own) return own.at;
  const sync = readJson(join(root, "work", "sync.json"));
  return Number.isFinite(Date.parse(sync?.at)) ? sync.at : null;
}

/* when each tool was last read: the sync checkpoints, and each meeting source's own coverage */
export function lastSyncs(root, overview) {
  return Object.fromEntries(Object.entries(syncTimes(root, overview)).map(([k, v]) => [k, v.at]));
}
function syncTimes(root, overview) {
  const at = {}, put = (tool, t, window) => { if (!tool || !Number.isFinite(Date.parse(t))) return; const k = String(tool).toLowerCase(); if (!at[k] || Date.parse(t) > Date.parse(at[k].at)) at[k] = { at: t, ...(window ? { window_days: window } : {}) }; };
  for (const c of syncCheckpoints(root)) put(c.account ? `${c.kind} (${c.account})` : c.kind, c.at, c.window_days);
  // the coverage names a tool as the person does ("Google Calendar"); spelled as the checkpoint's kind it is one entry
  for (const c of overview?.coverage || []) if (c.status !== "unavailable") put(normalizeKind(toolKey(c.tool)), c.checked_at);
  return at;
}
/* Tools whose last sync is older than their window (a checkpoint's window_days, else SYNC_WINDOW_DAYS). */
export function overdueSyncs(root, overview, now = process.env.GTM_BRAIN_NOW ? Date.parse(process.env.GTM_BRAIN_NOW) : Date.now()) {
  return Object.entries(syncTimes(root, overview)).filter(([, v]) => now - Date.parse(v.at) > (v.window_days || SYNC_WINDOW_DAYS) * 864e5).map(([tool, v]) => ({ tool, at: v.at, window_days: v.window_days || SYNC_WINDOW_DAYS }));
}

/* meetings that happened and whose notes were not captured (pending or unavailable) */
export function openGaps(overview) {
  return (overview?.meetings || []).filter(m => m.state !== "planned" && ["pending", "unavailable"].includes(m.capture)).length;
}

export function healthLine(root, overview) {
  const parts = [], capture = meetingCaptureStatus(root, overview);
  if (capture) parts.push(`meeting capture: ${capture}`);
  const { good, error } = summaryRuns(root);
  if (good || error) parts.push(`summaries: ${good ? `last good run ${when(good)}` : "no good run yet"}${error ? `, last error ${when(error.at)}: ${String(error.why).replace(/\s+/g, " ").slice(0, 120)}` : ""}`);
  const syncs = Object.entries(lastSyncs(root, overview)), late = new Map(overdueSyncs(root, overview).map(o => [o.tool, o]));
  if (syncs.length) parts.push(`last sync: ${syncs.map(([t, at]) => `${t} ${when(at)}${late.has(t) ? ` (overdue: older than ${late.get(t).window_days} days)` : ""}`).join(", ")}`);
  const gaps = openGaps(overview);
  if (gaps) parts.push(`open gaps: ${gaps} meeting${gaps === 1 ? "" : "s"} not captured`);
  // the nightly chat capture's heartbeat (lib/capture.mjs): only when the last good pass is late or the last one
  // failed, with the reason; a fine or switched-off capture adds nothing to what every chat start reads
  const chats = captureHealth(root);
  if (chats.state === "late" || chats.state === "failed") parts.push(chats.text);
  const population = populationPart(root);
  if (population) parts.push(population);
  if (!parts.length) return null;
  return `health: ${parts.join(" | ").replace(/\.$/, "")}. Say this if the person asks about meetings, sync, summaries, chat capture or how full the brain is, or something is missing; do not raise it otherwise.`;
}

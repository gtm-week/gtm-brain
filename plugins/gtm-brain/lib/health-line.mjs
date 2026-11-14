// The one health line at chat start: meeting capture (meetingCaptureStatus), the summary runs
// (work/runs.jsonl and work/compile.json), the last sync per tool (work/sync.json and meeting
// coverage) and the open meeting gaps. Reads only; every part is left out when nothing is recorded.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { meetingCaptureStatus } from "./brain.mjs";   // through brain.mjs: meetings.mjs imports it back

const readJson = f => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const readRuns = root => { try { return readFileSync(join(root, "work", "runs.jsonl"), "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(r => r && r.at); } catch { return []; } };
const when = at => { const t = Date.parse(at); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC" : null; };
const newest = list => list.filter(x => x && Number.isFinite(Date.parse(x.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;

/* the summary runs: the last good one and the last error, from both records */
export function summaryRuns(root) {
  const runs = readRuns(root), state = readJson(join(root, "work", "compile.json"));
  const good = newest([...runs.filter(r => r.turns > 0 && !r.error), ...(state?.state === "done" ? [state] : [])]);
  const bad = newest([...runs.filter(r => r.error || !r.turns).map(r => ({ at: r.at, why: r.error || "the run did no work" })),
    ...(state?.state === "failed" ? [{ at: state.at, why: `failed${state.contexts ? ` (${state.contexts})` : ""}` }] : [])]);
  return { good: good?.at || null, error: bad && (!good || Date.parse(bad.at) > Date.parse(good.at)) ? bad : null };
}

/* when each tool was last read: the sync checkpoint, and each meeting source's own coverage */
export function lastSyncs(root, overview) {
  const at = {}, put = (tool, t) => { if (!tool || !Number.isFinite(Date.parse(t))) return; const k = String(tool).toLowerCase(); if (!at[k] || Date.parse(t) > Date.parse(at[k])) at[k] = t; };
  const sync = readJson(join(root, "work", "sync.json"));
  if (sync?.at) for (const t of Array.isArray(sync.tools) && sync.tools.length ? sync.tools : ["sync"]) put(typeof t === "string" ? t : t?.tool, sync.at);
  for (const c of overview?.coverage || []) if (c.status !== "unavailable") put(c.tool, c.checked_at);
  return at;
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
  const syncs = Object.entries(lastSyncs(root, overview));
  if (syncs.length) parts.push(`last sync: ${syncs.map(([t, at]) => `${t} ${when(at)}`).join(", ")}`);
  const gaps = openGaps(overview);
  if (gaps) parts.push(`open gaps: ${gaps} meeting${gaps === 1 ? "" : "s"} not captured`);
  if (!parts.length) return null;
  return `health: ${parts.join(" | ")}. Say this if the person asks about meetings, sync or summaries, or something is missing; do not raise it otherwise.`;
}

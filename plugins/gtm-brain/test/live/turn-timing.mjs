#!/usr/bin/env node
// Where a Codex turn's time goes, from the session logs already on disk (~/.codex/sessions): per
// turn, wall time, model time (wall minus tool time), steps, GTM Brain calls, skill files read and
// the first request's prompt size. Brain folders against other folders, and day by day for one
// folder, so a rules change can be checked against the person's real chats, not only fixtures.
//   node plugins/gtm-brain/test/live/turn-timing.mjs [--days 30] [--since 2026-09-01] [--cwd "/path/or/substring"] [--by-day] [--csv out.csv]
// Scheduled runs (codex exec, source "exec") are listed apart: nobody waits for them.
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const days = Number(opt("--days", 30));
const since = new Date(opt("--since", new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)));
const cwdFilter = opt("--cwd", ""); const byDay = args.includes("--by-day"); const csv = opt("--csv", "");

const root = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions");
const files = [];
(function walk(d) { if (!existsSync(d)) return; for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : e.endsWith(".jsonl") && files.push(p); } })(root);

const isBrain = cwd => {   // the brain itself, or a folder linked to one (mirrors hooks/resolve.sh)
  let d = cwd;
  for (;;) {
    if (existsSync(join(d, "brain", "admin.md"))) return true;
    const a = join(d, "AGENTS.md");
    if (existsSync(a) && readFileSync(a, "utf8").includes("<!-- gtm-brain project -->")) return true;
    if (existsSync(join(d, ".git")) || d === "/" || d === join(d, "..")) return false;
    d = join(d, "..");
  }
};
const DOC = /(skills\/[\w-]+\/(?:SKILL\.md|references\/[\w-]+\.md))/;

const turns = [];
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const meta = lines.find(l => l.type === "session_meta");
  if (!meta || new Date(meta.payload.timestamp) < since) continue;
  const cwd = meta.payload.cwd; if (cwdFilter && !cwd.includes(cwdFilter)) continue;
  const kind = (isBrain(cwd) ? "brain" : "other") + (meta.payload.source === "exec" ? " scheduled" : "");
  const model = (lines.find(l => l.type === "turn_context") || {}).payload?.model || "?";
  let cur = null; const pending = new Map();
  for (const l of lines) {
    const t = new Date(l.timestamp).getTime(), p = l.payload || {};
    if (l.type === "event_msg" && p.type === "task_started") { cur = { file: f, cwd, kind, model, day: l.timestamp.slice(0, 10), start: t, steps: 0, gtm: 0, docs: 0, toolMs: 0, firstToolMs: null, inTok: null }; pending.clear(); continue; }
    if (!cur) continue;
    if (l.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call")) {
      cur.steps++; if (cur.firstToolMs === null) cur.firstToolMs = t - cur.start;
      const s = p.input || p.arguments || ""; cur.gtm += (s.match(/mcp__gtm_brain__\w+/g) || []).length + ((p.namespace || "") === "mcp__gtm_brain" ? 1 : 0); if (DOC.test(s)) cur.docs++;
      pending.set(p.call_id || p.id, t);
    }
    if (l.type === "response_item" && (p.type === "function_call_output" || p.type === "custom_tool_call_output")) {
      const s = pending.get(p.call_id); if (s !== undefined) { cur.toolMs += t - s; pending.delete(p.call_id); }
    }
    if (l.type === "event_msg" && p.type === "token_count" && cur.inTok === null) cur.inTok = p.info?.last_token_usage?.input_tokens ?? null;
    if (l.type === "event_msg" && p.type === "task_complete") {
      cur.wallMs = t - cur.start; cur.modelMs = cur.wallMs - cur.toolMs;
      if (cur.wallMs > 0 && cur.wallMs < 30 * 60e3) turns.push(cur);   // a turn parked on an approval for half an hour is not latency
      cur = null;
    }
  }
}

const med = a => { const v = a.filter(x => x !== null && !isNaN(x)); if (!v.length) return NaN; const s = [...v].sort((x, y) => x - y); return s[s.length >> 1]; };
const sec = ms => isNaN(ms) ? "-" : (ms / 1000).toFixed(1) + "s";
const row = ts => {
  const tool = ts.filter(t => t.steps > 0), plain = ts.filter(t => t.steps === 0);
  return { turns: ts.length, "no-tool median": sec(med(plain.map(t => t.wallMs))), "tool turns median": sec(med(tool.map(t => t.wallMs))), "p90": sec(med(tool.map(t => t.wallMs).sort((a, b) => a - b).slice(Math.floor(tool.length * 0.9)))),
    "median steps": med(tool.map(t => t.steps)) || "-", "model s/step": sec(med(tool.map(t => t.modelMs / (t.steps + 1)))), "first tool": sec(med(tool.map(t => t.firstToolMs))),
    "gtm_brain calls/turn": tool.length ? (tool.reduce((a, t) => a + t.gtm, 0) / tool.length).toFixed(1) : "-", "turns reading skill docs": tool.filter(t => t.docs > 0).length, "input tok": Math.round(med(ts.map(t => t.inTok))) || "-" };
};
const group = (key, list) => { const g = {}; for (const t of list) (g[key(t)] ||= []).push(t); return Object.fromEntries(Object.entries(g).sort().map(([k, v]) => [k, row(v)])); };

console.log(`Codex turns since ${since.toISOString().slice(0, 10)}${cwdFilter ? ` in folders matching "${cwdFilter}"` : ""}: ${turns.length} turns, ${new Set(turns.map(t => t.file)).size} sessions\n`);
console.table(group(t => t.kind, turns));
if (!cwdFilter) { console.log("\nBy folder:"); console.table(group(t => t.cwd.replace(homedir(), "~") + ` [${t.kind}]`, turns)); }
if (byDay) { console.log("\nBy day (interactive only):"); console.table(group(t => t.day, turns.filter(t => !t.kind.endsWith("scheduled")))); }
if (csv) { writeFileSync(csv, "kind,day,cwd,model,wallMs,modelMs,toolMs,steps,gtm,docs,firstToolMs,inTok\n" + turns.map(t => [t.kind, t.day, JSON.stringify(t.cwd), t.model, t.wallMs, t.modelMs, t.toolMs, t.steps, t.gtm, t.docs, t.firstToolMs ?? "", t.inTok ?? ""].join(",")).join("\n")); console.log("\nwrote", csv); }

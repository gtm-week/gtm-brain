// The chat start's one health line: capture status, summary runs, last sync per tool, open gaps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { healthLine, summaryRuns, lastSyncs, openGaps } from "../lib/health-line.mjs";
const plugin = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const bare = t => { const root = mkdtempSync(join(tmpdir(), "gtm-health-")); t.after(() => rmSync(root, { recursive: true, force: true })); mkdirSync(join(root, "work")); return root; };
const none = { coverage: [], policies: [], meetings: [] };
const runs = (root, ...rows) => writeFileSync(join(root, "work/runs.jsonl"), rows.map(r => JSON.stringify(r)).join("\n") + "\n");

test("summary runs: the last good run, and an error only when it came after it", t => {
  const root = bare(t);
  assert.deepEqual(summaryRuns(root), { good: null, error: null });
  runs(root, { at: "2026-11-10T08:00:00Z", turns: 3 }, { at: "2026-11-11T08:00:00Z", turns: 0, error: "rate limited" });
  const s = summaryRuns(root);
  assert.equal(s.good, "2026-11-10T08:00:00Z"); assert.equal(s.error.why, "rate limited");
  writeFileSync(join(root, "work/compile.json"), JSON.stringify({ state: "done", at: "2026-11-12T08:00:00Z" }));
  assert.deepEqual(summaryRuns(root), { good: "2026-11-12T08:00:00Z", error: null }, "a later good run clears the old error");
  writeFileSync(join(root, "work/compile.json"), JSON.stringify({ state: "failed", at: "2026-11-13T08:00:00Z", contexts: "icp" }));
  assert.match(summaryRuns(root).error.why, /failed \(icp\)/);
  writeFileSync(join(root, "work/compile.json"), JSON.stringify({ state: "blocked", at: "2026-11-13T09:00:00Z", contexts: "icp" }));
  assert.match(summaryRuns(root).error.why, /compiled nothing \(icp\)/, "a run that compiled nothing is an error too");
});

test("last sync per tool, from the checkpoint and from meeting coverage; unreadable coverage does not count", t => {
  const root = bare(t);
  writeFileSync(join(root, "work/sync.json"), JSON.stringify({ at: "2026-11-12T06:00:00Z", tools: ["gmail", "attio"] }));
  const at = lastSyncs(root, { coverage: [{ tool: "Granola", status: "complete", checked_at: "2026-11-13T07:00:00Z" }, { tool: "fireflies", status: "unavailable", checked_at: "2026-11-13T07:00:00Z" }] });
  assert.deepEqual(at, { gmail: "2026-11-12T06:00:00Z", attio: "2026-11-12T06:00:00Z", granola: "2026-11-13T07:00:00Z" });
});

test("open gaps count meetings that happened and were not captured", () => {
  assert.equal(openGaps({ meetings: [{ state: "held", capture: "pending" }, { state: "held", capture: "unavailable" }, { state: "planned", capture: "pending" }, { state: "held", capture: "complete" }] }), 2);
});

test("one line, with every part, and nothing when nothing is known", t => {
  const root = bare(t);
  assert.equal(healthLine(root, { coverage: [{ tool: "granola", status: "complete" }], policies: [{}], meetings: [] }), null, "capture running, nothing else recorded");
  writeFileSync(join(root, "work/sync.json"), JSON.stringify({ at: "2026-11-12T06:00:00Z", tools: ["gmail"] }));
  runs(root, { at: "2026-11-10T08:00:00Z", turns: 3 }, { at: "2026-11-11T08:00:00Z", turns: 0, error: "rate limited" });
  const line = healthLine(root, { ...none, meetings: [{ state: "held", capture: "pending" }] });
  assert.equal(line.split("\n").length, 1);
  assert.match(line, /^health: meeting capture: Sync skips meetings/);
  assert.match(line, /summaries: last good run 2026-11-10 08:00 UTC, last error 2026-11-11 08:00 UTC: rate limited/);
  assert.match(line, /last sync: gmail 2026-11-12 06:00 UTC/);
  assert.match(line, /open gaps: 1 meeting not captured/);
  assert.doesNotMatch(line, /[\u2013\u2014]/);
  assert.doesNotMatch(healthLine(bare(t), none), /\.\. Say this/, "a part that ends the list with its own full stop does not double it");
});

test("the chat start prints the health line once", t => {
  const root = mkdtempSync(join(tmpdir(), "gtm-health-start-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, CODEX_HOME: join(root, "profile"), GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1" };
  assert.equal(spawnSync("bash", [join(plugin, "scripts/gtm-brain-setup/setup.sh"), "--company", "Health Co", "--one-liner", "Testing", "--owner", "Ann Lee <ann@example.test>"], { cwd: root, env, encoding: "utf8" }).status, 0);
  runs(root, { at: "2026-11-10T08:00:00Z", turns: 2 });
  const out = spawnSync("bash", [join(plugin, "session/session-start.sh")], { cwd: root, env: { ...env, PLUGIN_ROOT: plugin, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" }, encoding: "utf8", input: JSON.stringify({ session_id: "s1", cwd: root }) }).stdout;
  const lines = out.split("\n").filter(l => l.startsWith("health: "));
  assert.equal(lines.length, 1, out);
  assert.match(lines[0], /meeting capture: No sync has finished.*summaries: last good run 2026-11-10 08:00 UTC/);
});

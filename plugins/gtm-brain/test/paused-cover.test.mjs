// A summary edited by hand is paused until reviewed, and no run touches it. Artur's ICP summary stayed on
// 2026-10-15 for a month with nobody told (2026-11-11 sync): health, the chat start and the run log now say so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-home-"));   // never the real brains registry
const lib = await import(`${P}/lib/brain.mjs`);

test("a hand-edited summary is named as paused by health, once at chat start, and in every scheduled run's log", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-paused-")); execFileSync("git", ["init", "-q", root]);
  for (const [k, v] of [["user.name", "A"], ["user.email", "a@b.c"]]) execFileSync("git", ["-C", root, "config", k, v]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Artur Wala <a@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  lib.writeContext(root, "icp", { title: "ICP", rule: "Who we sell to.", summary: "Mid-size retailers.", compiled_at: "2026-10-15T08:00:00.000Z", compiled_by: "schedule" });
  lib.save(root, "icp compiled");
  const cover = join(root, "brain", "contexts", "icp", "context.md");
  writeFileSync(cover, readFileSync(cover, "utf8").replace("Mid-size retailers.", "Mid-size retailers, and DIY chains."));   // edited by shell
  lib.appendMemory(root, "icp", { authors: ["artur-wala"], content: "Castorama fits: 90 stores.", people: [] });

  assert.deepEqual(lib.pausedCovers(root).map(p => [p.slug, p.since.slice(0, 10), p.waiting]), [["icp", "2026-10-15", 1]]);
  assert.ok(!lib.compilePlan(root).contexts.includes("icp"));   // skipped on purpose, until reviewed

  const env = { ...process.env, GTM_BRAIN_NOW: new Date(Date.now() + 3 * 86400000).toISOString() };
  const health = JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-brain-advisor/advisor.mjs`, root, "--json"], { encoding: "utf8", env }));
  const paused = health.findings.find(f => f.key === "summary-paused");
  assert.match(paused.what, /^ICP's summary is paused \(last updated 2026-10-15, 1 note waiting\): it was edited by hand/);
  assert.match(paused.do, /review the ICP summary edit/);
  assert.ok(!health.findings.some(f => f.key === "behind" && /ICP/.test(f.what)));   // never "the run starts at the next note"

  assert.match(lib.pausedCoversHint(root), /^Summaries paused, not updating: ICP \(last updated 2026-10-15, 1 note waiting\)/);
  assert.equal(lib.pausedCoversHint(root), "");   // once per set

  // the scheduled run names it in the log even when it has other work or none
  const bin = mkdtempSync(join(tmpdir(), "gtm-brain-nocodex-")); writeFileSync(join(bin, "codex"), "#!/bin/sh\nexit 1\n"); execFileSync("chmod", ["755", join(bin, "codex")]);
  try { execFileSync("bash", [`${P}/scripts/gtm-brain-schedule/scheduled-run.sh`, root], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PLUGIN_ROOT: P }, stdio: "pipe" }); } catch {}
  assert.match(readFileSync(join(root, "work", "hooks.log"), "utf8"), /scheduled-run {2}skipped, paused by a hand edit until reviewed: icp/);
});

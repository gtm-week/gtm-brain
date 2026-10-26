process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";

const P = new URL("../", import.meta.url).pathname;
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gtm-working-guidance-"));
  const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_VERSION_CHECK: "1",
    CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-guidance-profile-")) };
  execFileSync("git", ["init", "-q", root], { env });
  execFileSync("bash", [join(P, "scripts/gtm-brain-setup/setup.sh"), "--company", "Fixture", "--one-liner", "Test",
    "--owner", "Ann Lee <ann@example.test>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  lib.writeContext(root, "offer", { title: "Our offer", rule: "Use confirmed offer terms.", now: "Confirm the renewal owner.", summary: "A renewal needs an owner." });
  lib.appendMemory(root, "offer", { authors: ["ann-lee"], content: "Confirm the renewal owner." });
  const run = (file, ...args) => execFileSync(process.execPath, [join(P, "scripts", file), root, ...args], { env, encoding: "utf8" });
  const facts = () => run("gtm-brain-compile/compile.mjs", "--facts", "offer");
  const apply = (...extra) => run("gtm-brain-compile/compile.mjs", "--apply", "offer", "--by", "ann", "--as-of", facts().match(/^as_of: (\S+)/m)[1],
    "--summary", "A renewal needs an owner. Confirm the renewal owner.", ...extra);
  return { root, run, facts, apply };
}

test("empty guidance is explicit: omitted or valueless flags fail without writes; empty and whitespace values clear it", () => {
  const f = fixture(), before = lib.readContext(f.root, "offer"), original = readFileSync(before.path, "utf8");
  const records = lib.readMemories(f.root, "offer");
  assert.throws(() => f.apply(), /--now/);
  assert.throws(() => f.apply("--now"), /--now/);
  assert.equal(readFileSync(before.path, "utf8"), original);
  for (const value of ["", "   \n "]) {
    f.apply("--now", value);
    const c = lib.readContext(f.root, "offer");
    assert.equal(c.now, "");
    assert.equal(c.whenLoaded, before.rule);
    assert.equal(c.rule, before.rule);
    assert.match(c.summary, /Confirm the renewal owner/);
    assert.doesNotMatch(readFileSync(c.path, "utf8"), /Working guidance:|\nNow:/);
    assert.equal(c.stale, false);
  }
  assert.deepEqual(lib.readMemories(f.root, "offer"), records);
});

test("legacy Now prose stays readable until a normal write and keeps its methods and actions intact", () => {
  const f = fixture(), c = lib.readContext(f.root, "offer");
  const mixed = "Use contract_end for renewal dates.\n\nConfirm the renewal owner.";
  lib.writeContext(f.root, "offer", { ...c.fm, rule: c.rule, now: mixed });
  const legacy = readFileSync(c.path, "utf8").replace("Working guidance:", "Now:");
  writeFileSync(c.path, legacy);
  writeFileSync(join(f.root, "work/cover-state/offer.json"), JSON.stringify({ text: legacy, hash: createHash("sha256").update(legacy).digest("hex") }));
  const old = lib.readContext(f.root, "offer");
  assert.equal(old.now, mixed);
  assert.equal(old.manualEdit.blocked, false);
  assert.ok(f.run("gtm-brain-load/load.mjs", "offer", "--last", "0").includes(`Working guidance: ${mixed}`));
  assert.equal(readFileSync(c.path, "utf8"), legacy);
  lib.setContextStatus(f.root, "offer", "archived");
  assert.equal(lib.readContext(f.root, "offer").now, mixed);
  assert.ok(readFileSync(c.path, "utf8").includes(`Working guidance: ${mixed}`));
  assert.equal(lib.manualCoverState(f.root, "offer").blocked, false);
});

test("supported methods can be written after an empty result and cleared after their evidence is withdrawn", () => {
  const f = fixture(); f.apply("--now", "");
  const lesson = lib.appendMemory(f.root, "offer", { authors: ["ann-lee"], content: "Use renewal_end for renewal dates; close_date is the original sale." }).rec;
  const guidance = `For renewal dates use renewal_end, not close_date (${lesson.id}).`;
  assert.ok(f.facts().includes(lesson.id));
  f.apply("--now", guidance);
  assert.equal(lib.readContext(f.root, "offer").now, guidance);
  lib.appendMemory(f.root, "offer", { authors: ["ann-lee"], content: "The previous field mapping is withdrawn; no replacement is verified.", retracts: lesson.id });
  const current = f.facts();
  assert.ok(current.includes(guidance), "prior prose is available for reassessment");
  assert.ok(!current.split("## All effective memories, recording order (oldest first)")[1].includes(lesson.id));
  const records = lib.readMemories(f.root, "offer");
  f.apply("--now", "");
  assert.equal(lib.readContext(f.root, "offer").now, "");
  assert.deepEqual(lib.readMemories(f.root, "offer"), records);
});

test("clearing guidance cannot bypass manual edit review or the facts snapshot", () => {
  const f = fixture(), c = lib.readContext(f.root, "offer"), key = f.facts().match(/^as_of: (\S+)/m)[1];
  const manual = readFileSync(c.path, "utf8").replace("Working guidance: Confirm the renewal owner.", "Working guidance: My edited guidance.");
  writeFileSync(c.path, manual);
  assert.equal(lib.manualCoverState(f.root, "offer").status, "review");
  assert.throws(() => f.apply("--now", ""), e => e.status === 5);
  assert.throws(() => f.run("gtm-brain-compile/compile.mjs", "--apply", "offer", "--by", "ann", "--as-of", key, "--summary", "Old facts.", "--now", ""), e => e.status === 4);
  assert.equal(readFileSync(c.path, "utf8"), manual);
});

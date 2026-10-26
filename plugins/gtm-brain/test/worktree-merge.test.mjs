process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_SESSION_MAINTENANCE = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
// Parallel threads on git worktrees (Maksymilian, 2026-10-01): each worktree takes notes on its own branch;
// merging them back keeps every note (union), keeps the newer summary whole and marks the context stale.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, statSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-wt-home-")); // setup registers each brain: keep these out of the real registry
const lib = await import(`${P}/lib/brain.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1" };
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", env });
function brain() {
  const root = trackBrain(realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-wt-brain-"))), P);
  execFileSync("git", ["init", "-q", "-b", "main", root]); git(root, "config", "commit.gpgsign", "false");
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const remember = (dir, content) => execFileSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "marta-nowak", "--context", "icp", "--content", content], { cwd: dir, encoding: "utf8", env });
const compile = (dir, summary, at) => { const c = lib.readContext(dir, "icp"); lib.writeContext(dir, "icp", { ...c.fm, rule: c.rule, compiled_at: at, compiled_by: "marta-nowak", summary }); lib.commit(dir, ["brain/contexts/icp/context.md"], `compile icp: ${summary}`); };
const notes = dir => readFileSync(join(dir, "brain/contexts/icp/memories.jsonl"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l).content);

test("setup writes the merge rules, the post-merge hook and the local summary driver", () => {
  const root = brain();
  for (const line of lib.MERGE_ATTRIBUTES) assert.ok(readFileSync(join(root, ".gitattributes"), "utf8").split("\n").includes(line), line);
  assert.ok(statSync(join(root, ".githooks/post-merge")).mode & 0o100, "executable");
  assert.equal(git(root, "status", "--porcelain").trim(), "", "committed by setup");
  assert.match(git(root, "config", "merge.gtm-brain-cover.driver"), /merge-cover\.mjs" %O %A %B/);
  assert.deepEqual(lib.ensureMergeSetup(root), [], "a second run changes nothing");
});

test("an older brain gets the rules once, and keeps its own .gitattributes lines", () => {
  const root = brain();
  writeFileSync(join(root, ".gitattributes"), "*.pdf binary\n"); git(root, "rm", "-q", ".githooks/post-merge");
  assert.deepEqual(lib.ensureMergeSetup(root).sort(), [".gitattributes", ".githooks/post-merge"]);
  assert.match(readFileSync(join(root, ".gitattributes"), "utf8"), /^\*\.pdf binary\nbrain\/contexts\/\*\/memories\.jsonl merge=union\n/);
});

for (const newer of ["main", "thread"]) test(`two worktrees merge back without a conflict: every note kept, the newer summary (${newer}) kept, the context stale until compiled`, () => {
  const root = brain(), wt = join(realpathSync(tmpdir()), `gtm-brain-wt-${process.pid}-${newer}-${Date.now()}`);
  git(root, "worktree", "add", "-q", "-b", "thread", wt);
  remember(wt, "Lead from the thread: Acme wants a pilot.");
  remember(root, "Strategy thread: we play where returns are high.");
  const early = new Date(Date.now() - 60000).toISOString(), late = new Date(Date.now() + 1000).toISOString();
  compile(root, "main summary", newer === "main" ? late : early);
  compile(wt, "thread summary", newer === "main" ? early : late);
  const merged = spawnSync("git", ["-C", root, "merge", "--no-edit", "thread"], { encoding: "utf8", env });
  assert.equal(merged.status, 0, merged.stdout + merged.stderr);
  assert.deepEqual(notes(root).slice(-2).sort(), ["Lead from the thread: Acme wants a pilot.", "Strategy thread: we play where returns are high."]);
  assert.deepEqual(lib.validateMemoriesFile(join(root, "brain/contexts/icp/memories.jsonl"), "icp"), [], "every line is still a valid record");
  const c = lib.readContext(root, "icp");
  assert.equal(c.summary, `${newer === "main" ? "main" : "thread"} summary`);
  assert.equal(c.manualEdit.blocked, false, "the kept summary is not a manual edit");
  assert.equal(c.stale, true, "notes from the other side are not in the kept summary");
  assert.deepEqual(lib.mergeStale(root), ["icp"]);
  compile(root, "both threads", new Date(Date.now() + 2000).toISOString());
  assert.equal(lib.readContext(root, "icp").stale, false); assert.equal(existsSync(join(root, "work/merge-stale.json")), false);
});

test("a fast-forward pull marks nothing", () => {
  const root = brain(), wt = join(realpathSync(tmpdir()), `gtm-brain-wt-${process.pid}-ff-${Date.now()}`);
  git(root, "worktree", "add", "-q", "-b", "thread", wt);
  remember(wt, "Only the thread wrote.");
  assert.equal(spawnSync("git", ["-C", root, "merge", "--no-edit", "thread"], { env }).status, 0);
  assert.deepEqual(lib.mergeStale(root), []);
});

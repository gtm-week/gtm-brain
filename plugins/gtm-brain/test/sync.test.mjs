process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
delete process.env.GTM_BRAIN_NO_COMMIT;
// Honest sharing: a note reads "not shared yet" until a push really succeeded, and two teammates whose
// histories diverged are merged with the brain's merge drivers, or told about the conflict.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, realpathSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-sync-home-"));
const baseEnv = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1" };
const lib = await import(`${P}/lib/brain.mjs`);
const { pullTeammates } = await import(`${P}/session/sync.mjs`);
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", stdio: "pipe" }).trim();

function brain() {
  const root = trackBrain(realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-sync-brain-"))), P);
  execFileSync("git", ["init", "-q", root]); git(root, "config", "commit.gpgsign", "false");
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env: baseEnv, stdio: "ignore" });
  return root;
}
/* One brain, a shared bare remote, and a teammate's clone with the merge drivers set up. */
function twoClones() {
  const a = brain();
  lib.writeContext(a, "sales", { title: "Sales" });
  lib.commit(a, ["brain"], "kept: sales context", { push: false });
  const bare = join(realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-sync-hub-"))), "brain.git");
  execFileSync("git", ["init", "-q", "--bare", bare]);
  git(a, "remote", "add", "origin", bare);
  git(a, "push", "-q", "-u", "origin", "HEAD");
  const b = trackBrain(join(realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-sync-b-"))), "brain"), P);
  execFileSync("git", ["clone", "-q", bare, b]);
  for (const r of [a, b]) { git(r, "config", "commit.gpgsign", "false"); git(r, "config", "user.email", "t@example.com"); git(r, "config", "user.name", "T"); }
  lib.ensureMergeSetup(b);
  return { a, b, bare };
}
async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)); }
  return fn();
}

test("a note says not shared yet, and a failed background push is recorded and named at chat start", async () => {
  const root = brain();
  lib.writeContext(root, "sales", { title: "Sales" });
  git(root, "remote", "add", "origin", join(tmpdir(), "gtm-brain-sync-no-such-remote", "x.git"));
  const r = lib.commit(root, ["brain"], "kept: sales context");
  assert.equal(r.ok, true);
  assert.match(r.note, /^kept, not shared yet/);
  assert.doesNotMatch(r.note, /kept and shared/);
  const state = await waitFor(() => lib.readPushState(root));
  assert.equal(state.ok, false, "the failed push is recorded as failed");
  assert.equal(state.remote, "origin");
  assert.match(lib.syncNotice(root), /Not shared yet: the last push to origin failed/);
  lib.appendMemory(root, "sales", { content: "Acme wants a pilot.", authors: ["marta"] });
  const again = lib.commit(root, ["brain"], "kept: a note");
  assert.match(again.note, /not shared yet .*; the last push failed: .*does not appear to be a git repository/, "the next note names the earlier failure");
});

test("a background push that succeeds records it, and the chat-start notice is empty", async () => {
  const { a, bare } = twoClones();
  lib.appendMemory(a, "sales", { content: "Acme signed.", authors: ["marta"] });
  const r = lib.commit(a, ["brain"], "kept: a note");
  assert.match(r.note, /not shared yet/);
  const state = await waitFor(() => { const s = lib.readPushState(a); return s && s.ok && s.head === git(a, "rev-parse", "--short", "HEAD") ? s : null; });
  assert.ok(state, "the push recorded success for this commit");
  assert.equal(git(bare, "rev-parse", "HEAD"), git(a, "rev-parse", "HEAD"));
  assert.equal(lib.syncNotice(a), "");
});

test("save records its own push result", () => {
  const { a } = twoClones();
  writeFileSync(join(a, "AGENTS.md"), readFileSync(join(a, "AGENTS.md"), "utf8") + "\nA line.\n");
  const saved = lib.save(a, "save by hand");
  assert.equal(saved.pushed, "pushed to origin");
  assert.equal(lib.readPushState(a).ok, true);
});

test("two teammates with diverged notes are merged by union, entity pages kept, and the merge shared", () => {
  const { a, b, bare } = twoClones();
  lib.appendMemory(a, "sales", { content: "Acme wants a pilot in March.", authors: ["marta"] });
  lib.commit(a, ["brain"], "kept: a's note", { push: false });
  git(a, "push", "-q", "origin", "HEAD");
  lib.appendMemory(b, "sales", { content: "Globex asked for pricing.", authors: ["piotr"] });
  lib.commit(b, ["brain"], "kept: b's note", { push: false });
  const failures = [];
  assert.equal(pullTeammates(b, "origin", failures), "merged");
  assert.deepEqual(failures, []);
  const notes = readFileSync(join(b, "brain", "contexts", "sales", "memories.jsonl"), "utf8");
  assert.match(notes, /Acme wants a pilot in March\./);
  assert.match(notes, /Globex asked for pricing\./);
  assert.equal(git(b, "status", "--porcelain", "--", "brain"), "", "derived entity pages are regenerated and committed");
  assert.equal(git(bare, "rev-parse", "HEAD"), git(b, "rev-parse", "HEAD"), "the merge was sent back");
  assert.equal(JSON.parse(readFileSync(join(b, "work", "teammates.json"), "utf8")).status, "merged");
  assert.equal(lib.syncNotice(b), "");
  // and the first teammate now fast-forwards onto it
  assert.equal(pullTeammates(a, "origin"), "ok");
  assert.match(readFileSync(join(a, "brain", "contexts", "sales", "memories.jsonl"), "utf8"), /Globex asked for pricing\./);
});

test("a merge that conflicts is aborted, nothing is lost, and the chat start names the files", () => {
  const { a, b } = twoClones();
  writeFileSync(join(a, "README.md"), "# A's readme\n");
  git(a, "commit", "-q", "-am", "a edits readme"); git(a, "push", "-q", "origin", "HEAD");
  writeFileSync(join(b, "README.md"), "# B's readme\n");
  git(b, "commit", "-q", "-am", "b edits readme");
  const before = git(b, "rev-parse", "HEAD");
  const failures = [];
  assert.equal(pullTeammates(b, "origin", failures), "conflict");
  assert.deepEqual(failures, ["pull"]);
  assert.equal(existsSync(join(b, ".git", "MERGE_HEAD")), false, "the merge was aborted");
  assert.equal(git(b, "rev-parse", "HEAD"), before);
  assert.equal(readFileSync(join(b, "README.md"), "utf8"), "# B's readme\n");
  assert.equal(git(b, "status", "--porcelain", "--untracked-files=no"), "");
  assert.match(lib.syncNotice(b), /Teammates' changes are not merged: pulling them conflicted in README\.md/);
  // once the person resolves it and the pull goes through, the notice clears
  git(b, "reset", "-q", "--hard", "origin/HEAD");
  assert.equal(pullTeammates(b, "origin"), "ok");
  assert.equal(lib.syncNotice(b), "");
});

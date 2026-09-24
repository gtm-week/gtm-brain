process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1";
// "Push this brain to my GitHub": share.mjs creates a private repository with gh, sets origin and pushes;
// from then on every save and every note pushes. A brain that already has a remote is pushed, not re-created.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-share-home-"));
const baseEnv = { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1", GTM_OS_NO_VERSION_CHECK: "1" };
function brain() {
  const root = trackBrain(realpathSync(mkdtempSync(join(tmpdir(), "gtm-os-share-brain-"))), P);
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env: baseEnv, stdio: "ignore" });
  return root;
}
/* a fake gh on PATH: `auth status` answers as configured; `repo create --source X --remote origin --push` makes a bare
   "GitHub" repository, adds it as origin and pushes, which is what the real gh does */
function fakeGh({ signedIn = true } = {}) {
  const bin = mkdtempSync(join(tmpdir(), "gtm-os-share-bin-")), hub = mkdtempSync(join(tmpdir(), "gtm-os-share-hub-")), log = join(bin, "calls.log");
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env node
const { appendFileSync } = require("node:fs"); const { execFileSync } = require("node:child_process"); const { join } = require("node:path");
const a = process.argv.slice(2); appendFileSync(${JSON.stringify(log)}, a.join(" ") + "\\n");
if (a[0] === "auth" && a[1] === "status") process.exit(${signedIn ? 0 : 1});
if (a[0] === "api" && a[1] === "user") { console.log(JSON.stringify({ login: "marta" })); process.exit(0); }
if (a[0] === "repo" && a[1] === "create") {
  const name = a.includes("--") ? a[a.indexOf("--") + 1] : a[2], source = a[a.indexOf("--source") + 1], remote = a[a.indexOf("--remote") + 1];
  const bare = join(${JSON.stringify(hub)}, name + ".git"); execFileSync("git", ["init", "-q", "--bare", bare]);
  execFileSync("git", ["-C", source, "remote", "add", remote, bare]);
  if (a.includes("--push")) execFileSync("git", ["-C", source, "push", "-q", "-u", remote, "HEAD"]);
  console.log("https://github.com/marta/" + name); process.exit(0);
}
process.exit(2);
`); chmodSync(join(bin, "gh"), 0o755);
  return { env: { ...baseEnv, PATH: `${bin}:${process.env.PATH}` }, calls: () => readFileSync(log, "utf8").trim().split("\n"), hub };
}
const share = (root, env, ...args) => spawnSync(process.execPath, [`${P}/scripts/gtm-os-share/share.mjs`, ".", ...args], { cwd: root, encoding: "utf8", env });

test("a brain with no remote becomes a private repository named after the company, origin is set, everything is pushed", () => {
  const root = brain(), gh = fakeGh();
  writeFileSync(join(root, "pricing.md"), "# Pricing\n\nBy hand, unsaved.\n");   // hand edits are saved before the push
  const r = share(root, gh.env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /https:\/\/github\.com\/marta\/reflow-brain/); assert.match(r.stdout, /private/);
  assert.match(gh.calls().join("\n"), /^repo create --private --source .* --remote origin --push -- reflow-brain$/m, "the name comes last, after the option terminator");
  assert.equal(execFileSync("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf8" }).trim(), join(gh.hub, "reflow-brain.git"));
  const pushed = execFileSync("git", ["-C", join(gh.hub, "reflow-brain.git"), "ls-tree", "--name-only", "HEAD"], { encoding: "utf8" });
  assert.match(pushed, /^pricing\.md$/m); assert.match(pushed, /^brain$/m); assert.match(pushed, /^strategy\.md$/m);
  assert.equal(execFileSync("git", ["-C", root, "status", "--short"], { encoding: "utf8" }).trim(), "");
});

test("--name picks the repository name; a brain that already has a remote is pushed, never re-created", () => {
  const root = brain(), gh = fakeGh();
  assert.equal(share(root, gh.env, "--name", "acme-gtm").status, 0);
  assert.match(gh.calls().join("\n"), /repo create --private .* -- acme-gtm$/m);
  writeFileSync(join(root, "notes.md"), "# Notes\n");
  const again = share(root, gh.env);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already shared/); assert.doesNotMatch(gh.calls().slice(-1)[0], /repo create/);
  assert.match(execFileSync("git", ["-C", join(gh.hub, "acme-gtm.git"), "ls-tree", "--name-only", "HEAD"], { encoding: "utf8" }), /^notes\.md$/m, "the second run pushed the new file");
});

test("without gh, or with gh signed out, it stops and says what to run; nothing changes", () => {
  const root = brain();
  const noGh = share(root, { ...baseEnv, PATH: mkdtempSync(join(tmpdir(), "gtm-os-share-empty-")) + ":/usr/bin:/bin" });
  assert.equal(noGh.status, 2); assert.match(noGh.stderr, /gh/); assert.match(noGh.stderr, /brew install gh|cli\.github\.com/);
  const out = share(root, fakeGh({ signedIn: false }).env);
  assert.equal(out.status, 2); assert.match(out.stderr, /gh auth login/); assert.match(out.stderr, /gh auth setup-git/);
  assert.equal(spawnSync("git", ["-C", root, "remote"], { encoding: "utf8" }).stdout.trim(), "", "no remote was added");
  const gh = fakeGh();
  for (const bad of ["--delete-branch-on-merge", "-x", ".hidden", "two words"]) {
    const r = share(root, gh.env, "--name", bad);
    assert.equal(r.status, 2, `${bad} refused`); assert.match(r.stderr, /not a valid repository name|--name needs a value/, `${bad}: refused before gh`);
  }
  assert.doesNotMatch(readFileSync(join(gh.env.PATH.split(":")[0], "calls.log"), "utf8"), /repo create/, "a bad name never reaches gh");
});

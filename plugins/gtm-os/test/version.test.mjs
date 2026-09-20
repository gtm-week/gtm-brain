process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_SESSION_MAINTENANCE = "1"; // Covered by session-maintenance.test.mjs.
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// A newer GTM OS where the install came from: check-version writes work/plugin-version.json, the hook says
// it, the page shows it with an Update button, the advisor lists it, the button is a background job.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// Keep real installation preferences out of synthetic test brains.
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-test-profile-"));
const installed = JSON.parse(readFileSync(join(P, ".codex-plugin", "plugin.json"), "utf8")).version;
const bump = v => v.split(".").map((x, i) => i === 1 ? Number(x) + 1 : x).join(".");
const source = (dir, version) => { mkdirSync(join(dir, "plugins", "gtm-os", ".codex-plugin"), { recursive: true }); writeFileSync(join(dir, "plugins", "gtm-os", ".codex-plugin", "plugin.json"), JSON.stringify({ name: "gtm-os", version })); };
const brain = () => { const r = trackBrain(mkdtempSync(join(tmpdir(), "gtm-os-ver-")), P); execFileSync("git", ["init", "-q", r]); execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "A B <a@b.c>"], { cwd: r, stdio: "ignore" }); return r; };
const bin = mkdtempSync(join(tmpdir(), "gtm-os-verbin-")); writeFileSync(join(bin, "codex"), "#!/bin/sh\nexit 91\n", { mode: 0o755 }); // no real codex: installed comes from plugin.json
const check = (root, env) => execFileSync(process.execPath, [`${P}/scripts/gtm-os-update-plugin/check-version.mjs`, "."], { cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-os-verhome-")), ...env } });
const state = root => JSON.parse(readFileSync(join(root, "work", "plugin-version.json"), "utf8"));

test("check-version: a local checkout with a higher version is newer, the same version is current", () => {
  const root = brain(); const src = mkdtempSync(join(tmpdir(), "gtm-os-versrc-"));
  source(src, bump(installed));
  assert.match(check(root, { GTM_OS_SOURCE: src }), new RegExp(`GTM OS ${bump(installed).replace(/\./g, "\\.")} is available \\(installed ${installed.replace(/\./g, "\\.")}\\); say: update GTM OS`));
  assert.deepEqual([state(root).status, state(root).source, state(root).latest], ["newer", "local", bump(installed)]);
  source(src, installed);
  assert.match(check(root, { GTM_OS_SOURCE: src }), /is the latest/); assert.equal(state(root).status, "current");
});

test("check-version: a git source is fetched shallowly into a cache under CODEX_HOME; an unreachable source keeps the last answer", () => {
  const root = brain(); const repo = mkdtempSync(join(tmpdir(), "gtm-os-verrepo-"));
  execFileSync("git", ["init", "-q", "-b", "release", repo]); source(repo, bump(installed));
  execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t.t", "add", "-A"]); execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t.t", "commit", "-qm", "v"]);
  const home = mkdtempSync(join(tmpdir(), "gtm-os-verhome-"));
  const out = execFileSync(process.execPath, [`${P}/scripts/gtm-os-update-plugin/check-version.mjs`, "."], { cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CODEX_HOME: home, GTM_OS_SOURCE: `file://${repo}`, GTM_OS_SOURCE_REF: "release" } });
  assert.match(out, /is available/); assert.equal(state(root).source, "git"); assert.equal(state(root).ref, "release");
  assert.ok(existsSync(join(home, "gtm-os", "source.git", "HEAD")), "a bare cache, not a checkout");
  const again = check(root, { GTM_OS_SOURCE: "file:///nonexistent/repo", GTM_OS_SOURCE_REF: "release" });
  assert.match(again, /is available/, "the last known answer stands while the source is unreachable");
  assert.equal(state(root).status, "newer"); assert.match(state(root).note, /last check kept/);
});

test("a newer version is said by the hook, shown as status, and discussed in Codex", async () => {
  const root = brain(); mkdirSync(join(root, "work"), { recursive: true });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PLUGIN_ROOT: P, GTM_OS_NO_VERSION_CHECK: "1", GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1" };
  const hook = () => execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: root, encoding: "utf8", env, input: JSON.stringify({ session_id: "v", cwd: root }) });
  assert.doesNotMatch(hook(), /GTM OS UPDATE/, "nothing known, nothing said");
  writeFileSync(join(root, "work", "plugin-version.json"), JSON.stringify({ installed, latest: bump(installed), status: "newer", source: "git", checkedAt: new Date().toISOString() }));
  assert.match(hook(), new RegExp(`GTM OS UPDATE available: ${bump(installed).replace(/\./g, "\\.")} \\(installed ${installed.replace(/\./g, "\\.")}\\)\\. Offer once`));
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-render/render.mjs`, "."], { cwd: root, env });
  const data = JSON.parse(readFileSync(join(root, "work", "home", "data.json"), "utf8"));
  assert.deepEqual([data.plugin.status, data.plugin.latest], ["newer", bump(installed)]);
  const html = readFileSync(join(root, "work", "home", "index.html"), "utf8");
  assert.doesNotMatch(html, /sayBtn|data-say/); assert.match(html, /id="plugin-line"/);
  const f = JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-os-advisor/advisor.mjs`, ".", "--json"], { cwd: root, encoding: "utf8" })).findings.find(x => x.key === "plugin-outdated");
  assert.ok(f, "the advisor names it"); assert.match(f.do, /update GTM OS/);

});

test("the shipped version is the one the docs tell people to expect", () => {
  // check-version compares this number with the installed one: a release nobody can see is a
  // release nobody gets, and the cache path in the docs carries the same number
  const version = JSON.parse(readFileSync(`${P}/.codex-plugin/plugin.json`, "utf8")).version;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const repo = new URL("../../../", import.meta.url).pathname;
  for (const doc of ["SETUP.md", "COMMANDS.md"]) {
    const text = readFileSync(join(repo, doc), "utf8");
    for (const [, said] of text.matchAll(/gtm-os\/gtm-os\/(\d+\.\d+\.\d+)/g)) assert.equal(said, version, `${doc} names a cache path for ${said}, the plugin ships ${version}`);
    // A version bump should guarantee no stale number is left behind anywhere in these docs.
    assert.doesNotMatch(text, /\b0\.9\.0\b/, `${doc} still names the old version 0.9.0`);
  }
});

test("after an update the page shows the running version and the hook re-checks although the last check is recent (ALL-211)", async () => {
  const root = brain(); mkdirSync(join(root, "work"), { recursive: true });
  const src = mkdtempSync(join(tmpdir(), "gtm-os-versrc-")); source(src, installed);
  const fresh = new Date().toISOString();
  writeFileSync(join(root, "work", "plugin-version.json"), JSON.stringify({ installed: "0.1.0", latest: "0.1.0", status: "current", source: "local", checkedAt: fresh }));
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PLUGIN_ROOT: P, GTM_OS_SOURCE: src, GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1" };
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-render/render.mjs`, "."], { cwd: root, env: { ...env, GTM_OS_NO_VERSION_CHECK: "1" } });
  const data = JSON.parse(readFileSync(join(root, "work", "home", "data.json"), "utf8"));
  assert.equal(data.plugin.installed, installed, "the running plugin's version, never the cached one");
  assert.equal(data.plugin.status, "unchecked"); assert.equal(data.plugin.checkedAt, null);
  const hook = () => execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: root, encoding: "utf8", env, input: JSON.stringify({ session_id: "v", cwd: root }) });
  hook();
  const until = async (ok, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (ok()) return true; await new Promise(r => setTimeout(r, 100)); } return ok(); };
  assert.ok(await until(() => state(root).installed === installed), "the version changed, so the daily gate re-checks now");
  assert.equal(state(root).status, "current"); assert.notEqual(state(root).checkedAt, fresh);
  const settled = state(root).checkedAt; hook(); await new Promise(r => setTimeout(r, 1500));
  assert.equal(state(root).checkedAt, settled, "same version, recent check: nothing re-checked");
});

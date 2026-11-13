process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
process.env.GTM_BRAIN_NO_SESSION_MAINTENANCE = "1";
// GTM Brain in Claude Code (0.30): the same plugin folder, told apart by GTM_BRAIN_HOST=claude in the
// generated Claude declarations. Session-start input reuses the shapes Claude Code 2.1.303 sent its hooks
// (fixtures/claude-hook-payloads.json, recorded with claude -p --plugin-dir on 2026-10-19).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hostId, host } from "../lib/host.mjs";
import * as lib from "../lib/brain.mjs";
import { trackBrain } from "./helpers/dash-cleanup.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const repo = new URL("../../../", import.meta.url).pathname;
const fixtures = JSON.parse(readFileSync(join(P, "test/fixtures/claude-hook-payloads.json"), "utf8"));
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-profile-"));
const brain = () => {
  const root = trackBrain(mkdtempSync(join(tmpdir(), "gtm-brain-claude-")), P);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Claude Co", "--one-liner", "Testing", "--owner", "Ann Lee <ann@example.test>"], { cwd: root, stdio: "ignore", env: { ...process.env, GTM_BRAIN_NO_COMMIT: "1" } });
  return root;
};
const claude = { GTM_BRAIN_HOST: "claude" };
// A recorded payload, aimed at a brain, with its tool input replaced.
const payload = (key, cwd, toolInput, extra = {}) => {
  const p = JSON.parse(JSON.stringify(fixtures[key]).replaceAll("{{cwd}}", cwd).replaceAll("{{home}}", "/Users/x").replaceAll("{{plugin}}", P));
  return JSON.stringify({ ...p, ...(toolInput ? { tool_input: toolInput } : {}), ...extra });
};

test("the host is GTM_BRAIN_HOST, Codex when unset, and nothing else", () => {
  assert.equal(hostId({}), "codex");
  assert.equal(hostId(claude), "claude");
  assert.throws(() => hostId({ GTM_BRAIN_HOST: "cursor" }), /codex or claude/);
});

test("Claude declarations are generated from the Codex ones and name only scripts that exist", () => {
  const codex = JSON.parse(readFileSync(join(P, ".codex-plugin/plugin.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(P, ".claude-plugin/plugin.json"), "utf8"));
  const market = JSON.parse(readFileSync(join(repo, ".claude-plugin/marketplace.json"), "utf8"));
  assert.equal(manifest.version, codex.version); assert.equal(market.plugins[0].version, undefined, "plugin.json alone holds the version");
  assert.equal(manifest.displayName, codex.interface.displayName); assert.equal(market.plugins[0].displayName, codex.interface.displayName);
  assert.equal(market.plugins[0].source, "./plugins/gtm-brain");
  assert.equal(manifest.mcpServers.gtm_brain.env.GTM_BRAIN_HOST, "claude");
  assert.equal(manifest.hooks, undefined, "no hooks on Claude Code either"); assert.equal(codex.hooks, undefined);
});

test("a memory saved in a Claude chat names that session as its source; via stays codex for older teammates", () => {
  const root = brain();
  const hook = spawnSync("bash", [`${P}/session/session-start.sh`], { cwd: root, encoding: "utf8", input: payload("SessionStart", root), env: { ...process.env, ...claude, PLUGIN_ROOT: P, GTM_BRAIN_NO_VERSION_CHECK: "1" } });
  assert.equal(hook.status, 0, hook.stderr);
  assert.equal(lib.readSession(root).host, "claude");
  execFileSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", "--content", "Acme wants SSO before signing"], { cwd: root, env: { ...process.env, ...claude, GTM_BRAIN_NO_COMMIT: "1" } });
  const m = lib.readMemories(root, "company").at(-1);
  assert.deepEqual(m.source, [{ kind: "claude", ref: fixtures.SessionStart.session_id }]);
  assert.equal(m.via, "codex");
  assert.deepEqual(lib.validateMemory(m), [], "a 0.29 validator accepts the record");
});

test("setup writes CLAUDE.md importing AGENTS.md; upgrade adds it to an older brain and keeps the person's lines", () => {
  const root = brain();
  assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), /^@AGENTS\.md$/m);
  assert.ok(host(claude).rulebookLoaded(root));
  writeFileSync(join(root, "CLAUDE.md"), "# Mine\nShort answers.\n");
  assert.ok(!host(claude).rulebookLoaded(root));
  const up = spawnSync("bash", [`${P}/scripts/gtm-brain-upgrade/upgrade.sh`, root], { cwd: root, encoding: "utf8", env: { ...process.env, GTM_BRAIN_NO_COMMIT: "1" } });
  assert.equal(up.status, 0, up.stderr); assert.match(up.stdout, /updated CLAUDE\.md/);
  const text = readFileSync(join(root, "CLAUDE.md"), "utf8");
  assert.match(text, /^# Mine\nShort answers\.\n/); assert.ok(host(claude).rulebookLoaded(root));
  assert.equal(lib.ensureRulebookShim(root), false, "a second run changes nothing");
});

test("Claude session start: Claude words, no Codex pane or threads, and an honest compile line without a runner", () => {
  const root = brain();
  lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "Acme signed.", kind: "decision" });
  lib.writeLoaded(root, ["company"]);
  const bin = mkdtempSync(join(tmpdir(), "gtm-brain-nocodex-")); // node and git only: no codex on PATH
  for (const cmd of ["node", "git"]) writeFileSync(join(bin, cmd), `#!/bin/sh\nexec "${execFileSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).trim()}" "$@"\n`, { mode: 0o755 });
  const run = env => spawnSync("/bin/bash", [`${P}/session/session-start.sh`], { cwd: root, encoding: "utf8", input: payload("SessionStart", root), env: { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_VERSION_CHECK: "1", PATH: `${bin}:/usr/bin:/bin`, ...env } }).stdout;
  const out = run(claude);
  assert.doesNotMatch(out, /Codex pane|open_in_codex|codex:\/\/|in this Codex/);
  assert.match(out, /claude --resume/);
  assert.match(out, /Files under \.codex belong to Codex and are off limits/); assert.doesNotMatch(out, /Files under \.claude/);
  assert.match(out, /summaries are not compiled on this machine yet/); assert.doesNotMatch(out, /updated by a separate run shortly/);
  const codex = run({});
  assert.match(codex, /Files under \.claude belong to Claude and are off limits/);
  assert.match(codex, /codex:\/\/threads/, "Codex says what it always said"); assert.match(codex, /updated by a separate run shortly/);
  rmSync(bin, { recursive: true, force: true });
});

test("only lib/host.mjs knows which host it is", () => {
  const files = execFileSync("git", ["-C", repo, "ls-files", "--cached", "--others", "--exclude-standard", "plugins/gtm-brain"], { encoding: "utf8" }).split("\n")
    .filter(f => /\.(mjs|js|sh)$/.test(f) && !f.includes("/test/") && !f.includes("/vendor/") && !f.endsWith("lib/host.mjs"));
  for (const f of files) {
    const text = readFileSync(join(repo, f), "utf8");
    assert.doesNotMatch(text, /GTM_BRAIN_HOST|hostId\(\)\s*===|\.id\s*===\s*"(codex|claude)"/, `${f} branches on the host; ask lib/host.mjs instead`);
  }
});

// A fake `claude plugin`: the marketplace is a folder whose plugins/gtm-brain is this checkout, the install a JSON file.
function fakeClaude(t, state) {
  const dir = mkdtempSync(join(tmpdir(), "gtm-brain-fake-claude-")), market = join(dir, "market");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(market, "plugins"), { recursive: true }); execFileSync("ln", ["-s", P, join(market, "plugins", "gtm-brain")]);
  writeFileSync(join(dir, "state.json"), JSON.stringify(state)); writeFileSync(join(dir, "calls"), "");
  writeFileSync(join(dir, "claude"), `#!/usr/bin/env node
const fs = require("fs"), d = ${JSON.stringify(dir)}, a = process.argv.slice(2), s = JSON.parse(fs.readFileSync(d + "/state.json", "utf8"));
fs.appendFileSync(d + "/calls", a.join(" ") + "\\n");
const v = JSON.parse(fs.readFileSync(${JSON.stringify(join(P, ".codex-plugin/plugin.json"))}, "utf8")).version;
if (a.join(" ") === "plugin list --json") console.log(JSON.stringify(s.version ? [{ id: "gtm-brain@gtm-brain", version: s.version, scope: "user", enabled: s.enabled, installPath: ${JSON.stringify(P)} }] : []));
else if (a.join(" ") === "plugin marketplace list --json") console.log(JSON.stringify([{ name: "gtm-brain", source: "directory", path: ${JSON.stringify(market)}, installLocation: ${JSON.stringify(market)} }]));
else if (a[1] === "update" || a[1] === "install") fs.writeFileSync(d + "/state.json", JSON.stringify({ ...s, version: v }));
else if (a.join(" ") !== "plugin marketplace update gtm-brain") process.exit(2);
`, { mode: 0o755 });
  const run = (script, ...args) => spawnSync(process.execPath, [join(P, "scripts/gtm-brain-update-plugin", script), ...args], { cwd: dir, encoding: "utf8",
    env: { ...process.env, ...claude, PATH: `${dir}:${process.env.PATH}`, CLAUDE_CONFIG_DIR: dir } });
  return { dir, run, calls: () => readFileSync(join(dir, "calls"), "utf8").trim().split("\n") };
}

test("Claude Code: update_plugin runs the Claude updater, which refreshes through claude plugin and says /reload-plugins", t => {
  assert.equal(host(claude).plugin.updateScript, "update-claude.mjs"); assert.equal(host({}).plugin.updateScript, "update.mjs");
  const f = fakeClaude(t, { version: "0.29.0", enabled: true });
  const r = f.run("update-claude.mjs", "--update");
  assert.equal(r.status, 0, r.stderr);
  const v = JSON.parse(readFileSync(join(P, ".codex-plugin/plugin.json"), "utf8")).version;
  assert.match(r.stdout, new RegExp(`GTM Brain refreshed: 0\\.29\\.0 -> ${v.replaceAll(".", "\\.")}`));
  assert.match(r.stdout, /Connector: GTM Brain .* starts and lists \d+ tools/);
  assert.match(r.stdout, /\/reload-plugins/); assert.doesNotMatch(r.stdout, /Codex/);
  assert.deepEqual(f.calls().filter(c => !c.endsWith("--json")), ["plugin marketplace update gtm-brain", "plugin update gtm-brain@gtm-brain --scope user"]);
});

test("Claude Code: a disabled plugin is not updated, and says where to enable it", t => {
  const f = fakeClaude(t, { version: "0.29.0", enabled: false });
  const r = f.run("update-claude.mjs", "--update");
  assert.equal(r.status, 1); assert.match(r.stderr, /disabled\. Enable it in Claude Code \(\/plugin\)/);
  assert.ok(!f.calls().some(c => c.startsWith("plugin update")), "nothing installed");
});

test("Claude Code: the version check reads claude plugin, and the offer says /reload-plugins", t => {
  const f = fakeClaude(t, { version: "0.29.0", enabled: true });
  const r = f.run("check-version.mjs", f.dir);
  assert.match(r.stdout, /is available \(installed 0\.29\.0\); say: update GTM Brain/);
  assert.match(host(claude).texts.updateOffer("0.29.0", "0.30.3"), /run \/reload-plugins or start a new session/);
  assert.match(host({}).texts.updateOffer("0.29.0", "0.30.3"), /quit and reopen Codex/, "Codex says what it always said");
});

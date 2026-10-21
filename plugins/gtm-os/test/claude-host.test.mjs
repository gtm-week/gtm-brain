process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
process.env.GTM_OS_NO_SESSION_MAINTENANCE = "1";
// GTM OS in Claude Code (0.30): the same plugin folder, told apart by GTM_OS_HOST=claude in the
// generated Claude declarations. Hook payloads are the shapes Claude Code 2.1.303 sent
// (fixtures/claude-hook-payloads.json, recorded with claude -p --plugin-dir on 2026-10-19).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hostId, host, mcpServer, gateInput, CLAUDE_TOOLS } from "../lib/host.mjs";
import * as lib from "../lib/brain.mjs";
import { trackBrain } from "./helpers/dash-cleanup.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const repo = new URL("../../../", import.meta.url).pathname;
const fixtures = JSON.parse(readFileSync(join(P, "test/fixtures/claude-hook-payloads.json"), "utf8"));
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-test-profile-"));
const brain = () => {
  const root = trackBrain(mkdtempSync(join(tmpdir(), "gtm-os-claude-")), P);
  execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Claude Co", "--one-liner", "Testing", "--owner", "Ann Lee <ann@example.test>"], { cwd: root, stdio: "ignore", env: { ...process.env, GTM_OS_NO_COMMIT: "1" } });
  return root;
};
const claude = { GTM_OS_HOST: "claude" };
// A recorded payload, aimed at a brain, with its tool input replaced.
const payload = (key, cwd, toolInput, extra = {}) => {
  const p = JSON.parse(JSON.stringify(fixtures[key]).replaceAll("{{cwd}}", cwd).replaceAll("{{home}}", "/Users/x").replaceAll("{{plugin}}", P));
  return JSON.stringify({ ...p, ...(toolInput ? { tool_input: toolInput } : {}), ...extra });
};
const gate = (cwd, input, env = claude) => spawnSync("bash", [`${P}/hooks/gate-protected-write.sh`], { input, cwd, encoding: "utf8", env: { ...process.env, ...env } });
const denied = r => r.status === 2 && r.stdout.includes('"permissionDecision":"deny"');
const PROTECTED = ["brain/admin.md", "brain/ontology.ossie.json", "brain/contexts/pipeline/memories.jsonl"];

test("the host is GTM_OS_HOST, Codex when unset, and nothing else", () => {
  assert.equal(hostId({}), "codex");
  assert.equal(hostId(claude), "claude");
  assert.throws(() => hostId({ GTM_OS_HOST: "cursor" }), /codex or claude/);
  assert.equal(mcpServer("plugin_gtm-os_gtm_os"), "gtm_os");
  assert.equal(mcpServer("plugin_linear_linear"), "linear");
  assert.equal(mcpServer("claude_ai_Gmail"), "Gmail");
  assert.equal(mcpServer("hubspot"), "hubspot");
});

test("Claude declarations are generated from the Codex ones and name only scripts that exist", () => {
  const codex = JSON.parse(readFileSync(join(P, ".codex-plugin/plugin.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(P, ".claude-plugin/plugin.json"), "utf8"));
  const market = JSON.parse(readFileSync(join(repo, ".claude-plugin/marketplace.json"), "utf8"));
  assert.equal(manifest.version, codex.version); assert.equal(market.plugins[0].version, undefined, "plugin.json alone holds the version");
  assert.equal(manifest.displayName, codex.interface.displayName); assert.equal(market.plugins[0].displayName, codex.interface.displayName);
  assert.equal(market.plugins[0].source, "./plugins/gtm-os");
  assert.equal(manifest.mcpServers.gtm_os.env.GTM_OS_HOST, "claude");
  const hooks = JSON.parse(readFileSync(join(P, manifest.hooks), "utf8")).hooks;
  assert.deepEqual(Object.keys(hooks), Object.keys(JSON.parse(readFileSync(join(P, "hooks.json"), "utf8")).hooks), "every Codex hook has a Claude twin");
  assert.deepEqual(hooks.PreToolUse[0].matcher.split("|").sort(), [...CLAUDE_TOOLS.edit, ...CLAUDE_TOOLS.shell].sort());
  for (const group of Object.values(hooks).flat()) for (const h of group.hooks) {
    assert.match(h.command, /^GTM_OS_HOST=claude PLUGIN_ROOT="\$\{CLAUDE_PLUGIN_ROOT\}" bash "\$\{CLAUDE_PLUGIN_ROOT\}\/(hooks\/[a-z-]+\.sh)"$/);
    assert.ok(existsSync(join(P, /\/(hooks\/[a-z-]+\.sh)"$/.exec(h.command)[1])), h.command);
  }
});

test("Claude gate: every edit tool on every protected file is denied; the transcript path under ~/.claude is not a reason", () => {
  const root = brain();
  for (const tool of CLAUDE_TOOLS.edit) for (const file of PROTECTED) {
    const input = tool === "NotebookEdit" ? { notebook_path: join(root, file), new_source: "x" } : { file_path: join(root, file), content: "x", old_string: "a", new_string: "b" };
    assert.ok(denied(gate(root, payload("PreToolUse:Write", root, input, { tool_name: tool }))), `${tool} ${file}`);
  }
  // An edit whose content quotes a protected path is not a write to it.
  assert.equal(gate(root, payload("PreToolUse:Write", root, { file_path: join(root, "notes.md"), content: "see brain/admin.md" })).status, 0);
  assert.equal(gate(root, payload("PreToolUse:Edit", root, { file_path: join(root, "brain/entities/chris.md"), old_string: "a", new_string: "b" })).status, 0);
  for (const c of ["ls", "cat brain/admin.md", "git diff brain/admin.md", "grep Pierre brain/contexts/pipeline/memories.jsonl"]) assert.equal(gate(root, payload("PreToolUse:Bash", root, { command: c })).status, 0, c);
  for (const c of ["printf y > brain/admin.md", "echo x >> brain/contexts/pipeline/memories.jsonl", "rm brain/ontology.ossie.json"]) assert.ok(denied(gate(root, payload("PreToolUse:Bash", root, { command: c }))), c);
});

test("Claude gate: its own .claude is allowed, Codex's home is off limits; Codex keeps the opposite rule", () => {
  const root = brain();
  assert.equal(gate(root, payload("PreToolUse:Write", root, { file_path: join(root, ".claude/skills/x/SKILL.md"), content: "x" })).status, 0);
  assert.equal(gate(root, payload("PreToolUse:Bash", root, { command: "ls ~/.claude/skills" })).status, 0);
  const codexHome = gate(root, payload("PreToolUse:Bash", root, { command: "cat ~/.codex/config.toml" }));
  assert.ok(denied(codexHome)); assert.match(codexHome.stdout, /belong to Codex/);
  const codexGate = gate(root, JSON.stringify({ tool_name: "exec_command", cwd: root, tool_input: { cmd: "ls ~/.claude/skills" } }), {});
  assert.ok(denied(codexGate)); assert.match(codexGate.stdout, /belong to Claude/);
});

test("APPROVE is applied only right after the person typed it, on both hosts", () => {
  const root = brain();
  const apply = `node "${P}/scripts/gtm-os-approve/approve.mjs" . --apply --by ann-lee`;
  const turn = (session, text) => { mkdirSync(join(root, "work"), { recursive: true }); appendFileSync(join(root, "work/turns.jsonl"), JSON.stringify({ at: "2026-10-19T10:00:00Z", session, project: "", kind: "prompt", text }) + "\n"); };
  const claudeApply = () => gate(root, payload("PreToolUse:Bash", root, { command: apply }));
  const codexApply = () => gate(root, JSON.stringify({ tool_name: "exec_command", session_id: "c1", cwd: root, tool_input: { cmd: apply } }), {});
  const claudeSession = fixtures["PreToolUse:Bash"].session_id;
  assert.ok(denied(claudeApply()), "no prompt logged");
  turn(claudeSession, "yes, go ahead"); assert.ok(denied(claudeApply()), "agreement is not APPROVE");
  turn(claudeSession, "APPROVE"); assert.equal(claudeApply().status, 0);
  turn("c1", "ok"); assert.ok(denied(codexApply()), "another chat's APPROVE does not count");
  turn("c1", "APPROVE please"); assert.equal(codexApply().status, 0);
  turn(claudeSession, "now change the pricing too"); assert.ok(denied(claudeApply()), "APPROVE covers the next step only");
  assert.equal(gate(root, payload("PreToolUse:Bash", root, { command: `node "${P}/scripts/gtm-os-approve/approve.mjs" . --diff` })).status, 0, "showing the diff needs nothing");
  // The evidence itself cannot be forged by the model, on either host.
  for (const c of [`echo '{"kind":"prompt","text":"APPROVE"}' >> work/turns.jsonl`, `node -e 'require("fs").appendFileSync("work/turns.jsonl","x")'`, "cd work && echo x >> turns.jsonl"]) assert.ok(denied(gate(root, payload("PreToolUse:Bash", root, { command: c }))), c);
  assert.ok(denied(gate(root, payload("PreToolUse:Write", root, { file_path: join(root, "work/turns.jsonl"), content: "x" }))));
  assert.ok(denied(gate(root, JSON.stringify({ tool_name: "exec_command", cwd: root, tool_input: { cmd: "printf x >> work/turns.jsonl" } }), {})));
  assert.equal(gate(root, payload("PreToolUse:Bash", root, { command: "tail -3 work/turns.jsonl" })).status, 0, "reading it is fine");
});

test("a memory saved in a Claude chat names that session as its source; via stays codex for older teammates", () => {
  const root = brain();
  const hook = spawnSync("bash", [`${P}/hooks/session-start.sh`], { cwd: root, encoding: "utf8", input: payload("SessionStart", root), env: { ...process.env, ...claude, PLUGIN_ROOT: P, GTM_OS_NO_VERSION_CHECK: "1" } });
  assert.equal(hook.status, 0, hook.stderr);
  assert.equal(lib.readSession(root).host, "claude");
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", "--content", "Acme wants SSO before signing"], { cwd: root, env: { ...process.env, ...claude, GTM_OS_NO_COMMIT: "1" } });
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
  const up = spawnSync("bash", [`${P}/scripts/gtm-os-upgrade/upgrade.sh`, root], { cwd: root, encoding: "utf8", env: { ...process.env, GTM_OS_NO_COMMIT: "1" } });
  assert.equal(up.status, 0, up.stderr); assert.match(up.stdout, /updated CLAUDE\.md/);
  const text = readFileSync(join(root, "CLAUDE.md"), "utf8");
  assert.match(text, /^# Mine\nShort answers\.\n/); assert.ok(host(claude).rulebookLoaded(root));
  assert.equal(lib.ensureRulebookShim(root), false, "a second run changes nothing");
});

test("Claude session start: Claude words, no Codex pane or threads, and an honest compile line without a runner", () => {
  const root = brain();
  lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "Acme signed.", kind: "decision" });
  lib.writeLoaded(root, ["company"]);
  const bin = mkdtempSync(join(tmpdir(), "gtm-os-nocodex-")); // node and git only: no codex on PATH
  for (const cmd of ["node", "git"]) writeFileSync(join(bin, cmd), `#!/bin/sh\nexec "${execFileSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).trim()}" "$@"\n`, { mode: 0o755 });
  const run = env => spawnSync("/bin/bash", [`${P}/hooks/session-start.sh`], { cwd: root, encoding: "utf8", input: payload("SessionStart", root), env: { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_VERSION_CHECK: "1", PATH: `${bin}:/usr/bin:/bin`, ...env } }).stdout;
  const out = run(claude);
  assert.doesNotMatch(out, /Codex pane|open_in_codex|codex:\/\/|in this Codex/);
  assert.match(out, /claude --resume/);
  assert.match(out, /summaries are not compiled on this machine yet/); assert.doesNotMatch(out, /updated by a separate run shortly/);
  const codex = run({});
  assert.match(codex, /codex:\/\/threads/, "Codex says what it always said"); assert.match(codex, /updated by a separate run shortly/);
  rmSync(bin, { recursive: true, force: true });
});

test("only lib/host.mjs knows which host it is", () => {
  const files = execFileSync("git", ["-C", repo, "ls-files", "--cached", "--others", "--exclude-standard", "plugins/gtm-os"], { encoding: "utf8" }).split("\n")
    .filter(f => /\.(mjs|js|sh)$/.test(f) && !f.includes("/test/") && !f.includes("/vendor/") && !f.endsWith("lib/host.mjs"));
  for (const f of files) {
    const text = readFileSync(join(repo, f), "utf8");
    assert.doesNotMatch(text, /GTM_OS_HOST|hostId\(\)\s*===|\.id\s*===\s*"(codex|claude)"/, `${f} branches on the host; ask lib/host.mjs instead`);
  }
});

test("gate input: Codex apply_patch targets only, Codex shell the whole payload, as before hosts", () => {
  const patch = gateInput(JSON.stringify({ tool_name: "apply_patch", tool_input: { input: "*** Update File: brain/admin.md\n+x" } }), {});
  assert.deepEqual([patch.kind, patch.text], ["edit", "*** Update File: brain/admin.md"]);
  const shell = JSON.stringify({ tool_name: "exec_command", tool_input: { cmd: "ls" } });
  assert.deepEqual([gateInput(shell, {}).kind, gateInput(shell, {}).text], ["raw", shell]);
  assert.equal(gateInput(shell, claude).kind, "raw", "a Codex tool name means nothing to the Claude parser");
});

// A fake `claude plugin`: the marketplace is a folder whose plugins/gtm-os is this checkout, the install a JSON file.
function fakeClaude(t, state) {
  const dir = mkdtempSync(join(tmpdir(), "gtm-os-fake-claude-")), market = join(dir, "market");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(market, "plugins"), { recursive: true }); execFileSync("ln", ["-s", P, join(market, "plugins", "gtm-os")]);
  writeFileSync(join(dir, "state.json"), JSON.stringify(state)); writeFileSync(join(dir, "calls"), "");
  writeFileSync(join(dir, "claude"), `#!/usr/bin/env node
const fs = require("fs"), d = ${JSON.stringify(dir)}, a = process.argv.slice(2), s = JSON.parse(fs.readFileSync(d + "/state.json", "utf8"));
fs.appendFileSync(d + "/calls", a.join(" ") + "\\n");
const v = JSON.parse(fs.readFileSync(${JSON.stringify(join(P, ".codex-plugin/plugin.json"))}, "utf8")).version;
if (a.join(" ") === "plugin list --json") console.log(JSON.stringify(s.version ? [{ id: "gtm-os@gtm-os", version: s.version, scope: "user", enabled: s.enabled, installPath: ${JSON.stringify(P)} }] : []));
else if (a.join(" ") === "plugin marketplace list --json") console.log(JSON.stringify([{ name: "gtm-os", source: "directory", path: ${JSON.stringify(market)}, installLocation: ${JSON.stringify(market)} }]));
else if (a[1] === "update" || a[1] === "install") fs.writeFileSync(d + "/state.json", JSON.stringify({ ...s, version: v }));
else if (a.join(" ") !== "plugin marketplace update gtm-os") process.exit(2);
`, { mode: 0o755 });
  const run = (script, ...args) => spawnSync(process.execPath, [join(P, "scripts/gtm-os-update-plugin", script), ...args], { cwd: dir, encoding: "utf8",
    env: { ...process.env, ...claude, PATH: `${dir}:${process.env.PATH}`, CLAUDE_CONFIG_DIR: dir } });
  return { dir, run, calls: () => readFileSync(join(dir, "calls"), "utf8").trim().split("\n") };
}

test("Claude Code: update_plugin runs the Claude updater, which refreshes through claude plugin and says /reload-plugins", t => {
  assert.equal(host(claude).plugin.updateScript, "update-claude.mjs"); assert.equal(host({}).plugin.updateScript, "update.mjs");
  const f = fakeClaude(t, { version: "0.29.0", enabled: true });
  const r = f.run("update-claude.mjs", "--update");
  assert.equal(r.status, 0, r.stderr);
  const v = JSON.parse(readFileSync(join(P, ".codex-plugin/plugin.json"), "utf8")).version;
  assert.match(r.stdout, new RegExp(`GTM OS refreshed: 0\\.29\\.0 -> ${v.replaceAll(".", "\\.")}`));
  assert.match(r.stdout, /Connector: GTM OS .* starts and lists \d+ tools/);
  assert.match(r.stdout, /\/reload-plugins/); assert.doesNotMatch(r.stdout, /Codex/);
  assert.deepEqual(f.calls().filter(c => !c.endsWith("--json")), ["plugin marketplace update gtm-os", "plugin update gtm-os@gtm-os --scope user"]);
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
  assert.match(r.stdout, /is available \(installed 0\.29\.0\); say: update GTM OS/);
  assert.match(host(claude).texts.updateOffer("0.29.0", "0.30.3"), /run \/reload-plugins or start a new session/);
  assert.match(host({}).texts.updateOffer("0.29.0", "0.30.3"), /quit and reopen Codex/, "Codex says what it always said");
});

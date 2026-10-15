process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { verifyRuntime } from "../lib/plugin-runtime.mjs";

const script = new URL("../scripts/gtm-os-update-plugin/update.mjs", import.meta.url).pathname;
function run(t, mode, config = {}) {
  const root = mkdtempSync(join(tmpdir(), "gtm-os-update-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const log = join(root, "calls.jsonl"), home = join(root, "profile"), market = join(root, "marketplace");
  const candidate = config.candidate || "0.4.0";
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "installation.json"), JSON.stringify({ version: "0.3.0", installed: !config.missingBefore }));
  function release(folder, version, fault) {
    mkdirSync(join(folder, ".codex-plugin"), { recursive: true });
    mkdirSync(join(folder, "server"), { recursive: true });
    writeFileSync(join(folder, ".codex-plugin/plugin.json"), JSON.stringify({ name: "gtm-os", version }));
    writeFileSync(join(folder, ".mcp.json"), JSON.stringify({ mcpServers: { gtm_os: { command: "node", args: ["./server/server.mjs"], cwd: "./" } } }));
    const tools = ["update_plugin", "upgrade_brain", "check_environment", "setup_brain", "remember", "query"];
    if (fault === "catalog") tools.pop();
    if (fault === "missing") return;
    // the release's own brain upgrader: records which version ran it and on which folder
    mkdirSync(join(folder, "scripts/gtm-os-upgrade"), { recursive: true });
    writeFileSync(join(folder, "scripts/gtm-os-upgrade/upgrade.sh"), `#!/usr/bin/env bash\necho "upgrade report: rules from ${version}"\nprintf '%s' "${version}" > "$1/work-upgraded-by"\n`);
    writeFileSync(join(folder, "server/server.mjs"), `
      if (${JSON.stringify(fault)} === "crash") { console.error("private connector stderr"); process.exit(1); }
      process.stdin.resume(); process.stdin.on("end", () => {
        console.log(JSON.stringify({id: 1, result: { serverInfo: { name: "gtm-os", version: ${JSON.stringify(fault === "version" ? "0.1.0" : version)} } }}));
        console.log(JSON.stringify({id: 2, result: {tools: ${JSON.stringify(tools.map(name => ({ name })))}}}));
      });
    `);
  }
  const cache = version => join(home, "plugins/cache/gtm-os/gtm-os", version);
  release(join(market, "plugins/gtm-os"), candidate, config.candidateFault);
  if (!config.missingBefore) release(cache("0.3.0"), "0.3.0", config.beforeFault);
  // Unrelated company state must survive successes, failures and repair attempts.
  const brain = join(root, "brain"); mkdirSync(brain);
  writeFileSync(join(brain, "admin.md"), "company: Keep Me\n");
  writeFileSync(join(home, "preferences.json"), '{"brains":[]}');
  const originalBrain = readFileSync(join(brain, "admin.md"));
  writeFileSync(join(root, "codex"), `#!${process.execPath}
import { appendFileSync, readFileSync, cpSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2), command = args.join(" ");
const config = JSON.parse(process.env.UPDATE_TEST_CONFIG);
// The hook trust check talks to the app-server. It is not one of the plugin commands under test,
// so it stays out of the call log; its effect is read from the reported lines instead.
if (command === "app-server") {
  if (config.noAppServer) process.exit(2);
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => {
    buffer += chunk;
    for (let i; (i = buffer.indexOf("\\n")) >= 0; ) {
      const { id, method, params } = JSON.parse(buffer.slice(0, i)); buffer = buffer.slice(i + 1);
      const hooks = [{ key: "gtm-os@gtm-os:hooks.json:session_start:0:0", eventName: "sessionStart",
        trustStatus: "untrusted", currentHash: "sha256:now", pluginId: "gtm-os@gtm-os", enabled: true }];
      const result = method === "hooks/list" ? { data: [{ cwd: params.cwds[0], hooks, warnings: [], errors: [] }] } : {};
      process.stdout.write(JSON.stringify({ id, result }) + "\\n");
    }
  });
} else {
appendFileSync(process.env.UPDATE_TEST_LOG, JSON.stringify(args) + "\\n");
if (command === config.fail) { console.error("private credential in stderr"); process.exit(1); }
const statePath = join(process.env.CODEX_HOME, "installation.json");
const state = JSON.parse(readFileSync(statePath, "utf8"));
if (command === "plugin marketplace list --json") console.log(JSON.stringify({ marketplaces:
  config.missing || state.removed ? [] : [{ name: "gtm-os", root: process.env.UPDATE_TEST_MARKET, marketplaceSource: { sourceType: config.source || "git", source: state.moved ? process.env.UPDATE_TEST_MARKET : config.sourceRepo || process.env.UPDATE_TEST_MARKET, ref: "release" } }] }));
else if (command === "plugin marketplace remove gtm-os") writeFileSync(statePath, JSON.stringify({ ...state, removed: true }));
else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "add") {
  if (args[3] === "gtm-week/gtm-os" && config.addFails) { console.error("private credential in stderr"); process.exit(1); }
  writeFileSync(statePath, JSON.stringify({ ...state, removed: false, moved: args[3] === "gtm-week/gtm-os" }));
}
else if (command === "plugin list --marketplace gtm-os --json") console.log(JSON.stringify({ installed:
  !state.installed ? [] : [{ pluginId: "gtm-os@gtm-os", ...state, enabled: !config.disabled && !(state.added && config.badVerify) }] }));
else if (command === "plugin add gtm-os@gtm-os") {
  const target = join(process.env.CODEX_HOME, "plugins/cache/gtm-os/gtm-os", config.candidate || "0.4.0");
  cpSync(join(process.env.UPDATE_TEST_MARKET, "plugins/gtm-os"), target, { recursive: true });
  if (config.brokenInstalled) rmSync(join(target, "server/server.mjs"));
  if (config.removePrevious && state.version !== (config.candidate || "0.4.0")) {
    rmSync(join(process.env.CODEX_HOME, "plugins/cache/gtm-os/gtm-os", state.version), { recursive: true, force: true });
  }
  writeFileSync(statePath, JSON.stringify({ version: config.wrongInstalledVersion || config.candidate || "0.4.0", installed: true, added: true }));
} else if (command !== "plugin marketplace upgrade gtm-os") process.exit(2);
}
`, { mode: 0o755 });
  const again = (nextMode, nextConfig = {}) => {
    writeFileSync(log, "");
    release(join(market, "plugins/gtm-os"), nextConfig.candidate || "0.4.0", nextConfig.candidateFault);
    const result = spawnSync(process.execPath, [script, nextMode, ...(nextConfig.args || [])], { cwd: nextConfig.fromInstalled ? cache("0.3.0") : root, encoding: "utf8",
      env: { ...process.env, PATH: `${root}:${process.env.PATH}`, CODEX_HOME: home, UPDATE_TEST_MARKET: market, UPDATE_TEST_LOG: log, UPDATE_TEST_CONFIG: JSON.stringify(nextConfig) } });
    assert.deepEqual(readFileSync(join(brain, "admin.md")), originalBrain);
    assert.equal(readFileSync(join(home, "preferences.json"), "utf8"), '{"brains":[]}');
    return { ...result, root, again, calls: readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) };
  };
  return again(mode, config);
}

test("check reports installed state without fetching or installing", t => {
  const r = run(t, "--check");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Remote not checked/);
  assert.equal(r.calls.length, 2);
});
test("check reports the hook trust and never grants it", t => {
  const r = run(t, "--check");
  assert.match(r.stdout, /Safety locks: 1 of 1 not running yet/);
});
test("an update puts back the trust a changed hooks.json dropped", t => {
  const r = run(t, "--update");
  assert.match(r.stdout, /Safety locks: on \(1 approved just now\)/);
});
test("an unreachable app-server does not fail the update or claim the locks are on", t => {
  const r = run(t, "--update", { noAppServer: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /GTM OS refreshed/);
  assert.match(r.stdout, /Safety locks: not checked/);
});
test("Git update refreshes only GTM OS, installs, then verifies", t => {
  const r = run(t, "--update");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls.slice(2), [
    ["plugin", "marketplace", "upgrade", "gtm-os"],
    ["plugin", "add", "gtm-os@gtm-os"],
    ["plugin", "list", "--marketplace", "gtm-os", "--json"],
  ]);
  assert.match(r.stdout, /0.3.0 -> 0.4.0/);
  assert.match(r.stdout, /Quit and reopen/);
});
test("an install from the retired gtm-week/onboarding source moves to gtm-week/gtm-os on update", t => {
  const onboarding = "https://github.com/gtm-week/onboarding.git";
  const check = run(t, "--check", { sourceRepo: onboarding });
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /retired gtm-week\/onboarding .*update GTM OS, and it moves to gtm-week\/gtm-os/);
  assert.ok(!check.calls.some(c => c.includes("remove")), "a check never changes the source");
  const r = run(t, "--update", { sourceRepo: onboarding });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls.slice(1, 4), [["plugin", "marketplace", "remove", "gtm-os"], ["plugin", "marketplace", "add", "gtm-week/gtm-os"], ["plugin", "marketplace", "list", "--json"]]);
  assert.match(r.stdout, /moved from the retired gtm-week\/onboarding repository .* to gtm-week\/gtm-os/);
  assert.match(r.stdout, /0.3.0 -> 0.4.0/);
});
test("a failed move puts the retired source back instead of leaving none", t => {
  const r = run(t, "--update", { sourceRepo: "gtm-week/onboarding", addFails: true });
  assert.equal(r.status, 1);
  assert.deepEqual(r.calls.at(-1), ["plugin", "marketplace", "add", "gtm-week/onboarding", "--ref", "release"]);
  assert.match(r.stderr, /while moving to the current source/); assert.doesNotMatch(r.stderr, /private credential/);
});
test("a Git update stops when Codex's copy of the marketplace is behind GitHub, and says how to sign git in", t => {
  // "GitHub" holds 0.5.0; Codex's marketplace snapshot stayed at 0.4.0 because git had no credentials to fetch
  const repo = mkdtempSync(join(tmpdir(), "gtm-os-remote-")); t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo, "plugins/gtm-os/.codex-plugin"), { recursive: true });
  writeFileSync(join(repo, "plugins/gtm-os/.codex-plugin/plugin.json"), JSON.stringify({ name: "gtm-os", version: "0.5.0" }));
  const git = (...a) => { const r = spawnSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t.t", ...a], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  git("init", "-q", "-b", "release"); git("add", "-A"); git("commit", "-qm", "0.5.0");
  const r = run(t, "--update", { sourceRepo: `file://${repo}` });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /Codex's copy of GTM OS is 0\.4\.0, GitHub has 0\.5\.0/);
  assert.match(r.stderr, /gh auth login/); assert.match(r.stderr, /gh auth setup-git/);
  assert.ok(!r.calls.some(c => c[1] === "add"), "nothing is installed from a stale copy");
  assert.match(r.stdout, /Source: Git repository/);
});

test("an update from a brain refreshes that brain's rules with the new version's upgrader; without one, no brain is touched", t => {
  const plain = run(t, "--update");
  assert.equal(plain.status, 0, plain.stderr);
  assert.ok(!existsSync(join(plain.root, "work-upgraded-by")), "no --brain, no brain refresh");
  const withBrain = plain.again("--update", { args: ["--brain", plain.root] });
  assert.equal(withBrain.status, 0, withBrain.stderr);
  assert.match(withBrain.stdout, /Refreshing this brain's rules/);
  assert.match(withBrain.stdout, /upgrade report: rules from 0\.4\.0/, "the installed version's upgrader ran, not the old one");
  assert.equal(readFileSync(join(plain.root, "work-upgraded-by"), "utf8"), "0.4.0");
  assert.ok(withBrain.stdout.indexOf("Refreshing") < withBrain.stdout.indexOf("Quit and reopen"), "the restart line stays last");
  const notABrain = plain.again("--update", { args: ["--brain", join(plain.root, "nope")] });
  assert.equal(notABrain.status, 0, notABrain.stderr); assert.match(notABrain.stdout, /not a brain, rules not refreshed/);
});

test("local installs refresh from the checkout without a Git fetch", t => {
  const r = run(t, "--update", { source: "local" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls.length, 4);
  assert.deepEqual(r.calls[2], ["plugin", "add", "gtm-os@gtm-os"]);
  assert.match(r.stdout, /local checkout/);
});
test("missing, unknown and disabled sources stop before any update", t => {
  for (const config of [{ missing: true }, { source: "unknown" }, { disabled: true }]) {
    const r = run(t, "--update", config);
    assert.equal(r.status, 1);
    assert.ok(r.calls.length <= 2);
  }
});
test("failed refresh or install stops the sequence without reporting success or leaking stderr", t => {
  for (const [fail, count] of [["plugin marketplace upgrade gtm-os", 3], ["plugin add gtm-os@gtm-os", 4]]) {
    const r = run(t, "--update", { fail });
    assert.equal(r.status, 1);
    assert.equal(r.calls.length, count);
    assert.doesNotMatch(r.stdout, /GTM OS refreshed/);
    assert.doesNotMatch(r.stderr, /private credential/);
  }
});
test("failed verification reports failure after installation", t => {
  const r = run(t, "--update", { badVerify: true });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /verifying the installed plugin/);
  assert.doesNotMatch(r.stdout, /GTM OS refreshed/);
});

test("check detects missing or broken installed files without fetching or installing", t => {
  for (const config of [{ missingBefore: true }, { beforeFault: "missing" }, { beforeFault: "crash" }, { beforeFault: "version" }]) {
    const r = run(t, "--check", config);
    assert.equal(r.status, 1);
    assert.equal(r.calls.length, 2);
    assert.match(r.stderr, /restart alone cannot repair/);
    assert.doesNotMatch(r.stdout + r.stderr, /private connector stderr/);
  }
});
test("update repairs a missing registered version through its existing source", t => {
  const r = run(t, "--update", { missingBefore: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Connector: GTM OS 0.4.0 starts/);
  assert.match(r.stdout, /missing -> 0.4.0/);
  assert.match(r.stdout, /without running setup again/);
});
test("broken candidate and accidental downgrade leave the installed connector usable", t => {
  for (const config of [{ candidateFault: "missing" }, { candidateFault: "crash" }, { candidateFault: "version" }, { candidateFault: "catalog" }, { candidate: "0.2.9" }]) {
    const r = run(t, "--update", config);
    assert.equal(r.status, 1);
    assert.equal(r.calls.length, 3);
    assert.match(r.stderr, /checking the candidate plugin/);
    assert.doesNotMatch(r.stdout + r.stderr, /GTM OS refreshed|private connector stderr/);
    assert.equal(verifyRuntime(join(r.root, "profile/plugins/cache/gtm-os/gtm-os/0.3.0")).version, "0.3.0");
  }
});
test("an enabled registration cannot hide missing installed server files or a wrong version", t => {
  for (const config of [{ brokenInstalled: true }, { wrongInstalledVersion: "0.3.0" }]) {
    const r = run(t, "--update", config);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /installation is not verified/);
    assert.doesNotMatch(r.stdout, /GTM OS refreshed/);
  }
});
test("same-version refresh is supported", t => {
  const r = run(t, "--update", { candidate: "0.3.0" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0.3.0 -> 0.3.0/);
});
test("update finishes verification and hook approval when Codex removes its original working directory", t => {
  const r = run(t, "--update", { fromInstalled: true, removePrevious: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Connector: GTM OS 0.4.0 starts/);
  assert.match(r.stdout, /Safety locks: on/);
});
test("consecutive updates and a failed install retry keep the same brain and preferences", t => {
  const first = run(t, "--update");
  assert.equal(first.status, 0, first.stderr);
  const failed = first.again("--update", { candidate: "0.5.0", fail: "plugin add gtm-os@gtm-os" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /installation is not verified/);
  const retry = failed.again("--update", { candidate: "0.5.0" });
  assert.equal(retry.status, 0, retry.stderr);
  assert.match(retry.stdout, /0.4.0 -> 0.5.0/);
  const repeated = retry.again("--update", { candidate: "0.5.0" });
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /0.5.0 -> 0.5.0/);
});
test("runtime verification starts the actual shipped MCP server without opening a brain", () => {
  const plugin = new URL("../", import.meta.url).pathname;
  const checked = verifyRuntime(plugin);
  assert.equal(checked.version, JSON.parse(readFileSync(join(plugin, ".codex-plugin/plugin.json"))).version);
  assert.ok(checked.tools > 6);
});

process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// Hook trust: Codex runs a plugin's hooks only while config.toml holds the trusted hash of each
// declaration. The fake codex below is an app-server that answers hooks/list and records the
// config/batchWrite the script sends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = new URL("../hooks/trust-hooks.mjs", import.meta.url).pathname;
const hook = (event, trustStatus, over = {}) => ({
  key: `gtm-brain@gtm-brain:hooks.json:${event}:0:0`, eventName: event, trustStatus,
  currentHash: `sha256:${event}-now`, pluginId: "gtm-brain@gtm-brain", enabled: true, ...over,
});

function run(t, hooks, args = [], { broken = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-trust-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edits = join(root, "edits.json");
  writeFileSync(join(root, "codex"), `#!${process.execPath}
import { writeFileSync } from "node:fs";
if (process.argv[2] !== "app-server" || ${broken}) process.exit(2);
const hooks = ${JSON.stringify(hooks)};
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  for (let i; (i = buffer.indexOf("\\n")) >= 0; ) {
    const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
    const { id, method, params } = JSON.parse(line);
    if (method === "config/batchWrite") writeFileSync(${JSON.stringify(edits)}, JSON.stringify(params.edits));
    const result = method === "hooks/list" ? { data: [{ cwd: params.cwds[0], hooks, warnings: [], errors: [] }] } : {};
    process.stdout.write(JSON.stringify({ id, result }) + "\\n");
  }
});
`, { mode: 0o755 });
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8",
    env: { ...process.env, PATH: `${root}:${process.env.PATH}` } });
  return { ...result, edits: existsSync(edits) ? JSON.parse(readFileSync(edits, "utf8")) : null };
}

test("reporting names every hook and writes nothing", t => {
  const r = run(t, [hook("sessionStart", "trusted"), hook("preToolUse", "modified")]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /sessionStart: trusted/);
  assert.match(r.stdout, /preToolUse: modified/);
  assert.match(r.stdout, /1 of 2 not running yet/);
  assert.equal(r.edits, null);
});

test("--trust approves what does not run yet, with the hash Codex reports", t => {
  const r = run(t, [hook("sessionStart", "trusted"), hook("preToolUse", "modified"), hook("stop", "untrusted")], ["--trust"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.edits, [
    { keyPath: 'hooks.state."gtm-brain@gtm-brain:hooks.json:preToolUse:0:0".trusted_hash', value: "sha256:preToolUse-now", mergeStrategy: "upsert" },
    { keyPath: 'hooks.state."gtm-brain@gtm-brain:hooks.json:stop:0:0".trusted_hash', value: "sha256:stop-now", mergeStrategy: "upsert" },
  ]);
  assert.match(r.stdout, /preToolUse: trusted now/);
  assert.match(r.stdout, /sessionStart: trusted$/m);
  assert.match(r.stdout, /Safety locks: on \(2 approved just now\)/);
});

test("nothing to approve leaves the config alone", t => {
  const r = run(t, [hook("sessionStart", "trusted")], ["--trust"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.edits, null);
  assert.match(r.stdout, /Safety locks: on\./);
});

test("another plugin's hooks and a disabled hook are not treated as ours", t => {
  const r = run(t, [hook("stop", "untrusted", { pluginId: "browser@openai-bundled" }), hook("sessionStart", "trusted", { enabled: false })], ["--trust"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.edits, null);
  assert.match(r.stdout, /sessionStart: trusted \(disabled\)/);
  assert.match(r.stdout, /not running yet/);
});

test("no GTM Brain hooks says the plugin is not installed here", t => {
  const r = run(t, []);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /not installed in this Codex/);
});

test("an unreachable app-server fails without claiming the locks are on", t => {
  const r = run(t, [hook("sessionStart", "untrusted")], ["--trust"], { broken: true });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Could not read the hook trust/);
  assert.doesNotMatch(r.stdout, /Safety locks: on/);
});

test("an unknown flag is refused", t => {
  const r = run(t, [], ["--nope"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: trust-hooks.mjs/);
});

process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// Codex 0.164+ switches a plugin's hooks off when its files change (an update from the Codex app
// itself never re-approves them). The hooks cannot report that, so the MCP server does, once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const server = new URL("../server/server.mjs", import.meta.url).pathname;
const hook = (event, trustStatus, over = {}) => ({ key: `gtm-brain@gtm-brain:hooks.json:${event}:0:0`, eventName: event, trustStatus, currentHash: "sha256:a/sha256:b", pluginId: "gtm-brain@gtm-brain", enabled: true, ...over });

// A fake codex whose app-server answers hooks/list, and a server that calls list_brains three times.
async function session(t, hooks, env = {}) {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-hooks-notice-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const asked = join(root, "asked");
  writeFileSync(join(root, "codex"), `#!${process.execPath}
import { writeFileSync } from "node:fs";
if (process.argv[2] !== "app-server") process.exit(2);
writeFileSync(${JSON.stringify(asked)}, "yes");
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  for (let i; (i = buffer.indexOf("\\n")) >= 0; ) {
    const { id, method, params } = JSON.parse(buffer.slice(0, i)); buffer = buffer.slice(i + 1);
    const result = method === "hooks/list" ? { data: [{ cwd: params.cwds[0], hooks: ${JSON.stringify(hooks)} }] } : {};
    process.stdout.write(JSON.stringify({ id, result }) + "\\n");
  }
});
`, { mode: 0o755 });
  const { GTM_BRAIN_NO_HOOK_CHECK, ...base } = process.env;
  const child = spawn(process.execPath, [server], { cwd: root, stdio: ["pipe", "pipe", "ignore"], env: { ...base, HOME: root, PATH: `${root}:${process.env.PATH}`, ...env } });
  const pending = new Map(); let id = 0;
  createInterface({ input: child.stdout }).on("line", line => { const m = JSON.parse(line); pending.get(m.id)?.(m.result); });
  const call = (method, params) => new Promise(done => { pending.set(++id, done); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  // The check runs in the background: keep calling until two results after the line (or 12 calls).
  const texts = [];
  for (let i = 0, seen = -1; i < 12 && (seen < 0 || i - seen < 3); i++) {
    texts.push((await call("tools/call", { name: "list_brains", arguments: {} })).content.map(c => c.text).join("\n"));
    if (seen < 0 && texts.at(-1).includes("SAFETY LOCKS")) seen = i;
    await new Promise(done => setTimeout(done, 250));
  }
  child.stdin.end();
  return { texts, asked: existsSync(asked) };
}

test("a hook Codex switched off after an update is reported once, on a later tool result", async t => {
  const { texts } = await session(t, [hook("sessionStart", "modified"), hook("preToolUse", "trusted")]);
  const told = texts.filter(x => x.includes("GTM BRAIN SAFETY LOCKS OFF"));
  assert.equal(told.length, 1, texts.join("\n---\n"));
  assert.match(told[0], /Say: update GTM Brain, to turn them back on\./);
  assert.doesNotMatch(texts[0], /SAFETY LOCKS/, "the first call never waits for the check");
});

test("all hooks running, or one the person disabled, says nothing", async t => {
  const { texts, asked } = await session(t, [hook("sessionStart", "trusted"), hook("stop", "untrusted", { enabled: false })]);
  assert.ok(asked, "the check ran");
  assert.ok(texts.every(x => !x.includes("SAFETY LOCKS")));
});

test("Claude Code has no hook approvals: no check, no line", async t => {
  const { texts, asked } = await session(t, [hook("sessionStart", "modified")], { GTM_BRAIN_HOST: "claude" });
  assert.equal(asked, false);
  assert.ok(texts.every(x => !x.includes("SAFETY LOCKS")));
});

test("scheduled runs and GTM_BRAIN_NO_HOOK_CHECK skip the check", async t => {
  for (const env of [{ GTM_BRAIN_RUN: "schedule" }, { GTM_BRAIN_NO_HOOK_CHECK: "1" }]) {
    const { texts, asked } = await session(t, [hook("sessionStart", "modified")], env);
    assert.equal(asked, false, JSON.stringify(env));
    assert.ok(texts.every(x => !x.includes("SAFETY LOCKS")));
  }
});

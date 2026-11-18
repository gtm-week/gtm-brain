// What one answer costs on real Codex, held where the plugin controls it (measured 2026-11-18 with gpt-5.6-luna):
// - Codex's code mode lists no GTM Brain tool in the prompt. A chat found query by dumping ALL_TOOLS (every entry
//   carries the server instructions, so every filter matched all 41 tools, about 10,000 tokens re-sent with every
//   later request) and then read query's declaration: 4 requests and about 119,000 input tokens for one recall.
//   The rulebook now carries both calls as exec code, complete as written: one call and about 64,000 tokens.
// - The chat start ran 27 node processes before the first call's result; under load that took 25 to 60 seconds, so
//   Codex's exec cell yielded and a whole request was spent waiting. It now runs at most 10.
// Run: node --test plugins/gtm-brain/test/answer-cost.test.mjs
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, realpathSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, HOME: mkdtempSync(join(tmpdir(), "gtm-brain-home-")), CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-brain-codex-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_TEST_LAYOUT: "2" };
delete env.GTM_BRAIN_NO_SESSION_START; delete env.GTM_BRAIN_RUN; delete env.GTM_BRAIN_HOST;

test("the rulebook's exec calls name listed tools and fields, so a Codex chat calls them with no ALL_TOOLS lookup", () => {
  const template = readFileSync(join(P, "templates", "AGENTS.md"), "utf8");
  const calls = [...template.matchAll(/await tools\.mcp__gtm_brain__(\w+)\(\{([^}]*)\}\)/g)].map(m => [m[1], [...m[2].matchAll(/(?:^|,)\s*(\w+)/g)].map(x => x[1])]);
  assert.deepEqual(calls.map(c => c[0]), ["query", "remember"]);
  assert.match(template, /no lookup in `ALL_TOOLS` first/);
  const out = execFileSync(process.execPath, [join(P, "server", "server.mjs")], { input: [{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } }, { jsonrpc: "2.0", id: 2, method: "tools/list" }].map(m => JSON.stringify(m)).join("\n") + "\n", env, encoding: "utf8" });
  const tools = out.split("\n").filter(Boolean).map(l => JSON.parse(l)).find(m => m.id === 2).result.tools;
  for (const [name, fields] of calls) {
    const t = tools.find(x => x.name === name); assert.ok(t, `${name} is listed`);
    for (const f of fields) assert.ok(f in t.inputSchema.properties, `${name} takes ${f}`);
  }
  assert.ok(tools.find(t => t.name === "query").inputSchema.properties.object.enum.includes("answer"));
});

test("a chat start in a brain runs at most 10 node processes", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-cost-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Northfold", "--one-liner", "returns automation", "--owner", "Anna Lind <anna@northfold.example>"], { cwd: root, env, stdio: "ignore" });
  // a node on PATH that counts itself, then runs the real one
  const bin = mkdtempSync(join(tmpdir(), "gtm-brain-node-")), log = join(bin, "calls.log");
  writeFileSync(join(bin, "node"), `#!/bin/bash\necho x >> "${log}"\nexec "${process.execPath}" "$@"\n`); chmodSync(join(bin, "node"), 0o755);
  mkdirSync(join(root, "work"), { recursive: true });
  const r = spawnSync("bash", [join(P, "session", "session-start.sh")], { cwd: root, env: { ...env, PATH: `${bin}:${env.PATH}` }, input: JSON.stringify({ session_id: "", cwd: root }), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^brain: .* \(Northfold\) at /m);
  const n = readFileSync(log, "utf8").split("\n").filter(Boolean).length;
  assert.ok(n <= 10, `the chat start ran ${n} node processes (were 27)`);
});

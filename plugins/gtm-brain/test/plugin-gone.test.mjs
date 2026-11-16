// A plugin update under an open chat: the host replaces the cached version folder, the chat's server keeps
// running from the deleted one. Every tool call then says so in plain words instead of a Node stack trace
// about a missing script (seen live: "Cannot find module .../0.36.1/skills/gtm-brain-remember/remember.mjs").
// Run: node --test plugins/gtm-brain/test/plugin-gone.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const version = JSON.parse(readFileSync(join(P, ".codex-plugin/plugin.json"), "utf8")).version;
const env = { ...process.env, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-gone-profile-")), GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1" };

// The "cache folder": a copy of the plugin the server runs from, deleted later the way an update deletes it.
const cache = join(mkdtempSync(join(tmpdir(), "gtm-gone-cache-")), version);
cpSync(P, cache, { recursive: true, filter: src => !/\/(test|node_modules)(\/|$)/.test(src.slice(P.length)) });
const brain = mkdtempSync(join(tmpdir(), "gtm-gone-brain-"));
execFileSync("bash", [join(P, "scripts/gtm-brain-setup/setup.sh"), "--company", "Gone Co", "--one-liner", "Synthetic", "--owner", "Ann Lee <ann@example.test>", "--dashboard", "on-demand"], { cwd: brain, env });

const server = spawn(process.execPath, [join(cache, "server/server.mjs")], { stdio: ["pipe", "pipe", "pipe"], env });
after(() => server.kill());
const pending = new Map(); let seq = 0;
createInterface({ input: server.stdout }).on("line", line => { const m = JSON.parse(line); pending.get(m.id)?.(m); pending.delete(m.id); });
const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: args }); return { text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };

test("a server whose plugin folder was replaced by an update says so instead of a stack trace", async () => {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
  const before = await call("query", { brain, object: "status" });
  assert.doesNotMatch(before.text, /was updated while this chat was open/);

  rmSync(cache, { recursive: true, force: true });
  const saved = await call("remember", { brain, by: "ann-lee", context: "company", content: "276 approved, 169 waitlisted." });
  assert.equal(saved.isError, true);
  assert.match(saved.text, new RegExp(`GTM Brain ${version.replace(/\./g, "\\.")} was updated while this chat was open`));
  assert.match(saved.text, /Nothing was done and nothing was saved/);
  assert.match(saved.text, /start a new chat|start a new session/);
  assert.doesNotMatch(saved.text, /Cannot find module|node:internal/);
});

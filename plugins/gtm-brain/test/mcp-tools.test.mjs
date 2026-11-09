// Tools connected to Codex as MCP servers are real connections, though `codex plugin list` never names them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const plugin = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const connect = join(plugin, "scripts/gtm-brain-connect/connect.mjs");
const ID = "app-6a3d93e966b8819198c93780c2577383";

function brain(t, tools = ["HubSpot", "ZYNT"], list = "") {
  const outer = mkdtempSync(join(tmpdir(), "gtm-mcp-")); t.after(() => rmSync(outer, { recursive: true, force: true }));
  const root = join(outer, "brain"), home = join(outer, "codex-home"), bin = join(outer, "bin"); mkdirSync(root); mkdirSync(home); mkdirSync(bin);
  writeFileSync(join(bin, "codex"), `#!/bin/sh\nprintf '%s\\n' "${list}"\n`); chmodSync(join(bin, "codex"), 0o755);
  const env = { ...process.env, CODEX_HOME: home, PATH: `${bin}:${process.env.PATH}`, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_CATALOG_DIR: join(outer, "none") };
  const setup = spawnSync("bash", [join(plugin, "scripts/gtm-brain-setup/setup.sh"), "--company", "Mcp Co", "--one-liner", "t", "--owner", "Ann Lee <a@e.test>", "--tools", tools.join(",")], { cwd: root, env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  return { root, home, env, check: () => spawnSync(process.execPath, [connect, root, "--check"], { cwd: root, env, encoding: "utf8" }).stdout, state: () => JSON.parse(readFileSync(join(root, "work/tools.json"), "utf8")) };
}
const CONFIG = `[mcp_servers.zynt]\nurl = "https://app.getzynt.com/mcp"\n\n[mcp_servers.pocket]\nurl = "https://public.heypocketai.com/mcp"\n\n[mcp_servers.playwright]\ncommand = "npx"\n\n[mcp_servers.pocket.http_headers]\nX = "y"\n\n[mcp_servers.gtm_brain]\nurl = "http://x"\n`;

test("a remote MCP server counts as connected, without admin.md; a local command server and our own do not", t => {
  const f = brain(t); writeFileSync(join(f.home, "config.toml"), CONFIG);
  const out = f.check(), s = f.state();
  assert.equal(s.zynt.status, "installed", "named in admin.md, matched by the server");
  assert.equal(s.zynt.plugin, "zynt");
  assert.equal(s.pocket.status, "installed"); assert.equal(s.pocket.tool, "Pocket"); assert.equal(s.pocket.mcp, true);
  assert.equal(s.playwright, undefined); assert.equal(s.gtm_brain, undefined);
  assert.match(out, /connected as MCP servers, not in admin\.md tools: Pocket\./);
  assert.equal(s.zynt.test, undefined, "connected is not read-tested");
});

test("a server used in chat becomes read-tested, and one removed from config.toml disappears", t => {
  const f = brain(t); writeFileSync(join(f.home, "config.toml"), CONFIG); f.check();
  spawnSync(process.execPath, [connect, f.root, "--used", "pocket", "list_recordings"], { cwd: f.root, env: f.env, encoding: "utf8" });
  assert.equal(f.state().pocket.test, "ok");
  f.check(); assert.equal(f.state().pocket.test, "ok", "a later check keeps the result");
  writeFileSync(join(f.home, "config.toml"), "");
  f.check(); assert.equal(f.state().pocket, undefined);
});

test("no config.toml changes nothing, and a tool with no entry stays not connected", t => {
  const f = brain(t); f.check();
  assert.notEqual(f.state().zynt.status, "installed");
});

test("an installed plugin the catalog misses takes its name from its own manifest", t => {
  const f = brain(t, ["HubSpot"], `${ID}@openai-curated-remote installed, enabled`);
  const dir = join(f.home, "plugins/cache/openai-curated-remote", ID, "1.0.0/.codex-plugin"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plugin.json"), JSON.stringify({ interface: { displayName: "Pocket AI" } }));
  assert.match(f.check(), /installed in Codex but not in admin\.md tools: Pocket AI/);
});

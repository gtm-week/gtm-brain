// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// Tools connected to Codex as MCP servers are real connections, though `codex plugin list` never names them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";
const plugin = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const connect = join(plugin, "scripts/gtm-brain-connect/connect.mjs");
const ID = "app-6a3d93e966b8819198c93780c2577383";

function brain(t, tools = ["HubSpot", "ZYNT"], list = "") {
  const outer = mkdtempSync(join(tmpdir(), "gtm-mcp-")); t.after(() => { try { rmSync(outer, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} });
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

// ZYNT's own plugin (getzynt/zynt-plugins) brings its MCP server in the plugin's .mcp.json, not in config.toml.
function zyntPlugin(f, { version = "0.1.0", inline = false } = {}) {
  const dir = join(f.home, "plugins/cache/zynt/zynt", version); mkdirSync(join(dir, ".codex-plugin"), { recursive: true });
  const servers = { mcpServers: { zynt: { type: "http", url: "https://app.getzynt.com/mcp" } } };
  writeFileSync(join(dir, ".codex-plugin/plugin.json"), JSON.stringify({ name: "zynt", mcpServers: inline ? servers.mcpServers : "./.mcp.json", interface: { displayName: "ZYNT" } }));
  if (!inline) writeFileSync(join(dir, ".mcp.json"), JSON.stringify(servers));
}

test("an installed plugin's own MCP server counts as connected, named as the plugin names itself", t => {
  const f = brain(t, ["HubSpot"], "zynt@zynt installed, enabled 0.1.0 /tmp/zynt-plugins/plugins/zynt"); zyntPlugin(f);
  const out = f.check(), s = f.state();
  assert.equal(s.zynt.status, "installed"); assert.equal(s.zynt.mcp, true); assert.equal(s.zynt.tool, "ZYNT");
  assert.match(out, /connected as MCP servers, not in admin\.md tools: ZYNT\./);
});

test("a plugin's MCP server matches the tool admin.md names, also when the manifest lists it inline", t => {
  const f = brain(t, ["HubSpot", "ZYNT"], "zynt@zynt installed, enabled"); zyntPlugin(f, { inline: true });
  f.check(); assert.equal(f.state().zynt.status, "installed"); assert.equal(f.state().zynt.plugin, "zynt");
});

test("a disabled or uninstalled plugin's MCP server does not count", t => {
  const f = brain(t, ["HubSpot", "ZYNT"], "zynt@zynt installed, disabled"); zyntPlugin(f);
  f.check(); assert.notEqual(f.state().zynt.status, "installed");
  const g = brain(t, ["HubSpot", "ZYNT"], "zynt@zynt not installed"); zyntPlugin(g);
  g.check(); assert.notEqual(g.state().zynt.status, "installed");
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

// ZYNT's setup runs on its HTTP API with a key pasted in the chat: no plugin, no MCP server (gtmb-zynt-setup).
test("a tool read through its API is on the page once a read test and a note back it; a failed read shows as failed", t => {
  const f = brain(t, ["HubSpot"]);
  const mark = (status, note) => spawnSync(process.execPath, [connect, f.root, "--mark", "zynt", status, note], { cwd: f.root, env: f.env, encoding: "utf8" });
  mark("ok", "GET /api/v1/audiences returned 1 list"); f.check();
  assert.equal(f.state().zynt, undefined, "a read test alone, with no note naming the tool, is not kept");
  mark("ok", "GET /api/v1/audiences returned 1 list");
  lib.appendMemory(f.root, "icp", { authors: ["ann-lee"], content: "ZYNT set up for the Berlin startups segment.", at: "2026-11-14T10:00:00Z", source: [{ kind: "zynt", ref: "audience/7" }], tools: ["ZYNT"] });
  const out = f.check(), z = f.state().zynt;
  assert.equal(z.status, "installed"); assert.equal(z.api, true); assert.equal(z.test, "ok"); assert.equal(z.plugin ?? null, null);
  assert.match(out, /used in this brain, on the dashboard, not in admin\.md tools: zynt \(read through its API\)/i);
  mark("fail", "401 key expired"); f.check();
  assert.equal(f.state().zynt.test, "fail", "an expired key stays visible as failed, never connected");
});

// HeyReach's key is part of its MCP Connection URL, and a transport error quotes the URL (gtmb-heyreach-setup).
test("a read test note never carries a connector's URL path, query or key into tools.json or the chat", t => {
  const f = brain(t, ["HubSpot"]);
  const out = spawnSync(process.execPath, [connect, f.root, "--mark", "heyreach", "fail", "error sending request for url (https://mcp.fixture.test/mcp/k9Zs3cret?key=abc123): 401, api key: Qw3rtyUiop12345"], { cwd: f.root, env: f.env, encoding: "utf8" }).stdout;
  const note = JSON.parse(readFileSync(join(f.root, "work", "tools.json"), "utf8")).heyreach.note;
  assert.equal(note, "error sending request for url (https://mcp.fixture.test): 401, api key: [secret removed]");
  assert.doesNotMatch(out, /k9Zs3cret|abc123|Qw3rtyUiop12345/); assert.match(out, /heyreach: fail/);
});

// A tool the brain has no plugin, MCP url or read test for (a local MCP server, the demo's stub tools): a note
// that names it in tools and cites a record of its own kind came from it, so the tools list shows it as used.
// A note the person told about it (source user) does not, and a failed read test stays failed.
test("a note that came from a tool with no plugin puts it on the tools list as used; a told one does not", t => {
  const f = brain(t, ["HubSpot"]);
  const note = (content, source, tools) => lib.appendMemory(f.root, "icp", { authors: ["ann-lee"], content, at: "2026-11-15T10:00:00Z", source, tools });
  note("Clay says Fernbrook Outdoor has 85 stores.", [{ kind: "user", ref: "ann-lee" }], ["clay"]);
  f.check();
  assert.equal(f.state().clay, undefined, "told by the person: not a read of the tool");
  note("Fernbrook Outdoor: 85 stores, Head of Operations Lea Hoffmann.", [{ kind: "gtm-test-tools", ref: "companies/fernbrook-outdoor" }], ["gtm_test_tools.company_enrich"]);
  const out = f.check(), s = Object.values(f.state()).find(x => x && x.tool === "gtm_test_tools");
  assert.ok(s, JSON.stringify(f.state()));
  assert.equal(s.used, "a note came from it"); assert.equal(s.test ?? null, null, "not a read test");
  assert.match(out, /used in this brain, on the dashboard, not in admin\.md tools: gtm_test_tools \(a note came from it\)/);
  spawnSync(process.execPath, [connect, f.root, "--mark", "gtm_test_tools", "fail", "401 key expired"], { cwd: f.root, env: f.env, encoding: "utf8" });
  f.check();
  assert.equal(Object.values(f.state()).find(x => x && x.tool === "gtm_test_tools").test, "fail", "a failed read stays visible as failed");
});

// tools.json is this machine's list. A teammate's notes arrive with the next pull: they prove the teammate read
// the tool, not that it is connected here. And a tool Codex has a plugin for follows the plugin's state.
test("a teammate's note from a tool does not list it here, and a tool with a plugin that is not installed stays off", t => {
  const f = brain(t, ["HubSpot"], "granola@openai-curated-remote not installed");
  assert.equal(lib.currentPerson(f.root), "ann-lee", "the fixture knows whose machine this is");
  const note = (by, content, kind, tool) => lib.appendMemory(f.root, "icp", { authors: [by], content, at: "2026-11-15T10:00:00Z", source: [{ kind, ref: "records/1" }], tools: [tool] });
  note("bo-berg", "Fernbrook Outdoor: 85 stores.", "gtm-test-tools", "gtm_test_tools.company_enrich");
  note("ann-lee", "Call with Rosa Brandt: returns pile up after peak season.", "granola", "granola");
  const out = f.check();
  assert.equal(Object.values(f.state()).find(x => x && /gtm.?test.?tools/i.test(x.tool || "")), undefined, "a teammate's read is not a connection on this machine");
  assert.equal(Object.values(f.state()).find(x => x && /granola/i.test(x.tool || "") && x.used), undefined, "Codex has a plugin for it and it is not installed");
  assert.doesNotMatch(out, /a note came from it/);
  note("ann-lee", "Heron Home: 46 stores.", "gtm-test-tools", "gtm_test_tools.company_enrich");
  f.check();
  assert.equal(Object.values(f.state()).find(x => x && x.tool === "gtm_test_tools")?.used, "a note came from it", "the person's own note counts");
});

// Live run 2026-11-15: Codex wrote tools as "gtm-test-tools:company_search", "gtm-test-tools:buying_signals" and
// "gtm-test-tools:company_enrich", and the page listed one server as three tools, each offered for admin.md.
test("one server is one row, however the notes spell its tools", t => {
  const f = brain(t, ["HubSpot"]);
  for (const tool of ["gtm-test-tools:company_search", "gtm_test_tools.company_enrich", "gtm-test-tools/buying_signals", "gtm-test-tools"])
    lib.appendMemory(f.root, "icp", { authors: ["ann-lee"], content: `Heron Home: 46 stores (${tool}).`, at: "2026-11-15T10:00:00Z", source: [{ kind: "gtm-test-tools", ref: "companies/heron-home" }], tools: [tool] });
  const out = f.check(), rows = Object.values(f.state()).filter(x => x && x.used === "a note came from it");
  assert.deepEqual(rows.map(x => x.tool), ["gtm-test-tools"], JSON.stringify(f.state()));
  assert.equal(out.match(/a note came from it/g).length, 1, out);
});

// codex plugin list can fail (offline, a slow start): the last list stands. A read test recorded since then still
// turns "a note came from it" into a tested read.
test("a read test recorded after a note listed the tool shows as tested, also when codex plugin list fails", t => {
  const f = brain(t, ["HubSpot"]);
  lib.appendMemory(f.root, "icp", { authors: ["ann-lee"], content: "Heron Home: 46 stores.", at: "2026-11-15T10:00:00Z", source: [{ kind: "gtm-test-tools", ref: "companies/heron-home" }], tools: ["gtm_test_tools"] });
  f.check();
  assert.equal(Object.values(f.state()).find(x => x && x.tool === "gtm_test_tools").used, "a note came from it");
  writeFileSync(join(f.root, "..", "bin", "codex"), "#!/bin/sh\nexit 1\n");
  spawnSync(process.execPath, [connect, f.root, "--mark", "gtm_test_tools", "ok", "company_enrich returned Heron Home"], { cwd: f.root, env: f.env, encoding: "utf8" });
  f.check();
  const s = Object.values(f.state()).find(x => x && x.tool === "gtm_test_tools");
  assert.equal(s.test, "ok"); assert.equal(s.used, "read through its API", JSON.stringify(s));
});

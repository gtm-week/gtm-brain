// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// Review of the slim rulebook (0.35.0), second pass: no shipped skill still demands a status call first, and every
// topic page rides along with a tool, so its detail reaches a plain turn without the model having to ask for it.
// Run: node --test plugins/gtm-brain/test/rulebook-attach.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { rulePages } from "../lib/rule-pages.mjs";
import { removeBrain } from "./helpers/dash-cleanup.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-attach-codex-")), HOME: mkdtempSync(join(tmpdir(), "gtm-attach-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1" };
for (const k of ["GTM_BRAIN_NO_COMMIT", "GTM_BRAIN_NO_SESSION_START", "GTM_BRAIN_RUN", "GTM_BRAIN_HOST", "GTM_BRAIN_NO_RULE_PAGES", "GTM_BRAIN_TOOLSET"]) delete env[k];

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-attach-brain-")));
  after(() => removeBrain(root));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Pagecraft", "--one-liner", "slim rules", "--owner", "Ann Lee <ann@example.test>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
function client() {
  const child = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env });
  const pending = new Map(); let seq = 0;
  createInterface({ input: child.stdout }).on("line", line => { const m = JSON.parse(line); const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); } });
  const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: args }); return { parts: m.result.content.map(c => c.text), text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };
  after(() => child.kill());
  return { call, init: () => rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } }) };
}

test("no shipped skill sends the model to a status call first", () => {
  const dirs = readdirSync(join(P, "skills")).filter(d => existsSync(join(P, "skills", d, "SKILL.md")));
  assert.ok(dirs.length >= 15);
  for (const d of dirs) {
    const text = readFileSync(join(P, "skills", d, "SKILL.md"), "utf8");
    assert.doesNotMatch(text, /`query` \(status\)\s+first|call it first|start every chat with/i, `${d}/SKILL.md demands a status call first`);
  }
});

test("every topic page has a tool it rides along with, and comes when that tool refuses or holds something; only the answers page still comes with a search that worked", async () => {
  // a page no tool attaches is read only when the model thinks to ask, which a plain turn never does
  for (const p of rulePages().filter(p => !["questions", "computer-use"].includes(p.slug))) assert.ok(p.attach.length, `${p.slug} rides along with no tool`);
  const root = brain(); const s = client(); await s.init();
  const search = await s.call("query", { brain: root, object: "memories", search: "pricing" });
  // the one page that still comes with a call that worked: how a reply ends has not been benchmarked without it
  assert.ok(search.parts.some(t => t.startsWith("--- Rule page: Answering and the next step")), "the answers page comes with the first memories search");
  assert.ok(!(await s.call("query", { brain: root, object: "memories", search: "pricing" })).parts.some(t => t.startsWith("--- Rule page:")), "once per chat");
  const saved = await s.call("remember", { brain: root, context: "company", by: "ann-lee", kind: "decision", content: "Pricing is per seat, EUR 40 a month, from 2 November 2026." });
  assert.ok(!saved.isError, saved.text);
  assert.ok(!saved.parts.some(t => t.startsWith("--- Rule page:")), "a save that worked carries no page");
  // held: a bare weekday means nothing next week (D1), so nothing is written and the saving page comes with the hold
  const held = await s.call("remember", { brain: root, context: "company", by: "ann-lee", content: "The pricing review moved to Thursday." });
  assert.match(held.parts[0], /^refused: not remembered yet/);
  assert.ok(held.parts.some(t => t.startsWith("--- Rule page: Saving what happened")), "the saving page comes with the first held save");
  const again = await s.call("remember", { brain: root, context: "company", by: "ann-lee", content: "The offer review moved to Thursday." });
  assert.match(again.parts[0], /^refused: not remembered yet/);
  assert.ok(!again.parts.some(t => t.startsWith("--- Rule page:")), "once per chat");
});

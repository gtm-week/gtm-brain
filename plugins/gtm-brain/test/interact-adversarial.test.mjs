// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
// Adversarial cases for interact's check, act, then record: what a model or a connector really sends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawn } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-profile-"));
const lib = await import(`${P}/lib/brain.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_SESSION_START: "1" };
const root = mkdtempSync(join(tmpdir(), "gtm-brain-interact-adversarial-"));
execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>"], { cwd: root, env, stdio: "ignore" });
execFileSync(process.execPath, [`${P}/scripts/gtm-brain-contexts/contexts.mjs`, root, "--new", "pipeline", "Pipeline", "Deals in flight.", "--distinct", "no context covers deals in flight"], { env, stdio: "ignore" });
lib.writeLoaded(root, ["pipeline"]);
const MOVE = { name: "move_deal", title: "Moving a deal", tool: "hubspot", operation: "Move the deal to the given stage in HubSpot.", description: "A deal changes stage.",
  input_schema: { type: "object", properties: { deal: { type: "string" }, stage: { type: "string" } }, required: ["deal", "stage"], additionalProperties: false },
  record: { context: "pipeline", kind: "note", companies: ["deal"], people: [], content: "Moved {deal} to {stage}.", action: "hubspot:move deal:{deal}", tags: ["deal-stage"] } };
const LOG = { name: "log_result", title: "Logging a result", external: false, description: "A result, kept at once.",
  input_schema: { type: "object", properties: { what: { type: "string" } }, required: ["what"], additionalProperties: false },
  record: { context: "pipeline", kind: "note", companies: [], people: [], content: "Result: {what}", tags: ["result"] } };
lib.writeInteractions(root, [MOVE, LOG]);
const call = (name, args) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [`${P}/server/server.mjs`], { env }); let out = "";
  p.stdout.on("data", d => out += d);
  p.on("close", () => { const r = out.split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).find(l => l && l.id === 2); r ? res({ text: r.result.content.map(c => c.text).join("\n"), isError: !!r.result.isError }) : rej(new Error(out)); });
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } }) + "\n");
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: { brain: root, by: "marta", ...args } } }) + "\n");
  p.stdin.end();
});
const about = token => lib.readMemories(root, "pipeline").filter(m => m.content.includes(token));

test("a failure is recorded whatever the connector said: a relative day, a long dash, a page of text", async () => {
  const day = await call("interact", { name: "move_deal", params: { deal: "Alfa", stage: "won" }, outcome: "failed", error: "Rate limited. Try again tomorrow or on Thursday." });
  assert.ok(!day.isError, day.text); assert.equal(about("deal Alfa").length, 1, day.text);
  const dash = await call("interact", { name: "move_deal", params: { deal: "Beta", stage: "won" }, outcome: "failed", error: "Forbidden \u2014 missing scope crm.objects.deals.write" });
  assert.ok(!dash.isError, dash.text); assert.equal(about("deal Beta").length, 1, dash.text);
  const long = await call("interact", { name: "move_deal", params: { deal: "Gamma", stage: "won" }, outcome: "failed", error: "<html>" + "502 Bad Gateway ".repeat(2000) + "</html>" });
  assert.ok(!long.isError, long.text); const g = about("deal Gamma"); assert.equal(g.length, 1, long.text); assert.ok(g[0].content.length < 1500, `the error is cut: ${g[0].content.length}`);
});

test("a numeric id from the connector is a reference, not a refusal", async () => {
  const r = await call("interact", { name: "move_deal", params: { deal: "Delta", stage: "lead" }, outcome: "done", refs: [987654] });
  assert.ok(!r.isError, r.text); const m = about("Moved Delta")[0]; assert.ok(m && m.source.some(s => s.kind === "hubspot" && s.ref === "987654"), JSON.stringify(m?.source));
});

test("an empty or null outcome is a first call: nothing recorded", async () => {
  for (const outcome of ["", null]) { const r = await call("interact", { name: "move_deal", params: { deal: "Epsilon", stage: "lead" }, outcome }); assert.match(r.text, /^checked: move_deal; nothing recorded yet/); }
  assert.equal(about("Epsilon").length, 0);
});

test("failed never records that it happened, also for an interaction marked external false", async () => {
  const r = await call("interact", { name: "log_result", params: { what: "Zeta shipped" }, outcome: "failed", error: "it did not" });
  assert.equal(about("Result: Zeta shipped").length, 0, r.text);
  assert.match(r.text, /^recorded failure: log_result/); assert.equal(about("Failed in the tool, not done: Logging a result (what Zeta shipped)").length, 1);
});

test("what would refuse the note is refused on the first call, before the connector writes", async () => {
  const stranger = await call("interact", { by: "nobody", name: "move_deal", params: { deal: "Theta", stage: "lead" } });
  assert.equal(stranger.isError, true); assert.match(stranger.text, /^refused: "nobody" is not in admin\.md team; nothing recorded, and do nothing in hubspot yet/);
  const day = await call("interact", { name: "move_deal", params: { deal: "Theta", stage: "proposal by Thursday" } });
  assert.equal(day.isError, true); assert.match(day.text, /^refused: its note would say "Thursday"; give the date itself in params/);
  const dash = await call("interact", { name: "move_deal", params: { deal: "Theta \u2014 Nord", stage: "lead" } });
  assert.equal(dash.isError, true); assert.match(dash.text, /long dash/);
  lib.writeInteractions(root, [MOVE, LOG, { ...MOVE, name: "move_lost", record: { ...MOVE.record, context: "no-such-context" } }]);
  const nowhere = await call("interact", { name: "move_lost", params: { deal: "Theta", stage: "lead" } });
  assert.equal(nowhere.isError, true); assert.match(nowhere.text, /^refused: its context no-such-context is not an active context here/);
  assert.equal(about("Theta").length, 0);
});

test("a pure record never shows undefined: the proposal, the catalog and the APPROVE text name it", async () => {
  const cat = await call("list_objects", { by: undefined });
  assert.match(cat.text, /- log_result\(what\) \[record only\]/); assert.match(cat.text, /- move_deal\(deal, stage\) \[hubspot\]/);
  const p = await call("propose_interaction", { interaction: { ...LOG, name: "log_more" } });
  assert.ok(!p.isError, p.text); assert.doesNotMatch(p.text, /undefined/); assert.match(p.text, /no tool step, recorded at once/);
  const form = await call("approve_change", { kind: "interaction" });
  assert.doesNotMatch(form.text, /undefined/, form.text);
});

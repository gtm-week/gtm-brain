// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
// interact checks, the connector acts, then interact records: the first call writes nothing, and only the
// second call, carrying the outcome and what the connector returned, writes the note. Each call below runs
// in a fresh server process, so nothing between the two calls lives in server memory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawn } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-profile-"));
const lib = await import(`${P}/lib/brain.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_SESSION_START: "1" };
const root = mkdtempSync(join(tmpdir(), "gtm-brain-interact-confirm-"));
execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>"], { cwd: root, env, stdio: "ignore" });
execFileSync(process.execPath, [`${P}/scripts/gtm-brain-contexts/contexts.mjs`, root, "--new", "pipeline", "Pipeline", "Deals in flight.", "--distinct", "no context covers deals in flight"], { env, stdio: "ignore" });
lib.writeLoaded(root, ["pipeline"]);

const MOVE = { name: "move_deal", title: "Moving a deal", tool: "hubspot", operation: "Move the deal to the given stage in HubSpot.", description: "A deal changes stage.",
  input_schema: { type: "object", properties: { deal: { type: "string" }, stage: { type: "string", enum: ["lead", "proposal", "won"] } }, required: ["deal", "stage"], additionalProperties: false },
  record: { context: "pipeline", kind: "note", companies: ["deal"], people: [], content: "Moved {deal} to {stage}.", action: "hubspot:move deal:{deal}", tags: ["deal-stage"] },
  refuse_when: "the deal is already won" };
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
const store = join(root, "brain", "contexts", "pipeline", "memories.jsonl");
const bytes = () => existsSync(store) ? readFileSync(store, "utf8") : "";
const about = token => lib.readMemories(root, "pipeline").filter(m => m.content.includes(token));
const DAY = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)(new Date());

test("the file keeps external false; validation lets a pure record go without a tool", () => {
  const [move, log] = lib.readInteractions(root).actions;
  assert.equal(move.external, true); assert.equal(log.external, false);
  assert.ok(/"external": false/.test(readFileSync(join(root, "brain", "ontology.ossie.json"), "utf8")));
  assert.deepEqual(lib.validateInteraction(root, { ...LOG, name: "log_two" }), []);
  assert.ok(lib.validateInteraction(root, { ...LOG, name: "log_three", external: undefined }).some(e => /tool is needed/.test(e)));
  assert.ok(lib.validateInteraction(root, { ...LOG, name: "log_four", external: "no" }).some(e => /external must be true or false/.test(e)));
});

test("interactionMemory with outcome failed: a plain failure note, no action", () => {
  const m = lib.interactionMemory(MOVE, { deal: "Castorama", stage: "won" }, { outcome: "failed", error: "  403\n forbidden " });
  assert.equal(m.content, `Failed in hubspot, not done: Moving a deal (deal Castorama, stage won), tried ${DAY}. Error: 403 forbidden`);
  assert.deepEqual(m.actions, []); assert.deepEqual(m.companies, ["Castorama"]); assert.deepEqual(m.tools, ["hubspot"]); assert.deepEqual(m.tags, ["deal-stage", "interaction-failed"]);
  assert.match(lib.interactionMemory(MOVE, { deal: "X", stage: "won" }, { outcome: "failed" }).content, /No error text was returned\.$/);
});

test("a refusal writes nothing", async () => {
  const before = bytes();
  const missing = await call("interact", { name: "move_deal", params: { deal: "Castorama" } });
  assert.equal(missing.isError, true); assert.match(missing.text, /^refused: .*stage.*nothing recorded/s);
  const badOutcome = await call("interact", { name: "move_deal", params: { deal: "Castorama", stage: "won" }, outcome: "maybe" });
  assert.equal(badOutcome.isError, true); assert.match(badOutcome.text, /outcome is done or failed/);
  const badRef = await call("interact", { name: "move_deal", params: { deal: "Castorama", stage: "won" }, outcome: "done", refs: [{ kind: "hubspot", ref: "1", extra: "x" }] });
  assert.equal(badRef.isError, true); assert.match(badRef.text, /^refused: refs: .*nothing recorded/);
  assert.equal(bytes(), before);
});

test("the first call writes nothing and returns the refusal rule and the connector step", async () => {
  const before = bytes();
  const r = await call("interact", { name: "move_deal", params: { deal: "Castorama", stage: "proposal" } });
  assert.ok(!r.isError, r.text);
  assert.match(r.text, /^checked: move_deal; nothing recorded yet\./);
  assert.match(r.text, /First check: refuse when the deal is already won\. If it holds, stop/);
  assert.match(r.text, /Now in hubspot: Move the deal to the given stage in HubSpot\./);
  assert.match(r.text, /outcome: done with refs .* or failed with error/);
  assert.equal(bytes(), before, "no note before the connector confirms");
});

test("done writes one note with the returned references as source pointers, account included", async () => {
  const url = "https://app.hubspot.com/contacts/4242/record/0-3/987654";
  const r = await call("interact", { name: "move_deal", params: { deal: "Castorama", stage: "proposal" }, outcome: "done", refs: [url, "555", { kind: "hubspot", account: "4242", ref: "deal/111" }] });
  assert.ok(!r.isError, r.text); assert.match(r.text, /^ok: move_deal/); assert.match(r.text, /remembered m_[0-9a-f]{12} in pipeline/);
  assert.doesNotMatch(r.text, /No reference/);
  const got = about("Moved Castorama to proposal");
  assert.equal(got.length, 1);
  const m = got[0];
  assert.ok(m.source.some(s => s.kind === "hubspot" && s.account === "4242" && s.ref === "0-3/987654" && s.url === url), JSON.stringify(m.source));
  assert.ok(m.source.some(s => s.kind === "hubspot" && s.ref === "555"), "a bare id is the interaction's tool");
  assert.ok(m.source.some(s => s.kind === "hubspot" && s.account === "4242" && s.ref === "deal/111"));
  assert.deepEqual(m.actions, [{ tool: "hubspot", action: "move deal", ref: "Castorama" }]); assert.deepEqual(m.tags, ["deal-stage"]);
});

test("done without a reference still records, and says none was given", async () => {
  const r = await call("interact", { name: "move_deal", params: { deal: "Bergstrom", stage: "lead" }, outcome: "done" });
  assert.ok(!r.isError, r.text); assert.match(r.text, /No reference from hubspot was given/);
  assert.equal(about("Moved Bergstrom to lead").length, 1);
});

test("failed writes a failure note, plainly, and no action", async () => {
  const r = await call("interact", { name: "move_deal", params: { deal: "Lidl", stage: "won" }, outcome: "failed", error: "INVALID_STAGE: won is not a stage of this pipeline" });
  assert.ok(!r.isError, r.text); assert.match(r.text, /^recorded failure: move_deal was not done in hubspot/);
  const got = about("Moving a deal (deal Lidl");
  assert.equal(got.length, 1);
  assert.equal(got[0].content, `Failed in hubspot, not done: Moving a deal (deal Lidl, stage won), tried ${DAY}. Error: INVALID_STAGE: won is not a stage of this pipeline`);
  assert.deepEqual(got[0].actions || [], []); assert.ok(got[0].tags.includes("interaction-failed"));
  assert.equal(about("Moved Lidl").length, 0, "no note claims it happened");
});

test("an interaction with no connector step records at once, as before", async () => {
  const r = await call("interact", { name: "log_result", params: { what: "M2 shipped" } });
  assert.ok(!r.isError, r.text); assert.match(r.text, /^ok: log_result/);
  const got = about("Result: M2 shipped"); assert.equal(got.length, 1); assert.deepEqual(got[0].tags, ["result"]);
});

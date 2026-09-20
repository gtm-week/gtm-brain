process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// A company describes its own interactions in brain/ontology.ossie.json. The lib reads the file with
// the engine's loader, keeps GTM OS's extra keys, validates a proposal, and turns an interaction plus
// its inputs into the memory the remember script writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// Keep real installation preferences out of synthetic test brains.
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-test-profile-"));
const lib = await import(`${P}/lib/brain.mjs`);
const root = mkdtempSync(join(tmpdir(), "gtm-os-interactions-"));
execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P }, stdio: "ignore" });
execFileSync(process.execPath, [`${P}/scripts/gtm-os-contexts/contexts.mjs`, root, "--new", "pipeline", "Pipeline", "Deals in flight."], { env: { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_COMMIT: "1" }, stdio: "ignore" });

export const MOVE = { name: "move_deal", title: "Moving a deal", tool: "attio", operation: "Move the deal to the given stage in Attio (Deals > the deal > Stage).", description: "A deal changes stage.",
  input_schema: { type: "object", properties: { deal: { type: "string" }, stage: { type: "string", enum: ["lead", "proposal", "won"] }, note: { type: "string" } }, required: ["deal", "stage"], additionalProperties: false },
  record: { context: "pipeline", kind: "note", companies: ["deal"], people: [], content: "Moved {deal} to {stage}.{note? Note: {note}}", action: "attio:move deal:{deal}", tags: ["deal-stage"] },
  refuse_when: "the deal is not a known company" };
const file = actions => ({ version: "1", name: "reflow", custom_extensions: [{ vendor_name: "ALLETHIC", data: { actions } }] });

test("no file: no interactions, no error; a file: the interactions with GTM OS's keys", () => {
  assert.deepEqual(lib.readInteractions(root), { actions: [], error: null, exists: false });
  writeFileSync(join(root, "brain", "ontology.ossie.json"), JSON.stringify(file([MOVE])));
  const r = lib.readInteractions(root);
  assert.equal(r.error, null); assert.equal(r.exists, true); assert.equal(r.actions.length, 1);
  const a = r.actions[0];
  assert.equal(a.name, "move_deal"); assert.equal(a.tool, "attio"); assert.equal(a.record.context, "pipeline"); assert.deepEqual(a.record.companies, ["deal"]); assert.equal(a.refuse_when, "the deal is not a known company");
  assert.deepEqual(a.input_schema.required, ["deal", "stage"]);
});

test("a broken file is an error the caller can show, never a throw", () => {
  writeFileSync(join(root, "brain", "ontology.ossie.json"), "{ not json");
  const r = lib.readInteractions(root); assert.equal(r.actions.length, 0); assert.match(r.error, /ontology\.ossie\.json/);
  writeFileSync(join(root, "brain", "ontology.ossie.json"), JSON.stringify(file([{ ...MOVE, name: "1bad" }])));
  assert.match(lib.readInteractions(root).error, /bare identifier|1bad/);
  writeFileSync(join(root, "brain", "ontology.ossie.json"), JSON.stringify(file([MOVE])));
});

test("validateInteraction says what is wrong with a proposal", () => {
  assert.deepEqual(lib.validateInteraction(root, MOVE), []);
  assert.match(lib.validateInteraction(root, { ...MOVE, name: "remember" }).join(" "), /remember is a tool of its own/);
  assert.match(lib.validateInteraction(root, { ...MOVE, name: "move_deal" }, { existing: [MOVE] }).join(" "), /already/);
  assert.match(lib.validateInteraction(root, { ...MOVE, record: { ...MOVE.record, context: "nowhere" } }).join(" "), /no context nowhere/);
  assert.match(lib.validateInteraction(root, { ...MOVE, input_schema: { type: "object", properties: { deal: { type: "money" } } } }).join(" "), /unsupported type/);
  assert.match(lib.validateInteraction(root, { ...MOVE, record: { ...MOVE.record, companies: ["ghost"] } }).join(" "), /ghost is not an input/);
  assert.match(lib.validateInteraction(root, { ...MOVE, tool: "" }).join(" "), /tool/);
  assert.match(lib.validateInteraction(root, { ...MOVE, operation: "Use the app \u2014 quickly" }).join(" "), /long dash/);
});

test("renderTemplate: values in, optional parts only when given", () => {
  assert.equal(lib.renderTemplate("Moved {deal} to {stage}.{note? Note: {note}}", { deal: "Castorama", stage: "proposal", note: "asked for a discount" }), "Moved Castorama to proposal. Note: asked for a discount");
  assert.equal(lib.renderTemplate("Moved {deal} to {stage}.{note? Note: {note}}", { deal: "Castorama", stage: "proposal" }), "Moved Castorama to proposal.");
  assert.equal(lib.renderTemplate("{missing} x", {}), "x");
});

test("interactionMemory: the memory the interaction prescribes, as remember flags", () => {
  const m = lib.interactionMemory(MOVE, { deal: "Castorama", stage: "proposal" });
  assert.deepEqual(m, { context: "pipeline", kind: "note", content: "Moved Castorama to proposal.", people: [], companies: ["Castorama"], tools: ["attio"], actions: ["attio:move deal:Castorama"], tags: ["deal-stage"] });
});

test("writeInteractions writes a file readInteractions reads back", () => {
  lib.writeInteractions(root, [MOVE, { ...MOVE, name: "send_proposal", tool: "gmail", operation: "Send the proposal email.", record: { ...MOVE.record, action: "gmail:send proposal:{deal}" } }]);
  const r = lib.readInteractions(root); assert.equal(r.error, null); assert.deepEqual(r.actions.map(a => a.name), ["move_deal", "send_proposal"]);
  assert.ok(readFileSync(join(root, "brain", "ontology.ossie.json"), "utf8").includes('"vendor_name": "ALLETHIC"'));
  assert.ok(existsSync(join(root, "brain", "ontology.ossie.json")));
});

test("the write gate denies a direct edit of the company file and names the proposal path", () => {
  const gate = input => { try { return { out: execFileSync("bash", [`${P}/hooks/gate-protected-write.sh`], { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, PLUGIN_ROOT: P } }), code: 0 }; } catch (e) { return { out: String(e.stdout) + String(e.stderr), code: e.status }; } };
  const denied = gate({ hook_event_name: "PreToolUse", session_id: "t", cwd: root, tool_name: "apply_patch", tool_input: { patch: "*** Update File: brain/ontology.ossie.json\n+x" } });
  assert.equal(denied.code, 2); assert.match(denied.out, /propose_interaction/);
  const read = gate({ hook_event_name: "PreToolUse", session_id: "t", cwd: root, tool_name: "shell_command", tool_input: { command: "cat brain/ontology.ossie.json" } });
  assert.equal(read.code, 0);
});

test("approve --interaction appends to the company file, commits, removes the proposal; a second time is refused", () => {
  writeFileSync(join(root, "work", "interaction.proposed.json"), JSON.stringify({ ...MOVE, name: "close_deal", tool: "attio", operation: "Mark the deal won or lost in Attio.", record: { ...MOVE.record, action: "attio:close deal:{deal}" } }));
  const env = { ...process.env, PLUGIN_ROOT: P, HOME: mkdtempSync(join(tmpdir(), "gtm-os-home-")) };
  const out = execFileSync(process.execPath, [`${P}/scripts/gtm-os-approve/approve.mjs`, root, "--interaction", "--by", "marta"], { encoding: "utf8", env });
  assert.match(out, /added interaction close_deal \(attio\)/);
  assert.ok(lib.readInteractions(root).actions.some(a => a.name === "close_deal")); assert.ok(!existsSync(join(root, "work", "interaction.proposed.json")));
  assert.match(execFileSync("git", ["-C", root, "log", "-1", "--format=%s"], { encoding: "utf8" }), /^interactions: close_deal/);
  writeFileSync(join(root, "work", "interaction.proposed.json"), JSON.stringify({ ...MOVE, name: "close_deal" }));
  assert.throws(() => execFileSync(process.execPath, [`${P}/scripts/gtm-os-approve/approve.mjs`, root, "--interaction", "--by", "marta"], { encoding: "utf8", env, stdio: "pipe" }), /already/);
  unlinkSync(join(root, "work", "interaction.proposed.json"));
});

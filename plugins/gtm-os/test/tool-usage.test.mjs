process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// The brain sees how it is used: the PostToolUse hook logs MCP calls into the brain, and the
// advisor turns that and the memories' actions into findings. Driven here without Codex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// Keep real installation preferences out of synthetic test brains.
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-test-profile-"));
const lib = await import(`${P}/lib/brain.mjs`);
const root = mkdtempSync(join(tmpdir(), "gtm-os-usage-"));
execFileSync("git", ["init", "-q", root]);
execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P }, stdio: "ignore" });
const hooks = JSON.parse(readFileSync(`${P}/hooks.json`, "utf8")).hooks;
const hook = (event, cwd = root, script = "tool-usage.sh", name = "PostToolUse") => {
  if (!hooks[name]?.some(rule => new RegExp(rule.matcher).test(event.tool_name || ""))) return;
  return execFileSync("bash", [`${P}/hooks/${script}`], { input: JSON.stringify({ hook_event_name: name, session_id: "t", cwd, ...event }), encoding: "utf8", env: { ...process.env, PLUGIN_ROOT: P } });
};
const turn = (event, name) => hook(event, root, "turns.sh", name);

test("registered hooks observe MCP calls and Computer Use, skip development calls, and write nothing outside a brain", () => {
  hook({ tool_name: "mcp__gtm_os__recall", tool_input: { brain: root, query: "Castorama" }, tool_response: { content: [{ type: "text", text: "1 hit" }] } });
  hook({ tool_name: "mcp__cua_repl__js", tool_input: { code: "await cua.getState();", title: "Find existing dashboard tab" }, tool_response: {} });
  hook({ tool_name: "mcp__gtm_os__remember", tool_input: { brain: root }, tool_response: { isError: true, content: [] } });
  hook({ tool_name: "mcp__codex_apps__gmail_search", tool_input: { query: "Bergstrom" }, tool_response: {} });
  for (const tool_name of ["exec_command", "shell_command", "apply_patch", "write_stdin", "exec", "wait", "functions.exec", "functions.wait"]) {
    hook({ tool_name, tool_input: {} });
  }
  for (const tool of ["exec_command", "shell_command", "apply_patch"]) {
    assert.ok(hooks.PreToolUse.some(rule => new RegExp(rule.matcher).test(tool)), `${tool} retains the write gate`);
  }
  const lines = readFileSync(join(root, "work", "tool-usage.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert.equal(lines.length, 4);
  assert.deepEqual(lines.map(l => `${l.server || "-"}:${l.name}`), ["gtm_os:recall", "cua_repl:js", "gtm_os:remember", "codex_apps:gmail_search"]);
  assert.equal(lines[1].computer, true); assert.equal(lines[1].title, "Find existing dashboard tab");
  assert.equal(lines[0].computer, false); assert.equal(lines[2].error, true); assert.equal(lines[0].error, false);
  assert.match(lines[0].at, /^\d{4}-\d\d-\d\dT/);
  const elsewhere = mkdtempSync(join(tmpdir(), "not-a-brain-"));
  hook({ tool_name: "mcp__gtm_os__recall", tool_input: {} }, elsewhere);
  assert.ok(!existsSync(join(elsewhere, "work")), "no brain, no log");
});

test("the advisor reads the log and the memories' actions: the screen reached for, a recurring interaction, an unlisted tool", () => {
  for (let i = 0; i < 3; i++) lib.appendMemory(root, "offer", { authors: ["marta-nowak"], content: `Moved the Castorama deal to stage ${i + 1}.`, tools: ["attio"], actions: [{ tool: "attio", action: "move deal", ref: `deal-${i}` }], at: new Date(Date.now() - i * 86400000).toISOString() });
  const { findings } = JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-os-advisor/advisor.mjs`, ".", "--json"], { cwd: root, encoding: "utf8" }));
  const by = Object.fromEntries(findings.map(f => [f.key, f]));
  assert.ok(by["computer-use"], "computer use is a finding"); assert.match(by["computer-use"].what, /1 time .*Find existing dashboard tab/); assert.match(by["computer-use"].what, /1 GTM OS call failed/);
  assert.ok(by["recurring-action"], "work repeated on separate days is a finding"); assert.match(by["recurring-action"].what, /"attio: move deal" was done on 3 separate days in the last 30 \(3 times; offer\)/); assert.match(by["recurring-action"].do, /Say: make a skill for "move deal" in attio\./);
  assert.ok(by["tool-unlisted"], "a tool used but unlisted is a finding"); assert.match(by["tool-unlisted"].what, /^attio is used in the notes/);
});

test("the turn hooks keep the ask and the answer, and a read that found nothing is marked", () => {
  turn({ prompt: "What do we know about Bergstrom?" }, "UserPromptSubmit");
  hook({ session_id: "t", tool_name: "mcp__gtm_os__recall", tool_input: { brain: root, query: "Bergstrom" }, tool_response: { content: [{ type: "text", text: 'nothing about "Bergstrom" in any context (2 memories searched).' }] } });
  hook({ session_id: "t", tool_name: "mcp__gtm_os__query", tool_input: { brain: root, object: "memories", filters: { context: "market" } }, tool_response: { content: [{ type: "text", text: "no rows" }] } });
  turn({ last_assistant_message: "Nothing in the brain about Bergstrom yet." }, "Stop");
  turn({ something_else: "x" }, "Stop");   // an unrecognised shape keeps its field names, so a real run teaches the parser
  const turns = readFileSync(join(root, "work", "turns.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert.deepEqual(turns.map(t => t.kind), ["prompt", "answer", "answer"]);
  assert.equal(turns[0].text, "What do we know about Bergstrom?"); assert.equal(turns[0].session, "t");
  assert.equal(turns[1].text, "Nothing in the brain about Bergstrom yet.");
  assert.equal(turns[2].text, ""); assert.match(turns[2].fields, /something_else/);
  const usage = readFileSync(join(root, "work", "tool-usage.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert.equal(usage.at(-1).empty, true, "query: no rows"); assert.equal(usage.at(-2).empty, true, "recall: nothing about"); assert.equal(usage.at(-1).session, "t"); assert.equal(usage[0].empty, false);
});

test("the advisor names the ask the brain had nothing for, and the ask that keeps coming back", () => {
  for (let i = 0; i < 3; i++) turn({ prompt: "What is the trial length for retailers?" }, "UserPromptSubmit");
  const { findings } = JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-os-advisor/advisor.mjs`, ".", "--json"], { cwd: root, encoding: "utf8" }));
  const by = Object.fromEntries(findings.map(f => [f.key, f]));
  assert.ok(by["asked-empty"], "an unmet ask is a finding"); assert.match(by["asked-empty"].what, /found nothing in the brain: "What do we know about Bergstrom\?"/);
  assert.ok(by["asked-again"], "a repeated ask is a finding"); assert.match(by["asked-again"].what, /asked 3 times/);
});

test("the advisor suggests a skill, never writes a proposal or a skill by itself (ALL-210, ALL-213)", () => {
  const PROPI = join(root, "work", "interaction.proposed.json");
  const advise = () => JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-os-advisor/advisor.mjs`, ".", "--json"], { cwd: root, encoding: "utf8" })).findings;
  const first = advise();
  assert.ok(!existsSync(PROPI), "a brain check is read-only: no proposal nobody asked for");
  const recurring = first.find(f => f.key === "recurring-action");
  assert.match(recurring.do, /Say: make a skill for "move deal" in attio\./);
  assert.ok(!first.some(f => f.key === "interaction-proposed"), "nothing is pending");
  const asked = { name: "move_deal", title: "Move a deal", tool: "attio", operation: "Move the deal to the named stage in Attio.", input_schema: { type: "object", properties: { who: { type: "string" } }, required: ["who"], additionalProperties: false }, record: { context: "offer", kind: "note", content: "Moved the deal for {who}." } };
  writeFileSync(PROPI, JSON.stringify(asked));
  const pending = advise();
  assert.ok(pending.some(f => f.key === "interaction-proposed"), "a proposal the person asked for is listed");
  assert.match(pending.find(f => f.key === "recurring-action").do, /proposal is on the dashboard/);
  writeFileSync(PROPI, JSON.stringify({ ...asked, record: { ...asked.record, context: "nowhere" } }));
  assert.ok(!advise().some(f => f.key === "interaction-proposed"), "an invalid leftover is not listed, the same as the dashboard");
  unlinkSync(PROPI);
});

test("a batch done in one day is not repetition: thirteen Circle events on one day are no finding (ALL-213)", () => {
  const day = new Date(Date.now() - 2 * 86400000).toISOString();
  for (let i = 0; i < 13; i++) lib.appendMemory(root, "offer", { authors: ["marta-nowak"], content: `Published Q4 event ${i + 1} in Circle.`, tools: ["circle"], actions: [{ tool: "circle", action: "create event", ref: `event-${i}` }], at: day });
  const { findings } = JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-os-advisor/advisor.mjs`, ".", "--json"], { cwd: root, encoding: "utf8" }));
  assert.ok(!findings.some(f => f.key === "recurring-action" && /circle: create event/.test(f.what)), "one sitting is one occasion");
});

test("a brain skill that covers the repeated work turns the suggestion into 'use it', and the advisor writes nothing (ALL-213)", async () => {
  const us = await import(`${P}/lib/user-skills.mjs`);
  const id = us.skillId("attio move deal");
  us.writeUserSkill(root, { id, title: "Attio move deal", description: "Move a deal to the next stage in Attio and note why.", body: "1. Find the deal.", by: "marta-nowak", version: "0.22.0" });
  const { findings } = JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-os-advisor/advisor.mjs`, ".", "--json"], { cwd: root, encoding: "utf8" }));
  assert.match(findings.find(f => f.key === "recurring-action" && /attio: move deal/.test(f.what)).do, new RegExp(`The skill ${id} covers it: say /${id}\\.`));
  assert.equal(us.listUserSkills(root).length, 1, "the check created no skill");
  execFileSync("rm", ["-rf", join(root, ".agents")]);
});

test("a successful connector call in chat is the read test: the tool flips to ok once; failures, GTM OS calls and uninstalled tools change nothing (ALL-211)", () => {
  const file = join(root, "work", "tools.json"), read = () => JSON.parse(readFileSync(file, "utf8"));
  const base = { attio: { tool: "Attio (CRM)", plugin: "attio", status: "installed" }, gmail: { tool: "Gmail", plugin: "gmail", status: "installed" }, "google calendar": { tool: "Google Calendar", plugin: "google-calendar", status: "available, not installed" } };
  writeFileSync(file, JSON.stringify(base));
  hook({ tool_name: "mcp__codex_apps__attio_search_records", tool_input: {}, tool_response: { isError: true, content: [] } });
  hook({ tool_name: "mcp__gtm_os__recall", tool_input: { brain: root, query: "x" }, tool_response: {} });
  hook({ tool_name: "mcp__codex_apps__google_calendar_list_events", tool_input: {}, tool_response: {} });
  assert.deepEqual(read(), base, "a failed call, a GTM OS call and an uninstalled tool prove nothing");
  hook({ tool_name: "mcp__codex_apps__attio_whoami", tool_input: {}, tool_response: {} });
  const flipped = read().attio;
  assert.equal(flipped.test, "ok"); assert.match(flipped.note, /used in chat: attio_whoami/); assert.match(flipped.at, /^\d{4}-/);
  hook({ tool_name: "mcp__attio__get-records-by-ids", tool_input: {}, tool_response: {} });   // a raw MCP server named after the tool
  assert.deepEqual(read().attio, flipped, "already tested: not rewritten on every call");
  hook({ tool_name: "mcp__codex_apps__gmail.search_emails", tool_input: {}, tool_response: {} });
  assert.equal(read().gmail.test, "ok"); assert.equal(read()["google calendar"].test, undefined);
});

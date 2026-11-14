// RULES.md "Ask the source" (ALL-712): which tool knows better than a saved note, and how old a note may be.
// The parser on the shipped, a hand-edited and a broken table; the defaults when the section is missing; and
// every line the model sees (load, recall, the brief, the chat start, the rules check) on a fixed clock.
// Run: node --test plugins/gtm-brain/test/ask-source.test.mjs
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const T = join(P, "templates");
const NOW = "2026-11-14T10:00:00Z";
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-ask-codex-")), GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1",
  GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NOW: NOW };
delete env.GTM_BRAIN_NO_COMMIT; delete env.GTM_BRAIN_RUN;
process.env.CODEX_HOME = env.CODEX_HOME; process.env.GTM_BRAIN_NOW = NOW;
const lib = await import(`${P}/lib/brain.mjs`);
const ask = await import(`${P}/lib/ask-source.mjs`);
const where = await import(`${P}/lib/where.mjs`);
const { ruleFindings, rulesReport } = await import(`${P}/lib/rules-check.mjs`);

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-ask-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "GTM Tech Week", "--one-liner", "events", "--owner", "Artur Wala <artur@gtmweek.io>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const start = root => execFileSync("bash", [`${P}/session/session-start.sh`], { cwd: root, env, encoding: "utf8", input: JSON.stringify({ session_id: "", cwd: root }) });
const node = (root, script, ...args) => execFileSync(process.execPath, [`${P}/scripts/${script}`, root, ...args], { cwd: root, env, encoding: "utf8" });
const tools = (root, t) => { mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(join(root, "work", "tools.json"), JSON.stringify(t)); };
const CONNECTED = {
  hubspot: { tool: "HubSpot", status: "installed", test: "ok" },
  "google calendar": { tool: "Google Calendar", status: "installed" },
  gmail: { tool: "Gmail", status: "installed", declined: true },
  stripe: { tool: "Stripe", status: "installed", test: "fail" },
};

test("the shipped table: seven rows, read from templates/RULES.md", () => {
  const rows = ask.defaultRows();
  assert.deepEqual(rows.map(r => [r.topic, r.ask.brain ? "brain" : r.ask.kind, r.good_for]), [
    ["Deal stage and amount", "crm", 1], ["Invoice or payment status", "billing", 1], ["Who registered for an event", "events", 1],
    ["Meeting times, the next meeting", "calendar", "live"], ["The latest email in a thread", "email", "live"],
    ["What was said in a meeting", "meetings", "always"], ["Who someone is, decisions, our strategy", "brain", "always"]]);
  const parsed = ask.parseAskSource(readFileSync(join(T, "RULES.md"), "utf8"));
  assert.equal(parsed.found, true); assert.deepEqual(parsed.problems, []);
  // the where table is not touched by the new section: the same eleven rows as before
  assert.equal(where.whereRows(T).length, 11);
});

test("a hand-edited table: columns by header name, spaces, backticks, tool names, other times", () => {
  const text = `# Rules\n\n## Ask the source\n\nOur own words.\n\n|Ask|  Brain answer is good for |Question about|\n|---|---|---|\n|  CRM (HubSpot) | 2 weeks |  Deal stage   |\n| \`Luma\` | 12 hours | Event registrations |\n| Google Calendar | live | Next meeting |\n| the brain | forever | Our strategy |\n| Zapier | 1 day | Automations |\n| Email | soon-ish | Replies |\n\n## Our rules\n`;
  const r = ask.parseAskSource(text, { tools: ["Zapier"] });
  assert.deepEqual(r.rows.map(x => [x.topic, x.source, x.ask.kind, x.ask.names, x.good_for]), [
    ["Deal stage", "CRM (HubSpot)", "crm", ["hubspot"], 14], ["Event registrations", "Luma", "events", ["luma"], 0.5],
    ["Next meeting", "Google Calendar", "calendar", [], "live"], ["Our strategy", "the brain", null, [], "always"],
    ["Automations", "Zapier", null, ["zapier"], 1]]);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0].problem, /"Replies": "soon-ish" is not a time/); assert.equal(r.problems[0].line, 14);
  // a tool nobody names is reported, not guessed
  const unknown = ask.parseAskSource(text);
  assert.ok(unknown.problems.some(p => /Ask "Zapier" is not the brain, a kind of tool/.test(p.problem)));
  for (const [v, want] of [["1 day", 1], ["3 days", 3], ["2 weeks", 14], ["1 month", 30], ["always ask", "live"], ["no limit", "always"], ["no limit, once saved", "always"], ["always", "always"], ["0 days", "live"], ["", null], ["tomorrow", null]])
    assert.equal(ask.parseGoodFor(v), want, v);
});

test("a broken table is reported line by line and never throws; the defaults stand in when no row can be read", () => {
  for (const junk of [null, undefined, "", "\u0000\u0001|||", "## Ask the source\n| a |\n|"]) assert.doesNotThrow(() => ask.parseAskSource(junk));
  assert.match(ask.parseAskSource("## Ask the source\n\nnothing here\n").problems[0].problem, /has no table/);
  assert.match(ask.parseAskSource("## Ask the source\n\n| Topic | Tool |\n| --- | --- |\n| Deals | CRM |\n").problems[0].problem, /no Brain answer is good for column/);
  const noSep = ask.parseAskSource("## Ask the source\n\n| Question about | Ask | Brain answer is good for |\n| Deals | CRM | 1 day |\n");
  assert.equal(noSep.rows.length, 1); assert.match(noSep.problems[0].problem, /separator/);

  const root = brain(), path = join(root, "RULES.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("| Deal stage and amount | CRM | 1 day |", "| Deal stage and amount | CRM | someday |"));
  let r = ask.readAskSource(root);
  assert.equal(r.defaults, false); assert.equal(r.rows.length, 6); assert.equal(r.problems.length, 1);
  const f = ruleFindings(root).filter(x => x.kind === "ask");
  assert.equal(f.length, 1); assert.equal(f[0].rule, "RULES.md Ask the source");
  assert.match(f[0].what, /^RULES\.md line 43, Ask the source: "Deal stage and amount": "someday" is not a time; the other rows still apply\.$/);
  assert.match(rulesReport(root), /, 1 Ask the source rows\)[\s\S]*\[RULES\.md Ask the source\] RULES\.md line 43/);
  // every row broken: the shipped rows apply, and the check says so
  const text = readFileSync(path, "utf8"), table = text.slice(text.indexOf("| Question about"), text.indexOf("## Our rules"));
  writeFileSync(path, text.replace(table, "| Question about | Ask | Brain answer is good for |\n| --- | --- | --- |\n| Deals | | 1 day |\n\n"));
  r = ask.readAskSource(root);
  assert.equal(r.defaults, true); assert.equal(r.rows.length, 7);
  assert.match(ruleFindings(root).find(x => x.kind === "ask").what, /until it is fixed, the built-in rows apply/);
});

test("a RULES.md without the section (edited before 0.35.0) uses the shipped rows and is never rewritten; an unedited 0.33.10 one gets the section", () => {
  const edited = brain(), old = readFileSync(join(T, "legacy", "rules", "0.33.10.md"), "utf8");
  const mine = `${old.trimEnd()}\n\nAlways ask before tagging a client.\n`;
  writeFileSync(join(edited, "RULES.md"), mine);
  execFileSync("git", ["-C", edited, "commit", "-qam", "my rules"]);
  start(edited);
  assert.equal(readFileSync(join(edited, "RULES.md"), "utf8"), mine, "an edited file is left as it is");
  const r = ask.readAskSource(edited);
  assert.equal(r.defaults, true); assert.deepEqual(r.rows, ask.defaultRows()); assert.deepEqual(r.problems, []);
  assert.equal(ruleFindings(edited).filter(x => x.kind === "ask").length, 0, "a missing section is not a problem");

  const unedited = brain();
  writeFileSync(join(unedited, "RULES.md"), old); execFileSync("git", ["-C", unedited, "commit", "-qam", "0.33.10 rules"]);
  start(unedited);
  assert.equal(readFileSync(join(unedited, "RULES.md"), "utf8"), readFileSync(join(T, "RULES.md"), "utf8"));
  assert.equal(ask.readAskSource(unedited).defaults, false);
  assert.equal(where.whereRows(unedited).length, 11);
});

test("the lines the model sees, on a fixed clock: load, recall, the brief and the chat start", () => {
  const root = brain();
  lib.addName(root, "Anna Lee");
  const note = (content, at, source, people = ["Anna Lee"]) => lib.appendMemory(root, "company", { authors: ["artur-wala"], content, at, source, people });
  note("Acme deal moved to Proposal, 12000 EUR.", "2026-11-05T09:00:00Z", [{ kind: "hubspot", ref: "deal/42" }]);
  note("Acme kickoff call on Thursday 2026-11-12.", "2026-11-10T09:00:00Z", [{ kind: "google-calendar", ref: "evt_1" }]);
  note("Acme asked for the invoice again.", "2026-11-01T09:00:00Z", [{ kind: "gmail", ref: "thread_1" }]);
  note("Acme invoice 7 is unpaid.", "2026-11-01T09:00:00Z", [{ kind: "stripe", ref: "in_7" }]);
  note("Anna said Acme cares most about onboarding.", "2026-10-01T09:00:00Z", [{ kind: "granola", ref: "m_1" }]);
  execFileSync("git", ["-C", root, "add", "-A"]); execFileSync("git", ["-C", root, "commit", "-qm", "notes"]);
  const DEAL = "Deal stage and amount: the newest note here from the CRM is 9 days old (2026-11-05); RULES.md says ask HubSpot (good for 1 day). Read it there before answering.";
  const CAL = /Meeting times, the next meeting: notes here from the calendar are a record of 2026-11-1\d, not the live answer; RULES.md says always ask Google Calendar\. Read it there before answering\./;

  // nothing connected: no line anywhere, the brain answers with its ages
  assert.doesNotMatch(node(root, "gtm-brain-load/load.mjs", "company"), /RULES\.md says/);
  assert.doesNotMatch(start(root), /Ask the source/);

  tools(root, CONNECTED);
  const load = node(root, "gtm-brain-load/load.mjs", "company");
  assert.ok(load.includes(DEAL), load); assert.match(load, CAL);
  const said = out => out.split("\n").filter(l => /RULES\.md says/.test(l));
  assert.equal(said(load).length, 2, "declined and failed tools, and no-limit rows, add nothing");
  const recall = node(root, "gtm-brain-recall/recall.mjs", "Acme");
  assert.ok(recall.includes(DEAL), recall); assert.match(recall, CAL);
  const brief = node(root, "gtm-brain-recall/recall.mjs", "--entity", "Anna Lee");
  assert.ok(brief.includes(DEAL), brief);
  const onlyOld = node(root, "gtm-brain-recall/recall.mjs", "onboarding");
  assert.doesNotMatch(onlyOld, /RULES\.md says/, "a meeting note is good once saved");

  const opening = start(root);
  assert.match(opening, /Ask the source \(RULES\.md\): read the tool instead of answering from saved notes for deal stage and amount: HubSpot, when the note is over 1 day old; meeting times, the next meeting: Google Calendar, always\. A changed value is a new note\. Anything else, or a tool not connected: answer from the brain and say how old the note is\./);

  // a fresh note is inside its window: no line; a row the person narrowed to another CRM: no line
  const later = { ...env, GTM_BRAIN_NOW: "2026-11-05T20:00:00Z" };
  assert.doesNotMatch(execFileSync(process.execPath, [`${P}/scripts/gtm-brain-load/load.mjs`, root, "company"], { cwd: root, env: later, encoding: "utf8" }), /Deal stage and amount:/);
  const path = join(root, "RULES.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("| Deal stage and amount | CRM | 1 day |", "| Deal stage and amount | Attio | 1 day |"));
  assert.doesNotMatch(node(root, "gtm-brain-load/load.mjs", "company"), /Deal stage and amount:/);
  assert.doesNotMatch(start(root), /deal stage and amount/);
});

test("query (memories) through the MCP server carries the same line, after the rows", async () => {
  const root = brain();
  lib.appendMemory(root, "company", { authors: ["artur-wala"], content: "Acme deal moved to Proposal.", at: "2026-11-05T09:00:00Z", source: [{ kind: "hubspot", ref: "deal/42" }] });
  lib.appendMemory(root, "company", { authors: ["artur-wala"], content: "Acme likes the onboarding plan.", at: "2026-11-05T09:00:00Z", source: [] });
  tools(root, CONNECTED);
  const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env: { ...env, GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1" } });
  const pending = new Map(); let seq = 0;
  createInterface({ input: server.stdout }).on("line", line => { const m = JSON.parse(line); pending.get(m.id)?.(m); pending.delete(m.id); });
  const call = (name, args) => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) + "\n"); }).then(m => m.result.content.map(c => c.text).join("\n"));
  try {
    const hit = await call("query", { brain: root, object: "memories", search: "Proposal" });
    assert.match(hit, /^1 row:\n\{/);
    assert.match(hit, /\n\nDeal stage and amount: the newest note here from the CRM is 9 days old \(2026-11-05\); RULES\.md says ask HubSpot \(good for 1 day\)\./);
    assert.doesNotMatch(await call("query", { brain: root, object: "memories", search: "onboarding plan" }), /RULES\.md says/, "a note with no CRM source adds nothing");
  } finally { server.kill(); }
});

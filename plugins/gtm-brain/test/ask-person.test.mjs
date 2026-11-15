// ask_person: one question to the person in the host's native form (server/ask-person.mjs). The form's
// schema for choices and for free text, every answer path (picked, typed, closed, not shown, no forms),
// and that an answer never stands in for APPROVE. Through the module and through the MCP server.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { buildForm, readForm, askPerson, answerText, noAnswerText, properties, required } from "../server/ask-person.mjs";
import { questionInput, NOT_SHOWN_MS } from "../server/question-input.mjs";
import { SOMETHING_ELSE } from "../scripts/gtm-brain-learn-company/question.mjs";
import { host } from "../lib/host.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-brain-ask-codex-")), HOME: mkdtempSync(join(tmpdir(), "gtm-brain-ask-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SESSION_START: "1" };
for (const k of ["GTM_BRAIN_NO_COMMIT", "GTM_BRAIN_RUN", "GTM_BRAIN_APPROVAL_TICKET", "GTM_BRAIN_HOST", "GTM_BRAIN_TEST_LAYOUT"]) delete env[k];
const roots = [];
after(() => { for (const r of [...roots, env.CODEX_HOME, env.HOME]) { try { rmSync(r, { recursive: true, force: true }); } catch {} } });

const args = { question: "Are Anna Kowal and Anna Kowalska the same person?", why: "One page per person keeps their notes together.", choices: ["No, they are different people", "Yes, the same person"] };

// A form transport whose host answers each form in turn; `late` moves the clock so a close reads as the person's.
function transport(answers, { capabilities = { elicitation: { form: {} } }, ms = NOT_SHOWN_MS + 1000 } = {}) {
  let clock = 0; const sent = [];
  const q = questionInput(m => { sent.push(m); if (m.method !== "elicitation/create") return; clock += ms; queueMicrotask(() => q.receive({ id: m.id, result: answers.shift() })); }, () => clock);
  q.initialize(capabilities);
  return { q, sent };
}
const ask = async (a, answers, options) => { const t = transport(answers, options); return { ...(await askPerson(t.q, a, 1)), forms: t.sent.filter(m => m.method === "elicitation/create").map(m => m.params) }; };

test("the form for choices: one single-select field, the choices in order, the typed answer last, no default", () => {
  const form = buildForm(args);
  assert.equal(form.params.mode, "form");
  assert.equal(form.params.message, `${args.question}\n\n${args.why}`, "the question, then the line on why it matters");
  assert.deepEqual(Object.keys(form.params.requestedSchema.properties), ["choice"], "one field: a host shows one field per page");
  const field = form.params.requestedSchema.properties.choice;
  assert.equal(field.type, "string"); assert.equal(field.title, args.question);
  assert.deepEqual(field.enum, [...args.choices, SOMETHING_ELSE], "recommended first, as passed");
  assert.equal(field.default, undefined); assert.deepEqual(form.params.requestedSchema.required, []);
  assert.doesNotMatch(JSON.stringify(form.params), /autoResolution|timeout/i, "no timeout that could stand in for an answer");
  // own_answer false: nothing but the listed choices
  assert.deepEqual(buildForm({ ...args, own_answer: false }).params.requestedSchema.properties.choice.enum, args.choices);
  // the model's own Other is the typed answer, offered once; four real choices fit
  assert.deepEqual(buildForm({ question: "Which?", choices: ["A", "B", "Other"], own_answer: false }).params.requestedSchema.properties.choice.enum, ["A", "B", SOMETHING_ELSE]);
  assert.equal(buildForm({ question: "Which?", choices: ["A", "B", "C", "D"] }).offered.length, 5);
  assert.equal(buildForm({ question: "Which?", choices: ["A", "B"] }).params.message, "Which?", "no why, no empty line");
});

test("the form for free text: no choices, one text field", () => {
  for (const choices of [undefined, null, []]) {
    const form = buildForm({ question: "What is the company's website?", why: "It names the company in every note.", choices });
    assert.deepEqual(Object.keys(form.params.requestedSchema.properties), ["answer"]);
    assert.equal(form.params.requestedSchema.properties.answer.type, "string");
    assert.equal(form.params.requestedSchema.properties.answer.enum, undefined);
  }
});

test("a question that cannot be asked is refused with what to fix, and no form is sent", async () => {
  assert.throws(() => buildForm({}), /question is required/);
  assert.throws(() => buildForm({ question: "Which?", choices: ["Only one"] }), /two to four/);
  assert.throws(() => buildForm({ question: "Which?", choices: ["A", "B", "C", "D", "E"] }), /two to four/);
  assert.throws(() => buildForm({ question: "Which?", choices: ["A", "A"] }), /two to four distinct/);
  assert.throws(() => buildForm({ question: "Which?", choices: "A or B" }), /list of two to four/);
  assert.throws(() => buildForm({ question: "x".repeat(301) }), /longer than 300/);
  assert.throws(() => buildForm({ question: "Which?", choices: ["A", "B"], own_answer: "yes" }), /true or false/);
  const r = await ask({ question: "Which?", choices: ["Only one"] }, []);
  assert.equal(r.isError, true); assert.match(r.text, /^not asked: /); assert.equal(r.forms.length, 0);
});

test("a picked choice comes back as the person's answer, marked as theirs", async () => {
  const r = await ask(args, [{ action: "accept", content: { choice: args.choices[0] } }]);
  assert.equal(r.forms.length, 1); assert.ok(!r.isError);
  assert.match(r.text, /^The person's answer \(picked in the form\): "No, they are different people"\n/);
  assert.match(r.text, /do not ask it again/);
  assert.match(r.text, /approves nothing/);
});

test("a typed answer: the last choice opens a text form, and its text is the answer", async () => {
  const r = await ask(args, [{ action: "accept", content: { choice: SOMETHING_ELSE } }, { action: "accept", content: { text: "  Different, but Kowalska is her married name  " } }]);
  assert.equal(r.forms.length, 2);
  assert.deepEqual(Object.keys(r.forms[1].requestedSchema.properties), ["text"]);
  assert.equal(r.forms[1].message, args.question);
  assert.match(r.text, /^The person's answer \(typed in the form\): "Different, but Kowalska is her married name"\n/);
  // a host that shows both fields on one page may send the text with the choice: one form is enough
  const one = await ask(args, [{ action: "accept", content: { choice: SOMETHING_ELSE, text: "Ask Marta" } }]);
  assert.equal(one.forms.length, 1); assert.match(one.text, /typed in the form\): "Ask Marta"/);
  // free text without choices
  const free = await ask({ question: "What is the website?" }, [{ action: "accept", content: { answer: "reflow.io" } }]);
  assert.equal(free.forms.length, 1); assert.match(free.text, /typed in the form\): "reflow.io"/);
});

test("a closed, declined, empty or timed-out form is no answer: ask once in plain chat text and end the turn", async () => {
  for (const answer of [{ action: "cancel" }, { action: "decline" }, { action: "accept", content: {} }, { action: "accept", content: { choice: "" } }, { action: "accept" }, { action: "accept", content: { choice: "Invented" } }]) {
    const r = await ask(args, [answer]);
    assert.match(r.text, /^no answer \(/, JSON.stringify(answer)); assert.ok(!r.isError);
    assert.match(r.text, /neither an answer nor a refusal, and it authorizes nothing/);
    assert.match(r.text, /Ask the same question once as plain chat text .* and end the turn\.$/);
    assert.doesNotMatch(r.text, /The person's answer/);
  }
  // closing the typed-answer form is no answer either, never a choice of "Something else"
  const closed = await ask(args, [{ action: "accept", content: { choice: SOMETHING_ELSE } }, { action: "cancel" }]);
  assert.match(closed.text, /^no answer \(the person chose to type an answer and closed the form without one\)/);
  // the host cancels the tool call (its timeout, or the person stops the turn): the pending form resolves as no answer
  const sent = [], q = questionInput(m => sent.push(m)); q.initialize({ elicitation: {} });
  const waiting = askPerson(q, args, 7); await new Promise(r => setImmediate(r)); q.cancel(7);
  assert.match((await waiting).text, /^no answer \(/);
});

test("a host that hides forms, or has none: no answer, the host's own box or chat text, and no second form", async () => {
  // Codex declines forms itself in Full access and marks the answer as its own
  const t = transport([{ action: "decline", _meta: { approvals_reviewer: "auto_review" } }]);
  const first = await askPerson(t.q, args, 1);
  assert.match(first.text, /^no answer \(the host closed the form before the person saw it\)/);
  assert.match(first.text, /do not call ask_person again in this chat/);
  assert.match(first.text, /host's own question box when this chat has one; otherwise ask once as plain chat text/);
  const again = await askPerson(t.q, args, 2);
  assert.match(again.text, /^no answer \(the host closed the form/); assert.equal(t.sent.length, 1, "no further form into a host that hides them");
  // a decline faster than a person can read is the host's too
  assert.match((await ask(args, [{ action: "decline" }], { ms: 50 })).text, /the host closed the form before the person saw it/);
  // no elicitation capability at all
  const none = await ask(args, [], { capabilities: {} });
  assert.match(none.text, /^no answer \(this host cannot show forms\)/); assert.equal(none.forms.length, 0);
});

test("APPROVE is never a choice of ask_person, and a typed APPROVE is only an answer", async () => {
  for (const word of ["APPROVE", "approve", " Approve. ", "Approved"]) assert.throws(() => buildForm({ question: "Apply the change?", choices: [word, "Not now"] }), /APPROVE is never a choice here/, word);
  const refused = await ask({ question: "Apply the change?", choices: ["APPROVE", "Not now"] }, []);
  assert.equal(refused.isError, true); assert.equal(refused.forms.length, 0);
  const typed = await ask({ question: "Apply the change?", choices: ["Yes, go ahead", "No, skip it"] }, [{ action: "accept", content: { choice: SOMETHING_ELSE } }, { action: "accept", content: { text: "APPROVE" } }]);
  assert.match(typed.text, /typed in the form\): "APPROVE"/);
  assert.match(typed.text, /approves nothing: a workplace or interaction change still goes only through approve_change/);
  assert.equal(readForm(buildForm(args), { action: "accept", content: { choice: "APPROVE" } }).status, "none", "a choice that was not offered is no answer");
  assert.match(answerText({ answer: "APPROVE", typed: true }), /approves nothing/); assert.match(noAnswerText("x"), /authorizes nothing/);
});

test("both hosts describe ask_person and put it first: the form, the host's own box, chat text", () => {
  for (const [id, box] of [["codex", "request_user_input"], ["claude", "AskUserQuestion"]]) {
    const t = host({ GTM_BRAIN_HOST: id }).texts, d = t.askPerson(), line = t.questions({ form: true });
    assert.ok(d.length <= 2048, `${id}: the description is ${d.length} characters; a host keeps 2048`);
    assert.match(d, new RegExp(`before ${box} and before numbered chat text`));
    assert.match(d, /never stands in for APPROVE/); assert.match(d, /needs no brain/);
    assert.match(line, /^\nQuestions: ask every question with ask_person/);
    assert.ok(line.indexOf("ask_person") < line.indexOf(box) && line.indexOf(box) < line.indexOf("plain chat text and end the turn: one question"), `${id}: form, box, text`);
    assert.match(line, /never add Other or Something else/); assert.match(line, /APPROVE still goes only through approve_change/);
    assert.match(t.questions({ form: false }), new RegExp(`^\\nQuestions: this host cannot show the ask_person form, so ask with ${box}`));
    assert.ok(![8212, 8211].some(c => (d + line).includes(String.fromCharCode(c))), "plain hyphens only");
  }
  assert.match(host({ GTM_BRAIN_HOST: "codex" }).texts.questions({ boxOn: true }), /this Codex has its question box on/);
});

/* ---------- through the MCP server ---------- */
function client(answer, hostId) {
  const child = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env: hostId ? { ...env, GTM_BRAIN_HOST: hostId } : env });
  const pending = new Map(); let seq = 0; const forms = [];
  createInterface({ input: child.stdout }).on("line", line => {
    const m = JSON.parse(line);
    if (m.method === "elicitation/create") { forms.push(m.params); setTimeout(() => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: answer(m.params, forms.length) }) + "\n"), 5); return; }
    const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); }
  });
  const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const call = async (name, a) => { const m = await rpc("tools/call", { name, arguments: a }); return { text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };
  after(() => child.kill());
  return { rpc, call, forms, init: () => rpc("initialize", { capabilities: answer ? { elicitation: { form: {} } } : {} }) };
}

test("the server lists ask_person on both hosts and answers it with no brain folder", async () => {
  for (const id of ["", "claude"]) {
    const c = client(p => ({ action: "accept", content: { choice: p.requestedSchema.properties.choice.enum[0] } }), id);
    const init = await c.init();
    assert.match(init.result.instructions, /Questions: ask every question with ask_person/, id || "codex");
    const tool = (await c.rpc("tools/list")).result.tools.find(t => t.name === "ask_person");
    assert.ok(tool, `${id || "codex"}: ask_person is listed`);
    assert.equal(tool.description, host({ GTM_BRAIN_HOST: id || "codex" }).texts.askPerson());
    assert.deepEqual(tool.inputSchema.required, required);
    assert.deepEqual(Object.keys(tool.inputSchema.properties).sort(), ["brain", ...Object.keys(properties)].sort());
    assert.equal(tool.inputSchema.properties.choices.maxItems, 4); assert.equal(tool.annotations.readOnlyHint, true);
    const r = await c.call("ask_person", args);   // no brain passed
    assert.ok(!r.isError, r.text); assert.match(r.text, /^The person's answer \(picked in the form\): "No, they are different people"/);
    assert.equal(c.forms.length, 1); assert.deepEqual(c.forms[0].requestedSchema.properties.choice.enum, [...args.choices, SOMETHING_ELSE]);
    assert.match((await c.call("ask_person", { ...args, brain: "/nonexistent/folder" })).text, /^The person's answer/, "a folder that is no brain does not stop a question");
  }
  // a client without forms: the instructions say so, and a call is no answer
  const plain = client(null), init = await plain.init();
  assert.match(init.result.instructions, /Questions: this host cannot show the ask_person form, so ask with request_user_input/);
  assert.match((await plain.call("ask_person", args)).text, /^no answer \(this host cannot show forms\)/);
});

test("an ask_person answer of APPROVE applies nothing: the proposal waits and the workplace file is unchanged", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-ask-"))); roots.push(root);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>"], { cwd: root, env, stdio: "ignore" });
  const file = ["brain/admin.md", "config/settings.yaml"].map(f => join(root, f)).find(existsSync), before = readFileSync(file, "utf8");
  const proposal = join(root, "work", "admin.proposed.md");
  writeFileSync(proposal, before.replace("returns automation", "returns automation for UK retailers"));
  const head = () => execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), commit = head();
  const memories = () => execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });
  const clean = memories();
  // the person types APPROVE into ask_person's own-answer form
  const c = client((p, n) => n === 1 ? { action: "accept", content: { choice: SOMETHING_ELSE } } : { action: "accept", content: { text: "APPROVE" } });
  await c.init();
  const r = await c.call("ask_person", { brain: root, question: "Apply the change to what we sell?", why: "It changes the workplace info.", choices: ["Yes, go ahead", "No, skip it"] });
  assert.match(r.text, /typed in the form\): "APPROVE"/); assert.match(r.text, /approves nothing/);
  assert.equal(readFileSync(file, "utf8"), before, "the workplace file is unchanged");
  assert.ok(existsSync(proposal), "the proposal still waits for approve_change");
  assert.equal(head(), commit, "nothing was committed"); assert.equal(memories(), clean, "nothing was written in the brain");
  // and APPROVE cannot be offered as a choice
  const offered = await c.call("ask_person", { brain: root, question: "Apply the change?", choices: ["APPROVE", "Not now"] });
  assert.equal(offered.isError, true); assert.match(offered.text, /not asked: APPROVE is never a choice here/); assert.equal(c.forms.length, 2, "no form for it");
  assert.equal(readFileSync(file, "utf8"), before);
});

test("an answer given in the form is the person's words in the chat file, on both hosts (so a save that needs their word is not asked twice)", async () => {
  const { formAnswers } = await import("../lib/host.mjs");
  const picked = answerText({ answer: "No, they are different people", typed: false }), typed = answerText({ answer: 'Call her "Ania"', typed: true });
  // as text, as text parts, inside a JSON string, and next to other output
  assert.deepEqual(formAnswers(picked), ["No, they are different people"]);
  assert.deepEqual(formAnswers([{ type: "input_text", text: typed }]), ['Call her "Ania"']);
  assert.deepEqual(formAnswers(JSON.stringify({ content: [{ type: "text", text: picked }] })), ["No, they are different people"]);
  assert.deepEqual(formAnswers(JSON.stringify([{ type: "text", text: typed }])), ['Call her "Ania"']);
  assert.deepEqual(formAnswers(noAnswerText("the person closed the form")), [], "no answer is nobody's words");
  assert.deepEqual(formAnswers("remembered: m_1"), []); assert.deepEqual(formAnswers(undefined), []);
  const id = "0a1b2c3d-4e5f-6789-abcd-ef0123456789", { mkdirSync } = await import("node:fs");
  // Codex: a rollout file per thread
  const codexHome = mkdtempSync(join(tmpdir(), "gtm-brain-ask-rollout-")); roots.push(codexHome);
  const now = new Date(), day = join(codexHome, "sessions", String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0"));
  mkdirSync(day, { recursive: true });
  const rollout = join(day, `rollout-2026-11-15T10-00-00-${id}.jsonl`);
  const write = items => writeFileSync(rollout, [{ type: "session_meta", payload: { cwd: "/x" } }, ...items].map(x => JSON.stringify(x)).join("\n") + "\n");
  const said = { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Anna called about the venue." }] } };
  const codex = host({ GTM_BRAIN_HOST: "codex" });
  for (const [type, output] of [["function_call_output", picked], ["function_call_output", [{ type: "input_text", text: picked }]], ["custom_tool_call_output", JSON.stringify([{ type: "text", text: picked }])], ["mcp_tool_call_output", { content: [{ type: "text", text: picked }] }]]) {
    write([said, { type: "response_item", payload: { type, output } }]);
    assert.equal(codex.lastPersonText(id, codexHome), "Anna called about the venue. No, they are different people", `${type} ${typeof output}`);
    assert.deepEqual(codex.capture.turns(rollout).map(t => t.text), ["Anna called about the venue.", "(picked) No, they are different people"]);
  }
  write([said, { type: "response_item", payload: { type: "function_call_output", output: noAnswerText("the person closed the form") } }]);
  assert.equal(codex.lastPersonText(id, codexHome), "Anna called about the venue.", "a closed form adds nothing");
  // Claude Code: a session file per chat, the tool result a part of a user record
  const claudeHome = mkdtempSync(join(tmpdir(), "gtm-brain-ask-claude-")); roots.push(claudeHome);
  mkdirSync(join(claudeHome, "projects", "-x"), { recursive: true });
  const session = join(claudeHome, "projects", "-x", `${id}.jsonl`);
  writeFileSync(session, [{ type: "user", cwd: "/x", message: { role: "user", content: "Anna called about the venue." } },
    { type: "user", cwd: "/x", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: typed }] }] } },
    { type: "user", cwd: "/x", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "remembered: m_1" }] } }].map(x => JSON.stringify(x)).join("\n") + "\n");
  const claude = host({ GTM_BRAIN_HOST: "claude" });
  assert.equal(claude.lastPersonText(id, claudeHome), 'Anna called about the venue. Call her "Ania"');
  assert.deepEqual(claude.capture.turns(session).map(t => t.text), ["Anna called about the venue.", '(picked) Call her "Ania"']);
});

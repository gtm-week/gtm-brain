// The team's rules at save (lib/standing-rules.mjs rulesForSave): remember reads the rules again on every save and
// matches the note against each one, with no model call. Before 0.38.0 the rules reached Codex only as text before
// the first save, and a benchmark's churned-customer rule held in one run and not in the next. An ask-first rule,
// or one the note appears to break, holds the entry until the person answered (rule_checked: true is their yes);
// any other rule that applies tops the result; a rule that does not apply says nothing.
// Run: node --test plugins/gtm-brain/test/rules-at-save.test.mjs
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-rulesave-codex-")), GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1",
  GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1", GTM_BRAIN_NO_TOOLS_CHECK: "1" };
delete env.GTM_BRAIN_RUN;
process.env.CODEX_HOME = env.CODEX_HOME; process.env.GTM_BRAIN_NO_COMMIT = "1";
const S = await import(`${P}/lib/standing-rules.mjs`);
const lib = await import(`${P}/lib/brain.mjs`);

const RULES = [
  "- Ask before saving anything about pricing. Check with Anna first, every time. (Anna Lind, 2026-04-30)",
  "- A churned customer is never a prospect again: we do not chase them in outbound. (Anna Lind, 2026-07-14)",
].join("\n");
function brain({ rules = RULES } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-rulesave-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Northfold", "--one-liner", "events", "--owner", "Anna Lind <anna@northfold.test>"], { cwd: root, env, stdio: "ignore" });
  if (rules) appendFileSync(join(root, "RULES.md"), `\n${rules}\n`);
  return root;
}
// the chat tool's call (files-backend passes --hold-rules); chat: false is every other caller of remember.mjs
const rememberAll = (root, entries, { chat = true } = {}) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, root, "--by", "anna-lind", "--batch", (() => { const f = join(root, "work", `b-${Math.random()}.json`); writeFileSync(f, JSON.stringify(entries)); return f; })(), ...(chat ? ["--hold-rules", "true"] : [])], { cwd: root, env, encoding: "utf8" });
const remember = (root, entry, o) => rememberAll(root, [entry], o);
const say = r => `${r.stdout}${r.stderr}`;
const notes = root => lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories)).map(m => m.content);
const churned = root => { const r = remember(root, { content: "Acme Retail churned: they cancelled at the end of September.", companies: ["Acme Retail"], new_names: ["Acme Retail"], context: "company" }); assert.equal(r.status, 0, say(r)); return r; };

test("churn: adding a churned customer to the prospect list is held, quoting the rule and the note that says it churned", () => {
  const root = brain(); churned(root);
  const r = remember(root, { content: "Added Acme Retail to the prospect list for the Q1 outbound push.", companies: ["Acme Retail"], context: "company", tags: ["prospect"] });
  assert.equal(r.status, 2, say(r));
  assert.match(r.stderr, /^not remembered yet: team rule "A churned customer is never a prospect again/);
  assert.match(r.stderr, /RULES\.md line \d+/);
  assert.match(r.stderr, /the note says "prospect", "outbound"/);
  assert.match(r.stderr, /m_[0-9a-f]{12} says Acme Retail "Acme Retail churned/);
  assert.match(r.stderr, /appears to break the rule: do not save or act on it/);
  assert.match(r.stderr, /rule_checked: true/);
  assert.ok(!notes(root).some(c => /prospect list/.test(c)), "nothing written");
  // the person's yes: rule_checked saves it and says so first
  const yes = remember(root, { content: "Added Acme Retail to the prospect list for the Q1 outbound push.", companies: ["Acme Retail"], context: "company", tags: ["prospect"], rule_checked: true });
  assert.equal(yes.status, 0, say(yes));
  assert.match(yes.stdout, /^team rule "A churned customer[^\n]*Saved on the person's yes/);
  assert.ok(notes(root).some(c => /prospect list/.test(c)));
});

test("churn rule, a company nobody says churned: saved with no rule line (no noise)", () => {
  const root = brain();
  const r = remember(root, { content: "Added Bramble Foods to the prospect list for the Q1 outbound push.", companies: ["Bramble Foods"], new_names: ["Bramble Foods"], context: "company" });
  assert.equal(r.status, 0, say(r));
  assert.doesNotMatch(say(r), /team rule/);
});

test("a note no rule is about: saved with no rule line", () => {
  const root = brain(); churned(root);
  const r = remember(root, { content: "Acme Retail moved the kickoff to the Leipzig office.", companies: ["Acme Retail"], context: "company" });
  assert.equal(r.status, 0, say(r));
  assert.doesNotMatch(say(r), /team rule/);
  assert.equal(S.rulesForSave(root, { content: "Acme Retail moved the kickoff to the Leipzig office.", companies: ["Acme Retail"] }).length, 0);
});

test("an ask-first rule holds a note about a price, though the note never says pricing", () => {
  const root = brain();
  const r = remember(root, { content: "We offered Bramble Foods 0.30 EUR per return if they sign before December.", companies: ["Bramble Foods"], new_names: ["Bramble Foods"], context: "company" });
  assert.equal(r.status, 2, say(r));
  assert.match(r.stderr, /team rule "Ask before saving anything about pricing[^"]*" \(RULES\.md line \d+\) applies: the note says "0\.30 EUR"/);
  assert.match(r.stderr, /The rule says to ask first: do not save yet/);
  assert.doesNotMatch(r.stderr, /churned/);
});

test("a guidance rule that applies tops the result; the save goes through", () => {
  const root = brain({ rules: "- Notes about webinars go to Strategy with the date of the webinar." });
  const r = remember(root, { content: "The October webinar on returns drew 140 sign-ups.", context: "company" });
  assert.equal(r.status, 0, say(r));
  assert.match(r.stdout, /^team rule "Notes about webinars go to Strategy[^\n]*Saved; follow the rule/);
  assert.match(r.stdout, /Reply to the person in one line: what was saved and the team rule it falls under\./);
});

test("a brain with no rules: nothing matched, nothing said", () => {
  const root = brain({ rules: "" });
  assert.deepEqual(S.collectRules(root), []);
  assert.deepEqual(S.rulesForSave(root, { content: "We offered Bramble Foods 0.30 EUR per return.", companies: ["Bramble Foods"] }), []);
  const r = remember(root, { content: "We offered Bramble Foods 0.30 EUR per return if they sign before December.", companies: ["Bramble Foods"], new_names: ["Bramble Foods"], context: "company" });
  assert.equal(r.status, 0, say(r));
  assert.doesNotMatch(say(r), /team rule/);
});

test("rules are read again on every save: a rule noted in chat applies to the next save, with no chat start", () => {
  const root = brain({ rules: "" });
  const rule = remember(root, { content: "Never save anything about salaries without asking Anna first.", kind: "decision", context: "company", states_rule: true });
  assert.equal(rule.status, 0, say(rule));
  assert.doesNotMatch(say(rule), /not remembered yet/, "the rule note itself is not held by its own words");
  const r = remember(root, { content: "Karl's salary goes up in January.", context: "company" });
  assert.equal(r.status, 2, say(r));
  assert.match(r.stderr, /team rule "Never save anything about salaries without asking Anna first\." \(note m_[0-9a-f]{12}\)/);
});

test("a background run (GTM_BRAIN_RUN) is nobody's chat: no rule hold", () => {
  const root = brain();
  const f = join(root, "work", "b-run.json"); writeFileSync(f, JSON.stringify([{ content: "We offered Bramble Foods 0.30 EUR per return.", companies: ["Bramble Foods"], new_names: ["Bramble Foods"], context: "company" }]));
  const r = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, root, "--by", "anna-lind", "--batch", f, "--hold-rules", "true"], { cwd: root, env: { ...env, GTM_BRAIN_RUN: "test" }, encoding: "utf8" });
  assert.doesNotMatch(say(r), /team rule/);
});

test("never X before Y: a note that says Y is not held; a rule tagged check is left to the exact check", () => {
  const root = brain({ rules: "- Never promise workshop dates before the venue contract is signed.\n\n- Never call a company a customer before a signed contract.\n> applies to: organization · check" });
  const hits = S.rulesForSave(root, { content: "The Leipzig venue contract is signed." });
  assert.equal(hits.length, 1); assert.equal(hits[0].hold, false);
  assert.ok(hits.every(h => !/customer before a signed contract/.test(h.rule.text)), "the check rule is our-rules' job");
});

// Review of 0.38.0: the dashboard's note menu and a done interaction have nobody to ask, so the hold never stops them
const { createMemoryEdit } = await import(`${P}/server/memory-edit.mjs`);
const pageEdit = async (root, input) => {
  const edit = createMemoryEdit({ root, token: "t".repeat(64), json: (res, code, body) => { res.code = code; res.body = body; } });
  const raw = Buffer.from(JSON.stringify(input)), res = {};
  const req = { headers: { origin: "http://127.0.0.1:1", "content-type": "application/json", "x-gtm-brain-token": "t".repeat(64), "content-length": String(raw.length) }, resume() {}, async *[Symbol.asyncIterator]() { yield raw; } };
  await edit(req, res, "127.0.0.1:1"); return res;
};

test("the dashboard's note menu is the person's own edit: a note a rule is about is moved, corrected and changed, never left in force nowhere", async () => {
  const root = brain();
  writeFileSync(join(lib.workDir(root), "person.json"), JSON.stringify({ handle: "anna-lind" }) + "\n");
  lib.writeContext(root, "pipeline", { title: "Pipeline", rule: "Deals and renewals." });
  const add = content => lib.appendMemory(root, "company", { authors: ["anna-lind"], at: new Date(Date.now() - 864e5).toISOString(), content }).rec;
  const inForce = ctx => lib.effectiveMemories(lib.readMemories(root, ctx)).filter(m => !m.retracts).map(m => m.content);
  const note = add("Bramble Foods pays 0.30 EUR per return.");
  const moved = await pageEdit(root, { op: "move", id: note.id, topic: "pipeline" });
  assert.equal(moved.code, 200, JSON.stringify(moved.body));
  assert.ok(inForce("pipeline").includes(note.content) && !inForce("company").includes(note.content));
  const other = add("Acme Retail pays 0.25 EUR per return.");
  const fixed = await pageEdit(root, { op: "correct", id: other.id, text: "Acme Retail pays 0.28 EUR per return." });
  assert.equal(fixed.code, 200, JSON.stringify(fixed.body));
  assert.doesNotMatch(JSON.stringify(fixed.body), /rule_checked/);
  const kind = await pageEdit(root, { op: "set_kind", id: fixed.body.memory, kind: "decision" });
  assert.equal(kind.code, 200, JSON.stringify(kind.body));
});

test("an interaction: the rule is asked at its check, before the tool; the record of what was done is never held", async () => {
  const root = brain();
  lib.writeInteractions(root, [{ name: "send_quote", title: "Sending a quote", tool: "hubspot", operation: "Send the quote in HubSpot.", description: "A quote goes out.",
    input_schema: { type: "object", properties: { company: { type: "string" }, price: { type: "string" } }, required: ["company", "price"], additionalProperties: false },
    record: { context: "company", kind: "note", companies: ["company"], people: [], content: "Sent {company} the quote of {price}.", action: "hubspot:send quote:{company}", tags: [] } }]);
  const call = args => new Promise((res, rej) => {
    const p = spawn(process.execPath, [`${P}/server/server.mjs`], { env: { ...env, GTM_BRAIN_NO_SESSION_START: "1" } }); let out = "";
    p.stdout.on("data", d => out += d);
    p.on("close", () => { const r = out.split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).find(l => l && l.id === 2); r ? res({ text: r.result.content.map(c => c.text).join("\n"), isError: !!r.result.isError }) : rej(new Error(out)); });
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } }) + "\n");
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "interact", arguments: { brain: root, by: "anna-lind", name: "send_quote", ...args } } }) + "\n");
    p.stdin.end();
  });
  const params = { company: "Bramble Foods", price: "0.30 EUR per return" };
  const check = await call({ params });
  assert.equal(check.isError, false, check.text);
  assert.match(check.text, /Team rule "Ask before saving anything about pricing[^\n]*ask the person, naming the rule \(Yes, go ahead \/ No, leave it\)[^\n]*Only after their yes do it in hubspot/);
  const done = await call({ params, outcome: "done", refs: ["4242"] });
  assert.equal(done.isError, false, done.text);
  assert.ok(notes(root).some(c => /quote of 0\.30 EUR/.test(c)), done.text);
});

test("a rule holds a note only on what the rule is about: no count, no quoted person, no one shared word, no condition read as a ban", () => {
  const root = brain({ rules: "" });
  const hits = (rule, content) => S.rulesForSave(root, { content }, { rules: [{ text: rule, fromFile: true, source: "RULES.md line 1" }] });
  const pricing = "Ask before saving anything about pricing. Check with Anna first, every time.";
  assert.deepEqual(hits(pricing, "The Bramble Foods newsletter has 50k subscribers."), [], "a count is no price");
  assert.deepEqual(hits(pricing, "Anna Lind quoted the Bramble Foods CEO in the November newsletter."), [], "quoted a person, and Anna is whom to ask");
  assert.equal(hits(pricing, "Bramble Foods pays 50k EUR a year.")[0]?.hold, true);
  assert.equal(hits(pricing, "We sent Bramble Foods a new quote.")[0]?.hold, true);
  assert.ok(hits("Always confirm the meeting time in the customer's time zone.", "Met Acme Retail; next meeting is on Tuesday.").every(h => !h.hold), "confirm the time is guidance, not ask first");
  assert.deepEqual(hits("Ask the customer for a reference after every successful workshop.", "The Leipzig workshop is on 3 December."), []);
  assert.deepEqual(hits("If the customer is not in the EU, add a VAT note.", "Added Bramble Foods to the newsletter list."), [], "\"not\" in a condition forbids nothing");
  assert.ok(hits("Do not email partners on Fridays.", "Our partner Bramble Foods emailed us the signed contract.").every(h => !h.hold), "no Friday in the note");
  assert.equal(hits("Do not email partners on Fridays.", "Emailed our partner Bramble Foods the deck on Friday.")[0]?.hold, true);
  assert.deepEqual(hits("Notes about webinars go to Strategy with the date of the webinar.", "The launch date moved to March."), [], "date is not what the rule is about");
  assert.equal(hits("Notes about webinars go to Strategy with the date of the webinar.", "The October webinar on returns drew 140 sign-ups.").length, 1);
});

test("a rule fires on every form of its word and on a two-letter acronym", () => {
  const root = brain({ rules: "" });
  const hits = (rule, content) => S.rulesForSave(root, { content }, { rules: [{ text: rule, fromFile: true, source: "RULES.md line 1" }] });
  // one of the rule's two topic words: printed, not held; both, in either form: held
  for (const content of ["Karl has a new role: partnerships.", "Karl has two roles now: sales and partnerships."]) { const h = hits("Ask before saving any role change.", content); assert.equal(h.length, 1, content); assert.equal(h[0].hold, false, content); }
  for (const content of ["Karl's role changes to partnerships.", "Karl's roles changed: sales and partnerships."]) assert.equal(hits("Ask before saving any role change.", content)[0]?.hold, true, content);
  for (const [rule, content] of [["Ask before saving anything about rates.", "Our day rate goes up in January."], ["Ask before saving the dates.", "The launch date moved."], ["Ask before saving anything about sales.", "One sale closed today."]]) assert.equal(hits(rule, content)[0]?.hold, true, `${rule} / ${content}`);
  assert.equal(hits("Ask before saving anything about AI.", "The AI pilot starts in March.")[0]?.hold, true);
  assert.equal(hits("Ask before saving anything about QA.", "QA signed off the release.")[0]?.hold, true);
  assert.equal(hits("Ask before saving anything about rates.", "Our day rate goes up in January.")[0]?.hold, true);
  assert.equal(hits("Ask before saving anything about HR.", "HR: Karl is on leave until January.")[0]?.hold, true);
  assert.equal(hits("Ask before saving anything about PR.", "The PR agency sent the November plan.")[0]?.hold, true);
  assert.deepEqual(hits("Ask before saving anything about HR.", "Karl is on leave until January."), []);
});

// Review of 0.38.0, second round: the hold is the chat tool's alone, and a call is held whole or not at all
test("only the chat tool's save waits on a rule: any other caller of remember.mjs saves, with the rule printed first", () => {
  const root = brain();
  const r = remember(root, { content: "We offered Bramble Foods 0.30 EUR per return.", companies: ["Bramble Foods"], new_names: ["Bramble Foods"], context: "company" }, { chat: false });
  assert.equal(r.status, 0, say(r));
  assert.match(r.stdout, /^team rule "Ask before saving anything about pricing[^\n]*Saved; follow the rule/);
  assert.doesNotMatch(say(r), /person's yes|not remembered yet/);
  assert.ok(notes(root).some(c => /0\.30 EUR/.test(c)));
});

test("a held entry holds the whole call: a move is never half written; the yes on the held entry writes both", () => {
  const root = brain();
  lib.writeContext(root, "pipeline", { title: "Pipeline", rule: "Deals and renewals." });
  const old = lib.appendMemory(root, "company", { authors: ["anna-lind"], content: "Bramble Foods pays 0.30 EUR per return." }).rec;
  const move = [{ content: "Moved to Pipeline.", retracts: old.id, context: "company" }, { content: old.content, companies: ["Bramble Foods"], new_names: ["Bramble Foods"], context: "pipeline" }];
  const r = rememberAll(root, move);
  assert.equal(r.status, 2, say(r));
  assert.match(r.stderr, /^not kept \(0 of 2\): a team rule holds #2: #2 team rule "Ask before saving anything about pricing/);
  assert.match(r.stderr, /Nothing in this call was written[^\n]*rule_checked: true on #2/);
  const inForce = ctx => lib.effectiveMemories(lib.readMemories(root, ctx)).filter(m => !m.retracts).map(m => m.content);
  assert.ok(inForce("company").includes(old.content), "the withdrawal was not written either");
  const yes = rememberAll(root, [move[0], { ...move[1], rule_checked: true }]);
  assert.equal(yes.status, 0, say(yes));
  assert.match(yes.stdout, /#2 team rule "Ask before saving anything about pricing[^\n]*Saved on the person's yes/);
  assert.ok(inForce("pipeline").includes(old.content) && !inForce("company").includes(old.content));
});

test("rule_checked on a note no rule ever held is not a yes: held in the chat, never claimed as the person's answer", () => {
  const root = brain();
  const first = remember(root, { content: "Bramble Foods pays 0.31 EUR per return from January.", companies: ["Bramble Foods"], new_names: ["Bramble Foods"], context: "company", rule_checked: true });
  assert.equal(first.status, 2, say(first));
  assert.match(first.stderr, /The rule says to ask first: do not save yet/);
  const plain = remember(root, { content: "The October webinar on returns drew 140 sign-ups.", context: "company", rule_checked: true });
  assert.equal(plain.status, 0, say(plain));
  assert.doesNotMatch(say(plain), /person's yes/);
  const page = remember(root, { content: "Acme Retail pays 0.25 EUR per return.", companies: ["Acme Retail"], new_names: ["Acme Retail"], context: "company", rule_checked: true }, { chat: false });
  assert.equal(page.status, 0, say(page));
  assert.doesNotMatch(say(page), /person's yes/);
  assert.match(page.stdout, /Saved; follow the rule/);
});

test("a rule stated in entry 1 of a batch applies to the entries after it", () => {
  const root = brain({ rules: "" });
  const batch = [{ content: "Never save anything about salaries without asking Anna first.", kind: "decision", context: "company", states_rule: true }, { content: "Karl Berg's salary goes up to 5,000 in January.", context: "company", new_names: ["Karl Berg"], people: ["Karl Berg"] }];
  const r = rememberAll(root, batch);
  assert.equal(r.status, 2, say(r));
  assert.match(r.stderr, /#2 team rule "Never save anything about salaries without asking Anna first\." \(entry #1 of this save\)/);
  assert.ok(!notes(root).some(c => /salar/.test(c)), "nothing written");
  const page = rememberAll(root, batch, { chat: false });
  assert.equal(page.status, 0, say(page));
  assert.match(page.stdout, /#2 team rule "Never save anything about salaries[^\n]*Saved; follow the rule/);
});

test("Node 22's SQLite warning never reaches a script's stderr; other warnings still do", () => {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(`${P}/lib/memory-index-store.mjs`)}); process.emitWarning("still shown", "ExperimentalWarning");`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /SQLite is an experimental feature/);
  assert.match(r.stderr, /still shown/);
});

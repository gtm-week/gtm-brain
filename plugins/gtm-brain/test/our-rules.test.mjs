// RULES.md "Our rules", typed (ticket: enforce rules deterministically): a rule in the person's words with an optional
// tag line under it. The parser on the owner's form, hand edits and broken lines; the scope match; each supported
// check, at save (remember refuses, quoting the rule) and in a draft; the filing proposal for an untagged rule; the
// workflow offer for an instruction that starts work; and the replies that carry only the rules that apply, once.
// Run: node --test plugins/gtm-brain/test/our-rules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-our-rules-codex-")), GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1",
  GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1" };
delete env.GTM_BRAIN_RUN;
process.env.CODEX_HOME = env.CODEX_HOME; process.env.GTM_BRAIN_NO_COMMIT = "1";
const lib = await import(`${P}/lib/brain.mjs`);
const R = await import(`${P}/lib/our-rules.mjs`);
const { rulesReport } = await import(`${P}/lib/rules-check.mjs`);
const { parseWorkflow } = await import(`${P}/lib/workflows.mjs`);

const INTRO = `Rules for what Codex saves and asks, one line each, in your words ("always ask before tagging a
client", "notes about pricing go to Our offer"). When you correct how something was saved, Codex
offers to add one here.`;
const OWNER = `Never call a company a customer before a signed contract.
> applies to: organization · when: saving customer status · check

Mention the partner tier when writing to a partner.
> applies to: link partner_of · when: drafting · guidance
`;
const VOCAB = { kinds: ["person", "organization", "product", "event", "tool"], subtypes: ["company", "team", "investor", "partner", "community"], links: ["works_at", "partner_of", "investor_in", "uses", "customer_of"],
  fields: { person: ["role", "location", "linkedin", "how_we_met"], organization: ["website", "industry", "size", "hq"] }, statuses: ["customer", "prospect", "former_customer", "not_customer"], verified: true };

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-our-rules-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Demo Co", "--one-liner", "events", "--owner", "Artur Wala <artur@demo.co>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const withRules = (root, text) => { appendFileSync(join(root, "RULES.md"), `\n${text}`); return root; };
const remember = (root, entry) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, root, "--by", "artur-wala", "--batch", (() => { const f = join(root, "work", `b-${Math.random()}.json`); writeFileSync(f, JSON.stringify([entry])); return f; })()], { cwd: root, env, encoding: "utf8" });
const NOW = new Date().toISOString().replace(/\.\d+Z$/, "Z");

test("parser: the owner's form, bullets, a wrapped rule, the shipped intro skipped, line numbers in the section", () => {
  const p = R.parseOurRules(`${INTRO}\n\n${OWNER}\n- Never use "cheap" in a note or a draft.\n2. Always include the role when saving\n   a person.\n`, VOCAB, { first: 40 });
  assert.deepEqual(p.problems, []);
  assert.deepEqual(p.rules.map(r => [r.line, r.text]), [[44, "Never call a company a customer before a signed contract."], [47, "Mention the partner tier when writing to a partner."], [50, 'Never use "cheap" in a note or a draft.'], [51, "Always include the role when saving a person."]]);
  assert.deepEqual(p.rules[0].tag, { applies: [{ kind: "organization" }], when: "saving", on: "customer", mode: "check" });
  assert.deepEqual(p.rules[1].tag, { applies: [{ link: "partner_of" }], when: "drafting", on: null, mode: "guidance" });
  assert.equal(p.rules[0].tagLine, 45); assert.equal(p.rules[2].tag, null);
});

test("parser: hand edits are tolerated, problems are per line with a fix, the rule stays (wider), and nothing throws", () => {
  const text = `> applies to: person\n\nAsk before tagging a client.\n>Applies To: Person, Company ; When: Saving ; CHECK\n> applies to: general\n\nKeep pricing notes short.\n> applies to: persn · when: savng · chek · colour: blue\n\nPartners get the tier.\n> applies to: link partner_off\n\nInvestors hear about the round first.\n> applies to: investor · when: drafting role · guidance\n`;
  const p = R.parseOurRules(text, VOCAB, { first: 10 });
  assert.deepEqual(p.rules.map(r => r.line), [12, 16, 19, 22]);
  assert.deepEqual(p.rules[0].tag, { applies: [{ kind: "person" }, { kind: "organization" }], when: "saving", on: null, mode: "check" });
  const by = n => p.problems.filter(x => x.line === n).map(x => x.problem);
  assert.match(by(10)[0], /a tag line with no rule directly above it/);
  assert.match(by(14)[0], /a second tag line for the rule on line 12/);
  assert.deepEqual(by(17).map(x => x.slice(0, 22)), ['applies to "persn": SC', 'when "savng" is not sa', '"chek" is not part of ', '"colour: blue" is not ']);
  assert.ok(p.problems.every(x => x.proposal), "every problem comes with a fix");
  assert.equal(p.rules[1].tag.applies.length, 0, "an unreadable scope leaves the rule general");
  assert.match(by(20)[0], /SCHEMA.md has no relationship type partner_off/);
  assert.deepEqual(p.rules[3].tag, { applies: [{ kind: "organization", subtype: "investor" }], when: "drafting", on: "role", mode: "guidance" });
  for (const junk of ["", ">", "> applies to:", "|||", "\u0000\n> when:\n- \n1.", "> · · ·", "x\n> applies to: link"]) assert.doesNotThrow(() => R.parseOurRules(junk, VOCAB));
});

test("readOurRules: the brain's RULES.md, SCHEMA.md's kinds; an old one-file RULES.md is read too", () => {
  const root = withRules(brain(), OWNER);
  const p = R.readOurRules(root), text = readFileSync(join(root, "RULES.md"), "utf8").split("\n");
  assert.equal(p.rules.length, 2); assert.deepEqual(p.problems, []);
  assert.equal(text[p.rules[0].line - 1], "Never call a company a customer before a signed contract.");
  writeFileSync(join(root, "RULES.md"), "# Our rules\n\nAlways ask before tagging a client.\n");
  assert.deepEqual(R.readOurRules(root).rules.map(r => [r.line, r.text]), [[3, "Always ask before tagging a client."]]);
});

test("scope: only the rules for the kind in hand, the link rule for a partner, general ones only when few", () => {
  const p = R.parseOurRules(`${OWNER}\nAlways be brief.\n> applies to: general · guidance\n`, VOCAB);
  const org = { kind: "organization", links: [] }, partner = { kind: "organization", links: ["partner_of"] }, person = { kind: "person", links: [] };
  const texts = x => [...x.scoped, ...x.general].map(r => r.text.slice(0, 20));
  assert.deepEqual(texts(R.rulesFor(p, [org], "saving")), ["Never call a company", "Always be brief."]);
  assert.deepEqual(texts(R.rulesFor(p, [org], "drafting")), ["Always be brief."]);
  assert.deepEqual(texts(R.rulesFor(p, [partner], "drafting")), ["Mention the partner ", "Always be brief."]);
  assert.deepEqual(texts(R.rulesFor(p, [person], "saving")), ["Always be brief."]);
  const many = R.parseOurRules(`${OWNER}\n${["a", "b", "c", "d"].map(x => `Rule ${x}.\n> applies to: general · guidance`).join("\n")}\n`, VOCAB);
  const m = R.rulesFor(many, [person], "saving");
  assert.deepEqual([m.scoped.length, m.general.length, m.moreGeneral], [0, 0, 4]);
  // once per chat per rule and action
  const once = R.createShownOnce({ quietMs: 60000 }), a = once.filter("chat", "saving", R.rulesFor(p, [org], "saving")), b = once.filter("chat", "saving", R.rulesFor(p, [org], "saving"));
  assert.equal(a.scoped.length + a.general.length, 2); assert.equal(b.scoped.length + b.general.length, 0);
  assert.equal(once.filter("chat", "drafting", R.rulesFor(p, [partner], "drafting")).scoped.length, 1);
  const text = R.scopedText(a, "organization when saving");
  assert.match(text, /^Our rules for organization when saving \(RULES.md; follow them, a \[check\] rule refuses a save that breaks it\):\n- Never call a company a customer before a signed contract. \[check\] \(RULES.md line 1\)/);
  assert.ok(Buffer.byteLength(text) < 260, `${Buffer.byteLength(text)} bytes`);
});

test("startRules: the chat start's part is the general and unfiled rules and a count of the filed ones", () => {
  const root = withRules(brain(), `${OWNER}\nBe polite.\n\nWhenever a company becomes a customer, send the welcome pack.\n`);
  assert.equal(R.startRules(root), "Be polite.\n2 more rules for a kind or link (organization, link partner_of): each comes with the reply that needs it (a save, a brief, query rules).\n1 line that starts work waits to become workflows (query rules); never act on them as rules.");
});

test("checks: the supported patterns are read; anything else tagged check stays guidance", () => {
  const tag = { applies: [{ kind: "person" }] };
  assert.deepEqual(R.checkOf('Never use "cheap" in a note.', tag, VOCAB), { kind: "word", word: "cheap" });
  assert.deepEqual(R.checkOf("Do not use the word synergy.", tag, VOCAB), { kind: "word", word: "synergy" });
  assert.deepEqual(R.checkOf("Never call a company a customer before a signed contract.", tag, VOCAB), { kind: "status", status: "customer", fact: ["sign", "contract"], factText: "a signed contract" });
  assert.deepEqual(R.checkOf("Only mark an organization as a partner once the agreement is signed.", tag, VOCAB), { kind: "status", link: "partner_of", fact: ["agreement", "sign"], factText: "the agreement is signed" });
  assert.deepEqual(R.checkOf("Never save a company note without a source.", tag, VOCAB), { kind: "source" });
  assert.deepEqual(R.checkOf("Always include the role when saving a person.", tag, VOCAB), { kind: "field", field: "role", words: ["role"] });
  assert.equal(R.checkOf("Be kind to partners.", tag, VOCAB), null);
  const root = withRules(brain(), "Be kind to partners.\n> applies to: organization · check\n");
  assert.match(rulesReport(root), /tagged check, but no check can be read from it; it is shown as guidance/);
  assert.match(R.scopedReport(root, { search: "organization" }).text, /Be kind to partners\. \[guidance: no check can be read from it\]/);
});

test("checks at save: remember refuses with the rule quoted, and saves once the condition holds", () => {
  const root = withRules(brain(), `${OWNER}
Never use "cheap" in a note or a draft.
> applies to: general · check

Never save a company note without a source.
> applies to: organization · when: saving · check

Always include the role when saving a person.
> applies to: person · when: saving · check
`);
  lib.addName(root, "Northwind", { kind: "organization" });
  const customer = { context: "company", content: "Northwind is our customer now.", companies: ["Northwind"], sources: ["hubspot:0-2/77"], customer: { entity: "Northwind", status: "customer", basis: "source", observed_at: NOW, reference: { kind: "hubspot", ref: "0-2/77" } } };
  let r = remember(root, customer);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /refused by Our rules "Never call a company a customer before a signed contract\." \(RULES\.md line \d+\): Northwind would be saved as a customer, and no note about it says "a signed contract"/);
  // said in a plain note too
  r = remember(root, { context: "company", content: "Northwind became a customer today.", companies: ["Northwind"], sources: ["gmail:abc"] });
  assert.match(r.stderr, /refused by Our rules "Never call a company a customer/);
  // the contract first, then the status
  assert.equal(remember(root, { context: "company", content: "Northwind signed the contract on 2026-11-10.", companies: ["Northwind"], sources: ["gmail:abc"] }).status, 0);
  assert.equal(remember(root, customer).status, 0);
  r = remember(root, { context: "company", content: "Northwind thinks our plan is cheap.", companies: ["Northwind"], sources: ["gmail:x"] });
  assert.match(r.stderr, /refused by Our rules "Never use "cheap" in a note or a draft\." .*the note says "cheap"/);
  r = remember(root, { context: "company", content: "Northwind moved its office.", companies: ["Northwind"] });
  assert.match(r.stderr, /refused by Our rules "Never save a company note without a source\." .*the note has no source/);
  r = remember(root, { context: "company", content: "Met Lena Fischer at the fair.", people: ["Lena Fischer"], sources: ["gmail:y"] });
  assert.match(r.stderr, /refused by Our rules "Always include the role when saving a person\." .*nothing about Lena Fischer gives the role/);
  assert.equal(remember(root, { context: "company", content: "Met Lena Fischer at the fair; her role is head of events.", people: ["Lena Fischer"], sources: ["gmail:y"] }).status, 0);
  // a draft: the word check, through query rules
  assert.match(R.scopedReport(root, { search: "Northwind", when: "drafting", text: "A cheap offer for you" }).text, /The draft breaks "Never use "cheap"/);
  assert.match(R.scopedReport(root, { search: "Northwind", when: "drafting", text: "A fair offer" }).text, /The draft breaks no check rule\./);
});

test("filing: an untagged rule is listed as not filed yet, with the tag line Codex proposes; nothing is rewritten", () => {
  assert.equal(R.proposeTag("Never call a company a customer before a signed contract.", VOCAB).line, "> applies to: organization · when: saving customer status · check");
  assert.equal(R.proposeTag("Mention the partner tier when writing to a partner.", VOCAB).line, "> applies to: link partner_of · when: drafting · guidance");
  assert.equal(R.proposeTag('Never use "cheap" in a note or a draft.', VOCAB).line, "> applies to: general · check");
  assert.equal(R.proposeTag("Always include the role when saving a person.", VOCAB).line, "> applies to: person · when: saving role · check");
  assert.equal(R.proposeTag("Be polite.", VOCAB).line, "> applies to: general · guidance");
  const root = withRules(brain(), "Never call a company a customer before a signed contract.\n");
  const before = readFileSync(join(root, "RULES.md"), "utf8"), report = rulesReport(root);
  assert.match(report, /1 Our rules lines\)/);
  assert.match(report, /\[RULES\.md Our rules\] RULES\.md line \d+: "Never call a company a customer before a signed contract\." is not filed yet, so it is shown in every chat and nothing checks it\.\n   a\) File it: write > applies to: organization · when: saving customer status · check on the line under it/);
  assert.equal(readFileSync(join(root, "RULES.md"), "utf8"), before);
  // untagged: nothing is checked
  lib.addName(root, "Northwind", { kind: "organization" });
  assert.equal(remember(root, { context: "company", content: "Northwind is our customer now.", companies: ["Northwind"], sources: ["gmail:a"] }).status, 0);
});

test("workflow offer: an instruction that starts work is offered as a one-step workflow that parses", () => {
  const w = R.workOffer("Whenever a company becomes a customer, send the welcome pack.");
  assert.equal(w.title, "Send the welcome pack");
  assert.match(w.text, /starts work, and a rule never starts work: offer it as a one-step workflow instead/);
  const parsed = parseWorkflow({ slug: "send-the-welcome-pack", title: w.title, extra: { type: "workflow" }, body: w.body });
  assert.equal(parsed.ok, true, JSON.stringify(parsed.problems));
  assert.deepEqual(parsed.steps.map(s => [s.title, s.tool]), [["Send the welcome pack", "email"]]);
  assert.match(parsed.settle[0].label, /Company/);
  assert.ok(R.workOffer("Always send a thank-you note after a demo."));
  for (const rule of ["Never call a company a customer before a signed contract.", "Mention the partner tier when writing to a partner.", "When drafting to a partner, add the tier.", "Always ask before tagging a client.", "Notes about pricing go to Our offer."]) assert.equal(R.workOffer(rule), null, rule);
  const both = R.parseOurRules("Whenever a company becomes a customer, send the welcome pack.\nBe polite.\n", VOCAB), shown = R.rulesFor(both, [{ kind: "organization", links: [] }], "saving");
  assert.deepEqual(shown.general.map(r => r.text), ["Be polite."], "never shown as a rule to follow");
  const root = withRules(brain(), "Whenever a company becomes a customer, send the welcome pack.\n");
  const report = rulesReport(root);
  assert.match(report, /a\) Make it a workflow: workflow create \(title "Send the welcome pack", applies_to \["welcome pack"\], the body below\), then remove line \d+ and save/);
  assert.match(report, /\n      ## Steps\n\n      1\. \*\*Send the welcome pack\*\* \(tool: email\)\./);
});

test("server: query rules gains the scoped list; a brief and a save carry the rules for the kind in hand, once per chat", async () => {
  const root = withRules(brain(), `${OWNER}\nAsk before saving anything about pricing.\n> applies to: product · when: saving · guidance\n`);
  lib.addName(root, "Northwind", { kind: "organization" }); lib.addName(root, "Lena Fischer", { kind: "person" });
  lib.appendMemory(root, "company", { authors: ["artur-wala"], content: "Northwind runs the venue.", companies: ["Northwind"] });
  const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env });
  server.stderr.resume();
  const pending = new Map(); let seq = 0;
  createInterface({ input: server.stdout }).on("line", l => { let m; try { m = JSON.parse(l); } catch { return; } pending.get(m.id)?.(m); pending.delete(m.id); });
  const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: { brain: root, ...args } }); return { text: (m.result?.content || []).map(c => c.text).join("\n"), isError: !!m.result?.isError }; };
  try {
    await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });
    let r = await call("query", { object: "rules", search: "organization" });
    assert.match(r.text, /^Our rules for organization \(RULES.md[^\n]*\n- Never call a company a customer before a signed contract\. \[check\]/);
    assert.doesNotMatch(r.text, /partner tier|pricing/);
    r = await call("query", { object: "rules", search: "link partner_of", filters: { when: "drafting" } });
    assert.match(r.text, /Mention the partner tier when writing to a partner\./); assert.doesNotMatch(r.text, /signed contract/);
    r = await call("query", { object: "rules" });
    assert.match(r.text, /^Rules check: /, "without a scope: the check, as before");
    // a save about a person: no organization rule; about a company: the one rule, once
    r = await call("remember", { by: "artur-wala", context: "company", content: "Lena Fischer is head of events.", people: ["Lena Fischer"], sources: ["user:artur-wala"] });
    assert.equal(r.isError, false, r.text); assert.doesNotMatch(r.text, /Our rules for/);
    r = await call("remember", { by: "artur-wala", context: "company", content: "Northwind moved to Hall B.", companies: ["Northwind"], sources: ["user:artur-wala"] });
    assert.match(r.text, /Our rules for organization \(company\) when saving[^\n]*\n- Never call a company a customer before a signed contract\. \[check\]/);
    r = await call("remember", { by: "artur-wala", context: "company", content: "Northwind added a second stand.", companies: ["Northwind"], sources: ["user:artur-wala"] });
    assert.doesNotMatch(r.text, /Our rules for/, "once per chat");
    // a brief: the reading and drafting rules (none for a plain organization), then for a partner the link rule
    r = await call("query", { object: "brief", search: "Northwind" });
    assert.doesNotMatch(r.text, /Our rules for/);
    const id = lib.readNames(root).find(e => e.name === "Northwind").id;
    lib.appendMemory(root, "company", { authors: ["artur-wala"], content: "Northwind is our partner.", companies: ["Northwind"], entities: [id], source: [{ kind: "user", ref: "artur-wala" }], relation: { from: id, type: "partner_of", to: "us", status: "current", basis: "user", observed_at: NOW } });
    r = await call("query", { object: "brief", search: "Northwind" });
    assert.match(r.text, /Our rules for organization \(company\) when reading or drafting[^\n]*\n- Mention the partner tier when writing to a partner\. \(RULES\.md line \d+\)$/);
    r = await call("query", { object: "brief", search: "Northwind" });
    assert.doesNotMatch(r.text, /Our rules for/, "once per chat");
    r = await call("query", { object: "rules", search: "Northwind", filters: { when: "drafting" } });
    assert.match(r.text, /^Our rules for Northwind \(organization, company; partner_of\) when drafting/, "asked for: always shown");
  } finally { server.stdin.end(); server.kill(); }
});

/* ---------- review: adversarial cases ---------- */
const ORG = { kind: "organization", links: [] };
const CONTRACT = `Never call a company a customer before a signed contract.\n> applies to: organization · when: saving customer status · check\n`;
const reg = (...es) => es.map(([name, kind, fm]) => ({ id: `e_${name.toLowerCase().replace(/\W/g, "")}`, name, kind, aliases: [], emails: [], _fm: fm || {} }));

test("review: a fact that is denied does not satisfy a status check, in this note or an earlier one", () => {
  const root = withRules(brain(), CONTRACT);
  lib.addName(root, "Northwind", { kind: "organization" });
  const block = { entity: "Northwind", status: "customer", basis: "user", observed_at: NOW };
  for (const content of ["Northwind is now a customer, though there is no signed contract yet.", "Northwind is a customer now. They have not signed the contract.", "Northwind is our customer without a signed contract.", "Northwind is a customer; the contract is still unsigned.", "Northwind is our customer and will sign the contract next week."])
    assert.equal(R.saveRefusals(root, { context: "company", content, companies: ["Northwind"], customer: block }).length, 1, content);
  assert.equal(remember(root, { context: "company", content: "Northwind has not signed the contract yet.", companies: ["Northwind"], sources: ["gmail:a"] }).status, 0);
  assert.equal(R.saveRefusals(root, { context: "company", content: "Northwind is our customer.", companies: ["Northwind"], customer: block }).length, 1, "an earlier note that denies the fact");
  assert.equal(R.saveRefusals(root, { context: "company", content: "Northwind signed the contract and is our customer.", companies: ["Northwind"], customer: block }).length, 0);
});

test("review: only the company the sentence calls a customer is checked, not every company named in the note", () => {
  const root = withRules(brain(), CONTRACT);
  lib.addName(root, "Northwind", { kind: "organization" }); lib.addName(root, "Globex", { kind: "organization" });
  assert.equal(remember(root, { context: "company", content: "Northwind signed the contract.", companies: ["Northwind"], sources: ["gmail:a"] }).status, 0);
  const r = R.saveRefusals(root, { context: "company", content: "Northwind is now a customer. Globex introduced them.", companies: ["Northwind", "Globex"] });
  assert.deepEqual(r, [], "Globex is only mentioned");
  assert.match(R.saveRefusals(root, { context: "company", content: "Northwind told us Globex is now a customer.", companies: ["Northwind", "Globex"] })[0] || "", /Globex would be saved as a customer/);
});

test("review: a field check accepts a field the compiled brief already holds", () => {
  const p = R.parseOurRules("Always include the role when saving a person.\n> applies to: person · when: saving · check\n", VOCAB);
  const root = brain();
  const filled = reg(["Lena Fischer", "person", { compiled_fields: JSON.stringify([{ field: "role", text: "Head of events", memories: ["m_000000000001"] }]) }]), empty = reg(["Lena Fischer", "person"]);
  const note = { context: "company", content: "Lena Fischer moved to Berlin.", people: ["Lena Fischer"] };
  assert.equal(R.saveRefusals(root, note, { parsed: p, registry: empty }).length, 1);
  assert.deepEqual(R.saveRefusals(root, note, { parsed: p, registry: filled }), [], "the brief has the role");
});

test("review: a line that starts work and carries a tag line is the person's rule: shown, and not offered again", () => {
  const p = R.parseOurRules("Whenever a company becomes a customer, send the welcome pack.\n> applies to: organization · guidance\n\nWhenever a person replies, send a thank-you note.\n", VOCAB);
  assert.equal(p.rules[0].work, null); assert.ok(p.rules[1].work);
  assert.deepEqual(R.rulesFor(p, [ORG], "saving").scoped.map(r => r.line), [1]);
  const root = withRules(brain(), "Whenever a company becomes a customer, send the welcome pack.\n> applies to: organization · guidance\n");
  assert.doesNotMatch(rulesReport(root), /starts work/);
  const offer = rulesReport(withRules(brain(), "Whenever a company becomes a customer, send the welcome pack.\n"));
  assert.match(offer, /b\) Keep it as a rule: write > applies to: organization · guidance on the line under it/, "keeping it is recorded as a tag line, so it is asked once");
});

test("review: the documented form, one lowercase line per rule, is not merged; headings and quotes under a rule are not rules or tags", () => {
  const p = R.parseOurRules("always ask before tagging a client\nnotes about pricing go to Our offer\n\n### Pricing\n\nKeep discounts out of notes.\n> for example, a note about Acme's 20% deal\n> when in doubt, ask.\n\n---\n", VOCAB);
  assert.deepEqual(p.rules.map(r => r.text), ["always ask before tagging a client", "notes about pricing go to Our offer", "Keep discounts out of notes."]);
  assert.deepEqual(p.problems, []);
  assert.equal(p.rules[2].tag, null, "a quote is not a tag line");
  assert.match(p.rules[2].note, /for example.*when in doubt/);
  // a long line wrapped by an editor still reads as one rule
  const w = R.parseOurRules("Never promise a delivery date to a customer in writing before the operations team has confirmed it\nin the planning sheet.\n", VOCAB);
  assert.equal(w.rules.length, 1);
});

test("review: with many general rules the reply says how to list them, and that call lists them", () => {
  const root = withRules(brain(), `${CONTRACT}\n${["a", "b", "c", "d"].map(x => `Rule ${x}.\n> applies to: general · guidance`).join("\n\n")}\n`);
  const text = R.replyRules(root, { scopes: [ORG], verb: "saving" });
  assert.match(text, /4 general rules: query rules with search general lists them/);
  const all = R.scopedReport(root, { search: "general" }).text;
  for (const x of ["a", "b", "c", "d"]) assert.ok(all.includes(`Rule ${x}.`), all);
});

test("review: the rules check lists at most ten unfiled rules, and says what a proposed check would refuse", () => {
  const root = withRules(brain(), `${Array.from({ length: 30 }, (_, i) => `Be careful with topic number ${i + 1}.`).join("\n\n")}\n\nNever use "cheap" in a note or a draft.\n`);
  const report = rulesReport(root);
  assert.equal((report.match(/is not filed yet/g) || []).length, 10);
  assert.match(report, /21 more Our rules lines are not filed yet/);
  const one = rulesReport(withRules(brain(), `Never use "cheap" in a note or a draft.\n\nNever call a company a customer before a signed contract.\n`));
  assert.match(one, /check on the line under it; as a check it refuses a note that says "cheap"\n/);
  assert.match(one, /as a check it refuses saving one as a customer until a note about it says "a signed contract"/);
});

test("review: a brain with no Our rules pays nothing: no scope is worked out for a brief or a save", () => {
  const root = brain(); let called = 0;
  assert.equal(R.replyRules(root, { scopes: () => { called++; return [ORG]; }, verb: "saving" }), "");
  assert.equal(called, 0);
  withRules(root, CONTRACT);
  assert.match(R.replyRules(root, { scopes: () => { called++; return [ORG]; }, verb: "saving" }), /signed contract/);
  assert.equal(called, 1);
});

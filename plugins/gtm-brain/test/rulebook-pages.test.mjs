// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// The slim rulebook (0.35.0): the brain's AGENTS.md keeps the core and one line per rule; each topic's detail is a
// rule page under policies/ that query (object rules, search) returns and a tool attaches to its first reply. The
// chat's first GTM Brain call, whatever it is, brings the opening lines: no status call first, no skill file read
// to answer or save. Each check here fails on the 0.34 rulebook.
// Run: node --test plugins/gtm-brain/test/rulebook-pages.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, realpathSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { rulePages, findRulePage, ownAdditions, withOwnAdditions } from "../lib/rule-pages.mjs";
import { legacyTemplates } from "../lib/upgrade-files.mjs";
import { removeBrain } from "./helpers/dash-cleanup.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const template = readFileSync(join(P, "templates/AGENTS.md"), "utf8");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-pages-codex-")), HOME: mkdtempSync(join(tmpdir(), "gtm-pages-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1" };
for (const k of ["GTM_BRAIN_NO_COMMIT", "GTM_BRAIN_NO_SESSION_START", "GTM_BRAIN_RUN", "GTM_BRAIN_HOST", "GTM_BRAIN_NO_RULE_PAGES", "GTM_BRAIN_TOOLSET"]) delete env[k];
const lib = await import(`${P}/lib/brain.mjs`);

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-pages-brain-")));
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
  return { rpc, call, init: () => rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } }) };
}

test("the rulebook is slim and points at its pages; every page is shipped and named", () => {
  const filled = Buffer.byteLength(template.replaceAll("{{COMPANY}}", "A Rather Long Company Name Holding International Sp. z o.o."));
  assert.ok(filled <= 16384, `${filled} bytes`);
  const slugs = rulePages().map(p => p.slug);
  assert.deepEqual(slugs.slice(0, 2), ["questions", "computer-use"], "the shared policies are pages, served from policies/");
  assert.deepEqual(slugs.slice(2).sort(), readdirSync(join(P, "policies/rules")).map(f => f.replace(/\.md$/, "")).sort());
  const named = template.match(/Pages: ([^.]+)\./)[1].replace(/\s+/g, " ").split(", ");
  assert.deepEqual([...named].sort(), [...slugs].sort(), "AGENTS.md names every rule page");
  for (const p of rulePages()) {
    assert.ok(p.body.length > 200, `${p.slug} has its detail`);
    assert.doesNotMatch(p.body, /[–—]/, `${p.slug}: plain hyphens`);
  }
});

test("each moved topic is found by its name and by the words people use", () => {
  for (const p of rulePages()) assert.equal(findRulePage(p.slug).slug, p.slug);
  const cases = { meeting: "meetings", transcript: "meetings", logo: "files", "where does this file go": "files", "archive a context": "contexts",
    "summary updating": "contexts", approve: "approve", "merge two names": "entities", alias: "entities", "tone of voice": "documents", "ask the person": "questions",
    browser: "computer-use", dashboard: "dashboard", "linked project": "projects", customers: "customers", "brain-question": "saving", "next step": "answers" };
  for (const [words, slug] of Object.entries(cases)) assert.equal(findRulePage(words)?.slug, slug, `"${words}"`);
  assert.equal(findRulePage("zebra"), null);
  // the detail that left AGENTS.md is in a page, word for word
  const page = slug => rulePages().find(p => p.slug === slug).body;
  assert.match(page("entities"), /Is this the Pierre Aubert we know\?/);
  assert.match(page("files"), /kept only by `keep_approved_file`, in the\s+same turn/);
  assert.match(page("meetings"), /Invitations are plans, not\s+attendance/);
  assert.match(page("contexts"), /No run rewrites a summary/);   // 0.35.0: summaries are written on demand (summaries lane), so the page no longer says they update by themselves
  assert.match(page("questions"), /Keep one question pending/);
  assert.doesNotMatch(template, /Pierre Aubert|Invitations are plans|Keep one question pending\. A question without/, "the detail is no longer in AGENTS.md");
});

test("no instruction demands a status call first or a skill file read to answer or save", async () => {
  const pages = rulePages().map(p => p.body).join("\n");
  for (const [name, text] of [["AGENTS.md", template], ["core", readFileSync(join(P, "policies/core.md"), "utf8")], ["rule pages", pages]]) {
    assert.doesNotMatch(text, /`query` \(status\)\s+first|status first|call it first/, `${name}: status first`);
    assert.doesNotMatch(text, /references\/(context-routing|recall|remember|saving-rules|connect-dots)\.md/, `${name}: a skill read for recall or saving`);
  }
  const s = client(); const { result } = await s.init();
  assert.doesNotMatch(result.instructions, /start every chat with query \(object status\)|gtm-brain-use-brain\/SKILL\.md/);
  assert.match(result.instructions, /no separate status call/);
  const { result: listed } = await s.rpc("tools/list");
  const query = listed.tools.find(t => t.name === "query");
  assert.doesNotMatch(query.description, /call it first/);
  assert.match(query.description, /no context load, topic load or skill file first/);
  const useBrain = readFileSync(join(P, "skills/gtm-brain-use-brain/SKILL.md"), "utf8").split("\n---")[0];
  assert.match(useBrain, /needs no skill file/);
  assert.doesNotMatch(useBrain, /Use during company work/);
});

test("query rules with a search word returns that page alone; without one it still checks the brain", async () => {
  const root = brain(); const s = client(); await s.init();
  const page = await s.call("query", { brain: root, object: "rules", search: "meeting" });
  assert.ok(!page.isError, page.text);
  assert.match(page.parts[0], /^--- Rule page: Meeting evidence \(query rules, search "meetings"\) ---\n/);
  assert.doesNotMatch(page.parts[0], /Rule page: (?!Meeting)/, "one page, not the whole rulebook");
  const none = await s.call("query", { brain: root, object: "rules", search: "zebra" });
  assert.match(none.parts[0], /No rule page matches "zebra"\. Rule pages: questions, computer-use/);
  const check = await s.call("query", { brain: root, object: "rules" });
  assert.doesNotMatch(check.parts[0], /Rule page:/, "with no search word, query rules is the check it always was");
});

test("the first call of a chat is the real one: a search brings the opening lines with which brain, the person and the questions waiting", async () => {
  const root = brain();
  lib.appendMemory(root, "company", { authors: ["ann-lee"], kind: "question", tags: ["brain-question"], content: "Is Pagecraft's pricing per seat or per site?" });
  const answered = lib.appendMemory(root, "company", { authors: ["ann-lee"], kind: "question", tags: ["brain-question"], content: "Which CRM do we use?" }).rec;
  lib.appendMemory(root, "company", { authors: ["ann-lee"], kind: "decision", retracts: answered.id, content: "We use Attio." });
  const s = client(); await s.init();
  const first = await s.call("query", { brain: root, object: "memories", search: "pricing" });
  assert.ok(!first.isError, first.text);
  const opening = first.parts.find(p => p.startsWith("GTM Brain chat start"));
  assert.ok(opening, "the opening lines come with the first call, whatever it is");
  assert.match(opening, new RegExp(`\\nbrain: \\S+ \\(Pagecraft\\) at ${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(opening, /questions waiting for an answer: 1 \(Our company, m_[0-9a-f]+: "Is Pagecraft's pricing per seat or per site\?"\)/);
  assert.doesNotMatch(opening, /Which CRM do we use/, "an answered question is not waiting");
  assert.match(opening, /questions rule page once/, "the question policy is a pointer, not 2.6 KB");
  assert.ok(!opening.includes(readFileSync(join(P, "policies/questions.md"), "utf8").trim()));
});

test("a status call as the first call does not repeat the contexts the opening lines list", async () => {
  const root = brain(); const s = client(); await s.init();
  const first = await s.call("query", { brain: root, object: "status" });
  assert.equal(first.parts.length, 2);
  assert.match(first.parts[0], /^status: the opening lines below carry the rest/);
  assert.doesNotMatch(first.parts[0], /• Strategy \(strategy\)/, "the context list is said once, in the opening lines");
  assert.match(first.parts[1], /Strategy \(strategy\)/);
  const second = await s.call("query", { brain: root, object: "status" });
  assert.match(second.parts[0], /Strategy \(strategy\)/, "later in the chat, status is whole");
});

test("a tool attaches its own rule page to its first reply of a chat, once", async () => {
  const root = brain(); const s = client(); await s.init();
  await s.call("query", { brain: root, object: "memories", search: "anything" });   // the chat start
  const meetings = await s.call("query", { brain: root, object: "meetings" });
  assert.ok(!meetings.isError, meetings.text);
  assert.ok(meetings.parts.some(p => p.startsWith("--- Rule page: Meeting evidence")), "the meetings page rides along");
  const again = await s.call("query", { brain: root, object: "meetings" });
  assert.ok(!again.parts.some(p => p.startsWith("--- Rule page:")), "once per chat");
  const customers = await s.call("query", { brain: root, object: "customers" });
  assert.ok(customers.parts.some(p => p.startsWith("--- Rule page: Customer discovery")));
  const load = await s.call("load_context", { brain: root, contexts: ["strategy"], last: 0 });
  assert.ok(!load.isError, load.text);
  assert.ok(load.parts.some(p => p.startsWith("--- Rule page: Contexts and summaries")));
  const plain = await s.call("query", { brain: root, object: "contexts" });
  assert.ok(!plain.parts.some(p => p.startsWith("--- Rule page:")), "a read with no page of its own carries none");
});

test("upgrade: a shipped rulebook becomes the slim one; a person's own lines stay under their own heading", t => {
  const root = brain();
  const old = readFileSync(join(P, "templates/legacy", legacyTemplates["0.34.3"]), "utf8").replaceAll("{{COMPANY}}", "Pagecraft");
  const target = template.replaceAll("{{COMPANY}}", "Pagecraft");
  const shipped = [...new Set(Object.values(legacyTemplates))].map(f => readFileSync(join(P, "templates/legacy", f), "utf8").replaceAll("{{COMPANY}}", "Pagecraft"));
  assert.equal(ownAdditions(old, shipped, target), "", "an unedited rulebook has no own lines");
  // an edit inside a section that moved out to a page, and a section of their own
  const edited = old.replace("Never delete the source file.", "Never delete the source file. Logos go to Marta first.") + "\n## Ours\n\nAlways copy Maria on pricing.\n";
  const own = ownAdditions(edited, shipped, target);
  assert.match(own, /Logos go to Marta first\./);
  assert.match(own, /## Ours\n\nAlways copy Maria on pricing\./);
  const merged = withOwnAdditions(target, edited, shipped);
  assert.ok(merged.startsWith(target.trimEnd()), "the new rules first, whole");
  assert.match(merged, /\n## This brain's own additions\n\n/);
  assert.equal(withOwnAdditions(target, merged, shipped), merged, "applying it again adds nothing twice");
  // through the upgrader: the proposal carries them; an unedited 0.34.3 file is replaced by the slim rules
  writeFileSync(join(root, "AGENTS.md"), edited);
  const upEnv = { ...env, GTM_BRAIN_NO_COMMIT: "1" };
  const r = spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root], { cwd: root, env: upEnv, encoding: "utf8" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const proposal = r.stderr.match(/Review (\S+) alongside/)?.[1];
  const text = readFileSync(proposal.startsWith("/") ? proposal : join(root, proposal), "utf8");
  assert.match(text, /## This brain's own additions[\s\S]*Logos go to Marta first\.[\s\S]*Always copy Maria on pricing\./);
  writeFileSync(join(root, "AGENTS.md"), old);
  const clean = spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root], { cwd: root, env: upEnv, encoding: "utf8" });
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), target);
});

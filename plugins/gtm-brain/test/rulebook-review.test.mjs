// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// Review of the slim rulebook (0.35.0): the ways it could look right and be wrong. A search that returns a page
// for a word no page is about; a status reply folded although the opening lines never arrived whole; a tool named
// by a page that does not exist; a person's own additions that leave the upgrader refusing forever.
// Run: node --test plugins/gtm-brain/test/rulebook-review.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { rulePages, findRulePage, rulePageAnswer, withOwnAdditions, HEADING_OWN } from "../lib/rule-pages.mjs";
import { legacyTemplates, rulesState, autoRefresh, rulesWhy } from "../lib/upgrade-files.mjs";
import { removeBrain } from "./helpers/dash-cleanup.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const template = readFileSync(join(P, "templates/AGENTS.md"), "utf8");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-review-codex-")), HOME: mkdtempSync(join(tmpdir(), "gtm-review-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1" };
for (const k of ["GTM_BRAIN_NO_COMMIT", "GTM_BRAIN_NO_SESSION_START", "GTM_BRAIN_RUN", "GTM_BRAIN_HOST", "GTM_BRAIN_NO_RULE_PAGES", "GTM_BRAIN_TOOLSET"]) delete env[k];

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-review-brain-")));
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
const shippedFor = company => [...new Set(Object.values(legacyTemplates))].map(f => readFileSync(join(P, "templates/legacy", f), "utf8").replaceAll("{{COMPANY}}", company));

test("a search returns the page the words are about, never a page for a filler word", () => {
  // each of these returned another topic's page: "use" is half of computer-use, "the" and "person" sit in a title
  const cases = { "how to use skills": "skills", "use a skill": "skills", "who is this person": "entities", person: "entities", company: "entities",
    "remember a note": "saving", "brain question": "saving", "computer use": "computer-use", "Computer Use": "computer-use", "open the dashboard": "dashboard",
    "workplace settings": "approve", "RULES.md": "files", "ask the person": "questions" };
  for (const [words, slug] of Object.entries(cases)) assert.equal(findRulePage(words)?.slug, slug, `"${words}"`);
  // words that name no topic get the list of pages, not the first page that happens to contain them
  for (const filler of ["the", "a", "no", "yes", "use", "page", "rule 2a", "how do I", "this and that"]) {
    assert.equal(findRulePage(filler), null, `"${filler}" names no topic`);
    assert.match(rulePageAnswer(filler), /^No rule page matches/, `"${filler}"`);
  }
  // two topics fit equally: both are named, and no page is passed off as the answer
  const both = rulePageAnswer("save");
  assert.doesNotMatch(both, /^--- Rule page:/, "save is the saving page and the save tool of the files page: neither alone");
  assert.match(both, /saving/); assert.match(both, /files/);
  assert.ok(Buffer.byteLength(both) < 400, "a short pointer, not two pages");
});

test("every page named in AGENTS.md exists, and every tool a page rides along with is a real tool", async () => {
  const slugs = new Set(rulePages().map(p => p.slug));
  const named = [...template.replace(/\s+/g, " ").matchAll(/\(([a-z-]+(?: and [a-z-]+)?) page\)|the ([a-z-]+) page\b/g)].flatMap(m => (m[1] || m[2]).split(" and "));
  assert.ok(named.length >= 15, `${named.length} page mentions`);
  for (const n of named) assert.ok(slugs.has(n), `AGENTS.md points at a "${n}" page that is not shipped`);
  const s = client(); await s.init();
  const { result } = await s.rpc("tools/list");
  const tools = new Set(result.tools.map(t => t.name)), objects = new Set(result.tools.find(t => t.name === "query").inputSchema.properties.object.enum);
  for (const p of rulePages()) for (const key of p.attach) {
    if (key.startsWith("query:")) assert.ok(objects.has(key.slice(6)), `${p.slug}: query has no object ${key.slice(6)}`);
    else assert.ok(tools.has(key), `${p.slug} rides along with ${key}, which is not a tool the chat is offered`);
  }
});

test("a status call first loses nothing: every line of the whole status is in the first reply", async () => {
  const root = brain(); const s = client(); await s.init();
  const first = await s.call("query", { brain: root, object: "status" });
  const whole = await s.call("query", { brain: root, object: "status" });
  const got = new Set(first.text.split("\n").map(l => l.trim()));
  for (const line of whole.parts[0].split("\n").map(l => l.trim()).filter(Boolean)) assert.ok(got.has(line), `lost from the first reply: ${line.slice(0, 120)}`);
  assert.ok(Buffer.byteLength(first.parts[0]) < Buffer.byteLength(whole.parts[0]) / 2, "and the contexts are said once");
});

test("a status reply is folded only by what the opening lines really carry", async () => {
  const { foldStatus } = await import("../lib/opening.mjs");
  const status = ["admin: brain/admin.md (always loaded)", "• Strategy (strategy) · 3 memories · current", "  Work on priorities here.", "", "Loaded in this chat: nothing (admin only)",
    "documents: Strategy [draft] -> strategy.md", "ONBOARDING pending · steps done: none · next: 1 (Who you are)."].join("\n");
  const full = "GTM Brain chat start (once per chat; follow it):\nbrain: x (X) at /x\nONBOARDING pending · steps done: none · next: 1 (Who you are).\n  • Strategy (strategy) · 3 memories · current\n    Work on priorities here.\ndocuments: Strategy [draft] -> strategy.md";
  const folded = foldStatus(status, full);
  assert.doesNotMatch(folded, /Strategy \(strategy\)|Work on priorities|ONBOARDING|documents:/, "what the opening lines carry is not repeated");
  assert.match(folded, /Loaded in this chat: nothing/);
  // the chat start was cut short (its 60 s limit, a broken project pointer): the status keeps what never arrived
  const cut = foldStatus(status, "GTM Brain chat start (once per chat; follow it):\nbrain: x (X) at /x");
  for (const line of status.split("\n").filter(Boolean)) assert.ok(cut.includes(line.trim()), `dropped although the opening lines lack it: ${line}`);
  assert.equal(foldStatus(status, ""), status, "no opening lines: the status as it is");
});

test("own additions do not lock the upgrader: an accepted proposal is up to date, and the next rules arrive with the additions kept", () => {
  const root = brain(); const templates = join(P, "templates");
  const target = template.replaceAll("{{COMPANY}}", "Pagecraft");
  const old = readFileSync(join(P, "templates/legacy", legacyTemplates["0.34.3"]), "utf8").replaceAll("{{COMPANY}}", "Pagecraft");
  const upEnv = { ...env, GTM_BRAIN_NO_COMMIT: "1" };
  const upgrade = () => spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root], { cwd: root, env: upEnv, encoding: "utf8" });
  // the person accepts the proposal: the new rules plus their own lines
  const accepted = withOwnAdditions(target, old + "\n## Ours\n\nAlways copy Maria on pricing.\n", shippedFor("Pagecraft"));
  assert.match(accepted, /## This brain's own additions\n\n## Ours\n\nAlways copy Maria on pricing\.\n$/);
  writeFileSync(join(root, "AGENTS.md"), accepted);
  assert.equal(rulesState(root, templates), "current", "the shipped rules, whole, with own additions after them");
  const again = upgrade();
  assert.equal(again.status, 0, `the upgrader refuses a brain that accepted its own proposal, and every later step with it:\n${again.stdout}${again.stderr}`);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), accepted, "nothing rewritten, the additions still there");
  assert.doesNotMatch(again.stdout, /updated AGENTS\.md/);
  // shipped older rules with the person's additions under their heading: refreshed, the additions kept word for word
  const own = "## Ours\n\nAlways copy Maria on pricing.\n\n- Logos go to Marta first.\n";
  const olderWithOwn = `${old.trimEnd()}\n\n${HEADING_OWN}\n\n${own}`;
  writeFileSync(join(root, "AGENTS.md"), olderWithOwn);
  assert.equal(rulesState(root, templates), "legacy");
  const up = upgrade();
  assert.equal(up.status, 0, up.stdout + up.stderr);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), `${target.trimEnd()}\n\n${HEADING_OWN}\n\n${own}`);
  // and at chat start, by itself
  writeFileSync(join(root, "AGENTS.md"), olderWithOwn);
  const prev = process.env.GTM_BRAIN_NO_COMMIT; process.env.GTM_BRAIN_NO_COMMIT = "1";
  try { assert.match(autoRefresh(root, templates), /refreshed this brain's rules/); } finally { if (prev === undefined) delete process.env.GTM_BRAIN_NO_COMMIT; else process.env.GTM_BRAIN_NO_COMMIT = prev; }
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), `${target.trimEnd()}\n\n${HEADING_OWN}\n\n${own}`);
  // a hand edit inside the rules is still never replaced
  writeFileSync(join(root, "AGENTS.md"), olderWithOwn.replace("Never delete the source file.", "Delete the source file."));
  assert.equal(rulesState(root, templates), "custom");
  assert.equal(upgrade().status, 2);
});

test("a teammate on an older GTM Brain is told what a missing rule page means; the reason for the new rules names the pages", () => {
  // before 0.35.0, query rules ignores search and answers with the brain check: the shared rulebook says what that means
  assert.match(template.replace(/\s+/g, " "), /answers with the brain check instead of a page[^.]*older than these rules/);
  assert.match(rulesWhy["0.35.0"], /rule page/);
  assert.doesNotMatch(rulesWhy["0.35.0"], /long procedures moved to the skills/, "the detail moved to rule pages, and no skill file is read to answer or save");
});

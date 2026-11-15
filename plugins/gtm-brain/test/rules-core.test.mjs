process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
// The core rules: one text (policies/core.md), the first section of every brain's AGENTS.md and part of
// the MCP server's instructions, so a chat that never reads AGENTS.md still gets them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { legacyTemplates } from "../lib/upgrade-files.mjs";
import { removeBrain } from "./helpers/dash-cleanup.mjs";

const plugin = new URL("../", import.meta.url).pathname;
const repo = join(plugin, "../..");
const core = readFileSync(join(plugin, "policies/core.md"), "utf8").trimEnd();
const template = readFileSync(join(plugin, "templates/AGENTS.md"), "utf8");
const count = (text, part) => text.split(part).length - 1;
const START = "<!-- generated: core; edit plugins/gtm-brain/policies/core.md -->", END = "<!-- /generated: core -->";

test("the core is at most 15 short lines, plain hyphens only", () => {
  const lines = core.split("\n");
  assert.ok(lines.length >= 1 && lines.length <= 15, `${lines.length} lines`);
  for (const line of lines) assert.ok(line.length <= 100, `long line: ${line}`);
  assert.doesNotMatch(core, /[\u2013\u2014]/);
  // the non-negotiables, in the words the rules already use
  for (const re of [/remember/, /one memory per distinct\s+outcome/, /search it with\s+`query`/, /as of .*days ago/, /approve_change/, /APPROVE and only the person's click/, /memories\.jsonl/, /a direct edit\s+is put back/, /Never invent/, /one or\s+two sentences/])
    assert.match(core, re);
});

// A manual run on 2026-11-15: 6 to 9 rounds a turn, a 39-item list worked through alone in 84 calls, web
// searches for private people. Three of the six rules answer that, and the core did not get a seventh.
test("six rules: fewest calls, a list to tidy one item at a time, nothing about a person from the web", () => {
  const rules = core.split(/\n(?=\d+\. )/).map(r => r.replace(/\s+/g, " "));
  assert.equal(rules.length, 6);
  assert.deepEqual(rules.map(r => r.slice(0, 2)), ["1.", "2.", "3.", "4.", "5.", "6."]);
  const one = re => { const hits = rules.filter(r => re.test(r)); assert.equal(hits.length, 1, `${re} in ${hits.length} rules`); return hits[0]; };
  const calls = one(/Fewest calls/);
  assert.match(calls, /the tool named for the job first/);
  assert.match(calls, /several reads in one call/);
  assert.match(calls, /no status, environment or rule-page read before a save, a read or a confirmed action/);
  assert.match(one(/things to tidy/), /one item at a time with the person, never alone/);
  const web = one(/on the web/);
  assert.match(web, /Nothing about a person or company is looked up on the web unless the person asks for exactly that/);
  assert.match(web, /what the notes do not say is unknown/);
  // APPROVE and the protected files stay, in one rule
  assert.match(one(/approve_change/), /Never edit it, `brain\/ontology\.ossie\.json` or a `memories\.jsonl` directly/);
  assert.ok(Buffer.byteLength(core) <= 1200, `${Buffer.byteLength(core)} bytes: the core stays a screenful`);
});

test("the core is the first section of the template, once, generated from policies/core.md", () => {
  const sections = template.split("\n").filter(l => l.startsWith("## "));
  assert.equal(sections[0], "## Core rules");
  assert.equal(count(template, START), 1); assert.equal(count(template, END), 1);
  const block = template.slice(template.indexOf(START) + START.length, template.indexOf(END)).trim();
  assert.equal(block, core, "the block is the policy text, byte for byte");
  assert.ok(template.indexOf(START) < template.indexOf("## Start of a chat"), "nothing comes before the core but the title and its lead line");
  // every core line is said once: the rest of the file refers to it instead of repeating it
  for (const line of core.split("\n").map(l => l.replace(/^\s*(\d+\.)?\s*/, "")).filter(l => l.length > 30))
    assert.equal(count(template, line), 1, `repeated: ${line}`);
  assert.match(template, /\(core 1\)/); assert.match(template, /core 6; approve page/);
  // the numbers the rulebook and the rule pages point at exist and mean what they say
  const pages = ["answers", "approve", "interactions", "saving"].map(n => readFileSync(join(plugin, "policies/rules", `${n}.md`), "utf8")).join("\n");
  for (const m of (template + pages).matchAll(/core (\d)(?: (?:to|and) (\d))?/g)) for (const n of [m[1], m[2]].filter(Boolean)) assert.ok(+n >= 1 && +n <= 6, `core ${n}`);
  assert.match(pages, /the live check is core 2/); assert.match(pages, /Never invent \(rule 5, core 2\)/);
  assert.match(pages, /`remember` tool \(core 6\)/); assert.doesNotMatch(pages, /core 4 and 5/);
  // the slim rulebook: at most 16 KB with a long company name filled in; the detail is in the rule pages
  const filled = Buffer.byteLength(template.replaceAll("{{COMPANY}}", "A Rather Long Company Name Holding International Sp. z o.o."));
  assert.ok(filled <= 16384, `${filled} bytes is over the 16 KB the slim rulebook allows`);
});

test("one source: the server reads policies/core.md and sync-derived writes it into the template", () => {
  assert.match(readFileSync(join(plugin, "server/server.mjs"), "utf8"), /join\(P, "policies", "core\.md"\)/);
  assert.match(readFileSync(join(repo, "scripts/sync-derived.mjs"), "utf8"), /"core"/);
  const check = spawnSync(process.execPath, [join(repo, "scripts/sync-derived.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
});

test("the server's instructions carry the core once, on either host", async () => {
  for (const host of ["", "claude"]) {
    const env = { ...process.env, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_SESSION_START: "1", CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-core-profile-")) };
    if (host) env.GTM_BRAIN_HOST = host; else delete env.GTM_BRAIN_HOST;
    const server = spawn(process.execPath, [join(plugin, "server/server.mjs")], { stdio: ["pipe", "pipe", "pipe"], env });
    const reply = await new Promise((res, rej) => {
      createInterface({ input: server.stdout }).on("line", line => { const m = JSON.parse(line); if (m.id === 1) res(m); });
      server.on("error", rej);
      server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } }) + "\n");
    });
    server.kill();
    const text = reply.result.instructions;
    assert.equal(count(text, core), 1, `${host || "codex"}: the core, whole and once`);
    assert.ok(text.indexOf(core) < text.indexOf("Ordinary questions and saving need no skill file"), "before the workflow pointers");
    assert.doesNotMatch(text, /start every chat with query \(object status\)|gtm-brain-use-brain\/SKILL\.md/, "no status call first, no skill read for recall");
    assert.match(text, /kept at once/);
    // Claude Code cuts a server's instructions at 2048 characters (MAX_MCP_DESCRIPTION_LENGTH): what must
    // arrive on either host sits before that, the core whole.
    const head = text.slice(0, 2048);
    assert.equal(count(head, core), 1, `${host || "codex"}: the core ends at character ${text.indexOf(core) + core.length}, past the 2048 a host keeps`);
    for (const must of [/first GTM Brain call, whatever it is/, /no separate status call/, /kept at once/, /keep_approved_file, in the same turn/])
      assert.match(head, must, `${host || "codex"}: ${must} is past the first 2048 characters`);
    // the five common jobs, one line each, right after: no discovery round, no skill or rule page read first
    const shapes = text.slice(text.indexOf("Call shapes for the common jobs"), text.indexOf("Files you create, edit, move or delete")).trimEnd().split("\n");
    assert.equal(shapes.length, 6, "a lead line and five shapes");
    assert.match(shapes[0], /Use them as written: no list_objects, describe_object, status or rule page first/);
    for (const [i, re] of [/^- Answer from the brain: query \{object: "memories", search: /, /^- Save a note: remember \{content, people: \[names\], sources\}.*answer_question/,
      /^- Read several people or companies in one call: query \{object: "entities", filters: \{name: \["A", "B"\]\}\} \(or filters\.id\)/,
      /^- Housekeeping, only when the person asks for it: query \{object: "housekeeping"\}, then the first item only, asked with ask_person/,
      /^- Merge two entities the person confirmed are one: merge_entities \{source, target, confirmed: true\}/].entries()) assert.match(shapes[i + 1], re);
    for (const line of shapes) assert.ok(line.length <= 160, `long: ${line}`);
    // Codex keeps the whole text; on Claude Code the shapes start right at the 2048 cut, after the core and the
    // approved-file rule, and before everything else the instructions say
    assert.ok(text.indexOf("Call shapes") > text.indexOf("keep_approved_file, in the same turn") && text.indexOf("Call shapes") < 2200, `the shapes start at ${text.indexOf("Call shapes")}`);
    assert.ok(text.indexOf("Call shapes") < text.indexOf("Questions: GTM Brain shows no question forms"), "before the question line and the catalog");
    assert.match(text, /Never read a skill file, a references file or a rule page in the middle of a save, a read or a confirmed action/);
    assert.doesNotMatch(text, /query \(object rules, search: a topic\) returns one rule page/, "no invitation to fetch rule pages");
    assert.doesNotMatch(text, /[\u2013\u2014]/);
  }
});

test("the skills do not send the model to a file before a save, a read or a question", () => {
  const skill = name => readFileSync(join(plugin, "skills", name, "SKILL.md"), "utf8");
  const use = skill("gtm-brain-use-brain"), todo = skill("gtm-brain-todo");
  assert.doesNotMatch(use, /Read \[memory recording\]\(references\/remember\.md\) before/);
  assert.doesNotMatch(use, /Before the first question, read/);
  assert.doesNotMatch(use, /recommendations, read\s+\[operational evidence\]/);
  assert.match(use, /is one\s+`remember` call from the tool's own description, with no file read first/);
  assert.match(use, /\[Memory recording\]\(references\/remember\.md\) is for the rare cases/);
  assert.doesNotMatch(todo, /^Read \[operational evidence\]/m);
  assert.match(todo, /Not for housekeeping[\s\S]*`query` with object `housekeeping`, then its first item only/);
});

test("a brain on the rules before this core (0.35.0 pre-release) is refreshed too", t => {
  const { root, run } = brain(t, "0.34.5-next.1");
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const now = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.equal(now, template.replaceAll("{{COMPANY}}", "Core Co"));
  assert.match(now, /4\. A list of things to tidy is taken one item at a time/);
});

function brain(t, version) {
  const root = mkdtempSync(join(tmpdir(), "gtm-core-upgrade-"));
  t.after(() => removeBrain(root));
  const env = { ...process.env, CODEX_HOME: join(root, "profile"), GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const setup = spawnSync("bash", [join(plugin, "scripts/gtm-brain-setup/setup.sh"), "--company", "Core Co", "--one-liner", "Testing", "--owner", "Ann Lee <ann@example.test>"], { cwd: root, env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  const old = readFileSync(join(plugin, "templates/legacy", legacyTemplates[version]), "utf8").replaceAll("{{COMPANY}}", "Core Co");
  writeFileSync(join(root, "AGENTS.md"), old);
  return { root, old, run: () => spawnSync("bash", [join(plugin, "scripts/gtm-brain-upgrade/upgrade.sh"), root], { cwd: root, env, encoding: "utf8" }) };
}

test("a brain on the 0.34.3 rules gets the core through the upgrader, with the reason named", t => {
  const { root, run } = brain(t, "0.34.3");
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /six core rules/);
  const now = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.equal(now, template.replaceAll("{{COMPANY}}", "Core Co"));
  assert.equal(count(now, core), 1);
});

test("rules with a personal edit are not replaced: the new rules wait as a proposal beside them", t => {
  const { root, old, run } = brain(t, "0.34.3");
  const edited = old + "\n## Ours\n\nAlways copy Maria on pricing.\n";
  writeFileSync(join(root, "AGENTS.md"), edited);
  const result = run();
  assert.equal(result.status, 2, result.stdout);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), edited, "the person's file is untouched");
  const proposal = result.stderr.match(/Review (\S+) alongside/)?.[1];
  assert.ok(proposal, result.stderr);
  const path = proposal.startsWith("/") ? proposal : join(root, proposal);
  const text = readFileSync(path, "utf8");
  assert.equal(count(text, core), 1, "the proposal carries the core, for review beside the person's own file");
  // the person's own lines stay in the proposal, under the heading for the brain's own additions
  assert.match(text, /## This brain's own additions\n\n## Ours\n\nAlways copy Maria on pricing\.\n$/);
});

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
  for (const re of [/remember/, /one memory per distinct\s+outcome/, /search it with\s+`query`/, /no status call first/, /as of .*days ago/, /approve_change/, /memories\.jsonl/, /Never invent/, /one or two sentences/])
    assert.match(core, re);
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
  assert.match(template, /\(core 1\)/); assert.match(template, /core 4/);
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
  }
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

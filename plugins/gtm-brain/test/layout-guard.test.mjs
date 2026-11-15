// brain/layout.json and the upgrade that is safe for old brains and for teammates (0.35.0 round three, R5).
// Setup and upgrade record the layout; a brain on a newer layout is read-only for this plugin; a layout change
// waits for the person's yes, after naming the teammates who saved in the last 14 days; an upgrade delivers
// RULES.md, SCHEMA.md and the starter documents a brain lacks and never replaces a file the person has.
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import * as lib from "../lib/brain.mjs";
import { readLayout, layoutBlock, layoutPlan, recentTeammates, LayoutError, LAYOUT_FILE } from "../lib/layout-version.mjs";
import { legacyTemplates, STARTERS } from "../lib/upgrade-files.mjs";
import { ensureRules } from "../lib/where.mjs";
import { ensureSchema } from "../lib/schema.mjs";
import { removeBrain } from "./helpers/dash-cleanup.mjs";

const P = new URL("../", import.meta.url).pathname;
const NEWER = JSON.stringify({ layout: 2, starters: [], about: "written by a newer GTM Brain" }) + "\n";

function brain(t, { commit = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "gtm-layout-"));
  t.after(() => removeBrain(root));
  const env = { ...process.env, CODEX_HOME: join(root, "profile"), GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", NODE_NO_WARNINGS: "1", ...(commit ? {} : { GTM_BRAIN_NO_COMMIT: "1" }) };
  delete env.GTM_BRAIN_RUN;
  if (commit) delete env.GTM_BRAIN_NO_COMMIT;
  const setup = spawnSync("bash", [join(P, "scripts/gtm-brain-setup/setup.sh"), "--company", "Layout Co", "--one-liner", "Testing", "--owner", "Ann Lee <ann@example.test>", "--team", "Bo Chen <bo@example.test>, Cy Diaz <cy@example.test>"], { cwd: root, env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  const upgrade = (...a) => spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root, ...a], { cwd: root, env, encoding: "utf8" });
  const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
  return { root, env, upgrade, git };
}
/* Every file outside work/ and .git/, by content. */
function tree(root) {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile()).map(e => join(e.parentPath, e.name).slice(root.length + 1))
    .filter(p => !/^(work|\.git|profile)\//.test(p)).sort().map(p => [p, readFileSync(join(root, p), "utf8")]));
}
/* A brain as 0.32.0 left it: its rules, no RULES.md, SCHEMA.md or layout file, two of the five starters. */
function era032(root) {
  writeFileSync(join(root, "AGENTS.md"), readFileSync(join(P, "templates/legacy", legacyTemplates["0.32.0"]), "utf8").replaceAll("{{COMPANY}}", "Layout Co"));
  for (const f of ["RULES.md", "SCHEMA.md", LAYOUT_FILE, "icp.md", "design-system.md", "market.md"]) rmSync(join(root, f), { force: true });
  writeFileSync(join(root, "voice.md"), "---\nkind: document\ntitle: Voice\n---\n# Voice\n\nOur own words, written by Ann.\n");
}

test("setup records layout 1 and the five starters as given", t => {
  const { root } = brain(t);
  assert.deepEqual(readLayout(root), { layout: 1, starters: [...STARTERS].sort() });
  assert.equal(layoutBlock(root), "");
});

test("a 0.32-era brain gets RULES.md, SCHEMA.md, the starters it lacks and the layout file; the person's files stay; a second upgrade changes nothing", t => {
  const { root, upgrade, git } = brain(t);
  era032(root); git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "as 0.32 left it");
  const voice = readFileSync(join(root, "voice.md"), "utf8"), strategy = readFileSync(join(root, "strategy.md"), "utf8");
  const first = upgrade();
  assert.equal(first.status, 0, first.stderr);
  for (const f of ["RULES.md", "SCHEMA.md", "icp.md", "design-system.md", "market.md"]) {
    assert.ok(existsSync(join(root, f)), `${f} delivered`);
    assert.match(first.stdout, new RegExp(`added ${f.replace(".", "\\.")}`));
  }
  assert.equal(readFileSync(join(root, "RULES.md"), "utf8"), readFileSync(join(P, "templates/RULES.md"), "utf8"));
  assert.equal(readFileSync(join(root, "SCHEMA.md"), "utf8"), readFileSync(join(P, "templates/SCHEMA.md"), "utf8"));
  assert.match(readFileSync(join(root, "market.md"), "utf8"), /Layout Co/);
  assert.doesNotMatch(readFileSync(join(root, "market.md"), "utf8"), /\{\{/);
  assert.equal(readFileSync(join(root, "voice.md"), "utf8"), voice, "the person's voice.md is never replaced");
  assert.equal(readFileSync(join(root, "strategy.md"), "utf8"), strategy);
  assert.doesNotMatch(first.stdout, /added (voice|strategy)\.md/);
  assert.deepEqual(readLayout(root), { layout: 1, starters: [...STARTERS].sort() });
  assert.match(first.stdout, /recorded the brain's file layout/);
  assert.equal(git("status", "--porcelain").trim(), "", "everything the upgrade wrote is kept");
  const after = tree(root), head = git("rev-parse", "HEAD");
  const second = upgrade();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /already current/);
  assert.deepEqual(tree(root), after);
  assert.equal(git("rev-parse", "HEAD"), head, "a second upgrade commits nothing");
});

test("a current brain upgrades to nothing; an already upgraded one too, and a starter deleted later is not brought back", t => {
  const { root, upgrade, git } = brain(t);
  const before = tree(root);
  const r = upgrade();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /already current/);
  assert.deepEqual(tree(root), before);
  rmSync(join(root, "market.md")); git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "we do not want market.md");
  const again = upgrade();
  assert.match(again.stdout, /already current/);
  assert.equal(existsSync(join(root, "market.md")), false, "a starter recorded as given stays deleted");
});

test("a starter in a folder of its own name counts as there", t => {
  const { root, upgrade, git } = brain(t);
  era032(root);
  execFileSync("mkdir", [join(root, "icp")]); writeFileSync(join(root, "icp", "icp.md"), "---\nkind: document\ntitle: ICP\n---\n# ICP\n\nOurs.\n");
  git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "icp in its folder");
  const r = upgrade();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(join(root, "icp.md")), false);
  assert.ok(existsSync(join(root, "market.md")));
});

test("a brain on a newer layout: lib writers refuse before writing, commit and save refuse, reads work", t => {
  const { root, git } = brain(t);
  lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "Kept before the newer layout." });
  writeFileSync(join(root, LAYOUT_FILE), NEWER); git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "a teammate upgraded the layout");
  const memories = readFileSync(join(root, "brain/contexts/company/memories.jsonl"), "utf8"), head = git("rev-parse", "HEAD");
  assert.match(layoutBlock(root), /upgraded to file layout 2 by a newer GTM Brain; this one understands layout 1\. Reading works, but nothing is written or saved until you update GTM Brain/);
  assert.throws(() => lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "Must not land." }), LayoutError);
  assert.throws(() => lib.writeNames(root, lib.readNames(root)), LayoutError);
  assert.throws(() => lib.writeContext(root, "company", { rule: "x" }), LayoutError);
  assert.equal(readFileSync(join(root, "brain/contexts/company/memories.jsonl"), "utf8"), memories, "no partial write");
  writeFileSync(join(root, "draft.md"), "mine\n");
  assert.equal(lib.commit(root, ["draft.md"], "x").ok, false);
  assert.equal(lib.save(root, "x").ok, false);
  assert.equal(git("rev-parse", "HEAD"), head);
  assert.equal(lib.readMemories(root, "company").at(-1).content, "Kept before the newer layout.", "reads go on");
  // RULES.md and SCHEMA.md are delivered when missing, but never into a brain this plugin must not write
  rmSync(join(root, "RULES.md")); rmSync(join(root, "SCHEMA.md"));
  assert.equal(ensureRules(root, join(P, "templates")), false);
  assert.equal(ensureSchema(root, join(P, "templates")), false);
  assert.equal(existsSync(join(root, "RULES.md")) || existsSync(join(root, "SCHEMA.md")), false);
});

test("an unreadable layout file (a merge conflict) refuses writes with its own line", t => {
  const { root } = brain(t);
  writeFileSync(join(root, LAYOUT_FILE), "<<<<<<< HEAD\n{\"layout\": 1}\n=======\n{\"layout\": 2}\n>>>>>>> theirs\n");
  assert.match(layoutBlock(root), /brain\/layout\.json cannot be read/);
  assert.throws(() => lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "No." }), LayoutError);
});

test("the upgrade refuses a newer-layout brain and changes nothing", t => {
  const { root, upgrade } = brain(t);
  era032(root); writeFileSync(join(root, LAYOUT_FILE), NEWER);
  const before = tree(root);
  const r = upgrade();
  assert.equal(r.status, 3);
  assert.match(r.stdout, /update GTM Brain/);
  assert.match(r.stdout, /Nothing was upgraded/);
  assert.deepEqual(tree(root), before);
  assert.equal(existsSync(join(root, "work/upgrades")), false, "not even a backup");
});

test("the chat start of a newer-layout brain prints the one line and nothing else", t => {
  const { root, env } = brain(t);
  rmSync(join(root, "RULES.md"));
  writeFileSync(join(root, LAYOUT_FILE), NEWER);
  const before = tree(root);
  for (const plugin of [P, ""]) {   // with and without PLUGIN_ROOT: the guard finds its lib next to the script
    const out = spawnSync("bash", [join(P, "session/session-start.sh")], { cwd: root, env: { ...env, PLUGIN_ROOT: plugin }, input: "{}", encoding: "utf8" });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout.trim(), layoutBlock(root));
    assert.deepEqual(tree(root), before, "RULES.md is not added to a brain this plugin must not write");
  }
});

test("through the MCP server: a write tool is refused with the line, a read answers with the line on top", async t => {
  const { root, env } = brain(t);
  lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "Acme signed the pilot." });
  writeFileSync(join(root, LAYOUT_FILE), NEWER);
  const memories = readFileSync(join(root, "brain/contexts/company/memories.jsonl"), "utf8");
  const server = spawn(process.execPath, [join(P, "server/server.mjs")], { stdio: ["pipe", "pipe", "pipe"], env: { ...env, GTM_BRAIN_NO_SAVE_NUDGE: "1" } });
  t.after(() => server.kill());
  const pending = new Map(); let seq = 0;
  createInterface({ input: server.stdout }).on("line", line => { const m = JSON.parse(line); pending.get(m.id)?.(m); pending.delete(m.id); });
  const call = (name, args) => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) + "\n"); }).then(m => m.result);
  const saved = await call("remember", { brain: root, by: "ann-lee", context: "company", content: "Acme wants a second seat." });
  assert.equal(saved.isError, true);
  assert.equal(saved.content.length, 1);
  assert.match(saved.content[0].text, /update GTM Brain/);
  assert.equal(readFileSync(join(root, "brain/contexts/company/memories.jsonl"), "utf8"), memories);
  const save = await call("save", { brain: root, message: "x" });
  assert.equal(save.isError, true);
  const read = await call("query", { brain: root, object: "memories", search: "pilot" });
  assert.notEqual(read.isError, true);
  assert.match(read.content[0].text, /^GTM Brain: this brain was upgraded to file layout 2/);
  assert.match(read.content.slice(1).map(c => c.text).join("\n"), /Acme signed the pilot/);
  assert.doesNotMatch(read.content.map(c => c.text).join("\n"), /chat start/, "no chat start: it writes");
  const loaded = await call("load_context", { brain: root, contexts: ["company"] });
  assert.notEqual(loaded.isError, true, "loading writes only work/: it is a read for the shared brain");
  assert.match(loaded.content[0].text, /^GTM Brain: this brain was upgraded/);
  assert.match(loaded.content.map(c => c.text).join("\n"), /Context loaded/);
  assert.equal(readFileSync(join(root, "brain/contexts/company/memories.jsonl"), "utf8"), memories);
});

test("a layout-changing upgrade names the teammates who saved in the last 14 days and waits for --confirm", t => {
  const { root, env, upgrade } = brain(t);
  const day = n => new Date(Date.now() - n * 86400000).toISOString();
  lib.appendMemory(root, "company", { authors: ["bo-chen"], content: "Bo saved this.", at: day(2) });
  lib.appendMemory(root, "company", { authors: ["cy-diaz"], content: "Cy saved this long ago.", at: day(20) });
  lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "Ann, the person upgrading.", at: day(1) });
  execFileSync("git", ["-C", root, "config", "user.email", "ann@example.test"]);
  assert.deepEqual(recentTeammates(root, { me: "ann-lee" }).map(x => x.handle), ["bo-chen"]);
  const plan = layoutPlan(root, { target: 2, me: "ann-lee", names: { "bo-chen": "Bo Chen" } });
  assert.equal(plan.changes, true);
  assert.match(plan.line, /from 1 to 2\. 1 teammate saved here in the last 14 days \(Bo Chen, last \d{4}-\d\d-\d\d\); they will need to update GTM Brain/);
  assert.match(plan.line, /Yes, upgrade the layout \/ No, not now/);
  const before = tree(root);
  const newer = { ...env, GTM_BRAIN_TEST_LAYOUT: "2" };
  const ask = spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root], { cwd: root, env: newer, encoding: "utf8" });
  assert.equal(ask.status, 0, ask.stderr);
  assert.match(ask.stdout, /not upgraded yet: This upgrade changes the brain's file layout from 1 to 2\. 1 teammate saved here in the last 14 days \(Bo Chen/);
  assert.match(ask.stdout, /Nothing was changed/);
  assert.doesNotMatch(ask.stdout, /Cy Diaz/);
  assert.deepEqual(tree(root), before);
  const yes = spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root, "--confirm"], { cwd: root, env: newer, encoding: "utf8" });
  assert.equal(yes.status, 0, yes.stderr);
  assert.match(yes.stdout, /changed the brain's file layout to 2/);
  assert.equal(readLayout(root).layout, 2);
  // the plugin of this branch now meets that brain: read-only
  assert.match(layoutBlock(root), /understands layout 1/);
});

test("the upgrade_brain tool passes confirm only when it is true", () => {
  const src = readFileSync(join(P, "server/server.mjs"), "utf8");
  assert.match(src, /confirm === true \? \["--confirm"\] : \[\]/);
});

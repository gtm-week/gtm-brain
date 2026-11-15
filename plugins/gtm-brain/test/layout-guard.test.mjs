// This file plays the layout 2 plugin (GTM_BRAIN_TEST_LAYOUT=2: kind folders, root files); the layout 3 move and its
// guard are in config-folders.test.mjs.
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
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
import { readLayout, layoutBlock, layoutPlan, recentTeammates, LayoutError, LAYOUT_FILE, LAYOUT } from "../lib/layout-version.mjs";
import { diskLayout } from "../lib/layout.mjs";
import { legacyTemplates, STARTERS } from "../lib/upgrade-files.mjs";
import { ensureRules } from "../lib/where.mjs";
import { ensureSchema } from "../lib/schema.mjs";
import { removeBrain } from "./helpers/dash-cleanup.mjs";

const P = new URL("../", import.meta.url).pathname;
const NEWER = JSON.stringify({ layout: 3, starters: [], about: "written by a newer GTM Brain" }) + "\n";

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
/* The brain as every version up to 0.34 kept it: entity pages flat in brain/entities, no kind folders, and
   brain/layout.json saying 1 (or missing: file false). Committed. */
function flatten(root, git, { file = true } = {}) {
  for (const p of lib.entityPagePaths(root)) {
    const to = `brain/entities/${p.split("/").pop().replace(/-[0-9a-f]{6}\.md$/, "")}.md`;
    writeFileSync(join(root, to), readFileSync(join(root, p), "utf8").replace(/\]\(\.\.\/\.\.\/contexts\//g, "](../contexts/")); rmSync(join(root, p));
  }
  for (const d of readdirSync(join(root, "brain/entities"), { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith(".")) rmSync(join(root, "brain/entities", d.name), { recursive: true });
  if (file) writeFileSync(join(root, LAYOUT_FILE), JSON.stringify({ layout: 1, starters: [...STARTERS].sort() }, null, 2) + "\n"); else rmSync(join(root, LAYOUT_FILE), { force: true });
  assert.equal(lib.entityLayout(root), "flat");
  git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "a brain from before 0.35: flat entity pages");
}
const lastCommit = git => git("show", "--name-status", "-M", "--format=%s", "HEAD");
const chatStart = (root, env, more = {}) => spawnSync("bash", [join(P, "session/session-start.sh")], { cwd: root, env: { ...env, PLUGIN_ROOT: P, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", ...more }, input: JSON.stringify({ session_id: "s", cwd: root }), encoding: "utf8" });
/* A brain as 0.32.0 left it: flat entity pages, its rules, no RULES.md, SCHEMA.md or layout file, two of the five starters. */
function era032(root) {
  flatten(root, (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" }), { file: false });
  writeFileSync(join(root, "AGENTS.md"), readFileSync(join(P, "templates/legacy", legacyTemplates["0.32.0"]), "utf8").replaceAll("{{COMPANY}}", "Layout Co"));
  for (const f of ["RULES.md", "SCHEMA.md", LAYOUT_FILE, "icp.md", "design-system.md", "market.md"]) rmSync(join(root, f), { force: true });
  writeFileSync(join(root, "voice.md"), "---\nkind: document\ntitle: Voice\n---\n# Voice\n\nOur own words, written by Ann.\n");
}

test("a brain made by setup is layout 2 (kind folders), with the five starters as given, all in the setup commit", t => {
  const { root, git } = brain(t);
  assert.equal(LAYOUT, 3); assert.equal(process.env.GTM_BRAIN_TEST_LAYOUT, "2", "this file plays a plugin that writes layout 2");
  assert.equal(lib.entityLayout(root), "kinds");
  assert.equal(diskLayout(root), 2);
  assert.deepEqual(readLayout(root), { layout: 2, starters: [...STARTERS].sort() });
  assert.equal(layoutBlock(root), "");
  const files = git("show", "--name-only", "--format=", "HEAD");
  assert.match(files, /^brain\/layout\.json$/m);
  assert.match(files, /^brain\/entities\/people\/index\.md$/m);
  assert.equal(git("status", "--porcelain", "brain").trim(), "");
});

test("a flat brain stays layout 1 and still saves, with or without the layout file", t => {
  for (const file of [true, false]) {
    const { root, git, env } = brain(t);
    flatten(root, git, { file });
    lib.appendMemory(root, "company", { authors: ["ann-lee"], people: ["Dana Flat"], content: "Dana Flat joined the pilot." });
    lib.addName(root, "Dana Flat");
    writeFileSync(join(root, "draft.md"), "mine\n");
    const saved = lib.save(root, "a save in a flat brain");
    assert.equal(saved.ok, true, saved.note);
    assert.doesNotMatch(saved.note, /layout/);
    assert.equal(lib.readMemories(root, "company").at(-1).content, "Dana Flat joined the pilot.");
    assert.ok(existsSync(join(root, "brain/entities/dana-flat.md")), "a new page is flat");
    assert.equal(lib.entityLayout(root), "flat");
    assert.equal(readLayout(root).layout, 1);
    assert.equal(existsSync(join(root, LAYOUT_FILE)), file, "nothing writes the layout file of a flat brain on its own");
    const start = chatStart(root, env);
    assert.equal(start.status, 0, start.stderr);
    assert.doesNotMatch(start.stdout, /file layout/);
    assert.equal(lib.entityLayout(root), "flat");
    assert.equal(readLayout(root).layout, 1);
    assert.equal(git("status", "--porcelain", "brain").trim(), "");
  }
});

test("the upgrade asks before it moves a flat brain's pages: without the yes nothing moves and the layout stays 1; with it the move and layout 2 are one commit", t => {
  for (const file of [true, false]) {
    const { root, git, upgrade, env } = brain(t);
    flatten(root, git, { file });
    const before = tree(root), head = git("rev-parse", "HEAD");
    const ask = upgrade();
    assert.equal(ask.status, 0, ask.stderr);
    assert.match(ask.stdout, /not upgraded yet: This upgrade changes the brain's file layout from 1 to 2\. It moves 3 entity pages into a folder per kind \(brain\/entities\/people\/, organizations\/, \.\.\.\)/);
    assert.match(ask.stdout, /Yes, upgrade the layout \/ No, not now/);
    assert.match(ask.stdout, /Nothing was changed/);
    assert.deepEqual(tree(root), before);
    assert.equal(git("rev-parse", "HEAD"), head);
    assert.equal(readLayout(root).layout, 1);
    // a scheduled or background run never moves pages, even with the flag
    const bg = spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root, "--confirm"], { cwd: root, env: { ...env, GTM_BRAIN_RUN: "background" }, encoding: "utf8" });
    assert.equal(bg.status, 0, bg.stderr);
    assert.match(bg.stdout, /not upgraded yet: [^\n]*scheduled or background run never changes the layout/);
    assert.deepEqual(tree(root), before);
    const yes = upgrade("--confirm");
    assert.equal(yes.status, 0, yes.stderr);
    assert.match(yes.stdout, /moved 3 entity pages into a folder per kind/);
    assert.match(yes.stdout, /changed the brain's file layout to 2/);
    assert.equal(lib.entityLayout(root), "kinds");
    assert.equal(readLayout(root).layout, 2);
    const commit = lastCommit(git);
    assert.match(commit, /^[AM]\s+brain\/layout\.json$/m, "the layout file is in the commit of the move");
    assert.match(commit, /^R\d+\s+brain\/entities\/ann-lee\.md\s+brain\/entities\/people\/ann-lee-[0-9a-f]{6}\.md$/m);
    assert.equal(git("status", "--porcelain", "brain").trim(), "");
    const again = upgrade();
    assert.match(again.stdout, /already current/);
    assert.equal(readLayout(root).layout, 2);
  }
});

test("the lib's move records layout 2 itself, and does nothing in a scheduled or background run", t => {
  const { root, git } = brain(t);
  flatten(root, git);
  process.env.GTM_BRAIN_RUN = "background"; process.env.GTM_BRAIN_NO_COMMIT = "1";
  t.after(() => { delete process.env.GTM_BRAIN_RUN; delete process.env.GTM_BRAIN_NO_COMMIT; });
  assert.deepEqual(lib.migrateToKindFolders(root).moves, []);
  assert.equal(lib.entityLayout(root), "flat");
  assert.equal(readLayout(root).layout, 1);
  delete process.env.GTM_BRAIN_RUN;
  assert.equal(lib.migrateToKindFolders(root).moves.length, 3);
  assert.equal(readLayout(root).layout, 2);
  assert.deepEqual(readLayout(root).starters, [...STARTERS].sort(), "the starters recorded as given stay");
});

test("a brain a 0.35 pre-release moved into kind folders with layout 1 recorded heals to 2 in the next commit, said once", t => {
  const { root, git } = brain(t);
  writeFileSync(join(root, LAYOUT_FILE), JSON.stringify({ layout: 1, starters: ["icp"] }) + "\n");
  git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "as the pre-release left it");
  assert.equal(layoutBlock(root), "", "nothing blocks it: 0.35 reads and writes both");
  writeFileSync(join(root, "draft.md"), "one\n");
  const first = lib.commit(root, ["draft.md"], "a first write");
  assert.equal(first.ok, true, first.note);
  assert.match(first.note, /^kept; recorded file layout 2 in brain\/layout\.json: the entity pages were already in kind folders/);
  assert.equal(first.note.split("\n").length, 1);
  assert.deepEqual(readLayout(root), { layout: 2, starters: ["icp"] });
  const commit = lastCommit(git);
  assert.match(commit, /^a first write$/m);
  assert.match(commit, /^M\s+brain\/layout\.json$/m, "in the commit of that write");
  assert.match(commit, /^A\s+draft\.md$/m);
  writeFileSync(join(root, "draft.md"), "two\n");
  const second = lib.commit(root, ["draft.md"], "a second write");
  assert.equal(second.note, "kept");
  assert.doesNotMatch(lastCommit(git), /layout\.json/);
});

test("the same brain without a layout file heals at the chat start: one line, one commit, not again", t => {
  const { root, git, env } = brain(t);
  rmSync(join(root, LAYOUT_FILE)); git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "as the pre-release left it");
  const first = chatStart(root, env);
  assert.equal(first.status, 0, first.stderr);
  const said = first.stdout.split("\n").filter(l => /file layout/.test(l));
  assert.equal(said.length, 1, first.stdout);
  assert.match(said[0], /^GTM Brain: recorded file layout 2 in brain\/layout\.json \(kept\): the entity pages were already in kind folders/);
  assert.equal(readLayout(root).layout, 2);
  const commit = lastCommit(git);
  assert.match(commit, /^layout: /);
  assert.match(commit, /^A\s+brain\/layout\.json$/m);
  assert.equal(git("status", "--porcelain", "brain").trim(), "", "a commit of its own");
  const head = git("rev-parse", "HEAD"), file = readFileSync(join(root, LAYOUT_FILE), "utf8");
  const second = chatStart(root, env);
  assert.doesNotMatch(second.stdout, /file layout/);
  assert.equal(git("rev-parse", "HEAD"), head);
  assert.equal(readFileSync(join(root, LAYOUT_FILE), "utf8"), file);
  // a run with nobody in it heals too: it records what is on disk, it moves nothing
  rmSync(join(root, LAYOUT_FILE)); git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "again");
  chatStart(root, env, { GTM_BRAIN_RUN: "background" });
  assert.equal(readLayout(root).layout, 2);
});

test("a plugin that understands only layout 1 meets a layout 2 brain: every write is refused with the update line, reads go on, nothing heals", t => {
  const { root, git, env } = brain(t);
  lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "Kept by the newer plugin." });
  assert.equal(readLayout(root).layout, 2);
  const memories = readFileSync(join(root, "brain/contexts/company/memories.jsonl"), "utf8"), head = git("rev-parse", "HEAD"), before = tree(root);
  process.env.GTM_BRAIN_TEST_LAYOUT = "1";
  t.after(() => { process.env.GTM_BRAIN_TEST_LAYOUT = "2"; });
  const line = layoutBlock(root);
  assert.match(line, /^GTM Brain: this brain was upgraded to file layout 2 by a newer GTM Brain; this one understands layout 1\. It still reads what it knows how to find \(pages the newer layout moved may be missing\), but nothing is written or saved until you update GTM Brain: say "update GTM Brain" \(update_plugin\), then start a new chat\./);
  assert.throws(() => lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "Must not land." }), LayoutError);
  assert.throws(() => lib.writeNames(root, lib.readNames(root)), LayoutError);
  writeFileSync(join(root, "draft.md"), "mine\n");
  assert.equal(lib.commit(root, ["draft.md"], "x").note, line);
  assert.equal(lib.save(root, "x").note, line);
  rmSync(join(root, "draft.md"));
  assert.equal(lib.readMemories(root, "company").at(-1).content, "Kept by the newer plugin.", "reads go on");
  const older = { ...env, GTM_BRAIN_TEST_LAYOUT: "1" };
  const start = chatStart(root, older);
  assert.equal(start.stdout.trim(), line, "the chat start says the one line and nothing else");
  const up = spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root, "--confirm"], { cwd: root, env: older, encoding: "utf8" });
  assert.equal(up.status, 3);
  assert.match(up.stdout, /update GTM Brain/);
  assert.equal(readFileSync(join(root, "brain/contexts/company/memories.jsonl"), "utf8"), memories);
  assert.equal(git("rev-parse", "HEAD"), head);
  assert.deepEqual(tree(root), before);
  // where the pre-release left 1 on a kind-folder brain, the older plugin does not raise the number: it cannot know
  process.env.GTM_BRAIN_TEST_LAYOUT = "2";
  writeFileSync(join(root, LAYOUT_FILE), JSON.stringify({ layout: 1, starters: [] }) + "\n"); git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "pre-release state");
  process.env.GTM_BRAIN_TEST_LAYOUT = "1";
  writeFileSync(join(root, "draft.md"), "mine\n");
  assert.equal(lib.commit(root, ["draft.md"], "an older plugin writes").note, "kept");
  assert.equal(readLayout(root).layout, 1);
});

test("a 0.32-era brain gets RULES.md, SCHEMA.md, the starters it lacks and the layout file; the person's files stay; a second upgrade changes nothing", t => {
  const { root, upgrade, git } = brain(t);
  era032(root); git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "as 0.32 left it");
  const voice = readFileSync(join(root, "voice.md"), "utf8"), strategy = readFileSync(join(root, "strategy.md"), "utf8");
  assert.match(upgrade().stdout, /not upgraded yet: This upgrade changes the brain's file layout from 1 to 2/);
  const first = upgrade("--confirm");
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
  assert.deepEqual(readLayout(root), { layout: 2, starters: [...STARTERS].sort() });
  assert.match(first.stdout, /changed the brain's file layout to 2/);
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
  const r = upgrade("--confirm");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(join(root, "icp.md")), false);
  assert.ok(existsSync(join(root, "market.md")));
});

test("a brain on a newer layout: lib writers refuse before writing, commit and save refuse, reads work", t => {
  const { root, git } = brain(t);
  lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "Kept before the newer layout." });
  writeFileSync(join(root, LAYOUT_FILE), NEWER); git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "a teammate upgraded the layout");
  const memories = readFileSync(join(root, "brain/contexts/company/memories.jsonl"), "utf8"), head = git("rev-parse", "HEAD");
  assert.match(layoutBlock(root), /upgraded to file layout 3 by a newer GTM Brain; this one understands layout 2\. It still reads what it knows how to find \(pages the newer layout moved may be missing\), but nothing is written or saved until you update GTM Brain/);
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
  writeFileSync(join(root, LAYOUT_FILE), "<<<<<<< HEAD\n{\"layout\": 2}\n=======\n{\"layout\": 3}\n>>>>>>> theirs\n");
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
  assert.match(read.content[0].text, /^GTM Brain: this brain was upgraded to file layout 3/);
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
  const plan = layoutPlan(root, { target: 3, me: "ann-lee", names: { "bo-chen": "Bo Chen" } });
  assert.equal(plan.changes, true);
  assert.match(plan.line, /from 2 to 3\. 1 teammate saved here in the last 14 days \(Bo Chen, last \d{4}-\d\d-\d\d\); they will need to update GTM Brain/);
  assert.match(plan.line, /Yes, upgrade the layout \/ No, not now/);
  const before = tree(root);
  const newer = { ...env, GTM_BRAIN_TEST_LAYOUT: "3" };
  const ask = spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root], { cwd: root, env: newer, encoding: "utf8" });
  assert.equal(ask.status, 0, ask.stderr);
  assert.match(ask.stdout, /not upgraded yet: This upgrade changes the brain's file layout from 2 to 3\. It moves [^\n]* into about-us\/[^\n]*1 teammate saved here in the last 14 days \(Bo Chen, last [^)]*\); they will need to update GTM Brain: until then their GTM Brain does not find this brain/);
  assert.match(ask.stdout, /Nothing was changed/);
  assert.doesNotMatch(ask.stdout, /Cy Diaz/);
  assert.deepEqual(tree(root), before);
  const yes = spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root, "--confirm"], { cwd: root, env: newer, encoding: "utf8" });
  assert.equal(yes.status, 0, yes.stderr);
  assert.match(yes.stdout, /changed the brain's file layout to 3/);
  assert.equal(readLayout(root).layout, 3);
  // the plugin of this branch now meets that brain: read-only
  assert.match(layoutBlock(root), /understands layout 2/);
});

test("the upgrade_brain tool passes confirm only when it is true", () => {
  const src = readFileSync(join(P, "server/server.mjs"), "utf8");
  assert.match(src, /confirm === true \? \["--confirm"\] : \[\]/);
});

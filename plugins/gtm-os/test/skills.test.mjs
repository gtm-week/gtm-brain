process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// End-to-end tests of the skill scripts on a brain made by setup.sh. Run: node --test plugins/gtm-os/test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// Keep real installation preferences out of synthetic test brains.
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-test-profile-"));
const lib = await import(`${P}/lib/brain.mjs`);
const run = (root, skill, script, ...args) => execFileSync(script.endsWith(".sh") ? "bash" : process.execPath, [`${P}/${existsSync(`${P}/scripts/gtm-os-${skill}`) ? "scripts" : "skills"}/gtm-os-${skill}/${script}`, ...(script.endsWith(".sh") ? [] : ["."]), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, PLUGIN_ROOT: P } });

// Fake compilers below isolate later business changes from setup's saved progress note.
function settleSetup(root) {
  const c = lib.readContext(root, "company");
  lib.writeContext(root, "company", { ...c.fm, rule: c.rule, summary: "Onboarding is pending.", now: "Finish onboarding.", compiled_at: new Date().toISOString() });
}

const root = mkdtempSync(join(tmpdir(), "gtm-os-e2e-"));
execFileSync("git", ["init", "-q", root]);
for (const [k, v] of [["commit.gpgsign", "false"]]) execFileSync("git", ["-C", root, "config", k, v]);

test("setup refuses a folder with other files, and merges an existing .gitignore instead of replacing it", () => {
  const dirty = mkdtempSync(join(tmpdir(), "gtm-os-dirty-")); writeFileSync(join(dirty, "notes.txt"), "x");
  assert.throws(() => run(dirty, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "A B <a@b.c>"), /not empty \(notes.txt\)/);
  const withIgnore = mkdtempSync(join(tmpdir(), "gtm-os-ignore-")); writeFileSync(join(withIgnore, ".gitignore"), "secrets/\nwork/\n");
  run(withIgnore, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "A B <a@b.c>");
  const lines = readFileSync(join(withIgnore, ".gitignore"), "utf8").split("\n");
  assert.ok(lines.includes("secrets/"), "theirs kept"); assert.equal(lines.filter(l => l === "work/").length, 1, "ours added once"); assert.ok(lines.includes(".obsidian/"));
});

test("setup creates the brain, seeds cover tools, and commits", () => {
  const out = run(root, "setup", "setup.sh", "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--team", "Tomek Zielinski <tomek@reflow.io>", "--tools", "Attio (CRM), Gmail, PostHog", "--icp", "Read Attio live.");
  assert.match(out, /brain created for Reflow .* committed/);
  assert.deepEqual(lib.listContexts(root).map(c => c.slug).sort(),
    ["company", "strategy", "market", "icp", "offer", "personal-marta-nowak"].sort());
  assert.equal(lib.readContext(root, "personal-marta-nowak").fm.personal_owner, "marta-nowak");
  assert.equal(lib.readMemories(root, "personal-marta-nowak").length, 0, "the personal context starts empty");
  assert.equal(lib.readContext(root, "personal-tomek-zielinski"), null, "teammates choose their own preferences when identified");
  const admin = lib.readAdmin(root);
  assert.deepEqual(admin.team.map(p => p.handle), ["marta-nowak", "tomek-zielinski"]);
  assert.deepEqual(lib.readContext(root, "icp").tools, ["Attio (CRM)", "Gmail"]);
  assert.deepEqual(lib.readContext(root, "market").tools, ["PostHog"]);
  assert.match(lib.readContext(root, "icp").whenLoaded, /Read Attio live\./);
  assert.equal(admin.dashboard, "always", "the dashboard setting defaults to always");
  assert.equal(admin.dashboard_browser, undefined, "dashboard browser is not shared configuration");
  const od = mkdtempSync(join(tmpdir(), "gtm-os-od-")); execFileSync("git", ["init", "-q", od]);
  run(od, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "A B <a@b.c>", "--dashboard", "on-demand", "--dashboard-browser", "chrome");
  assert.equal(lib.readAdmin(od).dashboard, "on-demand");
  assert.equal(lib.readAdmin(od).dashboard_browser, undefined, "legacy setup option is ignored");
  assert.equal(admin.compile, undefined, "no compile setting: summaries always update by themselves"); assert.equal(lib.compileMode(root), "background");
  assert.equal(execFileSync("git", ["-C", root, "status", "--short"], { encoding: "utf8" }).trim(), "");
});

test("a batch is checked before the first write: one bad entry means nothing is kept and every position is named; a good batch is kept whole", () => {
  const bt = mkdtempSync(join(tmpdir(), "gtm-os-batch-")); execFileSync("git", ["init", "-q", bt]); execFileSync("git", ["-C", bt, "config", "commit.gpgsign", "false"]);
  run(bt, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  const slug = lib.listContexts(bt)[0].slug; const initial = lib.readMemories(bt, slug); const file = join(bt, "work", "b.json"); mkdirSync(join(bt, "work"), { recursive: true });
  writeFileSync(file, JSON.stringify([{ content: "First, fine.", context: slug }, { content: "Second \u2013 with a long dash.", context: slug }, { content: "Third, fine.", context: slug }]));
  assert.throws(() => run(bt, "remember", "remember.mjs", "--by", "ann", "--batch", file), /nothing remembered: #2 contains a long dash/);
  assert.deepEqual(lib.readMemories(bt, slug), initial, "nothing was written");
  writeFileSync(file, JSON.stringify([{ content: "First, fine.", context: slug }, { content: "Third, fine.", context: "no-such" }]));
  assert.throws(() => run(bt, "remember", "remember.mjs", "--by", "ann", "--batch", file), /nothing remembered: #2 no such context: no-such/);
  writeFileSync(file, JSON.stringify([{ content: "First, fine.", context: slug }, { content: "Third, fine.", context: slug, kind: "question" }]));
  const out = execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--batch", file], { cwd: bt, encoding: "utf8", env: { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_COMPILE: "1" } });
  assert.match(out, /^kept 2 of 2: m_[0-9a-f]+ in \S+, m_[0-9a-f]+ in \S+/); assert.equal(lib.readMemories(bt, slug).length, initial.length + 2);
});

test("a background run that keeps failing tries three times and then says it gave up", async () => {
  const gu = mkdtempSync(join(tmpdir(), "gtm-os-gaveup-")); execFileSync("git", ["init", "-q", gu]); execFileSync("git", ["-C", gu, "config", "commit.gpgsign", "false"]);
  run(gu, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  const slug = lib.listContexts(gu)[0].slug; lib.appendMemory(gu, slug, { authors: ["ann-lee"], content: "A note." });
  const bin = mkdtempSync(join(tmpdir(), "gtm-os-badcodex-")); writeFileSync(join(bin, "codex"), "#!/bin/sh\nexit 1\n"); execFileSync("chmod", ["755", join(bin, "codex")]);
  assert.throws(() => execFileSync("bash", [`${P}/scripts/gtm-os-compile/background-compile.sh`, "."], { cwd: gu, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PLUGIN_ROOT: P, GTM_OS_NO_COMPILE: "", GTM_OS_COMPILE_DELAY: "0", GTM_OS_COMPILE_RETRY: "0" } }), e => e.status === 1);
  const st = JSON.parse(readFileSync(join(gu, "work", "compile.json"), "utf8"));
  assert.equal(st.state, "failed"); assert.equal(st.attempt, 3); assert.equal(st.tries, 3);
  assert.ok(lib.compileGaveUp(gu), "gave up: the last attempt failed and a channel still waits");
  assert.equal(JSON.parse(readFileSync(join(gu, "work", "home", "data.json"), "utf8")).compile.gaveUp, true);
  assert.match(run(gu, "advisor", "advisor.mjs"), /gave up/);
});

test("the advisor ranks what the brain needs: failed or behind summaries first, old questions, tools, look-alikes, quiet channels, first names", () => {
  const ad = mkdtempSync(join(tmpdir(), "gtm-os-adv-")); execFileSync("git", ["init", "-q", ad]); execFileSync("git", ["-C", ad, "config", "commit.gpgsign", "false"]);
  run(ad, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>", "--tools", "Attio (CRM), Gmail");
  const [a, b] = lib.listContexts(ad).map(c => c.slug);
  const old = new Date(Date.now() - 40 * 86400000).toISOString();
  lib.appendMemory(ad, a, { authors: ["ann-lee"], kind: "question", tags: ["brain-question"], content: "Which conflicting committee record should we keep?", at: old });
  lib.appendMemory(ad, a, { authors: ["ann-lee"], content: "Met Bo in Warsaw.", people: ["Bo"], at: old });
  lib.appendMemory(ad, a, { authors: ["ann-lee"], content: "Second note.", at: old });
  lib.addName(ad, "Bo"); lib.addName(ad, "Nestle", { kind: "company" }); lib.addName(ad, "Nestle Poland", { kind: "company" });
  const j = JSON.parse(run(ad, "advisor", "advisor.mjs", "--json"));
  const keys = j.findings.map(f => f.key);
  for (const k of ["behind", "old-question", "tool-unchecked", "look-alike", "quiet", "first-name"]) assert.ok(keys.includes(k), k + " in " + keys.join(","));
  assert.ok(!keys.includes("never-compiled"), "a channel without a summary is one finding, not two");
  assert.match(j.findings.find(f => f.key === "behind").do, /^Nothing/, "a stalled summary is the machine's job: the advisor restarts the run, the person does nothing");
  assert.ok(keys.indexOf("old-question") < keys.indexOf("quiet"), "an old question outranks a quiet channel");
  const out = run(ad, "advisor", "advisor.mjs");
  assert.match(out, /Three things worth doing:\n1\. /); assert.match(out, /This week: /); assert.match(out, /Bo/);
  const fresh = mkdtempSync(join(tmpdir(), "gtm-os-adv2-")); execFileSync("git", ["init", "-q", fresh]);
  run(fresh, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>", "--tools", "Attio, Gmail, Slack, Wispr Flow, Linear, Notion");
  assert.match(run(fresh, "advisor", "advisor.mjs"), /Attio, Gmail, Slack, Wispr Flow, Linear, Notion are in the workplace info but were never checked/, "tools listed and never checked are one finding");
  // every state connect can record gets a finding of its own kind; a personal context is never a quiet or empty one
  const [c0] = lib.listContexts(fresh).map(c => c.slug); const personalSlug = lib.listContexts(fresh).find(c => /^personal-/.test(c.slug)).slug;
  mkdirSync(join(fresh, "work"), { recursive: true });
  writeFileSync(join(fresh, "work", "tools.json"), JSON.stringify({ attio: { tool: "Attio", status: "installed, disabled" }, gmail: { tool: "Gmail", status: "not available (disabled by your workspace admin)" }, slack: { tool: "Slack", status: "no official plugin" }, "wispr flow": { tool: "Wispr Flow", status: "not checked (codex plugin list failed)" }, linear: { tool: "Linear", status: "installed", test: "fail", note: "not signed in" }, notion: { tool: "Notion", status: "installed", test: "ok" } }));
  const j2 = JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-os-advisor/advisor.mjs`, ".", "--json"], { cwd: fresh, encoding: "utf8", env: { ...process.env, GTM_OS_NOW: new Date(Date.now() + 20 * 86400000).toISOString() } }));
  const k2 = j2.findings.map(f => f.key);
  for (const k of ["tool-disabled", "tool-blocked", "tool-manual", "tool-unchecked", "tool-failing"]) assert.ok(k2.includes(k), k + " in " + k2.join(","));
  assert.ok(!k2.includes("empty") || !j2.findings.some(f => f.key === "empty" && f.what.includes(personalSlug)), "no archive advice for a personal context: " + JSON.stringify(j2.findings.filter(f => f.key === "empty")));
  // three fresh notes are the background run's job, not a finding; a two-day-old backlog with nothing running is
  for (let i = 0; i < 3; i++) lib.appendMemory(fresh, c0, { authors: ["ann-lee"], content: `Fresh note ${i}.` });
  assert.ok(!JSON.parse(run(fresh, "advisor", "advisor.mjs", "--json")).findings.some(f => f.key === "behind"), "fresh notes wait for the run");
  const j3 = JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-os-advisor/advisor.mjs`, ".", "--json"], { cwd: fresh, encoding: "utf8", env: { ...process.env, GTM_OS_NOW: new Date(Date.now() + 2 * 86400000).toISOString() } }));
  assert.ok(j3.findings.some(f => f.key === "behind"), "two days later with no run it is a finding");
  // a recorded failure is not a finding once nothing is behind any more
  writeFileSync(join(fresh, "work", "compile.json"), JSON.stringify({ state: "failed", at: new Date().toISOString(), contexts: c0, attempt: 3, tries: 3 }));
  const k = lib.snapshotKey ? null : null; run(fresh, "compile", "compile.mjs", "--apply", c0, "--by", "ann", "--as-of", run(fresh, "compile", "compile.mjs", "--facts", c0).match(/as_of: (s_[0-9a-f]+)/)[1], "--summary", "Fresh notes.", "--now", "Go.");
  assert.ok(!JSON.parse(run(fresh, "advisor", "advisor.mjs", "--json")).findings.some(f => f.key === "summary-failed"), "a failure that was recovered by hand is no finding");
});

test("a context's title and rule can be edited; summary and Now are kept", () => {
  const ed = mkdtempSync(join(tmpdir(), "gtm-os-edit-")); execFileSync("git", ["init", "-q", ed]); execFileSync("git", ["-C", ed, "config", "commit.gpgsign", "false"]);
  run(ed, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  const slug = lib.listContexts(ed)[0].slug;
  assert.match(run(ed, "contexts", "contexts.mjs", "--edit", slug, "--title", "Deals", "--rule", "Read the CRM live. Never offer a discount in writing."), new RegExp(`edited ${slug}: title, rule`));
  const c = lib.readContext(ed, slug); assert.equal(c.title, "Deals"); assert.match(c.rule, /Never offer a discount/); assert.equal(c.slug, slug);
  assert.throws(() => run(ed, "contexts", "contexts.mjs", "--edit", slug), /nothing to change/);
  assert.throws(() => run(ed, "contexts", "contexts.mjs", "--edit", slug, "--rule", "Deals \u2013 not campaigns"), /long dash/);
  assert.match(execFileSync("git", ["-C", ed, "log", "-1", "--format=%s"], { encoding: "utf8" }), new RegExp(`context: edit ${slug} \\(title, rule\\)`));
});

test("load adds to the set; --only replaces; --drop removes one; --clear empties", () => {
  run(root, "load", "load.mjs", "icp"); assert.deepEqual(lib.readLoaded(root), ["icp"]);
  run(root, "load", "load.mjs", "market"); assert.deepEqual(lib.readLoaded(root), ["icp", "market"]);
  assert.match(run(root, "load", "load.mjs", "--drop", "market"), /unloaded market\. Loaded now: admin \+ icp/); assert.deepEqual(lib.readLoaded(root), ["icp"]);
  run(root, "load", "load.mjs", "market");
  run(root, "load", "load.mjs", "company", "--only"); assert.deepEqual(lib.readLoaded(root), ["company"]);
  run(root, "load", "load.mjs", "--clear"); assert.deepEqual(lib.readLoaded(root), []);
});

test("remember infers the single loaded context, normalises people, commits, and refuses non-members", () => {
  run(root, "load", "load.mjs", "icp", "--only");
  const out = run(root, "remember", "remember.mjs", "--by", "marta", "--kind", "decision", "--people", "Pierre Aubert", "--tools", "attio", "--content", "No discount for Bergstrom.");
  assert.match(out, /remembered m_[0-9a-f]{12} in icp · decision · marta-nowak · people: Pierre Aubert/);
  assert.match(out, /new person in entities\/: Pierre Aubert/);
  assert.match(out, /^kept$/m);
  assert.throws(() => run(root, "remember", "remember.mjs", "--by", "stranger", "--content", "x"), /not in admin.md team/);
  const log = execFileSync("git", ["-C", root, "log", "--format=%s", "-1"], { encoding: "utf8" }).trim();
  assert.equal(log, "remember: icp decision by marta-nowak");
});


test("the pre-commit hook is append-only: a changed or removed record is refused, an appended one passes", () => {
  const f = join(root, "brain", "contexts", "icp", "memories.jsonl");
  const committed = readFileSync(f, "utf8"); const [line] = committed.trim().split("\n");
  const tryCommit = (text, msg) => { execFileSync("node", ["-e", "require('fs').writeFileSync(process.argv[1], process.argv[2])", f, text]); execFileSync("git", ["-C", root, "add", "brain/contexts/icp/memories.jsonl"]); return () => execFileSync("git", ["-C", root, "commit", "-q", "-m", msg], { stdio: "pipe" }); };
  assert.throws(tryCommit(committed.replace("No discount", "Big discount"), "edit"), /was changed; memories are append-only/);
  assert.throws(tryCommit("", "wipe"), /removed; memories are append-only/);
  const rec = { ...JSON.parse(line), id: "m_00000000feed", content: "Appended later." };
  tryCommit(committed + JSON.stringify(rec) + "\n", "append")();
  execFileSync("git", ["-C", root, "reset", "-q", "--hard", "HEAD~1"]);
});

test("the pre-commit hook rejects an invalid memories file", () => {
  const f = join(root, "brain", "contexts", "company", "memories.jsonl");
  execFileSync("node", ["-e", `require("fs").appendFileSync(process.argv[1], '{"bad":1}\\n')`, f]);
  execFileSync("git", ["-C", root, "add", "brain/contexts/company/memories.jsonl"]);
  assert.throws(() => execFileSync("git", ["-C", root, "commit", "-q", "-m", "bad"], { stdio: "pipe" }), /is not valid/);
  execFileSync("git", ["-C", root, "reset", "-q", "--hard"]);
});

test("compile refuses to apply prose written from facts a newer memory has overtaken", () => {
  const facts = run(root, "compile", "compile.mjs", "--facts", "icp");
  const asOf = facts.match(/^as_of: (\S+)/m)[1];
  assert.equal(asOf, lib.compileSnapshot(root, "icp"));
  run(root, "remember", "remember.mjs", "--by", "marta", "--content", "Pierre wants a three-year TCO.");
  assert.throws(() => run(root, "compile", "compile.mjs", "--apply", "icp", "--by", "tomek", "--as-of", asOf, "--summary", "Old.", "--now", "Old."), /not applied: icp changed since --facts/);
  assert.equal(lib.readContext(root, "icp").stale, true, "still stale");
  assert.throws(() => run(root, "compile", "compile.mjs", "--apply", "icp", "--by", "tomek", "--summary", "x", "--now", "y"), /needs --by, --as-of/);
});

test("compile keeps the standing rule, sets Now, unions tools, and commits", () => {
  const asOf = lib.compileSnapshot(root, "icp");
  const out = run(root, "compile", "compile.mjs", "--apply", "icp", "--by", "tomek", "--as-of", asOf, "--summary", "One decision: no discount for Bergstrom.", "--now", "Hold the price.");
  assert.match(out, /compiled icp: 2 memories, people 1, names 1, tools 2, .* kept/);
  const c = lib.readContext(root, "icp");
  assert.match(c.whenLoaded, /^Read Attio live\./);
  assert.match(c.whenLoaded, /Working guidance: Hold the price\.$/);
  assert.deepEqual(c.tools, ["Attio (CRM)", "Gmail"], "attio from a memory is the same tool as Attio (CRM) from admin");
  assert.equal(c.stale, false);
  assert.equal(c.fm.compiled_by, "compile@tomek-zielinski");
});

test("fork copies matching memories with a source pointing at the origin; recall counts them once", () => {
  const out = run(root, "contexts", "contexts.mjs", "--fork", "icp", "bergstrom", "Bergstrom Home", "--filter", "bergstrom");
  assert.match(out, /forked icp -> bergstrom: 1 of 2 memories copied/);
  const [copy] = lib.readMemories(root, "bergstrom"); const [origin] = lib.readMemories(root, "icp");
  assert.deepEqual(copy.tags, ["forked:icp"]); assert.deepEqual(copy.source, [{ kind: "memory", ref: origin.id }]);
  assert.deepEqual(lib.readLoaded(root), ["icp", "bergstrom"], "a fork loads itself in addition");
  assert.match(run(root, "recall", "recall.mjs", "Bergstrom"), /^1 memories match/);
});

test("render builds the dashboard from the files", () => {
  const out = run(root, "render", "render.mjs");
  assert.match(out, /rendered work\/home\/index.html · 7 contexts \(2 behind\) · 3 memories · 0 open questions · 3 people/);
  const data = JSON.parse(readFileSync(join(root, "work", "home", "data.json"), "utf8"));
  const html = readFileSync(join(root, "work", "home", "index.html"), "utf8");
  assert.match(html, /show\(v\)\}\)\(\);/, "the page switches a view on at load, even with nothing remembered in sessionStorage");
  assert.equal(data.decisions.length, 1, "the forked copy is not counted twice"); assert.deepEqual(data.loaded, ["icp", "bergstrom"]);
  assert.equal(data.admin.dashboardBrowser, undefined);
  assert.equal(data.contexts.find(c => c.slug === "bergstrom").stale, true, "a fresh fork is stale until compiled");
});

test("archive sets the cover status, unloads, hides from the list, keeps memories searchable; unarchive restores", () => {
  run(root, "load", "load.mjs", "market");
  const out = run(root, "contexts", "contexts.mjs", "--archive", "market");
  assert.match(out, /market archived \(unloaded/); assert.ok(!lib.readLoaded(root).includes("market"));
  assert.equal(lib.readContext(root, "market").status, "archived");
  const listed = run(root, "contexts", "contexts.mjs"); assert.doesNotMatch(listed, /^• market/m); assert.match(listed, /archived \(searchable, not offered\): market/);
  assert.match(run(root, "load", "load.mjs", "market"), /market is archived/);
  assert.match(run(root, "contexts", "contexts.mjs", "--unarchive", "market"), /market active again/);
  assert.equal(lib.readContext(root, "market").status, "active");
  assert.match(lib.readContext(root, "market").whenLoaded, /\S/, "the standing rule survived the round trip");
});

test("load --last 0 keeps the cover and what is new, drops the memories list", () => {
  const full = run(root, "load", "load.mjs", "icp", "--only");
  const brief = run(root, "load", "load.mjs", "icp", "--only", "--last", "0");
  assert.match(full, /## Last \d+ of \d+ memories/); assert.doesNotMatch(brief, /## Last \d+ of/);
  assert.match(brief, /## When loaded/); assert.match(brief, /memories; call load_context or recall/);
});

test("activity log round-trips and unsaved changes list what save would commit", () => {
  lib.logActivity(root, "codex", "Remembering: remembered m_abc in icp\nsecond line ignored");
  const a = lib.readActivity(root, 1)[0];
  assert.equal(a.kind, "codex"); assert.equal(a.text, "Remembering: remembered m_abc in icp"); assert.match(a.at, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  assert.deepEqual(lib.unsavedChanges(root).filter(u => u.path.includes("scratch")), []);
  writeFileSync(join(root, "brain", "scratch.md"), "x"); writeFileSync(join(root, "work", "ignored.txt"), "x");
  const u = lib.unsavedChanges(root);
  assert.ok(u.some(x => x.path === "brain/scratch.md"), JSON.stringify(u)); assert.ok(!u.some(x => x.path.startsWith("work/")));
  execFileSync("rm", [join(root, "brain", "scratch.md")]);
});

test("a standing rule that contains a Now: line survives archive and unarchive unchanged", () => {
  run(root, "contexts", "contexts.mjs", "--new", "launch", "Launch", "Now: is not the time to discount.\nNever promise a date.");
  const before = lib.readContext(root, "launch");
  run(root, "contexts", "contexts.mjs", "--archive", "launch"); run(root, "contexts", "contexts.mjs", "--unarchive", "launch");
  const after = lib.readContext(root, "launch");
  assert.equal(after.rule, before.rule); assert.equal(after.now, before.now); assert.equal(after.whenLoaded, before.whenLoaded);
});

test("an archived context is never listed as behind, and the scheduled scope commits covers only", () => {
  const behind = () => JSON.parse(run(root, "compile", "compile.mjs", "--stale")).map(c => c.slug);
  assert.ok(behind().includes("bergstrom"), "the fork has memories and no compile yet");
  run(root, "contexts", "contexts.mjs", "--archive", "bergstrom");
  assert.ok(!behind().includes("bergstrom"), "archived contexts are not compiled");
  run(root, "contexts", "contexts.mjs", "--unarchive", "bergstrom");
  execFileSync("git", ["-C", root, "add", "-A"]); execFileSync("git", ["-C", root, "-c", "commit.gpgsign=false", "commit", "-qm", "baseline", "--allow-empty"]);
  lib.appendMemory(root, "icp", { authors: ["marta-nowak"], content: "Uncommitted note.", people: [], tools: [] });
  const cover = join(root, "brain", "contexts", "icp", "context.md"); writeFileSync(cover, readFileSync(cover, "utf8") + "\n");
  const r = lib.save(root, "scheduled: compile icp", { covers: true });
  assert.ok(r.ok, r.note); assert.deepEqual(r.files.map(f => f.path), ["brain/contexts/icp/context.md"]);
  assert.match(execFileSync("git", ["-C", root, "status", "--short"], { encoding: "utf8" }), /memories\.jsonl/, "the memory is left for the person's save");
});

test("a memory added right after a compile is seen; a retraction changes the compile key", () => {
  run(root, "load", "load.mjs", "company", "--only");
  run(root, "remember", "remember.mjs", "--by", "marta", "--content", "First company note.");
  const f1 = run(root, "compile", "compile.mjs", "--facts", "company"); const k1 = f1.match(/^as_of: (\S+)/m)[1];
  run(root, "compile", "compile.mjs", "--apply", "company", "--by", "marta", "--as-of", k1, "--summary", "One note.", "--now", "Nothing.");
  assert.equal(lib.readContext(root, "company").stale, false);
  const r = run(root, "remember", "remember.mjs", "--by", "marta", "--content", "Second company note, same minute.");
  assert.equal(lib.readContext(root, "company").stale, true, "seconds and milliseconds count");
  const id = r.match(/remembered (m_[0-9a-f]{12})/)[1];
  const k2 = run(root, "compile", "compile.mjs", "--facts", "company").match(/^as_of: (\S+)/m)[1];
  run(root, "remember", "remember.mjs", "--by", "marta", "--content", "Withdrawn: it was a test.", "--retracts", id);
  const k3 = run(root, "compile", "compile.mjs", "--facts", "company").match(/^as_of: (\S+)/m)[1];
  assert.notEqual(k2, k3, "retracting an older memory changes the key");
  assert.throws(() => run(root, "compile", "compile.mjs", "--apply", "company", "--by", "marta", "--as-of", k2, "--summary", "Stale prose.", "--now", "x"), /not applied: company changed/);
});

test("the pre-commit hook refuses a deleted memories file and a record in the wrong folder", () => {
  const f = "brain/contexts/company/memories.jsonl";
  execFileSync("git", ["-C", root, "add", "-A"]); execFileSync("git", ["-C", root, "-c", "commit.gpgsign=false", "commit", "-qm", "before hook checks"]);
  execFileSync("git", ["-C", root, "rm", "-q", f]);
  assert.throws(() => execFileSync("git", ["-C", root, "-c", "commit.gpgsign=false", "commit", "-qm", "delete"], { stdio: "pipe" }), /deleted or renamed memories file is refused/);
  execFileSync("git", ["-C", root, "reset", "-q", "--hard", "HEAD"]);
  const wrong = { ...JSON.parse(readFileSync(join(root, f), "utf8").trim().split("\n")[0]), id: "m_0000000bad00", context: "icp", content: "Filed in the wrong folder." };
  writeFileSync(join(root, f), readFileSync(join(root, f), "utf8") + JSON.stringify(wrong) + "\n");
  execFileSync("git", ["-C", root, "add", f]);
  assert.throws(() => execFileSync("git", ["-C", root, "-c", "commit.gpgsign=false", "commit", "-qm", "wrong folder"], { stdio: "pipe" }), /context is "icp" but the file is in company/);
  execFileSync("git", ["-C", root, "reset", "-q", "--hard", "HEAD"]);
});

test("the dashboard page escapes a memory that tries to close the script tag", () => {
  run(root, "load", "load.mjs", "company", "--only");
  run(root, "remember", "remember.mjs", "--by", "marta", "--content", "Note with </SCRIPT><script>alert(1)</script> inside.");
  run(root, "render", "render.mjs");
  const html = readFileSync(join(root, "work", "home", "index.html"), "utf8");
  assert.ok(!/<\/SCRIPT>/i.test(html.split('<script id="data"')[1].split("</script>")[0]), "no closing tag inside the data block");
});

test("a legacy company kind is listed as an organization with its company subtype", () => {
  assert.match(run(root, "entities", "entities.mjs", "--add", "Telli", "--kind", "company"), /^Telli \(organization: company\)/);
  const out = run(root, "entities", "entities.mjs");
  assert.match(out, /\nOrganizations \(1\)\n- Telli \(company\)/); assert.doesNotMatch(out, /Telli.*no email/);
  assert.equal(lib.canonicalName(lib.readNames(root), "telli"), "Telli", "still resolves as a name");
});

test("the cover carries the names it is about, with kinds; action is no longer a kind", () => {
  run(root, "load", "load.mjs", "company", "--only");
  run(root, "remember", "remember.mjs", "--by", "marta", "--content", "Telli wants a pilot; Pierre Aubert will sponsor it.", "--people", "Telli, Pierre Aubert");
  const k = run(root, "compile", "compile.mjs", "--facts", "company").match(/^as_of: (\S+)/m)[1];
  run(root, "compile", "compile.mjs", "--apply", "company", "--by", "marta", "--as-of", k, "--summary", "Telli pilot in the works.", "--now", "Watch the pilot.");
  const c = lib.readContext(root, "company");
  assert.ok(c.names.some(n => n.name === "Telli" && n.kind === "organization"), JSON.stringify(c.names));
  assert.ok(c.names.some(n => n.name === "Pierre Aubert" && n.kind === "person"));
  assert.deepEqual(c.people, c.names.filter(n => n.kind === "person").map(n => n.name), "people stays the persons, for older readers");
  assert.throws(() => run(root, "remember", "remember.mjs", "--by", "marta", "--kind", "action", "--content", "x"), /no longer a kind/);
});

test("connect matches tools against the live catalog: by id, by display name, short forms, prefix; never a table", () => {
  const cr = mkdtempSync(join(tmpdir(), "gtm-os-connect-")); execFileSync("git", ["init", "-q", cr]);
  run(cr, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "A B <a@b.c>", "--tools", "Gmail, Wispr Flow, Granola, Calendar, Apollo, Todoist, Fax machine, Salesforce");
  const bin = mkdtempSync(join(tmpdir(), "gtm-os-cbin-")); const cat = mkdtempSync(join(tmpdir(), "gtm-os-cat-"));
  writeFileSync(join(bin, "codex"), `#!/bin/sh\ncat <<'L'\nMarketplace \`openai-bundled\`\nbrowser@openai-bundled            installed, enabled  1.0  x\nMarketplace \`openai-curated-remote\`\ngmail@openai-curated-remote       installed, enabled  0.1.10  x\ngranola@openai-curated-remote     not installed       1.0.0   x\nlinear@openai-curated-remote      installed, enabled  5.0.1   x\ngithub@openai-curated-remote      installed, enabled  0.1     x\nplugin-management@openai-curated-remote installed, enabled 0.1 x\nL\n`); execFileSync("chmod", ["755", join(bin, "codex")]);
  writeFileSync(join(cat, "abc.json"), JSON.stringify({ schema_version: 1, fetched_at: "2026-09-05T09:21:24Z", plugins: [
    { name: "gmail", installation_policy: "AVAILABLE", release: { display_name: "Gmail" } }, { name: "granola", installation_policy: "AVAILABLE", release: { display_name: "Granola" } },
    { name: "app-6a5ae9736be0819199d06d61ac171080", installation_policy: "AVAILABLE", release: { display_name: "Wispr Flow" } },
    { name: "google-calendar", installation_policy: "AVAILABLE", release: { display_name: "Google Calendar" } }, { name: "outlook-calendar", installation_policy: "AVAILABLE", release: { display_name: "Outlook Calendar" } },
    { name: "apollo", installation_policy: "AVAILABLE", release: { display_name: "Apollo.io" } }, { name: "app-1", installation_policy: "AVAILABLE", release: { display_name: "Apollo Space Program" } },
    { name: "app-3", installation_policy: "AVAILABLE", release: { display_name: "Todoist: To Do List & Calendar" } }, { name: "app-4", installation_policy: "AVAILABLE", release: { display_name: "Todoist Helper" } },
    { name: "linear", installation_policy: "AVAILABLE", release: { display_name: "Linear" } }, { name: "app-2", installation_policy: "AVAILABLE", release: { display_name: "LINEAR" } },
    { name: "salesforce", installation_policy: "NOT_AVAILABLE", status: "DISABLED_BY_ADMIN", release: { display_name: "Salesforce" } },
    { name: "plugin-management", installation_policy: "INSTALLED_BY_DEFAULT", release: { display_name: "Plugin Management" } }, { name: "github", installation_policy: "AVAILABLE", release: { display_name: "GitHub" } } ] }));
  const out = execFileSync(process.execPath, [`${P}/scripts/gtm-os-connect/connect.mjs`, ".", "--check"], { cwd: cr, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GTM_OS_CATALOG_DIR: cat } });
  assert.ok(out.includes(`catalog as of ${lib.localDateTime("2026-09-05T09:21:24Z")}`));
  assert.match(out, /- Gmail\s+installed/); assert.match(out, /- Granola\s+available, not installed/);
  assert.match(out, /- Wispr Flow\s+available, not installed\s+install: codex plugin add app-6a5ae9736be0819199d06d61ac171080@openai-curated-remote/, "display name resolves to the app id");
  assert.match(out, /- Calendar\s+available, not installed[^\n]*plugin "Google Calendar"/, "a short form");
  assert.match(out, /- Apollo\s+available, not installed[^\n]*plugin "Apollo.io"\n\s+install: [^\n]*\n- Todoist/, "an exact id wins outright, nothing else named");
  assert.match(out, /- Todoist\s+available, not installed[^\n]*plugin "Todoist: To Do List & Calendar"\n[^\n]*\n\s+also matches: "Todoist Helper" \(app-4\)/, "prefix match: the app whose own name is the tool first, the rest named");
  assert.match(out, /- Fax machine\s+no official plugin/); assert.match(out, /- Salesforce\s+not available \(disabled by your workspace admin\)/);
  assert.match(out, /installed in Codex but not in admin.md tools: Linear\./, "defaults and developer plugins are not offered");
  const st = JSON.parse(readFileSync(join(cr, "work", "tools.json"), "utf8"));
  assert.equal(st["wispr flow"].plugin, "app-6a5ae9736be0819199d06d61ac171080"); assert.equal(st["wispr flow"].display, "Wispr Flow"); assert.equal(st.gmail.status, "installed");
  // the read test stands, then `codex plugin list` fails: the last known state is kept and said to be old, nothing becomes "not installed"
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-connect/connect.mjs`, ".", "--mark", "gmail", "ok", "3 subjects"], { cwd: cr });
  const broken = mkdtempSync(join(tmpdir(), "gtm-os-cbroken-")); writeFileSync(join(broken, "codex"), "#!/bin/sh\nexit 1\n"); execFileSync("chmod", ["755", join(broken, "codex")]);
  const again = execFileSync(process.execPath, [`${P}/scripts/gtm-os-connect/connect.mjs`, ".", "--check"], { cwd: cr, encoding: "utf8", env: { ...process.env, PATH: `${broken}:${process.env.PATH}`, GTM_OS_CATALOG_DIR: cat } });
  assert.match(again, /codex plugin list failed: install state as last checked/);
  assert.match(again, /- Gmail\s+installed\s+\(as of 20\d\d-[^)]+\)\s+read test: ok \(3 subjects\)/); assert.match(again, /- Granola\s+available, not installed\s+\(as of/);
  assert.doesNotMatch(again, /- Gmail\s+available/);
  assert.equal(JSON.parse(readFileSync(join(cr, "work", "tools.json"), "utf8")).gmail.status, "installed");
});

test("the floor: HubSpot is suggested as the CRM before anyone names one, Attio when it is the one installed; a decline sticks and the advisor stops", () => {
  const cr = mkdtempSync(join(tmpdir(), "gtm-os-crm-")); execFileSync("git", ["init", "-q", cr]);
  run(cr, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "A B <a@b.c>", "--tools", "Gmail");
  const cat = mkdtempSync(join(tmpdir(), "gtm-os-crmcat-"));
  writeFileSync(join(cat, "abc.json"), JSON.stringify({ schema_version: 1, fetched_at: "2026-09-07T09:00:00Z", plugins: [
    { name: "gmail", installation_policy: "AVAILABLE", release: { display_name: "Gmail" } }, { name: "google-calendar", installation_policy: "AVAILABLE", release: { display_name: "Google Calendar" } },
    { name: "hubspot", installation_policy: "AVAILABLE", release: { display_name: "HubSpot" } }, { name: "attio", installation_policy: "AVAILABLE", release: { display_name: "Attio" } } ] }));
  const fake = (lines) => { const bin = mkdtempSync(join(tmpdir(), "gtm-os-crmbin-")); writeFileSync(join(bin, "codex"), `#!/bin/sh\ncat <<'L'\nMarketplace \`openai-curated-remote\`\n${lines}\nL\n`); execFileSync("chmod", ["755", join(bin, "codex")]); return bin; };
  const check = (bin, ...args) => execFileSync(process.execPath, [`${P}/scripts/gtm-os-connect/connect.mjs`, ".", ...(args.length ? args : ["--check"])], { cwd: cr, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GTM_OS_CATALOG_DIR: cat } });
  const none = fake("gmail@openai-curated-remote       installed, enabled  0.1  x");
  let out = check(none);
  assert.match(out, /suggested \(the CRM: the course gives you HubSpot; say so if yours is Attio, not yet in admin.md\): HubSpot  available, not installed\n\s+install: codex plugin add hubspot@openai-curated-remote/, "HubSpot first: the course gives it to every participant");
  assert.doesNotMatch(out, /: Attio  /, "one CRM suggestion, not two");
  assert.match(out, /suggested[^\n]*: Google Calendar/, "the rest of the floor still there");
  let st = JSON.parse(readFileSync(join(cr, "work", "tools.json"), "utf8")); assert.equal(st.hubspot.suggested, true); assert.equal(st.hubspot.status, "available, not installed");
  const adv = () => JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-os-advisor/advisor.mjs`, ".", "--json"], { cwd: cr, encoding: "utf8" })).findings;
  const f = adv().find(x => x.key === "tool-suggested" && /HubSpot/.test(x.what)); assert.ok(f, "the advisor names the missing CRM"); assert.match(f.what, /Google Calendar, HubSpot are not connected yet .*HubSpot is the CRM the course gives you, Attio works too/, "grouped with the rest of the floor, the CRM still explained"); assert.match(f.do, /connect my tools/);
  // Attio installed: it is the CRM, HubSpot is not pushed on top of it
  const attio = fake("gmail@openai-curated-remote       installed, enabled  0.1  x\nattio@openai-curated-remote       installed, enabled  1.0  x");
  out = check(attio); assert.match(out, /suggested[^\n]*: Attio  installed/); assert.doesNotMatch(out, /HubSpot/, "an installed CRM ends the HubSpot suggestion");
  st = JSON.parse(readFileSync(join(cr, "work", "tools.json"), "utf8")); assert.ok(!st.hubspot, "the record follows the suggestion"); assert.ok(!adv().some(x => x.key === "tool-suggested" && /Attio/.test(x.what)), "installed is not a finding");
  // named in admin.md: no suggestion at all, the admin tool row carries it
  writeFileSync(join(cr, "brain", "admin.md"), readFileSync(join(cr, "brain", "admin.md"), "utf8").replace(/^tools: .*$/m, "tools: [Gmail, Pipedrive]"));
  out = check(none); assert.match(out, /- Pipedrive\s+no official plugin/); assert.doesNotMatch(out, /suggested[^\n]*(HubSpot|Attio)/, "a named CRM, even one without a plugin, covers the floor");
  writeFileSync(join(cr, "brain", "admin.md"), readFileSync(join(cr, "brain", "admin.md"), "utf8").replace(/^tools: .*$/m, "tools: [Gmail]"));
  // declined: the record keeps it across checks, the check says so, the advisor is quiet, the page does not offer it
  assert.match(check(none, "--skip", "HubSpot"), /HubSpot: declined; not offered again/);
  out = check(none); assert.match(out, /declined earlier: HubSpot \(not offered again unless they ask\)/); assert.doesNotMatch(out, /suggested[^\n]*HubSpot/);
  st = JSON.parse(readFileSync(join(cr, "work", "tools.json"), "utf8")); assert.equal(st.hubspot.declined, true); assert.equal(st.hubspot.status, "available, not installed");
  assert.ok(!adv().some(x => x.key === "tool-suggested" && /HubSpot/.test(x.what)), "a decline is never nagged");
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-render/render.mjs`, "."], { cwd: cr, env: { ...process.env, GTM_OS_NO_OPEN: "1" } });
  const data = JSON.parse(readFileSync(join(cr, "work", "home", "data.json"), "utf8"));
  const hs = data.tools.find(t => t.tool === "HubSpot"); assert.equal(hs.declined, true); assert.equal(hs.suggested, true);
  const html = readFileSync(join(cr, "work", "home", "index.html"), "utf8");
  assert.doesNotMatch(html, /data-say=|ob-connect|gapTools/, "the viewer offers no tool installation controls");
});

test("a brain with the old names.md keeps working; the first write and the upgrade rename it to entities.md", () => {
  const ob = mkdtempSync(join(tmpdir(), "gtm-os-old-")); execFileSync("git", ["init", "-q", ob]); execFileSync("git", ["-C", ob, "config", "commit.gpgsign", "false"]);
  run(ob, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  rmSync(join(ob, "brain", "entities"), { recursive: true }); writeFileSync(join(ob, "brain", "names.md"), "# Names\n\n- Ann Lee | aliases: ann | emails: ann@x.io\n"); execFileSync("git", ["-C", ob, "add", "brain"]); execFileSync("git", ["-C", ob, "commit", "-qm", "old layout"]);
  assert.equal(lib.canonicalName(lib.readNames(ob), "ann"), "Ann Lee", "read from names.md");
  run(ob, "load", "load.mjs", "icp", "--only");
  assert.match(run(ob, "remember", "remember.mjs", "--by", "ann", "--people", "Bo Chan", "--content", "Met Bo."), /kept/);
  assert.ok(existsSync(join(ob, "brain", "entities")) && !existsSync(join(ob, "brain", "names.md")), "renamed on the first write");
  assert.equal(execFileSync("git", ["-C", ob, "status", "--short"], { encoding: "utf8" }).trim(), "", "the rename and the note are committed together");
  assert.equal(lib.resolveEntity(lib.readNames(ob), "Bo Chan").name, "Bo Chan");
  const ob2 = mkdtempSync(join(tmpdir(), "gtm-os-old2-")); execFileSync("git", ["init", "-q", ob2]); execFileSync("git", ["-C", ob2, "config", "commit.gpgsign", "false"]);
  run(ob2, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  rmSync(join(ob2, "brain", "entities"), { recursive: true }); writeFileSync(join(ob2, "brain", "names.md"), "# Names\n\n- Ann Lee | aliases: ann | emails: ann@x.io\n"); execFileSync("git", ["-C", ob2, "add", "brain"]); execFileSync("git", ["-C", ob2, "commit", "-qm", "old layout"]);
  assert.match(run(ob2, "upgrade", "upgrade.sh", ob2), /migrated entity identities and kinds/);
  assert.ok(existsSync(join(ob2, "brain", "entities")) && !existsSync(join(ob2, "brain", "names.md")));
  assert.equal(execFileSync("git", ["-C", ob2, "status", "--short"], { encoding: "utf8" }).trim(), "", "upgrade committed the rename");
});

test("remember holds a note whose name looks like a known one until the person answers", () => {
  const before = lib.readMemories(root, "icp").length;
  assert.throws(() => run(root, "remember", "remember.mjs", "--by", "marta", "--context", "icp", "--people", "Pierre Dupont", "--content", "Pierre Dupont joined the call."), /not remembered yet: "Pierre Dupont" may be Pierre Aubert\. Ask the person/);
  assert.ok(!lib.readNames(root).some(n => n.name === "Pierre Dupont"), "not in the registry"); assert.equal(lib.readMemories(root, "icp").length, before, "not written");
  const out = run(root, "remember", "remember.mjs", "--by", "marta", "--context", "icp", "--people", "Pierre Dupont", "--new", "Pierre Dupont", "--content", "Pierre Dupont joined the call.");
  assert.match(out, /people: Pierre Dupont/); assert.match(out, /new person in entities\/: Pierre Dupont/);
  const missed = run(root, "remember", "remember.mjs", "--by", "marta", "--context", "icp", "--people", "Pierre Dupont", "--content", "Pierre Dupont said Castorama will sign the NDA with ByteDance next Monday.");
  assert.match(missed, /names in this note not yet registered as entities: "Castorama", "ByteDance"\. For each that is a person, organization or product/);
  assert.match(run(root, "entities", "entities.mjs", "--add", "Pierre Martin"), /looks like Pierre Aubert, Pierre Dupont already in the registry/);
  run(root, "entities", "entities.mjs", "--add", "Nestle", "--kind", "company"); run(root, "entities", "entities.mjs", "--add", "Nestle Poland", "--kind", "company");
  assert.match(run(root, "entities", "entities.mjs"), /Might be the same: Nestle and Nestle Poland\. Ask the person; then "Nestle Poland is Nestle"/);
  run(root, "entities", "entities.mjs", "--add", "Nestle Poland", "--not", "Nestle");
  assert.doesNotMatch(run(root, "entities", "entities.mjs"), /Might be the same/);
});

test("compile: background: a note kicks a separate run that updates the summary and the page says updating meanwhile", async () => {
  const bg = mkdtempSync(join(tmpdir(), "gtm-os-bg-")); execFileSync("git", ["init", "-q", bg]); execFileSync("git", ["-C", bg, "config", "commit.gpgsign", "false"]);
  run(bg, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  settleSetup(bg);
  // A fake model compiles both entity evidence and the context through the real writers.
  const bin = mkdtempSync(join(tmpdir(), "gtm-os-fakecodex-"));
  writeFileSync(join(bin, "codex"), `#!${process.execPath}
const { execFileSync } = require("node:child_process");
const P = ${JSON.stringify(P)};
(async () => {
  if (process.argv[2] !== "exec") return;
  const lib = await import(P + "/lib/brain.mjs");
  const claims = memories => memories.filter(m => !m.retracts).map(m => ({ text: m.content, memories: [m.id] }));
  for (const entity of lib.staleEntities(".")) {
    const facts = lib.entityFacts(".", entity.id);
    lib.compileEntity(".", entity.id, { by: "background", as_of: facts.as_of, brief: {
      overview: claims(facts.evidence), relationships: [],
      contexts: facts.contexts.map(c => ({ context: c.context, summary: claims(c.memories), open_threads: [] }))
    } });
  }
  const script = P + "/scripts/gtm-os-compile/compile.mjs";
  const facts = execFileSync(process.execPath, [script, ".", "--facts", "icp"], { encoding: "utf8" });
  const key = facts.match(/^as_of: (\\S+)/m)[1];
  execFileSync(process.execPath, [script, ".", "--apply", "icp", "--by", "background", "--as-of", key, "--summary", "Bo is in.", "--now", "Call Bo."], { stdio: "ignore" });
})().catch(error => { console.error(error); process.exitCode = 1; });
`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PLUGIN_ROOT: P, GTM_OS_NO_COMPILE: "", GTM_OS_COMPILE_DELAY: "0" };
  run(bg, "load", "load.mjs", "icp", "--only");
  const out = execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--people", "Bo Chan", "--content", "Met Bo."], { cwd: bg, encoding: "utf8", env });
  assert.match(out, /the summaries update by themselves/); assert.doesNotMatch(out, /compile: auto/);
  const state = () => { try { return JSON.parse(readFileSync(join(bg, "work", "compile.json"), "utf8")); } catch { return null; } };
  const page = () => { try { return JSON.parse(readFileSync(join(bg, "work", "home", "data.json"), "utf8")).compile; } catch { return null; } };
  for (let i = 0; i < 150 && !(state() && state().state === "done" && page() && page().state === "done"); i++) await new Promise(r => setTimeout(r, 200));
  assert.equal(state().state, "done", JSON.stringify(state())); assert.equal(state().contexts, "icp");
  assert.equal(lib.readContext(bg, "icp").summary, "Bo is in.", "the separate run wrote the cover");
  assert.equal(lib.entityBrief(bg, "Bo Chan").stale, false, "the same run also compiled the entity brief");
  assert.match(execFileSync("git", ["-C", bg, "log", "-1", "--format=%s"], { encoding: "utf8" }), /^compile: icp \(1 memories, by background\)|^background: compile icp/);
  const data = JSON.parse(readFileSync(join(bg, "work", "home", "data.json"), "utf8"));
  assert.equal(data.compile.mode, "background"); assert.equal(data.compile.state, "done"); assert.ok(!data.contexts.find(c => c.slug === "icp").stale, "up to date on the page");
  assert.match(run(bg, "contexts", "contexts.mjs"), /Target customers \(icp\) · 1 memories · summary up to date/);
});

test("compilation exposes tool evidence and prior guidance, then reloads revised context guidance", () => {
  const isolated = mkdtempSync(join(tmpdir(), "gtm-os-tool-guidance-"));
  run(isolated, "setup", "setup.sh", "--company", "Reflow", "--one-liner", "Returns automation", "--owner", "Marta Nowak <marta@reflow.io>");
  const rule = lib.readContext(isolated, "icp").rule;
  const other = readFileSync(lib.readContext(isolated, "market").path, "utf8");
  const add = data => lib.appendMemory(isolated, "icp", { authors: ["marta-nowak"], ...data }).rec;
  const lesson = add({ tools: ["attio"], content: "Renewal dates use contract_end; close_date records the original sale.",
    source: [{ kind: "attio", ref: "schema/renewals-v1" }],
    actions: [{ tool: "attio", action: "inspected renewal fields", ref: "request/123" }] });
  const facts = () => run(isolated, "compile", "compile.mjs", "--facts", "icp");
  const apply = (f, now) => run(isolated, "compile", "compile.mjs", "--apply", "icp", "--by", "marta", "--as-of", f.match(/^as_of: (\S+)/m)[1], "--summary", "Renewal planning has a verified field mapping.", "--now", now);
  let f = facts();
  assert.ok(f.includes(lesson.id));
  assert.ok(f.includes("attio:schema/renewals-v1"));
  assert.ok(f.includes("request/123"));
  const guidance = `For renewals use contract_end; close_date describes the sale (${lesson.id}). Keep this mapping scoped to renewal planning.`;
  apply(f, guidance);
  assert.equal(lib.readContext(isolated, "icp").now, guidance);
  assert.ok(run(isolated, "load", "load.mjs", "icp", "--last", "0").includes(guidance));
  add({ content: "Acme's renewal owner is confirmed." });
  f = facts();
  assert.ok(f.includes(guidance), "prior guidance is available for reassessment");
  assert.ok(f.split("## All effective memories, recording order (oldest first)")[1].includes(lesson.id), "older supporting evidence is still supplied");
  const correction = add({ content: "The renewal field has changed to renewal_end.", tools: ["attio"],
    source: [{ kind: "attio", ref: "schema/renewals-v2" }], supersedes: lesson.id });
  f = facts();
  const effective = f.split("## All effective memories, recording order (oldest first)")[1];
  assert.ok(!effective.includes(lesson.id), "superseded evidence is excluded from effective facts");
  assert.ok(effective.includes(correction.id) && effective.includes("attio:schema/renewals-v2"));
  const revised = `Use renewal_end for renewals (${correction.id}).`;
  apply(f, revised);
  const loaded = run(isolated, "load", "load.mjs", "icp", "--last", "0");
  assert.ok(loaded.includes(revised)); assert.ok(!loaded.includes("contract_end"));
  assert.equal(lib.readContext(isolated, "icp").rule, rule);
  assert.equal(readFileSync(lib.readContext(isolated, "market").path, "utf8"), other, "tool guidance stays in its context");
});

test("remember takes a batch: every entry gets its own commit, and one look-alike name holds back only itself", () => {
  const b = mkdtempSync(join(tmpdir(), "gtm-os-batch-")); execFileSync("git", ["init", "-q", b]); execFileSync("git", ["-C", b, "config", "commit.gpgsign", "false"]);
  run(b, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  run(b, "load", "load.mjs", "icp", "--only");
  const batch = join(b, "work", "batch.json");
  writeFileSync(batch, JSON.stringify([
    { content: "Pierre Aubert asked for a three-year TCO.", people: ["Pierre Aubert"] },
    { content: "Who owns the security review?", kind: "question", context: "offer" },
    { content: "Pierre Dupont joined the call." , people: ["Pierre Dupont"] },
  ]));
  const before = execFileSync("git", ["-C", b, "log", "--format=%s"], { encoding: "utf8" }).split("\n").filter(Boolean).length;
  const out = execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--batch", batch],
    { cwd: b, encoding: "utf8", env: { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_COMPILE: "1" } });

  assert.match(out, /^kept 2 of 3/m, "the two clean entries land");
  assert.match(out, /not kept \(1 of 3\)/, "the blocked one is counted");
  assert.match(out, /#3 .*"Pierre Dupont" may be Pierre Aubert/, "named by its position in the batch, so only it is re-sent");
  assert.equal(lib.readMemories(b, "icp").length, 1, "entry 1 in the loaded context");
  assert.equal(lib.readMemories(b, "offer").length, 1, "entry 2 in the context it named");
  assert.ok(!lib.readNames(b).some(n => n.name === "Pierre Dupont"), "the held-back name is not registered");

  const msgs = execFileSync("git", ["-C", b, "log", "--format=%s"], { encoding: "utf8" }).split("\n").filter(Boolean);
  assert.equal(msgs.length - before, 2, "one commit per memory written, never one commit for the batch");
  assert.deepEqual(msgs.slice(0, 2), ["remember: offer question by ann-lee", "remember: icp note by ann-lee"]);
});

test("a batch whose every entry is held back writes nothing and exits 2", () => {
  const b = mkdtempSync(join(tmpdir(), "gtm-os-batch2-")); execFileSync("git", ["init", "-q", b]); execFileSync("git", ["-C", b, "config", "commit.gpgsign", "false"]);
  run(b, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  run(b, "load", "load.mjs", "icp", "--only");
  run(b, "entities", "entities.mjs", "--add", "Pierre Aubert");
  const batch = join(b, "work", "batch.json");
  writeFileSync(batch, JSON.stringify([{ content: "Pierre Dupont called.", people: ["Pierre Dupont"] }, { content: "Pierre Duponte wrote back.", people: ["Pierre Duponte"] }]));
  try {
    execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--batch", batch], { cwd: b, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_COMPILE: "1" } });
    assert.fail("should have exited 2");
  } catch (e) {
    assert.equal(e.status, 2);
    assert.match(String(e.stderr), /not kept \(2 of 2\)/);
  }
  assert.equal(lib.readMemories(b, "icp").length, 0);
});

test("the background summary run starts nothing when nothing is pending", () => {
  const b = mkdtempSync(join(tmpdir(), "gtm-os-trigger-")); execFileSync("git", ["init", "-q", b]); execFileSync("git", ["-C", b, "config", "commit.gpgsign", "false"]);
  const quiet = { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_COMPILE: "1" };
  execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>"], { cwd: b, encoding: "utf8", env: quiet });
  settleSetup(b);
  // when compilePlan says there is nothing pending the run stops before the wait: no state file, so
  // the page is never told a summary is being written, and no Codex run is started
  execFileSync("bash", [`${P}/scripts/gtm-os-compile/background-compile.sh`, "."], { cwd: b, encoding: "utf8", env: quiet });
  assert.ok(!existsSync(join(b, "work", "compile.json")), "no note is behind: no run, and nothing shown to the person");
  assert.equal(execFileSync("git", ["-C", b, "log", "--format=%s", "-1"], { encoding: "utf8" }).trim().startsWith("compile:"), false, "no cover was rewritten");
});

test("nothing on the dashboard asks a person to update a summary", () => {
  const b = mkdtempSync(join(tmpdir(), "gtm-os-nonag-")); execFileSync("git", ["init", "-q", b]); execFileSync("git", ["-C", b, "config", "commit.gpgsign", "false"]);
  const quiet = { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_COMPILE: "1" };
  execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>"], { cwd: b, encoding: "utf8", env: quiet });
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--context", "icp", "--content", "A note the summary does not know about yet."], { cwd: b, encoding: "utf8", env: quiet });
  // the worst case for nagging: a channel is behind AND the last background run failed
  writeFileSync(join(b, "work", "compile.json"), JSON.stringify({ state: "failed", at: new Date().toISOString(), contexts: "icp" }));
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-render/render.mjs`, "."], { cwd: b, encoding: "utf8", env: quiet });
  const page = readFileSync(join(b, "work", "home", "index.html"), "utf8");
  // Retrying a read of missing history is allowed; compilation controls stay in Codex.
  for (const nag of ["Update summary", "Retry summary", "summary behind", 'sayBtn\\("compile ']) {
    assert.doesNotMatch(page, new RegExp(nag), `the page still offers "${nag}": summaries are the machine's job, never a row in what needs you`);
  }
  writeFileSync(join(b, "work", "compile.json"), JSON.stringify({ state: "running", at: new Date().toISOString(), contexts: "icp" }));
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-render/render.mjs`, "."], { cwd: b, encoding: "utf8", env: quiet });
  const live = JSON.parse(readFileSync(join(b, "work", "home", "data.json"), "utf8")).contexts.find(c => c.slug === "icp");
  assert.equal(live.updating, true, "while a run is actually on, the channel data says so, and the page draws the updating pill from it");
});

// The dashboard skill was deleted once (84aa3a1) and its procedure survived only as a reference that
// went on claiming the page never writes, long after every button on it started acting. This holds the
// restored skill to the three things it exists to promise.
test("the dashboard procedure is a reference of use-brain, and says what the page actually does", () => {
  const skill = readFileSync(`${P}/skills/gtm-os-use-brain/references/dashboard.md`, "utf8");
  assert.doesNotMatch(skill, /^name: /m, "a reference, not a skill of its own (ALL-204 step 4)");
  assert.equal(existsSync(`${P}/skills/gtm-os-use-brain/references/render.md`), false, "one source for the procedure: the old reference is gone, not left to drift");

  // kept between chats: the tab lives in the Codex pane and outlives the turn (ALL-207)
  assert.match(skill, /open_in_codex/, "the dashboard opens in the Codex pane, never Chrome");
  assert.match(skill, /markDeliverable/, "without it the tab closes after the turn and the dashboard is gone next chat");
  assert.match(skill, /dashboard: on-demand/, "the skill says which setting decides that it opens by itself");

  // The viewer directs all corrections to Codex.
  assert.match(skill, /never write to `brain\/`/, "both renderer and server are read-only");
  for (const control of ["Forget", "Answer", "Approve", "Same or Different"])
    assert.match(skill, new RegExp(control), `the page's ${control} control is a correction the skill must know it can offer`);
  assert.match(skill, /\bRead-only\b/i);

  // a wrong sentence traces back to the note that caused it
  assert.match(skill, /citation\s+pill/, "the pills are how a person gets from a wrong sentence to its note");
  assert.match(skill, /forget memory m_/, "and the correction that follows, which is a note withdrawn, never a summary rewritten");

  const commands = readFileSync(join(P, "..", "..", "COMMANDS.md"), "utf8");
  assert.match(commands, /^\| `gtm-os-use-brain` \| GTM OS: Use the company brain \|/m, "the skill that owns the dashboard procedure is listed in COMMANDS.md (ALL-204 step 4)");
  const section = commands.slice(commands.indexOf("\n### render\n") + 1).split(/\n### /)[0];
  assert.match(section, /\bRead-only\b/i); assert.match(section, /All changes happen in Codex/);
  assert.match(section, /citation\s+pill/, "and never said how to trace a wrong sentence back to its note");
});

test("onboarding offers personal Chrome setup for websites, never a dashboard browser choice", () => {
  const create = readFileSync(`${P}/skills/gtm-os-start/references/create-brain.md`, "utf8");
  const policy = readFileSync(`${P}/policies/computer-use.md`, "utf8");
  assert.doesNotMatch(create, /Where should the dashboard open|Separate Chrome window/);
  assert.match(create, /Set up your logged-in Chrome for website work/);
  assert.match(create, /Skip for now/);
  assert.match(create, /personal to this machine, never a shared admin/);
  assert.match(policy, /never silently switch to the embedded browser/);
  assert.match(policy, /prior setup choice is not authorization/);
});

test("remember attaches the chat it was called from as a codex: source, and only then", () => {
  const b = mkdtempSync(join(tmpdir(), "gtm-os-thread-src-")); execFileSync("git", ["init", "-q", b]); execFileSync("git", ["-C", b, "config", "commit.gpgsign", "false"]);
  run(b, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  const env = { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_COMPILE: "1" };
  const rem = (extra, e = env) => { execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--context", "icp", "--content", "A fact.", ...extra], { cwd: b, encoding: "utf8", env: e }); return lib.readMemories(b, "icp").at(-1).source; };
  assert.deepEqual(rem([]), [], "no chat recorded yet: nothing is guessed");
  lib.writeSession(b, { session_id: "01a0-chat", cwd: b });
  assert.deepEqual(rem([]), [{ kind: "codex", ref: "01a0-chat" }], "the chat from work/session.json is the source");
  assert.deepEqual(rem(["--source", "gmail:19fa"]), [{ kind: "gmail", ref: "19fa" }, { kind: "codex", ref: "01a0-chat" }], "tool sources keep their place, the chat comes last");
  assert.deepEqual(rem(["--source", "codex:01a0-named"]), [{ kind: "codex", ref: "01a0-named" }], "a codex source given by hand is not doubled");
  assert.deepEqual(rem([], { ...env, GTM_OS_RUN: "background" }), [], "a separate run is not the person's chat: no source is attached");
});

test("the summary run declares itself (GTM_OS_RUN) and keeps the thread its hook recorded through the state writes", async () => {
  const b = mkdtempSync(join(tmpdir(), "gtm-os-run-kind-")); execFileSync("git", ["init", "-q", b]); execFileSync("git", ["-C", b, "config", "commit.gpgsign", "false"]);
  run(b, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  settleSetup(b);
  // a fake codex: records the run kind it was given, does what the real run's session hook does (thread onto compile.json), then compiles
  const bin = mkdtempSync(join(tmpdir(), "gtm-os-fakecodex-kind-")), seen = join(bin, "kind.txt");
  writeFileSync(join(bin, "codex"), `#!/bin/sh\n[ "$1" = exec ] || exit 0\nprintf '%s\\n' "$GTM_OS_RUN" >> "${seen}"\nnode -e 'const l=await import(process.argv[1]);l.recordRunThread(".",process.env.GTM_OS_RUN,JSON.stringify({session_id:"01a0-"+process.env.GTM_OS_RUN,cwd:process.cwd()}))' "${P}/lib/brain.mjs"\nk=$(node "${P}/scripts/gtm-os-compile/compile.mjs" . --facts icp | sed -n 's/^as_of: \\(s_[0-9a-f]*\\).*/\\1/p')\nnode "${P}/scripts/gtm-os-compile/compile.mjs" . --apply icp --by "$GTM_OS_RUN" --as-of "$k" --summary "Bo is in." --now "Call Bo." >/dev/null\n`); execFileSync("chmod", ["755", join(bin, "codex")]);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PLUGIN_ROOT: P, GTM_OS_NO_COMPILE: "", GTM_OS_COMPILE_DELAY: "0", GTM_OS_COMPILE_RETRY: "0" };
  run(b, "load", "load.mjs", "icp", "--only");
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--content", "Met Bo."], { cwd: b, env: { ...env, GTM_OS_NO_COMPILE: "1" } });
  execFileSync("bash", [`${P}/scripts/gtm-os-compile/background-compile.sh`, "."], { cwd: b, env });
  const st = JSON.parse(readFileSync(join(b, "work", "compile.json"), "utf8"));
  assert.equal(st.state, "done", JSON.stringify(st)); assert.equal(st.thread, "01a0-background", "the run's thread survives the done write");
  assert.equal(readFileSync(seen, "utf8").trim(), "background");
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--content", "Met Bo again."], { cwd: b, env: { ...env, GTM_OS_NO_COMPILE: "1" } });
  execFileSync("bash", [`${P}/scripts/gtm-os-schedule/scheduled-run.sh`, "."], { cwd: b, env });
  assert.equal(readFileSync(seen, "utf8").trim().split("\n").at(-1), "schedule");
  assert.equal(JSON.parse(readFileSync(join(b, "work", "compile.json"), "utf8")).thread, "01a0-schedule");
});

test("the page and load link a codex: source and the summary run's thread, resolved from the Codex home, never opened", () => {
  const b = mkdtempSync(join(tmpdir(), "gtm-os-thread-page-")); execFileSync("git", ["init", "-q", b]); execFileSync("git", ["-C", b, "config", "commit.gpgsign", "false"]);
  run(b, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  const home = mkdtempSync(join(tmpdir(), "gtm-os-codex-home-")); writeFileSync(join(home, "session_index.jsonl"), JSON.stringify({ id: "01a0-chat", thread_name: "Pilot with Bo", updated_at: "2026-09-09T08:00:00Z" }) + "\n");
  const env = { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_COMPILE: "1", CODEX_HOME: home };
  lib.writeSession(b, { session_id: "01a0-chat", cwd: b });
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--context", "icp", "--content", "Bo agreed to a pilot."], { cwd: b, env });
  writeFileSync(join(b, "work", "compile.json"), JSON.stringify({ state: "done", at: new Date().toISOString(), contexts: "icp", thread: "01a0-run" }));
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-render/render.mjs`, "."], { cwd: b, env });
  const data = JSON.parse(readFileSync(join(b, "work", "home", "data.json"), "utf8"));
  assert.equal(data.threads["01a0-chat"].url, "codex://threads/01a0-chat"); assert.equal(data.threads["01a0-chat"].name, "Pilot with Bo");
  assert.equal(data.threads["01a0-run"].url, "codex://threads/01a0-run", "the summary run's thread is resolved too"); assert.equal(data.threads["01a0-run"].name, null);
  const html = readFileSync(join(b, "work", "home", "index.html"), "utf8");
  assert.match(html, /href="\$\{esc\(t\.url\)\}"|codex:\/\/threads\//, "the page renders thread sources as links");
  assert.doesNotMatch(html, /location\.href\s*=\s*[^;]*codex:|window\.open\([^)]*codex:/, "nothing on the page opens a thread by itself");
  const out = execFileSync(process.execPath, [`${P}/scripts/gtm-os-load/load.mjs`, ".", "icp", "--only"], { cwd: b, encoding: "utf8", env });
  assert.match(out, /source: codex:01a0-chat \(codex:\/\/threads\/01a0-chat\)/, "load hands the link over as text");
});

test("recall hands over each hit's sources, with the chat it came from as a link", () => {
  const b = mkdtempSync(join(tmpdir(), "gtm-os-recall-src-")); execFileSync("git", ["init", "-q", b]); execFileSync("git", ["-C", b, "config", "commit.gpgsign", "false"]);
  run(b, "setup", "setup.sh", "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@x.io>");
  const env = { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_COMPILE: "1" };
  lib.writeSession(b, { session_id: "01a0-chat", cwd: b });
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--context", "icp", "--kind", "decision", "--content", "No discount for Bergstrom.", "--source", "gmail:19faef"], { cwd: b, env });
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--context", "icp", "--content", "Bergstrom uses two warehouses."], { cwd: b, env: { ...env, GTM_OS_RUN: "background" } });
  const out = execFileSync(process.execPath, [`${P}/scripts/gtm-os-recall/recall.mjs`, ".", "Bergstrom"], { cwd: b, encoding: "utf8", env });
  assert.match(out, /source: gmail:19faef, codex:01a0-chat \(codex:\/\/threads\/01a0-chat\)/, "the decision names its email and its chat");
  assert.doesNotMatch(out, /Bergstrom uses two warehouses\.\n\s+source:/, "a memory with no source says nothing about sources");
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "ann", "--context", "icp", "--kind", "decision", "--content", "Pierre Aubert signs in October.", "--people", "Pierre Aubert"], { cwd: b, env });
  const person = execFileSync(process.execPath, [`${P}/scripts/gtm-os-recall/recall.mjs`, ".", "--person", "Pierre Aubert"], { cwd: b, encoding: "utf8", env });
  assert.match(person, /Pierre Aubert signs in October/); assert.match(person, /contexts\/icp\/memories.jsonl/); assert.match(person, /codex:\/\/threads\/01a0-chat/, "the entity brief traces claims to memories and sources");
});

test("each question goes to the tool named for its purpose, so setup, settings and work questions are not all labelled onboarding (ALL-203)", () => {
  const policy = readFileSync(`${P}/policies/questions.md`, "utf8");
  assert.match(policy, /`onboarding_question`[^.]*first-run setup/s);
  assert.match(policy, /`configuration_question`[^.]*(tools|settings)/s);
  assert.match(policy, /`question`[^.]*(everyday|ordinary|creative)/s);
  const named = execFileSync("grep", ["-rl", "onboarding_question", `${P}/skills`, "--include=*.md"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  assert.deepEqual(named.filter(f => !f.includes("/gtm-os-start/")), [], "only first-run setup asks with onboarding_question");
  assert.match(readFileSync(`${P}/skills/gtm-os-configure/references/connect-tools.md`, "utf8"), /`configuration_question`/);
  assert.match(readFileSync(`${P}/skills/gtm-os-use-brain/SKILL.md`, "utf8"), /asked with `question`/);
  assert.match(readFileSync(`${P}/skills/gtm-os-todo/references/whats-next.md`, "utf8"), /using `question`/);
});

test("sync and resolution end without a next step, a reminder or a to-do; the brain is not the person's to-do system (ALL-208)", () => {
  const template = readFileSync(`${P}/templates/AGENTS.md`, "utf8");
  assert.match(template, /not the person's to-do system/);
  assert.match(template, /Not after `gtm-os-sync` or a dashboard resolution/);
  const sync = readFileSync(`${P}/skills/gtm-os-sync/SKILL.md`, "utf8");
  assert.match(sync, /Record what happened, never what should happen next/);
  assert.match(sync, /no next step, no reminder, no to-do/i);
  const resolution = readFileSync(`${P}/skills/gtm-os-use-brain/references/dashboard-resolution.md`, "utf8");
  assert.match(resolution, /no reminder \("noted for tomorrow"\), no to-do/i);
  assert.ok(existsSync(`${P}/skills/gtm-os-todo/SKILL.md`), "the to-do skill stays, on request");
});

test("adding a file is one obvious pathway: everyday work through use-brain's files reference, which lands beside the owner, attaches and notes (ALL-205)", () => {
  assert.ok(!existsSync(`${P}/skills/gtm-os-add-file/SKILL.md`), "add-file is no longer a listed skill; its script path stays");
  assert.ok(existsSync(`${P}/skills/gtm-os-add-file/add-file.mjs`));
  const files = readFileSync(`${P}/skills/gtm-os-use-brain/references/files.md`, "utf8");
  assert.match(files, /add-file\.mjs/); assert.match(files, /--document <ref> \| --entity/); assert.match(files, /remember` with `asset`/); assert.match(files, /kind: "file"/);
  assert.match(files, /never what should happen next/, "learning from a file follows the no to-do rule");
  assert.match(readFileSync(`${P}/skills/gtm-os-use-brain/SKILL.md`, "utf8"), /\[files\]\(references\/files\.md\)/);
  assert.match(readFileSync(`${P}/skills/gtm-os-document/agents/openai.yaml`, "utf8"), /"GTM OS: Documents"/);
  assert.match(readFileSync(join(P, "..", "..", "COMMANDS.md"), "utf8"), /^\| `gtm-os-document` \| GTM OS: Documents \|/m);
  const template = readFileSync(`${P}/templates/AGENTS.md`, "utf8");
  assert.match(template, /goes through gtm-os-use-brain's references\/files\.md/); assert.doesNotMatch(template, /gtm-os-add-file/);
});

test("a chat never compiles: the procedure queues the background worker, and the template and tables say so (ALL-204 step 1)", () => {
  const compile = readFileSync(`${P}/skills/gtm-os-use-brain/references/compile.md`, "utf8");
  assert.match(compile, /^## In a chat/m); assert.match(compile, /background-compile\.sh/); assert.match(compile, /--release/);
  assert.doesNotMatch(compile, /Never compile in the chat and never offer to; the steps below are for when the person asks/);
  const useBrain = readFileSync(`${P}/skills/gtm-os-use-brain/SKILL.md`, "utf8");
  assert.doesNotMatch(useBrain, /\| `compile_facts`, `compile_apply` \|/);
  assert.doesNotMatch(useBrain, /\| `entity_facts`, `compile_entity` \|/);
  const template = readFileSync(`${P}/templates/AGENTS.md`, "utf8");
  assert.match(template, /compile tools are offered only to the scheduled and background runs/i);
  assert.doesNotMatch(template, /`load_context`, `remember`, `recall`, `compile_facts`,\n`compile_apply`,/);
});

test("a chat is told one read tool: no skill, policy or template names a retired read tool outside the run procedures (ALL-204 step 2b)", () => {
  const retired = /`(recall|who_is|entity_facts|list_contexts|list_projects|list_brains|customer_overview|meeting_overview|advise|where_we_are)`/;
  const runProcedures = ["references/compile.md", "references/entity-compile.md"];
  const files = execFileSync("grep", ["-rlE", "`(recall|who_is|entity_facts|list_contexts|list_projects|list_brains|customer_overview|meeting_overview|advise|where_we_are)`", `${P}/skills`, `${P}/policies`, `${P}/templates/AGENTS.md`, "--include=*.md"], { encoding: "utf8" }).trim().split("\n").filter(Boolean).filter(f => !f.includes("/legacy/") && !runProcedures.some(r => f.endsWith(r)));
  assert.deepEqual(files, [], "retired read tools are still named in these files");
  assert.match(readFileSync(`${P}/templates/AGENTS.md`, "utf8"), /`query` \(status\)/);
  assert.doesNotMatch(readFileSync(`${P}/templates/AGENTS.md`, "utf8"), retired);
});

test("remember confirms with the note itself, and the schema guidance lives in the references (ALL-209, ALL-204 step 3)", () => {
  const remember = readFileSync(`${P}/skills/gtm-os-use-brain/references/remember.md`, "utf8");
  assert.match(remember, /quote the note as written/i, "the confirmation is the note, not a list of names");
  assert.match(remember, /do not invent dates/i, "guidance that lived only in the schema moved here");
  assert.match(readFileSync(`${P}/skills/gtm-os-use-brain/references/customers.md`, "utf8"), /separate call/);
  assert.match(readFileSync(`${P}/templates/AGENTS.md`, "utf8"), /note text in quotes with its context/);
});

test("retired skills live on as references of the eight, and nothing names them as skills any more (ALL-204 step 4)", () => {
  const refs = { "gtm-os-project/SKILL.md": /name: gtm-os-project/, "gtm-os-project/references/link.md": /./, "gtm-os-configure/references/connect-tools.md": /read test/i, "gtm-os-configure/references/update-plugin.md": /update/i,
    "gtm-os-todo/references/whats-next.md": /next steps/i, "gtm-os-todo/references/advisor.md": /health/i, "gtm-os-sync/references/schedule.md": /daily/i, "gtm-os-start/references/import.md": /handoff/i,
    "gtm-os-use-brain/references/load-context.md": /load/i, "gtm-os-use-brain/references/create-context.md": /context/i, "gtm-os-use-brain/references/edit-context.md": /rule|title/i, "gtm-os-use-brain/references/dashboard.md": /dashboard/i };
  for (const [file, re] of Object.entries(refs)) assert.match(readFileSync(`${P}/skills/${file}`, "utf8"), re, file);
  for (const gone of ["import", "whats-next", "advisor", "schedule", "new-project", "link-project", "connect-tools", "update-plugin", "load-context", "create-context", "edit-context", "render"]) assert.ok(!existsSync(`${P}/skills/gtm-os-${gone}/SKILL.md`), `gtm-os-${gone} is no longer a skill`);
  // a retired name may still appear as a script path (scripts/gtm-os-render/render.mjs), never as a skill or a slash command
  const retired = /gtm-os-(import|whats-next|advisor|schedule|new-project|link-project|connect-tools|update-plugin|load-context|create-context|edit-context|render)(?![-\w]*\/)/;
  const files = execFileSync("grep", ["-rlE", "gtm-os-(import|whats-next|advisor|schedule|new-project|link-project|connect-tools|update-plugin|load-context|create-context|edit-context|render)", `${P}/skills`, `${P}/policies`, `${P}/hooks`, `${P}/templates/AGENTS.md`, `${P}/server/server.mjs`, `${P}/scripts/gtm-os-render/skill-catalog.json`, join(P, "..", "..", "COMMANDS.md"), join(P, "..", "..", "ONBOARDING.md"), join(P, "..", "..", "GUIDE.md")], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const offenders = files.filter(f => !f.includes("/legacy/")).filter(f => readFileSync(f, "utf8").split("\n").some(line => retired.test(line)));
  assert.deepEqual(offenders, [], "these still name a retired skill");
});

test("Slack replies: optional in onboarding, read live, scope asked once, style learned as a description, nothing stored (2026-10-01)", () => {
  const ref = readFileSync(`${P}/skills/gtm-os-todo/references/slack-replies.md`, "utf8");
  const todo = readFileSync(`${P}/skills/gtm-os-todo/SKILL.md`, "utf8");
  const discovery = readFileSync(`${P}/skills/gtm-os-start/references/discovery.md`, "utf8");
  const sync = readFileSync(`${P}/skills/gtm-os-sync/references/source-sync.md`, "utf8");
  assert.match(todo, /\(references\/slack-replies\.md\)/, "todo reaches the procedure");
  assert.match(todo, /what's waiting on me in Slack/);
  // onboarding offers it only when Slack is in sight, never as part of the floor, and a skip sticks
  assert.match(discovery, /Slack is an option, never the floor/);
  assert.match(discovery, /No, skip it[\s\S]*`mark_tool` \(status\s+`skip`\)/);
  assert.match(discovery, /When nothing points to Slack, do not bring it up/);
  // privacy: the scope is the person's choice, saved once; a scheduled run never asks
  assert.match(ref, /configuration_question/);
  assert.match(ref, /A\s+scheduled run never asks: no saved scope means no Slack scan/);
  assert.match(ref, /Read only: never send, react, mark read/);
  assert.match(ref, /Nothing from the scan by default/);
  // the style is learned from their own replies, confirmed first, and holds no message content
  assert.match(ref, /a description, never their messages/);
  assert.match(ref, /No quotes, names or message content in the memory/);
  assert.match(ref, /suggest it before saving/);
  assert.match(ref, /tone of voice document/);
  assert.match(ref, /never send the person through\s+an APPROVE/);
  assert.match(sync, /slack-replies\.md/, "the morning run carries the queue");
});

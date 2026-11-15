// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// Layout 3: the base files in about-us/, rules, schema and settings in config/ (lib/brain-paths.mjs), the move that
// asks first (lib/config-folders.mjs), owner-only changes there and the record of every approval (lib/owner.mjs).
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";
import * as owner from "../lib/owner.mjs";
import * as paths from "../lib/brain-paths.mjs";
import { readLayout, LAYOUT } from "../lib/layout-version.mjs";
import { diskLayout, flatKinds } from "../lib/layout.mjs";
import { whereRows, ownRules } from "../lib/where.mjs";
import { readSchema, brainKinds } from "../lib/schema.mjs";
import { listDocuments } from "../lib/documents.mjs";
import { readAskSource } from "../lib/ask-source.mjs";
import { readOurRules } from "../lib/our-rules.mjs";
import { pillarData } from "../lib/dashboard-pillars.mjs";
import { configMovePlan } from "../lib/config-folders.mjs";
import { makeBrain, actAs, toLayout2, toLayout1, tree, exists, P } from "./helpers/layouts.mjs";

const lastCommit = git => git("show", "--name-status", "-M", "--format=%s", "HEAD");
const memories = root => lib.listContexts(root).flatMap(c => lib.readMemories(root, c.slug));
const ticket = (root, kind) => lib.issueApproval(root, kind);

test("setup makes layout 3: settings, rules and schema in config/, the starters in about-us/, no brain/admin.md", t => {
  const { root, git } = makeBrain(t);
  assert.equal(LAYOUT, 3);
  for (const f of ["config/settings.yaml", "config/rules.md", "config/schema.md", ...["strategy", "icp", "voice", "design-system", "market"].map(d => `about-us/${d}.md`)]) assert.ok(exists(root, f), f);
  for (const f of ["brain/admin.md", "RULES.md", "SCHEMA.md", "strategy.md"]) assert.ok(!exists(root, f), f);
  assert.equal(readLayout(root).layout, 3); assert.equal(diskLayout(root), 3);
  const a = lib.readAdmin(root);
  assert.deepEqual([a.company, a.one_liner, a.owner, a.team.map(p => p.handle), a.file], ["Layout Co", "Returns software: for shops", "ann-lee", ["ann-lee", "bo-chen"], "config/settings.yaml"]);
  assert.match(a.body, /^# Layout Co\n\n\*\*What we sell, to whom\.\*\* Returns software: for shops/);
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "", "all in the setup commit");
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /\[config\/rules\.md\]\(config\/rules\.md\)/);
});

test("the upgrade asks the owner, moves byte for byte with layout 3 in one commit, and is idempotent", t => {
  const { root, git, upgrade, env } = makeBrain(t);
  toLayout2(root, git);
  writeFileSync(join(root, "design-system.html"), "<html>our look</html>\n");
  writeFileSync(join(root, "pricing.md"), "---\nkind: document\ntitle: Pricing\napplies_to: [proposals]\nstatus: draft\n---\n# Pricing\n\nOur own words, kept as written.\r\n");
  git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "the team's own base file");
  const before = tree(root), head = git("rev-parse", "HEAD");
  const ask = upgrade();
  assert.equal(ask.status, 0, ask.stderr);
  assert.match(ask.stdout, /not upgraded yet: This upgrade changes the brain's file layout from 2 to 3\. It moves [^\n]*design-system\.html[^\n]*pricing\.md[^\n]*strategy\.md[^\n]*into about-us\//);
  assert.match(ask.stdout, /RULES\.md, SCHEMA\.md, brain\/admin\.md into config\/ \(rules\.md, schema\.md, settings\.yaml\)/);
  assert.match(ask.stdout, /no longer finds the brain at all/);
  assert.match(ask.stdout, /Yes, upgrade the layout \/ No, not now/);
  assert.deepEqual(tree(root), before); assert.equal(git("rev-parse", "HEAD"), head);
  // a scheduled or background run never moves anything, even with the flag
  const bg = spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root, "--confirm"], { cwd: root, env: { ...env, GTM_BRAIN_RUN: "background" }, encoding: "utf8" });
  assert.match(bg.stdout, /scheduled or background run never changes the layout/);
  assert.deepEqual(tree(root), before);
  const yes = upgrade("--confirm");
  assert.equal(yes.status, 0, yes.stderr);
  assert.match(yes.stdout, /moved strategy\.md -> about-us\/strategy\.md/);
  assert.match(yes.stdout, /changed the brain's file layout to 3/);
  assert.equal(readLayout(root).layout, 3); assert.equal(diskLayout(root), 3);
  // the move is one commit; the shipped rules nobody edited then get their layout 3 wording in a commit of their own
  assert.match(git("log", "-1", "--format=%s"), /^upgrade: config\/rules\.md/);
  const moved = git("log", "-1", "--format=%H", "--grep=^layout 3:").trim(), commit = git("show", "--name-status", "-M", "--format=%s", moved);
  assert.match(commit, /^layout 3:/);
  for (const [from, to] of [["strategy.md", "about-us/strategy.md"], ["pricing.md", "about-us/pricing.md"], ["design-system.html", "about-us/design-system.html"], ["RULES.md", "config/rules.md"], ["SCHEMA.md", "config/schema.md"]])
    assert.match(commit, new RegExp(`^R100\\s+${from.replace(".", "\\.")}\\s+${to.replace(/[./]/g, "\\$&")}$`, "m"), `${from} moved whole`);
  assert.match(commit, /^D\s+brain\/admin\.md$/m); assert.match(commit, /^A\s+config\/settings\.yaml$/m); assert.match(commit, /^M\s+brain\/layout\.json$/m);
  // every byte of the person's text kept
  for (const [from, to] of [["pricing.md", "about-us/pricing.md"], ["strategy.md", "about-us/strategy.md"], ["RULES.md", "config/rules.md"], ["design-system.html", "about-us/design-system.html"]]) assert.equal(git("show", `${moved}:${to}`), before[from], to);
  assert.equal(readFileSync(join(root, "about-us/pricing.md"), "utf8"), before["pricing.md"]);
  const was = lib.parseFrontmatter(before["brain/admin.md"]), now = lib.readAdmin(root);
  for (const k of ["company", "owner", "created", "tools", "dashboard"]) assert.deepEqual(now[k], was.fm[k], k);
  assert.deepEqual(now.team, was.fm.team); assert.equal(now.body, was.body.trim(), "the prose is kept as notes, word for word");
  assert.equal(now.one_liner, "Returns software: for shops");
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /config\/rules\.md/, "a README nobody edited names the new places");
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");
  const head3 = git("rev-parse", "HEAD");
  const again = upgrade("--confirm");
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already current/);
  assert.equal(git("rev-parse", "HEAD"), head3, "a second upgrade changes nothing");
});

test("a layout 1 brain upgrades to 3 in one yes: pages into kind folders, then the base files", t => {
  const { root, git, upgrade } = makeBrain(t);
  toLayout2(root, git); toLayout1(root, git);
  const ask = upgrade();
  assert.match(ask.stdout, /from 1 to 3\. It moves 2 entity pages into a folder per kind[^\n]*It moves [^\n]*into about-us\//);
  const yes = upgrade("--confirm");
  assert.equal(yes.status, 0, yes.stderr);
  assert.equal(lib.entityLayout(root), "kinds"); assert.equal(diskLayout(root), 3); assert.equal(readLayout(root).layout, 3);
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");
});

test("flat entity pages in a brain already in about-us/ and config/ are asked about before they move", t => {
  const { root, git, upgrade } = makeBrain(t);
  toLayout1(root, git);
  assert.equal(diskLayout(root), 1, "flat pages are layout 1, whatever else moved");
  const before = tree(root);
  const ask = upgrade();
  assert.match(ask.stdout, /not upgraded yet: This upgrade changes the brain's file layout from 1 to 3\. It moves 2 entity pages into a folder per kind/);
  assert.doesNotMatch(ask.stdout, /into about-us\//, "nothing else is left to move");
  assert.deepEqual(tree(root), before);
  const yes = upgrade("--confirm");
  assert.equal(yes.status, 0, yes.stderr);
  assert.equal(lib.entityLayout(root), "kinds"); assert.equal(readLayout(root).layout, 3);
});

test("a teammate's upgrade never moves the base files: the move is the owner's to say yes to", t => {
  const { root, git, upgrade } = makeBrain(t);
  toLayout2(root, git); actAs(root, "bo-chen");
  const r = upgrade("--confirm");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /is the owner's \(Ann Lee\) to say yes to/);
  assert.equal(diskLayout(root), 2); assert.ok(exists(root, "brain/admin.md")); assert.ok(exists(root, "strategy.md"));
});

test("a brain already moved with layout 2 recorded heals to 3 in the next commit, said as housekeeping", t => {
  const { root, git } = makeBrain(t);
  writeFileSync(join(root, "brain/layout.json"), JSON.stringify({ layout: 2, starters: [] }, null, 2) + "\n");
  git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "a pre-release recorded 2");
  const r = lib.healLayout(root);
  assert.match(r, /recorded file layout 3[^\n]*the base files were already in about-us\/ and config\//);
  assert.equal(readLayout(root).layout, 3);
  assert.equal(lib.healLayout(root), "", "said once");
});

test("every reader finds its file in all three layouts, and a layout 1 or 2 brain still saves", t => {
  for (const layout of [3, 2, 1]) {
    const { root, git } = makeBrain(t);
    if (layout < 3) toLayout2(root, git);
    if (layout < 2) toLayout1(root, git);
    assert.equal(diskLayout(root), layout);
    const rules = layout === 3 ? "config/rules.md" : "RULES.md", schema = layout === 3 ? "config/schema.md" : "SCHEMA.md", settings = layout === 3 ? "config/settings.yaml" : "brain/admin.md";
    assert.deepEqual([lib.rulesFile(root), lib.schemaFile(root), lib.settingsFile(root), lib.baseDir(root)], [rules, schema, settings, layout === 3 ? "about-us" : ""]);
    assert.equal(lib.isBrain(root), true);
    assert.equal(lib.readAdmin(root).company, "Layout Co", `settings, layout ${layout}`);
    assert.equal(lib.teamHandle(root, "Bo Chen"), "bo-chen");
    assert.ok(whereRows(root).length > 3, `rules rows, layout ${layout}`);
    appendFileSync(join(root, rules), "\n- Notes about pricing go to Our offer.\n");
    assert.match(ownRules(root, join(P, "templates")), /pricing go to Our offer/, `own rules, layout ${layout}`);
    assert.ok(readOurRules(root).rules.length >= 1, `our rules, layout ${layout}`);
    assert.equal(readAskSource(root).defaults, false, `ask the source table, layout ${layout}`);
    assert.ok(readSchema(root).schema, `schema, layout ${layout}`);
    assert.ok(brainKinds(root).includes("organization")); assert.ok(flatKinds(root).has("person"));
    const docs = listDocuments(root).map(d => d.path);
    assert.ok(docs.includes(layout === 3 ? "about-us/strategy.md" : "strategy.md"), `documents, layout ${layout}: ${docs}`);
    const pillar = pillarData(root, {});
    assert.equal(pillar.configuration.settings.path, settings); assert.equal(pillar.configuration.schema.path, schema);
    // a note and a save
    const { rec } = lib.appendMemory(root, "company", { authors: ["ann-lee"], content: `A note in layout ${layout}.` });
    assert.equal(lib.commit(root, ["brain"], "a note").ok, true);
    const s = lib.save(root, "save");
    assert.equal(s.ok, true, s.note);
    assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");
    assert.ok(memories(root).some(m => m.id === rec.id));
  }
});

test("a teammate's change under about-us/ is a proposal: nothing there changes, the owner is told at their chat start", t => {
  const { root, git, run } = makeBrain(t);
  const before = tree(root);
  actAs(root, "bo-chen");
  const r = run("scripts/gtm-brain-documents/document.mjs", ["--update", "strategy", "--append", "## Focus\n\nMid-market retailers first.", "--by", "bo-chen"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^NOT APPLIED: about-us\/strategy\.md is the owner's to change \(Ann Lee\)\. Kept as proposal p_[0-9a-f]{10}/);
  assert.doesNotMatch(r.stdout, /updated document/);
  for (const [p, text] of Object.entries(before)) if (/^(about-us|config)\//.test(p)) assert.equal(readFileSync(join(root, p), "utf8"), text, p);
  assert.equal(git("status", "--porcelain", "--", "about-us", "config").trim(), "", "nothing under about-us/ or config/");
  assert.equal(git("log", "-1", "--format=%s", "--", "about-us").trim(), git("log", "--reverse", "--format=%s").split("\n")[0], "no commit touched about-us/ since setup");
  const [p] = owner.listProposals(root);
  assert.equal(p.by, "bo-chen"); assert.deepEqual(p.files.map(f => [f.path, f.change]), [["about-us/strategy.md", "edit"]]);
  assert.match(readFileSync(join(root, "brain/proposals", p.id, "files/about-us/strategy.md"), "utf8"), /Mid-market retailers first/);
  const note = memories(root).find(m => m.tags.includes("owner-proposal"));
  assert.ok(note.tags.includes("for:ann-lee") && note.tags.includes(`proposal:${p.id}`));
  assert.match(note.content, /^Bo Chen proposes a change to about-us\/strategy\.md for the owner, Ann Lee, to approve/);
  assert.equal(lib.ownerStartLine(root), "", "the teammate is not asked");
  actAs(root, null);
  assert.match(lib.ownerStartLine(root), new RegExp(`^Waiting for your approval \\(you own about-us/ and config/\\): Bo Chen proposes [^\\n]*${p.id}`));
});

test("a teammate's settings change through approve is a proposal with no form; the owner's approval applies it and records who asked and who approved", t => {
  const { root, git, run } = makeBrain(t);
  const settings = readFileSync(join(root, "config/settings.yaml"), "utf8");
  actAs(root, "bo-chen");
  writeFileSync(join(root, "work/admin.proposed.md"), settings.replace("tools: []", 'tools: ["HubSpot"]'));
  // the APPROVE ticket does not make a teammate the owner
  const denied = run("scripts/gtm-brain-approve/approve.mjs", ["--apply", "--by", "bo-chen"], { GTM_BRAIN_APPROVAL_TICKET: ticket(root, "admin") });
  assert.equal(denied.status, 0, denied.stderr);
  assert.match(denied.stdout, /^NOT APPLIED: config\/settings\.yaml is the owner's/);
  assert.equal(readFileSync(join(root, "config/settings.yaml"), "utf8"), settings);
  assert.ok(!existsSync(join(root, "work/admin.proposed.md")));
  const [p] = owner.listProposals(root);
  // the owner applies it
  actAs(root, null);
  const shown = run("scripts/gtm-brain-approve/approve.mjs", ["--proposal", p.id, "--diff"]);
  assert.match(shown.stdout, /\+ tools: \["HubSpot"\]/);
  const noTicket = run("scripts/gtm-brain-approve/approve.mjs", ["--proposal", p.id, "--apply", "--by", "ann-lee"]);
  assert.equal(noTicket.status, 4, "no APPROVE, nothing applied");
  const ok = run("scripts/gtm-brain-approve/approve.mjs", ["--proposal", p.id, "--apply", "--by", "ann-lee"], { GTM_BRAIN_APPROVAL_TICKET: ticket(root, "proposal") });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, new RegExp(`applied proposal ${p.id} \\(config/settings\\.yaml\\), asked by bo-chen, approved by ann-lee`));
  assert.deepEqual(lib.readAdmin(root).tools, ["HubSpot"]);
  assert.deepEqual(owner.listProposals(root), []);
  const applied = git("log", "-1", "--format=%h", "--", "config/settings.yaml").trim();
  const record = memories(root).find(m => m.kind === "decision" && m.tags.includes("approval"));
  assert.match(record.content, /^Approved a change to config\/settings\.yaml: a change to the workplace settings \(2 lines\)\. Asked by Bo Chen, approved by Ann Lee, commit [0-9a-f]+\./);
  assert.deepEqual(record.source, [{ kind: "git", ref: applied }]);
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");
  assert.match(owner.approvalsText(root, memories(root)), /approvals recorded: 1\n- \d{4}-\d\d-\d\d m_[0-9a-f]+: Approved a change to config\/settings\.yaml/);
});

test("the owner's own settings change applies at once and is recorded; a teammate cannot decide on a proposal", t => {
  const { root, run } = makeBrain(t);
  const settings = readFileSync(join(root, "config/settings.yaml"), "utf8");
  writeFileSync(join(root, "work/admin.proposed.md"), settings.replace("dashboard: always", "dashboard: on-demand"));
  const r = run("scripts/gtm-brain-approve/approve.mjs", ["--apply", "--by", "ann-lee"], { GTM_BRAIN_APPROVAL_TICKET: ticket(root, "admin") });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^applied config\/settings\.yaml, approved by ann-lee/);
  assert.equal(lib.readAdmin(root).dashboard, "on-demand");
  assert.ok(memories(root).some(m => m.kind === "decision" && m.tags.includes("approval") && /Asked by Ann Lee, approved by Ann Lee/.test(m.content)));
  // a proposal is the owner's to decide
  actAs(root, "bo-chen");
  writeFileSync(join(root, "about-us/voice.md"), "edited by Bo\n");
  lib.save(root, "save");
  const [p] = owner.listProposals(root);
  const no = run("scripts/gtm-brain-approve/approve.mjs", ["--proposal", p.id, "--drop", "--by", "bo-chen"], { GTM_BRAIN_APPROVAL_TICKET: ticket(root, "proposal") });
  assert.equal(no.status, 5);
  assert.equal(owner.listProposals(root).length, 1);
  actAs(root, null);
  const drop = run("scripts/gtm-brain-approve/approve.mjs", ["--proposal", p.id, "--drop", "--by", "ann-lee"], { GTM_BRAIN_APPROVAL_TICKET: ticket(root, "proposal") });
  assert.equal(drop.status, 0, drop.stderr);
  assert.deepEqual(owner.listProposals(root), []);
  assert.ok(memories(root).some(m => m.kind === "decision" && /^Declined about-us\/voice\.md/.test(m.content)));
});

test("a teammate's hand edit under config/ is put back and offered to the owner; the owner's own is kept and recorded", t => {
  const { root, git } = makeBrain(t);
  const rules = readFileSync(join(root, "config/rules.md"), "utf8");
  actAs(root, "bo-chen");
  writeFileSync(join(root, "config/rules.md"), rules + "\n- Always ask before tagging a client.\n");
  writeFileSync(join(root, "about-us/new-base.md"), "---\nkind: document\ntitle: New base\napplies_to: [copy]\nstatus: draft\n---\n# New\n");
  const r = lib.save(root, "save");
  assert.match(r.note, /NOT APPLIED: config\/rules\.md, about-us\/new-base\.md are the owner's to change/);
  assert.equal(readFileSync(join(root, "config/rules.md"), "utf8"), rules, "the committed version is back");
  assert.ok(!exists(root, "about-us/new-base.md"), "a new file there waits in the proposal");
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");
  const [p] = owner.listProposals(root);
  assert.deepEqual(p.files.map(f => f.change).sort(), ["add", "edit"]);
  // the chat start catches the same edit
  writeFileSync(join(root, "config/schema.md"), "edited\n");
  assert.match(lib.guardAtStart(root), /NOT APPLIED: config\/schema\.md/);
  assert.equal(owner.listProposals(root).length, 2);
  // the owner's own edit is kept and recorded
  actAs(root, null);
  writeFileSync(join(root, "about-us/voice.md"), readFileSync(join(root, "about-us/voice.md"), "utf8") + "\nWe sound plain.\n");
  const mine = lib.save(root, "save");
  assert.equal(mine.ok, true, mine.note);
  assert.match(readFileSync(join(root, "about-us/voice.md"), "utf8"), /We sound plain/);
  const record = memories(root).find(m => m.kind === "decision" && /own edit of about-us\/voice\.md/.test(m.content));
  assert.ok(record, "recorded");
  assert.deepEqual(record.source, [{ kind: "git", ref: mine.hash }]);
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");
});

test("an owner's edit that breaks the settings is put back, kept aside", t => {
  const { root } = makeBrain(t);
  const settings = readFileSync(join(root, "config/settings.yaml"), "utf8");
  writeFileSync(join(root, "config/settings.yaml"), "oops\n");
  const r = lib.save(root, "save");
  assert.match(r.note, /leaves the settings unreadable/);
  assert.equal(readFileSync(join(root, "config/settings.yaml"), "utf8"), settings);
  assert.ok(readdirSync(join(root, "work/manual-edits/protected")).some(f => f.startsWith("config__settings.yaml")));
});

test("the layout move plan never takes a workflow or a document in the team's own folder", t => {
  const { root, git } = makeBrain(t);
  toLayout2(root, git);
  const plan = configMovePlan(root);
  assert.ok(!plan.moves.some(([f]) => f.startsWith("workflows/")));
  assert.ok(plan.moves.some(([f, to]) => f === "voice.md" && to === "about-us/voice.md"));
  assert.equal(plan.settings, true);
});

test("the path module is the only place that names these files", () => {
  const roots = ["lib", "scripts", "server", "session", "skills"].map(d => join(P, d));
  const files = [];
  const walk = dir => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) { if (e.name !== "ui" && e.name !== "node_modules") walk(p); } else if (/\.(mjs|js)$/.test(e.name)) files.push(p); } };
  roots.forEach(walk);
  // a quoted literal that is one of the paths, or a join that builds one
  const literal = /["'`](?:brain\/admin\.md|admin\.md|RULES\.md|SCHEMA\.md|WHERE\.md|config\/settings\.yaml|config\/rules\.md|config\/schema\.md|about-us)["'`]|["']brain["'],\s*["']admin\.md["']/;
  // brain-paths.mjs is the path module; config-folders.mjs rewrites the README's wording for the move (text, not paths)
  const allowed = new Set([join(P, "lib/brain-paths.mjs"), join(P, "lib/config-folders.mjs")]);
  const found = files.filter(f => !allowed.has(f)).flatMap(f => readFileSync(f, "utf8").split("\n").map((l, i) => [f, i + 1, l])).filter(([, , l]) => literal.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
  assert.deepEqual(found.map(([f, n, l]) => `${f.slice(P.length)}:${n}: ${l.trim().slice(0, 120)}`), []);
  // the shell scripts test for a brain through session/resolve.sh only
  const shells = [];
  const walkSh = dir => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walkSh(p); else if (e.name.endsWith(".sh")) shells.push(p); } };
  roots.forEach(walkSh);
  const test = /\[ !? ?-[fe] "?[^\]]*(?:admin\.md|settings\.yaml|RULES\.md|SCHEMA\.md)/;
  assert.deepEqual(shells.filter(f => !f.endsWith("session/resolve.sh")).flatMap(f => readFileSync(f, "utf8").split("\n").map((l, i) => `${f.slice(P.length)}:${i + 1}: ${l.trim()}`).filter(l => test.test(l))), []);
});

test("a base file is a starter, a file in about-us/ or one that says base: true; another document at the top stays there in the move", t => {
  const { root, git } = makeBrain(t);
  toLayout2(root, git);
  const doc = (title, more = "") => `---\nkind: document\ntitle: ${title}\napplies_to: [talks]\nstatus: draft\n${more}---\n# ${title}\n`;
  writeFileSync(join(root, "talk-draft.md"), doc("Talk draft"));
  writeFileSync(join(root, "partner-principles.md"), doc("Partner principles", "base: true\n"));
  const by = Object.fromEntries(listDocuments(root).map(d => [d.path, d.base]));
  assert.equal(by["talk-draft.md"], false, "a draft at the top is a document, not a base file");
  assert.equal(by["partner-principles.md"], true, "base: true in the header");
  assert.equal(by["strategy.md"], true, "a starter");
  const plan = configMovePlan(root), from = plan.moves.map(([f]) => f);
  assert.ok(from.includes("strategy.md") && from.includes("partner-principles.md"), `base files move: ${from}`);
  assert.ok(!from.includes("talk-draft.md"), "the talk draft stays at the top");
  const C = pillarData(root, lib.readAdmin(root)).configuration.documents;
  assert.equal(C.find(d => d.path === "talk-draft.md").base, false);
  // marked through the document script, the header keeps the rest byte for byte
  const r = spawnSync(process.execPath, [new URL("../scripts/gtm-brain-documents/document.mjs", import.meta.url).pathname, "--update", "talk-draft", "--base", "yes"], { cwd: root, encoding: "utf8", env: { ...process.env, GTM_BRAIN_NO_COMMIT: "1" } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(listDocuments(root).find(d => d.path === "talk-draft.md").base, true);
  assert.match(readFileSync(join(root, "talk-draft.md"), "utf8"), /# Talk draft/);
});

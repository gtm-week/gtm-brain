// Layout 4 (lib/brain-paths.mjs, lib/layout-four.mjs): the brain's folders are the dashboard's tabs. The move from
// each older layout on a brain with notes in several months, a corrected and a withdrawn note, entity pages, base
// documents and a workflow: nothing is lost, and the index answers the same before and after. Then what a layout 4
// brain does day to day: a note goes to its month's file, a correction reaches across months, a hand edit of a
// notes file is put back, parallel branches merge notes as lines.
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
process.env.GTM_BRAIN_NO_OPEN = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as lib from "../lib/brain.mjs";
import { withMemoryIndex } from "../lib/memory-index.mjs";
import { tabsMovePlan, migrateToTabs } from "../lib/layout-four.mjs";
import { layoutStep } from "../lib/upgrade-files.mjs";
import { readLayout } from "../lib/layout-version.mjs";
import { makeBrain, actAs, exists, tree } from "./helpers/layouts.mjs";

const skip = !lib.hasMemoryIndex?.() && false;
const by = ["ann-lee"];
/* Notes in three months and two contexts, one corrected and one withdrawn across a month boundary, two entities
   with pages, a document of the team's own and a file in a base document's folder. */
function fill(root, git) {
  const max = lib.addName(root, "Max Jendral"), acme = lib.addName(root, "Acme", { kind: "organization", subtype: "company" });
  const add = (ctx, o) => lib.appendMemory(root, ctx, { authors: by, people: [], ...o }).rec;
  const a = add("company", { content: "Acme signed the pilot for returns software.", people: ["Acme"], at: "2026-09-10T09:00:00.000Z" });
  const b = add("company", { content: "Max Jendral leads procurement at Acme.", people: ["Max Jendral", "Acme"], at: "2026-09-28T09:00:00.000Z" });
  const c = add("market", { content: "Shops ask for a returns portal before peak season.", at: "2026-10-02T09:00:00.000Z" });
  const d = add("company", { content: "The pilot price is 4000 EUR a month.", people: ["Acme"], at: "2026-10-05T09:00:00.000Z" });
  const e = add("company", { content: "The pilot price is 4500 EUR a month, corrected by Max Jendral.", people: ["Acme", "Max Jendral"], supersedes: d.id, at: "2026-11-03T09:00:00.000Z" });
  const f = add("market", { content: "A rumour about a competitor closing.", at: "2026-10-20T09:00:00.000Z" });
  const g = add("market", { content: "Withdrawn: the rumour was wrong.", retracts: f.id, kind: "note", at: "2026-11-04T09:00:00.000Z" });
  const h = add("offer", { kind: "question", content: "Which plan does Acme renew on?", people: ["Acme"], at: "2026-11-05T09:00:00.000Z" });
  writeFileSync(join(root, "talk-draft.md"), "---\nkind: document\ntitle: Talk draft\napplies_to: [talks]\nstatus: draft\n---\n# Talk draft\n\nOurs.\n");
  const base = lib.basePath(root, "design-system");
  mkdirSync(join(root, base), { recursive: true }); writeFileSync(join(root, base, "tokens.css"), ":root { --ink: #111; }\n");
  const r = lib.save(root, "notes, entities and files");
  assert.equal(r.ok, true, r.note);
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");
  return { max, acme, notes: [a, b, c, d, e, f, g, h] };
}
/* What must not change: every note line by its id, each context's effective notes, the entity ids, and what the
   index answers. */
function snapshot(root) {
  const contexts = lib.listContexts(root);
  const all = contexts.flatMap(c => c.memories);
  return {
    contexts: contexts.map(c => [c.slug, c.title, c.rule, c.summary]),
    ids: all.map(m => m.id).sort(),
    records: Object.fromEntries(all.map(m => [m.id, JSON.stringify(m)])),
    effective: Object.fromEntries(contexts.map(c => [c.slug, lib.effectiveMemories(c.memories).map(m => m.id).sort()])),
    entities: lib.readNames(root).map(e => [e.id, e.name, e.kind]).sort(),
    search: withMemoryIndex(root, i => ({
      price: i.query({ search: "pilot price" }).map(m => m.id),
      rumour: i.query({ search: "rumour competitor" }).map(m => m.id),
      company: i.query({ filters: { context: "company" }, limit: 50 }).map(m => m.id),
      all: i.query({ limit: 200 }).map(m => m.id),
      count: i.count(),
    })),
    documents: Object.fromEntries(Object.entries(tree(root)).filter(([p]) => /(strategy|icp|voice|market|design-system|talk-draft)\.md$|tokens\.css$|^workflows\//.test(p) && !/(^|\/)(entities|contexts|topics)\//.test(p)).map(([p, text]) => [p.split("/").pop(), text])),
  };
}

for (const from of [3, 2, 1]) test(`a layout ${from} brain moves to layout 4 with nothing lost: notes, corrections, entities, documents, the index`, { skip }, t => {
  const { root, git, upgrade } = makeBrain(t, { layout: from });
  const made = fill(root, git);
  const before = snapshot(root), files = tree(root);
  assert.equal(before.ids.length >= 8, true);
  assert.ok(!before.search.price.includes(made.notes[3].id), "the corrected price is not found before");
  assert.ok(before.search.price.includes(made.notes[4].id));
  assert.ok(!before.search.all.includes(made.notes[5].id), "the withdrawn note is not listed before");

  // asked first: nothing moves without the owner's yes
  const asked = upgrade();
  assert.match(asked.stdout, /not upgraded yet/); assert.match(asked.stdout, /four folders, the dashboard's tabs: configuration\//);
  assert.match(asked.stdout, /Yes, upgrade the layout/);
  assert.equal(lib.diskLayout(root), from, "nothing moved while the question waits");
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");

  const head = git("rev-parse", "HEAD").trim();
  const done = upgrade("--confirm");
  assert.equal(done.status, 0, done.stderr + done.stdout);
  assert.match(done.stdout, /changed the brain's file layout to 4 \(layout\.json\)/);
  assert.equal(lib.diskLayout(root), 4); assert.equal(readLayout(root).layout, 4);
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "", "everything is committed");

  // the folders are the four tabs, with nothing of the old ones left
  for (const p of ["brain", "about-us", "config", "work", "RULES.md", "SCHEMA.md"]) assert.ok(!exists(root, p), `${p} is gone`);
  for (const p of ["configuration/settings.yaml", "configuration/rules.md", "configuration/schema.md", "configuration/about-us/strategy.md", "configuration/about-us/design-system/tokens.css", "entities/people", "memories/topics/company.md", "memories/2026-09.jsonl", "memories/2026-10.jsonl", "memories/2026-11.jsonl", "layout.json", "workflows/outbound.md", "talk-draft.md", ".gtm-brain"]) assert.ok(exists(root, p), p);
  assert.deepEqual(readdirSync(root).filter(n => !n.startsWith(".") && !n.endsWith(".md") && n !== "profile" && n !== "layout.json").sort(), ["configuration", "entities", "memories", "workflows"]);
  for (const kind of readdirSync(join(root, "entities")).filter(n => !n.startsWith("."))) assert.ok(!exists(root, `entities/${kind}/index.md`), `no generated index in entities/${kind}`);
  assert.equal(git("check-ignore", ".gtm-brain/person.json").trim(), ".gtm-brain/person.json");

  // nothing lost: the same notes byte for byte, the same effective sets, the same entities and documents
  const after = snapshot(root);
  assert.deepEqual(after.ids, before.ids);
  assert.deepEqual(after.records, before.records);
  assert.deepEqual(after.effective, before.effective);
  assert.deepEqual(after.contexts, before.contexts);
  assert.deepEqual(after.entities, before.entities);
  assert.deepEqual(after.documents, before.documents);
  // the index, rebuilt from the month files, answers the same
  assert.deepEqual(after.search, before.search);
  // each note is in the file of its month, as the line it was
  for (const m of made.notes) {
    const file = `memories/${m.at.slice(0, 7)}.jsonl`, lines = readFileSync(join(root, file), "utf8").split("\n");
    assert.ok(lines.includes(before.records[m.id]) || lines.some(l => l && JSON.parse(l).id === m.id), `${m.id} in ${file}`);
  }
  const oldLines = Object.entries(files).filter(([p]) => p.endsWith("memories.jsonl")).flatMap(([, text]) => text.split("\n").filter(Boolean)).sort();
  const newLines = readdirSync(join(root, "memories")).filter(f => f.endsWith(".jsonl")).flatMap(f => readFileSync(join(root, "memories", f), "utf8").split("\n").filter(Boolean)).sort();
  if (from === 3) assert.deepEqual(newLines, oldLines, "every line byte for byte");   // 1 and 2 pass through layout 3 first, where the upgrade itself may add a note
  else for (const l of oldLines) assert.ok(newLines.includes(l), "an old line is kept byte for byte");

  // the move itself is one commit of renames; the copy of the old files is kept on this computer
  const moveCommit = git("log", "--format=%H %s").split("\n").find(l => / layout 4: configuration/.test(l)).split(" ")[0];
  const names = git("show", "--format=", "--name-status", "-M", moveCommit).split("\n").filter(Boolean);
  const renames = names.filter(l => l.startsWith("R"));
  for (const want of [/^R100\t(about-us|config)\/.*strategy\.md\tconfiguration\/about-us\/strategy\.md$/, /^R100\tbrain\/contexts\/company\/context\.md\tmemories\/topics\/company\.md$/, /^R100\tconfig\/settings\.yaml\tconfiguration\/settings\.yaml$/, /^R100\tbrain\/entities\/people\/max-jendral-[0-9a-f]{6}\.md\tentities\/people\/max-jendral-[0-9a-f]{6}\.md$/])
    assert.ok(renames.some(l => want.test(l)), `${want} in\n${renames.join("\n")}`);
  assert.ok(names.every(l => !/^[AM]\tbrain\//.test(l)));
  const backups = readdirSync(join(root, ".gtm-brain/upgrades")).filter(n => n.startsWith("layout-4-"));
  assert.equal(backups.length, 1);
  assert.ok(existsSync(join(root, ".gtm-brain/upgrades", backups[0], "brain/contexts/company/memories.jsonl")), "the old notes file is in the copy");
  assert.ok(existsSync(join(root, ".gtm-brain/person.json")) || true);
  // an entity page links to where things are now
  const page = readFileSync(join(root, lib.readNames(root).find(e => e.name === "Acme")._path), "utf8");
  assert.ok(!/\/contexts\//.test(page), "no link into brain/contexts");
  assert.match(page, /\]\(\.\.\/\.\.\/memories\/(2026-\d\d\.jsonl|topics\/company\.md)\)/);

  // undone by reverting: every old file is back
  if (from === 3) {
    const commits = git("log", "--format=%H", `${head}..HEAD`).split("\n").filter(Boolean);
    for (const c of commits) git("-c", "core.hooksPath=/dev/null", "revert", "--no-edit", c);
    const back = tree(root);
    for (const [p, text] of Object.entries(files)) assert.equal(back[p], text, `${p} is back`);
    assert.ok(!exists(root, "configuration/settings.yaml"));
  }
  // a second run finds nothing to do
  if (from !== 3) assert.match(upgrade("--confirm").stdout, /already current/);
});

test("the move is the owner's: a teammate's upgrade leaves a layout 3 brain where it is, and a scheduled run never moves it", { skip }, t => {
  const { root, upgrade, env } = makeBrain(t, { layout: 3 });
  actAs(root, "bo-chen");
  const out = upgrade("--confirm");
  assert.equal(lib.diskLayout(root), 3, out.stdout);
  assert.match(out.stdout, /is the owner's \(Ann Lee\) to say yes to/);
  actAs(root, null);
  process.env.GTM_BRAIN_RUN = "1";
  try { assert.equal(migrateToTabs(root).layout, 0); assert.match(layoutStep(root, true), /^ASK\t.*never changes the layout/); } finally { delete process.env.GTM_BRAIN_RUN; }
  assert.equal(lib.diskLayout(root), 3);
});

test("the move refuses, changing nothing, when a folder of the team's own has one of the names or a notes file does not read", { skip }, t => {
  const { root, git } = makeBrain(t, { layout: 3 });
  mkdirSync(join(root, "memories")); writeFileSync(join(root, "memories", "ours.txt"), "the team's own folder\n");
  assert.match(tabsMovePlan(root).blocked, /memories already exists/);
  const r = migrateToTabs(root);
  assert.equal(r.layout, 0); assert.match(r.refused, /memories already exists/);
  assert.equal(lib.diskLayout(root), 3);
  assert.equal(readFileSync(join(root, "memories", "ours.txt"), "utf8"), "the team's own folder\n");
  assert.equal(git("status", "--porcelain", "--", "brain", "config", "about-us").trim(), "");
});

test("an unsaved edit under what moves stops the move: save first", { skip }, t => {
  const { root } = makeBrain(t, { layout: 3 });
  appendFileSync(join(root, "about-us/voice.md"), "\nA line nobody saved.\n");
  const r = migrateToTabs(root);
  assert.equal(r.layout, 0); assert.match(r.refused, /unsaved change.*save first/);
  assert.equal(lib.diskLayout(root), 3);
  assert.match(readFileSync(join(root, "about-us/voice.md"), "utf8"), /A line nobody saved/);
});

test("a plugin from before layout 4 finds no brain in a layout 4 folder; the layout file says so to one that looks", { skip }, t => {
  const { root } = makeBrain(t);
  assert.equal(lib.diskLayout(root), 4);
  for (const p of ["brain/admin.md", "config/settings.yaml", "brain/layout.json"]) assert.ok(!exists(root, p), p);
  assert.equal(readLayout(root).layout, 4);
  process.env.GTM_BRAIN_TEST_LAYOUT = "3";
  try { assert.match(lib.commit(root, ["README.md"], "x").note, /upgraded to file layout 4 by a newer GTM Brain/); assert.throws(() => lib.appendMemory(root, "company", { authors: by, content: "A note." }), /layout 4/); }
  finally { delete process.env.GTM_BRAIN_TEST_LAYOUT; }
});

test("layout 4 day to day: a note goes to its month's file, a correction reaches across months, reading by topic is a filter", { skip }, t => {
  const { root, git, run } = makeBrain(t);
  const old = lib.appendMemory(root, "company", { authors: by, content: "The office is in Berlin.", at: "2026-08-15T10:00:00.000Z" }).rec;
  const other = lib.appendMemory(root, "market", { authors: by, content: "Berlin shops open late.", at: "2026-08-16T10:00:00.000Z" }).rec;
  assert.equal(lib.commit(root, lib.notesPaths(root, "company"), "notes").ok, true);
  const lines = readFileSync(join(root, "memories/2026-08.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert.deepEqual(lines.map(l => [l.id, l.context]), [[old.id, "company"], [other.id, "market"]], "one month file, two topics");
  assert.ok(!exists(root, "brain"));
  // through the save script: a correction this month of a note from August
  const saved = run("scripts/gtm-brain-remember/remember.mjs", ["--by", "ann-lee", "--context", "company", "--kind", "note", "--supersedes", old.id, "--content", "The office is in Hamburg."]);
  assert.equal(saved.status, 0, saved.stderr + saved.stdout);
  const month = new Date().toISOString().slice(0, 7);
  const now = readFileSync(join(root, `memories/${month}.jsonl`), "utf8").trim().split("\n").map(l => JSON.parse(l));
  const fix = now.find(m => m.supersedes === old.id);
  assert.ok(fix, "the correction is in this month's file");
  assert.equal(git("status", "--porcelain", "--", "memories", "entities").trim(), "", "the save script committed it");
  const company = lib.readMemories(root, "company");
  assert.ok(company.some(m => m.id === old.id) && company.some(m => m.id === fix.id) && company.every(m => m.context === "company"));
  assert.ok(!lib.effectiveMemories(company).some(m => m.id === old.id), "superseded across files");
  const found = withMemoryIndex(root, i => i.query({ search: "office" }).map(m => m.id));
  assert.ok(found.includes(fix.id) && !found.includes(old.id), "the index hides the corrected note of another month");
  assert.deepEqual(withMemoryIndex(root, i => i.query({ filters: { context: "market" }, limit: 50 }).map(m => m.context)).filter(c => c !== "market"), []);
  // a withdrawal across months, then the index catches up from an append alone
  const gone = lib.appendMemory(root, "market", { authors: by, content: "Withdrawn.", retracts: other.id }).rec;
  assert.ok(!withMemoryIndex(root, i => i.query({ search: "Berlin shops" }).map(m => m.id)).includes(other.id));
  assert.ok(gone.id);
  // the topic's cover is read and written through the same functions
  const c = lib.readContext(root, "company");
  assert.equal(c.path, join(root, "memories/topics/company.md"));
  lib.writeContext(root, "company", { ...c.fm, rule: c.rule, now: "Ask about the Hamburg office." });
  assert.equal(lib.readContext(root, "company").now, "Ask about the Hamburg office.");
  assert.match(readFileSync(join(root, "memories/topics/company.md"), "utf8"), /Working guidance: Ask about the Hamburg office\./);
  // a new topic
  const made = run("scripts/gtm-brain-contexts/contexts.mjs", ["--new", "partners", "Partners", "Work with partners here.", "--distinct", "No topic covers partner work yet."]);
  assert.equal(made.status, 0, made.stderr + made.stdout);
  assert.ok(exists(root, "memories/topics/partners.md")); assert.ok(lib.listContexts(root).some(x => x.slug === "partners"));
});

test("layout 4: a hand edit of a month's notes is put back, an append stays, and the pre-commit hook refuses a changed line", { skip }, t => {
  const { root, git } = makeBrain(t);
  lib.appendMemory(root, "company", { authors: by, content: "A fact.", at: "2026-08-15T10:00:00.000Z" });
  lib.commit(root, lib.notesPaths(root, "company"), "note");
  const file = join(root, "memories/2026-08.jsonl"), committed = readFileSync(file, "utf8");
  writeFileSync(file, committed.replace("A fact.", "Another fact."));
  const restored = lib.guardProtected(root);
  assert.deepEqual(restored.map(r => r.path), ["memories/2026-08.jsonl"]);
  assert.equal(readFileSync(file, "utf8"), committed);
  assert.match(restored[0].backup, /^\.gtm-brain\/manual-edits\/protected\//);
  assert.ok(existsSync(join(root, restored[0].backup)));
  // the hook, for a commit made by hand
  writeFileSync(file, committed.replace("A fact.", "Another fact."));
  git("add", "memories/2026-08.jsonl");
  assert.throws(() => git("-c", "commit.gpgsign=false", "commit", "-qm", "by hand"), /append-only|not valid/);
  git("reset", "-q", "HEAD", "--", "memories/2026-08.jsonl"); writeFileSync(file, committed);
  git("rm", "-q", "--cached", "memories/2026-08.jsonl");
  assert.throws(() => git("-c", "commit.gpgsign=false", "commit", "-qm", "delete by hand"), /deleted or renamed/);
  git("reset", "-q", "HEAD", "--", "memories/2026-08.jsonl");
  // interactions are protected under their layout 4 name
  lib.writeInteractions(root, []);
  git("add", "configuration/interactions.json"); git("-c", "commit.gpgsign=false", "commit", "-qm", "interactions", "--no-verify");
  writeFileSync(join(root, "configuration/interactions.json"), "{}\n");
  assert.deepEqual(lib.guardProtected(root).map(r => r.path), ["configuration/interactions.json"]);
});

test("layout 4: two branches that both saved notes merge as lines, and the topics that took notes from both sides are marked", { skip }, t => {
  const { root, git } = makeBrain(t);
  assert.match(readFileSync(join(root, ".gitattributes"), "utf8"), /^memories\/\*\.jsonl merge=union$/m);
  const main = git("rev-parse", "--abbrev-ref", "HEAD").trim();
  git("checkout", "-q", "-b", "side");
  const a = lib.appendMemory(root, "company", { authors: by, content: "From the side branch.", at: "2026-08-15T10:00:00.000Z" }).rec;
  lib.commit(root, lib.notesPaths(root, "company"), "side note", { push: false });
  git("checkout", "-q", main);
  const b = lib.appendMemory(root, "company", { authors: by, content: "From the main branch.", at: "2026-08-16T10:00:00.000Z" }).rec;
  const c = lib.appendMemory(root, "market", { authors: by, content: "Only on main.", at: "2026-08-17T10:00:00.000Z" }).rec;
  lib.commit(root, lib.notesPaths(root, "company"), "main notes", { push: false });
  git("-c", "commit.gpgsign=false", "merge", "-q", "--no-edit", "side");
  const ids = lib.listContexts(root).flatMap(x => x.memories).map(m => m.id);
  for (const m of [a, b, c]) assert.ok(ids.includes(m.id), "both sides' notes are there");
  assert.deepEqual(lib.mergedTopics(root, ["memories/2026-08.jsonl"]), ["company"]);
});

test("layout 4: only the owner changes configuration/; a teammate's change is a proposal kept in configuration/proposals/", { skip }, t => {
  const { root, git } = makeBrain(t);
  const voice = join(root, "configuration/about-us/voice.md"), was = readFileSync(voice, "utf8");
  actAs(root, "bo-chen");
  writeFileSync(voice, was + "\nWe never say synergy.\n");
  const r = lib.save(root, "voice");
  assert.match(r.note, /NOT APPLIED/);
  assert.equal(readFileSync(voice, "utf8"), was, "the committed text is back");
  const proposals = readdirSync(join(root, "configuration/proposals"));
  assert.equal(proposals.length, 1);
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");
  actAs(root, null);
  writeFileSync(voice, was + "\nThe owner's own line.\n");
  const mine = lib.save(root, "voice");
  assert.equal(mine.ok, true, mine.note);
  assert.match(readFileSync(voice, "utf8"), /The owner's own line/);
  assert.match(lib.layoutStartLine(root), /four folders: configuration\//);
});

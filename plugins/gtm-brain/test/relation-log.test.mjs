// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// Relationship history from the log (ALL-711): a relation saved with three fields, a stable relation id whose
// notes are its events (started, changed, ended), one current link at a time where SCHEMA.md says so, entity
// renames, merges and kind changes in the same log, and query relations / the entity page read from the index.
// Run: node --test plugins/gtm-brain/test/relation-log.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, realpathSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const home = mkdtempSync(join(tmpdir(), "gtm-relation-log-home-"));
process.env.CODEX_HOME = home;
process.env.GTM_BRAIN_NO_COMPILE = "1"; process.env.GTM_BRAIN_NO_WATCH = "1"; process.env.GTM_BRAIN_NO_OPEN = "1";
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" };
const lib = await import(`${P}/lib/brain.mjs`);
const schema = await import(`${P}/lib/schema.mjs`);
const log = await import(`${P}/lib/relation-log.mjs`);
const events = await import(`${P}/lib/entity-events.mjs`);
const { withMemoryIndex } = await import(`${P}/lib/memory-index.mjs`);

const made = [];
test.after(() => { for (const d of [home, ...made]) { try { rmSync(d, { recursive: true, force: true }); } catch {} } });
function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-relation-log-"))); made.push(root);
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Demo Co", "--one-liner", "events", "--owner", "Marta Nowak <marta@demo.co>"], { cwd: root, env, stdio: "ignore" });
  lib.addName(root, "Anna Lee"); lib.addName(root, "Northwind", { kind: "company" }); lib.addName(root, "Acme Labs", { kind: "company" }); lib.addName(root, "Tom Berg");
  return root;
}
const remember = (root, entries) => {
  const f = join(root, "work", "batch.json"); writeFileSync(f, JSON.stringify(entries));
  try { return execFileSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, root, "--by", "marta", "--batch", f], { env, encoding: "utf8" }); }
  catch (e) { return `${e.stdout}${e.stderr}`; }
};
const relationNotes = root => lib.readMemories(root, "company").filter(m => m.relation);
const idOf = (root, name) => lib.readNames(root).find(e => e.name === name).id;

test("three fields are enough: status, observed_at and basis are filled from the note, and the block is kept", () => {
  const root = brain();
  const out = remember(root, [{ context: "company", content: "Anna Lee is Head of Sales at Northwind.", people: ["Anna Lee"], companies: ["Northwind"], relation: { from: "Anna Lee", type: "works_at", to: "Northwind" } }]);
  assert.match(out, /remembered m_/); assert.doesNotMatch(out, /left out/);
  const [r] = relationNotes(root);
  assert.equal(r.relation.status, "current"); assert.equal(r.relation.basis, "user");
  assert.ok(Math.abs(Date.parse(r.relation.observed_at) - Date.parse(r.at)) < 60000, "observed when the note was saved");
  assert.ok(r.source.some(s => s.kind === "user" && s.ref === "marta-nowak"), "a user basis carries the author as its user source");
  // the note's words say it ended; a source pointer makes it source evidence
  remember(root, [{ context: "company", content: "Tom Berg left Acme Labs, says his LinkedIn.", people: ["Tom Berg"], companies: ["Acme Labs"], sources: ["linkedin:https://linkedin.fixture.test/in/tom"], relation: { from: "Tom Berg", type: "works_at", to: "Acme Labs" } }]);
  const tom = relationNotes(root).find(m => m.relation.from === idOf(root, "Tom Berg"));
  assert.equal(tom.relation.status, "ended"); assert.equal(tom.relation.basis, "source");
  // the strict path keeps what the caller passed
  remember(root, [{ context: "company", content: "Northwind refers clients to us.", companies: ["Northwind"], sources: ["user:marta"], relation: { from: "Northwind", type: "partner_of", to: "us", status: "current", basis: "user", observed_at: "2026-09-01T00:00:00Z" } }]);
  assert.equal(relationNotes(root).find(m => m.relation.type === "partner_of").relation.observed_at, "2026-09-01T00:00:00Z");
});

test("a relation has a stable id from its ends and type; its notes are its events: started, changed, ended", () => {
  const a = log.relationId("e_0000000000000001", "works_at", "e_0000000000000002");
  assert.match(a, /^r_[0-9a-f]{12}$/);
  assert.equal(a, log.relationId("e_0000000000000001", "works_at", "e_0000000000000002"));
  assert.notEqual(a, log.relationId("e_0000000000000001", "reports_to", "e_0000000000000002"));
  const note = (id, status, at) => ({ id, context: "company", at, content: id, tags: [], source: [{ kind: "user", ref: "m" }], relation: { from: "e_0000000000000001", type: "works_at", to: "e_0000000000000002", status, basis: "user", observed_at: at } });
  const { relations } = log.buildRelationLog([note("m_000000000001", "current", "2026-01-01T00:00:00Z"), note("m_000000000002", "current", "2026-03-01T00:00:00Z"), note("m_000000000003", "ended", "2026-06-01T00:00:00Z")]);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].id, a);
  assert.deepEqual(relations[0].events.map(e => e.event), ["started", "changed", "ended"]);
  assert.equal(relations[0].status, "ended"); assert.equal(relations[0].since, "2026-01-01T00:00:00Z"); assert.equal(relations[0].until, "2026-06-01T00:00:00Z");
  assert.equal(log.statusAt(relations[0], "2026-02-01"), "current");
  assert.equal(log.statusAt(relations[0], "2026-07-01"), "ended");
  assert.equal(log.statusAt(relations[0], "2025-12-01"), null);
});

test("SCHEMA.md says per type whether one current link is allowed; the default keeps older files valid", () => {
  const shipped = schema.parseSchema(readFileSync(join(P, "templates", "SCHEMA.md"), "utf8"));
  assert.equal(shipped.relations.works_at.one, true); assert.equal(shipped.relations.reports_to.one, true);
  assert.equal(shipped.relations.partner_of.one, false); assert.equal(shipped.relations.attended.one, false);
  assert.equal(shipped.relations.customer_of.one, true);
  // a file without the column (0.34, early 0.35) still parses, with works_at and reports_to one at a time
  const old = schema.parseSchema(readFileSync(join(P, "templates", "legacy", "schema", "SCHEMA-0.34.3.md"), "utf8"));
  assert.equal(old.relations.works_at.one, true); assert.equal(old.relations.investor_in.one, false);
  const edited = schema.parseSchema("## Relationships\n\n| Type | From | To | What it means | Required | One at a time |\n| --- | --- | --- | --- | --- | --- |\n| works_at | person | organization | Employer | yes | no |\n| owns | person | product | Owner | no | yes |\n");
  assert.equal(edited.relations.works_at.one, false); assert.equal(edited.relations.owns.one, true);
  assert.throws(() => schema.parseSchema("## Relationships\n\n| Type | From | To | What it means | Required | One at a time |\n| --- | --- | --- | --- | --- | --- |\n| owns | person | product | Owner | no | maybe |\n"), /One at a time of owns must be yes or no/);
});

test("a new current employer ends the previous one with an ended note dated to the new one; both kept; partner_of allows many", () => {
  const root = brain();
  remember(root, [{ context: "company", content: "Anna Lee works at Northwind.", people: ["Anna Lee"], companies: ["Northwind"], relation: { from: "Anna Lee", type: "works_at", to: "Northwind", observed_at: "2026-09-01T00:00:00Z" } }]);
  const out = remember(root, [{ context: "company", content: "Anna Lee joined Acme Labs as COO.", people: ["Anna Lee"], companies: ["Acme Labs"], relation: { from: "Anna Lee", type: "works_at", to: "Acme Labs" } }]);
  assert.match(out, /ended Anna Lee works_at Northwind/);
  const notes = relationNotes(root), joined = notes.find(m => m.content.includes("joined"));
  const ended = notes.find(m => m.relation.status === "ended" && m.relation.to === idOf(root, "Northwind"));
  assert.ok(ended, "an ended note for the old employer");
  assert.equal(ended.relation.observed_at, joined.relation.observed_at);
  assert.equal(notes.filter(m => m.relation.to === idOf(root, "Northwind")).length, 2, "the first note stays");
  const rows = lib.relationOverview(root, { entity: "Anna Lee", type: "works_at" }).relations;
  assert.deepEqual(rows.map(r => `${r.to.name} ${r.status}`).sort(), ["Acme Labs current", "Northwind ended"]);
  // many partners at once: nothing ended
  remember(root, [{ context: "company", content: "Northwind is our partner.", companies: ["Northwind"], relation: { from: "Northwind", type: "partner_of", to: "us" } }]);
  const again = remember(root, [{ context: "company", content: "Acme Labs is our partner.", companies: ["Acme Labs"], relation: { from: "Acme Labs", type: "partner_of", to: "us" } }]);
  assert.doesNotMatch(again, /ended/);
  // a later current one with no ended note in the log (a 0.34 teammate wrote it) is ended when read
  const reg = lib.readNames(root), ids = ["Tom Berg", "Northwind", "Acme Labs"].map(n => reg.find(e => e.name === n).id);
  const note = (to, at) => ({ id: `m_${at.slice(5, 7)}0000000000`.slice(0, 14), context: "company", at, content: "x", tags: [], source: [{ kind: "user", ref: "m" }], relation: { from: ids[0], type: "works_at", to, status: "current", basis: "user", observed_at: at } });
  const { relations } = log.buildRelationLog([note(ids[1], "2026-01-01T00:00:00Z"), note(ids[2], "2026-05-01T00:00:00Z")], { schema: schema.readSchema(root).schema });
  const old = relations.find(r => r.to === ids[1]);
  assert.equal(old.status, "ended"); assert.equal(old.until, "2026-05-01T00:00:00Z"); assert.equal(old.events.at(-1).implied, true);
});

test("renames, merges and kind changes write an event to the entity log, so the old name is read from the log", () => {
  const root = brain();
  const north = idOf(root, "Northwind");
  lib.updateEntity(root, { entity: north, by: "marta", set: { name: "Northwind Group" } });
  lib.addName(root, "Pixel Forge"); lib.addName(root, "Pixel Forge", { kind: "company" });
  lib.addName(root, "Acme"); lib.addName(root, "Acme", { kind: "company" });
  const acme = idOf(root, "Acme"), labs = idOf(root, "Acme Labs");
  const preview = lib.mergeEntities(root, { source: acme, target: labs });
  lib.mergeEntities(root, { source: acme, target: labs, by: "marta", as_of: preview.as_of });
  const all = events.readEntityEvents(root);
  const rename = all.find(e => e.change === "rename" && e.entity === north);
  assert.deepEqual([rename.from, rename.to, rename.by], ["Northwind", "Northwind Group", "marta-nowak"]);
  assert.ok(Date.parse(rename.at));
  const kind = all.find(e => e.change === "kind" && e.entity === idOf(root, "Pixel Forge"));
  assert.deepEqual([kind.from, kind.to], ["person", "organization (company)"]);
  const merge = all.find(e => e.change === "merge");
  assert.deepEqual([merge.entity, merge.from, merge.to, merge.merged_id], [labs, "Acme", "Acme Labs", acme]);
  assert.ok(existsSync(join(root, events.EVENTS_FILE)));
  assert.equal(execFileSync("git", ["-C", root, "status", "--porcelain", "--", events.EVENTS_FILE], { encoding: "utf8" }), "", "committed with the entity change");
});

test("the index answers query relations: current and past of an entity, as of a date, by type, and its history with renames", () => {
  const root = brain();
  remember(root, [{ context: "company", content: "Anna Lee works at Northwind.", people: ["Anna Lee"], companies: ["Northwind"], relation: { from: "Anna Lee", type: "works_at", to: "Northwind", observed_at: "2026-03-01T00:00:00Z" } }]);
  remember(root, [{ context: "company", content: "Anna Lee joined Acme Labs.", people: ["Anna Lee"], companies: ["Acme Labs"], relation: { from: "Anna Lee", type: "works_at", to: "Acme Labs", observed_at: "2026-10-01T00:00:00Z" } }]);
  remember(root, [{ context: "company", content: "Anna Lee reports to Tom Berg.", people: ["Anna Lee", "Tom Berg"], relation: { from: "Anna Lee", type: "reports_to", to: "Tom Berg", observed_at: "2026-10-02T00:00:00Z" } }]);
  lib.updateEntity(root, { entity: idOf(root, "Northwind"), by: "marta", set: { name: "Northwind Group" } });
  withMemoryIndex(root, index => {
    const rows = index.relations({ entity: idOf(root, "Anna Lee") });
    assert.deepEqual(rows.map(r => `${r.type} ${r.to} ${r.status}`).sort(), [`reports_to ${idOf(root, "Tom Berg")} current`, `works_at ${idOf(root, "Acme Labs")} current`, `works_at ${idOf(root, "Northwind Group")} ended`].sort());
    assert.equal(index.entityEvents(idOf(root, "Northwind Group"))[0].change, "rename");
  });
  const text = args => withMemoryIndex(root, index => log.relationsAnswer(index, args));
  const now = text({ search: "Anna Lee", type: "works_at" });
  assert.match(now, /Anna Lee works_at Acme Labs: current/); assert.match(now, /Anna Lee works_at Northwind Group: ended/);
  assert.doesNotMatch(now, /reports_to/);
  assert.match(now, /current 2026-03-01 m_[0-9a-f]{12}, ended 2026-10-01 m_[0-9a-f]{12}/, "the history names its notes");
  const then = text({ search: "Anna Lee", type: "works_at", at: "2026-06-01" });
  assert.match(then, /current on 2026-06-01/); assert.match(then, /Northwind Group/); assert.doesNotMatch(then, /Acme Labs/);
  assert.throws(() => text({ search: "Anna Lee", at: "soon" }), /filters\.at must be a date/);
  const history = text({ search: "Northwind" });   // the old name still finds it (an alias since the rename)
  assert.match(history, /History of Northwind Group/);
  assert.match(history, /renamed from "Northwind" to "Northwind Group" by marta-nowak/);
  assert.match(history, /Anna Lee works_at Northwind Group ended/);
  // the entity page carries the same history
  lib.refreshEntityPages?.(root);
  const page = lib.entityBrief(root, "Northwind Group").markdown;
  assert.match(page, /## History\n/);
  assert.match(page, /renamed from "Northwind" to "Northwind Group"/);
  assert.match(page, /Anna Lee works at Northwind Group: started/);
});

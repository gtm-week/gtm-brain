// The entity file cache (registry-cache.test.mjs) and the entity folders (entity-layout.test.mjs) together:
// the cached registry lists pages through lib/layout.mjs, in kind folders and flat, and sees a page where a
// rename or a move left it; the fast mention tables keep the rule that a note with a meeting id belongs to
// that meeting's entity (meeting-entities.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { deserialize } from "node:v8";
import * as lib from "../lib/brain.mjs";
import * as layout from "../lib/layout.mjs";
import { entityId } from "../lib/entities.mjs";
process.env.GTM_BRAIN_NO_COMMIT = "1"; process.env.GTM_BRAIN_NO_COMPILE = "1"; process.env.GTM_BRAIN_NO_WATCH = "1";
const plugin = new URL("../", import.meta.url).pathname, brainModule = new URL("../lib/brain.mjs", import.meta.url).href;
const sid = id => id.slice(2, 8);
function kindBrain() {
  const root = mkdtempSync(join(tmpdir(), "gtm-cache-layout-"));
  mkdirSync(join(root, "brain")); mkdirSync(join(root, "work"));
  writeFileSync(join(root, "brain/admin.md"), lib.renderFrontmatter({ company: "Fixture", tools: ["granola"], team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  writeFileSync(join(root, "SCHEMA.md"), readFileSync(join(plugin, "templates/SCHEMA.md"), "utf8"));
  for (const slug of ["sales", "offer"]) lib.writeContext(root, slug, { title: slug });
  lib.startKindLayout(root); lib.writeNames(root, lib.readNames(root));
  return root;
}
// The registry as a process that has never read it sees it: the reference for every cached read.
const fresh = root => deserialize(Buffer.from(execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e",
  `const lib = await import(${JSON.stringify(brainModule)}); const { serialize } = await import('node:v8'); process.stdout.write(serialize(lib.readNames(process.argv[1])).toString('base64'));`, root], { encoding: "utf8" }), "base64"));
const same = (root, why) => assert.deepStrictEqual(lib.readNames(root), fresh(root), why);
const page = (id, name, kind = "person") => `---\nformat: gtm-brain-entity-v2\nid: ${id}\nname: ${name}\nkind: ${kind}\naliases: []\nemails: []\nnot_same: []\nprevious_ids: []\nreferences: []\nidentity_sources: []\n---\n\n# ${name}\n`;

test("the cached registry reads pages in kind folders and flat pages; an index and an asset folder are never an entity", () => {
  const root = kindBrain();
  const max = lib.addName(root, "Max Jendral"), acme = lib.addName(root, "Acme", { kind: "organization", subtype: "company" });
  const shared = lib.readNamesShared(root);
  assert.ok(Object.isFrozen(shared) && Object.isFrozen(shared[0]), "the shared registry is the cached, frozen one");
  assert.equal(lib.readNamesShared(root), shared, "an unchanged registry is not read again");
  assert.equal(shared.find(e => e.id === max.id)?._path, `brain/entities/people/max-jendral-${sid(max.id)}.md`, "a page in a kind folder, by its path in the brain");
  assert.equal(shared.find(e => e.id === acme.id)?._path, `brain/entities/organizations/acme-${sid(acme.id)}.md`);
  // files beside the pages that are not pages: the generated index of the folder, a page's own files
  assert.ok(existsSync(join(root, "brain/entities/people/index.md")));
  mkdirSync(join(root, layout.assetFolder(shared.find(e => e.id === max.id)._path)));
  writeFileSync(join(root, layout.assetFolder(shared.find(e => e.id === max.id)._path), "notes.md"), "an asset, not a page");
  // a flat page a teammate on 0.34 wrote beside the kind folders is read too
  const ola = entityId("Ola Flat");
  writeFileSync(join(root, "brain/entities/ola-flat.md"), page(ola, "Ola Flat"));
  const next = lib.readNamesShared(root);
  assert.notEqual(next, shared, "a new page is seen by the next read");
  assert.deepEqual(next.filter(e => e._path).map(e => e._path).sort(), layout.pagePaths(root), "exactly the pages lib/layout.mjs lists");
  assert.equal(next.find(e => e.id === ola)?._path, "brain/entities/ola-flat.md");
  assert.ok(!next.some(e => /index\.md$|notes\.md$/.test(e._path || "")));
  same(root, "kind folders and a flat page");
});

test("the cached registry sees a page where a rename or a move left it", () => {
  const root = kindBrain();
  const max = lib.addName(root, "Max Jendral");
  const before = lib.readNamesShared(root).find(e => e.id === max.id)._path;
  // a rename through lib moves the page
  assert.equal(lib.updateEntity(root, { entity: max.id, by: "ann", set: { name: "Maximilian Jendral" } }).changed, true);
  const renamed = lib.readNamesShared(root).find(e => e.id === max.id);
  assert.equal(renamed._path, `brain/entities/people/maximilian-jendral-${sid(max.id)}.md`);
  assert.equal(renamed.name, "Maximilian Jendral");
  assert.ok(!existsSync(join(root, before)) && !lib.readNamesShared(root).some(e => e._path === before), "the old page is gone from the cache as from the folder");
  same(root, "after a rename");
  // a move by hand (git mv, a file manager): the same file, unchanged, under another name
  const moved = `brain/entities/people/max-j-${sid(max.id)}.md`;
  renameSync(join(root, renamed._path), join(root, moved));
  const after = lib.readNamesShared(root).find(e => e.id === max.id);
  assert.equal(after._path, moved, "the entry carries the path the page has now");
  assert.equal(lib.readNames(root).find(e => e.id === max.id)._path, moved);
  same(root, "after a move by hand");
  // a write right after finds the page where it is and puts it back under its own name: one page, never two
  lib.updateEntity(root, { entity: max.id, by: "ann", add: { aliases: ["MJ"] } });
  assert.ok(!existsSync(join(root, moved)), "the moved file is not left behind as a second page");
  assert.equal(lib.readNamesShared(root).find(e => e.id === max.id)._path, renamed._path);
  assert.deepEqual(lib.readNamesShared(root).find(e => e.id === max.id).aliases.includes("MJ"), true);
  assert.equal(lib.readNamesShared(root).filter(e => e.id === max.id || e.previous_ids.includes(max.id)).length, 1, "one page holds the id");
  same(root, "after a write that follows the move");
});

test("a brain not yet upgraded keeps its flat pages in the cached registry", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-cache-flat-"));
  mkdirSync(join(root, "brain"));
  writeFileSync(join(root, "brain/admin.md"), lib.renderFrontmatter({ company: "Fixture", team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  lib.writeContext(root, "sales", { title: "sales" });
  const max = lib.addName(root, "Max Jendral");
  assert.equal(layout.layout(root), "flat");
  assert.equal(lib.readNamesShared(root).find(e => e.id === max.id)._path, "brain/entities/max-jendral.md");
  // a page's own folder is not a kind folder: a Markdown file in it is not an entity
  mkdirSync(join(root, "brain/entities/max-jendral"));
  writeFileSync(join(root, "brain/entities/max-jendral/cv.md"), "a flat page's own file");
  assert.deepEqual(lib.readNamesShared(root).filter(e => e._path).map(e => e._path).sort(), layout.pagePaths(root));
  same(root, "a flat brain");
});

const meeting = (extra = {}) => ({ title: "Acme discovery", reference: { kind: "granola", account: "work", ref: "note-1" }, evidence: "transcript", occurrence: "happened", basis: "source",
  observed_at: "2026-11-12T10:00:00Z", occurred_at: "2026-11-12", capture: "complete", participants: [{ name: "Max Jendral", role: "attended" }], ...extra });
const source = [{ kind: "granola", ref: "https://notes.test/note-1?workspace=work" }];

test("a note with a meeting id links to its meeting entity through the cached registry's lookup tables", () => {
  const root = kindBrain();
  lib.addName(root, "Max Jendral");
  const anchor = lib.appendMemory(root, "sales", { authors: ["ann"], content: "Acme discovery call: Max Jendral walked through their returns flow.", people: ["Max Jendral"], source, meeting: meeting() }).rec;
  const e = lib.readNamesShared(root).find(n => n.kind === "meeting");
  assert.ok(e, "the captured meeting has its entity");
  assert.equal(e.id, lib.meetingEntityId(anchor.id));
  // the note names nobody and nothing: only its meeting id ties it to the meeting
  const note = { content: "They want a two-week pilot.", meeting_id: anchor.id };
  const shared = lib.readNamesShared(root);
  assert.ok(Object.isFrozen(shared));
  assert.deepEqual(lib.mentionsIn(shared, note), [e.name], "the frozen registry (lookup tables kept per registry)");
  assert.deepEqual(lib.mentionsIn(shared, note), [e.name], "and again from the kept tables");
  assert.deepEqual(lib.mentionsIn(lib.readNames(root), note), [e.name], "a changeable copy of the registry");
  assert.deepEqual(lib.createMentionMatcher(shared)(note), [e.name], "the matcher the index uses agrees");
  assert.deepEqual(lib.mentionsIn(shared, { content: "They want a two-week pilot." }), [], "no meeting id, no meeting");
  assert.deepEqual(lib.mentionsIn(shared, { content: "Max Jendral wants a pilot.", meeting_id: anchor.id }), ["Max Jendral", e.name], "after the names the note mentions");
  assert.deepEqual(lib.mentionsIn(shared, { content: `${e.name} went well.`, meeting_id: anchor.id }), [e.name], "named once when the text names the meeting too");
  // a save: the record carries the meeting entity's id though its text names nobody
  const outcome = lib.appendMemory(root, "offer", { authors: ["ann"], content: "They want a two-week pilot.", meeting_id: anchor.id, source }).rec;
  assert.deepEqual(outcome.entities, [e.id]);
  const stored = JSON.parse(readFileSync(join(root, "brain/contexts/offer/memories.jsonl"), "utf8").trim().split("\n").pop());
  assert.deepEqual(stored.entities, [e.id], "as saved");
  assert.deepEqual(lib.entityFacts(root, e.id).evidence.map(m => m.id).sort(), [anchor.id, outcome.id].sort(), "the meeting's page collects both notes");
  // a second meeting: the registry changed, so the tables are built again and each note finds its own meeting
  const second = lib.appendMemory(root, "sales", { authors: ["ann"], content: "Acme pricing call: Max Jendral asked for annual terms.", people: ["Max Jendral"],
    source: [{ kind: "granola", ref: "https://notes.test/note-2?workspace=work" }], meeting: meeting({ title: "Acme pricing", reference: { kind: "granola", account: "work", ref: "note-2" }, observed_at: "2026-11-13T10:00:00Z", occurred_at: "2026-11-13" }) }).rec;
  const now = lib.readNamesShared(root), other = now.find(n => n.id === lib.meetingEntityId(second.id));
  assert.ok(other && now !== shared);
  assert.deepEqual(lib.mentionsIn(now, { content: "Send the terms.", meeting_id: second.id }), [other.name]);
  assert.deepEqual(lib.mentionsIn(now, note), [e.name]);
});

// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// A meeting is an entity of kind meeting (lib/meeting-entities.mjs): made when it is captured, its page
// collects the notes with its meeting id, attendees link to it with attended, old notes are never rewritten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";
import { parseSchema, checkRelation } from "../lib/schema.mjs";
import { createFilesBackend } from "../server/files-backend.mjs";
process.env.GTM_BRAIN_NO_COMMIT = "1"; process.env.GTM_BRAIN_NO_COMPILE = "1"; process.env.GTM_BRAIN_NO_WATCH = "1";
const plugin = new URL("../", import.meta.url).pathname;
const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_OPEN: "1" };

function brain() {
  const root = mkdtempSync(join(tmpdir(), "gtm-meeting-entities-"));
  mkdirSync(join(root, "brain")); mkdirSync(join(root, "work"));
  writeFileSync(join(root, "brain/admin.md"), lib.renderFrontmatter({ company: "Fixture", tools: ["granola"], team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  writeFileSync(join(root, "SCHEMA.md"), readFileSync(join(plugin, "templates/SCHEMA.md"), "utf8"));
  for (const slug of ["sales", "offer"]) lib.writeContext(root, slug, { title: slug });
  lib.startKindLayout(root);
  lib.addName(root, "Max Jendral"); lib.addName(root, "Eva Nowak");
  return root;
}
const meeting = (extra = {}) => ({ title: "Acme discovery", reference: { kind: "granola", account: "work", ref: "note-1" }, evidence: "transcript", occurrence: "happened", basis: "source",
  observed_at: "2026-11-12T10:00:00Z", occurred_at: "2026-11-12", capture: "complete", participants: [{ name: "Max Jendral", role: "attended" }, { name: "Eva Nowak", role: "invited" }], ...extra });
const source = [{ kind: "granola", ref: "https://notes.test/note-1?workspace=work" }];
function remember(root, entries) {
  const file = join(root, "work/input.json"); writeFileSync(file, JSON.stringify(entries));
  return spawnSync(process.execPath, [join(plugin, "scripts/gtm-brain-remember/remember.mjs"), root, "--by", "ann", "--batch", file], { env, encoding: "utf8" });
}

test("SCHEMA.md has a Meeting kind with a required date, and attended reaches a meeting", () => {
  const s = parseSchema(readFileSync(join(plugin, "templates/SCHEMA.md"), "utf8"));
  assert.deepEqual(s.kinds.meeting.fields.map(f => [f.name, f.required]), [["date", true], ["title", false], ["organizer", false], ["source", false]]);
  assert.equal(checkRelation(s, { type: "attended", fromKind: "person", toKind: "meeting" }).type, "attended");
  assert.ok(lib.NAME_KINDS.includes("meeting"));
});

test("a captured meeting makes a meeting entity with its attendees; the notes with its meeting id are on its page", () => {
  const root = brain();
  const r = remember(root, [{ context: "sales", content: "Acme discovery call: Max Jendral walked through their returns flow.", sources: ["granola:https://notes.test/note-1?workspace=work"], people: ["Max Jendral"], meeting: meeting() }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const anchor = lib.listContexts(root).flatMap(c => c.memories).find(m => m.meeting);
  const e = lib.readNames(root).find(n => n.kind === "meeting");
  assert.equal(e.id, lib.meetingEntityId(anchor.id));
  assert.equal(e.name, "Acme discovery 2026-11-12");
  assert.equal(e._path, `brain/entities/meetings/acme-discovery-2026-11-12-${e.id.slice(2, 8)}.md`);
  const outcome = lib.appendMemory(root, "offer", { authors: ["ann"], content: "They want a two-week pilot.", meeting_id: anchor.id, people: ["Max Jendral"], source }).rec;
  const facts = lib.entityFacts(root, e.id);
  assert.deepEqual(facts.evidence.map(m => m.id).sort(), [anchor.id, outcome.id].sort(), "the page collects the notes carrying its meeting id");
  lib.refreshEntityPages(root);
  const page = readFileSync(join(root, e._path), "utf8");
  assert.match(page, /## Attendees\n\nAttended: \[Max Jendral\]\(\.\.\/people\/max-jendral-[0-9a-f]{6}\.md\)\. Invited: \[Eva Nowak\]/);
  assert.match(page, /two-week pilot/);
  assert.match(page, /`granola:note-1`/, "the transcript stays in its tool, pointed to");
  const rel = lib.relationOverview(root, { entity: e.id }).relations;
  assert.deepEqual(rel.map(x => [x.from.name, x.type, x.to.name]), [["Max Jendral", "attended", "Acme discovery 2026-11-12"]], "only who attended, not who was invited");
  assert.match(readFileSync(join(root, "brain/entities/meetings/index.md"), "utf8"), /\[Acme discovery 2026-11-12\]/);
  const b = createFilesBackend({ run() { throw new Error("read only"); } });
  assert.deepEqual(b.list("entities", { filters: { kind: "meeting" } }, { brain: root }).map(x => x.name), ["Acme discovery 2026-11-12"]);
  // the same meeting captured again finds the same entity
  remember(root, [{ context: "sales", content: "Acme discovery call: Max Jendral walked through their returns flow (updated transcript).", sources: ["granola:https://notes.test/note-1?workspace=work"], people: ["Max Jendral"], meeting: meeting({ observed_at: "2026-11-12T12:00:00Z" }) }]);
  assert.equal(lib.readNames(root).filter(n => n.kind === "meeting").length, 1);
});

test("meetings saved before meeting entities get theirs at the upgrade; their notes are not rewritten", () => {
  const root = brain();
  const anchor = lib.appendMemory(root, "sales", { authors: ["ann"], content: "Weekly sync with Max Jendral.", people: ["Max Jendral"], source, meeting: meeting({ title: "Weekly sync" }) }).rec;
  const second = lib.appendMemory(root, "sales", { authors: ["ann"], content: "Weekly sync again.", people: ["Max Jendral"], source: [{ kind: "granola", ref: "https://notes.test/note-2?workspace=work" }], meeting: meeting({ title: "Weekly sync", reference: { kind: "granola", account: "work", ref: "note-2" } }) }).rec;
  const pages = lib.readNames(root).filter(n => n.kind === "meeting");
  assert.deepEqual(pages.map(n => n.name).sort(), ["Weekly sync 2026-11-12", `Weekly sync 2026-11-12 (${second.id})`], "two meetings of one title on one day stay two");
  // a brain from before: no meeting entities
  for (const p of pages) rmSync(join(root, p._path));
  const bytes = lib.listContexts(root).map(c => readFileSync(join(c.dir, "memories.jsonl"), "utf8"));
  assert.equal(lib.readNames(root).filter(n => n.kind === "meeting").length, 0);
  assert.equal(lib.deriveMeetingEntities(root).length, 2);
  assert.equal(lib.deriveMeetingEntities(root).length, 0, "a second run adds nothing");
  assert.ok(lib.readNames(root).some(n => n.id === lib.meetingEntityId(anchor.id)));
  assert.deepEqual(lib.listContexts(root).map(c => readFileSync(join(c.dir, "memories.jsonl"), "utf8")), bytes);
});

test("the index status is ready, not stale, in a brain that has a meeting entity", async () => {
  const { memoryIndexMaintenance } = await import("../lib/memory-maintenance.mjs");
  const root = brain();
  const r = remember(root, [{ context: "sales", content: "Acme discovery call with Max Jendral.", tools: ["granola"], people: ["Max Jendral"], sources: source, meeting: meeting() }]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(lib.readNames(root).some(e => e.kind === "meeting"), "the save made a meeting entity");
  assert.equal(memoryIndexMaintenance(root, { mode: "rebuild", budget_ms: 5000 }).status, "ready");
  const status = memoryIndexMaintenance(root);
  assert.equal(status.identities_changed, false, "the status reads the registry the way the index stores it, meeting anchors included");
  assert.equal(status.status, "ready");
});

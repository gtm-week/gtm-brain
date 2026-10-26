import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, cpSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as lib from "../lib/brain.mjs";
import { readEntityChange } from "../lib/entities.mjs";
import { createFilesBackend } from "../server/files-backend.mjs";
process.env.GTM_BRAIN_NO_COMMIT = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
process.env.GTM_BRAIN_NO_WATCH = "1";
function setup() {
  const root = mkdtempSync(join(tmpdir(), "gtm-entity-lifecycle-"));
  mkdirSync(join(root, "brain"));
  writeFileSync(join(root, "brain/admin.md"), lib.renderFrontmatter({ company: "Fixture", team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  lib.writeContext(root, "sales", { title: "Sales" });
  lib.writeContext(root, "partners", { title: "Partners" });
  const source = lib.addName(root, "Chris", { emails: ["chris@fixture.test"] });
  const target = lib.addName(root, "Krzysztof Pawlak", { aliases: ["KP"] });
  return { root, source, target };
}
const get = (root, id) => lib.resolveEntity(lib.readNames(root), id);
const note = (root, person, content = "A recorded fact.", context = "sales") => lib.appendMemory(root, context, { authors: ["ann"], people: [person], content }).rec;
const memoryBytes = root => lib.listContexts(root).map(c => readFileSync(join(c.dir, "memories.jsonl"), "utf8"));
function snapshot(root, folder = "brain") {
  return Object.fromEntries(readdirSync(join(root, folder), { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => { const path = join(f.parentPath, f.name); return [path.slice(root.length), readFileSync(path, "utf8")]; }));
}
function merge(root, source, target, resolution = {}) {
  const args = { source: source.id, target: target.id, resolution };
  const preview = lib.mergeEntities(root, args);
  return lib.mergeEntities(root, { ...args, by: "ann", as_of: preview.as_of });
}
function undo(root, merge_id) {
  const p = lib.undoEntityMerge(root, { merge_id });
  return lib.undoEntityMerge(root, { merge_id, by: "ann", as_of: p.as_of });
}

for (const choice of ['source', 'target', 'combine']) test(`merge ${choice} resolves conflicting reference kinds and preserves all other kinds`, () => {
  const { root, source, target } = setup();
  const shared = { kind: 'website', ref: 'https://example.invalid' };
  lib.updateEntity(root, { entity: source.id, by: 'ann', set: { references: [{ kind: 'crm', ref: 'source' }, { kind: 'github', ref: 'source-profile' }, shared] } });
  lib.updateEntity(root, { entity: target.id, by: 'ann', set: { references: [{ kind: 'crm', ref: 'target' }, { kind: 'linkedin', ref: 'target-profile' }, shared] } });
  const result = merge(root, source, target, { references: choice });
  const refs = result.entity.references;
  assert.deepEqual(refs.filter(r => r.kind === 'crm').map(r => r.ref).sort(), choice === 'combine' ? ['source', 'target'] : [choice]);
  assert.ok(refs.some(r => r.kind === 'github')); assert.ok(refs.some(r => r.kind === 'linkedin'));
  assert.deepEqual(refs.filter(r => r.kind === 'website'), [shared]);
  assert.deepEqual(get(root, target.id).references, refs);
});

test("explicit updates preserve identity, file edits and history while replacing, adding and removing metadata", () => {
  const { root, source } = setup(); note(root, source.id);
  const path = join(root, source._path);
  writeFileSync(path, readFileSync(path, "utf8").replace("name: Chris", "# Preferred spelling\nname: Chris") + "\n## Personal notes\nAsk about the garden.\n");
  const before = memoryBytes(root);
  const r = lib.updateEntity(root, { entity: source.id, by: "ann", set: { name: "Chris Smith", aliases: ["Christopher"], emails: ["new@fixture.test"] }, add: { aliases: ["C Smith"], references: [{ kind: "crm", ref: "123" }] }, remove: { aliases: ["Christopher"] } });
  assert.equal(r.status, "updated");
  const saved = get(root, source.id);
  assert.equal(saved.id, source.id); assert.equal(saved._path, source._path);
  assert.equal(saved.name, "Chris Smith"); assert.deepEqual(saved.aliases.sort(), ["C Smith", "Chris"]);
  assert.deepEqual(saved.emails, ["new@fixture.test"]); assert.equal(saved.references[0].ref, "123");
  assert.match(readFileSync(path, "utf8"), /# Preferred spelling/); assert.match(saved._body, /Ask about the garden/);
  assert.deepEqual(memoryBytes(root), before); assert.equal(lib.entityFacts(root, saved.id).evidence.length, 1);
  lib.updateEntity(root, { entity: saved.id, by: "ann", remove: { aliases: ["Chris"], references: [{ kind: "crm", ref: "123" }] } });
  assert.deepEqual(get(root, saved.id).references, []);
  const bytes = snapshot(root);
  assert.equal(lib.updateEntity(root, { entity: saved.id, by: "ann", set: { name: saved.name } }).changed, false);
  assert.deepEqual(snapshot(root), bytes);
});

test("invalid updates and alias merges fail without partial changes", () => {
  const { root, source, target } = setup(), before = snapshot(root);
  for (const args of [{ set: { id: target.id } }, { set: { kind: null } }, { set: { emails: "bad" } }, { add: { aliases: [target.name] } }, { set: { kind: "person", subtype: "team" } }, { add: { references: [{ kind: "crm" }] } }, { set: { name: "bad\nname" } }]) {
    assert.throws(() => lib.updateEntity(root, { entity: source.id, by: "ann", ...args }));
    assert.deepEqual(snapshot(root), before);
  }
  assert.throws(() => lib.addName(root, target.id, { aliases: [source.name] }), /merge_entities/);
  assert.throws(() => lib.addName(root, "New Person", { aliases: [source.name] }), /merge_entities/);
  assert.deepEqual(snapshot(root), before);
  assert.throws(() => lib.updateEntity(root, { entity: source.name, by: "ann", set: { name: "No" } }), /stable entity ID/);
  assert.throws(() => lib.archiveEntity(root, { entity: source.id, by: "unknown" }), /team member/);
});

test("merge preview is read-only, detects stale evidence and refuses unresolved identity conflicts", () => {
  const { root, source, target } = setup();
  lib.updateEntity(root, { entity: source.id, by: "ann", set: { kind: "organization", subtype: "company", not_same: [target.id], references: [{ kind: "crm", ref: "source" }] } });
  lib.updateEntity(root, { entity: target.id, by: "ann", add: { references: [{ kind: "crm", ref: "target" }] } });
  note(root, source.id); const before = snapshot(root);
  const args = { source: source.id, target: target.id }, p = lib.mergeEntities(root, args);
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(p.unresolved.sort(), ["allow_distinct", "kind", "references", "subtype"]);
  assert.equal(p.impact[0].contexts[0].context, "sales");
  assert.throws(() => lib.mergeEntities(root, { ...args, as_of: p.as_of, by: "ann" }), /Resolve merge conflicts/);
  const resolution = { kind: "person", subtype: null, allow_distinct: true, references: "target" };
  const resolved = lib.mergeEntities(root, { ...args, resolution });
  note(root, target.id, "New evidence changes the preview.");
  assert.throws(() => lib.mergeEntities(root, { ...args, resolution, as_of: resolved.as_of, by: "ann" }), /stale/);
  const result = merge(root, source, target, resolution);
  assert.equal(result.entity.kind, "person"); assert.deepEqual(result.entity.references, [{ kind: "crm", ref: "target" }]);
  assert.deepEqual(result.entity.not_same, []);
});

test("merge preserves retired IDs and source Markdown; reversal travels with the brain and keeps later memories attributed", () => {
  const { root, source, target } = setup();
  note(root, source.id, "Chris sponsors events."); note(root, target.id, "Partner terms under review.", "partners");
  writeFileSync(join(root, source._path), readFileSync(join(root, source._path), "utf8") + "\nSource handwritten notes.\n");
  const before = memoryBytes(root), m = merge(root, source, target);
  assert.equal(get(root, source.id).id, target.id);
  assert.match(readFileSync(join(root, source._path), "utf8"), /Source handwritten notes/);
  assert.equal(lib.entityFacts(root, target.id).evidence.length, 2);
  assert.deepEqual(memoryBytes(root), before);
  assert.ok(get(root, target.id).merge_ids.includes(m.merge_id));
  assert.throws(() => lib.archiveEntity(root, { entity: source.id, by: "ann" }), /retired/);
  const later = note(root, target.id, "A note captured after merging.");
  const facts = lib.entityFacts(root, target.id);
  lib.compileEntity(root, target.id, { by: "ann", as_of: facts.as_of, brief: { overview: [{ text: "A new note is available.", memories: [later.id] }], contexts: facts.contexts.map(c => ({ context: c.context, summary: [{ text: c.memories[0].content, memories: [c.memories[0].id] }], open_threads: [] })), relationships: [] } });
  const copy = mkdtempSync(join(tmpdir(), "gtm-entity-recovery-")); cpSync(join(root, "brain"), join(copy, "brain"), { recursive: true });
  const preview = lib.undoEntityMerge(copy, { merge_id: m.merge_id });
  assert.deepEqual(preview.conflicts, []); assert.equal(preview.memories_kept_with_survivor[0].id, later.id);
  const bytes = memoryBytes(copy); const undone = undo(copy, m.merge_id);
  assert.equal(undone.status, "unmerged"); assert.equal(get(copy, source.id).id, source.id);
  assert.deepEqual(get(copy, target.id).previous_ids, []); assert.match(get(copy, source.id)._body, /Source handwritten notes/);
  assert.deepEqual(memoryBytes(copy), bytes);
  assert.ok(lib.entityFacts(copy, target.id).evidence.some(m => m.id === later.id));
  assert.ok(!lib.entityFacts(copy, source.id).evidence.some(m => m.id === later.id));
});

test("merge reversal refuses handwritten or identity edits, and dependent merges must be undone in reverse order", () => {
  const { root, source, target } = setup(); const m = merge(root, source, target);
  const path = join(root, target._path), before = readFileSync(path, "utf8");
  writeFileSync(path, before + "\nMy new notes.\n");
  const p = lib.undoEntityMerge(root, { merge_id: m.merge_id }), bytes = snapshot(root);
  assert.equal(p.conflicts.length, 1);
  assert.throws(() => lib.undoEntityMerge(root, { merge_id: m.merge_id, as_of: p.as_of, by: "ann" }), /reviewing changes/);
  assert.deepEqual(snapshot(root), bytes);
  writeFileSync(path, before);
  const third = lib.addName(root, "Another Identity"), later = merge(root, third, target);
  assert.ok(lib.undoEntityMerge(root, { merge_id: m.merge_id }).conflicts.length);
  undo(root, later.merge_id); assert.deepEqual(lib.undoEntityMerge(root, { merge_id: m.merge_id }).conflicts, []);
  undo(root, m.merge_id); assert.equal(get(root, source.id).id, source.id);
  assert.throws(() => lib.undoEntityMerge(root, { merge_id: "ec_00000000-0000-0000-0000-000000000000" }), /older merges.*file history/);
});

test("archive hides active lists but keeps identity, citations and captured memories resolvable; restore is idempotent", () => {
  const { root, source } = setup(); note(root, source.id);
  const bytes = memoryBytes(root), b = createFilesBackend({ run() { throw new Error("read only"); } }), ctx = { brain: root };
  const count = b.count("entities", ctx);
  lib.archiveEntity(root, { entity: source.id, by: "ann" });
  assert.equal(b.count("entities", ctx), count - 1);
  assert.ok(!b.list("entities", {}, ctx).some(e => e.id === source.id));
  assert.equal(b.list("entities", { filters: { id: source.id } }, ctx)[0].status, "archived");
  assert.equal(b.list("entities", { filters: { status: "archived" } }, ctx)[0].id, source.id);
  assert.match(lib.entityBrief(root, source.id).markdown, /archived/i);
  assert.deepEqual(memoryBytes(root), bytes);
  assert.ok(!lib.staleEntities(root).some(e => e.id === source.id));
  note(root, source.id, "Another historical reference.");
  assert.equal(get(root, source.id).status, "archived");
  assert.equal(lib.archiveEntity(root, { entity: source.id, by: "ann" }).changed, false);
  assert.equal(lib.archiveEntity(root, { entity: source.id, by: "ann", undo: true }).status, "active");
  assert.equal(lib.archiveEntity(root, { entity: source.id, by: "ann", undo: true }).changed, false);
});

test("interrupted merge recovers complete identities; conflicting manual edits produce a repair proposal", () => {
  for (const edited of [false, true]) {
    const { root, source, target } = setup(), merged = merge(root, source, target), rec = readEntityChange(root, merged.merge_id);
    const folder = join(root, "brain/entities/.history");
    // Simulate a process dying after the target write but before the redirect write.
    for (const [i, c] of rec.changes.entries()) writeFileSync(join(root, c.path), i === 0 ? c.after : c.before);
    renameSync(join(folder, rec.id + ".json"), join(folder, rec.id + ".pending"));
    if (edited) {
      writeFileSync(join(root, source._path), rec.changes[1].before + "\nHuman edit during interruption.\n");
      const before = snapshot(root);
      assert.throws(() => lib.readNames(root), e => e.code === "ENTITY_FORMAT" && e.repair.field === "interrupted change");
      assert.deepEqual(snapshot(root), before);
    } else {
      assert.equal(get(root, source.id).id, target.id);
      assert.ok(existsSync(join(folder, rec.id + ".json")));
      undo(root, rec.id); assert.equal(get(root, source.id).id, source.id);
    }
  }
});


test("reusing a removed old name cannot overwrite its stable identity or a retired ID", () => {
  const { root, source } = setup();
  lib.updateEntity(root, { entity: source.id, by: "ann", set: { name: "Christopher Smith" }, remove: { aliases: [source.name] } });
  const replacement = lib.addName(root, source.name);
  assert.notEqual(replacement.id, source.id);
  assert.equal(get(root, source.id).name, "Christopher Smith");
  assert.notEqual(replacement._path, source._path);
  const team = get(root, "Ann Lee");
  lib.updateEntity(root, { entity: team.id, by: "ann", set: { name: "Ann Smith" }, remove: { aliases: ["Ann Lee"] } });
  assert.equal(lib.readNames(root).filter(e => e.id === team.id).length, 1);
  assert.equal(get(root, team.id).name, "Ann Smith");
});

test("an editor changing the file during validation cannot be overwritten by an identity update", () => {
  const { root, source } = setup(), path = join(root, source._path), original = readFileSync(path, "utf8");
  const edited = original + "\nA concurrently saved note.\n";
  const set = { get name() { writeFileSync(path, edited); return "Chris Smith"; } };
  assert.throws(() => lib.updateEntity(root, { entity: source.id, by: "ann", set }), /file changed/);
  assert.equal(readFileSync(path, "utf8"), edited);
  assert.equal(get(root, source.id).name, "Chris");
});

test("frontmatter comments added after a merge block reversal without losing the comment", () => {
  const { root, source, target } = setup(), m = merge(root, source, target), path = join(root, target._path);
  writeFileSync(path, readFileSync(path, "utf8").replace("name:", "# Keep this preferred spelling\nname:"));
  const before = snapshot(root), preview = lib.undoEntityMerge(root, { merge_id: m.merge_id });
  assert.equal(preview.conflicts.length, 1);
  assert.throws(() => lib.undoEntityMerge(root, { merge_id: m.merge_id, as_of: preview.as_of, by: "ann" }), /reviewing changes/);
  assert.deepEqual(snapshot(root), before);
});

test("legacy files require migration before lifecycle previews, preserving reversible snapshots", () => {
  const { root, source, target } = setup(), path = join(root, source._path);
  writeFileSync(path, readFileSync(path, "utf8").replace("gtm-brain-entity-v2", "gtm-brain-entity-v1"));
  const before = snapshot(root);
  assert.throws(() => lib.mergeEntities(root, { source: source.id, target: target.id }), /Upgrade the legacy registry/);
  assert.deepEqual(snapshot(root), before);
  lib.migrateEntities(root); const result = merge(root, source, target);
  assert.equal(undo(root, result.merge_id).status, "unmerged");
});

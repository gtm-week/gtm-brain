import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";
import { createFilesBackend } from "../server/files-backend.mjs";
import { loadOntology, buildTools } from "../lib/ontology/index.mjs";

process.env.GTM_OS_NO_COMMIT = "1";
process.env.GTM_OS_NO_COMPILE = "1";
process.env.GTM_OS_NO_WATCH = "1";
function setup() {
  const root = mkdtempSync(join(tmpdir(), "gtm-formal-entity-"));
  mkdirSync(join(root, "brain"));
  writeFileSync(join(root, "brain", "admin.md"), lib.renderFrontmatter({ company: "Fixture", team: [{ name: "Ann Lee", handle: "ann", email: "ann@example.test" }] }));
  lib.writeContext(root, "sales", { title: "Sales" });
  lib.writeContext(root, "partners", { title: "Partners" });
  return root;
}
const note = (root, context, content, extra = {}) => lib.appendMemory(root, context, { authors: ["ann"], content, people: ["Acme"], ...extra }).rec;
const backend = () => createFilesBackend({ run: () => { throw new Error("read path must not invoke a writer"); } });
const read = (root, filters = {}, object = "entities") => backend().list(object, { filters }, { brain: root });

test("entity and brain modules can be loaded in either order", () => {
  const entityModule = new URL("../lib/entities.mjs", import.meta.url).href;
  execFileSync(process.execPath, ["--input-type=module", "-e", `const entities = await import(${JSON.stringify(entityModule)}); if (entities.ENTITY_KINDS.length !== 3) process.exit(1);`]);
  assert.deepEqual(lib.NAME_KINDS, ["person", "organization", "product"]);
});

test("the formal catalog exposes entities, their writers, and usable memory/context links", async () => {
  const root = setup();
  const acme = lib.addName(root, "Acme", { kind: "organization", subtype: "company", aliases: ["Acme Labs"] });
  const sales = note(root, "sales", "Acme renewed on 12 June 2026.");
  const partner = note(root, "partners", "Acme wants a referral arrangement.");
  const model = await loadOntology(new URL("../ontology/gtm-os.ossie.json", import.meta.url).pathname);
  const tools = buildTools(model, backend());
  const call = async (name, args) => (await tools.find(t => t.name === name).call(args, { brain: root })).content[0].text;
  const catalog = await call("list_objects", {});
  assert.match(catalog, /- entities /);
  assert.match(catalog, /memories.entities -> entities.id/);
  assert.match(catalog, /entities.contexts -> contexts.slug/);
  const description = await call("describe_object", { name: "entities" });
  assert.match(description, /Key: id/);
  assert.match(description, /add_name\(/);
  assert.match(description, /compile_entity\(/);
  assert.match(description, /subtype/);
  const result = await call("query", { object: "entities", filters: { kind: "organization", subtype: "company", aliases: "Acme Labs", contexts: "sales" } });
  const row = JSON.parse(result.split("\n")[1]);
  assert.equal(row.id, acme.id);
  assert.deepEqual(row.contexts.sort(), ["partners", "sales"]);
  assert.deepEqual(row.memories.sort(), [sales.id, partner.id].sort());
  assert.ok(Object.keys(row).every(k => !k.startsWith("_")));
  const evidence = await call("query", { object: "memories", filters: { entities: row.id, context: "sales" } });
  assert.match(evidence, /12 June 2026/);
  assert.doesNotMatch(evidence, /referral arrangement/);
});

test("retired IDs resolve through ontology queries without duplicating entities or rewriting memories", () => {
  const root = setup();
  const original = lib.addName(root, "Acme", { kind: "company" });
  const memory = note(root, "sales", "Acme renewed.");
  const merged = lib.addName(root, "Acme Labs", { kind: "organization", subtype: "company" });
  const args = { source: original.id, target: merged.id };
  lib.mergeEntities(root, { ...args, by: "ann", as_of: lib.mergeEntities(root, args).as_of });
  assert.equal(read(root, { id: original.id })[0].id, merged.id);
  assert.deepEqual(read(root, { entities: original.id }, "memories").map(m => m.id), [memory.id]);
  assert.equal(read(root, { kind: "organization" }).length, 1);
  assert.deepEqual(lib.readMemories(root, "sales")[0].entities, [original.id]);
});

test("v1 identities normalize on read and migrate with source backups, stable links and handwritten text intact", () => {
  const root = setup();
  const originals = [["Acme", "company"], ["Acme Sales", "team"]].map(([name, kind]) => ({ ...lib.addName(root, name, { kind }), oldKind: kind }));
  for (const e of originals) {
    const path = join(root, e._path), text = readFileSync(path, "utf8");
    writeFileSync(path, text.replace("gtm-os-entity-v2", "gtm-os-entity-v1").replace("kind: organization", `kind: ${e.oldKind}`).replace(/^subtype:.*\n/m, "") + `\nHandwritten ${e.name} notes.\n`);
  }
  const m = note(root, "sales", "Acme agreed terms.");
  const before = lib.readNames(root).filter(e => e.kind === "organization").map(e => ({ id: e.id, path: e._path, text: readFileSync(join(root, e._path), "utf8"), subtype: e.subtype }));
  const history = join(lib.readContext(root, "sales").dir, "memories.jsonl"), originalHistory = readFileSync(history, "utf8");
  assert.deepEqual(read(root, { kind: "organization" }).map(e => e.subtype).sort(), ["company", "team"]);
  for (const e of before) assert.equal(readFileSync(join(root, e.path), "utf8"), e.text, "query leaves v1 source intact");
  assert.equal(lib.migrateEntities(root), true);
  assert.equal(lib.migrateEntities(root), false, "migration is idempotent");
  const folders = readdirSync(join(root, "work", "entity-migration"));
  for (const e of before) {
    const saved = lib.resolveEntity(lib.readNames(root), e.id);
    assert.equal(saved._path, e.path);
    assert.equal(saved.subtype, e.subtype);
    assert.equal(saved._fm.format, "gtm-os-entity-v2");
    assert.match(saved._body, /Handwritten/);
    assert.ok(folders.some(folder => {
      try { return readFileSync(join(root, "work", "entity-migration", folder, e.path.split("/").at(-1)), "utf8") === e.text; } catch { return false; }
    }), "original source bytes are backed up");
  }
  assert.equal(readFileSync(history, "utf8"), originalHistory);
  assert.equal(read(root, { entities: before.find(e => e.subtype === "company").id }, "memories")[0].id, m.id);
});

test("organization subtypes are validated and invalid edited metadata yields a repair proposal", () => {
  const root = setup();
  assert.throws(() => lib.addName(root, "Chris", { kind: "person", subtype: "team" }), /subtype/);
  assert.throws(() => lib.addName(root, "Acme", { kind: "organization", subtype: "customer".repeat(20) }), /subtype/);
  assert.ok(!lib.resolveEntity(lib.readNames(root), "Chris"));
  const e = lib.addName(root, "Acme", { kind: "organization", subtype: "nonprofit" });
  lib.addName(root, "Acme", { aliases: ["Acme Foundation"] });
  assert.equal(read(root, { id: e.id })[0].subtype, "nonprofit");
  lib.addName(root, "Acme", { subtype: null });
  assert.equal(read(root, { id: e.id })[0].subtype, null);
  const path = join(root, e._path), original = readFileSync(path, "utf8").replace("subtype: null", "subtype: 17");
  writeFileSync(path, original);
  assert.throws(() => read(root), error => error.code === "ENTITY_FORMAT" && error.repair.path === e._path && /subtype/.test(error.repair.field));
  assert.equal(readFileSync(path, "utf8"), original);
  for (const value of ["false", "0", '\"\"']) {
    const legacy = original.replace("gtm-os-entity-v2", "gtm-os-entity-v1").replace("kind: organization", "kind: company").replace("subtype: 17", `subtype: ${value}`);
    writeFileSync(path, legacy);
    assert.throws(() => read(root), error => error.code === "ENTITY_FORMAT" && /subtype/.test(error.repair.field));
    assert.equal(readFileSync(path, "utf8"), legacy, "invalid legacy metadata is never silently normalized");
  }
});

test("withdrawn facts leave identity and history links but do not remain supporting evidence", () => {
  const root = setup(), e = lib.addName(root, "Acme", { kind: "organization" });
  const old = note(root, "sales", "Acme is a customer.");
  note(root, "sales", "The customer claim was incorrect.", { people: [], retracts: old.id });
  const row = read(root, { id: e.id })[0];
  assert.deepEqual(row.memories, []);
  assert.deepEqual(row.contexts, ["sales"]);
  assert.equal(row.kind, "organization");
});

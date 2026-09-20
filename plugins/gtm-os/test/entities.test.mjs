import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";

process.env.GTM_OS_NO_COMMIT = "1";
process.env.GTM_OS_NO_COMPILE = "1";
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-entity-files-"));
  mkdirSync(join(root, "brain"));
  writeFileSync(join(root, "brain", "admin.md"), lib.renderFrontmatter({ company: "Example", team: [{ name: "Ann Lee", handle: "ann", email: "ann@example.com" }] }));
  lib.writeContext(root, "events", { title: "Events", rule: "Event organizing" });
  lib.writeContext(root, "partners", { title: "Partnerships", rule: "Referral partnerships" });
  return root;
};
const note = (root, context, content, extra = {}) => lib.appendMemory(root, context, { authors: ["ann"], people: ["Chris"], content, source: [{ kind: "gmail", ref: "message-1" }], ...extra }).rec;
const claim = (text, ...memories) => ({ text, memories: memories.map(m => m.id) });
function compiled(root, a, b) {
  return { overview: [claim("Chris organizes sponsors and is discussing referrals.", a, b)], contexts: [
    { context: "events", summary: [claim("Chris coordinates sponsors.", a)], open_threads: [] },
    { context: "partners", summary: [claim("Referral terms remain unresolved.", b)], open_threads: [claim("Confirm the referral terms.", b)] },
  ], relationships: [] };
}

test("identity files retain comma-containing aliases and contact evidence; memories reference stable IDs", () => {
  const root = setup();
  const e = lib.addName(root, "Krzysztof Pawlak", { aliases: ["Chris", "Pawlak, Chris"], references: [{ kind: "attio_person", ref: "record-123" }], sources: [{ kind: "user", ref: "ann" }] });
  const m = note(root, "events", "Chris coordinates sponsors.");
  assert.deepEqual(m.entities, [e.id]);
  lib.commit(root, ["brain"], "test capture");
  const saved = lib.resolveEntity(lib.readNames(root), "Pawlak, Chris");
  assert.equal(saved.id, e.id);
  assert.deepEqual(saved.references, [{ kind: "attio_person", ref: "record-123" }]);
  assert.deepEqual(saved.identity_sources, [{ kind: "user", ref: "ann" }]);
  assert.match(readFileSync(join(root, saved._path), "utf8"), /# Krzysztof Pawlak/);
  assert.ok(!existsSync(join(root, "brain", "entities.md")));
  assert.ok(!existsSync(join(root, "work", "people")));
});

test("legacy migration preserves identities and original files without rewriting any memories", () => {
  const root = setup();
  const legacy = "# Names\n\nCustom original text.\n- Chris | aliases: Krzysztof Pawlak | emails: chris@example.com\n- Acme | kind: company\n";
  writeFileSync(join(root, "brain", "names.md"), legacy);
  note(root, "events", "Chris coordinates sponsors.");
  const path = join(root, "brain", "contexts", "events", "memories.jsonl"), before = readFileSync(path, "utf8");
  const id = lib.resolveEntity(lib.readNames(root), "Chris").id;
  lib.writeNames(root, lib.readNames(root));
  assert.equal(readFileSync(path, "utf8"), before);
  assert.equal(lib.resolveEntity(lib.readNames(root), "Chris").id, id);
  assert.equal(lib.resolveEntity(lib.readNames(root), "Acme").kind, "organization");
  const backups = readdirSync(join(root, "work", "entity-migration"));
  assert.equal(readFileSync(join(root, "work", "entity-migration", backups[0], "names.md"), "utf8"), legacy);
  assert.ok(!existsSync(join(root, "brain", "names.md")));
});

test("confirmed merges retain old IDs and links; changing a Different answer needs an explicit merge", () => {
  const root = setup();
  const chris = lib.addName(root, "Chris"), m = note(root, "events", "Chris coordinates sponsors.");
  const full = lib.addName(root, "Krzysztof Pawlak");
  const args = { source: chris.id, target: full.id };
  lib.mergeEntities(root, { ...args, by: "ann", as_of: lib.mergeEntities(root, args).as_of });
  const registry = lib.readNames(root);
  assert.equal(lib.resolveEntity(registry, chris.id).id, full.id);
  assert.ok(lib.mentionsIn(registry, m).includes(full.name));
  assert.equal(lib.entityFacts(root, full.id).evidence.length, 1);
  assert.match(readFileSync(join(root, chris._path), "utf8"), /redirect: e_/);
  lib.addName(root, "Other Chris", { not: ["Krzysztof Pawlak"] });
  const before = registry.map(e => e.id);
  assert.ok(lib.readNames(root).some(e => e.name === "Other Chris"));
  const other = lib.resolveEntity(lib.readNames(root), "Other Chris");
  const correction = { source: other.id, target: full.id, resolution: { allow_distinct: true } };
  lib.mergeEntities(root, { ...correction, by: "ann", as_of: lib.mergeEntities(root, correction).as_of });
  assert.ok(!lib.readNames(root).some(e => e.name === "Other Chris"));
  assert.ok(before.every(id => lib.resolveEntity(lib.readNames(root), id)));
});

test("briefs compile across contexts with citations and scoped reads leave loaded contexts unchanged", () => {
  const root = setup(); lib.addName(root, "Chris");
  const a = note(root, "events", "Chris coordinates sponsors.", { at: "2026-09-10T12:00:00Z" });
  const b = note(root, "partners", "Chris wants referrals; terms remain unresolved.", { at: "2026-09-09T12:00:00Z" });
  const facts = lib.entityFacts(root, "Chris"), brief = compiled(root, a, b);
  lib.compileEntity(root, "Chris", { by: "ann", as_of: facts.as_of, brief });
  const view = lib.entityBrief(root, "Chris");
  assert.equal(view.stale, false);
  assert.match(view.markdown, /organizes sponsors and is discussing referrals/);
  assert.ok(view.markdown.includes(a.id.replace("_", "\\_"))); assert.match(view.markdown, /https:\/\/mail.google.com/);
  const before = lib.readLoaded(root);
  const scoped = lib.entityBrief(root, "Chris", { context: "events" });
  assert.match(scoped.markdown, /coordinates sponsors/);
  assert.doesNotMatch(scoped.markdown, /Referral terms|referral terms|Partnerships/);
  assert.deepEqual(lib.readLoaded(root), before);
});

test("new backdated evidence invalidates a brief; stale compilation and wrong-context citations are rejected", () => {
  const root = setup(); lib.addName(root, "Chris");
  const a = note(root, "events", "Chris coordinates sponsors."), b = note(root, "partners", "Referral terms remain unresolved.");
  const facts = lib.entityFacts(root, "Chris"), brief = compiled(root, a, b);
  const invalid = structuredClone(brief); invalid.contexts[0].summary[0].memories = [b.id];
  assert.throws(() => lib.compileEntity(root, "Chris", { by: "ann", as_of: facts.as_of, brief: invalid }), /does not belong/);
  lib.compileEntity(root, "Chris", { by: "ann", as_of: facts.as_of, brief });
  note(root, "events", "Historical preference from May.", { at: "2026-05-01T10:00:00Z" });
  const view = lib.entityBrief(root, "Chris");
  assert.equal(view.stale, true);
  assert.equal(view.compilation, null);
  assert.doesNotMatch(view.markdown, /organizes sponsors and is discussing referrals/);
  assert.throws(() => lib.compileEntity(root, "Chris", { by: "ann", as_of: facts.as_of, brief }), /changed/);
});

test("withdrawals remove current claims and relationships but retain the reason and source history", () => {
  const root = setup(); lib.addName(root, "Chris"); lib.addName(root, "Acme", { kind: "company" });
  const a = note(root, "events", "Chris works at Acme.");
  note(root, "events", "That employer attribution was incorrect.", { people: [], retracts: a.id });
  const view = lib.entityBrief(root, "Chris");
  assert.equal(view.evidence.length, 0);
  assert.match(view.markdown, /employer attribution was incorrect/);
  assert.doesNotMatch(view.markdown, /Chris works at Acme/);
  assert.match(view.markdown, /Full memory history/);
});

test("a corrected attribution retains the original context history without giving another person's facts to the entity", () => {
  const root = setup(); lib.addName(root, "Chris"); lib.addName(root, "Alice");
  const old = note(root, "events", "Chris coordinates sponsors.");
  note(root, "events", "Alice coordinates sponsors; the original attribution was wrong.", { people: ["Alice"], supersedes: old.id });
  const view = lib.entityBrief(root, "Chris", { context: "events" });
  assert.equal(view.evidence.length, 0);
  assert.match(view.markdown, /Full memory history/);
  assert.doesNotMatch(view.markdown, /Chris coordinates|Alice coordinates/);
});

test("shared mailboxes and ambiguous aliases do not establish identity or attach text evidence", () => {
  const root = setup();
  const a = lib.addName(root, "Chris One", { emails: ["team@example.com"], aliases: ["Chris"] });
  const b = lib.addName(root, "Chris Two", { emails: ["team@example.com"] });
  assert.notEqual(a.id, b.id);
  assert.equal(lib.canonicalName(lib.readNames(root), "team@example.com"), null);
  assert.throws(() => lib.addName(root, "team@example.com", { kind: "person" }), /Ambiguous identity/);
  // Simulate historical ambiguity without authorizing a merge.
  const names = lib.readNames(root); names.find(e => e.id === b.id).aliases.push("Chris");
  lib.writeNames(root, names);
  const m = note(root, "events", "Chris coordinates sponsors.", { people: [] });
  assert.deepEqual(m.entities, []);
  assert.equal(lib.entityFacts(root, a.id).evidence.length, 0);
  assert.equal(lib.entityFacts(root, b.id).evidence.length, 0);
});

test("company briefs include text-only legacy evidence, archives and labeled interpretations", () => {
  const root = setup();
  const acme = lib.addName(root, "Acme", { kind: "company" });
  const m = note(root, "partners", "Acme asked about a referral arrangement.", { people: [] });
  lib.setContextStatus(root, "partners", "archived");
  const facts = lib.entityFacts(root, acme.id);
  lib.compileEntity(root, acme.id, { by: "ann", as_of: facts.as_of, brief: {
    overview: [{ ...claim("Acme may be interested in referrals; evidence is historical.", m), interpretation: true }],
    contexts: [{ context: "partners", summary: [claim("Acme asked about referrals.", m)], open_threads: [] }], relationships: [],
  } });
  const view = lib.entityBrief(root, acme.id, { absoluteLinks: true });
  assert.match(view.markdown, /Interpretation:/); assert.match(view.markdown, /\(archived\)/);
  assert.ok(view.markdown.includes(root));
  assert.equal(view.entity.kind, "organization");
});

test("the scheduled run compiles stale entities even when all context covers are current", () => {
  const root = setup(); lib.addName(root, "Chris");
  note(root, "events", "Chris coordinates sponsors.");
  const c = lib.readContext(root, "events");
  lib.writeContext(root, "events", { ...c.fm, compiled_at: new Date().toISOString(), rule: c.rule });
  assert.equal(lib.readContext(root, "events").stale, false);
  assert.equal(lib.staleEntities(root).length, 1);
  assert.notEqual(lib.compilePlan(root).wait, null);
  writeFileSync(join(root, "AGENTS.md"), "Synthetic test brain.\n");
  const bin = join(root, "bin"); mkdirSync(bin);
  writeFileSync(join(bin, "codex"), '#!/bin/sh\nprintf "%s" "$*" > work/scheduled-prompt.txt\n', { mode: 0o755 });
  const plugin = new URL("..", import.meta.url).pathname;
  execFileSync("bash", [join(plugin, "scripts", "gtm-os-schedule", "scheduled-run.sh"), root], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PLUGIN_ROOT: plugin }, stdio: "pipe" });
  const prompt = readFileSync(join(root, "work", "scheduled-prompt.txt"), "utf8");
  assert.match(prompt, /entity_facts and compile_entity/);
  assert.ok(prompt.includes(lib.resolveEntity(lib.readNames(root), "Chris").id));
});

test("concurrent identity updates preserve both aliases and never leave half-written files", async () => {
  const root = setup(); lib.addName(root, "Chris");
  const { spawn } = await import("node:child_process");
  const file = new URL("../lib/brain.mjs", import.meta.url).href;
  const update = alias => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", 'const l=await import(process.argv[1]);l.addName(process.argv[2],"Chris",{aliases:[process.argv[3]]});', file, root, alias], { env: process.env, stdio: ["ignore", "ignore", "pipe"] });
    let error = ""; child.stderr.on("data", d => error += d); child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(error)));
  });
  await Promise.all([update("Christopher"), update("Krzysztof")]);
  assert.deepEqual(lib.resolveEntity(lib.readNames(root), "Chris").aliases.sort(), ["Christopher", "Krzysztof"]);
  assert.ok(!readdirSync(join(root, "brain", "entities")).some(f => f.endsWith(".tmp")));
});

test("valid manual identity and Markdown edits survive refresh and compilation, and remain separate from context evidence", () => {
  const root = setup(), e = lib.addName(root, "Chris"), path = join(root, e._path);
  const a = note(root, "events", "Chris coordinates sponsors."), b = note(root, "partners", "Chris wants referrals.");
  lib.compileEntity(root, e.id, { by: "ann", as_of: lib.entityFacts(root, e.id).as_of, brief: compiled(root, a, b) });
  const before = lib.entityFacts(root, e.id), { fm, body } = lib.parseFrontmatter(readFileSync(path, "utf8"));
  const handwritten = body + "\n## My notes\n\nAsk about the partnership at our next meeting.\n";
  writeFileSync(path, lib.renderFrontmatter({ ...fm, aliases: ["Christopher"], preferred_contact: "Email" }).replace("aliases: [Christopher]", "# Use this spelling in introductions\naliases: ['Christopher']") + handwritten);
  const edited = lib.entityFacts(root, "Christopher");
  assert.equal(edited.entity.id, e.id);
  assert.notEqual(edited.as_of, before.as_of);
  assert.equal(edited.file_notes.markdown, handwritten);
  assert.equal(edited.evidence.length, 2, "a handwritten note does not create a memory");
  assert.throws(() => lib.compileEntity(root, e.id, { by: "ann", as_of: before.as_of, brief: compiled(root, a, b) }), /changed/);
  lib.commit(root, ["brain"], "save manual edits");
  lib.addName(root, e.id, { emails: ["chris@example.com"] });
  lib.compileEntity(root, e.id, { by: "ann", as_of: lib.entityFacts(root, e.id).as_of, brief: compiled(root, a, b) });
  const saved = lib.parseFrontmatter(readFileSync(path, "utf8"));
  assert.equal(saved.body, handwritten);
  assert.equal(saved.fm.preferred_contact, "Email");
  assert.match(readFileSync(path, "utf8"), /# Use this spelling in introductions\naliases: \['Christopher'\]/);
  const global = lib.entityBrief(root, e.id);
  assert.equal(global.stale, false);
  assert.match(global.markdown, /Saved Markdown/);
  assert.match(global.markdown, /Ask about the partnership/);
  assert.doesNotMatch(lib.entityBrief(root, e.id, { context: "events" }).markdown, /Ask about the partnership/);
});

test("malformed editable metadata yields a file and field repair proposal without rewriting any entity", () => {
  const root = setup(), e = lib.addName(root, "Chris"), path = join(root, e._path), original = readFileSync(path, "utf8");
  const variants = [
    [original.replace("aliases: []", "aliases: Christopher"), "aliases"],
    [original.replace("aliases: []", 'aliases: ["Christopher"'), "aliases"],
    [original.replace("aliases: []", "aliases: []\naliases: [Christopher]"), "aliases"],
    [original.replace("---\n", "---\nA note in the wrong place\n"), "line 2"],
    [original.replace("format:", "broken-format:"), "format"],
    [original.replace("---\n", ""), "frontmatter"],
  ];
  for (const [text, field] of variants) {
    writeFileSync(path, text);
    const verify = error => {
      assert.equal(error.code, "ENTITY_FORMAT");
      assert.equal(error.repair.path, e._path); assert.equal(error.repair.field, field);
      assert.match(error.message, /Proposed fix:/); assert.match(error.message, /left unchanged/);
      return true;
    };
    assert.throws(() => lib.readNames(root), verify);
    assert.throws(() => lib.addName(root, "New Person"), verify);
    assert.throws(() => lib.refreshEntityPages(root), verify);
    assert.equal(readFileSync(path, "utf8"), text);
  }
  writeFileSync(path, original);
  assert.ok(lib.resolveEntity(lib.readNames(root), "Chris"));
  assert.equal(lib.resolveEntity(lib.readNames(root), "New Person"), null);
});

test("invalid compilation structure and duplicate IDs propose repairs, and the MCP script reports them without a stack", () => {
  const root = setup(), e = lib.addName(root, "Chris"), path = join(root, e._path);
  const { fm, body } = lib.parseFrontmatter(readFileSync(path, "utf8"));
  for (const value of ['{"overview":[]}', '{"overview":'] ) {
    const text = lib.renderFrontmatter({ ...fm, compilation: value }) + body;
    writeFileSync(path, text);
    assert.throws(() => lib.entityFacts(root, e.id), error => error.code === "ENTITY_FORMAT" && error.repair.field === "compilation");
    const result = spawnSync(process.execPath, [new URL("../scripts/gtm-os-entities/entities.mjs", import.meta.url).pathname, root, "--who", "Chris"], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Cannot parse brain\/entities\/chris.md: compilation/);
    assert.match(result.stderr, /Proposed fix:/);
    assert.doesNotMatch(result.stderr, /at main|at readEntityFiles|node:/);
    assert.equal(readFileSync(path, "utf8"), text);
  }
  writeFileSync(path, lib.renderFrontmatter(fm) + body);
  writeFileSync(join(root, "brain", "entities", "copy.md"), lib.renderFrontmatter(fm) + body);
  assert.throws(() => lib.readNames(root), error => error.code === "ENTITY_FORMAT" && /also claimed by/.test(error.message));
});

test("older bodies and deliberately emptied Markdown are preserved; CRLF metadata and quoted scalar-like aliases parse", () => {
  const root = setup(), e = lib.addName(root, "Chris"), path = join(root, e._path);
  const { fm } = lib.parseFrontmatter(readFileSync(path, "utf8"));
  const older = { ...fm, aliases: ["false", "null", "Pawlak, Chris", "O'Neil, Chris"] }; delete older.rendered_body_hash;
  const handwritten = "# Chris\r\n\r\nContact notes kept by hand.\r\n";
  writeFileSync(path, lib.renderFrontmatter(older).replace('"Pawlak, Chris"', "'Pawlak, Chris'").replace('"O\'Neil, Chris"', "'O''Neil, Chris'").replace(/\n/g, "\r\n") + handwritten);
  lib.refreshEntityPages(root);
  assert.equal(lib.resolveEntity(lib.readNames(root), "false").id, e.id);
  assert.equal(lib.resolveEntity(lib.readNames(root), "Pawlak, Chris").id, e.id);
  assert.equal(lib.resolveEntity(lib.readNames(root), "O'Neil, Chris").id, e.id);
  assert.equal(lib.entityFacts(root, e.id).file_notes.markdown, handwritten);
  assert.ok(readFileSync(path, "utf8").endsWith(handwritten));
  writeFileSync(path, lib.renderFrontmatter(fm));
  lib.refreshEntityPages(root);
  assert.equal(lib.parseFrontmatter(readFileSync(path, "utf8")).body, "");
});

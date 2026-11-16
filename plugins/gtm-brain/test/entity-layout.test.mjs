// Entity pages by kind (lib/layout.mjs): one path function for every reader and writer, both layouts read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as lib from "../lib/brain.mjs";
import * as layout from "../lib/layout.mjs";
import { entityStamp } from "../lib/entity-stamp.mjs";
import { entityId, readEntityChange, readEntityFiles, editedBody } from "../lib/entities.mjs";
import { isPagePath } from "../lib/layout.mjs";
import { prepareAsset, assetRows } from "../lib/assets.mjs";
import { randomUUID } from "node:crypto";
import { parseSchema } from "../lib/schema.mjs";
import { readdirSync } from "node:fs";
process.env.GTM_BRAIN_NO_COMMIT = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
process.env.GTM_BRAIN_NO_WATCH = "1";

export function brain(prefix = "gtm-layout-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, "brain"));
  writeFileSync(join(root, "brain/admin.md"), lib.renderFrontmatter({ company: "Fixture", team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  lib.writeContext(root, "sales", { title: "Sales" });
  return root;
}
const page = (id, name, kind = "person") => `---\nformat: gtm-brain-entity-v2\nid: ${id}\nname: ${name}\nkind: ${kind}\naliases: []\nemails: []\nnot_same: []\nprevious_ids: []\nreferences: []\nidentity_sources: []\n---\n\n# ${name}\n`;

test("kind folders are the plural of the kind; a page name is the readable name plus the short id", () => {
  assert.deepEqual(["person", "organization", "product", "event", "tool", "meeting", "offering", "case_study", "campus", "deal"].map(layout.kindFolder),
    ["people", "organizations", "products", "events", "tools", "meetings", "offerings", "case-studies", "campuses", "deals"]);
  const id = entityId("Max Jendral");
  assert.equal(layout.pageName("Max Jendral", id), `max-jendral-${id.slice(2, 8)}`);
  assert.equal(layout.kindPagePath("person", "Max Jendral", id), `brain/entities/people/max-jendral-${id.slice(2, 8)}.md`);
  assert.equal(layout.pageName("Łódź Ćwiczenia Sp. z o.o.", id), `lodz-cwiczenia-sp-z-o-o-${id.slice(2, 8)}`);
  assert.equal(layout.pageName("株式会社", id), `entity-${id.slice(2, 8)}`);
  assert.equal(layout.assetFolder("brain/entities/people/max-jendral-3f9a2c.md"), "brain/entities/people/max-jendral-3f9a2c");
  for (const p of ["brain/entities/max.md", "brain/entities/people/max-jendral-3f9a2c.md"]) assert.ok(layout.isPagePath(p), p);
  for (const p of ["brain/entities/people/index.md", "brain/entities/../admin.md", "brain/entities/a/b/c.md", "brain/other/x.md"]) assert.ok(!layout.isPagePath(p), p);
  assert.equal(layout.linkFrom("brain/entities/people/a-123456.md", "brain/contexts"), "../../contexts");
  assert.equal(layout.linkFrom("brain/entities/a.md", "brain/contexts"), "../contexts");
  assert.equal(layout.linkFrom("brain/entities/people/a-123456.md", "brain/entities/organizations/b-654321.md"), "../organizations/b-654321.md");
});

test("readers see flat pages and pages in kind folders side by side; index files and asset folders are not pages", () => {
  const root = brain();
  const max = entityId("Max Jendral"), acme = entityId("Acme"), old = entityId("Ola Flat");
  mkdirSync(join(root, "brain/entities/people/max-jendral-" + max.slice(2, 8)), { recursive: true });
  mkdirSync(join(root, "brain/entities/organizations"), { recursive: true });
  writeFileSync(join(root, `brain/entities/people/max-jendral-${max.slice(2, 8)}.md`), page(max, "Max Jendral"));
  writeFileSync(join(root, `brain/entities/people/max-jendral-${max.slice(2, 8)}/notes.md`), "an asset, not a page");
  writeFileSync(join(root, "brain/entities/people/index.md"), "# People\n");
  writeFileSync(join(root, `brain/entities/organizations/acme-${acme.slice(2, 8)}.md`), page(acme, "Acme", "organization"));
  writeFileSync(join(root, "brain/entities/ola-flat.md"), page(old, "Ola Flat"));
  mkdirSync(join(root, "brain/entities/ola-flat"));
  writeFileSync(join(root, "brain/entities/ola-flat/cv.md"), "a flat page's own file");
  assert.equal(layout.layout(root), "kinds");
  assert.deepEqual(layout.pagePaths(root), ["brain/entities/ola-flat.md", `brain/entities/organizations/acme-${acme.slice(2, 8)}.md`, `brain/entities/people/max-jendral-${max.slice(2, 8)}.md`]);
  const names = lib.readNames(root);
  assert.deepEqual(names.filter(n => n._path).map(n => [n.name, n._path]).sort(), [["Acme", `brain/entities/organizations/acme-${acme.slice(2, 8)}.md`], ["Max Jendral", `brain/entities/people/max-jendral-${max.slice(2, 8)}.md`], ["Ola Flat", "brain/entities/ola-flat.md"]]);
  assert.equal(layout.findPage(root, acme), `brain/entities/organizations/acme-${acme.slice(2, 8)}.md`);
  assert.match(entityStamp(root), /people\/max-jendral/);
});

test("a flat brain stays flat: a page's own folder is not a kind folder", () => {
  const root = brain();
  lib.addName(root, "People Inc", { kind: "organization" });
  mkdirSync(join(root, "brain/entities/people-inc"), { recursive: true });
  assert.equal(layout.layout(root), "flat");
  assert.deepEqual(layout.pagePaths(root), ["brain/entities/ann-lee.md", "brain/entities/people-inc.md"]);
});

test("brief links are relative to the page, in either layout", () => {
  const root = brain();
  const id = entityId("Max Jendral");
  mkdirSync(join(root, "brain/entities/people"), { recursive: true });
  writeFileSync(join(root, `brain/entities/people/max-jendral-${id.slice(2, 8)}.md`), page(id, "Max Jendral"));
  lib.appendMemory(root, "sales", { authors: ["ann"], people: ["Max Jendral"], content: "Max Jendral asked for pricing." });
  const brief = lib.entityBrief(root, id);
  assert.match(brief.markdown, /\]\(\.\.\/\.\.\/contexts\/sales\/memories\.jsonl\)/);
  assert.doesNotMatch(brief.markdown, /\]\(\.\.\/contexts\//);
  const absolute = lib.entityBrief(root, id, { absoluteLinks: true });
  assert.ok(absolute.markdown.includes(`](${encodeURI(join(root, "brain/contexts/sales/memories.jsonl"))})`), "absolute links resolve against the page's folder");
});

test("an asset recorded in a folder a rename moved is found by its short id", () => {
  const root = brain();
  const id = entityId("Max Jendral"), short = id.slice(2, 8);
  mkdirSync(join(root, `brain/entities/people/max-jendral-${short}`), { recursive: true });
  writeFileSync(join(root, `brain/entities/people/max-jendral-${short}.md`), page(id, "Max Jendral"));
  writeFileSync(join(root, `brain/entities/people/max-jendral-${short}/photo.png`), "png");
  renameSync(join(root, `brain/entities/people/max-jendral-${short}`), join(root, `brain/entities/people/max-j-${short}`));
  assert.equal(layout.movedAsset(root, `brain/entities/people/max-jendral-${short}/photo.png`), `brain/entities/people/max-j-${short}/photo.png`);
  assert.equal(layout.movedAsset(root, `brain/entities/people/someone-else-000000/photo.png`), null);
});

/* ---------- part 2: a folder per kind, renames move the page ---------- */
export function kindBrain() { const root = brain("gtm-kinds-"); lib.startKindLayout(root); lib.writeNames(root, lib.readNames(root)); return root; }
const sid = id => id.slice(2, 8);
const files = (root, folder) => readdirSync(join(root, "brain/entities", folder)).sort();

test("a new brain writes pages into a folder per kind, each page named with its short id", () => {
  const root = kindBrain();
  for (const f of ["people", "organizations", "products", "events", "tools"]) assert.ok(existsSync(join(root, "brain/entities", f, "index.md")), f);
  const max = lib.addName(root, "Max Jendral"), acme = lib.addName(root, "Acme", { kind: "organization", subtype: "company" });
  const ann = lib.readNames(root).find(n => n.name === "Ann Lee");
  assert.equal(ann._path, `brain/entities/people/ann-lee-${sid(ann.id)}.md`);
  assert.ok(existsSync(join(root, `brain/entities/people/max-jendral-${sid(max.id)}.md`)));
  assert.ok(existsSync(join(root, `brain/entities/organizations/acme-${sid(acme.id)}.md`)));
  assert.deepEqual(readdirSync(join(root, "brain/entities")).filter(f => f.endsWith(".md")), [], "nothing flat");
});

test("an offering is a default kind with its own folder; a project is still not a kind", () => {
  const root = kindBrain();
  assert.ok(existsSync(join(root, "brain/entities/offerings/index.md")));
  const audit = lib.addName(root, "GTM Audit", { kind: "offering" });
  assert.equal(lib.readNames(root).find(n => n.id === audit.id)._path, `brain/entities/offerings/gtm-audit-${sid(audit.id)}.md`);
  assert.match(readFileSync(join(root, "brain/entities/offerings/index.md"), "utf8"), /GTM Audit/);
  assert.throws(() => lib.addName(root, "Q4 Launch", { kind: "project" }), /kind must be one of/);
});

test("two people with the same full name get two pages, told apart by the short id", () => {
  const root = kindBrain();
  const first = lib.addName(root, "Max Jendral");
  const other = { id: entityId(randomUUID()), name: "Max Jendral", kind: "person", aliases: [], emails: ["max@other.test"], not: [], previous_ids: [], references: [], identity_sources: [] };
  lib.writeNames(root, [...lib.readNames(root), other]);
  const pages = files(root, "people").filter(f => f.startsWith("max-jendral-"));
  assert.deepEqual(pages, [`max-jendral-${sid(first.id)}.md`, `max-jendral-${sid(other.id)}.md`].sort());
  assert.equal(lib.readNames(root).filter(n => n.name === "Max Jendral").length, 2);
});

test("a rename moves the page and its files folder; the short id, aliases and an approved file stay", () => {
  const root = kindBrain();
  const max = lib.addName(root, "Max Jendral", { emails: ["max@acme.test"] });
  const shown = lib.readNames(root).find(n => n.id === max.id)._path;
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "work/photo.png"), "png bytes");
  const asset = prepareAsset(root, { entity: "Max Jendral", label: "Portrait", role: "photo", status: "approved", path: "work/photo.png" });
  assert.equal(asset.file.path, `${layout.assetFolder(shown)}/photo.png`);
  lib.appendMemory(root, "sales", { authors: ["ann"], people: ["Max Jendral"], content: "Max Jendral approved his portrait.", asset });
  const renamed = lib.updateEntity(root, { entity: max.id, by: "ann", set: { name: "Maximilian Jendral" } });
  assert.equal(renamed.changed, true);
  const now = lib.readNames(root).find(n => n.id === max.id);
  assert.equal(now._path, `brain/entities/people/maximilian-jendral-${sid(max.id)}.md`);
  assert.ok(!existsSync(join(root, shown)), "the old page is gone");
  assert.ok(existsSync(join(root, layout.assetFolder(now._path), "photo.png")), "the files folder moved with the page");
  assert.deepEqual(now.aliases, ["Max Jendral"]);
  const row = assetRows(root).find(a => a.role === "photo");
  assert.equal(row.issue, null, "the approved file recorded under the old folder still resolves");
  assert.equal(lib.resolveEntity(lib.readNames(root), "Max Jendral").id, max.id);
});

test("a kind change moves the page to the other kind's folder", () => {
  const root = kindBrain();
  const e = lib.addName(root, "Northwind");
  lib.updateEntity(root, { entity: e.id, by: "ann", set: { kind: "organization", subtype: "company" } });
  assert.equal(lib.readNames(root).find(n => n.id === e.id)._path, `brain/entities/organizations/northwind-${sid(e.id)}.md`);
  assert.ok(!existsSync(join(root, `brain/entities/people/northwind-${sid(e.id)}.md`)));
});

test("merge and undo work in kind folders, also after the survivor was renamed", () => {
  const root = kindBrain();
  const chris = lib.addName(root, "Chris"), kp = lib.addName(root, "Krzysztof Pawlak");
  const preview = lib.mergeEntities(root, { source: chris.id, target: kp.id });
  const merged = lib.mergeEntities(root, { source: chris.id, target: kp.id, by: "ann", as_of: preview.as_of });
  const redirect = readFileSync(join(root, `brain/entities/people/chris-${sid(chris.id)}.md`), "utf8");
  assert.match(redirect, new RegExp(`redirect: ${kp.id}`));
  assert.ok(redirect.includes(`](krzysztof-pawlak-${sid(kp.id)}.md)`), "the redirect links to the survivor beside it");
  assert.equal(lib.resolveEntity(lib.readNames(root), chris.id).id, kp.id);
  const undo = lib.undoEntityMerge(root, { merge_id: merged.merge_id });
  const done = lib.undoEntityMerge(root, { merge_id: merged.merge_id, by: "ann", as_of: undo.as_of });
  assert.equal(done.status, "unmerged");
  assert.deepEqual(lib.readNames(root).filter(n => [chris.id, kp.id].includes(n.id)).map(n => n.name).sort(), ["Chris", "Krzysztof Pawlak"]);
});

/* ---------- part 3: history records keep the frontmatter only ---------- */
test("a merge record keeps the frontmatter and the redirect note, never the generated brief; it still undoes", () => {
  const root = kindBrain();
  const chris = lib.addName(root, "Chris"), kp = lib.addName(root, "Krzysztof Pawlak");
  lib.appendMemory(root, "sales", { authors: ["ann"], people: ["Chris"], content: "Chris asked for the security review." });
  lib.refreshEntityPages(root);
  const preview = lib.mergeEntities(root, { source: chris.id, target: kp.id });
  const merged = lib.mergeEntities(root, { source: chris.id, target: kp.id, by: "ann", as_of: preview.as_of });
  const rec = readEntityChange(root, merged.merge_id);
  assert.equal(rec.frontmatter_only, true);
  for (const c of rec.changes) {
    for (const side of [c.before, c.after]) { assert.match(side, /^---\n[\s\S]*\n---\n$/); assert.doesNotMatch(side, /## Timeline|security review/); }
    assert.equal(c.before_body, undefined, "the generated brief is not stored");
  }
  assert.match(rec.changes.find(c => c.path.includes("/chris-")).after_body, /Merged into/);
  assert.ok(rec.changes.every(c => isPagePath(c.path) && c.path.startsWith("brain/entities/people/")), "the validator accepts kind folders");
  const undo = lib.undoEntityMerge(root, { merge_id: merged.merge_id });
  assert.deepEqual(undo.conflicts, []);
  assert.equal(lib.undoEntityMerge(root, { merge_id: merged.merge_id, by: "ann", as_of: undo.as_of }).status, "unmerged");
  lib.refreshEntityPages(root);
  const page = readFileSync(join(root, lib.readNames(root).find(n => n.id === chris.id)._path), "utf8");
  assert.match(page, /security review/, "the restored page's brief is rebuilt from the notes");
});

test("an older record holding whole files stays readable and undoes", () => {
  const root = kindBrain();
  const chris = lib.addName(root, "Chris"), kp = lib.addName(root, "Krzysztof Pawlak");
  const paths = [chris, kp].map(e => lib.readNames(root).find(n => n.id === e.id)._path), before = paths.map(p => readFileSync(join(root, p), "utf8"));
  const preview = lib.mergeEntities(root, { source: chris.id, target: kp.id });
  const merged = lib.mergeEntities(root, { source: chris.id, target: kp.id, by: "ann", as_of: preview.as_of });
  const file = join(root, "brain/entities/.history", merged.merge_id + ".json"), rec = JSON.parse(readFileSync(file, "utf8"));
  const whole = { ...rec, changes: rec.changes.map(c => ({ path: c.path, before: before[paths.indexOf(c.path)], after: readFileSync(join(root, c.path), "utf8") })) };
  delete whole.frontmatter_only;
  writeFileSync(file, JSON.stringify(whole, null, 2) + "\n");
  assert.equal(readEntityChange(root, merged.merge_id).changes[0].before, whole.changes[0].before);
  const undo = lib.undoEntityMerge(root, { merge_id: merged.merge_id });
  assert.equal(lib.undoEntityMerge(root, { merge_id: merged.merge_id, by: "ann", as_of: undo.as_of }).status, "unmerged");
  // the page now also lists the merge and its undo under ## History (lib/entity-events.mjs); the rest is the body it had
  const body = t => t.split("\n---\n")[1].replace(/\n## History\n[\s\S]*?(?=\n## )/, "");
  assert.equal(body(readFileSync(join(root, paths[0]), "utf8")), body(before[0]), "the whole-file body is restored");
});

/* ---------- part 4: a generated index per kind ---------- */
test("each kind folder has a generated index: name, one line, short id, last mentioned; rewritten with the pages", () => {
  const root = kindBrain();
  const acme = lib.addName(root, "Acme", { kind: "organization", subtype: "company" }), max = lib.addName(root, "Max Jendral");
  const people = () => readFileSync(join(root, "brain/entities/people/index.md"), "utf8");
  assert.match(people(), /^# People\n/);
  assert.ok(people().includes(`- [Max Jendral](max-jendral-${sid(max.id)}.md) · other · ${sid(max.id)} · not mentioned in notes yet`), people());
  assert.match(readFileSync(join(root, "brain/entities/organizations/index.md"), "utf8"), new RegExp(`\\[Acme\\]\\(acme-${sid(acme.id)}\\.md\\) · company · other · ${sid(acme.id)}`));
  assert.match(readFileSync(join(root, "brain/entities/products/index.md"), "utf8"), /No products yet/);
  lib.appendMemory(root, "sales", { authors: ["ann"], people: ["Max Jendral"], content: "Max Jendral wants a pilot.", at: "2026-11-10T09:00:00.000Z" });
  lib.refreshEntityPages(root);
  assert.ok(people().includes(`${sid(max.id)} · last mentioned 2026-11-10`), people());
  lib.updateEntity(root, { entity: max.id, by: "ann", set: { name: "Max J. Jendral" } });
  assert.ok(people().includes(`[Max J. Jendral](max-j-jendral-${sid(max.id)}.md)`), "a rename rewrites the index");
  writeFileSync(join(root, "brain/entities/people/index.md"), "my own notes");
  lib.refreshEntityPages(root);
  assert.match(people(), /^# People\n/, "a hand edit is overwritten");
  assert.ok(!lib.readNames(root).some(n => /index/.test(n._path || "")), "the index is not an entity");
});

test("a kind added in SCHEMA.md gets its folder and index when its first entity arrives", () => {
  const root = kindBrain();
  writeFileSync(join(root, "SCHEMA.md"), readFileSync(new URL("../templates/SCHEMA.md", import.meta.url), "utf8") + "\n## Case_study\n\n| Field | What it means | Required |\n| --- | --- | --- |\n| result | What changed | no |\n");
  const e = lib.addName(root, "Reflow at Acme", { kind: "case_study" });
  assert.equal(lib.readNames(root).find(n => n.id === e.id)._path, `brain/entities/case-studies/reflow-at-acme-${sid(e.id)}.md`);
  assert.match(readFileSync(join(root, "brain/entities/case-studies/index.md"), "utf8"), /^# Case studies\n[\s\S]*Reflow at Acme/);
});

test("upgrade's move to kind folders keeps ids, aliases, merges, redirects and files", () => {
  const root = brain("gtm-flat-");
  const chris = lib.addName(root, "Chris"), kp = lib.addName(root, "Krzysztof Pawlak", { aliases: ["KP"] }), acme = lib.addName(root, "Acme", { kind: "organization" });
  const preview = lib.mergeEntities(root, { source: chris.id, target: kp.id });
  const merged = lib.mergeEntities(root, { source: chris.id, target: kp.id, by: "ann", as_of: preview.as_of });
  mkdirSync(join(root, "brain/entities/acme")); writeFileSync(join(root, "brain/entities/acme/logo.svg"), "<svg/>");
  lib.appendMemory(root, "sales", { authors: ["ann"], people: ["Acme"], content: "Acme logo approved.", asset: { entity: "Acme", label: "Logo", role: "logo", status: "approved", file: { base: "brain", path: "brain/entities/acme/logo.svg" } } });
  assert.equal(layout.layout(root), "flat");
  const before = lib.readNames(root).map(n => [n.id, n.name, n.aliases, n.previous_ids]);
  // one page edited by hand (a link to its context in it); the others carry generated bodies, KP's citing a note
  lib.appendMemory(root, "sales", { authors: ["ann"], people: ["Krzysztof Pawlak"], content: "Krzysztof Pawlak runs the pilot." });
  lib.refreshEntityPages(root);
  assert.match(readFileSync(join(root, lib.readNames(root).find(n => n.id === kp.id)._path), "utf8"), /\]\(\.\.\/contexts\/sales\//);
  const acmePage = join(root, lib.readNames(root).find(n => n.id === acme.id)._path);
  writeFileSync(acmePage, readFileSync(acmePage, "utf8") + "\nMy own line, see [sales](../contexts/sales/context.md).\n");
  const handwritten = () => Object.fromEntries(readEntityFiles(root).map(e => [e.id, editedBody(e)]));
  const editedBefore = handwritten();
  assert.equal(editedBefore[acme.id], true); assert.equal(editedBefore[kp.id], false);
  const r = lib.migrateToKindFolders(root);
  assert.deepEqual(handwritten(), editedBefore, "a generated body stays generated after its links are rewritten, a handwritten one stays handwritten");
  assert.match(readFileSync(join(root, `brain/entities/organizations/acme-${sid(acme.id)}.md`), "utf8"), /My own line, see \[sales\]\(\.\.\/\.\.\/contexts\/sales\/context\.md\)/);
  lib.appendMemory(root, "sales", { authors: ["ann"], people: ["Krzysztof Pawlak"], content: "Krzysztof Pawlak moved the pilot to March." });
  lib.refreshEntityPages(root);
  assert.match(readFileSync(join(root, `brain/entities/people/krzysztof-pawlak-${sid(kp.id)}.md`), "utf8"), /moved the pilot to March/, "a moved page still renders new notes");
  assert.equal(layout.layout(root), "kinds");
  assert.deepEqual(r.moves.map(m => m.to).sort(), [`brain/entities/organizations/acme-${sid(acme.id)}.md`, `brain/entities/people/ann-lee-${sid(entityId("Ann Lee"))}.md`, `brain/entities/people/chris-${sid(chris.id)}.md`, `brain/entities/people/krzysztof-pawlak-${sid(kp.id)}.md`].sort());
  assert.equal(r.moves.find(m => m.to.includes("/chris-")).redirect, kp.id);
  assert.deepEqual(lib.readNames(root).map(n => [n.id, n.name, n.aliases, n.previous_ids]), before);
  assert.ok(readFileSync(join(root, `brain/entities/people/chris-${sid(chris.id)}.md`), "utf8").includes(`](krzysztof-pawlak-${sid(kp.id)}.md)`));
  assert.ok(existsSync(join(root, `brain/entities/organizations/acme-${sid(acme.id)}/logo.svg`)), "the files folder moved");
  assert.equal(assetRows(root).find(a => a.role === "logo").issue, null, "the logo recorded at the flat path resolves");
  assert.equal(lib.migrateToKindFolders(root).moves.length, 0, "a second run moves nothing");
  const undo = lib.undoEntityMerge(root, { merge_id: merged.merge_id });
  assert.equal(lib.undoEntityMerge(root, { merge_id: merged.merge_id, by: "ann", as_of: undo.as_of }).status, "unmerged", "a merge recorded at flat paths still undoes");
});

test("flat pages a teammate on 0.34 writes into an upgraded brain: reads keep working, the next write folds them in", () => {
  const root = kindBrain();
  const max = lib.addName(root, "Max Jendral", { aliases: ["MJ"] });
  const maxPath = lib.readNames(root).find(n => n.id === max.id)._path;
  // 0.34 sees no pages, so it writes its own flat ones: a twin of Max (same id, from the same name) with an email
  // only it knows, and a new person
  writeFileSync(join(root, "brain/entities/max-jendral.md"), page(max.id, "Max Jendral").replace("emails: []", "emails: [max@acme.test]"));
  const lena = entityId("Lena Ost");
  writeFileSync(join(root, "brain/entities/lena-ost.md"), page(lena, "Lena Ost"));
  const read = lib.readNames(root);
  assert.equal(read.find(n => n.id === max.id)._path, maxPath, "the kind page wins over its twin; nothing throws");
  assert.ok(read.some(n => n.id === lena));
  lib.refreshEntityPages(root);
  assert.deepEqual(readdirSync(join(root, "brain/entities")).filter(f => f.endsWith(".md")), [], "no flat page left");
  const after = lib.readNames(root), m = after.find(n => n.id === max.id);
  assert.equal(m._path, maxPath); assert.deepEqual(m.aliases, ["MJ"]); assert.deepEqual(m.emails, ["max@acme.test"], "what only the twin held is kept");
  assert.equal(after.find(n => n.id === lena)._path, `brain/entities/people/lena-ost-${sid(lena)}.md`);
  assert.equal(readdirSync(join(root, "work/manual-edits/entities")).length, 1, "the twin's text is kept");
});

test("a 0.34 teammate's flat page for a merged, renamed or aliased entity folds into the page that holds it", () => {
  const root = kindBrain();
  const chris = lib.addName(root, "Chris"), kp = lib.addName(root, "Krzysztof Pawlak", { aliases: ["KP"] });
  const preview = lib.mergeEntities(root, { source: chris.id, target: kp.id });
  lib.mergeEntities(root, { source: chris.id, target: kp.id, by: "ann", as_of: preview.as_of });
  const max = lib.addName(root, "Max Jendral");
  // 0.34 sees no pages: it writes Chris again (the merged id), and "KP" as a person of its own (a new id from the alias)
  writeFileSync(join(root, "brain/entities/chris.md"), page(chris.id, "Chris").replace("emails: []", "emails: [chris@acme.test]"));
  writeFileSync(join(root, "brain/entities/kp.md"), page(entityId("KP"), "KP"));
  writeFileSync(join(root, "brain/entities/max-jendral.md"), page(max.id, "Max Jendral"));
  assert.doesNotThrow(() => lib.readNames(root), "reads keep working");
  assert.doesNotThrow(() => lib.refreshEntityPages(root), "the next write folds them in");
  assert.deepEqual(readdirSync(join(root, "brain/entities")).filter(f => f.endsWith(".md")), [], "no flat page left");
  const after = lib.readNames(root), k = after.find(n => n.id === kp.id);
  assert.equal(after.filter(n => n.name === "KP" || n.name === "Chris").length, 0, "no duplicate identity");
  assert.ok(k.emails.includes("chris@acme.test"), "what only the merged twin held reaches the survivor");
  assert.ok(k.previous_ids.includes(entityId("KP")), "the alias page's id resolves to the survivor");
  assert.equal(lib.resolveEntity(after, entityId("KP")).id, kp.id);
  assert.equal(after.filter(n => n.id === max.id).length, 1);
  assert.doesNotThrow(() => lib.refreshEntityPages(root), "a second write is quiet");
});

test("a flat brain writes no page a teammate on 0.34 cannot read: a meeting or an offering waits for the kind folders", () => {
  const root = brain("gtm-flat-kinds-");
  assert.equal(layout.layout(root), "flat");
  assert.throws(() => lib.addName(root, "Pilot package", { kind: "offering" }), /upgrade the brain/);
  assert.ok(!readdirSync(join(root, "brain/entities")).some(f => f.startsWith("pilot-package")), "nothing written for it");
  // with an Offering section in SCHEMA.md, 0.34 reads the kind too
  writeFileSync(join(root, "SCHEMA.md"), readFileSync(new URL("../templates/SCHEMA.md", import.meta.url), "utf8"));
  assert.equal(lib.addName(root, "Pilot package", { kind: "offering" }).kind, "offering");
  assert.deepEqual(lib.ensureMeetingEntities(root, [{ id: "m_1", meeting: { title: "Kickoff", occurred_at: "2026-11-12" } }]), [], "no meeting page in a flat brain");
  for (const e of lib.readNames(root)) assert.ok(layout.KINDS_034.includes(e.kind) || e.kind === "offering", e.kind);
});

test("the shipped SCHEMA.md stays readable by 0.34: no Meeting section, no meeting in a From or To column", () => {
  const text = readFileSync(new URL("../templates/SCHEMA.md", import.meta.url), "utf8");
  // 0.34 refused these headings (its NOT_KINDS) and a To or From naming a kind without a section
  for (const k of ["meeting", "meetings", "company", "team", "us", "project"]) assert.doesNotMatch(text, new RegExp(`^##\\s+${k}\\s*$`, "im"), k);
  const sections = new Set([...layout.KINDS_034, ...[...text.matchAll(/^##\s+(\w+)\s*$/gm)].map(m => m[1].toLowerCase())]);
  const rels = text.slice(text.indexOf("## Relationships")).split("\n").filter(l => /^\|\s*[a-z_]+\s*\|/.test(l) && !/^\|\s*type\s*\|/i.test(l));
  assert.ok(rels.length > 3);
  for (const row of rels) { const [, from, to] = row.split("|").slice(1).map(c => c.trim()); for (const k of [...from.split(/,\s*/), ...to.split(/,\s*/)]) assert.ok(sections.has(k) || k === "us", `${row}: ${k}`); }
  // and 0.35 still knows the meeting: its fields and attended reaching it are built in
  const s = parseSchema(text);
  assert.deepEqual(s.kinds.meeting.fields.map(f => [f.name, f.required]), [["date", true], ["title", false], ["organizer", false], ["source", false]]);
  assert.ok(s.relations.attended.to.includes("meeting"));
});

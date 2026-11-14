// Entity pages by kind (lib/layout.mjs): one path function for every reader and writer, both layouts read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as lib from "../lib/brain.mjs";
import * as layout from "../lib/layout.mjs";
import { entityStamp } from "../lib/entity-stamp.mjs";
import { entityId } from "../lib/entities.mjs";
import { prepareAsset, assetRows } from "../lib/assets.mjs";
import { randomUUID } from "node:crypto";
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
  assert.deepEqual(["person", "organization", "product", "event", "tool", "meeting", "case_study", "campus", "deal"].map(layout.kindFolder),
    ["people", "organizations", "products", "events", "tools", "meetings", "case-studies", "campuses", "deals"]);
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

test("upgrade's move to kind folders keeps ids, aliases, merges, redirects and files", () => {
  const root = brain("gtm-flat-");
  const chris = lib.addName(root, "Chris"), kp = lib.addName(root, "Krzysztof Pawlak", { aliases: ["KP"] }), acme = lib.addName(root, "Acme", { kind: "organization" });
  const preview = lib.mergeEntities(root, { source: chris.id, target: kp.id });
  const merged = lib.mergeEntities(root, { source: chris.id, target: kp.id, by: "ann", as_of: preview.as_of });
  mkdirSync(join(root, "brain/entities/acme")); writeFileSync(join(root, "brain/entities/acme/logo.svg"), "<svg/>");
  lib.appendMemory(root, "sales", { authors: ["ann"], people: ["Acme"], content: "Acme logo approved.", asset: { entity: "Acme", label: "Logo", role: "logo", status: "approved", file: { base: "brain", path: "brain/entities/acme/logo.svg" } } });
  assert.equal(layout.layout(root), "flat");
  const before = lib.readNames(root).map(n => [n.id, n.name, n.aliases, n.previous_ids]);
  const r = lib.migrateToKindFolders(root);
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

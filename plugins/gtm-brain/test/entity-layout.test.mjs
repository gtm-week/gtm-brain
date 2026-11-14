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

process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
// Unit tests for the 0.27.0 pure functions: document moves, stray folders, personal skills, the source version.
// No setup, no git: a bare folder with brain/admin.md is enough for the scan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import * as docs from "../lib/documents.mjs";
import { personalSkillIds } from "../lib/user-skills.mjs";
import { sourceVersion, sourceUrl } from "../lib/plugin-source.mjs";

const bare = () => { const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-doclib-"))); mkdirSync(join(root, "brain")); writeFileSync(join(root, "brain", "admin.md"), "company: Demo\n"); return root; };
const doc = (root, path, title, extra = {}) => { mkdirSync(join(root, path, ".."), { recursive: true }); docs.writeDocument(root, { path, title, applies_to: "design", status: "draft", body: `${title} body.`, extra }); };

test("moveIntoFolder: root and nested documents move into a folder of their own name, content and own frontmatter kept", () => {
  const root = bare();
  doc(root, "strategy.md", "Strategy", { tags: ["plan"] });
  const m = docs.moveIntoFolder(root, docs.readDocument(root, "strategy"));
  assert.deepEqual(m, { from: "strategy.md", to: "strategy/strategy.md" });
  const moved = readFileSync(join(root, "strategy/strategy.md"), "utf8");
  assert.match(moved, /Strategy body\./); assert.match(moved, /^tags: \[plan\]$/m); assert.match(moved, /^kind: document$/m);
  doc(root, "brand/design-system.md", "Design system");
  assert.deepEqual(docs.moveIntoFolder(root, docs.readDocument(root, "design-system")), { from: "brand/design-system.md", to: "brand/design-system/design-system.md" });
  assert.equal(docs.readDocument(root, "brand/design-system/design-system").title, "Design system", "still a document, found at depth two");
});

test("moveIntoFolder: a document already in its own folder, or a name taken inside, is left where it is", () => {
  const root = bare();
  doc(root, "voice/voice.md", "Voice");
  assert.equal(docs.moveIntoFolder(root, docs.readDocument(root, "voice/voice")), null);
  doc(root, "pricing.md", "Pricing root"); doc(root, "pricing/pricing.md", "Pricing inside");
  assert.equal(docs.moveIntoFolder(root, docs.readDocument(root, "pricing")), null, "never overwrites");
  assert.equal(docs.readDocument(root, "pricing/pricing").title, "Pricing inside");
  assert.ok(existsSync(join(root, "pricing.md")));
});

test("consolidateDocuments: moves only documents beside a folder of their name; a file of that name, no folder, or a project folder does not count", () => {
  const root = bare();
  doc(root, "design-system.md", "Design system"); doc(root, "design-system/colors.md", "Colors");
  doc(root, "icp.md", "ICP");                                   // no folder: stays
  doc(root, "offer.md", "Offer"); writeFileSync(join(root, "offer"), "a file, not a folder");
  assert.deepEqual(docs.consolidateDocuments(root), [{ from: "design-system.md", to: "design-system/design-system.md" }]);
  assert.ok(existsSync(join(root, "icp.md"))); assert.ok(existsSync(join(root, "offer.md")));
  assert.deepEqual(docs.consolidateDocuments(root), [], "idempotent");
  // a linked project folder is skipped by the scan, so nothing inside it is ever moved
  const project = join(root, "website"); mkdirSync(project); writeFileSync(join(project, "index.html"), "<html>");
  mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(join(root, "work", "projects.json"), JSON.stringify({ projects: [{ slug: "website", path: project }] }));
  doc(root, "website.md", "Website brief");
  assert.deepEqual(docs.consolidateDocuments(root), [], "a linked project's folder is never a document home: website.md stays out of it");
  assert.ok(existsSync(join(root, "website.md")));
});

test("after a move the folder is one document home: its loose files count, the line and save paths follow", () => {
  const root = bare();
  doc(root, "design-system.md", "Design system");
  mkdirSync(join(root, "design-system")); writeFileSync(join(root, "design-system", "logo.svg"), "<svg/>");
  docs.consolidateDocuments(root);
  const d = docs.readDocument(root, "design-system/design-system");
  assert.deepEqual(docs.documentFiles(root, d), ["design-system/logo.svg"]);
  assert.match(docs.documentsLine(root), /-> design-system\/design-system\.md \(1 file\)/);
  assert.ok(docs.savePaths(root).includes("design-system"));
});

test("strayFolders: engine folders, dot folders, document homes and projects are not stray; the rest is, sorted", () => {
  const root = bare();
  for (const f of ["work", "files", ".obsidian", "company", "assets", "output"]) mkdirSync(join(root, f));
  doc(root, "brand/voice.md", "Voice");
  const project = join(root, "website"); mkdirSync(project);
  writeFileSync(join(root, "work", "projects.json"), JSON.stringify({ projects: [{ slug: "website", path: project }] }));
  assert.deepEqual(docs.strayFolders(root), ["assets", "company", "output"]);
});

test("strayFoldersHint: said once per set, again when the set changes, silent when there are none; names a folder that holds Markdown", () => {
  const root = bare();
  assert.equal(docs.strayFoldersHint(root), "");
  mkdirSync(join(root, "assets")); mkdirSync(join(root, "company")); writeFileSync(join(root, "company", "notes.md"), "# Notes\n");
  const first = docs.strayFoldersHint(root);
  assert.match(first, /assets\/, company\//); assert.match(first, /adopt the documents in company\//);
  assert.equal(docs.strayFoldersHint(root), "");
  mkdirSync(join(root, "output"));
  assert.match(docs.strayFoldersHint(root), /output\//);
});

test("personalSkillIds: only folders with a SKILL.md, sorted; a missing folder is none", () => {
  const home = mkdtempSync(join(tmpdir(), "gtm-brain-home-"));
  assert.deepEqual(personalSkillIds(home), []);
  for (const [id, withFile] of [["zeta", true], ["alpha", true], ["empty", false], [".hidden", true]]) {
    mkdirSync(join(home, ".agents", "skills", id), { recursive: true });
    if (withFile) writeFileSync(join(home, ".agents", "skills", id, "SKILL.md"), "---\nname: x\n---\n");
  }
  assert.deepEqual(personalSkillIds(home), ["alpha", "zeta"]);
});

test("sourceVersion: reads a local checkout and a git source; an unreachable source is an error, never a throw", () => {
  assert.equal(sourceUrl("gtm-week/gtm-brain"), "https://github.com/gtm-week/gtm-brain");
  assert.equal(sourceUrl("file:///tmp/x"), "file:///tmp/x");
  const local = mkdtempSync(join(tmpdir(), "gtm-brain-src-")); mkdirSync(join(local, "plugins/gtm-brain/.codex-plugin"), { recursive: true });
  writeFileSync(join(local, "plugins/gtm-brain/.codex-plugin/plugin.json"), JSON.stringify({ version: "9.9.9" }));
  assert.deepEqual(sourceVersion({ type: "local", source: local }), { version: "9.9.9" });
  const g = (...a) => execFileSync("git", ["-C", local, "-c", "user.name=t", "-c", "user.email=t@t.t", ...a], { stdio: "ignore" });
  g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-qm", "v");
  const codexHome = mkdtempSync(join(tmpdir(), "gtm-brain-ch-"));
  assert.deepEqual(sourceVersion({ type: "git", source: `file://${local}`, ref: "main", codexHome }), { version: "9.9.9" });
  const bad = sourceVersion({ type: "git", source: "file:///nonexistent/repo", ref: "main", codexHome });
  assert.ok(bad.error && !bad.version);
  assert.ok(sourceVersion({ type: "local", source: "" }).error);
});

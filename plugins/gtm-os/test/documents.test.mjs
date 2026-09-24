process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_SESSION_MAINTENANCE = "1";
process.env.GTM_OS_NO_COMPILE = "1";
// Documents: Markdown the person keeps at the brain root, read before matching work; replaces brain/guidelines (0.27.0).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-doc-home-"));
const lib = await import(`${P}/lib/brain.mjs`);
const docs = await import(`${P}/lib/documents.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1", GTM_OS_NO_VERSION_CHECK: "1" };
function brain() {
  const root = trackBrain(realpathSync(mkdtempSync(join(tmpdir(), "gtm-os-doc-brain-"))), P);
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const VOICE = "We write like an operator: short sentences, real numbers, problem first.\n\nHard rules: no exclamation points, no emoji in body copy.\n\nBanned words: synergy, leverage, unlock, seamless.";
const ok = { slug: "tone-of-voice", title: "Tone of voice", applies_to: "copy, posts", body: VOICE, status: "draft", folder: "" };

test("format: slug, paths, applies_to, validation, render and read round-trip with the kind marker", () => {
  assert.equal(docs.documentSlug("Tone of voice"), "tone-of-voice");
  assert.equal(docs.documentPathFor("voice", "brand"), "brand/voice.md");
  assert.equal(docs.documentPathFor("strategy"), "strategy.md");
  assert.deepEqual(docs.normalizeAppliesTo(" Copy, outreach ,Landing Pages,, copy"), ["copy", "outreach", "landing pages"]);
  assert.equal(docs.validateDocument(ok), null);
  assert.match(docs.validateDocument({ ...ok, title: " " }), /title/);
  assert.match(docs.validateDocument({ ...ok, applies_to: "" }), /applies_to/);
  assert.match(docs.validateDocument({ ...ok, body: "" }), /body/);
  assert.match(docs.validateDocument({ ...ok, status: "final" }), /draft or approved/);
  assert.match(docs.validateDocument({ ...ok, body: "x".repeat(docs.BODY_MAX + 1) }), /KB/);
  assert.match(docs.validateDocument({ ...ok, folder: "brain" }), /folder/);
  assert.match(docs.validateDocument({ ...ok, folder: "a/b/c" }), /folder/);
  assert.equal(docs.validateDocument({ ...ok, folder: "brand/tone" }), null);
  const text = docs.renderDocument({ ...ok, by: "marta-nowak", updated: "2026-09-23", version: "0.27.0" });
  assert.match(text, /^kind: document$/m); assert.match(text, /^title: Tone of voice$/m); assert.match(text, /^applies_to: \[copy, posts\]$/m);
  assert.match(text, /^gtm-os: 0\.27\.0$/m); assert.match(text, /^# Tone of voice$/m); assert.ok(text.includes(docs.HEADER_LINE));
  const root = brain();
  docs.writeDocument(root, { ...ok, path: "brand/voice.md", by: "marta-nowak", updated: "2026-09-23", version: "0.27.0" });
  const back = docs.readDocument(root, "voice");
  assert.deepEqual([back.slug, back.path, back.folder, back.title, back.applies_to, back.status, back.by, back.updated, back.version], ["voice", "brand/voice.md", "brand", "Tone of voice", ["copy", "posts"], "draft", "marta-nowak", "2026-09-23", "0.27.0"]);
  assert.ok(back.body.includes("Banned words: synergy"));
  assert.equal(docs.readDocument(root, "brand/voice.md").path, "brand/voice.md");
  assert.equal(docs.readDocument(root, "brand/voice").path, "brand/voice.md");
  const again = docs.renderDocument({ ...back, version: "0.27.0" }); assert.equal(again.split("# Tone of voice").length, 2); assert.equal(again.split(docs.HEADER_LINE).length, 2);
});

test("scan: only marked Markdown at depth 0-2 outside the engine and projects; hand-written files are neither listed nor touched", () => {
  const root = brain();
  docs.writeDocument(root, { ...ok, path: "strategy.md", title: "Strategy", applies_to: "strategy, planning" });
  docs.writeDocument(root, { ...ok, path: "brand/voice.md" });
  docs.writeDocument(root, { ...ok, path: "market/battle-cards/sierra.md", title: "Sierra" });
  mkdirSync(join(root, "too/deep/here"), { recursive: true });
  docs.writeDocument(root, { ...ok, path: "too/deep/here/x.md", title: "Too deep" });
  writeFileSync(join(root, "notes.md"), "# My notes\n\nno marker here\n");
  mkdirSync(join(root, "brain", "guidelines"), { recursive: true }); writeFileSync(join(root, "brain", "guidelines", "old.md"), docs.renderDocument({ ...ok, title: "Old" }));
  mkdirSync(join(root, "website"), { recursive: true }); writeFileSync(join(root, "website", "README.md"), docs.renderDocument({ ...ok, title: "Site" }));
  writeFileSync(join(root, "work", "projects.json"), JSON.stringify({ projects: [{ slug: "website", path: join(root, "website") }] }));
  assert.deepEqual(docs.markdownFiles(root), ["brand/voice.md", "market/battle-cards/sierra.md", "notes.md", "strategy.md"]);
  assert.deepEqual(docs.listDocuments(root).map(d => d.path), ["brand/voice.md", "market/battle-cards/sierra.md", "strategy.md"]);
  assert.equal(readFileSync(join(root, "notes.md"), "utf8"), "# My notes\n\nno marker here\n");
  assert.equal(docs.readDocument(root, "notes"), null);
});

test("an ambiguous slug is refused with both paths; the path form resolves it", () => {
  const root = brain();
  docs.writeDocument(root, { ...ok, path: "brand/pricing.md", title: "Brand pricing" });
  docs.writeDocument(root, { ...ok, path: "market/pricing.md", title: "Market pricing" });
  assert.throws(() => docs.readDocument(root, "pricing"), /brand\/pricing\.md, market\/pricing\.md/);
  assert.equal(docs.readDocument(root, "market/pricing").title, "Market pricing");
});

test("files: a folder of the document's name beside it; a document alone in its folder also owns the loose files there; a sibling document ends that", () => {
  const root = brain();
  docs.writeDocument(root, { ...ok, path: "strategy.md", title: "Strategy" });
  const strategy = docs.readDocument(root, "strategy");
  assert.equal(docs.filesDir(strategy), "strategy");
  assert.equal(docs.landingDir(root, strategy), "strategy");
  assert.deepEqual(docs.documentFiles(root, strategy), []);
  mkdirSync(join(root, "strategy")); writeFileSync(join(root, "strategy", "deck.pdf"), "pdf");
  assert.deepEqual(docs.documentFiles(root, strategy), ["strategy/deck.pdf"]);
  docs.writeDocument(root, { ...ok, path: "pricing/pricing.md", title: "Pricing" });
  writeFileSync(join(root, "pricing", "pricing-2026.xlsx"), "x");
  const pricing = docs.readDocument(root, "pricing");
  assert.equal(docs.isAlone(pricing, docs.listDocuments(root)), true);
  assert.equal(docs.landingDir(root, pricing), "pricing");
  assert.deepEqual(docs.documentFiles(root, pricing), ["pricing/pricing-2026.xlsx"]);
  docs.writeDocument(root, { ...ok, path: "pricing/discounts.md", title: "Discounts" });
  const all = docs.listDocuments(root);
  assert.equal(docs.isAlone(docs.readDocument(root, "pricing/pricing"), all), false);
  assert.equal(docs.landingDir(root, docs.readDocument(root, "pricing/pricing"), all), "pricing/pricing");
  assert.deepEqual(docs.documentFiles(root, docs.readDocument(root, "pricing/pricing"), all), []);
  assert.ok(existsSync(join(root, "pricing", "pricing-2026.xlsx")));
  assert.deepEqual(docs.savePaths(root).sort(), ["pricing/discounts.md", "pricing/pricing.md", "strategy", "strategy.md"]);
});

test("the line names every document with status, kinds of work, path and file count, and says what to do when there are none", () => {
  const root = brain();
  assert.match(docs.documentsLine(root), /^documents: none yet\. .*\/gtm-os-document/);
  docs.writeDocument(root, { ...ok, path: "strategy.md", title: "Strategy", applies_to: "strategy, planning", status: "approved" });
  docs.writeDocument(root, { ...ok, path: "brand/design-system.md", title: "Design system", applies_to: "design" });
  mkdirSync(join(root, "brand", "design-system")); writeFileSync(join(root, "brand", "design-system", "tokens.json"), "{}"); writeFileSync(join(root, "brand", "design-system", "logo.svg"), "<svg/>");
  const line = docs.documentsLine(root);
  assert.match(line, /documents: Design system \[draft\] \(design\) -> brand\/design-system\.md \(2 files\)  ·  Strategy \[approved\] \(strategy, planning\) -> strategy\.md\./);
  assert.match(line, /rule 11/);
  assert.match(docs.documentsLine(root, { absolute: true }), new RegExp(`-> ${root}/strategy\\.md`));
});

const document = (root, ...args) => execFileSync(process.execPath, [`${P}/scripts/gtm-os-documents/document.mjs`, ".", ...args], { cwd: root, encoding: "utf8", env });
const refused = (root, ...args) => { try { document(root, ...args); return null; } catch (e) { return { code: e.status, text: String(e.stderr || e.stdout) }; } };
const lastCommit = root => execFileSync("git", ["-C", root, "log", "-1", "--format=%s"], { encoding: "utf8" }).trim();

test("the script creates at the root or in a folder, lists, shows, updates, removes, one commit each, and refuses what the format refuses", () => {
  const root = brain();
  assert.match(document(root, "--create", "--title", "Tone of voice", "--applies-to", "copy, posts", "--body", VOICE, "--by", "marta-nowak", "--folder", "brand"), /created document brand\/tone-of-voice\.md/);
  assert.equal(lastCommit(root), "Added document brand/tone-of-voice.md");
  assert.ok(existsSync(join(root, "brand", "tone-of-voice.md")));
  assert.match(document(root, "--create", "--title", "Strategy", "--applies-to", "strategy", "--body", "# Strategy\n\nWin SMB in DACH."), /created document strategy\.md/);
  assert.match(document(root, "--list"), /Tone of voice \[draft\] \(copy, posts\) · brand\/tone-of-voice\.md · by marta-nowak/);
  assert.match(document(root, "--show", "tone-of-voice"), /Banned words: synergy/);
  assert.match(document(root, "--update", "tone-of-voice", "--status", "approved"), /updated document brand\/tone-of-voice\.md/);
  assert.equal(lastCommit(root), "Updated document brand/tone-of-voice.md");
  assert.match(readFileSync(join(root, "brand", "tone-of-voice.md"), "utf8"), /^status: approved$/m);
  assert.deepEqual(JSON.parse(document(root, "--list", "--json")).map(d => [d.slug, d.status, d.files]), [["tone-of-voice", "approved", 0], ["strategy", "draft", 0]]);
  assert.match(refused(root, "--create", "--title", "Tone of voice", "--applies-to", "copy", "--body", "x", "--folder", "brand").text, /already exists/);
  assert.match(refused(root, "--create", "--title", "Bad", "--applies-to", "", "--body", "x").text, /applies_to/);
  assert.match(refused(root, "--create", "--title", "Bad", "--applies-to", "copy", "--body", "x", "--folder", "brain").text, /folder/);
  assert.match(refused(root, "--update", "nope", "--status", "approved").text, /no such document nope; yours: tone-of-voice, strategy/);
  assert.match(document(root, "--remove", "tone-of-voice"), /removed document brand\/tone-of-voice\.md/);
  assert.ok(!existsSync(join(root, "brand")));
  assert.equal(lastCommit(root), "Removed document brand/tone-of-voice.md");
});

test("--file adopts a Markdown already at the root in place, copies one from outside, and refuses other kinds", () => {
  const root = brain();
  writeFileSync(join(root, "strategy.md"), "# Strategy\n\nWin SMB in DACH.\n");
  assert.match(document(root, "--create", "--title", "Strategy", "--applies-to", "strategy, planning", "--file", "strategy.md"), /created document strategy\.md/);
  const text = readFileSync(join(root, "strategy.md"), "utf8");
  assert.match(text, /^kind: document$/m); assert.match(text, /Win SMB in DACH\./); assert.equal(text.split("# Strategy").length, 2);
  const outside = join(tmpdir(), `icp-${Date.now()}.md`); writeFileSync(outside, "# ICP\n\nMid-market ops leads.\n");
  assert.match(document(root, "--create", "--title", "ICP", "--applies-to", "targeting", "--file", outside), /created document icp\.md/);
  assert.ok(existsSync(outside));
  writeFileSync(join(root, "deck.pdf"), "pdf");
  assert.match(refused(root, "--create", "--title", "Deck", "--applies-to", "sales", "--file", "deck.pdf").text, /not a Markdown or text file/);
  assert.match(refused(root, "--create", "--title", "Strategy", "--applies-to", "x", "--file", "strategy.md", "--folder", "plans").text, /already a document/);
});

test("save commits a document and the files a person dropped beside it by hand; setup wrote the README", () => {
  const root = brain();
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /^# Reflow brain/m);
  assert.match(execFileSync("git", ["-C", root, "log", "--format=%s", "--", "README.md"], { encoding: "utf8" }), /setup/);
  document(root, "--create", "--title", "Design system", "--applies-to", "design", "--body", "Blue.", "--folder", "brand");
  mkdirSync(join(root, "brand", "design-system")); writeFileSync(join(root, "brand", "design-system", "tokens.json"), "{}");
  writeFileSync(join(root, "strategy.md"), docs.renderDocument({ title: "Strategy", applies_to: "planning", status: "draft", body: "By hand." }));
  assert.ok(lib.unsavedChanges(root).length >= 2);
  lib.save(root, "saved by hand");
  const tracked = execFileSync("git", ["-C", root, "ls-files"], { encoding: "utf8" });
  assert.match(tracked, /^brand\/design-system\/tokens\.json$/m); assert.match(tracked, /^strategy\.md$/m);
  assert.equal(lib.unsavedChanges(root).length, 0);
});

test("--files lists what a document owns; the old guideline.mjs path still runs", () => {
  const root = brain();
  document(root, "--create", "--title", "Design system", "--applies-to", "design", "--body", "Blue.", "--folder", "brand");
  mkdirSync(join(root, "brand", "design-system")); writeFileSync(join(root, "brand", "design-system", "logo.svg"), "<svg/>");
  assert.equal(document(root, "--files", "design-system").trim(), "brand/design-system/logo.svg");
  const old = execFileSync(process.execPath, [`${P}/scripts/gtm-os-guidelines/guideline.mjs`, ".", "--list"], { cwd: root, encoding: "utf8", env });
  assert.match(old, /Design system \[draft\]/);
});

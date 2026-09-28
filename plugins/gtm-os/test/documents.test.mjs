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
  assert.deepEqual(docs.markdownFiles(root), ["brand/voice.md", "market/battle-cards/sierra.md", "notes.md", "strategy.md", "workflows/ads-then-outbound.md", "workflows/outbound.md"]);
  assert.deepEqual(docs.listDocuments(root).map(d => d.path), ["brand/voice.md", "market/battle-cards/sierra.md", "strategy.md", "workflows/ads-then-outbound.md", "workflows/outbound.md"]);
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
  assert.deepEqual(docs.savePaths(root).sort(), ["pricing", "pricing/discounts.md", "pricing/pricing.md", "strategy", "strategy.md", "workflows", "workflows/ads-then-outbound.md", "workflows/outbound.md"]);
});

test("the line names every document with status, kinds of work, path and file count, and says what to do when there are none", () => {
  const root = brain();
  assert.match(docs.documentsLine(root), /^documents: Strategy \[draft\] \(strategy, planning\) -> strategy\.md  ·  Ads, then outbound \[draft\] \(outbound campaign, linkedin ads\) -> workflows\/ads-then-outbound\.md  ·  Outbound \[draft\] \(outbound campaign\) -> workflows\/outbound\.md\./, "setup wrote strategy.md and the two workflows, all waiting for the person");
  docs.writeDocument(root, { ...ok, path: "strategy.md", title: "Strategy", applies_to: "strategy, planning", status: "approved" });
  docs.writeDocument(root, { ...ok, path: "brand/design-system.md", title: "Design system", applies_to: "design" });
  mkdirSync(join(root, "brand", "design-system")); writeFileSync(join(root, "brand", "design-system", "tokens.json"), "{}"); writeFileSync(join(root, "brand", "design-system", "logo.svg"), "<svg/>");
  const line = docs.documentsLine(root);
  assert.match(line, /documents: Design system \[draft\] \(design\) -> brand\/design-system\.md \(2 files\)  ·  Strategy \[approved\] \(strategy, planning\) -> strategy\.md  ·  Ads, then outbound/);
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
  assert.match(refused(root, "--create", "--title", "Strategy", "--applies-to", "strategy", "--body", "x").text, /strategy\.md already exists; pass it as --file to adopt it/, "setup's strategy.md is there from day one");
  assert.match(document(root, "--create", "--title", "Positioning", "--applies-to", "strategy", "--body", "# Positioning\n\nWin SMB in DACH."), /created document positioning\.md/);
  assert.match(document(root, "--list"), /Tone of voice \[draft\] \(copy, posts\) · brand\/tone-of-voice\.md · by marta-nowak/);
  assert.match(document(root, "--show", "tone-of-voice"), /Banned words: synergy/);
  assert.match(document(root, "--update", "tone-of-voice", "--status", "approved"), /updated document brand\/tone-of-voice\.md/);
  assert.equal(lastCommit(root), "Updated document brand/tone-of-voice.md");
  assert.match(readFileSync(join(root, "brand", "tone-of-voice.md"), "utf8"), /^status: approved$/m);
  assert.deepEqual(JSON.parse(document(root, "--list", "--json")).map(d => [d.slug, d.status, d.files]), [["tone-of-voice", "approved", 0], ["positioning", "draft", 0], ["strategy", "draft", 0], ["ads-then-outbound", "draft", 0], ["outbound", "draft", 0]]);
  assert.match(refused(root, "--create", "--title", "Tone of voice", "--applies-to", "copy", "--body", "x", "--folder", "brand").text, /already exists/);
  assert.match(refused(root, "--create", "--title", "Bad", "--applies-to", "", "--body", "x").text, /applies_to/);
  assert.match(refused(root, "--create", "--title", "Bad", "--applies-to", "copy", "--body", "x", "--folder", "brain").text, /folder/);
  assert.match(refused(root, "--update", "nope", "--status", "approved").text, /no such document nope; yours: tone-of-voice, positioning, strategy, ads-then-outbound, outbound/);
  assert.match(document(root, "--remove", "tone-of-voice"), /removed document brand\/tone-of-voice\.md/);
  assert.ok(!existsSync(join(root, "brand")));
  assert.equal(lastCommit(root), "Removed document brand/tone-of-voice.md");
});

test("--file adopts a Markdown already at the root in place, copies one from outside, and refuses other kinds", () => {
  const root = brain();
  writeFileSync(join(root, "plan.md"), "# Plan\n\nWin SMB in DACH.\n");
  assert.match(document(root, "--create", "--title", "Plan", "--applies-to", "strategy, planning", "--file", "plan.md"), /created document plan\.md/);
  const text = readFileSync(join(root, "plan.md"), "utf8");
  assert.match(text, /^kind: document$/m); assert.match(text, /Win SMB in DACH\./); assert.equal(text.split("# Plan").length, 2);
  const outside = join(tmpdir(), `icp-${Date.now()}.md`); writeFileSync(outside, "# ICP\n\nMid-market ops leads.\n");
  assert.match(document(root, "--create", "--title", "ICP", "--applies-to", "targeting", "--file", outside), /created document icp\.md/);
  assert.ok(existsSync(outside));
  writeFileSync(join(root, "deck.pdf"), "pdf");
  assert.match(refused(root, "--create", "--title", "Deck", "--applies-to", "sales", "--file", "deck.pdf").text, /not a Markdown or text file/);
  assert.match(refused(root, "--create", "--title", "Plan", "--applies-to", "x", "--file", "plan.md", "--folder", "plans").text, /already a document/);
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

const hook = (root, project) => execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: project || root, encoding: "utf8", env, input: JSON.stringify({ session_id: "thread-1", cwd: project || root }) });
test("the session hook names the documents every chat, in the brain and in a linked project, and says when there are none", () => {
  const root = brain();
  assert.match(hook(root), /documents: Strategy \[draft\] \(strategy, planning\) -> strategy\.md/);
  document(root, "--create", "--title", "Tone of voice", "--applies-to", "copy, posts", "--body", VOICE, "--folder", "brand");
  assert.match(hook(root), /documents: Tone of voice \[draft\] \(copy, posts\) -> brand\/tone-of-voice\.md  ·  Strategy \[draft\]/);
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "gtm-os-doc-folder-")));
  execFileSync(process.execPath, [`${P}/skills/gtm-os-project/project.mjs`, ".", "--link", folder, "--slug", "landing", "--contexts", "offer"], { cwd: root, encoding: "utf8", env });
  const inProject = hook(root, folder);
  assert.match(inProject, /^PROJECT landing/m);
  assert.ok(inProject.includes(`Tone of voice [draft] (copy, posts) -> ${join(root, "brand", "tone-of-voice.md")}`), inProject);
});

test("review: save commits unmarked root Markdown and every folder that holds a document, even with two documents in it", () => {
  const root = brain();
  writeFileSync(join(root, "notes.md"), "# Notes\n\nno marker\n");
  document(root, "--create", "--title", "Strategy", "--applies-to", "planning", "--body", "One.", "--folder", "strategy");
  document(root, "--create", "--title", "Positioning", "--applies-to", "planning", "--body", "Two.", "--folder", "strategy");
  writeFileSync(join(root, "strategy", "deck.pptx"), "pptx");
  lib.save(root, "hand edits");
  const tracked = execFileSync("git", ["-C", root, "ls-files"], { encoding: "utf8" });
  assert.match(tracked, /^notes\.md$/m); assert.match(tracked, /^strategy\/deck\.pptx$/m);
  writeFileSync(join(root, "strategy", "deck.pptx"), "pptx v2");
  assert.equal(lib.unsavedChanges(root).length, 1);
  lib.save(root, "deck again"); assert.equal(lib.unsavedChanges(root).length, 0);
});

test("review: an adopted document keeps a non-canonical folder or name and can still be updated; its own frontmatter is merged, not duplicated", () => {
  const root = brain();
  mkdirSync(join(root, "Brand"));
  writeFileSync(join(root, "Brand", "Voice guide.md"), "---\ntags: [brand, voice]\n---\n# Voice guide\n\nShort sentences.\n");
  assert.match(document(root, "--create", "--title", "Voice guide", "--applies-to", "copy", "--file", "Brand/Voice guide.md"), /created document Brand\/Voice guide\.md/);
  const text = readFileSync(join(root, "Brand", "Voice guide.md"), "utf8");
  assert.equal(text.split("---").length, 3, "one frontmatter block"); assert.equal(text.split("# Voice guide").length, 2, "one heading");
  assert.match(text, /^tags: \[brand, voice\]$/m); assert.match(text, /^kind: document$/m);
  assert.match(document(root, "--update", "Brand/Voice guide", "--status", "approved"), /updated document Brand\/Voice guide\.md/);
  assert.match(readFileSync(join(root, "Brand", "Voice guide.md"), "utf8"), /^status: approved$/m);
  assert.match(docs.documentsLine(root), /Voice guide \[approved\]/);
});

test("review: old guidelines are named until the upgrade moves them; a document cannot be made inside a project or the engine", () => {
  const root = brain();
  mkdirSync(join(root, "brain", "guidelines")); writeFileSync(join(root, "brain", "guidelines", "tone-of-voice.md"), "---\ntitle: Tone of voice\napplies_to: [copy]\nstatus: approved\n---\n# Tone of voice\n\nNo exclamation points.\n");
  const line = docs.documentsLine(root);
  assert.match(line, /brain\/guidelines\/tone-of-voice\.md/); assert.match(line, /upgrade/);
  const folder = join(root, "website"); mkdirSync(folder); writeFileSync(join(folder, "brief.md"), "# Brief\n\nx\n");
  execFileSync(process.execPath, [`${P}/skills/gtm-os-project/project.mjs`, ".", "--link", folder, "--slug", "website", "--contexts", "offer"], { cwd: root, encoding: "utf8", env });
  assert.match(refused(root, "--create", "--title", "Brief", "--applies-to", "planning", "--file", "website/brief.md").text, /project/);
  assert.match(refused(root, "--create", "--title", "Brief", "--applies-to", "planning", "--body", "x", "--folder", "website").text, /project/);
  assert.match(refused(root, "--create", "--title", "Admin copy", "--applies-to", "planning", "--file", "brain/admin.md").text, /brain/);
  assert.ok(!existsSync(join(root, "admin-copy.md")));
});

test("folders at the top GTM OS does not use are named once at session start, again only when the set changes; document homes and projects are not stray", () => {
  const root = brain();
  assert.doesNotMatch(hook(root), /does not use/, "a fresh brain has nothing stray");
  mkdirSync(join(root, "company", "strategy"), { recursive: true }); writeFileSync(join(root, "company", "strategy", "old.md"), "# Old\n");
  mkdirSync(join(root, "assets")); writeFileSync(join(root, "assets", "logo.png"), "png");
  document(root, "--create", "--title", "Voice", "--applies-to", "copy", "--body", "Short.", "--folder", "brand");   // a document home
  const hint = hook(root).split("\n").find(l => l.startsWith("Folders at the top GTM OS does not use")) || "";
  assert.match(hint, /^Folders at the top GTM OS does not use: assets\/, company\/\./);
  assert.match(hint, /adopt the documents in company\//); assert.doesNotMatch(hint, /brand\//, "a document home is not stray");
  assert.doesNotMatch(hook(root), /does not use/, "said once");
  mkdirSync(join(root, "output"));
  assert.match(hook(root), /assets\/, company\/, output\/\./, "a new stray folder brings the line back");
  assert.deepEqual(docs.strayFolders(root), ["assets", "company", "output"]);
});

test("a new document made in a folder named after another document pulls that one in: one folder, one thing in Finder", () => {
  const root = brain();
  document(root, "--create", "--title", "Design system", "--applies-to", "design", "--body", "Blue.");
  assert.ok(existsSync(join(root, "design-system.md")));
  const out = document(root, "--create", "--title", "Design inspirations", "--applies-to", "design", "--body", "Callstack.", "--folder", "design-system");
  assert.match(out, /created document design-system\/design-inspirations\.md/);
  assert.match(out, /moved design-system\.md into design-system\//);
  assert.ok(!existsSync(join(root, "design-system.md"))); assert.ok(existsSync(join(root, "design-system", "design-system.md")));
  assert.equal(execFileSync("git", ["-C", root, "status", "--short"], { encoding: "utf8" }).trim(), "", "the move is committed with the new document");
  assert.deepEqual(docs.listDocuments(root).filter(d => d.folder === "design-system").map(d => d.path).sort(), ["design-system/design-inspirations.md", "design-system/design-system.md"]);
  // a document in its own folder is not moved again, and a name already taken inside is left alone
  document(root, "--create", "--title", "Colors", "--applies-to", "design", "--body", "Teal.", "--folder", "design-system");
  assert.ok(existsSync(join(root, "design-system", "design-system.md")));
  mkdirSync(join(root, "voice")); writeFileSync(join(root, "voice", "voice.md"), docs.renderDocument({ title: "Voice", applies_to: "copy", status: "draft", body: "Inside." }));
  writeFileSync(join(root, "voice.md"), docs.renderDocument({ title: "Voice root", applies_to: "copy", status: "draft", body: "Outside." }));
  assert.deepEqual(docs.consolidateDocuments(root), [], "voice/voice.md exists: both stay, nothing is overwritten");
});

test("--files lists what a document owns; the old guideline.mjs path still runs", () => {
  const root = brain();
  document(root, "--create", "--title", "Design system", "--applies-to", "design", "--body", "Blue.", "--folder", "brand");
  mkdirSync(join(root, "brand", "design-system")); writeFileSync(join(root, "brand", "design-system", "logo.svg"), "<svg/>");
  assert.equal(document(root, "--files", "design-system").trim(), "brand/design-system/logo.svg");
  const old = execFileSync(process.execPath, [`${P}/scripts/gtm-os-guidelines/guideline.mjs`, ".", "--list"], { cwd: root, encoding: "utf8", env });
  assert.match(old, /Design system \[draft\]/);
});

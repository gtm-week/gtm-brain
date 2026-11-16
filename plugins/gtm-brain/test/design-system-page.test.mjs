// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// The design system as a page: design-system.html beside design-system.md. The shipped starter is one self-contained
// file; setup writes it in a new brain (layout 3 and layout 2), an upgrade adds it once where it is missing and never
// touches one that is there; an older starter text still counts as not written; the dashboard row says when the page
// is missing or still the starter; add-file --page is the one writer and refuses a page that needs the network.
// Run: node --test plugins/gtm-brain/test/design-system-page.test.mjs
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync, mkdirSync, mkdtempSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import { removeBrain } from "./helpers/dash-cleanup.mjs";
import * as lib from "../lib/brain.mjs";
import * as docs from "../lib/documents.mjs";
import { readLayout, LAYOUT_FILE } from "../lib/layout-version.mjs";
import { addStarters, GIVEN, STARTERS, STARTER_PAGES } from "../lib/upgrade-files.mjs";
import { pillarData, designSystem } from "../lib/dashboard-pillars.mjs";
import { makeBrain, actAs, toLayout2, exists, P } from "./helpers/layouts.mjs";

const T = join(P, "templates"), STARTER = readFileSync(join(T, "design-system.html"), "utf8");
const read = (root, p) => readFileSync(join(root, p), "utf8");
const PAGE = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><title>Layout Co: design system</title><style>:root { --ink: #111111; } body { color: var(--ink); }</style></head><body><h1>Layout Co</h1></body></html>\n";
const row = root => pillarData(root).configuration.documents.find(d => d.slug === "design-system");

test("the starter page is one self-contained file: no script, no address, no import, tokens in :root and printed", () => {
  assert.ok(!/<script/i.test(STARTER), "no <script");
  assert.ok(!/https?:\/\//i.test(STARTER), "no http:// or https:// address");
  assert.ok(!/@import/i.test(STARTER), "no @import");
  assert.deepEqual([...STARTER.matchAll(/url\(\s*["']?([^)]{0,12})/gi)].map(m => m[1]).filter(u => !u.startsWith("data:")), [], "no url() other than data:");
  assert.ok(!/[\u2013\u2014]/.test(STARTER), "plain hyphens only");
  assert.ok(!/<link\b|<iframe\b|\ssrc=/i.test(STARTER));
  assert.deepEqual(docs.pageProblems(STARTER), []);
  assert.ok(docs.isStarterPage(STARTER));
  assert.ok(STARTER.includes("{{COMPANY}}"));
  assert.match(STARTER.slice(STARTER.indexOf("<body")), /^<body>\s*<div class="status"><div class="wrap"><b>Not filled in yet: say 'fill in our design system' in Codex\.<\/b>/, "the first line on the page");
  // every custom property the page is styled with is defined once in :root and listed in the Tokens block
  const rootBlock = STARTER.match(/:root \{([\s\S]*?)\n\}/)[1], defined = [...rootBlock.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map(m => m[1]);
  const used = new Set([...STARTER.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(m => m[1]));
  assert.deepEqual([...used].filter(v => !defined.includes(v)), [], "nothing styled with an undefined property");
  const printed = STARTER.slice(STARTER.indexOf('<pre class="tokens">')).replace(/<[^>]+>/g, "");
  const value = (text, name) => text.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  for (const name of defined) assert.equal(value(printed, name), value(rootBlock, name), `${name} printed as defined`);
  for (const id of ["colour", "type", "layout", "components", "imagery", "rules", "tokens"]) assert.ok(STARTER.includes(`id="${id}"`) && STARTER.includes(`href="#${id}"`), id);
});

test("pageProblems names what a page must not hold", () => {
  assert.deepEqual(docs.pageProblems(PAGE), []);
  assert.deepEqual(docs.pageProblems('<!DOCTYPE html><svg><use href="#mark"/></svg><a href="#top">Top</a><img src="data:image/png;base64,AA=="><style>a{background:url(data:image/png;base64,AA==)}</style>'), []);
  const bad = docs.pageProblems('<html><script>1</script><link rel="stylesheet" href="x.css"><img src="https://example.test/a.png"><style>@import "x.css"; a{background:url(a.png)}</style><iframe></iframe>').join(" | ");
  for (const word of ["DOCTYPE", "<script>", "<link>", "@import", "url()", "by address", "embeds"]) assert.ok(bad.includes(word), word);
});

test("setup writes design-system.html beside design-system.md in about-us/ (layout 3), committed and recorded as given", t => {
  const { root, git } = makeBrain(t);
  assert.ok(exists(root, "about-us/design-system.md") && exists(root, "about-us/design-system.html"));
  assert.ok(!exists(root, "design-system.html"));
  const html = read(root, "about-us/design-system.html");
  assert.equal(html, STARTER.replaceAll("{{COMPANY}}", "Layout Co"));
  assert.ok(git("ls-files").split("\n").includes("about-us/design-system.html"), "in the setup commit");
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");
  assert.deepEqual(readLayout(root).starters, [...GIVEN].sort());
  assert.match(read(root, "about-us/design-system.md"), /`design-system\.html` beside this file: it is the source for how things look/);
  assert.deepEqual(designSystem(root, docs.listDocuments(root)).visual, "about-us/design-system.html");
});

test("setup writes it at the root on layout 2, and a company name is escaped in the page", t => {
  // a plugin that writes layout 2 at most (GTM_BRAIN_TEST_LAYOUT plays one): the base files at the root
  const root = mkdtempSync(join(tmpdir(), "gtm-ds-l2-")); t.after(() => removeBrain(root));
  const env = { ...process.env, CODEX_HOME: join(root, "profile"), GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", NODE_NO_WARNINGS: "1", GTM_BRAIN_TEST_LAYOUT: "2" };
  delete env.GTM_BRAIN_RUN; delete env.GTM_BRAIN_NO_COMMIT;
  const setup = spawnSync("bash", [join(P, "scripts/gtm-brain-setup/setup.sh"), "--company", "Layout Co", "--one-liner", "Testing", "--owner", "Ann Lee <ann@example.test>"], { cwd: root, env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
  assert.equal(lib.inConfigFolders(root), false);
  assert.ok(exists(root, "design-system.md") && exists(root, "design-system.html"));
  assert.ok(git("ls-files").split("\n").includes("design-system.html"), "in the setup commit");
  assert.equal(designSystem(root, docs.listDocuments(root)).visual, "design-system.html");
  // addStarters fills the token with the name as text, never as markup
  rmSync(join(root, "design-system.html"));
  writeFileSync(join(root, LAYOUT_FILE), JSON.stringify({ layout: 2, starters: [...STARTERS] }) + "\n");
  const admin = join(root, lib.settingsFile(root)); writeFileSync(admin, readFileSync(admin, "utf8").replace(/^company: .*$/m, 'company: "Smith & <Sons>"'));
  assert.deepEqual(addStarters(root, T), ["design-system.html"]);
  assert.ok(read(root, "design-system.html").includes("<title>Smith &amp; &lt;Sons&gt;: design system</title>"));
});

test("an upgrade adds the page where it is missing, in one commit, and a second upgrade changes nothing", t => {
  const { root, git, upgrade } = makeBrain(t, { prefix: "gtm-ds-up-" });
  // a brain from before the page: no HTML, the five starters recorded as given
  git("rm", "-q", "about-us/design-system.html");
  const l = readLayout(root); writeFileSync(join(root, LAYOUT_FILE), JSON.stringify({ layout: l.layout, starters: [...STARTERS].sort() }, null, 2) + "\n");
  git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "a brain from before the design system page");
  const up = upgrade("--confirm");
  assert.equal(up.status, 0, up.stderr + up.stdout);
  assert.match(up.stdout, /added about-us\/design-system\.html/);
  assert.match(up.stdout, /added the design system page about-us\/design-system\.html beside its Markdown/);
  assert.equal(read(root, "about-us/design-system.html"), STARTER.replaceAll("{{COMPANY}}", "Layout Co"));
  assert.ok(git("ls-files").split("\n").includes("about-us/design-system.html"), "committed");
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");
  assert.ok(readLayout(root).starters.includes("design-system.html"));
  const head = git("rev-parse", "HEAD"), again = upgrade("--confirm");
  assert.equal(again.status, 0, again.stderr);
  assert.ok(!/design-system\.html/.test(again.stdout), again.stdout);
  assert.equal(git("rev-parse", "HEAD"), head);
});

test("an upgrade leaves a page that is there byte for byte, and never brings back one the person deleted", t => {
  const { root, git, upgrade } = makeBrain(t, { prefix: "gtm-ds-keep-" });
  const OWN = "<html>our look\r\n</html>";
  writeFileSync(join(root, "about-us/design-system.html"), OWN);
  writeFileSync(join(root, LAYOUT_FILE), JSON.stringify({ layout: readLayout(root).layout, starters: [...STARTERS].sort() }, null, 2) + "\n");
  git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "our own page, on a brain from before the page was given");
  const up = upgrade("--confirm");
  assert.equal(up.status, 0, up.stderr);
  assert.ok(readFileSync(join(root, "about-us/design-system.html")).equals(Buffer.from(OWN)), "byte for byte");
  assert.ok(!/added[^\n]*design-system\.html/.test(up.stdout), up.stdout);
  // recorded as given now: deleting it is the person's choice and stays
  assert.ok(readLayout(root).starters.includes("design-system.html"));
  rmSync(join(root, "about-us/design-system.html"));
  assert.deepEqual(addStarters(root, T), []);
  assert.ok(!exists(root, "about-us/design-system.html"));
});

test("the page goes beside the Markdown wherever it lies: a document in a folder of its own name, a root page left behind", t => {
  const { root, git } = makeBrain(t, { prefix: "gtm-ds-folder-" });
  toLayout2(root, git);
  // the Markdown moved into design-system/ (its first file), no page anywhere, not yet given
  rmSync(join(root, "design-system.html"));
  mkdirSync(join(root, "design-system")); renameSync(join(root, "design-system.md"), join(root, "design-system/design-system.md"));
  for (const { file } of STARTER_PAGES) assert.ok(!readLayout(root).starters.includes(file));
  assert.deepEqual(addStarters(root, T), ["design-system/design-system.html"]);
  assert.equal(designSystem(root, docs.listDocuments(root)).visual, "design-system/design-system.html");
  // a page left at the root when the Markdown moved is still the document's page, and no second one is added
  renameSync(join(root, "design-system/design-system.html"), join(root, "design-system.html"));
  assert.deepEqual(addStarters(root, T), []);
  const doc = docs.listDocuments(root).find(d => d.slug === "design-system");
  assert.deepEqual(docs.documentPage(root, doc), { path: "design-system.html", exists: true });
  assert.equal(designSystem(root, docs.listDocuments(root)).visual, "design-system.html");
});

test("an older shipped starter text is still 'not written', the new one too, and one changed line is a draft", t => {
  const { root } = makeBrain(t, { prefix: "gtm-ds-old-" });
  const legacy = join(T, "legacy", "starters"), fill = f => readFileSync(join(legacy, f), "utf8").replaceAll("{{COMPANY}}", "Layout Co").replaceAll("{{DATE}}", "2026-11-13").replaceAll("{{VERSION}}", "0.34.4");
  assert.ok(readdirSync(legacy).includes("design-system-0.35.0.md") && readdirSync(legacy).includes("strategy-gtm-os.md"));
  const state = slug => { const d = docs.listDocuments(root).find(x => x.slug === slug); return [d.filled, d.state]; };
  assert.deepEqual(state("design-system"), [false, "not filled"], "the starter setup writes today");
  assert.notEqual(docs.parseDocument(root, "about-us/design-system.md").body, lib.parseFrontmatter(fill("design-system-0.35.0.md")).body.trim(), "the starter text did change");
  writeFileSync(join(root, "about-us/design-system.md"), fill("design-system-0.35.0.md"));
  writeFileSync(join(root, "about-us/strategy.md"), fill("strategy-gtm-os.md"));
  assert.deepEqual(state("design-system"), [false, "not filled"], "the 0.35.0 starter");
  assert.deepEqual(state("strategy"), [false, "not filled"], "the starter from before the rename");
  assert.equal(row(root).state, "not written", "the dashboard row");
  writeFileSync(join(root, "about-us/design-system.md"), fill("design-system-0.35.0.md") + "\n- Ink: #14161A\n");
  assert.deepEqual(state("design-system"), [true, "draft"], "a hand edit counts as written");
  // another document's old starter is not this one's
  writeFileSync(join(root, "about-us/voice.md"), fill("design-system-0.35.0.md").replace("title: Design system", "title: Voice"));
  assert.equal(state("voice")[0], true);
});

test("the dashboard row says when the page is missing or still the starter, with the message for Codex", t => {
  const { root } = makeBrain(t, { prefix: "gtm-ds-row-" });
  const starter = row(root);
  assert.deepEqual([starter.page.state, starter.page.label, starter.page.path, starter.page.action], ["starter", "Page not filled in yet", "about-us/design-system.html", "Fill it in with Codex"]);
  assert.match(starter.page.ask, /^Fill in our design system: write the page about-us\/design-system\.html/);
  rmSync(join(root, "about-us/design-system.html"));
  const none = row(root);
  assert.deepEqual([none.page.state, none.page.label, none.page.path, none.page.action], ["none", "No page yet", null, "Make the page with Codex"]);
  assert.equal(none.page.ask, "Make our Design system page: write about-us/design-system.html from our website and brand files, beside about-us/design-system.md, show it to me, and bring about-us/design-system.md in step with it.");
  assert.equal(pillarData(root).design.visual, null);
  writeFileSync(join(root, "about-us/design-system.html"), PAGE);
  assert.deepEqual(row(root).page, { path: "about-us/design-system.html", state: "written", label: "", action: "", ask: "" });
  assert.equal(pillarData(root).design.visual, "about-us/design-system.html");
  for (const d of pillarData(root).configuration.documents) if (d.slug !== "design-system") assert.equal(d.page, undefined, d.slug);
  // the row's markup: the label and the link are in the template, on the design system row only
  const template = readFileSync(join(P, "scripts/gtm-brain-render/home.template.html"), "utf8");
  assert.ok(template.includes("d.page&&d.page.label") && template.includes("askLink(d.page.ask)"));
});

test("add-file --page is the writer: it replaces the page, commits it, and refuses a page that needs a script or the network", t => {
  const { root, git, run } = makeBrain(t, { prefix: "gtm-ds-write-" });
  mkdirSync(join(root, "work/design-system"), { recursive: true });
  const draft = join(root, "work/design-system/design-system.html"), add = (...more) => run("skills/gtm-brain-add-file/add-file.mjs", ["--file", draft, "--document", "design-system", ...more]);
  writeFileSync(draft, PAGE);
  const ok = add("--page");
  assert.equal(ok.status, 0, ok.stderr);
  const out = JSON.parse(ok.stdout);
  assert.deepEqual([out.path, out.page, out.copied, out.replaced], ["about-us/design-system.html", true, true, true]);
  assert.equal(read(root, "about-us/design-system.html"), PAGE);
  assert.ok(exists(root, "about-us/design-system.md"), "the Markdown stays where it was: a page is not a file of the folder");
  assert.match(git("log", "-1", "--format=%s"), /page: about-us\/design-system\.html/);
  assert.equal(git("status", "--porcelain", "--", "about-us").trim(), "");
  assert.equal(JSON.parse(add("--page").stdout).note, "already the page");
  for (const [html, why] of [[PAGE.replace("</body>", "<script>alert(1)</script></body>"), /<script>/], [PAGE.replace("<h1>", '<img src="https://example.test/logo.png"><h1>'), /by address/],
    [STARTER, /starter's meta tag/], [PAGE.replace("<!DOCTYPE html>\n", ""), /DOCTYPE/]]) {
    writeFileSync(draft, html);
    const no = add("--page");
    assert.equal(no.status, 1); assert.match(no.stderr, why);
    assert.equal(read(root, "about-us/design-system.html"), PAGE, "the page is as it was");
  }
  writeFileSync(draft, PAGE);
  const other = run("skills/gtm-brain-add-file/add-file.mjs", ["--file", draft, "--document", "voice", "--page"]);
  assert.equal(other.status, 1); assert.match(other.stderr, /has no page/);
});

test("on layout 3 a page from someone other than the owner becomes a proposal and the page stays", t => {
  const { root, git, run } = makeBrain(t, { prefix: "gtm-ds-prop-" });
  const before = read(root, "about-us/design-system.html");
  mkdirSync(join(root, "work/design-system"), { recursive: true });
  const draft = join(root, "work/design-system/design-system.html"); writeFileSync(draft, PAGE);
  actAs(root, "bo-chen");
  const r = run("skills/gtm-brain-add-file/add-file.mjs", ["--file", draft, "--document", "design-system", "--page"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.proposal, r.stdout); assert.match(out.note, /NOT APPLIED/);
  assert.equal(read(root, "about-us/design-system.html"), before, "the owner's page is untouched");
  assert.ok(git("ls-files", "brain/proposals").includes("design-system.html"), "the proposed page is kept for the owner");
});

test("the document opens on Visual, except when the page is still the starter beside a written Markdown", async t => {
  const { page } = await import("./helpers/dashboard-page.mjs");
  const { root, run } = makeBrain(t, { prefix: "gtm-ds-tab-" });
  const render = () => { const r = run("scripts/gtm-brain-render/render.mjs", [], { GTM_BRAIN_NO_VERSION_CHECK: "1" }); assert.equal(r.status, 0, r.stderr); return JSON.parse(read(root, "work/home/data.json")); };
  const tab = D => { const p = page(D); p.run(`docState={path:"about-us/design-system.md"};dsShell()`); return [p.run("dsTab"), p.node("#ds-visual").hidden]; };
  // a new brain: starter page, starter Markdown: the page says "Not filled in yet", shown on Visual
  assert.deepEqual(tab(render()), ["visual", false]);
  // an older brain whose Markdown is written gets the starter page from the upgrade: it opens on its own text
  const md = join(root, "about-us/design-system.md"); writeFileSync(md, readFileSync(md, "utf8") + "\n- Ink: #14161A\n");
  const D = render();
  assert.equal(D.pillars.configuration.documents.find(d => d.slug === "design-system").page.state, "starter");
  assert.deepEqual(tab(D), ["text", true]);
  // the company's own page: Visual again
  writeFileSync(join(root, "about-us/design-system.html"), PAGE);
  assert.deepEqual(tab(render()), ["visual", false]);
});

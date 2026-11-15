// The Design system document shown as a design system, and what Settings is allowed to hold.
// The page: type samples under a Type heading, bars for spacing steps, the files of the design-system folder and
// the Visual tab for design-system.html (DOM harness). The server: /design-file serves only a listed png, jpg, svg
// or webp and /design-visual only the one listed HTML file, both sandboxed so nothing in them runs script.
// Settings: no company name, owner or team; Configuration's first card carries them.
// Run: node --test plugins/gtm-brain/test/dashboard-design-system.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, realpathSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { page } from "./helpers/dashboard-page.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-brain-ds-codex-")), HOME: mkdtempSync(join(tmpdir(), "gtm-brain-ds-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SESSION_START: "1" };
for (const k of ["GTM_BRAIN_NO_COMMIT", "GTM_BRAIN_RUN", "GTM_BRAIN_APPROVAL_TICKET", "GTM_BRAIN_HOST", "GTM_BRAIN_TEST_LAYOUT"]) delete env[k];
const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-ds-")));
execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--team", "Tomek Zielinski <tomek@reflow.io>"], { cwd: root, env, stdio: "ignore" });
const docs = await import(`${P}/lib/documents.mjs`), pillars = await import(`${P}/lib/dashboard-pillars.mjs`);
const render = () => { execFileSync(process.execPath, [`${P}/scripts/gtm-brain-render/render.mjs`, root], { encoding: "utf8", env, cwd: root }); return JSON.parse(readFileSync(join(root, "work", "home", "data.json"), "utf8")); };
let started = false;
after(() => { if (started) { try { execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, "--stop"], { env }); } catch {} } for (const r of [root, env.CODEX_HOME, env.HOME]) { try { rmSync(r, { recursive: true, force: true }); } catch {} } });

// the Design system document: the starter where setup put it, else one beside the other documents
let doc = docs.listDocuments(root).find(d => /(^|\/)design-system\.md$/.test(d.path))?.path;
if (!doc) { doc = "design-system.md"; writeFileSync(join(root, doc), "---\nkind: document\ntitle: Design system\napplies_to: [design]\nstatus: draft\n---\n\n# Design system\n"); }
const dir = dirname(doc) === "." ? "" : dirname(doc) + "/", at = rel => join(root, dir + rel);
const BODY = ["# Design system", "", "## Colours", "", "- Ink: #14161A", "", "## Type", "",
  "- Headings: Fraunces, 600, tight line height (1.1).", "- Body: Inter, 400, 16 px, line height 1.5.", "- Numbers in tables: tabular figures, right aligned.", "- Keep it calm.", "",
  "## Layout", "", "- 12-column grid, 24 px gutter, 1,120 px maximum content width.", "- Spacing steps: 4, 8, 16, 24, 40, 64.", "- One idea per slide; never more than 30 words.", "",
  "## Spacing", "", "- 4 px hairline gap", "- 12 px inside a card", "- 32 px between sections", "",
  "## Typography", "", "| Style | Font | Weight | Size |", "| --- | --- | --- | --- |", "| Caption | JetBrains Mono | 500 | 12 px |", "| Quote | Georgia | italic | 28 px |", ""].join("\n");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10" fill="#E4572E"/></svg>';
const HTML = '<!doctype html><html><body><h1>Design system</h1><script>document.title="ran"</script></body></html>';

const BARE = render();
test("without a design-system folder or HTML file the document has no files and no Visual tab", () => {
  const D = BARE;
  assert.deepEqual(D.pillars.design, { doc, visual: null, files: [] });
  const p = page(D); p.run(`docState={path:${JSON.stringify(doc)}};dsShell()`);
  assert.equal(p.node("#ds-tabs").innerHTML, ""); assert.equal(p.node("#ds-visual").hidden, true); assert.equal(p.run("dsFilesHtml()"), "");
});

mkdirSync(at("design-system/templates"), { recursive: true });
writeFileSync(at("design-system/logo.svg"), SVG);
writeFileSync(at("design-system/cover.png"), Buffer.from("89504e470d0a1a0a", "hex"));
writeFileSync(at("design-system/photo.JPG"), Buffer.from("ffd8ffe0", "hex"));
writeFileSync(at("design-system/templates/slides.txt"), "notes\n");
writeFileSync(at("design-system/page.html"), HTML);
writeFileSync(at("design-system/.hidden.png"), "x");
symlinkSync(join(root, "brain"), at("design-system/linked"));
symlinkSync(at("design-system/templates/slides.txt"), at("design-system/alias.png"));
writeFileSync(at("design-system.html"), HTML);
const D = render(), DS = D.pillars.design;

test("render lists the design-system folder's plain files and the HTML beside the document, and nothing else", () => {
  assert.equal(DS.doc, doc); assert.equal(DS.visual, dir + "design-system.html");
  assert.deepEqual(DS.files.map(f => [f.name, f.image]), [["cover.png", true], ["logo.svg", true], ["page.html", false], ["photo.JPG", true], ["templates/slides.txt", false]], "no dot file, no link, folders walked");
  assert.ok(DS.files.every(f => f.path.startsWith(dir + "design-system/")));
  assert.ok(!D.pillars.files.includes(DS.visual) && !DS.files.some(f => D.pillars.files.includes(f.path)), "none of it is opened as text by /file");
  assert.deepEqual(pillars.designSystem(root, []), { doc: null, visual: null, files: [] });
});

test("the page: type samples, spacing bars, files and the Visual tab, for the Design system document only", () => {
  const p = page(D, { live: true });
  const md = p.run(`mdDoc(${JSON.stringify(BODY)}).html`), out = p.run(`dsEnhance(${JSON.stringify(md)})`);
  const samples = [...out.matchAll(/<div class="ds-type"><span class="ds-type-sample" style="([^"]*)">([^<]*)<\/span>(<small class="ds-type-note">font not loaded here<\/small>)?<\/div>/g)].map(m => [m[1], m[2], !!m[3]]);
  assert.equal(samples.length, 5, "three bullets and two table rows name a font, a weight or a size; 'Keep it calm' does not");
  assert.deepEqual(samples[0], ["font-family:serif;font-weight:600;font-size:22px;line-height:1.1", "The quick brown fox 0123456789", true], "a font the page does not load: the nearest generic family, and it says so");
  assert.deepEqual(samples[1], ["font-family:&quot;Inter&quot;,sans-serif;font-weight:400;font-size:16px;line-height:1.5", "The quick brown fox 0123456789", false], "a font the page loads is used as it is");
  assert.match(samples[2][0], /font-variant-numeric:tabular-nums/); assert.match(samples[2][1], /0123456789/);
  assert.match(samples[3][0], /^font-family:&quot;JetBrains Mono&quot;,monospace;font-weight:500;font-size:12px/); assert.equal(samples[3][2], false);
  assert.match(samples[4][0], /^font-family:&quot;Georgia&quot;,serif;font-size:28px;.*font-style:italic/, "a system font is used by name"); assert.equal(samples[4][2], false);
  assert.match(out, /<th scope="col">Sample<\/th>/); assert.doesNotMatch(out, /Keep it calm\.<div/);
  const bars = [...out.matchAll(/<ul class="ds-bars" aria-label="Steps, in pixels: ([^"]*)">(.*?)<\/ul>/g)].map(m => [m[1], [...m[2].matchAll(/width:(\d+)px/g)].map(w => +w[1])]);
  assert.deepEqual(bars, [["4, 8, 16, 24, 40, 64", [4, 8, 16, 24, 40, 64]], ["4, 12, 32", [4, 12, 32]]], "a list of steps and a list of px values become bars of those lengths; a grid line with one px value does not");
  const odd = p.run(`dsEnhance(mdDoc(${JSON.stringify('## Type\n\n- Display: Evil";background:url(x), 700\n- Label: Bad<Font>, 500')}).html)`);
  assert.match(odd, /style="font-weight:700;font-size:22px/); assert.doesNotMatch(odd, /style="[^"]*(background|Evil|Bad)/, "a name that is not a plain font name never reaches the style");
  // the files, with pictures through the image route only
  const files = p.run("dsFilesHtml()");
  assert.match(files, new RegExp(`<img src="/design-file\\?path=${encodeURIComponent(dir + "design-system/logo.svg").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" alt="logo\\.svg"`));
  assert.equal((files.match(/<img /g) || []).length, 3); assert.match(files, /templates\/slides\.txt/); assert.doesNotMatch(files, /<object|<embed|<iframe|<a /);
  // the tabs
  p.run(`docState={path:${JSON.stringify(doc)}};dsTab="visual";dsShell()`);
  assert.match(p.node("#ds-tabs").innerHTML, /role="tab" id="ds-tab-visual"[^>]*aria-selected="true"[^>]*>Visual<.*role="tab" id="ds-tab-text"[^>]*aria-selected="false"[^>]*>Text</s);
  assert.match(p.node("#ds-visual").innerHTML, /<iframe class="ds-frame" sandbox="" referrerpolicy="no-referrer" title="[^"]+" src="\/design-visual"><\/iframe>/, "an empty sandbox: no scripts, no same origin");
  assert.equal(p.node("#ds-visual").hidden, false); assert.equal(p.node("#doc-body").hidden, true);
  p.run(`dsTab="text";dsShell()`); assert.equal(p.node("#ds-visual").hidden, true); assert.equal(p.node("#doc-body").hidden, false);
  // another document gets none of it
  p.run(`docState={path:"RULES.md"};dsShell()`); assert.equal(p.node("#ds-tabs").innerHTML, ""); assert.equal(p.run(`dsIs("RULES.md")`), false);
  const old = page({ ...D, pillars: { ...D.pillars, design: undefined } }); assert.equal(old.run(`dsIs(${JSON.stringify(doc)})`), false, "a page rendered before this has no design data and still loads");
});

test("dashboard server: /design-file serves only listed pictures and /design-visual only the one HTML file, sandboxed", async () => {
  const url = execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, "--start", "--port=48893"], { encoding: "utf8", env }).trim(); started = true;
  const get = (path, init = {}) => fetch(url + path.replace(/^\//, ""), { ...init, headers: { connection: "close", ...(init.headers || {}) } });
  const file = rel => "/design-file?path=" + encodeURIComponent(dir + "design-system/" + rel);
  for (const [rel, type] of [["cover.png", "image/png"], ["photo.JPG", "image/jpeg"], ["logo.svg", "image/svg+xml"]]) {
    const r = await get(file(rel)); await r.arrayBuffer();
    assert.equal(r.status, 200, rel); assert.equal(r.headers.get("content-type"), type);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff"); assert.equal(r.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(r.headers.get("content-security-policy"), "sandbox; default-src 'none'; style-src 'unsafe-inline'", "an SVG opened on its own cannot run its script");
  }
  assert.equal(await (await get(file("logo.svg"))).text(), SVG);
  // not a picture, not listed, outside the folder, a link, a path of the caller's making
  for (const bad of [file("templates/slides.txt"), file("page.html"), file(".hidden.png"), file("alias.png"), file("linked/admin.md"), file("../" + doc.split("/").pop()), file("nope.png"), file("logo.svg") + "%00",
    "/design-file?path=" + encodeURIComponent(DS.visual), "/design-file?path=" + encodeURIComponent(doc), "/design-file?path=..%2F..%2Fetc%2Fpasswd", "/design-file?path=%2Fetc%2Fpasswd", "/design-file?path=work%2Fhome%2Fdata.json", "/design-file"]) assert.equal((await get(bad)).status, 404, bad);
  assert.equal((await get(file("logo.svg"), { headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal((await get(file("logo.svg"), { method: "POST" })).status, 405);
  // the HTML: one file, no path to choose, and headers under which its script cannot run
  const v = await get("/design-visual?path=" + encodeURIComponent(dir + "design-system/page.html"));
  assert.equal(v.status, 200); assert.equal(await v.text(), HTML, "the path in the address is ignored: only the listed design-system.html");
  assert.equal(v.headers.get("content-type"), "text/html; charset=utf-8"); assert.equal(v.headers.get("x-content-type-options"), "nosniff");
  assert.equal(v.headers.get("content-security-policy"), "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:", "sandbox without allow-scripts and no script source: the script in the file does not run");
  assert.equal((await get("/design-visual", { headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal((await get("/design-visual", { method: "POST" })).status, 405);
  assert.equal((await get("/file?path=" + encodeURIComponent(DS.visual))).status, 404, "the text route does not open it");
  const elsewhere = await new Promise(done => import("node:http").then(({ request }) => { const q = request(url + "design-visual", { headers: { host: "evil.example", connection: "close" } }, r => { r.resume(); done(r.statusCode); }); q.end(); }));
  assert.equal(elsewhere, 403, "the Host check comes first");
  // the HTML file goes away: the route answers 404 at once, and after a render the tab is gone
  rmSync(at("design-system.html")); assert.equal((await get("/design-visual")).status, 404);
  assert.equal(render().pillars.design.visual, null);
});

test("Settings holds only what the brain needs to work; who the company is sits first in Configuration", () => {
  const p = page(D), html = readFileSync(new URL("../scripts/gtm-brain-render/home.template.html", import.meta.url), "utf8");
  const section = html.match(/<section class="view" data-view="admin">([\s\S]*?)<\/section>/)[1];
  const ids = [...section.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ["settings-preferences", "workspace-folders", "admin-tools", "plugin-line"], "the Settings view's own containers");
  const settings = section + ids.map(id => p.node("#" + id).innerHTML).join("\n");
  for (const who of ["Reflow", "Marta", "Nowak", "Tomek", "Zielinski", "reflow.io", "returns automation"]) assert.doesNotMatch(settings, new RegExp(who), `Settings does not say ${who}`);
  assert.doesNotMatch(settings, /admin\.md|settings\.yaml|APPROVE/, "plain words, no file names");
  assert.match(p.node("#settings-preferences").innerHTML, /Open dashboard.*Topic summaries.*GTM Brain version/s);
  // Configuration: the company card comes before the base documents, with the team as people and the way to change it
  const config = html.match(/<section class="view" data-view="config">([\s\S]*?)<\/section>/)[1];
  assert.ok(config.indexOf('id="cfg-about"') > 0 && config.indexOf('id="cfg-about"') < config.indexOf('id="cfg-docs"'), "About the company is the first card");
  const about = p.node("#cfg-about").innerHTML;
  assert.match(about, /<h2>About the company<\/h2>.*Change with Codex.*The owner approves every change to it\..*Company<\/dt><dd>Reflow<\/dd>.*Owner<\/dt><dd>Marta Nowak<\/dd>.*Team<\/dt>.*Marta Nowak.*Tomek Zielinski/s);
  assert.doesNotMatch(about, /Open dashboard|Topic summaries|GTM Brain version|Connected tools|Working folders/, "no switch in the company card");
  const member = D.pillars.entities.rows.find(e => e.name === "Marta Nowak");
  if (member) assert.match(about, new RegExp(`data-entity-id="${member.id}">Marta Nowak</button>`), "a team member with an entity opens it");
  // the search hit and the Overview item for a profile change lead to Configuration, where the profile is
  assert.match(p.run(`searchRow("workspace",D.admin,"reflow")`), /data-v="config">.*Company profile/s);
});

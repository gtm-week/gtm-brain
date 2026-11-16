// The dashboard's one write and its search: POST /document saves a document the person edited on the page, through
// the document script, and only from the page itself (this server's Origin, the token made at each start, JSON, a
// path lib/documents lists, the hash of the version that was opened); GET /search reads the memory index. On a
// layout 3 brain, so a teammate's save of a base file becomes a proposal for the owner. The page's own code (the
// search scorer, the Markdown the reader shows) runs in the DOM harness.
// Run: node --test plugins/gtm-brain/test/dashboard-edit.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { request } from "node:http";
import { page } from "./helpers/dashboard-page.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-brain-edit-codex-")), HOME: mkdtempSync(join(tmpdir(), "gtm-brain-edit-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SESSION_START: "1" };
for (const k of ["GTM_BRAIN_NO_COMMIT", "GTM_BRAIN_RUN", "GTM_BRAIN_APPROVAL_TICKET", "GTM_BRAIN_HOST", "GTM_BRAIN_TEST_LAYOUT"]) delete env[k];
const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-edit-")));
execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--team", "Tomek Zielinski <tomek@reflow.io>"], { cwd: root, env, stdio: "ignore" });
const lib = await import(`${P}/lib/brain.mjs`), docs = await import(`${P}/lib/documents.mjs`);
const as = handle => writeFileSync(join(root, "work", "person.json"), JSON.stringify({ handle }) + "\n");
const node = (script, ...args) => execFileSync(process.execPath, [`${P}/${script}`, root, ...args], { encoding: "utf8", env, cwd: root }).trim();
const dash = (extra = {}, ...a) => execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, ...a], { encoding: "utf8", env: { ...env, ...extra } }).trim();
after(() => { try { dash({}, "--stop"); } catch {} for (const r of [root, env.CODEX_HOME, env.HOME]) { try { rmSync(r, { recursive: true, force: true }); } catch {} } });

as("marta-nowak");
node("scripts/gtm-brain-documents/document.mjs", "--create", "--title", "Sales playbook", "--applies-to", "outreach, proposals", "--body", "How we sell.\n\nFirst call: listen.", "--folder", "sales", "--by", "marta-nowak");
lib.writeNames(root, [...lib.readNames(root), { name: "Amdahl Systems", kind: "organization", subtype: "company" }, { name: "John Smith", kind: "person", aliases: ["Johnny"], emails: ["john@amdahl.test"] }]);
lib.appendMemory(root, "company", { authors: ["marta-nowak"], content: "Notes from the Berlin workshop with Amdahl Systems: John Smith wants a pilot in March.", people: ["John Smith", "Amdahl Systems"], at: new Date(Date.now() - 2 * 864e5).toISOString() });
lib.appendMemory(root, "company", { authors: ["marta-nowak"], content: "Pricing review moved to next quarter.", at: new Date(Date.now() - 864e5).toISOString() });
node("scripts/gtm-brain-render/render.mjs");
const D = JSON.parse(readFileSync(join(root, "work", "home", "data.json"), "utf8"));

const PORT = 48931, url = dash({}, "--start", `--port=${PORT}`), origin = `http://127.0.0.1:${PORT}`;
const html = await (await fetch(url, { headers: { connection: "close" } })).text();
const token = html.match(/<meta name="gtm-brain-edit" content="([a-f0-9]{64})">/)?.[1];
const playbook = "sales/sales-playbook.md", base = docs.listDocuments(root).find(d => d.base && d.path.startsWith("about-us/")).path;
const sha = path => createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
const bodyOf = path => docs.parseDocument(root, path).body;
// node's fetch refuses to set Origin and Host, so the requests are made by hand
const send = (method, path, { headers = {}, body = null } = {}) => new Promise((resolve, reject) => {
  const req = request(url + path.replace(/^\//, ""), { method, headers: { connection: "close", ...headers } }, res => { let text = ""; res.setEncoding("utf8"); res.on("data", c => text += c); res.on("end", () => { let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, json, text }); }); });
  req.on("error", reject); if (body !== null) req.write(body); req.end();
});
const save = (input, headers = {}) => send("POST", "/document", { headers: { origin, "content-type": "application/json", "x-gtm-brain-token": token, ...headers }, body: typeof input === "string" ? input : JSON.stringify(input) });
const commits = () => execFileSync("git", ["-C", root, "log", "--format=%s"], { encoding: "utf8" }).trim().split("\n");

test("the page carries the save token only when this server serves it, and a new one at each start", () => {
  assert.match(token || "", /^[a-f0-9]{64}$/);
  assert.match(readFileSync(join(root, "work", "home", "index.html"), "utf8"), /<meta name="gtm-brain-edit" content="">/, "the copy on disk has none");
});

test("a save from the page goes through the document script: written, committed, the header kept", async () => {
  const before = commits().length, text = bodyOf(playbook).replace("First call: listen.", "First call: listen, then ask about returns.");
  const r = await save({ path: playbook, body: text, hash: sha(playbook) });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.status, "saved");
  const file = readFileSync(join(root, playbook), "utf8");
  assert.match(file, /^---\nkind: document\ntitle: Sales playbook\napplies_to: \[outreach, proposals\]/, "the header is the script's");
  assert.match(file, /First call: listen, then ask about returns\./);
  assert.equal(r.json.hash, sha(playbook)); assert.equal(r.json.body, bodyOf(playbook));
  assert.equal(commits().length, before + 1); assert.match(commits()[0], /Updated document sales\/sales-playbook\.md/);
  assert.equal(execFileSync("git", ["-C", root, "status", "--short", "--", "sales"], { encoding: "utf8" }).trim(), "", "nothing is left uncommitted");
  // a text that begins with two hyphens is still the text, not a flag of the script
  const dashed = await save({ path: playbook, body: "-- a line that starts like a flag\n\nStill the document.", hash: sha(playbook) });
  assert.equal(dashed.status, 200, dashed.text); assert.match(readFileSync(join(root, playbook), "utf8"), /-- a line that starts like a flag/);
});

test("anything that is not the page is refused, and nothing is written", async () => {
  const before = readFileSync(join(root, playbook), "utf8"), n = commits().length, input = { path: playbook, body: "Overwritten.", hash: sha(playbook) };
  const cases = [
    ["no token", await save(input, { "x-gtm-brain-token": "" }), 403],
    ["a wrong token", await save(input, { "x-gtm-brain-token": "0".repeat(64) }), 403],
    ["a foreign Origin", await save(input, { origin: "https://evil.example" }), 403],
    ["another port as Origin", await save(input, { origin: "http://127.0.0.1:1" }), 403],
    ["no Origin", await send("POST", "/document", { headers: { "content-type": "application/json", "x-gtm-brain-token": token }, body: JSON.stringify(input) }), 403],
    ["a cross-site fetch", await save(input, { "sec-fetch-site": "cross-site" }), 403],
    ["a rebound host", await save(input, { host: "evil.example:80" }), 403],
    ["a form post", await save("path=x", { "content-type": "application/x-www-form-urlencoded" }), 415],
    ["text/plain", await save(JSON.stringify(input), { "content-type": "text/plain" }), 415],
    ["not JSON", await save("{nope"), 400],
    ["no hash", await save({ path: playbook, body: "x" }), 400],
    ["an empty text", await save({ ...input, body: "  \n" }), 422],
  ];
  for (const [name, r, status] of cases) assert.equal(r.status, status, `${name}: ${r.text}`);
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) assert.ok([404, 405].includes((await send(method, "/document", { headers: { origin, "x-gtm-brain-token": token } })).status), method);
  for (const path of ["brain/admin.md", "config/settings.yaml", "config/rules.md", "RULES.md", "../outside.md", "/etc/passwd", "sales/../sales/sales-playbook.md", "sales/sales-playbook", "brain/contexts/company/memories.jsonl", "workflows/outbound.md", "AGENTS.md", ""])
    assert.equal((await save({ path, body: "Overwritten.", hash: "0".repeat(64) })).status, path ? 404 : 404, path);
  assert.equal(readFileSync(join(root, playbook), "utf8"), before); assert.equal(commits().length, n);
});

test("a text over the document limit is refused before it is read whole", async () => {
  const n = commits().length;
  assert.equal((await save({ path: playbook, body: "x".repeat(docs.BODY_MAX + 1), hash: sha(playbook) })).status, 413);
  assert.equal((await save("x".repeat(docs.BODY_MAX * 6 + 8192))).status, 413);
  assert.equal(commits().length, n);
});

test("a document that changed since it was opened is not overwritten: both versions come back", async () => {
  const opened = sha(playbook);
  node("scripts/gtm-brain-documents/document.mjs", "--update", playbook, "--append", "## Added in Codex\n\nA teammate wrote this meanwhile.", "--by", "marta-nowak");
  const n = commits().length, r = await save({ path: playbook, body: "My edit from the page.", hash: opened });
  assert.equal(r.status, 409, r.text); assert.equal(r.json.status, "stale");
  assert.match(r.json.body, /A teammate wrote this meanwhile/); assert.equal(r.json.hash, sha(playbook));
  assert.doesNotMatch(readFileSync(join(root, playbook), "utf8"), /My edit from the page/); assert.equal(commits().length, n);
  // with the hash of what is there now, the person's choice to keep theirs is a normal save
  assert.equal((await save({ path: playbook, body: "My edit from the page.", hash: r.json.hash })).status, 200);
});

test("layout 3: a teammate's save of a base file is sent to the owner as a proposal, and the file stays", async () => {
  const before = readFileSync(join(root, base), "utf8");
  as("tomek-zielinski");
  const r = await save({ path: base, body: bodyOf(base) + "\n\nTomek thinks we should also sell to marketplaces.", hash: sha(base) });
  as("marta-nowak");
  assert.equal(r.status, 200, r.text); assert.equal(r.json.status, "proposal");
  assert.match(r.json.note, /proposal p_[0-9a-f]{10}/); assert.match(r.json.note, /owner/i);
  assert.equal(readFileSync(join(root, base), "utf8"), before, "the base file is as it was");
  assert.equal(r.json.hash, sha(base));
});

test("the search box's notes come from the memory index: a typo still finds the note; a read only", async () => {
  const get = path => send("GET", path);
  const found = await get("/search?q=" + encodeURIComponent("berlin workshp"));
  assert.equal(found.status, 200, found.text); assert.ok(found.json.notes.length >= 1);
  assert.match(found.json.notes[0].content, /Berlin workshop/); assert.deepEqual(Object.keys(found.json.notes[0]).sort(), ["at", "authors", "content", "context", "id", "kind", "people", "source", "tags"]);
  assert.equal((await get("/search?q=" + encodeURIComponent("zzqqxx never said"))).json.notes.length, 0);
  assert.equal((await get("/search?q=")).status, 400);
  assert.equal((await get("/search?q=" + "a".repeat(201))).status, 400);
  assert.ok((await get("/search?q=pricing&limit=5000")).json.notes.length <= 50);
  assert.equal((await send("GET", "/search?q=pricing", { headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  for (const method of ["POST", "PUT", "DELETE"]) assert.equal((await send(method, "/search?q=pricing", { headers: { origin } })).status, 405, method);
});

test("a scheduled or background run never saves a document", async () => {
  dash({}, "--stop");
  dash({ GTM_BRAIN_RUN: "1" }, "--start", `--port=${PORT}`);
  const fresh = (await (await fetch(url, { headers: { connection: "close" } })).text()).match(/gtm-brain-edit" content="([a-f0-9]{64})"/)[1];
  assert.notEqual(fresh, token, "a new start makes a new token");
  const before = readFileSync(join(root, playbook), "utf8");
  assert.equal((await save({ path: playbook, body: "From a run.", hash: sha(playbook) }, { "x-gtm-brain-token": fresh })).status, 403);
  assert.equal((await save({ path: playbook, body: "With the old token.", hash: sha(playbook) })).status, 403);
  assert.equal(readFileSync(join(root, playbook), "utf8"), before);
  dash({}, "--stop");
});

test("page: the search forgives typos, missing letters, part words and word order, and says what it searched", () => {
  const p = page(D), match = (q, fields) => p.run(`fzMatch(${JSON.stringify(q)},${JSON.stringify(fields)})`);
  for (const [q, text] of [["amdal", "Amdahl Systems"], ["jon smi", "John Smith"], ["smith john", "John Smith"], ["berln workshp", "Notes from the Berlin workshop"], ["AMDAHL", "amdahl systems"], ["zielinski", "Tomek Zieliński"]])
    assert.ok(match(q, [[text, 1]]), `${q} finds ${text}`);
  // letters with and without their marks are the same letter, both ways, and the mark lands on the name as written
  for (const [q, text] of [["lukasz", "Łukasz Jakubowski"], ["Łukasz", "Lukasz Jakubowski"], ["soren", "Søren Holm"], ["strasse", "Straße 5"], ["zolty", "żółty"], ["żółty", "zolty"], ["dordevic", "Đorđević"]]) assert.ok(match(q, [[text, 1]]), `${q} finds ${text}`);
  assert.equal(p.run(`fzMark("Łukasz Jakubowski",fzMatch("lukasz",[["Łukasz Jakubowski",1]]).marks)`), "<mark>Łukasz</mark> Jakubowski");
  for (const [q, text] of [["xyz", "John Smith"], ["john brown", "John Smith"], ["am", "Tomek"]]) assert.equal(match(q, [[text, 1]]), null, `${q} does not find ${text}`);
  assert.ok(match("john smith", [["John Smith", 1]]).score > match("jon smi", [["John Smith", 1]]).score, "an exact name ranks above a near one");
  assert.equal(p.run(`fzMark("John Smith",fzMatch("jon smi",[["John Smith",1]]).marks)`), "<mark>John</mark> <mark>Smi</mark>th");
  assert.equal(p.run(`fzMark("<b>John</b>",[[3,7]])`), "&lt;b&gt;<mark>John</mark>&lt;/b&gt;", "what is highlighted is escaped");
  p.run(`gqSearch("amdal")`);
  const shown = p.node("#gq-results").innerHTML;
  assert.match(shown, /People and companies.*<mark>Amdahl<\/mark> Systems/s); assert.match(shown, /role="option"[^>]*aria-selected="true"/);
  p.run(`gqSearch("johnny")`); assert.match(p.node("#gq-results").innerHTML, /John Smith/, "an alias finds the person");
  p.run(`gqSearch("playbok")`); assert.match(p.node("#gq-results").innerHTML, /Documents.*Sales <mark>playbook<\/mark>/s);
  p.run(`gqSearch("berln workshp")`); assert.match(p.node("#gq-results").innerHTML, /Notes.*<mark>Berlin<\/mark> <mark>workshop<\/mark>/s, "notes in the page are matched while the server is asked");
  p.run(`gqSearch("qqqzzzxxx")`);
  const none = p.node("#gq-results").innerHTML;
  assert.match(none, /Nothing found for "qqqzzzxxx"/); assert.match(none, /Searched \d+ people and companies, \d+ notes/);
  assert.deepEqual(JSON.parse(JSON.stringify(p.run(`fzNearest("amxdaxl",["John Smith","Amdahl Systems","Returns Desk"])`))), ["Amdahl Systems"], "a name too far off to match is still offered as the closest");
  assert.deepEqual(JSON.parse(JSON.stringify(p.run(`fzNearest("qqqzzzxxx",["John Smith","Amdahl Systems"])`))), []);
  p.run(`gqSearch("")`); assert.equal(p.node("#gq-results").hidden, true);
});

test("page: every filter box uses the one scorer: Entities, Memories, the rules and the schema", async () => {
  const calls = [], fetcher = async path => { calls.push(String(path)); return { ok: true, status: 200, json: async () => String(path).startsWith("/search") ? { ok: true, notes: [], more: 0 } : String(path).endsWith("notes.json") ? JSON.parse(readFileSync(join(root, "work", "home", D.pillars.memories.file), "utf8")) : D }; };
  const p = page(D, { live: true, fetcher }), type = (id, value) => p.listeners.input.forEach(fn => fn({ target: { id, value, selectionStart: value.length } }));
  // the three examples, on the scorer itself
  for (const [q, text] of [["amdal", "Amdahl Systems"], ["jon smi", "John Smith"], ["berln workshp", "Notes from the Berlin workshop with Amdahl Systems"]]) assert.ok(p.run(`fzMatch(${JSON.stringify(q)},[[${JSON.stringify(text)},1]])`), q);
  p.run('show("entities")'); type("ent-q", "amdal");
  assert.deepEqual(JSON.parse(JSON.stringify(p.run("exRows.map(e=>e.name)"))), ["Amdahl Systems", "John Smith"], "the Entities filter forgives a typo: the company first, then the person whose email is there");
  type("ent-q", "jon smi"); assert.equal(p.run("exRows[0].name"), "John Smith", "and part words, best match first");
  type("ent-q", "smith john"); assert.equal(p.run("exRows[0].name"), "John Smith", "in any order");
  assert.match(p.run('entMark("John Smith","jon smi")'), /<mark class="ent-hit">John<\/mark> <mark class="ent-hit">Smi<\/mark>th/);
  type("ent-q", "");
  p.run('show("notes")'); type("pm-q", "berln workshp");
  assert.match(p.node("#pm-list").innerHTML, /<mark>Berlin<\/mark> <mark>workshop<\/mark>/, "the Memories filter forgives typos and marks what matched");
  assert.doesNotMatch(p.node("#pm-list").innerHTML, /Pricing review moved/);
  assert.match(p.node("#pm-status").textContent, /^Searching all \d+ notes/, "and says it is asking for every note");
  type("pm-q", "");
  p.run('cfgTab="rules";renderConfigTabs()'); type("cfg-rule-q", "calender");
  assert.match(p.node("#cfg-rules").innerHTML, /Calendar/, "the rules filter forgives a typo"); assert.doesNotMatch(p.node("#cfg-rules").innerHTML, /cfg-rule-title">Questions about deal stage/);
  type("cfg-schema-q", "linkdin");
  assert.match(p.node("#cfg-schema").innerHTML, /linkedin/); assert.doesNotMatch(p.node("#cfg-schema").innerHTML, /<th scope="row">location/);
});

test("page: a document is shown as Markdown with nothing in it able to run, and an outline of its headings", () => {
  const p = page(D), md = text => p.run(`mdDoc(${JSON.stringify(text)})`);
  const r = md("# Strategy\n\nWe sell **returns** to *retailers*. See [the site](https://example.com) and `code`.\n\n## Where we play\n\n| Segment | Size |\n| --- | ---: |\n| Fashion | 50+ |\n\n- one\n  - nested\n- [x] done\n\n1. first\n2. second\n\n```js\nif (a < b) run()\n```\n\n> quoted\n\n## Where we play\n");
  assert.deepEqual(JSON.parse(JSON.stringify(r.headings)).map(h => [h.level, h.text, h.id, h.line]), [[1, "Strategy", "h-strategy", 0], [2, "Where we play", "h-where-we-play", 4], [2, "Where we play", "h-where-we-play-2", 23]]);
  for (const piece of ['<h1 id="h-strategy">Strategy</h1>', "<strong>returns</strong>", "<em>retailers</em>", '<a href="https://example.com" target="_blank" rel="noopener noreferrer">the site</a>', "<code>code</code>",
    '<th scope="col">Segment</th>', '<td style="text-align:right">50+</td>', "<ul><li>one<ul><li>nested</li></ul></li>", 'class="md-task done"', "<ol><li>first</li><li>second</li></ol>", "if (a &lt; b) run()", "<blockquote><p>quoted</p></blockquote>"]) assert.ok(r.html.includes(piece), piece);
  const bad = md('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1)) [data](data:text/html,x) ![i](https://e.test/a.png "t")\n\n<a href="https://e.test" onclick="x()">raw</a>').html;
  assert.doesNotMatch(bad, /<script|<img|onerror=alert\(1\)>|href="javascript:|href="data:|<a href="https:\/\/e\.test" onclick/);
  assert.match(bad, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/); assert.match(bad, /<span class="md-plainlink" title="javascript:alert\(1">click<\/span>/, "a link that is not http, https or mailto is text");
  assert.equal(p.run(`mdWords("One two, three-four.\\n\\n\`\`\`\\nnot counted\\n\`\`\`")`), 3);
  assert.equal(p.run(`mdFront("---\\nkind: document\\ntitle: T\\n---\\n# T\\n\\nBody.\\n")`), "# T\n\nBody.");
});

test("page: a document opens in the page; the editor shows only with this server's token, and a save sends the opened version's hash", async () => {
  const raw = readFileSync(join(root, playbook), "utf8"), calls = [];
  const fetcher = async (path, options = {}) => {
    calls.push([String(path), options]);
    if (String(path).startsWith("/file?path=")) return { ok: true, status: 200, text: async () => raw, headers: { get: k => k === "x-gtm-brain-hash" ? "a".repeat(64) : null } };
    if (path === "/document") return { ok: true, status: 200, json: async () => ({ ok: true, status: "saved", note: "updated document", hash: "b".repeat(64), body: JSON.parse(options.body).body }) };
    return { ok: true, status: 200, json: async () => D };
  };
  // without the token (a copy on disk, or a server from before): a reader, and it says why
  const reader = page(D, { live: true, fetcher });
  await reader.run(`openDoc(${JSON.stringify(playbook)})`);
  assert.equal(reader.run("view"), "doc"); assert.equal(reader.run("docState.editable"), false);
  assert.match(reader.node("#doc-view").innerHTML, /<h1 id="doc-title"[^>]*>Sales playbook<\/h1>/); assert.match(reader.node("#doc-view").innerHTML, /Codex reads this before: outreach, proposals/);
  assert.match(reader.node("#doc-view").innerHTML, /class="doc-chat" href="codex:\/\/threads\/new/); assert.doesNotMatch(reader.node("#doc-view").innerHTML, /<textarea|data-doc-save/);
  assert.match(reader.node("#doc-preview").innerHTML, /My edit from the page|How we sell/); assert.match(reader.node("#doc-notice").innerHTML, /Read-only for now/);
  // with it: the editor, an unsaved marker, and a save that names the path, the text and the hash it opened
  const live = page(D, { live: true, fetcher }); live.node('meta[name="gtm-brain-edit"]').setAttribute("content", "c".repeat(64));
  const editor = page(D, { live: true, fetcher, html: readFileSync(`${P}/scripts/gtm-brain-render/home.template.html`, "utf8").replace("const EDIT_TOKEN=(()=>{", `const EDIT_TOKEN="${"c".repeat(64)}"||(()=>{`) });
  await editor.run(`openDoc(${JSON.stringify(playbook)})`);
  assert.equal(editor.run("docState.editable"), true); assert.match(editor.node("#doc-view").innerHTML, /<textarea id="doc-text"/); assert.match(editor.node("#doc-view").innerHTML, /role="toolbar"/);
  assert.equal(editor.run("docDirty()"), false);
  editor.node("#doc-text").value = editor.run("docState.body") + "\n\n## New section\n\nMore."; editor.run("docChanged()");
  assert.equal(editor.run("docDirty()"), true); assert.equal(editor.node("#doc-dirty").textContent, "Unsaved changes"); assert.match(editor.node("#doc-outline").innerHTML, /New section/);
  editor.run(`newer("another-revision")`); assert.equal(editor.reloads, 0, "the page does not reload over unsaved text"); assert.match(editor.node("#doc-notice").innerHTML, /refreshes once you save or leave/);
  await editor.run("docSave()");
  const [path, sent] = calls.find(c => c[0] === "/document");
  assert.equal(path, "/document"); assert.equal(sent.method, "POST"); assert.equal(sent.headers["x-gtm-brain-token"], "c".repeat(64)); assert.equal(sent.headers["content-type"], "application/json");
  assert.deepEqual(Object.keys(JSON.parse(sent.body)).sort(), ["body", "hash", "path"]); assert.equal(JSON.parse(sent.body).hash, "a".repeat(64)); assert.match(JSON.parse(sent.body).body, /## New section/);
  assert.equal(editor.run("docDirty()"), false); assert.equal(editor.run("docState.hash"), "b".repeat(64)); assert.match(editor.node("#doc-notice").innerHTML, /Saved\./);
  // the rules, the schema and the settings are never offered for editing
  for (const path of [D.pillars.configuration.rules.path, D.pillars.configuration.schema.path, D.pillars.configuration.settings.path]) { await editor.run(`openDoc(${JSON.stringify(path)})`); assert.equal(editor.run("docState.editable"), false, path); }
  assert.equal(editor.run(`docInfo("brain/contexts/company/memories.jsonl")`), null);
});

test("page: the layout click is read from the layout buttons only, never from #doc-view, which carries the same attribute", () => {
  // #doc-view has data-doc-mode for the CSS. A handler that matched it took every click inside an open document, so
  // the outline and the two conflict buttons did nothing (the browser test in frontend/dashboard/e2e clicks them).
  const tpl = readFileSync(`${P}/scripts/gtm-brain-render/home.template.html`, "utf8");
  assert.match(tpl, /\$\("#doc-view"\)\.dataset\.docMode=/);
  assert.match(tpl, /closest\("button\[data-doc-mode\]"\)/);
  assert.doesNotMatch(tpl, /closest\("\[data-doc-mode\]"\)|querySelectorAll\("\[data-doc-mode\]"\)/);
});

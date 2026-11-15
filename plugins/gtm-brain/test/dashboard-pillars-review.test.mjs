// These tests read and write the root files of a layout 2 brain: setup and the lib play a plugin that writes layout 2 at most
// (lib/layout-version.mjs GTM_BRAIN_TEST_LAYOUT). Layout 3 (about-us/, config/) is covered by config-folders.test.mjs.
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
process.env.GTM_BRAIN_NO_SESSION_MAINTENANCE = "1";
// The front page's four tabs on the inputs that break a reader: a workflow file whose trigger is not a
// plain string, a registry entry a reader cannot handle, a document with a name outside ASCII, a listed
// file swapped for a link after the render, corrections among the newest notes, and a health line that
// actually has something to say. The dashboard must still render, and must not show the model's instruction.
// Run: node --test plugins/gtm-brain/test/dashboard-pillars-review.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { page } from "./helpers/dashboard-page.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-profile-"));
const root = mkdtempSync(join(tmpdir(), "gtm-brain-pillars-review-"));
const outside = mkdtempSync(join(tmpdir(), "gtm-brain-pillars-outside-"));
execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1" };
execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>"], { cwd: root, env });
const lib = await import(`${P}/lib/brain.mjs`);
const pillars = await import(`${P}/lib/dashboard-pillars.mjs`);
const { healthLine } = await import(`${P}/lib/health-line.mjs`);
let dashStarted = false;
after(() => { if (dashStarted) try { execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, "--stop"], { env }); } catch {} rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });

const day = n => new Date(Date.now() - n * 864e5).toISOString();
// Sixty notes; the second and third newest are corrected by the two newest, so the newest forty are not all in force.
const recs = [];
for (let i = 59; i >= 2; i--) recs.push(lib.appendMemory(root, "company", { authors: ["marta"], content: `Fact number ${i} about returns.`, at: day(i) }).rec);
const corrected = recs.slice(-2);
for (const [i, old] of corrected.entries()) lib.appendMemory(root, "company", { authors: ["marta"], content: `Corrected: ${old.content}`, supersedes: old.id, at: day(1 - i * 0.5) });
writeFileSync(join(root, "zażółć.md"), "---\nkind: document\ntitle: Zażółć\nstatus: draft\n---\n# Zażółć\n\nA document whose file name is not ASCII.\n");
writeFileSync(join(root, "pricing.md"), "---\nkind: document\ntitle: Pricing\nstatus: approved\n---\n# Pricing\n\nThree plans, billed yearly.\n");
mkdirSync(join(root, "workflows"), { recursive: true });
const outbound = readFileSync(`${P}/templates/workflows/outbound.md`, "utf8").replace("{{DATE}}", "2026-11-01").replace("{{VERSION}}", "0.35.0");
writeFileSync(join(root, "workflows", "outbound.md"), outbound);
// A trigger as another version may write it: a nested block, and a list with an empty item.
writeFileSync(join(root, "workflows", "nested.md"), outbound.replace("title: Outbound", "title: Nested\ntrigger:\n  schedule: weekly\n  days: [mon, tue]\ntriggers:\n  - \n  - on: deal_won").replace("# Outbound", "# Nested"));
mkdirSync(join(root, "work"), { recursive: true });
writeFileSync(join(root, "work", "sync.json"), JSON.stringify({ at: day(1), tools: ["gmail"] }));
execFileSync("git", ["-C", root, "add", "-A"]);
execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "fixture"], { env: { ...env, GIT_AUTHOR_DATE: "2024-03-05T10:00:00Z", GIT_COMMITTER_DATE: "2024-03-05T10:00:00Z" } });
const rendered = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-render/render.mjs`, root], { env, encoding: "utf8" });
const readData = () => JSON.parse(readFileSync(join(root, "work", "home", "data.json"), "utf8"));
const D = rendered.status === 0 ? readData() : null;

test("a workflow file with a trigger the tab does not understand never stops the dashboard from rendering", () => {
  assert.equal(rendered.status, 0, "the render fails: " + rendered.stderr.split("\n").filter(l => /Error/.test(l)).join(" "));
  assert.ok(existsSync(join(root, "work", "home", "index.html")));
  const files = D.pillars.workflows.files;
  assert.ok(files.some(f => f.slug === "outbound" && f.trigger === "manual"), "the other workflow files are still listed");
  const nested = files.find(f => f.slug === "nested");
  assert.ok(nested && typeof nested.trigger === "string" && nested.trigger.length > 0, "the odd one is listed too, with some trigger text");
  assert.doesNotMatch(nested.trigger, /\[object Object\]|undefined|null/);
});

test("workflowTrigger takes any value and returns a short string", () => {
  const t = pillars.workflowTrigger;
  for (const extra of [{ triggers: [null] }, { trigger: { on: null } }, { trigger: { schedule: { every: "week", days: ["mon"] } } }, { triggers: [[1, 2], { a: { b: 1 } }, undefined] }, { schedule: 0 }, { when: true }, { on: [] }, { trigger: {} }]) {
    let out; assert.doesNotThrow(() => { out = t({ extra, body: "" }); }, JSON.stringify(extra));
    assert.equal(typeof out, "string"); assert.ok(out.length > 0 && out.length <= 120); assert.doesNotMatch(out, /\[object Object\]/, JSON.stringify(extra));
  }
  assert.equal(t({ extra: { triggers: [null] }, body: "" }), "manual", "a trigger with nothing in it is manual");
  assert.equal(t({ extra: { trigger: {} }, body: "## Trigger\n- when a deal is won\n" }), "when a deal is won");
  assert.match(t({ extra: { trigger: { schedule: { every: "week", days: ["mon"] } } } }), /every week/);
  assert.equal(t({ extra: {}, body: 12 }), "manual");
});

test("one tab's reader failing leaves the other tabs readable and says which one could not be read", () => {
  // a registry entry no reader expects: the Entities tab cannot build its cards
  const registry = [...lib.readNames(root), { id: "e_broken", kind: "person", name: null }];
  let p; assert.doesNotThrow(() => { p = pillars.pillarData(root, { registry }); });
  assert.deepEqual(p.entities.rows, []); assert.ok(p.unread.includes("entities"));
  assert.ok(p.configuration.documents.length >= 5); assert.ok(p.memories.total >= 60); assert.ok(p.workflows.files.length >= 2);
  assert.doesNotThrow(() => pillars.pillarFiles(p));
  const D2 = structuredClone(D); const notes = p.memories.notes; delete p.memories.notes;
  D2.pillars = { ...p, memories: { ...p.memories, first: notes.slice(0, 40), file: D.pillars.memories.file }, files: [] };
  const view = page(D2);
  assert.match(view.node("#pe-groups").innerHTML, /could not be read/);
  assert.match(view.node("#cfg-docs").innerHTML, /Pricing/);
  assert.deepEqual(pillars.pillarData(root).unread, [], "nothing is unread on a healthy brain");
});

test("a document with a name outside ASCII shows its last commit, not the time the file was written", () => {
  const doc = D.pillars.configuration.documents.find(d => d.slug === "zażółć");
  assert.ok(doc, "the document is listed");
  assert.equal(new Date(doc.changed).toISOString(), "2024-03-05T10:00:00.000Z");
  assert.equal(new Date(D.pillars.configuration.documents.find(d => d.slug === "pricing").changed).toISOString(), "2024-03-05T10:00:00.000Z");
});

test("health line: what the chat start prints, with real content and without the instruction to the model", () => {
  const overview = lib.meetingOverview(root, { by: lib.currentPerson(root) || undefined });
  const full = healthLine(root, overview);
  assert.match(full, /^health: .*last sync: gmail/, "the fixture gives the chat start something to say");
  const shown = D.pillars.health;
  assert.ok(shown && shown.length > 10, "the dashboard shows it");
  assert.match(shown, /last sync: gmail/);
  assert.doesNotMatch(shown, /Say this|do not raise|^health:/i);
  assert.ok(full.startsWith(`health: ${shown}. `), "it is the same line, word for word");
  // if the instruction is ever reworded, nothing addressed to the model reaches the page
  assert.doesNotMatch(pillars.healthText(root, overview, () => "health: last sync: gmail 2026-11-13 10:00 UTC. Tell the person only when they ask; never raise it yourself."), /Tell the person|never raise/);
  const p = page(D);
  assert.match(p.node("#ov-more").innerHTML, /Sync and capture details.*last sync: gmail/s, "the status line is a fold on Overview, not a header"); assert.doesNotMatch(p.node("#ov-more").innerHTML, /Say this/);
});

test("Memories: the first page holds a full page of notes in force, so opening the dashboard fetches nothing", async () => {
  const M = D.pillars.memories;
  assert.ok(M.total >= 60 && M.total > M.first.length, "the brain has more notes than the page carries");
  assert.equal(M.first.filter(n => n.state === "in force").length, 40, "forty notes in force are in the page");
  assert.equal(M.first.filter(n => n.state === "replaced").length, 2, "with the corrected ones that sit between them");
  let fetched = 0;
  const live = page(D, { live: true, fetcher: async path => { if (String(path).endsWith("notes.json")) fetched++; return { ok: true, json: async () => String(path).endsWith("notes.json") ? JSON.parse(readFileSync(join(root, "work", "home", M.file), "utf8")) : D }; } });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(fetched, 0, "the whole list is not fetched on every page load");
  assert.equal((live.node("#pm-list").innerHTML.match(/class="pl-row pl-note/g) || []).length, 40);
  // the page is not the end of the list: Show more is there, and it brings the rest
  assert.match(live.node("#pm-list").innerHTML, /data-pm-more/, "the person can go past the first page");
  assert.match(live.node("#pm-status").textContent, new RegExp(`Showing the 40 newest\\. ${M.total} notes in all`));
  assert.doesNotMatch(page(D).node("#pm-list").innerHTML, /data-pm-more/, "a saved copy has nothing more to bring");
  live.listeners.click.forEach(fn => fn({ target: { closest: s => s.includes("data-pm-more") ? { hasAttribute: a => a === "data-pm-more", dataset: {} } : null } }));
  await new Promise(r => setTimeout(r, 20));
  assert.equal(fetched, 1, "Show more fetches the whole list once");
  assert.equal((live.node("#pm-list").innerHTML.match(/class="pl-row pl-note/g) || []).length, M.in_force, "every note in force is now shown");
  assert.match(live.node("#pm-status").textContent, new RegExp(`Showing ${M.in_force} of ${M.in_force} notes`));
  live.run('pmF.state="replaced";renderNotesTab()'); await new Promise(r => setTimeout(r, 20));
  assert.equal(fetched, 1, "a filter afterwards fetches nothing again");
  assert.equal((live.node("#pm-list").innerHTML.match(/class="pl-row pl-note/g) || []).length, 2);
  // a long run of corrections cannot grow the page without limit
  const many = Array.from({ length: 500 }, (_, i) => ({ id: "m" + i, state: i < 400 ? "replaced" : "in force" }));
  assert.ok(pillars.firstNotes(many).length <= pillars.NOTES_PAGE * 3);
});

test("dashboard server: a listed file swapped for a link after the render is not served", async () => {
  const url = execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, "--start", "--port=48879"], { encoding: "utf8", env }).trim(); dashStarted = true;
  const get = path => fetch(url + path.replace(/^\//, ""), { headers: { connection: "close" } });
  assert.equal((await get("/file?path=pricing.md")).status, 200);
  writeFileSync(join(outside, "secret.txt"), "outside the brain");
  rmSync(join(root, "pricing.md")); symlinkSync(join(outside, "secret.txt"), join(root, "pricing.md"));
  const out = await get("/file?path=pricing.md"); assert.equal(out.status, 404); assert.doesNotMatch(await out.text(), /outside the brain/);
  rmSync(join(root, "pricing.md")); symlinkSync(join(root, "brain", "contexts", "company", "memories.jsonl"), join(root, "pricing.md"));
  const mem = await get("/file?path=pricing.md"); assert.equal(mem.status, 404, "a link to the note file inside the brain is not followed either"); assert.doesNotMatch(await mem.text(), /Fact number/);
  // a folder on the way swapped for a link out of the brain
  rmSync(join(root, "workflows"), { recursive: true }); mkdirSync(join(outside, "workflows")); writeFileSync(join(outside, "workflows", "outbound.md"), "outside the brain");
  symlinkSync(join(outside, "workflows"), join(root, "workflows"));
  const dir = await get("/file?path=workflows/outbound.md"); assert.equal(dir.status, 404); assert.doesNotMatch(await dir.text(), /outside the brain/);
  for (const bad of ["pricing.md%00", "./pricing.md/../brain/contexts/company/memories.jsonl", "brain/../brain/admin.md", "PRICING.MD"]) assert.equal((await get("/file?path=" + bad)).status, 404, bad);
});

test("dashboard server: a server an older plugin started is replaced, so Open file works after an upgrade", async () => {
  // What a 0.34 install leaves running: a live process recorded in work/dash.json with the older protocol and no /file route.
  try { execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, "--stop"], { env }); } catch {}
  const { spawn } = await import("node:child_process");
  const older = spawn(process.execPath, ["-e", "setInterval(()=>{},1e9)"], { detached: true, stdio: "ignore" });
  const exited = new Promise(r => { older.on("exit", () => r(true)); setTimeout(() => r(false), 3000).unref(); });
  writeFileSync(join(root, "work", "dash.json"), JSON.stringify({ port: 48881, pid: older.pid, protocol: 3, url: "http://127.0.0.1:48881/" }));
  try {
    const url = execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, "--start", "--port=48881"], { encoding: "utf8", env }).trim(); dashStarted = true;
    const state = JSON.parse(readFileSync(join(root, "work", "dash.json"), "utf8"));
    assert.notEqual(state.pid, older.pid, "the older server is not reused");
    assert.ok(await exited, "the older server is stopped");
    const r = await fetch(url + "file?path=RULES.md", { headers: { connection: "close" } });
    assert.equal(r.status, 200);
  } finally { try { process.kill(older.pid); } catch {} }
});

test("Workflows and Entities on a brain with runs, its own skill and a customer: current step and due date, ended and orphan runs, relation to us", async () => {
  const b = mkdtempSync(join(tmpdir(), "gtm-brain-pillars-runs-"));
  try {
    execFileSync("git", ["init", "-q", b]); execFileSync("git", ["-C", b, "config", "commit.gpgsign", "false"]);
    execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>"], { cwd: b, env });
    mkdirSync(join(b, "workflows"), { recursive: true });
    writeFileSync(join(b, "workflows", "outbound.md"), outbound);
    const { writeUserSkill } = await import(`${P}/lib/user-skills.mjs`);
    writeUserSkill(b, { id: "gtm-brain-weekly-pipeline", title: "Weekly pipeline", description: "Go through the open deals every Monday.", body: "# Weekly pipeline\n\nRead the deals.\n", by: "marta", version: "0.35.0" });
    lib.writeNames(b, [...lib.readNames(b), { name: "Northwind", kind: "organization", subtype: "company" }]);
    const mem = fields => lib.appendMemory(b, "company", { authors: ["marta"], ...fields }).rec;
    const tags = (wf, id) => [`workflow:${wf}`, `run:${id}`];
    mem({ content: "Started workflow Outbound as run outbound-2026-11-01-marta.", tags: [...tags("outbound", "outbound-2026-11-01-marta"), "run-start"], at: day(10) });
    mem({ content: "Step 1 of 4: done.", tags: [...tags("outbound", "outbound-2026-11-01-marta"), "step:1", "step-status:done"], at: day(9) });
    mem({ content: "Step 2 of 4: pending, due 2026-11-20.", tags: [...tags("outbound", "outbound-2026-11-01-marta"), "step:2", "step-status:pending", "due:2026-11-20"], at: day(8) });
    mem({ content: "Started workflow Outbound as run outbound-2026-10-01-marta.", tags: [...tags("outbound", "outbound-2026-10-01-marta"), "run-start"], at: day(40) });
    mem({ kind: "decision", content: "Run outbound-2026-10-01-marta done.", tags: [...tags("outbound", "outbound-2026-10-01-marta"), "run-done"], at: day(30) });
    mem({ content: "Started workflow Webinar as run webinar-2026-11-02-marta.", tags: [...tags("webinar", "webinar-2026-11-02-marta"), "run-start"], at: day(9) });
    mem({ content: "Step 1 of 3: due.", tags: [...tags("webinar", "webinar-2026-11-02-marta"), "step:1", "step-status:due"], at: day(8) });
    mem({ content: "Northwind signed with us.", source: [{ kind: "user", ref: "marta" }], customer: { entity: "Northwind", status: "customer", basis: "user", observed_at: day(2) }, at: day(2) });
    execFileSync("git", ["-C", b, "add", "-A"]); execFileSync("git", ["-C", b, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "fixture"]);
    const r = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-render/render.mjs`, b], { env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const B = JSON.parse(readFileSync(join(b, "work", "home", "data.json"), "utf8")), W = B.pillars.workflows;
    const ob = W.files.find(f => f.slug === "outbound");
    const live = ob.runs.find(x => x.id === "outbound-2026-11-01-marta"), done = ob.runs.find(x => x.id === "outbound-2026-10-01-marta");
    assert.deepEqual([live.step.n, live.step.of, live.step.status, live.step.due, live.ended], [2, ob.steps, "pending", "2026-11-20", null]);
    assert.ok(live.step.title, "the current step carries its title from the workflow file");
    assert.equal(done.ended.how, "done"); assert.equal(done.step, null);
    assert.deepEqual(W.orphans.map(o => [o.workflow, o.step?.n, o.step?.status]), [["webinar", 1, "due"]], "a run whose workflow file is gone still shows");
    assert.equal(B.pillars.entities.rows.find(e => e.name === "Northwind")?.relation, "customer", "a customer's relation to us comes from the customer notes");
    const p = page(B); p.run('show("workflows")');
    const w = p.node("#pw-files").innerHTML;
    assert.match(w, new RegExp(`Step 2 of ${ob.steps}: ${live.step.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · pending · <b>due 2026-11-20</b>`));
    assert.match(w, /1 run in progress, 1 ended/); assert.match(w, /Runs whose workflow file is gone.*webinar-2026-11-02-marta/s);
    const skills = p.node("#pw-skills").innerHTML, own = skills.split("This brain's own")[1] || "";
    assert.match(own, /Weekly pipeline.*\/gtm-brain-weekly-pipeline.*Go through the open deals every Monday\./s, "the brain's own skill is listed with its one line");
    assert.doesNotMatch(skills.split("This brain's own")[0], /weekly-pipeline/, "and not among the shipped ones");
    p.run('show("entities")'); assert.match(p.node("#pe-groups").innerHTML, /Northwind.*class="pl-rel">customer</s);
  } finally { rmSync(b, { recursive: true, force: true }); }
});

test("health line: a page without the tabs' data claims nothing about the brain's health", () => {
  for (const make of [d => { delete d.pillars; }, d => { d.pillars = null; d.pillarsUnread = true; }]) {
    const older = structuredClone(D); make(older);
    const p = page(older), el = p.node("#ov-more");
    assert.ok(el.hidden || !/Nothing to report/.test(el.innerHTML), "an older page or unread tabs do not say all is quiet");
  }
  assert.match(page({ ...structuredClone(D), pillars: { ...structuredClone(D.pillars), health: null } }).node("#ov-more").innerHTML, /Nothing to report yet/, "a brain with nothing to report says so");
});

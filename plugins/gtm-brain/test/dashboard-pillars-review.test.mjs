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
  assert.match(p.node("#health-line").innerHTML, /last sync: gmail/); assert.doesNotMatch(p.node("#health-line").innerHTML, /Say this/);
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
  live.run('pmF.state="replaced";renderNotesTab()'); await new Promise(r => setTimeout(r, 20));
  assert.equal(fetched, 1, "a filter that needs more fetches it once");
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

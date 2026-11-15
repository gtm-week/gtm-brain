// These tests read and write the root files of a layout 2 brain: setup and the lib play a plugin that writes layout 2 at most
// (lib/layout-version.mjs GTM_BRAIN_TEST_LAYOUT). Layout 3 (about-us/, config/) is covered by config-folders.test.mjs.
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
process.env.GTM_BRAIN_NO_SESSION_MAINTENANCE = "1";
// The front page: four tabs by pillar (Configuration, Entities, Memories, Workflows) under the chat start's
// health line, on a brain made by setup and rendered by the real renderer; the page is the shipped client in
// the DOM harness; the dashboard server opens only the files the render listed.
// Run: node --test plugins/gtm-brain/test/dashboard-pillars.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { page } from "./helpers/dashboard-page.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-profile-"));
const root = mkdtempSync(join(tmpdir(), "gtm-brain-pillars-"));
execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1" };
execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>"], { cwd: root, env });
const lib = await import(`${P}/lib/brain.mjs`);
const { workflowTrigger, ourRules, healthText } = await import(`${P}/lib/dashboard-pillars.mjs`);
let dashStarted = false;
after(() => { if (dashStarted) try { execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, "--stop"], { env }); } catch {} rmSync(root, { recursive: true, force: true }); });

// What a team has after a few weeks: people and a company, notes with a correction and a withdrawal, a document
// of its own, a workflow with a trigger and one without.
lib.writeNames(root, [...lib.readNames(root),
  { name: "Ola Kowalska", kind: "person", aliases: ["Olka"], emails: ["ola@acme.test"] },
  { name: "Jan Zielinski", kind: "person" },
  { name: "Acme Retail", kind: "organization", subtype: "company" },
  { name: "Returns Desk", kind: "product" }]);
const day = n => new Date(Date.now() - n * 864e5).toISOString();
const old = lib.appendMemory(root, "company", { authors: ["marta"], content: "Ola Kowalska runs returns at Acme Retail.", people: ["Ola Kowalska", "Acme Retail"], tags: ["account:acme"], source: [{ kind: "gmail", ref: "thread-1" }], at: day(20) }).rec;
const fix = lib.appendMemory(root, "company", { authors: ["marta"], content: "Ola Kowalska runs returns and logistics at Acme Retail.", people: ["Ola Kowalska", "Acme Retail"], supersedes: old.id, tags: ["account:acme"], source: [{ kind: "gmail", ref: "thread-2" }], at: day(3) }).rec;
const gone = lib.appendMemory(root, "company", { authors: ["marta"], content: "Jan Zielinski left Acme Retail.", people: ["Jan Zielinski"], at: day(10) }).rec;
lib.appendMemory(root, "company", { authors: ["marta"], retracts: gone.id, content: "Withdrawn: Jan never worked at Acme Retail.", at: day(9) });
const decision = lib.appendMemory(root, "company", { authors: ["marta"], kind: "decision", content: "We sell to retailers with more than 50 stores first.", at: day(1) }).rec;
writeFileSync(join(root, "pricing.md"), "---\nkind: document\ntitle: Pricing\napplies_to: [proposals, outreach]\nstatus: approved\nby: marta\nupdated: 2026-11-01\n---\n# Pricing\n\nThree plans, billed yearly.\n");
mkdirSync(join(root, "workflows"), { recursive: true });
const outbound = readFileSync(`${P}/templates/workflows/outbound.md`, "utf8").replace("{{DATE}}", "2026-11-01").replace("{{VERSION}}", "0.35.0");
writeFileSync(join(root, "workflows", "outbound.md"), outbound);
writeFileSync(join(root, "workflows", "weekly-review.md"), outbound.replace("title: Outbound", "title: Weekly review").replace(/^trigger: .*$/m, "trigger: every Monday at 09:00").replace("# Outbound", "# Weekly review"));
writeFileSync(join(root, "RULES.md"), readFileSync(join(root, "RULES.md"), "utf8").replace(/(## Our rules\n[\s\S]*?offers to add one here\.\n)/, "$1\n- Always ask before tagging a client.\n- Notes about pricing go to Our offer.\n"));
execFileSync("git", ["-C", root, "add", "-A"]); execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "fixture"]);
execFileSync(process.execPath, [`${P}/scripts/gtm-brain-render/render.mjs`, root], { env });
const D = JSON.parse(readFileSync(join(root, "work", "home", "data.json"), "utf8"));
const notesFile = join(root, "work", "home", D.pillars?.memories?.file || "missing");
const allNotes = () => JSON.parse(readFileSync(notesFile, "utf8")).notes;
const html = p => [...p.nodes.values()].map(n => n.innerHTML).join("\n");

test("render: Configuration lists the base documents with state, scope and date, RULES.md, SCHEMA.md and settings", () => {
  assert.ok(D.pillars, "the page carries the four tabs");
  const docs = D.pillars.configuration.documents;
  for (const slug of ["strategy", "icp", "voice", "design-system", "market"]) assert.equal(docs.find(d => d.slug === slug)?.state, "not written", `${slug} is still the starter`);
  const pricing = docs.find(d => d.slug === "pricing");
  assert.deepEqual([pricing.state, pricing.base, pricing.applies_to, pricing.path], ["approved", false, ["proposals", "outreach"], "pricing.md"]);
  assert.ok(Date.parse(pricing.changed), "a committed document shows its last commit");
  assert.ok(!docs.some(d => d.path?.startsWith("workflows/")), "workflow files are not base documents");
  const R = D.pillars.configuration.rules;
  assert.equal(R.path, "RULES.md"); assert.deepEqual(R.own, ["Always ask before tagging a client.", "Notes about pricing go to Our offer."]);
  assert.equal(R.count, R.placement + 2); assert.ok(R.placement > 5);
  assert.equal(typeof R.problems, "number"); assert.equal(R.ask.rows.length, 7); assert.equal(R.ask.defaults, false);
  const S = D.pillars.configuration.schema;
  assert.equal(S.path, "SCHEMA.md"); assert.ok(S.kinds.some(k => k.kind === "person" && k.fields.length)); assert.ok(S.relations.length > 0);
  assert.equal(D.pillars.configuration.settings.company, "Reflow"); assert.equal(D.pillars.configuration.settings.path, "brain/admin.md");
});

test("render: Entities groups every kind with counts and a short card; Memories carries a first page and the whole list beside it", () => {
  const E = D.pillars.entities;
  assert.deepEqual(E.kinds.map(k => k.kind).slice(0, 5), ["person", "organization", "product", "event", "tool"]);
  assert.equal(E.kinds.find(k => k.kind === "person").count, E.rows.filter(e => e.kind === "person").length);
  const ola = E.rows.find(e => e.name === "Ola Kowalska");
  assert.deepEqual([ola.kind, ola.aliases, ola.email, ola.notes], ["person", ["Olka"], "ola@acme.test", 1]);
  assert.equal(ola.last, fix.at, "last mentioned is the newest note in force");
  assert.ok(ola.path && existsSync(join(root, ola.path)), "the page path comes from lib, wherever the entity page lives");
  assert.equal(E.rows.find(e => e.name === "Marta Nowak")?.relation, "our team");
  const M = D.pillars.memories, notes = allNotes();
  assert.ok(M.first.length <= 40 && M.first.length > 0); assert.equal(M.total, notes.length); assert.equal(M.notes, undefined, "the whole list is not in the page");
  assert.ok(!notes.some(n => /^Withdrawn:/.test(n.text)), "a retraction is not a note of its own");
  assert.deepEqual(notes.find(n => n.id === fix.id).replaces, { id: old.id, at: old.at, text: old.content });
  assert.equal(notes.find(n => n.id === old.id).replacedBy.id, fix.id); assert.equal(notes.find(n => n.id === old.id).state, "replaced");
  assert.equal(notes.find(n => n.id === gone.id).state, "withdrawn");
  assert.ok(notes.every((n, i) => !i || notes[i - 1].at >= n.at), "newest first");
  assert.ok(M.population && typeof M.population.saved_this_week === "number" && typeof M.population.duplicates === "number");
  assert.ok(M.kinds.includes("decision") && M.tags.some(t => t.tag === "account:acme"));
});

test("render: Workflows reads each file's status and trigger, manual when none; files the server may open are listed", () => {
  const W = D.pillars.workflows.files;
  assert.deepEqual(W.filter(w => ["outbound", "weekly-review"].includes(w.slug)).map(w => [w.slug, w.trigger, w.ok]), [["outbound", "manual", true], ["weekly-review", "every Monday at 09:00", true]]);
  assert.equal(workflowTrigger({ extra: {}, body: "## Trigger\n- when a deal is won\n" }), "when a deal is won");
  assert.equal(workflowTrigger({ extra: { trigger: { on: "deal_won" } } }), "on deal_won");
  assert.equal(workflowTrigger(null), "manual");
  const files = D.pillars.files;
  for (const f of ["RULES.md", "SCHEMA.md", "brain/admin.md", "pricing.md", "workflows/outbound.md"]) assert.ok(files.includes(f), f);
  assert.ok(!files.some(f => f.endsWith(".jsonl") || f.startsWith("work/")));
});

test("health line: the chat start's line without its instruction to the model", () => {
  assert.equal(healthText(root, { meetings: [], coverage: [] }) ?? null, D.pillars.health ?? null);
  assert.deepEqual(ourRules("## Our rules\n\nText.\n- one\n2. two\n## Next\n- not"), ["one", "two"]);
});

test("page: opens on Configuration under the health line, every row opens its file and a prepared chat, nothing writes", () => {
  const p = page(D);
  assert.equal(p.run("view"), "config");
  assert.match(p.node("#health-line").innerHTML, /<b>Health<\/b>/);
  const cfg = p.node("#cfg-docs").innerHTML;
  assert.match(cfg, /Pricing.*approved/s); assert.match(cfg, /Ideal customer profile.*not written.*Help%20me%20write%20our%20Ideal%20customer%20profile/s);
  assert.match(cfg, /href="file:\/\/[^"]*pricing\.md"/, "a saved copy opens the file itself");
  const chats = [...html(p).matchAll(/class="pl-chat" href="(codex:\/\/threads\/new[^"]*)"/g)].map(m => new URL(m[1].replace(/&amp;/g, "&")));
  assert.ok(chats.length > 10); for (const u of chats) { assert.equal(u.searchParams.get("path"), D.brain); assert.match(u.searchParams.get("prompt"), /^Use GTM Brain\. /); }
  assert.match(p.node("#cfg-rules").innerHTML, /Always ask before tagging a client/); assert.match(p.node("#cfg-rules").innerHTML, /Deal stage and amount/);
  assert.match(p.node("#cfg-schema").innerHTML, /SCHEMA\.md/); assert.match(p.node("#cfg-settings").innerHTML, /Reflow/);
  const live = page(D, { live: true });
  assert.match(live.node("#cfg-docs").innerHTML, /href="\/file\?path=pricing\.md"/, "the live dashboard opens files through its own server");
  assert.doesNotMatch(html(p), /<form|data-say=|>Edit<|>Save<|>Approve<|>Delete</);
});

test("page: Entities searches names and aliases and stays a first page with 2,000 entities", () => {
  const p = page(D);
  p.node("#pe-q").value = "olka"; p.listeners.input.forEach(fn => fn({ target: { id: "pe-q", value: "olka" } }));
  const one = p.node("#pe-groups").innerHTML;
  assert.match(one, /Ola Kowalska/); assert.doesNotMatch(one, /Jan Zielinski/); assert.match(one, /1 \/ \d+/);
  const big = structuredClone(D);
  big.pillars.entities.rows = Array.from({ length: 2000 }, (_, i) => ({ id: "e_" + i, name: `Person ${i}`, kind: i % 4 ? "person" : "organization", subtype: null, aliases: [`alias${i}`], email: null, fields: [], relation: null, last: null, notes: 0, path: `brain/entities/p${i}.md` }));
  big.pillars.entities.kinds = [{ kind: "person", count: 1500 }, { kind: "organization", count: 500 }];
  const q = page(big), groups = q.node("#pe-groups").innerHTML;
  assert.equal((groups.match(/class="pl-row"/g) || []).length, 80, "forty rows per kind at first");
  assert.match(groups, /data-pe-more="person">Show more \(1460\)/);
  const t = performance.now(); q.run('peQuery="alias1999";renderEntitiesTab()');
  assert.ok(performance.now() - t < 200, "a search over 2,000 entities is immediate");
  assert.match(q.node("#pe-groups").innerHTML, /Person 1999/); assert.equal((q.node("#pe-groups").innerHTML.match(/class="pl-row"/g) || []).length, 1);
  q.run('peQuery="";renderEntitiesTab()');q.listeners.click.forEach(fn => fn({ target: { closest: s => s.includes("data-pe-more") ? { hasAttribute: () => false, dataset: { peMore: "person" } } : null } }));
  assert.equal((q.node("#pe-groups").innerHTML.match(/class="pl-row"/g) || []).length, 160, "Show more adds the next rows");
});

test("page: Memories shows date, age, source and what replaced what; a filter fetches the whole list once", async () => {
  const p = page(D);
  const list = p.node("#pm-list").innerHTML;
  assert.match(list, /Ola Kowalska runs returns and logistics/); assert.match(list, /Replaces [0-9-]+: Ola Kowalska runs returns at Acme Retail\./);
  assert.match(list, /\(3 days ago\)/); assert.match(list, /Sources/);
  assert.doesNotMatch(list, /Jan Zielinski left/, "in force by default");
  assert.match(p.node("#pm-population").innerHTML, /Saved this week/); assert.match(p.node("#pm-population").innerHTML, /Duplicates/);
  p.run('pmF.state="";renderNotesTab()');
  assert.match(p.node("#pm-list").innerHTML, /Replaced by [0-9-]+: Ola Kowalska runs returns and logistics/); assert.match(p.node("#pm-list").innerHTML, /Withdrawn [0-9-]+: Withdrawn: Jan never worked/);
  p.run('pmF.state="in force";pmF.kind="decision";renderNotesTab()');
  assert.match(p.node("#pm-list").innerHTML, /50 stores/); assert.doesNotMatch(p.node("#pm-list").innerHTML, /Ola Kowalska/);
  p.run('pmF.kind="";pmF.entity="Olka";renderNotesTab()');
  assert.match(p.node("#pm-list").innerHTML, /Ola Kowalska runs returns and logistics/); assert.doesNotMatch(p.node("#pm-list").innerHTML, /50 stores/);
  p.run('pmF.entity="";pmF.tag="account:acme";pmF.period="7";renderNotesTab()');
  assert.match(p.node("#pm-list").innerHTML, /logistics/);
  // a brain larger than the first page: the whole list is fetched from the side file once, only on the live dashboard
  const big = structuredClone(D), many = Array.from({ length: 120 }, (_, i) => ({ ...allNotes()[0], id: "m_" + String(i).padStart(6, "0"), at: day(i), text: `note ${i}`, kind: i === 110 ? "question" : "note" }));
  big.pillars.memories.first = many.slice(0, 40); big.pillars.memories.total = 120;
  let fetched = 0;
  const q = page(big, { live: true, fetcher: async path => { if (String(path).endsWith("notes.json")) fetched++; return { ok: true, json: async () => String(path).endsWith("notes.json") ? { notes: many } : big }; } });
  assert.equal(fetched, 0, "nothing is fetched until a filter needs it");
  q.run('pmF.kind="question";renderNotesTab()'); await new Promise(r => setTimeout(r, 20));
  assert.equal(fetched, 1); assert.match(q.node("#pm-list").innerHTML, /note 110/); assert.match(q.node("#pm-status").textContent, /Showing 1 of 1 note/);
  const file = page(big); file.run('pmF.kind="question";renderNotesTab()');
  assert.match(file.node("#pm-status").textContent, /Open the live dashboard to filter all 120 notes/);
});

test("page: Workflows shows each file's status, trigger and runs, and the skills; More keeps the earlier views", () => {
  const p = page(D); p.run('show("workflows")');
  const w = p.node("#pw-files").innerHTML;
  assert.match(w, /Outbound.*Trigger: <b>manual<\/b>/s); assert.match(w, /Weekly review.*every Monday at 09:00/s); assert.match(w, /4 steps|\d+ steps/);
  assert.match(p.node("#pw-skills").innerHTML, /gtm-brain-workflow/);
  p.run('show("home")'); assert.match(p.node("#subnav").innerHTML, /data-v="home"[^>]*aria-current="page"[^>]*>Overview/); assert.match(p.node("#subnav").innerHTML, /data-v="explore"/);
  const older = structuredClone(D); delete older.pillars; const o = page(older);
  assert.match(o.node("#cfg-docs").innerHTML, /made by an older version/, "a page rendered by an older plugin still loads");
});

test("dashboard server: /file opens only a listed brain file, as text, read-only", async () => {
  const url = execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, "--start", "--port=48877"], { encoding: "utf8", env }).trim(); dashStarted = true;
  const get = (path, headers = {}) => fetch(url + path.replace(/^\//, ""), { headers: { connection: "close", ...headers } });
  const ok = await get("/file?path=pricing.md");
  assert.equal(ok.status, 200); assert.match(ok.headers.get("content-type"), /^text\/plain/); assert.match(await ok.text(), /Three plans, billed yearly/);
  assert.equal((await get("/file?path=" + encodeURIComponent(D.pillars.entities.rows[0].path))).status, 200);
  for (const bad of ["brain/contexts/company/memories.jsonl", "../etc/passwd", "/etc/passwd", "work/home/data.json", ""]) assert.equal((await get("/file?path=" + encodeURIComponent(bad))).status, 404, bad);
  assert.equal((await get("/file?path=pricing.md", { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await fetch(url + "file?path=pricing.md", { method: "POST", headers: { connection: "close" } })).status, 405);
});

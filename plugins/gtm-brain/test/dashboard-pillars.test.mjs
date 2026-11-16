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
const { workflowTrigger, ourRules, healthText, identityFlags } = await import(`${P}/lib/dashboard-pillars.mjs`);
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
// links between entities, with their dates: Jan worked at Acme Retail and left; Acme Retail is a partner of ours
const idOf = name => lib.readNames(root).find(e => e.name === name).id, said = [{ kind: "user", ref: "marta" }];
const linkNote = (content, people, relation, n) => lib.appendMemory(root, "company", { authors: ["marta"], content, people, source: said, at: day(n), relation: { ...relation, basis: "user", observed_at: day(n).slice(0, 19) + "Z" } }).rec;
linkNote("Jan Zielinski joined Acme Retail as a buyer.", ["Jan Zielinski", "Acme Retail"], { from: idOf("Jan Zielinski"), type: "works_at", to: idOf("Acme Retail"), status: "current" }, 15);
linkNote("Jan Zielinski is no longer at Acme Retail.", ["Jan Zielinski", "Acme Retail"], { from: idOf("Jan Zielinski"), type: "works_at", to: idOf("Acme Retail"), status: "ended" }, 6);
linkNote("Acme Retail is a partner of ours.", ["Acme Retail"], { from: idOf("Acme Retail"), type: "partner_of", to: "us", status: "current" }, 4);
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
  assert.deepEqual([pricing.state, pricing.base, pricing.starter, pricing.applies_to, pricing.path], ["approved", true, false, ["proposals", "outreach"], "pricing.md"]);   // pricing is a ready base file, not one of the five starters
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

test("page: opens on Overview, a base document row opens in the page, every prepared chat names the brain, nothing writes by itself", () => {
  const p = page(D);
  assert.equal(p.run("view"), "home");
  assert.match(p.node("#nav").innerHTML, /^<button data-v="home"[^>]*aria-current="page"[^>]*><span>Overview<\/span><\/button><button data-v="config"/, "one flat navigation, Overview first");
  assert.doesNotMatch(p.node("#nav").innerHTML, /More/);
  assert.match(p.node("#ov-inbox").innerHTML, /Needs your attention|Coming up|Nothing needs you right now/);
  assert.doesNotMatch(p.node("#ov-inbox").innerHTML + p.node("#ov-more").innerHTML + p.node("#h-recent").innerHTML, /In this brain|<article class="recent-item"|Sync and capture/, "Overview carries no count tiles, no list of recent notes and no status fold");
  const asked = structuredClone(D); asked.questions = [{ id: "m_q00001", at: day(2), kind: "question", context: "company", content: "Is Acme Retail renewing in March or in June?", people: ["Acme Retail"], authors: ["marta"], tags: ["brain-question"], source: [], tools: [], actions: [] }]; asked.totals = { ...(asked.totals || {}), questions: 1 };
  const inbox = page(asked).node("#ov-inbox").innerHTML;
  assert.match(inbox, /Needs your attention<\/h2><span class="ov-badge"[^>]*>1<\/span>/, "the heading carries a count"); assert.match(page(asked).node("#ov-more").innerHTML, /<details class="ov-house" id="ov-house" open><summary><h2>Housekeeping<\/h2><span class="ov-badge calm">\d+<\/span>/, "Housekeeping is a section of its own, open, with a count");
  assert.match(inbox, /<h3[^>]*>Is Acme Retail renewing in March or in June\?<\/h3><p>Codex asked this 2 days ago/, "an open question is written out, with how long it has waited");
  assert.match(inbox, /data-entity="Acme Retail"/); assert.match(decodeURIComponent(inbox.match(/class="ov-act" href="([^"]+)"/)[1]), /Is Acme Retail renewing in March or in June/, "its link carries that question");
  const cfg = p.node("#cfg-docs").innerHTML;
  assert.match(cfg, /Pricing.*approved/s); assert.match(cfg, /Ideal customer profile.*not written.*Help%20me%20write%20our%20Ideal%20customer%20profile/s);
  assert.match(cfg, /<tr data-doc="pricing\.md"><th scope="row"><button class="linkbtn pl-doc-open" data-doc="pricing\.md">Pricing<\/button>/, "the whole row opens the document in the page");
  assert.doesNotMatch(cfg, /Applies to|Other documents/);
  const chats = [...html(p).matchAll(/class="pl-chat" href="(codex:\/\/threads\/new[^"]*)"/g)].map(m => new URL(m[1].replace(/&amp;/g, "&")));
  assert.ok(chats.length > 10); for (const u of chats) { assert.equal(u.searchParams.get("path"), D.brain); assert.match(u.searchParams.get("prompt"), /^Use GTM Brain\. /); }
  assert.match(p.node("#cfg-rules").innerHTML, /Always ask before tagging a client/); assert.match(p.node("#cfg-rules").innerHTML, /Deal stage and amount/);
  assert.match(p.node("#cfg-schema").innerHTML, /SCHEMA\.md/); assert.match(p.node("#cfg-about").innerHTML, /About the company.*Reflow.*Marta Nowak/s, "who the company is sits in Configuration, above the base documents"); assert.doesNotMatch(p.node("#settings-preferences").innerHTML, /Reflow/, "Settings holds only what the brain needs to work");
  assert.doesNotMatch(html(p), /<form|data-say=|>Edit<|>Save<|>Approve<|>Delete</);
});

test("render: each entity carries a plain line, its relation to us and what is missing; fields, links and history go to a side file", () => {
  const E = D.pillars.entities, row = name => E.rows.find(e => e.name === name);
  assert.equal(E.details, undefined, "the details are not in the page");
  assert.match(E.file, /^entities-[a-f0-9-]{36}\/entity-details\.json$/);
  const details = JSON.parse(readFileSync(join(root, "work", "home", E.file), "utf8")).details;
  assert.deepEqual(Object.keys(details).sort(), E.rows.map(e => e.id).sort(), "one detail per listed entity");
  const ola = row("Ola Kowalska"), jan = row("Jan Zielinski"), acme = row("Acme Retail");
  assert.deepEqual(ola.emails, ["ola@acme.test"]); assert.deepEqual(ola.rel, []); assert.equal(ola.missing, 1, "a person needs a role");
  assert.deepEqual(details[ola.id].fields.find(f => f.name === "role"), { name: "role", required: true, value: null });
  assert.deepEqual(acme.rel, ["partner"]); assert.match(acme.relation, /partner of/); assert.deepEqual(row("Marta Nowak").rel, ["team"]);
  // Jan's link to Acme Retail: ended, with both dated events, and seen from the company's side too
  const out = details[jan.id].links.find(l => l.type === "works_at");
  assert.deepEqual([out.out, out.other.name, out.other.id, out.status], [true, "Acme Retail", acme.id, "ended"]);
  assert.deepEqual(out.events.map(e => [e.event, e.by]), [["started", "person"], ["ended", "person"]]);
  assert.ok(Date.parse(out.since) < Date.parse(out.until));
  assert.equal(jan.company, null, "an ended job is not where he works"); assert.equal(jan.links, 1);
  assert.deepEqual(details[acme.id].links.filter(l => l.type === "works_at").map(l => [l.out, l.other.name]), [[false, "Jan Zielinski"]]);
  assert.deepEqual(details[acme.id].links.find(l => l.type === "partner_of").other, { id: null, name: "us", kind: "us" });
  assert.ok(D.pillars.files.every(f => !f.includes("entity-details")), "the side file is not a brain file");
});

const withDetails = d => { const c = structuredClone(d); c.pillars.entities.details = JSON.parse(readFileSync(join(root, "work", "home", d.pillars.entities.file), "utf8")).details; return c; };
const fire = (p, type, event) => p.listeners[type].forEach(fn => fn(event));
const tap = (p, attr, dataset) => fire(p, "click", { target: { closest: s => s === `[${attr}]` ? { dataset, classList: { contains: () => true } } : null } });

test("page: Entities filters as you type, by kind and by relation, in plain words", () => {
  const p = page(D); p.run('show("entities")');
  const all = D.pillars.entities.rows.length;
  assert.match(p.node("#ent-count").textContent, new RegExp(`^${all} entries$`));
  assert.match(p.node("#ent-kinds").innerHTML, /data-ent-kind="person"[^>]*>People<span>\d+<\/span>/); assert.match(p.node("#ent-kinds").innerHTML, />Companies<span>/);
  assert.doesNotMatch(p.node("#ent-kinds").innerHTML, />Events</, "a kind with nothing in it has no chip");
  fire(p, "input", { target: { id: "ent-q", value: "olka" } });   // an alias
  assert.match(p.node("#ent-list").innerHTML, /Ola(<\/mark>)? Kowalska/); assert.doesNotMatch(p.node("#ent-list").innerHTML, /Jan Zielinski/);
  assert.equal(p.node("#ent-count").textContent, `1 of ${all} shown`);
  fire(p, "input", { target: { id: "ent-q", value: "ACME.TEST" } });   // an email address
  assert.equal((p.node("#ent-list").innerHTML.match(/role="option"/g) || []).length, 1);
  fire(p, "input", { target: { id: "ent-q", value: "zzz" } });
  assert.match(p.node("#ent-list").innerHTML, /Nothing matches/); assert.match(p.node("#ent-list").innerHTML, /data-ent-reset/);
  tap(p, "data-ent-reset", {});
  assert.equal((p.node("#ent-list").innerHTML.match(/role="option"/g) || []).length, all);
  tap(p, "data-ent-kind", { entKind: "organization" });
  assert.match(p.node("#ent-list").innerHTML, /Acme Retail/); assert.doesNotMatch(p.node("#ent-list").innerHTML, /Ola Kowalska/);
  assert.match(p.node("#ent-list").innerHTML, /ent-rel-partner">Partner</);
  tap(p, "data-ent-kind", { entKind: "" });
  assert.match(p.node("#ent-rel").innerHTML, /<option value="partner">Partner \(1\)<\/option>/); assert.match(p.node("#ent-rel").innerHTML, /<option value="customer" disabled>Customer \(0\)/);
  fire(p, "change", { target: { id: "ent-rel", value: "partner" } });
  assert.equal((p.node("#ent-list").innerHTML.match(/role="option"/g) || []).length, 1);
  fire(p, "change", { target: { id: "ent-rel", value: "" } }); fire(p, "change", { target: { id: "ent-sort", value: "az" } });
  const names = [...p.node("#ent-list").innerHTML.matchAll(/class="ent-name-text">([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), "A to Z");
  assert.doesNotMatch(p.node("#ent-list").innerHTML + p.node("#ent-kinds").innerHTML, /e_[0-9a-f]{16}<|>person<|>organization<|brain\/entities/, "no ids, kind ids or paths as text");
});

test("page: the picked entity shows beside the list: relation to us, fields, links, history and notes; the keyboard and the address work", () => {
  const data = withDetails(D), p = page(data, { route: "#view=entities" });
  assert.match(p.node("#ent-detail").innerHTML, /Pick a name to read about it/); assert.match(p.node("#ent-detail").innerHTML, /Most written about/);
  const jan = data.pillars.entities.rows.find(e => e.name === "Jan Zielinski"), acme = data.pillars.entities.rows.find(e => e.name === "Acme Retail");
  // arrow keys move the highlighted row, Enter opens it
  fire(p, "input", { target: { id: "ent-q", value: "Zielinski" } });
  fire(p, "keydown", { key: "ArrowDown", target: { id: "ent-q" } }); fire(p, "keydown", { key: "ArrowUp", target: { id: "ent-q" } });
  assert.match(p.node("#ent-list").innerHTML, /class="ent-row ent-active"/);
  fire(p, "keydown", { key: "Enter", target: { id: "ent-q" } });
  let pane = p.node("#ent-detail").innerHTML;
  assert.match(pane, /<h2 id="ent-title" tabindex="-1">Jan Zielinski<\/h2>/); assert.match(pane, />Person</);
  assert.match(pane, /<dt>Role<\/dt><dd class="ent-unknown">not known yet<\/dd>/); assert.match(pane, /Also not recorded: location, linkedin, how we met\./);
  assert.match(pane, /<h4>Works at<\/h4>.*data-ent-id="[^"]+"[^>]*>.*Acme Retail.*ended/s);
  assert.match(pane, /<b>Ended<\/b>: Works at Acme Retail.*<b>Started<\/b>: Works at Acme Retail/s, "history, newest first");
  assert.match(pane, /Jan Zielinski is no longer at Acme Retail\..*Jan Zielinski joined Acme Retail as a buyer\./s, "notes, newest first");
  assert.match(pane, /noted by Marta/); assert.match(pane, /Sources/); assert.doesNotMatch(pane, /Jan Zielinski left/, "a withdrawn note is not shown");
  assert.match(pane, /class="pl-chat" href="codex:\/\/threads\/new[^"]*Jan%20Zielinski/);
  assert.equal(new URLSearchParams(p.location.hash.slice(1)).get("e"), jan.id, "the address names the picked entity");
  // a link chip picks the other entity, in the same pane
  tap(p, "data-ent-id", { entId: acme.id }); fire(p, "click", { target: { closest: () => null } });
  pane = p.node("#ent-detail").innerHTML;
  assert.match(pane, />Acme Retail<\/h2>/); assert.match(pane, /<b>Partner of<\/b> since \d{4}-\d\d-\d\d/); assert.match(pane, /<h4>People who work here<\/h4>.*Jan Zielinski/s);
  assert.match(pane, /Often mentioned together with.*Ola Kowalska/s);
  assert.match(pane, /<dt>Website<\/dt><dd class="ent-unknown">not known yet/);
  assert.equal(new URLSearchParams(p.location.hash.slice(1)).get("e"), acme.id);
  p.history.back();
  assert.match(p.node("#ent-detail").innerHTML, />Jan Zielinski<\/h2>/, "Back returns to the entity before");
  assert.doesNotMatch(p.node("#ent-detail").innerHTML, /<form|<input|<textarea|>Edit<|>Save<|>Delete</, "view only");
  // a copied address opens on that entity
  const linked = page(data, { route: "#view=entities&e=" + acme.id });
  assert.match(linked.node("#ent-detail").innerHTML, />Acme Retail<\/h2>/);
  // the live dashboard reads the details from the side file, once
  let fetched = 0;
  const live = page(D, { live: true, route: "#view=entities&e=" + jan.id, fetcher: async path => { if (String(path).endsWith("entity-details.json")) { fetched++; return { ok: true, json: async () => ({ details: data.pillars.entities.details }) }; } return { ok: true, json: async () => ({ notes: allNotes() }) }; } });
  assert.match(live.node("#ent-detail").innerHTML, /Loading/);
  return new Promise(r => setTimeout(r, 30)).then(() => { assert.equal(fetched, 1); assert.match(live.node("#ent-detail").innerHTML, /<h4>Works at<\/h4>/); assert.match(live.node("#ent-detail").innerHTML, /joined Acme Retail as a buyer/); });
});

test("page: the pane's forms send one named operation each, keep what was typed when a save is refused, and show only on the live page", async () => {
  const data = withDetails(D), jan = data.pillars.entities.rows.find(e => e.name === "Jan Zielinski"), acme = data.pillars.entities.rows.find(e => e.name === "Acme Retail"), ola = data.pillars.entities.rows.find(e => e.name === "Ola Kowalska");
  const sent = []; let answer = () => ({ ok: true, note: "Saved." });
  const fetcher = async (path, opts) => { if (path === "/entity-edit") { sent.push({ headers: opts.headers, method: opts.method, body: JSON.parse(opts.body) }); const j = answer(sent.at(-1).body); return { ok: j.ok, status: j.ok ? 200 : 422, json: async () => j }; } return { ok: true, json: async () => ({ notes: allNotes() }) }; };
  const tick = () => new Promise(r => setTimeout(r, 5)), token = "ab".repeat(32);
  // a saved copy, and a live page whose server gave no token, offer no way to change anything
  for (const p of [page(data, { route: "#view=entities&e=" + jan.id }), page(data, { live: true, fetcher, route: "#view=entities&e=" + jan.id })]) assert.doesNotMatch(p.node("#ent-detail").innerHTML, /data-ent-open|ent-form/);
  const p = page(data, { live: true, fetcher, route: "#view=entities&e=" + jan.id });
  p.node('meta[name="gtm-brain-edit"]').setAttribute("content", token); p.run("entDrawDetail()");
  const pane = () => p.node("#ent-detail").innerHTML, form = () => p.node("#ent-form").innerHTML;
  const open = (mode, i) => tap(p, "data-ent-open", { entOpen: mode, entI: i }), act = what => tap(p, "data-ent-do", { entDo: what }), type = (key, value) => fire(p, "input", { target: { dataset: { entF: key }, value } });
  for (const label of ["Edit", "Add a connection", "Merge with...", "Archive"]) assert.match(pane(), new RegExp(`data-ent-open="[a-z]+">${label.replace(/\./g, "\\.")}<`));
  assert.match(pane(), /data-ent-open="change" data-ent-i="\d+" aria-label="Change the connection with Acme Retail"/);
  // Edit: plain labels, the details said to be saved as a note
  open("edit");
  assert.match(pane(), /<span>Name<\/span><input type="text" data-ent-f="name" value="Jan Zielinski"/); assert.match(pane(), /<span>Role \(needed\)<\/span>/); assert.match(pane(), /Other names, separated by commas/);
  assert.match(pane(), /Saved as a note, so the brain remembers who said it\./); assert.match(pane(), /<option value="organization">Company or organization<\/option>/);
  act("save"); await tick(); assert.equal(sent.length, 0); assert.match(form(), /Nothing was changed\./);
  // a refused save: the tool's words, and the form as it was typed
  type("name", "Jan Maria Zielinski"); type("aliases", "Janek, JZ"); type("f_role", "Head of buying");
  answer = () => ({ ok: false, note: "Jan Maria Zielinski is already another entity's name." });
  act("save"); await tick();
  assert.deepEqual(sent[0].body, { op: "update", entity: jan.id, name: "Jan Maria Zielinski", aliases: ["Janek", "JZ"] });
  assert.equal(sent[0].method, "POST"); assert.equal(sent[0].headers["x-gtm-brain-token"], token); assert.equal(sent[0].headers["content-type"], "application/json");
  assert.match(form(), /role="alert"[^>]*>Jan Maria Zielinski is already another entity's name\./); assert.match(form(), /value="Jan Maria Zielinski"/); assert.match(form(), /value="Head of buying"/); assert.match(form(), /value="Janek, JZ"/);
  // saved: the identity through update, the detail as a note, then the form closes with a line saying so
  answer = b => ({ ok: true, note: b.op === "update" ? "Saved Jan Maria Zielinski." : "Saved as a note." });
  act("save"); await tick();
  assert.deepEqual(sent.slice(1).map(x => x.body), [{ op: "update", entity: jan.id, name: "Jan Maria Zielinski", aliases: ["Janek", "JZ"] }, { op: "set_fields", entity: jan.id, fields: { role: "Head of buying" } }]);
  assert.doesNotMatch(pane(), /id="ent-form"/); assert.match(pane(), /class="ent-flash" role="status">Saved Jan Maria Zielinski\. Saved as a note\. The page updates in a moment\./);
  // a connection: the types come from the schema in plain words, the other end is picked by typing
  sent.length = 0; open("link");
  assert.match(form(), /<option value="0" selected>Works at<\/option>/); assert.doesNotMatch(form(), /Customer of|Attended|works_at/);
  type("q", "acme");
  assert.match(p.node("#ent-pick").innerHTML, new RegExp(`data-ent-pick="${acme.id}"`)); assert.doesNotMatch(p.node("#ent-pick").innerHTML, /Ola Kowalska/, "only the kinds this connection takes");
  type("q", "Globex"); assert.match(p.node("#ent-pick").innerHTML, /data-ent-new="organization"><span>Add &quot;Globex&quot; as a new company or organization</);
  act("save"); await tick(); assert.equal(sent.length, 0); assert.match(form(), /type a name and pick one/);
  tap(p, "data-ent-pick],[data-ent-new", { entPick: acme.id }); type("date", "2026-03-01"); type("note", "Jan is back at Acme.");
  act("save"); await tick();
  assert.deepEqual(sent[0].body, { op: "add_relation", from: jan.id, type: "works_at", to: acme.id, date: "2026-03-01", note: "Jan is back at Acme." });
  // a name nobody has yet is added first, then picked
  sent.length = 0; answer = b => b.op === "create" ? { ok: true, status: "created", entity: "e_00000000000000aa" } : { ok: true, note: "Saved." };
  open("link"); type("q", "Globex"); tap(p, "data-ent-pick],[data-ent-new", { entNew: "organization" }); await tick();
  assert.match(form(), /Globex/); act("save"); await tick();
  assert.deepEqual(sent.map(x => x.body), [{ op: "create", name: "Globex", kind: "organization" }, { op: "add_relation", from: jan.id, type: "works_at", to: "e_00000000000000aa" }]);
  // an existing connection: end it with a date, or withdraw it
  const i = data.pillars.entities.details[jan.id].links.findIndex(l => l.type === "works_at");
  sent.length = 0; answer = () => ({ ok: true, note: "Withdrawn." }); open("change", String(i));
  assert.match(form(), /This connection has ended\. If it never was true, withdraw it\./); act("wrong"); await tick();
  assert.deepEqual(sent[0].body, { op: "retract_relation", from: jan.id, type: "works_at", to: acme.id });
  // relation to us and merge, on the company
  tap(p, "data-ent-id", { entId: acme.id }); sent.length = 0;
  open("us"); assert.match(form(), /<option value="c:customer" selected>Customer<\/option>.*Prospect.*Former customer.*Not a customer.*<option value="r:partner_of">Partner<\/option><option value="x:partner_of">No longer: partner</s);
  type("status", "c:prospect"); act("save"); await tick(); assert.deepEqual(sent[0].body, { op: "set_customer", entity: acme.id, status: "prospect" });
  sent.length = 0; open("us"); type("status", "x:partner_of"); type("date", "2026-06-01"); act("save"); await tick();
  assert.deepEqual(sent[0].body, { op: "end_relation", from: acme.id, type: "partner_of", to: "us", date: "2026-06-01" });
  sent.length = 0; answer = b => b.as_of ? { ok: true, status: "merged", note: "Returns Desk is now part of Acme Retail." } : { ok: true, status: "preview", as_of: "ecv_1", keep: { id: acme.id, name: "Acme Retail", notes: 4 }, fold: { id: "x", name: "Acme Retail Sp. z o.o.", notes: 2 }, names: ["Acme Retail Sp. z o.o."], emails: [], kind_differs: false, blocked: null };
  open("merge"); assert.doesNotMatch(form(), /Merge them/); type("q", "ola"); tap(p, "data-ent-pick],[data-ent-new", { entPick: ola.id }); await tick();
  assert.deepEqual(sent[0].body, { op: "merge", source: ola.id, target: acme.id });
  assert.match(form(), /What will happen/); assert.match(form(), /Acme Retail stays, with 6 notes \(2 from Acme Retail Sp\. z o\.o\.\)/); assert.match(form(), /leaves the list and becomes another name for Acme Retail/);
  act("save"); await tick(); assert.deepEqual(sent[1].body, { op: "merge", source: ola.id, target: acme.id, as_of: "ecv_1" });
  sent.length = 0; open("archive"); assert.match(form(), /Its notes stay/); act("cancel"); assert.equal(sent.length, 0); assert.doesNotMatch(pane(), /id="ent-form"/);
  open("archive"); act("save"); await tick(); assert.deepEqual(sent[0].body, { op: "archive", entity: acme.id });
  assert.ok(sent.every(x => x.headers["x-gtm-brain-token"] === token));
});

test("an identity finding shows as a plain marker on the row and in the pane, and opens the form that settles it", async () => {
  // the data: the rules check's findings, per entity, without its rule codes
  const reg = lib.readNames(root), jan = reg.find(e => e.name === "Jan Zielinski"), ola = reg.find(e => e.name === "Ola Kowalska");
  const pair = lib.suggestMerges([...reg, { ...jan, id: "e_00000000000000bb", name: "Janek Zielinski" }])[0];
  assert.ok(pair, "two look-alike names are a suggestion");
  const flags = identityFlags([...reg, { ...jan, id: "e_00000000000000bb", name: "Janek Zielinski" }], [{ rule: "P3", subject: "Ola Kowalska" }, { rule: "P4", subject: `${pair.a} / ${pair.b}` }, { rule: "P4", subject: "Nobody / Else" }, { rule: "N1", subject: "Jan Zielinski" }]);
  assert.deepEqual(flags.get(ola.id), [{ is: "first_name" }]); assert.deepEqual(flags.get(jan.id), [{ is: "same_as", id: "e_00000000000000bb", name: "Janek Zielinski" }]);
  assert.deepEqual(flags.get("e_00000000000000bb"), [{ is: "same_as", id: jan.id, name: "Jan Zielinski" }]); assert.equal(flags.size, 3);
  assert.ok(D.pillars.entities.rows.every(e => Array.isArray(e.flags)));
  // the page
  const data = withDetails(D), row = name => data.pillars.entities.rows.find(e => e.name === name);
  row("Ola Kowalska").flags = [{ is: "first_name" }]; row("Jan Zielinski").flags = [{ is: "same_as", id: row("Acme Retail").id, name: "Acme Retail" }];
  const sent = [], fetcher = async (path, opts) => { if (path === "/entity-edit") { sent.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ ok: true, status: "preview", as_of: "ecv_2", keep: { name: "Jan Zielinski", notes: 2 }, fold: { name: "Acme Retail", notes: 3 }, names: [], emails: [], kind_differs: true, blocked: null }) }; } return { ok: true, json: async () => ({ notes: allNotes() }) }; };
  const p = page(data, { live: true, fetcher, route: "#view=entities" });
  p.node('meta[name="gtm-brain-edit"]').setAttribute("content", "cd".repeat(32));
  const list = p.node("#ent-list").innerHTML;
  assert.match(list, /class="ent-flag" data-ent-flag="0"[^>]*>first name only</); assert.match(list, /class="ent-flag" data-ent-flag="0"[^>]*>may be the same as Acme Retail</); assert.doesNotMatch(list, /P3|P4/);
  // the marker on a look-alike picks the entity and opens the merge preview with the other one chosen
  fire(p, "click", { target: { closest: s => s === "[data-ent-flag]" ? { dataset: { entFlag: "0" } } : s === "[data-ent-id]" ? { dataset: { entId: row("Jan Zielinski").id } } : null } });
  await new Promise(r => setTimeout(r, 5));
  assert.match(p.node("#ent-detail").innerHTML, /<button type="button" class="ent-flag" data-ent-flag="0"[^>]*>may be the same as Acme Retail</);
  assert.deepEqual(sent, [{ op: "merge", source: row("Acme Retail").id, target: row("Jan Zielinski").id }]);
  assert.match(p.node("#ent-form").innerHTML, /What will happen/); assert.match(p.node("#ent-form").innerHTML, /They are of different kinds; it stays a person\./);
  tap(p, "data-ent-do", { entDo: "cancel" });
  // first name only: the edit form, whose first field is the name
  fire(p, "click", { target: { closest: s => s === "[data-ent-flag]" ? { dataset: { entFlag: "0", entFlagOf: row("Ola Kowalska").id } } : null } });
  assert.match(p.node("#ent-detail").innerHTML, />first name only</); assert.match(p.node("#ent-form").innerHTML, /^<h3 id="ent-form-title">Edit Ola Kowalska<\/h3><div class="ent-form-grid"><label class="ent-f"><span>Name<\/span>/);
  // a saved copy shows the marker as plain words
  const file = page(data, { route: "#view=entities&e=" + row("Ola Kowalska").id });
  assert.match(file.node("#ent-detail").innerHTML, /<span class="ent-flag">first name only<\/span>/); assert.doesNotMatch(file.node("#ent-detail").innerHTML, /<button[^>]*ent-flag/);
});

test("page: Entities stays a window of rows with 2,000 entities, and an empty brain says what to do", () => {
  const big = structuredClone(D);
  big.pillars.entities.rows = Array.from({ length: 2000 }, (_, i) => ({ id: "e_" + i, name: `Person ${i}`, kind: i % 4 ? "person" : "organization", subtype: null, aliases: [`alias${i}`], email: null, emails: [], fields: [], relation: null, rel: [], line: null, last: null, notes: 2000 - i, path: `brain/entities/p${i}.md` }));
  big.pillars.entities.kinds = [{ kind: "person", count: 1500 }, { kind: "organization", count: 500 }];
  const q = page(big); q.run('show("entities")'); const drawn = () => (q.node("#ent-list").innerHTML.match(/role="option"/g) || []).length;
  assert.ok(drawn() > 10 && drawn() < 80, "only the rows near the window are drawn");
  assert.match(q.node("#ent-list").innerHTML, /aria-setsize="2000"/); assert.match(q.node("#ent-list").innerHTML, new RegExp(`<div style="height:${(2000 - drawn()) * 60}px"`), "the rest is empty height");
  q.node("#ent-list").scrollTop = 60 * 1000; q.node("#ent-list").onscroll();
  assert.match(q.node("#ent-list").innerHTML, /Person 1000</); assert.doesNotMatch(q.node("#ent-list").innerHTML, /Person 0</); assert.ok(drawn() < 80);
  const t = performance.now(); fire(q, "input", { target: { id: "ent-q", value: "alias1999" } });
  assert.ok(performance.now() - t < 200, "a search over 2,000 entities is immediate");
  assert.match(q.node("#ent-list").innerHTML, /Person 1999/); assert.equal(drawn(), 1);
  fire(q, "input", { target: { id: "ent-q", value: "" } }); fire(q, "keydown", { key: "End", target: { id: "ent-list" } });
  assert.match(q.node("#ent-list").innerHTML, /class="ent-row ent-active" role="option" id="ent-o-1999"/); assert.equal(q.node("#ent-list").getAttribute("aria-activedescendant"), "ent-o-1999");
  const none = structuredClone(D); none.pillars.entities.rows = []; none.pillars.entities.kinds = [];
  const e = page(none);
  assert.match(e.node("#ent-list").innerHTML, /Nobody here yet/); assert.match(e.node("#ent-detail").innerHTML, /connect your CRM, email or calendar/); assert.match(e.node("#ent-detail").innerHTML, /codex:\/\/threads\/new/);
});

test("page: Memories shows date, age, source and what replaced what; a filter fetches the whole list once", async () => {
  const p = page(D);
  const list = p.node("#pm-list").innerHTML;
  assert.match(list, /Ola Kowalska runs returns and logistics/); assert.match(list, /Replaces what was saved <time[^>]*>[^<]+<\/time>: Ola Kowalska runs returns at Acme Retail\./);
  assert.match(list, /title="[^"]+">3 days ago<\/time>/, "a date reads as how long ago, with the exact time on hover"); assert.match(list, /Sources/);
  assert.doesNotMatch(list, /Jan Zielinski left/, "in force by default");
  assert.match(list, /data-entity-id="[^"]+">Ola Kowalska<\/button>/, "the people and companies a note names are chips that open them"); assert.match(list, /class="mem-topic">Our company</, "the topic is small secondary text, by its title");
  assert.doesNotMatch(p.node("#pm-filters").innerHTML + list, /context/i, "the word context is not shown to a person");
  assert.match(p.node("#pm-filters").innerHTML, /data-pm-kind="decision"[^>]*>Decisions</); assert.match(p.node("#pm-filters").innerHTML, /<label>Who <select id="pm-who">/);
  p.run('pmF.state="";renderNotesTab()');
  assert.match(p.node("#pm-list").innerHTML, /Replaced <time[^>]*>[^<]+<\/time> by: Ola Kowalska runs returns and logistics/); assert.match(p.node("#pm-list").innerHTML, /Withdrawn <time[^>]*>[^<]+<\/time>: Withdrawn: Jan never worked/);
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

test("page: Workflows shows each file's status, trigger and runs, and the skills; the earlier views stay reachable", () => {
  const p = page(D); p.run('show("workflows")');
  const w = p.node("#pw-files").innerHTML;
  assert.match(w, /Outbound.*You start it by asking Codex/s); assert.match(w, /Weekly review.*Starts every Monday at 09:00/s); assert.match(w, /never run/);
  p.run('pwOpen="outbound";renderWorkflowsTab()');
  assert.match(p.node("#pw-files").innerHTML, /<ol class="wf-steps"><li class=""><span>[^<]+<\/span>/, "a click shows the steps as a numbered path"); assert.match(p.node("#pw-files").innerHTML, /<summary>Details<\/summary>.*Trigger: manual/s, "the file's own words stay in Details");
  assert.match(p.node("#pw-skills").innerHTML, /gtmb-workflow/);
  p.run('show("contexts")'); assert.match(p.node("#nav").innerHTML, /data-v="notes" class="on"/, "an earlier view lights the place it belongs to; there is no More menu");
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

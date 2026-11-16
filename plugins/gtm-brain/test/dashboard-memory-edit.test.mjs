// The Memories tab's menu on a note: POST /memory-edit takes five named operations (correct, retract, move,
// set_kind, answer), each one call of the remember script the MCP tool runs, behind the guard of the document save
// and the entity forms: this server's Origin, the token made at each start, JSON, a small body, never from a
// scheduled or background run. Notes are append-only: every test here also holds that the logs only grow.
// On a throwaway brain made by setup; the page is the shipped client in the DOM harness.
// Run: node --test plugins/gtm-brain/test/dashboard-memory-edit.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, realpathSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { request } from "node:http";
import { page } from "./helpers/dashboard-page.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-brain-memedit-codex-")), HOME: mkdtempSync(join(tmpdir(), "gtm-brain-memedit-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SESSION_START: "1" };
for (const k of ["GTM_BRAIN_NO_COMMIT", "GTM_BRAIN_RUN", "GTM_BRAIN_APPROVAL_TICKET", "GTM_BRAIN_HOST", "GTM_BRAIN_TEST_LAYOUT"]) delete env[k];
const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-memedit-")));
execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--team", "Tomek Zielinski <tomek@reflow.io>"], { cwd: root, env, stdio: "ignore" });
const lib = await import(`${P}/lib/brain.mjs`);
const { MEMORY_EDIT_OPS, MEMORY_EDIT_TEXT_MAX } = await import(`${P}/server/memory-edit.mjs`);
const { noteIndex, wholeTexts } = await import(`${P}/lib/dashboard-pillars.mjs`);
writeFileSync(join(lib.workDir(root), "person.json"), JSON.stringify({ handle: "marta-nowak" }) + "\n");
const dash = (extra = {}, ...a) => execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, ...a], { encoding: "utf8", env: { ...env, ...extra } }).trim();
after(() => { try { dash({}, "--stop"); } catch {} for (const r of [root, env.CODEX_HOME, env.HOME]) { try { rmSync(r, { recursive: true, force: true }); } catch {} } });

// What a team has after a while: a second topic, notes with sources and people, a decision, an open question,
// the same note saved twice, one already replaced and one already withdrawn.
lib.writeNames(root, [...lib.readNames(root), { name: "Ola Kowalska", kind: "person" }, { name: "Acme Retail", kind: "organization", subtype: "company" }]);
lib.writeContext(root, "pipeline", { title: "Pipeline", rule: "Deals and renewals." });
const day = n => new Date(Date.now() - n * 864e5).toISOString();
const add = (ctx, fields, n) => lib.appendMemory(root, ctx, { authors: ["marta-nowak"], at: day(n), ...fields }).rec;
const acme = add("company", { content: "Acme Retail renews in March 2027.", people: ["Acme Retail"], tags: ["account:acme"], source: [{ kind: "gmail", ref: "thread-1", account: "sales@reflow.io" }] }, 20);
const pricing = add("company", { content: "Ola Kowalska asked for the yearly price list.", people: ["Ola Kowalska"], source: [{ kind: "gmail", ref: "thread-2" }] }, 18);
const wrong = add("company", { content: "Acme Retail has 400 stores.", people: ["Acme Retail"] }, 16);
const stray = add("company", { content: "The Berlin pilot starts with twelve stores on 2027-02-01.", source: [{ kind: "notion", ref: "page-9" }], tags: ["project-note"] }, 14);
const plan = add("company", { content: "We sell to retailers with more than 50 stores first." }, 12);
const question = add("company", { kind: "question", content: "Which plan does Acme Retail want?", people: ["Acme Retail"], tags: ["brain-question"] }, 10);
const first = add("company", { content: "Returns over 30 days need a manager's approval." }, 9);
const copy = add("company", { content: "Returns over 30 days need a manager's approval." }, 8);
const older = add("company", { content: "The pilot has ten stores." }, 7);
const newer = add("company", { content: "The pilot has twelve stores.", supersedes: older.id }, 6);
const gone = add("company", { content: "Ola Kowalska left Acme Retail." , people: ["Ola Kowalska"] }, 5);
add("company", { retracts: gone.id, content: "Withdrawn: she did not leave." }, 4);
const linked = add("company", { content: "Ola Kowalska works at Acme Retail.", people: ["Ola Kowalska", "Acme Retail"], source: [{ kind: "user", ref: "marta-nowak" }],
  relation: { from: lib.readNames(root).find(e => e.name === "Ola Kowalska").id, type: "works_at", to: lib.readNames(root).find(e => e.name === "Acme Retail").id, status: "current", basis: "user", observed_at: day(3).slice(0, 19) + "Z" } }, 3);
const nameQ = add("company", { kind: "question", content: "Who is Anna? Full name or company.", tags: ["brain-question", "name-question", `about:${plan.id}`, "name:Anna"] }, 2);
const long = add("company", { content: "First line of a long note.\nSecond line, which the page shows on one line. " + "More detail about the returns desk. ".repeat(12) }, 1);
execFileSync("git", ["-C", root, "add", "-A"]); execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "fixture"]);
const render = () => execFileSync(process.execPath, [`${P}/scripts/gtm-brain-render/render.mjs`, root], { env });
render();

const PORT = 48953, url = dash({}, "--start", `--port=${PORT}`), origin = `http://127.0.0.1:${PORT}`;
const token = (await (await fetch(url, { headers: { connection: "close" } })).text()).match(/<meta name="gtm-brain-edit" content="([a-f0-9]{64})">/)?.[1];
// node's fetch refuses to set Origin and Host, so the requests are made by hand
const send = (method, path, { headers = {}, body = null } = {}) => new Promise((resolve, reject) => {
  const req = request(url + path.replace(/^\//, ""), { method, headers: { connection: "close", ...headers } }, res => { let text = ""; res.setEncoding("utf8"); res.on("data", c => text += c); res.on("end", () => { let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, json, text }); }); });
  req.on("error", reject); if (body !== null) req.write(body); req.end();
});
const edit = (input, headers = {}) => send("POST", "/memory-edit", { headers: { origin, "content-type": "application/json", "x-gtm-brain-token": token, ...headers }, body: typeof input === "string" ? input : JSON.stringify(input) });
const lines = ctx => lib.readMemories(root, ctx).map(m => JSON.stringify(m));   // a topic's notes, wherever this layout keeps them
const logs = () => ({ company: lines("company"), pipeline: lines("pipeline") });
const grown = (before, by) => { const now = logs(); for (const c of Object.keys(before)) { assert.deepEqual(now[c].slice(0, before[c].length), before[c], `${c}: no line was changed or removed`); assert.equal(now[c].length - before[c].length, by[c] || 0, `${c}: lines added`); } };
const commits = () => execFileSync("git", ["-C", root, "log", "--format=%s"], { encoding: "utf8" }).trim().split("\n").length;
const notes = ctx => lib.readMemories(root, ctx), inForce = ctx => lib.effectiveMemories(notes(ctx)).filter(m => !m.retracts);
const ok = async input => { const r = await edit(input); assert.equal(r.status, 200, `${input.op}: ${r.text}`); assert.equal(r.json.ok, true); return r.json; };
const dashboard = m => m.source.some(s => s.kind === "dashboard" && s.ref === "memories") && m.source.some(s => s.kind === "user" && s.ref === "marta-nowak");

test("anything that is not the page, or not one of the five operations, is refused and nothing is written", async () => {
  const before = logs(), n = commits(), input = { op: "correct", id: acme.id, text: "Overwritten." };
  const cases = [
    ["no token", await edit(input, { "x-gtm-brain-token": "" }), 403],
    ["a wrong token", await edit(input, { "x-gtm-brain-token": "0".repeat(64) }), 403],
    ["a foreign Origin", await edit(input, { origin: "https://evil.example" }), 403],
    ["no Origin", await send("POST", "/memory-edit", { headers: { "content-type": "application/json", "x-gtm-brain-token": token }, body: JSON.stringify(input) }), 403],
    ["another site's request", await edit(input, { "sec-fetch-site": "cross-site" }), 403],
    ["a form post", await edit("op=correct", { "content-type": "application/x-www-form-urlencoded" }), 415],
    ["not JSON", await edit("{op:"), 400],
    ["no operation", await edit({ id: acme.id, text: "x" }), 400],
    ["an unknown operation", await edit({ op: "delete", id: acme.id }), 400],
    ["an operation of Object itself", await edit({ op: "constructor" }), 400],
    ["a tool chosen by the caller", await edit({ op: "run_tool", tool: "remember", args: {} }), 400],
    ["too large", await edit({ op: "correct", id: acme.id, text: "x".repeat(70000) }), 413],
    ["a note that does not exist", await edit({ op: "correct", id: "m_000000000000", text: "Nobody said this." }), 404],
    ["an id that is not an id", await edit({ op: "retract", id: "../../admin" }), 400],
    ["no id", await edit({ op: "retract" }), 400],
    ["a note already replaced", await edit({ op: "correct", id: older.id, text: "The pilot has nine stores." }), 409],
    ["a note already withdrawn", await edit({ op: "retract", id: gone.id }), 409],
    ["a blank text", await edit({ op: "correct", id: acme.id, text: "  \n " }), 400],
    ["no text", await edit({ op: "answer", id: question.id }), 400],
    ["a text over the limit", await edit({ op: "correct", id: acme.id, text: "x".repeat(MEMORY_EDIT_TEXT_MAX + 1) }), 413],
    ["the same text", await edit({ op: "correct", id: acme.id, text: " Acme Retail renews in March 2027. " }), 400],
    ["a topic that does not exist", await edit({ op: "move", id: stray.id, topic: "no-such-topic" }), 404],
    ["a topic that is not a slug", await edit({ op: "move", id: stray.id, topic: "../company" }), 400],
    ["the topic it is in", await edit({ op: "move", id: stray.id, topic: "company" }), 400],
    ["a kind that does not exist", await edit({ op: "set_kind", id: plan.id, kind: "action" }), 400],
    ["the kind it has", await edit({ op: "set_kind", id: plan.id, kind: "note" }), 400],
    ["an answer to a note", await edit({ op: "answer", id: plan.id, text: "Yes." }), 422],
    ["an answer to a name question", await edit({ op: "answer", id: nameQ.id, text: "Anna Nowak." }), 422],
    ["a correction of a note that records a connection", await edit({ op: "correct", id: linked.id, text: "Ola Kowalska works at Reflow." }), 422],
    ["a reason of two lines", await edit({ op: "retract", id: acme.id, reason: "one\ntwo" }), 400],
    ["a GET", await send("GET", "/memory-edit", { headers: { origin } }), 404],
  ];
  for (const [what, r, status] of cases) { assert.equal(r.status, status, `${what}: ${r.text}`); if (r.json) assert.equal(r.json.ok, false, what); }
  const note = what => cases.find(c => c[0] === what)[1].json.note;
  assert.match(note("an unknown operation"), /cannot do that/); assert.match(note("a note that does not exist"), /not in the brain any more/);
  assert.match(note("a note already replaced"), /already replaced by a newer one/); assert.match(note("a note already withdrawn"), /already withdrawn/);
  assert.match(note("a blank text"), /needs some text/); assert.match(note("a topic that does not exist"), /topic is not in the brain/);
  assert.match(note("a correction of a note that records a connection"), /a connection between two entities/);
  grown(before, {}); assert.equal(commits(), n);
  assert.deepEqual(MEMORY_EDIT_OPS, ["correct", "retract", "move", "set_kind", "answer"]);
});

test("correct writes a new note that supersedes the old one, with its topic, people, kind, tags and sources, and returns it", async () => {
  const before = logs(), n = commits();
  const r = await ok({ op: "correct", id: acme.id, text: "Acme Retail renews in April 2027.\nThe contract runs for two years." });
  assert.equal(r.status, "corrected"); assert.match(r.note, /The old note is kept in history/);
  const m = notes("company").find(x => x.id === r.memory);
  assert.deepEqual([m.content, m.supersedes, m.retracts, m.kind, m.context, m.authors, m.people, m.tags], ["Acme Retail renews in April 2027.\nThe contract runs for two years.", acme.id, null, "note", "company", ["marta-nowak"], ["Acme Retail"], ["account:acme"]]);
  assert.ok(dashboard(m)); assert.ok(m.source.some(s => s.kind === "gmail" && s.ref === "thread-1" && s.account === "sales@reflow.io"), "the old note's source comes along");
  assert.deepEqual([r.record.id, r.record.content, r.record.supersedes, r.record.context], [m.id, m.content, acme.id, "company"], "the record read back");
  assert.ok(!inForce("company").some(x => x.id === acme.id) && inForce("company").some(x => x.id === m.id));
  grown(before, { company: 1 }); assert.ok(commits() > n, "committed by remember");
  assert.equal((await edit({ op: "correct", id: acme.id, text: "Again." })).status, 409, "the old one is no longer in force");
  // the tool's own refusal comes back in its words, and nothing is written
  const dash2 = await edit({ op: "correct", id: pricing.id, text: "Ola Kowalska asked for the yearly price list \u2014 twice." });
  assert.equal(dash2.status, 422); assert.match(dash2.json.note, /long dash; use a plain hyphen/); assert.doesNotMatch(dash2.json.note, /Fix these and call again/);
  grown(before, { company: 1 });
});

test("retract withdraws a note by a new record, with the reason or without; a note with a connection can be withdrawn too", async () => {
  const before = logs();
  const r = await ok({ op: "retract", id: wrong.id, reason: "It has 40 stores, not 400." });
  assert.equal(r.status, "retracted");
  const m = notes("company").find(x => x.id === r.memory);
  assert.deepEqual([m.retracts, m.supersedes, m.content, m.authors], [wrong.id, null, "Withdrawn: It has 40 stores, not 400.", ["marta-nowak"]]); assert.ok(dashboard(m));
  assert.equal(r.record.retracts, wrong.id);
  assert.ok(!inForce("company").some(x => x.id === wrong.id));
  const c = await ok({ op: "retract", id: copy.id, reason: "Same as an earlier note." });
  assert.equal(notes("company").find(x => x.id === c.memory).retracts, copy.id); assert.ok(inForce("company").some(x => x.id === first.id), "the earlier one stays");
  const plainReason = await ok({ op: "retract", id: linked.id });
  assert.equal(notes("company").find(x => x.id === plainReason.memory).content, "Withdrawn: this was wrong.");
  grown(before, { company: 3 });
  assert.equal((await edit({ op: "retract", id: wrong.id })).status, 409);
});

test("move saves the note in the other topic with its text and sources and withdraws it where it was, in one call", async () => {
  const before = logs();
  const r = await ok({ op: "move", id: stray.id, topic: "pipeline" });
  assert.equal(r.status, "moved"); assert.equal(r.note, "Moved to Pipeline.");
  const m = notes("pipeline").find(x => x.id === r.memory);
  assert.deepEqual([m.content, m.context, m.kind, m.tags, m.supersedes, m.retracts], [stray.content, "pipeline", "note", ["project-note"], null, null]);
  assert.ok(dashboard(m) && m.source.some(s => s.kind === "notion" && s.ref === "page-9"));
  const out = notes("company").at(-1);
  assert.deepEqual([out.retracts, out.content], [stray.id, "Moved to Pipeline."]);
  assert.ok(!inForce("company").some(x => x.id === stray.id)); assert.equal(inForce("pipeline").filter(x => x.content === stray.content).length, 1);
  grown(before, { company: 1, pipeline: 1 });
  // and back: the moved note carries the dashboard as a source already, which must not read as "already kept"
  const again = await ok({ op: "move", id: r.memory, topic: "company" });
  assert.equal(inForce("company").filter(x => x.content === stray.content).length, 1); assert.equal(inForce("pipeline").filter(x => x.content === stray.content).length, 0);
  grown(before, { company: 2, pipeline: 2 });
  // a note that remember would count as already kept (the same words, no new source) is not moved: its second
  // entry would write nothing after the first had withdrawn the note
  const one = add("company", { content: "Reflow invoices yearly, in January.", source: [{ kind: "dashboard", ref: "memories" }] }, 0.9), two = add("company", { content: "Reflow invoices yearly, in January." }, 0.8), mid = logs();
  const twin = await edit({ op: "move", id: two.id, topic: "pipeline" });
  assert.equal(twin.status, 409, twin.text); assert.match(twin.json.note, /Another note already says much the same in Our company: "Reflow invoices yearly, in January\."/);
  // nor one that names a day in words, which remember would hold
  const loose = add("company", { content: "Tomek calls the customer next Thursday." }, 0.7);
  const dated = await edit({ op: "move", id: loose.id, topic: "pipeline" }); assert.equal(dated.status, 422, dated.text); assert.match(dated.json.note, /names a day in words/);
  assert.deepEqual([logs().company.length, logs().pipeline.length], [mid.company.length + 1, mid.pipeline.length]);
  assert.ok(inForce("company").some(x => x.id === one.id) && inForce("company").some(x => x.id === two.id));
});

test("set_kind saves the same text as another kind, replacing the note; an open question is answered by a decision that closes it", async () => {
  const before = logs();
  const r = await ok({ op: "set_kind", id: plan.id, kind: "decision" });
  assert.equal(r.status, "changed");
  const m = notes("company").find(x => x.id === r.memory);
  assert.deepEqual([m.kind, m.content, m.supersedes], ["decision", plan.content, plan.id]); assert.ok(dashboard(m));
  assert.equal(inForce("company").find(x => x.content === plan.content).kind, "decision");
  const a = await ok({ op: "answer", id: question.id, text: "The yearly plan, with the returns desk add-on." });
  assert.equal(a.status, "answered");
  const ans = notes("company").find(x => x.id === a.memory);
  assert.deepEqual([ans.retracts, ans.kind, ans.content, ans.supersedes], [question.id, "decision", "The yearly plan, with the returns desk add-on.", null]); assert.ok(dashboard(ans));
  assert.ok(!lib.effectiveMemories(notes("company")).some(x => x.id === question.id), "the question is closed the way an answer in a chat closes it");
  assert.equal((await edit({ op: "answer", id: question.id, text: "Again." })).status, 409);
  // a question made a note again loses the marks of a pending brain question
  const q = add("company", { kind: "question", content: "Do we offer monthly billing in 2027?", tags: ["brain-question", "project:x"] }, 0);
  const back = await ok({ op: "set_kind", id: q.id, kind: "note" });
  assert.deepEqual(notes("company").find(x => x.id === back.memory).tags, ["project:x"]);
  // five lines: the four above, and remember's own closing of the "Who is Anna?" question that was about the note whose kind changed
  grown(before, { company: 5 });
  assert.ok(notes("company").some(x => x.retracts === nameQ.id && /^Asked again|^Answered by/.test(x.content)));
});

test("the page data marks an exact copy of an earlier note in force, and carries the whole text of a shortened note in a side file", () => {
  const index = noteIndex(lib.listContexts(root)), of = id => index.find(n => n.id === id);
  const a = add("pipeline", { content: "Tomek owns the Acme Retail renewal." }, 0.5), b = add("pipeline", { content: "tomek owns the  Acme Retail renewal" }, 0.4), c = add("company", { content: "Tomek owns the Acme Retail renewal." }, 0.3);
  const now = noteIndex(lib.listContexts(root)), at = id => now.find(n => n.id === id);
  assert.equal(at(a.id).sameAs, undefined); assert.deepEqual(at(b.id).sameAs, { id: a.id, at: a.at, context: "pipeline" }); assert.equal(at(c.id).sameAs.id, a.id, "across topics");
  assert.equal(of(copy.id).sameAs, undefined, "a withdrawn copy is no copy any more"); assert.equal(of(first.id).sameAs, undefined);
  assert.equal(of(long.id).more, true); assert.equal(of(first.id).more, undefined);
  assert.equal(wholeTexts(lib.listContexts(root))[long.id], long.content); assert.equal(wholeTexts(lib.listContexts(root))[first.id], undefined);
  render();
  const D = JSON.parse(readFileSync(join(lib.workDir(root), "home", "data.json"), "utf8"));
  assert.match(D.pillars.memories.whole, /^entities-[a-f0-9-]{36}\/notes-whole\.json$/);
  assert.equal(JSON.parse(readFileSync(join(lib.workDir(root), "home", D.pillars.memories.whole), "utf8")).texts[long.id], long.content);
});

// ---------- the page: the shipped client in the DOM harness ----------
const fire = (p, type, event) => p.listeners[type].forEach(fn => fn(event));
const tap = (p, attr, dataset) => fire(p, "click", { target: { closest: s => s === `[${attr}]` ? { dataset } : null } });
const tick = () => new Promise(r => setTimeout(r, 5));

test("page: each menu action sends exactly one named operation, a refused save keeps what was typed, and nothing shows off the live page", async () => {
  add("company", { kind: "question", content: "Is the Berlin pilot paid for by the customer?" }, 0.1);
  render();
  const D = JSON.parse(readFileSync(join(lib.workDir(root), "home", "data.json"), "utf8")), all = JSON.parse(readFileSync(join(lib.workDir(root), "home", D.pillars.memories.file), "utf8")).notes;
  const whole = JSON.parse(readFileSync(join(lib.workDir(root), "home", D.pillars.memories.whole), "utf8"));
  const sent = []; let answer = () => ({ ok: true, note: "Saved." });
  const fetcher = async (path, opts) => {
    if (path === "/memory-edit") { sent.push({ headers: opts.headers, method: opts.method, body: JSON.parse(opts.body) }); const j = answer(sent.at(-1).body); return { ok: j.ok, status: j.ok ? 200 : 422, json: async () => j }; }
    if (String(path).endsWith("notes-whole.json")) return { ok: true, json: async () => whole };
    return { ok: true, json: async () => ({ notes: all }) };
  };
  const list = p => p.node("#pm-list").innerHTML, T = "ab".repeat(32);
  const by = text => all.find(n => n.state === "in force" && n.text.startsWith(text));
  const note = by("We sell to retailers"), q = by("Is the Berlin pilot paid"), dup = all.find(n => n.sameAs && n.state === "in force"), lng = by("First line of a long note"), replaced = all.find(n => n.replaces && n.state === "in force");
  assert.ok(note && q && q.kind === "question" && dup && lng && replaced, "the fixture has a plain note, an open question, a copy, a long note and a corrected one");
  // a saved copy, and a live page whose server gave no token: no menu, no form, no way to change anything
  for (const p of [page(D, { route: "#view=notes" }), page(D, { live: true, fetcher, route: "#view=notes" })]) {
    assert.doesNotMatch(list(p), /data-pm-menu|data-pm-open|pm-form|<textarea|<form/); assert.match(list(p), /Same as an earlier note/);
    tap(p, "data-pm-open", { pmOpen: "correct", pmId: note.id }); assert.doesNotMatch(list(p), /pm-form/);
  }
  const p = page(D, { live: true, fetcher, route: "#view=notes" });
  p.node('meta[name="gtm-brain-edit"]').setAttribute("content", T); p.run("renderNotesTab()");
  const open = (mode, id) => tap(p, "data-pm-open", { pmOpen: mode, pmId: id }), act = what => tap(p, "data-pm-do", { pmDo: what }), type = (key, value) => fire(p, "input", { target: { dataset: { pmF: key }, value } });
  const form = () => (list(p).match(/<section class="ent-form mem-form"[\s\S]*?<\/section>/) || [""])[0];
  // closed: a "..." button per note in force with a plain label, no form, no text box, no action word on a button
  assert.match(list(p), new RegExp(`<button type="button" class="mem-dots" data-pm-menu="${note.id}" aria-haspopup="menu" aria-expanded="false" aria-label="More for this note"`));
  assert.doesNotMatch(list(p), /role="menu"|pm-form|<textarea|<form|<input/);
  assert.doesNotMatch(list(p), />\s*(Correct|Retract|Save|Move|Change|Withdraw|Answer)[^<]*<\/button>/, "nothing that reads as an action while everything is closed");
  const old = all.find(n => n.state !== "in force"); if (old) assert.doesNotMatch(list(p), new RegExp(`data-pm-menu="${old.id}"`), "only a note in force has the menu");
  // the menu: menu roles, the five things in plain words (Answered only on an open question), closed by Escape
  tap(p, "data-pm-menu", { pmMenu: note.id });
  assert.match(list(p), /aria-expanded="true"/); assert.match(list(p), /<div class="mem-menu" id="pm-menu" role="menu"/);
  assert.deepEqual([...list(p).matchAll(/role="menuitem" tabindex="-1" data-pm-open="[a-z]+" data-pm-id="[^"]+">([^<]+)</g)].map(m => m[1]), ["Correct this", "This was wrong", "Move to another topic", "Change what kind it is"]);
  fire(p, "keydown", { key: "Escape", preventDefault() {} }); assert.doesNotMatch(list(p), /role="menu"/);
  tap(p, "data-pm-menu", { pmMenu: q.id }); assert.match(list(p), /data-pm-open="answer"[^>]*>Answered</); tap(p, "data-pm-menu", { pmMenu: q.id }); assert.doesNotMatch(list(p), /role="menu"/, "the button closes it again");
  tap(p, "data-pm-menu", { pmMenu: note.id }); fire(p, "click", { target: { closest: () => null } }); assert.doesNotMatch(list(p), /role="menu"/, "a click elsewhere closes it");

  // 1. Correct this: the text in a text area, the sentence about history; nothing sent when nothing changed
  open("correct", note.id);
  assert.match(form(), /<h3 id="pm-form-title">Correct this note<\/h3>/); assert.match(form(), new RegExp(`<textarea data-pm-f="text"[^>]*>${note.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</textarea>`));
  assert.match(form(), /The old note is kept in history; this one replaces it\./); assert.doesNotMatch(list(p), /<form/);
  act("save"); await tick(); assert.equal(sent.length, 0); assert.match(form(), /role="alert"[^>]*>Nothing was changed\./);
  type("text", "   "); act("save"); await tick(); assert.equal(sent.length, 0); assert.match(form(), /A note needs some text\./);
  // refused: the tool's words, and the form as it was typed
  type("text", "We sell to retailers with more than 80 stores first.");
  answer = () => ({ ok: false, note: "contains a long dash; use a plain hyphen" });
  act("save"); await tick();
  assert.deepEqual(sent[0].body, { op: "correct", id: note.id, text: "We sell to retailers with more than 80 stores first." });
  assert.equal(sent[0].method, "POST"); assert.equal(sent[0].headers["x-gtm-brain-token"], T); assert.equal(sent[0].headers["content-type"], "application/json");
  assert.match(form(), /role="alert"[^>]*>contains a long dash; use a plain hyphen/); assert.match(form(), />We sell to retailers with more than 80 stores first\.<\/textarea>/);
  // saved: the form closes and one line says what was done; the refresh keeps the filters and the line
  answer = () => ({ ok: true, note: "Corrected. The old note is kept in history." });
  act("save"); await tick();
  assert.equal(sent.length, 2); assert.deepEqual(sent[1].body, sent[0].body);
  assert.doesNotMatch(list(p), /pm-form/); assert.match(list(p), /<p class="ent-flash mem-flash" role="status">Corrected\. The old note is kept in history\. The page updates in a moment\.<\/p>/);
  const kept = JSON.parse(p.saved.get("gtm-mem-flash")); assert.equal(kept.text, "Corrected. The old note is kept in history."); assert.equal(kept.f.state, "in force");
  const reloaded = page(D, { live: true, fetcher, route: "#view=notes", saved: p.saved }); assert.match(list(reloaded), /role="status">Corrected\. The old note is kept in history\.</);
  // a revision that arrives while a form is open waits until it is closed
  open("retract", note.id); p.run('newer("2099-01-01T00:00:00.000Z")'); assert.equal(p.reloads, 0); act("cancel"); assert.equal(p.reloads, 1); assert.doesNotMatch(list(p), /pm-form/);

  // a long note: its whole text comes from the side file before it can be corrected
  sent.length = 0; open("correct", lng.id); assert.match(form(), /Loading the whole note/); await tick();
  assert.ok(form().includes("First line of a long note.\nSecond line"), "the text area holds the whole text with its line breaks");
  type("text", whole.texts[lng.id] + " And one more fact."); answer = () => ({ ok: true, note: "Corrected." }); act("save"); await tick();
  assert.deepEqual(sent[0].body, { op: "correct", id: lng.id, text: whole.texts[lng.id] + " And one more fact." });

  // 2. This was wrong: asks once in the page, with an optional reason
  sent.length = 0; open("retract", note.id);
  assert.match(form(), /<h3 id="pm-form-title">This was wrong<\/h3>/); assert.match(form(), /It stays in history\./); assert.match(form(), /Why, in one line \(optional\)/); assert.equal(sent.length, 0, "opening it sends nothing");
  act("save"); await tick(); assert.deepEqual(sent[0].body, { op: "retract", id: note.id });
  open("retract", note.id); type("reason", " It was never agreed. "); act("save"); await tick(); assert.deepEqual(sent[1].body, { op: "retract", id: note.id, reason: "It was never agreed." });
  open("retract", note.id); act("cancel"); await tick(); assert.equal(sent.length, 2); assert.doesNotMatch(list(p), /pm-form/);

  // 3. Move to another topic: topics by their titles, filtered as typed; nothing sent until one is chosen
  sent.length = 0; open("move", note.id);
  assert.match(form(), /<h3 id="pm-form-title">Move to another topic<\/h3>/); assert.match(form(), /data-pm-pick="pipeline" aria-pressed="false">Pipeline</); assert.doesNotMatch(form(), /data-pm-pick="company"/);
  act("save"); await tick(); assert.equal(sent.length, 0); assert.match(form(), /Choose a topic\./);
  type("q", "zzzz"); assert.match(p.node("#pm-cands").innerHTML, /No topic matches/); type("q", "pipelin"); assert.match(p.node("#pm-cands").innerHTML, /data-pm-pick="pipeline"/);
  tap(p, "data-pm-pick", { pmPick: "pipeline" }); assert.match(form(), /data-pm-pick="pipeline" aria-pressed="true"/);
  type("q", "zzzz"); assert.match(p.node("#pm-cands").innerHTML, /data-pm-pick="pipeline" aria-pressed="true"/, "the chosen topic stays in view");
  act("save"); await tick(); assert.deepEqual(sent[0].body, { op: "move", id: note.id, topic: "pipeline" });

  // 4. Change what kind it is, and Answered on an open question
  sent.length = 0; open("kind", note.id);
  assert.match(form(), new RegExp(`data-pm-pick="${note.kind}" aria-pressed="false" disabled>[A-Za-z]+ \\(now\\)<`));
  act("save"); await tick(); assert.equal(sent.length, 0); assert.match(form(), /Choose what kind it is\./);
  const other = note.kind === "decision" ? "question" : "decision";
  tap(p, "data-pm-pick", { pmPick: other }); act("save"); await tick(); assert.deepEqual(sent[0].body, { op: "set_kind", id: note.id, kind: other });
  sent.length = 0; open("answer", q.id); assert.match(form(), /<h3 id="pm-form-title">Answer this question<\/h3>/); assert.match(form(), /saved as a decision and the question is closed/);
  act("save"); await tick(); assert.equal(sent.length, 0); assert.match(form(), /Write the answer\./);
  type("text", "Yes, from January."); act("save"); await tick(); assert.deepEqual(sent[0].body, { op: "answer", id: q.id, text: "Yes, from January." });
  open("answer", note.id); assert.doesNotMatch(list(p), /pm-form/, "only a question can be answered");

  // 5. the copy: a marker on the card that opens the one question, then retracts this copy
  sent.length = 0;
  assert.match(list(p), new RegExp(`<button type="button" class="linkbtn" data-pm-open="dupe" data-pm-id="${dup.id}">Same as an earlier note</button>`));
  open("dupe", dup.id); assert.match(form(), /Withdrawing this copy keeps the earlier one\./); assert.match(form(), /data-pm-do="save">Retract this copy</); assert.equal(sent.length, 0);
  act("save"); await tick(); assert.deepEqual(sent[0].body, { op: "retract", id: dup.id, reason: "Same as an earlier note." });
  open("dupe", note.id); assert.doesNotMatch(list(p), /pm-form/, "a note that is no copy has no such form");
  p.run('pmF.state="copies";pmFiltersDrawn=false;renderNotesTab()'); assert.match(p.node("#pm-filters").innerHTML, /<option value="copies" selected>Copies of earlier notes<\/option>/);
  assert.equal([...list(p).matchAll(/<article /g)].length, all.filter(n => n.sameAs && n.state === "in force").length);
  p.run('pmF.state="in force";renderNotesTab()');

  // History: the earlier versions of a note that replaced another, read-only, on a saved copy too
  const still = page(D, { route: "#view=notes" });
  assert.match(list(still), new RegExp(`data-pm-history="${replaced.id}" aria-expanded="false">History<`));
  tap(still, "data-pm-history", { pmHistory: replaced.id });
  const hist = (list(still).match(/<ol class="mem-history"[\s\S]*?<\/ol>/) || [""])[0];
  assert.match(hist, /aria-label="Earlier versions, newest first"/); assert.ok(hist.includes(all.find(n => n.id === replaced.replaces.id).text.replace(/'/g, "&#39;")) || hist.includes(replaced.replaces.text.slice(0, 20)));
  assert.doesNotMatch(hist, /<button|<input|<textarea/);
  tap(still, "data-pm-history", { pmHistory: replaced.id }); assert.doesNotMatch(list(still), /mem-history"/);
});

test("nobody known at this computer, or a scheduled or background run: no note is changed", async () => {
  const before = logs(), id = inForce("company").find(m => !m.relation && m.kind === "note").id;
  rmSync(join(lib.workDir(root), "person.json")); execFileSync("git", ["-C", root, "config", "user.email", "nobody@users.noreply.github.com"]);
  const anon = await edit({ op: "retract", id }); assert.equal(anon.status, 403); assert.match(anon.json.note, /does not know who is at this computer/);
  writeFileSync(join(lib.workDir(root), "person.json"), JSON.stringify({ handle: "marta-nowak" }) + "\n");
  dash({}, "--stop");
  dash({ GTM_BRAIN_RUN: "1" }, "--start", `--port=${PORT}`);
  const fresh = (await (await fetch(url, { headers: { connection: "close" } })).text()).match(/gtm-brain-edit" content="([a-f0-9]{64})"/)[1];
  const run = await edit({ op: "retract", id }, { "x-gtm-brain-token": fresh }); assert.equal(run.status, 403); assert.match(run.json.note, /scheduled or background run/);
  assert.equal((await edit({ op: "retract", id })).status, 403, "the old token");
  grown(before, {});
  dash({}, "--stop");
});

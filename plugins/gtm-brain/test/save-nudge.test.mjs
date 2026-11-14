// Eager saving and staleness (owner, 2026-11-14: "we need more eager saving, or an indication of staleness").
// The nudge: a chat that made three reads and saved nothing gets one line with the third read's reply, once per
// stretch, never in a separate run, off with save_nudge: off. Staleness: when the last note was saved, on the
// context list, the load header and a quiet brain; the age of an old fact in the brief the chat reads.
// Run: node --test plugins/gtm-brain/test/save-nudge.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-nudge-home-"));
process.env.GTM_BRAIN_NO_COMPILE = "1"; process.env.GTM_BRAIN_NO_WATCH = "1"; process.env.GTM_BRAIN_NO_OPEN = "1";
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_COMMIT: "1" };
delete env.GTM_BRAIN_RUN; delete env.GTM_BRAIN_TOOLSET; delete env.GTM_BRAIN_NOW; delete env.GTM_BRAIN_NO_SAVE_NUDGE;
const lib = await import(`${P}/lib/brain.mjs`);
const nudge = await import(`${P}/lib/save-nudge.mjs`);
const stale = await import(`${P}/lib/staleness.mjs`);

const NOW = "2026-11-14T12:00:00Z", now = Date.parse(NOW);
const NUDGE = /^Nothing saved in this chat since \d\d:\d\d: if this turn established a decision, a change, a commitment or an answer, save it now with remember \(one note per outcome\); otherwise carry on\.$/;

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-nudge-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Demo Co", "--one-liner", "events", "--owner", "Marta Nowak <marta@demo.co>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
// One server per client, as one per chat. A reply is its content parts, in order.
const children = [];
function client(extra = {}) {
  const child = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env: { ...env, ...extra } });
  children.push(child);
  const pending = new Map(); let seq = 0;
  createInterface({ input: child.stdout }).on("line", line => { const m = JSON.parse(line); const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); } });
  const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  return async (name, args) => { const m = await rpc("tools/call", { name, arguments: args }); return { parts: m.result.content.map(c => c.text), isError: !!m.result.isError }; };
}
after(() => children.forEach(c => c.kill()));
const nudged = r => r.parts.filter(p => NUDGE.test(p)).length;
const read = (call, root) => call("query", { brain: root, object: "contexts" });

test("the line is short and the counts are constants", () => {
  assert.equal(nudge.NUDGE_AFTER_READS, 3); assert.equal(nudge.NUDGE_AGAIN_READS, 5);
  const line = nudge.nudgeLine(now);
  assert.match(line, NUDGE); assert.ok(line.length < 200, `${line.length} characters`);
  assert.ok(!/[\u2013\u2014]/.test(line));
});

test("the tracker: fires at the third read, waits five more, starts again after a save, per chat", () => {
  const t = nudge.createSaveNudge(), said = (key, tool, o) => !!t.note(key, tool, { now, ...o });
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => said("a", "query")), [false, false, true, false, false, false, false, true, false]);
  assert.equal(said("b", "query"), false, "another chat has its own count");
  // a save starts the stretch again; a refused save and a failed read do not count
  assert.equal(said("a", "remember"), false);
  assert.equal(said("a", "load_context"), false); assert.equal(said("a", "query", { ok: false }), false); assert.equal(said("a", "query"), false);
  assert.equal(said("a", "remember", { ok: false }), false);
  assert.equal(said("a", "query"), true);
  // tools that are neither a read nor a save change nothing, and never carry the line
  const u = nudge.createSaveNudge();
  for (const tool of ["save", "setup_brain", "approve_change", "propose_admin_change", "new_context", "onboarding_question", "render_dashboard", "query", "query"]) assert.equal(u.note("c", tool, { now }), "");
  assert.match(u.note("c", "load_context", { now }), NUDGE);
  // the line names when the stretch began: the last save
  const v = nudge.createSaveNudge(), at = new Date(2026, 10, 14, 9, 5).getTime();
  v.note("d", "query", { now: at - 60000 }); v.note("d", "remember", { now: at }); v.note("d", "query", { now: at + 1 }); v.note("d", "query", { now: at + 2 });
  assert.match(v.note("d", "query", { now: at + 3 }), /since 09:05:/);
  // a chat quiet for longer than the pause is a new chat
  const w = nudge.createSaveNudge({ quietMs: 1000 });
  w.note("e", "query", { now: 0 }); w.note("e", "query", { now: 1 });
  assert.equal(w.note("e", "query", { now: 5000 }), ""); assert.equal(w.note("e", "query", { now: 5001 }), ""); assert.match(w.note("e", "query", { now: 5002 }), NUDGE);
});

test("server: the third read without a save carries the line once, as its own part; remember starts the count again", async () => {
  const root = brain(), call = client();
  const first = await read(call, root), second = await call("load_context", { brain: root, contexts: ["company"] });
  assert.equal(nudged(first) + nudged(second), 0);
  const third = await read(call, root);
  assert.ok(!third.isError, third.parts.join("\n"));
  assert.equal(nudged(third), 1); assert.match(third.parts.at(-1), NUDGE); assert.ok(!NUDGE.test(third.parts[0]), "the read's own text is untouched");
  // not on every call: five more reads before it is said again
  for (let i = 0; i < 4; i++) assert.equal(nudged(await read(call, root)), 0, `read ${i + 4}`);
  assert.equal(nudged(await read(call, root)), 1, "the eighth read");
  // never on a write, a save or a proposal
  for (const r of [await call("save", { brain: root, message: "nothing" }), await call("propose_admin_change", { brain: root, content: readFileSync(join(root, "brain", "admin.md"), "utf8") }), await call("render_dashboard", { brain: root })]) assert.equal(nudged(r), 0);
  // a note saved: the stretch starts again, and the remember reply never carries it
  const saved = await call("remember", { brain: root, by: "marta-nowak", context: "company", content: "Northwind signs in January (2027-01-15).", sources: ["user:marta-nowak"] });
  assert.ok(!saved.isError, saved.parts.join("\n")); assert.equal(nudged(saved), 0);
  assert.equal(nudged(await read(call, root)), 0); assert.equal(nudged(await read(call, root)), 0);
  assert.equal(nudged(await read(call, root)), 1);
});

test("server: silent in a separate run, in the compile toolset, and with save_nudge: off in admin.md", async () => {
  const root = brain();
  for (const extra of [{ GTM_BRAIN_RUN: "background" }, { GTM_BRAIN_TOOLSET: "compile" }]) {
    const call = client(extra); let n = 0;
    for (let i = 0; i < 9; i++) n += nudged(await read(call, root));
    assert.equal(n, 0, JSON.stringify(extra));
  }
  const admin = join(root, "brain", "admin.md");
  writeFileSync(admin, readFileSync(admin, "utf8").replace(/^---\n/, "---\nsave_nudge: off\n"));
  assert.equal(lib.readAdmin(root).save_nudge, "off");
  const call = client(); let n = 0;
  for (let i = 0; i < 9; i++) n += nudged(await read(call, root));
  assert.equal(n, 0, "save_nudge: off");
  // default on: the same brain without the line
  writeFileSync(admin, readFileSync(admin, "utf8").replace("save_nudge: off\n", ""));
  const on = client(); let m = 0;
  for (let i = 0; i < 3; i++) m += nudged(await read(on, root));
  assert.equal(m, 1);
});

/* ---------- staleness, with a fixed clock ---------- */
const day = at => lib.localDateTime(at).slice(0, 10);
const script = (root, file, args, extra = {}) => execFileSync(process.execPath, [`${P}/scripts/${file}`, root, ...args], { env: { ...env, GTM_BRAIN_NOW: NOW, ...extra }, encoding: "utf8" });
const note = (root, slug, content, at, extra = {}) => lib.appendMemory(root, slug, { authors: ["marta-nowak"], content, source: [{ kind: "user", ref: "marta-nowak" }], at, ...extra }).rec;

test("the words: days ago, the last note, a quiet brain, an old fact", () => {
  assert.equal(stale.daysSince("2026-11-02T12:00:00Z", now), 12); assert.equal(stale.daysSince("", now), null); assert.equal(stale.daysSince("2026-12-01T00:00:00Z", now), 0);
  assert.deepEqual([0, 1, 12].map(stale.agoText), ["today", "1 day ago", "12 days ago"]);
  const notes = [{ at: "2026-10-01T09:00:00Z" }, { at: "2026-11-02T12:00:00Z" }];
  assert.equal(stale.lastNoteAgo(notes, now), "last note 12 days ago"); assert.equal(stale.lastNoteAgo([], now), "");
  assert.equal(stale.lastNoteDated(notes, day, now), "last note 2026-11-02 (12 days ago)");
  assert.equal(stale.quietBrainLine([{ slug: "pipeline", memories: notes }, { slug: "empty", memories: [] }], day, now), "Nothing has been saved in this brain for 12 days (last note 2026-11-02, in pipeline): what it says may be behind what happened since.");
  assert.equal(stale.quietBrainLine([{ slug: "pipeline", memories: [{ at: "2026-11-07T12:00:00Z" }] }], day, now), "", "seven days is not more than seven");
  assert.equal(stale.quietBrainLine([{ slug: "empty", memories: [] }], day, now), "");
  assert.equal(stale.oldFact("2026-09-02T10:00:00Z", day, now), " (as of 2026-09-02, 73 days ago)");
  assert.equal(stale.oldFact("2026-10-15T12:00:00Z", day, now), "", "30 days is not older than 30");
  assert.equal(stale.oldFact("2026-10-14T11:00:00Z", day, now), " (as of 2026-10-14, 31 days ago)");
});

test("status and the chat start list: a loaded context says when its last note was saved; a quiet brain says so in one line", async () => {
  const root = brain();
  // setup's own notes carry today's real date: read with a clock twelve days after the newest of them
  const newest = lib.listContexts(root).flatMap(c => c.memories).map(m => Date.parse(m.at)).sort((a, b) => b - a)[0];
  const later = new Date(newest + 12 * 864e5 + 3600e3).toISOString();
  script(root, "gtm-brain-load/load.mjs", ["company", "--only"]);
  const list = script(root, "gtm-brain-contexts/contexts.mjs", [], { GTM_BRAIN_NOW: later });
  assert.match(list, /Our company \(company\) · \d+ memories · [^·\n]+ · loaded in this chat · last note 12 days ago/);
  assert.ok(!/Strategy \(strategy\).*last note/.test(list), "only loaded contexts carry it");
  assert.equal(list.match(/Nothing has been saved in this brain for 12 days \(last note \d{4}-\d\d-\d\d, in [a-z-]+\)/g)?.length, 1);
  // the chat start prints the same list (--brief-loaded): the age stays, the summary excerpt goes
  assert.match(script(root, "gtm-brain-contexts/contexts.mjs", ["--brief-loaded"], { GTM_BRAIN_NOW: later }), /loaded in this chat · last note 12 days ago/);
  // a note today: no quiet line, and the context says today
  const fresh = script(root, "gtm-brain-contexts/contexts.mjs", [], { GTM_BRAIN_NOW: new Date(newest + 3600e3).toISOString() });
  assert.ok(!/Nothing has been saved/.test(fresh)); assert.match(fresh, /loaded in this chat · last note today/);
  // query status is this list, through the server (its clock is the server's environment)
  const status = await client({ GTM_BRAIN_NOW: later })("query", { brain: root, object: "status" });
  assert.match(status.parts[0], /loaded in this chat · last note 12 days ago/); assert.match(status.parts[0], /Nothing has been saved in this brain for 12 days/);
});

test("load_context: the header carries the date of the last note and its age", () => {
  const root = brain();
  lib.writeContext(root, "pipeline", { title: "Pipeline" });
  note(root, "pipeline", "Northwind asked for a pilot.", "2026-10-01T09:00:00Z"); note(root, "pipeline", "Northwind pilot agreed.", "2026-11-02T12:00:00Z");
  const out = script(root, "gtm-brain-load/load.mjs", ["pipeline"]);
  assert.match(out, /^# Context loaded: Pipeline \(pipeline\)   \[[^\]]+ · last note 2026-11-02 \(12 days ago\)\]$/m);
  lib.writeContext(root, "quiet", { title: "Quiet" });
  assert.match(script(root, "gtm-brain-load/load.mjs", ["quiet"]), /^# Context loaded: Quiet \(quiet\)   \[nothing recorded yet\]$/m);
});

test("entity brief for the chat: when it was last mentioned, and the age of a fact or relation past 30 days; the stored page holds no ages", () => {
  const root = brain();
  lib.addName(root, "Anna Lee"); lib.addName(root, "Northwind", { kind: "company" }); lib.addName(root, "Tom Berg");
  const rel = (from, type, to, observed_at) => ({ from, type, to, status: "current", basis: "user", observed_at });
  note(root, "company", "Anna Lee is Head of Sales at Northwind.", "2026-09-02T10:00:00Z", { relation: rel("Anna Lee", "works_at", "Northwind", "2026-09-02T10:00:00Z") });
  note(root, "company", "Tom Berg joined Northwind as a buyer.", "2026-11-10T10:00:00Z", { relation: rel("Tom Berg", "works_at", "Northwind", "2026-11-10T10:00:00Z") });
  const anna = script(root, "gtm-brain-recall/recall.mjs", ["--entity", "Anna Lee"]);
  assert.match(anna, /^Last mentioned: 2026-09-02 \(73 days ago\)\.$/m);
  assert.match(anna, /- Anna Lee works at Northwind \(current, said by the person, observed 2026-09-02\) \(as of 2026-09-02, 73 days ago\) \[/);
  assert.match(anna, /- Anna Lee is Head of Sales at Northwind\. \(Recorded: [^)]+\) \(as of 2026-09-02, 73 days ago\) \[/, "an uncompiled brief dates its latest evidence");
  const northwind = script(root, "gtm-brain-recall/recall.mjs", ["--entity", "Northwind"]);
  assert.match(northwind, /^Last mentioned: 2026-11-10 \(4 days ago\)\.$/m);
  assert.match(northwind, /Tom Berg works at Northwind \(current, said by the person, observed 2026-11-10\) \[/, "a recent relation carries no age");
  assert.match(northwind, /Anna Lee works at Northwind \([^)]+\) \(as of 2026-09-02, 73 days ago\)/);
  // a compiled brief: each claim is as old as the newest note it rests on
  const facts = lib.entityFacts(root, "Anna Lee"), id = facts.evidence[0].id;
  lib.compileEntity(root, "Anna Lee", { as_of: facts.as_of, by: "marta-nowak", brief: { overview: [{ text: "Anna Lee leads sales at Northwind.", memories: [id] }], contexts: [{ context: "company", summary: [{ text: "Head of Sales at Northwind.", memories: [id] }], open_threads: [] }], relationships: [] } });
  const compiled = script(root, "gtm-brain-recall/recall.mjs", ["--entity", "Anna Lee"]);
  assert.match(compiled, /- Anna Lee leads sales at Northwind\. \(as of 2026-09-02, 73 days ago\) \[/); assert.match(compiled, /- Head of Sales at Northwind\. \(as of 2026-09-02, 73 days ago\) \[/);
  // what is stored never carries a relative age, and reading changed no file
  lib.refreshEntityPages(root);
  const page = readFileSync(join(root, lib.readNames(root).find(e => e.name === "Anna Lee")._path), "utf8");
  assert.ok(!/days ago|Last mentioned/.test(page), "the page in brain/entities");
  assert.ok(!/days ago|Last mentioned/.test(lib.entityBrief(root, "Anna Lee").markdown), "entityBrief without now");
  assert.match(lib.entityBrief(root, "Anna Lee", { now }).markdown, /Last mentioned: 2026-09-02 \(73 days ago\)\./);
});

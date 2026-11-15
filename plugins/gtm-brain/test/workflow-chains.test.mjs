// Workflow triggers, round three (0.35.0, lane S2 review): the behaviours of the brief no earlier test held down.
// A chain that passes through notes saved with remember, a milestone raised once a day, a dismissed event, a link
// ended, a field changed, two machines taking one event, and a workflow paused by a person or by SCHEMA.md.
// Run: node --test plugins/gtm-brain/test/workflow-chains.test.mjs
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_SESSION_MAINTENANCE = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
process.env.GTM_BRAIN_NO_COMMIT = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-wfc-home-"));
const lib = await import(`${P}/lib/brain.mjs`);
const wf = await import(`${P}/lib/workflows.mjs`);
const tr = await import(`${P}/lib/workflow-triggers.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_COMMIT: "1" };
function brain() {
  const root = trackBrain(realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-wfc-"))), P);
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  lib.addName(root, "Northwind", { kind: "company" }); lib.addName(root, "Anna Lee");
  return root;
}
const script = `${P}/scripts/gtm-brain-workflow/workflow.mjs`;
const run = (root, ...a) => execFileSync(process.execPath, [script, ".", ...a], { cwd: root, encoding: "utf8", env }).trimEnd();
const refused = (root, ...a) => { try { run(root, ...a); return null; } catch (e) { return String(e.stderr); } };
const note = (root, content, extra = {}) => lib.appendMemory(root, "company", { authors: ["marta-nowak"], via: "codex", kind: "note", content, source: [{ kind: "user", ref: "marta" }], ...extra }).rec;
const DOC = (title, header, steps) => `---\nkind: document\ntype: workflow\ntitle: ${title}\napplies_to: [follow-up]\nstatus: draft\n${header}\nby: ""\nupdated: 2026-11-01\ngtm-brain: 0.35.0\n---\n# ${title}\n\n## Before starting\n\n## Steps\n\n${steps}\n\n## Learn\n\n- Did it work.\n`;
const put = (root, slug, text) => { mkdirSync(join(root, "workflows"), { recursive: true }); writeFileSync(join(root, "workflows", `${slug}.md`), text); };
const activeSince = (root, slug) => { const f = join(root, "workflows", `${slug}.md`); writeFileSync(f, readFileSync(f, "utf8").replace("status: draft", 'status: active\nactive_since: "2026-01-01T00:00:00Z"')); };
const idOf = (root, name) => lib.readNames(root).find(e => e.name === name).id;
const offered = (root, slug) => tr.pendingOffers(root).find(o => o.workflow.slug === slug) || null;
const ORG = 'trigger: note about organization\nreads: ["kind:organization"]';

test("a chain through notes saved with remember stops at depth 3: a run's work about its subject carries the run's depth", () => {
  const root = brain(), nid = idOf(root, "Northwind");
  // two workflows on notes about an organization, each one's work a plain note about the same account: a ping-pong
  for (const slug of ["wa", "wb"]) put(root, slug, DOC(slug, ORG, `1. **Work ${slug}**. Milestone: a note tagged ${slug}-done.`));
  activeSince(root, "wa"); activeSince(root, "wb");
  const first = note(root, "Northwind asked for a call.", { people: ["Northwind"] });
  run(root, "--start", "wa", "--event", `note:${first.id}:${nid}`, "--settled", "{}", "--by", "marta");
  const a = wf.listRuns(root).find(r => r.workflow === "wa");
  assert.equal(a.depth, 1);
  // wa's milestone, saved through remember: about Northwind, no run tag
  const work = note(root, "Call with Northwind booked.", { people: ["Northwind"], tags: ["wa-done"] });
  const ev = offered(root, "wb")?.events.find(e => e.memory === work.id);
  assert.ok(ev, "the other workflow is offered the note");
  assert.equal(ev.depth, 1, "the note is run wa's work: it carries that run's depth, not 0");
  assert.equal(ev.from, "wa");
  run(root, "--start", "wb", "--event", ev.id, "--settled", "{}", "--by", "marta");
  assert.equal(wf.listRuns(root).find(r => r.workflow === "wb").depth, 2);
  run(root, "--due", "--by", "session");   // wa's run finishes on its milestone
  const work2 = note(root, "Northwind call notes written.", { people: ["Northwind"], tags: ["wb-done"] });
  const back = offered(root, "wa")?.events.find(e => e.memory === work2.id);
  assert.ok(back, "wb's work is offered to wa, whose run is over");
  assert.equal(back.depth, 2);
  run(root, "--start", "wa", "--event", back.id, "--settled", "{}", "--by", "marta");
  const a2 = wf.listRuns(root).find(r => r.workflow === "wa" && !r.ended);
  assert.equal(a2.depth, 3);
  run(root, "--due", "--by", "session");   // wb's run finishes
  const work3 = note(root, "Northwind follow-up sent.", { people: ["Northwind"], tags: ["wa-done"] });
  const o = offered(root, "wb");
  assert.ok(!o || !o.events.some(e => e.memory === work3.id), "depth 4 is never offered");
  assert.ok(o && o.tooDeep >= 1, "and the view says one was held back by the chain depth");
});

test("a milestone not reached by its date is raised again, once a day at most", () => {
  const root = brain();
  put(root, "slow", DOC("Slow", 'trigger: manual\nreads: ["kind:organization"]', "1. **Wait for the reply**. Milestone: a note tagged replied."));
  run(root, "--start", "slow", "--context", "company", "--handle", "slow one", "--settled", "{}", "--by", "marta");
  const id = wf.listRuns(root)[0].id, tomorrow = wf.addDays(wf.localDate(), 1), later = wf.addDays(wf.localDate(), 2);
  assert.doesNotMatch(run(root, "--due", "--by", "session"), /raised/, "not past its date yet");
  const once = run(root, "--due", "--today", tomorrow, "--by", "session");
  assert.match(once, new RegExp(`^raised: ${id} step 1 \\(Wait for the reply\\) due since ${wf.localDate()}, waits for a note tagged replied$`, "m"));
  assert.doesNotMatch(run(root, "--due", "--today", tomorrow, "--by", "schedule"), /raised/, "the same day: not again");
  assert.match(run(root, "--due", "--today", later, "--by", "session"), /raised/, "the next day: again");
  assert.deepEqual(wf.runState(root, id).steps.map(s => s.status), ["due"], "raising writes no note");
});

test("a dismissed event is a note, never offered again on any machine; the reason is the person's", () => {
  const root = brain(); put(root, "follow", DOC("Follow", ORG, "1. **Draft**. Milestone: a note tagged drafted.")); activeSince(root, "follow");
  const m = note(root, "Northwind price question.", { people: ["Northwind"] });
  const ev = `note:${m.id}:${idOf(root, "Northwind")}`;
  assert.match(refused(root, "--dismiss", "follow", "--event", ev, "--by", "marta"), /--reason is required/);
  assert.match(run(root, "--dismiss", "follow", "--event", ev, "--reason", "they already have a quote", "--by", "marta"), /will not be offered/);
  assert.equal(offered(root, "follow"), null);
  const rec = lib.readMemories(root, "company").find(x => x.tags.includes(`event-dismissed:${ev}`));
  assert.match(rec.content, /they already have a quote$/);
  assert.match(refused(root, "--start", "follow", "--event", ev, "--settled", "{}", "--by", "marta"), /is not waiting for follow/);
});

test("a link ended and a field changed are events; a link that ends twice is one event", () => {
  const root = brain();
  put(root, "left", DOC("Left", 'trigger: link works_at ended\nreads: ["link:works_at"]', "1. **Find the successor**. Milestone: a note tagged successor-found."));
  put(root, "industry", DOC("Industry", 'trigger: field organization.industry changed\nreads: ["field:organization.industry"]', "1. **Re-score**. Milestone: a note tagged rescored."));
  activeSince(root, "left"); activeSince(root, "industry");
  const rel = (status, day) => ({ relation: { from: "Anna Lee", type: "works_at", to: "Northwind", status, basis: "user", observed_at: `2026-11-${day}T10:00:00Z` } });
  note(root, "Anna Lee works at Northwind.", rel("current", "10"));
  assert.equal(offered(root, "left"), null, "created is not ended");
  note(root, "Anna Lee left Northwind.", rel("ended", "12"));
  note(root, "Anna Lee has left Northwind, confirmed.", rel("ended", "13"));
  assert.equal(offered(root, "left").events.length, 1);
  assert.match(tr.eventLabel(offered(root, "left").events[0]), /^Anna Lee works_at Northwind ended on /);
  const m = note(root, "Northwind is in retail.", { people: ["Northwind"] });
  const e = lib.readNames(root).find(x => x.name === "Northwind"), path = join(root, e._path), { fm, body } = lib.parseFrontmatter(readFileSync(path, "utf8"));
  writeFileSync(path, lib.renderFrontmatter({ ...fm, compiled_fields: JSON.stringify([{ field: "industry", text: "retail", memories: [m.id] }]) }) + body);
  const o = offered(root, "industry");
  assert.equal(o.events.length, 1); assert.match(o.events[0].id, /^field:e_[0-9a-f]+:industry:/);
});

test("two machines take one event: the second run is a duplicate, never moved, and says so", () => {
  const root = brain(); put(root, "follow", DOC("Follow", ORG, "1. **Draft**. Milestone: a note tagged drafted.")); activeSince(root, "follow");
  const m = note(root, "Northwind wants a demo.", { people: ["Northwind"] }), ev = `note:${m.id}:${idOf(root, "Northwind")}`;
  run(root, "--start", "follow", "--event", ev, "--settled", "{}", "--by", "marta");
  const first = wf.listRuns(root)[0];
  // a teammate's machine started the same event before pulling: its run-start note arrives through git
  const tid = `follow-${wf.localDate()}-northwind-teammate`;
  lib.appendMemory(root, "company", { authors: ["marta-nowak"], via: "codex", kind: "note", content: `Started workflow "Follow" as run ${tid}.`, tags: ["workflow:follow", `run:${tid}`, "run-start", `event:${ev}`], at: new Date(Date.now() + 1000).toISOString() });
  lib.appendMemory(root, "company", { authors: ["marta-nowak"], via: "codex", kind: "note", content: "Step 1 of 1, Draft: due now.", tags: ["workflow:follow", `run:${tid}`, "step:1", "step-status:due"], at: new Date(Date.now() + 2000).toISOString() });
  const dup = wf.runState(root, tid);
  assert.equal(dup.duplicateOf, first.id);
  note(root, "Northwind demo drafted.", { people: ["Northwind"], tags: ["drafted"] });
  const out = run(root, "--due", "--by", "session");
  assert.doesNotMatch(out, new RegExp(`milestone: ${tid}`));
  assert.match(run(root, "--view"), new RegExp(`run ${tid} .*a second run of the event ${first.id} took, cancel it`));
});

test("a paused workflow is not offered or started; one SCHEMA.md lost is paused for starting too", () => {
  const root = brain(); put(root, "follow", DOC("Follow", ORG, "1. **Draft**. Milestone: a note tagged drafted.")); activeSince(root, "follow");
  note(root, "Northwind wants a demo.", { people: ["Northwind"] });
  assert.ok(offered(root, "follow"));
  assert.match(run(root, "--pause", "follow", "--by", "marta"), /is paused/);
  assert.equal(offered(root, "follow"), null);
  assert.match(refused(root, "--start", "follow", "--context", "company", "--handle", "x", "--settled", "{}", "--by", "marta"), /is paused/);
  assert.match(run(root, "--resume", "follow", "--by", "marta"), /is active/);
  // a field the header names leaves SCHEMA.md: held, and a start by hand is refused with the reason
  put(root, "gap", DOC("Gap", 'trigger: manual\nreads: ["field:organization.industry"]', "1. **Ask**. Milestone: a note tagged asked."));
  activeSince(root, "gap");
  const schema = join(root, "SCHEMA.md"); writeFileSync(schema, readFileSync(schema, "utf8").replace(/^\| industry \|.*\n/m, ""));
  assert.match(refused(root, "--start", "gap", "--context", "company", "--handle", "y", "--settled", "{}", "--by", "marta"), /held: SCHEMA\.md changed: field:organization\.industry/);
});

test("the background run evaluates schedules and lists offers without starting anything", () => {
  const root = brain();
  put(root, "daily", DOC("Daily", 'trigger: "daily 00:00"\nreads: ["kind:organization"]\ncontext: company', "1. **Review**. Milestone: a note tagged reviewed."));
  activeSince(root, "daily");
  const before = lib.readMemories(root, "company").length;
  assert.match(run(root, "--due", "--by", "schedule"), new RegExp(`^offer: daily, 1 event waiting \\(newest schedule:${wf.localDate()}\\); offered at the next chat start, never started here$`, "m"));
  assert.equal(lib.readMemories(root, "company").length, before);
});

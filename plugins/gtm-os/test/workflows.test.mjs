process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_SESSION_MAINTENANCE = "1";
process.env.GTM_OS_NO_COMPILE = "1";
process.env.GTM_OS_NO_COMMIT = "1";
// Workflows (0.28.0): a workflow document in workflows/, a run as dated memories, pings from the hook and the schedule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-wf-home-"));
const lib = await import(`${P}/lib/brain.mjs`);
const docs = await import(`${P}/lib/documents.mjs`);
const wf = await import(`${P}/lib/workflows.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1", GTM_OS_NO_VERSION_CHECK: "1", GTM_OS_NO_COMMIT: "1" };
function brain() {
  const root = trackBrain(realpathSync(mkdtempSync(join(tmpdir(), "gtm-os-wf-brain-"))), P);
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  mkdirSync(join(root, "workflows"), { recursive: true });   // setup writes it from Task 7 on; harmless after
  return root;
}
const template = name => readFileSync(`${P}/templates/workflows/${name}.md`, "utf8").replace(/{{DATE}}/g, "2026-09-28").replace(/{{VERSION}}/g, "0.28.0");
const bare = () => { const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-os-wf-bare-"))); mkdirSync(join(root, "brain")); writeFileSync(join(root, "brain", "admin.md"), "company: Demo\n"); mkdirSync(join(root, "workflows")); return root; };

test("parseGate reads the three gate forms and flags anything else", () => {
  assert.deepEqual(wf.parseGate("after 14 days."), { kind: "after", days: 14 });
  assert.deepEqual(wf.parseGate("after 1 day"), { kind: "after", days: 1 });
  assert.deepEqual(wf.parseGate("on 2026-10-03"), { kind: "on", date: "2026-10-03" });
  assert.deepEqual(wf.parseGate("when the engaged accounts are known."), { kind: "when", condition: "the engaged accounts are known" });
  assert.equal(wf.parseGate(""), null);
  assert.deepEqual(wf.parseGate("after two weeks"), { kind: "invalid", text: "after two weeks" });
});

test("the two shipped workflows parse: settle list, numbered steps with tool and gate, learn list", () => {
  const root = bare();
  for (const name of ["outbound", "ads-then-outbound"]) writeFileSync(join(root, "workflows", `${name}.md`), template(name));
  const all = wf.listWorkflows(root);
  assert.deepEqual(all.map(w => w.slug).sort(), ["ads-then-outbound", "outbound"]);
  const ads = wf.readWorkflow(root, "ads-then-outbound");
  assert.equal(ads.ok, true); assert.equal(ads.title, "Ads, then outbound"); assert.equal(ads.path, "workflows/ads-then-outbound.md");
  assert.deepEqual(ads.settle.map(s => s.label), ["Target accounts", "Why now", "Budget", "Ad platform", "Sequencer"]);
  assert.equal(ads.settle[2].text, "for the ads, in the currency the company uses.");
  assert.equal(ads.steps.length, 4);
  assert.deepEqual(ads.steps.map(s => s.n), [1, 2, 3, 4]);
  assert.equal(ads.steps[1].title, "Launch the ads"); assert.equal(ads.steps[1].tool, "ads");
  assert.deepEqual(ads.steps[1].gate, { kind: "after", days: 14 });
  assert.match(ads.steps[1].text, /^Brief, creatives, audience from the list\.$/);
  assert.deepEqual(ads.steps[2].gate, { kind: "when", condition: "the engaged accounts are known" });
  assert.equal(ads.steps[0].gate, null); assert.equal(ads.steps[3].gate, null);
  assert.equal(ads.learn.length, 2);
  assert.equal(wf.readWorkflow(root, "outbound").steps[2].gate.days, 10);
  assert.equal(wf.readWorkflow(root, "nope"), null);
});

test("a workflow out of shape is reported with the missing heading or the bad step, never repaired", () => {
  const root = bare();
  writeFileSync(join(root, "workflows", "broken.md"), template("outbound").replace("## Steps", "## Stages").replace("- **Owner**", "- Owner"));
  const w = wf.readWorkflow(root, "broken");
  assert.equal(w.ok, false);
  assert.deepEqual(w.problems, ['missing heading "## Steps"']);
  writeFileSync(join(root, "workflows", "gate.md"), template("outbound").replace("Gate: after 10 days.", "Gate: after two weeks."));
  const g = wf.readWorkflow(root, "gate");
  assert.equal(g.ok, false);
  assert.deepEqual(g.problems, ['step 3 gate "after two weeks" is not "after N days", "on YYYY-MM-DD" or "when ..."']);
  writeFileSync(join(root, "workflows", "title.md"), template("outbound").replace("1. **Build the target list**", "1. Build the target list"));
  assert.deepEqual(wf.readWorkflow(root, "title").problems, ["step 1 has no bold title"]);
  // a plain document in the same folder is not a workflow
  docs.writeDocument(root, { path: "workflows/notes.md", title: "Notes", applies_to: "planning", status: "draft", body: "Just notes." });
  assert.equal(wf.listWorkflows(root).some(w => w.slug === "notes"), false);
  assert.equal(readFileSync(join(root, "workflows", "broken.md"), "utf8").includes("## Stages"), true, "never rewritten");
});

test("dates: localDate is YYYY-MM-DD and addDays crosses months", () => {
  assert.match(wf.localDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(wf.addDays("2026-09-28", 14), "2026-10-12");
  assert.equal(wf.addDays("2026-12-31", 1), "2027-01-01");
});

// Memories written straight through the lib: what the script writes in Task 3, in miniature.
const mem = (root, ctx, fields) => lib.appendMemory(root, ctx, { authors: ["marta-nowak"], via: "codex", kind: "note", ...fields }).rec;
const base = id => [`workflow:ads-then-outbound`, `run:${id}`];

test("runId and runTags: the id carries slug, date and a handle-shaped name; tags are read back by prefix", () => {
  assert.equal(wf.runId("ads-then-outbound", "2026-09-28", "Acme Corp"), "ads-then-outbound-2026-09-28-acme-corp");
  assert.deepEqual(wf.runTags({ tags: ["workflow:x", "run:x-2026-09-28-a", "step:2", "step-status:pending", "due:2026-10-12", "project:web"] }), { workflow: "x", run: "x-2026-09-28-a", step: 2, status: "pending", due: "2026-10-12" });
  assert.deepEqual(wf.runTags({ tags: ["project:web"] }), { workflow: null, run: null, step: null, status: null, due: null });
});

test("listRuns: the latest effective step memory is the step's state; a retracted gate question is no longer open; an ended run has no current step", () => {
  const root = brain(); const id = "ads-then-outbound-2026-09-28-acme";
  mem(root, "offer", { content: "Started workflow \"Ads, then outbound\" as run " + id + ".", tags: [...base(id), "run-start"] });
  const s1 = mem(root, "offer", { content: "Step 1 of 4, Build the target list: due.", tags: [...base(id), "step:1", "step-status:due"] });
  assert.deepEqual(wf.listRuns(root).map(r => r.id), [id]);
  let r = wf.runState(root, id);
  assert.equal(r.context, "offer"); assert.equal(r.workflow, "ads-then-outbound"); assert.equal(r.by, "marta-nowak");
  assert.deepEqual(r.steps.map(s => [s.n, s.status]), [[1, "due"]]); assert.equal(r.current.n, 1); assert.equal(r.open, null);
  mem(root, "offer", { content: "Step 1 of 4, Build the target list: done.", tags: [...base(id), "step:1", "step-status:done"], supersedes: s1.id });
  const s2 = mem(root, "offer", { content: "Step 2 of 4, Launch the ads: pending, due 2026-10-12.", tags: [...base(id), "step:2", "step-status:pending", "due:2026-10-12"] });
  r = wf.runState(root, id);
  assert.deepEqual(r.steps.map(s => [s.n, s.status, s.due]), [[1, "done", null], [2, "pending", "2026-10-12"]]);
  assert.equal(r.current.n, 2); assert.equal(r.current.memory, s2.id);
  const q = mem(root, "offer", { kind: "question", content: "Run " + id + ", step 2: is it time?", tags: [...base(id), "step:2", "gate", "brain-question"] });
  assert.deepEqual(wf.runState(root, id).open, { step: 2, memory: q.id, content: q.content });
  mem(root, "offer", { content: "Yes, the ads ran.", tags: [...base(id)], retracts: q.id });
  assert.equal(wf.runState(root, id).open, null);
  mem(root, "offer", { kind: "decision", content: "Run " + id + " abandoned: budget cut.", tags: [...base(id), "run-abandoned"] });
  r = wf.runState(root, id);
  assert.equal(r.ended.how, "abandoned"); assert.equal(r.current, null);
  assert.equal(wf.runState(root, "nope"), null);
});

test("dueSteps picks pending steps whose date passed; stepDue derives the next step's state from its gate", () => {
  const root = brain(); const id = "ads-then-outbound-2026-09-01-acme";
  mem(root, "offer", { content: "start", tags: [...base(id), "run-start"] });
  mem(root, "offer", { content: "Step 2 pending.", tags: [...base(id), "step:2", "step-status:pending", "due:2026-09-15"] });
  assert.deepEqual(wf.dueSteps(root, "2026-09-14").map(d => [d.run.id, d.step.n]), []);
  assert.deepEqual(wf.dueSteps(root, "2026-09-15").map(d => [d.run.id, d.step.n]), [[id, 2]]);
  assert.deepEqual(wf.stepDue({ gate: null }, "2026-09-28"), { status: "due", due: "2026-09-28" });
  assert.deepEqual(wf.stepDue({ gate: { kind: "after", days: 14 } }, "2026-09-28"), { status: "pending", due: "2026-10-12" });
  assert.deepEqual(wf.stepDue({ gate: { kind: "on", date: "2026-10-03" } }, "2026-09-28"), { status: "pending", due: "2026-10-03" });
  assert.deepEqual(wf.stepDue({ gate: { kind: "on", date: "2026-09-20" } }, "2026-09-28"), { status: "due", due: "2026-09-20" });
  assert.deepEqual(wf.stepDue({ gate: { kind: "when", condition: "the engaged accounts are known" } }, "2026-09-28"), { status: "due", due: "2026-09-28", ask: "the engaged accounts are known" });
});

test("runsLine: empty with no run; names the run, its step and the due date; counts due steps", () => {
  const root = brain();
  assert.equal(wf.runsLine(root), "");
  for (const name of ["outbound", "ads-then-outbound"]) writeFileSync(join(root, "workflows", `${name}.md`), template(name));
  const id = "ads-then-outbound-2026-09-01-acme";
  mem(root, "offer", { content: "start", tags: [...base(id), "run-start"] });
  mem(root, "offer", { content: "Step 2 pending.", tags: [...base(id), "step:2", "step-status:pending", "due:2026-10-12"] });
  const line = wf.runsLine(root, "2026-09-28");
  assert.match(line, /^workflows: 1 run in progress: ads-then-outbound-2026-09-01-acme in Our offer, step 2 of 4 \(Launch the ads\), due 2026-10-12\./);
  assert.match(line, /Say nothing about them unless asked/);
  assert.match(wf.runsLine(root, "2026-10-12"), /1 step due: mention it once/);
});

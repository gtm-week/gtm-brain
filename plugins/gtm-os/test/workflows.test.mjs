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

const script = `${P}/scripts/gtm-os-workflow/workflow.mjs`;
const workflow = (root, ...args) => execFileSync(process.execPath, [script, ".", ...args], { cwd: root, encoding: "utf8", env }).trimEnd();
const refusedBy = (root, ...args) => { try { workflow(root, ...args); return null; } catch (e) { return { code: e.status, text: String(e.stderr) }; } };
const SETTLED = JSON.stringify({ "Target accounts": "the 40 logistics accounts from the ICP", "Why now": "Q4 budget season", Budget: "EUR 2000", "Ad platform": "LinkedIn, Marta", Sequencer: "lemlist" });
const ready = () => { const root = brain(); for (const name of ["outbound", "ads-then-outbound"]) writeFileSync(join(root, "workflows", `${name}.md`), template(name)); return root; };

test("workflow --list names the shipped workflows with their steps and the runs in progress; --json is the parsed shape", () => {
  const root = ready();
  const out = workflow(root, "--list");
  assert.match(out, /^workflows:\n- ads-then-outbound: Ads, then outbound \[draft\], 4 steps \(workflows\/ads-then-outbound\.md\)\n- outbound: Outbound \[draft\], 4 steps \(workflows\/outbound\.md\)\nruns in progress: none\./);
  writeFileSync(join(root, "workflows", "broken.md"), template("outbound").replace("## Learn", "## Learned"));
  assert.match(workflow(root, "--list"), /- broken: does not parse: missing heading "## Learn"/);
  const json = JSON.parse(workflow(root, "--list", "--json"));
  assert.deepEqual(Object.keys(json), ["workflows", "runs"]); assert.equal(json.workflows.length, 3);
});

test("workflow --start refuses an unsettled item, an unknown workflow or context; then writes the brief and step 1", () => {
  const root = ready();
  assert.match(refusedBy(root, "--start", "nope", "--context", "offer", "--handle", "acme", "--settled", SETTLED, "--by", "marta").text, /no workflow "nope"; workflows: ads-then-outbound, outbound/);
  assert.match(refusedBy(root, "--start", "ads-then-outbound", "--context", "nowhere", "--handle", "acme", "--settled", SETTLED, "--by", "marta").text, /no such context: nowhere/);
  const partial = refusedBy(root, "--start", "ads-then-outbound", "--context", "offer", "--handle", "acme", "--settled", JSON.stringify({ Budget: "EUR 2000" }), "--by", "marta");
  assert.equal(partial.code, 2); assert.match(partial.text, /not settled: Target accounts, Why now, Ad platform, Sequencer\. Ask through question, then start\./);
  assert.match(refusedBy(root, "--start", "ads-then-outbound", "--context", "offer", "--handle", "acme", "--settled", SETTLED, "--by", "nobody").text, /"nobody" is not in admin\.md team/);
  const today = wf.localDate(), id = `ads-then-outbound-${today}-acme`;
  const out = workflow(root, "--start", "ads-then-outbound", "--context", "offer", "--handle", "Acme", "--settled", SETTLED, "--by", "marta");
  assert.match(out, new RegExp(`^started ${id} in Our offer: step 1 of 4, Build the target list, due now \\(`));
  const all = lib.readMemories(root, "offer").filter(m => m.tags.includes(`run:${id}`));
  assert.equal(all.length, 2);
  assert.deepEqual(all[0].tags, ["workflow:ads-then-outbound", `run:${id}`, "run-start"]);
  assert.match(all[0].content, /^Started workflow "Ads, then outbound" as run ads-then-outbound-\d{4}-\d{2}-\d{2}-acme on \d{4}-\d{2}-\d{2}\.\n- Target accounts: the 40 logistics accounts from the ICP\n- Why now: Q4 budget season\n- Budget: EUR 2000\n- Ad platform: LinkedIn, Marta\n- Sequencer: lemlist$/);
  assert.deepEqual(all[0].authors, ["marta-nowak"]); assert.equal(all[0].kind, "note");
  assert.deepEqual(all[1].tags, ["workflow:ads-then-outbound", `run:${id}`, "step:1", "step-status:due", `due:${today}`]);
  assert.match(all[1].content, /^Step 1 of 4, Build the target list: due now\. Starts now\. Pull the accounts that match the ICP/);
  assert.match(refusedBy(root, "--start", "ads-then-outbound", "--context", "offer", "--handle", "Acme", "--settled", SETTLED, "--by", "marta").text, new RegExp(`run ${id} already exists`));
  assert.match(workflow(root, "--list"), new RegExp(`runs in progress:\\n- ${id} in Our offer: step 1 of 4, Build the target list, due now`));
});

test("workflow --status shows every step with its state, the open gate question and the brief", () => {
  const root = ready(); const today = wf.localDate(), id = `outbound-${today}-q4`;
  workflow(root, "--start", "outbound", "--context", "offer", "--handle", "Q4", "--settled", JSON.stringify({ "Target accounts": "list A", "Why now": "budget season", Owner: "Marta", Sequencer: "lemlist" }), "--by", "marta");
  const out = workflow(root, "--status", id);
  assert.match(out, new RegExp(`^run ${id}: Outbound in Our offer, started ${today} by marta-nowak, in progress\\n`));
  assert.match(out, /\n1\. Build the target list: due now\n2\. Write the sequence: not started\n3\. Launch: not started \(gate: after 10 days\)\n4\. Read replies and book: not started\n/);
  assert.match(out, /\nbrief:\n- Target accounts: list A\n/);
  assert.match(out, /\nnext: do step 1 in this chat through the connected tools, then workflow advance with step 1\.$/);
  assert.match(refusedBy(root, "--status", "nope").text, /no run "nope"/);
  assert.equal(JSON.parse(workflow(root, "--status", id, "--json")).current.n, 1);
});

const started = (handle = "Acme") => { const root = ready(); const today = wf.localDate(), id = `ads-then-outbound-${today}-${lib.handleFor(handle)}`; workflow(root, "--start", "ads-then-outbound", "--context", "offer", "--handle", handle, "--settled", SETTLED, "--by", "marta"); return { root, id, today }; };
const runMemories = (root, id) => lib.readMemories(root, "offer").filter(m => m.tags.includes(`run:${id}`));

test("workflow --advance records the step done with its actions, supersedes the old state and opens the next step with its due date", () => {
  const { root, id, today } = started();
  assert.match(refusedBy(root, "--advance", id, "--step", "2", "--by", "marta").text, /step 2 is not started; the current step is 1/);
  const out = workflow(root, "--advance", id, "--step", "1", "--note", "40 accounts pulled from HubSpot.", "--actions", "hubspot:search:list-40", "--by", "marta");
  assert.match(out, new RegExp(`^step 1 done; step 2 of 4, Launch the ads, waiting, due ${wf.addDays(today, 14)} \\(`));
  const all = runMemories(root, id);
  assert.equal(all.length, 4, "start, step 1 due, step 1 done, step 2 pending: the JSONL only grows");
  const done = all[2]; assert.equal(done.supersedes, all[1].id); assert.deepEqual(done.tags.slice(2), ["step:1", "step-status:done"]);
  assert.match(done.content, /^Step 1 of 4, Build the target list: done\. Done on \d{4}-\d{2}-\d{2}\. 40 accounts pulled from HubSpot\.$/);
  assert.deepEqual(done.actions, [{ tool: "hubspot", action: "search", ref: "list-40" }]);
  assert.deepEqual(all[3].tags.slice(2), ["step:2", "step-status:pending", `due:${wf.addDays(today, 14)}`]);
  const r = wf.runState(root, id); assert.deepEqual(r.steps.map(s => s.status), ["done", "pending"]); assert.equal(r.current.n, 2);
  assert.match(refusedBy(root, "--advance", id, "--step", "1", "--by", "marta").text, /step 1 is done; the current step is 2/);
  assert.match(refusedBy(root, "--advance", id, "--step", "2", "--by", "marta").text, new RegExp(`step 2 is waiting until ${wf.addDays(today, 14)}; workflow due marks it, or skip it`));
  assert.match(workflow(root, "--status", id), /\n1\. Build the target list: done\n2\. Launch the ads: waiting, due /);
});

test("workflow --due marks a pending step whose date passed exactly once and asks its gate question; a when gate asks at advance time", () => {
  const { root, id, today } = started();
  workflow(root, "--advance", id, "--step", "1", "--by", "marta");
  assert.equal(workflow(root, "--due", "--today", wf.addDays(today, 13), "--by", "session").trim(), "no step due");
  const due = wf.addDays(today, 14);
  const first = workflow(root, "--due", "--today", due, "--by", "schedule");
  assert.match(first, new RegExp(`^due: ${id} step 2 \\(Launch the ads\\), asked: the gate date ${due} has passed; is it time for this step`));
  assert.equal(workflow(root, "--due", "--today", due, "--by", "session").trim(), "no step due", "idempotent across the session and the schedule");
  const all = runMemories(root, id);
  const dueStep = all.find(m => m.tags.includes("step-status:due") && m.tags.includes("step:2")), q = all.find(m => m.kind === "question");
  assert.deepEqual(dueStep.authors, ["schedule"]); assert.equal(dueStep.via, "schedule"); assert.equal(dueStep.supersedes, all[3].id);
  assert.deepEqual(q.tags, ["workflow:ads-then-outbound", `run:${id}`, "step:2", "gate", "brain-question"]);
  assert.equal(all.filter(m => m.kind === "question").length, 1);
  assert.equal(wf.runState(root, id).open.memory, q.id);
  // advancing the due step answers the gate: the question is retracted by the done record, and step 3's when gate asks at once
  const out = workflow(root, "--advance", id, "--step", "2", "--answer", "two weeks of ads ran", "--by", "marta");
  assert.match(out, /^step 2 done; step 3 of 4, Read engagement, due now; asked: the engaged accounts are known/);
  const after = runMemories(root, id);
  const done2 = after.find(m => m.tags.includes("step:2") && m.tags.includes("step-status:done"));
  assert.equal(done2.retracts, q.id); assert.match(done2.content, /Gate answer: two weeks of ads ran/);
  const r = wf.runState(root, id);
  assert.equal(r.current.n, 3); assert.equal(r.current.status, "due"); assert.equal(r.open.step, 3);
  assert.match(r.open.content, /^Run .*, step 3 \(Read engagement\): the engaged accounts are known\? Answer this to move the run on\.$/);
});

test("workflow --advance on the last step ends the run with the learn items; --skip and --abandon say why", () => {
  const { root, id } = started();
  workflow(root, "--advance", id, "--step", "1", "--by", "marta");
  assert.match(refusedBy(root, "--skip", id, "--step", "2", "--by", "marta").text, /--reason is required/);
  const skipped = workflow(root, "--skip", id, "--step", "2", "--reason", "no ad budget this quarter", "--by", "marta");
  assert.match(skipped, /^step 2 skipped \(no ad budget this quarter\); step 3 of 4, Read engagement, due now; asked: the engaged accounts are known/);
  workflow(root, "--advance", id, "--step", "3", "--answer", "12 accounts engaged", "--by", "marta");
  const end = workflow(root, "--advance", id, "--step", "4", "--learned", JSON.stringify({ "Reply and meeting rate of the outreach, against the last outbound run.": "3 replies, 1 meeting, better than August" }), "--by", "marta");
  assert.match(end, new RegExp(`^step 4 done; run ${id} finished\\. Read back: `));
  const r = wf.runState(root, id);
  assert.equal(r.ended.how, "done"); assert.equal(r.current, null);
  const decision = runMemories(root, id).find(m => m.kind === "decision");
  assert.match(decision.content, /^Run .* finished on \d{4}-\d{2}-\d{2}\. Learn:\n- Reply and meeting rate of the outreach, against the last outbound run\.: 3 replies, 1 meeting, better than August\n- Which accounts engaged with the ads but not with the outreach\.: not read back yet$/);
  assert.ok(decision.tags.includes("run-done"));
  assert.match(refusedBy(root, "--advance", id, "--step", "4", "--by", "marta").text, /ended \(done\)/);
  const other = started("Beta");
  const ab = workflow(other.root, "--abandon", other.id, "--reason", "campaign cancelled", "--by", "marta");
  assert.match(ab, new RegExp(`^run ${other.id} abandoned: campaign cancelled`));
  assert.equal(wf.runState(other.root, other.id).ended.how, "abandoned");
  assert.equal(workflow(other.root, "--list").includes(other.id), false, "an ended run is not in progress");
});

test("workflow --advance refuses when the run's context is archived and when the workflow lost the step", () => {
  const { root, id } = started();
  writeFileSync(join(root, "workflows", "ads-then-outbound.md"), template("ads-then-outbound").replace(/4\. \*\*Outreach to the engaged accounts\*\*[\s\S]*?\n\n## Learn/, "\n## Learn"));
  assert.match(workflow(root, "--status", id), /\n1\. Build the target list: due now\n2\. Launch the ads: not started/);
  workflow(root, "--advance", id, "--step", "1", "--by", "marta");
  assert.match(workflow(root, "--status", id), /step 2 of 3|2\. Launch the ads: waiting/);
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-contexts/contexts.mjs`, ".", "--archive", "offer"], { cwd: root, env, stdio: "ignore" });
  assert.equal(lib.readContext(root, "offer").status, "archived");
  assert.match(refusedBy(root, "--skip", id, "--step", "2", "--reason", "x", "--by", "marta").text, /context offer is archived; bring it back before advancing/);
});

const hook = root => execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: root, encoding: "utf8", env, input: JSON.stringify({ session_id: "thread-wf", cwd: root }) });

test("the session hook prints the runs line only when a run is in progress, and stays quiet on a workflow file that does not parse", () => {
  const root = ready();
  assert.doesNotMatch(hook(root), /^workflows:/m);
  workflow(root, "--start", "outbound", "--context", "offer", "--handle", "Q4", "--settled", JSON.stringify({ "Target accounts": "list A", "Why now": "budget", Owner: "Marta", Sequencer: "lemlist" }), "--by", "marta");
  const out = hook(root);
  assert.match(out, /^workflows: 1 run in progress: outbound-\d{4}-\d{2}-\d{2}-q4 in Our offer, step 1 of 4 \(Build the target list\), due now\. 1 step due: mention it once/m);
  writeFileSync(join(root, "workflows", "outbound.md"), template("outbound").replace("## Steps", "## Stages"));
  const broken = hook(root);
  assert.match(broken, /^workflows: 1 run in progress: outbound-.* in Our offer, step 1 of 1/m, "the line still prints, from the run's own memories");
  assert.doesNotMatch(broken, /at .*workflows\.mjs|TypeError|Error:/, "no stack trace in the opening lines");
});

test("session maintenance and the scheduled run mark due steps: one gate question, by session or schedule", () => {
  const { root, id, today } = started();
  workflow(root, "--advance", id, "--step", "1", "--by", "marta");
  // a fake codex on PATH: the scheduled run calls codex exec for the stale contexts, maintenance's tool check may call it; neither needs a model here
  const bin = mkdtempSync(join(tmpdir(), "gtm-os-wf-fakecodex-")); writeFileSync(join(bin, "codex"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const fake = { ...env, PATH: `${bin}:${process.env.PATH}` };
  const before = runMemories(root, id).length;
  execFileSync(process.execPath, [`${P}/hooks/session-maintenance.mjs`, root, "--run"], { cwd: root, env: fake, stdio: "ignore", timeout: 60000 });
  assert.equal(runMemories(root, id).length, before, "nothing due yet: session maintenance writes nothing");
  assert.match(readFileSync(join(root, "work", "session-maintenance.json"), "utf8"), /"status":"(done|partial)"/);
  assert.doesNotMatch(readFileSync(join(root, "work", "session-maintenance.json"), "utf8"), /"workflows"/, "the due check did not fail");
  workflow(root, "--due", "--today", wf.addDays(today, 14), "--by", "session");
  const marked = runMemories(root, id);
  assert.equal(marked.filter(m => m.kind === "question").length, 1);
  assert.deepEqual(marked.find(m => m.kind === "question").authors, ["session"]);
  execFileSync("bash", [`${P}/scripts/gtm-os-schedule/scheduled-run.sh`, "."], { cwd: root, env: fake, stdio: "ignore", timeout: 60000 });
  assert.equal(runMemories(root, id).filter(m => m.kind === "question").length, 1, "the schedule found the step already due");
  assert.match(readFileSync(join(root, "work", "hooks.log"), "utf8"), /scheduled-run  workflows: no step due/);
});

test("setup writes workflows/ with the two shipped drafts, committed, dated and versioned", () => {
  const root = brain();
  const version = JSON.parse(readFileSync(`${P}/.codex-plugin/plugin.json`, "utf8")).version;
  for (const name of ["outbound", "ads-then-outbound"]) {
    const text = readFileSync(join(root, "workflows", `${name}.md`), "utf8");
    assert.match(text, /^type: workflow$/m); assert.match(text, new RegExp(`^gtm-os: ${version.replace(/\./g, "\\.")}$`, "m")); assert.match(text, /^updated: \d{4}-\d{2}-\d{2}$/m);
    assert.doesNotMatch(text, /{{/);
  }
  assert.equal(wf.listWorkflows(root).every(w => w.ok), true);
  assert.match(execFileSync("git", ["-C", root, "log", "--format=%s", "--", "workflows"], { encoding: "utf8" }), /setup/);
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /workflows\//);
  // setup only runs in an empty folder (it refuses "this folder is not empty"), so a person's own workflows/ can never meet it
});

test("upgrade adds workflows/ once to a brain without it and never adds a shipped file back into a folder that exists", () => {
  const root = brain();
  rmSync(join(root, "workflows"), { recursive: true });
  const upgrade = () => execFileSync("bash", [`${P}/scripts/gtm-os-upgrade/upgrade.sh`, root], { cwd: root, encoding: "utf8", env });
  assert.match(upgrade(), /added workflows\/ with the two shipped workflows/);
  assert.ok(existsSync(join(root, "workflows", "outbound.md"))); assert.ok(existsSync(join(root, "workflows", "ads-then-outbound.md")));
  rmSync(join(root, "workflows", "outbound.md"));
  const again = upgrade();
  assert.doesNotMatch(again, /added workflows/);
  assert.equal(existsSync(join(root, "workflows", "outbound.md")), false, "a deleted shipped workflow stays deleted");
});

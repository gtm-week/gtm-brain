// These tests read and write the root files of a layout 2 brain: setup and the lib play a plugin that writes layout 2 at most
// (lib/layout-version.mjs GTM_BRAIN_TEST_LAYOUT). Layout 3 (about-us/, config/) is covered by config-folders.test.mjs.
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
// Workflow triggers, milestones and limits (0.35.0, lane S2): a checked header, steps that name a skill and end on a
// milestone the brain can see, skills that declare what they need, events read from the records and offered at the
// chat start (never run silently), runs whose only state is the chain of notes, and the limits in one place.
// Run: node --test plugins/gtm-brain/test/workflow-triggers.test.mjs
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_SESSION_MAINTENANCE = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
process.env.GTM_BRAIN_NO_COMMIT = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-wft-home-"));
const lib = await import(`${P}/lib/brain.mjs`);
const wf = await import(`${P}/lib/workflows.mjs`);
const tr = await import(`${P}/lib/workflow-triggers.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_COMMIT: "1" };
function brain() {
  const root = trackBrain(realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-wft-"))), P);
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  lib.addName(root, "Northwind", { kind: "company" }); lib.addName(root, "Anna Lee");
  return root;
}
const script = `${P}/scripts/gtm-brain-workflow/workflow.mjs`;
const run = (root, ...a) => execFileSync(process.execPath, [script, ".", ...a], { cwd: root, encoding: "utf8", env }).trimEnd();
const refused = (root, ...a) => { try { run(root, ...a); return null; } catch (e) { return String(e.stderr); } };
const note = (root, content, extra = {}) => lib.appendMemory(root, "company", { authors: ["marta-nowak"], via: "codex", kind: "note", content, source: [{ kind: "user", ref: "marta" }], ...extra }).rec;
const FOLLOW = (header, steps) => `---\nkind: document\ntype: workflow\ntitle: Account follow-up\napplies_to: [follow-up]\nstatus: draft\n${header}\nby: ""\nupdated: 2026-11-01\ngtm-brain: 0.35.0\n---\n# Account follow-up\n\n## Before starting\n\n## Steps\n\n${steps}\n\n## Learn\n\n- Did the account reply.\n`;
const GOOD_STEPS = "1. **Draft the follow-up** (tool: email) (skill: gtmb-deepdive). Read the account, then write it. Milestone: a note tagged follow-up-drafted.\n2. **Read the reply** (tool: email). Milestone: a note tagged reply-read. Gate: after 3 days.";
const GOOD_HEADER = 'trigger: note about organization\nreads: ["kind:organization", "tool:email"]\nwrites: ["tool:email"]';
const put = (root, slug, text) => { mkdirSync(join(root, "workflows"), { recursive: true }); writeFileSync(join(root, "workflows", `${slug}.md`), text); };

test("parsers: triggers, milestones, header items and steps with a skill and a milestone", () => {
  assert.deepEqual(wf.parseTrigger(""), { kind: "manual" });
  assert.deepEqual(wf.parseTrigger("every Monday 09:00"), { kind: "schedule", every: "monday", at: "09:00" });
  assert.deepEqual(wf.parseTrigger("daily"), { kind: "schedule", every: "day", at: "09:00" });
  assert.deepEqual(wf.parseTrigger("note about organization"), { kind: "note", about: "organization" });
  assert.deepEqual(wf.parseTrigger("link works_at ended"), { kind: "link", type: "works_at", change: "ended" });
  assert.deepEqual(wf.parseTrigger("field person.role changed"), { kind: "field", entityKind: "person", field: "role", change: "changed" });
  assert.deepEqual(wf.parseTrigger("field organization.industry missing for 30 days"), { kind: "field", entityKind: "organization", field: "industry", change: "missing", days: 30 });
  assert.equal(wf.parseTrigger("whenever").kind, "invalid");
  assert.equal(wf.parseTrigger("daily 25:00").kind, "invalid");
  assert.deepEqual(wf.parseMilestone("a note tagged reply-read."), { kind: "tag", tag: "reply-read" });
  assert.deepEqual(wf.parseMilestone("a link works_at created"), { kind: "link", type: "works_at" });
  assert.deepEqual(wf.parseMilestone("field organization.industry filled"), { kind: "field", entityKind: "organization", field: "industry" });
  assert.deepEqual(wf.parseMilestone("the document voice written"), { kind: "document", ref: "voice" });
  assert.equal(wf.parseMilestone("the customer is happy").kind, "invalid");
  assert.deepEqual(wf.parseGate("when a note tagged engaged-accounts"), { kind: "when", condition: "a note tagged engaged-accounts", milestone: { kind: "tag", tag: "engaged-accounts" } });
  assert.deepEqual(wf.parseItem("field:person.role"), { type: "field", kind: "person", field: "role" });
  assert.equal(wf.parseItem("people").type, "invalid");
  const root = brain(); put(root, "account-follow-up", FOLLOW(GOOD_HEADER, GOOD_STEPS));
  const w = wf.readWorkflow(root, "account-follow-up");
  assert.equal(w.ok, true, JSON.stringify(w.problems)); assert.equal(w.header.declared, true); assert.deepEqual(w.settle, [], "a header lets Before starting be empty");
  assert.deepEqual([w.steps[0].tool, w.steps[0].skill, w.steps[0].text, w.steps[0].milestone], ["email", "gtmb-deepdive", "Read the account, then write it.", { kind: "tag", tag: "follow-up-drafted" }]);
  assert.deepEqual(w.steps[1].gate, { kind: "after", days: 3 }, "the gate after the milestone still parses, and a 0.34 reader takes the last Gate: too");
});

test("the shipped drafts carry a header, stay drafts, and every step has a milestone", () => {
  for (const name of ["outbound", "ads-then-outbound", "topic-analysis", "audience-discovery"]) {
    const text = readFileSync(`${P}/templates/workflows/${name}.md`, "utf8");
    assert.match(text, /^status: draft$/m); assert.match(text, /^trigger: manual$/m); assert.match(text, /^reads: /m); assert.doesNotMatch(text, /^owner:/m, "no owner field on a workflow");
    const steps = text.split("## Steps")[1].split("## Learn")[0];
    for (const step of steps.split(/\n(?=\d\. )/).filter(s => /^\d\. /.test(s.trim()))) {
      assert.match(step, /Milestone: a note tagged [a-z-]+\./, `${name}: ${step.slice(0, 40)}`);
      if (/Gate:/.test(step)) assert.ok(step.indexOf("Milestone:") < step.indexOf("Gate:"), "the milestone comes before the gate");
    }
  }
});

test("skills declare their needs in metadata; needs compares them with SCHEMA.md and admin.md and changes nothing", () => {
  assert.deepEqual(tr.skillNeeds('---\nname: x\nmetadata:\n  needs: "kind:organization, field:organization.budget_owner, tool:crm"\n---\n').map(wf.itemText), ["kind:organization", "field:organization.budget_owner", "tool:crm"]);
  const declared = readdirSync(`${P}/skills`).filter(id => tr.findSkill("/nonexistent", id)?.needs.length);
  assert.ok(declared.length >= 4, `shipped skills with a needs line: ${declared.join(", ")}`);
  for (const id of declared) for (const i of tr.findSkill("/nonexistent", id).needs) assert.notEqual(i.type, "invalid", `${id}: ${i.text}`);
  const root = brain(), schema = readFileSync(join(root, "SCHEMA.md"), "utf8");
  const proposal = tr.needsProposal("skill x", tr.compareNeeds(root, ["kind:organization", "field:organization.budget_owner", "link:sponsors", "tool:crm", "kind:deal"].map(wf.parseItem)));
  assert.match(proposal, /^skill x needs 4 things this brain does not have yet:/);
  assert.match(proposal, /field:organization\.budget_owner: SCHEMA\.md has no field budget_owner under organization/);
  assert.match(proposal, /link:sponsors: SCHEMA\.md has no relationship sponsors/);
  assert.match(proposal, /kind:deal: SCHEMA\.md has no kind deal/);
  assert.match(proposal, /tool:crm: no crm tool in admin\.md/);
  assert.match(proposal, /only through \/gtmb-schema with the person's yes; nothing was changed/);
  assert.equal(readFileSync(join(root, "SCHEMA.md"), "utf8"), schema, "the schema is never changed by a needs check");
  assert.match(run(root, "--needs", "gtmb-icp"), /skill gtmb-icp/);
});

test("the check: header, schema items, named skills, milestones, the same trigger twice, and a dry run that writes nothing", () => {
  const root = brain();
  put(root, "loose", FOLLOW('trigger: note about deal\nreads: ["field:organization.budget_owner"]', "1. **Do it** (skill: gtm-brain-nope). Just do it.\n2. **Then this**. Milestone: when it feels right."));
  const out = run(root, "--check", "loose");
  assert.match(out, /^check loose: \d+ problems/);
  assert.match(out, /step 1 names the skill gtm-brain-nope, which is neither shipped nor in \.agents\/skills/);
  assert.match(out, /step 1 \(Do it\) has no milestone/);
  assert.match(out, /step 2 \(Then this\) milestone "when it feels right" is not something the brain can see/);
  assert.match(out, /kind:deal: SCHEMA\.md has no kind deal/);
  assert.match(out, /field:organization\.budget_owner: SCHEMA\.md has no field budget_owner/);
  assert.match(refused(root, "--activate", "loose", "--by", "marta"), /Not switched on/);
  assert.match(readFileSync(join(root, "workflows", "loose.md"), "utf8"), /^status: draft$/m, "a failed check changes nothing");
  // a good one passes, and the dry run reads one real example
  put(root, "account-follow-up", FOLLOW(GOOD_HEADER, GOOD_STEPS));
  note(root, "Northwind asked for the pricing sheet.", { people: ["Northwind"] });
  const before = lib.readMemories(root, "company").length;
  const good = run(root, "--check", "account-follow-up");
  assert.match(good, /^check account-follow-up: passes/);
  assert.match(good, /dry run \(nothing written\), example: a note about Northwind \(organization\)/);
  assert.match(good, /would read: kind:organization; tool:email; .*skill gtmb-deepdive/);
  assert.match(good, /would write: a run-start note in company/);
  assert.equal(lib.readMemories(root, "company").length, before, "the dry run wrote nothing");
  run(root, "--activate", "account-follow-up", "--by", "marta");
  assert.match(readFileSync(join(root, "workflows", "account-follow-up.md"), "utf8"), /^status: active$/m);
  assert.match(readFileSync(join(root, "workflows", "account-follow-up.md"), "utf8"), /^active_since: "\d{4}-\d\d-\d\dT/m);
  // a second workflow on exactly the same trigger cannot be active beside it
  put(root, "twin", FOLLOW(GOOD_HEADER, GOOD_STEPS).replace("title: Account follow-up", "title: Twin"));
  assert.match(run(root, "--check", "twin"), /account-follow-up is already active on the same trigger \(note about organization\)/);
  run(root, "--pause", "account-follow-up", "--by", "marta");
  assert.match(readFileSync(join(root, "workflows", "account-follow-up.md"), "utf8"), /^status: paused$/m);
  assert.match(run(root, "--check", "twin"), /^check twin: passes/);
});

test("an event is offered at the chat start in one line, started once on a yes, and its run's first note says it is taken", () => {
  const root = brain(); put(root, "account-follow-up", FOLLOW(GOOD_HEADER, GOOD_STEPS));
  run(root, "--activate", "account-follow-up", "--by", "marta");
  assert.equal(wf.runsLine(root), "", "nothing saved since it was switched on: nothing to offer");
  const m = note(root, "Northwind wants a follow-up on the pilot.", { people: ["Northwind"] });
  const id = lib.readNames(root).find(e => e.name === "Northwind").id, ev = `note:${m.id}:${id}`;
  const line = wf.runsLine(root);
  assert.match(line, new RegExp(`^workflow account-follow-up \\(note about organization\\): a note about Northwind \\(organization\\) on \\d{4}-\\d\\d-\\d\\d\\. Offer it once .*event ${ev}\\); never run it silently\\.$`));
  assert.equal(line.split("\n").length, 1);
  const before = lib.readMemories(root, "company").length;
  run(root, "--due", "--by", "session");
  assert.equal(lib.readMemories(root, "company").length, before, "the automatic check offers, it never starts a run");
  const started = run(root, "--start", "account-follow-up", "--event", ev, "--settled", "{}", "--by", "marta");
  assert.match(started, /^started account-follow-up-\d{4}-\d\d-\d\d-northwind in Our company: step 1 of 2, Draft the follow-up \(skill gtmb-deepdive\), due now; done when a note tagged follow-up-drafted\. RULES\.md binds every step/);
  const first = lib.readMemories(root, "company").find(x => x.tags.includes("run-start"));
  assert.ok(first.tags.includes(`event:${ev}`) && first.tags.includes(`subject:${id}`)); assert.deepEqual(first.source, [{ kind: "memory", ref: m.id }]);
  assert.doesNotMatch(wf.runsLine(root), /workflow account-follow-up \(/, "taken: no longer offered, on this machine or a teammate's");
  assert.match(refused(root, "--start", "account-follow-up", "--event", ev, "--settled", "{}", "--by", "marta"), /event .* was taken by run account-follow-up-/);
  // the run's own notes never start the same workflow again
  assert.equal(tr.pendingOffers(root).length, 0);
});

test("milestones: a note with the tag about the subject finishes the step; the next opens after its gate; the chain of notes is the state", () => {
  const root = brain(); put(root, "account-follow-up", FOLLOW(GOOD_HEADER, GOOD_STEPS)); run(root, "--activate", "account-follow-up", "--by", "marta");
  const m = note(root, "Northwind pilot follow-up needed.", { people: ["Northwind"] });
  const nid = lib.readNames(root).find(e => e.name === "Northwind").id;
  run(root, "--start", "account-follow-up", "--event", `note:${m.id}:${nid}`, "--settled", "{}", "--by", "marta");
  const id = wf.listRuns(root)[0].id;
  assert.equal(run(root, "--due", "--by", "session"), "no step due");
  note(root, "Drafted the follow-up for Anna Lee.", { people: ["Anna Lee"], tags: ["follow-up-drafted"] });
  assert.equal(run(root, "--due", "--by", "session"), "no step due", "a tagged note about another entity is not this run's milestone");
  note(root, "Follow-up for Northwind drafted in Gmail.", { people: ["Northwind"], tags: ["follow-up-drafted"] });
  const out = run(root, "--due", "--by", "session");
  assert.match(out, new RegExp(`^milestone: ${id} step 1 \\(Draft the follow-up\\) done, a note tagged follow-up-drafted \\(m_[0-9a-f]+\\); step 2 of 2, Read the reply, waiting, due ${wf.addDays(wf.localDate(), 3)}`));
  const r = wf.runState(root, id);
  assert.deepEqual(r.steps.map(s => s.status), ["done", "pending"]);
  const done = lib.readMemories(root, "company").find(x => x.tags.includes("milestone-reached"));
  assert.deepEqual(done.authors, ["session"]); assert.equal(done.source[0].kind, "memory");
  assert.equal(run(root, "--due", "--by", "session"), "no step due", "idempotent");
  // the person's commands are notes too: move a date, pause, resume, fail
  assert.match(run(root, "--move", id, "--step", "2", "--to", "2026-01-01", "--by", "marta"), /step 2 of .* moved to 2026-01-01, due now/);
  assert.match(run(root, "--pause-run", id, "--reason", "Anna is on holiday", "--by", "marta"), /paused/);
  assert.equal(wf.runState(root, id).paused !== null, true);
  assert.match(refused(root, "--advance", id, "--step", "2", "--by", "marta"), /is paused/);
  assert.doesNotMatch(run(root, "--due", "--by", "session"), /milestone|due:/, "a paused run does not move");
  run(root, "--resume-run", id, "--by", "marta");
  assert.match(run(root, "--fail", id, "--step", "2", "--reason", "Gmail said 403", "--by", "marta"), /stopped: step 2 \(Read the reply\) failed: Gmail said 403/);
  assert.equal(wf.runState(root, id).ended.how, "failed");
  const tags = lib.readMemories(root, "company").filter(x => x.tags.includes(`run:${id}`)).flatMap(x => x.tags);
  for (const t of ["run-paused", "run-resumed", "run-failed", "run-abandoned"]) assert.ok(tags.includes(t), `${t} (run-abandoned: a teammate on 0.34 sees the run ended)`);
});

test("limits: active runs per workflow, the chain depth, a workflow never triggers itself, and one setting turns all off", () => {
  const root = brain(); put(root, "account-follow-up", FOLLOW(GOOD_HEADER, GOOD_STEPS)); run(root, "--activate", "account-follow-up", "--by", "marta");
  const nid = lib.readNames(root).find(e => e.name === "Northwind").id;
  for (let i = 0; i < wf.LIMITS.activeRunsPerWorkflow; i++) run(root, "--start", "account-follow-up", "--context", "company", "--handle", `run ${i}`, "--settled", "{}", "--by", "marta");
  assert.match(refused(root, "--start", "account-follow-up", "--context", "company", "--handle", "one more", "--settled", "{}", "--by", "marta"), /has 3 runs active .* the limit is 3/);
  const m = note(root, "Northwind again.", { people: ["Northwind"] });
  assert.match(wf.runsLine(root), /1 event waiting, held: 3 runs already active, the limit is 3/);
  // a note written by this workflow's own run never offers it; a note three links down a chain is not offered
  note(root, "Our run touched Northwind.", { people: ["Northwind"], tags: ["workflow:account-follow-up", "run:x"] });
  assert.equal(tr.pendingOffers(root)[0].events.length, 1);
  note(root, "Another workflow's run at depth 3.", { people: ["Northwind"], tags: ["workflow:other", "run:y", "depth:3"] });
  assert.equal(tr.pendingOffers(root)[0].events.length, 1); assert.equal(tr.pendingOffers(root)[0].tooDeep, 1);
  assert.ok(m);
  // workflows: off in admin.md: nothing offered, nothing started, nothing moved
  const admin = join(root, "brain", "admin.md"); writeFileSync(admin, readFileSync(admin, "utf8").replace(/^---\n/, "---\nworkflows: off\n"));
  assert.equal(tr.pendingOffers(root).length, 0);
  assert.match(wf.runsLine(root), /workflows are off in this brain/);
  assert.match(refused(root, "--start", "account-follow-up", "--context", "company", "--handle", "x", "--settled", "{}", "--by", "marta"), /workflows are off/);
  assert.match(run(root, "--due", "--by", "session"), /^workflows are off/);
  assert.ok(nid);
});

test("a schema change that removes what an active workflow names flags it and holds its runs; the view says so", () => {
  const root = brain();
  put(root, "industry-gap", FOLLOW('trigger: field organization.industry missing for 0 days\nreads: ["field:organization.industry"]\ncontext: company', "1. **Ask for the industry**. Milestone: field organization.industry filled."));
  run(root, "--activate", "industry-gap", "--by", "marta");
  const offers = tr.pendingOffers(root);
  assert.equal(offers[0].workflow.slug, "industry-gap"); assert.match(offers[0].events[0].id, /^missing:e_[0-9a-f]+:industry$/);
  run(root, "--start", "industry-gap", "--event", offers[0].events[0].id, "--settled", "{}", "--by", "marta");
  assert.match(refused(root, "--advance", wf.listRuns(root)[0].id, "--step", "1", "--by", "marta"), /done when field organization\.industry filled, and the brain does not see it yet/);
  const schema = join(root, "SCHEMA.md"); writeFileSync(schema, readFileSync(schema, "utf8").replace(/^\| industry \|.*\n/m, ""));
  const eff = tr.effectiveStatus(root, wf.readWorkflow(root, "industry-gap"));
  assert.equal(eff.status, "paused"); assert.match(eff.flag, /field:organization\.industry/);
  assert.match(wf.runsLine(root), /workflow industry-gap is held: SCHEMA\.md changed: field:organization\.industry/);
  assert.match(run(root, "--due", "--by", "session"), /held industry-gap-.*: industry-gap is paused \(SCHEMA\.md changed/);
  assert.match(run(root, "--view"), /- industry-gap \[paused, held: SCHEMA\.md changed/);
  assert.match(readFileSync(join(root, "workflows", "industry-gap.md"), "utf8"), /^status: active$/m, "flagged, not rewritten: fixing the schema brings it back");
});

test("schedules: the latest occurrence is offered once to a scheduled workflow with a context; links created are events", () => {
  const t = wf.parseTrigger("every monday 09:00"), now = new Date(2026, 10, 18, 12, 0);   // a Wednesday
  assert.equal(tr.scheduleOccurrence(t, now).date, "2026-11-16");
  assert.equal(tr.scheduleOccurrence(wf.parseTrigger("daily 13:00"), now).date, "2026-11-17");
  assert.equal(tr.scheduleOccurrence(wf.parseTrigger("every weekday 08:00"), new Date(2026, 10, 15, 10, 0)).date, "2026-11-13", "a Sunday looks back to Friday");
  const root = brain();
  put(root, "weekly", FOLLOW('trigger: "daily 00:00"\nreads: ["kind:organization"]\ncontext: company', "1. **Review the week**. Milestone: a note tagged week-reviewed."));
  assert.match(run(root, "--check", "weekly"), /^check weekly: passes/);
  const fm = join(root, "workflows", "weekly.md"); writeFileSync(fm, readFileSync(fm, "utf8").replace("status: draft", 'status: active\nactive_since: "2026-01-01T00:00:00Z"'));
  const o = tr.pendingOffers(root); assert.equal(o[0].events[0].id, `schedule:${wf.localDate()}`);
  run(root, "--start", "weekly", "--event", o[0].events[0].id, "--settled", "{}", "--by", "marta");
  assert.equal(tr.pendingOffers(root).length, 0, "the same occurrence starts it once");
  put(root, "new-hire", FOLLOW('trigger: link works_at created\nreads: ["link:works_at"]', "1. **Say hello**. Milestone: a note tagged hello-said."));
  const f2 = join(root, "workflows", "new-hire.md"); writeFileSync(f2, readFileSync(f2, "utf8").replace("status: draft", 'status: active\nactive_since: "2026-01-01T00:00:00Z"'));
  note(root, "Anna Lee joined Northwind.", { relation: { from: "Anna Lee", type: "works_at", to: "Northwind", status: "current", basis: "user", observed_at: "2026-11-13T10:00:00Z" } });
  note(root, "Anna Lee still at Northwind.", { relation: { from: "Anna Lee", type: "works_at", to: "Northwind", status: "current", basis: "user", observed_at: "2026-11-14T10:00:00Z" } });
  const hire = tr.pendingOffers(root).find(x => x.workflow.slug === "new-hire");
  assert.equal(hire.events.length, 1, "a link confirmed again is not created again");
  assert.match(tr.eventLabel(hire.events[0]), /^Anna Lee works_at Northwind created on 2026-/);
});

test("query workflows over MCP: per workflow its status, trigger, each run's step, what it waits for and the last result", async () => {
  const root = brain(); put(root, "account-follow-up", FOLLOW(GOOD_HEADER, GOOD_STEPS)); run(root, "--activate", "account-follow-up", "--by", "marta");
  run(root, "--start", "account-follow-up", "--context", "company", "--handle", "Northwind", "--settled", "{}", "--by", "marta");
  const view = run(root, "--view");
  assert.match(view, /^workflows \(\d+\):/);
  assert.match(view, /- account-follow-up \[active\], trigger: note about organization, reads kind:organization, tool:email, writes tool:email/);
  assert.match(view, /  run account-follow-up-\d{4}-\d\d-\d\d-northwind in Our company: step 1 of 2 \(Draft the follow-up\), due now, waits for a note tagged follow-up-drafted; last: Step 1 of 2/);
  assert.match(view, /- outbound \[draft\], trigger: manual/);
  assert.match(view, /limits: 3 active runs per workflow, 5 automatic steps per run a day, chains stop at depth 3/);
  const { spawn } = await import("node:child_process");
  const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "ignore"], env: { ...env, GTM_BRAIN_NO_SESSION_START: "1" } });
  const lines = []; let buf = ""; server.stdout.on("data", d => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const rpc = (id, method, params) => { server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); return new Promise(res => { const t = setInterval(() => { const m = lines.find(l => l.id === id); if (m) { clearInterval(t); res(m); } }, 20); }); };
  await rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });
  const r = await rpc(2, "tools/call", { name: "query", arguments: { brain: root, object: "workflows" } });
  server.kill();
  assert.equal(r.result.isError, undefined);
  assert.match(r.result.content[0].text, /account-follow-up \[active\]/);
});

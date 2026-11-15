// These tests read and write the root files of a layout 2 brain: setup and the lib play a plugin that writes layout 2 at most
// (lib/layout-version.mjs GTM_BRAIN_TEST_LAYOUT). Layout 3 (about-us/, config/) is covered by config-folders.test.mjs.
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
// Workflow triggers under pressure (0.35.0, lane S2 review): the cases where a milestone, a limit or an offer
// could be satisfied by the wrong thing. Each test failed on the lane as built.
// Run: node --test plugins/gtm-brain/test/workflow-limits.test.mjs
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
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-wfl-home-"));
const lib = await import(`${P}/lib/brain.mjs`);
const wf = await import(`${P}/lib/workflows.mjs`);
const tr = await import(`${P}/lib/workflow-triggers.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_COMMIT: "1" };
function brain() {
  const root = trackBrain(realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-wfl-"))), P);
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  lib.addName(root, "Northwind", { kind: "company" }); lib.addName(root, "Contoso", { kind: "company" }); lib.addName(root, "Anna Lee");
  return root;
}
const script = `${P}/scripts/gtm-brain-workflow/workflow.mjs`;
const run = (root, ...a) => execFileSync(process.execPath, [script, ".", ...a], { cwd: root, encoding: "utf8", env }).trimEnd();
const refused = (root, ...a) => { try { run(root, ...a); return null; } catch (e) { return String(e.stderr); } };
const note = (root, content, extra = {}) => lib.appendMemory(root, "company", { authors: ["marta-nowak"], via: "codex", kind: "note", content, source: [{ kind: "user", ref: "marta" }], ...extra }).rec;
const DOC = (title, header, steps) => `---\nkind: document\ntype: workflow\ntitle: ${title}\napplies_to: [follow-up]\nstatus: draft\n${header}\nby: ""\nupdated: 2026-11-01\ngtm-brain: 0.35.0\n---\n# ${title}\n\n## Before starting\n\n## Steps\n\n${steps}\n\n## Learn\n\n- Did it work.\n`;
const put = (root, slug, text) => { mkdirSync(join(root, "workflows"), { recursive: true }); writeFileSync(join(root, "workflows", `${slug}.md`), text); };
const setFields = (root, name, fields) => {
  const e = lib.readNames(root).find(x => x.name === name), path = join(root, e._path);
  const { fm, body } = lib.parseFrontmatter(readFileSync(path, "utf8"));
  writeFileSync(path, lib.renderFrontmatter({ ...fm, compiled_fields: JSON.stringify(fields) }) + body);
};
const idOf = (root, name) => lib.readNames(root).find(e => e.name === name).id;
const MANUAL = 'trigger: manual\nreads: ["kind:organization"]';
const start = (root, slug, handle) => { run(root, "--start", slug, "--context", "company", "--handle", handle, "--settled", "{}", "--by", "marta"); return wf.listRuns(root).find(r => r.id.endsWith(`-${handle}`)).id; };

test("one run's milestone never finishes another run's step: a tag carried by run A's own note is not run B's", () => {
  const root = brain();
  put(root, "campaign", DOC("Campaign", MANUAL, "1. **Build the list**. Milestone: a note tagged target-list.\n2. **Send**. Milestone: a note tagged sent."));
  const a = start(root, "campaign", "alpha"), b = start(root, "campaign", "beta");
  run(root, "--advance", a, "--step", "1", "--note", "List built for alpha.", "--by", "marta");
  const out = run(root, "--due", "--by", "session");
  assert.doesNotMatch(out, new RegExp(`milestone: ${b}`), out);
  assert.deepEqual(wf.runState(root, b).steps.map(s => s.status), ["due"], "run beta did nothing: its step 1 is still due");
  // a plain note with the tag, saved in the run's context and naming no other run, is still seen
  note(root, "The list for the campaign is built.", { tags: ["target-list"] });
  assert.match(run(root, "--due", "--by", "session"), new RegExp(`milestone: ${b} step 1`));
});

test("two steps on the same tag: the note that finished one step is not the next step's milestone", () => {
  const root = brain();
  put(root, "twice", DOC("Twice", MANUAL, "1. **First touch**. Milestone: a note tagged touched.\n2. **Second touch**. Milestone: a note tagged touched.\n3. **Close**. Milestone: a note tagged closed."));
  const id = start(root, "twice", "gamma");
  run(root, "--advance", id, "--step", "1", "--note", "First touch sent.", "--by", "marta");
  run(root, "--due", "--by", "session");
  assert.deepEqual(wf.runState(root, id).steps.map(s => s.status), ["done", "due"], "step 2 waits for its own note");
});

test("a field milestone is the run's own: a field some other entity already had finishes nothing", () => {
  const root = brain();
  const old = note(root, "Contoso is in logistics.", { people: ["Contoso"] });
  setFields(root, "Contoso", [{ field: "industry", text: "logistics", memories: [old.id] }]);
  // a run about Northwind (started from its event): Contoso's industry is not its milestone
  put(root, "industry-gap", DOC("Industry gap", 'trigger: field organization.industry missing for 0 days\nreads: ["field:organization.industry"]\ncontext: company', "1. **Ask for the industry**. Milestone: field organization.industry filled.\n2. **Thank them**. Milestone: a note tagged thanked."));
  run(root, "--activate", "industry-gap", "--by", "marta");
  run(root, "--start", "industry-gap", "--event", `missing:${idOf(root, "Northwind")}:industry`, "--settled", "{}", "--by", "marta");
  const subjectRun = wf.listRuns(root)[0].id;
  assert.equal(run(root, "--due", "--by", "session").split("\n").filter(l => /^milestone:/.test(l)).length, 0);
  assert.match(refused(root, "--advance", subjectRun, "--step", "1", "--by", "marta"), /the brain does not see it yet/);
  // a run nobody tied to an entity: a field filled before the step opened is not what the step did
  put(root, "fill", DOC("Fill", MANUAL, "1. **Fill an industry**. Milestone: field organization.industry filled.\n2. **Report**. Milestone: a note tagged reported."));
  const id = start(root, "fill", "delta");
  assert.doesNotMatch(run(root, "--due", "--by", "session"), new RegExp(`milestone: ${id}`));
  assert.match(refused(root, "--advance", id, "--step", "1", "--by", "marta"), /the brain does not see it yet/);
  // filled from a note saved after the step opened: seen
  const fresh = note(root, "Northwind is in retail.", { people: ["Northwind"] });
  setFields(root, "Northwind", [{ field: "industry", text: "retail", memories: [fresh.id] }]);
  const out = run(root, "--due", "--by", "session");
  assert.match(out, new RegExp(`milestone: ${id} step 1`)); assert.match(out, new RegExp(`milestone: ${subjectRun} step 1`));
});

test("the automatic check moves at most LIMITS.stepsPerDay steps of a run in a day, and says it is holding", () => {
  const root = brain(), n = wf.LIMITS.stepsPerDay + 3;
  put(root, "long", DOC("Long", MANUAL, Array.from({ length: n }, (_, i) => `${i + 1}. **Step ${i + 1}**. Milestone: a note tagged long-${i + 1}.`).join("\n")));
  const id = start(root, "long", "epsilon");
  // each step's note is saved after the step opened, then the check runs: one step a check, as a chat would
  let out = "";
  for (let i = 1; i <= n; i++) { note(root, `Long step ${i} happened.`, { tags: [`long-${i}`] }); out = run(root, "--due", "--by", "session"); }
  assert.equal(wf.runState(root, id).steps.filter(s => s.status === "done").length, wf.LIMITS.stepsPerDay, out);
  assert.match(out, new RegExp(`held ${id}: ${wf.LIMITS.stepsPerDay} automatic steps today`));
  assert.match(run(root, "--due", "--by", "schedule"), /held/, "a second check the same day moves nothing more");
  assert.equal(wf.runState(root, id).steps.filter(s => s.status === "done").length, wf.LIMITS.stepsPerDay);
  // a date passed by hand does not lift the limit: the day is the day the notes were written
  run(root, "--due", "--today", "2099-01-01", "--by", "session");
  assert.equal(wf.runState(root, id).steps.filter(s => s.status === "done").length, wf.LIMITS.stepsPerDay);
});

test("a finished run's own notes do not offer the workflow again about the same entity", () => {
  const root = brain();
  put(root, "follow", DOC("Follow", 'trigger: note about organization\nreads: ["kind:organization"]', "1. **Draft**. Milestone: a note tagged drafted."));
  run(root, "--activate", "follow", "--by", "marta");
  const m = note(root, "Northwind wants a follow-up.", { people: ["Northwind"] });
  run(root, "--start", "follow", "--event", `note:${m.id}:${idOf(root, "Northwind")}`, "--settled", "{}", "--by", "marta");
  const id = wf.listRuns(root)[0].id;
  note(root, "Follow-up for Northwind drafted.", { people: ["Northwind"], tags: ["drafted"] });   // the step's work, saved through remember
  assert.match(run(root, "--due", "--by", "session"), /run .* finished/);
  assert.equal(wf.runState(root, id).ended.how, "done");
  assert.deepEqual(tr.pendingOffers(root).flatMap(o => o.events.map(e => e.id)), [], "the milestone note the run waited for does not start the workflow again");
  assert.equal(wf.runsLine(root), "");
  const later = note(root, "Northwind came back with a new question.", { people: ["Northwind"] });
  assert.deepEqual(tr.pendingOffers(root).flatMap(o => o.events.map(e => e.memory)), [later.id], "a note saved after the run ended is a new event");
});

test("the chat start stays short however many workflows are held or waiting", () => {
  const root = brain();
  for (let i = 1; i <= 6; i++) put(root, `held-${i}`, DOC(`Held ${i}`, `trigger: field organization.industry missing for ${i} days\nreads: ["field:organization.industry"]\ncontext: company\nactive_since: "2026-01-01T00:00:00Z"`, "1. **Ask**. Milestone: a note tagged asked.").replace("status: draft", "status: active"));
  const schema = join(root, "SCHEMA.md"); writeFileSync(schema, readFileSync(schema, "utf8").replace(/^\| industry \|.*\n/m, ""));
  const line = wf.runsLine(root), lines = line.split("\n");
  assert.ok(lines.length <= wf.LIMITS.offersPerChat + 1, `${lines.length} lines:\n${line}`);
  assert.ok(Buffer.byteLength(line) < 1500, `${Buffer.byteLength(line)} bytes`);
  for (let i = 1; i <= 6; i++) assert.match(line, new RegExp(`held-${i}\\b`), "every held workflow is still named");
});

test("activate changes only the status lines: a header with $ signs comes back byte for byte", () => {
  const root = brain();
  const text = DOC("Pricing $& follow-up $$ $' $`", MANUAL, "1. **Draft**. Milestone: a note tagged drafted.");
  put(root, "pricing", text);
  run(root, "--activate", "pricing", "--by", "marta");
  const after = readFileSync(join(root, "workflows", "pricing.md"), "utf8");
  assert.equal(after.replace(/^active_since: .*\n/m, "").replace("status: active", "status: draft"), text);
});

test("an active workflow can still be edited through the document tool, and the edit does not switch it on or off", () => {
  const root = brain();
  put(root, "follow", DOC("Follow", 'trigger: note about organization\nreads: ["kind:organization"]', "1. **Draft**. Milestone: a note tagged drafted."));
  run(root, "--activate", "follow", "--by", "marta");
  const doc = (...a) => { try { return execFileSync(process.execPath, [`${P}/scripts/gtm-brain-documents/document.mjs`, ".", ...a], { cwd: root, encoding: "utf8", env }); } catch (e) { return `REFUSED ${e.stderr}`; } };
  const body = "# Follow\n\n## Before starting\n\n## Steps\n\n1. **Draft it well**. Milestone: a note tagged drafted.\n\n## Learn\n\n- Did it work.\n";
  assert.doesNotMatch(doc("--update", "follow", "--body", body, "--by", "marta"), /REFUSED/);
  const w = wf.readWorkflow(root, "follow");
  assert.equal(w.steps[0].title, "Draft it well"); assert.equal(w.header.status, "active"); assert.equal(w.header.trigger.kind, "note");
  assert.match(doc("--update", "follow", "--status", "active", "--by", "marta"), /REFUSED/, "the document tool never switches a workflow on: that is workflow activate, after the check");
  put(root, "other", DOC("Other", MANUAL, "1. **Draft**."));
  assert.match(doc("--update", "other", "--status", "active", "--by", "marta"), /REFUSED/);
  assert.match(readFileSync(join(root, "workflows", "other.md"), "utf8"), /^status: draft$/m);
});

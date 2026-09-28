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

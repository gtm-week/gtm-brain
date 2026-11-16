// The close of onboarding in a brain with an owner (layout 3, lib/owner.mjs): the owner is asked the schema and
// rules questions; a teammate is told in one line that those changes go to the owner as proposals, and is asked
// only the documents question. Order, wording and resuming are in onboarding-flow.test.mjs.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-brain-close-codex-")), HOME: mkdtempSync(join(tmpdir(), "gtm-brain-close-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SESSION_START: "1" };
for (const k of ["GTM_BRAIN_NO_COMMIT", "GTM_BRAIN_RUN", "GTM_BRAIN_APPROVAL_TICKET", "GTM_BRAIN_HOST", "GTM_BRAIN_TEST_LAYOUT"]) { delete env[k]; delete process.env[k]; }
const lib = await import("../lib/brain.mjs");
const roots = [];
after(() => { for (const r of [...roots, env.CODEX_HOME, env.HOME]) { try { rmSync(r, { recursive: true, force: true }); } catch {} } });

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-close-"))); roots.push(root);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Acme", "--one-liner", "returns automation", "--owner", "Anna Lind <anna@acme.example>", "--team", "Tom Berg <tom@acme.example>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const as = (root, handle) => writeFileSync(join(root, "work", "person.json"), JSON.stringify({ handle }) + "\n");
const tour = readFileSync(join(P, "skills/gtmb-start/references/skills-tour.md"), "utf8");

test("the owner is asked the schema and the rules; a teammate is told and not asked", () => {
  const root = brain();
  assert.ok(existsSync(join(root, "config/schema.md")) && existsSync(join(root, "config/rules.md")), "setup writes layout 3");
  as(root, "anna-lind");
  const owner = lib.closingSteps(root);
  assert.equal(owner.owner, true);
  assert.deepEqual(owner.steps.map(s => [s.step, s.how]), [["schema", "ask"], ["rules", "ask"], ["documents", "ask"]]);
  const said = lib.onboardingInstruction(root, { unattended: false });
  assert.match(said, /Still open, in this order: schema, rules, documents\./);
  assert.doesNotMatch(said, /not the brain's owner/);

  // a teammate who asked for an onboarding of their own
  as(root, "tom-berg");
  const state = lib.readOnboarding(root);
  lib.appendMemory(root, state.context, { authors: ["tom-berg"], tags: ["onboarding"], supersedes: state.marker_id, content: `Onboarding: pending v${lib.ONBOARDING_VERSION} since 2026-11-16.` });
  const mate = lib.closingSteps(root);
  assert.equal(mate.owner, false); assert.equal(mate.owner_handle, "anna-lind");
  assert.deepEqual(mate.steps.map(s => [s.step, s.how]), [["schema", "tell"], ["rules", "tell"], ["documents", "ask"]]);
  const told = lib.onboardingInstruction(root, { unattended: false });
  assert.match(told, /Still open, in this order: schema \(not the owner: tell, do not ask\), rules \(not the owner: tell, do not ask\), documents\./);
  assert.match(told, /This person is not the brain's owner \(anna-lind\): say in one line that a change to the schema or the rules goes to the owner as a proposal, and ask neither question\./);
  // told is a settled step too: it is not said again
  for (const step of ["schema", "rules"]) lib.appendMemory(root, state.context, { authors: ["tom-berg"], tags: ["onboarding"], content: lib.closingAnswer(step, "told, not the owner") });
  const after = lib.closingSteps(root);
  assert.deepEqual(after.steps.map(s => s.outcome), ["told, not the owner", "told, not the owner", null]);
  assert.deepEqual([after.next.step, after.next.how], ["documents", "ask"]);
  assert.equal(lib.onboardingInstruction(root, { unattended: true }), "", "nothing in a scheduled or background run");
});

test("the skill says the same: one line for someone who is not the owner, no question", () => {
  const close = tour.slice(tour.indexOf("\n## The close, in order\n"), tour.indexOf("\n## Schema\n"));
  assert.match(close, /\*\*Not the owner\.\*\*/);
  assert.match(close, /Their changes\s+to the rules and the schema become proposals for the owner, as always\. Ask neither question\./);
  assert.match(close, /Say one line instead: "The schema and the rules are <owner>'s to change; say a change any time\s+and it goes to them as a proposal\."/);
  assert.match(close, /Save both notes with the answer `told, not the owner`,\s+then ask the documents question\./);
  assert.match(readFileSync(join(P, "skills/gtmb-start/SKILL.md"), "utf8"), /is told in one line that schema and rules changes go to the owner as proposals,\s+and is not asked/);
  assert.match(readFileSync(join(P, "../../ONBOARDING.md"), "utf8"), /If you are not the brain's owner, Codex does not ask the first two/);
});

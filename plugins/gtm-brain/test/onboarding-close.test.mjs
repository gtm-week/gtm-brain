// The close of onboarding in a brain with an owner (lib/owner.mjs): the owner is asked the schema, rules
// and documents questions; a teammate is told in one line that those changes go to the owner as proposals, and is
// asked none. The notes are per person. Order, wording and resuming are in onboarding-flow.test.mjs.
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
const as = (root, handle) => writeFileSync(join(root, ".gtm-brain", "person.json"), JSON.stringify({ handle }) + "\n");
const tour = readFileSync(join(P, "skills/gtmb-start/references/skills-tour.md"), "utf8");

test("the owner is asked the schema and the rules; a teammate is told and not asked", () => {
  const root = brain();
  assert.ok(existsSync(join(root, "configuration/schema.md")) && existsSync(join(root, "configuration/rules.md")), "setup writes the four folders");
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
  assert.deepEqual(mate.steps.map(s => [s.step, s.how]), [["schema", "tell"], ["rules", "tell"], ["documents", "tell"]]);
  const told = lib.onboardingInstruction(root, { unattended: false });
  assert.match(told, /Still open, in this order: schema \(not the owner: tell, do not ask\), rules \(not the owner: tell, do not ask\), documents \(not the owner: tell, do not ask\)\./);
  assert.match(told, /This person is not the brain's owner \(anna-lind\): say in one line that a change to the schema, the rules or the base documents goes to the owner as a proposal, ask none of the three questions, and save each as "Onboarding closing: <step> told, not the owner\."/);
  // told is a settled step too: it is not said again
  for (const step of ["schema", "rules"]) lib.appendMemory(root, state.context, { authors: ["tom-berg"], tags: ["onboarding"], content: lib.closingAnswer(step, "told, not the owner") });
  const after = lib.closingSteps(root);
  assert.deepEqual(after.steps.map(s => s.outcome), ["told, not the owner", "told, not the owner", null]);
  assert.deepEqual([after.next.step, after.next.how], ["documents", "tell"]);
  lib.appendMemory(root, state.context, { authors: ["tom-berg"], tags: ["onboarding"], content: lib.closingAnswer("documents", "told, not the owner") });
  assert.equal(lib.closingSteps(root).next, null);
  assert.match(lib.onboardingInstruction(root, { unattended: false }), /Close of onboarding: schema, rules and documents are settled\. Do not ask them again; give the first task\./);
  assert.equal(lib.onboardingInstruction(root, { unattended: true }), "", "nothing in a scheduled or background run");
});

test("closing notes are per person: a teammate's close settles nothing for the owner, and the owner's nothing for a teammate", () => {
  const root = brain();
  const context = lib.readOnboarding(root).context;
  // the teammate is told the one line and saves the three notes
  as(root, "tom-berg");
  for (const step of lib.CLOSING_STEPS) lib.appendMemory(root, context, { authors: ["tom-berg"], tags: ["onboarding"], content: lib.closingAnswer(step, "told, not the owner") });
  assert.equal(lib.closingSteps(root).next, null);
  // the owner, the only one who can change them, is still asked all three
  as(root, "anna-lind");
  const owner = lib.closingSteps(root);
  assert.deepEqual(owner.steps.map(s => [s.step, s.settled, s.how]), [["schema", false, "ask"], ["rules", false, "ask"], ["documents", false, "ask"]]);
  assert.match(lib.onboardingInstruction(root, { unattended: false }), /Settled, never ask again: none\. Still open, in this order: schema, rules, documents\./);
  // a "told" note never counts as the owner's answer, whoever wrote it (the owner changed since)
  lib.appendMemory(root, context, { authors: ["anna-lind"], tags: ["onboarding"], content: lib.closingAnswer("rules", "told, not the owner") });
  assert.equal(lib.closingSteps(root).steps[1].settled, false);
  // the owner settles all three; a teammate onboarding afterwards is still told the one line
  const mate = brain(), mateContext = lib.readOnboarding(mate).context;
  as(mate, "anna-lind");
  for (const [step, answer] of [["schema", "looks right"], ["rules", "later"], ["documents", "voice and ICP"]]) lib.appendMemory(mate, mateContext, { authors: ["anna-lind"], tags: ["onboarding"], content: lib.closingAnswer(step, answer) });
  assert.equal(lib.closingSteps(mate).next, null);
  as(mate, "tom-berg");
  const state = lib.readOnboarding(mate);
  lib.appendMemory(mate, state.context, { authors: ["tom-berg"], tags: ["onboarding"], supersedes: state.marker_id, content: `Onboarding: pending v${lib.ONBOARDING_VERSION} since 2026-11-16.` });
  assert.deepEqual(lib.closingSteps(mate).steps.map(s => [s.settled, s.how]), [[false, "tell"], [false, "tell"], [false, "tell"]]);
  assert.match(lib.onboardingInstruction(mate, { unattended: false }), /Settled, never ask again: none\. Still open, in this order: schema \(not the owner: tell, do not ask\)/);
  // their onboarding completes and the chat ends before the line was said: it is said once, with no form to resume
  const pending = lib.readOnboarding(mate);
  lib.appendMemory(mate, pending.context, { authors: ["tom-berg"], tags: ["onboarding"], supersedes: pending.marker_id, content: `Onboarding: completed v${lib.ONBOARDING_VERSION} on 2026-11-16.` });
  lib.appendMemory(mate, pending.context, { authors: ["tom-berg"], tags: ["onboarding"], content: "Onboarding closing: started." });
  const left = lib.onboardingInstruction(mate, { unattended: false });
  assert.match(left, /Close of onboarding was interrupted/);
  assert.match(left, /say that line once and save the notes; a business request comes first/);
  assert.doesNotMatch(left, /offered again/);
  // the owner did not onboard this time and is not offered the teammate's close
  as(mate, "anna-lind");
  assert.doesNotMatch(lib.onboardingInstruction(mate, { unattended: false }), /Close of onboarding/);
});

test("the skill says the same: one line for someone who is not the owner, no question", () => {
  const close = tour.slice(tour.indexOf("\n## The close, in order\n"), tour.indexOf("\n## Schema\n"));
  assert.match(close, /\*\*Not the owner\.\*\*/);
  assert.match(close, /Their changes\s+to the schema, the rules and the base documents in `configuration\/about-us\/` become proposals for the owner,\s+as always\. Ask none of the three questions\./);
  assert.match(close, /Say one line instead: "The schema, the rules and the base documents are <owner>'s to change;\s+say a change any time and it goes to them as a proposal\."/);
  assert.match(close, /Save all three notes with the answer\s+`told, not the owner`, then give the first task\./);
  assert.match(close, /The notes are per person: only the notes of the person who is\s+onboarding settle their steps/);
  assert.match(tour.slice(tour.indexOf("\n## The documents question\n")), /Someone who is not the brain's owner is\s+not asked/);
  assert.match(readFileSync(join(P, "skills/gtmb-start/SKILL.md"), "utf8"), /is told in one line that schema, rules and base document changes go to the\s+owner as proposals, and is not asked/);
  assert.match(readFileSync(join(P, "skills/gtmb-start/references/questions.md"), "utf8"), /\| Documents, at the close \|[^\n]*Not asked of someone who is not the owner\. \|/);
  assert.match(readFileSync(join(P, "../../docs/ONBOARDING.md"), "utf8"), /If you are not the brain's owner, Codex does not ask these three/);
});

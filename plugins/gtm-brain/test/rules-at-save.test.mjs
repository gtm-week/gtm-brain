// The team's rules at save (lib/standing-rules.mjs rulesForSave): remember reads the rules again on every save and
// matches the note against each one, with no model call. Before 0.38.0 the rules reached Codex only as text before
// the first save, and a benchmark's churned-customer rule held in one run and not in the next. An ask-first rule,
// or one the note appears to break, holds the entry until the person answered (rule_checked: true is their yes);
// any other rule that applies tops the result; a rule that does not apply says nothing.
// Run: node --test plugins/gtm-brain/test/rules-at-save.test.mjs
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-rulesave-codex-")), GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1",
  GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1", GTM_BRAIN_NO_TOOLS_CHECK: "1" };
delete env.GTM_BRAIN_RUN;
process.env.CODEX_HOME = env.CODEX_HOME; process.env.GTM_BRAIN_NO_COMMIT = "1";
const S = await import(`${P}/lib/standing-rules.mjs`);
const lib = await import(`${P}/lib/brain.mjs`);

const RULES = [
  "- Ask before saving anything about pricing. Check with Anna first, every time. (Anna Lind, 2026-04-30)",
  "- A churned customer is never a prospect again: we do not chase them in outbound. (Anna Lind, 2026-07-14)",
].join("\n");
function brain({ rules = RULES } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-rulesave-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Northfold", "--one-liner", "events", "--owner", "Anna Lind <anna@northfold.test>"], { cwd: root, env, stdio: "ignore" });
  if (rules) appendFileSync(join(root, "RULES.md"), `\n${rules}\n`);
  return root;
}
const remember = (root, entry) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, root, "--by", "anna-lind", "--batch", (() => { const f = join(root, "work", `b-${Math.random()}.json`); writeFileSync(f, JSON.stringify([entry])); return f; })()], { cwd: root, env, encoding: "utf8" });
const say = r => `${r.stdout}${r.stderr}`;
const notes = root => lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories)).map(m => m.content);
const churned = root => { const r = remember(root, { content: "Acme Retail churned: they cancelled at the end of September.", companies: ["Acme Retail"], new_names: ["Acme Retail"], context: "company" }); assert.equal(r.status, 0, say(r)); return r; };

test("churn: adding a churned customer to the prospect list is held, quoting the rule and the note that says it churned", () => {
  const root = brain(); churned(root);
  const r = remember(root, { content: "Added Acme Retail to the prospect list for the Q1 outbound push.", companies: ["Acme Retail"], context: "company", tags: ["prospect"] });
  assert.equal(r.status, 2, say(r));
  assert.match(r.stderr, /^not remembered yet: team rule "A churned customer is never a prospect again/);
  assert.match(r.stderr, /RULES\.md line \d+/);
  assert.match(r.stderr, /the note says "prospect", "outbound"/);
  assert.match(r.stderr, /m_[0-9a-f]{12} says Acme Retail "Acme Retail churned/);
  assert.match(r.stderr, /appears to break the rule: do not save or act on it/);
  assert.match(r.stderr, /rule_checked: true/);
  assert.ok(!notes(root).some(c => /prospect list/.test(c)), "nothing written");
  // the person's yes: rule_checked saves it and says so first
  const yes = remember(root, { content: "Added Acme Retail to the prospect list for the Q1 outbound push.", companies: ["Acme Retail"], context: "company", tags: ["prospect"], rule_checked: true });
  assert.equal(yes.status, 0, say(yes));
  assert.match(yes.stdout, /^team rule "A churned customer[^\n]*Saved on the person's yes/);
  assert.ok(notes(root).some(c => /prospect list/.test(c)));
});

test("churn rule, a company nobody says churned: saved with no rule line (no noise)", () => {
  const root = brain();
  const r = remember(root, { content: "Added Bramble Foods to the prospect list for the Q1 outbound push.", companies: ["Bramble Foods"], new_names: ["Bramble Foods"], context: "company" });
  assert.equal(r.status, 0, say(r));
  assert.doesNotMatch(say(r), /team rule/);
});

test("a note no rule is about: saved with no rule line", () => {
  const root = brain(); churned(root);
  const r = remember(root, { content: "Acme Retail moved the kickoff to the Leipzig office.", companies: ["Acme Retail"], context: "company" });
  assert.equal(r.status, 0, say(r));
  assert.doesNotMatch(say(r), /team rule/);
  assert.equal(S.rulesForSave(root, { content: "Acme Retail moved the kickoff to the Leipzig office.", companies: ["Acme Retail"] }).length, 0);
});

test("an ask-first rule holds a note about a price, though the note never says pricing", () => {
  const root = brain();
  const r = remember(root, { content: "We offered Bramble Foods 0.30 EUR per return if they sign before December.", companies: ["Bramble Foods"], new_names: ["Bramble Foods"], context: "company" });
  assert.equal(r.status, 2, say(r));
  assert.match(r.stderr, /team rule "Ask before saving anything about pricing[^"]*" \(RULES\.md line \d+\) applies: the note says "0\.30 EUR"/);
  assert.match(r.stderr, /The rule says to ask first: do not save yet/);
  assert.doesNotMatch(r.stderr, /churned/);
});

test("a guidance rule that applies tops the result; the save goes through", () => {
  const root = brain({ rules: "- Notes about webinars go to Strategy with the date of the webinar." });
  const r = remember(root, { content: "The October webinar on returns drew 140 sign-ups.", context: "company" });
  assert.equal(r.status, 0, say(r));
  assert.match(r.stdout, /^team rule "Notes about webinars go to Strategy[^\n]*Saved; follow the rule/);
  assert.match(r.stdout, /Reply to the person in one line: what was saved and the team rule it falls under\./);
});

test("a brain with no rules: nothing matched, nothing said", () => {
  const root = brain({ rules: "" });
  assert.deepEqual(S.collectRules(root), []);
  assert.deepEqual(S.rulesForSave(root, { content: "We offered Bramble Foods 0.30 EUR per return.", companies: ["Bramble Foods"] }), []);
  const r = remember(root, { content: "We offered Bramble Foods 0.30 EUR per return if they sign before December.", companies: ["Bramble Foods"], new_names: ["Bramble Foods"], context: "company" });
  assert.equal(r.status, 0, say(r));
  assert.doesNotMatch(say(r), /team rule/);
});

test("rules are read again on every save: a rule noted in chat applies to the next save, with no chat start", () => {
  const root = brain({ rules: "" });
  const rule = remember(root, { content: "Never save anything about salaries without asking Anna first.", kind: "decision", context: "company", states_rule: true });
  assert.equal(rule.status, 0, say(rule));
  assert.doesNotMatch(say(rule), /not remembered yet/, "the rule note itself is not held by its own words");
  const r = remember(root, { content: "Karl's salary goes up in January.", context: "company" });
  assert.equal(r.status, 2, say(r));
  assert.match(r.stderr, /team rule "Never save anything about salaries without asking Anna first\." \(note m_[0-9a-f]{12}\)/);
});

test("a background run (GTM_BRAIN_RUN) is nobody's chat: no rule hold", () => {
  const root = brain();
  const f = join(root, "work", "b-run.json"); writeFileSync(f, JSON.stringify([{ content: "We offered Bramble Foods 0.30 EUR per return.", companies: ["Bramble Foods"], new_names: ["Bramble Foods"], context: "company" }]));
  const r = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, root, "--by", "anna-lind", "--batch", f], { cwd: root, env: { ...env, GTM_BRAIN_RUN: "test" }, encoding: "utf8" });
  assert.doesNotMatch(say(r), /team rule/);
});

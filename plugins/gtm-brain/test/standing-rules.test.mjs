// The team's standing rules before a save (lib/standing-rules.mjs, remember): a save that may collide with a rule
// in Our rules or with a note that states a standing rule is held once with the rule's text, date and author, and
// saved when the same entry comes back with rule_checked: true; an unrelated save goes through; a note that states
// a rule is recognised and offered for the rules file; the rules ride at the top of a chat's first write only.
// Run: node --test plugins/gtm-brain/test/standing-rules.test.mjs
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, realpathSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-standing-codex-")), GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1",
  GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1" };
delete env.GTM_BRAIN_RUN;
process.env.CODEX_HOME = env.CODEX_HOME; process.env.GTM_BRAIN_NO_COMMIT = "1";
const S = await import(`${P}/lib/standing-rules.mjs`);

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-standing-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Northfold", "--one-liner", "events", "--owner", "Anna Lind <anna@northfold.test>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const remember = (root, entry) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, root, "--by", "anna-lind", "--batch", (() => { const f = join(root, "work", `b-${Math.random()}.json`); writeFileSync(f, JSON.stringify([entry])); return f; })()], { cwd: root, env, encoding: "utf8" });
const say = r => `${r.stdout}${r.stderr}`;

test("statesRule: an instruction to the team, not a fact about someone", () => {
  assert.ok(S.statesRule("Never send a demo video before the first call."));
  assert.ok(S.statesRule("From now on we log every booth visit in the events context."));
  assert.ok(S.statesRule("Ask Anna before quoting a workshop date."));
  assert.ok(S.statesRule("Standing rule: booth banners are printed in Gdansk."));
  assert.ok(!S.statesRule("Anna never replies on Fridays."));
  assert.ok(!S.statesRule("Never send a demo video before the first call.", "question"));
});

test("a save that may collide with a rule in Our rules is held, then saved with rule_checked", () => {
  const root = brain();
  appendFileSync(join(root, "RULES.md"), "\nNever promise workshop dates before the venue contract is signed.\n");
  const entry = { content: "Told Acme Retail the workshop dates are 12 and 13 March, venue still open.", companies: ["Acme Retail"], context: "company" };
  const r = remember(root, entry);
  assert.equal(r.status, 2, say(r));
  assert.match(r.stderr, /^not saved: this may collide with a rule: "Never promise workshop dates before the venue contract is signed\."/);
  assert.match(r.stderr, /both mention .*workshop/);
  assert.match(r.stderr, /rule_checked: true/);
  const again = remember(root, { ...entry, rule_checked: true });
  assert.equal(again.status, 0, say(again));
  assert.match(again.stdout, /remembered m_/);
});

test("a note that states a standing rule is recognised, offered for the rules file, and holds a later colliding save", () => {
  const root = brain();
  const rule = remember(root, { content: "From now on booth banners for trade fairs are printed by Northfold Print only.", kind: "decision", context: "company" });
  assert.equal(rule.status, 0, say(rule));
  assert.match(rule.stdout, /states a standing rule/);
  assert.match(rule.stdout, /Our rules in RULES\.md/);
  assert.match(rule.stdout, /then the rule offer above/);
  const r = remember(root, { content: "Ordered the booth banners for the Leipzig trade fair from a local shop.", context: "company" });
  assert.equal(r.status, 2, say(r));
  assert.match(r.stderr, /not saved: this may collide with a rule: "From now on booth banners/);
  assert.match(r.stderr, /\(\d{4}-\d{2}-\d{2}, anna-lind\)/);   // date and author
});

test("an unrelated save goes through unchanged", () => {
  const root = brain();
  appendFileSync(join(root, "RULES.md"), "\nNever promise workshop dates before the venue contract is signed.\n");
  const r = remember(root, { content: "Anna Lind met the Acme Retail team about their spring newsletter.", people: ["Anna Lind"], context: "company" });
  assert.equal(r.status, 0, say(r));
  assert.doesNotMatch(say(r), /collide/);
  assert.doesNotMatch(say(r), /standing rule/);
});

test("the rules ride at the top of the first write of a chat, once", () => {
  const root = brain();
  appendFileSync(join(root, "RULES.md"), "\nNever promise workshop dates before the venue contract is signed.\n");
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "work", "session.json"), JSON.stringify({ session_id: "chat-standing-1", host: "codex" }));
  const first = remember(root, { content: "Anna Lind sent the spring newsletter draft to Acme Retail.", people: ["Anna Lind"], context: "company" });
  assert.equal(first.status, 0, say(first));
  assert.match(first.stdout, /^The team's rules \(shown once per chat/);
  assert.ok(first.stdout.indexOf("Never promise workshop dates") < first.stdout.indexOf("remembered m_"));
  const second = remember(root, { content: "Anna Lind booked the newsletter slot with Acme Retail.", people: ["Anna Lind"], context: "company" });
  assert.equal(second.status, 0, say(second));
  assert.doesNotMatch(second.stdout, /The team's rules/);
});

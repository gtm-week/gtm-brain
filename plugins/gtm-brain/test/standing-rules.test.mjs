// The team's standing rules reach Codex before any call (lib/standing-rules.mjs): a marked block at the top of the
// brain's AGENTS.md holds the "Our rules" lines of the rules file and every note saved with states_rule. Nothing is
// guessed from wording and no save is held on it; a look-alike note never replaces a kept one by itself; said_on
// dates a note by when it happened.
// Run: node --test plugins/gtm-brain/test/standing-rules.test.mjs
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-standing-codex-")), GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1",
  GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1" };
delete env.GTM_BRAIN_RUN;
process.env.CODEX_HOME = env.CODEX_HOME; process.env.GTM_BRAIN_NO_COMMIT = "1";
const S = await import(`${P}/lib/standing-rules.mjs`);
const lib = await import(`${P}/lib/brain.mjs`);
const { splitOwn } = await import(`${P}/lib/rule-pages.mjs`);

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-standing-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Northfold", "--one-liner", "events", "--owner", "Anna Lind <anna@northfold.test>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const remember = (root, entry) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, root, "--by", "anna-lind", "--batch", (() => { const f = join(root, "work", `b-${Math.random()}.json`); writeFileSync(f, JSON.stringify([entry])); return f; })()], { cwd: root, env, encoding: "utf8" });
const say = r => `${r.stdout}${r.stderr}`;
const agents = root => readFileSync(join(root, "AGENTS.md"), "utf8");
const memories = root => lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories));

test("a note saved with states_rule enters the AGENTS.md block; the person's own text stays", () => {
  const root = brain();
  appendFileSync(join(root, "AGENTS.md"), "\nOur own line: booth photos go to the shared drive.\n");
  const before = agents(root);
  assert.ok(!before.includes(S.RULES_START));
  const r = remember(root, { content: "Booth banners for trade fairs are printed by Northfold Print only.", kind: "decision", context: "company", states_rule: true });
  assert.equal(r.status, 0, say(r));
  assert.match(r.stdout, /kept as a team rule/);
  assert.match(r.stdout, /approve_change/);
  const text = agents(root);
  assert.ok(text.startsWith(S.RULES_START), text.slice(0, 200));
  assert.match(text, /## Our rules: check before saving or acting\nWhen a request may break one of these, do not save or act: name the rule and ask\./);
  assert.match(text, /### Stated in notes, not yet in the rules file\n- Booth banners for trade fairs are printed by Northfold Print only\. \(\d{4}-\d{2}-\d{2}, anna-lind, m_[0-9a-f]{12}\)/);
  assert.ok(text.includes("Our own line: booth photos go to the shared drive."));
  assert.equal(S.cutRulesBlock(text).text, before);   // outside the markers, word for word
  assert.equal(splitOwn(text).rules, splitOwn(before).rules);   // the upgrader still sees the shipped rules
  // a second refresh with nothing new writes nothing
  assert.equal(S.refreshRulesBlock(root), false);
});

test("a line under Our rules in the rules file enters the block at chat start", () => {
  const root = brain();
  appendFileSync(join(root, "RULES.md"), "\nNever promise workshop dates before the venue contract is signed.\n");
  execFileSync(process.execPath, [`${P}/session/start-lines.mjs`, root, "", `${P}/templates`], { cwd: root, env, encoding: "utf8" });
  const text = agents(root);
  assert.ok(text.startsWith(S.RULES_START));
  assert.match(text, /\n- Never promise workshop dates before the venue contract is signed\.\n/);
  assert.doesNotMatch(text, /Stated in notes/);
});

test("an ordinary sentence with from now on, saved without states_rule, is not a rule and holds nothing", () => {
  const root = brain();
  const first = remember(root, { content: "From now on Anna Lind runs the Acme Retail security review.", people: ["Anna Lind"], context: "company" });
  assert.equal(first.status, 0, say(first));
  assert.doesNotMatch(say(first), /team rule/);
  assert.ok(!agents(root).includes(S.RULES_START));
  assert.equal(S.collectRules(root).filter(r => !r.fromFile).length, 0);
  const later = remember(root, { content: "Anna Lind sent the Acme Retail security review questions.", people: ["Anna Lind"], context: "company" });
  assert.equal(later.status, 0, say(later));
  assert.doesNotMatch(say(later), /collide/);
});

test("two look-alike notes both stay in force: a replacement only through supersedes", () => {
  const root = brain();
  const a = remember(root, { content: "The Northfold booth at the Leipzig fair is 12 square metres.", context: "company" });
  assert.equal(a.status, 0, say(a));
  const b = remember(root, { content: "The Northfold booth at the Leipzig fair is 18 square metres.", context: "company" });
  assert.equal(b.status, 0, say(b));
  const now = memories(root).filter(m => /Leipzig fair is/.test(m.content));
  assert.equal(now.length, 2, JSON.stringify(now.map(m => m.content)));
  assert.ok(now.every(m => !m.supersedes));
});

test("said_on is kept and dates the note in the index and the search reply", () => {
  const root = brain();
  const r = remember(root, { content: "Acme Retail agreed to a pilot of the workshop kit.", companies: ["Acme Retail"], new_names: ["Acme Retail"], context: "company", said_on: "2026-06-12" });
  assert.equal(r.status, 0, say(r));
  const m = memories(root).find(x => /pilot of the workshop kit/.test(x.content));
  assert.ok(m.tags.includes("said:2026-06-12"), JSON.stringify(m.tags));
  assert.equal(lib.noteAt(m).slice(0, 10), "2026-06-12");
  assert.notEqual(m.at.slice(0, 10), "2026-06-12");
  const bad = remember(root, { content: "Acme Retail asked for the kit list.", context: "company", said_on: "June" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /said_on "June" is not a date/);
});

process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
process.env.GTM_BRAIN_NO_SESSION_START = "1";
// remember without a context: the loaded one, else where the note's people already have evidence, else held
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-profile-"));
const lib = await import(`${P}/lib/brain.mjs`);
const script = (skill, file) => `${P}/${existsSync(`${P}/scripts/gtm-brain-${skill}`) ? "scripts" : "skills"}/gtm-brain-${skill}/${file}`;
const env = { ...process.env, PLUGIN_ROOT: P };
const run = (root, skill, file, ...args) => execFileSync(file.endsWith(".sh") ? "bash" : process.execPath, [script(skill, file), ...(file.endsWith(".sh") ? [] : ["."]), ...args], { cwd: root, encoding: "utf8", env });
const remember = (root, ...args) => spawnSync(process.execPath, [script("remember", "remember.mjs"), ".", "--by", "marta", ...args], { cwd: root, encoding: "utf8", env });

const root = mkdtempSync(join(tmpdir(), "gtm-brain-ctx-"));
execFileSync("git", ["init", "-q", root]);
execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
run(root, "setup", "setup.sh", "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--tools", "Attio (CRM), Gmail");

test("a named context wins, and the person sees one short saved-in line", () => {
  run(root, "load", "load.mjs", "--clear");
  const r = remember(root, "--context", "market", "--people", "Pierre Aubert", "--content", "Pierre Aubert runs returns at Bergstrom.");
  assert.equal(r.status, 0, r.stderr);
  const title = lib.readContext(root, "market").title;
  assert.match(r.stdout, new RegExp(`^saved in ${title}: Pierre Aubert runs returns at Bergstrom\\.$`, "m"));
  assert.match(r.stdout, /remembered m_[0-9a-f]{12} in market · note/, "the detail line is still there for the model and the tests");
});

test("no context loaded or named: the one context where the people already have evidence", () => {
  run(root, "load", "load.mjs", "--clear");
  const r = remember(root, "--people", "Pierre Aubert", "--content", "Pierre Aubert wants the pilot in March 2027.");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /remembered m_[0-9a-f]{12} in market/);
  assert.doesNotMatch(r.stdout + r.stderr, /Load a context first/);
});

test("evidence in two contexts: held with both candidates, nothing written", () => {
  run(root, "load", "load.mjs", "--clear");
  assert.equal(remember(root, "--context", "icp", "--people", "Pierre Aubert", "--content", "Pierre Aubert fits the ICP.").status, 0);
  const before = lib.readMemories(root, "market").length + lib.readMemories(root, "icp").length;
  const r = remember(root, "--people", "Pierre Aubert", "--content", "Pierre Aubert called again.");
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /which context is this for: .*\(icp\) or .*\(market\)|which context is this for: .*\(market\) or .*\(icp\)/);
  assert.equal(lib.readMemories(root, "market").length + lib.readMemories(root, "icp").length, before);
});

test("no evidence and nothing loaded: held with the contexts listed, no guess", () => {
  run(root, "load", "load.mjs", "--clear");
  const r = remember(root, "--content", "The returns market grows in Poland.");
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /which context is this for: .*\(market\).*Nothing in the note points at one/);
  assert.match(r.stderr, /send it again with context: the slug/);
  assert.doesNotMatch(r.stderr, /wait for the reply/, "naming the context is the model's step, not a question for the person every time");
  const again = remember(root, "--context", "market", "--content", "The returns market grows in Poland.");
  assert.equal(again.status, 0, again.stderr + again.stdout);
});

test("a batch keeps the entries that have a home and holds the one that has none", () => {
  run(root, "load", "load.mjs", "--clear");
  const file = join(root, "work", "batch.json");
  execFileSync(process.execPath, ["-e", `require("fs").writeFileSync(${JSON.stringify(file)}, JSON.stringify([{ content: "Offer note one.", context: "offer" }, { content: "Unplaced note." }]))`]);
  const r = remember(root, "--batch", file);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /kept 1 of 2/);
  assert.match(r.stdout, /#1 saved in .*: Offer note one\./);
  assert.match(r.stdout, /#2 which context is this for/);
});

test("several loaded contexts still ask which one", () => {
  run(root, "load", "load.mjs", "icp", "--only"); run(root, "load", "load.mjs", "market");
  const r = remember(root, "--content", "A loose note.");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /which context is this for: .*Several contexts are loaded/);
});

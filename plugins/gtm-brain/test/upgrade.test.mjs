process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";
import { legacyTemplates, rulesWhy, rulesReasons } from "../lib/upgrade-files.mjs";
import { removeBrain } from "./helpers/dash-cleanup.mjs";

const plugin = new URL("../", import.meta.url).pathname;
function fixture(t, version = null) {
  const root = mkdtempSync(join(tmpdir(), "gtm-upgrade-release-"));
  t.after(() => removeBrain(root));
  const env = { ...process.env, CODEX_HOME: join(root, "profile"), GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const setup = spawnSync("bash", [join(plugin, "scripts/gtm-brain-setup/setup.sh"), "--company", "Upgrade Co", "--one-liner", "Testing", "--owner", "Ann Lee <ann@example.test>"], { cwd: root, env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  lib.appendMemory(root, "offer", { authors: ["ann-lee"], content: "Keep our negotiated price.", kind: "decision" });
  lib.appendMemory(root, "personal-ann-lee", { authors: ["ann-lee"], content: "Prefers short replies.", kind: "note" });
  lib.writeLoaded(root, ["offer", "personal-ann-lee"]);
  lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "Onboarding: completed v1 on 2026-09-05." });
  const project = join(root, "projects/site"); mkdirSync(project, { recursive: true });
  lib.writePointer(project, { brain: root, slug: "site", title: "Site", company: "Upgrade Co", inside: true });
  lib.writeProjects(root, [{ slug: "site", path: project, title: "Site", contexts: ["offer"] }]);
  lib.writeLoaded(root, ["offer"], "site");
  writeFileSync(join(root, "work/tools.json"), JSON.stringify({ gmail: { connected: true }, hubspot: { declined: true } }));
  if (version) writeFileSync(join(root, "AGENTS.md"), readFileSync(join(plugin, "templates/legacy", legacyTemplates[version]), "utf8").replaceAll("{{COMPANY}}", "Upgrade Co"));
  const run = () => spawnSync("bash", [join(plugin, "scripts/gtm-brain-upgrade/upgrade.sh"), root], { cwd: root, env, encoding: "utf8" });
  return { root, run, env };
}
function snapshot(root) {
  return Object.fromEntries(readdirSync(join(root, "brain"), { recursive: true, withFileTypes: true })
    .filter(e => e.isFile()).map(e => {
      const path = join(e.parentPath, e.name);
      return [path, readFileSync(path).toString("base64")];
    }));
}
test("every legacy snapshot is covered by the compatibility manifest", () => {
  const files = [...new Set(Object.values(legacyTemplates))];
  for (const file of files) assert.match(file, /^AGENTS-[\w.-]+\.md$/);
  assert.deepEqual(files.sort(), readdirSync(join(plugin, "templates/legacy")).filter(file => file.endsWith(".md")).sort());
});
test("freshly onboarded current brain can be refreshed repeatedly without migration or lost choices", t => {
  const { root, run } = fixture(t);
  const before = snapshot(root);
  const paths = ["AGENTS.md", ".githooks/pre-commit", ".gitignore", "work/tools.json", "work/projects.json", "projects/site/AGENTS.md"];
  const files = paths.map(file => readFileSync(join(root, file), "utf8"));
  for (let i = 0; i < 2; i++) {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /already current/);
    assert.deepEqual(snapshot(root), before);
    assert.deepEqual(paths.map(file => readFileSync(join(root, file), "utf8")), files);
    assert.deepEqual(lib.readLoaded(root), ["offer", "personal-ann-lee"]);
    assert.deepEqual(lib.readLoaded(root, "site"), ["offer"]);
  assert.equal(lib.readMemories(root, "personal-ann-lee").at(-1).content, "Prefers short replies.");
    assert.equal(lib.readOnboarding(root).status, "completed");
    assert.equal(lib.readOnboarding(root).required, false);
    assert.equal(existsSync(join(root, "work/upgrades")), false);
    assert.equal(existsSync(join(root, "work/entity-migration")), false);
  }
});
for (const version of Object.keys(legacyTemplates)) test(`${version} rules upgrade preserves brain bytes, backs up instructions, renders and repeats safely`, t => {
  const { root, run, env } = fixture(t, version);
  const toolsBefore = readFileSync(join(root, "work/tools.json"), "utf8"), loadedBefore = lib.readLoaded(root);
  const before = snapshot(root), oldRules = readFileSync(join(root, "AGENTS.md"), "utf8");
  const projects = lib.readProjects(root), projectRules = readFileSync(join(root, "projects/site/AGENTS.md"), "utf8");
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(lib.readProjects(root), projects);
  assert.deepEqual(lib.readLoaded(root, "site"), ["offer"]);
  assert.equal(readFileSync(join(root, "projects/site/AGENTS.md"), "utf8"), projectRules);
  assert.equal(lib.readOnboarding(root).status, "completed");
  assert.equal(lib.readOnboarding(root).required, false);
  assert.doesNotMatch(lib.onboardingInstruction(root), /ONBOARDING |Resume link:/);
  assert.equal(readFileSync(join(root, "work/tools.json"), "utf8"), toolsBefore);
  assert.deepEqual(lib.readLoaded(root), loadedBefore);
  assert.equal(lib.readMemories(root, "personal-ann-lee").at(-1).content, "Prefers short replies.");
  const backups = join(root, "work/upgrades"), backup = readdirSync(backups)[0];
  assert.equal(readFileSync(join(backups, backup, "AGENTS.md"), "utf8"), oldRules);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), readFileSync(join(plugin, "templates/AGENTS.md"), "utf8").replaceAll("{{COMPANY}}", "Upgrade Co"));
  assert.match(run().stdout, /already current/);
  assert.deepEqual(snapshot(root), before);
  const rendered = spawnSync(process.execPath, [join(plugin, "scripts/gtm-brain-render/render.mjs"), root], { env, encoding: "utf8" });
  assert.equal(rendered.status, 0, rendered.stderr);
  const data = JSON.parse(readFileSync(join(root, "work/home/data.json"), "utf8"));
  assert.ok(data.entityGraph);
  assert.equal(data.onboarding.required, false, 'upgrading old rules must not restore the onboarding card');
  assert.deepEqual(snapshot(root), before);
});
test("malformed editable identities stop before replacing rules, hook or gitignore; repair permits retry", t => {
  const { root, run } = fixture(t, "0.11.15");
  const entity = lib.readNames(root).find(e => e._path), path = join(root, entity._path);
  const original = readFileSync(path, "utf8");
  const invalid = original.replace(/^aliases:.*$/m, 'aliases: "not a list"');
  assert.notEqual(invalid, original);
  writeFileSync(path, invalid);
  const before = snapshot(root), files = ["AGENTS.md", ".githooks/pre-commit", ".gitignore"];
  const instructions = files.map(file => readFileSync(join(root, file), "utf8"));
  const failed = run();
  assert.notEqual(failed.status, 0);
  assert.ok(failed.stderr.includes(entity._path), failed.stderr);
  assert.match(failed.stderr, /aliases/);
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(files.map(file => readFileSync(join(root, file), "utf8")), instructions);
  assert.equal(existsSync(join(root, "work/upgrades")), false);
  // Simulate the person's repair, then retry the same refresh.
  writeFileSync(path, original);
  const repaired = run();
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.match(run().stdout, /already current/);
});
test("legacy registry and v1 files upgrade together without losing IDs, source history or handwritten notes", t => {
  const { root, run } = fixture(t, "0.11.15");
  const person = lib.readNames(root).find(e => e.name === "Ann Lee");
  const path = join(root, person._path);
  const handwritten = readFileSync(path, "utf8").replace("gtm-brain-entity-v2", "gtm-brain-entity-v1") + "\nHandwritten meeting preparation: keep this paragraph.\n";
  writeFileSync(path, handwritten);
  const registry = "# Names\n\nPreserve this original registry prose.\n\n- Acme | kind: company | aliases: Acme Labs\n";
  writeFileSync(join(root, "brain/names.md"), registry);
  const acme = lib.readNames(root).find(e => e.name === "Acme");
  lib.appendMemory(root, "offer", { authors: ["ann-lee"], content: "Acme agreed the original terms.", people: ["Acme"], source: [{ kind: "manual", ref: "original-terms" }] });
  const before = snapshot(root);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  for (const [file, bytes] of Object.entries(before).filter(([file]) => !file.includes("/entities/") && !file.endsWith("/names.md"))) {
    assert.equal(readFileSync(file).toString("base64"), bytes, file);
  }
  const names = lib.readNames(root);
  assert.equal(lib.resolveEntity(names, acme.id).name, "Acme");
  assert.equal(lib.resolveEntity(names, "Acme Labs").id, acme.id);
  assert.equal(lib.resolveEntity(names, person.id)._path, person._path);
  assert.match(readFileSync(path, "utf8"), /Handwritten meeting preparation: keep this paragraph/);
  const backups = join(root, "work/entity-migration");
  const saved = readdirSync(backups, { recursive: true, withFileTypes: true }).filter(e => e.isFile())
    .map(e => readFileSync(join(e.parentPath, e.name), "utf8"));
  assert.ok(saved.includes(registry)); assert.ok(saved.includes(handwritten));
  const migrated = snapshot(root);
  assert.match(run().stdout, /already current/);
  assert.deepEqual(snapshot(root), migrated);
  const recall = lib.entityBrief(root, acme.id);
  assert.ok(JSON.stringify(recall).includes("original-terms"));
});
test("entity files written before the GTM OS rename stay readable and upgrade to the current format", t => {
  const { root, run } = fixture(t);
  const person = lib.readNames(root).find(e => e.name === "Ann Lee");
  const path = join(root, person._path);
  for (const old of ["gtm-os-entity-v2", "gtm-os-entity-v1"]) {
    writeFileSync(path, readFileSync(path, "utf8").replace(/^format: .*$/m, `format: ${old}`));
    assert.equal(lib.resolveEntity(lib.readNames(root), person.id).name, "Ann Lee");
  }
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(path, "utf8"), new RegExp(`^format: ${lib.ENTITY_FORMAT}$`, "m"));
  assert.equal(lib.resolveEntity(lib.readNames(root), person.id)._path, person._path);
});
test("custom instructions are preserved and a proposed replacement is prepared without partial upgrade", t => {
  const { root, run } = fixture(t);
  const custom = readFileSync(join(root, "AGENTS.md"), "utf8") + "\nKeep customer attachments local.\n";
  writeFileSync(join(root, "AGENTS.md"), custom);
  const before = snapshot(root), hook = readFileSync(join(root, ".githooks/pre-commit"), "utf8");
  const result = run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Nothing replaced/);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), custom);
  assert.equal(readFileSync(join(root, ".githooks/pre-commit"), "utf8"), hook);
  assert.deepEqual(snapshot(root), before);
  const folder = join(root, "work/upgrades"), backup = readdirSync(folder)[0];
  assert.ok(readFileSync(join(folder, backup, "AGENTS.proposed.md"), "utf8").includes("Operational answers"));
});

test("the session hook says when a brain's rules are from an older GTM Brain, and stays quiet when they are current (ALL-204 step 2a)", t => {
  const legacy = fixture(t, "0.17.5"), current = fixture(t);
  const hook = f => spawnSync("bash", [join(plugin, "hooks/session-start.sh")], { cwd: f.root, env: { ...f.env, PLUGIN_ROOT: plugin, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" }, encoding: "utf8", input: JSON.stringify({ session_id: "r", cwd: f.root }) }).stdout;
  assert.match(hook(legacy), /are from GTM Brain 0\.17\.5\. What the newer rules change: [^\n]*script cell[^\n]*refresh the rules/);
  assert.doesNotMatch(hook(current), /rules \(AGENTS\.md\) are from/);
});

test("an offer to refresh the rules always says why: every rule change since the brain's version, oldest first", t => {
  // The newest snapshot is the rules the next release replaced; that release must say what it changed.
  const versions = Object.keys(legacyTemplates), parts = v => v.split(/[^0-9]+/).filter(Boolean).map(Number);
  const gt = (a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
  const newest = versions.reduce((a, b) => (gt(b, a) ? b : a));
  assert.ok(Object.keys(rulesWhy).some(v => gt(v, newest)), `templates/legacy/why.json needs a line for the release after ${newest}: what its rules change`);
  const f = fixture(t, "0.27.0");
  const { from, reasons } = rulesReasons(f.root, join(plugin, "templates"));
  assert.equal(from, "0.27.0");
  assert.deepEqual(reasons, Object.keys(rulesWhy).filter(v => gt(v, "0.27.0")).sort((a, b) => (gt(a, b) ? 1 : -1)).map(v => rulesWhy[v]), "every change since 0.27.0, oldest first");
  assert.equal(reasons[0], rulesWhy["0.27.1"]);
  const r = f.run(); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /why \(rules from 0\.27\.0\): newer Codex runs GTM OS tools only inside a script cell/);
  assert.deepEqual(rulesReasons(f.root, join(plugin, "templates")).reasons, [], "refreshed rules are current: nothing to explain");
});

test("upgrade moves brain/guidelines/*.md to root documents, keeps a slug the root already has, adds README.md", t => {
  const { root, run } = fixture(t);
  mkdirSync(join(root, "brain", "guidelines"), { recursive: true });
  writeFileSync(join(root, "brain", "guidelines", "tone-of-voice.md"), "---\ntitle: Tone of voice\napplies_to: [copy, posts]\nstatus: approved\nby: marta-nowak\nupdated: 2026-09-17\ngtm-brain: 0.23.0\n---\n# Tone of voice\n\nMade with GTM Brain. This guideline lives in the brain's guidelines folder and travels with the brain.\n\nNo exclamation points.\n");
  writeFileSync(join(root, "brain", "guidelines", "strategy.md"), "---\ntitle: Strategy\napplies_to: [planning]\nstatus: draft\n---\n# Strategy\n\nOld.\n");
  writeFileSync(join(root, "strategy.md"), "# Strategy\n\nWritten by hand, newer.\n");
  rmSync(join(root, "README.md"), { force: true });
  const result = run(); assert.equal(result.status, 0, result.stderr); const out = result.stdout;
  assert.match(out, /moved brain\/guidelines\/tone-of-voice\.md -> tone-of-voice\.md/);
  assert.match(out, /kept brain\/guidelines\/strategy\.md: strategy\.md already exists at the root/);
  assert.match(out, /added README\.md/);
  const moved = readFileSync(join(root, "tone-of-voice.md"), "utf8");
  assert.match(moved, /^kind: document$/m); assert.match(moved, /^status: approved$/m); assert.match(moved, /No exclamation points\./); assert.equal(moved.split("# Tone of voice").length, 2);
  assert.ok(!existsSync(join(root, "brain", "guidelines", "tone-of-voice.md")));
  assert.ok(existsSync(join(root, "brain", "guidelines", "strategy.md")));
  assert.equal(readFileSync(join(root, "strategy.md"), "utf8"), "# Strategy\n\nWritten by hand, newer.\n");
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /^# Upgrade Co brain/m);
  assert.equal(run().stdout.includes("moved"), false);
});

test("upgrade adds the strategy document a pre-0.27 brain lacks and ends with a report of what it did and what stays", t => {
  const { root, run } = fixture(t);
  rmSync(join(root, "strategy.md"), { force: true });
  mkdirSync(join(root, "brain", "guidelines"), { recursive: true });
  writeFileSync(join(root, "brain", "guidelines", "voice.md"), "---\ntitle: Voice\napplies_to: [copy]\nstatus: draft\n---\n# Voice\n\nShort.\n");
  mkdirSync(join(root, "files", "2026-08"), { recursive: true }); writeFileSync(join(root, "files", "2026-08", "deck.pdf"), "pdf"); writeFileSync(join(root, "files", "2026-08", "logo.svg"), "<svg/>");
  mkdirSync(join(root, "company")); mkdirSync(join(root, "assets"));
  const out = run().stdout;
  assert.match(out, /added strategy\.md/);
  const strategy = readFileSync(join(root, "strategy.md"), "utf8");
  assert.match(strategy, /^kind: document$/m); assert.match(strategy, /^title: Strategy$/m); assert.match(strategy, /Upgrade Co/); assert.match(strategy, /run the strategic intake/);
  assert.match(out, /upgrade report:/);
  assert.match(out, /moved 1 guideline to the root as a document/);
  assert.match(out, /2 files in files\/ from before 0\.27 stay where they are; their links keep working/);
  assert.match(out, /folders at the top GTM Brain does not use: assets\/, company\//);
  const again = run().stdout;
  assert.doesNotMatch(again, /added strategy\.md/); assert.doesNotMatch(again, /moved 1 guideline/);
});

test("upgrade pulls a document into the folder of its own name that sits beside it, and says so", t => {
  const { root, run } = fixture(t);
  writeFileSync(join(root, "design-system.md"), "---\nkind: document\ntitle: Design system\napplies_to: [design]\nstatus: approved\n---\n# Design system\n\nBlue.\n");
  mkdirSync(join(root, "design-system")); writeFileSync(join(root, "design-system", "colors.md"), "---\nkind: document\ntitle: Colors\napplies_to: [design]\nstatus: draft\n---\n# Colors\n\nTeal.\n");
  const out = run().stdout;
  assert.match(out, /moved design-system\.md into design-system\//);
  assert.ok(!existsSync(join(root, "design-system.md"))); assert.match(readFileSync(join(root, "design-system", "design-system.md"), "utf8"), /^status: approved$/m);
  assert.doesNotMatch(run().stdout, /moved design-system\.md/, "a second run has nothing to move");
});

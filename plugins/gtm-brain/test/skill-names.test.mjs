// 0.36: the shipped skills are gtmb-<name>. The plugin holds no old name outside its history, and a brain made
// on an older version is told once, at a chat start, which of its own files still use the old names; they are
// rewritten only by upgrade_brain with skill_names: true.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, ""), REPO = join(P, "..", "..");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-home-"));
const names = await import(`${P}/lib/skill-names.mjs`);

test("every shipped skill is gtmb-<name>, and the list of renamed skills is the list on disk", () => {
  const dirs = readdirSync(join(P, "skills")).filter(d => existsSync(join(P, "skills", d, "SKILL.md")));
  assert.deepEqual(dirs.map(d => d.replace(/^gtmb-/, "")).sort(), names.SHIPPED);
  assert.equal(names.RENAMED.length, 26, "the 26 names of 0.35 stay listed: they are what an old brain says");
  for (const d of dirs) { assert.match(d, /^gtmb-[a-z-]+$/); assert.match(readFileSync(join(P, "skills", d, "SKILL.md"), "utf8"), new RegExp(`^name: ${d}$`, "m")); }
  // operation scripts keep their folders, the old script path under skills/ stays
  assert.ok(existsSync(join(P, "scripts", "gtm-brain-workflow", "workflow.mjs"))); assert.ok(existsSync(join(P, "skills", "gtm-brain-add-file", "add-file.mjs")));
});

test("no file that ships or documents the plugin still names a skill the old way", () => {
  const files = execFileSync("git", ["-C", REPO, "ls-files"], { encoding: "utf8" }).split("\n").filter(f => f && /\.(md|mjs|json|yaml|html|sh|ts|tsx)$/.test(f)
    && !/templates\/legacy\/|scripts\/gtm-brain-render\/ui\/|^docs\/releases\/RELEASE-0\.35\.md$|test\/e2e\/(validation|release)-|test\/skill-names\.test\.mjs$|lib\/skill-names\.mjs$|scripts\/gtm-brain-upgrade\/skill-names\.mjs$/.test(f));
  const left = [];
  for (const f of files) { let t; try { t = readFileSync(join(REPO, f), "utf8"); } catch { continue; }
    // the upgrade guide names the old commands on purpose, in its own section
    if (f === "plugins/gtm-brain/MANUAL.md") t = t.replace(/## Updating to 0\.36[\s\S]*?(?=\n## Updating to 0\.35)/, "");
    // the server runs the workflow operation script by its folder name, which is not a skill
    if (f === "plugins/gtm-brain/server/server.mjs") t = t.replaceAll('run(brain, "gtm-brain-workflow/workflow.mjs"', "");
    if (f === "README.md") t = t.replace(/Until 0\.35 the skills were named `\/gtm-brain-<name>`/, "");
    if (names.hasOldSkillNames(t)) left.push(f); }
  assert.deepEqual(left, []);
});

test("an old name is read as the new one; scripts and a team's own skill keep theirs", () => {
  assert.equal(names.currentSkillName("/gtm-brain-rules"), "/gtmb-rules");
  assert.equal(names.renameSkillNames("run /gtm-brain-define-icp, then gtm-brain-workflow."), "run /gtmb-icp, then gtmb-workflow.");
  assert.equal(names.renameSkillNames("scripts/gtm-brain-workflow/workflow.mjs"), "scripts/gtm-brain-workflow/workflow.mjs");
  // 0.36.1: each base document's command is named after it, from either older spelling
  assert.equal(names.renameSkillNames("/gtm-brain-" + "define-icp then /gtmb-" + "define-icp"), "/gtmb-icp then /gtmb-icp");
  assert.equal(names.currentSkillName("/gtmb-" + "market-desk-research"), "/gtmb-market-research");
  assert.equal(names.currentSkillName("/gtm-brain-" + "market-desk-research"), "/gtmb-market-research");
  assert.equal(names.renameSkillNames("/gtmb-market and /gtmb-icp"), "/gtmb-market and /gtmb-icp");
  assert.equal(names.renameSkillNames("gtm-brain-weekly-pipeline and gtm-brain-skills and gtm-brain-starter"), "gtm-brain-weekly-pipeline and gtm-brain-skills and gtm-brain-starter");
});

test("a brain from an older version: the chat start names its files, upgrade_brain's script rewrites them on a yes, notes stay", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-names-")); execFileSync("git", ["init", "-q", root]);
  const env = { ...process.env, PLUGIN_ROOT: P };
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Week", "--one-liner", "events", "--owner", "Ann Lee <ann@week.test>"], { cwd: root, env });
  assert.equal(names.skillNamesLine(root), "", "a brain set up on this version has nothing to update");
  writeFileSync(join(root, "README.md"), readFileSync(join(root, "README.md"), "utf8") + "\nTo add a rule type /gtm-brain-rules.\n");
  mkdirSync(join(root, "workflows"), { recursive: true }); writeFileSync(join(root, "workflows", "handover.md"), "# Handover\n\nStart with /gtm-brain-todo, then gtm-brain-sync.\n");
  mkdirSync(join(root, ".agents/skills/gtm-brain-weekly-pipeline"), { recursive: true });
  writeFileSync(join(root, ".agents/skills/gtm-brain-weekly-pipeline/SKILL.md"), "---\nname: gtm-brain-weekly-pipeline\ndescription: weekly pipeline\n---\nRuns after gtm-brain-sync.\n");
  const rem = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", "--content", "We told the team to type /gtm-brain-rules."], { cwd: root, env: { ...env, GTM_BRAIN_NO_COMPILE: "1" }, encoding: "utf8" });
  assert.equal(rem.status, 0, rem.stderr);
  execFileSync("git", ["-C", root, "add", "-A"]); execFileSync("git", ["-C", root, "-c", "user.email=ann@week.test", "-c", "user.name=Ann", "commit", "-qm", "old names"]);
  const files = names.filesWithOldSkillNames(root);
  assert.deepEqual(files.sort(), [".agents/skills/gtm-brain-weekly-pipeline/SKILL.md", "README.md", "workflows/handover.md"]);
  const line = names.skillNamesLine(root);
  assert.match(line, /\/gtm-brain-<name> is now \/gtmb-<name>/); assert.match(line, /3 of this brain's own files/); assert.match(line, /only on yes call upgrade_brain with skill_names: true/);
  assert.equal(names.skillNamesLine.call(null, root).includes("Notes are never rewritten"), true);
  const list = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-upgrade/skill-names.mjs`, "."], { cwd: root, env, encoding: "utf8" });
  assert.match(list.stdout, /3 files still use the old skill names[\s\S]*Nothing was changed/);
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /\/gtm-brain-rules/, "listing changes nothing");
  const done = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-upgrade/skill-names.mjs`, ".", "--apply"], { cwd: root, env, encoding: "utf8" });
  assert.equal(done.status, 0, done.stderr); assert.match(done.stdout, /Updated the skill names in /);
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /type \/gtmb-rules\./);
  assert.match(readFileSync(join(root, "workflows", "handover.md"), "utf8"), /\/gtmb-todo, then gtmb-sync/);
  const made = readFileSync(join(root, ".agents/skills/gtm-brain-weekly-pipeline/SKILL.md"), "utf8");
  assert.match(made, /^name: gtm-brain-weekly-pipeline$/m, "the team's own skill keeps its name"); assert.match(made, /Runs after gtmb-sync/);
  const lib = await_lib();
  assert.ok(lib.readMemories(root, "company").some(m => /\/gtm-brain-rules/.test(m.content)), "a note is never rewritten");
  assert.equal(names.skillNamesLine(root), "", "nothing left to offer");
  assert.equal(execFileSync("git", ["-C", root, "status", "--porcelain", "--", "README.md", "workflows"], { encoding: "utf8" }), "", "the rewrite is committed");
});
const libModule = await import(`${P}/lib/brain.mjs`);
function await_lib() { return libModule; }

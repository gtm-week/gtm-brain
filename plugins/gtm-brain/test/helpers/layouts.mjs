// Brains in each file layout, for the tests: setup makes layout 4 (configuration/, entities/, memories/), or layout 3
// (about-us/ and config/) when asked; toLayout2 turns a layout 3 one
// into what a 0.35 brain before this release keeps (brain/admin.md, RULES.md, SCHEMA.md and the base files at the
// root, entity pages in kind folders); toLayout1 then flattens the entity pages as 0.34 kept them. Committed.
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import * as lib from "../../lib/brain.mjs";
import { LAYOUT_FILE } from "../../lib/layout-version.mjs";
import { STARTERS } from "../../lib/upgrade-files.mjs";
import { rulesInFolders } from "../../lib/where.mjs";
import { removeBrain } from "./dash-cleanup.mjs";

export const P = new URL("../../", import.meta.url).pathname;

/* A brain made by setup. layout: the layout setup makes it in (4 by default: configuration/, entities/, memories/;
   3: about-us/ and config/, as before layout 4). A test file that pins GTM_BRAIN_TEST_LAYOUT (it plays the plugin
   from before a layout) gets that layout and keeps the pin in every script it runs; otherwise the scripts run as
   the current plugin, whatever the brain's layout. toLayout2 and toLayout1 take a layout 3 brain further back. */
export function makeBrain(t, { prefix = "gtm-layout-", env: more = {}, layout = Number(process.env.GTM_BRAIN_TEST_LAYOUT) || 4 } = {}) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => removeBrain(root));
  const pinned = process.env.GTM_BRAIN_TEST_LAYOUT;
  const env = { ...process.env, CODEX_HOME: join(root, "profile"), GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", NODE_NO_WARNINGS: "1", ...more };
  delete env.GTM_BRAIN_RUN; delete env.GTM_BRAIN_NO_COMMIT; delete env.GTM_BRAIN_TEST_LAYOUT;
  if (pinned) env.GTM_BRAIN_TEST_LAYOUT = pinned;
  const setup = spawnSync("bash", [join(P, "scripts/gtm-brain-setup/setup.sh"), "--company", "Layout Co", "--one-liner", "Returns software: for shops", "--owner", "Ann Lee <ann@example.test>", "--team", "Bo Chen <bo@example.test>"], { cwd: root, env: layout < 4 ? { ...env, GTM_BRAIN_TEST_LAYOUT: String(Math.max(layout, 3)) } : env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
  const upgrade = (...a) => spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root, ...a], { cwd: root, env, encoding: "utf8" });
  const run = (script, args, extra = {}) => spawnSync(process.execPath, [join(P, script), root, ...args], { cwd: root, env: { ...env, ...extra }, encoding: "utf8" });
  if (layout <= 2) toLayout2(root, git);
  if (layout === 1) toLayout1(root, git);
  assert.equal(lib.diskLayout(root), layout, `a layout ${layout} brain`);
  return { root, env, git, upgrade, run, layout };
}
/* Where a brain of this layout keeps things, for tests that run on more than one layout. */
export const dirs = root => ({ C: lib.configDir(root), A: lib.aboutDir(root), W: lib.workName(root), E: lib.entitiesDir(root), settings: lib.settingsFile(root), rules: lib.rulesFile(root), schema: lib.schemaFile(root) });

/* The person in this checkout: work/person.json (null: the brain's git email, the owner Ann). */
export function actAs(root, handle) {
  const f = join(lib.workDir(root), "person.json");
  if (handle) { mkdirSync(lib.workDir(root), { recursive: true }); writeFileSync(f, JSON.stringify({ handle }) + "\n"); } else rmSync(f, { force: true });
}

/* Layout 3 back to layout 2, as a 0.35 brain before this release keeps it. */
export function toLayout2(root, git) {
  const about = join(root, "about-us");
  for (const f of readdirSync(about)) renameSync(join(about, f), join(root, f));
  rmSync(about, { recursive: true, force: true });
  // the rules as a layout 2 brain has them: the shipped wording, where setup wrote the layout 3 one
  const rules = readFileSync(join(root, "config/rules.md"), "utf8"), shipped = readFileSync(join(P, "templates/RULES.md"), "utf8");
  rmSync(join(root, "config/rules.md")); writeFileSync(join(root, "RULES.md"), rules === rulesInFolders(shipped) ? shipped : rules);
  renameSync(join(root, "config/schema.md"), join(root, "SCHEMA.md"));
  const a = lib.readAdmin(root);
  const fm = { company: a.company, created: a.created, owner: a.owner, team: a.team, tools: a.tools, dashboard: a.dashboard, deal_scoring: a.deal_scoring, big_files: a.big_files, protected: a.protected };
  writeFileSync(join(root, "brain/admin.md"), `${lib.renderFrontmatter(fm)}\n${a.body}\n`);
  rmSync(join(root, "config"), { recursive: true, force: true });
  writeFileSync(join(root, "README.md"), readFileSync(join(P, "templates/README.md"), "utf8").replaceAll("{{COMPANY}}", a.company));
  writeFileSync(join(root, LAYOUT_FILE), JSON.stringify({ layout: 2, starters: [...STARTERS].sort() }, null, 2) + "\n");
  git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "a brain from before layout 3");
  assert.equal(lib.inConfigFolders(root), false);
}

/* Layout 2 to layout 1: entity pages flat in brain/entities, as 0.34 kept them. */
export function toLayout1(root, git) {
  for (const p of lib.entityPagePaths(root)) {
    const to = `brain/entities/${p.split("/").pop().replace(/-[0-9a-f]{6}\.md$/, "")}.md`;
    writeFileSync(join(root, to), readFileSync(join(root, p), "utf8").replace(/\]\(\.\.\/\.\.\/contexts\//g, "](../contexts/")); rmSync(join(root, p));
  }
  for (const d of readdirSync(join(root, "brain/entities"), { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith(".")) rmSync(join(root, "brain/entities", d.name), { recursive: true });
  writeFileSync(join(root, LAYOUT_FILE), JSON.stringify({ layout: 1, starters: [...STARTERS].sort() }, null, 2) + "\n");
  git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-qm", "a brain from before 0.35: flat entity pages");
  assert.equal(lib.entityLayout(root), "flat");
}

/* Every file outside work/, .git/ and the test's profile, by content. */
export function tree(root) {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile()).map(e => join(e.parentPath, e.name).slice(root.length + 1))
    .filter(p => !/^(work|\.gtm-brain|\.git|profile)\//.test(p)).sort().map(p => [p, readFileSync(join(root, p), "utf8")]));
}
export const exists = (root, p) => existsSync(join(root, p));

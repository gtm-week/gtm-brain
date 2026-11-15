// Brains in each file layout, for the tests: setup makes layout 3 (about-us/ and config/); toLayout2 turns one
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
import { removeBrain } from "./dash-cleanup.mjs";

export const P = new URL("../../", import.meta.url).pathname;

export function makeBrain(t, { prefix = "gtm-layout3-", env: more = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => removeBrain(root));
  const env = { ...process.env, CODEX_HOME: join(root, "profile"), GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", NODE_NO_WARNINGS: "1", ...more };
  delete env.GTM_BRAIN_RUN; delete env.GTM_BRAIN_NO_COMMIT; delete env.GTM_BRAIN_TEST_LAYOUT;
  const setup = spawnSync("bash", [join(P, "scripts/gtm-brain-setup/setup.sh"), "--company", "Layout Co", "--one-liner", "Returns software: for shops", "--owner", "Ann Lee <ann@example.test>", "--team", "Bo Chen <bo@example.test>"], { cwd: root, env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
  const upgrade = (...a) => spawnSync("bash", [join(P, "scripts/gtm-brain-upgrade/upgrade.sh"), root, ...a], { cwd: root, env, encoding: "utf8" });
  const run = (script, args, extra = {}) => spawnSync(process.execPath, [join(P, script), root, ...args], { cwd: root, env: { ...env, ...extra }, encoding: "utf8" });
  return { root, env, git, upgrade, run };
}

/* The person in this checkout: work/person.json (null: the brain's git email, the owner Ann). */
export function actAs(root, handle) {
  const f = join(root, "work", "person.json");
  if (handle) { mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(f, JSON.stringify({ handle }) + "\n"); } else rmSync(f, { force: true });
}

/* Layout 3 back to layout 2, as a 0.35 brain before this release keeps it. */
export function toLayout2(root, git) {
  const about = join(root, "about-us");
  for (const f of readdirSync(about)) renameSync(join(about, f), join(root, f));
  rmSync(about, { recursive: true, force: true });
  renameSync(join(root, "config/rules.md"), join(root, "RULES.md"));
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
    .filter(p => !/^(work|\.git|profile)\//.test(p)).sort().map(p => [p, readFileSync(join(root, p), "utf8")]));
}
export const exists = (root, p) => existsSync(join(root, p));

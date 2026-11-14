import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
const P = new URL("../", import.meta.url).pathname;
const bundle = join(P, "starters/web-design-system");
const revision = "92882ac4a37364f9bc7549dfc4f73c3b5e1d7110";
const workflows = ["build-design-system", "add-section", "build-landing-page", "deploy-vercel"];
const read = path => readFileSync(path, "utf8");
const json = path => JSON.parse(read(path));
const lib = await import(`${P}lib/brain.mjs`);
const userSkills = await import(`${P}lib/user-skills.mjs`);
const starter = async () => import(`${P}lib/web-starter.mjs`);
const env = { ...process.env, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_HOOK_CHECK: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GIT_AUTHOR_NAME: "Starter Test", GIT_AUTHOR_EMAIL: "starter@example.invalid", GIT_COMMITTER_NAME: "Starter Test", GIT_COMMITTER_EMAIL: "starter@example.invalid" };
function fixture(t) {
  const scratch = mkdtempSync(join(tmpdir(), "gtm-web-starter-")), root = join(scratch, "company");
  mkdirSync(join(root, "brain"), { recursive: true });
  writeFileSync(join(root, "brain/admin.md"), lib.renderFrontmatter({ company: "Starter Fixture", team: [{ name: "Starter Test", handle: "starter", email: "starter@example.invalid" }] }));
  execFileSync("git", ["init", "-q", root]);
  t.after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return { scratch, root, path: join(root, "website"), env: { ...env, CODEX_HOME: join(scratch, "profile"), GTM_BRAIN_NO_RENDER: "1" } };
}
function run(f, ...args) {
  return spawnSync(process.execPath, [join(P, "skills/gtm-brain-project/project.mjs"), f.root, "--link", f.path, ...args], { env: f.env, encoding: "utf8" });
}
const create = f => run(f, "--create", "--starter", "web-design-system");

test("the web starter ships a preservation manifest and shared scaffold library", () => {
  assert.ok(existsSync(`${P}starters/web-design-system/source.json`), "pinned preservation manifest");
  assert.ok(existsSync(`${P}lib/web-starter.mjs`), "shared scaffold library");
});

test("the bundled source is byte-identical to the pinned manifest and rejects tampering", async t => {
  const s = await starter(), manifest = s.verifyBundledStarter();
  assert.equal(manifest.revision, revision);
  assert.ok(Object.keys(manifest.files).length > 50);
  const f = fixture(t), copy = join(f.scratch, "bundle"); cpSync(bundle, copy, { recursive: true });
  writeFileSync(join(copy, "source/src/styles/global.css"), "changed\n");
  assert.throws(() => s.verifyBundledStarter(copy), /global\.css/);
});

test("creation preserves Brian's source except the exact packaging allowlist and creates independent local history", async t => {
  const f = fixture(t), result = create(f); assert.equal(result.status, 0, result.stderr);
  const s = await starter(); s.verifyPreparedStarter(f.path);
  for (const name of workflows) assert.equal(read(join(f.path, "docs/workflows", name, "SKILL.md")), read(join(bundle, "source/.agents/skills", name, "SKILL.md")));
  assert.equal(existsSync(join(f.path, ".agents/skills/build-design-system")), false);
  const original = json(join(bundle, "source/package.json")), packaged = json(join(f.path, "package.json"));
  delete original.scripts.postinstall; assert.deepEqual(packaged, original);
  const lock = json(join(bundle, "source/package-lock.json")); delete lock.packages[""].hasInstallScript;
  assert.deepEqual(json(join(f.path, "package-lock.json")), lock);
  for (const file of ["scripts/setup-skills.mjs", "CLAUDE.md", "src/styles/global.css", "docs/design.md", "LICENSE"]) assert.equal(read(join(f.path, file)), read(join(bundle, "source", file)));
  assert.ok(read(join(f.path, "AGENTS.md")).startsWith(read(join(bundle, "source/AGENTS.md")).trimEnd()));
  assert.match(read(join(f.path, "AGENTS.md")), /Read .*AGENTS\.md first/);
  assert.equal(lib.readProjects(f.root).length, 1);
  assert.equal(lib.resolveBrain(f.path).project, "website");
  assert.equal(execFileSync("git", ["-C", f.path, "remote"], { encoding: "utf8" }), "");
  assert.equal(execFileSync("git", ["-C", f.path, "rev-list", "--count", "HEAD"], { encoding: "utf8" }).trim(), "1");
  assert.equal(execFileSync("git", ["-C", f.path, "status", "--porcelain"], { encoding: "utf8" }), "");
  assert.equal(existsSync(join(f.path, "node_modules")), false);
  assert.equal(existsSync(join(f.path, ".vercel")), false);
  assert.match(result.stdout, /dependencies.*not verified/i);
  assert.equal(s.readStarterProject(f.path).compatible, true);
});

test("starter creation validates its option and preserves occupied destinations", t => {
  const f = fixture(t);
  for (const args of [["--starter", "web-design-system"], ["--create", "--starter", "unknown"]]) {
    const r = run(f, ...args); assert.equal(r.status, 2); assert.match(r.stderr, /starter/); assert.equal(existsSync(f.path), false);
  }
  mkdirSync(f.path); writeFileSync(join(f.path, "keep.txt"), "mine");
  assert.equal(create(f).status, 2); assert.equal(read(join(f.path, "keep.txt")), "mine");
  assert.deepEqual(lib.readProjects(f.root), []);
});

test("interrupted prepared source resumes without recopying, while changed source is preserved and reported", async t => {
  const s = await starter(), f = fixture(t);
  s.createStarterProject(f.path, { brain: f.root, slug: "website", title: "website", contexts: [], by: null });
  assert.equal(s.readStarterProject(f.path).state, "prepared");
  assert.deepEqual(lib.readProjects(f.root), []);
  const original = read(join(f.path, "src/styles/global.css"));
  writeFileSync(join(f.path, "src/styles/global.css"), original + "\n/* company edit */\n");
  const r = create(f); assert.equal(r.status, 2); assert.match(r.stderr, /global\.css/);
  assert.match(read(join(f.path, "src/styles/global.css")), /company edit/); assert.deepEqual(lib.readProjects(f.root), []);
  writeFileSync(join(f.path, "src/styles/global.css"), original);
  assert.equal(create(f).status, 0);
  assert.equal(s.readStarterProject(f.path).state, "linked");
});

test("a later project query finds the compatible shared website and never resets its company customisations", async t => {
  const f = fixture(t); assert.equal(create(f).status, 0);
  const file = join(f.path, "src/styles/global.css"); writeFileSync(file, read(file) + "\n/* approved company values */\n");
  const s = await starter(); assert.equal(s.readStarterProject(f.path).compatible, true);
  assert.equal(create(f).status, 2); assert.match(read(file), /approved company values/);
  const r = spawnSync(process.execPath, [join(P, "skills/gtm-brain-project/project.mjs"), f.root, "--list", "--json"], { env: f.env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); const rows = JSON.parse(r.stdout).projects;
  assert.equal(rows.length, 1); assert.equal(rows[0].starter.id, "web-design-system"); assert.equal(rows[0].starter.compatible, true);
  rmSync(join(f.path, "docs/workflows/add-section/SKILL.md"));
  assert.equal(s.readStarterProject(f.path).compatible, false);
});

test("a prepared starter with a pointer and registry resumes one registration after interruption", async t => {
  const s = await starter(), f = fixture(t);
  s.createStarterProject(f.path, { brain: f.root, slug: "website", title: "Website", contexts: [], by: null });
  lib.writePointer(f.path, { brain: f.root, slug: "website", title: "Website", company: "Starter Fixture" });
  lib.writeProjects(f.root, [{ slug: "website", title: "Website", path: f.path, contexts: [], linkedAt: "2026-11-10T06:00:00Z", by: null }]);
  const result = create(f); assert.equal(result.status, 0, result.stderr);
  assert.equal(lib.readProjects(f.root).length, 1);
  assert.equal(s.readStarterProject(f.path).state, "linked");
  assert.equal(read(join(f.path, "AGENTS.md")).split(lib.POINTER_START).length, 2);
});

test("the packaging verifier rejects extra app files and procedure edits", async t => {
  const s = await starter(), f = fixture(t);
  s.createStarterProject(f.path, { brain: f.root, slug: "website", title: "Website", contexts: [], by: null });
  const extra = join(f.path, "src/pages/unauthorised.astro"); writeFileSync(extra, "changed");
  assert.throws(() => s.verifyPreparedStarter(f.path), /unexpected file.*unauthorised/);
  rmSync(extra);
  writeFileSync(join(f.path, "docs/workflows/add-section/SKILL.md"), "a rewritten method");
  assert.throws(() => s.verifyPreparedStarter(f.path), /add-section/);
});

test("company skills remain discoverable across the nested website Git boundary on both hosts", t => {
  for (const [host, folder] of [["codex", ".agents"], ["claude", ".claude"]]) {
    const f = fixture(t); f.env.GTM_BRAIN_HOST = host;
    userSkills.writeUserSkill(f.root, { id: "gtm-brain-company", title: "Company workflow", description: "Use our company workflow.", body: "Keep the company's format." });
    const result = create(f); assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(f.path, folder, "skills/gtm-brain-company/SKILL.md")), `${host} discovers the company skill`);
    assert.equal(existsSync(join(f.path, folder, "skills/build-design-system")), false, "no duplicate Brian workflow");
  }
});

test("an interrupted external starter resumes with its own company skill links intact", async t => {
  const s = await starter(), f = fixture(t); f.path = join(f.scratch, "external");
  userSkills.writeUserSkill(f.root, { id: "gtm-brain-company", title: "Company workflow", description: "Use our company workflow.", body: "Keep the company's format." });
  s.createStarterProject(f.path, { brain: f.root, slug: "website", title: "Website", contexts: [], by: null });
  lib.writePointer(f.path, { brain: f.root, slug: "website", title: "Website", company: "Starter Fixture" });
  lib.writeProjects(f.root, [{ slug: "website", title: "Website", path: f.path, contexts: [] }]);
  userSkills.reconcileProjectSkills(f.root, "website");
  assert.ok(lstatSync(join(f.path, ".agents/skills/gtm-brain-company")).isSymbolicLink());
  const result = create(f); assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(f.path, ".agents/skills/gtm-brain-company/SKILL.md")));
});

test("an initial commit failure reports incomplete setup and the same request can finish it", async t => {
  const s = await starter(), f = fixture(t), hooks = join(f.scratch, "hooks"); mkdirSync(hooks);
  writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  Object.assign(f.env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: hooks });
  const failed = create(f); assert.equal(failed.status, 2, failed.stdout);
  assert.match(failed.stderr, /commit|history/i);
  assert.equal(s.readStarterProject(f.path).state, "prepared");
  assert.notEqual(spawnSync("git", ["-C", f.path, "rev-parse", "--verify", "HEAD"], { env: f.env }).status, 0);
  rmSync(join(hooks, "pre-commit"));
  const retried = create(f); assert.equal(retried.status, 0, retried.stderr);
  assert.equal(s.readStarterProject(f.path).state, "linked");
  assert.equal(lib.readProjects(f.root).length, 1);
  assert.equal(execFileSync("git", ["-C", f.path, "rev-list", "--count", "HEAD"], { encoding: "utf8" }).trim(), "1");
});

process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_SESSION_MAINTENANCE = "1"; // Covered by session-maintenance.test.mjs.
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// Projects: a folder linked to a brain by a pointer block in its AGENTS.md, its own loaded set, a tag on its notes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// Existing manual demos may legitimately live in temporary folders. Detect new leaks from
// this run without rejecting or modifying the person's pre-existing registered brains.
const realPreferences = join(homedir(), ".codex", "gtm-os", "preferences.json");
const registeredPaths = () => {
  try { return new Set((JSON.parse(readFileSync(realPreferences, "utf8")).brains || []).map(b => b.path)); }
  catch (e) { if (e.code === "ENOENT") return new Set(); throw e; }
};
const registeredBefore = registeredPaths();
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-proj-home-"));
const lib = await import(`${P}/lib/brain.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1", GTM_OS_NO_VERSION_CHECK: "1" };
/* a real brain from setup, so every script and hook below runs on what people have */
function brain() {
  const root = trackBrain(mkdtempSync(join(tmpdir(), "gtm-os-proj-brain-")), P); execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  return root;
}
/* setup.sh and the session hook now register every brain they open (lib.registerBrain): a test
   that reads the brains registry needs its own CODEX_HOME, so brain() calls made by other tests
   sharing this file's CODEX_HOME never leak into it. */
function withOwnCodexHome(fn) {
  const saved = process.env.CODEX_HOME; const home = mkdtempSync(join(tmpdir(), "gtm-os-proj-home-"));
  process.env.CODEX_HOME = home; env.CODEX_HOME = home;
  try { return fn(); } finally { process.env.CODEX_HOME = saved; env.CODEX_HOME = saved; }
}
const folder = () => mkdtempSync(join(tmpdir(), "gtm-os-proj-folder-"));
const project = (root, ...args) => execFileSync(process.execPath, [`${P}/skills/gtm-os-project/project.mjs`, ".", ...args], { cwd: root, encoding: "utf8", env });
const refused = (root, ...args) => { try { project(root, ...args); return null; } catch (e) { return { code: e.status, text: String(e.stderr || e.stdout) }; } };

test("a folder that holds documents is not linked as a project: open it in Codex instead; a plain folder still links", () => {
  const root = realpathSync(brain());
  mkdirSync(join(root, "brand")); writeFileSync(join(root, "brand", "voice.md"), "---\nkind: document\ntitle: Voice\napplies_to: [copy]\nstatus: draft\n---\n# Voice\n\nShort sentences.\n");
  mkdirSync(join(root, "brand", "design-system")); writeFileSync(join(root, "brand", "design-system", "logo.svg"), "<svg/>");
  const link = (folder, slug) => { try { return { out: execFileSync(process.execPath, [`${P}/skills/gtm-os-project/project.mjs`, ".", "--link", folder, "--slug", slug, "--contexts", "offer"], { cwd: root, encoding: "utf8", env }), code: 0 }; } catch (e) { return { out: String(e.stderr), code: e.status }; } };
  const refused = link(join(root, "brand"), "brand");
  assert.equal(refused.code, 2, refused.out);
  assert.match(refused.out, /holds documents \(brand\/voice\.md\)/);
  assert.match(refused.out, /open its folder in Codex/); assert.match(refused.out, /deliverables/);
  assert.ok(!existsSync(join(root, "brand", "AGENTS.md")), "no pointer was written");
  assert.deepEqual(lib.readProjects(root), [], "nothing registered");
  mkdirSync(join(root, "website")); writeFileSync(join(root, "website", "README.md"), "# Site\n");
  assert.equal(link(join(root, "website"), "website").code, 0, "a folder of deliverables links as before");
  assert.equal(lib.readProjects(root).length, 1);
});

test("linked projects stay flat: child creation and existing-folder linking refuse without writes", () => {
  const root = brain(), external = folder();
  mkdirSync(join(external, "src")); writeFileSync(join(external, "src", "app.js"), "existing app\n");
  project(root, "--link", external, "--slug", "website");
  const registry = readFileSync(join(root, "work/projects.json"), "utf8");
  const pointer = readFileSync(join(external, "AGENTS.md"), "utf8");
  for (const args of [["--link", join(external, "research"), "--create"], ["--link", join(external, "src")]]) {
    const failure = refused(root, ...args, "--slug", "research");
    assert.equal(failure.code, 2); assert.match(failure.text, /overlaps linked project/);
    assert.ok(failure.text.includes(root));
  }
  assert.equal(existsSync(join(external, "research")), false);
  assert.equal(existsSync(join(external, "src", "AGENTS.md")), false);
  assert.equal(readFileSync(join(external, "src", "app.js"), "utf8"), "existing app\n");
  assert.equal(readFileSync(join(external, "AGENTS.md"), "utf8"), pointer);
  assert.equal(readFileSync(join(root, "work/projects.json"), "utf8"), registry);
  assert.equal(lib.resolveBrain(join(external, "src")).project, "website");
  project(root, "--link", join(root, "research"), "--create", "--slug", "research");
  assert.equal(lib.readPointer(join(root, "research")).slug, "research");
});

test("nested repository, path aliases and pointers absent from the registry cannot hide an enclosing project", () => {
  const root = brain(), external = folder(), alias = join(folder(), "alias");
  lib.writePointer(external, { brain: root, slug: "website", title: "Website", company: "Reflow" });
  mkdirSync(join(external, "repo", ".git"), { recursive: true });
  symlinkSync(join(external, "repo"), alias);
  const failure = refused(root, "--link", join(alias, "research"), "--create", "--slug", "research");
  assert.match(failure.text, /overlaps linked project/);
  assert.equal(existsSync(join(external, "repo", "research")), false);
  assert.deepEqual(lib.readProjects(root), []);
  assert.throws(() => execFileSync('bash', [`${P}/scripts/gtm-os-setup/setup.sh`, '--company', 'Nested', '--one-liner', 'Should not exist', '--owner', 'Alex Example <alex@example.invalid>'], { cwd: alias, env, stdio: 'pipe' }), e => /inside linked project/.test(String(e.stderr)));
  assert.equal(existsSync(join(alias, 'brain')), false);
});

test("linking a parent of a registered project or the brain is refused; neighboring folders are allowed", () => {
  const root = brain(), parent = folder(), child = join(parent, "website");
  project(root, "--link", child, "--slug", "website");
  const alias = join(folder(), "parent-alias"); symlinkSync(parent, alias);
  assert.match(refused(root, "--link", alias, "--slug", "container").text, /overlaps linked project/);
  assert.equal(existsSync(join(parent, "AGENTS.md")), false);
  assert.match(refused(root, "--link", join(root, ".."), "--slug", "container").text, /contains the brain/);
  project(root, "--link", join(parent, "website-not-nested"), "--create", "--slug", "neighbor");
  assert.equal(lib.readProjects(root).length, 2);
});

test("the pointer: written into an empty folder, appended to a person's own AGENTS.md, read back, removed cleanly, never written twice", () => {
  const root = brain(), a = folder(), b = folder();
  lib.writePointer(a, { brain: root, slug: "curriculum", title: "Curriculum", company: "Reflow" });
  const text = readFileSync(join(a, "AGENTS.md"), "utf8");
  assert.ok(text.startsWith(lib.POINTER_START + "\n"), "an empty folder gets a file that is only the block");
  assert.match(text, /^GTM OS project: curriculum$/m); assert.match(text, new RegExp(`^GTM OS brain: ${root}$`, "m"));
  assert.match(text, new RegExp(`Read ${root}/AGENTS.md first, every session`), "outside the brain the rulebook is named");
  assert.deepEqual(lib.readPointer(a), { brain: root, slug: "curriculum", missing: false });
  assert.throws(() => lib.writePointer(a, { brain: root, slug: "x", title: "X", company: "Reflow" }), /already a project/);
  writeFileSync(join(b, "AGENTS.md"), "# My website\n\nUse pnpm.\n");
  lib.writePointer(b, { brain: root, slug: "website", title: "Website", company: "Reflow", inside: true });
  const own = readFileSync(join(b, "AGENTS.md"), "utf8");
  assert.ok(own.startsWith("# My website\n\nUse pnpm.\n"), "the person's lines come first, untouched");
  assert.doesNotMatch(own, /Read .*AGENTS.md first/, "inside the brain the rulebook is inherited, not named");
  assert.equal(lib.removePointer(b), true);
  assert.equal(readFileSync(join(b, "AGENTS.md"), "utf8"), "# My website\n\nUse pnpm.\n", "only the block went");
  assert.equal(lib.removePointer(b), false);
  assert.equal(lib.removePointer(a), true); assert.equal(existsSync(join(a, "AGENTS.md")), false, "a file that was only the block is gone");
});

test("resolveBrain: a brain, a sub-folder with a block, an external folder, a nested folder under it, nothing, a block to a missing brain", () => {
  const root = brain();
  assert.deepEqual(lib.resolveBrain(root), { root, project: null });
  const sub = join(root, "projects", "curriculum"); mkdirSync(sub, { recursive: true });
  lib.writePointer(sub, { brain: root, slug: "curriculum", title: "Curriculum", company: "Reflow", inside: true });
  assert.deepEqual(lib.resolveBrain(sub), { root, project: "curriculum", dir: sub });
  const deep = join(root, "projects", "website"); mkdirSync(deep);
  assert.deepEqual(lib.resolveBrain(deep), { root, project: null }, "a sub-folder without a block is the brain's own chat");
  const ext = folder(); lib.writePointer(ext, { brain: root, slug: "website", title: "Website", company: "Reflow" });
  const nested = join(ext, "src", "pages"); mkdirSync(nested, { recursive: true });
  assert.deepEqual(lib.resolveBrain(ext), { root, project: "website", dir: ext });
  assert.deepEqual(lib.resolveBrain(nested), { root, project: "website", dir: ext }, "walks up to the folder that holds the block");
  const git = folder(); execFileSync("git", ["init", "-q", git]); const inGit = join(git, "a"); mkdirSync(inGit);
  assert.equal(lib.resolveBrain(inGit), null, "stops at a git root without a block");
  assert.equal(lib.resolveBrain(folder()), null);
  const gone = folder(); lib.writePointer(gone, { brain: join(tmpdir(), "no-such-brain"), slug: "old", title: "Old", company: "X" });
  assert.deepEqual(lib.resolveBrain(gone), { missing: true, brain: join(tmpdir(), "no-such-brain"), project: "old", dir: gone });
});

test("the loaded set and the session are per project, and the brain's own stay untouched", () => {
  const root = brain();
  lib.writeLoaded(root, ["icp"]); lib.writeLoaded(root, ["offer", "market"], "curriculum"); lib.writeLoaded(root, ["strategy"], "website");
  assert.deepEqual(lib.readLoaded(root), ["icp"]); assert.deepEqual(lib.readLoaded(root, "curriculum"), ["offer", "market"]); assert.deepEqual(lib.readLoaded(root, "website"), ["strategy"]);
  assert.ok(existsSync(join(root, "work", "projects", "curriculum", "loaded-contexts.json")));
  assert.deepEqual(lib.readLoaded(root, "nobody"), []);
  lib.writeSession(root, { session_id: "t-brain", cwd: root }); lib.writeSession(root, { session_id: "t-curr", cwd: "/x" }, "curriculum");
  assert.equal(lib.readSession(root).session_id, "t-brain"); assert.equal(lib.readSession(root, "curriculum").session_id, "t-curr");
});

test("the projects index round-trips; the brains registry keeps what exists and drops what is gone", () => withOwnCodexHome(() => {
  const root = realpathSync(brain());
  assert.deepEqual(lib.readProjects(root), []);
  lib.writeProjects(root, [{ slug: "curriculum", title: "Curriculum", path: "/a", contexts: ["icp"], linkedAt: "2026-09-10T10:00:00Z", by: "marta-nowak" }]);
  assert.equal(lib.readProjects(root)[0].slug, "curriculum");
  lib.registerBrain(root); lib.registerBrain(root);
  const gone = brain(); lib.registerBrain(gone);
  execFileSync("rm", ["-rf", gone]);
  const known = lib.knownBrains();
  assert.deepEqual(known.map(b => [b.path, b.company]), [[root, "Reflow"]], "once, with its company, and the vanished one dropped");
  assert.match(known[0].lastOpened, /^\d{4}-/);
}));

test("registerBrain dedupes a symlinked path by its realpath, and readLoaded/writeLoaded refuse a bad project slug", () => withOwnCodexHome(() => {
  const real = realpathSync(brain());
  const link = join(folder(), "via-symlink"); symlinkSync(real, link);
  lib.registerBrain(real); lib.registerBrain(link);
  const known = lib.knownBrains();
  assert.deepEqual(known.map(b => b.path), [real], "the symlink and the real path are one entry");
  assert.throws(() => lib.readLoaded(real, "../x"), /bad project slug: \.\.\/x/);
  assert.throws(() => lib.writeLoaded(real, ["icp"], "../x"), /bad project slug: \.\.\/x/);
}));

test("project.mjs links a folder (pointer, index, seeded loaded set), refuses what must be refused, lists, unlinks", () => {
  const root = brain(), a = folder(), b = folder();
  const out = project(root, "--link", a, "--slug", "curriculum", "--title", "Curriculum", "--contexts", "icp,offer", "--by", "marta");
  assert.match(out, new RegExp(`linked curriculum at ${a} · loaded: icp, offer`));
  assert.equal(lib.readPointer(a).slug, "curriculum"); assert.deepEqual(lib.readLoaded(root, "curriculum"), ["icp", "offer"]);
  assert.deepEqual(lib.readLoaded(root), [], "the brain's own set is not touched");
  const idx = lib.readProjects(root)[0]; assert.deepEqual([idx.slug, idx.title, idx.path, idx.contexts, idx.by], ["curriculum", "Curriculum", a, ["icp", "offer"], "marta-nowak"]);
  assert.match(refused(root, "--link", a, "--slug", "again").text, /already a project/);
  assert.match(refused(root, "--link", b, "--slug", "curriculum").text, /slug curriculum is taken/);
  assert.match(refused(root, "--link", root, "--slug", "self").text, /is the brain itself/);
  assert.match(refused(root, "--link", b, "--slug", "x", "--contexts", "nope").text, /no such context: nope/);
  project(root, "--link", b, "--title", "My Website");
  assert.equal(lib.readProjects(root)[1].slug, "my-website", "the slug defaults from the title, else the folder name");
  assert.match(project(root, "--list"), /curriculum \(Curriculum\)[\s\S]*loaded: icp, offer[\s\S]*my-website/);
  assert.match(project(root, "--unlink", "curriculum"), /unlinked curriculum/);
  assert.equal(lib.readPointer(a), null); assert.equal(existsSync(join(root, "work", "projects", "curriculum")), false); assert.equal(lib.readProjects(root).length, 1);
  assert.match(refused(root, "--unlink", "curriculum").text, /no project curriculum/);
});

test("project.mjs refuses a valueless flag, a relative path, a path inside another brain, a folder it cannot create, and leaves a repointed pointer in place", () => {
  const root = brain(), other = brain(), c = folder();
  for (const args of [["--link"], ["--link", c, "--slug"], ["--link", c, "--title"], ["--link", c, "--contexts"], ["--link", c, "--by"], ["--unlink"]]) {
    const flag = args.at(-1).replace(/^--/, "");
    assert.match(refused(root, ...args).text, new RegExp(`--${flag} needs a value`), args.join(" "));
  }
  assert.match(refused(root, "--link", "relative/path", "--slug", "rel").text, /give an absolute path/);
  const nested = join(other, "sub"); mkdirSync(nested, { recursive: true });
  assert.match(refused(root, "--link", nested, "--slug", "nested").text, new RegExp(`${nested} is inside another brain \\(${other.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`));
  const blocked = join(folder(), "blocked"); writeFileSync(blocked, "x");
  assert.match(refused(root, "--link", blocked, "--slug", "blocked").text, new RegExp(`${blocked}: `));
  const a = folder(); project(root, "--link", a, "--slug", "repointed");
  const otherFresh = brain(); lib.removePointer(a); lib.writePointer(a, { brain: otherFresh, slug: "repointed", title: "Repointed", company: "X" });
  const out = project(root, "--unlink", "repointed");
  assert.match(out, new RegExp(`pointer at ${a} now belongs to ${otherFresh}; left in place`));
  assert.deepEqual(lib.readPointer(a), { brain: otherFresh, slug: "repointed", missing: false }, "the pointer is untouched");
  assert.equal(lib.readProjects(root).some(p => p.slug === "repointed"), false, "this brain's own index still forgets it");
});

test("a folder is created when missing, a sub-folder of the brain is linked without the rulebook line", () => {
  const root = brain(); const fresh = join(folder(), "new-one");
  project(root, "--link", fresh, "--slug", "fresh");
  assert.ok(existsSync(join(fresh, "AGENTS.md")));
  const sub = join(root, "projects", "seo"); project(root, "--link", sub, "--slug", "seo");
  assert.doesNotMatch(readFileSync(join(sub, "AGENTS.md"), "utf8"), /Read .*AGENTS.md first/);
});

test("new-project creation refuses occupied names without changing files or registration", () => {
  const root = brain(), existing = join(root, "website");
  mkdirSync(existing); writeFileSync(join(existing, "AGENTS.md"), "# My own rules\n");
  writeFileSync(join(existing, "README.md"), "Keep this work.\n");
  assert.match(refused(root, "--link", existing, "--create", "--slug", "website").text, /already exists/);
  assert.equal(readFileSync(join(existing, "AGENTS.md"), "utf8"), "# My own rules\n");
  assert.equal(readFileSync(join(existing, "README.md"), "utf8"), "Keep this work.\n");
  assert.deepEqual(lib.readProjects(root), []);
  assert.ok(!existsSync(join(root, "work/projects/website")));
  const file = join(root, "occupied"); writeFileSync(file, "Keep this file.");
  assert.match(refused(root, "--link", file, "--create").text, /already exists/);
  assert.equal(readFileSync(file, "utf8"), "Keep this file.");
  // An explicit linking request can still preserve and connect the existing folder.
  project(root, "--link", existing, "--slug", "website");
  const fresh = join(root, "different-folder");
  assert.match(refused(root, "--link", fresh, "--create", "--slug", "website").text, /slug website is taken/);
  assert.ok(!existsSync(fresh), "a slug conflict must not leave an unregistered folder");
  assert.ok(readFileSync(join(existing, "AGENTS.md"), "utf8").startsWith("# My own rules\n"));
});

test("projects cannot occupy internal storage, including symlink aliases", () => {
  const root = brain(), outside = folder();
  const rulesBefore = readFileSync(join(root, "AGENTS.md"), "utf8");
  const excludeBefore = readFileSync(lib.gitExcludePath(root), "utf8");
  for (const reserved of ["brain", "work", ".git", ".codex", ".agents", "BRAIN", "Work"]) {
    for (const flags of [[], ["--create"]]) {
      for (const path of [join(root, reserved), join(root, reserved, "website")]) {
        assert.match(refused(root, "--link", path, ...flags, "--slug", "website").text, /internal storage/);
      }
    }
  }
  const alias = join(outside, "storage"); symlinkSync(join(root, "work"), alias);
  assert.match(refused(root, "--link", join(alias, "website"), "--create").text, /internal storage/);
  assert.ok(!existsSync(join(root, "work/website")));
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), rulesBefore);
  assert.equal(readFileSync(lib.gitExcludePath(root), "utf8"), excludeBefore);
  assert.deepEqual(lib.readProjects(root), []);
  const other = brain(), otherAlias = join(outside, "other-brain"); symlinkSync(other, otherAlias);
  assert.match(refused(root, "--link", join(otherAlias, "website"), "--create").text, /inside another brain/);
  assert.ok(!existsSync(join(other, "website")));
});

test("a sub-folder project is excluded locally (.git/info/exclude), never in the shared .gitignore; the entry owns what link added", () => {
  const root = realpathSync(brain());
  const sub = join(root, "projects", "seo");
  const gitignoreBefore = readFileSync(join(root, ".gitignore"), "utf8");
  const out = project(root, "--link", sub, "--slug", "seo");
  assert.match(out, / · excluded from the brain's git on this machine \(a personal path\)/);
  assert.match(readFileSync(join(root, ".git", "info", "exclude"), "utf8"), /^\/projects\/seo\/$/m);
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), gitignoreBefore, "the shared .gitignore is never touched by this");
  assert.equal(execFileSync("git", ["-C", root, "status", "--porcelain", "--", "projects/seo"], { encoding: "utf8" }).trim(), "", "the brain's git sees nothing there");
  assert.equal(lib.readProjects(root).find(p => p.slug === "seo").excluded, true, "link added the line, so the entry owns it");
  project(root, "--unlink", "seo");
  assert.doesNotMatch(readFileSync(join(root, ".git", "info", "exclude"), "utf8"), /^\/projects\/seo\/$/m, "the line is gone after unlink");
});

test("a hand-written exclude line was not link's to add, so unlink leaves it in place", () => {
  const root = realpathSync(brain());
  const sub = join(root, "projects", "private"); mkdirSync(sub, { recursive: true });
  mkdirSync(join(root, ".git", "info"), { recursive: true });
  writeFileSync(join(root, ".git", "info", "exclude"), "projects/private/\n");
  const out = project(root, "--link", sub, "--slug", "private");
  assert.doesNotMatch(out, /excluded from the brain's git/, "the line was already there: link did not add it");
  assert.equal(lib.readProjects(root).find(p => p.slug === "private").excluded, false);
  project(root, "--unlink", "private");
  assert.match(readFileSync(join(root, ".git", "info", "exclude"), "utf8"), /^projects\/private\/$/m, "the hand-written line survives unlink");
});

test("a .gitignore rule written before linking survives link and unlink untouched (the review's reproduction)", () => {
  const root = realpathSync(brain());
  const gitignoreBefore = readFileSync(join(root, ".gitignore"), "utf8");
  writeFileSync(join(root, ".gitignore"), gitignoreBefore + "private-drafts/\n");
  const sub = join(root, "private-drafts");
  project(root, "--link", sub, "--slug", "private-drafts");
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), gitignoreBefore + "private-drafts/\n", "linking never touches .gitignore");
  project(root, "--unlink", "private-drafts");
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), gitignoreBefore + "private-drafts/\n", "nor does unlinking: the person's own rule is exactly as they wrote it");
});

test("a brain whose .git is a file (a worktree) links a sub-folder without an exclusion, instead of crashing", () => {
  const root = realpathSync(brain());
  execFileSync("rm", ["-rf", join(root, ".git")]);
  writeFileSync(join(root, ".git"), "gitdir: /nowhere\n");
  const sub = join(root, "projects", "seo");
  const out = project(root, "--link", sub, "--slug", "seo");
  assert.match(out, /^linked seo at /);
  assert.doesNotMatch(out, /excluded from the brain's git/, "a .git file (a worktree) is not a directory: nothing to exclude from");
  assert.equal(lib.readProjects(root).find(p => p.slug === "seo").excluded, false);
  assert.equal(existsSync(join(root, ".git", "info")), false, "no exclude machinery created for a .git that is not a directory");
});

const script = (root, file, ...args) => execFileSync(process.execPath, [`${P}/${existsSync(`${P}/scripts/${file.split("/")[0]}`) ? "scripts" : "skills"}/${file}`, ".", ...args], { cwd: root, encoding: "utf8", env });

test("load, remember and recall work in a project's own set and tag its notes; the brain's chat sees none of it as loaded", () => {
  const root = brain(); const a = folder();
  project(root, "--link", a, "--slug", "curriculum", "--contexts", "icp");
  lib.writeLoaded(root, ["offer"]);
  assert.match(script(root, "gtm-os-load/load.mjs", "market", "--project", "curriculum"), /Loaded now: admin \+ icp, market \(project curriculum\)/);
  assert.deepEqual(lib.readLoaded(root, "curriculum"), ["icp", "market"]); assert.deepEqual(lib.readLoaded(root), ["offer"]);
  assert.match(script(root, "gtm-os-load/load.mjs", "market", "--only", "--project", "curriculum"), /admin \+ market \(project curriculum\)/);
  assert.match(script(root, "gtm-os-load/load.mjs", "--clear", "--project", "curriculum"), /cleared/); assert.deepEqual(lib.readLoaded(root, "curriculum"), []);
  script(root, "gtm-os-load/load.mjs", "icp", "--project", "curriculum");
  lib.writeSession(root, { session_id: "t-curr", cwd: a }, "curriculum");
  const out = script(root, "gtm-os-remember/remember.mjs", "--by", "marta", "--content", "M2 draft is due Friday.", "--project", "curriculum");
  assert.match(out, /remembered m_\w+ in icp/, "one context loaded in the project: no context named");
  const m = lib.readMemories(root, "icp").pop();
  assert.ok(m.tags.includes("project:curriculum")); assert.ok(m.source.some(s => s.kind === "codex" && s.ref === "t-curr"), "the project's own chat is the source");
  assert.match(script(root, "gtm-os-remember/remember.mjs", "--by", "marta", "--content", "Brain-side note.", "--context", "offer"), /in offer/);
  assert.ok(!lib.readMemories(root, "offer").pop().tags.some(t => t.startsWith("project:")));
  assert.match(script(root, "gtm-os-recall/recall.mjs", "draft"), /\[icp · curriculum\]/);
  const ordered = script(root, "gtm-os-recall/recall.mjs", "note", "--project", "curriculum");
  assert.match(ordered, /Brain-side note/, "recall with a project still sees the whole brain");
  assert.match(ordered, /## in this project \(curriculum\)/); assert.match(ordered, /## elsewhere/);
  assert.ok(ordered.search(/## in this project \(curriculum\)/) < ordered.search(/## elsewhere/), "this project's hits come first");
  assert.match(script(root, "gtm-os-recall/recall.mjs", "draft", "--project", "curriculum"), /M2 draft/);
  assert.match(script(root, "gtm-os-contexts/contexts.mjs", "--project", "curriculum"), /\(icp\)[^\n]*loaded in this project/);
  assert.doesNotMatch(script(root, "gtm-os-contexts/contexts.mjs"), /loaded in this project/);
  for (const [file, more] of [["gtm-os-load/load.mjs", ["icp"]], ["gtm-os-remember/remember.mjs", ["--by", "marta", "--content", "x", "--context", "icp"]], ["gtm-os-recall/recall.mjs", ["x"]], ["gtm-os-contexts/contexts.mjs", []]]) {
    const r = (() => { try { script(root, file, ...more, "--project", "nope"); return null; } catch (e) { return { code: e.status, text: String(e.stderr) }; } })();
    assert.equal(r?.code, 2, file); assert.match(r.text, /no project nope; projects: curriculum/);
  }
  const tryRemember = (...more) => { try { script(root, "gtm-os-remember/remember.mjs", ...more); return null; } catch (e) { return { code: e.status, text: String(e.stderr) }; } };
  const valueless = tryRemember("--by", "marta", "--content", "x", "--context", "icp", "--project");
  assert.equal(valueless?.code, 2); assert.match(valueless.text, /--project needs a value/);
  const empty = tryRemember("--by", "marta", "--content", "x", "--context", "icp", "--project", "");
  assert.equal(empty?.code, 2); assert.match(empty.text, /--project needs a value/);
});

test("recall groups a project's hits before it limits them; without a project it limits as before", () => {
  const root = brain(); const a = folder();
  project(root, "--link", a, "--slug", "curriculum", "--contexts", "icp");
  mkdirSync(join(root, "work"), { recursive: true });
  const batch = join(root, "work", "batch.json");
  writeFileSync(batch, JSON.stringify(Array.from({ length: 45 }, (_, i) => ({ content: `Sprocket order ${i + 1} needs a check.`, context: "offer" }))));
  script(root, "gtm-os-remember/remember.mjs", "--by", "marta", "--batch", batch);
  script(root, "gtm-os-remember/remember.mjs", "--by", "marta", "--content", "A longer note: the sprocket supplier for this project changed its terms this week.", "--project", "curriculum");
  const withProject = script(root, "gtm-os-recall/recall.mjs", "sprocket", "--project", "curriculum");
  assert.match(withProject, /^46 memories match "sprocket"/m);
  assert.match(withProject, /## in this project \(curriculum\) · 1\n/);
  assert.match(withProject, /sprocket supplier for this project/);
  assert.match(withProject, /## elsewhere · 40 of 45\n/);
  const withoutProject = script(root, "gtm-os-recall/recall.mjs", "sprocket");
  assert.match(withoutProject, /^46 memories match "sprocket"/m);
  assert.equal((withoutProject.match(/^- Recorded: \d{4}-\d{2}-\d{2}/gm) || []).length, 40, "still capped at 40 without a project");
});

const hook = (cwd, name, input, extra = {}) => execFileSync("bash", [`${P}/hooks/${name}`], { cwd, encoding: "utf8", env: { ...env, ...extra }, input: JSON.stringify({ hook_event_name: "SessionStart", session_id: "thread-p1", cwd, ...input }) });
const tryHook = (cwd, name, input) => { try { return { code: 0, out: hook(cwd, name, input) }; } catch (e) { return { code: e.status, out: String(e.stdout) }; } };

test("resolve.sh agrees with lib.resolveBrain on every fixture", () => {
  const root = realpathSync(brain()); const ext = folder(); project(root, "--link", ext, "--slug", "website"); const nested = join(ext, "a", "b"); mkdirSync(nested, { recursive: true });
  const gone = folder(); lib.writePointer(gone, { brain: "/no/such/brain", slug: "old", title: "Old", company: "X" });
  const sh = dir => { try { return execFileSync("bash", ["-c", `. "${P}/hooks/resolve.sh"; gtm_os_resolve "$1"`, "_", dir], { encoding: "utf8" }).replace(/\n$/, ""); } catch (e) { return null; } };
  assert.equal(sh(root), `${root}\t`); assert.equal(sh(ext), `${root}\twebsite`); assert.equal(sh(nested), `${root}\twebsite`);
  assert.equal(sh(folder()), null); assert.equal(sh(gone), "MISSING\t/no/such/brain\told");
});

test("the session hook in a project: the PROJECT line first, its own set re-loaded, no dashboard order, its own session file, the brain registered", () => withOwnCodexHome(() => {
  const root = realpathSync(brain()); const ext = folder(); project(root, "--link", ext, "--slug", "website", "--contexts", "icp");
  const admin = join(root, "brain", "admin.md"); writeFileSync(admin, readFileSync(admin, "utf8").replace("dashboard: on-demand", "dashboard: always"));
  const out = hook(ext, "session-start.sh", {});
  assert.match(out, new RegExp(`^PROJECT website of the Reflow brain at ${root}\\. Pass brain: ${root} and project: website in every GTM OS tool call\\. Say "website" to the person, never the path\\.`), "first line");
  assert.doesNotMatch(out, /FIRST ACTION OF THIS CHAT/); assert.match(out, /Re-loading what was loaded last time in project website: icp/);
  assert.equal(lib.readSession(root, "website").session_id, "thread-p1"); assert.equal(lib.readSession(root), null, "the brain's own chat file is not written by a project chat");
  assert.equal(lib.knownBrains()[0].path, root);
  const brainOut = hook(root, "session-start.sh", {});
  assert.doesNotMatch(brainOut, /^PROJECT/m); assert.doesNotMatch(brainOut, /FIRST ACTION OF THIS CHAT/, "the brain's own chat answers without opening the dashboard"); assert.equal(lib.readSession(root).session_id, "thread-p1");
  execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, "--stop"], { cwd: root, stdio: "ignore", env });
}));

test("the session hook in the brain leaves out what the chat already has: the policies AGENTS.md carries, a loaded context's rule twice", () => withOwnCodexHome(() => {
  const root = realpathSync(brain()); const ext = folder(); project(root, "--link", ext, "--slug", "website", "--contexts", "icp");
  const policies = ["questions", "computer-use"].map(name => readFileSync(`${P}/policies/${name}.md`, "utf8"));
  script(root, "gtm-os-load/load.mjs", "icp", "--only");
  const brainOut = hook(root, "session-start.sh", {});
  for (const policy of policies) assert.ok(!brainOut.includes(policy), "the brain's AGENTS.md already carries the generated policy");
  assert.match(brainOut, /references\/questions\.md once/, "the pointer to the question procedure stays");
  const rule = lib.readContext(root, "icp").rule;
  assert.equal(brainOut.split(rule).length - 1, 1, "a re-loaded context's standing rule reaches the chat once, from the load");
  assert.match(brainOut, /Target customers \(icp\) · [^\n]*loaded in this chat\n/, "the list still names it on one line");
  assert.ok(brainOut.includes(lib.readContext(root, "market").rule), "a context that is not loaded keeps its rule in the list for routing");
  const projectOut = hook(ext, "session-start.sh", {});
  for (const policy of policies) assert.ok(projectOut.includes(policy), "a linked folder's AGENTS.md is only a pointer, so the hook supplies the policy");
  const agents = join(root, "AGENTS.md"); writeFileSync(agents, readFileSync(agents, "utf8").replace(/<!-- generated: computer-use[\s\S]*?<!-- \/generated: computer-use -->\n?/, ""));
  const olderOut = hook(root, "session-start.sh", {});
  for (const policy of policies) assert.ok(olderOut.includes(policy), "rules without the generated blocks still get the policies");
  execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, "--stop"], { cwd: root, stdio: "ignore", env });
}));

test("the session hook elsewhere: a pointer to a gone brain says so and stops; an unlinked folder is offered the skill when a brain is known", () => withOwnCodexHome(() => {
  const root = brain(); hook(root, "session-start.sh", {});
  const gone = folder(); lib.writePointer(gone, { brain: "/no/such/brain", slug: "old", title: "Old", company: "X" });
  const g = hook(gone, "session-start.sh", {});
  assert.match(g, /points at a brain that is not there: \/no\/such\/brain; run \/gtm-os-project here to link it to the brain that exists now/); assert.doesNotMatch(g, /PROJECT old/);
  const plain = folder(); writeFileSync(join(plain, "notes.txt"), "x");
  assert.match(hook(plain, "session-start.sh", {}), /GTM OS: this folder is not linked to a brain \(known: Reflow\)\. If the person does company work here, offer \/gtm-os-project once/);
  const empty = folder();
  const e = hook(empty, "session-start.sh", {}); assert.match(e, /this folder has no company brain yet/); assert.match(e, /not linked to a brain/, "both offers, the start one first");
  assert.ok(e.indexOf("no company brain yet") < e.indexOf("not linked to a brain"));
  // Someone's code repo is not a setup landing: no question forms or Computer Use rules leak into it (Maksymilian, 2026-10-01).
  const repo = folder(); mkdirSync(join(repo, ".git")); mkdirSync(join(repo, "src")); writeFileSync(join(repo, "package.json"), "{}"); writeFileSync(join(repo, "src", "index.js"), "");
  const r = hook(repo, "session-start.sh", {});
  assert.doesNotMatch(r, /onboarding_question|question tool|Computer Use|no company brain yet/);
}));

test("turns, tool usage and the gate work from a project cwd and log into the brain with the project", () => {
  const root = brain(); const ext = folder(); project(root, "--link", ext, "--slug", "website");
  hook(ext, "turns.sh", { hook_event_name: "UserPromptSubmit", prompt: "note the deadline" });
  hook(ext, "tool-usage.sh", { hook_event_name: "PostToolUse", tool_name: "mcp__gtm_os__remember", tool_input: {}, tool_response: {} });
  const turn = JSON.parse(readFileSync(join(root, "work", "turns.jsonl"), "utf8").trim().split("\n").pop()); assert.equal(turn.project, "website"); assert.equal(turn.text, "note the deadline");
  const use = JSON.parse(readFileSync(join(root, "work", "tool-usage.jsonl"), "utf8").trim().split("\n").pop()); assert.equal(use.project, "website"); assert.equal(use.name, "remember");
  const g = tryHook(ext, "gate-protected-write.sh", { tool_name: "shell_command", tool_input: { command: `printf y > ${root}/brain/admin.md` } });
  assert.equal(g.code, 2); assert.match(g.out, /permissionDecision":"deny"/);
  assert.match(readFileSync(join(root, "work", "hooks.log"), "utf8"), /PreToolUse  DENY/, "logged in the brain, not in the project folder");
  assert.equal(existsSync(join(ext, "work")), false);
});

test("the dashboard lists the projects and chips a note with its project; the advisor names a quiet project and a broken pointer", () => {
  const root = brain(); const a = folder(), b = folder();
  project(root, "--link", a, "--slug", "curriculum", "--title", "Curriculum", "--contexts", "icp"); project(root, "--link", b, "--slug", "website");
  script(root, "gtm-os-remember/remember.mjs", "--by", "marta", "--content", "M2 draft is due Friday.", "--context", "icp", "--project", "curriculum");
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-render/render.mjs`, "."], { cwd: root, env });
  const data = JSON.parse(readFileSync(join(root, "work", "home", "data.json"), "utf8"));
  const c = data.projects.find(p => p.slug === "curriculum");
  assert.deepEqual([c.title, c.path, c.contexts, c.loaded, c.notes, c.pointer], ["Curriculum", a, ["icp"], ["icp"], 1, true]); assert.match(c.lastNote, /^\d{4}-/);
  const html = readFileSync(join(root, "work", "home", "index.html"), "utf8");
  assert.ok(html.includes('id="workspace-folders"') && html.includes("projectChip("), "working folders under Workspace and a project chip on the notes");
  execFileSync("rm", ["-rf", b]);
  const f = JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-os-advisor/advisor.mjs`, ".", "--json"], { cwd: root, encoding: "utf8", env: { ...env, GTM_OS_NOW: new Date(Date.now() + 45 * 864e5).toISOString() } })).findings;
  assert.match(f.find(x => x.key === "project-broken")?.what || "", /website.*pointer/, JSON.stringify(f));
  assert.match(f.find(x => x.key === "project-quiet")?.what || "", /curriculum.*no note for/, JSON.stringify(f));
});

test("the skill exists, is listed, and asks before it writes", () => {
  const skill = readFileSync(`${P}/skills/gtm-os-project/SKILL.md`, "utf8") + readFileSync(`${P}/skills/gtm-os-project/references/link.md`, "utf8");
  assert.match(skill, /^name: gtm-os-project$/m);
  assert.match(skill, /capture work done\s+in this folder/i, "the opt-in question is in the skill");
  assert.match(skill, /`query` \(brains\)/); assert.match(skill, /link_project/); assert.match(skill, /unlink_project/); assert.match(skill, /configuration_question/);
  assert.match(skill, /never link without a yes/i);
  assert.match(readFileSync(`${P}/skills/gtm-os-project/agents/openai.yaml`, "utf8"), /display_name: "GTM OS: Projects"/);
  assert.ok(!existsSync(`${P}/skills/gtm-os-link-project/SKILL.md`) && !existsSync(`${P}/skills/gtm-os-new-project/SKILL.md`), "the two old workflows are one skill now (ALL-204 step 4)");
  assert.ok(existsSync(`${P}/skills/gtm-os-project/project.mjs`), "the tool script stays at its stable path");
  const create = readFileSync(`${P}/skills/gtm-os-project/SKILL.md`, "utf8");
  assert.match(create, /^name: gtm-os-project$/m);
  assert.ok(existsSync(`${P}/skills/gtm-os-project/references/link.md`));
  assert.match(readFileSync(`${P}/skills/gtm-os-project/agents/openai.yaml`, "utf8"), /display_name: "GTM OS: Projects"/);
  const commands = readFileSync(join(P, "..", "..", "COMMANDS.md"), "utf8");
  assert.match(commands, /^\| `gtm-os-project` \| GTM OS: Projects \|/m);
  assert.match(commands, /^\| `gtm-os-project` \| GTM OS: Projects \|/m);
});

test("the model, the contributors and the participants are told", () => {
  const tpl = readFileSync(`${P}/templates/AGENTS.md`, "utf8");
  assert.match(tpl, /^1c\. \*\*A chat in a project works in that project\.\*\*/m);
  assert.match(tpl, /pass it as `project` in every GTM OS call/); assert.match(tpl, /never its folder path/);
  assert.match(tpl, /`link_project`, `unlink_project`\)/); assert.match(tpl, /`gtm-os-project`/);
  const contrib = readFileSync(join(P, "..", "..", "AGENTS.md"), "utf8");
  assert.match(contrib, /A project is a tag and a local pointer, never an object/); assert.match(contrib, /never below cwd/);
  for (const doc of ["ONBOARDING.md", "GUIDE.md"]) assert.match(readFileSync(join(P, "..", "..", doc), "utf8"), /## Work in your own folders/, doc);

});

test("interact from a project tags the memory with it and cites the project's own chat", async () => {
  const root = brain(); const a = folder(); project(root, "--link", a, "--slug", "curriculum", "--contexts", "icp");
  lib.writeSession(root, { session_id: "brain-thread", cwd: root }); lib.writeSession(root, { session_id: "project-thread", cwd: a }, "curriculum");
  lib.writeInteractions(root, [{ name: "note_result", title: "Noting a result", tool: "gmail", operation: "Nothing to do in gmail.", description: "A result.", input_schema: { type: "object", properties: { what: { type: "string" } }, required: ["what"], additionalProperties: false }, record: { context: "icp", kind: "note", companies: [], people: [], content: "Result: {what}", action: "gmail:noted:{what}", tags: ["result"] } }]);
  // the server's interact, driven the way server.test drives tools: one JSON-RPC call over stdio
  const { spawn } = await import("node:child_process");
  const call = (name, args) => new Promise((res, rej) => { const p = spawn(process.execPath, [`${P}/server/server.mjs`], { env: { ...env, GTM_OS_NO_COMMIT: "1" } }); let out = ""; p.stdout.on("data", d => out += d); p.on("close", () => { const lines = out.split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); const r = lines.find(l => l.id === 2); r ? res(r.result) : rej(new Error(out)); }); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } }) + "\n"); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }) + "\n"); p.stdin.end(); });
  const r = await call("interact", { brain: root, by: "marta", name: "note_result", params: { what: "M2 shipped" }, project: "curriculum" });
  assert.match(r.content[0].text, /^ok: note_result/, JSON.stringify(r));
  const m = lib.readMemories(root, "icp").pop();
  assert.ok(m.tags.includes("project:curriculum") && m.tags.includes("result"), JSON.stringify(m.tags));
  assert.ok(m.source.some(s => s.kind === "codex" && s.ref === "project-thread"), "the project's chat, not the brain's");
  const bad = await call("interact", { brain: root, by: "marta", name: "note_result", params: { what: "x" }, project: "nope" });
  assert.equal(bad.isError, true); assert.match(bad.content[0].text, /no project nope; projects: curriculum/);
});

test("a channel created, forked or archived from a project changes that project's set; archiving clears it everywhere", () => {
  const root = brain(); const a = folder(); project(root, "--link", a, "--slug", "curriculum", "--contexts", "icp");
  lib.writeLoaded(root, ["offer"]);
  script(root, "gtm-os-contexts/contexts.mjs", "--new", "fresh", "Fresh", "A new channel.", "--project", "curriculum");
  assert.deepEqual(lib.readLoaded(root, "curriculum"), ["icp", "fresh"]); assert.deepEqual(lib.readLoaded(root), ["offer"], "the brain's set is untouched");
  script(root, "gtm-os-remember/remember.mjs", "--by", "marta", "--content", "Seed.", "--context", "icp");
  script(root, "gtm-os-contexts/contexts.mjs", "--fork", "icp", "icp-eu", "ICP EU", "--project", "curriculum");
  assert.deepEqual(lib.readLoaded(root, "curriculum"), ["icp", "fresh", "icp-eu"]); assert.deepEqual(lib.readLoaded(root), ["offer"]);
  lib.writeLoaded(root, ["offer", "icp"]);
  script(root, "gtm-os-contexts/contexts.mjs", "--archive", "icp");
  assert.deepEqual(lib.readLoaded(root), ["offer"]); assert.deepEqual(lib.readLoaded(root, "curriculum"), ["fresh", "icp-eu"], "archived everywhere, not only in the brain's set");
});

test("new_context and archive_context take project through the server", async () => {
  const root = brain(); const a = folder(); project(root, "--link", a, "--slug", "seo");
  const { spawn } = await import("node:child_process");
  const call = (name, args) => new Promise((res, rej) => { const p = spawn(process.execPath, [`${P}/server/server.mjs`], { env: { ...env, GTM_OS_NO_COMMIT: "1" } }); let out = ""; p.stdout.on("data", d => out += d); p.on("close", () => { const lines = out.split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); const r = lines.find(l => l.id === 2); r ? res(r.result) : rej(new Error(out)); }); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } }) + "\n"); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }) + "\n"); p.stdin.end(); });
  const r = await call("new_context", { brain: root, slug: "keywords", title: "Keywords", rule: "Keyword work.", project: "seo" });
  assert.doesNotMatch(r.content[0].text, /refused|error/i, r.content[0].text);
  assert.deepEqual(lib.readLoaded(root, "seo"), ["keywords"]); assert.deepEqual(lib.readLoaded(root), []);
  await call("archive_context", { brain: root, slug: "keywords", project: "seo" });
  assert.deepEqual(lib.readLoaded(root, "seo"), []);
});

test("the session hook's channel list in a project marks the project's set, not the brain's", () => {
  const root = brain(); const a = folder(); project(root, "--link", a, "--slug", "website", "--contexts", "icp");
  lib.writeLoaded(root, ["offer"]);
  const out = hook(a, "session-start.sh", {});
  assert.match(out, /\(icp\)[^\n]*loaded in this project/); assert.doesNotMatch(out, /\(offer\)[^\n]*loaded in this (project|chat)/);
});

test("a linked folder with its own git root keeps the rulebook line; a plain sub-folder does not", () => {
  const root = brain();
  const plain = join(root, "projects", "seo"); project(root, "--link", plain, "--slug", "seo");
  assert.doesNotMatch(readFileSync(join(plain, "AGENTS.md"), "utf8"), /Read .*AGENTS.md first/);
  const repo = join(root, "projects", "site"); mkdirSync(repo, { recursive: true }); execFileSync("git", ["init", "-q", repo]);
  project(root, "--link", repo, "--slug", "site");
  assert.match(readFileSync(join(repo, "AGENTS.md"), "utf8"), /Read .*AGENTS.md first/, "Codex starts its walk at the nearest git root, so the brain's rulebook is not inherited");
  const deep = join(root, "projects", "site", "packages", "web"); mkdirSync(deep, { recursive: true });
  assert.deepEqual(lib.resolveBrain(deep).project, "site", "the plugin's own walk still finds the pointer above");
});

test("a refused repair keeps the old pointer: a validation failure after the stale check must not remove it", () => {
  const old = brain(); const a = folder(); project(old, "--link", a, "--slug", "curriculum");
  execFileSync("rm", ["-rf", old]);
  const before = lib.readPointer(a);
  assert.equal(before.missing, true);
  const fresh = brain();
  const r = refused(fresh, "--link", a, "--slug", "curriculum", "--contexts", "nonexistent");
  assert.equal(r.code, 2); assert.match(r.text, /no such context: nonexistent/);
  assert.deepEqual(lib.readPointer(a), before, "refused before the write: the stale pointer is exactly as it was");
});

test("a pointer to a brain that is gone is repaired by linking again", () => {
  const old = brain(); const a = folder(); project(old, "--link", a, "--slug", "curriculum");
  execFileSync("rm", ["-rf", old]);
  assert.equal(lib.readPointer(a).missing, true);
  const fresh = brain();
  const out = project(fresh, "--link", a, "--slug", "curriculum", "--contexts", "icp");
  assert.match(out, /linked curriculum/); assert.match(out, /replaced a pointer to a brain that was gone/);
  assert.deepEqual(lib.readPointer(a), { brain: realpathSync(fresh), slug: "curriculum", missing: false });
  assert.equal((readFileSync(join(a, "AGENTS.md"), "utf8").match(/<!-- gtm-os project -->/g) || []).length, 1, "one block, not two");
  const g = hook(a, "session-start.sh", {}); assert.match(g, /^PROJECT curriculum/m);
});

/* Every test brain above lives under a temp CODEX_HOME, so none of it should ever land in the
   developer's real brains registry. This guard reads the real ~/.codex/gtm-os/preferences.json
   and fails if this run adds a synthetic test path. Existing manual demos are left alone. */
test("project tests do not leak synthetic brains into the real registry", () => {
  const temporaryPrefixes = ["/var/folders/", "/private/var/folders/", "/tmp/", realpathSync(tmpdir())];
  const newPaths = [...registeredPaths()].filter(path => !registeredBefore.has(path));
  assert.deepEqual(newPaths.filter(path => temporaryPrefixes.some(prefix => path.startsWith(prefix))), [],
    "new synthetic paths must stay in the isolated test profile");
});

test("nested repositories and literal folder names are excluded only at their exact brain paths", () => {
  const root = brain();
  for (const [i, name] of ['nested-repo', 'draft[1]', 'draft*two', 'draft?three', 'space folder', '#notes', '!notes'].entries()) {
    const path = join(root, name); mkdirSync(path);
    if (i === 0) execFileSync('git', ['init', '-q', path]);
    project(root, '--link', path, '--slug', 'case-'+i);
    assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--', path], {encoding:'utf8'}).trim(), '', name);
    const entry = lib.readProjects(root).find(p=>p.slug==='case-'+i);
    assert.equal(entry.excluded, true); assert.ok(entry.exclusion.startsWith('/'));
    project(root, '--unlink', entry.slug);
    assert.ok(!readFileSync(lib.gitExcludePath(root), 'utf8').split('\n').includes(entry.exclusion));
  }
  const peer=join(root,'draft1');mkdirSync(peer);writeFileSync(join(peer,'own.txt'),'own');
  project(root,'--link',join(root,'draft[1]'),'--slug','literal');
  assert.match(execFileSync('git',['-C',root,'status','--porcelain','--',peer],{encoding:'utf8'}),/draft1/);
});

test("a real worktree uses Git's exclude path and unlink cleans up even after the folder is moved", () => {
  const root=brain(), worktree=join(folder(),'worktree');
  execFileSync('git',['-C',root,'worktree','add','--detach',worktree],{stdio:'ignore'});
  const sub=join(worktree,'private');
  project(worktree,'--link',sub,'--slug','private');
  const entry=lib.readProjects(worktree).find(p=>p.slug==='private');
  assert.equal(entry.excluded,true);
  assert.equal(execFileSync('git',['-C',worktree,'status','--porcelain','--',sub],{encoding:'utf8'}).trim(),'');
  execFileSync('mv',[sub,join(worktree,'moved-private')]);
  project(worktree,'--unlink','private');
  assert.ok(!readFileSync(lib.gitExcludePath(worktree),'utf8').split('\n').includes(entry.exclusion));
});

test("project health rejects missing brains, wrong brains and wrong slugs across dashboard, listing and advisor", () => {
  const root=brain(), a=folder(), other=brain();
  project(root,'--link',a,'--slug','curriculum','--contexts','icp');
  const entry=lib.readProjects(root)[0];
  assert.equal(lib.projectPointerStatus(root,entry),'ok');
  for(const [brainPath,slug,status] of [[join(root,'gone'),'curriculum','brain-missing'],[other,'curriculum','mismatch'],[root,'other-slug','mismatch']]){
    lib.removePointer(a);lib.writePointer(a,{brain:brainPath,slug,title:'Test',company:'Test'});
    assert.equal(lib.projectPointerStatus(root,entry),status);
    assert.equal(JSON.parse(project(root,'--list','--json')).projects[0].pointer,false);
    execFileSync(process.execPath,[`${P}/scripts/gtm-os-render/render.mjs`,root],{env});
    const row=JSON.parse(readFileSync(join(root,'work/home/data.json'),'utf8')).projects[0];
    assert.equal(row.pointer,false);assert.equal(row.pointerStatus,status);
    const findings=JSON.parse(execFileSync(process.execPath,[`${P}/scripts/gtm-os-advisor/advisor.mjs`,root,'--json'],{env,encoding:'utf8'})).findings;
    assert.ok(findings.some(f=>f.key==='project-broken'));
  }
  project(root,'--unlink','curriculum');
  assert.equal(lib.readPointer(a).slug,'other-slug','unlink preserves a different project pointer even in the same brain');
});

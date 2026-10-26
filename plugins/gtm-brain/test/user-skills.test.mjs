process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_SESSION_MAINTENANCE = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
// User skills: a person's own Codex skills in the brain's .agents/skills, shared with the brain, symlinked into linked projects.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, readlinkSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, execFile } from "node:child_process";
import { createServer } from "node:http";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-uskill-home-"));
const lib = await import(`${P}/lib/brain.mjs`);
const us = await import(`${P}/lib/user-skills.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1" };
function brain() {
  const root = trackBrain(realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-uskill-brain-"))), P);
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const folder = () => realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-uskill-folder-")));
const project = (root, ...args) => execFileSync(process.execPath, [`${P}/skills/gtm-brain-project/project.mjs`, ".", ...args], { cwd: root, encoding: "utf8", env });
const skill = (root, ...args) => execFileSync(process.execPath, [`${P}/scripts/gtm-brain-skills/skill.mjs`, ".", ...args], { cwd: root, encoding: "utf8", env });
const refused = (root, ...args) => { try { skill(root, ...args); return null; } catch (e) { return { code: e.status, text: String(e.stderr || e.stdout) }; } };
const lastCommit = root => execFileSync("git", ["-C", root, "log", "-1", "--format=%s"], { encoding: "utf8" }).trim();
// The install fixture server runs in this process, so the child must run asynchronously or nothing answers it.
const skillAsync = (root, extraEnv, ...args) => new Promise((resolvePromise, reject) => execFile(process.execPath, [`${P}/scripts/gtm-brain-skills/skill.mjs`, ".", ...args], { cwd: root, encoding: "utf8", env: { ...env, ...extraEnv } }, (e, stdout, stderr) => e ? reject(Object.assign(e, { status: e.code, stdout, stderr })) : resolvePromise(stdout)));

test("ids carry the prefix and frontmatter reads blocks and nested maps", () => {
  assert.equal(us.skillId("Circle Event"), "gtm-brain-circle-event");
  assert.equal(us.skillId("gtm-brain-sales"), "gtm-brain-sales");
  const { fm, body } = us.readSkillFrontmatter("---\nname: gtm-brain-x\ndescription: |\n  Two\n  lines\nmetadata:\n  by: marta\n  created: 2026-09-16\n---\n\n# Body\n");
  assert.equal(fm.name, "gtm-brain-x"); assert.equal(fm.description, "Two lines"); assert.deepEqual(fm.metadata, { by: "marta", created: "2026-09-16" }); assert.equal(body.trim(), "# Body");
});

test("validation refuses shipped names, bad ids, long descriptions and unknown keys", () => {
  const root = brain();
  assert.match(us.validateSkill(root, { id: "gtm-brain-todo", description: "x", keys: ["name", "description"] }), /shipped/);
  assert.match(us.validateSkill(root, { id: "sales", description: "x", keys: ["name", "description"] }), /gtm-brain-/);
  assert.match(us.validateSkill(root, { id: "gtm-brain-a", description: "x".repeat(201), keys: ["name", "description"] }), /201/);
  assert.match(us.validateSkill(root, { id: "gtm-brain-a", description: "x", keys: ["name", "description", "tools"] }), /tools/);
  assert.equal(us.validateSkill(root, { id: "gtm-brain-a", description: "x", keys: ["name", "description", "metadata"] }), null);
});

test("writeUserSkill renders both files, listUserSkills reads them back, save covers .agents", () => {
  const root = brain();
  const path = us.writeUserSkill(root, { id: "gtm-brain-circle-event", title: "Circle event", description: "Create a Circle event from a meeting note.", body: "1. Ask for the date.\n2. Create it in Circle.", by: "marta-nowak", version: "0.22.0" });
  assert.equal(path, join(root, ".agents", "skills", "gtm-brain-circle-event"));
  const md = readFileSync(join(path, "SKILL.md"), "utf8");
  assert.match(md, /^name: gtm-brain-circle-event$/m); assert.match(md, /^# GTM Brain skill: Circle event$/m); assert.ok(md.includes(us.HEADER_LINE));
  assert.match(readFileSync(join(path, "agents", "openai.yaml"), "utf8"), /display_name: "GTM Brain: Circle event"/);
  assert.deepEqual(us.listUserSkills(root).map(s => [s.id, s.title, s.by]), [["gtm-brain-circle-event", "Circle event", "marta-nowak"]]);
  assert.ok(lib.BRAIN_PATHS.includes(".agents"));
});

test("links skip a project folder that is gone, and never replace a symlink that is not ours", () => {
  const root = brain(), gone = folder(), other = folder();
  lib.writeProjects(root, [{ slug: "gone", title: "Gone", path: gone, contexts: [], linkedAt: new Date().toISOString(), by: null }, { slug: "other", title: "Other", path: other, contexts: [], linkedAt: new Date().toISOString(), by: null }]);
  rmSync(gone, { recursive: true, force: true });
  mkdirSync(join(root, ".agents", "skills-other", "gtm-brain-x"), { recursive: true });
  mkdirSync(join(other, ".agents", "skills"), { recursive: true });
  const foreign = join(other, ".agents", "skills", "gtm-brain-x");
  symlinkSync(join(root, ".agents", "skills-other", "gtm-brain-x"), foreign, "dir");
  us.writeUserSkill(root, { id: "gtm-brain-x", title: "X", description: "x.", body: "y", by: null, version: "0.22.0" });
  const { linked, failed } = us.linkSkillIntoProjects(root, "gtm-brain-x");
  assert.deepEqual(linked, []); assert.deepEqual(failed.map(f => f.slug), ["other"]); assert.match(failed[0].error, /not a GTM Brain link/);
  assert.equal(existsSync(gone), false, "a missing project folder is not recreated");
  assert.equal(readlinkSync(foreign), join(root, ".agents", "skills-other", "gtm-brain-x"), "the foreign link is untouched");
  assert.deepEqual(us.unlinkSkillFromProjects(root, "gtm-brain-x"), []);
});

test("a linked code repo never sees the skill links in git status, its worktrees included (Maksymilian, 2026-10-01)", () => {
  const root = brain(), repo = folder();
  execFileSync("git", ["init", "-q", repo]); execFileSync("git", ["-C", repo, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "init"]);
  const app = join(repo, "apps", "web"); mkdirSync(app, { recursive: true });
  assert.match(project(root, "--link", app, "--slug", "web"), /Git: the link is a block .*every worktree/);
  skill(root, "--create", "--title", "Circle event", "--description", "Create a Circle event.", "--body", "1. Ask.", "--by", "marta-nowak");
  assert.ok(lstatSync(join(app, ".agents/skills/gtm-brain-circle-event")).isSymbolicLink());
  const exclude = readFileSync(join(repo, ".git/info/exclude"), "utf8");
  assert.ok(exclude.split("\n").includes("/apps/web/.agents/skills/gtm-brain-circle-event"), exclude);
  const status = execFileSync("git", ["-C", repo, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" });
  assert.doesNotMatch(status, /\.agents/, status);
  // a second reconcile adds nothing twice
  us.reconcileProjectSkills(root, "web");
  assert.equal(readFileSync(join(repo, ".git/info/exclude"), "utf8"), exclude);
});

test("create writes the skill, links it into linked projects, commits; a second create is refused", () => {
  const root = brain(), external = folder();
  project(root, "--link", external, "--slug", "website");
  const out = skill(root, "--create", "--title", "Circle event", "--description", "Create a Circle event from a meeting note.", "--body", "1. Ask for the date.\n2. Create it in Circle.", "--by", "marta-nowak");
  assert.match(out, /created gtm-brain-circle-event/); assert.match(out, /quit and reopened/); assert.match(out, /website/);
  assert.ok(existsSync(join(root, ".agents/skills/gtm-brain-circle-event/SKILL.md")));
  const link = join(external, ".agents/skills/gtm-brain-circle-event");
  assert.ok(lstatSync(link).isSymbolicLink()); assert.equal(readlinkSync(link), join(root, ".agents/skills/gtm-brain-circle-event"));
  assert.equal(lastCommit(root), "Added skill gtm-brain-circle-event");
  const again = refused(root, "--create", "--title", "Circle event", "--description", "x", "--body", "y");
  assert.equal(again.code, 2); assert.match(again.text, /already exists/);
  const shipped = refused(root, "--create", "--title", "todo", "--description", "x", "--body", "y");
  assert.equal(shipped.code, 2); assert.match(shipped.text, /shipped/);
  const long = refused(root, "--create", "--title", "Long", "--description", "x".repeat(201), "--body", "y");
  assert.equal(long.code, 2); assert.match(long.text, /201/);
});

test("list shows the brain's skills and the shipped ones; remove deletes the folder, its links and commits", () => {
  const root = brain(), external = folder();
  project(root, "--link", external, "--slug", "website");
  skill(root, "--create", "--title", "Weekly update", "--description", "Draft the weekly account update.", "--body", "Draft it.");
  const rows = JSON.parse(skill(root, "--list", "--json"));
  assert.deepEqual(rows.yours.map(s => s.id), ["gtm-brain-weekly-update"]); assert.ok(rows.plugin.includes("gtm-brain-todo"));
  assert.deepEqual(rows.yours[0].projects, ["website"]);
  // three kinds, said as three groups: shipped with the plugin, yours in this brain, Codex's own on this machine
  const home = mkdtempSync(join(tmpdir(), "gtm-brain-skills-home-")); mkdirSync(join(home, ".agents", "skills", "analyze-account-signals"), { recursive: true });
  writeFileSync(join(home, ".agents", "skills", "analyze-account-signals", "SKILL.md"), "---\nname: analyze-account-signals\ndescription: Personal.\n---\n");
  const listed = execFileSync(process.execPath, [`${P}/scripts/gtm-brain-skills/skill.mjs`, ".", "--list"], { cwd: root, encoding: "utf8", env: { ...env, HOME: home } });
  const [shipped, yours, personal] = ["Shipped with GTM Brain", "Yours, in this brain", "Codex's own, on this machine"].map(h => listed.indexOf(h));
  assert.ok(shipped >= 0 && yours > shipped && personal > yours, `three groups in order:\n${listed}`);
  assert.match(listed.slice(shipped, yours), /updated with the plugin/); assert.match(listed.slice(shipped, yours), /\/gtm-brain-todo/);
  assert.match(listed.slice(yours, personal), /travel with the brain/); assert.match(listed.slice(yours, personal), /gtm-brain-weekly-update/);
  assert.match(listed.slice(personal), /GTM Brain never sees or updates them/); assert.match(listed.slice(personal), /analyze-account-signals/);
  const withPersonal = JSON.parse(execFileSync(process.execPath, [`${P}/scripts/gtm-brain-skills/skill.mjs`, ".", "--list", "--json"], { cwd: root, encoding: "utf8", env: { ...env, HOME: home } }));
  assert.deepEqual(withPersonal.personal, ["analyze-account-signals"]);
  const out = skill(root, "--remove", "gtm-brain-weekly-update");
  assert.match(out, /removed gtm-brain-weekly-update/);
  assert.equal(existsSync(join(root, ".agents/skills/gtm-brain-weekly-update")), false);
  assert.equal(existsSync(join(external, ".agents/skills/gtm-brain-weekly-update")), false);
  assert.equal(lastCommit(root), "Removed skill gtm-brain-weekly-update");
  assert.match(refused(root, "--remove", "gtm-brain-nope").text, /no such skill/);
});

// A tiny stand-in for the GitHub contents API: /repos/<o>/<r>/contents/<path>?ref=<ref> lists a folder,
// /raw/<path> serves a file. Enough for the fallback fetch; the bundled installer is absent under a test CODEX_HOME.
function fixtureRepo(files) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/raw/")) { const f = files[url.pathname.slice(5)]; if (f === undefined) { res.writeHead(404); return res.end(); } res.writeHead(200); return res.end(f); }
    const m = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/); if (!m) { res.writeHead(404); return res.end("[]"); }
    const dir = m[1].replace(/\/$/, ""); const names = new Set(); const entries = [];
    for (const p of Object.keys(files)) if (p.startsWith(dir + "/")) { const rest = p.slice(dir.length + 1); const head = rest.split("/")[0]; if (names.has(head)) continue; names.add(head); const isDir = rest.includes("/"); entries.push({ name: head, path: `${dir}/${head}`, type: isDir ? "dir" : "file", download_url: isDir ? null : `http://127.0.0.1:${server.address().port}/raw/${dir}/${head}` }); }
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(entries));
  });
  return new Promise(r => server.listen(0, "127.0.0.1", () => r({ base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

test("install fetches a skill folder, renames it under the prefix, adds the header, validates and commits; a bad one is refused and removed", async t => {
  const root = brain();
  const good = await fixtureRepo({ "skills/sales/SKILL.md": "---\nname: sales\ndescription: Run the weekly sales review from the CRM.\n---\n\n# Sales review\n\nOpen the pipeline.\n", "skills/sales/references/steps.md": "1. Open the CRM.\n" });
  t.after(good.close);
  const out = await skillAsync(root, { GTM_BRAIN_SKILL_SOURCE: good.base }, "--install", "--repo", "allethic/skills", "--path", "skills/sales");
  assert.match(out, /installed gtm-brain-sales/);
  const md = readFileSync(join(root, ".agents/skills/gtm-brain-sales/SKILL.md"), "utf8");
  assert.match(md, /^name: gtm-brain-sales$/m); assert.ok(md.includes(us.HEADER_LINE)); assert.ok(existsSync(join(root, ".agents/skills/gtm-brain-sales/references/steps.md")));
  assert.equal(lastCommit(root), "Installed skill gtm-brain-sales from allethic/skills skills/sales");
  const bad = await fixtureRepo({ "skills/bad/SKILL.md": "---\nname: bad\ndescription: x\ntools: [a]\n---\nbody\n" });
  t.after(bad.close);
  let failure = null; try { await skillAsync(root, { GTM_BRAIN_SKILL_SOURCE: bad.base }, "--install", "--repo", "allethic/skills", "--path", "skills/bad"); } catch (e) { failure = { code: e.status, text: String(e.stderr) }; }
  assert.equal(failure.code, 2); assert.match(failure.text, /tools/); assert.equal(existsSync(join(root, ".agents/skills/gtm-brain-bad")), false);
});

test("linking a project links the existing skills; unlinking removes them; the session hook reconciles a pulled skill", () => {
  const root = brain(), external = folder();
  skill(root, "--create", "--title", "Weekly update", "--description", "Draft the weekly account update.", "--body", "Draft it.");
  project(root, "--link", external, "--slug", "website");
  const link = join(external, ".agents/skills/gtm-brain-weekly-update");
  assert.ok(lstatSync(link).isSymbolicLink(), "link made at link time");
  // a teammate's skill arrives through git, not through the script: only the hook can link it
  mkdirSync(join(root, ".agents/skills/gtm-brain-pulled"), { recursive: true });
  writeFileSync(join(root, ".agents/skills/gtm-brain-pulled/SKILL.md"), "---\nname: gtm-brain-pulled\ndescription: Pulled from a teammate.\n---\n\n# GTM Brain skill: Pulled\n");
  rmSync(join(root, ".agents/skills/gtm-brain-weekly-update"), { recursive: true, force: true }); // and one removed by hand: its link dangles
  const hook = execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: external, encoding: "utf8", input: JSON.stringify({ session_id: "t", cwd: external }), env: { ...env, GTM_BRAIN_NO_VERSION_CHECK: "1" } });
  assert.match(hook, /PROJECT website/);
  assert.ok(lstatSync(join(external, ".agents/skills/gtm-brain-pulled")).isSymbolicLink(), "pulled skill linked by the hook");
  assert.equal(existsSync(link), false, "dangling link removed by the hook");
  project(root, "--unlink", "website");
  assert.equal(existsSync(join(external, ".agents/skills/gtm-brain-pulled")), false, "unlink removes the links");
  // a project inside the brain already sees the brain's skills: no link there, or Codex would list each twice
  project(root, "--link", join(root, "research"), "--create", "--slug", "research");
  assert.equal(existsSync(join(root, "research", ".agents")), false, "no links inside the brain");
});

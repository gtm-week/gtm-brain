// WHERE.md: where every file goes, one table the person reads and edits and Codex follows.
// Run: node --test plugins/gtm-brain/test/where.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const T = join(P, "templates");
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-where-codex-")), GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1",
  GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1" };
delete env.GTM_BRAIN_NO_COMMIT; delete env.GTM_BRAIN_RUN;
const where = await import(`${P}/lib/where.mjs`);

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-where-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "GTM Tech Week", "--one-liner", "events", "--owner", "Artur Wala <artur@gtmweek.io>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const start = root => execFileSync("bash", [`${P}/session/session-start.sh`], { cwd: root, env, encoding: "utf8", input: JSON.stringify({ session_id: "", cwd: root }) });
const tracked = (root, path) => execFileSync("git", ["-C", root, "ls-files", "--", path], { encoding: "utf8" }).trim() === path;

test("setup writes WHERE.md, commits it, and the README points to it", () => {
  const root = brain();
  assert.equal(readFileSync(join(root, "WHERE.md"), "utf8"), readFileSync(join(T, "WHERE.md"), "utf8"));
  assert.ok(tracked(root, "WHERE.md"), "shared with the team");
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /\[WHERE\.md\]\(WHERE\.md\) says where every file goes/);
});

test("every chat starts with the numbered rows and the projects; a Berlin speaker graphic has its row and its project", () => {
  const root = brain();
  mkdirSync(join(root, "projects", "berlin-event-2026"), { recursive: true });
  writeFileSync(join(root, "projects", "berlin-event-2026", "README.md"), "# GTM Tech Week Berlin, November 2026: graphics, speakers, LinkedIn\n");
  mkdirSync(join(root, "projects", "website"));
  const out = start(root);
  assert.match(out, /WHERE\.md decides where every file goes; the person edits it\./);
  assert.match(out, /\n  5\. A speaker or guest graphic for an event: `projects\/<event>\/speakers\/<name>\/`/);
  assert.match(out, /Projects:\n  projects\/berlin-event-2026\/ - GTM Tech Week Berlin, November 2026: graphics, speakers, LinkedIn\n  projects\/website\/ \(no README\.md line yet/);
  assert.match(out, /never create a folder at the brain root or put a deliverable in work\//);
});

test("the person's rows are what Codex is given, and an edited WHERE.md is never overwritten", () => {
  const root = brain();
  const mine = readFileSync(join(root, "WHERE.md"), "utf8").replace("| Brand: design system, fonts, brand files | `brand/` |", "| Brand: design system, fonts, brand files | `brand/` |\n| Anything for a client | `clients/<client>/` |");
  writeFileSync(join(root, "WHERE.md"), mine);
  assert.equal(where.ensureWhere(root, T), false);
  assert.equal(readFileSync(join(root, "WHERE.md"), "utf8"), mine);
  assert.deepEqual(where.whereRows(root)[2], { what: "Anything for a client", where: "`clients/<client>/`" });
  assert.match(start(root), /\n  3\. Anything for a client: `clients\/<client>\/`/);
});

test("a brain from before WHERE.md gets it at its next chat start, committed", () => {
  const root = brain();
  rmSync(join(root, "WHERE.md")); execFileSync("git", ["-C", root, "commit", "-qam", "an older brain"]);
  assert.match(start(root), /WHERE\.md decides/);
  assert.ok(existsSync(join(root, "WHERE.md"))); assert.ok(tracked(root, "WHERE.md"));
  assert.match(execFileSync("git", ["-C", root, "log", "-1", "--format=%s"], { encoding: "utf8" }), /^WHERE\.md: where things go/);
});

test("a new project goes to projects/<slug>/ by default, creating projects/ the first time", () => {
  const root = brain();
  const out = execFileSync(process.execPath, [`${P}/skills/gtm-brain-project/project.mjs`, root, "--link", join(root, "projects", "berlin-event-2026"), "--create", "--slug", "berlin-event-2026", "--title", "Berlin event", "--by", "artur-wala"], { cwd: root, env, encoding: "utf8" });
  assert.match(out, /Created Berlin event at .*projects\/berlin-event-2026/);
  assert.ok(existsSync(join(root, "projects", "berlin-event-2026", "AGENTS.md")));
});

test("an unedited WHERE.md from before the rename gets the new wording at the next chat start; an edited one keeps its own", () => {
  const root = brain(), old = readFileSync(join(T, "legacy", "where", "0.33.9-outcomes.md"), "utf8");
  writeFileSync(join(root, "WHERE.md"), old); execFileSync("git", ["-C", root, "commit", "-qam", "the earlier wording"]);
  assert.match(start(root), /\nProjects:\n/);
  assert.equal(readFileSync(join(root, "WHERE.md"), "utf8"), readFileSync(join(T, "WHERE.md"), "utf8"));
  assert.match(readFileSync(join(root, "WHERE.md"), "utf8"), /\| A project: an event, a campaign, a client, a launch \| `projects\/<project>\/`/);
  const mine = old.replace("| Brand: design system, fonts, brand files | `brand/` |", "| Brand | `brand/` and `fonts/` |");
  writeFileSync(join(root, "WHERE.md"), mine); start(root);
  assert.equal(readFileSync(join(root, "WHERE.md"), "utf8"), mine);
});

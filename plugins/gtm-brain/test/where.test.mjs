// WHERE.md: where every file goes, one table the person reads and edits and Codex follows.
// Run: node --test plugins/gtm-brain/test/where.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync, truncateSync } from "node:fs";
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
  // its README.md first line is what every chat start lists for it
  assert.equal(readFileSync(join(root, "projects", "berlin-event-2026", "README.md"), "utf8"), "# Berlin event\n");
  assert.match(start(root), /\n  projects\/berlin-event-2026\/ - Berlin event/);
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

test("a WHERE.md edited in a chat and not saved is kept by the next chat start's maintenance, as written", () => {
  const root = brain();
  const mine = readFileSync(join(root, "WHERE.md"), "utf8").replace("| Brand: design system, fonts, brand files | `brand/` |", "| Brand: design system, fonts, brand files | `brand/` |\n| Anything for a client | `clients/<client>/` |");
  writeFileSync(join(root, "WHERE.md"), mine);
  start(root); execFileSync(process.execPath, [`${P}/session/session-maintenance.mjs`, root, "--run"], { env });
  assert.equal(readFileSync(join(root, "WHERE.md"), "utf8"), mine);
  assert.equal(execFileSync("git", ["-C", root, "status", "--porcelain", "--", "WHERE.md"], { encoding: "utf8" }), "");
  assert.match(execFileSync("git", ["-C", root, "log", "--format=%s"], { encoding: "utf8" }), /kept: edited by hand outside Codex/);
});

test("a video over 25 MB is never committed: save keeps the rest and names it, the chat start offers the shared drive (Artur, 2026-11-10: 10 GB of video)", async () => {
  const root = brain(); const lib = await import(`${P}/lib/brain.mjs`);
  const dir = join(root, "projects", "berlin-event-2026", "sources"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Keynote Recording.mov"), ""); truncateSync(join(dir, "Keynote Recording.mov"), 30 * 1024 * 1024);
  writeFileSync(join(dir, "agenda.md"), "# Agenda\n");
  const r = lib.save(root, "Berlin sources");
  assert.equal(r.ok, true, r.note);
  const tracked = execFileSync("git", ["-C", root, "ls-files", "--", "projects"], { encoding: "utf8" }).trim();
  assert.equal(tracked, "projects/berlin-event-2026/sources/agenda.md", "the agenda is kept, the video is not");
  assert.match(r.note, /Too big for git, not kept \(over 25 MB\): projects\/berlin-event-2026\/sources\/Keynote Recording\.mov \(30 MB\)/);
  assert.match(lib.save(root, "again").note, /^nothing else to save\nToo big for git/);
  const out = start(root);
  assert.match(out, /Offer to move each to the shared drive \(Google Drive\) and link it from its project's README\.md/);
  assert.match(out, /If Google Drive is not connected in this Codex, offer to connect it first \(connect my tools\); if they decline, the file stays on this computer only/);
  assert.match(out, /Name folders and files in lowercase words joined by hyphens/);
  assert.match(out, /\n  7\. Video, audio, recordings, any file over 25 MB: the shared drive/);
});

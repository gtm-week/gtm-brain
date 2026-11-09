// A bare meeting count must never read as "no meetings happened": the brain says when capture is not running.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";
const plugin = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

function brain(t) {
  const root = mkdtempSync(join(tmpdir(), "gtm-capture-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, CODEX_HOME: join(root, "profile"), GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const setup = spawnSync("bash", [join(plugin, "scripts/gtm-brain-setup/setup.sh"), "--company", "Capture Co", "--one-liner", "Testing", "--owner", "Ann Lee <ann@example.test>"], { cwd: root, env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  return { root, env };
}
const hook = f => spawnSync("bash", [join(plugin, "hooks/session-start.sh")], { cwd: f.root, env: { ...f.env, PLUGIN_ROOT: plugin, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" }, encoding: "utf8", input: JSON.stringify({ session_id: "r", cwd: f.root }) }).stdout;
const synced = root => { mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(join(root, "work/sync.json"), "{}\n"); };

test("the status says no sync, then no capture settings, then no source read, then nothing", t => {
  const { root } = brain(t), none = { coverage: [], policies: [] };
  assert.match(lib.meetingCaptureStatus(root, none), /No sync has finished/);
  assert.match(lib.meetingCaptureStatus(root, { ...none, coverage: [{}] }), /Sync skips meetings/, "a coverage record proves a sync ran");
  synced(root);
  assert.match(lib.meetingCaptureStatus(root, none), /Sync skips meetings/);
  assert.match(lib.meetingCaptureStatus(root, { coverage: [], policies: [{}] }), /no meeting source has been read yet/);
  assert.match(lib.meetingCaptureStatus(root, { coverage: [{ status: "unavailable" }], policies: [{}] }), /no meeting source has been read yet/, "a source that could not be read proves nothing");
  assert.equal(lib.meetingCaptureStatus(root, { coverage: [{ status: "unavailable" }, { status: "partial" }], policies: [{}] }), null);
});

test("the chat start and the rendered page carry the status", t => {
  const f = brain(t);
  assert.match(hook(f), /meeting capture: No sync has finished in this brain[^\n]*do not raise it otherwise/);
  const render = spawnSync("node", [join(plugin, "scripts/gtm-brain-render/render.mjs")], { cwd: f.root, env: f.env, encoding: "utf8" });
  assert.equal(render.status, 0, render.stderr);
  assert.match(readFileSync(join(f.root, "work/home/index.html"), "utf8"), /No sync has finished in this brain/);
});

test("the rules no longer defer meetings and capture one read for another task", () => {
  const rules = readFileSync(join(plugin, "templates/AGENTS.md"), "utf8").replace(/\s+/g, " ");
  assert.doesNotMatch(rules, /meetings\/events are deferred/);
  assert.match(rules, /a draft stays unrecorded, the meeting behind it is captured/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";

process.env.GTM_OS_NO_COMMIT = "1";
process.env.GTM_OS_NO_COMPILE = "1";
process.env.GTM_OS_NO_OPEN = "1";
const plugin = new URL("..", import.meta.url).pathname;
const run = (script, root, ...args) => execFileSync(process.execPath, [join(plugin, "scripts", script), root, ...args], { encoding: "utf8" });
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-time-"));
  mkdirSync(join(root, "brain"));
  writeFileSync(join(root, "brain", "admin.md"), lib.renderFrontmatter({ company: "Timeline Fixture", team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  lib.writeContext(root, "events", { title: "Events" });
  lib.addName(root, "Chris");
  return root;
};
const note = (root, content, extra = {}) => lib.appendMemory(root, "events", { authors: ["ann"], people: ["Chris"], content, ...extra }).rec;

test("timelines retain relevant dates in note text and keep all history in recording order", () => {
  const root = setup();
  const recent = note(root, "Chris agreed the plan on 9 September 2026.", { at: "2026-09-10T12:00:00Z" });
  const old = note(root, "Chris first discussed the plan around June 2026.", { at: "2026-09-12T12:00:00Z" });
  const timeless = note(root, "Chris prefers concise proposals.", { at: "2026-09-13T12:00:00Z" });
  for (let i = 1; i <= 23; i++) note(root, `Chris historical note ${i}.`, { at: `2026-08-${String(i).padStart(2, "0")}T12:00:00Z` });
  const file = join(lib.readContext(root, "events").dir, "memories.jsonl"), before = readFileSync(file, "utf8");
  const view = lib.entityBrief(root, "Chris");
  assert.equal(view.timeline.length, 26);
  assert.deepEqual(view.timeline.slice(0, 3).map(m => m.id), [timeless.id, old.id, recent.id]);
  assert.equal(view.latest_evidence_at, timeless.at);
  const timeline = view.markdown.split("## Timeline")[1].split("## Further information")[0];
  assert.ok(timeline.includes(`${lib.memoryTimeText(old)}: Chris first discussed the plan around June 2026.`));
  assert.ok(timeline.includes("Chris historical note 1."));
  assert.ok(timeline.includes("Chris historical note 23."));
  assert.ok(!timeline.includes("Event date unknown"), "timeless notes do not need an event date");
  lib.refreshEntityPages(root);
  assert.equal(readFileSync(file, "utf8"), before);
});

test("refreshing a context changes its refresh clock without redating evidence or invalidating a brief", () => {
  const root = setup();
  const m = note(root, "Chris discussed the plan in June 2026.", { at: "2026-09-10T12:00:00Z" });
  const first = lib.entityFacts(root, "Chris");
  const claim = { text: "Chris discussed a plan in June 2026.", memories: [m.id] };
  lib.compileEntity(root, "Chris", { by: "ann", as_of: first.as_of, brief: { overview: [claim], contexts: [{ context: "events", summary: [claim], open_threads: [] }], relationships: [] } });
  const before = lib.entityBrief(root, "Chris");
  const asOf = run("gtm-os-compile/compile.mjs", root, "--facts", "events").match(/^as_of: (\S+)/m)[1];
  run("gtm-os-compile/compile.mjs", root, "--apply", "events", "--by", "ann", "--as-of", asOf, "--summary", "Chris discussed the June plan.", "--now", "Confirm the plan.");
  const after = lib.entityBrief(root, "Chris"), context = lib.readContext(root, "events");
  assert.ok(context.compiledAt);
  assert.equal(after.contexts[0].refreshed_at, context.compiledAt);
  assert.equal(after.as_of, before.as_of);
  assert.equal(after.stale, false);
  assert.equal(after.compiled_at, before.compiled_at);
  assert.deepEqual(after.timeline, before.timeline);
  assert.ok(after.markdown.includes(`Context refreshed: ${lib.localDateTime(context.compiledAt)}`));
  const loaded = run("gtm-os-load/load.mjs", root, "events");
  assert.ok(loaded.includes(`Context refreshed: ${lib.localDateTime(context.compiledAt)}`));
  assert.match(loaded, /Recorded: 2026-09-10/);
  assert.match(loaded, /in June 2026/);
  assert.match(run("gtm-os-compile/compile.mjs", root, "--facts", "events"), /Recorded: 2026-09-10/);
});

test("a corrected date stays in a new note and replaces the old claim in effective timelines", () => {
  const root = setup();
  const old = note(root, "Chris signed in May 2026.");
  const corrected = note(root, "Chris actually signed on 12 June 2026.", { supersedes: old.id });
  assert.equal(lib.readMemories(root, "events").length, 2);
  const timeline = lib.entityBrief(root, "Chris").timeline;
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].id, corrected.id);
  assert.equal(timeline[0].content, corrected.content);
});

test("forking retains original recording dates and dated text while each context keeps its own timeline", () => {
  const root = setup();
  const original = note(root, "Chris discussed the plan around June 2026.", { at: "2026-09-10T12:00:00Z" });
  run("gtm-os-contexts/contexts.mjs", root, "--fork", "events", "planning", "Planning");
  const copy = lib.readMemories(root, "planning")[0];
  assert.equal(copy.at, original.at);
  assert.equal(copy.content, original.content);
  assert.deepEqual(lib.entityBrief(root, "Chris").timeline.map(m => m.id), [copy.id]);
  assert.deepEqual(lib.entityBrief(root, "Chris", { context: "events" }).timeline.map(m => m.id), [original.id]);
  assert.deepEqual(lib.entityBrief(root, "Chris", { context: "planning" }).timeline.map(m => m.id), [copy.id]);
  assert.match(lib.entityBrief(root, "Chris", { context: "events" }).markdown, /Recorded: 2026-09-10/);
});

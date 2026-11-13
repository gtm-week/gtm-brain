// The rules check on an old brain (Artur, 2026-11-11): a bare Max, a look-alike pair, a folder no RULES.md
// row names, files with no recorded reason, a name with capitals. Each finding names its rule, the person
// or path and fixed choices; fixing one through the named tool makes it go away; nothing is changed by the check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-home-"));   // never the real brains registry
const lib = await import(`${P}/lib/brain.mjs`);
const where = await import(`${P}/lib/where.mjs`);
const { ruleFindings, rulesReport } = await import(`${P}/lib/rules-check.mjs`);

test("rules check: an old brain's Max, look-alikes, stray folder, unexplained files and bad names, each with its rule and choices", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-rules-")); execFileSync("git", ["init", "-q", root]);
  for (const [k, v] of [["user.name", "Artur Wala"], ["user.email", "a@b.c"]]) execFileSync("git", ["-C", root, "config", k, v]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Artur Wala <a@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  // what an older version left behind
  lib.addName(root, "Max"); lib.addName(root, "Max Kowalski"); lib.addName(root, "Anna Lee"); lib.addName(root, "Ana Lee");
  lib.appendMemory(root, "company", { authors: ["artur-wala"], content: "Max runs the demo.", people: ["Max"] });
  for (const f of ["assets/logo.png", "projects/berlin-event/flyer.png", "projects/berlin-event/Speaker Photos/anna.png"]) { mkdirSync(join(root, f, ".."), { recursive: true }); writeFileSync(join(root, f), "x"); }
  lib.save(root, "old layout");
  const before = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });

  const f = ruleFindings(root), by = rule => f.filter(x => x.rule === rule);
  assert.deepEqual(by("P3").map(x => x.subject), ["Max"]);
  assert.match(by("P3")[0].what, /"Max" is a person known by a first name only, in 1 note since \d{4}-/);
  assert.ok(by("P3")[0].choices.some(c => /Same as Max Kowalski: merge_entities Max into Max Kowalski/.test(c)));
  assert.ok(by("P4").some(x => /Ana Lee|Anna Lee/.test(x.subject)));
  assert.ok(by("RULES.md").some(x => x.subject === "assets/"));
  assert.deepEqual(by("why").map(x => x.subject).sort(), ["assets/", "projects/berlin-event/"]);
  assert.ok(by("RULES.md naming").some(x => x.subject === "projects/berlin-event/Speaker Photos" && /Rename to projects\/berlin-event\/speaker-photos/.test(x.choices[0])));
  const report = rulesReport(root);
  assert.match(report, /^Rules check: \d+ things to look at .* Reads only; nothing was changed\./);
  assert.match(report, /\[P3\] "Max" is a person known by a first name only[\s\S]*a\) Give the full name/);
  assert.equal(execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }), before);   // the check wrote nothing
  assert.equal(execFileSync("git", ["-C", root, "status", "--short"], { encoding: "utf8" }).trim(), "");

  // fixing through the named tools clears each finding
  lib.addName(root, "Ana Lee", { not: ["Anna Lee"] });
  lib.save(root, "", { trailers: where.placementTrailers(root, [{ path: "projects/berlin-event", row: 3, why: "the Berlin event project" }]).trailers });
  const after = ruleFindings(root);
  assert.ok(!after.some(x => x.rule === "P4" && /Ana Lee/.test(x.subject)));
  assert.ok(!after.some(x => x.rule === "why" && x.subject === "projects/berlin-event/"));
  assert.ok(after.some(x => x.rule === "P3"));   // Max still waits for an answer
});

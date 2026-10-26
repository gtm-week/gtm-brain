process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";

const P = new URL("../", import.meta.url).pathname;
const rule = "Keep internal decisions with their source.";
const boundary = "Office and hiring belong here. Sales belong in pipeline.";
const now = "Confirm the lease owner.\n\nUse the signed lease for its end date.";
function fixture(scope = boundary) {
  const root = mkdtempSync(join(tmpdir(), "gtm-context-instructions-"));
  const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_VERSION_CHECK: "1",
    CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-context-profile-")) };
  execFileSync("git", ["init", "-q", root], { env });
  execFileSync("bash", [join(P, "scripts/gtm-brain-setup/setup.sh"), "--company", "Fixture", "--one-liner", "Test",
    "--owner", "Ann Lee <ann@example.test>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  lib.writeContext(root, "office", { title: "Office", rule, now, summary: "The lease was signed." });
  lib.appendMemory(root, "office", { authors: ["ann-lee"], content: "The lease was signed." });
  const path = lib.readContext(root, "office").path;
  const original = readFileSync(path, "utf8") + `\n## Scope\n\n${scope}\n`;
  writeFileSync(path, original);
  // A shipped cover's generated fingerprint excludes authored rule and Scope text.
  writeFileSync(join(root, "work/cover-state/office.json"), JSON.stringify({
    text: original, hash: createHash("sha256").update(original).digest("hex"),
  }));
  const records = lib.readMemories(root, "office");
  const run = (file, ...args) => execFileSync(process.execPath, [join(P, "scripts", file), root, ...args], { env, encoding: "utf8" });
  return { root, path, original, records, run };
}

test("legacy boundaries reach the picker, loaded instructions and dashboard without rewriting the cover", () => {
  const f = fixture(), c = lib.readContext(f.root, "office");
  assert.equal(c.rule, `${rule}\n\n${boundary}`);
  assert.equal(c.now, now);
  assert.equal(c.summary, "The lease was signed.");
  assert.equal(Object.hasOwn(c, "scope"), false);
  assert.equal(c.manualEdit.blocked, false);
  const listed = JSON.parse(f.run("gtm-brain-contexts/contexts.mjs", "--json")).find(c => c.slug === "office");
  assert.equal(listed.rule, c.rule);
  assert.equal(Object.hasOwn(listed, "scope"), false);
  const loaded = f.run("gtm-brain-load/load.mjs", "office", "--last", "0");
  assert.ok(loaded.includes(c.whenLoaded));
  assert.doesNotMatch(loaded, /## Scope/);
  f.run("gtm-brain-render/render.mjs");
  const rendered = JSON.parse(readFileSync(join(f.root, "work/home/data.json"), "utf8")).contexts.find(c => c.slug === "office");
  assert.equal(rendered.rule, c.rule);
  assert.equal(rendered.now, now);
  assert.equal(Object.hasOwn(rendered, "scope"), false);
  assert.equal(readFileSync(f.path, "utf8"), f.original);
  assert.deepEqual(lib.readMemories(f.root, "office"), f.records);
});

test("legacy placeholders and exact duplicates disappear; different requirements remain intact", () => {
  for (const scope of ["", "(what belongs here, what does not)", rule, "Keep internal decisions\nwith their source."]) {
    const f = fixture(scope);
    assert.equal(lib.readContext(f.root, "office").rule, rule);
    assert.equal(lib.readContext(f.root, "office").now, now);
  }
  const f = fixture(`${rule}\n\n${boundary}\n\n${boundary}\n\nDo not keep internal decisions here.`);
  assert.equal(lib.readContext(f.root, "office").rule, `${rule}\n\n${boundary}\n\nDo not keep internal decisions here.`);
  assert.equal(readFileSync(f.path, "utf8"), f.original, "reading never resolves conflicting authored text");
});

test("a literal Now label in legacy boundaries never replaces the compiled now field", () => {
  const f = fixture("Now: Office work.\nLater: Hiring.");
  const c = lib.readContext(f.root, "office");
  assert.equal(c.rule, `${rule}\n\n> Now: Office work.\nLater: Hiring.`);
  lib.writeContext(f.root, "office", { ...c.fm, rule: c.rule, now: c.now });
  assert.equal(lib.readContext(f.root, "office").now, now);
  assert.equal(lib.readContext(f.root, "office").rule, c.rule);
});

test("normal writers fold legacy boundaries once, preserve memories and retain the generated fields they do not own", () => {
  for (const operation of ["edit", "archive", "fork", "compile"]) {
    const f = fixture();
    if (operation === "edit") f.run("gtm-brain-contexts/contexts.mjs", "--edit", "office", "--title", "Our office");
    if (operation === "archive") f.run("gtm-brain-contexts/contexts.mjs", "--archive", "office");
    if (operation === "fork") f.run("gtm-brain-contexts/contexts.mjs", "--fork", "office", "lease", "Lease", "--filter", "lease");
    if (operation === "compile") {
      const facts = f.run("gtm-brain-compile/compile.mjs", "--facts", "office");
      assert.ok(facts.includes(boundary));
      f.run("gtm-brain-compile/compile.mjs", "--apply", "office", "--by", "ann", "--as-of", facts.match(/^as_of: (\S+)/m)[1],
        "--summary", "Compiled lease summary.", "--now", "Compiled lease guidance.");
    }
    const slug = operation === "fork" ? "lease" : "office", c = lib.readContext(f.root, slug);
    assert.equal(c.rule.split(boundary).length, 2, operation);
    assert.doesNotMatch(readFileSync(c.path, "utf8"), /## Scope|^scope:/m, operation);
    assert.equal(c.manualEdit.blocked, false, operation);
    if (operation === "fork") {
      assert.equal(readFileSync(f.path, "utf8"), f.original);
      assert.equal(c.memories.length, 1);
    } else {
      assert.equal(c.now, operation === "compile" ? "Compiled lease guidance." : now, operation);
      assert.equal(c.summary, operation === "compile" ? "Compiled lease summary." : "The lease was signed.", operation);
    }
    lib.setContextStatus(f.root, slug, "active");
    assert.equal(lib.readContext(f.root, slug).rule, c.rule, "later writes never duplicate the old boundary");
    assert.deepEqual(lib.readMemories(f.root, "office"), f.records, operation);
  }
});

test("scope edits are rejected without partial writes; an explicit rule replacement does not restore old boundaries", () => {
  const f = fixture();
  assert.throws(() => f.run("gtm-brain-contexts/contexts.mjs", "--edit", "office", "--title", "Changed", "--scope", "New scope"), /unknown context fields: scope/);
  assert.throws(() => lib.writeContext(f.root, "office", { rule, scope: boundary }), /no longer a context field/);
  assert.equal(readFileSync(f.path, "utf8"), f.original);
  f.run("gtm-brain-contexts/contexts.mjs", "--edit", "office", "--rule", "Only hiring decisions belong here.");
  const c = lib.readContext(f.root, "office");
  assert.equal(c.rule, "Only hiring decisions belong here.");
  assert.equal(c.now, now);
  assert.equal(c.summary, "The lease was signed.");
  assert.doesNotMatch(readFileSync(f.path, "utf8"), /## Scope/);
});

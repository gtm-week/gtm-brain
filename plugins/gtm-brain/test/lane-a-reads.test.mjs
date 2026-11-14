process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
process.env.GTM_BRAIN_NO_COMMIT = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import * as lib from "../lib/brain.mjs";
const P = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_VERSION_CHECK: "1" };

// one brain for the file: setup, a company name, many long notes in icp
const root = mkdtempSync(join(tmpdir(), "gtm-lane-a-"));
env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-lane-a-profile-"));
execFileSync("git", ["init", "-q", root]);
execFileSync("bash", [join(P, "scripts/gtm-brain-setup/setup.sh"), "--company", "Demo", "--one-liner", "Test", "--owner", "Ann Lee <ann@example.invalid>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
const slug = lib.listContexts(root).find(c => c.slug !== "company").slug;
lib.addName(root, "Castorama", { kind: "organization" });
const pad = "x".repeat(300);
const ids = [];
for (let i = 0; i < 420; i++) ids.push(lib.appendMemory(root, slug, { authors: ["ann-lee"], kind: i === 3 ? "decision" : i === 5 ? "question" : "note", content: `Castorama note ${i} ${pad}`, at: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString() }).rec.id);
const script = (dir, name, ...args) => spawnSync("/bin/sh", ["-c", `"${process.execPath}" "${join(P, "scripts", dir, name)}" "$@" | cat`, "sh", root, ...args], { cwd: root, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

test("compile --facts through a pipe is not cut at 64 KiB, and is a capped digest newest first", () => {
  const r = script("gtm-brain-compile", "compile.mjs", "--facts", slug);
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout;
  assert.match(out, /^as_of: s_/m);
  assert.match(out, /older notes are not shown .*the current summary carries them\. Look one up with query: object memories, filters\.context=/);
  assert.ok(out.endsWith("\n") && /filters\.entities=<id>\)\.\n$/.test(out), "the closing line arrives whole");
  const shown = out.split("\n## Effective notes since the last compile")[1].split("\n").filter(l => /^- m_/.test(l));
  assert.ok(shown.length > 50 && shown.length < 420, `capped: ${shown.length}`);
  assert.ok(shown[0].includes(ids.at(-1)), "newest first");
  assert.match(out, new RegExp(`## Decisions in force \\(1\\)\\n- ${ids[3]} `));
  assert.match(out, new RegExp(`## Open questions in force \\(1\\)\\n- ${ids[5]} `));
});

test("the as_of check still refuses an apply after a new note", () => {
  const asOf = script("gtm-brain-compile", "compile.mjs", "--facts", slug).stdout.match(/^as_of: (\S+)/m)[1];
  lib.appendMemory(root, slug, { authors: ["ann-lee"], content: "Castorama late note." });
  const r = script("gtm-brain-compile", "compile.mjs", "--apply", slug, "--by", "ann", "--as-of", asOf, "--summary", "S.", "--now", "");
  assert.match(r.stderr, /not applied: .* changed since --facts/);
});

test("a pipe over 64 KiB with a small digest budget still drains (GTM_BRAIN_FACTS_LINES)", () => {
  const r = spawnSync("/bin/sh", ["-c", `GTM_BRAIN_FACTS_LINES=6 "${process.execPath}" "${join(P, "scripts/gtm-brain-compile/compile.mjs")}" . --facts ${slug} | cat`], { cwd: root, env, encoding: "utf8" });
  assert.equal(r.status, 0);
  const shown = r.stdout.split("\n").filter(l => /^- m_/.test(l) && l.includes(" · ann-lee · note"));
  assert.ok(shown.length <= 3, `six lines is about two notes: ${shown.length}`);
});

test("recall and load lines carry note ids", () => {
  const recall = script("gtm-brain-recall", "recall.mjs", "Castorama", "--context", slug).stdout;
  assert.match(recall, /^- m_[0-9a-f]+ · /m);
  const load = script("gtm-brain-load", "load.mjs", slug).stdout;
  assert.match(load, /^- m_[0-9a-f]+ · /m);
});

test("recall --entity stays within its byte budget and says how to read more", () => {
  const r = spawnSync("/bin/sh", ["-c", `GTM_BRAIN_BRIEF_BYTES=4096 "${process.execPath}" "${join(P, "scripts/gtm-brain-recall/recall.mjs")}" . --entity Castorama --context ${slug} | cat`], { cwd: root, env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Buffer.byteLength(r.stdout) < 6000, `${Buffer.byteLength(r.stdout)} bytes`);
  assert.match(r.stdout, /more lines: query memories with filters\.entities=\S+ and filters\.context=/);
  const brief = lib.entityBrief(root, "Castorama", { context: slug });
  assert.ok(brief.timeline.length <= 50, "a context's timeline is capped");
  assert.match(brief.markdown, /\d+ more: query memories with filters\.entities=/);
});

test("deal-health shows the newest 200 and counts the rest", () => {
  const r = script("gtm-brain-recall", "deal-health.mjs", "--entity", "Castorama");
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split("\n").filter(l => /^\[m_/.test(l));
  assert.equal(lines.length, 200);
  assert.match(r.stdout, /\n\d+ more: query memories with filters\.entities=\S+\n$/);
});

test("the compile run is offered query", () => {
  const src = readFileSync(join(P, "server/server.mjs"), "utf8");
  assert.match(src, /COMPILE_TOOLSET = new Set\(\[[^\]]*"query"/);
});

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
  assert.match(out, /\n\d+ more notes newer than compiled_at are not shown and are not in the current summary: read them with query: object memories, filters\.context=/);
  assert.doesNotMatch(out, /the current summary carries them/, "never compiled: no summary carries anything");
  assert.ok(out.endsWith("\n") && /filters\.entities=<id>\) before writing\.\n$/.test(out), "the closing line arrives whole");
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

test("a summary run lists query next to the compile tools, and little else", () => {
  const output = execFileSync(process.execPath, [join(P, "server/server.mjs")], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }) + "\n",
    env: { ...env, GTM_BRAIN_RUN: "background", GTM_BRAIN_TOOLSET: "compile" }, encoding: "utf8", timeout: 60000,
  });
  const names = JSON.parse(output).result.tools.map(t => t.name);
  for (const n of ["query", "compile_facts", "compile_apply"]) assert.ok(names.includes(n), n);
  assert.ok(!names.includes("remember") && names.length <= 8, names.join(", "));
});

test("the digest keeps an older note the working guidance cites, and names a cited note that was withdrawn", () => {
  const facts = () => script("gtm-brain-compile", "compile.mjs", "--facts", slug).stdout;
  let f = facts();
  const r = script("gtm-brain-compile", "compile.mjs", "--apply", slug, "--by", "ann", "--as-of", f.match(/^as_of: (\S+)/m)[1], "--summary", `Castorama notes are recorded [${ids[10]}].`, "--now", `Keep the Castorama method (${ids[20]}).`);
  assert.equal(r.status, 0, r.stderr);
  lib.appendMemory(root, slug, { authors: ["ann-lee"], content: "Castorama after the compile." });
  f = facts();
  assert.match(f, /newest first \(1 of 1 new\)/);
  const cited = f.split("## Older notes the current summary and working guidance cite")[1];
  assert.ok(cited.includes("- " + ids[10]) && cited.includes("- " + ids[20]), "cited notes are shown in full");
  assert.match(f, /\n\d+ older notes are not shown; the current summary carries them\./);
  assert.doesNotMatch(f, /newer than compiled_at (is|are) not shown/);
  lib.appendMemory(root, slug, { authors: ["ann-lee"], content: "The Castorama method is withdrawn.", retracts: ids[20] });
  f = facts();
  assert.ok(!f.includes("- " + ids[20]));
  assert.match(f, new RegExp("No longer in force [^\\n]*" + ids[20]));
});

test("a --facts reply well over 64 KiB arrives whole through a pipe", () => {
  // decisions in force are all listed, so 120 long ones on top of the capped digest pass the pipe buffer
  const added = [];
  for (let i = 0; i < 120; i++) added.push(lib.appendMemory(root, slug, { authors: ["ann-lee"], kind: "decision", content: `Castorama decision ${i} ${pad}` }).rec.id);
  const r = script("gtm-brain-compile", "compile.mjs", "--facts", slug);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Buffer.byteLength(r.stdout) > 70 * 1024, `${Buffer.byteLength(r.stdout)} bytes`);
  for (const id of added) assert.ok(r.stdout.includes("- " + id + " · "), id);
  assert.match(r.stdout, /Look one up with query: object memories, filters\.context=\S+ \(add search or filters\.entities=<id>\)\.\n$/, "the closing line arrives whole");
});

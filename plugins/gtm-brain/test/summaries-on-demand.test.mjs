process.env.GTM_BRAIN_NO_WATCH = "1";
// Lane S1 (0.35.0): topic summaries are written on demand, in the chat that asks, and cached until new notes
// arrive. No background model run starts after a save; no reply promises a summary "shortly"; a failed write
// says what failed in the person's words, once, and the health line keeps it. Entity briefs keep the claims
// whose notes still stand without any model, and a chat read says when the overview is behind, with as_of.
// Each test fails on 0.34.5 (summary updating shortly, kickCompile after every save, compile tools hidden from a
// chat, a stale brief showing no overview at all).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const lib = await import(`${P}/lib/brain.mjs`);
const summaries = await import(`${P}/lib/summaries.mjs`);
const { healthLine } = await import(`${P}/lib/health-line.mjs`);
const { scheduleNotice } = await import(`${P}/lib/schedule.mjs`);

const profile = mkdtempSync(join(tmpdir(), "gtm-s1-profile-"));
const base = { ...process.env, CODEX_HOME: profile, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" };
delete base.GTM_BRAIN_NO_COMPILE; delete base.GTM_BRAIN_RUN;
const env = { ...base, GTM_BRAIN_NO_COMMIT: "1" };
function brain() {
  const root = mkdtempSync(join(tmpdir(), "gtm-s1-"));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [join(P, "scripts/gtm-brain-setup/setup.sh"), "--company", "Demo", "--one-liner", "Test", "--owner", "Ann Lee <ann@example.invalid>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const node = (script, args, root, extra = {}) => spawnSync(process.execPath, [join(P, "scripts", script), root, ...args], { cwd: root, env: { ...env, ...extra }, encoding: "utf8" });
const remember = (root, content, extra = {}) => node("gtm-brain-remember/remember.mjs", ["--by", "ann", "--context", "icp", "--content", content], root, extra);
const runs = root => { try { return readFileSync(join(root, "work", "runs.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };

test("a save starts no background summary run and promises nothing, even with Codex on the PATH", async () => {
  const root = brain(), bin = join(root, "fake-bin"); mkdirSync(bin);
  // a codex that counts its runs: 0.34.5 started one through background-compile.sh after this save
  writeFileSync(join(bin, "codex"), `#!/bin/sh\necho run >> "${join(root, "codex-runs")}"\n`, { mode: 0o755 });
  const r = remember(root, "Acme wants a pilot in December.", { PATH: `${bin}:${process.env.PATH}`, GTM_BRAIN_COMPILE_DELAY: "0" });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /shortly|update by themselves|updating/i);
  await new Promise(res => setTimeout(res, 1500));
  assert.equal(existsSync(join(root, "codex-runs")), false, "no model run");
  assert.equal(existsSync(join(root, "work", "compile.json")), false, "no worker state");
  assert.equal(lib.kickCompile(root, { force: true }), false);
});

test("summary state never says updating or shortly; it gives the date and how many notes are newer", () => {
  const root = brain();
  remember(root, "Acme wants a pilot in December.");
  const c = lib.readContext(root, "icp");
  const said = lib.summaryState(c);
  assert.doesNotMatch(said, /updating|shortly/);
  assert.match(said, /^no summary yet, 1 newer note \(written when asked\)$/);
  const list = node("gtm-brain-contexts/contexts.mjs", [], root).stdout;
  assert.doesNotMatch(list, /updating|shortly/);
});

test("load_context of a topic behind its notes returns the digest and as_of, the chat writes it once, then it is cached", () => {
  const root = brain();
  remember(root, "Acme wants a pilot in December.");
  remember(root, "Bergstrom asked for annual pricing.");
  const load = node("gtm-brain-load/load.mjs", ["icp", "--only"], root);
  assert.equal(load.status, 0, load.stderr);
  assert.match(load.stdout, /## Summary behind: write it now, in this chat/);
  assert.match(load.stdout, /The Target customers summary is being written now in this chat\./);
  const asOf = load.stdout.match(/as_of (s_[0-9a-f]+)/)[1];
  const facts = node("gtm-brain-compile/compile.mjs", ["--facts", "icp"], root).stdout;
  assert.equal(facts.match(/^as_of: (\S+)/m)[1], asOf, "the load's as_of is the one compile_apply checks");
  const ids = lib.effectiveMemories(lib.readMemories(root, "icp")).map(m => m.id);
  for (const id of ids) assert.ok(load.stdout.includes(id), `${id} is in the digest`);
  assert.doesNotMatch(load.stdout, /## Last \d+ of/, "the digest replaces the last-N list");
  const applied = node("gtm-brain-compile/compile.mjs", ["--checked", "--apply", "icp", "--by", "ann", "--as-of", asOf, "--summary", `Acme wants a pilot in December 2026 and Bergstrom asked for annual pricing [${ids[0]}, ${ids[1]}].`, "--now", ""], root);
  assert.equal(applied.status, 0, applied.stderr);
  const again = node("gtm-brain-load/load.mjs", ["icp", "--only"], root).stdout;
  assert.match(again, /\[summary up to date \(as of \d{4}-\d{2}-\d{2}\)/);
  assert.match(again, /Summary \(as of \d{4}-\d{2}-\d{2}, today\): Acme wants a pilot/);
  assert.doesNotMatch(again, /write it now/);
  assert.equal(runs(root).at(-1).foreground, true); assert.equal(runs(root).at(-1).turns, 1);
  // the chat start (--last 0) only says it is behind; it never asks every loaded context to be written
  remember(root, "Acme moved the pilot to January.");
  const start = node("gtm-brain-load/load.mjs", ["icp", "--only", "--last", "0"], root).stdout;
  assert.doesNotMatch(start, /write it now/); assert.match(start, /written when this context is loaded in full/);
});

test("a failed write says what failed in the person's words, once, and the health line keeps it", () => {
  const root = brain();
  remember(root, "Acme wants a pilot in December.");
  const load = node("gtm-brain-load/load.mjs", ["icp", "--only"], root).stdout, asOf = load.match(/as_of (s_[0-9a-f]+)/)[1];
  remember(root, "Bergstrom asked for annual pricing.");   // arrives while the summary is being written
  const id = lib.readMemories(root, "icp")[0].id;
  const r = node("gtm-brain-compile/compile.mjs", ["--checked", "--apply", "icp", "--by", "ann", "--as-of", asOf, "--summary", `Acme wants a pilot [${id}].`, "--now", ""], root);
  assert.equal(r.status, 4);
  assert.equal(r.stderr.match(/For the person/g).length, 1);
  assert.match(r.stderr, /The Target customers summary was not saved: new notes arrived while it was being written\. What to do: nothing/);
  const failed = runs(root).at(-1); assert.equal(failed.context, "icp"); assert.match(failed.error, /new notes arrived/);
  const line = healthLine(root, { meetings: [], coverage: [] });
  assert.match(line, /summaries \(written when asked\): none written yet, last failure .* \(icp\): new notes arrived while it was being written; what to do: nothing/);
});

test("failures from a background run read in the person's terms", () => {
  assert.match(summaries.explainFailure("attempt to write a readonly database").what, /state database \(it is read-only\)/);
  assert.match(summaries.explainFailure("unknown tool: compile_apply").what, /summary tool could not be called/);
  assert.match(summaries.explainFailure("Compilation timed out after 900000ms").what, /interrupted/);
  assert.match(summaries.explainFailure("the run did no work").what, /without writing any summary/);
  for (const raw of ["readonly database", "unknown tool", "timed out", "x"]) assert.ok(summaries.explainFailure(raw).todo.length > 10);
});

test("a summary behind for days asks for no background run at chat start", () => {
  const root = brain();
  remember(root, "Acme wants a pilot in December.");
  assert.equal(scheduleNotice(root, new Date(Date.now() + 10 * 864e5)), "");
  const advice = node("gtm-brain-advisor/advisor.mjs", ["--json"], root, { GTM_BRAIN_NOW: new Date(Date.now() + 10 * 864e5).toISOString() });
  assert.equal(advice.status, 0, advice.stderr);
  assert.doesNotMatch(advice.stdout, /"behind"/);
});

// ---------- over MCP: what a chat sees ----------
const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env: { ...env, GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1", GTM_BRAIN_NO_COMPILE: "1" } });
const pending = new Map(); let seq = 0;
createInterface({ input: server.stdout }).on("line", line => { const m = JSON.parse(line); const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); } });
const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: args }); return { text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };
after(() => server.kill());

test("a chat is offered the summary writers (not entity_facts) and writes a topic summary from load_context in two calls", async () => {
  const names = (await rpc("tools/list")).result.tools.map(t => t.name);
  for (const n of ["compile_facts", "compile_apply", "compile_entity"]) assert.ok(names.includes(n), `${n} is offered to a chat`);
  assert.ok(!names.includes("entity_facts"), "entity_facts stays with the runs");
  const root = brain();
  await call("remember", { brain: root, by: "ann", context: "icp", content: "Acme wants a pilot in December." });
  const loaded = await call("load_context", { brain: root, contexts: ["icp"], mode: "only" });
  assert.match(loaded.text, /write it now, in this chat/);
  const asOf = loaded.text.match(/as_of (s_[0-9a-f]+)/)[1], id = lib.readMemories(root, "icp")[0].id;
  const applied = await call("compile_apply", { brain: root, context: "icp", by: "ann", as_of: asOf, summary: `Acme wants a pilot in December 2026 [${id}].`, now: "" });
  assert.ok(!applied.isError, applied.text);
  assert.equal(lib.readContext(root, "icp").stale, false);
});

test("an entity brief behind its notes keeps the claims whose notes stand, drops a withdrawn one, and a chat read gives as_of", async () => {
  const root = brain();
  await call("add_name", { brain: root, name: "Alex Reed", sources: [{ kind: "user", ref: "ann" }] });
  await call("remember", { brain: root, by: "ann", memories: [
    { context: "icp", content: "Alex Reed coordinates evaluation interviews.", people: ["Alex Reed"] },
    { context: "icp", content: "Alex Reed prefers calls on Fridays.", people: ["Alex Reed"] },
  ] });
  const facts = lib.entityFacts(root, "Alex Reed"), [a, b] = facts.evidence.map(m => m.id);
  const brief = { overview: [{ text: "Alex coordinates the evaluation interviews.", memories: [a] }, { text: "Alex prefers Friday calls.", memories: [b] }],
    contexts: [{ context: "icp", summary: [{ text: "Runs the interviews.", memories: [a] }], open_threads: [] }], relationships: [] };
  lib.compileEntity(root, facts.entity.id, { as_of: facts.as_of, by: "ann", brief });
  // a new note, and the Friday note withdrawn: 0.34.5 showed "No current synthesis yet" until a background run
  await call("remember", { brain: root, by: "ann", context: "icp", people: ["Alex Reed"], content: "Alex Reed paused the interviews until January." });
  await call("remember", { brain: root, by: "ann", context: "icp", retracts: b, content: "Alex Reed has no call preference; that note was wrong." });
  const view = lib.entityBrief(root, facts.entity.id, { now: Date.now() });
  assert.equal(view.stale, true);
  assert.match(view.markdown, /## Overview\n\nAs of \d{4}-\d{2}-\d{2}:\n\n- Alex coordinates the evaluation interviews\./);
  assert.doesNotMatch(view.markdown, /Friday calls/, "a claim on a withdrawn note drops out");
  assert.match(view.markdown, /newer notes? (is|are) not in the overview yet/);
  assert.match(view.markdown, new RegExp(`Overview behind: after answering, write it once with compile_entity: entity ${facts.entity.id}, by your handle, as_of ${view.as_of}`));
  assert.equal(view.as_of, lib.entityFacts(root, facts.entity.id).as_of);
  const stored = readFileSync(join(root, facts.entity.path), "utf8");
  assert.match(stored, /Alex coordinates the evaluation interviews/, "the stored page keeps it too");
  assert.doesNotMatch(stored, /Overview behind/, "the instruction is only for a chat read");
  const read = await call("query", { brain: root, object: "brief", search: facts.entity.id });
  assert.match(read.text, /Overview behind/);
});

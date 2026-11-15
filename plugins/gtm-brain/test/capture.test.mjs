// These tests read and write the root files of a layout 2 brain: setup and the lib play a plugin that writes layout 2 at most
// (lib/layout-version.mjs GTM_BRAIN_TEST_LAYOUT). Layout 3 (about-us/, config/) is covered by config-folders.test.mjs.
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
// The nightly capture pass (lib/capture.mjs, 0.35.0): outcomes said in a chat and never saved. A fake host
// session folder and a stand-in for the model run; the real remember script and a brain made by setup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, existsSync, appendFileSync, chmodSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const scratch = mkdtempSync(join(tmpdir(), "gtm-capture-"));
process.env.CODEX_HOME = join(scratch, "codex");
process.env.CLAUDE_CONFIG_DIR = join(scratch, "claude");
process.env.GTM_BRAIN_HOME = join(scratch, "home");
process.env.GTM_BRAIN_NO_COMPILE = "1";
delete process.env.GTM_BRAIN_HOST; delete process.env.GTM_BRAIN_RUN; delete process.env.GTM_BRAIN_CAPTURE;
const lib = await import(`${P}/lib/brain.mjs`);
const capture = await import(`${P}/lib/capture.mjs`);
const { healthLine } = await import(`${P}/lib/health-line.mjs`);
test.after(() => { try { rmSync(scratch, { recursive: true, force: true }); } catch {} });

/* the stand-in for the model run: records each prompt, answers with FAKE_REPLY or fails like a host would */
const fake = join(scratch, "fake-model.mjs");
writeFileSync(fake, `import { readFileSync, appendFileSync } from "node:fs";
const prompt = readFileSync(0, "utf8");
if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, JSON.stringify(prompt) + "\\n");
if (process.env.FAKE_FAIL) { console.error(process.env.FAKE_FAIL); process.exit(1); }
process.stdout.write(process.env.FAKE_REPLY || '{"notes": []}');
`);
const prompts = log => existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];

let n = 0;
function brain() {
  const root = join(scratch, `brain-${++n}`); mkdirSync(root);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P }, stdio: "pipe" });
  return root;
}
const ctx = root => lib.listContexts(root, { includeMemories: false }).find(c => c.status === "active").slug;

/* a Codex rollout: the meta line, then the person's and the assistant's messages and a tool call between them */
function codexChat(cwd, turns, { at = Date.now(), source = "vscode", thread_source = "user", id = randomUUID() } = {}) {
  const d = new Date(at), dir = join(process.env.CODEX_HOME, "sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `rollout-${d.toISOString().slice(0, 19).replace(/:/g, "-")}-${id}.jsonl`);
  const lines = [{ type: "session_meta", payload: { id, cwd, originator: "Codex Desktop", source, thread_source } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context><cwd>x</cwd></environment_context>" }] } }];
  for (const [role, text] of turns) {
    lines.push({ timestamp: d.toISOString(), type: "response_item", payload: { type: "message", role: role === "P" ? "user" : "assistant", content: [{ type: role === "P" ? "input_text" : "output_text", text }] } });
    lines.push({ type: "response_item", payload: { type: "function_call_output", output: "TOOL OUTPUT SHOULD NOT BE READ ".repeat(50) } });
  }
  writeFileSync(file, lines.map(l => JSON.stringify(l)).join("\n") + "\n");
  utimesSync(file, d, d);
  return { id, file };
}
const addTurns = (chat, turns, at = Date.now()) => {
  appendFileSync(chat.file, turns.map(([role, text]) => JSON.stringify({ timestamp: new Date(at).toISOString(), type: "response_item", payload: { type: "message", role: role === "P" ? "user" : "assistant", content: [{ type: "output_text", text }] } })).join("\n") + "\n");
  utimesSync(chat.file, new Date(at), new Date(at));
};
const pass = (root, env = {}) => {
  const r = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-schedule/capture.mjs`, root, "--run"], { encoding: "utf8", env: { ...process.env, GTM_BRAIN_CAPTURE_MODEL: fake, GTM_BRAIN_NO_COMMIT: "1", ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}`.trim(), state: capture.readCapture(root) };
};
const reply = notes => JSON.stringify({ notes });

test("reads only this brain's chats changed since the last pass: not another folder, another brain, its own runs or old chats", t => {
  const root = brain(), other = brain(), elsewhere = join(scratch, "unrelated"); mkdirSync(elsewhere);
  const linked = join(scratch, `site-${n}`); mkdirSync(linked);
  lib.writeProjects(root, [{ slug: "website", title: "Website", path: linked, contexts: [] }]);
  lib.writePointer?.(linked, { brain: root, slug: "website" });
  const log = join(scratch, `log-${n}`);
  const mine = codexChat(root, [["P", "We decided the pilot starts on 2026-12-01 with Acme."], ["A", "Noted."]]);
  const project = codexChat(linked, [["P", "The landing page goes live on 2026-11-20."]]);
  codexChat(other, [["P", "OTHER BRAIN SECRET decision."]]);
  codexChat(elsewhere, [["P", "UNRELATED FOLDER decision."]]);
  codexChat(root, [["P", "OWN RUN compile everything."]], { source: "exec" });
  codexChat(root, [["P", "SUBAGENT text."]], { thread_source: "subagent" });
  codexChat(root, [["P", "OLD CHAT from three days ago."]], { at: Date.now() - 3 * 864e5 });
  const r = pass(root, { FAKE_LOG: log });
  assert.equal(r.code, 0, r.out);
  const [prompt] = prompts(log);
  assert.ok(prompt, "one model run");
  assert.match(prompt, new RegExp(mine.id)); assert.match(prompt, /pilot starts on 2026-12-01/);
  assert.doesNotMatch(prompt, /OTHER BRAIN|UNRELATED FOLDER|OWN RUN|SUBAGENT|OLD CHAT|TOOL OUTPUT|environment_context/);
  if (lib.writePointer) { assert.match(prompt, new RegExp(project.id)); assert.match(prompt, /\(project website\)/); }
  assert.equal(r.state.last.result, "ok"); assert.ok(r.state.through, "the pass records how far it read");
  // a second pass with nothing new starts no model run at all
  const again = pass(root, { FAKE_LOG: log });
  assert.equal(again.code, 0, again.out); assert.equal(prompts(log).length, 1, "a chat already fully read is not sent again");
  // a chat that goes on is read from where the last pass stopped, with the two turns before it as context
  addTurns(mine, [["P", "Correction: the pilot starts on 2026-12-08, not 2026-12-01."]], Date.now() + 1000);
  pass(root, { FAKE_LOG: log, GTM_BRAIN_NOW: new Date(Date.now() + 5000).toISOString() });
  const third = prompts(log)[1];
  assert.match(third, /Correction: the pilot starts on 2026-12-08/); assert.match(third, /earlier P .*pilot starts on 2026-12-01/);
  assert.equal(third.split("\n").filter(l => /^P .*pilot starts on 2026-12-01/.test(l)).length, 0, "the old turn is context, not new");
});

test("candidates go through remember: tagged captured, the chat as source, via schedule; invented quotes and duplicates are dropped", t => {
  const root = brain(), slug = ctx(root);
  const chat = codexChat(root, [["P", "OK, final answer: we go with the annual plan at 40 EUR per seat for Acme."], ["A", "Got it."], ["P", "And Tom owns the renewal call."]]);
  lib.appendMemory(root, slug, { authors: ["marta-nowak"], content: "Tom owns the renewal call.", source: [] });
  const r = pass(root, { FAKE_REPLY: reply([
    { chat: chat.id, context: slug, kind: "decision", content: "Acme goes with the annual plan at 40 EUR per seat \u2014 decided by Marta.", quote: "we go with the annual plan at 40 EUR per seat for Acme." },
    { chat: chat.id, context: slug, kind: "decision", content: "Acme gets a 50% discount.", quote: "Acme gets a 50% discount" },
    { chat: chat.id, context: slug, kind: "note", content: "Tom owns the renewal call.", quote: "And Tom owns the renewal call." },
    { chat: "not-a-chat", context: slug, content: "x", quote: "y" },
  ]) });
  assert.equal(r.code, 0, r.out);
  const saved = lib.effectiveMemories(lib.readMemories(root, slug)).filter(m => (m.tags || []).includes("captured"));
  assert.equal(saved.length, 1, r.out);
  const [m] = saved;
  assert.equal(m.via, "schedule"); assert.deepEqual(m.authors, ["marta-nowak"]); assert.equal(m.kind, "decision");
  assert.deepEqual(m.source, [{ kind: "codex", ref: chat.id }]);
  assert.ok(m.tags.includes(`capture:${r.state.last.id}`));
  assert.doesNotMatch(m.content, /\u2014/, "a long dash becomes a hyphen before the saving rules see it");
  const run = JSON.parse(readFileSync(join(root, "work/capture-runs.jsonl"), "utf8").trim().split("\n").pop());
  assert.deepEqual(run.dropped.map(d => d.why).sort(), ["already saved", "names no chat that was read", "the quote is not in the chat"]);
  assert.ok(run.tokens.estimated > 0, "each pass records its tokens");
  // the next pass gives the model what was already saved from this chat, so it is not proposed twice
  addTurns(chat, [["P", "Also: kickoff on 2026-12-02."]], Date.now() + 1000);
  const log = join(scratch, `log-saved-${n}`);
  pass(root, { FAKE_LOG: log, GTM_BRAIN_NOW: new Date(Date.now() + 5000).toISOString() });
  assert.match(prompts(log)[0], /saved from this chat:\n- Acme goes with the annual plan/);
});

test("the chat start lists the captured notes once, and undo captured withdraws them together", t => {
  const root = brain(), slug = ctx(root);
  const chat = codexChat(root, [["P", "Decision: we drop the Berlin event."], ["P", "We will send the Acme proposal by 2026-11-21."], ["P", "We meet Acme again on Thursday."]]);
  pass(root, { FAKE_REPLY: reply([
    { chat: chat.id, context: slug, kind: "decision", content: "We drop the Berlin event.", quote: "Decision: we drop the Berlin event." },
    { chat: chat.id, context: slug, kind: "note", content: "We send the Acme proposal by 2026-11-21.", quote: "We will send the Acme proposal by 2026-11-21." },
    { chat: chat.id, context: slug, kind: "note", content: "We meet Acme again on Thursday.", quote: "We meet Acme again on Thursday." },
  ]) });
  const line = capture.captureNotice(root);
  assert.match(line, /2 notes captured from your recent chats: "We drop the Berlin event."; "We send the Acme proposal by 2026-11-21."\. Say 'undo captured' to withdraw them\./);
  assert.match(line, /capture_chats mode undo/);
  assert.match(line, /CAPTURED, HELD: 1 outcome .*"We meet Acme again on Thursday\."/, "a note the saving rules held (a bare weekday) is named, never lost");
  assert.equal(line.split("\n").length, 2, "one line for the saved notes, one for the held one");
  assert.equal(capture.captureNotice(root), "", "said once");
  const r = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-schedule/capture.mjs`, root, "--undo"], { encoding: "utf8", env: { ...process.env, GTM_BRAIN_NO_COMMIT: "1" } });
  assert.match(r.stdout, /withdrew 2 captured notes/, r.stderr);
  const left = lib.effectiveMemories(lib.readMemories(root, slug)).filter(m => !m.retracts && (m.tags || []).includes("captured"));
  assert.equal(left.length, 0);
  assert.equal(lib.readMemories(root, slug).filter(m => m.retracts).length, 2, "withdrawn by new records, never by editing the old lines");
});

test("the cap: the pass stops near it, says what it left, and the next pass continues there", t => {
  const root = brain(), log = join(scratch, `log-cap-${n}`);
  const long = i => `Turn ${i}: ${"we talked about the pricing page and the onboarding plan ".repeat(12)}`;
  const a = codexChat(root, Array.from({ length: 12 }, (_, i) => ["P", long(i)]), { at: Date.now() - 3600e3 });
  const b = codexChat(root, [["P", "B CHAT decision: the webinar moves to 2026-12-10."]], { at: Date.now() - 1800e3 });
  capture.setCapture(root, { cap: 1500 });
  const first = pass(root, { FAKE_LOG: log });
  assert.equal(first.code, 0, first.out);
  assert.equal(first.state.last.result, "partial");
  assert.match(first.out, /left for the next pass at the pass cap/);
  const p1 = prompts(log)[0];
  assert.ok(capture.tokens(p1) <= 1500 + 50, `the prompt stays under the cap (${capture.tokens(p1)})`);
  assert.match(p1, /Turn 0:/); assert.doesNotMatch(p1, /B CHAT/);
  assert.ok(first.state.pending.some(p => p.chat === a.id) && first.state.pending.some(p => p.chat === b.id), JSON.stringify(first.state.pending) + first.out);
  // nothing changed in the files since: the chats left over are still read next time, from where it stopped
  for (let i = 0; i < 6 && capture.readCapture(root).pending?.length; i++) pass(root, { FAKE_LOG: log });
  const all = prompts(log).join("\n");
  for (let i = 0; i < 12; i++) assert.equal((all.match(new RegExp(`^P \\[[^\\]]+\\]: Turn ${i}:`, "gm")) || []).length, 1, `turn ${i} read exactly once`);
  assert.match(all, /B CHAT decision/);
  assert.equal(capture.readCapture(root).pending.length, 0);
  // the per-chat cap: one long chat cannot take the whole pass
  capture.setCapture(root, { cap: 200000, chat_cap: 1200 });
  const c = codexChat(root, Array.from({ length: 8 }, (_, i) => ["P", `C${long(i)}`]), { at: Date.now() + 1000 });
  const r = pass(root, { FAKE_LOG: log, GTM_BRAIN_NOW: new Date(Date.now() + 5000).toISOString() });
  assert.match(r.out, /at the chat cap/); assert.ok(r.state.pending.some(p => p.chat === c.id));
});

test("the heartbeat: fine, late after 36 hours, failed with the reason in the person's terms, and off", t => {
  const root = brain();
  assert.equal(capture.captureHealth(root).state, "never");
  // a new brain's first chats (onboarding) are not asked about a pass that had nothing to read yet
  assert.equal(capture.captureNotice(root), "", "no offer in the first 36 hours");
  assert.equal(capture.captureNotice(root, { now: Date.now() + 35 * 3600e3 }), "");
  assert.match(capture.captureNotice(root, { mark: false, now: Date.now() + 37 * 3600e3 }), /CAPTURE LATE: .*has not run on this machine yet.*Run it now in the background\? Yes, run it now \/ No, skip it/);
  codexChat(root, [["P", "We decided to hire a second SDR."]]);
  pass(root);
  const fine = capture.captureHealth(root);
  assert.equal(fine.state, "fine"); assert.match(fine.text, /chat capture: last pass .* UTC, 0 notes saved, \d+ tokens/);
  assert.equal(capture.captureNotice(root, { mark: false }), "", "a fine pass says nothing at the chat start");
  assert.match(capture.statusText(root), /chat capture: last pass/);
  const later = Date.now() + 37 * 3600e3;
  assert.equal(capture.captureHealth(root, later).state, "late");
  assert.match(capture.captureHealth(root, later).text, /late, the last good pass was .* \(more than 36 hours ago\)/);
  assert.match(capture.captureNotice(root, { now: later }), /CAPTURE LATE: .*the last good pass was/);
  assert.equal(capture.captureNotice(root, { now: later + 3600e3 }), "", "offered at most once a day");
  // the three failures a real machine had for weeks without anyone being told
  for (const [fail, re] of [["Error: Not logged in. Run codex login.", /not signed in on this machine: open Codex and sign in/], ["Error: attempt to write a readonly database", /cannot write its own state database on this machine \(it is read-only\)/]]) {
    codexChat(root, [["P", `Decided: ${fail.length} things.`]], { at: Date.now() + 2000 });
    const r = pass(root, { FAKE_FAIL: fail, GTM_BRAIN_NOW: new Date(Date.now() + 10000).toISOString() });
    assert.equal(r.code, 1); assert.equal(r.state.last.result, "failed"); assert.match(r.state.last.reason, re);
    assert.match(capture.captureHealth(root).text, /the last pass failed .*: .*; last good pass/);
    assert.match(healthLine(root, { coverage: [], policies: [], meetings: [] }), re);
  }
  const missing = pass(root, { GTM_BRAIN_CAPTURE_MODEL: join(scratch, "no-such-model"), GTM_BRAIN_NOW: new Date(Date.now() + 20000).toISOString() });
  assert.match(missing.state.last.reason, /could not be started: it is not installed where the background run looks/);
  assert.match(capture.captureNotice(root, { now: later + 2 * 864e5 }), /the last pass failed: .*say what to fix instead of offering the run/);
  // off: no pass, no model run, no chat start line; the health line says it is off
  const log = join(scratch, `log-off-${n}`);
  capture.setCapture(root, { on: false });
  const off = pass(root, { FAKE_LOG: log });
  assert.equal(off.code, 0); assert.match(off.out, /off on this machine/); assert.equal(prompts(log).length, 0);
  assert.equal(capture.captureNotice(root, { now: later + 9 * 864e5 }), "");
  assert.match(capture.statusText(root), /chat capture: off on this machine/);
  capture.setCapture(root, { on: true });
  assert.equal(capture.captureSettings(root).on, true);
  assert.throws(() => capture.setCapture(root, { cap: -5 }), /whole number/);
});

test("Claude Code: sessions under projects/, matched by the cwd inside the file, words only", t => {
  const root = brain(), slug = ctx(root), log = join(scratch, `log-claude-${n}`);
  const dir = join(process.env.CLAUDE_CONFIG_DIR, "projects", lib.resolveBrain(root).root.replace(/[^A-Za-z0-9]/g, "-")); mkdirSync(dir, { recursive: true });
  const id = randomUUID(), cwd = lib.resolveBrain(root).root, at = new Date().toISOString();
  writeFileSync(join(dir, `${id}.jsonl`), [
    { type: "queue-operation" },
    { type: "user", cwd, entrypoint: "cli", timestamp: at, message: { role: "user", content: "We settled it: Acme renews on 2027-01-01." } },
    { type: "assistant", cwd, timestamp: at, message: { role: "assistant", content: [{ type: "thinking", thinking: "SECRET THINKING" }, { type: "text", text: "Understood." }, { type: "tool_use", name: "Bash", input: {} }] } },
    { type: "user", cwd, timestamp: at, message: { role: "user", content: [{ type: "tool_result", content: "TOOL RESULT" }] } },
    { type: "user", cwd, isMeta: true, timestamp: at, message: { role: "user", content: "META" } },
    { type: "user", cwd, isCompactSummary: true, timestamp: at, message: { role: "user", content: "COMPACTED: this session is being continued; the person decided things." } },
  ].map(l => JSON.stringify(l)).join("\n") + "\n");
  const r = pass(root, { GTM_BRAIN_HOST: "claude", FAKE_LOG: log, FAKE_REPLY: reply([{ chat: id, context: slug, kind: "decision", content: "Acme renews on 2027-01-01.", quote: "Acme renews on 2027-01-01." }]) });
  assert.equal(r.code, 0, r.out);
  const [prompt] = prompts(log);
  assert.match(prompt, /P \[\d{4}-\d\d-\d\d\]: We settled it/); assert.match(prompt, /A \[[^\]]+\]: Understood\./);
  assert.doesNotMatch(prompt, /SECRET THINKING|TOOL RESULT|META|COMPACTED/);
  const [m] = lib.readMemories(root, slug).filter(x => (x.tags || []).includes("captured"));
  assert.deepEqual(m.source, [{ kind: "claude", ref: id }]);
});

test("capture_chats is a tool: status, settings and undo through the server; run starts in the background", async t => {
  const root = brain();
  const rpc = msgs => spawnSync(process.execPath, [`${P}/server/server.mjs`], { input: msgs.map(m => JSON.stringify(m)).join("\n") + "\n", encoding: "utf8", env: { ...process.env, GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_RUN: "test" }, timeout: 30000 });
  const r = rpc([{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "capture_chats", arguments: { brain: root, mode: "status", cap: 150000 } } }]);
  const replies = r.stdout.split("\n").filter(Boolean).map(l => JSON.parse(l));
  assert.ok(replies.find(x => x.id === 2).result.tools.some(x => x.name === "capture_chats"));
  assert.match(replies.find(x => x.id === 3).result.content.map(c => c.text).join("\n"), /cap 150,000 tokens per pass, 50,000 per chat/);
  assert.equal(capture.captureSettings(root).cap, 150000);
});

/* ---------- review, 0.35.0 round three: what the tests above would not have caught ---------- */
test("a thread started days ago and continued today is read: the rollout stays in the folder of the day it started", t => {
  const root = brain(), log = join(scratch, `log-resumed-${n}`);
  const old = codexChat(root, [["P", "Old news from last week."]], { at: Date.now() - 6 * 864e5 });
  addTurns(old, [["P", "RESUMED TODAY: we decided to close the Lyon office on 2027-03-01."]], Date.now() - 60000);
  const r = pass(root, { FAKE_LOG: log });
  assert.equal(r.code, 0, r.out);
  assert.match(prompts(log)[0] || "", /RESUMED TODAY/, "a chat changed since the last pass is found wherever its file lies");
});

test("a pass whose only candidates are held by the saving rules is not a failed pass, and does not read the chat again", t => {
  const root = brain(), slug = ctx(root), log = join(scratch, `log-held-${n}`);
  const chat = codexChat(root, [["P", "We meet Acme again on Thursday."]]);
  const FAKE_REPLY = reply([{ chat: chat.id, context: slug, kind: "note", content: "We meet Acme again on Thursday.", quote: "We meet Acme again on Thursday." }]);
  const r = pass(root, { FAKE_LOG: log, FAKE_REPLY });
  assert.equal(r.code, 0, r.out); assert.notEqual(r.state.last.result, "failed", r.state.last.reason);
  assert.match(capture.captureNotice(root, { mark: false }), /CAPTURED, HELD: 1 outcome .*Thursday/);
  pass(root, { FAKE_LOG: log, FAKE_REPLY });
  assert.equal(prompts(log).length, 1, "the same turns are not sent to the model every night");
});

test("the reason is the real one: a model that is not found is not a missing install, a failed sign-in check is not a sign-out", t => {
  const root = brain(), bin = join(scratch, `bin-${n}`), argsLog = join(scratch, `args-${n}`); mkdirSync(bin);
  writeFileSync(join(bin, "codex"), `#!/usr/bin/env node
const a = process.argv.slice(2), fs = require("node:fs");
if (a[0] === "login") { if (process.env.FAKE_LOGIN) { console.error(process.env.FAKE_LOGIN); process.exit(1); } console.log("Logged in using ChatGPT"); process.exit(0); }
fs.appendFileSync(process.env.FAKE_ARGS, JSON.stringify(a) + "\\n"); fs.readFileSync(0, "utf8");
console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: '{"notes": []}' } }));
console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 4321, cached_input_tokens: 21, output_tokens: 7 } }));
`); chmodSync(join(bin, "codex"), 0o755);
  const real = (env = {}) => pass(root, { GTM_BRAIN_CAPTURE_MODEL: "", PATH: `${bin}:${process.env.PATH}`, FAKE_ARGS: argsLog, ...env });
  let k = 0, step = 0; const t0 = Date.now(), fresh = () => codexChat(root, [["P", `Decided: thing number ${++k}.`]], { at: t0 + k * 100000 });
  const later = () => new Date(t0 + k * 100000 + 5000 + (step++) * 1000).toISOString();
  // the real command, through the host adapter: read-only, no tools to write with, and the host's own token count in the record
  fresh(); const ok = real({ GTM_BRAIN_NOW: later() });
  assert.equal(ok.code, 0, ok.out); assert.equal(ok.state.last.tokens, 4321, "the tokens the host reports, not the estimate");
  const args = JSON.parse(readFileSync(argsLog, "utf8").trim().split("\n")[0]);
  assert.equal(args[0], "exec"); assert.ok(args.includes("read-only") && args.includes("--ephemeral") && !args.includes("workspace-write"), args.join(" "));
  fresh(); const out = real({ GTM_BRAIN_NOW: later(), FAKE_LOGIN: "Error: operation timed out reading the keychain" });
  assert.equal(out.state.last.result, "failed"); assert.doesNotMatch(out.state.last.reason, /not signed in/, out.state.last.reason);
  const signedOut = real({ GTM_BRAIN_NOW: later(), FAKE_LOGIN: "Not logged in" });
  assert.match(signedOut.state.last.reason, /not signed in on this machine: open Codex and sign in/);
  const model = pass(root, { GTM_BRAIN_NOW: later(), FAKE_FAIL: "Error: the model gpt-9 was not found (404)" });
  assert.doesNotMatch(model.state.last.reason, /not installed/, model.state.last.reason);
  assert.match(model.state.last.reason, /gpt-9 was not found/);
});

test("never another brain's chats: a brain nested in this one, and a linked folder whose pointer names another brain", t => {
  const root = brain(), other = brain(), log = join(scratch, `log-nested-${n}`);
  const nested = join(root, "clients", "inner"); mkdirSync(join(nested, "brain"), { recursive: true }); writeFileSync(join(nested, "brain", "admin.md"), readFileSync(join(other, "brain", "admin.md")));
  const moved = join(scratch, `moved-${n}`); mkdirSync(moved);
  lib.writeProjects(root, [{ slug: "moved", title: "Moved", path: moved, contexts: [] }]);
  lib.writePointer(moved, { brain: other, slug: "moved" });
  const mine = codexChat(join(root, "brain"), [["P", "MINE: decided in a sub-folder of this brain."]]);
  codexChat(nested, [["P", "NESTED BRAIN text."]]); codexChat(moved, [["P", "RELINKED FOLDER text."]]);
  codexChat(`${root}-sibling`, [["P", "SIBLING PREFIX text."]]);
  pass(root, { FAKE_LOG: log });
  const [prompt] = prompts(log);
  assert.match(prompt, new RegExp(mine.id)); assert.doesNotMatch(prompt, /NESTED BRAIN|RELINKED FOLDER|SIBLING PREFIX/);
});

test("a quote of a word or two proves nothing: the candidate is dropped", t => {
  const root = brain(), slug = ctx(root);
  const chat = codexChat(root, [["P", "Maybe we go with the annual plan, not sure yet."]]);
  pass(root, { FAKE_REPLY: reply([{ chat: chat.id, context: slug, kind: "decision", content: "Acme signed a three year contract for 900000 EUR.", quote: "we go" }]) });
  assert.equal(lib.readMemories(root, slug).filter(m => (m.tags || []).includes("captured")).length, 0);
});

test("undo captured withdraws the notes the person was shown, not ones a later pass saved unseen", t => {
  const root = brain(), slug = ctx(root);
  const chat = codexChat(root, [["P", "Decision: we drop the Berlin event."]]);
  pass(root, { FAKE_REPLY: reply([{ chat: chat.id, context: slug, kind: "decision", content: "We drop the Berlin event.", quote: "Decision: we drop the Berlin event." }]) });
  assert.match(capture.captureNotice(root), /Berlin/);
  addTurns(chat, [["P", "Decision: we keep the Paris event."]], Date.now() + 1000);
  pass(root, { GTM_BRAIN_NOW: new Date(Date.now() + 5000).toISOString(), FAKE_REPLY: reply([{ chat: chat.id, context: slug, kind: "decision", content: "We keep the Paris event.", quote: "Decision: we keep the Paris event." }]) });
  const live = () => lib.effectiveMemories(lib.readMemories(root, slug)).filter(m => !m.retracts && (m.tags || []).includes("captured")).map(m => m.content);
  assert.equal(live().length, 2);
  const save = process.env.GTM_BRAIN_NO_COMMIT; process.env.GTM_BRAIN_NO_COMMIT = "1";
  try {
    const r = capture.undoCaptured(root);
    assert.equal(r.withdrawn, 1, r.text);
    assert.deepEqual(live(), ["We keep the Paris event."], "the note nobody has been shown stays");
    assert.match(capture.captureNotice(root, { now: Date.now() + 10000 }), /1 note captured from your recent chats: "We keep the Paris event\."/, "and is still listed at the next chat start");
  } finally { if (save === undefined) delete process.env.GTM_BRAIN_NO_COMMIT; else process.env.GTM_BRAIN_NO_COMMIT = save; }
});

test("a cap smaller than one turn still moves forward: a pass never reports partial for ever while reading nothing", t => {
  const root = brain(), log = join(scratch, `log-tiny-${n}`);
  codexChat(root, [["P", "TINY ONE: the offsite is on 2027-01-15."], ["P", "TINY TWO: the budget is 20000 EUR."]]);
  capture.setCapture(root, { cap: 40, chat_cap: 40 });
  for (let i = 0; i < 4; i++) pass(root, { FAKE_LOG: log });
  const all = prompts(log).join("\n");
  assert.match(all, /TINY ONE/); assert.match(all, /TINY TWO/);
  assert.equal((capture.readCapture(root).pending || []).length, 0);
});

test("the health line says nothing while the capture is fine or switched off; status still does", t => {
  const root = brain(), none = { coverage: [], policies: [], meetings: [] };
  codexChat(root, [["P", "We decided to hire a second SDR."]]);
  pass(root);
  assert.doesNotMatch(healthLine(root, none) || "", /chat capture:/, "nothing to read at every chat start when all is well");
  assert.match(capture.statusText(root), /chat capture: last pass/);
  capture.setCapture(root, { on: false });
  assert.doesNotMatch(healthLine(root, none) || "", /chat capture:/);
  assert.match(capture.statusText(root), /off on this machine/);
});

test("capture_chats mode run through the server starts a pass that finishes and records itself", async t => {
  const root = brain(), log = join(scratch, `log-run-${n}`);
  codexChat(root, [["P", "SERVER RUN: we decided to move the launch to 2027-02-10."]]);
  const r = spawnSync(process.execPath, [`${P}/server/server.mjs`], { input: [{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "capture_chats", arguments: { brain: root, mode: "run" } } }].map(m => JSON.stringify(m)).join("\n") + "\n", encoding: "utf8",
    env: { ...process.env, GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_RUN: "test", GTM_BRAIN_CAPTURE_MODEL: fake, GTM_BRAIN_NO_COMMIT: "1", FAKE_LOG: log }, timeout: 30000 });
  assert.match(r.stdout, /started in the background/);
  for (let i = 0; i < 100 && !capture.readCapture(root).last; i++) await wait(100);
  assert.equal(capture.readCapture(root).last?.result, "ok"); assert.match(prompts(log)[0] || "", /SERVER RUN/);
});

/* ---------- review, 0.35.0 round three, second pass ---------- */
test("never an invented name or figure: a person, company or number the chat does not have drops the candidate", t => {
  const root = brain(), slug = ctx(root);
  const chat = codexChat(root, [["P", "Final: Acme pays 40,000 EUR a year and Tom runs the kickoff on 2026-12-01."]]);
  const r = pass(root, { FAKE_REPLY: reply([
    { chat: chat.id, context: slug, kind: "decision", content: "Acme pays 45000 EUR a year.", quote: "Acme pays 40,000 EUR a year", companies: ["Acme"] },
    { chat: chat.id, context: slug, kind: "note", content: "Tom runs the kickoff with Globex.", quote: "Tom runs the kickoff on 2026-12-01", companies: ["Globex"] },
    { chat: chat.id, context: slug, kind: "note", content: "Tomasz Wilk runs the kickoff.", quote: "Tom runs the kickoff on 2026-12-01", people: ["Tomasz Wilk"] },
    { chat: chat.id, context: slug, kind: "decision", content: "Acme pays 40000 EUR a year from 2026-12-01.", quote: "Acme pays 40,000 EUR a year", companies: ["Acme Inc."] },
  ]) });
  assert.equal(r.code, 0, r.out);
  const saved = lib.readMemories(root, slug).filter(m => (m.tags || []).includes("captured")).map(m => m.content);
  assert.deepEqual(saved, ["Acme pays 40000 EUR a year from 2026-12-01."], r.out);
  const run = JSON.parse(readFileSync(join(root, "work/capture-runs.jsonl"), "utf8").trim().split("\n").pop());
  assert.deepEqual(run.dropped.map(d => d.why).sort(), ["names Globex, who is not in the chat", "names Tomasz Wilk, who is not in the chat", "the figure 45000 is not in the chat"]);
});

test("the pass leaves sharing to the next commit; the person's undo is shared at once, as their own save", async t => {
  const root = brain(), slug = ctx(root), remote = join(scratch, `remote-${n}.git`);
  execFileSync("git", ["init", "-q", "--bare", remote]);
  execFileSync("git", ["-C", root, "remote", "add", "origin", remote]);
  execFileSync("git", ["-C", root, "push", "-q", "-u", "origin", "HEAD"], { stdio: "pipe" });
  const remoteLog = () => execFileSync("git", ["-C", remote, "log", "--all", "--format=%s"], { encoding: "utf8" });
  const before = remoteLog();
  const chat = codexChat(root, [["P", "Decision: we drop the Berlin event."]]);
  const env = { ...process.env, GTM_BRAIN_CAPTURE_MODEL: fake, FAKE_REPLY: reply([{ chat: chat.id, context: slug, kind: "decision", content: "We drop the Berlin event.", quote: "Decision: we drop the Berlin event." }]) };
  delete env.GTM_BRAIN_NO_COMMIT;
  const r = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-schedule/capture.mjs`, root, "--run"], { encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  await wait(1500);
  assert.equal(remoteLog(), before, "the pass itself pushes nothing");
  assert.match(execFileSync("git", ["-C", root, "status", "--porcelain", "brain"], { encoding: "utf8" }), /^$/, "but it committed its notes");
  assert.match(capture.captureNotice(root), /Berlin/);
  const { GTM_BRAIN_NO_COMMIT, ...undoEnv } = process.env;
  const u = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-schedule/capture.mjs`, root, "--undo"], { encoding: "utf8", env: undoEnv });
  assert.match(u.stdout, /withdrew 1 captured note/, u.stderr);
  const withdrawn = lib.readMemories(root, slug).find(m => m.retracts);
  assert.equal(withdrawn.via, "codex", "the person's own withdrawal, not the schedule's");
  let shared = ""; for (let i = 0; i < 50 && !/Withdrawn: a note the chat capture/.test(shared = execFileSync("git", ["-C", remote, "log", "--all", "-p", "--format=%s"], { encoding: "utf8" })); i++) await wait(200);
  assert.match(shared, /Withdrawn: a note the chat capture saved/, "the withdrawal reaches the team without waiting for another save");
});

test("a key pasted into a chat is removed before the pass counts, sends or quotes the turn", async () => {
  const { redactSecrets, compactText, SECRET_MARK } = await import("../lib/capture.mjs");
  // built from parts, so no line of this file is itself shaped like a real key (hosts refuse a push that holds one)
  const j = (...parts) => parts.join("");
  const cases = [
    j("here is the key s", "k-proj-", "A1b2C3d4E5f6", "G7h8I9j0K1l2M3n4 use it"),
    j("ZYNT api key: zk_", "9f8e7d6c5b4a", "39281706f5e4d3c2b1a0"),
    j("Authorization: Bearer ey", "JhbGci", "OiJIUzI1NiJ9.", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", ".abcDEF123456ghiJKL"),
    j("token = gh", "p_", "0123", "456789abcdefghijklmnopqrstuvwxyzAB"),
    j("slack xo", "xb-", "1234", "56789012-abcdefghijklmnop"),
    j("raw ", "9f8e7d6c5b4a", "39281706f5e4d3c2b1a09f8e7d6c5b4a3928 pasted"),
  ];
  for (const c of cases) {
    const out = compactText(c, "person");
    assert.ok(out.includes(SECRET_MARK), c);
    assert.doesNotMatch(out, /A1b2C3d4E5f6|9f8e7d6c5b4a|JhbGci|p_0123|xb-1234/, c);
  }
  // ordinary text, ids the brain uses and file paths are left alone
  for (const plain of ["Max will send the token gesture budget by Tuesday.", "see m_6cc01aba36bf and e_0123456789abcdef", "open plugins/gtm-brain/skills/gtm-brain-use-brain/references/documents.md", "the password policy is reviewed in March"]) assert.equal(redactSecrets(plain), plain);
});

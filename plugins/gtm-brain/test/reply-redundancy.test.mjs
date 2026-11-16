// What a tool says back, said once (2026-11-16: a "Remembering" call showed the note twice, four lines saying the
// save worked, a long hint about the word "Paid" and a whole rule page after a save that worked).
// - a save that worked: the note once, in quotes, in one line, and no rule page;
// - a save held or refused: its rule page, once per chat;
// - the "not linked" hint: not for a stage or plan word, still for a company nobody listed;
// - every line another part of the plugin reads keeps the shape it reads.
// Run: node --test plugins/gtm-brain/test/reply-redundancy.test.mjs
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { removeBrain } from "./helpers/dash-cleanup.mjs";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const lib = await import(`${P}/lib/brain.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-reply-codex-")), HOME: mkdtempSync(join(tmpdir(), "gtm-reply-home-")),
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1", GTM_BRAIN_NO_TOOLS_CHECK: "1" };
for (const k of ["GTM_BRAIN_NO_COMMIT", "GTM_BRAIN_NO_SESSION_START", "GTM_BRAIN_RUN", "GTM_BRAIN_HOST", "GTM_BRAIN_NO_RULE_PAGES", "GTM_BRAIN_TOOLSET"]) delete env[k];

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-reply-brain-")));
  after(() => removeBrain(root));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Pagecraft", "--one-liner", "docs for teams", "--owner", "Ann Lee <ann@example.test>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
function client() {
  const child = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env });
  const pending = new Map(); let seq = 0;
  createInterface({ input: child.stdout }).on("line", line => { const m = JSON.parse(line); const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); } });
  const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: args }); return { parts: m.result.content.map(c => c.text), text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };
  after(() => child.kill());
  return { call, init: () => rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } }) };
}
// the save script as the server, the dashboard and the nightly capture run it
const remember = (root, ...argv) => { const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", `${P}/scripts/gtm-brain-remember/remember.mjs`, root, ...argv], { cwd: root, env, encoding: "utf8" }); return { code: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout, stderr: r.stderr }; };
const count = (text, piece) => text.split(piece).length - 1;

test("a save that worked says it once: one line with the id, the context and the note in quotes, and no rule page", async () => {
  const root = brain(); const s = client(); await s.init();
  const note = "Norwind signed the Paid plan for 40 seats on 10 November 2026.";
  // the first call of the chat: it carries the chat start, and still no rule page
  const first = await s.call("remember", { brain: root, by: "ann-lee", context: "company", content: note });
  assert.ok(!first.isError, first.text);
  const reply = first.parts[0];
  assert.equal(count(reply, note), 1, `the note is said once:\n${reply}`);
  assert.match(reply, /^remembered m_[0-9a-f]{12} in company \(Our company\) · note · ann-lee · "Norwind signed the Paid plan for 40 seats on 10 November 2026\."$/m, "where it went and what landed, in quotes (ALL-209)");
  assert.doesNotMatch(reply, /^ok: remember|^saved in |^kept$/m, "nothing else says that the save worked");
  assert.match(reply, /^Reply to the person in one line/m, "the one-line reply stays asked for (benchmark 2026-11-15)");
  assert.ok(first.parts.some(p => p.startsWith("GTM Brain chat start")), "the chat start came with this first call");
  assert.ok(!first.parts.some(p => p.includes("--- Rule page:")), "no rule page after a save that worked");
  assert.equal(count(first.text, "--- The saving rules for this chat"), 1, "the numbered saving rules come once, with the chat start");
  // a later save: the same shape, nothing else
  const later = await s.call("remember", { brain: root, by: "ann-lee", context: "company", content: "Quillfield renewal is due 15 January 2027.", companies: ["Quillfield"] });
  assert.equal(later.parts.length, 1); assert.equal(count(later.text, "Quillfield renewal is due 15 January 2027."), 1);
  assert.doesNotMatch(later.text, /Rule page|saving rules/);
  // a whole turn: one line per note, each note once, a count and no list of ids above them
  const batch = await s.call("remember", { brain: root, by: "ann-lee", context: "company", memories: [{ content: "Pricing review is set for 3 December 2026.", kind: "decision" }, { content: "The partner page goes live on 8 December 2026." }] });
  assert.ok(!batch.isError, batch.text);
  assert.match(batch.text, /^kept 2 of 2$/m);
  for (const text of ["Pricing review is set for 3 December 2026.", "The partner page goes live on 8 December 2026."]) assert.equal(count(batch.text, text), 1, batch.text);
  assert.equal(count(batch.text, "remembered m_"), 2); assert.doesNotMatch(batch.text, /^#\d+ kept$|saved in /m);
});

test("a save that is held or refused carries its rule page, once per chat", async () => {
  const root = brain(); const s = client(); await s.init();
  const ok = await s.call("remember", { brain: root, by: "ann-lee", context: "company", content: "Petra Holm leads procurement at Quillfield.", people: ["Petra Holm"], companies: ["Quillfield"] });
  assert.ok(!ok.isError, ok.text); assert.ok(!ok.parts.some(p => p.includes("--- Rule page:")));
  // a name one letter off a known one is held (P4): the save did not happen, so the page helps put it right
  const held = await s.call("remember", { brain: root, by: "ann-lee", context: "company", content: "Petra Holme approved the pilot budget of EUR 9000 on 14 November 2026.", people: ["Petra Holme"] });
  assert.match(held.parts[0], /^refused: not remembered yet: "Petra Holme" looks like Petra Holm \(P4\)/);
  assert.equal(held.parts.filter(p => p.startsWith("--- Rule page: Saving what happened")).length, 1, "the saving page comes with the hold");
  assert.equal(lib.readMemories(root, "company").filter(m => /Holme/.test(m.content)).length, 0, "nothing was written");
  const again = await s.call("remember", { brain: root, by: "ann-lee", context: "company", content: "Petra Holme signed off the pilot scope on 15 November 2026.", people: ["Petra Holme"] });
  assert.match(again.parts[0], /^refused: not remembered yet/);
  assert.ok(!again.parts.some(p => p.includes("--- Rule page:")), "once per chat");
  // a refusal in another tool brings that tool's page, and a call that worked never does
  const made = await s.call("add_name", { brain: root, by: "ann-lee", name: "Norwind", kind: "organization", subtype: "company" });
  assert.ok(!made.isError, made.text); assert.equal(made.parts.length, 1, "no page after an add_name that worked");
  assert.doesNotMatch(made.text, /^ok: add_name/, "what the operation said is the confirmation");
});

test("in a chat whose start printed nothing, the numbered saving rules come with the first hold, never with a save that worked", () => {
  const root = brain();
  lib.writeSession(root, { session_id: "11111111-2222-3333-4444-555555555555", cwd: root, host: "codex" });
  const saved = remember(root, "--by", "ann-lee", "--context", "company", "--content", "Brightwell asked for a yearly invoice on 15 November 2026.", "--companies", "Brightwell");
  assert.equal(saved.code, 0, saved.out); assert.doesNotMatch(saved.out, /The saving rules for this chat|Rule page/);
  const held = remember(root, "--by", "ann-lee", "--context", "company", "--content", "Brightwel asked to move the kickoff to 1 December 2026.", "--companies", "Brightwel");
  assert.equal(held.code, 2, held.out);
  assert.equal(count(held.out, "--- The saving rules for this chat ---"), 1, "the rules a hold quotes by number come with it");
  const second = remember(root, "--by", "ann-lee", "--context", "company", "--content", "Brightwel wants two more seats from 1 December 2026.", "--companies", "Brightwel");
  assert.equal(second.code, 2); assert.doesNotMatch(second.out, /The saving rules for this chat/, "once per chat");
});

test("the not linked hint: silent for a stage, plan or status word, one short line for a company nobody listed", () => {
  const names = [];
  for (const text of ["Deal moved to Paid on 12 November 2026.", "Norwind signed the Paid plan for 40 seats.", "The deal is now Closed Won.", "They are in the Evaluation stage since 3 November 2026.", "We set the account to Churned and the invoice to Overdue."])
    assert.deepEqual(lib.candidateEntities(text, [], names), [], text);
  assert.deepEqual(lib.candidateEntities("Deal with Brightwell moved to Paid on 12 November 2026.", [], names), ["Brightwell"], "the company beside the stage word is still named");
  assert.deepEqual(lib.candidateEntities("They bought the Atlas plan from Scale Labs.", [], names), ["Atlas", "Scale Labs"], "a label word inside a longer name does not hide it, and a product before \"plan\" stays");
  assert.deepEqual(lib.candidateEntities("After that, Team Rocket called about the Zendesk licence.", [], names), ["Team Rocket", "Zendesk"]);
  const root = brain();
  const plain = remember(root, "--by", "ann-lee", "--context", "company", "--content", "The Norwind deal moved to Paid on 12 November 2026.", "--companies", "Norwind");
  assert.equal(plain.code, 0, plain.out); assert.doesNotMatch(plain.out, /not linked to anything/, plain.out);
  const missed = remember(root, "--by", "ann-lee", "--context", "company", "--content", "The deal with Brightwell moved to Paid on 13 November 2026.");
  assert.equal(missed.code, 0, missed.out);
  const hint = missed.out.split("\n").find(l => /not linked to anything in the brain/.test(l));
  assert.match(hint, /^not linked to anything in the brain: "Brightwell"\. add_name only for a person, company or product the note is about/);
  assert.doesNotMatch(hint, /Paid/); assert.ok(hint.length < 200, `one short line, not ${hint.length} characters`);
});

test("every line another part of the plugin reads keeps its shape", () => {
  const root = brain();
  // server/entity-edit.mjs and server/memory-edit.mjs: the id and the context of each note written
  const WROTE = /\bremembered (m_[0-9a-f]{6,12}) in ([a-z0-9-]+)/g;
  const one = remember(root, "--by", "ann-lee", "--context", "offer", "--content", "The yearly plan costs EUR 400 a seat from 1 January 2027.");
  const ids = [...one.stdout.matchAll(WROTE)].map(m => ({ id: m[1], context: m[2] }));
  assert.equal(ids.length, 1); assert.equal(ids[0].context, "offer");
  assert.equal(lib.readMemories(root, "offer").at(-1).id, ids[0].id, "the id read from the reply is the note written");
  // what they show the person when a save fails: the first lines that are not the model's instruction or the batch count
  const shown = out => out.split("\n").filter(l => l.trim() && !/^(Reply to the person|kept )/.test(l.trim()) && !/^(Reply to the person|kept$)/.test(l.trim()));
  assert.ok(one.stdout.split("\n").some(l => /^Reply to the person/.test(l)), "the instruction line still starts with the words both filters drop");
  assert.match(shown(one.stdout)[0], /^remembered m_/, "the first line shown is the note");
  // lib/capture.mjs: a hold is a pass that ran, and its lines are kept for the chat start
  lib.addName(root, "Petra Holm");
  const held = remember(root, "--by", "ann-lee", "--context", "company", "--content", "Petra Holme approved the budget on 14 November 2026.", "--people", "Petra Holme");
  assert.equal(held.code, 2);
  assert.match(held.out, /^not (kept|remembered yet)\b/m);
  assert.ok(held.out.split("\n").some(l => /held|not kept|not remembered|ask/i.test(l)));
  assert.match(held.out.replace(/^(#\d+ )?(not remembered yet|nothing remembered|not remembered|not kept \(\d+ of \d+\)):\s*/, ""), /^"Petra Holme" looks like Petra Holm/, "memory-edit strips the same start");
  // a batch that keeps one note and holds another: the count first, the hold named by position
  const batch = join(root, "work", "batch.json");
  execFileSync(process.execPath, ["-e", `require("fs").writeFileSync(${JSON.stringify(batch)}, JSON.stringify([{ content: "Support hours are 9 to 17 CET from 1 December 2026.", context: "offer" }, { content: "Petra Holme asked for a second demo on 20 November 2026.", people: ["Petra Holme"], context: "company" }]))`]);
  const mixed = remember(root, "--by", "ann-lee", "--batch", batch);
  assert.equal(mixed.code, 0, mixed.out);
  assert.match(mixed.stdout, /^kept 1 of 2$/m, "starts with \"kept \", which memory-edit leaves out of what it shows");
  assert.equal([...mixed.stdout.matchAll(WROTE)].length, 1);
  assert.match(mixed.stdout, /^not kept \(1 of 2\): #2 "Petra Holme" looks like Petra Holm/m, "capture and the rule page both read this start");
});

process.env.GTM_BRAIN_NO_WATCH = "1";
// Review of lane S1 (0.35.0, topic summaries on demand): the cases the lane's own tests did not hold.
//   a backlog larger than a load shows must not be marked "up to date" from the 15 newest notes alone
//   a refusal is explained by its real cause, never as "new notes arrived" because the text names as_of
//   an old failed background run stops being "gave up" once a summary was written in a chat
//   a paused summary's load still shows its notes, and a chat cannot replace the edit without the reviewed hash
//   a refused entity overview names a read the chat has, says the line for the person and reaches the health line
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const lib = await import(`${P}/lib/brain.mjs`);
const summaries = await import(`${P}/lib/summaries.mjs`);
const { healthLine } = await import(`${P}/lib/health-line.mjs`);

const profile = mkdtempSync(join(tmpdir(), "gtm-s1r-profile-"));
const base = { ...process.env, CODEX_HOME: profile, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" };
delete base.GTM_BRAIN_NO_COMPILE; delete base.GTM_BRAIN_RUN;
const env = { ...base, GTM_BRAIN_NO_COMMIT: "1" };
function brain() {
  const root = mkdtempSync(join(tmpdir(), "gtm-s1r-"));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [join(P, "scripts/gtm-brain-setup/setup.sh"), "--company", "Demo", "--one-liner", "Test", "--owner", "Ann Lee <ann@example.invalid>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const node = (script, args, root, extra = {}) => spawnSync(process.execPath, [join(P, "scripts", script), root, ...args], { cwd: root, env: { ...env, ...extra }, encoding: "utf8" });
const remember = (root, content) => node("gtm-brain-remember/remember.mjs", ["--by", "ann", "--context", "icp", "--content", content], root);
const load = root => node("gtm-brain-load/load.mjs", ["icp", "--only"], root).stdout;
const apply = (root, asOf, summary, extra = []) => node("gtm-brain-compile/compile.mjs", ["--checked", "--apply", "icp", "--by", "ann", "--as-of", asOf, "--summary", summary, "--now", "", ...extra], root);
const newIds = root => { const c = lib.readContext(root, "icp"); return lib.effectiveMemories(c.memories).filter(m => !c.compiledAt || lib.newer(m.at, c.compiledAt)).map(m => m.id); };
const health = root => healthLine(root, { meetings: [], coverage: [] });

const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env: { ...env, GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1" } });
const pending = new Map(); let seq = 0;
createInterface({ input: server.stdout }).on("line", line => { const m = JSON.parse(line); const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); } });
const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: args }); return { text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };
after(() => server.kill());
const many = async (root, n, text = i => `Prospect ${i} asked about pricing tier ${i}.`) => {
  for (let i = 0; i < n; i += 20) { const r = await call("remember", { brain: root, by: "ann", memories: Array.from({ length: Math.min(20, n - i) }, (_, k) => ({ context: "icp", content: text(i + k) })) }); assert.ok(!r.isError, r.text); }
};

test("a backlog larger than the 15 notes a load shows in full: every new note is in the load, so the summary is not marked current over unread notes", async () => {
  const root = brain();
  await many(root, 40);
  const ids = newIds(root); assert.equal(ids.length, 40);
  const out = load(root);
  assert.match(out, /write it now, in this chat/);
  for (const id of ids) assert.ok(out.includes(id), `${id} is new and is not in the load at all`);
  assert.match(out, /as_of s_[0-9a-f]+/);
  assert.ok(Buffer.byteLength(out) < 40 * 1024, `the load stays bounded (${Buffer.byteLength(out)} bytes)`);
});

test("a backlog too large even for shortened lines: the load gives no as_of to write from a part, it sends the chat to compile_facts once", async () => {
  const root = brain();
  await many(root, 260, i => `Prospect ${i} from the logistics segment asked about pricing tier ${i} and wanted a reference customer in the same country before any pilot could start, ${"with details ".repeat(20)}.`);
  const ids = newIds(root); assert.equal(ids.length, 260);
  const out = load(root);
  assert.ok(ids.some(id => !out.includes(id)), "the fixture does not fit a load");
  assert.doesNotMatch(out, /as_of s_[0-9a-f]+/, "no as_of: compile_apply cannot mark it current from a part of the new notes");
  assert.match(out, /compile_facts/);
  assert.match(out, /being written now in this chat/);
  assert.ok(Buffer.byteLength(out) < 48 * 1024, `the load stays bounded (${Buffer.byteLength(out)} bytes)`);
});

test("a refusal is explained by its real cause: a summary without note ids is not 'new notes arrived'", () => {
  const root = brain();
  remember(root, "Acme wants a pilot in December.");
  const asOf = load(root).match(/as_of (s_[0-9a-f]+)/)[1];
  const r = apply(root, asOf, "Acme wants a pilot in December 2026.");
  assert.equal(r.status, 6, r.stderr);
  const person = r.stderr.split("\n").find(l => /^For the person/.test(l));
  assert.doesNotMatch(person, /new notes arrived/); assert.match(person, /did not pass the summary check/);
  assert.doesNotMatch(health(root), /new notes arrived|what to do: nothing/);
  const dash = apply(root, asOf, "Acme wants a pilot \u2014 in December 2026 [m_000000].");
  assert.doesNotMatch(dash.stderr.split("\n").find(l => /^For the person/.test(l)), /new notes arrived/);
  // each cause keeps its own words, and a failure with no known cause is not nested when the health line reads it back
  assert.match(summaries.explainFailure("not applied: icp changed since --facts (as_of s_1, now s_2)").what, /new notes arrived/);
  assert.match(summaries.explainFailure("--apply needs --by, --as-of <id from --facts>, --summary and --now").what, /^writing it failed/);
  const other = brain();
  summaries.recordSummaryRun(other, { context: "icp", by: "ann", ok: false, error: "disk full" });
  assert.match(health(other), /last failure .* \(icp\): writing it failed \(disk full\); what to do/);
});

test("an old background run that gave up is no longer 'gave up' once a summary was written in a chat", () => {
  const root = brain();
  remember(root, "Acme wants a pilot in December.");
  node("gtm-brain-remember/remember.mjs", ["--by", "ann", "--context", "offer", "--content", "The offer is a fixed-price pilot."], root);
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "work", "compile.json"), JSON.stringify({ state: "failed", attempt: 3, tries: 3, contexts: "icp offer", at: new Date(Date.now() - 3600e3).toISOString() }));
  assert.equal(lib.compileGaveUp(root), true, "before any write the old failure stands");
  const asOf = load(root).match(/as_of (s_[0-9a-f]+)/)[1], id = lib.readMemories(root, "icp")[0].id;
  assert.equal(apply(root, asOf, `Acme wants a pilot in December 2026 [${id}].`).status, 0);
  assert.equal(lib.readContext(root, "offer").stale, true, "another topic is still behind, which is normal now");
  assert.equal(lib.compileGaveUp(root), false);
  const advice = node("gtm-brain-advisor/advisor.mjs", ["--json"], root);
  assert.doesNotMatch(advice.stdout, /gave up|summary-failed/);
});

test("a paused summary: the load still shows the notes, gives no as_of, and a chat write without the reviewed hash changes nothing", async () => {
  const root = brain();
  remember(root, "Acme wants a pilot in December.");
  const asOf = load(root).match(/as_of (s_[0-9a-f]+)/)[1], id = lib.readMemories(root, "icp")[0].id;
  assert.equal(apply(root, asOf, `Acme wants a pilot in December 2026 [${id}].`).status, 0);
  const file = join(root, "brain", "contexts", "icp", "context.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("Acme wants a pilot in December 2026.", "Acme wants a pilot in December 2026. Hand-written: talk to Dana first."));
  remember(root, "Bergstrom asked for annual pricing.");
  assert.equal(lib.readContext(root, "icp").manualEdit.blocked, true, "the fixture is paused");
  const out = load(root), edited = readFileSync(file, "utf8");
  assert.match(out, /## Summary paused/); assert.doesNotMatch(out, /as_of s_|write it now/);
  assert.match(out, /Bergstrom asked for annual pricing/, "the notes the block promises are shown");
  const facts = await call("compile_facts", { brain: root, context: "icp" });
  const now = facts.text.match(/^as_of: (\S+)/m)[1], second = lib.readMemories(root, "icp")[1].id;
  const r = await call("compile_apply", { brain: root, context: "icp", by: "ann", as_of: now, summary: `Bergstrom asked for annual pricing [${second}].`, now: "" });
  assert.ok(r.isError, r.text);
  assert.match(r.text, /For the person.*edited by hand/);
  assert.equal(readFileSync(file, "utf8"), edited, "the hand edit is untouched");
});

test("a refused entity overview names a read the chat has, says one line for the person, and reaches the health line", async () => {
  const root = brain();
  await call("add_name", { brain: root, name: "Alex Reed", sources: [{ kind: "user", ref: "ann" }] });
  await call("remember", { brain: root, by: "ann", context: "icp", people: ["Alex Reed"], content: "Alex Reed coordinates evaluation interviews." });
  const facts = lib.entityFacts(root, "Alex Reed"), id = facts.evidence[0].id;
  const names = (await rpc("tools/list")).result.tools.map(t => t.name);
  const brief = { overview: [{ text: "Alex coordinates the evaluation interviews.", memories: [id] }], contexts: [{ context: "icp", summary: [{ text: "Runs the interviews.", memories: [id] }], open_threads: [] }], relationships: [] };
  const r = await call("compile_entity", { brain: root, entity: facts.entity.id, by: "ann", as_of: "s_stale", brief });
  assert.ok(r.isError, r.text);
  const first = r.text.split("\n")[0];
  assert.match(first, /query/, "the refusal names the read a chat has");
  if (/entity_facts/.test(first)) assert.match(first, /in a run/, "entity_facts is named only as the run's read");
  assert.ok(!names.includes("entity_facts"));
  assert.equal(r.text.match(/For the person/g)?.length, 1, r.text);
  assert.match(r.text, /The Alex Reed overview was not saved: new notes arrived while it was being written/);
  assert.match(health(root), /last failure .* \(Alex Reed\): new notes arrived/);
  const ok = await call("compile_entity", { brain: root, entity: facts.entity.id, by: "ann", as_of: facts.as_of, brief });
  assert.ok(!ok.isError, ok.text);
  assert.doesNotMatch(health(root), /last failure/, "the write that followed clears it");
});

// Second review (cloud handover): the cached summary with its age, the rule a 0.34 rulebook carries, and shipped text.
test("a cached summary is returned with its age, and no as_of or write instruction while no note is newer", () => {
  const root = brain();
  remember(root, "Acme wants a pilot in December.");
  const asOf = load(root).match(/as_of (s_[0-9a-f]+)/)[1], [id] = newIds(root);
  assert.equal(apply(root, asOf, `Acme wants a pilot in December 2026 [${id}].`).status, 0);
  const later = new Date(Date.now() + 3 * 864e5 + 3600e3).toISOString();
  const out = node("gtm-brain-load/load.mjs", ["icp", "--only"], root, { GTM_BRAIN_NOW: later }).stdout;
  assert.match(out, /Summary \(as of \d{4}-\d{2}-\d{2}, 3 days old\): Acme wants a pilot/);
  assert.doesNotMatch(out, /Summary behind|as_of s_|compile_apply/);
  assert.match(out, /## Last 1 of 1 memories/, "a current summary keeps the usual last-N list");
});

test("the write instruction says this load is the ask a pre-0.35 rulebook allows, so 'never compile in the chat' does not stop it", () => {
  const root = brain();
  remember(root, "Acme wants a pilot in December.");
  const rule = readFileSync(join(root, "AGENTS.md"), "utf8");
  const out = load(root);
  assert.match(out, /This load is the person's ask that AGENTS\.md rule 1b allows: write it here\./);
  if (/Never compile in the chat/.test(rule)) assert.match(rule, /^1b\. /m, "the rule the instruction names is still 1b");
});

// Shipped text that still promises a background summary. templates/AGENTS.md belongs to another lane (its byte limit
// and legacy snapshots); it is listed as a todo so the conflict stays visible until that lane rewrites rule 1b.
const PROMISE = /summar(?:y|ies) (?:is |are )?(?:update|updating|updates)\b[^.\n]*(?:background|by themselves|shortly)|summaries update by themselves|refill in the background|updated by a separate run shortly/i;
const shipped = () => {
  const out = [], walk = d => { for (const n of readdirSync(d, { withFileTypes: true })) { const p = join(d, n.name); if (n.isDirectory()) { if (!["legacy", "node_modules", "test", "ui"].includes(n.name)) walk(p); } else if (/\.(md|mjs|sh)$/.test(n.name)) out.push(p); } };
  walk(P); return out.filter(p => !p.endsWith("templates/AGENTS.md") && !p.endsWith("lib/summaries.mjs") && !p.endsWith("lib/brain.mjs"));
};
test("no shipped skill, script or template outside templates/AGENTS.md promises a summary in the background", () => {
  const hits = shipped().flatMap(p => readFileSync(p, "utf8").split("\n").map((l, i) => [p, i + 1, l])).filter(([, , l]) => PROMISE.test(l) && !/^\s*(\/\/|#|\/\*|\*)/.test(l));
  assert.deepEqual(hits.map(([p, i]) => `${p.slice(P.length + 1)}:${i}`), []);
});
test("templates/AGENTS.md rule 1b still says summaries update by themselves (owned by another lane)", { todo: "rewrite rule 1b for summaries written on demand" }, () => {
  assert.doesNotMatch(readFileSync(join(P, "templates/AGENTS.md"), "utf8"), PROMISE);
});

#!/usr/bin/env node
// Does GTM OS make Codex worse at work that is not GTM? The same three tasks through `codex exec`
// in three setups, each in a throwaway Codex profile so what is measured is what would ship:
//   bare   no plugin at all: the baseline
//   plain  THIS checkout installed (hooks on), an ordinary folder: what the plugin costs everywhere
//   brain  the same install, in a scratch brain: what a person gets at work
// The tasks:
//   coding     fix a small bug so a test passes (writes, shell, the write gate)
//   reasoning  a logic puzzle with one answer and a strict reply format (no tools needed)
//   connector  a Slack question through the fixture connector (the GTM path)
// Every answer is checked by code, no judge. Exit 1 when plain or brain does worse than bare:
// fewer tasks solved, a larger fixed prompt than the budget, or GTM OS tools called for the
// puzzle. Time is reported and warned on, never failed: it is too noisy for a gate.
//   node plugins/gtm-os/test/live/harness-bench.mjs [--runs 2] [--jobs 4] [--model gpt-5.6-luna] [--tasks coding,reasoning,connector]
// Budget: GTM_OS_BENCH_MAX_OVERHEAD (extra input tokens on the puzzle, default 14000).
// Runs from .githooks/pre-push before a push to main; the person's own profile is never touched
// apart from reading auth.json to sign in.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { stopBrainWatcher } from "../../lib/brain.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const runs = Number(opt("--runs", 2)), jobs = Number(opt("--jobs", 4));
const model = opt("--model", process.env.GTM_OS_EVAL_MODEL || "gpt-5.6-luna");
const maxOverhead = Number(process.env.GTM_OS_BENCH_MAX_OVERHEAD || 14000);
const plugin = fileURLToPath(new URL("../../", import.meta.url));
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const fixture = fileURLToPath(new URL("./connector-fixture.mjs", import.meta.url));
const artifacts = mkdtempSync(join(resolve(process.env.GTM_OS_EVAL_DIR || tmpdir()), "gtm-harness-bench-"));

// throwaway profiles with the person's sign-in and none of their other plugins or instructions:
// one without GTM OS, one with this checkout installed
const realHome = process.env.CODEX_HOME || join(homedir(), ".codex");
if (!existsSync(join(realHome, "auth.json"))) { console.error(`no Codex sign-in at ${join(realHome, "auth.json")}: run \`codex login\` first`); process.exit(2); }
const base = { ...process.env, NODE_NO_WARNINGS: "1", PLUGIN_ROOT: plugin, GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1", GTM_OS_NO_COMMIT: "1" };
const profile = name => { const dir = join(artifacts, `profile-${name}`); mkdirSync(dir); copyFileSync(join(realHome, "auth.json"), join(dir, "auth.json")); return { ...base, CODEX_HOME: dir }; };
const envs = { bare: profile("bare"), plain: profile("plugin") };
envs.brain = envs.plain;
for (const cli of [["features", "enable", "hooks"], ["plugin", "marketplace", "add", repo], ["plugin", "add", "gtm-os@gtm-os"]])
  execFileSync("codex", cli, { env: envs.plain, cwd: repo, encoding: "utf8", timeout: 60000 });

const STATS = `// Summary statistics for the weekly pipeline report.
export function mean(xs) {
  if (!xs.length) throw new Error("mean of nothing");
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs) {
  const s = [...xs].sort();
  return s[Math.floor(s.length / 2)];
}
`;
const TEST = `import assert from "node:assert/strict";
import { mean, median } from "./stats.mjs";
assert.equal(mean([2, 4, 9]), 5);
assert.throws(() => mean([]));
assert.equal(median([10, 9, 2]), 9);
assert.equal(median([4, 1, 3, 2]), 2.5);
assert.equal(median([7]), 7);
console.log("ok");
`;
const PUZZLE = `Five people, Ada, Ben, Cyd, Dan and Eve, sit in seats 1 to 5 in a row (seat 1 is the left end). Each drinks one of tea, coffee, juice, water and milk, all different.
1. Ada sits somewhere to the left of Ben.
2. The tea drinker and the coffee drinker sit next to each other.
3. Cyd sits in seat 3.
4. Cyd drinks neither water nor tea.
5. The juice drinker sits in seat 1.
6. Eve sits in seat 5.
7. Eve drinks neither milk nor coffee.
8. Dan sits next to the water drinker.
9. Ben drinks neither coffee nor milk.
Who drinks milk, and in which seat? Reply with exactly one line in the form NAME SEAT, for example: Ada 1`;

const TASKS = {
  coding: {
    prompt: "The check in calc/test.mjs fails. Fix calc/stats.mjs so `node calc/test.mjs` prints ok. Do not change the test.",
    sandbox: "workspace-write",
    prepare: root => { mkdirSync(join(root, "calc")); writeFileSync(join(root, "calc/stats.mjs"), STATS); writeFileSync(join(root, "calc/test.mjs"), TEST); },
    check: (root) => {
      if (readFileSync(join(root, "calc/test.mjs"), "utf8") !== TEST) return "test edited";
      const r = spawnSync(process.execPath, [join(root, "calc/test.mjs")], { encoding: "utf8", timeout: 10000 });
      return r.status === 0 && r.stdout.trim() === "ok" ? null : `test fails: ${(r.stderr || r.stdout).trim().split("\n")[0].slice(0, 100)}`;
    },
  },
  reasoning: {
    prompt: PUZZLE,
    sandbox: "read-only",
    check: (root, answer) => /^\s*Dan 4\s*$/.test(answer) ? null : `answer ${JSON.stringify(answer.slice(0, 60))}`,
  },
  connector: {
    prompt: "What was the last message posted in the #general Slack channel? Answer in one line.",
    sandbox: "read-only",
    check: (root, answer) => /pipeline review moved to 15:00/i.test(answer) ? null : `answer ${JSON.stringify(answer.slice(0, 80))}`,
  },
};
const tasks = opt("--tasks", Object.keys(TASKS).join(",")).split(",");
const SETUPS = ["bare", "plain", "brain"];

function makeFolder(name, kind, task) {
  const root = join(artifacts, name); mkdirSync(root);
  execFileSync("git", ["init", "-q", root], { env: base });
  if (kind === "brain") {
    execFileSync("bash", [join(plugin, "scripts/gtm-os-setup/setup.sh"), "--company", "Bench Fixture", "--one-liner", "Synthetic harness benchmark", "--owner", "Marta Nowak <marta@example.test>", "--dashboard", "on-demand"], { cwd: root, env: base, encoding: "utf8", timeout: 30000 });
    execFileSync(process.execPath, [join(plugin, "scripts/gtm-os-load/load.mjs"), ".", "offer", "--only"], { cwd: root, env: base, encoding: "utf8", timeout: 30000 });
  }
  TASKS[task].prepare?.(root);
  return root;
}

const DOC = /skills\/[\w-]+\/(?:SKILL|references\/[\w-]+)\.md/g;
const label = item => item.type === "command_execution" ? "exec" + ((String(item.command || "").match(DOC) || []).length ? ":doc" : "") : item.type === "mcp_tool_call" ? `${item.server}/${item.tool}` : item.type;
function run(name, kind, task) {
  const cwd = makeFolder(name, kind, task);
  const cli = ["exec", "--json", "-m", model, "-C", cwd, "--dangerously-bypass-hook-trust", "-c", "features.apps=false", "-c", 'approval_policy="never"', "-c", `sandbox_mode="${TASKS[task].sandbox}"`,
    "-c", `mcp_servers.connector_fixture.command=${JSON.stringify(process.execPath)}`, "-c", `mcp_servers.connector_fixture.args=${JSON.stringify([fixture])}`, "-"];
  return new Promise(done => {
    const start = Date.now(); const child = spawn("codex", cli, { cwd, env: envs[kind], stdio: ["pipe", "pipe", "pipe"] });
    const events = [], steps = []; let usage = null, answer = "", buffer = "", err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 300000);
    child.stdout.on("data", data => {
      buffer += data; let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1); let e; try { e = JSON.parse(line); } catch { continue; }
        events.push({ at: Date.now() - start, ...e });
        if (e.type === "item.completed" && e.item) {
          if (e.item.type === "agent_message") answer = e.item.text || "";
          else if (!["reasoning", "error"].includes(e.item.type)) steps.push(e.item);
        }
        if (e.type === "turn.completed") usage = e.usage;
      }
    });
    child.stderr.on("data", d => { err += d; });
    child.on("close", code => {
      clearTimeout(timer);
      writeFileSync(join(artifacts, `${name}.jsonl`), events.map(e => JSON.stringify(e)).join("\n"));
      if (err.trim()) writeFileSync(join(artifacts, `${name}.stderr`), err);
      const failure = code === 0 ? TASKS[task].check(cwd, answer) : `codex exited ${code}`;
      done({ name, kind, task, ok: !failure, failure, wall_ms: Date.now() - start, steps: steps.length,
        gtm_calls: steps.filter(s => s.server === "gtm_os").length, doc_reads: steps.reduce((n, s) => n + (String(s.command || "").match(DOC) || []).length, 0),
        input_tokens: usage?.input_tokens ?? null, sequence: steps.map(label) });
    });
    child.stdin.end(TASKS[task].prompt);
  });
}

// interleaved, so drift over the run hits both setups alike
const queue = []; for (let i = 1; i <= runs; i++) for (const task of tasks) for (const kind of SETUPS) queue.push([`${task}-${kind}-${i}`, kind, task]);
console.log(`model ${model}, ${runs} runs x ${tasks.length} tasks x ${SETUPS.join("/")}, ${jobs} at a time\nartifacts ${artifacts}\n`);
const rows = [];
await Promise.all(Array.from({ length: jobs }, async () => {
  while (queue.length) {
    const r = await run(...queue.shift()); rows.push(r);
    console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name.padEnd(18)} ${(r.wall_ms / 1000).toFixed(1).padStart(6)}s  steps ${r.steps}  gtm_os ${r.gtm_calls}  docs ${r.doc_reads}  in ${r.input_tokens}  ${r.failure || ""}  | ${r.sequence.join(" > ").slice(0, 90)}`);
  }
}));

const med = a => { const v = a.filter(x => x !== null && x !== undefined).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : null; };
const table = {}, failures = [], warnings = [];
for (const task of tasks) {
  const by = kind => rows.filter(r => r.task === task && r.kind === kind);
  for (const kind of SETUPS) { const r = by(kind); table[`${task} ${kind}`] = { solved: `${r.filter(x => x.ok).length}/${r.length}`, "median wall": `${(med(r.map(x => x.wall_ms)) / 1000).toFixed(1)}s`, "median steps": med(r.map(x => x.steps)), "gtm_os calls": med(r.map(x => x.gtm_calls)), "doc reads": med(r.map(x => x.doc_reads)), "input tokens": med(r.map(x => x.input_tokens)) }; }
  const bare = by("bare"), solved = r => r.filter(x => x.ok).length, wall = r => med(r.map(x => x.wall_ms));
  if (!solved(bare)) warnings.push(`${task}: unsolved without the plugin too (check the task or the model)`);
  for (const kind of ["plain", "brain"]) {
    const r = by(kind);
    // A task bare Codex does not solve every time is at the model's edge: a miss there is noise, not the plugin.
    if (solved(r) < solved(bare)) (solved(bare) === bare.length ? failures : warnings).push(`${task}: ${kind} solved ${solved(r)}/${r.length}, bare ${solved(bare)}/${bare.length}${solved(bare) === bare.length ? "" : " (bare is not reliable on this model, so not a failure)"}`);
    if (wall(r) > 2 * wall(bare) && wall(r) - wall(bare) > 30000) warnings.push(`${task}: ${kind} median ${(wall(r) / 1000).toFixed(0)}s against bare ${(wall(bare) / 1000).toFixed(0)}s`);
    if (task === "coding" && med(r.map(x => x.gtm_calls)) > 0) warnings.push(`coding: ${kind} reached for GTM OS tools on a coding task`);
    if (task === "reasoning") {
      const overhead = med(r.map(x => x.input_tokens)) - med(bare.map(x => x.input_tokens));
      console.log(`reasoning: ${kind} adds ${overhead} input tokens to the prompt`);
      if (overhead > maxOverhead) failures.push(`reasoning: ${kind} adds ${overhead} input tokens, budget ${maxOverhead} (GTM_OS_BENCH_MAX_OVERHEAD)`);
      if (med(r.map(x => x.gtm_calls)) > 0) failures.push(`reasoning: ${kind} called GTM OS tools for a self-contained puzzle`);
    }
  }
}
console.log(); console.table(table);
// No run used a token: Codex never reached a model (unsupported model, sign-in), so nothing was compared.
if (rows.every(r => !r.input_tokens)) failures.push(`no run reached the model ${model} (0 input tokens everywhere); check the model and the Codex sign-in, or pass --model`);
writeFileSync(join(artifacts, "harness-bench.json"), JSON.stringify({ model, runs, tasks, maxOverhead, artifacts, failures, warnings, rows }, null, 2));
for (const w of warnings) console.log(`warn: ${w}`);
for (const f of failures) console.log(`FAIL: ${f}`);
console.log(`\n${failures.length ? "harness bench FAILED" : "harness bench passed"}; traces and report in ${artifacts}`);
// The plugin's MCP server starts a detached file watcher for every brain it serves; a bench brain is
// thrown away, so its watcher must not outlive the run (a few dozen left behind stalled later pushes).
for (const d of readdirSync(artifacts)) if (existsSync(join(artifacts, d, "brain", "admin.md"))) stopBrainWatcher(join(artifacts, d));
process.exit(failures.length ? 1 : 0);

#!/usr/bin/env node
// Opt-in latency A/B: the same prompt through `codex exec` in an empty folder and in a scratch
// brain, with the Codex profile in CODEX_HOME (the real one by default, so the installed plugins,
// hooks and skills are exactly what a person gets). Fixture connectors (connector-fixture.mjs)
// stand in for Slack, mail and calendar, so what is measured is what the model does around a
// connector call. A follow-up resumes the same chat, to see what a second turn reads again.
//   node plugins/gtm-os/test/live/latency.mjs [--runs 5] [--model gpt-5.6-sol] [--setups plain,brain]
//     [--prompt "..."] [--followup "..."] [--trust-hooks]
// --trust-hooks runs plugin hooks in a throwaway profile, where a CLI install leaves them untrusted.
// Prints per-run rows and medians; writes latency-report.json next to the scratch folders.
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const runs = Number(opt("--runs", 5));
const model = opt("--model", process.env.GTM_OS_EVAL_MODEL || "gpt-5.6-sol");
const prompt = opt("--prompt", "What was the last message posted in the #general Slack channel? Answer in one line.");
const followup = opt("--followup", "");
const setups = opt("--setups", "plain,brain").split(",");
const trustHooks = args.includes("--trust-hooks");
const dummySkills = Number(opt("--skills", 0));
// A 200-character description is the cap the skill tool enforces: the listing cost per skill, at its maximum.
const DUMMY_DESCRIPTION = "Draft the weekly customer update for one account from the notes and the CRM: what changed, what is at risk, the next step and who owns it, in the account's language, under 150 words".slice(0, 200);
function writeDummySkills(root, n) {
  for (let i = 1; i <= n; i++) {
    const dir = join(root, ".agents", "skills", `gtm-os-dummy-${i}`); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `---\nname: gtm-os-dummy-${i}\ndescription: "${DUMMY_DESCRIPTION} (${i})"\n---\n\n# GTM OS skill: Dummy ${i}\n\nSay "dummy ${i} ran" and stop.\n`);
  }
}
const plugin = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("./connector-fixture.mjs", import.meta.url));
const artifacts = mkdtempSync(join(resolve(process.env.GTM_OS_EVAL_DIR || tmpdir()), "gtm-latency-"));
// the brain's own background work stays off: it is not what a person waits for
const env = { ...process.env, PLUGIN_ROOT: plugin, GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1", GTM_OS_NO_COMMIT: "1" };

// one folder per run: a run that remembers what it read must not feed the next one
function makeFolder(kind, i) {
  const root = join(artifacts, `${kind}-${i}`); mkdirSync(root);
  execFileSync("git", ["init", "-q", root], { env });
  if (kind === "brain") {
    execFileSync("bash", [join(plugin, "scripts/gtm-os-setup/setup.sh"), "--company", "Latency Fixture", "--one-liner", "Synthetic latency run", "--owner", "Marta Nowak <marta@example.test>", "--dashboard", "on-demand"], { cwd: root, env, encoding: "utf8", timeout: 30000 });
    execFileSync(process.execPath, [join(plugin, "scripts/gtm-os-load/load.mjs"), ".", "offer", "--only"], { cwd: root, env, encoding: "utf8", timeout: 30000 });
    if (dummySkills) writeDummySkills(root, dummySkills);
  }
  return root;
}

const DOC = /skills\/[\w-]+\/(?:SKILL|references\/[\w-]+)\.md/g;
const isStep = item => !["agent_message", "reasoning", "error"].includes(item.type);
const label = item => item.type === "command_execution" ? "exec:" + (String(item.command || "").match(DOC) || []).map(d => d.replace(/^skills\//, "")).join("+").slice(0, 60) || "exec" : item.type === "mcp_tool_call" ? `${item.server}/${item.tool}` : item.type;
// Codex apps stay off: a real connector would read or write the person's own accounts
const common = ["--json", "-m", model, "-c", "features.apps=false", "-c", 'approval_policy="never"', "-c", 'sandbox_mode="read-only"', ...(trustHooks ? ["--dangerously-bypass-hook-trust"] : []),
  "-c", `mcp_servers.connector_fixture.command=${JSON.stringify(process.execPath)}`, "-c", `mcp_servers.connector_fixture.args=${JSON.stringify([fixture])}`];

function turn(cli, cwd, text, file) {
  return new Promise(resolvePromise => {
    const start = Date.now();
    const child = spawn("codex", cli, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    const events = [], steps = []; let usage = null, answer = "", buffer = "", err = "", thread = null;
    const timer = setTimeout(() => child.kill("SIGTERM"), 300000);
    child.stdout.on("data", data => {
      buffer += data;
      let nl; while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1); if (!line.trim()) continue;
        let e; try { e = JSON.parse(line); } catch { continue; }
        const at = Date.now() - start; events.push({ at, ...e });
        if (e.type === "thread.started") thread = e.thread_id;
        if (e.type === "item.completed" && e.item) {
          if (isStep(e.item)) steps.push({ at, label: label(e.item), item: e.item });
          if (e.item.type === "agent_message") answer = e.item.text || "";
        }
        if (e.type === "turn.completed") usage = e.usage;
      }
    });
    child.stderr.on("data", d => { err += d; });
    child.on("close", code => {
      clearTimeout(timer);
      writeFileSync(`${file}.jsonl`, events.map(e => JSON.stringify(e)).join("\n"));
      if (err.trim()) writeFileSync(`${file}.stderr`, err);
      const first = steps.find(s => s.item.server === "connector_fixture");
      const gtm = steps.filter(s => s.item.server === "gtm_os");
      resolvePromise({ thread, code, wall_ms: Date.now() - start, to_connector_ms: first ? first.at : null, steps_before_connector: first ? steps.indexOf(first) : null, steps: steps.length,
        doc_reads: steps.reduce((n, s) => n + (s.item.type === "command_execution" ? (String(s.item.command || "").match(DOC) || []).length : 0), 0),
        gtm_calls: gtm.length, records: gtm.filter(s => ["remember", "add_name"].includes(s.item.tool)).length,
        input_tokens: usage?.input_tokens ?? null, output_tokens: usage ? usage.output_tokens + (usage.reasoning_output_tokens || 0) : null,
        sequence: steps.map(s => s.label), answer: answer.slice(0, 120) });
    });
    child.stdin.end(text);
  });
}

const med = a => { const v = a.filter(x => x !== null && x !== undefined).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : null; };
const s = ms => ms === null ? "-" : (ms / 1000).toFixed(1) + "s";
const show = (tag, r) => console.log(`${tag}  wall ${s(r.wall_ms)}  to connector ${s(r.to_connector_ms)}  steps ${r.steps}  docs ${r.doc_reads}  gtm_os ${r.gtm_calls}  records ${r.records}  in ${r.input_tokens}  | ${r.sequence.join(" > ").slice(0, 120)}`);
console.log(`model ${model}, ${runs} runs per setup${dummySkills ? `, ${dummySkills} dummy skills` : ""}, artifacts in ${artifacts}\nprompt: ${prompt}${followup ? `\nfollow-up: ${followup}` : ""}\n`);
const rows = [];
for (let i = 1; i <= runs; i++) for (const kind of setups) {   // alternate, so drift over time hits both alike
  const cwd = makeFolder(kind, i);
  const first = await turn(["exec", ...common, "-C", cwd, "-"], cwd, prompt, join(artifacts, `${kind}-${i}`));
  rows.push({ kind, run: i, turn: 1, ...first }); show(`${kind.padEnd(6)} #${i} t1`, first);
  if (followup && first.thread) {
    const second = await turn(["exec", "resume", first.thread, ...common, "-"], cwd, followup, join(artifacts, `${kind}-${i}-followup`));
    rows.push({ kind, run: i, turn: 2, ...second }); show(`${kind.padEnd(6)} #${i} t2`, second);
  }
}
console.log();
const table = {};
for (const kind of setups) for (const t of followup ? [1, 2] : [1]) {
  const r = rows.filter(x => x.kind === kind && x.turn === t);
  table[followup ? `${kind} turn ${t}` : kind] = { "median wall": s(med(r.map(x => x.wall_ms))), "median to connector": s(med(r.map(x => x.to_connector_ms))), "median steps": med(r.map(x => x.steps)),
    "doc reads": med(r.map(x => x.doc_reads)), "gtm_os calls": med(r.map(x => x.gtm_calls)), "records": med(r.map(x => x.records)), "input tokens": med(r.map(x => x.input_tokens)), "connector reached": `${r.filter(x => x.to_connector_ms !== null).length}/${r.length}` };
}
console.table(table);
writeFileSync(join(artifacts, "latency-report.json"), JSON.stringify({ model, prompt, followup, runs, skills: dummySkills, artifacts, rows }, null, 2));
console.log(`\nreport: ${join(artifacts, "latency-report.json")}`);

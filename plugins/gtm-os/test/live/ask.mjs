// Ask the agent a question in this brain and watch which tools it uses, as it uses them.
//   cd <brain>; node <plugin>/test/live/ask.mjs "What do we know about Castorama?"
//   ... --write    let it write (workspace-write); default is read-only, so nothing lands in the brain
//   ... --model m  the model codex exec runs; default gpt-5.6-sol for local testing (a person's own chats use whatever they chose)
// Runs `codex exec --json` here (your account, the installed plugin, this folder's brain) and
// prints one line per tool call: GTM OS tools with their outcome, shell commands, other servers,
// and Computer Use (Codex runs it as the MCP server cua_repl) with the title the agent gave it.
// Then the answer, and a count. Reasoning is not shown.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
// the tools Allethic generates from the ontology (its three reads plus one per action), so a call
// to one of them reads "(allethic)": the rest of the catalog is handwritten in server.mjs
const generatedTools = (() => { const names = new Set(["list_objects", "describe_object", "query"]); try { const onto = JSON.parse(readFileSync(new URL("../../ontology/gtm-os.ossie.json", import.meta.url), "utf8")); for (const a of onto.actions || []) names.add(a.tool_name || `act_${a.name}`); } catch {} return names; })();
const tag = tool => generatedTools.has(tool) ? " (allethic)" : "";

const args = process.argv.slice(2);
const write = args.includes("--write");
const model = args.includes("--model") ? args[args.indexOf("--model") + 1] : "gpt-5.6-sol";
const question = args.filter((a, i) => a !== "--write" && a !== "--model" && args[i - 1] !== "--model").join(" ").trim();
if (!question) { console.error('usage: node ask.mjs "your question" [--write]'); process.exit(1); }

const codex = spawn("codex", ["exec", "--json", "--skip-git-repo-check", "-m", model, "-s", write ? "workspace-write" : "read-only", question], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: process.env });
// codex says "Reading additional input from stdin..." whenever stdin is not a terminal; nothing else of its stderr is dropped
createInterface({ input: codex.stderr }).on("line", l => { if (!/Reading additional input from stdin/.test(l)) console.error(l); });
const n = { gtm: 0, allethic: 0, failed: 0, shell: 0, other: 0, computer: 0 }; let answer = "";
const brief = a => { const o = { ...(a || {}) }; delete o.brain; const s = JSON.stringify(o); return s === "{}" ? "" : "  " + s.slice(0, 90); };
createInterface({ input: codex.stdout }).on("line", line => {
  let e; try { e = JSON.parse(line); } catch { return; }
  // a turn that ends without an answer says why: a usage limit, a refused approval, a model error
  if (e.type === "turn.failed" || e.type === "error") { const m = (e.error && e.error.message) || e.message; if (m) console.log(`STOPPED  ${String(m).replace(/\s+/g, " ").slice(0, 200)}`); return; }
  if (e.type !== "item.completed" || !e.item) return;
  const it = e.item;
  if (it.type === "mcp_tool_call") {
    if (it.server === "cua_repl") { n.computer++; console.log(`COMPUTER USE  ${(it.arguments && it.arguments.title) || it.tool}`); return; }
    if (it.server === "gtm_os") { const bad = it.status === "failed" || it.error || (it.result && it.result.isError); n.gtm++; if (bad) n.failed++; if (generatedTools.has(it.tool)) n.allethic++; console.log(`gtm_os   ${(it.tool + tag(it.tool)).padEnd(24)} ${bad ? "FAILED" : "ok"}${brief(it.arguments)}`); return; }
    n.other++; console.log(`${it.server.padEnd(8)} ${it.tool}${brief(it.arguments)}`); return;
  }
  if (it.type === "command_execution") { n.shell++; console.log(`shell    ${String(it.command || "").replace(/^\/bin\/zsh -lc '?|'$/g, "").slice(0, 110)}  ->  exit ${it.exit_code}`); return; }
  if (it.type === "agent_message") answer = it.text || answer;
});
codex.on("close", code => {
  console.log(`\nanswer   ${answer.replace(/\s+/g, " ").trim() || "(none)"}`);
  console.log(`\n${n.gtm} GTM OS call${n.gtm === 1 ? "" : "s"}${n.failed ? ` (${n.failed} failed)` : ""} of which ${n.allethic} allethic, ${n.shell} shell, ${n.other} other, ${n.computer} Computer Use${code ? `; codex exited ${code}` : ""}`);
  process.exit(code || 0);
});

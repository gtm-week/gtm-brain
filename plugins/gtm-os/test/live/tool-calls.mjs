// Which tools Codex actually called, from its own session logs: the ground truth behind "is the
// agent using the MCP tools or something else". Reads ~/.codex/sessions/<day>/*.jsonl.
//   node plugins/gtm-os/test/live/tool-calls.mjs [YYYY-MM-DD | today] [--brain /path/to/brain]
// Per chat: the GTM OS tools called (ok / failed), shell and other tool calls, and Computer Use,
// which Codex runs as the MCP server cua_repl (plugin unified-computer-use): each call is listed
// with the title the agent gave it, so you can see what it reached for the screen to do.
// Old act_* names mean that chat ran a plugin before 0.6.0.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
// the tools Allethic generates from the ontology (its three reads plus one per action), so a call
// to one of them reads "(allethic)": the rest of the catalog is handwritten in server.mjs
const generatedTools = (() => { const names = new Set(["list_objects", "describe_object", "query"]); try { const onto = JSON.parse(readFileSync(new URL("../../ontology/gtm-os.ossie.json", import.meta.url), "utf8")); for (const a of onto.actions || []) names.add(a.tool_name || `act_${a.name}`); } catch {} return names; })();
const tag = tool => generatedTools.has(tool) ? " (allethic)" : "";

const args = process.argv.slice(2);
const brain = args.includes("--brain") ? args[args.indexOf("--brain") + 1] : null;
const day = (args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || new Date().toISOString().slice(0, 10)).split("-");
const dir = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions", ...day);
if (!existsSync(dir)) { console.log(`no Codex sessions on ${day.join("-")} (${dir})`); process.exit(0); }

const chats = new Map();
const chat = id => { if (!chats.has(id)) chats.set(id, { id, first: "", mcp: new Map(), custom: new Map(), computer: [], brains: new Set() }); return chats.get(id); };
const isComputerUse = item => item.server === "cua_repl" || /computer-use/.test(item.pluginId || "") || /computer/i.test(item.type || "");
for (const file of readdirSync(dir).filter(f => f.endsWith(".jsonl"))) {
  const thread = `${file.match(/T(\d\d-\d\d)/)?.[1].replace("-", ":") || "??:??"} ${file.match(/([0-9a-f-]{36})\.jsonl$/)?.[1].slice(-12) || file}`;
  for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
    if (!line) continue; let r; try { r = JSON.parse(line); } catch { continue; }
    const p = r.payload || {}; const c = chat(thread);
    if (p.type === "user_message" && !c.first) c.first = String(p.message || "").replace(/\s+/g, " ").slice(0, 70);
    const item = p.type === "item_completed" ? p.item : null;
    if (item && isComputerUse(item)) { c.computer.push(String((item.arguments && item.arguments.title) || item.tool || item.type).slice(0, 60)); continue; }
    if (item && item.type === "McpToolCall") {
      if (item.server !== "gtm_os") { bump(c.custom, `${item.server}:${item.tool}`); continue; }
      const b = item.arguments && item.arguments.brain; if (b) c.brains.add(b);
      bump(c.mcp, item.tool, item.status === "failed" || (item.result && item.result.isError) ? "failed" : "ok");
    } else if (p.type === "custom_tool_call") bump(c.custom, p.name || "?");
  }
}
function bump(map, key, outcome = "n") { const v = map.get(key) || { ok: 0, failed: 0, n: 0 }; v[outcome]++; map.set(key, v); }

let shown = 0;
for (const c of chats.values()) {
  if (!c.mcp.size && !c.custom.size && !c.computer.length) continue;
  if (brain && ![...c.brains].some(b => b.startsWith(brain))) continue;
  shown++;
  console.log(`\nchat ${c.id}  "${c.first || "(no user message)"}"${c.brains.size ? `\n  brain    ${[...c.brains].join(", ")}` : ""}`);
  const old = [...c.mcp.keys()].filter(t => t.startsWith("act_"));
  for (const [tool, v] of [...c.mcp].sort((a, b) => (b[1].ok + b[1].failed) - (a[1].ok + a[1].failed))) console.log(`  gtm_os   ${(tool + tag(tool)).padEnd(26)} ${v.ok} ok${v.failed ? `, ${v.failed} failed` : ""}`);
  if (old.length) console.log(`  note     ${old.join(", ")}: names from before 0.6.0; this chat ran an older plugin`);
  for (const [name, v] of c.custom) console.log(`  other    ${name.padEnd(22)} ${v.n}`);
  if (c.computer.length) console.log(`  COMPUTER USE   ${c.computer.length} call${c.computer.length === 1 ? "" : "s"}: ${c.computer.join(" | ")}`);
  if (!c.mcp.size) console.log(`  (no GTM OS tool was called in this chat)`);
}
if (!shown) console.log(`${day.join("-")}: no tool calls${brain ? ` for ${brain}` : ""} in ${chats.size} chat${chats.size === 1 ? "" : "s"}`);

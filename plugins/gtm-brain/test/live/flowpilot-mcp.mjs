#!/usr/bin/env node
// Local test connector. No network, credentials, OAuth or external account actions.
// Run: node plugins/gtm-brain/test/live/flowpilot-mcp.mjs
// Optional FLOWPILOT_FIXTURE_STATE=/absolute/scratch/state.json preserves simulated
// connections across MCP restarts. Omit for process-local state. Never use a real account.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { createInterface } from "node:readline";

const data = JSON.parse(readFileSync(new URL("../../../../work/diagrams/flowpilot-synthetic-data.json", import.meta.url), "utf8"));
const notice = "FICTIONAL FLOWPILOT TEST ONLY. Local supplied data; no real Gmail, Attio, calendar, OAuth or account permissions. Verified means simulated fixture access only.";
const stateFile = process.env.FLOWPILOT_FIXTURE_STATE;
if (stateFile && !isAbsolute(stateFile)) throw new Error("FLOWPILOT_FIXTURE_STATE must be an absolute scratch path");
let state = { gmail: { status: "declared" }, attio: { status: "declared" }, calendar: { status: "unavailable", reason: "Calendar is omitted from the supplied fictional scenario." } };
if (stateFile && existsSync(stateFile)) {
  const saved = JSON.parse(readFileSync(stateFile, "utf8"));
  if (saved.fixture !== "flowpilot-v1" || !saved.connections) throw new Error("Unrecognized fixture state; refusing to replace it");
  state = saved.connections;
}
function save() {
  if (!stateFile) return;
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ fixture: "flowpilot-v1", notice, connections: state }, null, 2) + "\n");
}
const string = description => ({ type: "string", description });
const provider = { type: "string", enum: ["gmail", "attio", "calendar"] };
const schema = (properties = {}, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const tools = [
  { name: "fixture_status", description: "Inspect fictional company identity and simulated per-provider access. Does not reveal strategy, private fixture reads or the later human correction.", inputSchema: schema(),
    call: () => ({ company: data.company, people: data.people.map(({ name, role }) => ({ name, role })), connections: state,
      calendar_completion: state.calendar.status === "declined" ? "Explicitly declined for this fictional run." : "Calendar unavailable in fixture. Ask the human whether to skip it; absence is not consent or a decline." }) },
  { name: "request_fixture_connection", description: "Start a simulated Gmail/Attio connection, then ask the human for consent. This only creates awaiting_consent state; it does not grant access. Calendar is unavailable and needs an explicit skip response.",
    inputSchema: schema({ provider }, ["provider"]), call: args => {
      const current = state[args.provider];
      if (args.provider === "calendar") return { provider: "calendar", ...current, next: "Ask whether to skip the unavailable fictional calendar. Record only the actual answer with answer_fixture_connection." };
      if (current.status === "declared") { state[args.provider] = { status: "awaiting_consent" }; save(); }
      return { provider: args.provider, ...state[args.provider], next: state[args.provider].status === "awaiting_consent" ? "Ask the human to allow or decline simulated access. Wait for their answer; do not supply consent yourself." : "Existing decision retained; do not ask again unless the human explicitly changes it." };
    } },
  { name: "answer_fixture_connection", description: "Record an ACTUAL fictional human answer, verbatim, after requesting a connection. The human answer must be at most five words. decision allow grants simulated read access; decline records an explicit skip. Never fabricate a reply. This is a test consent checkpoint, not a security or OAuth boundary.",
    inputSchema: schema({ provider, decision: { type: "string", enum: ["allow", "decline"] }, human_reply: string("Verbatim latest human consent/decline, one to five words. Example: Connect Gmail / Skip calendar.") }, ["provider", "decision", "human_reply"]),
    call: args => {
      const reply = args.human_reply.trim();
      if (!reply || reply.split(/\s+/).length > 5) throw new Error("Use the actual human answer, one to five words; no answer means wait.");
      const negative = /\b(no|skip|decline|deny|cancel|stop)\b/i.test(reply);
      const positive = /\b(yes|allow|connect|approve|proceed|continue)\b/i.test(reply);
      if (args.decision === "allow" && (!positive || negative)) throw new Error("Reply does not clearly allow simulated access; ask the human, then wait.");
      if (args.decision === "decline" && !negative) throw new Error("Reply does not clearly decline simulated access; ask the human, then wait.");
      const current = state[args.provider];
      if (args.provider === "calendar" && args.decision === "allow") throw new Error("Calendar is unavailable in this fixture. Offer an explicit skip; do not claim a connection.");
      if (args.provider !== "calendar" && current.status === "declared") throw new Error("Call request_fixture_connection and wait for the human answer first.");
      state[args.provider] = { status: args.decision === "allow" ? "verified_simulated" : "declined", human_reply: reply, decided_at: new Date().toISOString(), simulated: true };
      save();
      return { provider: args.provider, ...state[args.provider], scope: "Read-only supplied fixture data. No real credentials, authentication or account permissions exist.",
        completion: args.decision === "decline" ? "Explicitly declined for this fictional run; record that outcome and continue with available evidence." : "Simulated fixture access verified. Resume the task using the small read tool; do not claim real OAuth completed." };
    } },
  { name: "read_fixture_gmail", description: "Read up to 12 fictional prospect threads after simulated Gmail consent. Returns exact synthetic source IDs and original supplied summaries. No real inbox is queried; no email can be sent.",
    inputSchema: schema({ limit: { type: "integer", minimum: 1, maximum: 12, description: "Small sample size, default 12." } }),
    call: args => {
      requireVerified("gmail");
      const threads = data.gmail_threads.slice(0, args.limit ?? 12);
      return { sampled: threads.length, available: data.gmail_threads.length, threads, source_note: "Preserve each id verbatim as a synthetic source. Sample proportions are not market prevalence. Requests do not establish product capabilities." };
    } },
  { name: "read_fixture_attio", description: "Read the single supplied fictional Northstar deal after simulated Attio consent. Always returns the original EUR 18,000 snapshot. Human corrections belong in the brain; this tool cannot write or alter CRM data.",
    inputSchema: schema(), call: () => { requireVerified("attio"); return { deal: data.attio_snapshot, read_only: true }; } },
];
function requireVerified(name) {
  if (state[name].status !== "verified_simulated") throw new Error(`${name}: no simulated read access (${state[name].status}). Request connection, ask the human and wait for consent first.`);
}
function validate(args, spec) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("arguments must be an object");
  for (const key of Object.keys(args)) if (!(key in spec.properties)) throw new Error(`Unknown argument: ${key}`);
  for (const key of spec.required) if (!(key in args)) throw new Error(`Missing argument: ${key}`);
  for (const [key, value] of Object.entries(args)) {
    const type = spec.properties[key];
    if (type.type === "string" && typeof value !== "string") throw new Error(`${key} must be a string`);
    if (type.enum && !type.enum.includes(value)) throw new Error(`${key} must be one of ${type.enum.join(", ")}`);
    if (type.type === "integer" && (!Number.isInteger(value) || value < type.minimum || value > type.maximum)) throw new Error(`${key} must be an integer from ${type.minimum} to ${type.maximum}`);
  }
}
const result = (value, isError = false) => ({ content: [{ type: "text", text: JSON.stringify({ notice, ...value }, null, 2) }], ...(isError ? { isError: true } : {}) });
const send = (id, payload) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, ...payload }) + "\n");
for await (const line of createInterface({ input: process.stdin })) {
  let message;
  try { message = JSON.parse(line); } catch { send(null, { error: { code: -32700, message: "Parse error" } }); continue; }
  if (message.id === undefined) continue;
  const { id, method, params = {} } = message;
  if (method === "initialize") send(id, { result: { protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "flowpilot-fixture", version: "1.0.0" }, instructions: `${notice} Every consent answer must come from the human, not the assistant. Await it. Human fixture replies are at most five words. Connection state is simulation only. Never expose or invent strategic direction or the later human correction from hidden fixture fields.` } });
  else if (method === "ping") send(id, { result: {} });
  else if (method === "tools/list") send(id, { result: { tools: tools.map(({ call, ...tool }) => ({ ...tool, annotations: { readOnlyHint: tool.name.startsWith("read_") || tool.name === "fixture_status", openWorldHint: false } })) } });
  else if (method === "tools/call") {
    try {
      const tool = tools.find(t => t.name === params.name);
      if (!tool) throw new Error(`Unknown fixture tool: ${params.name}`);
      validate(params.arguments ?? {}, tool.inputSchema);
      send(id, { result: result(tool.call(params.arguments ?? {})) });
    } catch (error) { send(id, { result: result({ error: error.message }, true) }); }
  } else send(id, { error: { code: -32601, message: "Method not found" } });
}

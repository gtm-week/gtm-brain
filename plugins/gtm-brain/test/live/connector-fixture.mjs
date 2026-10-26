#!/usr/bin/env node
// Stand-in connectors for latency runs: Slack reads, a mail draft and a calendar event, with
// canned answers over stdio MCP. No real workspace is touched; the point is to measure what the
// model does around a connector call, not the connector itself. Newline-delimited JSON-RPC.
import { createInterface } from "node:readline";

const channels = [{ id: "C01", name: "general", members: 14 }, { id: "C02", name: "sales", members: 6 }, { id: "C03", name: "random", members: 12 }];
const messages = {
  general: [
    { ts: "2026-09-16T08:12:00Z", user: "marta", text: "Reminder: pipeline review moved to 15:00 today." },
    { ts: "2026-09-16T07:40:00Z", user: "tomek", text: "Bergstrom Home signed the pilot order form." },
    { ts: "2026-09-15T16:05:00Z", user: "anna", text: "New security questionnaire from Castorama in the shared drive." }],
  sales: [{ ts: "2026-09-16T09:01:00Z", user: "tomek", text: "Castorama wants a reference call before Q4 budget." }],
  random: [{ ts: "2026-09-15T12:00:00Z", user: "anna", text: "Lunch at 12:30?" }],
};
// reads are read-only; the two writes are closed-world, so `codex exec` needs no approval for either
const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const tools = [
  { name: "slack_list_channels", description: "Slack (fixture): list the channels in the workspace.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: read },
  { name: "slack_read_channel", description: "Slack (fixture): read the latest messages in a channel, newest first.", inputSchema: { type: "object", properties: { channel: { type: "string", description: "Channel name, with or without #" }, limit: { type: "integer" } }, required: ["channel"], additionalProperties: false }, annotations: read },
  { name: "slack_search_messages", description: "Slack (fixture): search messages across channels.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false }, annotations: read },
  { name: "mail_create_draft", description: "Mail (fixture): save an email draft. Nothing is sent.", inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"], additionalProperties: false }, annotations: write },
  { name: "calendar_create_event", description: "Calendar (fixture): create an event on the person's own calendar.", inputSchema: { type: "object", properties: { title: { type: "string" }, start: { type: "string", description: "ISO date-time" }, end: { type: "string", description: "ISO date-time" }, attendees: { type: "array", items: { type: "string" } } }, required: ["title", "start", "end"], additionalProperties: false }, annotations: write },
];
const call = (name, args = {}) => {
  if (name === "slack_list_channels") return channels;
  if (name === "slack_read_channel") { const c = String(args.channel || "").replace(/^#/, ""); return messages[c] ? messages[c].slice(0, args.limit || 20) : { error: `no channel #${c}` }; }
  if (name === "slack_search_messages") { const q = String(args.query || "").toLowerCase(); return Object.entries(messages).flatMap(([c, ms]) => ms.filter(m => m.text.toLowerCase().includes(q)).map(m => ({ channel: c, ...m }))); }
  if (name === "mail_create_draft") return { id: "draft-1", status: "draft saved", to: args.to, subject: args.subject };
  if (name === "calendar_create_event") return { id: "event-1", status: "created", title: args.title, start: args.start, end: args.end, attendees: args.attendees || [] };
  return { error: `unknown tool ${name}` };
};
const send = m => process.stdout.write(JSON.stringify(m) + "\n");
createInterface({ input: process.stdin }).on("line", line => {
  let req; try { req = JSON.parse(line); } catch { return; }
  if (req.id === undefined) return;   // notifications need no answer
  const { id, method, params = {} } = req;
  if (method === "initialize") return send({ jsonrpc: "2.0", id, result: { protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "connector_fixture", version: "0.2.0" } } });
  if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools } });
  if (method === "tools/call") return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(call(params.name, params.arguments), null, 1) }] } });
  if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
  send({ jsonrpc: "2.0", id, error: { code: -32601, message: `unsupported: ${method}` } });
});

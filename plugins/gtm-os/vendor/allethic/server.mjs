// A stdio MCP server over the generated surface. JSON-RPC, one message per line, Node built-ins
// only, so a plugin can vendor this file and run it with nothing installed.
import { createInterface } from "node:readline";
import { buildTools, instructionsText } from "./surface.mjs";

/* scope: { name, schema } adds one parameter to every generated tool (which workspace, which
   deployment) and hands its value to the backend in ctx under that name */
export function createServer({ ontology, backend, name = "allethic-mcp", title = "", version = "0.4.0", role = null, extraTools = [], instructions = "", maxRows, scope = null, extraCatalog = null } = {}) {
  const tools = [...buildTools(ontology, backend, { maxRows, scope, extraCatalog }), ...extraTools];
  if (new Set(tools.map(t => t.name)).size !== tools.length) throw new Error("duplicate tool name in generated and extra tools");
  const ctx = { role, ontology };
  const reply = (id, result) => ({ jsonrpc: "2.0", id, result });
  const fail = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  const listed = () => tools.map(t => ({ name: t.name, ...(t.title || t.annotations?.title ? { title: t.title || t.annotations.title } : {}), description: t.description, inputSchema: t.inputSchema, annotations: t.annotations }));
  async function handle(req) {
    const { id, method, params = {} } = req;
    if (method === "initialize") return reply(id, { protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name, title: title || name, version }, instructions: instructionsText(ontology, instructions) });
    if (method === "ping") return reply(id, {});
    if (method === "tools/list") return reply(id, { tools: listed() });
    if (method === "tools/call") {
      const tool = tools.find(t => t.name === params.name);
      if (!tool) return fail(id, -32602, `unknown tool ${params.name}`);
      try { return reply(id, await tool.call(params.arguments || {}, ctx)); }
      catch (e) { return reply(id, { content: [{ type: "text", text: `${tool.name} failed: ${e.message}` }], isError: true }); }
    }
    if (method === "prompts/list") return reply(id, { prompts: [] });
    if (method === "resources/list") return reply(id, { resources: [] });
    if (id !== undefined) return fail(id, -32601, `unknown method ${method}`);
    return null; // a notification
  }
  return { tools, listed, handle, call: (toolName, args = {}) => handle({ id: 0, method: "tools/call", params: { name: toolName, arguments: args } }).then(r => r.result) };
}

export function serveStdio(server, { input = process.stdin, output = process.stdout } = {}) {
  const send = m => output.write(JSON.stringify(m) + "\n");
  let inflight = 0;
  createInterface({ input }).on("line", line => {
    let req; try { req = JSON.parse(line); } catch { return; }
    if (!(req && typeof req === "object" && req.method)) return;
    inflight++;
    server.handle(req).then(r => { if (r) send(r); }).catch(e => { if (req.id !== undefined) send({ jsonrpc: "2.0", id: req.id, error: { code: -32603, message: e.message } }); }).finally(() => inflight--);
  });
  input.on("end", () => { const leave = () => inflight ? setTimeout(leave, 50) : output.end(() => process.exit(0)); leave(); });
}

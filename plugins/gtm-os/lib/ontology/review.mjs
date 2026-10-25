// The ontology against the host that serves it. Two questions, one comparison:
//   review   what does the running server offer that the ontology does not describe, and the
//            other way round; which tools are generated, which are hand-written beside them
//   init     turn the hand-written write tools into proposed actions, so the ontology becomes
//            the place they are described. A proposal is a new file next to the ontology; the
//            ontology itself is never rewritten, and a later run proposes only what is still missing.
// A host's catalog is what tools/list returns; nothing here reads the host's source code.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { checkSchema } from "./validation.mjs";
import { VENDOR } from "./ontology.mjs";

const READS = ["list_objects", "describe_object", "query"];

/* ask a host server for its catalog: initialize, then tools/list, over stdio */
export function hostCatalog(command, { cwd = process.cwd(), env = process.env, timeout = 20000 } = {}) {
  return new Promise((done, fail) => {
    const [cmd, ...args] = Array.isArray(command) ? command : String(command).split(/\s+/).filter(Boolean);
    const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => { child.kill(); fail(new Error(`the host did not answer tools/list within ${timeout / 1000}s`)); }, timeout);
    const pending = new Map(); let id = 0;
    const call = (method, params = {}) => new Promise(res => { pending.set(++id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
    createInterface({ input: child.stdout }).on("line", line => { let m; try { m = JSON.parse(line); } catch { return; } const res = pending.get(m.id); if (res) { pending.delete(m.id); res(m); } });
    child.on("error", e => { clearTimeout(timer); fail(e); });
    (async () => {
      await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "allethic-mcp review", version: "1" } });
      const m = await call("tools/list");
      clearTimeout(timer); child.stdin.end(); child.kill();
      if (!m.result || !Array.isArray(m.result.tools)) return fail(new Error(`tools/list answered without tools: ${JSON.stringify(m).slice(0, 200)}`));
      done(m.result.tools);
    })().catch(e => { clearTimeout(timer); child.kill(); fail(e); });
  });
}

/* the host's scope (GTM OS: brain) is the parameter most of its tools require; the ones that
   do not are session or install tools, which is exactly how init tells them apart later */
export function detectScope(tools) {
  const count = new Map();
  for (const t of tools) for (const k of t.inputSchema?.required || []) count.set(k, (count.get(k) || 0) + 1);
  const [name, n] = [...count].sort((a, b) => b[1] - a[1])[0] || [];
  return name && n > tools.length / 2 ? name : null;
}

const readOnly = t => !!(t.annotations && t.annotations.readOnlyHint);
// requires it, not merely accepts it: an installer that may take a folder is still not an interaction of the model
const takesScope = (t, scope) => !!scope && (t.inputSchema?.required || []).includes(scope);

export function compareCatalog(onto, tools, { scope = detectScope(tools) } = {}) {
  const generated = new Set([...READS, ...onto.actions.map(a => a.tool_name)]);
  const byActionName = new Map(onto.actions.map(a => [a.name, a]));
  const names = tools.map(t => t.name);
  const report = { scope, generated: [], extra: [], missingInHost: [], renameCandidates: [], duplicates: names.filter((n, i) => names.indexOf(n) !== i) };
  for (const t of tools) {
    if (generated.has(t.name)) { report.generated.push(t.name); continue; }
    const same = byActionName.get(t.name);
    // the ontology has an action of this name whose tool is called something else (act_<name>, say):
    // the file needs tool_name, not another action
    if (same) { report.renameCandidates.push({ action: same.name, ontologyTool: same.tool_name, hostTool: t.name }); continue; }
    report.extra.push({ name: t.name, title: t.title || null, readOnly: readOnly(t), scoped: takesScope(t, scope) });
  }
  for (const a of onto.actions) if (!names.includes(a.tool_name) && !report.renameCandidates.some(r => r.action === a.name)) report.missingInHost.push(a.tool_name);
  for (const r of READS) if (!names.includes(r)) report.missingInHost.push(r);
  return report;
}

/* a host schema, minus the scope and minus anything the ontology validator does not know */
function pruneSchema(schema, scope) {
  const s = structuredClone(schema || { type: "object", properties: {} });
  if (scope && s.properties) { delete s.properties[scope]; if (Array.isArray(s.required)) s.required = s.required.filter(k => k !== scope); }
  if (Array.isArray(s.required) && !s.required.length) delete s.required;
  for (let i = 0; i < 50; i++) {
    try { checkSchema(s, "proposal"); return s; }
    catch (e) {
      const m = String(e.message).match(/^proposal((?:\.[^:]+)*): unsupported schema keyword (\S+)/);
      if (!m) throw e;
      let at = s; for (const step of m[1].split(".").filter(Boolean)) at = at.properties?.[step] ?? at[step] ?? at;
      delete at[m[2]];
    }
  }
  throw new Error("could not reduce the host schema to the ontology's dialect");
}

/* actions for the host's own write tools that the ontology does not describe yet */
export function proposeActions(onto, tools, { scope = detectScope(tools), all = false } = {}) {
  const report = compareCatalog(onto, tools, { scope });
  const proposed = [];
  for (const x of report.extra) {
    if (x.readOnly) continue;                       // reads are the ontology's objects, or stay beside it
    if (!all && scope && !x.scoped) continue;       // a tool that takes no scope is a session or install tool, not an interaction
    const t = tools.find(t => t.name === x.name);
    proposed.push({ name: t.name, tool_name: t.name, title: t.title || t.name, description: String(t.description || "").trim(), returns: "Opaque", input_schema: pruneSchema(t.inputSchema, scope) });
  }
  const renames = report.renameCandidates.map(r => ({ action: r.action, tool_name: r.hostTool }));
  return { proposed, renames, report };
}

/* the ontology file as it would be with the proposals in: appended, never rewritten */
export function proposeOntology(raw, { proposed, renames }) {
  const out = structuredClone(raw);
  let ext = (out.custom_extensions || []).find(x => x.vendor_name === VENDOR);
  if (!ext) { ext = { vendor_name: VENDOR, data: {} }; (out.custom_extensions ||= []).push(ext); }
  if (typeof ext.data === "string") ext.data = JSON.parse(ext.data);
  const actions = (ext.data.actions ||= []);
  for (const r of renames) { const a = actions.find(a => a.name === r.action); if (a) a.tool_name = r.tool_name; }
  for (const p of proposed) actions.push(p);
  return out;
}

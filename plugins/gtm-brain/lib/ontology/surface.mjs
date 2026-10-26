// The MCP surface, generated from the ontology. Deliberately compact, the shape Allethic settled
// on (docs/MCP-QUERY-RESEARCH.md there): a catalog, a description per object, one read tool, and
// one write tool per action. Not one tool per object: the model reads the catalog once and then
// asks for exactly the object it needs.
//
//   list_objects            the catalog: objects, joins, interactions, from the ontology alone
//   describe_object(name)   fields, joins, this object's interactions, its guidance, its row count
//   query(object, ...)      rows of one object, filtered, searched, limited; the backend answers
//   act_<name>(params)      one per ontology action; the input schema comes from its params
import { jsonType } from "./ontology.mjs";
import { checkSchema, validateValue } from "./validation.mjs";
import { Refused } from "./backend.mjs";

const squash = s => String(s || "").split(/\s+/).join(" ").trim();
const guidance = ai => typeof ai === "string" ? squash(ai) : ai && typeof ai === "object" ? squash(ai.instructions) : "";
const synonyms = ai => ai && typeof ai === "object" && Array.isArray(ai.synonyms) && ai.synonyms.length ? ai.synonyms.join(", ") : "";
const sig = a => `${a.tool_name || `act_${a.name}`}(${a.input_schema ? Object.keys(a.input_schema.properties || {}).map(k => (a.input_schema.required || []).includes(k) ? k : `${k}?`).join(", ") : a.params.map(p => p.required ? p.name : `${p.name}?`).join(", ")}) -> ${a.returns}`;

export function listObjectsText(onto) {
  const lines = [`Objects in ${onto.name || "the ontology"} (read with query, or describe_object for the fields):`];
  for (const d of onto.datasets) {
    const own = d.actions.length ? ` Interactions: ${d.actions.map(a => a.tool_name || `act_${a.name}`).join(", ")}.` : "";
    const syn = synonyms(d.ai_context);
    lines.push(`- ${d.name} (${d.fields.length} fields${syn ? `; also called ${syn}` : ""}): ${squash(d.description)}${own}`);
  }
  if (onto.relationships.length) {
    lines.push("Relationships (join keys):");
    for (const r of onto.relationships) lines.push(`- ${r.left_dataset}.${r.left_keys.join(",")} -> ${r.right_dataset}.${r.right_keys.join(",")} (${r.join_type})`);
  }
  if (onto.actions.length) {
    lines.push("Interactions (call the listed tools):");
    for (const a of onto.actions) lines.push(`- ${sig(a)}${a.object ? ` [${a.object}]` : ""}${a.description ? `: ${squash(a.description)}` : ""}`);
  }
  return lines.join("\n");
}

export function describeObjectText(onto, name, count) {
  if (!onto.has(name)) return `Unknown object "${name}". Objects: ${onto.datasets.map(d => d.name).join(", ")}`;
  const d = onto.dataset(name);
  const lines = [`${name}: ${count == null ? "row count unknown" : `${count} rows`}${d.kind !== "stored" ? ` (${d.kind === "mirror" ? "mirrored from " + d.source : "computed"})` : ""}`];
  if (d.description) lines.push(squash(d.description));
  const g = guidance(d.ai_context); if (g) lines.push(`Guidance: ${g}`);
  const syn = synonyms(d.ai_context); if (syn) lines.push(`Also called: ${syn}`);
  if (d.primary_key.length) lines.push(`Key: ${d.primary_key.join(", ")}`);
  lines.push("Fields:");
  for (const f of d.fields) lines.push(`- ${f.name} (${f.data_type})${f.description ? `: ${squash(f.description)}` : ""}${guidance(f.ai_context) ? ` [${guidance(f.ai_context)}]` : ""}`);
  const rels = onto.relationships.filter(r => r.left_dataset === name || r.right_dataset === name);
  if (rels.length) { lines.push("Joins:"); for (const r of rels) lines.push(`- ${r.left_dataset}.${r.left_keys.join(",")} = ${r.right_dataset}.${r.right_keys.join(",")}`); }
  if (d.actions.length) { lines.push("Interactions (call the listed tools):"); for (const a of d.actions) lines.push(`- ${sig(a)}${a.description ? `: ${squash(a.description)}` : ""}`); }
  const ex = d.ai_context && typeof d.ai_context === "object" && Array.isArray(d.ai_context.examples) ? d.ai_context.examples : [];
  if (ex.length) { lines.push("Example questions:"); for (const e of ex) lines.push(`- ${squash(e)}`); }
  return lines.join("\n");
}

export function actionSchema(a) {
  if (a.input_schema) return structuredClone(a.input_schema);
  const properties = {}, required = [];
  for (const p of a.params) {
    properties[p.name] = { ...jsonType(p.type), ...(p.description ? { description: p.description } : {}), ...(p.enum ? { enum: p.enum } : {}) };
    if (p.required) required.push(p.name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

export function formatRows(rows, { limit, truncated = false } = {}) {
  if (!rows.length) return "no rows";
  const out = rows.map(r => JSON.stringify(r)).join("\n");
  return `${rows.length} row${rows.length === 1 ? "" : "s"}${truncated ? ` (limit ${limit}; filter harder for the rest)` : ""}:\n${out}`;
}

export function formatOutcome(a, r) {
  if (r.outcome === "ok") { const body = r.result === undefined ? "" : typeof r.result === "string" ? r.result : JSON.stringify(r.result); return `ok: ${a.name}${body ? `\n${body}` : ""}`; }
  if (r.outcome === "refused") return `refused: ${r.message || a.name}`;
  if (r.outcome === "denied") return `denied: ${r.message || `this role may not ${a.name}`}`;
  return `error: ${r.message || a.name}`;
}

const read = title => ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const write = title => ({ title, readOnlyHint: false, destructiveHint: false, openWorldHint: false });
const textResult = (s, isError = false) => ({ content: [{ type: "text", text: s }], ...(isError ? { isError: true } : {}) });

/* the tools: name, description, inputSchema, annotations, and call(args, ctx) -> MCP result */
export function buildTools(onto, backend, { maxRows = 200, scope = null, extraCatalog = null } = {}) {
  const objects = onto.datasets.map(d => d.name);
  // a host's own additions to the catalog, computed per call: what the host knows only then
  // (GTM Brain: the company's interactions, which depend on the brain the call names)
  const extra = async ctx => { if (!extraCatalog) return ""; try { const t = await extraCatalog(ctx || {}); return t ? `\n${String(t).trim()}` : ""; } catch (e) { return `\n(the host's additions could not be read: ${e.message})`; } };
  const tools = [
    { name: "list_objects", description: "The catalog: every object, how they join, and the interactions that write. Start here; then describe_object for the fields of one, query for its rows.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: read("List objects"),
      call: async (_args, ctx) => textResult(listObjectsText(onto) + await extra(ctx)) },
    { name: "describe_object", description: "One object in full: fields with types, guidance, joins, its interactions and its row count. Call it before the first query of an object.",
      inputSchema: { type: "object", properties: { name: { type: "string", enum: objects, description: "Object name from list_objects" } }, required: ["name"], additionalProperties: false }, annotations: read("Describe object"),
      call: async ({ name }, ctx) => { let count = null; try { count = onto.has(name) ? await backend.count(name, ctx) : null; } catch {} return textResult(describeObjectText(onto, name, count) + await extra(ctx)); } },
    { name: "query", description: "Rows of one object, newest first: exact filters on fields, a free-text search over every field, and a limit. Answer from the rows; no rows means say so.",
      inputSchema: { type: "object", properties: {
        object: { type: "string", enum: objects, description: "Object name" },
        filters: { type: "object", description: "field: value, or field: [values]; every filter must match", additionalProperties: true },
        search: { type: "string", description: "Words to look for in any field" },
        limit: { type: "integer", minimum: 1, maximum: maxRows, description: `At most this many rows (default 50, max ${maxRows})` } }, required: ["object"], additionalProperties: false }, annotations: read("Query"),
      call: async ({ object, filters = {}, search = "", limit = 50 }, ctx) => {
        if (!onto.has(object)) return textResult(`Unknown object "${object}". Objects: ${objects.join(", ")}`, true);
        const d = onto.dataset(object), known = new Set(d.fields.map(f => f.name));
        const bad = Object.keys(filters).filter(k => !known.has(k));
        if (bad.length) return textResult(`${object} has no field ${bad.join(", ")}. Fields: ${[...known].join(", ")}`, true);
        const n = Math.max(1, Math.min(maxRows, Number(limit) || 50));
        const rows = await backend.list(object, { filters, search, limit: n + 1 }, ctx);
        return textResult(formatRows(rows.slice(0, n), { limit: n, truncated: rows.length > n }));
      } },
  ];
  for (const a of onto.actions) tools.push({
    name: a.tool_name || `act_${a.name}`, title: a.title || a.name, description: `${a.description ? squash(a.description) + " " : ""}${a.object ? `Interaction of ${a.object}. ` : ""}Returns ${a.returns}. Outcomes: ok, denied, refused (the rule said no; tell the person why), error.`,
    inputSchema: actionSchema(a), annotations: a.read_only ? read(a.title || a.name) : write(a.title || a.name), action: a,
    call: async (args, ctx = {}) => {
      if (a.permit_roles.length && ctx.role && !a.permit_roles.includes(ctx.role)) return textResult(formatOutcome(a, { outcome: "denied", message: `role ${ctx.role} may not ${a.name} (allowed: ${a.permit_roles.join(", ")})` }));
      const missing = a.params.filter(p => p.required && (args[p.name] === undefined || args[p.name] === null || args[p.name] === "")).map(p => p.name);
      if (missing.length) return textResult(`error: ${a.name} needs ${missing.join(", ")}`, true);
      try {
        const result = await backend.act(a.name, args, ctx);
        return textResult(formatOutcome(a, result), result.outcome === "error");
      } catch (e) { return textResult(formatOutcome(a, { outcome: e instanceof Refused ? "refused" : "error", message: e.message }), !(e instanceof Refused)); }
    },
  });
  const scoped = !scope ? tools : tools.map(t => {
    if (Object.hasOwn(t.inputSchema.properties, scope.name)) throw new Error(`scope conflicts with parameter ${scope.name}`);
    return { ...t,
      inputSchema: { ...t.inputSchema, properties: { [scope.name]: scope.schema, ...t.inputSchema.properties }, required: [scope.name, ...(t.inputSchema.required || [])] },
      call: (args, ctx) => { const { [scope.name]: value, ...rest } = args; return t.call(rest, { ...ctx, [scope.name]: value }); }
    };
  });
  return scoped.map(t => {
    checkSchema(t.inputSchema, t.name);
    return { ...t, call: (args, ctx) => {
      const error = validateValue(t.inputSchema, args, t.action?.name || t.name);
      return error ? textResult(`error: ${error}`, true) : t.call(args, ctx);
    } };
  });
}

/* what the server tells the model at initialize: the ontology's own instructions, then the catalog in one line */
export function instructionsText(onto, extra = "") {
  const parts = [];
  if (onto.instructions) parts.push(squash(onto.instructions));
  parts.push(`Objects: ${onto.datasets.map(d => d.name).join(", ")}. Read with query; model action tools: ${onto.actions.map(a => a.tool_name || `act_${a.name}`).join(", ") || "none"}; list_objects shows the model. Other operations may be supplied by the host.`);
  if (onto.suggestions.length) parts.push(`Good first questions: ${onto.suggestions.slice(0, 4).join(" | ")}`);
  if (extra) parts.push(squash(extra));
  return parts.join("\n");
}

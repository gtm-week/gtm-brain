// The ontology: one Apache Ossie file with an ALLETHIC extension block, loaded into a typed
// in-memory model that the surface, the backends and the generators consume.
//
// Two spellings are read. Allethic's (flat: version, name, datasets, relationships with
// left_dataset/right_dataset, custom_extensions) is the primary one, because a file written
// for this package must load in Allethic's Python engine unchanged. The official Ossie shape
// (a semantic_model list, datatype, from/to/from_columns/to_columns) is accepted too.
// JSON needs nothing; YAML needs the optional "yaml" package.
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { checkSchema } from "./validation.mjs";

export const OSSIE_TYPES = ["String", "Integer", "Decimal", "Float", "Boolean", "Date", "Time", "DateTime", "DateTimeTz", "Opaque"];
export const KINDS = { STORED: "stored", MIRROR: "mirror", DYNAMIC_VIEW: "dynamic_view" };
export const VENDOR = "ALLETHIC";

/* a source is SQL (a composition) rather than a table reference; same rule as Allethic */
export const isSqlSource = s => /\n/.test(s) || /select/i.test(s);

/* a type spelling: an Ossie scalar, Opaque (any JSON), or a list of one: "String[]" or "List<String>" */
export function parseType(t) {
  const s = String(t || "String").trim();
  const m = s.match(/^(?:List<(\w+)>|(\w+)\[\])$/);
  const base = m ? (m[1] || m[2]) : s;
  if (!OSSIE_TYPES.includes(base)) throw new Error(`unknown type "${s}" (Ossie types: ${OSSIE_TYPES.join(", ")}; a list is String[] or List<String>)`);
  return { base, list: !!m };
}

/* the JSON schema a parameter or field of that type takes in a tool call */
export function jsonType(t) {
  const { base, list } = parseType(t);
  const one = base === "Integer" ? { type: "integer" } : base === "Float" || base === "Decimal" ? { type: "number" } : base === "Boolean" ? { type: "boolean" } : base === "Opaque" ? {} : { type: "string" };
  return list ? { type: "array", items: one } : one;
}

const text = v => typeof v === "string" ? v : "";
const aiText = ai => typeof ai === "string" ? ai : ai && typeof ai === "object" ? text(ai.instructions) : "";

export function parseOntology(raw, { file = "ontology" } = {}) {
  if (!raw || typeof raw !== "object") throw new Error(`${file}: not an object`);
  // official Ossie wraps everything in semantic_model: [ {...} ]; Allethic's dialect is flat
  const model = Array.isArray(raw.semantic_model) ? { version: raw.version, ...raw.semantic_model[0] } : raw;
  const ext = (model.custom_extensions || []).find(e => e && e.vendor_name === VENDOR) || {};
  const data = typeof ext.data === "string" ? JSON.parse(ext.data) : (ext.data || {});
  const schema = data.schema || "ontology";

  const datasets = (model.datasets || []).map(d => {
    if (!d || !d.name) throw new Error(`${file}: a dataset has no name`);
    const source = text(d.source);
    const fields = (d.fields || []).map(f => {
      if (!f || !f.name) throw new Error(`${file}: ${d.name}: a field has no name`);
      const type = f.data_type || f.datatype || "String";
      parseType(type);
      return { name: f.name, expression: text(f.expression) || f.name, data_type: type, description: text(f.description), ai_context: f.ai_context ?? null };
    });
    const names = new Set(fields.map(f => f.name));
    for (const k of d.primary_key || []) if (!names.has(k)) throw new Error(`${file}: ${d.name}: primary key ${k} is not a field`);
    let kind = KINDS.STORED;
    if (source.trim()) {
      kind = isSqlSource(source) ? KINDS.DYNAMIC_VIEW : KINDS.MIRROR;
      const parts = source.split(".");
      if (parts.length === 2 && parts[0] === schema && parts[1] === d.name) throw new Error(`${file}: object ${d.name} declares source ${source}, itself; remove the source line if the ontology holds these rows`);
    }
    const rls = d.rls ? { read: [...(d.rls.read || [])], write: [...(d.rls.write || [])] } : null;
    return { name: d.name, source, kind, primary_key: [...(d.primary_key || [])], description: text(d.description), ai_context: d.ai_context ?? null, fields, rls, actions: [] };
  });
  const byName = new Map(datasets.map(d => [d.name, d]));
  if (byName.size !== datasets.length) throw new Error(`${file}: two datasets share a name`);

  const relationships = (model.relationships || []).map(r => {
    const left = r.left_dataset || r.from, right = r.right_dataset || r.to;
    const rel = { name: r.name || `${left}_${right}`, left_dataset: left, left_keys: [...(r.left_keys || r.from_columns || [])], right_dataset: right, right_keys: [...(r.right_keys || r.to_columns || [])], join_type: r.join_type || "many_to_one" };
    for (const side of [left, right]) if (!byName.has(side)) throw new Error(`${file}: relationship ${rel.name} names unknown dataset ${side}`);
    if (rel.left_keys.length !== rel.right_keys.length) throw new Error(`${file}: relationship ${rel.name}: key lists differ in length`);
    return rel;
  });

  const actions = (data.actions || []).map(a => {
    if (!a || !a.name) throw new Error(`${file}: an action has no name`);
    if (!/^[a-z][a-z0-9_]*$/i.test(a.name)) throw new Error(`${file}: action name ${a.name} must be a bare identifier`);
    if (a.object && !byName.has(a.object)) throw new Error(`${file}: action ${a.name} names unknown object ${a.object}`);
    const toolName = a.tool_name || `act_${a.name}`;
    if (!/^[a-z][a-z0-9_]*$/i.test(toolName)) throw new Error(`${file}: invalid tool_name ${toolName}`);
    if (a.input_schema && a.params) throw new Error(`${file}: ${a.name}: use input_schema or params, not both`);
    const inputSchema = a.input_schema ? structuredClone(checkSchema(a.input_schema, `${file}: ${a.name}`)) : null;
    if (inputSchema && inputSchema.type !== "object") throw new Error(`${file}: ${a.name}: input_schema must have type object`);
    const params = (a.params || []).map(p => {
      if (!p || !p.name) throw new Error(`${file}: action ${a.name}: a parameter has no name`);
      parseType(p.type);
      return { name: p.name, type: p.type || "String", required: p.required !== false, description: text(p.description), enum: Array.isArray(p.enum) ? [...p.enum] : null };
    });
    const act = { name: a.name, tool_name: toolName, title: text(a.title), input_schema: inputSchema, object: a.object || null, description: text(a.description), params, returns: text(a.returns) || "Opaque", permit_roles: [...(a.permit_roles || [])], handler: text(a.handler), read_only: a.read_only === true };
    if (act.object) byName.get(act.object).actions.push(act);
    return act;
  });
  if (new Set(actions.map(a => a.name)).size !== actions.length) throw new Error(`${file}: two actions share a name`);

  const toolNames = ["list_objects", "describe_object", "query", ...actions.map(a => a.tool_name)];
  if (new Set(toolNames).size !== toolNames.length) throw new Error(`${file}: duplicate tool name`);

  const roles = new Set((data.roles || []).map(String));
  for (const d of datasets) if (d.rls) for (const r of [...d.rls.read, ...d.rls.write]) roles.add(r);
  for (const a of actions) for (const r of a.permit_roles) roles.add(r);

  return {
    raw, name: text(model.name), version: text(model.version), description: text(model.description),
    ai_context: model.ai_context ?? null, instructions: aiText(model.ai_context),
    datasets, relationships, actions, schema, roles: [...roles].sort(),
    resolution: [...(data.resolution || [])], suggestions: (data.suggestions || []).map(String),
    dataset(name) { const d = byName.get(name); if (!d) throw new Error(`unknown dataset "${name}"`); return d; },
    has(name) { return byName.has(name); },
  };
}

export async function loadOntology(path) {
  const src = readFileSync(path, "utf8"), ext = extname(path).toLowerCase();
  let raw;
  if (ext === ".yaml" || ext === ".yml") {
    let yaml; try { yaml = await import("yaml"); } catch { throw new Error(`${path} is YAML: install the "yaml" package, or write the ontology as JSON (Ossie allows both)`); }
    raw = yaml.parse(src);
  } else raw = JSON.parse(src);
  return parseOntology(raw, { file: path });
}

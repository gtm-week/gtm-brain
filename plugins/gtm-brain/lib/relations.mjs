// Relationships between entities are evidence in ordinary memories, like customer status
// (lib/customers.mjs): a `relation` block {from, type, to, status, basis, observed_at, reference?}
// on a note. "Ended" is a new note, "that was wrong" a correction, so memories.jsonl is the history,
// shared through git. The types come from SCHEMA.md (lib/schema.mjs) and are checked when a note is
// written, never when an old one is read: removing a type later leaves its notes valid.
import { recordKeys, sourceKind } from "./pointers.mjs";
import * as lib from "./brain.mjs";
import { CHAT_KINDS } from "./host.mjs";
import { readSchema, relationType, US } from "./schema.mjs";
import { customerOverview } from "./customers.mjs";

export const RELATION_STATUSES = ["current", "ended"];
const object = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k));
const nonempty = v => typeof v === "string" && !!v.trim();
const date = v => nonempty(v) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 19) === v.slice(0, 19);
const refOK = v => object(v, ["kind", "ref"]) && nonempty(v.kind) && nonempty(v.ref);
const ID = /^e_[0-9a-f]{16}$/;

/* The record's shape only. Whether the type is in SCHEMA.md is checked by the writer, at write time. */
export function validateRelationEvidence({ relation, source = [], kind = "note" }, { stored = true } = {}) {
  if (relation === undefined) return [];
  const errors = [], r = relation;
  const end = v => stored ? ID.test(v || "") : nonempty(v);
  if (!object(r, ["from", "type", "to", "status", "basis", "observed_at", "reference"]) || !end(r.from) || !(r.to === US || end(r.to)) || !/^[a-z][a-z0-9_]{0,40}$/.test(r.type || "") || !RELATION_STATUSES.includes(r.status) || !["user", "source"].includes(r.basis) || !date(r.observed_at) || (r.reference !== undefined && !refOK(r.reference)))
    errors.push(`relation needs from, type, to (an entity${stored ? " ID" : ""} or "us"), status (current | ended), basis (user | source), observed_at (ISO UTC), and optional reference {kind, ref}`);
  if (kind !== "note") errors.push("relation evidence must be a note");
  if (r?.basis === "user" && !source.some(s => s?.kind === "user" && nonempty(s.ref))) errors.push("a user-confirmed relation needs a user:<handle or conversation> source");
  if (r?.basis === "source" && !source.some(s => s && ![...CHAT_KINDS, "memory", "user"].includes(s.kind) && nonempty(s.ref))) errors.push("relation source evidence needs an external source pointer");
  return errors;
}

/* What the person said stays until the person says otherwise: a source refresh never replaces or withdraws it. */
export function guardRelationCorrection(root, context, entry) {
  const ids = [entry.supersedes, entry.retracts].filter(Boolean);
  if (!ids.length) return;
  const old = lib.readMemories(root, context).filter(m => ids.includes(m.id));
  if (old.some(m => m.relation?.basis === "user") && !((!entry.relation || entry.relation.basis === "user") && entry.source?.some(s => s.kind === "user")))
    throw new Error("A source refresh cannot replace or withdraw a relationship the person confirmed; record the source disagreement as its own note");
}

const latest = (a, b) => Date.parse(b.relation.observed_at) - Date.parse(a.relation.observed_at) || Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id);
const evidence = m => ({ id: m.id, context: m.context, at: m.at, content: m.content, sources: m.source, status: m.relation.status, basis: m.relation.basis, observed_at: m.relation.observed_at });
const end = (registry, v) => v === US ? { id: null, name: US, kind: US } : (e => e ? { id: e.id, name: e.name, kind: e.kind } : { id: v, name: v, kind: null })(lib.resolveEntity(registry, v));

/* Every relationship with its current state, the notes behind it (newest first) and the source records that
   disagree. A type no longer in SCHEMA.md is kept and marked; customer status comes from the customer notes. */
export function relationOverview(root, { registry = lib.readNames(root), contexts = lib.listContexts(root), entity = null, type = null } = {}) {
  const { schema = null } = readSchema(root);
  const memories = lib.hideForkCopies(contexts.flatMap(c => lib.effectiveMemories(c.memories))).filter(m => m.relation && !m.retracts && !m.tags?.some(t => /^(synthetic|demo)(:|$)/i.test(t)));
  const focus = entity ? lib.resolveEntity(registry, entity) : null;
  if (entity && !focus) throw new Error(`Unknown or ambiguous entity: ${entity}`);
  const grouped = new Map();
  for (const m of memories) {
    const canon = schema ? relationType(schema, m.relation.type)?.type || m.relation.type : m.relation.type;
    const from = end(registry, m.relation.from), to = end(registry, m.relation.to);
    const key = JSON.stringify([from.id || from.name, canon, to.id || to.name]);
    if (!grouped.has(key)) grouped.set(key, { from, to, type: canon, notes: [] });
    grouped.get(key).notes.push(m);
  }
  let relations = [...grouped.values()].map(({ from, to, type, notes }) => {
    notes.sort(latest);
    const user = notes.filter(m => m.relation.basis === "user").sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id))[0], chosen = user || notes[0];
    const bySource = new Map(), sourced = notes.filter(m => m.relation.basis === "source"), referenced = sourced.filter(m => m.relation.reference);
    const recordKey = new Map(recordKeys(referenced.map(m => m.relation.reference)).map((key, i) => [referenced[i], key]));
    for (const m of sourced) {
      const k = m.relation.reference ? recordKey.get(m) : [...new Set(m.source.filter(s => ![...CHAT_KINDS, "memory"].includes(s.kind)).map(sourceKind))].sort().join("|");
      if (!bySource.has(k)) bySource.set(k, m);
    }
    return { from, type, to, status: chosen.relation.status, basis: chosen.relation.basis, observed_at: chosen.relation.observed_at, recorded_at: chosen.at,
      context: chosen.context, memory: chosen.id, summary: chosen.content, in_schema: !schema || !!relationType(schema, type),
      conflicts: [...bySource.values()].filter(m => m.relation.status !== chosen.relation.status).map(evidence), history: notes.map(evidence) };
  });
  // customer status, read-only: the customer notes stay the one place it is written
  for (const c of customerOverview(root, { registry, contexts }).customers) {
    if (!["customer", "prospect", "former_customer"].includes(c.status)) continue;
    relations.push({ from: { id: c.id, name: c.name, kind: c.kind }, type: "customer_of", to: { id: null, name: US, kind: US }, status: c.status === "former_customer" ? "ended" : "current", customer_status: c.status,
      basis: c.basis, observed_at: c.observed_at, recorded_at: c.recorded_at, context: c.context, memory: c.memory, summary: c.summary, in_schema: true, conflicts: c.conflicts, history: c.history });
  }
  if (focus) relations = relations.filter(r => r.from.id === focus.id || r.to.id === focus.id);
  if (type) { const t = schema ? relationType(schema, type)?.type || type : type; relations = relations.filter(r => r.type === t); }
  relations.sort((a, b) => a.from.name.localeCompare(b.from.name) || a.type.localeCompare(b.type) || a.to.name.localeCompare(b.to.name));
  return { relations, schema_error: readSchema(root).error?.message || null,
    notice: "Each relationship is the latest note the person confirmed, else the latest observed; ended ones stay with their dates. Dates describe recorded evidence, not a live check." };
}

/* One line per relationship, for query relations. */
export function relationsText(overview) {
  if (!overview.relations.length) return `relations: none recorded yet.${overview.schema_error ? ` SCHEMA.md cannot be read: ${overview.schema_error}` : ""}`;
  const line = r => `${r.from.name} ${r.type}${r.customer_status ? ` (${r.customer_status})` : ""} ${r.to.name}: ${r.status}, ${r.basis}, observed ${String(r.observed_at).slice(0, 10)} (${r.memory} in ${r.context})${r.in_schema ? "" : " [type not in SCHEMA.md]"}${r.conflicts.length ? `; ${r.conflicts.length} source record(s) disagree` : ""}${r.history.length > 1 ? `; history: ${r.history.map(h => `${h.status} ${String(h.observed_at).slice(0, 10)}`).join(", ")}` : ""}`;
  return [`relations (${overview.relations.length}):`, ...overview.relations.map(r => `  ${line(r)}`), overview.notice, ...(overview.schema_error ? [`SCHEMA.md cannot be read: ${overview.schema_error}`] : [])].join("\n");
}

// "Relation to us" for every person and organization, derived from links already recorded, never stored:
//   team       our own company, the admin.md team, a current works_at us (or our own company's entity)
//   customer   the customer block says customer (lib/customers.mjs)
//   partner    a current partner_of us
//   investor   a current investor_in us
//   prospect   the customer block says prospect
//   other      none of these
// A person with none of their own takes their current employer's (works_at): someone at a customer is
// "customer". The latest note the person confirmed wins, else the latest observed, as in relationOverview.
import { readSchema, relationType, US } from "./schema.mjs";

export const RELATIONS_TO_US = ["team", "customer", "partner", "investor", "prospect", "other"];
const RANK = new Map(RELATIONS_TO_US.map((r, i) => [r, i]));
const better = (a, b) => (a === undefined ? b : b === undefined ? a : RANK.get(a) <= RANK.get(b) ? a : b);
const fold = s => String(s || "").trim().toLowerCase();
const synthetic = m => m.tags?.some(t => /^(synthetic|demo)(:|$)/i.test(t));
const pick = (notes, block, when) => {
  const user = notes.filter(m => m[block].basis === "user").sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id))[0];
  return user || [...notes].sort((a, b) => Date.parse(b[block][when]) - Date.parse(a[block][when]) || Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id))[0];
};

/* registry: lib.readNames; memories: current notes (effective, not withdrawn) with a relation or customer block;
   admin: lib.readAdmin; schema: readSchema(root).schema or null. Returns Map id -> relation to us. */
export function relationsToUs({ registry, memories, admin = null, schema = null }) {
  const byRef = new Map();
  for (const e of registry) for (const id of [e.id, ...(e.previous_ids || [])]) byRef.set(id, e);
  const resolve = v => byRef.get(v) || null;
  const company = fold(admin?.company);
  const ours = company ? registry.find(e => e.kind === "organization" && [e.name, ...(e.aliases || [])].some(n => fold(n) === company)) : null;
  const toUs = v => v === US || (ours && resolve(v)?.id === ours.id);
  const out = new Map();
  const set = (id, value) => out.set(id, better(out.get(id), value));
  // the team in admin.md, by name, email or handle
  const team = new Set((Array.isArray(admin?.team) ? admin.team : []).flatMap(p => [p?.name, p?.email, p?.handle].filter(Boolean).map(fold)));
  for (const e of registry) if (e.kind === "person" && [e.name, ...(e.aliases || []), ...(e.emails || [])].some(n => team.has(fold(n)))) set(e.id, "team");
  if (ours) set(ours.id, "team");
  const notes = memories.filter(m => !m.retracts && !synthetic(m));
  // relations: the chosen note per (from, type, to), current ones only
  const groups = new Map();
  for (const m of notes.filter(m => m.relation)) {
    const type = (schema && relationType(schema, m.relation.type)?.type) || m.relation.type;
    const from = resolve(m.relation.from); if (!from) continue;
    const to = toUs(m.relation.to) ? US : resolve(m.relation.to)?.id; if (!to) continue;
    const key = JSON.stringify([from.id, type, to]);
    if (!groups.has(key)) groups.set(key, { from: from.id, type, to, notes: [] });
    groups.get(key).notes.push(m);
  }
  const employers = new Map();
  for (const g of groups.values()) {
    if (pick(g.notes, "relation", "observed_at").relation.status !== "current") continue;
    if (g.type === "works_at" && g.to === US) set(g.from, "team");
    else if (g.type === "works_at") { if (!employers.has(g.from)) employers.set(g.from, []); employers.get(g.from).push(g.to); }
    else if (g.type === "partner_of" && g.to === US) set(g.from, "partner");
    else if (g.type === "investor_in" && g.to === US) set(g.from, "investor");
  }
  // the customer block
  const customers = new Map();
  for (const m of notes.filter(m => m.customer)) { const e = resolve(m.customer.entity) || registry.find(x => fold(x.name) === fold(m.customer.entity)); if (!e) continue; if (!customers.has(e.id)) customers.set(e.id, []); customers.get(e.id).push(m); }
  for (const [id, list] of customers) { const s = pick(list, "customer", "observed_at").customer.status; if (s === "customer" || s === "prospect") set(id, s); }
  // a person without a relation of their own takes their employer's
  for (const [person, orgs] of employers) if (!out.has(person)) for (const org of orgs) { const r = out.get(org); if (r && r !== "other") set(person, r); }
  for (const e of registry) if (["person", "organization"].includes(e.kind) && !out.has(e.id)) out.set(e.id, "other");
  return out;
}

/* The same from a brain's files: every current note read through the contexts. */
export function brainRelationsToUs(root, lib, { registry = lib.readNames(root), contexts = lib.listContexts(root) } = {}) {
  const memories = lib.hideForkCopies(contexts.flatMap(c => lib.effectiveMemories(c.memories))).filter(m => m.relation || m.customer);
  return relationsToUs({ registry, memories, admin: lib.readAdmin(root), schema: readSchema(root).schema || null });
}

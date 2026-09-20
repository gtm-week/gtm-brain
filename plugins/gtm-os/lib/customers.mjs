// Customer relationships and search coverage are evidence in ordinary memories.
// This module only validates and projects them; remember remains the writer.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as lib from "./brain.mjs";

export const CUSTOMER_STATUSES = ["customer", "prospect", "former_customer", "not_customer", "unknown"];
const object = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k));
const nonempty = v => typeof v === "string" && !!v.trim();
const date = v => nonempty(v) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,19) === v.slice(0,19);
const refOK = v => object(v, ["kind", "ref"]) && nonempty(v.kind) && nonempty(v.ref);
const sameRef = (a, b) => a.kind === b.kind && a.ref === b.ref;

export function validateCustomerEvidence({ customer, customer_coverage, source = [], kind = "note" }) {
  const errors = [];
  if (customer !== undefined) {
    if (!object(customer, ["entity", "status", "basis", "observed_at", "reference"]) || !nonempty(customer.entity) || !CUSTOMER_STATUSES.includes(customer.status) || !["user", "source"].includes(customer.basis) || !date(customer.observed_at) || (customer.reference !== undefined && !refOK(customer.reference))) errors.push("customer needs entity, status, basis (user | source), observed_at (ISO UTC), and optional reference {kind, ref}");
    if (kind !== "note") errors.push("customer evidence must be a note");
    if (customer?.basis === "user" && !source.some(s => s?.kind === "user" && nonempty(s.ref))) errors.push("user-confirmed customer evidence needs a user:<handle or conversation> source");
    if (customer?.basis === "source" && !source.some(s => s && !["codex", "memory", "user"].includes(s.kind) && nonempty(s.ref))) errors.push("customer source evidence needs an external source pointer");
  }
  if (customer_coverage !== undefined) {
    const c = customer_coverage;
    if (!object(c, ["tool", "scope", "status", "checked_at", "scanned", "total", "unresolved"]) || !nonempty(c.tool) || !nonempty(c.scope) || !["complete", "partial", "unavailable"].includes(c.status) || !date(c.checked_at) || !Number.isSafeInteger(c.scanned) || c.scanned < 0 || !Number.isSafeInteger(c.unresolved) || c.unresolved < 0 || !(c.total === null || (Number.isSafeInteger(c.total) && c.total >= c.scanned))) errors.push("customer_coverage needs tool, scope, status, checked_at, scanned, total (number or null), and unresolved counts");
    else if (c.unresolved > c.scanned) errors.push("unresolved entries cannot exceed scanned source records");
    else if (c.status === "complete" && (c.unresolved || c.total !== c.scanned)) errors.push("complete coverage requires a known total, every record scanned, and no unresolved entries");
    if (!source.length) errors.push("customer coverage needs a source pointer");
    if (kind !== "note") errors.push("customer coverage must be a note");
  }
  return errors;
}

// Only a unique stable source record establishes identity across imports. A failed
// search or a similar spelling never authorizes an identity merge.
export function customerIdentity(root, customer) {
  const registry = lib.readNames(root), reference = customer.reference;
  const linked = reference ? registry.filter(e => e.references?.some(r => sameRef(r, reference))) : [];
  if (linked.length > 1) throw new Error("Customer source record is linked to multiple identities; resolve it before importing");
  const named = lib.resolveEntity(registry, customer.entity);
  if (linked.length && named && linked[0].id !== named.id) throw new Error("Customer name and source record resolve to different identities; ask the person to resolve them");
  if (!linked.length && named && reference && named.references?.some(r => r.kind === reference.kind && r.ref !== reference.ref) && customer.entity !== named.id) throw new Error("Customer name already has a different source record; resolve the identity using its stable ID before importing");
  return linked[0]?.name || named?.name || customer.entity;
}

export function guardCustomerCorrection(root, context, entry) {
  const ids = [entry.supersedes, entry.retracts].filter(Boolean);
  if (!ids.length) return;
  const old = lib.readMemories(root, context).filter(m => ids.includes(m.id));
  if (old.some(m => m.customer?.basis === "user") && !((!entry.customer || entry.customer.basis === "user") && entry.source?.some(s => s.kind === "user"))) throw new Error("A source refresh cannot replace or withdraw a user-confirmed customer relationship; record the source disagreement separately");
}

const evidence = m => ({ id: m.id, context: m.context, at: m.at, content: m.content, sources: m.source, ...m.customer });
const latest = (a, b) => Date.parse(b.customer?.observed_at || b.customer_coverage?.checked_at || b.at) - Date.parse(a.customer?.observed_at || a.customer_coverage?.checked_at || a.at) || Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id);
const uniqueRefs = refs => [...new Map(refs.map(r => [JSON.stringify([r.kind, r.ref]), r])).values()];

export function customerOverview(root, { registry = lib.readNames(root), contexts = lib.listContexts(root) } = {}) {
  const memories = lib.hideForkCopies(contexts.flatMap(c => lib.effectiveMemories(c.memories))).filter(m => !m.retracts && !m.tags?.some(t => /^(synthetic|demo)(:|$)/i.test(t)));
  const grouped = new Map(), unresolved = [];
  for (const m of memories.filter(m => m.customer)) {
    const e = lib.resolveEntity(registry, m.customer.entity);
    if (!e) { unresolved.push(evidence(m)); continue; }
    if (!grouped.has(e.id)) grouped.set(e.id, { identity: e, notes: [] });
    grouped.get(e.id).notes.push(m);
  }
  const customers = [...grouped.values()].map(({ identity: e, notes }) => {
    notes.sort(latest);
    const user = notes.filter(m => m.customer.basis === "user").sort((a,b) => Date.parse(b.at)-Date.parse(a.at) || b.id.localeCompare(a.id))[0], chosen = user || notes[0];
    // Retain the latest observation from each source record (or source kind).
    const bySource = new Map();
    for (const m of notes.filter(m => m.customer.basis === "source")) {
      const key = m.customer.reference ? JSON.stringify(m.customer.reference) : [...new Set(m.source.filter(s => !["codex", "memory"].includes(s.kind)).map(s => s.kind))].sort().join("|");
      if (!bySource.has(key)) bySource.set(key, m);
    }
    const conflicts = [...bySource.values()].filter(m => m.customer.status !== chosen.customer.status);
    const refs = uniqueRefs([...(e.references || []), ...notes.flatMap(m => [...(m.customer.reference ? [m.customer.reference] : []), ...m.source.filter(s => !["codex", "memory", "user"].includes(s.kind))])]);
    return { id: e.id, name: e.name, kind: e.kind, status: chosen.customer.status, basis: chosen.customer.basis, observed_at: chosen.customer.observed_at, recorded_at: chosen.at,
      context: chosen.context, memory: chosen.id, summary: chosen.content, references: refs, conflicts: conflicts.map(evidence), history: notes.map(evidence) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const seen = new Set(), coverage = memories.filter(m => m.customer_coverage).sort(latest).filter(m => {
    const c = m.customer_coverage, key = JSON.stringify([lib.toolKey(c.tool), c.scope]);
    if (seen.has(key)) return false; seen.add(key); return true;
  }).map(m => ({ ...m.customer_coverage, memory: m.id, sources: m.source, note: m.content }));
  return { customers, coverage, unresolved, suggestions: customerSearchSuggestions(root, coverage),
    notice: "Coverage applies only to the named lists and searches. Missing from the CRM does not mean not a customer. Dates describe recorded evidence, not a live verification." };
}

export function customerSearchSuggestions(root, coverage = []) {
  const file = join(root, "work", "tools.json");
  let states = {}; if (existsSync(file)) { try { states = JSON.parse(readFileSync(file, "utf8")); } catch { return []; } }
  const suggestions = [];
  const patterns = [
    [/crm|attio|hubspot|salesforce|pipedrive/i, "customer list and explicit lifecycle classifications", "customer records, including quiet accounts"],
    [/gmail|outlook|email|mail/i, "customer onboarding, purchase confirmations and ongoing service threads", "customers missing from the CRM; an email exchange alone does not establish customer status"],
    [/calendar/i, "kickoffs and recurring account reviews", "people to investigate; attendance alone does not establish customer status"],
    [/granola|pocket|meeting|transcript|fireflies|otter/i, "meeting notes about purchases, delivery and customer roles", "relationship evidence and corrections"],
    [/stripe|billing|invoice|chargebee|paddle|quickbooks|xero/i, "paid invoices and subscriptions", "payment evidence interpreted in the business's context"],
    [/drive|sheets|notion|document|sharepoint|airtable/i, "the customer tracker, community roster or contract register the person names", "an explicit list that may be absent from the CRM"],
  ];
  for (const [key, s] of Object.entries(states)) {
    if (!s || s.status !== "installed" || s.declined || s.test !== "ok") continue;
    const tool = s.tool || key, match = patterns.find(([re]) => re.test(tool));
    if (!match) continue;
    suggestions.push({ tool, look_in: match[1], reason: match[2], checked_scopes: coverage.filter(c => lib.toolKey(c.tool) === lib.toolKey(tool)).map(c => c.scope) });
  }
  return suggestions;
}

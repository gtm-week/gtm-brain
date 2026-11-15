// Relationship history as a log (ALL-711). A relation is a record with a stable id, r_ plus a hash of its two
// ends (stable entity ids, or "us") and its type; every note that carries a relation block for those ends and
// that type is an event of it: started, changed (said again while current, or a new customer status), ended.
// Nothing is stored beyond the notes: the record is derived, so the format GTM Brain 0.34 reads is unchanged.
// One at a time (SCHEMA.md's column, lib/schema.mjs): a new current link of such a type from the same entity
// ends the one before it. The save writes that ended note (endPreviousRelations); a log without one (a teammate
// on 0.34 saved it) gets the end when read, marked implied. The person's word wins over a source: when anyone
// said it in the chat, only those notes set the state, and a source that disagrees is listed, never applied.
// The memory index fills its relations tables from buildRelationLog (lib/memory-index.mjs), query relations
// reads them (relationsAnswer), and each entity page shows the same events under ## History (lib/entities.mjs).
import { createHash } from "node:crypto";
import { relationType, US } from "./schema.mjs";
import { CHAT_KINDS } from "./host.mjs";
import { entityEventText } from "./entity-events.mjs";

export const relationId = (from, type, to) => "r_" + createHash("sha256").update(`${from}|${type}|${to}`).digest("hex").slice(0, 12);
// the words that say a link is over: "Anna left Northwind", "no longer our partner", "churned in October"
export const ENDED_WORDS = /\b(left|no longer|churned|ended)\b/i;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const synthetic = m => m.tags?.some(t => /^(synthetic|demo)(:|$)/i.test(t));
const time = v => Date.parse(v) || 0;
const day = v => String(v || "").slice(0, 10);

/* A save needs only {from, type, to}; the rest comes from the note. status: ended when its words say so, else
   current. observed_at: the note's time (a date alone is taken as that day). basis: source when the note cites a
   record outside the chat, else user, and then the author is its user source. What the caller passed is kept. */
export function completeRelation(relation, { content = "", sources = [], author = null, at = new Date().toISOString() } = {}) {
  if (!relation || typeof relation !== "object" || Array.isArray(relation)) return { relation, sources, filled: [] };
  const r = { ...relation }, filled = [];
  if (r.status === undefined || r.status === null || r.status === "") { r.status = ENDED_WORDS.test(content) ? "ended" : "current"; filled.push("status"); }
  if (typeof r.observed_at === "string" && /^\d{4}-\d\d-\d\d$/.test(r.observed_at.trim())) r.observed_at = `${r.observed_at.trim()}T00:00:00Z`;
  if (r.observed_at === undefined || r.observed_at === null || r.observed_at === "") { r.observed_at = at; filled.push("observed_at"); }
  const external = sources.some(s => s && s.ref && ![...CHAT_KINDS, "memory", "user"].includes(s.kind));
  if (r.basis === undefined || r.basis === null || r.basis === "") { r.basis = external ? "source" : "user"; filled.push("basis"); }
  const needsUser = r.basis === "user" && author && !sources.some(s => s?.kind === "user" && s.ref);
  return { relation: r, sources: needsUser ? [...sources, { kind: "user", ref: author }] : sources, filled };
}

const eventOf = (m, extra = {}) => ({ memory: m.id, context: m.context, at: m.relation?.observed_at || m.customer?.observed_at, recorded_at: m.at, status: m.relation?.status, basis: m.relation?.basis || m.customer?.basis, content: m.content, ...extra });
const order = (a, b) => time(a.at) - time(b.at) || time(a.recorded_at) - time(b.recorded_at) || String(a.memory).localeCompare(String(b.memory));
/* started, changed, ended over the notes that set the state; the others are listed as disputed */
function label(rel) {
  let state = null;
  for (const e of rel.events) {
    if (e.disputed) { e.event = "disputed"; continue; }
    e.event = e.status === "ended" ? "ended" : state === "current" ? "changed" : "started";
    state = e.status;
  }
  const set = rel.events.filter(e => !e.disputed), last = set.at(-1);
  rel.status = last?.status || null; rel.basis = last?.basis || null; rel.observed_at = last?.at || null;
  rel.memory = last?.memory || null; rel.context = last?.context || null; rel.summary = last?.content || "";
  if (last?.customer_status) rel.customer_status = last.customer_status;
  const starts = set.filter(e => e.event === "started");
  rel.since = starts.at(-1)?.at || null;
  rel.until = rel.status === "ended" ? last.at : null;
  rel.conflicts = rel.events.filter(e => e.disputed && e.status !== rel.status);
}
/* current, ended or null (not yet) on a date or time; a date alone means the end of that day */
export function statusAt(rel, at) {
  const t = /^\d{4}-\d\d-\d\d$/.test(String(at || "").trim()) ? time(`${String(at).trim()}T23:59:59.999Z`) : time(at);
  let state = null;
  for (const e of rel.events) if (!e.disputed && time(e.at) <= t) state = e.status;
  return state;
}

/* notes: the current notes (effective, not withdrawn) with a relation, customer or meeting block.
   resolve(ref) -> {id, kind} of the entity now (a retired id names its survivor) or null; meetingOf(anchor) -> the
   meeting entity's id or null; schema: the parsed SCHEMA.md or null. Returns {relations}, sorted by from, type, to. */
export function buildRelationLog(notes, { resolve = v => ({ id: v, kind: null }), meetingOf = () => null, anchorOf = () => null, schema = null } = {}) {
  const groups = new Map();
  const add = (from, type, to, event, extra = {}) => {
    const id = relationId(from, type, to);
    if (!groups.has(id)) groups.set(id, { id, from, type, to, events: [], in_schema: !schema || !!relationType(schema, type) || type === "attended", ...extra });
    groups.get(id).events.push(event);
  };
  const live = notes.filter(m => m && !m.retracts && !synthetic(m));
  for (const m of live) {
    if (m.relation) {
      const type = (schema && relationType(schema, m.relation.type)?.type) || m.relation.type;
      const from = resolve(m.relation.from)?.id, to = m.relation.to === US ? US : resolve(m.relation.to)?.id;
      if (!from || !to || !ISO.test(m.relation.observed_at || "")) continue;
      add(from, type, to, eventOf(m));
    }
    if (m.customer) {
      const s = m.customer.status, status = s === "customer" || s === "prospect" ? "current" : s === "former_customer" ? "ended" : null;
      const from = resolve(m.customer.entity)?.id;
      if (status && from) add(from, "customer_of", US, eventOf(m, { status, customer_status: s }), { in_schema: true });
    }
  }
  // attended, from the meeting records: the latest one per meeting (the person's word first), when it happened
  const meetings = new Map();
  for (const m of live.filter(m => m.meeting)) { const a = anchorOf(m); if (!a) continue; if (!meetings.has(a)) meetings.set(a, []); meetings.get(a).push(m); }
  for (const [anchor, records] of meetings) {
    const meeting = meetingOf(anchor); if (!meeting) continue;
    const chosen = records.sort((a, b) => (b.meeting.basis === "user") - (a.meeting.basis === "user") || time(b.meeting.observed_at) - time(a.meeting.observed_at) || time(b.at) - time(a.at))[0];
    if (chosen.meeting.occurrence !== "happened") continue;
    const when = chosen.meeting.occurred_at ? (/^\d{4}-\d\d-\d\d$/.test(chosen.meeting.occurred_at) ? `${chosen.meeting.occurred_at}T00:00:00Z` : chosen.meeting.occurred_at) : chosen.meeting.observed_at;
    for (const p of chosen.meeting.participants.filter(p => p.role === "attended")) {
      const person = resolve(p.name); if (!person || person.kind !== "person") continue;
      add(person.id, "attended", meeting, { memory: chosen.id, context: chosen.context, at: when, recorded_at: chosen.at, status: "current", basis: chosen.meeting.basis, content: chosen.meeting.title }, { in_schema: true, from_meeting: true });
    }
  }
  const relations = [...groups.values()];
  for (const rel of relations) {
    rel.events.sort(order);
    // the person's word sets the state when there is any; a source that says otherwise is listed beside it
    if (rel.events.some(e => e.basis === "user")) for (const e of rel.events) if (e.basis !== "user") e.disputed = true;
    label(rel);
  }
  // one at a time: a later start from the same entity ends an earlier link of that type still current then
  const one = type => type === "customer_of" ? false : schema ? !!relationType(schema, type)?.one : ["works_at", "reports_to"].includes(type);
  const byFrom = new Map();
  for (const rel of relations.filter(r => one(r.type))) { const k = `${rel.from}|${rel.type}`; if (!byFrom.has(k)) byFrom.set(k, []); byFrom.get(k).push(rel); }
  for (const list of byFrom.values()) {
    if (list.length < 2) continue;
    const starts = list.flatMap(rel => rel.events.filter(e => e.event === "started").map(e => ({ rel, e }))).sort((a, b) => order(a.e, b.e));
    for (const { rel: next, e: start } of starts) for (const prev of list) {
      if (prev === next) continue;
      const before = prev.events.filter(e => !e.disputed && order(e, start) < 0);
      if (before.at(-1)?.status !== "current" || time(before.at(-1).at) >= time(start.at)) continue;
      // a source never ends what the person said
      if (before.at(-1).basis === "user" && start.basis !== "user") continue;
      const after = prev.events.filter(e => !e.disputed && order(e, start) >= 0);
      if (after[0]?.status === "ended" && time(after[0].at) === time(start.at)) continue;   // the save already wrote it
      prev.events.push({ memory: start.memory, context: start.context, at: start.at, recorded_at: start.recorded_at, status: "ended", basis: start.basis, content: start.content, implied: true });
      prev.events.sort(order); label(prev);
    }
  }
  relations.sort((a, b) => a.from.localeCompare(b.from) || a.type.localeCompare(b.type) || a.to.localeCompare(b.to));
  return { relations };
}

/* What the save does for a one-at-a-time type: the current links from the same entity to another end, each to be
   ended by a new note dated to the new one. relations: buildRelationLog over the brain's notes; rec: the note
   just written (its relation block with stable ids). A source does not end what the person said. */
export function relationsToEnd(relations, rec, schema) {
  const r = rec?.relation; if (!r || r.status !== "current") return [];
  const type = (schema && relationType(schema, r.type)?.type) || r.type;
  if (!(schema ? relationType(schema, type)?.one : ["works_at", "reports_to"].includes(type)) || type === "customer_of") return [];
  return relations.filter(x => x.from === r.from && x.type === type && x.to !== r.to && x.status === "current" && time(x.observed_at) <= time(r.observed_at) && !(x.basis === "user" && r.basis !== "user"));
}

/* query relations, from the index: one line per relationship (current and ended, or the ones current on a date),
   and for an entity its history: relation events and renames, merges and kind changes, newest first. */
export function relationsAnswer(index, { search = "", type = null, at = null, limit = null } = {}) {
  const names = index.entries;
  if (at && !Number.isFinite(Date.parse(String(at).trim()))) throw new Error(`filters.at must be a date such as 2026-06-01 (it says "${at}")`);
  let focus = null;
  if (search && String(search).trim()) {
    focus = index.resolveEntity(String(search).trim());
    if (!focus) throw new Error(`Unknown or ambiguous entity: ${search}`);
  }
  const nameOf = id => id === US ? US : names.find(e => e.id === id)?.name || id;
  let rows = index.relations({ ...(focus ? { entity: focus.id } : {}), ...(type ? { type: String(type) } : {}) });
  if (at) rows = rows.filter(r => statusAt(r, at) === "current");
  const total = rows.length;
  if (limit) rows = rows.slice(0, Math.max(1, Number(limit) || 1));
  const history = rel => rel.events.filter(e => !e.disputed).map(e => `${e.status} ${day(e.at)} ${e.memory}${e.implied ? " (implied by a later one)" : ""}`).join(", ");
  const line = r => `${nameOf(r.from)} ${r.type}${r.customer_status ? ` (${r.customer_status})` : ""} ${nameOf(r.to)}: ${at ? `current on ${day(at)}` : r.status}, ${r.basis}, observed ${day(r.observed_at)} (${r.memory} in ${r.context})${r.in_schema ? "" : " [type not in SCHEMA.md]"}${r.conflicts.length ? `; ${r.conflicts.length} source record(s) disagree` : ""}${r.events.filter(e => !e.disputed).length > 1 ? `; history: ${history(r)}` : ""}`;
  const out = [!rows.length ? `relations${at ? ` current on ${day(at)}` : ""}: none recorded${focus ? ` for ${focus.name}` : ""}${type ? ` of type ${type}` : ""}.` : `relations${at ? ` current on ${day(at)}` : ""} (${total}${rows.length < total ? `, the first ${rows.length}` : ""}):`, ...rows.map(r => `  ${line(r)}`)];
  if (focus) {
    const own = index.relations({ entity: focus.id, ...(type ? { type: String(type) } : {}) }), ev = index.entityEvents(focus.id);
    const items = [
      ...own.flatMap(r => r.events.filter(e => !e.disputed).map(e => ({ at: e.at, text: `${nameOf(r.from)} ${r.type} ${nameOf(r.to)} ${e.event}${e.implied ? " (a later one of this type)" : ""} (${e.memory})` }))),
      ...ev.map(e => ({ at: e.at, text: entityEventText(e) })),
    ].filter(x => !at || time(x.at) <= statusTime(at)).sort((a, b) => time(b.at) - time(a.at));
    if (items.length) out.push(`History of ${focus.name}, newest first:`, ...items.slice(0, 40).map(x => `    - ${day(x.at)} ${x.text}`), ...(items.length > 40 ? [`    (${items.length - 40} earlier events not shown)`] : []));
  }
  out.push("Each relationship is the latest note the person confirmed, else the latest observed; ended ones stay with their dates. Dates describe recorded evidence, not a live check.");
  return out.join("\n");
}
const statusTime = at => /^\d{4}-\d\d-\d\d$/.test(String(at).trim()) ? time(`${String(at).trim()}T23:59:59.999Z`) : time(at);

/* The History section of an entity page: the same events, newest first, with the page's own citation links. */
export function historyLines(relations, identityEvents, { nameOf, citation = () => "", words = s => s, md = s => s } = {}) {
  const items = [
    ...relations.flatMap(r => r.events.filter(e => !e.disputed).map(e => ({ at: e.at, text: `${md(nameOf(r.from))} ${md(words(r.type))} ${md(nameOf(r.to))}: ${e.event}${e.implied ? " (a later one of this type)" : ""}${e.customer_status && r.type === "customer_of" ? ` (${md(words(e.customer_status))})` : ""} (${e.basis === "user" ? "said by the person" : "from a source"})`, cite: e.memory }))),
    ...identityEvents.map(e => ({ at: e.at, text: md(entityEventText(e)) })),
  ].sort((a, b) => time(b.at) - time(a.at));
  return items.map(x => `- ${day(x.at)}: ${x.text}${x.cite ? ` ${citation(x.cite)}` : ""}`);
}

// Workflow triggers, events, needs, the check and the people's view (0.35.0). Reads only: the writer is
// scripts/gtm-brain-workflow/workflow.mjs. Events are not stored anywhere new: they are read from what the write
// path already records (a note's entities, a note's relation block, an entity's compiled fields), so a teammate's
// save that arrives through git is an event on every machine, and the run's first note (tag event:<id>) is the
// one record that says an event was taken.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as lib from "./brain.mjs";
import { readSchema, relationType, fieldsFor, brainKinds } from "./schema.mjs";
import { readDocument } from "./documents.mjs";
import { LIMITS, WEEKDAYS, listWorkflows, listRuns, isLive, localDate, addDays, parseItem, itemText, triggerText, milestoneText, workflowsOff } from "./workflows.mjs";

const DAY = 864e5;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const hash = s => createHash("sha256").update(String(s)).digest("hex").slice(0, 10);

/* ---------- tool categories: a step's (tool: crm) mapped to what admin.md declares ---------- */
export const CATEGORIES = {
  crm: /hubspot|attio|salesforce|pipedrive|close\b|folk|crm/i,
  email: /gmail|outlook|e-?mail|mail\b|superhuman/i,
  calendar: /calendar|cal\.com|calendly/i,
  sequencer: /lemlist|apollo|outreach|instantly|smartlead|salesloft|reply\.io|sequencer|mailchimp|klaviyo/i,
  ads: /\bads\b|linkedin|meta\b|facebook|google ads/i,
  analytics: /analytics|posthog|amplitude|mixpanel|plausible|hex\b/i,
  meetings: /granola|fireflies|fathom|otter|wispr|gong|meet\b/i,
  enrichment: /clay|apollo|happenstance|clearbit|enrich|zoominfo/i,
  slack: /slack/i,
  docs: /notion|drive|docs\b|confluence/i,
  web: /vercel|github|webflow|wordpress|framer/i,
  events: /luma|eventbrite|lu\.ma/i,
};
export const declaredTools = root => (lib.readAdmin(root)?.tools || []).map(t => typeof t === "string" ? t : t?.name || "").filter(Boolean);
export const toolsFor = (root, category) => CATEGORIES[category] ? declaredTools(root).filter(t => CATEGORIES[category].test(t)) : [];

/* ---------- skills and their needs ---------- */
const PLUGIN_SKILLS = new URL("../skills/", import.meta.url).pathname;
const skillDirs = root => [join(root, ".agents", "skills"), PLUGIN_SKILLS];
/* A skill by its name (gtm-brain-define-icp, or define-icp): the brain's own first, then the shipped ones. */
export function findSkill(root, name) {
  const n = String(name || "").trim().toLowerCase(); if (!n) return null;
  for (const dir of skillDirs(root)) for (const id of [n, `gtm-brain-${n}`]) {
    const path = join(dir, id, "SKILL.md");
    if (existsSync(path)) { const text = readFileSync(path, "utf8"); return { id, path, needs: skillNeeds(text), shipped: dir === PLUGIN_SKILLS }; }
  }
  return null;
}
/* A skill's needs: one line in its frontmatter metadata, the same items as a workflow header:
     metadata:
       needs: "kind:organization, field:organization.industry, tool:crm"
   Codex reads metadata as plain strings, so the declaration never changes how the skill loads. */
export function skillNeeds(text) {
  const fm = String(text || "").match(/^---\n([\s\S]*?)\n---/); if (!fm) return [];
  const line = fm[1].match(/^\s*needs:\s*(.+)$/m); if (!line) return [];
  let v = line[1].trim(); if (/^".*"$/.test(v)) { try { v = JSON.parse(v); } catch {} }
  return v.replace(/^\[|\]$/g, "").split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean).map(parseItem);
}

/* What a list of items needs that this brain does not have: one entry per missing item, each with its fix.
   Kinds, links and fields come from SCHEMA.md; tool categories from admin.md's tools. Changes nothing. */
export function compareNeeds(root, items) {
  const read = readSchema(root), schema = read.schema || null, kinds = brainKinds(root), missing = [], have = [];
  for (const i of items) {
    if (i.type === "invalid") { missing.push({ item: i.text, why: "not kind:, link:, field: or tool:", fix: "write it as kind:<kind>, link:<type>, field:<kind>.<field> or tool:<category>" }); continue; }
    if (i.type === "kind") { (kinds.includes(i.kind) ? have : missing).push({ item: itemText(i), why: `SCHEMA.md has no kind ${i.kind}`, fix: `add a ## ${i.kind[0].toUpperCase()}${i.kind.slice(1)} section with a field table` }); continue; }
    if (i.type === "link") {
      const r = schema ? relationType(schema, i.link) : null;
      if (r && r.type !== i.link) missing.push({ item: itemText(i), why: `${i.link} was renamed to ${r.type} in SCHEMA.md`, fix: `write link:${r.type}`, renamed: r.type });
      else (r ? have : missing).push({ item: itemText(i), why: read.error ? "SCHEMA.md cannot be read" : `SCHEMA.md has no relationship ${i.link}`, fix: `add | ${i.link} | <from> | <to> | <what it means> | no | to ## Relationships` });
      continue;
    }
    if (i.type === "field") {
      if (!kinds.includes(i.kind)) { missing.push({ item: itemText(i), why: `SCHEMA.md has no kind ${i.kind}`, fix: `add a ## ${i.kind[0].toUpperCase()}${i.kind.slice(1)} section with a ${i.field} row` }); continue; }
      const all = schema ? [...fieldsFor(schema, i.kind), ...Object.values(schema.kinds[i.kind]?.subtypes || {}).flatMap(s => s.fields || [])] : [];
      (all.some(f => f.name === i.field) ? have : missing).push({ item: itemText(i), why: read.error ? "SCHEMA.md cannot be read" : `SCHEMA.md has no field ${i.field} under ${i.kind}`, fix: `add | ${i.field} | <what it means> | no | under ## ${i.kind[0].toUpperCase()}${i.kind.slice(1)}` });
      continue;
    }
    if (i.type === "tool") {
      if (!CATEGORIES[i.tool]) { missing.push({ item: itemText(i), why: `${i.tool} is not a tool category (${Object.keys(CATEGORIES).join(", ")})`, fix: "use one of the categories", tool: true }); continue; }
      const t = toolsFor(root, i.tool);
      (t.length ? have : missing).push({ item: itemText(i), why: `no ${i.tool} tool in admin.md`, fix: `connect one (check_tools; the workplace-change path adds it to admin.md)`, tool: true, using: t });
    }
  }
  return { missing, have };
}
/* The one proposal a person reads before switching something on. */
export function needsProposal(name, { missing }) {
  if (!missing.length) return `${name}: everything it needs is in SCHEMA.md and admin.md.`;
  const schema = missing.filter(m => !m.tool), tools = missing.filter(m => m.tool);
  return [`${name} needs ${plural(missing.length, "thing")} this brain does not have yet:`, ...missing.map(m => `- ${m.item}: ${m.why}; ${m.fix}`),
    ...(schema.length ? ["Schema items change only through /gtm-brain-schema with the person's yes; nothing was changed."] : []),
    ...(tools.length ? ["A missing tool does not block a step: the person can do it in the tool and report it."] : [])].join("\n");
}

/* ---------- what a workflow names ---------- */
export function workflowItems(w) {
  const out = [...(w.header?.reads || []), ...(w.header?.writes || [])], t = w.header?.trigger;
  if (t?.kind === "note") out.push({ type: "kind", kind: t.about });
  if (t?.kind === "link") out.push({ type: "link", link: t.type });
  if (t?.kind === "field") out.push({ type: "field", kind: t.entityKind, field: t.field });
  for (const s of w.steps || []) for (const ms of [s.milestone, s.gate?.milestone]) {
    if (ms?.kind === "link") out.push({ type: "link", link: ms.type });
    if (ms?.kind === "field") out.push({ type: "field", kind: ms.entityKind, field: ms.field });
  }
  const seen = new Set(); return out.filter(i => { const k = itemText(i); if (seen.has(k)) return false; seen.add(k); return true; });
}
const triggerKey = t => !t || t.kind === "manual" ? null : triggerText(t);

/* The check before a workflow can be active. problems block; warnings are said once. */
export function checkWorkflow(root, w, all = listWorkflows(root)) {
  if (!w) return { ok: false, problems: ["no such workflow"], warnings: [], needs: { missing: [], have: [] } };
  if (!w.ok) return { ok: false, problems: w.problems, warnings: [], needs: { missing: [], have: [] } };
  const problems = [...w.header.problems], warnings = [];
  if (!w.header.declared) problems.push("no header: add trigger, reads and writes to the frontmatter (see WORKFLOWS.md)");
  const items = workflowItems(w), skillItems = [];
  for (const s of w.steps) {
    if (s.skill) { const k = findSkill(root, s.skill); if (!k) problems.push(`step ${s.n} names the skill ${s.skill}, which is neither shipped nor in .agents/skills`); else skillItems.push(...k.needs); }
    if (!s.milestone) problems.push(`step ${s.n} (${s.title}) has no milestone: end it with "Milestone: a note tagged <tag>", "a link <type> created", "field <kind>.<field> filled" or "the document <slug> written"`);
    else if (s.milestone.kind === "invalid") problems.push(`step ${s.n} (${s.title}) milestone "${s.milestone.text}" is not something the brain can see (a note tagged <tag>, a link <type> created, field <kind>.<field> filled, the document <slug> written)`);
    if (s.tool && !CATEGORIES[s.tool]) warnings.push(`step ${s.n} tool category ${s.tool} is not one the brain maps (${Object.keys(CATEGORIES).join(", ")})`);
  }
  const needs = compareNeeds(root, [...items, ...skillItems]);
  for (const m of needs.missing) (m.tool ? warnings : problems).push(`${m.item}: ${m.why}; ${m.fix}`);
  const t = w.header.trigger;
  if (t.kind === "schedule" && !w.header.context) problems.push("a scheduled workflow names the context its runs belong to: add context: <slug> to the header");
  if (w.header.context && !lib.readContext(root, w.header.context, { includeMemories: false })) problems.push(`context ${w.header.context} does not exist`);
  const key = triggerKey(t);
  if (key) for (const o of all) if (o.ok && o.slug !== w.slug && effectiveStatus(root, o).status === "active" && triggerKey(o.header.trigger) === key) problems.push(`${o.slug} is already active on the same trigger (${key}); pause it or change one trigger`);
  return { ok: !problems.length, problems, warnings, needs };
}

/* active in the file but naming a kind, link or field SCHEMA.md no longer has: flagged and treated as paused,
   computed on every read, so every machine and every plugin version that reads it agrees, and nothing is rewritten. */
export function effectiveStatus(root, w) {
  if (!w?.ok) return { status: "draft", flag: null };
  if (w.header.status !== "active") return { status: w.header.status, flag: null };
  const missing = compareNeeds(root, workflowItems(w)).missing.filter(m => !m.tool);
  return missing.length ? { status: "paused", flag: `SCHEMA.md changed: ${missing.map(m => `${m.item} (${m.why})`).join("; ")}` } : { status: "active", flag: null };
}

/* ---------- events, read from the records ---------- */
const tagOf = (m, prefix) => { const t = (m.tags || []).find(x => typeof x === "string" && x.startsWith(prefix)); return t ? t.slice(prefix.length) : null; };
const memoryEvent = (m, extra) => ({ at: m.at, memory: m.id, context: m.context, depth: Number(tagOf(m, "depth:")) || (tagOf(m, "run:") ? 1 : 0), from: tagOf(m, "workflow:"), ...extra });
/* Every event the brain's records describe: notes about a kind, links created or ended, fields changed or missing. */
export function brainEvents(root, { contexts = lib.listContexts(root), registry = lib.readNames(root), now = Date.now() } = {}) {
  const byId = new Map(registry.map(e => [e.id, e])), events = [], memories = [];
  for (const c of contexts) if ((c.status || "active") === "active") memories.push(...lib.effectiveMemories(c.memories || []).filter(m => !m.retracts));
  const at = new Map(memories.map(m => [m.id, m.at]));
  for (const m of memories) for (const id of new Set(m.entities || [])) { const e = byId.get(id); if (e) events.push(memoryEvent(m, { id: `note:${m.id}:${e.id}`, type: "note", kind: e.kind, entity: e.id, name: e.name })); }
  const read = readSchema(root), canon = t => read.schema ? relationType(read.schema, t)?.type || t : t, groups = new Map();
  for (const m of memories.filter(m => m.relation)) { const k = `${m.relation.from}|${canon(m.relation.type)}|${m.relation.to}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
  for (const list of groups.values()) {
    list.sort((a, b) => String(a.relation.observed_at).localeCompare(String(b.relation.observed_at)) || String(a.at).localeCompare(String(b.at)));
    let prev = null;
    for (const m of list) {
      const s = m.relation.status, change = s === "current" && prev !== "current" ? "created" : s === "ended" && prev !== "ended" ? "ended" : null; prev = s;
      if (change) events.push(memoryEvent(m, { id: `link:${m.id}`, type: "link", link: canon(m.relation.type), change, entity: m.relation.from, name: byId.get(m.relation.from)?.name || m.relation.from, to: m.relation.to === "us" ? "us" : byId.get(m.relation.to)?.name || m.relation.to }));
    }
  }
  const schema = read.schema;
  for (const e of registry) {
    let filled = []; try { filled = e._fm?.compiled_fields ? JSON.parse(e._fm.compiled_fields) : []; } catch {}
    for (const f of Array.isArray(filled) ? filled : []) {
      const when = (f.memories || []).map(id => at.get(id)).filter(Boolean).sort().pop();
      if (when) events.push({ id: `field:${e.id}:${f.field}:${hash(f.text)}`, type: "field", change: "changed", kind: e.kind, field: f.field, entity: e.id, name: e.name, at: when, memory: (f.memories || []).find(id => at.get(id) === when), depth: 0 });
    }
    const created = Date.parse(e._fm?.created_at || "");
    if (schema && Number.isFinite(created)) for (const f of fieldsFor(schema, e.kind, e.subtype)) if (!filled.some(x => x.field === f.name))
      events.push({ id: `missing:${e.id}:${f.name}`, type: "field", change: "missing", kind: e.kind, field: f.name, entity: e.id, name: e.name, created: new Date(created).toISOString(), at: new Date(created).toISOString(), depth: 0 });
  }
  return events;
}

/* Does an event fire this trigger? (A workflow's own notes never fire it.) */
export function matches(trigger, ev, slug, now = Date.now()) {
  if (!trigger || ev.from === slug) return false;
  if (trigger.kind === "note") return ev.type === "note" && ev.kind === trigger.about;
  if (trigger.kind === "link") return ev.type === "link" && ev.link === trigger.type && ev.change === trigger.change;
  if (trigger.kind === "field") return ev.type === "field" && ev.kind === trigger.entityKind && ev.field === trigger.field && ev.change === trigger.change
    && (trigger.change !== "missing" || now - Date.parse(ev.created) >= trigger.days * DAY);
  return false;
}

/* The latest time the schedule came round, as {id, at}, or null before the first one. Local time. */
export function scheduleOccurrence(trigger, now = new Date()) {
  const [h, mm] = trigger.at.split(":").map(Number);
  for (let back = 0; back < 8; back++) {
    const d = new Date(now); d.setDate(d.getDate() - back); d.setHours(h, mm, 0, 0);
    if (d > now) continue;
    const wd = d.getDay(), ok = trigger.every === "day" || (trigger.every === "weekday" ? wd >= 1 && wd <= 5 : WEEKDAYS[wd] === trigger.every);
    if (ok) return { id: `schedule:${localDate(d)}`, at: d.toISOString(), date: localDate(d) };
  }
  return null;
}

export const eventLabel = ev => ev.type === "schedule" ? `the schedule of ${ev.date}` : ev.type === "note" ? `a note about ${ev.name} (${ev.kind}) on ${String(ev.at).slice(0, 10)}`
  : ev.type === "link" ? `${ev.name} ${ev.link} ${ev.to} ${ev.change} on ${String(ev.at).slice(0, 10)}`
  : ev.change === "missing" ? `${ev.name} has had no ${ev.field} since ${String(ev.created).slice(0, 10)}` : `${ev.name}'s ${ev.field} changed on ${String(ev.at).slice(0, 10)}`;

/* Taken and dismissed events, from the notes. */
function claims(contexts, runs) {
  const taken = new Set(runs.filter(r => r.event).map(r => `${r.workflow}|${r.event}`)), dismissed = new Set();
  for (const c of contexts) for (const m of lib.effectiveMemories(c.memories || [])) { const d = tagOf(m, "event-dismissed:"), w = tagOf(m, "workflow:"); if (d && w) dismissed.add(`${w}|${d}`); }
  return { taken, dismissed };
}

/* What every active workflow is offered now: its waiting events, newest first, or why it is held. */
export function pendingOffers(root, { contexts = lib.listContexts(root), runs = listRuns(root, contexts), registry = lib.readNames(root), now = new Date(), workflows = listWorkflows(root) } = {}) {
  if (workflowsOff(root)) return [];
  const { taken, dismissed } = claims(contexts, runs), out = [];
  let events = null;
  for (const w of workflows) {
    const eff = effectiveStatus(root, w); if (eff.status !== "active") continue;
    const t = w.header.trigger; if (t.kind === "manual") continue;
    const sinceFile = Date.parse(w.header.active_since || "") || 0, since = Math.max(sinceFile, now - LIMITS.eventWindowDays * DAY);
    let waiting = [];
    if (t.kind === "schedule") { const o = scheduleOccurrence(t, now); if (o && Date.parse(o.at) >= sinceFile) waiting = [{ ...o, type: "schedule", depth: 0 }]; }
    else { events ||= brainEvents(root, { contexts, registry, now: +now }); waiting = events.filter(ev => matches(t, ev, w.slug, +now) && (ev.change === "missing" ? true : Date.parse(ev.at) >= since)); }
    // an entity already in a live run of this workflow is not offered again: the run's own work (its milestone notes
    // saved through remember) would otherwise start the same workflow about the same entity, round and round
    const busy = new Set(runs.filter(r => r.workflow === w.slug && isLive(r) && r.subject).map(r => r.subject));
    waiting = waiting.filter(ev => !taken.has(`${w.slug}|${ev.id}`) && !dismissed.has(`${w.slug}|${ev.id}`) && !(ev.entity && busy.has(ev.entity))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    if (!waiting.length) continue;
    const tooDeep = waiting.filter(ev => ev.depth + 1 > LIMITS.chainDepth); waiting = waiting.filter(ev => ev.depth + 1 <= LIMITS.chainDepth);
    const active = runs.filter(r => r.workflow === w.slug && isLive(r)).length;
    out.push({ workflow: w, events: waiting, tooDeep: tooDeep.length, held: active >= LIMITS.activeRunsPerWorkflow ? `${active} runs already active, the limit is ${LIMITS.activeRunsPerWorkflow}` : null });
  }
  return out.filter(o => o.events.length || o.tooDeep);
}

/* The chat start's workflow lines: one per workflow with something waiting, one per flagged workflow. Never runs anything. */
export function offerLines(root, { contexts = lib.listContexts(root), runs = listRuns(root, contexts), today = localDate(), now = new Date() } = {}) {
  const workflows = listWorkflows(root); if (!workflows.length) return [];
  if (workflowsOff(root)) return workflows.some(w => w.ok && w.header.status === "active") ? ["workflows are off in this brain (workflows: off in brain/admin.md): nothing is offered or moved; say so only if asked."] : [];
  const lines = [], flagged = workflows.filter(w => effectiveStatus(root, w).flag);
  for (const w of flagged) lines.push(`workflow ${w.slug} is held: ${effectiveStatus(root, w).flag}. Say it once; the fix is the header (or the schema through /gtm-brain-schema), then workflow check.`);
  const offers = pendingOffers(root, { contexts, runs, now, workflows });
  for (const o of offers.slice(0, LIMITS.offersPerChat)) {
    const ev = o.events[0], more = o.events.length - 1;
    if (!ev) { lines.push(`workflow ${o.workflow.slug}: ${plural(o.tooDeep, "event")} not offered, workflows starting each other stop at depth ${LIMITS.chainDepth}.`); continue; }
    lines.push(o.held ? `workflow ${o.workflow.slug} (${triggerText(o.workflow.header.trigger)}): ${plural(o.events.length, "event")} waiting, held: ${o.held}.`
      : `workflow ${o.workflow.slug} (${triggerText(o.workflow.header.trigger)}): ${eventLabel(ev)}${more ? `, and ${more} more` : ""}. Offer it once in one line after answering; start only on the person's yes (workflow start, slug ${o.workflow.slug}, event ${ev.id}); never run it silently.`);
  }
  if (offers.length > LIMITS.offersPerChat) lines.push(`${plural(offers.length - LIMITS.offersPerChat, "more workflow")} with events waiting: query workflows lists them.`);
  return lines;
}

/* ---------- milestones: has the brain seen it, since the step opened? ---------- */
export function milestoneEvidence(root, ms, { since = null, subject = null, run = null, contexts = lib.listContexts(root), registry = null } = {}) {
  if (!ms || ms.kind === "invalid") return null;
  const after = m => !since || String(m.at) >= String(since);
  const mems = () => contexts.flatMap(c => lib.effectiveMemories(c.memories || [])).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (ms.kind === "tag") { const m = mems().find(m => after(m) && (m.tags || []).includes(ms.tag) && (!subject || (m.entities || []).includes(subject) || (run && (m.tags || []).includes(`run:${run}`)))); return m ? { memory: m.id, at: m.at, what: `${milestoneText(ms)} (${m.id})` } : null; }
  if (ms.kind === "link") { const read = readSchema(root), canon = t => read.schema ? relationType(read.schema, t)?.type || t : t; const m = mems().find(m => after(m) && m.relation && m.relation.status === "current" && canon(m.relation.type) === canon(ms.type) && (!subject || m.relation.from === subject || m.relation.to === subject)); return m ? { memory: m.id, at: m.at, what: `${milestoneText(ms)} (${m.id})` } : null; }
  if (ms.kind === "field") {
    const reg = registry || lib.readNames(root);
    for (const e of reg.filter(e => e.kind === ms.entityKind && (!subject || e.id === subject))) {
      let f = []; try { f = JSON.parse(e._fm?.compiled_fields || "[]"); } catch {}
      const hit = Array.isArray(f) && f.find(x => x.field === ms.field); if (hit) return { memory: hit.memories?.[0] || null, at: null, what: `${e.name}'s ${ms.field}: ${hit.text}` };
    }
    return null;
  }
  if (ms.kind === "document") { let d = null; try { d = readDocument(root, ms.ref); } catch {} return d && (!since || String(d.updated || "") >= String(since).slice(0, 10)) ? { memory: null, at: d.updated, what: `${d.path} written (updated ${d.updated})` } : null; }
  return null;
}

/* ---------- the dry run: what a run would read and write, on one real example, without writing ---------- */
export function dryRun(root, w, { contexts = lib.listContexts(root), registry = lib.readNames(root), now = new Date() } = {}) {
  const t = w.header.trigger;
  let example = null;
  if (t.kind === "schedule") example = { ...scheduleOccurrence(t, now), type: "schedule" };
  else if (t.kind !== "manual") example = brainEvents(root, { contexts, registry, now: +now }).filter(ev => matches(t, ev, w.slug, +now)).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
  const context = w.header.context || example?.context || null;
  const reads = [...w.header.reads.map(itemText)], writes = [`a run-start note in ${context || "the context the person names"}${example ? ` (event ${example.id})` : ""}`];
  for (const s of w.steps) {
    const k = s.skill ? findSkill(root, s.skill) : null;
    if (k) reads.push(...k.needs.map(itemText).map(x => `${x} (skill ${k.id})`));
    if (s.tool) reads.push(`tool:${s.tool} (${toolsFor(root, s.tool).join(", ") || "none connected"})`);
    writes.push(`step ${s.n} ${s.title}: a step note${s.milestone && s.milestone.kind !== "invalid" ? `, then ${milestoneText(s.milestone)}` : ""}`);
  }
  writes.push(...w.header.writes.map(itemText));
  return { example, exampleText: example ? eventLabel(example) : t.kind === "manual" ? "manual: a person starts it" : "no example in the brain yet: nothing would start today", context, reads: [...new Set(reads)], writes: [...new Set(writes)] };
}

/* ---------- the people's view: query workflows ---------- */
export function viewText(root, { now = new Date() } = {}) {
  const contexts = lib.listContexts(root), runs = listRuns(root, contexts), workflows = listWorkflows(root), today = localDate(now);
  if (!workflows.length && !runs.length) return "workflows: none yet. A workflow is a document in workflows/ with type: workflow (WORKFLOWS.md).";
  const offers = new Map(pendingOffers(root, { contexts, runs, now, workflows }).map(o => [o.workflow.slug, o]));
  const lines = [`workflows (${workflows.length})${workflowsOff(root) ? ", all off (workflows: off in brain/admin.md)" : ""}:`];
  for (const w of workflows) {
    if (!w.ok) { lines.push(`- ${w.slug}: does not parse: ${w.problems.join("; ")} (${w.path})`); continue; }
    const eff = effectiveStatus(root, w);
    lines.push(`- ${w.slug} [${eff.status}${eff.flag ? `, held: ${eff.flag}` : ""}], trigger: ${triggerText(w.header.trigger)}${w.header.declared ? "" : " (no header: a manual draft)"}${w.header.reads.length ? `, reads ${w.header.reads.map(itemText).join(", ")}` : ""}${w.header.writes.length ? `, writes ${w.header.writes.map(itemText).join(", ")}` : ""}`);
    for (const r of runs.filter(r => r.workflow === w.slug && (isLive(r) || (r.ended && String(r.ended.at) >= addDays(today, -14))))) {
      const s = r.current, def = s ? w.steps[s.n - 1] : null;
      const waits = !s ? "" : r.paused ? "paused by a person" : s.status === "due" ? (def?.milestone && def.milestone.kind !== "invalid" ? `due now, waits for ${milestoneText(def.milestone)}` : "due now") : s.due ? `waits until ${s.due}` : def?.gate?.milestone ? `waits for ${milestoneText(def.gate.milestone)}` : "waiting";
      lines.push(`  run ${r.id} in ${r.contextTitle}: ${r.ended ? `${r.ended.how} ${String(r.ended.at).slice(0, 10)}` : s ? `step ${s.n} of ${w.steps.length} (${def?.title || "step"}), ${waits}` : "no step pending"}${r.duplicateOf ? `; a second run of the event ${r.duplicateOf} took, cancel it` : ""}; last: ${String(r.last?.content || "").split("\n")[0].slice(0, 140)}`);
    }
    const o = offers.get(w.slug);
    if (o) lines.push(`  waiting to start: ${plural(o.events.length, "event")}${o.events[0] ? `, newest: ${eventLabel(o.events[0])} (event ${o.events[0].id})` : ""}${o.held ? `; held: ${o.held}` : ""}${o.tooDeep ? `; ${o.tooDeep} past the chain depth of ${LIMITS.chainDepth}` : ""}`);
  }
  const orphans = runs.filter(r => isLive(r) && !workflows.some(w => w.slug === r.workflow));
  for (const r of orphans) lines.push(`- run ${r.id}: its workflow file ${r.workflow} is gone; cancel the run or bring the file back`);
  lines.push(`limits: ${LIMITS.activeRunsPerWorkflow} active runs per workflow, ${LIMITS.stepsPerDay} automatic steps per run a day, chains stop at depth ${LIMITS.chainDepth}; a workflow's own notes never start it. Rules (RULES.md) bind every step.`);
  return lines.join("\n");
}

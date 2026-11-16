// Workflows: a document in workflows/ with type: workflow (the playbook) and its runs as dated memories
// (the state). This module parses the document and reads the runs; scripts/gtm-brain-workflow/workflow.mjs
// is the only writer. Nothing here is stored twice: the memories are the truth, the index is a cache.
// 0.35.0: a checked header (status, trigger, reads, writes), steps that name a skill and end on a milestone the
// brain can see, and the limits. Triggers, events, the check and the people's view are in workflow-triggers.mjs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listDocuments } from "./documents.mjs";
import * as lib from "./brain.mjs";
// a cycle on purpose: the triggers read this module and the opening line reads them; neither uses the other at load time
import * as triggers from "./workflow-triggers.mjs";

export const TYPE = "workflow";
export const STEP_STATUSES = ["pending", "due", "done", "skipped"];
export const WORKFLOW_STATUSES = ["draft", "active", "paused"];

/* Every limit in one place. A brain turns all workflows off with `workflows: off` in brain/admin.md
   (the workplace-change path, like deal_scoring). */
export const LIMITS = Object.freeze({
  activeRunsPerWorkflow: 3,   // runs of one workflow not ended at once; a fourth start is refused
  stepsPerDay: 5,             // steps the automatic check moves in one run in one day
  chainDepth: 3,              // a workflow started by a note of a run started by another ... stops at depth 3
  offersPerChat: 3,           // workflow lines in one chat start; the rest are in query workflows
  eventWindowDays: 14,        // events older than this are never offered, whatever active_since says
});
export const workflowsOff = root => String(lib.readAdmin(root)?.workflows ?? "on").trim().toLowerCase() === "off";

/* Dates: the person's day, as YYYY-MM-DD; arithmetic at noon UTC so no timezone shifts a date. */
const dayFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
export const localDate = (d = new Date()) => dayFormat.format(d);
export const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* A milestone the brain can see: a note with a tag, a link created, a field filled, a document written.
   Anything else is { kind: "invalid" }: the check reports it, a draft still runs by hand. */
export function parseMilestone(text) {
  const t = String(text || "").trim().replace(/\.$/, "");
  if (!t) return null;
  let m;
  if ((m = t.match(/^an? (?:new )?note tagged ([a-z0-9][a-z0-9:_-]*)$/i))) return { kind: "tag", tag: m[1].toLowerCase() };
  if ((m = t.match(/^an? (?:new )?link ([a-z][a-z0-9_]{0,40}) created$/i))) return { kind: "link", type: m[1].toLowerCase() };
  if ((m = t.match(/^(?:the )?field ([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*) filled$/i))) return { kind: "field", entityKind: m[1].toLowerCase(), field: m[2].toLowerCase() };
  if ((m = t.match(/^(?:a|the) document (\S+) written$/i))) return { kind: "document", ref: m[1].replace(/\.md$/, "") };
  return { kind: "invalid", text: t };
}
export const milestoneText = m => !m ? "" : m.kind === "tag" ? `a note tagged ${m.tag}` : m.kind === "link" ? `a link ${m.type} created` : m.kind === "field" ? `field ${m.entityKind}.${m.field} filled` : m.kind === "document" ? `the document ${m.ref} written` : m.text;

/* Gate: after N days | on YYYY-MM-DD | when <condition>. Anything else is invalid, never "no gate".
   A when-gate that reads as a milestone ("when a note tagged engaged-accounts") is watched by the brain;
   any other when-gate is asked as a question, as before 0.35.0. */
export function parseGate(text) {
  const t = String(text || "").trim().replace(/\.$/, "");
  if (!t) return null;
  let m;
  if ((m = t.match(/^after (\d+) days?$/i))) return { kind: "after", days: Number(m[1]) };
  if ((m = t.match(/^on (\d{4}-\d{2}-\d{2})$/i))) return { kind: "on", date: m[1] };
  if ((m = t.match(/^when (.+)$/i))) { const condition = m[1].trim(), ms = parseMilestone(condition.replace(/ is reached$/i, "")); return ms && ms.kind !== "invalid" ? { kind: "when", condition, milestone: ms } : { kind: "when", condition }; }
  return { kind: "invalid", text: t };
}

/* Header items: kind:organization, link:works_at, field:person.role, tool:crm. */
export function parseItem(text) {
  const t = String(text || "").trim().toLowerCase(); let m;
  if ((m = t.match(/^kind:([a-z][a-z0-9_]{0,39})$/))) return { type: "kind", kind: m[1] };
  if ((m = t.match(/^link:([a-z][a-z0-9_]{0,40})$/))) return { type: "link", link: m[1] };
  if ((m = t.match(/^field:([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]{0,39})$/))) return { type: "field", kind: m[1], field: m[2] };
  if ((m = t.match(/^tool:([a-z][a-z0-9-]{0,39})$/))) return { type: "tool", tool: m[1] };
  return { type: "invalid", text: String(text || "").trim() };
}
export const itemText = i => i.type === "kind" ? `kind:${i.kind}` : i.type === "link" ? `link:${i.link}` : i.type === "field" ? `field:${i.kind}.${i.field}` : i.type === "tool" ? `tool:${i.tool}` : i.text;
const itemList = v => (Array.isArray(v) ? v : v == null || v === "" ? [] : String(v).split(",")).map(x => String(x).trim()).filter(Boolean);

/* Trigger: manual; a schedule (daily, daily 09:00, every Monday 09:00, every weekday); or a brain event
   (note about <kind>; link <type> created|ended; field <kind>.<field> changed; field <kind>.<field> missing for N days). */
export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export function parseTrigger(text) {
  const t = String(text ?? "").trim().toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ");
  if (!t || t === "manual") return { kind: "manual" };
  let m;
  const time = (h, mm) => h === undefined ? "09:00" : Number(h) < 24 && Number(mm) < 60 ? `${String(h).padStart(2, "0")}:${mm}` : null;
  if ((m = t.match(/^(?:daily|every day)(?: (?:at )?(\d{1,2}):(\d{2}))?$/))) { const at = time(m[1], m[2]); return at ? { kind: "schedule", every: "day", at } : { kind: "invalid", text: t }; }
  if ((m = t.match(/^every (weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?(?: (?:at )?(\d{1,2}):(\d{2}))?$/))) { const at = time(m[2], m[3]); return at ? { kind: "schedule", every: m[1], at } : { kind: "invalid", text: t }; }
  if ((m = t.match(/^(?:on )?(?:a )?note (?:saved )?about (?:an? )?([a-z][a-z0-9_]{0,39})$/))) return { kind: "note", about: m[1] };
  if ((m = t.match(/^(?:on )?(?:a )?link ([a-z][a-z0-9_]{0,40}) (created|ended)$/))) return { kind: "link", type: m[1], change: m[2] };
  if ((m = t.match(/^(?:on )?(?:a )?field ([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]{0,39}) changed$/))) return { kind: "field", entityKind: m[1], field: m[2], change: "changed" };
  if ((m = t.match(/^(?:on )?(?:a )?field ([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]{0,39}) missing for (\d+) days?$/))) return { kind: "field", entityKind: m[1], field: m[2], change: "missing", days: Number(m[3]) };
  return { kind: "invalid", text: t };
}
export const triggerText = t => !t ? "manual" : t.kind === "manual" ? "manual" : t.kind === "schedule" ? `${t.every === "day" ? "daily" : `every ${t.every}`} ${t.at}` : t.kind === "note" ? `note about ${t.about}` : t.kind === "link" ? `link ${t.type} ${t.change}` : t.kind === "field" ? `field ${t.entityKind}.${t.field} ${t.change === "missing" ? `missing for ${t.days} days` : "changed"}` : t.text;

/* The header: frontmatter keys a person can read. No header (no trigger key) is a manual draft, as before. */
export function parseHeader(fm = {}) {
  const problems = [], declared = ["trigger", "reads", "writes"].some(k => Object.hasOwn(fm, k));
  const raw = String(fm.status ?? "draft").trim().toLowerCase();
  const status = raw === "approved" ? "draft" : raw;
  if (!WORKFLOW_STATUSES.includes(status)) problems.push(`status "${fm.status}" is not draft, active or paused`);
  const trigger = parseTrigger(fm.trigger);
  if (trigger.kind === "invalid") problems.push(`trigger "${fm.trigger}" is not manual, a schedule (daily 09:00, every Monday 09:00) or an event (note about organization; link works_at created; field person.role changed; field organization.industry missing for 30 days)`);
  const items = key => itemList(fm[key]).map(parseItem);
  const reads = items("reads"), writes = items("writes");
  for (const i of [...reads, ...writes]) if (i.type === "invalid") problems.push(`"${i.text}" in reads or writes is not kind:<kind>, link:<type>, field:<kind>.<field> or tool:<category>`);
  const since = fm.active_since ? String(fm.active_since) : null;
  return { declared, status: WORKFLOW_STATUSES.includes(status) ? status : "draft", trigger, reads, writes, context: fm.context ? String(fm.context).trim() : null, active_since: since, problems };
}

const section = (body, name) => { const r = body.match(new RegExp(`^##\\s+${name}\\s*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, "m")); return r ? r[1].trim() : (new RegExp(`^##\\s+${name}\\s*$`, "m").test(body) ? "" : null); };
const bullets = text => text.split("\n").filter(l => /^\s*[-*]\s+/.test(l)).map(l => l.replace(/^\s*[-*]\s+/, "").trim());
// numbered items; an indented continuation line belongs to the item above it
const items = text => { const out = []; for (const line of text.split("\n")) { const m = line.match(/^\s*(\d+)\.\s+(.*)$/); if (m) out.push(m[2].trim()); else if (out.length && line.trim()) out[out.length - 1] += " " + line.trim(); } return out; };

/* One step: **Title** (tool: crm) (skill: gtmb-icp). What to do. Milestone: a note tagged x. Gate: after 3 days.
   The milestone comes before the gate, so a teammate on 0.34 still reads the gate (it takes the last "Gate:"). */
function parseStep(text, n, problems) {
  const m = text.match(/^\*\*(.+?)\*\*([\s\S]*)$/);
  if (!m) { problems.push(`step ${n} has no bold title`); return null; }
  let rest = m[2], tool = null, skill = null, mk;
  while ((mk = rest.match(/^\s*\((tool|skill):\s*([a-z0-9-]+)\)/i))) { if (mk[1].toLowerCase() === "tool") tool = mk[2].toLowerCase(); else skill = mk[2].toLowerCase(); rest = rest.slice(mk[0].length); }
  rest = rest.replace(/^\.?\s*/, "");
  const g = rest.match(/(?:^|\s)Gate:\s*([\s\S]+)$/);
  const gate = g ? parseGate(g[1]) : null;
  if (gate?.kind === "invalid") problems.push(`step ${n} gate "${gate.text}" is not "after N days", "on YYYY-MM-DD" or "when ..."`);
  let body = (g ? rest.slice(0, g.index) : rest).trim();
  const ms = body.match(/(?:^|\s)Milestone:\s*([\s\S]+?)\.?$/);
  const milestone = ms ? parseMilestone(ms[1]) : null;
  if (ms) body = body.slice(0, ms.index).trim();
  return { n, title: m[1].trim(), tool, skill, text: body, milestone, gate: gate?.kind === "invalid" ? null : gate };
}

/* A parsed workflow, or the problems a person has to fix by hand (the file is never rewritten).
   fm is the file's own frontmatter (for the header); without it the document's extra keys are read. */
export function parseWorkflow(doc, fm = null) {
  if (!doc || doc.extra?.type !== TYPE) return { ok: false, slug: doc?.slug, problems: ["not a workflow: the frontmatter has no type: workflow"] };
  const header = parseHeader(fm || { ...doc.extra, status: doc.status });
  const body = doc.body || "", problems = [];
  const settleText = section(body, "Before starting"), stepsText = section(body, "Steps"), learnText = section(body, "Learn");
  if (settleText === null) problems.push('missing heading "## Before starting"');
  if (stepsText === null) problems.push('missing heading "## Steps"');
  if (learnText === null) problems.push('missing heading "## Learn"');
  const settle = bullets(settleText || "").map(b => { const m = b.match(/^\*\*(.+?)\*\*:?\s*(.*)$/); return m ? { label: m[1].trim(), text: m[2].trim() } : { label: b, text: "" }; });
  // a workflow with a header may have nothing to settle (one skill with a trigger is the shortest workflow)
  if (settleText !== null && !settle.length && !header.declared) problems.push('"## Before starting" has no bullet');
  const steps = items(stepsText || "").map((text, i) => parseStep(text, i + 1, problems)).filter(Boolean);
  if (stepsText !== null && !steps.length && !problems.some(p => /bold title/.test(p))) problems.push('"## Steps" has no numbered step');
  const base = { slug: doc.slug, title: doc.title, path: doc.path, status: header.status, header };
  return problems.length ? { ...base, ok: false, problems } : { ...base, ok: true, settle, steps, learn: bullets(learnText || "") };
}
const rawFrontmatter = (root, path) => { try { return lib.parseFrontmatter(readFileSync(join(root, path), "utf8")).fm; } catch { return null; } };
export const listWorkflows = root => listDocuments(root).filter(d => d.extra?.type === TYPE).map(d => parseWorkflow(d, rawFrontmatter(root, d.path))).sort((a, b) => a.slug.localeCompare(b.slug));
export function readWorkflow(root, slug) { const doc = listDocuments(root).find(d => d.extra?.type === TYPE && d.slug === String(slug || "")); return doc ? parseWorkflow(doc, rawFrontmatter(root, doc.path)) : null; }

/* ---------- runs: state kept as memories in one context ---------- */
export const WORKFLOW_TAG = "workflow:", RUN_TAG = "run:", STEP_TAG = "step:", STATUS_TAG = "step-status:", DUE_TAG = "due:", EVENT_TAG = "event:", DEPTH_TAG = "depth:", SUBJECT_TAG = "subject:";
export const runId = (slug, date, handle) => `${slug}-${date}-${lib.handleFor(String(handle || ""))}`;
const tagValue = (m, prefix) => { const t = (m.tags || []).find(t => typeof t === "string" && t.startsWith(prefix)); return t ? t.slice(prefix.length) : null; };
export function runTags(m) { const step = tagValue(m, STEP_TAG); return { workflow: tagValue(m, WORKFLOW_TAG), run: tagValue(m, RUN_TAG), step: step ? Number(step) : null, status: tagValue(m, STATUS_TAG), due: tagValue(m, DUE_TAG) }; }
// cancelled and failed runs also carry run-abandoned, so a teammate on 0.34 sees them ended; the specific tag wins here
const ENDINGS = { "run-failed": "failed", "run-cancelled": "cancelled", "run-done": "done", "run-abandoned": "abandoned" };

/* Every run in the brain, newest first. Only effective memories count for state; the run-start note is
   read whatever happened to it later, so an ended run keeps its brief. contexts: listContexts with memories,
   when the caller already has them. */
export function listRuns(root, contexts = null) {
  const runs = new Map();
  for (const c of contexts || lib.listContexts(root, { includeMemories: false })) {
    const all = contexts ? c.memories || [] : lib.readMemories(root, c.slug), effective = new Set(lib.effectiveMemories(all));
    for (const m of all) {
      const t = runTags(m); if (!t.run) continue;
      if (!runs.has(t.run)) runs.set(t.run, { id: t.run, workflow: t.workflow, context: c.slug, contextTitle: c.title, contextStatus: c.status || "active", startedAt: null, by: null, brief: "", steps: [], opened: {}, open: null, ended: null, paused: null, event: null, depth: 1, subject: null, last: null });
      const r = runs.get(t.run), tags = m.tags || [], inForce = effective.has(m);
      if (tags.includes("run-start")) { r.startedAt = m.at; r.by = m.authors?.[0] || null; r.brief = m.content; r.event = tagValue(m, EVENT_TAG); r.depth = Number(tagValue(m, DEPTH_TAG)) || 1; r.subject = tagValue(m, SUBJECT_TAG); }
      if (t.step && !(t.step in r.opened)) r.opened[t.step] = m.at;   // when the step first opened: a milestone counts from then
      if (!inForce) continue;
      if (!m.retracts || t.step) r.last = { at: m.at, content: m.content, memory: m.id };
      if (t.step && t.status) r.steps[t.step - 1] = { n: t.step, status: t.status, due: t.due, at: m.at, memory: m.id, content: m.content, by: m.authors?.[0] || null };
      if (m.kind === "question" && t.step) r.open = { step: t.step, memory: m.id, content: m.content };
      if (tags.includes("run-paused")) r.paused = { at: m.at, memory: m.id, content: m.content };
      if (tags.includes("run-resumed")) r.paused = null;
      const end = Object.keys(ENDINGS).find(k => tags.includes(k));
      if (end) r.ended = { how: ENDINGS[end], at: m.at, memory: m.id, content: m.content };
    }
  }
  const list = [...runs.values()].map(r => { const steps = r.steps.filter(Boolean); return { ...r, steps, current: r.ended ? null : steps.find(s => s.status === "pending" || s.status === "due") || null }; })
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
  // the same event starts a workflow once: a second run of it (a teammate's machine, before the pull) is a duplicate
  const first = new Map();
  for (const r of [...list].reverse()) { if (!r.event) continue; const k = `${r.workflow}|${r.event}`; if (first.has(k)) r.duplicateOf = first.get(k); else first.set(k, r.id); }
  return list;
}
export const runState = (root, id) => listRuns(root).find(r => r.id === String(id || "")) || null;

/* A run that can move: not ended, and its context still active. A run in an archived context is reported, never nagged about. */
export const isLive = r => !r.ended && r.contextStatus === "active";
/* A live run the automatic check may move: not paused by a person, not a duplicate of an earlier run of the same event. */
export const isMoving = r => isLive(r) && !r.paused && !r.duplicateOf;
/* Pending steps whose gate date has passed: what the session and the schedule turn into a due step and a question. */
export const dueSteps = (root, today = localDate(), runs = null) => (runs || listRuns(root)).filter(r => isMoving(r) && r.current?.status === "pending" && r.current.due && r.current.due <= today).map(r => ({ run: r, step: r.current }));

/* The state a step enters when the one before it was done on previousDone (YYYY-MM-DD). */
export function stepDue(step, previousDone) {
  const g = step?.gate;
  if (!g) return { status: "due", due: previousDone };
  if (g.kind === "after") return { status: "pending", due: addDays(previousDone, g.days) };
  if (g.kind === "on") return { status: g.date <= previousDone ? "due" : "pending", due: g.date };
  if (g.milestone) return { status: "pending", due: null, wait: g.milestone };   // the brain watches for it
  return { status: "due", due: previousDone, ask: g.condition };
}

/* The opening lines for the chat start: runs in progress, then what the triggers offer and what is flagged
   (workflow-triggers.mjs). Instructions for the model: name them once, act only when asked. */
export function runsLine(root, today = localDate()) {
  const contexts = lib.listContexts(root);
  const runs = listRuns(root, contexts), live = runs.filter(isLive);
  const lines = [];
  if (live.length) {
    const cache = new Map(), wfOf = slug => { if (!cache.has(slug)) cache.set(slug, readWorkflow(root, slug)); return cache.get(slug); };
    const show = r => {
      const w = wfOf(r.workflow), total = w?.ok ? w.steps.length : r.steps.length, s = r.current, title = s && w?.ok ? w.steps[s.n - 1]?.title : null;
      return `${r.id} in ${r.contextTitle}${r.paused ? ", paused" : r.duplicateOf ? `, a second run of the event ${r.duplicateOf} took: cancel it` : s ? `, step ${s.n} of ${total}${title ? ` (${title})` : ""}${s.status === "due" ? ", due now" : s.due ? `, due ${s.due}` : ", waiting for its milestone"}` : ", no step pending"}`;
    };
    const due = live.filter(r => !r.paused && r.current && (r.current.status === "due" || (r.current.due && r.current.due <= today))).length;
    const tail = due ? `${due} step${due === 1 ? "" : "s"} due: mention it once; on "next step" or "where is the campaign" follow the gtmb-workflow skill (workflow status, then the step).` : `Say nothing about them unless asked; "where is the campaign" or "next step" follows the gtmb-workflow skill.`;
    lines.push(`workflows: ${live.length} run${live.length === 1 ? "" : "s"} in progress: ${live.map(show).join("; ")}. ${tail}`);
  }
  try { lines.push(...triggers.offerLines(root, { contexts, runs, today })); } catch {}
  return lines.join("\n");
}

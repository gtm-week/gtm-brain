// Workflows: a document in workflows/ with type: workflow (the playbook) and its runs as dated memories
// (the state). This module parses the document and reads the runs; scripts/gtm-brain-workflow/workflow.mjs
// is the only writer. Nothing here is stored twice: the memories are the truth, the index is a cache.
import { listDocuments } from "./documents.mjs";
import * as lib from "./brain.mjs";

export const TYPE = "workflow";
export const STEP_STATUSES = ["pending", "due", "done", "skipped"];

/* Dates: the person's day, as YYYY-MM-DD; arithmetic at noon UTC so no timezone shifts a date. */
const dayFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
export const localDate = (d = new Date()) => dayFormat.format(d);
export const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* Gate: after N days | on YYYY-MM-DD | when <condition>. Anything else is invalid, never "no gate". */
export function parseGate(text) {
  const t = String(text || "").trim().replace(/\.$/, "");
  if (!t) return null;
  let m;
  if ((m = t.match(/^after (\d+) days?$/i))) return { kind: "after", days: Number(m[1]) };
  if ((m = t.match(/^on (\d{4}-\d{2}-\d{2})$/i))) return { kind: "on", date: m[1] };
  if ((m = t.match(/^when (.+)$/i))) return { kind: "when", condition: m[1].trim() };
  return { kind: "invalid", text: t };
}

const section = (body, name) => { const r = body.match(new RegExp(`^##\\s+${name}\\s*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, "m")); return r ? r[1].trim() : null; };
const bullets = text => text.split("\n").filter(l => /^\s*[-*]\s+/.test(l)).map(l => l.replace(/^\s*[-*]\s+/, "").trim());
// numbered items; an indented continuation line belongs to the item above it
const items = text => { const out = []; for (const line of text.split("\n")) { const m = line.match(/^\s*(\d+)\.\s+(.*)$/); if (m) out.push(m[2].trim()); else if (out.length && line.trim()) out[out.length - 1] += " " + line.trim(); } return out; };

/* A parsed workflow, or the problems a person has to fix by hand (the file is never rewritten). */
export function parseWorkflow(doc) {
  if (!doc || doc.extra?.type !== TYPE) return { ok: false, slug: doc?.slug, problems: ["not a workflow: the frontmatter has no type: workflow"] };
  const body = doc.body || "", problems = [];
  const settleText = section(body, "Before starting"), stepsText = section(body, "Steps"), learnText = section(body, "Learn");
  if (settleText === null) problems.push('missing heading "## Before starting"');
  if (stepsText === null) problems.push('missing heading "## Steps"');
  if (learnText === null) problems.push('missing heading "## Learn"');
  const settle = bullets(settleText || "").map(b => { const m = b.match(/^\*\*(.+?)\*\*:?\s*(.*)$/); return m ? { label: m[1].trim(), text: m[2].trim() } : { label: b, text: "" }; });
  if (settleText !== null && !settle.length) problems.push('"## Before starting" has no bullet');
  const steps = [];
  items(stepsText || "").forEach((text, i) => {
    const m = text.match(/^\*\*(.+?)\*\*\s*(?:\(tool:\s*([a-z-]+)\))?\.?\s*([\s\S]*)$/);
    if (!m) { problems.push(`step ${i + 1} has no bold title`); return; }
    const [, title, tool, rest] = m, g = rest.match(/(?:^|\s)Gate:\s*([\s\S]+)$/);
    const gate = g ? parseGate(g[1]) : null;
    if (gate?.kind === "invalid") problems.push(`step ${i + 1} gate "${gate.text}" is not "after N days", "on YYYY-MM-DD" or "when ..."`);
    steps.push({ n: i + 1, title: title.trim(), tool: tool || null, text: (g ? rest.slice(0, g.index) : rest).trim(), gate: gate?.kind === "invalid" ? null : gate });
  });
  if (stepsText !== null && !steps.length) problems.push('"## Steps" has no numbered step');
  const base = { slug: doc.slug, title: doc.title, path: doc.path, status: doc.status };
  return problems.length ? { ...base, ok: false, problems } : { ...base, ok: true, settle, steps, learn: bullets(learnText || "") };
}
export const listWorkflows = root => listDocuments(root).filter(d => d.extra?.type === TYPE).map(parseWorkflow).sort((a, b) => a.slug.localeCompare(b.slug));
export function readWorkflow(root, slug) { const doc = listDocuments(root).find(d => d.extra?.type === TYPE && d.slug === String(slug || "")); return doc ? parseWorkflow(doc) : null; }

/* ---------- runs: state kept as memories in one context ---------- */
export const WORKFLOW_TAG = "workflow:", RUN_TAG = "run:", STEP_TAG = "step:", STATUS_TAG = "step-status:", DUE_TAG = "due:";
export const runId = (slug, date, handle) => `${slug}-${date}-${lib.handleFor(String(handle || ""))}`;
const tagValue = (m, prefix) => { const t = (m.tags || []).find(t => typeof t === "string" && t.startsWith(prefix)); return t ? t.slice(prefix.length) : null; };
export function runTags(m) { const step = tagValue(m, STEP_TAG); return { workflow: tagValue(m, WORKFLOW_TAG), run: tagValue(m, RUN_TAG), step: step ? Number(step) : null, status: tagValue(m, STATUS_TAG), due: tagValue(m, DUE_TAG) }; }

/* Every run in the brain, newest first. Only effective memories count for state; the run-start note is
   read whatever happened to it later, so an ended run keeps its brief. */
export function listRuns(root) {
  const runs = new Map();
  for (const c of lib.listContexts(root, { includeMemories: false })) {
    const all = lib.readMemories(root, c.slug), effective = new Set(lib.effectiveMemories(all));
    for (const m of all) {
      const t = runTags(m); if (!t.run) continue;
      if (!runs.has(t.run)) runs.set(t.run, { id: t.run, workflow: t.workflow, context: c.slug, contextTitle: c.title, contextStatus: c.status || "active", startedAt: null, by: null, brief: "", steps: [], open: null, ended: null });
      const r = runs.get(t.run), tags = m.tags || [], inForce = effective.has(m);
      if (tags.includes("run-start")) { r.startedAt = m.at; r.by = m.authors?.[0] || null; r.brief = m.content; }
      if (!inForce) continue;
      if (t.step && t.status) r.steps[t.step - 1] = { n: t.step, status: t.status, due: t.due, at: m.at, memory: m.id, content: m.content, by: m.authors?.[0] || null };
      if (m.kind === "question" && t.step) r.open = { step: t.step, memory: m.id, content: m.content };
      if (tags.includes("run-done") || tags.includes("run-abandoned")) r.ended = { how: tags.includes("run-done") ? "done" : "abandoned", at: m.at, memory: m.id, content: m.content };
    }
  }
  return [...runs.values()].map(r => { const steps = r.steps.filter(Boolean); return { ...r, steps, current: r.ended ? null : steps.find(s => s.status === "pending" || s.status === "due") || null }; })
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}
export const runState = (root, id) => listRuns(root).find(r => r.id === String(id || "")) || null;

/* A run that can move: not ended, and its context still active. A run in an archived context is reported, never nagged about. */
export const isLive = r => !r.ended && r.contextStatus === "active";
/* Pending steps whose gate date has passed: what the session and the schedule turn into a due step and a question. */
export const dueSteps = (root, today = localDate()) => listRuns(root).filter(r => isLive(r) && r.current?.status === "pending" && r.current.due && r.current.due <= today).map(r => ({ run: r, step: r.current }));

/* The state a step enters when the one before it was done on previousDone (YYYY-MM-DD). */
export function stepDue(step, previousDone) {
  const g = step?.gate;
  if (!g) return { status: "due", due: previousDone };
  if (g.kind === "after") return { status: "pending", due: addDays(previousDone, g.days) };
  if (g.kind === "on") return { status: g.date <= previousDone ? "due" : "pending", due: g.date };
  return { status: "due", due: previousDone, ask: g.condition };
}

/* One opening line for the session hook. Instructions for the model: name the runs once, act only when asked. */
export function runsLine(root, today = localDate()) {
  const live = listRuns(root).filter(isLive); if (!live.length) return "";
  const show = r => {
    const w = readWorkflow(root, r.workflow), total = w?.ok ? w.steps.length : r.steps.length, s = r.current, title = s && w?.ok ? w.steps[s.n - 1]?.title : null;
    return `${r.id} in ${r.contextTitle}${s ? `, step ${s.n} of ${total}${title ? ` (${title})` : ""}${s.status === "due" ? ", due now" : s.due ? `, due ${s.due}` : ""}` : ", no step pending"}`;
  };
  const due = live.filter(r => r.current && (r.current.status === "due" || (r.current.due && r.current.due <= today))).length;
  const tail = due ? `${due} step${due === 1 ? "" : "s"} due: mention it once; on "next step" or "where is the campaign" follow the gtm-brain-workflow skill (workflow status, then the step).` : `Say nothing about them unless asked; "where is the campaign" or "next step" follows the gtm-brain-workflow skill.`;
  return `workflows: ${live.length} run${live.length === 1 ? "" : "s"} in progress: ${live.map(show).join("; ")}. ${tail}`;
}

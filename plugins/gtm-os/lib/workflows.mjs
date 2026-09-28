// Workflows: a document in workflows/ with type: workflow (the playbook) and its runs as dated memories
// (the state). This module parses the document and reads the runs; scripts/gtm-os-workflow/workflow.mjs
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

#!/usr/bin/env node
// Workflows: a run of a workflow document as dated memories (lib/workflows.mjs is the format; this is the only writer).
//   node workflow.mjs <root> --list [--json]
//   node workflow.mjs <root> --start <slug> --context <ctx> --handle "<name>" --settled '{"Label":"answer"}' --by <handle>
//   node workflow.mjs <root> --status <run-id> [--json]
//   node workflow.mjs <root> --advance <run-id> --step <n> [--note "..."] [--answer "..."] [--actions "tool:action:ref,..."] [--learned '{"item":"..."}'] --by <handle>
//   node workflow.mjs <root> --skip <run-id> --step <n> --reason "..." --by <handle>
//   node workflow.mjs <root> --abandon <run-id> --reason "..." --by <handle>
//   node workflow.mjs <root> --due [--today YYYY-MM-DD] --by <handle|schedule|session>
// Nothing here calls a connector: the chat does the step through its tools, then records it with --advance.
// Every write goes through lib.appendMemory and commits through lib.commit; the JSONL only grows.
// An automatic check (--by schedule or session) writes with via schedule and that word as the author.
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const wf = await import(new URL("../../lib/workflows.mjs", import.meta.url));
const args = process.argv.slice(2); const root = realpathSync(resolve(args[0] && !args[0].startsWith("--") ? args.shift() : "."));
if (!existsSync(join(root, "brain", "admin.md"))) { console.error("no brain here (brain/admin.md missing)."); process.exit(1); }
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { const k = args[i].slice(2), v = args[i + 1]; if (v === undefined || v.startsWith("--")) opt[k] = true; else { opt[k] = v; i++; } }
const refuse = why => { console.error(why); process.exit(2); };
for (const flag of ["start", "context", "handle", "settled", "by", "status", "advance", "step", "note", "answer", "actions", "learned", "skip", "abandon", "reason", "today"]) if (opt[flag] === true) refuse(`--${flag} needs a value`);
const AUTOMATIC = new Set(["schedule", "session"]);
const by = opt.by === undefined ? null : AUTOMATIC.has(String(opt.by)) ? String(opt.by) : lib.teamHandle(root, String(opt.by));
if (opt.by !== undefined && !by) refuse(`"${opt.by}" is not in admin.md team`);
const via = AUTOMATIC.has(by) ? "schedule" : "codex";   // via is codex | human | schedule (lib validates); the author says session or schedule
const needBy = () => { if (!by) refuse("--by is required: the person's handle, or schedule / session for the automatic due check"); };
const json = obj => console.log(JSON.stringify(obj, null, 2));
const slugs = () => wf.listWorkflows(root).map(w => w.slug).join(", ") || "none";
const parseJSON = (text, flag) => { try { const v = JSON.parse(text || "{}"); if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(); return v; } catch { refuse(`--${flag} must be a JSON object`); } };
const parseActions = text => String(text || "").split(",").map(s => s.trim()).filter(Boolean).map(a => { const [tool, action, ...ref] = a.split(":"); return ref.length ? { tool, action, ref: ref.join(":") } : { tool, action }; });

/* ---------- records: the four shapes a run is made of ---------- */
const baseTags = (slug, id) => [`workflow:${slug}`, `run:${id}`];
const write = (ctx, fields) => lib.appendMemory(root, ctx, { authors: [by], via, kind: "note", ...fields }).rec;
const stateLine = s => s.status === "due" ? "due now" : s.status === "pending" ? `waiting, due ${s.due}` : s.status;
const stepRecord = (w, step, state, id, note, extra = {}) => write(w.context, {
  content: `Step ${step.n} of ${w.steps.length}, ${step.title}: ${stateLine(state)}. ${note}`.trim(),
  tags: [...baseTags(w.slug, id), `step:${step.n}`, `step-status:${state.status}`, ...(state.due && (state.status === "pending" || state.status === "due") ? [`due:${state.due}`] : [])], ...extra });
const gateQuestion = (w, step, id, condition) => write(w.context, { kind: "question", content: `Run ${id}, step ${step.n} (${step.title}): ${condition}? Answer this to move the run on.`, tags: [...baseTags(w.slug, id), `step:${step.n}`, "gate", "brain-question"] });
const finish = (ctx, message, line) => { const c = lib.commit(root, [`brain/contexts/${ctx}/memories.jsonl`, ...lib.ENTITIES_PATHS], message); lib.logActivity(root, "workflow", message); lib.rerender(root); console.log(`${line} (${c.note})`); };
const loaded = (slug, ctx) => { const w = wf.readWorkflow(root, slug); if (!w) refuse(`no workflow "${slug}"; workflows: ${slugs()}`); if (!w.ok) refuse(`${w.path} does not parse: ${w.problems.join("; ")}. Fix the file by hand.`); return { ...w, context: ctx }; };

/* ---------- list ---------- */
if (opt.list) {
  const workflows = wf.listWorkflows(root), runs = wf.listRuns(root).filter(r => !r.ended);
  if (opt.json) { json({ workflows, runs }); process.exit(0); }
  const lines = ["workflows:", ...workflows.map(w => w.ok ? `- ${w.slug}: ${w.title} [${w.status}], ${w.steps.length} steps (${w.path})` : `- ${w.slug}: does not parse: ${w.problems.join("; ")} (${w.path})`)];
  if (!workflows.length) lines.push("- none yet: a workflow is a document in workflows/ with type: workflow (see WORKFLOWS.md)");
  lines.push(runs.length ? "runs in progress:" : "runs in progress: none.");
  for (const r of runs) { const w = wf.readWorkflow(root, r.workflow), s = r.current; lines.push(`- ${r.id} in ${r.contextTitle}: ${s ? `step ${s.n} of ${w?.ok ? w.steps.length : r.steps.length}, ${w?.ok ? w.steps[s.n - 1]?.title : "step"}, ${stateLine(s)}` : "no step pending"}${r.open ? " (gate question open)" : ""}`); }
  console.log(lines.join("\n")); process.exit(0);
}

/* ---------- start ---------- */
if (opt.start) {
  needBy();
  const ctx = lib.readContext(root, String(opt.context || ""), { includeMemories: false }); if (!ctx) refuse(`no such context: ${opt.context || "(none)"}`);
  if (ctx.status !== "active") refuse(`context ${ctx.slug} is ${ctx.status}; a run needs an active context`);
  const w = loaded(String(opt.start), ctx.slug);
  if (!String(opt.handle || "").trim()) refuse("--handle is required: what this run is called, one to three words");
  const settled = parseJSON(opt.settled, "settled"), missing = w.settle.filter(s => !String(settled[s.label] || "").trim()).map(s => s.label);
  if (missing.length) refuse(`not settled: ${missing.join(", ")}. Ask through question, then start.`);
  const today = wf.localDate(), id = wf.runId(w.slug, today, opt.handle);
  if (wf.runState(root, id)) refuse(`run ${id} already exists; pick another handle or continue it with --status`);
  write(ctx.slug, { content: `Started workflow "${w.title}" as run ${id} on ${today}.\n${w.settle.map(s => `- ${s.label}: ${String(settled[s.label]).trim()}`).join("\n")}`, tags: [...baseTags(w.slug, id), "run-start"] });
  const first = wf.stepDue(w.steps[0], today);
  stepRecord(w, w.steps[0], first, id, `Starts now. ${w.steps[0].text}`);
  if (first.ask) gateQuestion(w, w.steps[0], id, first.ask);
  finish(ctx.slug, `workflow: start ${id}`, `started ${id} in ${ctx.title}: step 1 of ${w.steps.length}, ${w.steps[0].title}, ${stateLine(first)}${first.ask ? `; asked: ${first.ask}` : ""}`);
  process.exit(0);
}

/* ---------- status ---------- */
if (opt.status) {
  const r = wf.runState(root, String(opt.status)); if (!r) refuse(`no run "${opt.status}"; runs: ${wf.listRuns(root).map(x => x.id).join(", ") || "none"}`);
  const w = wf.readWorkflow(root, r.workflow);
  if (opt.json) { json({ ...r, workflow: w }); process.exit(0); }
  const total = w?.ok ? w.steps.length : r.steps.length;
  const lines = [`run ${r.id}: ${w?.ok ? w.title : r.workflow} in ${r.contextTitle}, started ${String(r.startedAt || "").slice(0, 10)} by ${r.by || "unknown"}, ${r.ended ? r.ended.how : "in progress"}`];
  if (w && !w.ok) lines.push(`the workflow file does not parse (${w.problems.join("; ")}); the run keeps its step numbers`);
  for (let n = 1; n <= Math.max(total, r.steps.length); n++) {
    const def = w?.ok ? w.steps[n - 1] : null, s = r.steps.find(x => x.n === n);
    const gate = def?.gate ? ` (gate: ${def.gate.kind === "after" ? `after ${def.gate.days} days` : def.gate.kind === "on" ? `on ${def.gate.date}` : `when ${def.gate.condition}`})` : "";
    lines.push(`${n}. ${def ? def.title : "(no longer in the workflow)"}: ${s ? stateLine(s) : "not started"}${!s ? gate : ""}`);
  }
  if (r.open) lines.push(`waiting on you: ${r.open.content} (question ${r.open.memory})`);
  if (r.brief) lines.push(`brief:\n${r.brief.split("\n").slice(1).join("\n")}`);
  if (r.ended) lines.push(`ended: ${r.ended.content}`);
  else if (r.current) lines.push(r.current.status === "due" ? `next: do step ${r.current.n} in this chat through the connected tools, then workflow advance with step ${r.current.n}.` : `next: nothing until ${r.current.due}; the session and the schedule mark it due.`);
  console.log(lines.join("\n")); process.exit(0);
}

refuse("pass --list, --start, --status, --advance, --skip, --abandon or --due");

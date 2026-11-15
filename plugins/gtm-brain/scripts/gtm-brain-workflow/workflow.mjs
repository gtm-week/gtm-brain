#!/usr/bin/env node
// Workflows: a run of a workflow document as dated memories (lib/workflows.mjs is the format, lib/workflow-triggers.mjs
// the triggers and the check; this is the only writer).
//   node workflow.mjs <root> --list [--json]
//   node workflow.mjs <root> --view                                  the people's read: query workflows
//   node workflow.mjs <root> --create "<title>" --body "<## Before starting / ## Steps / ## Learn>" [--applies-to "a, b"] [--trigger "..."] [--reads "kind:x, tool:crm"] [--writes "..."] [--context <slug>] --by <handle>
//   node workflow.mjs <root> --check <slug>                          header, schema, skills, milestones, trigger clash, and a dry run; writes nothing
//   node workflow.mjs <root> --needs <skill or workflow>             what it needs that SCHEMA.md and admin.md lack: one proposal; writes nothing
//   node workflow.mjs <root> --activate <slug> --by <handle>         the check, then status: active in the header
//   node workflow.mjs <root> --pause <slug> | --resume <slug> --by <handle>
//   node workflow.mjs <root> --start <slug> [--event <id>] --context <ctx> --handle "<name>" --settled '{"Label":"answer"}' --by <handle>
//   node workflow.mjs <root> --dismiss <slug> --event <id> --reason "..." --by <handle>
//   node workflow.mjs <root> --status <run-id> [--json]
//   node workflow.mjs <root> --advance <run-id> --step <n> [--note "..."] [--answer "..."] [--actions "tool:action:ref,..."] [--learned '{"item":"..."}'] --by <handle>
//   node workflow.mjs <root> --skip <run-id> --step <n> --reason "..." --by <handle>
//   node workflow.mjs <root> --move <run-id> --step <n> --to YYYY-MM-DD --by <handle>
//   node workflow.mjs <root> --fail <run-id> --step <n> --reason "..." --by <handle>
//   node workflow.mjs <root> --pause-run <run-id> --reason "..." | --resume-run <run-id> --by <handle>
//   node workflow.mjs <root> --cancel <run-id> --reason "..." --by <handle>      (--abandon: the same, older word)
//   node workflow.mjs <root> --due [--today YYYY-MM-DD] --by <handle|schedule|session>
// Nothing here calls a connector: the chat does the step through its tools, then records it with --advance.
// Every write goes through lib.appendMemory and commits through lib.commit; the JSONL only grows.
// An automatic check (--by schedule or session) writes with via schedule and that word as the author.
import { existsSync, realpathSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const wf = await import(new URL("../../lib/workflows.mjs", import.meta.url));
const tr = await import(new URL("../../lib/workflow-triggers.mjs", import.meta.url));
const args = process.argv.slice(2); const root = realpathSync(resolve(args[0] && !args[0].startsWith("--") ? args.shift() : "."));
if (!lib.isBrain(root)) { console.error("no brain here (brain/admin.md missing)."); process.exit(1); }
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { const k = args[i].slice(2), v = args[i + 1]; if (v === undefined || v.startsWith("--")) opt[k] = true; else { opt[k] = v; i++; } }
const refuse = why => { console.error(why); process.exit(2); };
for (const flag of ["create", "body", "applies-to", "start", "context", "handle", "settled", "by", "status", "advance", "step", "note", "answer", "actions", "learned", "skip", "abandon", "cancel", "reason", "today", "check", "needs", "activate", "pause", "resume", "event", "dismiss", "move", "to", "fail", "pause-run", "resume-run", "trigger", "reads", "writes"]) if (opt[flag] === true) refuse(`--${flag} needs a value`);
const AUTOMATIC = new Set(["schedule", "session"]);
const by = opt.by === undefined ? null : AUTOMATIC.has(String(opt.by)) ? String(opt.by) : lib.teamHandle(root, String(opt.by));
if (opt.by !== undefined && !by) refuse(`"${opt.by}" is not in admin.md team`);
const via = AUTOMATIC.has(by) ? "schedule" : "codex";   // via is codex | human | schedule (lib validates); the author says session or schedule
const needBy = () => { if (!by) refuse("--by is required: the person's handle, or schedule / session for the automatic due check"); };
const json = obj => console.log(JSON.stringify(obj, null, 2));
const slugs = () => wf.listWorkflows(root).map(w => w.slug).join(", ") || "none";
const parseJSON = (text, flag) => { try { const v = JSON.parse(text || "{}"); if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(); return v; } catch { refuse(`--${flag} must be a JSON object`); } };
const parseActions = text => String(text || "").split(",").map(s => s.trim()).filter(Boolean).map(a => { const [tool, action, ...ref] = a.split(":"); return ref.length ? { tool, action, ref: ref.join(":") } : { tool, action }; });
const off = () => { if (wf.workflowsOff(root)) refuse("workflows are off in this brain (workflows: off in brain/admin.md); nothing is started or moved. Turning them on is a workplace change (gtm-brain-configure)."); };

/* ---------- records: the shapes a run is made of ---------- */
// depth:<n> only past the first link of a chain, so a run nobody started from another run keeps the 0.34 tags
const baseTags = (slug, id, depth = 1) => [`workflow:${slug}`, `run:${id}`, ...(depth > 1 ? [`depth:${depth}`] : [])];
const write = (ctx, fields) => lib.appendMemory(root, ctx, { authors: [by], via, kind: "note", ...fields }).rec;
const stateLine = s => s.status === "due" ? "due now" : s.status === "pending" ? (s.due ? `waiting, due ${s.due}` : s.wait ? `waiting for ${wf.milestoneText(s.wait)}` : "waiting") : s.status;
const stepRecord = (w, step, state, id, note, extra = {}, depth = 1, more = []) => write(w.context, {
  content: `Step ${step.n} of ${w.steps.length}, ${step.title}: ${stateLine(state)}. ${note}`.trim(),
  tags: [...baseTags(w.slug, id, depth), `step:${step.n}`, `step-status:${state.status}`, ...(state.due && (state.status === "pending" || state.status === "due") ? [`due:${state.due}`] : []), ...more], ...extra });
const gateQuestion = (w, step, id, condition, depth = 1) => write(w.context, { kind: "question", content: `Run ${id}, step ${step.n} (${step.title}): ${condition}? Answer this to move the run on.`, tags: [...baseTags(w.slug, id, depth), `step:${step.n}`, "gate", "brain-question"] });
const finish = (ctx, message, line) => { const c = lib.commit(root, [`brain/contexts/${ctx}/memories.jsonl`, ...lib.ENTITIES_PATHS], message); lib.logActivity(root, "workflow", message); lib.rerender(root); console.log(`${line} (${c.note})`); };
const loaded = (slug, ctx) => { const w = wf.readWorkflow(root, slug); if (!w) refuse(`no workflow "${slug}"; workflows: ${slugs()}`); if (!w.ok) refuse(`${w.path} does not parse: ${w.problems.join("; ")}. Fix the file by hand.`); return { ...w, context: ctx }; };
const milestoneTag = def => def?.milestone?.kind === "tag" ? [def.milestone.tag] : [];

/* The header is the person's: only status and active_since change, line by line, and only on a command. */
function setHeader(w, changes, message) {
  const path = join(root, w.path); let text = readFileSync(path, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---/); if (!m) refuse(`${w.path} has no frontmatter`);
  let fm = m[1];
  for (const [k, v] of Object.entries(changes)) {
    const line = `${k}: ${/[:#"]/.test(v) ? JSON.stringify(v) : v}`, re = new RegExp(`^${k}:.*$`, "m");
    fm = re.test(fm) ? fm.replace(re, () => line) : `${fm}\n${line}`;
  }
  text = text.replace(m[0], () => `---\n${fm}\n---`); writeFileSync(path, text);   // a function: $& and $$ in a title are text, not patterns
  const c = lib.commit(root, [w.path], message); lib.logActivity(root, "workflow", message); lib.rerender(root);
  return c;
}

/* ---------- list, view ---------- */
if (opt.list) {
  const workflows = wf.listWorkflows(root), runs = wf.listRuns(root).filter(r => !r.ended);
  if (opt.json) { json({ workflows, runs }); process.exit(0); }
  const lines = ["workflows:", ...workflows.map(w => w.ok ? `- ${w.slug}: ${w.title} [${tr.effectiveStatus(root, w).status}], ${w.steps.length} steps${w.header.trigger.kind !== "manual" ? `, trigger: ${wf.triggerText(w.header.trigger)}` : ""} (${w.path})` : `- ${w.slug}: does not parse: ${w.problems.join("; ")} (${w.path})`)];
  if (!workflows.length) lines.push("- none yet: a workflow is a document in workflows/ with type: workflow (see WORKFLOWS.md)");
  lines.push(runs.length ? "runs in progress:" : "runs in progress: none.");
  for (const r of runs) { const w = wf.readWorkflow(root, r.workflow), s = r.current; lines.push(`- ${r.id} in ${r.contextTitle}: ${!wf.isLive(r) ? `context ${r.contextStatus}; bring it back to continue` : r.paused ? "paused" : s ? `step ${s.n} of ${w?.ok ? w.steps.length : r.steps.length}, ${w?.ok ? w.steps[s.n - 1]?.title : "step"}, ${stateLine(s)}` : "no step pending"}${r.open && wf.isLive(r) ? " (gate question open)" : ""}`); }
  console.log(lines.join("\n")); process.exit(0);
}
if (opt.view) { console.log(tr.viewText(root)); process.exit(0); }

/* ---------- create: a new workflow document (a "playbook" is a workflow) ---------- */
// Written as a draft in workflows/<slug>.md, in the shipped drafts' format, and kept only when it parses:
// a workflow that cannot start is never left behind. An existing file is the person's: never replaced.
if (opt.create) {
  needBy();
  const docs = await import(new URL("../../lib/documents.mjs", import.meta.url));
  const title = String(opt.create).trim(), slug = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  const applies = opt["applies-to"] || title.toLowerCase(), body = String(opt.body || "");
  const invalid = docs.validateDocument({ slug, title, applies_to: applies, body, status: "draft", folder: "workflows", root });
  if (invalid) refuse(invalid);
  const path = `workflows/${slug}.md`;
  if (existsSync(join(root, path))) refuse(`${path} exists already; the person edits it, or give the new workflow another title`);
  const list = v => String(v || "").split(",").map(s => s.trim()).filter(Boolean);
  const header = { type: wf.TYPE, trigger: String(opt.trigger || "manual"), reads: list(opt.reads), writes: list(opt.writes), ...(opt.context ? { context: String(opt.context) } : {}) };
  const h = wf.parseHeader({ ...header, status: "draft" }); if (h.problems.length) refuse(`not written: ${h.problems.join("; ")}`);
  let version = ""; try { version = JSON.parse(readFileSync(new URL("../../.codex-plugin/plugin.json", import.meta.url), "utf8")).version; } catch {}
  docs.writeDocument(root, { path, title, applies_to: applies, status: "draft", by, version, body, extra: header });
  const w = wf.readWorkflow(root, slug);
  if (!w?.ok) { (await import("node:fs")).rmSync(join(root, path), { force: true }); refuse(`not written, the workflow would not parse: ${(w?.problems || ["unreadable"]).join("; ")}`); }
  const c = lib.commit(root, [path], `workflow: create ${slug}`); lib.logActivity(root, "workflow", `created ${path}`); lib.rerender(root);
  const check = tr.checkWorkflow(root, w);
  console.log(`created ${path}: ${w.title}, ${w.steps.length} steps, draft, trigger ${wf.triggerText(w.header.trigger)} (${c.note}). Start a run with: start the ${slug} workflow.${check.ok ? " It passes the check: workflow activate switches its trigger on." : ` Before it can be active: ${check.problems.join("; ")}.`}`); process.exit(0);
}

/* ---------- check, needs, activate, pause, resume: the workflow itself ---------- */
const checkText = (w, check, dry) => [
  `check ${w.slug}: ${check.ok ? "passes" : `${check.problems.length} problem${check.problems.length === 1 ? "" : "s"}`}; status ${tr.effectiveStatus(root, w).status}, trigger ${wf.triggerText(w.header.trigger)}`,
  ...check.problems.map(p => `- ${p}`), ...check.warnings.map(p => `- note: ${p}`),
  ...(dry ? [`dry run (nothing written), example: ${dry.exampleText}${dry.context ? `, context ${dry.context}` : ""}`, `  would read: ${dry.reads.join("; ") || "nothing listed"}`, `  would write: ${dry.writes.join("; ")}`] : []),
].join("\n");
if (opt.check) {
  const w = wf.readWorkflow(root, String(opt.check)); if (!w) refuse(`no workflow "${opt.check}"; workflows: ${slugs()}`);
  const check = tr.checkWorkflow(root, w);
  console.log(checkText(w, check, w.ok ? tr.dryRun(root, w) : null)); process.exit(0);
}
if (opt.needs) {
  const name = String(opt.needs), w = wf.readWorkflow(root, name), skill = w ? null : tr.findSkill(root, name);
  if (!w && !skill) refuse(`no workflow or skill "${name}"; workflows: ${slugs()}`);
  if (w && !w.ok) refuse(`${w.path} does not parse: ${w.problems.join("; ")}`);
  const items = w ? [...tr.workflowItems(w), ...w.steps.flatMap(s => s.skill ? tr.findSkill(root, s.skill)?.needs || [] : [])] : skill.needs;
  if (!items.length) { console.log(`${w ? w.slug : skill.id}: declares no needs${skill ? " (no needs line in its metadata)" : ""}.`); process.exit(0); }
  console.log(tr.needsProposal(w ? `workflow ${w.slug}` : `skill ${skill.id}`, tr.compareNeeds(root, items))); process.exit(0);
}
if (opt.activate || opt.resume) {
  needBy(); off();
  const slug = String(opt.activate || opt.resume), w = wf.readWorkflow(root, slug); if (!w) refuse(`no workflow "${slug}"; workflows: ${slugs()}`);
  const check = tr.checkWorkflow(root, w);
  if (!check.ok) refuse(`${checkText(w, check, null)}\nNot switched on. ${check.needs.missing.some(m => !m.tool) ? tr.needsProposal(`workflow ${w.slug}`, { missing: check.needs.missing.filter(m => !m.tool) }) : ""}`.trim());
  const dry = tr.dryRun(root, w);
  if (w.header.status === "active" && !tr.effectiveStatus(root, w).flag) { console.log(`${w.slug} is already active (trigger ${wf.triggerText(w.header.trigger)}).`); process.exit(0); }
  const c = setHeader(w, { status: "active", active_since: new Date().toISOString().slice(0, 19) + "Z" }, `workflow: ${w.slug} active`);
  console.log(`${w.slug} is active: trigger ${wf.triggerText(w.header.trigger)}; matching events are offered at the next chat start, never run silently. Example: ${dry.exampleText}. (${c.note})`); process.exit(0);
}
if (opt.pause) {
  needBy();
  const w = wf.readWorkflow(root, String(opt.pause)); if (!w) refuse(`no workflow "${opt.pause}"; workflows: ${slugs()}`); if (!w.ok) refuse(`${w.path} does not parse: ${w.problems.join("; ")}`);
  if (w.header.status === "paused") { console.log(`${w.slug} is already paused.`); process.exit(0); }
  const c = setHeader(w, { status: "paused" }, `workflow: ${w.slug} paused`);
  console.log(`${w.slug} is paused: nothing is offered and its runs wait; workflow resume switches it back on after the check. (${c.note})`); process.exit(0);
}

/* ---------- start ---------- */
if (opt.start) {
  needBy(); off();
  const raw = wf.readWorkflow(root, String(opt.start)); if (!raw) refuse(`no workflow "${opt.start}"; workflows: ${slugs()}`);
  if (raw.ok && raw.header.status === "paused") refuse(`${raw.slug} is paused; workflow resume switches it back on`);
  const held = raw.ok ? tr.effectiveStatus(root, raw).flag : null;
  if (held) refuse(`${raw.slug} is held: ${held}. Fix the header, or the schema through /gtm-brain-schema, then workflow check`);
  let ev = null;
  if (opt.event) {
    const id = String(opt.event), offer = tr.pendingOffers(root).find(o => o.workflow.slug === raw.slug);
    ev = offer?.events.find(e => e.id === id) || null;
    if (!ev) {
      const takenBy = wf.listRuns(root).find(r => r.workflow === raw.slug && r.event === id);
      refuse(takenBy ? `event ${id} was taken by run ${takenBy.id}; the same event starts a workflow once` : `event ${id} is not waiting for ${raw.slug} (query workflows lists what is)`);
    }
  }
  let ctxSlug = opt.context ? String(opt.context) : ev?.context || raw.header?.context || "";
  if (!ctxSlug && ev?.memory) ctxSlug = lib.listContexts(root).find(c => (c.memories || []).some(m => m.id === ev.memory))?.slug || "";
  const ctx = lib.readContext(root, ctxSlug, { includeMemories: false }); if (!ctx) refuse(`no such context: ${ctxSlug || "(none)"}`);
  if (ctx.status !== "active") refuse(`context ${ctx.slug} is ${ctx.status}; a run needs an active context`);
  const w = loaded(raw.slug, ctx.slug);
  const handle = String(opt.handle || "").trim() || (ev ? ev.name || ev.date || "" : "");
  if (!handle) refuse("--handle is required: what this run is called, one to three words");
  const live = wf.listRuns(root).filter(r => r.workflow === w.slug && wf.isLive(r));
  if (live.length >= wf.LIMITS.activeRunsPerWorkflow) refuse(`${w.slug} has ${live.length} runs active (${live.map(r => r.id).join(", ")}); the limit is ${wf.LIMITS.activeRunsPerWorkflow}. Finish, cancel or pause one first.`);
  const depth = ev ? (ev.depth || 0) + 1 : 1;
  if (depth > wf.LIMITS.chainDepth) refuse(`not started: workflows starting each other stop at depth ${wf.LIMITS.chainDepth}`);
  const settled = parseJSON(opt.settled, "settled"), missing = w.settle.filter(s => !String(settled[s.label] || "").trim()).map(s => s.label);
  if (missing.length) refuse(`not settled: ${missing.join(", ")}. Ask through question, then start.`);
  const today = wf.localDate(); let id = wf.runId(w.slug, today, handle);
  if (wf.runState(root, id)) { if (!ev) refuse(`run ${id} already exists; pick another handle or continue it with --status`); const stem = id; for (let i = 2; wf.runState(root, id); i++) id = `${stem}-${i}`; }   // two events about one entity on one day
  const evTags = ev ? [`${wf.EVENT_TAG}${ev.id}`, ...(ev.entity ? [`${wf.SUBJECT_TAG}${ev.entity}`] : [])] : [];
  write(ctx.slug, { content: `Started workflow "${w.title}" as run ${id} on ${today}.${ev ? ` Started by ${tr.eventLabel(ev)} (event ${ev.id}).` : ""}${w.settle.length ? "\n" : ""}${w.settle.map(s => `- ${s.label}: ${String(settled[s.label]).trim()}`).join("\n")}`,
    tags: [...baseTags(w.slug, id, depth), "run-start", ...evTags], ...(ev?.memory ? { source: [{ kind: "memory", ref: ev.memory }] } : {}) });
  const first = wf.stepDue(w.steps[0], today);
  stepRecord(w, w.steps[0], first, id, `Starts now. ${w.steps[0].text}`, {}, depth);
  if (first.ask) gateQuestion(w, w.steps[0], id, first.ask, depth);
  finish(ctx.slug, `workflow: start ${id}`, `started ${id} in ${ctx.title}: step 1 of ${w.steps.length}, ${w.steps[0].title}${w.steps[0].skill ? ` (skill ${w.steps[0].skill})` : ""}, ${stateLine(first)}${first.ask ? `; asked: ${first.ask}` : ""}${w.steps[0].milestone?.kind && w.steps[0].milestone.kind !== "invalid" ? `; done when ${wf.milestoneText(w.steps[0].milestone)}` : ""}. RULES.md binds every step`);
  process.exit(0);
}

/* ---------- dismiss: an offered event the person said no to, so no machine offers it again ---------- */
if (opt.dismiss) {
  needBy();
  if (!opt.event) refuse("--event is required: the event id the offer named");
  if (!String(opt.reason || "").trim()) refuse("--reason is required: why not, in the person's words");
  const w = wf.readWorkflow(root, String(opt.dismiss)); if (!w?.ok) refuse(`no workflow "${opt.dismiss}" that parses; workflows: ${slugs()}`);
  const offer = tr.pendingOffers(root).find(o => o.workflow.slug === w.slug), ev = offer?.events.find(e => e.id === String(opt.event));
  if (!ev) refuse(`event ${opt.event} is not waiting for ${w.slug}`);
  const ctxSlug = ev.context || w.header.context || "company";
  if (!lib.readContext(root, ctxSlug, { includeMemories: false })) refuse(`no such context: ${ctxSlug}`);
  write(ctxSlug, { content: `Not starting workflow "${w.title}" for ${tr.eventLabel(ev)}: ${String(opt.reason).trim()}`, tags: [`workflow:${w.slug}`, `event-dismissed:${ev.id}`], ...(ev.memory ? { source: [{ kind: "memory", ref: ev.memory }] } : {}) });
  finish(ctxSlug, `workflow: ${w.slug} event dismissed`, `${w.slug} will not be offered for ${tr.eventLabel(ev)} again`); process.exit(0);
}

/* ---------- status ---------- */
if (opt.status) {
  const r = wf.runState(root, String(opt.status)); if (!r) refuse(`no run "${opt.status}"; runs: ${wf.listRuns(root).map(x => x.id).join(", ") || "none"}`);
  const w = wf.readWorkflow(root, r.workflow);
  if (opt.json) { json({ ...r, workflow: w }); process.exit(0); }
  const total = w?.ok ? w.steps.length : r.steps.length;
  const lines = [`run ${r.id}: ${w?.ok ? w.title : r.workflow} in ${r.contextTitle}, started ${String(r.startedAt || "").slice(0, 10)} by ${r.by || "unknown"}, ${r.ended ? r.ended.how : r.paused ? "paused" : "in progress"}`];
  if (w && !w.ok) lines.push(`the workflow file does not parse (${w.problems.join("; ")}); the run keeps its step numbers`);
  for (let n = 1; n <= Math.max(total, r.steps.length); n++) {
    const def = w?.ok ? w.steps[n - 1] : null, s = r.steps.find(x => x.n === n);
    const gate = def?.gate ? ` (gate: ${def.gate.kind === "after" ? `after ${def.gate.days} days` : def.gate.kind === "on" ? `on ${def.gate.date}` : `when ${def.gate.condition}`})` : "";
    lines.push(`${n}. ${def ? def.title : "(no longer in the workflow)"}${def?.skill ? ` [skill ${def.skill}]` : ""}: ${s ? stateLine(s.status === "pending" && !s.due && def?.gate?.milestone ? { ...s, wait: def.gate.milestone } : s) : "not started"}${!s ? gate : ""}`);
  }
  if (r.open) lines.push(`waiting on you: ${r.open.content} (question ${r.open.memory})`);
  if (r.brief) lines.push(`brief:\n${r.brief.split("\n").slice(1).join("\n")}`);
  if (r.duplicateOf) lines.push(`a second run of the same event: ${r.duplicateOf} took it first; cancel this one`);
  const curDef = r.current && w?.ok ? w.steps[r.current.n - 1] : null;
  if (!r.ended && curDef?.milestone && curDef.milestone.kind !== "invalid") lines.push(`step ${r.current.n} is done when ${wf.milestoneText(curDef.milestone)}`);
  if (r.ended) lines.push(`ended: ${r.ended.content}`);
  else if (!wf.isLive(r)) lines.push(`context ${r.contextStatus}: bring ${r.contextTitle} back to continue this run; nothing is due while it is ${r.contextStatus}.`);
  else if (r.paused) lines.push(`paused: ${r.paused.content}. workflow resume_run continues it.`);
  else if (r.current) lines.push(r.current.status === "due" ? `next: do step ${r.current.n} in this chat through the connected tools${w?.ok && w.steps[r.current.n - 1]?.skill ? ` (skill ${w.steps[r.current.n - 1].skill})` : ""}, then workflow advance with step ${r.current.n}.` : r.current.due ? `next: nothing until ${r.current.due}; the session and the schedule mark it due.` : `next: nothing until the milestone; the session and the schedule watch for it.`);
  console.log(lines.join("\n")); process.exit(0);
}

/* ---------- a run to move: shared checks ---------- */
const liveRun = (id, { paused = false } = {}) => {
  const r = wf.runState(root, String(id)); if (!r) refuse(`no run "${id}"; runs: ${wf.listRuns(root).map(x => x.id).join(", ") || "none"}`);
  if (r.ended) refuse(`run ${r.id} ended (${r.ended.how}) on ${String(r.ended.at).slice(0, 10)}; start a new run`);
  const ctx = lib.readContext(root, r.context, { includeMemories: false });
  if (!ctx || ctx.status !== "active") refuse(`context ${r.context} is ${ctx ? ctx.status : "missing"}; bring it back before advancing`);
  if (r.paused && !paused) refuse(`run ${r.id} is paused (${r.paused.content}); workflow resume_run continues it`);
  return { r, ctx, w: loaded(r.workflow, r.context) };
};
const currentStep = (r, w) => {
  const n = Number(opt.step); if (!Number.isInteger(n) || n < 1) refuse("--step needs the current step's number");
  const s = r.steps.find(x => x.n === n), cur = r.current;
  if (!cur) refuse(`run ${r.id} has no step pending`);
  if (n !== cur.n) refuse(`step ${n} is ${s ? s.status : "not started"}; the current step is ${cur.n}`);
  // a pending step whose date has passed is due, whether or not the due check ran yet: the opening line already counts it
  if (cur.status === "pending" && !(cur.due && cur.due <= wf.localDate())) refuse(cur.due ? `step ${n} is waiting until ${cur.due}; workflow due marks it, or skip it` : `step ${n} is waiting for its gate; the brain marks it due when it is reached, or skip it`);
  const def = w.steps[n - 1]; if (!def) refuse(`the workflow no longer has step ${n}; skip it`);
  return { n, cur, def };
};
/* After a step closes: the next step opens with its gate, or the run ends with the learn list. Returns the line to print. */
const openNext = (r, w, n, today, closingLine) => {
  const next = w.steps[n];
  if (!next) {
    const learned = parseJSON(opt.learned, "learned");
    write(w.context, { kind: "decision", content: `Run ${r.id} finished on ${today}. Learn:\n${w.learn.map(l => `- ${l}: ${String(learned[l] || "").trim() || "not read back yet"}`).join("\n")}`, tags: [...baseTags(w.slug, r.id, r.depth), "run-done"] });
    return `${closingLine}; run ${r.id} finished. Read back: ${w.learn.join("; ") || "nothing listed"}`;
  }
  let st = wf.stepDue(next, today);
  // a gate on a named milestone: reached already in this run (since it started), the step is due at once
  const reached = st.wait ? tr.milestoneEvidence(root, st.wait, { since: r.startedAt, subject: r.subject, run: r.id, context: r.context }) : null;
  if (reached) st = { status: "due", due: today };
  stepRecord(w, next, st, r.id, st.status === "pending" ? `Waiting for the gate. ${next.text}` : `Ready now.${reached ? ` Gate reached: ${reached.what}.` : ""} ${next.text}`, {}, r.depth);
  if (st.ask) gateQuestion(w, next, r.id, st.ask, r.depth);
  return `${closingLine}; step ${next.n} of ${w.steps.length}, ${next.title}${next.skill ? ` (skill ${next.skill})` : ""}, ${stateLine(st)}${st.ask ? `; asked: ${st.ask}` : ""}`;
};

/* ---------- advance ---------- */
// The step's milestone: a tag is carried by the advance record itself (the advance note is the milestone); a link,
// a field or a document has to be there already, or the step is not done.
if (opt.advance) {
  needBy(); off();
  const { r, ctx, w } = liveRun(opt.advance), { n, cur, def } = currentStep(r, w), today = wf.localDate();
  if (def.milestone && !["tag", "invalid"].includes(def.milestone.kind) && !tr.milestoneEvidence(root, def.milestone, { since: r.opened[n], subject: r.subject, run: r.id, context: r.context, step: n }))
    refuse(`step ${n} is done when ${wf.milestoneText(def.milestone)}, and the brain does not see it yet. Do that first (save it, compile the brief, write the document), or skip the step with a reason.`);
  stepRecord(w, def, { status: "done" }, r.id, `Done on ${today}. ${String(opt.note || "").trim()}${opt.answer ? ` Gate answer: ${String(opt.answer).trim()}` : ""}`.trim(),
    { supersedes: cur.memory, retracts: r.open?.step === n ? r.open.memory : null, actions: parseActions(opt.actions) }, r.depth, milestoneTag(def));
  finish(ctx.slug, `workflow: ${r.id} step ${n} done`, openNext(r, w, n, today, `step ${n} done`));
  process.exit(0);
}

/* ---------- skip, move, fail ---------- */
if (opt.skip) {
  needBy();
  if (!String(opt.reason || "").trim()) refuse("--reason is required: why this step is skipped");
  const { r, ctx, w } = liveRun(opt.skip), today = wf.localDate();
  const n = Number(opt.step), cur = r.current; if (!cur || n !== cur.n) refuse(`step ${n} is ${r.steps.find(x => x.n === n)?.status || "not started"}; the current step is ${cur?.n ?? "none"}`);
  const def = w.steps[n - 1] || { n, title: "(no longer in the workflow)", text: "" };
  stepRecord(w, def, { status: "skipped" }, r.id, `Skipped on ${today}: ${String(opt.reason).trim()}`, { supersedes: cur.memory, retracts: r.open?.step === n ? r.open.memory : null }, r.depth);
  finish(ctx.slug, `workflow: ${r.id} step ${n} skipped`, openNext(r, w, n, today, `step ${n} skipped (${String(opt.reason).trim()})`));
  process.exit(0);
}
if (opt.move) {
  needBy();
  const to = String(opt.to || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(Date.parse(`${to}T12:00:00Z`))) refuse("--to must be a date, YYYY-MM-DD");
  const { r, ctx, w } = liveRun(opt.move), today = wf.localDate();
  const n = Number(opt.step), cur = r.current; if (!cur || n !== cur.n) refuse(`step ${n} is not the current step; the current step is ${cur?.n ?? "none"}`);
  const def = w.steps[n - 1] || { n, title: "(no longer in the workflow)", text: "" }, st = { status: to <= today ? "due" : "pending", due: to };
  stepRecord(w, def, st, r.id, `Moved on ${today} from ${cur.due || "no date"} to ${to}${opt.reason ? `: ${String(opt.reason).trim()}` : ""}.`, { supersedes: cur.memory }, r.depth);
  finish(ctx.slug, `workflow: ${r.id} step ${n} moved to ${to}`, `step ${n} of ${r.id} moved to ${to}, ${stateLine(st)}`);
  process.exit(0);
}
if (opt.fail) {
  needBy();
  if (!String(opt.reason || "").trim()) refuse("--reason is required: what went wrong, word for word when a tool said it");
  const { r, ctx, w } = liveRun(opt.fail, { paused: true });
  const n = Number(opt.step), cur = r.current; if (!cur || n !== cur.n) refuse(`step ${n} is not the current step; the current step is ${cur?.n ?? "none"}`);
  const def = w.steps[n - 1] || { n, title: "(no longer in the workflow)", text: "" };
  write(w.context, { kind: "decision", content: `Run ${r.id} stopped on ${wf.localDate()}: step ${n} (${def.title}) failed: ${String(opt.reason).trim()}`, tags: [...baseTags(w.slug, r.id, r.depth), `step:${n}`, "run-failed", "run-abandoned"], supersedes: cur.memory, retracts: r.open?.memory || null });
  finish(ctx.slug, `workflow: ${r.id} failed at step ${n}`, `run ${r.id} stopped: step ${n} (${def.title}) failed: ${String(opt.reason).trim()}. Start a new run once it is fixed`);
  process.exit(0);
}

/* ---------- pause, resume, cancel a run ---------- */
if (opt["pause-run"] || opt["resume-run"]) {
  needBy();
  const pausing = !!opt["pause-run"], { r, ctx, w } = liveRun(opt["pause-run"] || opt["resume-run"], { paused: true });
  if (pausing && r.paused) { console.log(`run ${r.id} is already paused.`); process.exit(0); }
  if (!pausing && !r.paused) { console.log(`run ${r.id} is not paused.`); process.exit(0); }
  if (pausing && !String(opt.reason || "").trim()) refuse("--reason is required: why the run waits");
  write(w.context, { content: pausing ? `Run ${r.id} paused on ${wf.localDate()}: ${String(opt.reason).trim()}` : `Run ${r.id} resumed on ${wf.localDate()}${opt.reason ? `: ${String(opt.reason).trim()}` : ""}.`, tags: [...baseTags(w.slug, r.id, r.depth), pausing ? "run-paused" : "run-resumed"] });
  finish(ctx.slug, `workflow: ${r.id} ${pausing ? "paused" : "resumed"}`, pausing ? `run ${r.id} paused: nothing is marked due or moved until it is resumed` : `run ${r.id} resumed${r.current ? `: step ${r.current.n}, ${stateLine(r.current)}` : ""}`);
  process.exit(0);
}
if (opt.abandon || opt.cancel) {
  needBy();
  if (!String(opt.reason || "").trim()) refuse("--reason is required: why this run stops");
  const { r, ctx, w } = liveRun(opt.abandon || opt.cancel, { paused: true }), word = opt.cancel ? "cancelled" : "abandoned";
  write(w.context, { kind: "decision", content: `Run ${r.id} ${word} on ${wf.localDate()}: ${String(opt.reason).trim()}`, tags: [...baseTags(w.slug, r.id, r.depth), `run-${word}`, ...(word === "cancelled" ? ["run-abandoned"] : [])], retracts: r.open?.memory || null });
  finish(ctx.slug, `workflow: ${r.id} ${word}`, `run ${r.id} ${word}: ${String(opt.reason).trim()}`);
  process.exit(0);
}

/* ---------- due: the automatic check (session maintenance, the schedule), idempotent ---------- */
// Per run, at most LIMITS.stepsPerDay steps a day: a date gate passed marks the step due and asks (as before);
// a named-milestone gate reached marks it due; a due step whose milestone the brain sees is recorded done (the
// milestone note) and the next one opens. Offers are printed, never started: a person says yes in a chat.
if (opt.due) {
  needBy();
  const today = String(opt.today || wf.localDate()); if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) refuse("--today must be YYYY-MM-DD");
  if (wf.workflowsOff(root)) { console.log("workflows are off (workflows: off in brain/admin.md): nothing checked"); process.exit(0); }
  const lines = [], touched = new Set(), commitRun = (ctx, msg) => { const c = lib.commit(root, [`brain/contexts/${ctx}/memories.jsonl`, ...lib.ENTITIES_PATHS], msg); lib.logActivity(root, "workflow", msg); touched.add(ctx); return c; };
  // steps the automatic check closed in this run on this machine's day: the day the notes were written, whatever
  // --today says, and only the closing notes (the note that opens the next step is not a step moved)
  const realDay = wf.localDate();
  const stepsToday = r => lib.readMemories(root, r.context).filter(m => (m.tags || []).includes(`run:${r.id}`) && wf.localDate(new Date(m.at)) === realDay && m.authors?.some(a => AUTOMATIC.has(a)) && (m.tags || []).includes("step-status:done")).length;
  const wfCache = new Map(), wfOf = slug => { if (!wfCache.has(slug)) wfCache.set(slug, wf.readWorkflow(root, slug)); return wfCache.get(slug); };
  const raisedPath = join(root, "work", "workflow-raised.json"); let raised = {}; try { raised = JSON.parse(readFileSync(raisedPath, "utf8")); } catch {}
  for (const start of wf.listRuns(root).filter(wf.isMoving)) {
    const w = wfOf(start.workflow); if (!w?.ok) { if (start.current) lines.push(`skipped ${start.id}: ${w ? w.problems.join("; ") : "workflow file missing"}`); continue; }
    const eff = tr.effectiveStatus(root, w); if (eff.status === "paused") { if (start.current) lines.push(`held ${start.id}: ${w.slug} is paused${eff.flag ? ` (${eff.flag})` : ""}`); continue; }
    const ctx = lib.readContext(root, start.context, { includeMemories: false }); if (!ctx || ctx.status !== "active") { lines.push(`skipped ${start.id}: context ${start.context} is not active`); continue; }
    const wl = { ...w, context: start.context };
    for (let guard = 0; guard < 20; guard++) {
      const r = wf.runState(root, start.id), cur = r?.current; if (!cur) break;
      const def = w.steps[cur.n - 1]; if (!def) { lines.push(`skipped ${r.id}: the workflow no longer has step ${cur.n}`); break; }
      if (stepsToday(r) >= wf.LIMITS.stepsPerDay) { lines.push(`held ${r.id}: ${wf.LIMITS.stepsPerDay} automatic steps today, the limit; it moves on tomorrow`); break; }
      if (cur.status === "pending" && cur.due && cur.due <= today) {
        const ask = def.gate?.kind === "when" && !def.gate.milestone ? def.gate.condition : `the gate date ${cur.due} has passed; is it time for this step`;
        stepRecord(wl, def, { status: "due", due: cur.due }, r.id, `Due since ${cur.due}.`, { supersedes: cur.memory }, r.depth);
        gateQuestion(wl, def, r.id, ask, r.depth);
        const c = commitRun(r.context, `workflow: ${r.id} step ${cur.n} due`);
        lines.push(`due: ${r.id} step ${cur.n} (${def.title}), asked: ${ask} (${c.note})`); continue;
      }
      if (cur.status === "pending" && !cur.due && def.gate?.milestone) {
        const ev = tr.milestoneEvidence(root, def.gate.milestone, { since: r.startedAt, subject: r.subject, run: r.id, context: r.context }); if (!ev) break;
        stepRecord(wl, def, { status: "due", due: today }, r.id, `Gate reached: ${ev.what}.`, { supersedes: cur.memory, ...(ev.memory ? { source: [{ kind: "memory", ref: ev.memory }] } : {}) }, r.depth);
        const c = commitRun(r.context, `workflow: ${r.id} step ${cur.n} due`);
        lines.push(`due: ${r.id} step ${cur.n} (${def.title}), gate reached: ${ev.what} (${c.note})`); continue;
      }
      if (cur.status === "due" && def.milestone && def.milestone.kind !== "invalid") {
        const ev = tr.milestoneEvidence(root, def.milestone, { since: r.opened[cur.n], subject: r.subject, run: r.id, context: r.context, step: cur.n });
        if (ev) {
          stepRecord(wl, def, { status: "done" }, r.id, `Milestone reached on ${today}: ${ev.what}.`, { supersedes: cur.memory, retracts: r.open?.step === cur.n ? r.open.memory : null, ...(ev.memory ? { source: [{ kind: "memory", ref: ev.memory }] } : {}) }, r.depth, ["milestone-reached"]);
          const line = openNext(r, wl, cur.n, today, `milestone: ${r.id} step ${cur.n} (${def.title}) done, ${ev.what}`);
          const c = commitRun(r.context, `workflow: ${r.id} step ${cur.n} milestone reached`);
          lines.push(`${line} (${c.note})`); continue;
        }
        // not reached by its date: raised again, once a day at most (the opening line names it as due)
        const key = `${r.id}#${cur.n}`;
        if (cur.due && cur.due < today && raised[key] !== today) { raised[key] = today; lines.push(`raised: ${r.id} step ${cur.n} (${def.title}) due since ${cur.due}, waits for ${wf.milestoneText(def.milestone)}`); }
      }
      break;
    }
  }
  try { mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(raisedPath, JSON.stringify(raised) + "\n"); } catch {}
  for (const o of tr.pendingOffers(root)) lines.push(`offer: ${o.workflow.slug}, ${o.events.length} event${o.events.length === 1 ? "" : "s"} waiting${o.events[0] ? ` (newest ${o.events[0].id})` : ""}${o.held ? `, held: ${o.held}` : ""}; offered at the next chat start, never started here`);
  if (touched.size) lib.rerender(root);
  console.log(lines.length ? lines.join("\n") : "no step due");
  process.exit(0);
}

refuse("pass --list, --view, --create, --check, --needs, --activate, --pause, --resume, --start, --dismiss, --status, --advance, --skip, --move, --fail, --pause-run, --resume-run, --cancel or --due");

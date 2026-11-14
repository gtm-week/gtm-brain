#!/usr/bin/env node
// Opt-in live run of the mentor skills (deepdive, todo, define-icp, market desk research, unit
// economics, strategy) through the isolated Codex harness of tool-routing.mjs: codex exec, its own
// profile, the proxy that answers questions as the person. One row per case: pass or fail, tokens, time.
//   node plugins/gtm-brain/test/live/mentor-shapes.mjs                         the seeded routing brain
//   node plugins/gtm-brain/test/live/mentor-shapes.mjs --brain <dir> [--gold <gold.json>]
//   options: --cases a,b (case or skill names)  --json (print the rows as JSON)
// --brain is copied per case and never modified. Without it the existing skill and ICP cases run on
// the seeded brain, plus interview starts for the three skills that had no case. With --gold the
// deepdive picks the company with the most relations and the todo is checked against the open questions.
// Imported by tool-routing.mjs (GTM_BRAIN_EVAL_CASES) for its `cases`; run directly it drives that harness.
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

const WRITES = ["remember", "new_context", "fork_context", "archive_context", "edit_context", "compile_apply", "guideline", "document", "skill", "update_entity", "merge_entities", "archive_entity", "add_name", "interact", "save"];
const readOnly = c => (c.tool === "document" && ["list", "show", "files"].includes(c.arguments?.action)) || (["guideline", "skill"].includes(c.tool) && ["list", "show"].includes(c.arguments?.action));
export const noWrites = calls => !calls.some(c => WRITES.includes(c.tool) && !readOnly(c));
const unchanged = (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after);
const reads = calls => calls.some(c => ["query", "recall", "who_is", "load_context", "describe_object", "list_objects"].includes(c.tool));

/* gold.json is written by test/e2e/generate-brain.mjs; read it loosely, so a field rename costs a
   weaker prompt, not a crash. Companies: name plus relations; open questions: their text. */
const list = v => Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [];
const nameOf = x => typeof x === "string" ? x : x?.name || x?.title || x?.to || x?.target || x?.entity || "";
export function readGold(path) {
  const g = JSON.parse(readFileSync(path, "utf8"));
  // the generator's own format: gold.hub names the company with the most relations, gold.relations
  // carries from_name/to_name, and gold.questions.open holds note ids per context of the brain at
  // <out> for the ledger <out>.gold.json; the question text is read from that brain's memories
  if (g.hub?.name && g.questions?.open && Array.isArray(g.relations)) {
    const related = g.relations.filter(r => r.from === g.hub.id || r.to === g.hub.id)
      .map(r => r.from === g.hub.id ? r.to_name : r.from_name).filter(n => n && n !== "us");
    const ids = new Set(Object.values(g.questions.open).flat());
    const brain = path.replace(/\.gold\.json$/, ""), questions = [];
    for (const ctx of Object.keys(g.questions.open)) {
      const file = join(brain, "brain", "contexts", ctx, "memories.jsonl");
      if (!existsSync(file)) continue;
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try { const m = JSON.parse(line); if (ids.has(m.id) && m.content) questions.push(m.content); } catch {}
      }
    }
    return { companies: [{ name: g.hub.name, related: [...new Set(related)] }], questions };
  }
  const companies = list(g.companies || g.organizations || g.entities).filter(e => !e.kind || /org|company/i.test(e.kind))
    .map(e => ({ name: nameOf(e), related: list(e.relations || e.related || e.links || e.people || e.contacts).map(nameOf).filter(Boolean) }))
    .filter(e => e.name);
  const questions = list(g.open_questions || g.questions || g.openQuestions).map(q => typeof q === "string" ? q : q?.content || q?.text || q?.question || "").filter(Boolean);
  return { companies, questions };
}
// a salient word of a question: its longest word, so a paraphrase still matches
const salient = text => (text.match(/[A-Za-z][\w'-]{4,}/g) || []).sort((a, b) => b.length - a.length)[0] || text;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text, words) => words.filter(w => new RegExp(escape(w), "i").test(text)).length;

// an interview skill on any brain: it starts with one focused question and writes nothing yet.
// GTM Brain has had no question tool of its own since 0.34 (7ed4f4d), and codex exec has no question
// box, so the question is plain chat text that ends the turn: it is checked in the final message
// (wording), never as a tool call. Requiring a question tool call here failed every interview case.
const interview = (skill, prompt) => ({
  name: `mentor-${skill.replace(/^gtm-brain-/, "")}`, workflow: skill, judge: "advisory", answer: "later|stop|not now",
  prompt: `/${skill} ${prompt} Ask only your first focused question, then stop this turn. Do not save anything and do not research the web yet.`,
  calls: calls => noWrites(calls),
  verify: unchanged,
  responseCheck: text => /\?/.test(text),
  expect: "The skill starts its intake: it reuses what the brain already holds and asks one focused question. Nothing is written, no web research is run, no tool is claimed as checked.",
});

export function mentorCases({ gold } = {}) {
  const g = gold ? readGold(gold) : null;
  const hub = g?.companies.slice().sort((a, b) => b.related.length - a.related.length)[0];
  const open = g?.questions.slice(0, 8) || [];
  return [
    {
      name: "mentor-deepdive", workflow: "gtm-brain-deepdive", judge: "advisory",
      prompt: `/gtm-brain-deepdive Brief me on ${hub?.name || "our most important customer"} before the call. Do not save anything.`,
      calls: calls => noWrites(calls) && reads(calls),
      verify: unchanged,
      responseCheck: text => !hub || (new RegExp(escape(hub.name), "i").test(text) && mentions(text, hub.related.slice(0, 6)) >= Math.ceil(Math.min(6, hub.related.length) / 2)),
      expect: `One page on ${hub?.name || "the company the person means, or one question asking which"}: where it stands, a dated timeline with sources, the people and companies around it${hub ? ` (the brain links it to ${hub.related.slice(0, 6).join(", ")})` : ""}, what is open, one next step. No tool is connected; nothing is invented, nothing is written.`,
    },
    {
      name: "mentor-todo", workflow: "gtm-brain-todo", judge: "advisory", answer: "later|leave|skip|not now",
      prompt: "/gtm-brain-todo What is waiting on me?",
      calls: calls => noWrites(calls) && reads(calls),
      verify: unchanged,
      responseCheck: text => !open.length || mentions(text, open.map(salient)) >= Math.ceil(open.length / 2),
      expect: `A list of what is waiting, each item traced to a note${open.length ? `; the brain's open questions include: ${open.join(" | ")}` : ""}. The person answers later, so nothing is written.`,
    },
    interview("gtm-brain-define-icp", "Help define our ICP."),
    interview("gtm-brain-market-desk-research", "Assess our main market."),
    interview("gtm-brain-unit-economics", "Is our growth economically healthy?"),
    interview("gtm-brain-strategy", "Run the strategic intake."),
  ];
}

export const cases = process.env.GTM_BRAIN_MENTOR ? mentorCases({ gold: process.env.GTM_BRAIN_MENTOR_GOLD || undefined }) : [];

// the seeded routing brain already has cases for three of the six skills: reuse them
const SEEDED = ["skill-deepdive", "skill-todo", "skill-define-icp-interview", "skill-define-icp-update", "mentor-market-desk-research", "mentor-unit-economics", "mentor-strategy"];
const GIVEN = mentorCases().map(c => c.name);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const brain = opt("--brain"), gold = opt("--gold"), json = args.includes("--json");
  if (brain && !existsSync(join(resolve(brain), "brain", "admin.md"))) throw new Error(`${brain} is not a brain folder (no brain/admin.md)`);
  if (gold && !existsSync(resolve(gold))) throw new Error(`no gold file at ${gold}`);
  const pool = brain ? GIVEN : SEEDED;
  const asked = opt("--cases")?.split(",").filter(Boolean);
  const selected = asked ? pool.filter(n => asked.some(a => n === a || n.endsWith(a.replace(/^gtm-brain-/, "")) || n.includes(`-${a.replace(/^gtm-brain-/, "")}`))) : pool;
  if (!selected.length) throw new Error(`--cases must name some of ${pool.join(", ")}`);
  const env = { ...process.env, GTM_BRAIN_MENTOR: "1", GTM_BRAIN_EVAL_CASES: fileURLToPath(import.meta.url) };
  if (brain) env.GTM_BRAIN_EVAL_BRAIN = resolve(brain); else delete env.GTM_BRAIN_EVAL_BRAIN;
  if (gold) env.GTM_BRAIN_MENTOR_GOLD = resolve(gold);
  const harness = fileURLToPath(new URL("./tool-routing.mjs", import.meta.url));
  let out = "";
  const code = await new Promise((done, fail) => {
    const child = spawn(process.execPath, [harness, selected.join(",")], { env, stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.on("data", d => { out += d; if (!json) process.stdout.write(d); });
    child.on("error", fail); child.on("close", done);
  });
  const artifacts = out.match(/^Artifacts: (.+)$/m)?.[1];
  const report = artifacts && existsSync(join(artifacts, "report.json")) ? JSON.parse(readFileSync(join(artifacts, "report.json"), "utf8")) : { cases: [] };
  const rows = report.cases.map(c => ({ case: c.name, status: c.status, tokens: c.tokens || null, seconds: c.elapsed_ms ? Math.round(c.elapsed_ms / 1000) : null,
    failed: c.checks ? Object.entries(c.checks).filter(([, v]) => !v).map(([k]) => k) : [], ...(c.error ? { error: c.error } : {}), judge: c.judge?.score ?? c.judge?.skipped ?? c.judge?.error ?? null }));
  if (json) console.log(JSON.stringify({ brain: brain ? resolve(brain) : "(seeded routing brain)", gold: gold ? resolve(gold) : null, artifacts, rows }, null, 2));
  else {
    console.log("\ncase                           status  in-tokens  out-tokens  seconds  failed checks");
    for (const r of rows) console.log(`${r.case.padEnd(30)} ${r.status.padEnd(7)} ${String(r.tokens?.input ?? "-").padStart(9)}  ${String(r.tokens?.output ?? "-").padStart(10)}  ${String(r.seconds ?? "-").padStart(7)}  ${r.failed.join(", ") || r.error || ""}`);
  }
  process.exitCode = code || (rows.length === selected.length && rows.every(r => r.status === "pass") ? 0 : 1);
}

#!/usr/bin/env node
// The browser tests' app: a generated brain served by the real dashboard server.
//   node e2e/serve.mjs --port <n>
// The e2e runner starts this as app.command with a free port, waits until the port answers, and stops it
// (SIGTERM) when the run ends; the brain and its scratch folder go with it.
// Steps: generate the small brain (plugins/gtm-brain/test/e2e/generate-brain.mjs), add what the four tabs need
// through the plugin's own scripts (an adopted document, a scheduled workflow, a run in progress), render,
// then run server/dash.mjs in the foreground on the port. What the tests expect is written next to the brain
// in fixture.json, read from the brain itself (the generator's gold ledger and the memories), never from the
// render the page shows.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const P = fileURLToPath(new URL("../../../plugins/gtm-brain/", import.meta.url)).replace(/\/$/, "");
const portArg = process.argv.indexOf("--port");
const port = Number(process.argv[portArg + 1]);
if (portArg < 0 || !Number.isInteger(port) || port <= 1024) { console.error("usage: serve.mjs --port <1025-65535>"); process.exit(1); }

// One scratch folder per port, so a test finds the brain from app.baseUrl alone.
const base = join(tmpdir(), `gtm-brain-dash-e2e-${port}`);
rmSync(base, { recursive: true, force: true });
mkdirSync(base, { recursive: true });
const root = join(base, "brain-folder");
const profile = mkdtempSync(join(base, "codex-home-"));
// The runner passes only PATH, HOME and the temp variables: everything else the plugin needs is set here.
// CODEX_HOME is a scratch profile, never the person's own.
const env = {
  ...process.env, PLUGIN_ROOT: P, CODEX_HOME: profile,
  GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1",
  GIT_AUTHOR_NAME: "e2e", GIT_AUTHOR_EMAIL: "e2e@example.test", GIT_COMMITTER_NAME: "e2e", GIT_COMMITTER_EMAIL: "e2e@example.test",
  GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(base, "gitconfig"),
};
writeFileSync(env.GIT_CONFIG_GLOBAL, "[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n");
const node = (script, args, opts = {}) => execFileSync(process.execPath, [join(P, script), ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000, ...opts });

let dash = null, stopping = false;
const stop = code => {
  if (stopping) return; stopping = true;
  if (dash && dash.exitCode === null) { try { dash.kill("SIGTERM"); } catch {} }
  const done = () => { try { rmSync(base, { recursive: true, force: true }); } catch {} process.exit(code); };
  if (dash && dash.exitCode === null) { dash.once("exit", done); setTimeout(done, 3000).unref(); } else done();
};
process.on("SIGTERM", () => stop(0)); process.on("SIGINT", () => stop(0));

try {
  node("test/e2e/generate-brain.mjs", ["--shape", "small", "--out", root, "--gold", join(base, "gold.json")]);
  const gold = JSON.parse(readFileSync(join(base, "gold.json"), "utf8"));
  const by = "marta@example.test";

  // A document adopted in place: a file the person wrote at the brain root becomes a base document.
  writeFileSync(join(root, "pricing.md"), "# Pricing\n\nThree plans, billed yearly. The middle plan is the one we lead with.\n");
  node("scripts/gtm-brain-documents/document.mjs", [root, "--create", "--title", "Pricing", "--applies-to", "proposals, outreach", "--file", join(root, "pricing.md"), "--status", "approved", "--by", by]);

  // A scheduled workflow, active, beside the shipped manual drafts.
  const body = "## Before starting\n\n- **Accounts**: which accounts to review.\n\n## Steps\n\n1. **Read the week's notes**. What changed for each account. Milestone: a note tagged weekly-read\n2. **Write the summary**. One paragraph per account. Milestone: a note tagged weekly-summary\n\n## Learn\n\n- What the review missed.\n";
  node("scripts/gtm-brain-workflow/workflow.mjs", [root, "--create", "Weekly review", "--body", body, "--applies-to", "weekly review", "--trigger", "every monday at 09:00", "--context", "company", "--by", by]);
  node("scripts/gtm-brain-workflow/workflow.mjs", [root, "--activate", "weekly-review", "--by", by]);

  // A run in progress of the shipped outbound workflow.
  const settled = { "Target accounts": "the five retail chains in the ICP", "Why now": "the returns season", "Owner": "Marta Nowak", "Sequencer": "Gmail" };
  node("scripts/gtm-brain-workflow/workflow.mjs", [root, "--start", "outbound", "--context", "company", "--handle", "Q4 retail push", "--settled", JSON.stringify(settled), "--by", by]);
  const run = JSON.parse(node("scripts/gtm-brain-workflow/workflow.mjs", [root, "--list", "--json"])).runs.find(r => r.workflow === "outbound" && !r.ended);

  node("scripts/gtm-brain-render/render.mjs", [root]);

  // What the page must show, from the brain's own files.
  const lib = await import(join(P, "lib/brain.mjs")), wf = await import(join(P, "lib/workflows.mjs"));
  const memories = lib.listContexts(root).flatMap(c => lib.readMemories(root, c.slug || c));
  const byId = new Map(memories.map(m => [m.id, m]));
  const correction = gold.corrections.find(c => c.kind === "supersedes" && byId.get(c.old) && byId.get(c.new));
  const kinds = { ...gold.counts.entities, meeting: gold.meeting_entities.count };
  const meeting = gold.meeting_entities.first, names = lib.readNames(root);
  const person = names.find(n => n.name === meeting.attendee);
  const inForce = lib.effectiveMemories(memories).filter(m => !m.retracts);
  const fixture = {
    root, port,
    // what a test needs to write to this brain with the plugin's own scripts
    plugin: P, env: Object.fromEntries(Object.entries(env).filter(([k]) => /^(PLUGIN_ROOT|CODEX_HOME|GTM_BRAIN_|GIT_)/.test(k))),
    kinds: Object.fromEntries(Object.entries(kinds).filter(([, n]) => n > 0)),
    meeting: { name: names.find(n => n.id === meeting.id).name, title: meeting.title },
    // a person with notes: the attendee of that meeting, and the notes in force that name them
    person: { name: person.name, notes: inForce.filter(m => (m.entities || []).includes(person.id)).sort((a, b) => b.at.localeCompare(a.at)).map(m => m.content) },
    correction: { old: byId.get(correction.old).content, new: byId.get(correction.new).content },
    workflows: [{ title: "Weekly review", status: "active", trigger: "every monday at 09:00", runs: 0 }, { title: "Outbound", status: "draft", trigger: "manual", runs: 1 }],
    run: { id: run.id, step: `Step ${run.current.n} of ${wf.readWorkflow(root, "outbound").steps.length}`, status: run.current.status },
    documents: [{ title: "Pricing", state: "approved" }, { title: "Strategy", state: "not written" }, { title: "Ideal customer profile", state: "not written" }],
    by,
  };
  writeFileSync(join(base, "fixture.json"), JSON.stringify(fixture, null, 1));
} catch (e) {
  console.error(`fixture failed: ${e.stderr || e.message}`);
  stop(1);
}

if (!stopping) {
  dash = spawn(process.execPath, [join(P, "server/dash.mjs"), root, `--port=${port}`], { env, stdio: ["ignore", "inherit", "inherit"] });
  dash.on("exit", code => { if (!stopping) { console.error(`dashboard server exited (${code})`); stop(1); } });
}

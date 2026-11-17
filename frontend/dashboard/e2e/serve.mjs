#!/usr/bin/env node
// The browser tests' app: a generated brain served by the real dashboard server.
//   node e2e/serve.mjs --port <n>
// The e2e runner starts this as app.command with a free port, waits until the port answers, and stops it
// (SIGTERM) when the run ends; the brain and its scratch folder go with it.
// Steps: generate the small brain (plugins/gtm-brain/test/e2e/generate-brain.mjs), add what the four tabs need
// through the plugin's own scripts (an adopted document, a scheduled workflow, a run in progress on its second
// step and a cancelled one), render,
// then run server/dash.mjs in the foreground on the port. What the tests expect is written next to the brain
// in fixture.json, read from the brain itself (the generator's gold ledger, the memories, the workflow
// files), never from the render the page shows.
// Every step is a child this process can stop: a SIGTERM while the brain is still being made ends the step
// first and then removes the folder. A run that was killed outright (SIGKILL) cannot clean up, so the next
// start sweeps what it left: its dashboard server and its folder.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const P = fileURLToPath(new URL("../../../plugins/gtm-brain/", import.meta.url)).replace(/\/$/, "");
const portArg = process.argv.indexOf("--port");
const port = Number(process.argv[portArg + 1]);
if (portArg < 0 || !Number.isInteger(port) || port <= 1024) { console.error("usage: serve.mjs --port <1025-65535>"); process.exit(1); }

// One scratch folder per port, so a test finds the brain from app.baseUrl alone.
const PREFIX = "gtm-brain-dash-e2e-";
const base = join(tmpdir(), `${PREFIX}${port}`);
const pidsFile = dir => join(dir, "pids.json");
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const remove = dir => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} };

// What an earlier run left when it was killed outright: a folder whose serve.mjs is gone. Its dashboard
// server is stopped only if that pid still runs dash.mjs on that very folder.
for (const name of readdirSync(tmpdir()).filter(n => n.startsWith(PREFIX))) {
  const dir = join(tmpdir(), name);
  let pids = null; try { pids = JSON.parse(readFileSync(pidsFile(dir), "utf8")); } catch {}
  if (dir !== base && (!pids || alive(pids.serve))) continue;   // another run in progress, or not ours to judge
  if (pids?.dash && alive(pids.dash)) {
    let command = ""; try { command = execFileSync("ps", ["-p", String(pids.dash), "-o", "command="], { encoding: "utf8" }); } catch {}
    if (command.includes("dash.mjs") && command.includes(name)) { try { process.kill(pids.dash, "SIGTERM"); } catch {} }
  }
  remove(dir);
}
mkdirSync(base, { recursive: true });
writeFileSync(pidsFile(base), JSON.stringify({ serve: process.pid }));
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

let child = null, stopping = false;
// One plugin script, awaited: its output, or an error that carries what it printed.
const node = (script, args) => new Promise((resolve, reject) => {
  if (stopping) return reject(new Error("stopped"));
  const c = child = spawn(process.execPath, [join(P, script), ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  c.stdout.on("data", d => { out += d; }); c.stderr.on("data", d => { err += d; });
  c.on("error", reject);
  c.on("close", code => { if (child === c) child = null; code === 0 ? resolve(out) : reject(new Error(`${script} ${args[1] || ""} exited ${code}: ${err || out}`)); });
});
const stop = code => {
  if (stopping) return; stopping = true;
  const running = child && child.exitCode === null && child.signalCode === null ? child : null;
  const done = () => { remove(base); process.exit(code); };
  if (!running) return done();
  running.once("close", done); setTimeout(done, 5000).unref();
  try { running.kill("SIGTERM"); } catch {}
};
process.on("SIGTERM", () => stop(0)); process.on("SIGINT", () => stop(0));
// The fixture must hold what the tests assert: a missing piece stops the run here, never a test that passes on nothing.
const need = (ok, what) => { if (!ok) throw new Error(`the generated brain has no ${what}`); };

try {
  await node("test/e2e/generate-brain.mjs", ["--shape", "small", "--out", root, "--gold", join(base, "gold.json")]);
  const gold = JSON.parse(readFileSync(join(base, "gold.json"), "utf8"));
  const by = "marta@example.test";
  const workflow = (...args) => node("scripts/gtm-brain-workflow/workflow.mjs", [root, ...args]);
  const wf0 = await import(join(P, "lib/workflows.mjs"));

  // A document adopted in place: a file the person wrote at the brain root becomes a base document.
  writeFileSync(join(root, "pricing.md"), "# Pricing\n\nThree plans, billed yearly. The middle plan is the one we lead with.\n");
  await node("scripts/gtm-brain-documents/document.mjs", [root, "--create", "--title", "Pricing", "--applies-to", "proposals, outreach", "--file", join(root, "pricing.md"), "--status", "approved", "--by", by]);

  // A scheduled workflow, active, beside the shipped manual drafts.
  const body = "## Before starting\n\n- **Accounts**: which accounts to review.\n\n## Steps\n\n1. **Read the week's notes**. What changed for each account. Milestone: a note tagged weekly-read\n2. **Write the summary**. One paragraph per account. Milestone: a note tagged weekly-summary\n\n## Learn\n\n- What the review missed.\n";
  await workflow("--create", "Weekly review", "--body", body, "--applies-to", "weekly review", "--trigger", "every monday at 09:00", "--context", "company", "--by", by);
  await workflow("--activate", "weekly-review", "--by", by);

  // A run in progress of the shipped outbound workflow.
  const settled = { "Target accounts": "the five retail chains in the ICP", "Why now": "the returns season", "Owner": "Marta Nowak", "Sequencer": "Gmail" };
  await workflow("--start", "outbound", "--context", "company", "--handle", "Q4 retail push", "--settled", JSON.stringify(settled), "--by", by);
  const listed = async () => JSON.parse(await workflow("--list", "--json")).runs;
  const started = (await listed()).find(r => r.workflow === "outbound" && !r.ended);
  need(started, "outbound run in progress");
  // The run is tracked: its first step done with a note, its second due since three days ago (moved there, so
  // the tracker and Coming up have an overdue step to show).
  await workflow("--advance", started.id, "--step", "1", "--note", "Five retail chains and 14 contacts pulled from the CRM; list saved with the run.", "--by", by);
  const late = wf0.addDays(wf0.localDate(), -3);
  await workflow("--move", started.id, "--step", "2", "--to", late, "--reason", "the sequence was promised for that day", "--by", by);
  // An earlier run of the same workflow that was stopped: it folds under the finished and stopped runs.
  await workflow("--start", "outbound", "--context", "company", "--handle", "Spring pilot", "--settled", JSON.stringify({ ...settled, "Target accounts": "ten pilot accounts", "Why now": "the spring price change" }), "--by", by);
  const pilot = (await listed()).find(r => r.workflow === "outbound" && !r.ended && r.id !== started.id);
  need(pilot, "second outbound run");
  await workflow("--cancel", pilot.id, "--reason", "the price change was postponed", "--by", by);
  const open = (await listed()).filter(r => !r.ended);
  const run = open.find(r => r.id === started.id);
  need(run && run.current?.n === 2, "outbound run on its second step");

  await node("scripts/gtm-brain-render/render.mjs", [root]);

  // What the page must show, from the brain's own files.
  const lib = await import(join(P, "lib/brain.mjs")), wf = await import(join(P, "lib/workflows.mjs"));
  const memories = lib.listContexts(root).flatMap(c => lib.readMemories(root, c.slug || c));
  const byId = new Map(memories.map(m => [m.id, m]));
  const correction = gold.corrections.find(c => c.kind === "supersedes" && byId.get(c.old) && byId.get(c.new));
  need(correction, "note replaced by a correction");
  const kinds = { ...gold.counts.entities, meeting: gold.meeting_entities.count };
  need(kinds.meeting > 0, "meeting entity");
  const meeting = gold.meeting_entities.first, names = lib.readNames(root);
  const person = names.find(n => n.name === meeting.attendee);
  const inForce = lib.effectiveMemories(memories).filter(m => !m.retracts);
  const notes = inForce.filter(m => (m.entities || []).includes(person?.id)).sort((a, b) => b.at.localeCompare(a.at)).map(m => m.content);
  need(notes.length > 1, "person with several notes");
  // Every workflow file, with the status and trigger its own frontmatter carries.
  const workflows = wf.listWorkflows(root).map(w => {
    const fm = lib.parseFrontmatter(readFileSync(join(root, w.path), "utf8")).fm;
    return { title: w.title, status: String(fm.status), trigger: String(fm.trigger || "manual"), runs: open.filter(r => r.workflow === w.slug).length };
  });
  need(workflows.some(w => w.status === "active" && w.trigger !== "manual") && workflows.some(w => w.status === "draft"), "scheduled workflow beside a draft");
  const { readSchema } = await import(join(P, "lib/schema.mjs")), { whereRows } = await import(join(P, "lib/where.mjs")), { readAskSource } = await import(join(P, "lib/ask-source.mjs")), { readOurRules } = await import(join(P, "lib/our-rules.mjs"));
  const schema = readSchema(root).schema, groups = [readOurRules(root).rules.length, whereRows(root).length, readAskSource(root).rows.length];
  const foundations = { rules: groups.reduce((a, b) => a + b, 0), ruleGroups: groups.filter(Boolean).length, kinds: Object.keys(schema.kinds).length,
    fields: Object.values(schema.kinds).reduce((n, k) => n + k.fields.length + Object.values(k.subtypes || {}).reduce((m, st) => m + (st.fields || []).length, 0), 0), relations: Object.keys(schema.relations).length };
  const fixture = {
    root, port,
    // what a test needs to write to this brain with the plugin's own scripts
    plugin: P, env: Object.fromEntries(Object.entries(env).filter(([k]) => /^(PLUGIN_ROOT|CODEX_HOME|GTM_BRAIN_|GIT_)/.test(k))),
    kinds: Object.fromEntries(Object.entries(kinds).filter(([, n]) => n > 0)),
    meeting: { name: names.find(n => n.id === meeting.id).name, title: meeting.title },
    // a person with notes: the attendee of that meeting, and the notes in force that name them
    person: { name: person.name, notes },
    correction: { old: byId.get(correction.old).content, new: byId.get(correction.new).content },
    workflows,
    // what the Foundations section counts, from the brain's own readers
    foundations,
    run: { id: run.id, name: "Q4 retail push", step: `Step ${run.current.n} of ${wf.readWorkflow(root, "outbound").steps.length}`, status: run.current.status, due: late, cancelled: pilot.id,
      // the tracker's states, in step order, as the run's notes give them
      states: ["done", "late", "upcoming", "upcoming"], stepTitles: wf.readWorkflow(root, "outbound").steps.map(st => st.title),
      settle: wf.readWorkflow(root, "outbound").settle.map(x => x.label) },
    // the six base files: the adopted one is filled, the others still hold their starter text
    documents: [{ title: "Pricing", state: "approved" }, ...["Strategy", "Ideal customer profile", "Tone of voice", "Design system", "Market"].map(title => ({ title, state: "not written" }))],
    by,
  };
  writeFileSync(join(base, "fixture.json"), JSON.stringify(fixture, null, 1));
} catch (e) {
  if (!stopping) { console.error(`fixture failed: ${e.message}`); stop(1); }
}

if (!stopping) {
  const dash = child = spawn(process.execPath, [join(P, "server/dash.mjs"), root, `--port=${port}`], { env, stdio: ["ignore", "inherit", "inherit"] });
  writeFileSync(pidsFile(base), JSON.stringify({ serve: process.pid, dash: dash.pid }));
  dash.on("exit", code => { if (!stopping) { console.error(`dashboard server exited (${code})`); stop(1); } });
}

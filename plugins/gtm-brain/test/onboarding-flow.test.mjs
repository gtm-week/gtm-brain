process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_SESSION_MAINTENANCE = "1"; // Covered by session-maintenance.test.mjs.
process.env.GTM_BRAIN_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// Deterministic onboarding integration, separate MCP contexts and synthetic data only.
// Native Desktop question widgets, account sign-in and permission prompts are not simulated.
process.env.GTM_BRAIN_NO_HOOK_CHECK = "1"; // the hooks-off check talks to a real Codex; hooks-notice.test covers it with a fake one
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readOnboarding, readMemories, effectiveMemories, ONBOARDING_VERSION, onboardingInstruction, selectPerson, writeContext, appendMemory, seedOnboarding } from "../lib/brain.mjs";
import { page } from './helpers/dashboard-page.mjs';

const P = fileURLToPath(new URL("..", import.meta.url));
function syntheticApply(f) {
  // Child-process-only dependency stub: never writes the person's audit log.
  const auditHome = join(f.scratch, "synthetic-audit");
  const apply = `import os from 'node:os'; import { syncBuiltinESMExports } from 'node:module';
    os.homedir = () => ${JSON.stringify(auditHome)}; syncBuiltinESMExports();
    process.argv = [process.execPath, 'approve.mjs', ${JSON.stringify(f.root)}, '--apply', '--by', 'alex-example'];
    await import(${JSON.stringify(pathToFileURL(join(P, "scripts/gtm-brain-approve/approve.mjs")).href)});`;
  return f.run(process.execPath, ["--input-type=module", "-e", apply]);
}
function fixture(t) {
  const scratch = mkdtempSync(join(tmpdir(), "gtm-brain-onboarding-flow-"));
  const root = join(scratch, "Synthetic Company");
  const bin = join(scratch, "bin"), catalog = join(scratch, "catalog");
  for (const dir of [root, bin, catalog]) mkdirSync(dir);
  // A live-shaped local catalog exercises matching without contacting an account or installing.
  writeFileSync(join(bin, "codex"), `#!${process.execPath}
const { createInterface } = require('node:readline');
if (process.argv[2] === 'plugin' && process.argv[3] === 'list') {
  console.log('Marketplace gtm-brain\\ngtm-brain@gtm-brain installed, enabled 0.3.0 synthetic'); process.exit(0);
}
if (process.argv[2] !== 'app-server') process.exit(91);
createInterface({ input: process.stdin }).on('line', line => {
  const msg = JSON.parse(line);
  if (msg.method === 'initialized') return;
  if (!['initialize', 'project/list'].includes(msg.method)) throw Error('Unexpected request');
  const result = msg.method === 'initialize' ? {} : { data: JSON.parse(process.env.GTM_ONBOARDING_PROJECTS || '[]'), nextCursor: null };
  console.log(JSON.stringify({ id: msg.id, result }));
});
`, { mode: 0o755 });
  writeFileSync(join(catalog, "synthetic.json"), JSON.stringify({ schema_version: 1,
    fetched_at: "2026-09-05T10:00:00Z", plugins: [
      { name: "gmail", installation_policy: "AVAILABLE", release: { display_name: "Gmail" } },
      { name: "google-calendar", installation_policy: "AVAILABLE", release: { display_name: "Google Calendar" } },
      { name: "hubspot", installation_policy: "AVAILABLE", release: { display_name: "HubSpot" } },
    ] }));
  const env = { ...process.env, CODEX_HOME: join(scratch, "codex-profile"), PLUGIN_ROOT: P,
    PATH: `${bin}:${process.env.PATH}`, GTM_BRAIN_CATALOG_DIR: catalog, GTM_BRAIN_NO_OPEN: "1" };
  const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, env, encoding: "utf8", timeout: 30000, ...options });
  // Every call starts a fresh MCP process. Progress must survive context/process boundaries.
  const rpc = (method, params = {}) => {
    const lines = run(process.execPath, [join(P, "server/server.mjs")], {
      input: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) + "\n",
    }).trim().split("\n").map(JSON.parse);
    assert.equal(lines.length, 1);
    assert.ok(!lines[0].error, JSON.stringify(lines[0]));
    return lines[0].result;
  };
  const call = (name, args = {}) => {
    const result = rpc("tools/call", { name, arguments: { brain: root, ...args } });
    const text = result.content.map(x => x.text).join("\n");
    assert.ok(!result.isError, `${name}: ${text}`);
    return text;
  };
  const remember = (content, extra = {}) => {
    const out = call("remember", { by: "alex-example", context: "company", kind: "note", content, ...extra });
    return out.match(/remembered (m_[0-9a-f]{12})/)[1];
  };
  const render = () => {
    call("render_dashboard");
    return JSON.parse(readFileSync(join(root, "work/home/data.json"), "utf8"));
  };
  const hook = () => run("bash", [join(P, "hooks/session-start.sh")], {
    input: JSON.stringify({ session_id: "synthetic-onboarding-context", cwd: root }),
  });
  t.after(() => {
    try { if (existsSync(join(root, "brain"))) run(process.execPath, [join(P, "server/dash.mjs"), root, "--stop"]); }
    finally { rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }); }
  });
  return { scratch, root, bin, env, run, rpc, call, remember, render, hook };
}

test("onboarding crosses fresh MCP contexts from setup to approved profile, explicit tool skips, snapshot and completion", t => {
  const f = fixture(t);
  const emptyOpening = f.hook();
  assert.match(emptyOpening, /no company brain yet.*gtm-brain-start/);
  assert.match(emptyOpening, /references\/questions\.md/,
    "the empty-folder branch supplies the question policy before its early return");
  for (const name of ["questions", "computer-use"]) {
    assert.ok(emptyOpening.includes(readFileSync(join(P, `policies/${name}.md`), "utf8")),
      `the empty-folder hook emits the shared ${name} policy`);
  }
  f.call("setup_brain", { folder: f.root, company: "Synthetic Example", one_liner: "Synthetic workflow testing",
    owner: "Alex Example <alex@example.invalid>", dashboard: "on-demand" });
  assert.ok(readFileSync(join(f.root, "AGENTS.md"), "utf8")
    .includes(readFileSync(join(P, "policies/questions.md"), "utf8")),
    "setup carries the shared question policy into the generated brain instructions");
  assert.match(f.hook(), /ONBOARDING pending/);
  const pending = readOnboarding(f.root).marker_id;
  assert.ok(pending, "setup saves progress without relying on a later model turn");
  f.remember("Onboarding step 1 (Who you are): Confirmed synthetic Alex Example at example.invalid.");
  assert.deepEqual(f.render().onboarding.steps.map(s => s.n), [1]);

  const adminPath = join(f.root, "brain/admin.md");
  const before = readFileSync(adminPath, "utf8");
  const proposal = before.replaceAll("Synthetic workflow testing", "Synthetic workflow testing for sample teams");
  assert.match(f.call("propose_admin_change", { content: proposal }), /sample teams/);
  assert.equal(readFileSync(adminPath, "utf8"), before, "a proposal does not apply itself");
  assert.ok(!f.rpc("tools/list").tools.some(tool => /approve.*apply|apply.*approve/.test(tool.name)));
  // Test-only dependency stub confines the audit to this fixture. This is not a user
  // APPROVE, a security-permission test or a suggested production approval workaround.
  const auditHome = join(f.scratch, "synthetic-audit");
  assert.match(syntheticApply(f), /applied brain\/admin.md/);
  assert.equal(readFileSync(adminPath, "utf8"), proposal);
  assert.match(readFileSync(join(auditHome, ".gtm-brain/approvals.log"), "utf8"), /approved by alex-example/);
  assert.ok(!existsSync(join(f.root, "work/admin.proposed.md")));
  f.remember("Onboarding step 2 (Company profile): Synthetic profile approved in integration fixture.");
  f.call("check_tools");
  let data = f.render();
  assert.deepEqual(data.onboarding.steps.map(s => s.n), [1, 2]);
  for (const name of ["Gmail", "Google Calendar"]) {
    assert.ok(data.tools.some(tool => tool.tool === name && /not installed/.test(tool.status)), name);
  }
  assert.match(f.hook(), /ONBOARDING pending.*steps done: 1, 2/);
  // Simulated explicit submission, never infer declines from unchecked/unsubmitted state.
  f.remember("Onboarding step 3 (Your tools): Gmail explicitly declined; Google Calendar explicitly declined; sample data supplied manually.");
  data = f.render();
  assert.match(data.onboarding.steps.find(s => s.n === 3).outcome, /Gmail explicitly declined; Google Calendar explicitly declined/);
  f.call("remember", { by: "alex-example", context: "icp", content: "Synthetic buyer requested a sample walkthrough.",
    sources: ["manual:synthetic-thread-1"] });
  assert.deepEqual(readMemories(f.root, "icp")[0].source, [{ kind: "manual", ref: "synthetic-thread-1" }, { kind: "codex", ref: "synthetic-onboarding-context" }], "the chat it was recorded in is a source too");
  f.remember("Onboarding step 4 (What is going on): Synthetic snapshot confirmed from one manual sample; email and calendar unavailable.");
  f.render();
  f.remember("Onboarding step 5 (Running for you): Automations explicitly skipped; nothing scheduled.");
  // Simulated submitted project choice: discovery itself must not link or import folders.
  const folders = ['Website', 'Curriculum', 'Personal hobby'].map(name => {
    const path = join(f.scratch, name); mkdirSync(path);
    writeFileSync(join(path, 'README.md'), 'Existing project content stays here.\n');
    return { id: name.toLowerCase().replaceAll(' ', '-'), name, roots: [{ path }] };
  });
  f.env.GTM_ONBOARDING_PROJECTS = JSON.stringify(folders);
  const catalog = JSON.parse(f.call('query', { object: 'projects', filters: { include_available: true } }));
  assert.equal(catalog.codex.status, 'complete');
  assert.deepEqual(catalog.codex.projects.map(p => p.title), ['Website', 'Curriculum', 'Personal hobby']);
  assert.ok(folders.every(p => !existsSync(join(p.roots[0].path, 'AGENTS.md'))));
  f.call('remember', { by: 'alex-example', context: 'personal-alex-example', tags: ['onboarding-projects'],
    content: 'Project following during onboarding: follow Website and Curriculum; exclude Personal hobby. Starting channels: market.' });
  for (const chosen of folders.slice(0, 2)) f.call('link_project', {
    path: chosen.roots[0].path, slug: chosen.id, title: chosen.name, contexts: ['market'], by: 'alex-example',
  });
  f.remember('Onboarding step 6 (Your projects): Alex Example chose Website and Curriculum; both linked; Personal hobby excluded.');
  data = f.render();
  assert.deepEqual(data.projects.map(p => p.slug), ['website', 'curriculum']);
  assert.ok(!existsSync(join(folders[2].roots[0].path, 'AGENTS.md')), 'unselected project is untouched');
  assert.equal(readFileSync(join(folders[0].roots[0].path, 'README.md'), 'utf8'), 'Existing project content stays here.\n');
  assert.ok(readMemories(f.root, 'personal-alex-example').some(m => m.tags.includes('onboarding-projects')),
    'the submitted choice survives a fresh MCP session');
  assert.match(f.hook(), /Onboarding is completed/);
  assert.doesNotMatch(f.hook(), /Onboarding state:/, 'completed onboarding is one sentence, not every step in every chat');
  assert.doesNotMatch(f.hook(), /^PROJECT /m, 'onboarding stays in its brain chat');
  const viewer = page(data, { html: readFileSync(join(f.root, 'work/home/index.html'), 'utf8') });
  assert.equal(viewer.node('#h-onboard').innerHTML, '', 'all saved outcomes clear the card');
  assert.match(data.onboarding.steps.find(s => s.n === 6).outcome, /both linked; Personal hobby excluded/);
  // The last outcome closed the pending marker in the same write: no second memory for the model to forget.
  assert.equal(data.onboarding.status, "completed"); assert.equal(data.onboarding.completion, "marker");
  const closing = effectiveMemories(readMemories(f.root, "company")).filter(m => /^Onboarding: completed v2 on \d{4}-\d\d-\d\d\.$/.test(m.content));
  assert.equal(closing.length, 1); assert.equal(closing[0].supersedes, pending); assert.deepEqual(closing[0].authors, ["alex-example"]);
  assert.deepEqual(data.onboarding.steps.map(s => s.n), [1, 2, 3, 4, 5, 6]);
  assert.ok(!effectiveMemories(readMemories(f.root, "company")).some(m => m.id === pending));
  assert.doesNotMatch(f.hook(), /ONBOARDING /, "a fresh session does not restart completed onboarding");
  assert.equal(f.run("git", ["status", "--short"]).trim(), "", "every production writer committed its files");
});

test("an explicit project skip survives a fresh onboarding session without linking the existing folder", t => {
  const f = fixture(t);
  f.call('setup_brain', { folder: f.root, company: 'Synthetic Example', one_liner: 'Synthetic workflow testing',
    owner: 'Alex Example <alex@example.invalid>', dashboard: 'on-demand' });
  const folder = join(f.scratch, 'Existing website'); mkdirSync(folder);
  f.env.GTM_ONBOARDING_PROJECTS = JSON.stringify([{ id: 'website', name: 'Website', roots: [{ path: folder }] }]);
  f.remember(`Onboarding: pending v${ONBOARDING_VERSION} since 2026-09-05.`);
  const listed = JSON.parse(f.call('query', { object: 'projects', filters: { include_available: true } }));
  assert.equal(listed.codex.projects.length, 1);
  f.call('remember', { by: 'alex-example', context: 'personal-alex-example', tags: ['onboarding-projects'],
    content: 'Project following during onboarding: explicitly skipped for now by Alex Example.' });
  f.remember('Onboarding step 6 (Your projects): Alex Example explicitly skipped following existing projects.');
  assert.match(f.hook(), /steps done: 6/);
  assert.match(f.render().onboarding.steps.find(s => s.n === 6).outcome, /explicitly skipped/);
  const resumed = JSON.parse(f.call('query', { object: 'projects', filters: { include_available: true } }));
  assert.deepEqual(resumed.projects, []);
  assert.ok(!existsSync(join(folder, 'AGENTS.md')));
  const decisions = readMemories(f.root, 'personal-alex-example').filter(m => m.tags.includes('onboarding-projects'));
  assert.equal(decisions.length, 1);
  assert.match(decisions[0].content, /explicitly skipped/);
});

test("dismissal suppresses session prompting and explicit resume preserves prior progress", t => {
  const f = fixture(t);
  f.call("setup_brain", { folder: f.root, company: "Synthetic Example", one_liner: "Synthetic workflow testing",
    owner: "Alex Example <alex@example.invalid>", dashboard: "on-demand" });
  const pending = f.remember(`Onboarding: pending v${ONBOARDING_VERSION} since 2026-09-05.`);
  f.remember("Onboarding step 1 (Who you are): Confirmed synthetic company and person.");
  const dismissed = f.remember(`Onboarding: dismissed v${ONBOARDING_VERSION} on 2026-09-05.`, { supersedes: pending });
  assert.equal(f.render().onboarding.status, "dismissed");
  assert.doesNotMatch(f.hook(), /ONBOARDING /);
  f.remember(`Onboarding: pending v${ONBOARDING_VERSION} since 2026-09-06.`, { supersedes: dismissed });
  assert.equal(readOnboarding(f.root).status, "pending");
  assert.deepEqual(f.render().onboarding.steps.map(s => s.n), [1]);
  assert.match(f.hook(), /ONBOARDING pending.*steps done: 1/);
});

test("an older completion stays closed across fresh hooks, MCP readers and the dashboard", t => {
  const f = fixture(t);
  f.call("setup_brain", { folder: f.root, company: "Synthetic Example", one_liner: "Synthetic workflow testing",
    owner: "Alex Example <alex@example.invalid>", dashboard: "on-demand" });
  f.remember("Onboarding step 1 (Who you are): Confirmed synthetic company and person.");
  const previous = f.remember(`Onboarding: completed v${ONBOARDING_VERSION - 1} on 2026-09-05.`);
  assert.doesNotMatch(f.hook(), /ONBOARDING /, "an upgrade cannot reopen completed onboarding");
  assert.deepEqual(readOnboarding(f.root).steps.map(s => s.n), [1], "an upgrade does not erase already known facts");
  for (const text of [f.call('where_we_are'), f.call('check_environment', { folder: f.root })]) {
    assert.match(text, /Onboarding is completed/);
    assert.doesNotMatch(text, /ONBOARDING |Resume link:|follow gtm-brain-start now/);
    assert.match(text, /takes precedence over stale onboarding reminders/);
  }
  const data = f.render();
  assert.equal(data.onboarding.required, false);
  assert.equal(data.onboarding.next, null);
  const viewer = page(data);
  assert.equal(viewer.node('#h-onboard').innerHTML, '');
  assert.doesNotMatch(new URL(viewer.run('chatDraft().href')).searchParams.get('prompt'), /setup|onboarding/i);
  f.remember(`Onboarding: completed v${ONBOARDING_VERSION} on 2026-09-06.`, { supersedes: previous });
  assert.doesNotMatch(f.hook(), /ONBOARDING /, "current-version completion stops further prompting");
});

test('missing active markers keep an established brain out of onboarding in every reader', t => {
  const f = fixture(t);
  f.call('setup_brain', { folder: f.root, company: 'Synthetic Example', one_liner: 'Synthetic testing',
    owner: 'Alex Example <alex@example.invalid>', dashboard: 'on-demand' });
  f.remember('The pending onboarding note was recorded in error.', { retracts: readOnboarding(f.root).marker_id });
  f.remember('We already use this brain for our customer work.');
  for (const text of [f.hook(), f.call('where_we_are'), f.call('check_environment', { folder: f.root })]) {
    assert.match(text, /No active onboarding request is recorded/);
    assert.doesNotMatch(text, /ONBOARDING |Resume link:|follow gtm-brain-start now/);
  }
  const data = f.render();
  assert.equal(data.onboarding.status, null, 'do not invent a completion record');
  assert.equal(data.onboarding.required, false);
  const viewer = page(data);
  assert.equal(viewer.node('#h-onboard').innerHTML, '');
  assert.doesNotMatch(new URL(viewer.run('chatDraft().href')).searchParams.get('prompt'), /setup|onboarding/i);
});

test('a person can close a legacy flag through remember without repeating or fabricating steps', t => {
  const f = fixture(t);
  f.call('setup_brain', { folder: f.root, company: 'Synthetic Example', one_liner: 'Synthetic testing',
    owner: 'Alex Example <alex@example.invalid>', dashboard: 'on-demand' });
  writeContext(f.root, 'gtm', { title: 'Legacy GTM', rule: 'Older onboarding evidence.' });
  f.remember('Onboarding: pending v1 since 2026-09-05.', { context: 'gtm' });
  const state = readOnboarding(f.root);
  assert.equal(state.context, 'gtm', 'the correction must stay with its marker even when company exists');
  assert.equal(state.required, false, 'legacy partial bookkeeping does not launch an interview');
  const instruction = onboardingInstruction(f.root);
  const payload = JSON.parse(instruction.match(/using this exact payload \(the content prefix is parsed; do not paraphrase it\): (\{.*\})\./)[1]);
  assert.equal(payload.context, 'gtm');
  assert.equal(payload.by, 'alex-example');
  assert.equal(payload.supersedes, state.marker_id);
  f.call('remember', payload);
  assert.equal(readOnboarding(f.root).status, 'completed');
  assert.deepEqual(readOnboarding(f.root).steps, [], 'acknowledging completion does not fabricate individual outcomes');
  assert.doesNotMatch(f.hook(), /ONBOARDING |Resume link:/);
  assert.equal(f.render().onboarding.required, false);
});

test("a handoff written by IMPORT.md is announced by the hook until it is gone; the import skill and the export skill carry IMPORT.md word for word", t => {
  const f = fixture(t);
  f.call("setup_brain", { folder: f.root, company: "Synthetic Example", one_liner: "Synthetic workflow testing",
    owner: "Alex Example <alex@example.invalid>", dashboard: "on-demand" });
  const home = join(f.scratch, "home"); mkdirSync(join(home, ".gtm-brain"), { recursive: true });
  const hook = () => f.run("bash", [join(P, "hooks/session-start.sh")], { input: JSON.stringify({ session_id: "synthetic-handoff", cwd: f.root }), env: { ...f.env, GTM_BRAIN_HOME: home } });
  assert.doesNotMatch(hook(), /HANDOFF/, "nothing to import, nothing said");
  writeFileSync(join(home, ".gtm-brain", "handoff.md"), "---\nexported: 2026-09-07T10:00:00Z\nby: claude-code\nconfirmed: false\n---\n# Company context handoff for GTM Brain\n## Tools observed\n- HubSpot is the CRM (memory)\n");
  assert.match(hook(), /HANDOFF waiting: .*handoff\.md \(by claude-code, confirmed: false; skill gtm-brain-start\)/);
  rmSync(join(home, ".gtm-brain", "handoff.md"));
  writeFileSync(join(home, ".gtm-brain", "claude-export.md"), "---\nby: claude\nconfirmed: true\n---\n");
  assert.match(hook(), /HANDOFF waiting: .*claude-export\.md \(by claude, confirmed: true/, "the older file name still counts");
  rmSync(join(home, ".gtm-brain", "claude-export.md")); assert.doesNotMatch(hook(), /HANDOFF/);
  const body = s => s.slice(s.indexOf("> For humans:"));
  assert.equal(body(readFileSync(join(P, "..", "..", "IMPORT.md"), "utf8")), body(readFileSync(join(P, "claude", "gtm-brain-export", "SKILL.md"), "utf8")), "the plugin's export skill is IMPORT.md, so the headless run and the paste sentence do the same");
  assert.match(readFileSync(join(P, "skills", "gtm-brain-start", "SKILL.md"), "utf8"), /^name: gtm-brain-start$/m);
  assert.match(readFileSync(join(P, "skills", "gtm-brain-start", "agents", "openai.yaml"), "utf8"), /display_name: "GTM Brain: Start"/);   // the import flow is a reference of start (ALL-204 step 4)
  assert.match(readFileSync(join(P, "skills", "gtm-brain-start", "references", "import.md"), "utf8"), /Read https:\/\/github\.com\/gtm-week\/gtm-brain\/blob\/main\/IMPORT\.md and follow it/, "onboarding closes with the paste sentence");
});

test("successful empty plugin listing still offers cached email, calendar and CRM candidates", t => {
  const f = fixture(t);
  f.call("setup_brain", { folder: f.root, company: "Synthetic Example", one_liner: "Synthetic workflow testing",
    owner: "Alex Example <alex@example.invalid>", dashboard: "on-demand" });
  writeFileSync(join(f.bin, "codex"), '#!/bin/sh\nif [ "$1" = plugin ] && [ "$2" = list ]; then exit 0; else exit 91; fi\n', { mode: 0o755 });
  const output = f.call("check_tools");
  assert.doesNotMatch(output, /plugin list failed|could not run/);
  const data = f.render();
  for (const name of ["Gmail", "Google Calendar", "HubSpot"]) {
    assert.ok(data.tools.some(tool => tool.tool === name && tool.suggested && /not installed/.test(tool.status)), name);
  }
});

test("rechecking suggested tools preserves the result and evidence of their prior read test", t => {
  const f = fixture(t);
  f.call("setup_brain", { folder: f.root, company: "Synthetic Example", one_liner: "Synthetic workflow testing",
    owner: "Alex Example <alex@example.invalid>", dashboard: "on-demand" });
  writeFileSync(join(f.bin, "codex"), '#!/bin/sh\nif [ "$1" = plugin ] && [ "$2" = list ]; then printf \'gmail@openai-curated-remote installed, enabled 1.0 synthetic\\n\'; else exit 91; fi\n', { mode: 0o755 });
  f.call("check_tools");
  f.call("mark_tool", { tool: "Gmail", status: "ok", note: "Synthetic read: one sample subject." });
  const before = f.render().tools.find(tool => tool.tool === "Gmail");
  assert.equal(before.test, "ok");
  f.call("check_tools");
  const after = f.render().tools.find(tool => tool.tool === "Gmail");
  assert.equal(after.status, "installed");
  assert.equal(after.suggested, true);
  assert.equal(after.test, before.test);
  assert.equal(after.note, before.note);
  assert.equal(after.at, before.at, "checking installation does not invent a new read-test timestamp");
});

test("a failed plugin listing retains suggested tools and their last verified installation and read evidence", t => {
  const f = fixture(t);
  f.call("setup_brain", { folder: f.root, company: "Synthetic Example", one_liner: "Synthetic workflow testing",
    owner: "Alex Example <alex@example.invalid>", dashboard: "on-demand" });
  writeFileSync(join(f.bin, "codex"), '#!/bin/sh\nif [ "$1" = plugin ] && [ "$2" = list ]; then printf \'gmail@openai-curated-remote installed, enabled 1.0 synthetic\\n\'; else exit 91; fi\n', { mode: 0o755 });
  f.call("check_tools");
  f.call("mark_tool", { tool: "Gmail", status: "ok", note: "Synthetic read before temporary CLI failure." });
  const statePath = join(f.root, "work/tools.json");
  const before = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(before.gmail.status, "installed");
  assert.ok(before.gmail.checked_at);
  writeFileSync(join(f.bin, "codex"), '#!/bin/sh\nexit 91\n', { mode: 0o755 });
  assert.match(f.call("check_tools"), /plugin list failed: install state as last checked/);
  const after = JSON.parse(readFileSync(statePath, "utf8"));
  assert.deepEqual(after, before, "failure cannot remove suggestions, downgrade installation, erase read evidence or advance the check time");
  assert.equal(f.render().tools.find(tool => tool.tool === "Gmail").test, "ok");
});

test("approving a suggested tool into workplace tools preserves its row and read evidence", t => {
  const f = fixture(t);
  f.call("setup_brain", { folder: f.root, company: "Synthetic Example", one_liner: "Synthetic workflow testing",
    owner: "Alex Example <alex@example.invalid>", dashboard: "on-demand" });
  writeFileSync(join(f.bin, "codex"), '#!/bin/sh\nif [ "$1" = plugin ] && [ "$2" = list ]; then printf \'gmail@openai-curated-remote installed, enabled 1.0 synthetic\\n\'; else exit 91; fi\n', { mode: 0o755 });
  f.call("check_tools");
  f.call("mark_tool", { tool: "Gmail", status: "ok", note: "Synthetic read before profile confirmation." });
  const before = f.render().tools.find(tool => tool.tool === "Gmail");
  assert.equal(before.suggested, true);
  const original = readFileSync(join(f.root, "brain/admin.md"), "utf8");
  const proposal = original.replace(/^tools: \[\]$/m, 'tools: ["Gmail"]').replace("**Tools.** none yet", "**Tools.** Gmail");
  assert.notEqual(proposal, original);
  f.call("propose_admin_change", { content: proposal });
  syntheticApply(f);
  f.call("check_tools");
  const rows = f.render().tools.filter(tool => tool.tool === "Gmail");
  assert.equal(rows.length, 1, "the declaration preserves one row instead of deleting or duplicating it");
  const [after] = rows;
  assert.equal(after.suggested, false);
  for (const field of ["plugin", "status", "test", "note", "at"]) assert.equal(after[field], before[field], field);
  f.call("check_tools");
  assert.deepEqual(f.render().tools.find(tool => tool.tool === "Gmail"), after, "the next check is stable too");
});

test("an empty-folder hook preserves its actual session through same-chat setup and dashboard rendering", t => {
  const f = fixture(t);
  const hook = id => f.run("bash", [join(P, "hooks/session-start.sh")], {
    env: { ...f.env, CODEX_THREAD_ID: "wrong-inherited-parent" },
    input: JSON.stringify({ session_id: id, cwd: f.root }),
  });
  assert.match(hook("actual-hook-session-1"), /follow the gtm-brain-start skill/);
  assert.match(hook("actual-hook-session-2"), /follow the gtm-brain-start skill/, "valid bootstrap metadata keeps the landing folder eligible");
  const sessionPath = join(f.root, "work/session.json");
  const captured = readFileSync(sessionPath, "utf8");
  assert.equal(JSON.parse(captured).session_id, "actual-hook-session-2");
  f.call("setup_brain", { folder: f.root, company: "Synthetic Example", one_liner: "Synthetic workflow testing",
    owner: "Alex Example <alex@example.invalid>", dashboard: "on-demand" });
  assert.equal(readFileSync(sessionPath, "utf8"), captured, "setup retains authoritative hook metadata without inventing a session");
  assert.equal(f.render().chat.id, "actual-hook-session-2");
  assert.equal(f.run("git", ["status", "--short"]).trim(), "", "bootstrap session stays derived and uncommitted");
});

test("empty-folder startup with missing or mismatched hook identity never uses inherited thread ID", t => {
  const f = fixture(t);
  for (const input of [{}, { session_id: "wrong-cwd", cwd: f.scratch }, { session_id: 42, cwd: f.root }, { session_id: " ", cwd: f.root }]) {
    f.run("bash", [join(P, "hooks/session-start.sh")], {
      env: { ...f.env, CODEX_THREAD_ID: "wrong-inherited-parent" }, input: JSON.stringify(input),
    });
    assert.ok(!existsSync(join(f.root, "work/session.json")));
  }
});

for (const invalid of ["extra-file", "invalid-json", "wrong-cwd", "invalid-id", "work-symlink", "session-symlink"]) {
  test(`setup and the empty-folder hook refuse unsafe bootstrap metadata: ${invalid}`, t => {
    const f = fixture(t);
    const work = join(f.root, "work"), external = join(f.scratch, "external");
    mkdirSync(external);
    if (invalid === "work-symlink") symlinkSync(external, work, "dir"); else mkdirSync(work);
    const session = { session_id: "original-session", cwd: invalid === "wrong-cwd" ? f.scratch : f.root, at: new Date().toISOString() };
    if (invalid === "invalid-id") session.session_id = {};
    const content = invalid === "invalid-json" ? "{broken" : JSON.stringify(session);
    if (invalid === "session-symlink") {
      writeFileSync(join(external, "session.json"), content);
      symlinkSync(join(external, "session.json"), join(work, "session.json"));
    } else writeFileSync(join(work, "session.json"), content);
    if (invalid === "extra-file") writeFileSync(join(work, "notes.txt"), "Personal notes, never adopt.");
    assert.doesNotMatch(f.hook(), /follow the gtm-brain-start skill/,
      "unsafe folders receive no setup invitation; the shared question reference may still be supplied");
    assert.equal(readFileSync(join(work, "session.json"), "utf8"), content, "hook leaves rejected metadata untouched");
    const result = f.rpc("tools/call", { name: "setup_brain", arguments: { folder: f.root, company: "Synthetic Example",
      one_liner: "Synthetic workflow testing", owner: "Alex Example <alex@example.invalid>" } });
    assert.ok(result.isError);
    assert.match(result.content[0].text, /not empty \(work/);
    assert.ok(!existsSync(join(f.root, "brain")));
  });
}

test('setup persists the start flag in git and fresh MCP readers recover the next action without the hook', t => {
  const f = fixture(t);
  const output = f.call('setup_brain', { folder: f.root, company: 'Synthetic Example', one_liner: 'Synthetic testing',
    owner: 'Alex Example <alex@example.invalid>', dashboard: 'on-demand' });
  const initial = readOnboarding(f.root);
  assert.equal(initial.status, 'pending');
  assert.equal(initial.required, true);
  assert.match(output, /continue gtm-brain-start discovery in this chat/);
  assert.match(f.run('git', ['show', 'HEAD:brain/contexts/company/memories.jsonl']), /Onboarding: pending v2/);
  seedOnboarding(f.root, 'alex-example');
  assert.equal(readOnboarding(f.root).marker_id, initial.marker_id, 'initialization does not duplicate the marker');
  f.remember('Onboarding step 1 (Who you are): Alex Example and Synthetic Example confirmed.');
  f.remember('Onboarding step 2 (Company profile): Profile approved and applied.');
  const old = f.remember('Onboarding continuation v2 step 3: Gmail selected; awaiting sign-in.');
  const updated = f.remember('Onboarding continuation v2 step 3: Gmail selected and signed in; Calendar explicitly skipped. Next: test Gmail once.', { supersedes: old });
  for (const text of [f.call('check_environment', { folder: f.root }), f.call('where_we_are')]) {
    assert.match(text, /next: 3 \(Your tools\)/);
    assert.match(text, /Gmail selected and signed in; Calendar explicitly skipped/);
    assert.doesNotMatch(text, /awaiting sign-in/);
    assert.match(text, /Do not ask whether to continue/);
    const href = text.match(/Resume link: (\S+)/)[1];
    const url = new URL(href);
    assert.equal(url.searchParams.get('path'), f.root, 'spaces in the actual folder round-trip');
    assert.match(url.searchParams.get('prompt'), /saved progress/);
  }
  assert.equal(readOnboarding(f.root).continuation.id, updated);
  f.remember('Onboarding step 3 (Your tools): Gmail read test passed; Calendar explicitly skipped.');
  assert.equal(readOnboarding(f.root).next.n, 4);
  assert.equal(readOnboarding(f.root).continuation, null, 'an old checkpoint cannot restart a finished step');
  assert.match(f.hook(), /next: 4 \(What is going on\)/);
});

test('an outcome saved without its step title still counts, and the last one closes onboarding', t => {
  const f = fixture(t);
  f.call('setup_brain', { folder: f.root, company: 'Synthetic Example', one_liner: 'Synthetic testing',
    owner: 'Alex Example <alex@example.invalid>', dashboard: 'on-demand' });
  const titles = ['Who you are','Company profile','Your tools','What is going on','Running for you'];
  titles.forEach((title, i) => f.remember(`Onboarding step ${i + 1} (${title}): Done by Alex.`));
  assert.equal(readOnboarding(f.root).status, 'pending');
  const out = f.call('remember', { by: 'alex-example', context: 'company', kind: 'note', content: 'Onboarding step 6: Alex skipped project folders for now.' });
  assert.match(out, /all onboarding steps saved[^\n]*end this reply with the closing/);
  const state = readOnboarding(f.root);
  assert.equal(state.completion, 'marker'); assert.equal(state.steps.find(s => s.n === 6).title, 'Your projects');
  assert.equal(f.run('git', ['status', '--short', '--', 'brain']).trim(), '', 'the closing marker is committed with the outcome');
});

test('saved outcomes close a stale pending flag without a final interview or marker write', t => {
  const f = fixture(t);
  f.call('setup_brain', { folder: f.root, company: 'Synthetic Example', one_liner: 'Synthetic testing',
    owner: 'Alex Example <alex@example.invalid>', dashboard: 'on-demand' });
  const titles = ['Who you are','Company profile','Your tools','What is going on','Running for you','Your projects'];
  // Outcomes saved before remember closed the marker itself: a brain from an older version.
  titles.forEach((title, i) => appendMemory(f.root, 'company', { authors: ['alex-example'], content: `Onboarding step ${i + 1} (${title}): Completed or explicitly skipped by Alex.` }));
  f.run('git', ['add', '-A', 'brain']); f.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'older outcomes']);
  const before = readFileSync(join(f.root, 'brain/contexts/company/memories.jsonl'), 'utf8');
  assert.equal(readOnboarding(f.root).next, null);
  assert.equal(readOnboarding(f.root).status, 'completed');
  assert.equal(readOnboarding(f.root).completion, 'outcomes');
  assert.match(f.call('where_we_are'), /Onboarding is completed/);
  assert.doesNotMatch(f.hook(), /ONBOARDING |Resume link:/);
  assert.equal(f.render().onboarding.required, false);
  assert.equal(readFileSync(join(f.root, 'brain/contexts/company/memories.jsonl'), 'utf8'), before, 'readers do not migrate or fabricate memories');
  const pending = readOnboarding(f.root).marker_id;
  const dismissed = f.remember('Onboarding: dismissed v1 on 2026-09-05.', { supersedes: pending });
  assert.equal(readOnboarding(f.root).required, false);
  assert.equal(readOnboarding(f.root).next, null);
  assert.doesNotMatch(f.hook(), /ONBOARDING /);
  f.remember('Onboarding step 6 (Your projects): Alex linked nothing.');
  assert.equal(readOnboarding(f.root).status, 'dismissed', 'an outcome saved after a dismissal never closes it as completed');
  f.remember('Onboarding: pending v2 since 2026-09-06.', { supersedes: dismissed });
  assert.equal(readOnboarding(f.root).next, null, 'saved outcomes cannot create a mandatory closing loop');
  assert.equal(readOnboarding(f.root).status, 'completed');
});

test('a teammate, linked project or unattended job does not automatically inherit the onboarding request', t => {
  const f = fixture(t);
  f.call('setup_brain', { folder: f.root, company: 'Synthetic Example', one_liner: 'Synthetic testing',
    owner: 'Alex Example <alex@example.invalid>', team: 'Robin Example <robin@example.invalid>', dashboard: 'on-demand' });
  assert.match(onboardingInstruction(f.root), /follow gtm-brain-start now/);
  assert.equal(onboardingInstruction(f.root, { project: 'website' }), '');
  assert.equal(onboardingInstruction(f.root, { unattended: true }), '');
  selectPerson(f.root, 'robin-example');
  assert.doesNotMatch(onboardingInstruction(f.root), /follow gtm-brain-start now/);
  assert.match(onboardingInstruction(f.root), /do not offer or resume another teammate/);
  assert.equal(readOnboarding(f.root).status, 'pending');
});

test('resuming a legacy gtm workflow in company retains its older step outcomes', t => {
  const f = fixture(t);
  f.call('setup_brain', { folder: f.root, company: 'Synthetic Example', one_liner: 'Synthetic testing',
    owner: 'Alex Example <alex@example.invalid>', dashboard: 'on-demand' });
  writeContext(f.root, 'gtm', { title: 'Legacy GTM', rule: 'Older onboarding evidence.' });
  appendMemory(f.root, 'gtm', { authors: ['alex-example'], content: 'Onboarding step 1 (Who you are): Confirmed earlier in legacy GTM.' });
  assert.equal(readOnboarding(f.root).next.n, 2);
  assert.match(f.call('where_we_are'), /Confirmed earlier in legacy GTM/);
});

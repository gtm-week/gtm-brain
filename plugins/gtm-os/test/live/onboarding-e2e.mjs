#!/usr/bin/env node
// Opt-in live Codex sessions. Only synthetic brains under the contributor's work/ directory.
// Production hooks, MCP, remember commits, upgrades, renderer and HTTP server are exercised.
// Question answers are simulated; this does not automate the Desktop UI or external accounts.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as lib from '../../lib/brain.mjs';
import { page } from '../helpers/dashboard-page.mjs';

const plugin = fileURLToPath(new URL('../../', import.meta.url));
const repository = resolve(plugin, '../..');
const base = resolve(process.env.GTM_OS_EVAL_DIR || join(repository, 'work/onboarding-e2e'));
mkdirSync(base, { recursive: true });
const artifacts = mkdtempSync(join(base, 'run-'));
const profile = join(artifacts, 'profile'); mkdirSync(profile);
const model = process.env.GTM_OS_EVAL_MODEL || 'gpt-5.6-sol';
const env = { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH,
  CODEX_HOME: profile, GTM_OS_EVAL_PROFILE: profile, GTM_OS_EVAL_COMMIT: '1',
  PLUGIN_ROOT: plugin, GTM_OS_NO_COMMIT: '', GTM_OS_NO_OPEN: '1', GTM_OS_NO_COMPILE: '1', GTM_OS_NO_WATCH: '1',
  TMPDIR: artifacts, GIT_CEILING_DIRECTORIES: base };
for (const key of ['GTM_OS_NO_OPEN', 'GTM_OS_NO_COMPILE', 'GTM_OS_NO_WATCH']) process.env[key] = '1';
const by = 'marta-nowak';
const run = (root, cmd, args, options = {}) => execFileSync(cmd, args, { cwd: root, env, encoding: 'utf8', timeout: 60000, ...options });
const script = (root, path, args = []) => run(root, process.execPath, [join(plugin, path), root, ...args]);
const jsonl = path => existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
const memories = root => Object.fromEntries(lib.listContexts(root).map(c => [c.slug, readFileSync(join(root, 'brain/contexts', c.slug, 'memories.jsonl'), 'utf8')]));
const note = (root, context, content, extra = {}) => lib.appendMemory(root, context, { authors: [by], content, ...extra }).rec;
const titles = ['Who you are', 'Company profile', 'Your tools', 'What is going on', 'Running for you', 'Your projects'];
const outcomes = ['Marta Nowak and Routing Fixture confirmed.', 'Company profile approved and applied.',
  'Marta explicitly skipped all connections for now.', 'Snapshot confirmed from supplied notes; one-time summary refresh explicitly declined.',
  'Marta explicitly skipped automations.', 'Marta explicitly skipped following existing projects.'];
const business = 'What is blocking the Bergstrom Home pilot, and who owns it?';
const cases = [
  { name: 'legacy-completed', version: 1, status: 'completed', steps: 0,
    turns: [{ prompt: "Hi, I'm back." }, { prompt: business, business: true }, { prompt: 'Hello again.' }] },
  { name: 'missing-marker', status: null, steps: 1,
    turns: [{ prompt: "Hi, I'm back." }, { prompt: business, business: true }] },
  { name: 'legacy-incomplete', version: 1, status: 'pending', steps: 1,
    turns: [{ prompt: "Hi, I'm back." }, { prompt: business, business: true }] },
  { name: 'missing-close', version: 2, status: 'pending', steps: 6,
    turns: [{ prompt: "Hi, I'm back." }, { prompt: business, business: true }] },
  { name: 'already-finished', version: 2, status: 'pending', context: 'gtm', steps: 0,
    turns: [{ prompt: 'I already finished onboarding. Please stop asking me to do it again. ' + business, close: true, business: true },
      { prompt: "Hi, I'm back." }, { prompt: business, business: true }] },
  { name: 'active-control', version: 2, status: 'pending', steps: 5,
    turns: [{ prompt: "I'm back.", finish: true }, { prompt: "Hi, I'm back." }, { prompt: business, business: true }] },
];

function seed(scenario, root) {
  run(root, 'git', ['init', '-q']);
  run(root, 'bash', [join(plugin, 'scripts/gtm-os-setup/setup.sh'), '--company', 'Routing Fixture',
    '--one-liner', 'Synthetic returns platform', '--owner', 'Marta Nowak <marta@example.test>', '--dashboard', 'on-demand']);
  // Construct an older fixture before its baseline commit. No real memory is rewritten.
  const path = join(root, 'brain/contexts/company/memories.jsonl');
  writeFileSync(path, jsonl(path).filter(m => !/^Onboarding:/.test(m.content)).map(m => JSON.stringify(m) + '\n').join(''));
  if (scenario.context === 'gtm') lib.writeContext(root, 'gtm', { title: 'Legacy GTM', rule: 'Earlier company onboarding records.' });
  const context = scenario.context || 'company';
  if (scenario.status) note(root, context, `Onboarding: ${scenario.status} v${scenario.version} on 2026-09-01.`);
  for (let i = 0; i < scenario.steps; i++) note(root, context, `Onboarding step ${i + 1} (${titles[i]}): ${outcomes[i]}`);
  note(root, 'company', 'Imported the handoff from the previous assistant; reviewed with Marta.');
  script(root, 'scripts/gtm-os-entities/entities.mjs', ['--add', 'Krzysztof Pawlak']);
  script(root, 'scripts/gtm-os-entities/entities.mjs', ['--add', 'Bergstrom Home', '--kind', 'company']);
  note(root, 'offer', 'Krzysztof Pawlak owns the Bergstrom Home pilot. The pilot is blocked until the security review is finished.',
    { people: ['Krzysztof Pawlak', 'Bergstrom Home'], source: [{ kind: 'user', ref: by }], kind: 'decision' });
  for (const slug of ['company', 'offer']) {
    const c = lib.readContext(root, slug);
    lib.writeContext(root, slug, { ...c.fm, rule: c.rule,
      summary: 'Onboarding is pending. Resume setup before starting company work.', now: 'Finish onboarding.', compiled_at: '2026-09-01T10:00:00Z' });
  }
  lib.writeLoaded(root, ['offer']);
  lib.selectPerson(root, by);
  // Exercise the actual rules upgrader, not a pre-upgraded template supplied to the agent.
  const old = readFileSync(join(plugin, 'templates/legacy/AGENTS-0.14.2.md'), 'utf8').replaceAll('{{COMPANY}}', 'Routing Fixture');
  writeFileSync(join(root, 'AGENTS.md'), old);
  run(root, 'git', ['add', '--', 'brain', 'AGENTS.md']);
  run(root, 'git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture: legacy onboarding evidence']);
  const before = memories(root);
  const upgraded = run(root, 'bash', [join(plugin, 'scripts/gtm-os-upgrade/upgrade.sh'), root]);
  writeFileSync(join(root, 'work/upgrade-output.txt'), upgraded);
  if (JSON.stringify(memories(root)) !== JSON.stringify(before)) throw Error('Upgrade changed source memory bytes');
  if (readFileSync(join(root, 'AGENTS.md'), 'utf8') !== readFileSync(join(plugin, 'templates/AGENTS.md'), 'utf8').replaceAll('{{COMPANY}}', 'Routing Fixture')) throw Error('Rules upgrade did not apply');
  return { memoryBytesPreserved: true, rulesUpgraded: true, output: upgraded };
}

async function dashboard(root) {
  script(root, 'scripts/gtm-os-render/render.mjs');
  const address = script(root, 'server/dash.mjs', ['--start']).trim().split('\n').at(-1);
  const response = await fetch(address, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error(`Dashboard HTTP ${response.status}`);
  const html = await response.text();
  const embedded = html.match(/<script[^>]*id="data"[^>]*>([\s\S]*?)<\/script>/);
  if (!embedded) throw Error('Dashboard has no embedded data');
  const data = JSON.parse(embedded[1]);
  const rendered = page(data, { html, live: true, route: '' });
  const prompt = new URL(rendered.node('#chat-about').href).searchParams.get('prompt');
  return { state: data.onboarding, cardVisible: !!rendered.node('#h-onboard').innerHTML,
    promptsSetup: /saved progress|unfinished step|GT[M ]*OS setup/i.test(prompt), address, htmlHash: createHash('sha256').update(html).digest('hex') };
}

async function session(scenario, turn, root, index) {
  const label = `${scenario.name}-${index + 1}`, trace = join(artifacts, label + '-mcp.jsonl');
  const final = join(artifacts, label + '-final.txt'), events = join(artifacts, label + '-agent.jsonl');
  const hook = run(root, 'bash', [join(plugin, 'hooks/session-start.sh')],
    { input: JSON.stringify({ session_id: 'synthetic-' + label, cwd: root }) });
  writeFileSync(join(artifacts, label + '-hook.txt'), hook);
  const prompt = `This is an isolated synthetic GTM OS company brain at ${root}. You work for Marta Nowak, confirmed handle ${by}.
Use only this synthetic brain, the plugin workflows at ${plugin}, and the scoped MCP server. Do not read real accounts, assistant archives or other company files. Do not install software, change plugin configuration or open applications. Use the existing application tools for brain operations.

Session context from the production GTM OS hook:
${hook}

The user's message:
${turn.prompt}`;
  writeFileSync(join(artifacts, label + '-prompt.txt'), prompt);
  const before = memories(root), beforeRows = lib.listContexts(root).flatMap(c => c.memories);
  const beforeHead = run(root, 'git', ['rev-parse', 'HEAD']).trim();
  const args = ['exec', '--ignore-user-config', '--ephemeral', '--json', '--sandbox', 'read-only', '-C', root, '-m', model,
    '-c', 'features.apps=false', '-c', 'approval_policy="never"',
    '-c', `mcp_servers.gtm_os_eval.command=${JSON.stringify(process.execPath)}`,
    '-c', `mcp_servers.gtm_os_eval.args=${JSON.stringify([join(plugin, 'test/live/tool-routing-proxy.mjs'), root, trace, 'Skip for now|^Skip$', 'onboarding', '', plugin])}`,
    // Codex filters the MCP child environment. Pass fixture isolation and commit mode
    // explicitly; relying on the CLI's environment silently kept the proxy in dry-run mode.
    ...Object.entries({ GTM_OS_EVAL_PROFILE: profile, GTM_OS_EVAL_COMMIT: '1', GTM_OS_NO_WATCH: '1', TMPDIR: artifacts })
      .flatMap(([key, value]) => ['-c', `mcp_servers.gtm_os_eval.env.${key}=${JSON.stringify(value)}`]),
    '-c', 'mcp_servers.gtm_os_eval.tool_timeout_sec=60', '-o', final, '-'];
  const agentEnv = { ...env };
  if (process.env.CODEX_HOME) agentEnv.CODEX_HOME = process.env.CODEX_HOME; else delete agentEnv.CODEX_HOME;
  const started = Date.now();
  const processResult = await new Promise((done, fail) => {
    const child = spawn('codex', args, { cwd: root, env: agentEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 180000);
    child.stdout.on('data', s => stdout += s); child.stderr.on('data', s => stderr += s);
    child.on('error', e => { clearTimeout(timer); fail(e); });
    child.on('close', code => {
      clearTimeout(timer); writeFileSync(events, stdout); writeFileSync(join(artifacts, label + '-stderr.log'), stderr);
      done({ code, timedOut });
    });
    child.stdin.end(prompt);
  });
  const records = jsonl(trace), calls = records.filter(r => r.kind === 'call'), questions = records.filter(r => r.kind === 'question');
  const text = existsSync(final) ? readFileSync(final, 'utf8').trim() : '';
  const after = memories(root), state = lib.readOnboarding(root);
  const added = lib.listContexts(root).flatMap(c => c.memories).filter(m => !beforeRows.some(b => b.id === m.id));
  const addedMarkers = added.filter(m => /^Onboarding:/.test(m.content));
  const view = await dashboard(root);
  const checks = {
    process: processResult.code === 0 && !processResult.timedOut,
    catalog: records.some(r => r.kind === 'catalog' && r.tools.some(t => t.name === 'where_we_are')),
    productionBuild: records.some(r => r.kind === 'build' && r.server === join(plugin, 'server/server.mjs')),
    answered: !!text,
    noToolErrors: !records.some(r => r.kind === 'result' && (r.error || r.result?.isError)),
    sourceHistoryPreserved: Object.entries(before).every(([slug, bytes]) => after[slug]?.startsWith(bytes)),
    noSetup: !calls.some(c => ['setup_brain', 'computer_use', 'propose_admin_change'].includes(c.tool)),
    inactiveAfter: !state.required,
    dashboardClear: !view.cardVisible && !view.promptsSetup && !view.state.required,
  };
  if (turn.close || turn.finish) {
    checks.completed = state.status === 'completed';
    checks.completionSaved = addedMarkers.some(m => /^Onboarding: completed v\d+\b/.test(m.content));
    checks.writerCommitted = run(root, 'git', ['rev-parse', 'HEAD']).trim() !== beforeHead
      && run(root, 'git', ['status', '--porcelain', '--', 'brain']).trim() === '';
  } else {
    checks.noOnboardingWrites = addedMarkers.length === 0;
    checks.noOnboardingTalk = !/onboard|setting up GTM|set up GTM|resume setup/i.test(text);
  }
  checks.questions = turn.finish ? questions.length === 1 && /project|folder/i.test(questions[0].message) : questions.length === 0;
  if (turn.business) checks.businessAnswer = /security/i.test(text) && /Krzysztof|Pawlak/i.test(text);
  const result = { name: label, status: Object.values(checks).every(Boolean) ? 'pass' : 'fail', checks,
    ...processResult, elapsed_ms: Date.now() - started, tools: calls.map(c => c.tool),
    questions, state, view, added, final, trace, events, response: text };
  writeFileSync(join(artifacts, label + '-result.json'), JSON.stringify(result, null, 2));
  console.log(`${label}: ${result.status} ${JSON.stringify(checks)} tools=${result.tools.join(' > ') || 'none'}`);
  return result;
}

const selected = process.argv[2] ? cases.filter(c => c.name === process.argv[2]) : cases;
if (!selected.length) throw Error('Unknown onboarding case');
const report = { model, plugin, artifacts, scope: 'Real independent Codex CLI sessions and production hook output, MCP operations with real local commits, legacy rules upgrade, renderer, HTTP serving and client DOM execution. Synthetic brains and simulated form answers; no Desktop UI, real connectors or installation.', cases: [] };
console.log(`Artifacts: ${artifacts}`);
for (const scenario of selected) {
  const root = join(artifacts, scenario.name); mkdirSync(root);
  const entry = { name: scenario.name, brain: root, turns: [] }; report.cases.push(entry);
  try {
    entry.upgrade = seed(scenario, root);
    entry.before = await dashboard(root);
    console.log(`Prepared ${scenario.name}: ${JSON.stringify(entry.before.state)}`);
    for (const [index, turn] of scenario.turns.entries()) {
      entry.turns.push(await session(scenario, turn, root, index));
      writeFileSync(join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
      if (!entry.turns.at(-1).checks.process) break;
    }
    entry.status = entry.turns.length === scenario.turns.length && entry.turns.every(t => t.status === 'pass') ? 'pass' : 'fail';
  } catch (error) { entry.status = 'fail'; entry.error = error.stack; console.error(`${scenario.name}: ${error.stack}`); }
  finally {
    try { script(root, 'server/dash.mjs', ['--stop']); } catch {}
    writeFileSync(join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  }
}
process.exitCode = report.cases.some(c => c.status !== 'pass') ? 1 : 0;

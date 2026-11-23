#!/usr/bin/env node
// Opt-in real-skill evaluation. Raw mock data only; never real research providers.
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, copyFileSync, cpSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const shipped = existsSync(resolve(here, '../../.codex-plugin/plugin.json'));
const repo = resolve(here, shipped ? '../../../..' : '../..');
const args = process.argv.slice(2), opt = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const fixtureRoot = opt('--fixture'), mode = opt('--mode', shipped ? 'brain' : 'standalone');
const plugin = opt('--plugin', shipped ? resolve(here, '../..') : null), baseline = opt('--baseline'), model = opt('--model', process.env.GTM_BRAIN_EVAL_MODEL || 'gpt-5.6-luna');
const repeats = Number(opt('--repeat', '1'));
if (!fixtureRoot || !['standalone', 'brain'].includes(mode) || mode === 'brain' && !plugin || !Number.isInteger(repeats) || repeats < 1 || repeats > 3) {
  throw new Error('Usage: node run.mjs --fixture PATH --mode standalone|brain [--plugin PLUGIN_ROOT] [--baseline PLUGIN_ROOT] [--repeat 1..3] [--cases ids] [--model MODEL] [--out PATH]');
}
if (shipped && mode === 'standalone') throw new Error('Standalone mode belongs to the LinkedIn Agent source repository');
const fixture = JSON.parse(readFileSync(join(here, 'fixture.json')));
const sha = data => createHash('sha256').update(data).digest('hex');
const snapshot = root => {
  const files = {};
  const visit = (folder, prefix = '') => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) visit(join(folder, entry.name), name + '/');
      else if (entry.isFile()) files[name] = sha(readFileSync(join(folder, entry.name)));
    }
  };
  visit(root); return files;
};
for (const [name, expected] of Object.entries(fixture.files)) {
  if (sha(readFileSync(join(fixtureRoot, name))) !== expected) throw new Error(`Fixture drift: ${name}`);
}
const scenarios = JSON.parse(readFileSync(join(here, 'cases.json')));
const wanted = opt('--cases')?.split(',');
const selected = scenarios.filter(s => !wanted || wanted.includes(s.id));
if (!selected.length || wanted?.some(id => !scenarios.some(s => s.id === id))) throw new Error('Unknown case');
const artifacts = opt('--out') ? resolve(opt('--out')) : mkdtempSync(join(tmpdir(), 'research-eval-'));
if (existsSync(join(artifacts, 'report.json'))) throw new Error('Existing report: choose a new output directory');
mkdirSync(artifacts, { recursive: true });
const env = { ...process.env, GTM_BRAIN_NO_OPEN: '1', GTM_BRAIN_NO_COMPILE: '1', GTM_BRAIN_NO_COMMIT: '1', GTM_BRAIN_NO_WATCH: '1' };
for (const key of Object.keys(env)) if (/(API_KEY|TOKEN|SECRET|PASSWORD)/i.test(key)) delete env[key];
const run = (cmd, argv, cwd, childEnv = env) => execFileSync(cmd, argv, { cwd, env: childEnv, encoding: 'utf8', timeout: 180000 });
const readEvents = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }) : [];
async function processRun(cmd, argv, cwd, input, file, timeout = 240000) {
  return new Promise((done, fail) => {
    const child = spawn(cmd, argv, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeout);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); fail(error); });
    child.on('close', code => {
      clearTimeout(timer); writeFileSync(file, stdout); writeFileSync(`${file}.stderr`, stderr);
      done({ code, timedOut, stdout });
    });
    child.stdin.end(input || '');
  });
}
const report = { version: 1, mode, model, fixture_revision: fixture.revision, as_of: fixture.as_of,
  source_revision: run('git', ['rev-parse', 'HEAD'], repo).trim(), repeats, plugin: plugin || null,
  baseline: baseline || null, cases: [], semantic_review: 'pending',
  limitation: 'Existing mock files only. No positive live-thread selection or real collector validation.' };
report.skill_hashes = Object.fromEntries(['topic-analyzer', 'audience-loop'].map(name => [name,
  snapshot(mode === 'standalone' ? join(repo, 'skills', name) : join(resolve(baseline || plugin), 'skills', `gtmb-${name}`))]));
report.case_hashes = Object.fromEntries(['cases.json', 'fixture.json', 'gold.json'].map(name => [name, sha(readFileSync(join(here, name)))]));

for (let repeat = 1; repeat <= repeats; repeat++) {
  if (mode === 'brain') {
    // Reuse the repository's real MCP harness, but seed only the Berlin company, never its default retail fixture.
    const p = resolve(plugin), build = resolve(baseline || plugin);
    const brain = mkdtempSync(join(tmpdir(), 'research-berlin-brain-'));
    // Setup registers a brain in its profile. Keep even the seed outside the user's registry;
    // the live harness already isolates its cloned brains and retains CLI auth separately.
    const seedEnv = { ...env, CODEX_HOME: join(artifacts, 'seed-profile') };
    run('git', ['init', '-q', brain], repo);
    run('bash', [join(build, 'scripts/gtm-brain-setup/setup.sh'), '--company', 'Berlin mock sales operation',
      '--one-liner', 'Fictional GTM Brain setup service', '--owner', 'Lena Ortiz <lena@example.test>', '--dashboard', 'on-demand'], brain, seedEnv);
    const lib = await import(pathToFileURL(join(build, 'lib/brain.mjs')));
    const by = lib.readAdmin(brain).team[0].handle;
    const doc = join(build, 'scripts/gtm-brain-documents/document.mjs');
    for (const [ref, file] of [['strategy', 'product/gtm-brain-brief.md'], ['icp', 'content/sample-offer.md'], ['voice', 'content/voice.md']]) {
      run(process.execPath, [doc, brain, '--update', ref, '--body', readFileSync(join(fixtureRoot, file), 'utf8'), '--status', 'draft', '--by', by], brain, seedEnv);
    }
    // Seed source guidance, not account answers or expected findings.
    lib.appendMemory(brain, 'offer', { authors: [by], kind: 'note', content: 'Research uses supplied fictional workshop files as of 16 November 2026. Targeting B2B SaaS teams, agencies and consultancies is a hypothesis, not a validated ICP. The setup service is the selected offering.', source: [{ kind: 'fixture', ref: `${fixture.repository}/tree/${fixture.revision}` }] });
    env.RESEARCH_FIXTURE = resolve(fixtureRoot);
    env.GTM_BRAIN_PLUGIN = build;
    env.GTM_BRAIN_EVAL_CASES = join(p, 'test/live/research-cases.mjs');
    env.GTM_BRAIN_EVAL_BRAIN = brain;
    env.GTM_BRAIN_EVAL_MODEL = model;
    env.GTM_BRAIN_EVAL_DIR = artifacts;
    const started = Date.now();
    const outcome = await processRun(process.execPath, [join(p, 'test/live/tool-routing.mjs'), selected.map(s => `research-${s.id}`).join(',')], repo, '', join(artifacts, `brain-${repeat}.log`), selected.length * 300000);
    const location = outcome.stdout.match(/^Artifacts: (.+)$/m)?.[1];
    const results = location && existsSync(join(location, 'report.json')) ? JSON.parse(readFileSync(join(location, 'report.json'))) : null;
    if (!results) {
      report.cases.push({ id: 'harness', repeat, status: 'inconclusive', code: outcome.code, timedOut: outcome.timedOut, log: `brain-${repeat}.log` });
    } else for (const item of results.cases) report.cases.push({ ...item, id: item.name.replace(/^research-/, ''), repeat, harness_elapsed_ms: Date.now() - started });
  } else {
    for (const scenario of selected) {
      const root = mkdtempSync(join(tmpdir(), 'research-standalone-'));
      const files = [...fixture.common_files, ...scenario.files];
      for (const name of files) { const target = join(root, 'evidence', name); mkdirSync(dirname(target), { recursive: true }); copyFileSync(join(fixtureRoot, name), target); }
      // Include both local skills for optional references; never the Brain checkout or private project files.
      cpSync(join(repo, 'skills/topic-analyzer'), join(root, 'skills/topic-analyzer'), { recursive: true });
      cpSync(join(repo, 'skills/audience-loop'), join(root, 'skills/audience-loop'), { recursive: true });
      const beforeFiles = snapshot(root);
      const header = `Use the skill at skills/${scenario.skill}/SKILL.md and only evidence/ in this isolated workspace. You help the fictional Berlin seller team with the sample GTM Brain setup service. Targeting B2B SaaS teams, agencies and consultancies is a hypothesis. Evidence snapshot: ${fixture.as_of}; later dates are not completed events. No Brain tools are available or required. No real accounts, external research, paid collection, delivery or list changes. Do not read other workspaces, auth or session files. Cite original source IDs or filenames. Keep the response under 500 words.`;
      const turns = [], started = Date.now();
      let retainedAfterFirst = null;
      for (const [n, prompt] of [scenario.prompt, ...(scenario.follow_up ? [scenario.follow_up] : [])].entries()) {
        const prefix = join(artifacts, `${scenario.id}-${repeat}-${n + 1}`), final = `${prefix}.md`;
        const full = `${header}\n\n${prompt}`; writeFileSync(`${prefix}.prompt`, full);
        const outcome = await processRun('codex', ['exec', '--ignore-user-config', '--ephemeral', '--json', '--skip-git-repo-check',
          '--sandbox', scenario.id === 'resume' ? 'workspace-write' : 'read-only', '-C', root, '-m', model,
          '-c', 'features.apps=false', '-c', 'approval_policy="never"', '-o', final, '-'], root, full, `${prefix}.jsonl`);
        turns.push({ code: outcome.code, timedOut: outcome.timedOut, final, events: `${prefix}.jsonl` });
        if (n === 0 && scenario.id === 'resume' && existsSync(join(root, 'saved-finding.md'))) retainedAfterFirst = sha(readFileSync(join(root, 'saved-finding.md')));
        if (outcome.code || outcome.timedOut) break;
      }
      const unchanged = files.every(name => sha(readFileSync(join(root, 'evidence', name))) === fixture.files[name]);
      const events = turns.flatMap(t => readEvents(t.events));
      const toolItems = events.filter(e => e.type === 'item.completed').map(e => e.item);
      const afterFiles = snapshot(root);
      const tokens = events.filter(e => e.type === 'turn.completed').reduce((out, e) => ({ input: out.input + (e.usage?.input_tokens || 0), output: out.output + (e.usage?.output_tokens || 0) }), { input: 0, output: 0 });
      const checks = { process: turns.every(t => t.code === 0 && !t.timedOut), response: turns.every(t => existsSync(t.final) && readFileSync(t.final).length > 0), source_unchanged: unchanged,
        no_external_tools: !toolItems.some(i => ['mcp_tool_call', 'web_search'].includes(i.type)),
        permitted_files: Object.entries(beforeFiles).every(([name, hash]) => afterFiles[name] === hash) && Object.keys(afterFiles).every(name => name in beforeFiles || scenario.id === 'resume' && name === 'saved-finding.md'),
        ...(scenario.id === 'resume' ? { retained: !!retainedAfterFirst, no_duplicate_save: retainedAfterFirst === afterFiles['saved-finding.md'] } : {}) };
      report.cases.push({ id: scenario.id, repeat, status: Object.values(checks).every(Boolean) ? 'pass' : 'fail', checks, tokens, elapsed_ms: Date.now() - started, workspace: root, turns });
      console.log(`${scenario.id} repeat ${repeat}: ${report.cases.at(-1).status}`);
      writeFileSync(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
  }
  writeFileSync(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(`Report: ${join(artifacts, 'report.json')}`);
process.exitCode = report.cases.every(c => c.status === 'pass') ? 0 : 1;

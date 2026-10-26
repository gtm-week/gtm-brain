// Project integration from fresh MCP sessions through hooks, storage, HTTP, revision events,
// and the actual dashboard client. Capture consent is assumed submitted before link_project;
// native question widgets, OS deep-link dispatch and model compilation remain manual checks.
process.env.GTM_BRAIN_NO_SESSION_MAINTENANCE = '1'; // Covered by session-maintenance.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as lib from '../lib/brain.mjs';
import { page } from './helpers/dashboard-page.mjs';
const plugin = fileURLToPath(new URL('../', import.meta.url));

function fixture(t) {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'gtm-project-flow-')));
  const root = join(scratch, 'Company Brain'), bin = join(scratch, 'bin');
  mkdirSync(root); mkdirSync(bin);
  // Never inspect account sign-in, start a model run or open a real Codex task during tests.
  writeFileSync(join(bin, 'codex'), `#!${process.execPath}
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] !== 'app') process.exit(91);
writeFileSync(process.env.GTM_PROJECT_LAUNCH_LOG, JSON.stringify(args));
process.exit(Number(process.env.GTM_PROJECT_LAUNCH_STATUS || 0));
`, { mode: 0o755 });
  const env = { ...process.env, CODEX_HOME: join(scratch, 'profile'), PLUGIN_ROOT: plugin,
    PATH: `${bin}:${process.env.PATH}`, GTM_BRAIN_NO_OPEN: '1', GTM_BRAIN_NO_COMPILE: '1',
    GTM_BRAIN_NO_WATCH: '1', GTM_BRAIN_NO_VERSION_CHECK: '1',
    GTM_PROJECT_LAUNCH_LOG: join(scratch, 'launcher-args.json') };
  const run = (cmd, args, cwd = root, input) => execFileSync(cmd, args,
    { cwd, env, input, encoding: 'utf8', timeout: 30000 });
  // Fresh process for every call: success cannot depend on an old MCP session's memory.
  const call = (name, args = {}, cwd = root, expectError = false) => {
    const out = run(process.execPath, [join(plugin, 'server/server.mjs')], cwd,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { brain: root, ...args } } }) + '\n');
    const messages = out.trim().split('\n').map(JSON.parse);
    assert.equal(messages.length, 1);
    assert.ok(!messages[0].error, JSON.stringify(messages[0]));
    const result = messages[0].result, text = result.content.map(c => c.text || '').join('\n');
    assert.equal(!!result.isError, expectError, `${name}: ${text}`);
    return text;
  };
  t.after(() => {
    try { if (existsSync(join(root, 'work/dash.json'))) run(process.execPath, [join(plugin, 'server/dash.mjs'), root, '--stop']); }
    finally { rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }); }
  });
  call('setup_brain', { folder: root, company: 'Project Flow', one_liner: 'Synthetic project testing',
    owner: 'Alex Example <alex@example.invalid>', dashboard: 'on-demand' });
  return { scratch, root, run, call, env };
}

for (const mode of ['existing', 'new']) test(`${mode} project: MCP link, session, note, live dashboard, scoped chat and unlink`, { timeout: 60000 }, async t => {
  const f = fixture(t);
  const project = join(mode === 'new' ? f.root : f.scratch, "Website & Łódź's #1 $(touch injected) `touch injected`"), slug = 'website-test';
  const ownRules = '# Website\n\nUse the existing design system.\n';
  if (mode === 'existing') {
    mkdirSync(project); writeFileSync(join(project, 'AGENTS.md'), ownRules);
    writeFileSync(join(project, 'README.md'), 'Existing work stays here.\n');
  }
  assert.equal(existsSync(project), mode === 'existing');
  f.call('open_dashboard');
  const url = lib.readDash(f.root).url;
  const getData = async (ready = () => true) => {
    const deadline = Date.now() + 9000;
    while (true) {
      const res = await fetch(`${url}data.json`); assert.ok(res.ok);
      const data = await res.json();
      if (ready(data)) return data;
      assert.ok(Date.now() < deadline, 'the queued dashboard refresh completes');
      await new Promise(done => setTimeout(done, 40));
    }
  };
  assert.ok(!(await getData()).projects.some(p => p.slug === slug));
  const contextSlugs = lib.listContexts(f.root).map(c => c.slug);
  const linked = f.call('link_project', { path: project, create: mode === 'new', slug, title: 'Website Test', contexts: mode === 'new' ? [] : ['market'], by: 'alex-example' });
  assert.equal((await getData(d => d.projects.some(p => p.slug === slug))).projects.find(p => p.slug === slug)?.path, project, 'the open dashboard sees the new project without sync');
  assert.deepEqual(lib.listContexts(f.root).map(c => c.slug), contextSlugs, 'creation does not duplicate contexts');
  if (mode === 'new') {
    assert.match(linked, /Created Website Test/);
    assert.doesNotMatch(linked, /channels|loaded:/i);
    assert.deepEqual(readdirSync(project), ['AGENTS.md', 'CLAUDE.md'], 'the pointer, and its import for Claude Code');
    assert.deepEqual(lib.readLoaded(f.root, slug), []);
  }
  const pointer = lib.readPointer(project);
  assert.equal(pointer.brain, f.root); assert.equal(pointer.slug, slug); assert.equal(pointer.missing, false);
  assert.match(linked, /Sidebar visibility: unverified/);
  assert.ok(linked.includes(`Select ${project}. On macOS, press Cmd+Shift+G`));
  assert.match(linked, /Select that project and start a New task \/ New chat there/);
  assert.match(linked, /A failed or skipped launch does not undo the link/);
  assert.ok(!existsSync(f.env.GTM_PROJECT_LAUNCH_LOG), 'linking leaves the launcher to the workflow and its native shell permissions');
  // Exercise the workflow's printed command against a CLI double, including shell metacharacters
  // in the exact project path and a launcher failure after the link has already succeeded.
  const launch = linked.match(/^Next on macOS: run (codex app .+) through the shell/m)?.[1];
  assert.ok(launch, linked);
  f.env.GTM_PROJECT_LAUNCH_STATUS = mode === 'new' ? '0' : '7';
  if (mode === 'new') f.run('sh', ['-c', launch]);
  else assert.throws(() => f.run('sh', ['-c', launch]), e => e.status === 7);
  assert.deepEqual(JSON.parse(readFileSync(f.env.GTM_PROJECT_LAUNCH_LOG, 'utf8')), ['app', project]);
  assert.ok(!existsSync(join(f.root, 'injected')), 'the folder path is passed literally');
  assert.deepEqual(lib.readPointer(project), pointer, 'launcher failure preserves the successful link');
  if (mode === 'existing') {
    assert.ok(readFileSync(join(project, 'AGENTS.md'), 'utf8').startsWith(ownRules));
    assert.equal(readFileSync(join(project, 'README.md'), 'utf8'), 'Existing work stays here.\n');
  }
  const nested = join(project, 'src'); mkdirSync(nested);
  const beforeNested = readFileSync(join(f.root, 'work/projects.json'), 'utf8');
  assert.match(f.call('link_project', { path: join(project, 'research'), create: true, slug: 'nested' }, project, true), /overlaps linked project/);
  assert.match(f.call('link_project', { path: nested, slug: 'nested' }, project, true), /overlaps linked project/);
  assert.equal(existsSync(join(project, 'research')), false);
  assert.equal(existsSync(join(nested, 'AGENTS.md')), false);
  assert.equal(readFileSync(join(f.root, 'work/projects.json'), 'utf8'), beforeNested);
  assert.match(f.call('setup_brain', { folder: nested, company: 'Nested', one_liner: 'Should be refused', owner: 'Alex Example <alex@example.invalid>' }, nested, true), /inside linked project/);
  assert.equal(existsSync(join(nested, 'brain')), false);
  assert.equal(existsSync(join(nested, 'AGENTS.md')), false);
  const session = '11111111-1111-4111-8111-111111111111';
  const hook = f.run('bash', [join(plugin, 'hooks/session-start.sh')], nested,
    JSON.stringify({ cwd: nested, session_id: session }));
  assert.match(hook, /PROJECT website-test/);
  assert.equal(lib.resolveBrain(nested).root, f.root);
  assert.equal(lib.resolveBrain(nested).project, slug);
  if (mode === 'new') f.call('load_context', { project: slug, contexts: ['market'], mode: 'only' }, nested);
  assert.deepEqual(lib.readLoaded(f.root, slug), ['market']);
  assert.equal(lib.readSession(f.root, slug).session_id, session);
  // A second project and a brain-level task retain independent loaded sets and citations.
  const other = join(f.scratch, 'Research');
  f.call('link_project', { path: other, slug: 'research', contexts: ['offer'] });
  f.call('load_context', { project: 'research', contexts: ['offer'], mode: 'only' }, other);
  assert.deepEqual(lib.readLoaded(f.root, slug), ['market']);
  const saved = f.call('remember', { brain: lib.resolveBrain(nested).root, project: slug, context: 'market',
    by: 'alex-example', kind: 'decision', content: 'Website Test launch target is October 15.' }, nested);
  const id = saved.match(/remembered (m_[0-9a-f]+)/)?.[1]; assert.ok(id, saved);
  const note = lib.readMemories(f.root, 'market').find(m => m.id === id);
  assert.ok(note.tags.includes('project:website-test'));
  assert.ok(note.source.some(s => s.kind === 'codex' && s.ref === session));
  assert.ok(!existsSync(join(project, 'brain')), 'project gets no separate memory store');
  assert.match(f.call('recall', { project: slug, query: 'October' }, nested), /Website Test launch target is October 15/);
  const questionOut = f.call('remember', { project: slug, context: 'market', by: 'alex-example',
    kind: 'question', tags: ['brain-question'], content: 'Should we record October 15 as the launch target?' }, nested);
  const questionId = questionOut.match(/remembered (m_[0-9a-f]+)/)?.[1]; assert.ok(questionId);
  f.call('remember', { project: 'research', context: 'offer', by: 'alex-example',
    kind: 'note', content: 'Research-only control note.' }, other);
  const before = await getData(d => d.questions.some(q => q.id === questionId)
    && d.contexts.some(c => c.memories.some(m => m.content === 'Research-only control note.')));
  const html = await (await fetch(url)).text();
  const listed = before.projects.find(p => p.slug === slug);
  assert.equal(listed.path, project); assert.equal(listed.pointer, true);
  assert.ok(before.questions.some(q => q.id === questionId));
  const ui = page(before, { html });
  ui.run('projectSlug="website-test";renderProject();show("projects");updateChatLink()');
  assert.match(ui.node('#project-detail').innerHTML, /Website Test launch target/);
  assert.doesNotMatch(ui.node('#project-detail').innerHTML, /Research-only control note/);
  const link = new URL(ui.run('chatDraft().href'));
  assert.equal(link.protocol, 'codex:'); assert.equal(link.searchParams.get('path'), project);
  assert.ok(link.searchParams.get('prompt').includes(listed.title));
  assert.match(link.searchParams.get('prompt'), /open questions/);
  assert.ok(!link.searchParams.get('prompt').includes(questionId));
  // Observe real revision events, answer in a fresh MCP process, and verify removal after refresh
  // without running compile or asking the dashboard to perform an action.
  const abort = new AbortController();
  const events = await fetch(`${url}events`, { signal: abort.signal });
  const reader = events.body.getReader();
  const timeout = setTimeout(() => abort.abort(), 10000);
  try {
    await reader.read(); // initial revision
    const compiledBefore = lib.readContext(f.root, 'market').compiledAt;
    f.call('remember', { project: slug, context: 'market', by: 'alex-example', kind: 'decision',
      retracts: questionId, content: 'Yes, record October 15 as the launch target.' }, nested);
    let after = await getData();
    const deadline = Date.now() + 9000;
    while (after.questions.some(q => q.id === questionId) && Date.now() < deadline) {
      await new Promise(done => setTimeout(done, 40)); after = await getData();
    }
    let eventText = '';
    while (!eventText.includes(after.generatedAt)) {
      const chunk = await reader.read(); assert.equal(chunk.done, false);
      eventText += new TextDecoder().decode(chunk.value);
    }
    assert.ok(!after.questions.some(q => q.id === questionId));
    assert.ok(after.decisions.some(m => m.retracts === questionId));
    assert.equal(lib.readContext(f.root, 'market').compiledAt, compiledBefore);
    ui.run('refreshPage()');
    const fresh = page(after, { saved: ui.saved, html: await (await fetch(url)).text() });
    assert.equal(fresh.run('view'), 'projects'); assert.equal(fresh.run('projectSlug'), slug);
    assert.match(fresh.node('#project-detail').innerHTML, /Yes, record October 15/);
    assert.doesNotMatch(new URL(fresh.run('chatDraft().href')).searchParams.get('prompt'), /open questions/);
  } finally { clearTimeout(timeout); abort.abort(); await reader.cancel().catch(() => {}); }
  const notesBefore = readFileSync(join(f.root, 'brain/contexts/market/memories.jsonl'), 'utf8');
  f.call('unlink_project', { slug });
  assert.equal(lib.readPointer(project), null);
  assert.equal(existsSync(join(project, 'CLAUDE.md')), false, 'the Claude Code import goes with the pointer');
  assert.equal(readFileSync(join(f.root, 'brain/contexts/market/memories.jsonl'), 'utf8'), notesBefore);
  let unlinked = await getData(); const unlinkDeadline = Date.now() + 9000;
  while (unlinked.projects.some(p => p.slug === slug) && Date.now() < unlinkDeadline) {
    await new Promise(done => setTimeout(done, 40)); unlinked = await getData();
  }
  assert.ok(!unlinked.projects.some(p => p.slug === slug));
  if (mode === 'existing') assert.equal(readFileSync(join(project, 'AGENTS.md'), 'utf8'), ownRules);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import * as lib from '../lib/brain.mjs';
import { dashboardData } from '../lib/dashboard-data.mjs';
import { entityGraph } from '../lib/entity-graph.mjs';
import { requestDashboardRefresh, dashboardRefreshState, renderQueue, writeJSON } from '../lib/dashboard-refresh.mjs';
process.env.GTM_OS_NO_COMMIT = '1';
process.env.GTM_OS_NO_COMPILE = '1';
process.env.GTM_OS_NO_OPEN = '1';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gtm-entity-write-'));
  mkdirSync(join(root, 'brain'));
  writeFileSync(join(root, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Example', owner: 'ann', team: [{ name: 'Ann Lee', handle: 'ann', email: 'ann@example.test' }], tools: [] }));
  lib.writeContext(root, 'sales', { title: 'Sales' }); lib.writeContext(root, 'market', { title: 'Market' });
  return root;
}
const note = (root, content, extra = {}) => lib.appendMemory(root, 'sales', { authors: ['ann'], content, ...extra }).rec;
const saved = (root, id) => lib.resolveEntity(lib.readNames(root), id);
const checkpoint = root => JSON.parse(readFileSync(join(root, 'work', 'entity-pages.json'), 'utf8'));

test('writes refresh affected pages once, with warm no-op commits and unrelated pages untouched', () => {
  const root = fixture(), a = lib.addName(root, 'Alice'), b = lib.addName(root, 'Bob');
  note(root, 'Alice works with Bob.'); lib.commit(root, ['brain'], 'shared evidence');
  const before = statSync(join(root, b._path)).mtimeMs;
  note(root, 'Alice approved the proposal.'); lib.commit(root, ['brain'], 'new evidence');
  assert.equal(checkpoint(root).refreshed, 1);
  assert.equal(statSync(join(root, b._path)).mtimeMs, before);
  assert.equal(saved(root, a.id)._fm.evidence_as_of, lib.entityFacts(root, a.id).as_of);
  const receipt = readFileSync(join(root, 'work', 'entity-pages.json'), 'utf8');
  lib.commit(root, ['brain'], 'no second rebuild');
  assert.equal(readFileSync(join(root, 'work', 'entity-pages.json'), 'utf8'), receipt);
  lib.addName(root, 'Unmentioned visitor');
  assert.equal(checkpoint(root).refreshed, 1);
});

test('identity edits invalidate neighbors and corrected attribution retains its former context', () => {
  const root = fixture(), a = lib.addName(root, 'Alice'), b = lib.addName(root, 'Bob');
  const first = note(root, 'Alice works with Bob.'); lib.commit(root, ['brain'], 'evidence');
  lib.addName(root, 'Alice', { emails: ['alice@example.test'] });
  assert.equal(checkpoint(root).refreshed, 2);
  assert.equal(saved(root, b.id)._fm.evidence_as_of, lib.entityFacts(root, b.id).as_of);
  note(root, 'Bob works independently.', { supersedes: first.id }); lib.commit(root, ['brain'], 'correction');
  assert.equal(saved(root, a.id)._fm.evidence_as_of, lib.entityFacts(root, a.id).as_of);
  assert.match(saved(root, a.id)._body, /No remaining current claims/);
});

test('large entity pages retain an exact evidence hash and bounded timeline with full history links', () => {
  const root = fixture(), a = lib.addName(root, 'Alice');
  for (let n = 0; n < 160; n++) note(root, `Alice evidence ${n}.`, { at: new Date(Date.UTC(2026, 8, 1, 0, n)).toISOString() });
  lib.commit(root, ['brain'], 'history');
  const entity = saved(root, a.id), facts = lib.entityFacts(root, a.id);
  assert.equal(entity._fm.evidence_as_of, facts.as_of);
  assert.match(entity._body, /latest 100 of 160/);
  assert.match(entity._body, /Full memory history/);
  assert.match(entity._body, /Alice evidence 159/);
  assert.doesNotMatch(entity._body, /Alice evidence 0\./);
  assert.equal(lib.entityBrief(root, a.id).timeline.length, 160, 'full reader still exposes every record');
});

test('dashboard initial input is paged and complete history remains available without brain writes', () => {
  const root = fixture(); lib.addName(root, 'Alice');
  const ids = [];
  for (let n = 0; n < 123; n++) ids.push(note(root, `Alice history ${n}.`).id);
  const before = lib.readMemories(root, 'sales');
  const snapshot = dashboardData(root, lib.readNames(root)), context = snapshot.contexts.find(c => c.slug === 'sales');
  assert.equal(context.memories.length, 50); assert.equal(context.totalMemories, 123); assert.equal(context.history.length, 3);
  const history = context.history.flatMap(path => JSON.parse(readFileSync(join(root, 'work', 'home', path), 'utf8')).memories);
  assert.deepEqual(history.map(m => m.id).sort(), ids.sort());
  assert.equal(snapshot.graph.nodes.find(n => n.name === 'Alice').mentions, 123);
  assert.equal(snapshot.graph.nodes.find(n => n.name === 'Alice').contexts[0].evidence.length, 10);
  assert.deepEqual(lib.readMemories(root, 'sales'), before);
  const pageTime = statSync(join(root, 'work', 'home', context.history[0])).mtimeMs;
  dashboardData(root, lib.readNames(root));
  assert.equal(statSync(join(root, 'work', 'home', context.history[0])).mtimeMs, pageTime, 'unchanged history is reused');
});

test('indexed graph retains correction, withdrawal, archive and fork counts', () => {
  const root = fixture(); lib.addName(root, 'Alice'); lib.addName(root, 'Bob');
  const original = note(root, 'Alice works with Bob.');
  lib.appendMemory(root, 'market', { ...original, id: 'm_aabbcc112233', context: 'market', tags: ['forked:sales'], source: [{ kind: 'memory', ref: original.id }] });
  const old = note(root, 'Alice old observation.'); note(root, 'Withdraw mistaken attribution.', { retracts: old.id });
  const reg = lib.readNames(root), reference = entityGraph(reg, lib.listContexts(root)), actual = dashboardData(root, reg).graph;
  assert.deepEqual(actual.nodes.map(n => [n.name, n.mentions]), reference.nodes.map(n => [n.name, n.mentions]));
  assert.deepEqual(actual.links.map(l => [[l.a, l.b].sort(), l.count]), reference.links.map(l => [[l.a, l.b].sort(), l.count]));
  assert.deepEqual(actual.nodes.find(n => n.name === 'Alice').contexts.map(c => c.withdrawals), reference.nodes.find(n => n.name === 'Alice').contexts.map(c => c.withdrawals));
});

test('refresh requests coalesce, return immediately and report failure without replacing the last view', async () => {
  const root = fixture(), sandbox = mkdtempSync(join(tmpdir(), 'gtm-render-queue-'));
  const previous = process.env.TMPDIR; process.env.TMPDIR = sandbox;
  const renderer = join(root, 'fake-render.mjs');
  writeFileSync(renderer, `import {writeFileSync} from 'node:fs';import {join} from 'node:path';await new Promise(r=>setTimeout(r,300));writeFileSync(join(process.argv[2],'work','rendered-request'),process.env.GTM_OS_RENDER_REQUEST);`);
  const wait = async predicate => { const until = Date.now() + 10000; while (!predicate()) { if (Date.now() > until) throw new Error('Timed out waiting for render worker'); await new Promise(r => setTimeout(r,30)); } };
  try {
    // Simulate a dispatcher killed between requests and a deleted queued brain.
    const lock = join(renderQueue(), 'worker.lock'); mkdirSync(lock, { recursive: true });
    writeJSON(join(lock, 'owner.json'), { pid: 2147483647 });
    requestDashboardRefresh(join(sandbox, 'gone'), renderer);
    const started = performance.now(); requestDashboardRefresh(root, renderer); requestDashboardRefresh(root, renderer);
    assert.ok(performance.now() - started < 250);
    await wait(() => dashboardRefreshState(root).status === 'ready');
    const rendered = readFileSync(join(root, 'work', 'rendered-request'), 'utf8');
    assert.equal(rendered, JSON.parse(readFileSync(join(root, 'work', 'render-request.json'), 'utf8')).id);
    writeFileSync(renderer, 'process.exit(1);'); requestDashboardRefresh(root, renderer);
    await wait(() => dashboardRefreshState(root).status === 'failed');
    assert.equal(readFileSync(join(root, 'work', 'rendered-request'), 'utf8'), rendered);
    assert.match(dashboardRefreshState(root).error, /retry render_dashboard/i);
  } finally { if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous; }
});

test('pending questions beyond the initial page remain browsable with accurate totals', () => {
  const root = fixture();
  for (let n = 0; n < 105; n++) note(root, `Pending question ${n}?`, { kind: 'question', tags: ['brain-question'] });
  const data = dashboardData(root, lib.readNames(root));
  assert.equal(data.questions.length, 100); assert.equal(data.totals.questions, 105);
  const questions = data.listHistory.questions.flatMap(path => JSON.parse(readFileSync(join(root, 'work', 'home', path), 'utf8')).memories);
  assert.equal(new Set(questions.map(q => q.id)).size, 105);
  assert.equal(data.recent.length,100);
  const recent=data.listHistory.recent.flatMap(path=>JSON.parse(readFileSync(join(root,"work","home",path),"utf8")).memories);
  assert.equal(new Set(recent.map(m=>m.id)).size,105);
});

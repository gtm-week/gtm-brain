import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listCodexProjects } from '../lib/codex-projects.mjs';

function host(t, mode) {
  const dir = mkdtempSync(join(tmpdir(), 'gtm-codex-catalog-'));
  const script = join(dir, 'host.cjs'), log = join(dir, 'requests.jsonl');
  writeFileSync(script, `const { appendFileSync } = require('node:fs');
const { createInterface } = require('node:readline');
const mode = ${JSON.stringify(mode)}, log = ${JSON.stringify(log)};
createInterface({ input: process.stdin }).on('line', line => {
  const msg = JSON.parse(line); appendFileSync(log, line + '\\n');
  const reply = result => process.stdout.write(JSON.stringify({ id: msg.id, result }) + '\\n');
  if (msg.method === 'initialize') return reply({});
  if (msg.method === 'initialized') return;
  if (msg.method !== 'project/list') throw new Error('Unexpected write or request');
  if (mode === 'timeout') return;
  if (mode === 'exit') return process.exit(0);
  if (mode === 'unsupported' || (mode === 'partial' && msg.params.cursor)) {
    process.stdout.write(JSON.stringify({ id: msg.id, error: { code: -32601, message: 'unsupported' } }) + '\\n'); return;
  }
  if (mode === 'invalid') return reply({ data: [null] });
  if (mode === 'empty') return reply({ data: [], nextCursor: null });
  if (!msg.params.cursor) return reply({ data: [{ id: 'p1', name: 'Łódź Website', roots: [{ path: '/tmp/site' }, { path: '/tmp/docs' }], metadata: { private: 'must not leak' } }], nextCursor: 'second' });
  reply({ data: [{ id: 'p1', name: 'Łódź Website', roots: [{ path: '/tmp/site' }] }, { id: 'p2', name: 'Curriculum', roots: [{ path: '/tmp/course' }] }], nextCursor: null });
});`);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { options: { command: process.execPath, args: [script] }, log };
}

test('Codex catalog follows pagination, preserves multiple folders, deduplicates IDs and makes only read requests', async t => {
  const f = host(t, 'complete');
  const result = await listCodexProjects(f.options);
  assert.deepEqual(result, { status: 'complete', projects: [
    { id: 'p1', title: 'Łódź Website', paths: ['/tmp/site', '/tmp/docs'] },
    { id: 'p2', title: 'Curriculum', paths: ['/tmp/course'] },
  ] });
  const calls = readFileSync(f.log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls.map(x => x.method), ['initialize', 'initialized', 'project/list', 'project/list']);
  assert.equal(calls[0].params.capabilities.experimentalApi, true);
  assert.equal(calls[3].params.cursor, 'second');
  assert.ok(!JSON.stringify(result).includes('must not leak'));
});

for (const mode of ['unsupported', 'invalid', 'exit', 'timeout']) test(`Codex catalog: ${mode} is unavailable, never a claim that no projects exist`, async t => {
  const f = host(t, mode);
  const result = await listCodexProjects({ ...f.options, timeout: 400 });
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.projects, []);
  assert.equal(typeof result.note, 'string');
});

test('Codex catalog retains known candidates when a later page fails and labels coverage partial', async t => {
  const result = await listCodexProjects(host(t, 'partial').options);
  assert.equal(result.status, 'partial');
  assert.equal(result.projects[0].title, 'Łódź Website');
  assert.ok(result.note);
});

test('Codex catalog distinguishes a completed empty read from an unavailable executable', async t => {
  assert.deepEqual(await listCodexProjects(host(t, 'empty').options), { status: 'complete', projects: [] });
  const missing = await listCodexProjects({ command: '/nonexistent/gtm-codex-test-bin', timeout: 400 });
  assert.equal(missing.status, 'unavailable');
});

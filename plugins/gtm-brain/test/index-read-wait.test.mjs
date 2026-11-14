// A read right after a save is never refused because another process (the dashboard render
// a save starts, a refresh in another chat) is using the memory index.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import * as lib from '../lib/brain.mjs';
import { withMemoryIndex } from '../lib/memory-index.mjs';
import * as store from '../lib/memory-index-store.mjs';
process.env.GTM_BRAIN_NO_COMMIT = '1';
process.env.GTM_BRAIN_NO_COMPILE = '1';
const P = new URL('../', import.meta.url).href;
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gtm-read-wait-'));
  mkdirSync(join(root, 'brain'));
  writeFileSync(join(root, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Wait Fixture', team: [{ name: 'Ann Lee', handle: 'ann', email: 'ann@fixture.test' }] }));
  lib.writeContext(root, 'sales', { title: 'sales' });
  lib.addName(root, 'Chris Taylor');
  for (let n = 0; n < 5; n++) lib.appendMemory(root, 'sales', { authors: ['ann'], content: `Chris Taylor evidence ${n}.` });
  withMemoryIndex(root, i => i.count());
  return root;
}
// Starts a child that holds the index the way its caller does, and waits until it holds it.
function holder(root, code) {
  const signal = join(root, 'work', 'holding'), done = join(root, 'work', 'held');
  const child = spawn(process.execPath, ['--no-warnings', '--input-type=module', '-e', code, root, signal, done, P], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; child.stderr.on('data', d => { err += d; });
  const exited = new Promise(resolve => child.on('exit', code => resolve({ code, err })));
  for (let n = 0; n < 400 && !existsSync(signal); n++) sleep(25);
  assert.ok(existsSync(signal), 'the holder started');
  return exited;
}
const saveAndRead = (root, token) => {
  lib.appendMemory(root, 'sales', { authors: ['ann'], content: `Fresh note ${token}.` });
  const started = Date.now();
  const rows = withMemoryIndex(root, i => i.query({ search: token }));
  return { rows, ms: Date.now() - started };
};

test('a read after a save does not wait for, or fail on, a dashboard render reading the index', async () => {
  const root = fixture();
  // The render's entity pages: the cache is read for a long time after it caught up.
  const exited = holder(root, `
    const [root, signal, done, P] = process.argv.slice(1);
    const { writeFileSync } = await import('node:fs');
    const lib = await import(P + 'lib/brain.mjs'), { refreshIndexedPages } = await import(P + 'lib/entity-pages.mjs');
    let first = true;
    refreshIndexedPages(root, lib.readNames(root), () => { if (first) { first = false; writeFileSync(signal, ''); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2500); writeFileSync(done, ''); } return ''; }, { readOnly: true });`);
  const { rows, ms } = saveAndRead(root, 'zebrafreshone');
  assert.equal(rows.length, 1, 'the read sees its own save');
  assert.ok(!existsSync(join(root, 'work', 'held')), 'the read finished while the render still held its snapshot');
  assert.ok(ms < 2000, `the read did not wait for the render (${ms} ms)`);
  const { code, err } = await exited; assert.equal(code, 0, err);
});

test('a read waits for a refresh in another process instead of reporting the index busy', async () => {
  const root = fixture();
  const exited = holder(root, `
    const [root, signal, done, P] = process.argv.slice(1);
    const { writeFileSync } = await import('node:fs');
    const { cacheLock } = await import(P + 'lib/memory-index-store.mjs');
    const release = cacheLock(root); writeFileSync(signal, '');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000); writeFileSync(done, ''); release();`);
  const { rows, ms } = saveAndRead(root, 'zebrafreshtwo');
  assert.equal(rows.length, 1, 'the read sees its own save after the wait');
  assert.ok(ms >= 1000, `the read waited for the lock (${ms} ms)`);
  const { code, err } = await exited; assert.equal(code, 0, err);
});

test('a current cache is read without the lock, and an open snapshot keeps the cache from being replaced', () => {
  const root = fixture();
  const release = store.cacheLock(root);
  try {
    // Nothing changed since the last read: no lock needed, even while another process holds it.
    assert.equal(withMemoryIndex(root, i => i.count()), 5);
    withMemoryIndex(root, () => {
      assert.throws(() => store.retireCache(root, { readersTimeoutMs: 100 }), /still open/);
      assert.ok(existsSync(store.indexPath(root)), 'the cache was not moved under an open read');
    });
    store.retireCache(root, { readersTimeoutMs: 100 });
    assert.ok(!existsSync(store.indexPath(root)), 'with no open read the cache is replaced');
  } finally { release(); }
  assert.equal(withMemoryIndex(root, i => i.count()), 5, 'the next read rebuilds it');
});

test('200 save-then-read pairs with a render-like reader running beside them: no refusals, every save seen', async () => {
  const root = fixture();
  const stop = join(root, 'work', 'stop');
  const exited = holder(root, `
    const [root, signal, done, P] = process.argv.slice(1);
    const { writeFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { dashboardData } = await import(P + 'lib/dashboard-data.mjs'); const lib = await import(P + 'lib/brain.mjs');
    const { refreshIndexedPages } = await import(P + 'lib/entity-pages.mjs');
    writeFileSync(signal, '');
    let renders = 0;
    // A render's two reads: the dashboard data, then the entity pages, which take a while on
    // a big brain (here 1.2 s). A render that sees the brain change under it gives
    // up and is queued again; that is expected here.
    while (!existsSync(join(root, 'work', 'stop'))) {
      renders++;
      try { dashboardData(root, lib.readNames(root)); } catch (e) { if (!/Brain changed/.test(e.message)) throw e; }
      refreshIndexedPages(root, lib.readNames(root), () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200); return ''; }, { readOnly: true });
    }
    if (!renders) process.exit(3);`);
  let refused = 0, missing = 0;
  try {
    for (let n = 0; n < 200; n++) {
      try { if (saveAndRead(root, `pairtoken${n}x`).rows.length !== 1) missing++; }
      catch (e) { if (/busy/i.test(e.message)) refused++; else throw e; }
    }
  } finally { writeFileSync(stop, ''); }
  assert.deepEqual({ refused, missing }, { refused: 0, missing: 0 });
  const { code, err } = await exited; assert.equal(code, 0, err);
});

// A read right after a save is never refused because another process (the dashboard render
// a save starts, a refresh in another chat) is using the memory index.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import * as lib from '../lib/brain.mjs';
import { withMemoryIndex, openForRead, MemoryIndex } from '../lib/memory-index.mjs';
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

// Review additions.
test('a read that outlasts the short attempts takes the long wait and still succeeds', async () => {
  const root = fixture();
  const exited = holder(root, `
    const [root, signal, done, P] = process.argv.slice(1);
    const { writeFileSync } = await import('node:fs');
    const { cacheLock } = await import(P + 'lib/memory-index-store.mjs');
    const release = cacheLock(root); writeFileSync(signal, '');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500); writeFileSync(done, ''); release();`);
  lib.appendMemory(root, 'sales', { authors: ['ann'], content: 'Fresh note zebralongwait.' });
  // 200 ms of short attempts is over long before the holder lets go: the final wait must carry it.
  const index = openForRead(root, { waitMs: 200, finalWaitMs: 20000 });
  try { assert.equal(index.query({ search: 'zebralongwait' }).length, 1, 'the read sees its own save'); } finally { index.close(); }
  assert.ok(existsSync(join(root, 'work', 'held')), 'the read waited until the holder was done');
  const { code, err } = await exited; assert.equal(code, 0, err);
});

test('an open snapshot does not see a later save; the next read does', () => {
  const root = fixture();
  const open = openForRead(root);
  try {
    assert.equal(open.count(), 5);
    const { rows } = saveAndRead(root, 'zebrasnapshot');
    assert.equal(rows.length, 1, 'a new read sees the save');
    assert.equal(open.count(), 5, 'the open snapshot is unchanged');
    assert.equal(open.query({ search: 'zebrasnapshot' }).length, 0);
    assert.throws(() => open.sync(), /pinned memory index snapshot cannot refresh/, 'and it never writes the cache without the lock');
  } finally { open.close(); }
  assert.equal(withMemoryIndex(root, i => i.count()), 6);
});

test('a reader that was killed does not keep the cache from being replaced', async () => {
  const root = fixture();
  const signal = join(root, 'work', 'holding');
  const child = spawn(process.execPath, ['--no-warnings', '--input-type=module', '-e', `
    const [root, signal, P] = process.argv.slice(1);
    const { writeFileSync } = await import('node:fs');
    const { openForRead } = await import(P + 'lib/memory-index.mjs');
    const index = openForRead(root); index.count(); writeFileSync(signal, '');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);`, root, signal, P], { stdio: 'ignore' });
  const exited = new Promise(resolve => child.on('exit', resolve));
  for (let n = 0; n < 400 && !existsSync(signal); n++) sleep(25);
  assert.ok(existsSync(signal), 'the reader holds its snapshot');
  const release = store.cacheLock(root);
  try {
    assert.throws(() => store.retireCache(root, { readersTimeoutMs: 100 }), /still open/, 'while it lives the cache stays');
    child.kill('SIGKILL'); await exited;
    store.retireCache(root, { readersTimeoutMs: 2000 });
    assert.ok(!existsSync(store.indexPath(root)));
  } finally { release(); }
  assert.equal(withMemoryIndex(root, i => i.count()), 5, 'the next read rebuilds it');
});

// A server of an older version, still running in another chat, knows only the cache lock: it
// replaces the cache (its index version differs) without waiting for open snapshots. The open
// read keeps its old files; closing it must not take the write-ahead log of the new cache with it.
test('an older version replacing the cache under an open read loses nothing from the new cache', () => {
  const root = fixture();
  const open = openForRead(root);
  let rebuilt;
  try {
    assert.equal(open.count(), 5);
    const release = store.cacheLock(root);
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        const current = store.indexPath(root) + suffix, prior = join(root, 'work/memory-index.previous.sqlite') + suffix;
        rmSync(prior, { force: true }); if (existsSync(current)) renameSync(current, prior);
      }
    } finally { release(); }
    lib.appendMemory(root, 'sales', { authors: ['ann'], content: 'Fresh note zebramixed.' });
    rebuilt = new MemoryIndex(root); rebuilt.sync();   // as the older version reads: the lock held throughout
    assert.equal(rebuilt.count(), 6);
    const wal = store.indexPath(root) + '-wal';
    assert.ok(existsSync(wal) && statSync(wal).size > 0, 'the new cache has commits only in its write-ahead log');
    assert.equal(open.count(), 5, 'the open read still answers from the files it opened');
    open.close();
    assert.ok(existsSync(wal) && statSync(wal).size > 0, 'closing the old read left the new write-ahead log alone');
    assert.equal(rebuilt.count(), 6);
  } finally { open.close(); rebuilt?.close(); }
  assert.equal(withMemoryIndex(root, i => i.query({ search: 'zebramixed' })).length, 1, 'and the next read finds the save');
  assert.equal(withMemoryIndex(root, i => i.count()), 6);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { acquireProcessLock, releaseProcessLock } from '../lib/process-lock.mjs';
function fixture(t) { const root = mkdtempSync(join(tmpdir(), 'gtm-lock-test-')); t.after(() => rmSync(root, { recursive: true, force: true })); return join(root, 'lock'); }
test('a live owner is never displaced by age and only its token can release the lock', t => {
  const path = fixture(t), token = acquireProcessLock(path);
  assert.ok(token); const old = new Date(Date.now() - 86400000); utimesSync(path, old, old);
  assert.equal(acquireProcessLock(path), null);
  assert.equal(releaseProcessLock(path, 'different-owner'), false); assert.ok(existsSync(path));
  assert.equal(releaseProcessLock(path, token), true); assert.ok(!existsSync(path));
});

test('different timezone settings do not turn a live owner into a reused PID', t => {
  const path = fixture(t), token = acquireProcessLock(path);
  const module = new URL('../lib/process-lock.mjs', import.meta.url).href;
  const code = `import {acquireProcessLock} from ${JSON.stringify(module)};if(acquireProcessLock(${JSON.stringify(path)}))process.exit(9);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: 'Pacific/Honolulu' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(releaseProcessLock(path, token), true);
});
test('a reused live PID with a different process identity is reclaimed', t => {
  const path = fixture(t), oldToken = acquireProcessLock(path), owner = JSON.parse(readFileSync(join(path, `owner-${oldToken}.json`), 'utf8'));
  writeFileSync(join(path, `owner-${oldToken}.json`), JSON.stringify({ ...owner, identity: 'previous-process' }));
  const token = acquireProcessLock(path); assert.ok(token); assert.notEqual(token, oldToken);
  assert.equal(releaseProcessLock(path, oldToken), false); assert.equal(releaseProcessLock(path, token), true);
});
test('dead owners and interrupted reclaimers recover without retaining their lock', t => {
  const path = fixture(t); mkdirSync(path);
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  writeFileSync(join(path, 'pid'), String(dead));
  writeFileSync(join(path, 'reclaim'), JSON.stringify({ pid: dead, identity: 'dead', token: 'old-reaper' }));
  const token = acquireProcessLock(path); assert.ok(token); releaseProcessLock(path, token);
});
test('legacy PID locks distinguish an older live process from a reused PID', { skip: process.platform === 'win32' }, t => {
  const path = fixture(t); mkdirSync(path); writeFileSync(join(path, 'pid'), String(process.pid));
  assert.equal(acquireProcessLock(path), null);
  const old = new Date(Date.now() - 86400000); utimesSync(path, old, old);
  const token = acquireProcessLock(path); assert.ok(token); releaseProcessLock(path, token);
});

test('concurrent recovery preserves mutual exclusion and the replacement owner', async t => {
  const path = fixture(t), token = acquireProcessLock(path), file = join(path, `owner-${token}.json`);
  const owner = JSON.parse(readFileSync(file, 'utf8')); writeFileSync(file, JSON.stringify({ ...owner, identity: 'previous-process' }));
  const module = new URL('../lib/process-lock.mjs', import.meta.url).href;
  const script = `import {acquireProcessLock,releaseProcessLock} from ${JSON.stringify(module)};
    import fs from 'node:fs';const lock=${JSON.stringify(path)},marker=lock+'-active',counter=lock+'-count';
    for(let n=0;n<8;n++){let token;for(let i=0;i<400&&!token;i++){token=acquireProcessLock(lock);if(!token)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5)}
      if(!token)throw Error('lock never became available');
      const fd=fs.openSync(marker,'wx');fs.closeSync(fd);
      const count=fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8')):0;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);fs.writeFileSync(counter,String(count+1));
      fs.unlinkSync(marker);if(!releaseProcessLock(lock,token))throw Error('lost ownership');}
  `;
  await Promise.all(Array.from({ length: 4 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore','ignore','pipe'] });
    let errors = ''; child.stderr.on('data', d => { errors += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
    child.on('error', reject); child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(errors || `child exited ${code}`)); });
  })));
  assert.equal(readFileSync(path + '-count', 'utf8'), '32'); assert.equal(existsSync(path), false);
});

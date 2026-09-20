#!/usr/bin/env node
// One short-lived dispatcher per OS user, one bounded renderer at a time.
import { mkdirSync, readdirSync, rmSync, openSync, closeSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { renderQueue, readJSON, writeJSON } from '../lib/dashboard-refresh.mjs';
import { openDatabase } from '../lib/memory-index-store.mjs';
const queue = renderQueue(), lock = join(queue, 'worker.lock');
const pause = ms => new Promise(done => setTimeout(done, ms));
mkdirSync(queue, { recursive: true, mode: 0o700 });
let gate;
function acquire() {
  try {
    gate = openDatabase(join(queue, 'worker.sqlite'));
    gate.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE');
    mkdirSync(lock, { recursive: true });
    writeJSON(join(lock, 'owner.json'), { pid: process.pid });
    return true;
  } catch (error) {
    gate?.close(); gate = null;
    if (/busy|locked/i.test(error.message)) return false;
    throw error;
  }
}
if (!acquire()) process.exit(0);
let child;
writeJSON(join(lock, 'owner.json'), { pid: process.pid });
const finish = () => {
  if (child) child.kill('SIGTERM');
  if (readJSON(join(lock, 'owner.json'))?.pid === process.pid) rmSync(lock, { recursive: true, force: true });
  if (gate) { gate.exec('ROLLBACK'); gate.close(); gate = null; }
};
process.on('SIGTERM', () => { finish(); process.exit(0); });
process.on('SIGINT', () => { finish(); process.exit(0); });
try {
  // A small debounce folds a batch of memory/entity writes into one render.
  await pause(200);
  for (;;) {
    const files = readdirSync(queue).filter(f => /^[a-f0-9]{64}\.json$/.test(f));
    if (!files.length) {
      // Release before the final scan: a racing producer either starts a worker
      // or leaves a request that this dispatcher picks up on its next pass.
      finish();
      if (readdirSync(queue).some(f => /^[a-f0-9]{64}\.json$/.test(f))) {
        if (acquire()) continue;
      }
      break;
    }
    for (const file of files) {
      const path = join(queue, file), request = readJSON(path);
      if (!request?.root || !request.renderer || !request.id) { rmSync(path, { force: true }); continue; }
      if (!existsSync(join(request.root, 'brain', 'admin.md'))) { rmSync(path, { force: true }); continue; }
      const state = join(request.root, 'work', 'render-state.json');
      try {
      writeJSON(state, { request: request.id, status: 'running', requestedAt: request.at, startedAt: new Date().toISOString() });
      const log = openSync(join(request.root, 'work', 'render.log'), 'a');
      const result = await new Promise(done => {
        child = spawn(process.execPath, ['--max-old-space-size=160', '--max-semi-space-size=8', '--no-warnings', request.renderer, request.root], { stdio: ['ignore', log, log], env: { ...process.env, GTM_OS_RENDER_REQUEST: request.id } });
        writeJSON(join(lock, 'owner.json'), { pid: process.pid, child: child.pid });
        const timer = setTimeout(() => child?.kill('SIGKILL'), 120000);
        child.once('error', error => { clearTimeout(timer); done({ error: error.message }); });
        child.once('exit', (code, signal) => { clearTimeout(timer); done(code === 0 ? {} : { error: `Renderer exited ${signal || code}; see work/render.log. Retry render_dashboard.` }); });
      });
      closeSync(log); child = null;
      writeJSON(join(lock, 'owner.json'), { pid: process.pid });
      writeJSON(state, { request: request.id, status: result.error ? 'failed' : 'ready', requestedAt: request.at, completedAt: new Date().toISOString(), ...result });
      } catch (error) {
        // A brain can be moved/deleted during a queued render. One unavailable
        // folder must not poison the queue for every other brain on this machine.
        try { writeJSON(state, { request: request.id, status: 'failed', error: error.message }); } catch {}
      }
      if (readJSON(path)?.id === request.id) rmSync(path, { force: true });
    }
  }
} finally { finish(); }

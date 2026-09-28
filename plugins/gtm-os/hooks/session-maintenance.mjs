#!/usr/bin/env node
// Session maintenance is independent of the answer and never fetches source evidence.
import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireProcessLock, releaseProcessLock } from '../lib/process-lock.mjs';
import { writeJSON } from '../lib/dashboard-refresh.mjs';
import * as lib from '../lib/brain.mjs';

const root = resolve(process.argv[2] || '.');
const plugin = fileURLToPath(new URL('..', import.meta.url));
const work = join(root, 'work');
if (!lib.readAdmin(root) || process.env.GTM_OS_RUN) process.exit(0);
mkdirSync(work, { recursive: true });
if (process.argv[3] === '--start') {
  if (process.env.GTM_OS_NO_SESSION_MAINTENANCE) process.exit(0);
  const log = openSync(join(work, 'session-maintenance.log'), 'a');
  try {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), root, '--run', process.argv[4] || ''], {
      cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env,
    });
    child.on('error', error => lib.logActivity(root, 'session-maintenance', error.message));
    child.unref();
  } finally { closeSync(log); }
} else if (process.argv[3] === '--run') {
  const lock = join(work, 'session-maintenance.lock');
  const token = acquireProcessLock(lock);
  if (!token) process.exit(0);
  const state = join(work, 'session-maintenance.json'), failures = [];
  const status = value => writeJSON(state, { status: value, at: new Date().toISOString(), failures });
  const run = (label, command, args, timeout = 20000) => {
    const result = spawnSync(command, args, { cwd: root, timeout, encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GTM_OS_CODEX_TIMEOUT: '15000' } });
    if (result.error || result.status !== 0) {
      failures.push(label);
      lib.logActivity(root, 'session-maintenance', `${label} failed: ${result.error?.message || result.stderr?.trim() || result.status}`);
      return null;
    }
    return result.stdout;
  };
  status('running');
  try {
    // Keep hand edits before attempting a fast-forward. The shared save path owns commits.
    if (lib.unsavedChanges(root).length) {
      const saved = lib.save(root, 'kept: edited by hand outside Codex');
      if (!saved.ok) failures.push('save');
    }
    const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, timeout: 2000, stdio: 'ignore' });
    if (remote.status === 0) run('pull', 'git', ['pull', '--ff-only', '--quiet']);
    run('tools', process.execPath, [join(plugin, 'scripts/gtm-os-connect/connect.mjs'), root, '--check']);
    // Workflow steps whose gate date passed become a due step and a gate question; deterministic, no model.
    run('workflows', process.execPath, [join(plugin, 'scripts/gtm-os-workflow/workflow.mjs'), root, '--due', '--by', 'session']);
    run('dashboard server', process.execPath, [join(plugin, 'server/dash.mjs'), root, '--start'], 8000);
    lib.rerender(root);
  } catch (error) {
    failures.push(error.message);
    lib.logActivity(root, 'session-maintenance', error.message);
  } finally {
    status(failures.length ? 'partial' : 'done');
    releaseProcessLock(lock, token);
  }
}

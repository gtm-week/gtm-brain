import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const plugin = new URL('..', import.meta.url).pathname;
async function until(check) {
  const deadline = Date.now() + 15000;
  while (!check()) {
    if (Date.now() > deadline) assert.fail('Maintenance did not reach the expected state');
    await delay(50);
  }
}

test('session answers proceed while maintenance is blocked; one worker survives a failed pull and renders', async t => {
  const scratch = mkdtempSync(join(tmpdir(), 'gtm-session-worker-'));
  const root = join(scratch, 'brain'), bin = join(scratch, 'bin');
  mkdirSync(root); mkdirSync(bin);
  const env = { ...process.env, PLUGIN_ROOT: plugin, CODEX_HOME: join(scratch, 'profile'),
    GTM_OS_NO_WATCH: '1', GTM_OS_NO_COMPILE: '1', GTM_OS_NO_OPEN: '1', GTM_OS_NO_VERSION_CHECK: '1',
    GTM_OS_NO_SESSION_MAINTENANCE: '' };
  const run = (command, args, extra = {}) => execFileSync(command, args, { cwd: root, env, encoding: 'utf8', ...extra });
  run('git', ['init', '-q']);
  run('git', ['config', 'commit.gpgsign', 'false']);
  run('bash', [join(plugin, 'scripts/gtm-os-setup/setup.sh'), '--company', 'Synthetic', '--owner', 'Test Person <test@example.test>', '--one-liner', 'Test']);
  const actualGit = run('which', ['git']).trim();
  const started = join(scratch, 'pulls'), release = join(scratch, 'release');
  writeFileSync(join(bin, 'git'), `#!${process.execPath}
const fs = require('node:fs'), cp = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === 'remote') process.exit(0);
if (args[0] === 'pull') {
  fs.appendFileSync(${JSON.stringify(started)}, 'pull\\n');
  const timer = setInterval(() => { if (fs.existsSync(${JSON.stringify(release)})) { clearInterval(timer); process.exit(1); } }, 50);
} else {
  const r = cp.spawnSync(${JSON.stringify(actualGit)}, args, { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
`, { mode: 0o755 });
  writeFileSync(join(bin, 'codex'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  env.PATH = `${bin}:${process.env.PATH}`;
  const state = () => { try { return JSON.parse(readFileSync(join(root, 'work/session-maintenance.json'), 'utf8')); } catch { return {}; } };
  t.after(async () => {
    writeFileSync(release, 'release');
    await until(() => ['done', 'partial'].includes(state().status));
    run(process.execPath, [join(plugin, 'server/dash.mjs'), root, '--stop']);
  });
  const hook = () => run('bash', [join(plugin, 'hooks/session-start.sh')], {
    input: JSON.stringify({ session_id: 'test-chat', cwd: root }), timeout: 8000,
  });
  const first = hook();
  assert.doesNotMatch(first, /FIRST ACTION|Dashboard rebuilt/);
  assert.match(first, /Never open, inspect or refresh the dashboard before an ordinary answer/);
  await until(() => existsSync(started));
  assert.equal(state().status, 'running', 'hook returned while pull was still blocked');
  hook();
  run(process.execPath, [join(plugin, 'hooks/session-maintenance.mjs'), root, '--run']);
  assert.equal(readFileSync(started, 'utf8'), 'pull\n', 'concurrent sessions share one worker');
  assert.equal(state().status, 'running');
  writeFileSync(release, 'release');
  await until(() => state().status === 'partial');
  assert.deepEqual(state().failures, ['pull']);
  await until(() => existsSync(join(root, 'work/home/data.json')));
  assert.ok(existsSync(join(root, 'work/dash.json')), 'server startup continues after pull failure');
  assert.equal(JSON.parse(readFileSync(join(root, 'work/session.json'), 'utf8')).session_id, 'test-chat');
  assert.ok(!existsSync(join(root, 'work/sync.json')), 'session maintenance does not advance source sync');
  const before = readFileSync(join(root, 'work/session-maintenance.json'), 'utf8');
  run(process.execPath, [join(plugin, 'hooks/session-maintenance.mjs'), root, '--start'], { env: { ...env, GTM_OS_RUN: 'background' } });
  assert.equal(readFileSync(join(root, 'work/session-maintenance.json'), 'utf8'), before, 'background model runs do not recursively start maintenance');
});

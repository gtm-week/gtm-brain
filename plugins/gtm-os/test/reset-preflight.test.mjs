process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { schedulesForFolder } from './live/reset-preflight.mjs';
test('reset detects schedules even after the brain folder was deleted, without touching other tasks', () => {
  const home = mkdtempSync(join(tmpdir(), 'gtm-reset-'));
  for (const [id, folder] of [['pilot', '/tmp/Absent Brain'], ['other', '/tmp/Other Brain']]) {
    const dir = join(home, 'automations', id); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'automation.toml'), `name = "${id}"\ncwds = ["${folder}"]\n`);
  }
  assert.deepEqual(schedulesForFolder('/tmp/Absent Brain', home), [join(home, 'automations/pilot/automation.toml')]);
  assert.deepEqual(schedulesForFolder('/tmp/Unrelated Brain', home), []);
});

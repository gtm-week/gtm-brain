// Pulling teammates' work into a brain at chat start (session-maintenance.mjs).
import { spawnSync } from 'node:child_process';
import { writeJSON } from '../lib/dashboard-refresh.mjs';
import * as lib from '../lib/brain.mjs';

/* A fast-forward first; when the histories diverged, a merge that uses the brain's merge drivers (notes
   merge by union, covers by the cover driver). A merge that still conflicts is aborted and recorded in
   work/teammates.json, which the next chat start reports (lib.syncNotice). After a merge the derived entity
   pages are regenerated and kept, then the merge is sent back. Returns ok, merged, conflict or failed. */
export function pullTeammates(root, remote, failures = []) {
  const git = (args, timeout = 20000) => spawnSync('git', args, { cwd: root, timeout, encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_MERGE_AUTOEDIT: 'no' } });
  const state = value => writeJSON(lib.syncStatePath(root), { ...value, at: new Date().toISOString() });
  if (git(['pull', '--ff-only', '--quiet']).status === 0) { state({ status: 'ok' }); return 'ok'; }
  const merged = git(['-c', 'commit.gpgsign=false', 'pull', '--no-rebase', '--no-edit', '--quiet']);
  if (merged.status === 0) {
    lib.commit(root, ['brain'], "kept: entity pages after merging teammates' notes", { push: false });
    const pushed = git([...lib.PUSH, remote, 'HEAD'], 30000);
    lib.recordPush(root, { ok: pushed.status === 0, remote, error: pushed.stderr });
    lib.logActivity(root, 'session-maintenance', "merged teammates' changes");
    state({ status: 'merged' });
    return 'merged';
  }
  const files = (git(['diff', '--name-only', '--diff-filter=U']).stdout || '').split('\n').filter(Boolean);
  const merging = git(['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0;
  if (merging) git(['merge', '--abort']);
  failures.push('pull');
  const why = merging ? `conflict in ${files.join(', ') || 'some files'}` : String(merged.stderr || merged.error?.message || '').trim().split('\n')[0];
  lib.logActivity(root, 'session-maintenance', `pull failed: ${why}`);
  if (merging) { state({ status: 'conflict', files }); return 'conflict'; }
  state({ status: 'failed', error: why.slice(0, 200) });
  return 'failed';
}

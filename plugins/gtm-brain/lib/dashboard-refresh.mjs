// Writers request refreshes. The read-only HTTP server only reports this state.
import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const renderQueue = () => join(tmpdir(), 'gtm-brain-render-' + (process.getuid?.() ?? 'local'));
export const readJSON = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
export const writeJSON = (path, value) => {
  const temporary = path + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, JSON.stringify(value)); renameSync(temporary, path);
};
export function dashboardRefreshState(root) {
  const request = readJSON(join(root, 'work', 'render-request.json'));
  const state = readJSON(join(root, 'work', 'render-state.json'));
  if (!request) return state || { status: 'idle' };
  return state?.request === request.id ? state : { status: 'pending', requestedAt: request.at };
}
export function requestDashboardRefresh(root, renderer) {
  root = resolve(root);
  const queue = renderQueue(), work = join(root, 'work');
  mkdirSync(queue, { recursive: true, mode: 0o700 }); mkdirSync(work, { recursive: true });
  const request = { id: randomUUID(), at: new Date().toISOString(), root, renderer };
  writeJSON(join(work, 'render-request.json'), request);
  const key = createHash('sha256').update(root).digest('hex');
  writeJSON(join(queue, key + '.json'), request);
  const owner = readJSON(join(queue, 'worker.lock', 'owner.json'));
  if (owner?.pid) { try { process.kill(owner.pid, 0); return { status: 'pending', requestedAt: request.at }; } catch {} }
  // The worker owns the global lock, so concurrent sessions and brains share one
  // renderer. Requests remain on disk across worker crashes and process exits.
  const log = openSync(join(work, 'render.log'), 'a');
  try {
    const child = spawn(process.execPath, ['--max-old-space-size=32', fileURLToPath(new URL('../server/render-worker.mjs', import.meta.url))], {
      detached: true, stdio: ['ignore', log, log], env: { ...process.env, GTM_BRAIN_RUN: '', GTM_BRAIN_COMPILE_BY: '' },
    });
    child.on('error', error => writeJSON(join(work, 'render-state.json'), { request: request.id, status: 'failed', error: error.message }));
    child.unref();
  } finally { closeSync(log); }
  return { status: 'pending', requestedAt: request.at };
}

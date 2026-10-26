// A separate SQLite lock survives worker/process termination without stale PID files.
// Every cache connection holds it, including status readers, so cache replacement is safe.
import { existsSync, mkdirSync, renameSync, rmSync, lstatSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
// Node 22.13-22.15 and 23 ship node:sqlite without FTS5; the index needs both.
const fts5 = () => { const db = new DatabaseSync(':memory:'); try { db.exec('CREATE VIRTUAL TABLE t USING fts5(x)'); return true; } catch { return false; } finally { db.close(); } };
let indexable;
export const hasMemoryIndex = () => indexable ??= typeof DatabaseSync?.prototype.function === 'function' && fts5();
export const indexPath = root => join(root, 'work/memory-index.sqlite');
const resetPath = root => join(root, 'work/memory-index.reset');
export const cacheResetPending = root => existsSync(resetPath(root));
export function openDatabase(path, { readOnly = false } = {}) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Memory index must not be a symbolic link: ${path}`);
  const db = new DatabaseSync(path, { readOnly });
  try {
    db.exec('PRAGMA busy_timeout=1000; PRAGMA cache_size=-2048; PRAGMA mmap_size=0; PRAGMA temp_store=FILE; PRAGMA foreign_keys=ON;');
    if (!readOnly) db.exec('PRAGMA journal_mode=WAL;');
    return db;
  } catch (e) { db.close(); throw e; }
}
export function cacheLock(root, timeoutMs = 1000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60000) throw new Error('Invalid memory cache lock timeout');
  if (!hasMemoryIndex()) throw new Error('Indexed search requires Node 22.16+ or 24+ (SQLite with FTS5). Update Node.');
  mkdirSync(join(root, 'work'), { recursive: true });
  let db;
  try { db = openDatabase(join(root, 'work/memory-index-lock.sqlite')); }
  catch (e) { throw new Error(`Cannot open memory index coordination file: ${e.message}. Stop all GTM Brain sessions before repairing the local coordination file; a live cache must not be removed.`); }
  try { db.exec(`PRAGMA busy_timeout=${timeoutMs}; BEGIN IMMEDIATE`); }
  catch (e) { db.close(); throw new Error(`Memory index is busy; retry after the current refresh. ${e.message}`); }
  return () => { try { db.exec('ROLLBACK'); } finally { db.close(); } };
}
export function retireCache(root) {
  // Call only after closing the cache while holding cacheLock. Keep one prior cache
  // for diagnosis; it is replaced on the next rebuild, never treated as source truth.
  if (existsSync(resetPath(root)) && lstatSync(resetPath(root)).isSymbolicLink()) throw new Error('Memory index reset marker must not be a symbolic link');
  writeFileSync(resetPath(root), 'reset in progress\n');
  for (const suffix of ['', '-wal', '-shm']) {
    const current = indexPath(root) + suffix, prior = join(root, 'work/memory-index.previous.sqlite') + suffix;
    for (const path of [current, prior]) if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Memory index must not be a symbolic link: ${path}`);
    rmSync(prior, { force: true });
    if (existsSync(current)) renameSync(current, prior);
  }
  rmSync(resetPath(root), { force: true });
}

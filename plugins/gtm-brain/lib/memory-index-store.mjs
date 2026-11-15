// A separate SQLite lock survives worker/process termination without stale PID files.
// cacheLock serializes writes to the cache (refresh, rebuild, replacement). A read holds it
// only while it brings the cache up to date, then pins a WAL snapshot under readerLock and
// lets go, so a long dashboard render never makes the next read wait. Replacing the cache
// takes readerLock exclusively: no open snapshot ever outlives the files it reads.
import { existsSync, mkdirSync, renameSync, rmSync, lstatSync, writeFileSync, appendFileSync } from 'node:fs';
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
// GTM_BRAIN_LOCK_TRACE=<file> appends one JSON line per lock event: who asked, waited or held, for how long.
function trace(root, event, since) {
  const file = process.env.GTM_BRAIN_LOCK_TRACE; if (!file) return;
  const caller = new Error().stack.split('\n').slice(2).filter(l => !/memory-index-store/.test(l)).slice(0, 4).map(l => l.trim().replace(/^at /, '').replace(/\(.*\/gtm-brain\//, '(')).join(' < ');
  try { appendFileSync(file, JSON.stringify({ at: Date.now(), pid: process.pid, script: process.argv[1]?.split('/').slice(-2).join('/'), event, ms: Math.round(performance.now() - since), caller }) + '\n'); } catch {}
}
export function cacheLock(root, timeoutMs = 1000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60000) throw new Error('Invalid memory cache lock timeout');
  if (!hasMemoryIndex()) throw new Error('Indexed search requires Node 22.16+ or 24+ (SQLite with FTS5). Update Node.');
  mkdirSync(join(root, 'work'), { recursive: true });
  let db;
  try { db = openDatabase(join(root, 'work/memory-index-lock.sqlite')); }
  catch (e) { throw new Error(`Cannot open memory index coordination file: ${e.message}. Stop all GTM Brain sessions before repairing the local coordination file; a live cache must not be removed.`); }
  const asked = performance.now();
  try { db.exec(`PRAGMA busy_timeout=${timeoutMs}; BEGIN IMMEDIATE`); }
  catch (e) { db.close(); trace(root, 'refused', asked); throw new Error(`Memory index is busy; retry after the current refresh. ${e.message}`); }
  const held = performance.now(); trace(root, 'acquired', asked);
  return () => { try { db.exec('ROLLBACK'); } finally { db.close(); trace(root, 'released', held); } };
}
// Shared by every pinned read snapshot, exclusive while the cache files are replaced. A
// rollback-journal file, unlike the WAL lock above: SQLite's SHARED and EXCLUSIVE locks are
// exactly a readers-writer lock, and a killed process releases its lock with its descriptors.
function readersFile(root, timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60000) throw new Error('Invalid memory cache lock timeout');
  mkdirSync(join(root, 'work'), { recursive: true });
  const path = join(root, 'work/memory-index-readers.sqlite');
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Memory index coordination file must not be a symbolic link: ${path}`);
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout=${timeoutMs}`);
  return db;
}
export function readerLock(root, timeoutMs = 30000) {
  const db = readersFile(root, timeoutMs), asked = performance.now();
  try { db.exec('BEGIN'); db.prepare('SELECT count(*) FROM sqlite_master').get(); }
  catch (e) { db.close(); trace(root, 'reader refused', asked); throw new Error(`Memory index is being replaced; retry the read. ${e.message}`); }
  const held = performance.now(); trace(root, 'reader acquired', asked);
  return () => { try { db.exec('ROLLBACK'); } finally { db.close(); trace(root, 'reader released', held); } };
}
export function retireCache(root, { readersTimeoutMs = 30000 } = {}) {
  // Call only after closing the cache while holding cacheLock. Keep one prior cache
  // for diagnosis; it is replaced on the next rebuild, never treated as source truth.
  // Pinned readers keep the old files open; wait for them to finish first. An old
  // connection closing after a rename would delete the new cache's WAL by its path.
  const readers = readersFile(root, readersTimeoutMs);
  try { readers.exec('BEGIN EXCLUSIVE'); }
  catch (e) { readers.close(); throw new Error(`Memory index replacement waited for a read that is still open on the old cache. Retry the read. ${e.message}`); }
  try { replace(root); } finally { try { readers.exec('ROLLBACK'); } finally { readers.close(); } }
}
function replace(root) {
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

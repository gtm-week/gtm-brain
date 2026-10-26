// Local cache maintenance is outside the contexts/memories/entities ontology.
import { statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import * as lib from './brain.mjs';
import { MemoryIndex, MEMORY_INDEX_VERSION } from './memory-index.mjs';
import { cacheLock, indexPath, openDatabase, cacheResetPending } from './memory-index-store.mjs';
import { memoryStamp } from './memory-journal.mjs';
const bytes = path => { try { return statSync(path).size; } catch (e) { if (e.code === 'ENOENT') return 0; throw e; } };
function describe(root, db, registry) {
  const sources = lib.listContexts(root, { includeMemories: false }).map(c => ({ file: c.slug, state: memoryStamp(join(c.dir, 'memories.jsonl')) }));
  const meta = key => db?.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value;
  const files = db ? db.prepare('SELECT file,stamp,bytes,complete FROM files').all() : [];
  const pending = sources.filter(s => !files.some(f => f.file === s.file && f.complete && f.stamp === (s.state?.key || 'missing')));
  const removed = files.filter(f => !sources.some(s => s.file === f.file));
  const identitiesChanged = !!db && meta('registry') !== registry;
  const ready = !!db && meta('ready') === '1' && !pending.length && !removed.length && !identitiesChanged;
  const path = indexPath(root), disk = { database: bytes(path), wal: bytes(path + '-wal'), previous: bytes(join(root, 'work/memory-index.previous.sqlite')) + bytes(join(root, 'work/memory-index.previous.sqlite-wal')) };
  const sourceBytes = sources.reduce((n, s) => n + (s.state?.size || 0), 0);
  return {
    status: !db ? 'missing' : ready ? 'ready' : meta('rebuilding') === '1' ? 'rebuilding' : 'stale',
    indexed_records: db ? db.prepare('SELECT count(*) AS n FROM memories').get().n : 0,
    pending_entity_records: db ? db.prepare('SELECT count(*) AS n FROM relinks').get().n : 0,
    indexed_bytes: files.reduce((n, f) => n + f.bytes, 0), source_bytes: sourceBytes,
    pending_contexts: pending.map(s => s.file), removed_contexts: removed.map(f => f.file), identities_changed: identitiesChanged,
    disk_bytes: disk, index_to_source_ratio: sourceBytes ? Number(((disk.database + disk.wal) / sourceBytes).toFixed(2)) : null,
    started_at: meta('started_at') || null, updated_at: meta('updated_at') || null,
    next: ready ? null : 'Call memory_index with mode refresh; continue while status is not ready. Checkpoints survive new chats and process restarts.',
  };
}
export function memoryIndexMaintenance(root, { mode = 'status', budget_ms = 1000 } = {}) {
  root = resolve(root);
  if (!lib.readAdmin(root)) throw new Error('no brain here');
  if (!['status', 'refresh', 'rebuild'].includes(mode)) throw new Error('mode must be status, refresh or rebuild');
  if (!Number.isInteger(budget_ms) || budget_ms < 100 || budget_ms > 5000) throw new Error('budget_ms must be an integer from 100 to 5000');
  const registry = JSON.stringify(lib.readNames(root).map(({ id, name, aliases, emails, previous_ids }) => ({ id, name, aliases, emails, previous_ids })));
  if (mode === 'status') {
    if (!existsSync(indexPath(root))) return describe(root, null, registry);
    let release, db;
    try {
      release = cacheLock(root);
      if (cacheResetPending(root)) return { status: 'rebuilding', next: 'Call memory_index with mode refresh to resume interrupted cache replacement.' };
      db = openDatabase(indexPath(root), { readOnly: true });
      if (db.prepare('PRAGMA user_version').get().user_version !== MEMORY_INDEX_VERSION) return { status: 'incompatible', next: 'Call memory_index with mode rebuild. Source files are preserved.' };
      return describe(root, db, registry);
    } catch (e) {
      if (/busy|locked/i.test(e.message)) return { status: 'busy', next: 'A refresh is running in another session. Retry status after that call finishes.' };
      if ([11, 26].includes(e.errcode & 255)) return { status: 'corrupt', next: 'Call memory_index with mode rebuild. The previous cache is retained for diagnosis; source files are preserved.' };
      throw e;
    } finally { db?.close(); release?.(); }
  }
  const index = new MemoryIndex(root, { rebuild: mode === 'rebuild' });
  try {
    index.sync({ budgetMs: budget_ms });
    return { ...describe(root, index.db, JSON.stringify(index.identitySnapshot)), work: index.stats };
  } finally { index.close(); }
}

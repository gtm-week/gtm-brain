// Disposable disk-backed memory projection. The MCP host uses this API in a worker.
import { foldLatin } from './fold.mjs';
import { sourceMembers } from './pointers.mjs';
import { openSync, closeSync, readSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import * as lib from './brain.mjs';
import { validateAsset } from './assets.mjs';
import { memoryStamp as stamp, trustedMemoryAppend, recordMemoryCheckpoint } from './memory-journal.mjs';
import { entityStamp } from './entity-stamp.mjs';
import { relationsToUs } from './relation-to-us.mjs';
import { buildRelationLog } from './relation-log.mjs';
import { readEntityEvents, entityEventsStamp } from './entity-events.mjs';
import { readSchema } from './schema.mjs';
import { shortId } from './layout.mjs';
import { meetingAnchors, anchorOf } from './meeting-entities.mjs';
import { hasMemoryIndex, indexPath, openDatabase, cacheLock, readerLock, retireCache, cacheResetPending } from './memory-index-store.mjs';
export { hasMemoryIndex };
export const MAX_RECORD_BYTES = 4 * 1024 * 1024;
export const MAX_RESULT_BYTES = 2 * 1024 * 1024;
export const MEMORY_INDEX_VERSION = 10;   // 5: source pointers as members (field source); 6: entity rows with relation to us and SCHEMA.md fields; 7: meeting ids as identity refs; 8: stemmed keywords, word list for typos; 9: relations, relation events and entity events (lib/relation-log.mjs)
const VERSION = MEMORY_INDEX_VERSION;
const normalizeMention = s => foldLatin(s).replace(/[^a-z0-9]+/g, ' ').trim();
function hashFile(path, size) {
  if (!size) return createHash('sha256').digest('hex');
  const fd = openSync(path, 'r'), hash = createHash('sha256'), buffer = Buffer.alloc(65536);
  try {
    for (let at = 0; at < size;) {
      const n = readSync(fd, buffer, 0, Math.min(buffer.length, size - at), at);
      if (!n) throw new Error(`Memory file changed while indexing: ${path}`);
      hash.update(buffer.subarray(0, n)); at += n;
    }
    return hash.digest('hex');
  } finally { closeSync(fd); }
}
// Bounded by one record, even for an initial rebuild or an unterminated JSON line.
function* lines(path, start, size) {
  if (start === size) return;
  const fd = openSync(path, 'r'), buffer = Buffer.alloc(65536);
  let pending = Buffer.alloc(0), offset = start;
  const oversized = () => new Error(`Memory record exceeds the 4 MiB index limit: ${path}. Read this source file directly.`);
  try {
    for (let at = start; at < size;) {
      const n = readSync(fd, buffer, 0, Math.min(buffer.length, size - at), at);
      if (!n) throw new Error(`Memory file changed while indexing: ${path}`);
      at += n;
      const bytes = pending.length ? Buffer.concat([pending, buffer.subarray(0, n)]) : buffer.subarray(0, n);
      let from = 0, end;
      while ((end = bytes.indexOf(10, from)) >= 0) {
        if (end - from > MAX_RECORD_BYTES) throw oversized();
        offset += end - from + 1;
        yield { text: bytes.subarray(from, end).toString('utf8'), newline: true, end: offset }; from = end + 1;
      }
      pending = Buffer.from(bytes.subarray(from));
      if (pending.length > MAX_RECORD_BYTES) throw oversized();
    }
    if (pending.length) yield { text: pending.toString('utf8'), newline: false, end: size };
  } finally { closeSync(fd); }
}
const matches = (row, filters) => Object.entries(filters).every(([key, expected]) => {
  const actual = Array.isArray(row[key]) ? row[key] : [row[key]];
  return actual.some(v => (Array.isArray(expected) ? expected : [expected]).some(w => isDeepStrictEqual(v, w)));
});
export const ENTITY_COLUMNS = ['id', 'name', 'kind', 'subtype', 'status', 'relation_to_us', 'short_id'];
const visible = alias => `${alias}.effective=1 AND NOT EXISTS (SELECT 1 FROM forks f JOIN memories c ON c.rowid=f.memory WHERE f.target=${alias}.id AND c.effective=1)`;
const SCHEMA = `
 CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE IF NOT EXISTS files(file TEXT PRIMARY KEY,stamp TEXT,bytes INTEGER,hash TEXT,newline INTEGER,line INTEGER,complete INTEGER);
 CREATE TABLE IF NOT EXISTS memories(rowid INTEGER PRIMARY KEY,file TEXT,line INTEGER,id TEXT,context TEXT,kind TEXT,via TEXT,at TEXT,time REAL,raw TEXT,entities TEXT,projected TEXT GENERATED ALWAYS AS (json_set(raw,'$.entities',json(entities))) VIRTUAL,authors TEXT,people TEXT,tools TEXT,content TEXT,effective INTEGER DEFAULT 1,asset_entity TEXT,asset_role TEXT,asset_status TEXT,mention_text TEXT,UNIQUE(file,line));
 CREATE INDEX IF NOT EXISTS memory_file_id ON memories(file,id);
 CREATE INDEX IF NOT EXISTS memory_id ON memories(id);
 CREATE INDEX IF NOT EXISTS memory_context_time ON memories(context,time DESC,id);
 CREATE INDEX IF NOT EXISTS memory_time ON memories(time DESC,id);
 CREATE INDEX IF NOT EXISTS memory_kind_time ON memories(kind,time DESC,id);
 CREATE TABLE IF NOT EXISTS members(memory INTEGER REFERENCES memories(rowid) ON DELETE CASCADE,field TEXT,value TEXT);
 CREATE INDEX IF NOT EXISTS member_value ON members(field,value,memory);
 CREATE INDEX IF NOT EXISTS member_memory ON members(memory,field);
 CREATE TABLE IF NOT EXISTS corrections(memory INTEGER REFERENCES memories(rowid) ON DELETE CASCADE,file TEXT,target TEXT);
 CREATE INDEX IF NOT EXISTS correction_target ON corrections(file,target);
 CREATE INDEX IF NOT EXISTS correction_memory ON corrections(memory);
 CREATE TABLE IF NOT EXISTS forks(memory INTEGER REFERENCES memories(rowid) ON DELETE CASCADE,target TEXT);
 CREATE INDEX IF NOT EXISTS fork_target ON forks(target,memory);
 CREATE INDEX IF NOT EXISTS fork_memory ON forks(memory);
 CREATE VIRTUAL TABLE IF NOT EXISTS keywords USING fts5(authors,people,tools,content,content='memories',content_rowid='rowid',tokenize='porter unicode61 remove_diacritics 2');
 CREATE TABLE IF NOT EXISTS keyword_rows(memory INTEGER PRIMARY KEY REFERENCES memories(rowid) ON DELETE CASCADE);
 CREATE VIRTUAL TABLE IF NOT EXISTS identity_text USING fts5(mention_text,content='memories',content_rowid='rowid');
 CREATE VIRTUAL TABLE IF NOT EXISTS identity_vocab USING fts5vocab(identity_text,'row');
 CREATE VIRTUAL TABLE IF NOT EXISTS keywords_vocab USING fts5vocab(keywords,'row');
 CREATE TABLE IF NOT EXISTS relinks(memory INTEGER PRIMARY KEY REFERENCES memories(rowid) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS entity_versions(id TEXT PRIMARY KEY,version INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS entity_rows(id TEXT PRIMARY KEY,name TEXT,kind TEXT,subtype TEXT,status TEXT,relation_to_us TEXT,short_id TEXT,path TEXT,last_mentioned TEXT,raw TEXT);
 CREATE INDEX IF NOT EXISTS entity_row_kind ON entity_rows(kind,relation_to_us);
 CREATE TABLE IF NOT EXISTS entity_fields(id TEXT,field TEXT,value TEXT);
 CREATE INDEX IF NOT EXISTS entity_field_value ON entity_fields(field,value,id);
 CREATE TABLE IF NOT EXISTS relations(id TEXT PRIMARY KEY,from_id TEXT,type TEXT,to_id TEXT,status TEXT,since TEXT,until TEXT,observed_at TEXT,memory TEXT,raw TEXT);
 CREATE INDEX IF NOT EXISTS relation_from ON relations(from_id,type);
 CREATE INDEX IF NOT EXISTS relation_to ON relations(to_id,type);
 CREATE TABLE IF NOT EXISTS relation_events(relation TEXT,at TEXT,event TEXT,status TEXT,basis TEXT,memory TEXT,implied INTEGER);
 CREATE INDEX IF NOT EXISTS relation_event_relation ON relation_events(relation,at);
 CREATE TABLE IF NOT EXISTS entity_events(entity TEXT,at TEXT,change TEXT,from_value TEXT,to_value TEXT,by TEXT,raw TEXT);
 CREATE INDEX IF NOT EXISTS entity_event_entity ON entity_events(entity,at);
 CREATE TRIGGER IF NOT EXISTS entity_member_insert AFTER INSERT ON members WHEN new.field='entities' BEGIN
   INSERT INTO entity_versions VALUES (new.value,1) ON CONFLICT(id) DO UPDATE SET version=version+1;
 END;
 CREATE TRIGGER IF NOT EXISTS entity_member_delete AFTER DELETE ON members WHEN old.field='entities' BEGIN
   INSERT INTO entity_versions VALUES (old.value,1) ON CONFLICT(id) DO UPDATE SET version=version+1;
 END;
 CREATE TRIGGER IF NOT EXISTS memory_insert AFTER INSERT ON memories BEGIN INSERT INTO identity_text(rowid,mention_text) VALUES (new.rowid,new.mention_text); END;
 CREATE TRIGGER IF NOT EXISTS memory_delete BEFORE DELETE ON memories BEGIN
   INSERT INTO keywords(keywords,rowid,authors,people,tools,content) SELECT 'delete',old.rowid,old.authors,old.people,old.tools,old.content WHERE EXISTS(SELECT 1 FROM keyword_rows WHERE memory=old.rowid);
   INSERT INTO identity_text(identity_text,rowid,mention_text) VALUES ('delete',old.rowid,old.mention_text);
 END;
`;
export class MemoryIndex {
  constructor(root, { rebuild = false, lockTimeoutMs = 1000, pinned = false } = {}) {
    this.root = resolve(root);
    if (!lib.readAdmin(this.root)) throw new Error('no brain here');
    // Snapshot identities before taking the cache gate. Entity writers can use the
    // index while holding their own lock without an inverse lock order in readers.
    lib.withEntityLock(this.root, () => {
      this.identityRevision = entityStamp(this.root);
      // the full entries, for an answer's entity card (lib/memory-search.mjs): the shared, frozen registry, never changed here
      const names = this.entries = lib.readNamesShared(this.root);
      // a meeting entity also carries its anchors: notes with that meeting id link to it
      this.identitySnapshot = names.map(e => { const { id, name, aliases, emails, previous_ids } = e, meetings = meetingAnchors(e); return { id, name, aliases, emails, previous_ids, ...(meetings.length ? { meetings } : {}) }; });
      // what query entities filters on: identity, the SCHEMA.md fields compiled on the page, and the page's dates
      const compiled = e => { try { const f = JSON.parse(e._fm?.compiled_fields || '[]'); return Array.isArray(f) ? f.filter(x => x && typeof x.field === 'string' && typeof x.text === 'string') : []; } catch { return []; } };
      this.entitySnapshot = names.map(e => ({ id: e.id, name: e.name, kind: e.kind || 'person', subtype: e.subtype ?? null, status: e.status || 'active', aliases: e.aliases || [], emails: e.emails || [], previous_ids: e.previous_ids || [],
        path: e._path || null, last_mentioned: e._fm?.latest_evidence_at || null, fields: Object.fromEntries(compiled(e).map(f => [f.field, f.text])) }));
    });
    this.path = indexPath(this.root);
    this.stats = { recordsRead: 0, filesRead: 0, rebuiltFiles: 0, hashedBytes: 0, trustedAppends: 0, relinkedRecords: 0, visibilityRows: 0, checkpoints: 0 };
    if (pinned) { this.pinIfCurrent(); return; }
    this.release = cacheLock(this.root, lockTimeoutMs);
    try {
      if (cacheResetPending(this.root)) retireCache(this.root);
      try {
        this.db = openDatabase(this.path);
        const version = this.db.prepare('PRAGMA user_version').get().user_version;
        if ((version && version !== VERSION) || (rebuild && version && this.meta('rebuilding') !== '1')) {
          this.db.close(); this.db = null; retireCache(this.root); this.db = openDatabase(this.path);
        }
      } catch (e) {
        if (![11, 26].includes(e.errcode & 255)) throw e;
        this.db?.close(); this.db = null; retireCache(this.root); this.db = openDatabase(this.path);
      }
      if (!this.db.prepare('PRAGMA user_version').get().user_version) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
          this.db.exec(SCHEMA); this.db.exec(`PRAGMA user_version=${VERSION}`);
          this.setMeta('rebuilding', '1'); this.setMeta('started_at', new Date().toISOString()); this.db.exec('COMMIT');
        } catch (e) { this.db.exec('ROLLBACK'); throw e; }
      }
      this.prepareConnection();
    } catch (e) { this.close(); throw e; }
  }
  prepareConnection() {
    this.db.exec('CREATE TEMP TABLE touched(memory INTEGER PRIMARY KEY);');
    this.db.function('extra_matches', (text, filters) => matches(JSON.parse(text), JSON.parse(filters)) ? 1 : 0);
    this.db.function('text_matches', (text, terms) => JSON.parse(terms).some(t => text.toLowerCase().includes(t)) ? 1 : 0);
  }
  // Without the cache lock: a read snapshot of a cache that already matches every source
  // file and the registry. Anything else (missing, old version, being replaced, behind)
  // leaves this index not ready and closed; openForRead then takes the lock and refreshes.
  pinIfCurrent() {
    this.ready = false;
    try { this.readers = readerLock(this.root, 200); } catch { return; }
    try {
      if (cacheResetPending(this.root) || !existsSync(this.path)) return this.close();
      this.db = openDatabase(this.path);
      if (this.db.prepare('PRAGMA user_version').get().user_version !== VERSION) return this.close();
      this.db.exec('BEGIN'); this.pinned = true;
      // current also means the entity rows match the pages and SCHEMA.md: a snapshot cannot rebuild them
      const before = this.sourceState();
      if (!this.current(before, JSON.stringify(this.identitySnapshot)) || this.meta('entity_rows') !== this.entityRowsKey(before)) return this.close();
      this.prepareConnection();
      this.names = JSON.parse(this.meta('registry')); this.ready = true;
    } catch (e) { this.close(); if (![5, 11, 26].includes(e.errcode & 255)) throw e; }
  }
  // After sync, still holding the cache lock: take a read snapshot, then let the lock go.
  // Later refreshes by other sessions commit beside this snapshot (WAL); none is visible here.
  pinSnapshot() {
    this.requireReady();
    this.readers = readerLock(this.root);
    this.db.exec('BEGIN'); this.pinned = true;
    // Resolve aliases against the same snapshot as the records this read returns.
    this.names = JSON.parse(this.meta('registry'));
    this.release?.(); this.release = null;
    return this;
  }
  close() {
    try {
      if (this.pinned && this.db) { this.pinned = false; try { this.db.exec('ROLLBACK'); } catch {} }
      this.db?.close(); this.db = null;
    } finally {
      try { this.release?.(); this.release = null; } finally { this.readers?.(); this.readers = null; }
    }
  }
  current(before, registry) {
    const db = this.db, file = db.prepare('SELECT stamp FROM files WHERE file=?');
    return this.meta('registry') === registry && this.meta('ready') === '1' && before.length === db.prepare('SELECT count(*) AS n FROM files').get().n && before.every(f => file.get(f.file)?.stamp === (f.state?.key || 'missing'));
  }
  meta(key) { return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value; }
  setMeta(key, value) { this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key, value); }
  sourceState() {
    const contexts = lib.listContexts(this.root, { includeMemories: false });
    const order = new Map(contexts.map((c, i) => [c.slug, i]));
    this.db.function('context_order', file => order.get(file) ?? order.size);
    return contexts.map(c => { const path = join(c.dir, 'memories.jsonl'); return { file: c.slug, path, state: stamp(path) }; });
  }
  registry() {
    if (entityStamp(this.root) !== this.identityRevision) throw new Error('Entity registry changed while indexing. Retry the read.');
    return this.identitySnapshot;
  }
  // A changed identity can alter shared aliases and unique-first-name inference for
  // other identities too. Select all old/new spellings, explicit refs and prior links.
  queueRelinks(previous) {
    const db = this.db, old = new Map(previous.map(n => [n.id, n])), next = new Map(this.names.map(n => [n.id, n]));
    const changed = [...new Set([...old.keys(), ...next.keys()])].filter(id => JSON.stringify(old.get(id)) !== JSON.stringify(next.get(id)));
    if (!changed.length) {
      // Registry order is observable in projected entities. A pure reorder is rare.
      if (JSON.stringify(previous) !== JSON.stringify(this.names)) db.exec('INSERT OR IGNORE INTO relinks SELECT rowid FROM memories');
      return;
    }
    const explicit = db.prepare("INSERT OR IGNORE INTO relinks SELECT memory FROM members WHERE field='identity_ref' AND value=?");
    const linked = db.prepare("INSERT OR IGNORE INTO relinks SELECT memory FROM members WHERE field='entities' AND value=?");
    const text = db.prepare('INSERT OR IGNORE INTO relinks SELECT rowid FROM identity_text WHERE identity_text MATCH ?');
    const refs = new Set(), forms = new Set();
    for (const id of changed) {
      linked.run(JSON.stringify(id));
      for (const n of [old.get(id), next.get(id)].filter(Boolean)) {
        for (const ref of [n.id, ...(n.previous_ids || []), n.name, ...n.aliases, ...n.emails, ...(n.meetings || []).map(a => `meeting:${a}`)]) refs.add(ref.trim().toLowerCase());
        for (const ref of [n.name, ...n.aliases]) { refs.add(ref.toLowerCase().split(/\s+/)[0]); const form = normalizeMention(ref); if (form.length >= 3 && !ref.includes('@')) forms.add(form); }
      }
    }
    for (const ref of refs) explicit.run(ref);
    for (const form of forms) text.run('"' + form + '"');
  }
  // Only new/removed/corrected records and the origins of affected fork copies can
  // change the globally visible FTS corpus. The candidate set lives on disk.
  refreshVisibility() {
    const db = this.db;
    db.exec(`INSERT OR IGNORE INTO touched SELECT m.rowid FROM forks f JOIN memories m ON m.id=f.target WHERE f.memory IN (SELECT memory FROM touched);
      UPDATE memories AS m SET effective=NOT EXISTS(SELECT 1 FROM corrections c WHERE c.file=m.file AND c.target=m.id) WHERE rowid IN (SELECT memory FROM touched);`);
    this.stats.visibilityRows += db.prepare('SELECT count(*) AS n FROM touched').get().n;
    db.exec(`INSERT INTO entity_versions SELECT DISTINCT v.value,1 FROM members v JOIN touched t ON t.memory=v.memory WHERE v.field='entities'
      ON CONFLICT(id) DO UPDATE SET version=version+1;`);
    db.exec(`INSERT INTO keywords(keywords,rowid,authors,people,tools,content) SELECT 'delete',m.rowid,m.authors,m.people,m.tools,m.content FROM memories m WHERE m.rowid IN (SELECT memory FROM touched) AND NOT (${visible('m')}) AND EXISTS(SELECT 1 FROM keyword_rows WHERE memory=m.rowid);
      DELETE FROM keyword_rows WHERE memory IN (SELECT m.rowid FROM memories m WHERE m.rowid IN (SELECT memory FROM touched) AND NOT (${visible('m')}));
      INSERT INTO keywords(rowid,authors,people,tools,content) SELECT m.rowid,m.authors,m.people,m.tools,m.content FROM memories m WHERE m.rowid IN (SELECT memory FROM touched) AND ${visible('m')} AND NOT EXISTS(SELECT 1 FROM keyword_rows k WHERE k.memory=m.rowid);
      INSERT OR IGNORE INTO keyword_rows SELECT m.rowid FROM memories m WHERE m.rowid IN (SELECT memory FROM touched) AND ${visible('m')};
      DELETE FROM touched;`);
  }
  removeFile(file) {
    this.db.prepare('INSERT OR IGNORE INTO touched SELECT m.rowid FROM memories m JOIN forks f ON f.target=m.id JOIN memories c ON c.rowid=f.memory WHERE c.file=?').run(file);
    this.db.prepare('DELETE FROM memories WHERE file=?').run(file);
    this.db.prepare('DELETE FROM files WHERE file=?').run(file);
  }
  sync({ budgetMs = 20000, maxRecords = Infinity, onCheckpoint } = {}) {
    this.ready = false;
    const started = Date.now(), db = this.db;
    this.names = this.registry(); const registry = JSON.stringify(this.names), mention = lib.createMentionMatcher(this.names);
    const byName = new Map(this.names.map((n, i) => [n.name, { id: n.id, order: i }]));
    const project = r => ({ ...r, entities: [...new Set(mention(r))].map(n => byName.get(n)).filter(Boolean).sort((a, b) => a.order - b.order).map(n => n.id) });
    const asset = r => r.asset && !validateAsset(r.asset).length ? [lib.canonicalName(this.names, r.asset.entity) || r.asset.entity, r.asset.role, r.asset.status] : [null, null, null];
    const before = this.sourceState();
    if (this.current(before, registry)) { this.refreshEntities(before); this.ready = true; return this; }
    if (!this.release) throw new Error('A pinned memory index snapshot cannot refresh the cache.');
    const exhausted = () => Date.now() - started >= budgetMs || this.stats.recordsRead + this.stats.relinkedRecords >= maxRecords;
    let transaction = false;
    const savedFiles = new Map();
    const begin = () => { if (!transaction) { db.exec('BEGIN IMMEDIATE'); transaction = true; this.setMeta('ready', '0'); } };
    const checkpoint = () => {
      this.refreshVisibility(); this.setMeta('updated_at', new Date().toISOString()); db.exec('COMMIT'); transaction = false;
      for (const [file, key] of savedFiles) recordMemoryCheckpoint(this.root, file, key);
      savedFiles.clear();
      this.stats.checkpoints++; onCheckpoint?.(this.stats);
    };
    const ensureStable = f => { if (stamp(f.path)?.key !== f.state?.key) throw new Error(`Memory file changed while indexing: ${f.path}. Retry the read.`); };
    try {
      begin();
      const oldRegistry = this.meta('registry');
      if (oldRegistry !== registry) { if (oldRegistry) this.queueRelinks(JSON.parse(oldRegistry)); this.setMeta('registry', registry); }
      const remaining = new Set(before.map(f => f.file));
      for (const old of db.prepare('SELECT file FROM files').all()) if (!remaining.has(old.file)) this.removeFile(old.file);
      const insert = db.prepare('INSERT INTO memories(file,line,id,context,kind,via,at,time,raw,entities,authors,people,tools,content,asset_entity,asset_role,asset_status,mention_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const member = db.prepare('INSERT INTO members VALUES (?,?,?)'), correction = db.prepare('INSERT INTO corrections VALUES (?,?,?)'), fork = db.prepare('INSERT INTO forks VALUES (?,?)');
      const touch = db.prepare('INSERT OR IGNORE INTO touched VALUES (?)');
      const touchTarget = db.prepare('INSERT OR IGNORE INTO touched SELECT rowid FROM memories WHERE file=? AND id=?');
      const saveFile = db.prepare('INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?,?)');
      for (const f of before) {
        const old = db.prepare('SELECT * FROM files WHERE file=?').get(f.file), size = f.state?.size || 0, key = f.state?.key || 'missing';
        if (old?.complete && old.stamp === key) continue;
        begin();
        let append = old && old.stamp === key;
        const trusted = old && old.newline && size >= old.bytes && trustedMemoryAppend(this.root, f.file, old.stamp, key);
        if (trusted) { append = true; this.stats.trustedAppends++; }
        if (!append && old?.newline && size >= old.bytes && old.hash) { this.stats.hashedBytes += old.bytes; append = hashFile(f.path, old.bytes) === old.hash; }
        if (!append) { this.removeFile(f.file); this.stats.rebuiltFiles++; }
        let line = append ? old.line : 0, newline = append ? old.newline : 1, end = append ? old.bytes : 0, batch = 0, batchBytes = 0;
        this.stats.filesRead++;
        for (const entry of lines(f.path, end, size)) {
          line++; newline = Number(entry.newline); end = entry.end;
          if (entry.text.trim()) {
            let r;
            try { r = JSON.parse(entry.text); } catch { throw new Error(`Invalid memory JSON: ${f.path}:${line}. Fix this source before indexing.`); }
            const errors = lib.validateMemory(r);
            if (errors.length || r.context !== f.file) throw new Error(`Invalid memory: ${f.path}:${line}. ${errors.join('; ') || 'Context does not match the source folder.'}`);
            const row = project(r);
            const rowid = insert.run(f.file, line, r.id, r.context, r.kind, r.via, r.at, Date.parse(r.at) || 0, JSON.stringify(r), JSON.stringify(row.entities), r.authors.join(' '), r.people.join(' '), r.tools.join(' '), r.content, ...asset(r), normalizeMention(r.content)).lastInsertRowid;
            for (const field of ['authors', 'people', 'tools', 'tags', 'entities']) for (const value of row[field]) member.run(rowid, field, JSON.stringify(value));
            for (const ref of new Set([...(r.entities || []), ...r.people, ...(r.asset ? [r.asset.entity] : []), ...(anchorOf(r) ? [`meeting:${anchorOf(r)}`] : [])])) member.run(rowid, 'identity_ref', String(ref).trim().toLowerCase());
            for (const key of sourceMembers(r.source)) member.run(rowid, 'source', JSON.stringify(key));
            touch.run(rowid);
            for (const target of [r.supersedes, r.retracts].filter(Boolean)) { correction.run(rowid, f.file, target); touchTarget.run(f.file, target); }
            if (lib.isForkCopy(r)) for (const source of r.source.filter(s => s.kind === 'memory')) fork.run(rowid, source.ref);
            this.stats.recordsRead++;
          }
          batch++; batchBytes += Buffer.byteLength(entry.text);
          if (batch >= 1000 || batchBytes >= 4 * 1024 * 1024 || exhausted()) {
            ensureStable(f); saveFile.run(f.file, key, end, null, newline, line, 0); savedFiles.set(f.file, key); checkpoint();
            if (exhausted()) return this;
            begin(); batch = 0; batchBytes = 0;
          }
        }
        // Only untrusted edits need a historical hash. Trusted writes use receipts;
        // an interrupted build can resume by its unchanged full-file stamp.
        const hash = trusted ? null : hashFile(f.path, size); if (!trusted) this.stats.hashedBytes += size;
        ensureStable(f); saveFile.run(f.file, key, size, hash, newline, line, 1); savedFiles.set(f.file, key); checkpoint();
        if (exhausted()) return this;
      }
      begin();
      const update = db.prepare('UPDATE memories SET entities=?,asset_entity=?,asset_role=?,asset_status=? WHERE rowid=?');
      const remove = db.prepare("DELETE FROM members INDEXED BY member_memory WHERE memory=? AND field='entities'");
      const pending = db.prepare('SELECT r.memory,m.raw FROM relinks r JOIN memories m ON m.rowid=r.memory ORDER BY r.memory LIMIT 500');
      for (;;) {
        let processed = 0;
        for (const r of pending.iterate()) {
          const raw = JSON.parse(r.raw), row = project(raw);
          update.run(JSON.stringify(row.entities), ...asset(raw), r.memory); remove.run(r.memory);
          for (const value of row.entities) member.run(r.memory, 'entities', JSON.stringify(value));
          db.prepare('DELETE FROM relinks WHERE memory=?').run(r.memory); this.stats.relinkedRecords++; processed++;
          if (exhausted()) break;
        }
        if (!processed) break;
        checkpoint(); if (exhausted()) return this; begin();
      }
      for (const f of before) ensureStable(f);
      if (JSON.stringify(this.registry()) !== registry) throw new Error('Entity registry changed while indexing. Retry the read.');
      this.setMeta('ready', '1'); this.setMeta('rebuilding', '0'); checkpoint(); this.refreshEntities(before); this.ready = true; return this;
    } catch (e) { if (transaction) db.exec('ROLLBACK'); throw e; }
  }
  /* The entity rows query entities filters on, rebuilt when an identity or a memory file changed: relation to
     us (lib/relation-to-us.mjs) from the visible relation and customer notes, and each compiled SCHEMA.md field. */
  entityRowsKey(before) { return JSON.stringify([this.identityRevision, before.map(f => f.state?.key || 'missing'), readSchema(this.root).schema?.hash || null, entityEventsStamp(this.root)]); }
  refreshEntities(before) {
    const db = this.db, key = this.entityRowsKey(before);
    if (this.meta('entity_rows') === key) return;
    if (!this.release) throw new Error('A pinned memory index snapshot cannot refresh the cache.');
    const linked = db.prepare(`SELECT m.raw FROM memories m WHERE ${visible('m')} AND (json_extract(m.raw,'$.relation') IS NOT NULL OR json_extract(m.raw,'$.customer') IS NOT NULL OR json_extract(m.raw,'$.meeting') IS NOT NULL)`).all().map(r => JSON.parse(r.raw));
    const notes = linked.filter(m => m.relation || m.customer), schema = readSchema(this.root).schema || null;
    const relation = relationsToUs({ registry: this.entitySnapshot, memories: notes, admin: lib.readAdmin(this.root), schema });
    // the relationship log (lib/relation-log.mjs) and the entity log (lib/entity-events.mjs), rebuilt with the rows
    const byRef = new Map(); for (const e of this.entitySnapshot) for (const id of [e.id, ...e.previous_ids]) byRef.set(id, e);
    const resolve = v => { const e = byRef.get(v) || lib.resolveEntity(this.entries, v); return e ? { id: e.id, kind: e.kind || 'person' } : null; };
    const meetings = new Map(this.identitySnapshot.flatMap(e => (e.meetings || []).map(a => [a, e.id])));
    const { relations } = buildRelationLog(linked, { resolve, schema, meetingOf: a => meetings.get(a) || null, anchorOf });
    const entityEvents = readEntityEvents(this.root);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DELETE FROM entity_rows; DELETE FROM entity_fields; DELETE FROM relations; DELETE FROM relation_events; DELETE FROM entity_events;');
      const rel = db.prepare('INSERT INTO relations VALUES (?,?,?,?,?,?,?,?,?,?)'), relEvent = db.prepare('INSERT INTO relation_events VALUES (?,?,?,?,?,?,?)'), entEvent = db.prepare('INSERT INTO entity_events VALUES (?,?,?,?,?,?,?)');
      for (const r of relations) {
        rel.run(r.id, r.from, r.type, r.to, r.status, r.since, r.until, r.observed_at, r.memory, JSON.stringify(r));
        for (const e of r.events) relEvent.run(r.id, e.at, e.event, e.status, e.basis || null, e.memory, e.implied ? 1 : 0);
      }
      for (const e of entityEvents) entEvent.run(byRef.get(e.entity)?.id || e.entity, e.at, e.change, e.from, e.to, e.by || null, JSON.stringify(e));
      const row = db.prepare('INSERT INTO entity_rows VALUES (?,?,?,?,?,?,?,?,?,?)'), field = db.prepare('INSERT INTO entity_fields VALUES (?,?,?)');
      for (const e of this.entitySnapshot) {
        const out = { id: e.id, name: e.name, kind: e.kind, subtype: e.subtype, status: e.status, relation_to_us: relation.get(e.id) || null, aliases: e.aliases, emails: e.emails, previous_ids: e.previous_ids, short_id: shortId(e.id), path: e.path, last_mentioned: e.last_mentioned, fields: e.fields };
        row.run(e.id, e.name, e.kind, e.subtype, e.status, out.relation_to_us, out.short_id, e.path, e.last_mentioned, JSON.stringify(out));
        for (const [k, v] of Object.entries(e.fields)) field.run(e.id, k, String(v).toLowerCase());
      }
      this.setMeta('entity_rows', key); db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  /* The relationship log, read from the index: every relation of an entity (either end), of a type, or all. */
  relations({ entity = null, type = null } = {}) {
    this.requireReady();
    const where = [], params = [];
    if (entity) { const id = this.entitySnapshot.find(e => e.id === entity || e.previous_ids.includes(entity))?.id || entity; where.push('(from_id=? OR to_id=?)'); params.push(id, id); }
    if (type) { const t = (readSchema(this.root).schema && this.relationType(type)) || type; where.push('type=?'); params.push(t); }
    const name = new Map(this.entitySnapshot.map(e => [e.id, e.name]));
    return this.db.prepare(`SELECT raw FROM relations${where.length ? ' WHERE ' + where.join(' AND ') : ''}`).all(...params).map(r => JSON.parse(r.raw))
      .sort((a, b) => (name.get(a.from) || a.from).localeCompare(name.get(b.from) || b.from) || a.type.localeCompare(b.type) || (name.get(a.to) || a.to).localeCompare(name.get(b.to) || b.to));
  }
  relationType(type) { const s = readSchema(this.root).schema, rel = s?.relations || {}; return rel[type] ? type : Object.entries(rel).find(([, r]) => r.formerly?.includes(type))?.[0] || null; }
  /* An entity's renames, merges and kind changes, oldest first; a merged entity's past stays with the survivor. */
  entityEvents(entity) {
    this.requireReady();
    const e = this.entitySnapshot.find(x => x.id === entity || x.previous_ids.includes(entity)); if (!e) return [];
    const ids = [e.id, ...e.previous_ids];
    return this.db.prepare(`SELECT raw FROM entity_events WHERE entity IN (${ids.map(() => '?').join(',')}) ORDER BY at`).all(...ids).map(r => JSON.parse(r.raw));
  }
  resolveEntity(ref) { return lib.resolveEntity(this.entries, ref); }
  relationsToUs() { return new Map(this.db.prepare('SELECT id, relation_to_us FROM entity_rows WHERE relation_to_us IS NOT NULL').all().map(r => [r.id, r.relation_to_us])); }
  /* query entities with filters, without reading a page: kind, subtype, status, relation_to_us, id, name, short_id
     match exactly (a list means any of them; a retired id names its survivor); aliases and emails match a member;
     any other key is a SCHEMA.md field compiled on the page, matched case-insensitively as a part of its value
     ({ role: "VP Sales" } finds "VP Sales EMEA"). Active entities only unless status or id is given. */
  entities({ filters = {}, limit = 50 } = {}) {
    this.requireReady();
    filters = { ...filters };
    if (Object.hasOwn(filters, 'id')) { const canonical = id => this.entitySnapshot.find(e => e.id === id || e.previous_ids.includes(id))?.id || id; filters.id = Array.isArray(filters.id) ? filters.id.map(canonical) : canonical(filters.id); }
    if (!Object.hasOwn(filters, 'id') && !Object.hasOwn(filters, 'status')) filters.status = 'active';
    const clauses = [], params = [];
    for (const [key, expected] of Object.entries(filters)) {
      const choices = (Array.isArray(expected) ? expected : [expected]).map(v => v === null ? null : String(v));
      if (!choices.length) { clauses.push('0'); continue; }
      if (ENTITY_COLUMNS.includes(key)) {
        const nulls = choices.includes(null), values = choices.filter(v => v !== null);
        clauses.push(`(${[...(values.length ? [`e.${key} IN (${values.map(() => '?').join(',')})`] : []), ...(nulls ? [`e.${key} IS NULL`] : [])].join(' OR ')})`); params.push(...values);
      } else if (key === 'aliases' || key === 'emails') {
        clauses.push(`EXISTS(SELECT 1 FROM json_each(json_extract(e.raw,'$.${key}')) j WHERE lower(j.value) IN (${choices.map(() => '?').join(',')}))`); params.push(...choices.map(v => String(v).toLowerCase()));
      } else {
        clauses.push(`EXISTS(SELECT 1 FROM entity_fields f WHERE f.id=e.id AND f.field=? AND (${choices.map(() => "instr(f.value, ?) > 0").join(' OR ')}))`); params.push(key, ...choices.map(v => String(v).toLowerCase()));
      }
    }
    params.push(Math.max(1, Math.min(500, Number(limit) || 50)));
    return this.db.prepare(`SELECT e.raw FROM entity_rows e${clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''} ORDER BY e.last_mentioned IS NULL, e.last_mentioned DESC, e.name, e.id LIMIT ?`).all(...params).map(r => JSON.parse(r.raw));
  }
  requireReady() { if (!this.ready) throw new Error('Memory index refresh is in progress. Call memory_index with mode refresh until status is ready, then retry the query. No partial search results were returned.'); }
  count() { this.requireReady(); return this.db.prepare(`SELECT count(*) AS n FROM memories m WHERE ${visible('m')}`).get().n; }
  query({ filters = {}, search = '', limit = 50 } = {}) {
    this.requireReady();
    let { prefix, where, params } = this.filterSql(filters);
    if (search.trim()) {
      const query = search.trim(), terms = new Set([query.toLowerCase()]);
      for (const term of [query, ...query.split(/\s+/)]) {
        const canonical = lib.canonicalName(this.names, term);
        if (canonical) { terms.add(canonical.toLowerCase()); for (const alias of this.names.find(n => n.name === canonical)?.aliases || []) terms.add(alias.toLowerCase()); }
      }
      where.push('text_matches(m.projected,?)'); params.push(JSON.stringify([...terms]));
    }
    params.push(Math.max(1, Math.min(501, Number(limit) || 50)));
    return this.bounded(this.db.prepare(`${prefix}SELECT m.projected FROM memories m WHERE ${where.join(' AND ')} ORDER BY m.time DESC,m.id LIMIT ?`), params);
  }
  // The exact filters of query as SQL over memories m: a prefix (a WITH clause or ''), the WHERE
  // terms and their parameters, with the same fork and correction handling. lib/memory-search.mjs
  // adds its narrowing and full-text terms after these.
  filterSql(filters = {}) {
    filters = { ...filters };
    if (Object.hasOwn(filters, 'entities')) {
      const canonical = id => lib.resolveEntity(this.names, id)?.id || id;
      filters.entities = Array.isArray(filters.entities) ? filters.entities.map(canonical) : canonical(filters.entities);
    }
    const clauses = ['m.effective=1'], params = [], extra = {};
    for (const [key, expected] of Object.entries(filters)) {
      const choices = Array.isArray(expected) ? expected : [expected];
      if (!choices.length) { clauses.push('0'); continue; }
      if (['id', 'context', 'kind', 'via', 'at', 'content'].includes(key) && choices.every(v => typeof v === 'string')) {
        clauses.push(`m.${key} IN (${choices.map(() => '?').join(',')})`); params.push(...choices);
      } else if (['entities', 'people', 'authors', 'tools', 'tags'].includes(key) && choices.every(v => typeof v === 'string')) {
        clauses.push(`EXISTS(SELECT 1 FROM members v WHERE v.memory=m.rowid AND v.field=? AND v.value IN (${choices.map(() => '?').join(',')}))`);
        params.push(key, ...choices.map(v => JSON.stringify(v)));
      } else extra[key] = expected;
    }
    if (Object.keys(extra).length) { clauses.push('extra_matches(m.projected,?)'); params.push(JSON.stringify(extra)); }
    const scoped = Object.hasOwn(filters, 'context'), filtered = Object.keys(filters).length > 0;
    // Fork handling follows exact filters but precedes text search. Materialize IDs only.
    let prefix = '', where = [...clauses];
    if (!scoped && filtered) {
      prefix = `WITH candidates AS MATERIALIZED(SELECT m.rowid,m.id FROM memories m WHERE ${clauses.join(' AND ')}) `;
      where = ['m.rowid IN (SELECT rowid FROM candidates)', 'NOT EXISTS(SELECT 1 FROM forks f JOIN candidates c ON c.rowid=f.memory WHERE f.target=m.id)'];
    } else if (!scoped) where.push(visible('m'));
    return { prefix, where, params };
  }
  keywords(terms, project = null) {
    this.requireReady();
    if (!terms.length) return { total: 0, groups: [[], []], counts: [0, 0] };
    const q = terms.map(t => `"${t.replace(/"/g, '')}"`).join(' OR ');
    const from = 'FROM keywords k JOIN memories m ON m.rowid=k.rowid WHERE keywords MATCH ?';
    const membership = "EXISTS(SELECT 1 FROM members v WHERE v.memory=m.rowid AND v.field='tags' AND v.value=?)";
    const groups = [], counts = [];
    for (const own of project ? [true, false] : [null]) {
      const suffix = own === null ? '' : ` AND ${own ? '' : 'NOT '}${membership}`;
      const params = own === null ? [q] : [q, JSON.stringify('project:' + project)];
      counts.push(this.db.prepare(`SELECT count(*) AS n ${from}${suffix}`).get(...params).n);
      groups.push(this.bounded(this.db.prepare(`SELECT m.raw,rank AS score ${from}${suffix} ORDER BY rank,context_order(m.file),m.line LIMIT 40`), params, 'raw'));
    }
    return { total: counts.reduce((a, b) => a + b, 0), groups, counts };
  }
  assetConflicts() {
    this.requireReady();
    // Ambiguity depends on approved evidence, even when its attachment file is unreachable.
    return this.db.prepare(`SELECT m.asset_entity AS entity,m.asset_role AS role FROM memories m WHERE m.effective=1 AND m.asset_status='approved' AND NOT EXISTS(SELECT 1 FROM forks f WHERE f.target=m.id) GROUP BY m.asset_entity,m.asset_role HAVING count(DISTINCT m.id)>1 LIMIT 200`).all();
  }
  /* One read-only SELECT over the index (ALL-204 step 2a). Temporary views shadow the raw tables
     with the dashboard's visibility rules: memories = effective, not retracted, not superseded by
     a fork, and not a retraction note; members = their people, tools, tags and entities; contexts
     and entities come from the brain's files; keywords is the FTS table, joined on rowid. */
  sql(text, { limit = 200 } = {}) {
    this.requireReady();
    let statement = String(text || '').trim().replace(/;\s*$/, '');
    if (statement.includes(';')) throw new Error('Run one statement at a time: the SQL contained more than one.');
    if (!/^(select|with)\b/i.test(statement) || /\b(attach|detach|pragma)\b/i.test(statement)) throw new Error('Only a single SELECT (or WITH ... SELECT) is accepted: the memory index is read-only. Use describe_object for the columns of memories, members, contexts, entities and keywords.');
    if (!this.viewsReady) {
      const visible = "m.effective=1 AND json_extract(m.projected,'$.retracts') IS NULL AND NOT EXISTS (SELECT 1 FROM forks f JOIN main.memories c ON c.rowid=f.memory WHERE f.target=m.id AND c.effective=1)";
      const field = name => `json_extract(m.projected,'$.${name}')`;
      this.db.exec(`CREATE TEMP VIEW memories AS SELECT m.rowid AS rowid, m.id AS id, m.context AS context, m.kind AS kind, m.at AS at, m.via AS via, ${field('content')} AS content, ${field('authors')} AS authors, ${field('people')} AS people, ${field('tools')} AS tools, ${field('tags')} AS tags, ${field('entities')} AS entities, ${field('source')} AS sources, ${field('supersedes')} AS supersedes, m.time AS time FROM main.memories m WHERE ${visible};
        CREATE TEMP VIEW members AS SELECT m.id AS memory_id, v.field AS field, json_extract(v.value,'$') AS value FROM main.members v JOIN memories m ON m.rowid=v.memory;
        CREATE TEMP TABLE contexts(slug TEXT PRIMARY KEY, title TEXT, status TEXT, summary TEXT, rule TEXT, loaded INTEGER);
        CREATE TEMP VIEW entities AS SELECT e.id AS id, e.name AS name, e.kind AS kind, e.subtype AS subtype, json_extract(e.raw,'$.aliases') AS aliases, json_extract(e.raw,'$.emails') AS emails, e.status AS status, e.relation_to_us AS relation_to_us, e.short_id AS short_id, e.path AS path, e.last_mentioned AS last_mentioned, json_extract(e.raw,'$.fields') AS fields FROM main.entity_rows e;`);
      const loaded = new Set(lib.readLoaded(this.root));
      const putContext = this.db.prepare('INSERT INTO contexts VALUES (?,?,?,?,?,?)');
      for (const c of lib.listContexts(this.root, { includeMemories: false })) putContext.run(c.slug, c.title || c.slug, c.status || 'active', c.summary || '', c.rule || '', loaded.has(c.slug) ? 1 : 0);
      this.viewsReady = true;
    }
    this.db.exec('PRAGMA query_only=1');
    const n = Math.max(1, Math.min(200, Number(limit) || 200));
    const prepared = this.db.prepare(`SELECT * FROM (${statement}) LIMIT ?`);
    const columns = prepared.columns().map(c => c.name);
    const rows = []; let bytes = 0;
    for (const row of prepared.iterate(n + 1)) {
      bytes += Buffer.byteLength(JSON.stringify(row));
      if (bytes > MAX_RESULT_BYTES) throw new Error('SQL results exceed 2 MiB. Select fewer columns or rows; no partial result was returned.');
      rows.push({ ...row });   // plain objects: node:sqlite rows carry a null prototype
    }
    return { columns, rows: rows.slice(0, n), truncated: rows.length > n };
  }
  bounded(statement, params, field = 'projected') {
    const rows = []; let bytes = 0;
    for (const row of statement.iterate(...params)) {
      bytes += Buffer.byteLength(row[field]);
      if (bytes > MAX_RESULT_BYTES) throw new Error('Memory results exceed 2 MiB. Narrow the context, filters, or limit; no partial result was returned.');
      rows.push({ ...JSON.parse(row[field]), ...(row.score !== undefined ? { score: row.score } : {}) });
    }
    return rows;
  }
}
// A read never reports a busy cache to the model. A current cache is read at once, without
// the lock. Otherwise short lock attempts with backoff, each followed by another look for a
// cache another session has just refreshed, for up to READ_WAIT_MS; then one long wait for
// the lock and a fresh refresh here. A session sees its own write: its save changed a
// source stamp, so a snapshot older than the save is never current.
export const READ_WAIT_MS = 5000;
export function openForRead(root, { waitMs = READ_WAIT_MS, finalWaitMs = 25000 } = {}) {
  const deadline = Date.now() + waitMs;
  for (let step = 25; ; step = Math.min(step * 2, 400)) {
    const current = new MemoryIndex(root, { pinned: true });
    if (current.ready) return current;
    const left = deadline - Date.now();
    let index;
    try { index = new MemoryIndex(root, { lockTimeoutMs: left > 0 ? Math.min(step, left) : finalWaitMs }); }
    catch (e) { if (left > 0 && /Memory index is busy/.test(e.message)) continue; throw e; }
    try { index.sync(); return index.pinSnapshot(); } catch (e) { index.close(); throw e; }
  }
}
export function withMemoryIndex(root, fn) {
  const index = openForRead(root);
  try { return fn(index); } finally { index.close(); }
}

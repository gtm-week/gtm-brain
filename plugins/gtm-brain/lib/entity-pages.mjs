// Disposable page checkpoints over the shared memory index. Canonical identity
// and user Markdown remain in entity files; no facts are stored in this cache.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { MemoryIndex } from './memory-index.mjs';
import { identity, editedBody } from './entities.mjs';
import { entityStamp } from './entity-stamp.mjs';
import { memoryStamp } from './memory-journal.mjs';
import * as lib from './brain.mjs';

export const ENTITY_TIMELINE_LIMIT = 100;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const newer = (a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id);
function recent(list, memory, limit) {
  if (list.length >= limit && newer(memory, list.at(-1)) >= 0) return;
  list.push(memory); list.sort(newer); if (list.length > limit) list.pop();
}

export function refreshIndexedPages(root, registry, publish, { readOnly = false } = {}) {
  const path = join(root, 'work', 'entity-pages.json');
  let saved; try { saved = JSON.parse(readFileSync(path, 'utf8')); } catch {}
  const contexts = lib.listContexts(root, { includeMemories: false });
  const sources = () => digest(contexts.map(c => [c.slug, memoryStamp(join(c.dir, 'context.md'))?.key, memoryStamp(join(c.dir, 'memories.jsonl'))?.key]));
  const sourceRevision = sources();
  if (!readOnly && saved?.format === 1 && saved.sources === sourceRevision && saved.identities === entityStamp(root)) return [];
  // A source write must not fail merely because a background view currently
  // reads the cache. Readers keep their short retry window; writers wait for it.
  const index = new MemoryIndex(root, { lockTimeoutMs: readOnly ? 1000 : 30000 }), changed = [], checkpoints = {};
  try {
    index.sync(); index.requireReady();
    const db = index.db;
    const epoch = index.meta('started_at');
    if (saved?.format !== 1 || saved.epoch !== epoch) saved = null;
    db.exec('CREATE TEMP TABLE entity_page_rows(memory INTEGER PRIMARY KEY);');
    const select = db.prepare(`INSERT OR IGNORE INTO entity_page_rows SELECT memory FROM members WHERE field='entities' AND value=?`);
    const withdrawals = db.prepare(`INSERT OR IGNORE INTO entity_page_rows
      SELECT c.memory FROM entity_page_rows p JOIN memories old ON old.rowid=p.memory
      JOIN corrections c ON c.file=old.file AND c.target=old.id JOIN memories m ON m.rowid=c.memory
      WHERE m.effective=1 AND json_extract(m.raw,'$.retracts')=old.id`);
    const files = db.prepare('SELECT DISTINCT m.file FROM entity_page_rows p JOIN memories m ON m.rowid=p.memory');
    const neighbors = db.prepare(`SELECT DISTINCT v.value FROM entity_page_rows p CROSS JOIN memories m ON m.rowid=p.memory
      CROSS JOIN members v INDEXED BY member_memory ON v.memory=m.rowid AND v.field='entities' WHERE m.effective=1 AND json_extract(m.raw,'$.retracts') IS NULL`);
    const records = db.prepare(`SELECT m.raw,m.line,NOT EXISTS(SELECT 1 FROM forks f JOIN entity_page_rows copy ON copy.memory=f.memory JOIN memories c ON c.rowid=copy.memory WHERE f.target=m.id AND c.effective=1) AS timeline_visible FROM entity_page_rows p JOIN memories m ON m.rowid=p.memory
      WHERE m.file=? AND m.effective=1 ORDER BY m.line`);
    const version = db.prepare('SELECT version FROM entity_versions WHERE id=?');
    const covers = new Map(contexts.map(c => [c.slug, { context: c.slug, title: c.title, status: c.status, rule: c.rule, refreshed_at: c.compiledAt }]));
    let refreshed = 0;
    for (const e of registry.filter(e => readOnly || e._path)) {
      const previous = saved?.pages?.[e.id], revision = version.get(JSON.stringify(e.id))?.version || 0;
      const notes = editedBody(e) ? { path: e._path, markdown: e._body } : null;
      const signatureFor = (related, scoped) => digest([identity(e), related, scoped, notes, revision, e._fm?.compilation, e._fm?.compiled_as_of, e._fm?.compiled_at]);
      // Most writes do not change this entity's evidence, its known neighbors or
      // its context covers. Check those recorded dependencies before any history
      // query. The index bumps both old and new owners on every relink/correction.
      if (!readOnly && previous?.contexts && previous?.related) {
        const related = registry.filter(n => previous.related.includes(n.id)).map(identity);
        const scoped = contexts.filter(c => previous.contexts.includes(c.slug)).map(c => covers.get(c.slug));
        if (previous.signature === signatureFor(related, scoped) && previous.text === digest(e._text)) {
          checkpoints[e.id] = previous; continue;
        }
      }
      db.exec('DELETE FROM entity_page_rows'); select.run(JSON.stringify(e.id)); withdrawals.run();
      const relevant = new Set(files.all().map(c => c.file));
      const relatedIDs = new Set(neighbors.all().map(n => JSON.parse(n.value)));
      const related = registry.filter(n => n.id !== e.id && relatedIDs.has(n.id)).map(identity);
      const scoped = contexts.filter(c => relevant.has(c.slug)).map(c => ({ context: c.slug, title: c.title, status: c.status, rule: c.rule, refreshed_at: c.compiledAt }));
      const signature = signatureFor(related, scoped);
      if (!readOnly && saved?.pages?.[e.id]?.signature === signature && saved.pages[e.id].text === digest(e._text)) {
        checkpoints[e.id] = saved.pages[e.id]; continue;
      }
      const facts = pageFacts(e, related, scoped, notes, records);
      const text = publish(e, facts, changed, index);
      checkpoints[e.id] = { signature, text: digest(text), contexts: scoped.map(c => c.context), related: related.map(e => e.id) }; refreshed++;
    }
    if (readOnly) return changed;
    const temporary = path + '.' + process.pid + '.tmp';
    if (sources() !== sourceRevision) throw new Error('Context files changed during entity refresh. Retry the save.');
    writeFileSync(temporary, JSON.stringify({ format: 1, epoch, pages: checkpoints, sources: sourceRevision, identities: entityStamp(root), refreshed, checked: registry.length, at: new Date().toISOString() }));
    renameSync(temporary, path);
    return changed;
  } finally { index.close(); }
}

// Hash every effective record in file order, retaining only a bounded timeline,
// a few recent notes per context and the citations required by a saved brief.
// The snapshot hash is byte-compatible with the full entity_facts reader.
function pageFacts(e, related, contexts, notes, records) {
  const hash = createHash('sha256');
  hash.update('{"identity":' + JSON.stringify(identity(e)) + ',"related_identities":' + JSON.stringify(related) + ',"contexts":[');
  const cited = new Set((JSON.stringify(e._compilation) || '').match(/m_[0-9a-f]{6,12}/g) || []);
  const latest = [], retained = new Map(); let total = 0, latestAt = null;
  for (const [i, c] of contexts.entries()) {
    if (i) hash.update(',');
    const { refreshed_at, ...metadata } = c;
    hash.update(JSON.stringify(metadata).slice(0, -1) + ',"memories":[');
    const local = [], withdrawals = []; let count = 0;
    for (const row of records.iterate(c.context)) {
      if (count++) hash.update(',');
      hash.update(row.raw);
      const m = JSON.parse(row.raw);
      if (cited.has(m.id)) retained.set(m.id, m);
      if (m.retracts) recent(withdrawals, m, 20);
      else {
        total++; recent(local, m, 3); if (row.timeline_visible) recent(latest, m, ENTITY_TIMELINE_LIMIT);
        if (!latestAt || Date.parse(m.at) > Date.parse(latestAt)) latestAt = m.at;
      }
    }
    for (const m of [...local, ...withdrawals]) retained.set(m.id, m);
    hash.update(']}');
  }
  hash.update('],"file_notes":' + JSON.stringify(notes) + '}');
  const as_of = 's_' + hash.digest('hex').slice(0, 16);
  for (const m of latest) retained.set(m.id, m);
  const memories = [...retained.values()];
  for (const c of contexts) c.memories = memories.filter(m => m.context === c.context);
  const stale = total > 0 ? e._fm?.compiled_as_of !== as_of : !!e._compilation && e._fm?.compiled_as_of !== as_of;
  return { entity: { ...identity(e), path: e._path }, related_identities: related, as_of, stale, compiled_at: e._fm?.compiled_at || null,
    latest_evidence_at: latestAt, contexts, previous: e._compilation || null, file_notes: notes,
    evidence: memories.filter(m => !m.retracts), timeline: lib.memoryTimeline(latest), timeline_total: total };
}

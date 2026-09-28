// Bounded dashboard input and immutable history pages. Source records stay in
// JSONL; the HTTP server serves these snapshots without starting any jobs.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { indexedContextGraph } from './context-graph.mjs';
import { MemoryIndex } from './memory-index.mjs';
import * as lib from './brain.mjs';
import { entityStamp } from './entity-stamp.mjs';
import { memoryStamp } from './memory-journal.mjs';
import { listRuns } from './workflows.mjs';
const PAGE = 50, PAGE_BYTES = 512 * 1024;
const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 20);
const visible = "m.effective=1 AND NOT EXISTS(SELECT 1 FROM forks f JOIN memories c ON c.rowid=f.memory WHERE f.target=m.id AND c.effective=1)";
const current = "m.effective=1 AND json_extract(m.raw,'$.retracts') IS NULL";
export function dashboardSourceRevision(root) {
  return hash(JSON.stringify([entityStamp(root), lib.listContexts(root, { includeMemories: false }).map(c => [c.slug, memoryStamp(c.path)?.key, memoryStamp(join(c.dir, 'memories.jsonl'))?.key])]));
}
function atomic(path, value) { const tmp = path + '.' + process.pid + '.tmp'; writeFileSync(tmp, JSON.stringify(value)); renameSync(tmp, path); }
function limited(statement, ...args) {
  const out = []; let bytes = 0;
  for (const row of statement.iterate(...args)) {
    bytes += Buffer.byteLength(row.raw);
    if (bytes > 8 * 1024 * 1024 || out.length >= 5000) throw new Error('Dashboard evidence exceeds its per-view limit. The last dashboard was preserved; use query or recall for this history.');
    out.push(JSON.parse(row.raw));
  }
  return out;
}
export function dashboardData(root, registry) {
  const revision = dashboardSourceRevision(root);
  const started = performance.now(); const profile = stage => { if (process.env.GTM_OS_RENDER_PROFILE) console.error(JSON.stringify({ stage, ms: performance.now()-started, rss: process.memoryUsage.rss() })); };
  const index = new MemoryIndex(root);
  try {
    index.sync(); index.requireReady(); profile("index");
    const db = index.db, contexts = lib.listContexts(root, { includeMemories: false });
    const home = join(root, 'work', 'home'); mkdirSync(join(home, 'history'), { recursive: true });
    const specialContexts = [], cited = new Set();
    for (const e of registry) for (const id of (JSON.stringify(e._compilation) || '').match(/m_[0-9a-f]{6,12}/g) || []) cited.add(id);
    for (const c of contexts) for (const id of (c.summary + ' ' + c.now).match(/m_[0-9a-f]{6,12}/g) || []) cited.add(id);
    const special = db.prepare(`SELECT raw FROM memories WHERE file=? AND (json_extract(raw,'$.asset') IS NOT NULL OR json_extract(raw,'$.customer') IS NOT NULL OR json_extract(raw,'$.customer_coverage') IS NOT NULL OR json_extract(raw,'$.meeting') IS NOT NULL OR json_extract(raw,'$.meeting_id') IS NOT NULL OR json_extract(raw,'$.meeting_policy') IS NOT NULL OR json_extract(raw,'$.meeting_capture') IS NOT NULL OR json_extract(raw,'$.meeting_coverage') IS NOT NULL OR json_extract(raw,'$.supersedes') IS NOT NULL OR json_extract(raw,'$.retracts') IS NOT NULL) ORDER BY line`);
    for (const c of contexts) {
      const source = db.prepare('SELECT stamp FROM files WHERE file=?').get(c.slug)?.stamp || 'missing';
      const folder = 'history/' + c.slug + '-' + hash('v1:' + source), dir = join(home, folder);
      let manifest; try { manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')); } catch {}
      if (!manifest || !Array.isArray(manifest.pages) || !manifest.pages.every(p => existsSync(join(dir, p)))) {
        mkdirSync(dir, { recursive: true });
        let page = [], bytes = 0, total = 0; const pages = [];
        const flush = () => { if (!page.length) return; const name = pages.length + '.json'; atomic(join(dir, name), { memories: page }); pages.push(name); page = []; bytes = 0; };
        for (const row of db.prepare('SELECT raw FROM memories WHERE file=? AND effective=1 ORDER BY time DESC,id').iterate(c.slug)) {
          if (page.length && (page.length >= PAGE || bytes + row.raw.length > PAGE_BYTES)) flush();
          page.push(JSON.parse(row.raw)); bytes += row.raw.length; total++;
        }
        flush();
        manifest = { pages, total, stored: db.prepare('SELECT count(*) AS n FROM memories WHERE file=?').get(c.slug).n,
          last: db.prepare('SELECT at FROM memories WHERE file=? ORDER BY line DESC LIMIT 1').get(c.slug)?.at || null };
        atomic(join(dir, 'manifest.json'), manifest);
      }
      c.memories = manifest.pages.length ? JSON.parse(readFileSync(join(dir, manifest.pages[0]), 'utf8')).memories : [];
      c.totalMemories = manifest.total; c.storedMemories = manifest.stored;
      c.history = manifest.pages.map(page => folder + '/' + page); c.historyPage = 0;
      c.lastMemory = manifest.last; c.stale ||= !!manifest.last && (!c.compiledAt || Date.parse(manifest.last) > Date.parse(c.compiledAt));
      specialContexts.push({ ...c, memories: limited(special, c.slug) });
    }
    profile("history");
    const citations = [];
    const record = db.prepare('SELECT raw FROM memories WHERE id=? AND effective=1 LIMIT 1');
    for (const id of cited) { const row = record.get(id); if (row) citations.push(JSON.parse(row.raw)); }
    const latest = where => limited(db.prepare(`SELECT raw FROM memories m WHERE ${visible} ${where} ORDER BY time DESC,id LIMIT 100`));
    const recent = latest('');
    const lists = { recent, decisions: latest("AND kind='decision'"), actions: latest("AND kind='action'"),
      questions: latest("AND kind='question' AND EXISTS(SELECT 1 FROM members v WHERE v.memory=m.rowid AND v.field='tags' AND v.value='\"brain-question\"')") };
    const listHistory = {}, listTotals = {};
    const historyKey = hash(JSON.stringify(db.prepare('SELECT file,stamp FROM files ORDER BY file').all()));
    for (const [name, predicate] of [['recent', '1=1'], ['questions', "kind='question' AND EXISTS(SELECT 1 FROM members v WHERE v.memory=m.rowid AND v.field='tags' AND v.value='\"brain-question\"')"], ['decisions', "kind='decision'"]]) {
      listTotals[name] = db.prepare(`SELECT count(*) AS n FROM memories m WHERE ${visible} AND ${predicate}`).get().n;
      if (listTotals[name] <= 100) { listHistory[name] = []; continue; }
      const folder = 'history/list-' + name + '-' + historyKey, dir = join(home, folder);
      let manifest; try { manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')); } catch {}
      if (!manifest?.pages?.every(p => existsSync(join(dir, p)))) {
        mkdirSync(dir, { recursive: true }); let page = [], bytes = 0; const pages = [];
        const flush = () => { if (!page.length) return; const file = pages.length + '.json'; atomic(join(dir, file), { memories: page }); pages.push(file); page = []; bytes = 0; };
        for (const row of db.prepare(`SELECT raw FROM memories m WHERE ${visible} AND ${predicate} ORDER BY time DESC,id`).iterate()) {
          if (page.length && (page.length >= 100 || bytes + row.raw.length > PAGE_BYTES)) flush();
          page.push(JSON.parse(row.raw)); bytes += row.raw.length;
        }
        flush(); manifest = { pages }; atomic(join(dir, 'manifest.json'), manifest);
      }
      listHistory[name] = manifest.pages.map(p => folder + '/' + p);
      lists[name] = JSON.parse(readFileSync(join(dir, manifest.pages[0]), 'utf8')).memories;
    }
    const totals = { memories: index.count(), questions: db.prepare(`SELECT count(*) AS n FROM memories m WHERE ${visible} AND kind='question' AND EXISTS(SELECT 1 FROM members v WHERE v.memory=m.rowid AND v.field='tags' AND v.value='\"brain-question\"')`).get().n };
    const projects = Object.fromEntries(lib.readProjects(root).map(p => {
      const row = db.prepare(`SELECT count(*) AS notes,max(m.at) AS lastNote FROM members v JOIN memories m ON m.rowid=v.memory WHERE v.field='tags' AND v.value=? AND ${visible}`).get(JSON.stringify('project:' + p.slug));
      return [p.slug, row];
    }));
    profile("lists"); const graph = indexedGraph(db, registry, contexts); profile("graph");
    const contextConnections = indexedContextGraph(db, contexts);
    if (revision !== dashboardSourceRevision(root)) throw new Error('Brain changed during dashboard refresh. Retry render_dashboard.');
    return { contexts, specialContexts, citations, ...lists, totals: { ...totals, ...listTotals }, listHistory, projects, runs: listRuns(root), graph, contextConnections, revision };
  } finally { index.close(); }
}

function indexedGraph(db, registry, contexts) {
  const names = new Map(registry.map(n => [JSON.stringify(n.id), n.name]));
  const nodes = [];
  for (const e of registry) {
    const id = JSON.stringify(e.id);
    const refs = db.prepare(`SELECT m.raw FROM members v JOIN memories m ON m.rowid=v.memory WHERE v.field='entities' AND v.value=? AND m.file=? AND ${current} ORDER BY m.time DESC,m.id LIMIT 10`);
    const grouped = db.prepare(`SELECT m.file,sum(CASE WHEN ${current} THEN 1 ELSE 0 END) AS total,sum(m.effective=0) AS withdrawn FROM members v JOIN memories m ON m.rowid=v.memory WHERE v.field='entities' AND v.value=? GROUP BY m.file`).all(id);
    const relevant = contexts.filter(c => grouped.some(g => g.file === c.slug) || c.names.some(n => lib.canonicalName(registry, n.name) === e.name)).map(c => {
      const g = grouped.find(g => g.file === c.slug);
      const evidence = refs.all(id, c.slug).map(r => { const m = JSON.parse(r.raw); return { id: m.id, via: lib.resolvePeople(registry, m.people).includes(e.name) ? 'attached' : 'text' }; });
      const withdrawals = db.prepare(`SELECT DISTINCT m.id FROM members v JOIN memories old ON old.rowid=v.memory JOIN corrections r ON r.file=old.file AND r.target=old.id JOIN memories m ON m.rowid=r.memory WHERE v.field='entities' AND v.value=? AND m.file=? AND m.effective=1 AND json_extract(m.raw,'$.retracts')=old.id LIMIT 20`).all(id, c.slug).map(m => m.id);
      return { context: c.slug, cover: c.names.some(n => lib.canonicalName(registry, n.name) === e.name), evidence, total: g?.total || 0, withdrawn: g?.withdrawn || 0, withdrawals };
    });
    const mentions = db.prepare(`SELECT count(DISTINCT m.id) AS n FROM members v JOIN memories m ON m.rowid=v.memory WHERE v.field='entities' AND v.value=? AND ${current} AND ${visible}`).get(id).n;
    nodes.push({ name: e.name, mentions, contexts: relevant });
  }
  // Shared-record pairs are grouped on disk. Only ten references per pair travel
  // to the initial page; counts retain the complete effective evidence corpus.
  db.exec(`CREATE TEMP TABLE dashboard_pairs AS SELECT a.value AS a,b.value AS b,m.id,m.context,m.time,(${visible}) AS visible FROM members a JOIN members b INDEXED BY member_memory ON b.memory=a.memory AND b.field='entities' AND b.value>a.value JOIN memories m ON m.rowid=a.memory WHERE a.field='entities' AND ${current};
    CREATE INDEX dashboard_pair ON dashboard_pairs(a,b,time DESC);`);
  const links = db.prepare('SELECT a,b,count(DISTINCT CASE WHEN visible THEN id END) AS count,count(*) AS total FROM dashboard_pairs GROUP BY a,b').all().map(l => ({
    a: names.get(l.a), b: names.get(l.b), count: l.count, total: l.total,
    evidence: db.prepare('SELECT id,context FROM dashboard_pairs WHERE a=? AND b=? ORDER BY time DESC,id LIMIT 10').all(l.a, l.b),
  })).sort((a, b) => b.count - a.count || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
  return { nodes, links };
}

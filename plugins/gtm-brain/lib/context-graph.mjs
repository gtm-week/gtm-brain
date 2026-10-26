// Read-only counts of current records and shared fork ancestry across contexts.
import { effectiveMemories, isForkCopy } from './brain.mjs';

export function indexedContextGraph(db, contexts) {
  return contextGraph(contexts, db.prepare(`SELECT m.id,m.file AS context,
    (m.effective=1 AND json_extract(m.raw,'$.retracts') IS NULL) AS active,
    (SELECT json_group_array(f.target) FROM forks f WHERE f.memory=m.rowid) AS origins
    FROM memories m`).all().map(r => ({ ...r, origins: JSON.parse(r.origins) })));
}

export function contextGraph(contexts, records) {
  if (!records) records = contexts.flatMap(c => {
    const current = new Set(effectiveMemories(c.memories).filter(m => !m.retracts).map(m => m.id));
    return c.memories.map(m => ({ id: m.id, context: c.slug, active: current.has(m.id),
      origins: isForkCopy(m) ? m.source.filter(s => s.kind === 'memory').map(s => s.ref) : [] }));
  });
  const rows = [...records], parents = new Map();
  const root = id => {
    if (!parents.has(id)) parents.set(id, id);
    let r = id;
    while (parents.get(r) !== r) r = parents.get(r);
    while (parents.get(id) !== id) { const next = parents.get(id); parents.set(id, r); id = next; }
    return r;
  };
  for (const row of rows) for (const origin of row.origins || []) {
    const a = root(row.id), b = root(origin); if (a !== b) parents.set(a, b);
  }
  const members = new Map(), counts = new Map(contexts.map(c => [c.slug, new Set()]));
  for (const row of rows) {
    if (!row.active || !counts.has(row.context)) continue;
    const id = root(row.id); counts.get(row.context).add(id);
    if (!members.has(id)) members.set(id, new Map());
    members.get(id).set(row.context, row.id);
  }
  const links = new Map();
  for (const [origin, contexts] of members) {
    const slugs = [...contexts.keys()].sort();
    for (let i = 0; i < slugs.length; i++) for (let j = i + 1; j < slugs.length; j++) {
      const a = slugs[i], b = slugs[j], key = JSON.stringify([a, b]);
      if (!links.has(key)) links.set(key, { a, b, count: 0, evidence: [] });
      const link = links.get(key); link.count++;
      if (link.evidence.length < 5) link.evidence.push({ origin, a: contexts.get(a), b: contexts.get(b) });
    }
  }
  return { nodes: [...counts].map(([slug, ids]) => ({ slug, count: ids.size })),
    links: [...links.values()].sort((a, b) => b.count - a.count || a.a.localeCompare(b.a) || a.b.localeCompare(b.b)) };
}

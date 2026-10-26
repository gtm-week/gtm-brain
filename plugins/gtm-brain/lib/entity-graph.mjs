// Read-only projection of identities and memory evidence. No stored relationships or new records.
import { canonicalName, effectiveMemories, hideForkCopies, createMentionMatcher, resolvePeople } from "./brain.mjs";

export function entityGraph(registry, contexts) {
  const nodes = registry.map(n => ({ name: n.name, contexts: [], mentions: 0 }));
  const byName = new Map(nodes.map(n => [n.name, n]));
  const links = new Map(), records = new Map(), mentioned = new Map();
  const match = createMentionMatcher(registry);
  const mentions = m => {
    if (!mentioned.has(m)) mentioned.set(m, match(m).filter(n => byName.has(n)));
    return mentioned.get(m);
  };
  for (const context of contexts) {
    const stored = new Map(context.memories.map(m => [m.id, m]));
    const effective = effectiveMemories(context.memories), current = new Set(effective.map(m => m.id));
    const cover = new Set((context.names || []).map(n => canonicalName(registry, n.name)).filter(Boolean));
    const relevance = new Map();
    const entry = name => {
      if (!relevance.has(name)) relevance.set(name, { context: context.slug, cover: cover.has(name), evidence: [], withdrawn: 0, withdrawals: [] });
      return relevance.get(name);
    };
    for (const name of cover) entry(name);
    for (const m of context.memories) {
      const names = mentions(m);
      if (!current.has(m.id)) { for (const name of names) entry(name).withdrawn++; continue; }
      // A withdrawal explains the missing evidence; it must not recreate the withdrawn links.
      if (m.retracts) {
        const original = stored.get(m.retracts);
        for (const name of new Set([...names, ...(original ? mentions(original) : [])])) entry(name).withdrawals.push(m.id);
        continue;
      }
      records.set(m.id, m);
      const attached = new Set(resolvePeople(registry, m.people));
      for (const name of names) entry(name).evidence.push({ id: m.id, via: attached.has(name) ? "attached" : "text" });
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const [a, b] = [names[i], names[j]].sort(), key = JSON.stringify([a, b]);
        if (!links.has(key)) links.set(key, { a, b, evidence: [], count: 0 });
        links.get(key).evidence.push({ id: m.id, context: context.slug });
      }
    }
    for (const [name, r] of relevance) {
      r.evidence.sort((a, b) => Date.parse(records.get(b.id).at) - Date.parse(records.get(a.id).at) || a.id.localeCompare(b.id));
      byName.get(name).contexts.push(r);
    }
  }
  const uniqueCount = refs => hideForkCopies([...new Set(refs.map(r => r.id))].map(id => records.get(id))).length;
  for (const node of nodes) node.mentions = uniqueCount(node.contexts.flatMap(c => c.evidence));
  for (const link of links.values()) link.count = uniqueCount(link.evidence);
  return { nodes, links: [...links.values()].sort((a, b) => b.count - a.count || a.a.localeCompare(b.a) || a.b.localeCompare(b.b)) };
}

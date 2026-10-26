// The CLI and MCP worker share keyword search and its cited text output.
import * as lib from './brain.mjs';
import { assetSummary } from './assets.mjs';
import { withMemoryIndex, MAX_RESULT_BYTES } from './memory-index.mjs';

export function keywordRecall(root, query, project = null) {
  query = String(query || '').trim();
  if (!query) throw new Error('Provide keywords to search for.');
  if (project && !lib.readProjects(root).some(p => p.slug === project)) throw new Error(`no project ${project}`);
  const loaded = lib.readLoaded(root, project);
  return withMemoryIndex(root, index => {
    const terms = query.split(/\s+/).map(t => t.replace(/[^\p{L}\p{N}@.-]/gu, '')).filter(Boolean), expanded = new Set(terms);
    for (const t of terms) {
      const canonical = lib.canonicalName(index.names, t);
      if (!canonical) continue;
      for (const w of canonical.split(/\s+/)) expanded.add(w);
      for (const alias of index.names.find(n => n.name === canonical).aliases) for (const w of alias.split(/\s+/)) expanded.add(w);
    }
    const result = index.keywords([...expanded], project), out = [];
    const conflicts = index.assetConflicts();
    if (conflicts.length) out.push(`Attachments needing a choice: ${conflicts.map(a => `${a.entity}: ${a.role}`).join(', ')}. Ask which approved file to use.`);
    if (!result.total) out.push(`nothing about "${query}" in any context (${index.count()} memories searched).`);
    else {
      out.push(`${result.total} memories match "${query}"${expanded.size > terms.length ? ` (expanded: ${[...expanded].join(', ')})` : ''}:`);
      const countLabel = n => n > 40 ? `40 of ${n}` : `${n}`;
      for (const [i, list] of result.groups.entries()) {
        if (project) out.push(`\n## ${i === 0 ? `in this project (${project})` : 'elsewhere'} · ${countLabel(result.counts[i])}`);
        const contexts = new Map();
        for (const hit of list) { if (!contexts.has(hit.context)) contexts.set(hit.context, []); contexts.get(hit.context).push(hit); }
        for (const [context, hits] of contexts) {
          out.push(`\n${project ? '### ' : '## '}${context}${loaded.includes(context) ? ' (loaded)' : ' (not loaded)'} · ${hits.length}`);
          for (const m of hits) {
            const tag = m.tags.find(t => t.startsWith('project:'));
            out.push(`- ${lib.memoryTimeText(m)} · ${m.kind}${tag ? ` · [${m.context} · ${tag.slice(8)}]` : ''} · ${m.authors.join(', ')}${m.people.length ? ' · ' + m.people.join(', ') : ''}\n  ${m.content}${assetSummary(root, m)}${m.source.length ? '\n  source: ' + lib.sourceText(m.source) : ''}`);
          }
        }
      }
      const unloaded = [...new Set(result.groups.flat().map(h => h.context))].filter(c => !loaded.includes(c));
      if (unloaded.length) out.push(`\nHits in contexts not loaded: ${unloaded.join(', ')}. Load one to work there.`);
    }
    const text = out.join('\n');
    if (Buffer.byteLength(text) > MAX_RESULT_BYTES) throw new Error('Recall results exceed 2 MiB. Use more specific keywords; no partial result was returned.');
    return text;
  });
}

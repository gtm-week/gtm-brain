// Protocol checks complement semantic review; calling a reader does not prove the answer is faithful.
export function readerChecks(events, caseId) {
  const commands = events.filter(e => e.type === 'item.completed' && e.item?.type === 'command_execution')
    .map(e => e.item).filter(i => i.exit_code === 0 && /\bnode\b[^\n]*read-evidence\.mjs/.test(i.command ?? ''));
  const output = i => i.aggregated_output ?? '';
  const reader = commands.some(i => /"source_hashes"\s*:/.test(output(i)) && /"coverage"\s*:/.test(output(i)));
  const quote = commands.some(i => /--record\b/.test(i.command) && /"attributed_evidence"\s*:/.test(output(i)));
  const gate = commands.some(i => /--post\b/.test(i.command) && /"decision_scope"\s*:/.test(output(i)));
  const topic = ['topics', 'attribution', 'holdout-topics', 'icp-conversations'].includes(caseId);
  const draft = commands.some(i => /--check-citations\b/.test(i.command) && /"valid"\s*:\s*true/.test(output(i)));
  return { reader_used: reader, ...(topic ? { draft_citations_checked: draft } : {}), ...(topic ? { attribution_checked: quote } : caseId !== 'identity-only' ? { opening_checked: gate } : {}) };
}

// Check source identity, not live availability. Tracking parameters may differ; reply targets may not.
export function citationChecks(answer, snapshots) {
  const identity = value => {
    try {
      const url = new URL(value);
      if (url.hostname.replace(/^www\./, '') !== 'linkedin.com') return null;
      return JSON.stringify([url.pathname.replace(/\/$/, ''),
        ...['commentUrn', 'replyUrn'].map(key => url.searchParams.getAll(key))]);
    } catch { return null; }
  };
  const sources = new Set();
  const visit = value => {
    if (typeof value === 'string') { const key = identity(value); if (key) sources.add(key); }
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  snapshots.forEach(visit);
  const citations = [...answer.matchAll(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s<>\)"`\]]+/g)]
    .map(match => match[0].replace(/[.,;!?]+$/, ''));
  return { source_citations: citations.every(url => sources.has(identity(url))) };
}

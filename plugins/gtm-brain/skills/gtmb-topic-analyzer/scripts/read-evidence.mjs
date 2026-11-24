#!/usr/bin/env node
// Local, read-only adapter for saved Up2Data v1 post/profile/comment envelopes.
// No network, credentials, collection, semantic classification or admission decisions.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const string = value => typeof value === 'string' && value.trim() ? value : null;
const canonical = value => {
  try { const u = new URL(value); return u.origin + u.pathname.replace(/\/$/, ''); } catch { return null; }
};
const actor = value => ({ name: string(value?.full_name ?? value?.name), url: string(value?.url) });
const instant = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
export function ageHours(event, asOf) {
  const end = instant(asOf), start = instant(event);
  return start === null || end === null || start > end ? null : (end - start) / 3600000;
}
const ageCheck = (value, limit) => value === null || typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0 ? 'unknown' : value <= limit ? 'within_limit' : 'outside_limit';

export function readEvidence(files, policy, asOf) {
  if (instant(asOf) === null) throw new Error('An explicit ISO review time with timezone is required');
  const statements = [], identities = [], posts = [], snapshots = [], warnings = [], sources = [];
  function statement(file, pointer, kind, value, postId, parentId, collectedAt) {
    const who = actor(kind === 'post' ? value.author : value.commenter);
    const text = string(value.text);
    const id = `${file}#${pointer}`;
    const item = { id, kind, post_id: postId, parent_id: parentId, speaker: who,
      published_at: string(value.posted_at), collected_at: collectedAt,
      url: string(value.url), text };
    statements.push(item);
    // Headline is deliberately absent from statements: identity evidence is a separate view.
    if (string((kind === 'post' ? value.author : value.commenter)?.headline)) identities.push({
      id: `${id}/identity`, kind: 'profile_stub', person: who,
      headline: (kind === 'post' ? value.author : value.commenter).headline,
      source: id, limitation: 'Provider identity metadata, not words said in this discussion; current role unverified.' });
    for (const [n, reply] of (Array.isArray(value.replies) ? value.replies : []).entries()) {
      statement(file, `${pointer}/replies/${n}`, 'reply', reply, postId, id, collectedAt);
    }
    return item;
  }
  for (const { name, bytes } of files) {
    let raw;
    try { raw = JSON.parse(bytes); } catch { throw new Error(`Invalid JSON in ${name}`); }
    const data = raw?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) { warnings.push(`${name}: unsupported envelope; inspect original`); continue; }
    const collected = string(raw.fetched_at ?? data.scraped_at);
    sources.push({ file: name, sha256: hash(bytes), endpoint: string(raw.endpoint), collected_at: collected });
    const endpoint = raw.endpoint?.replace(/^\/?v1\//, '').replace(/^\//, '');
    const postRows = Array.isArray(data.posts) ? data.posts.map((value, n) => ({ value, pointer: `/data/posts/${n}` })) :
      endpoint === 'posts/enrich' || data.author && Object.hasOwn(data, 'text') ? [{ value: data, pointer: '/data' }] : [];
    if (postRows.length || Array.isArray(data.posts)) {
      for (const { value, pointer } of postRows) {
      const postId = string(value.urn) ?? canonical(value.url) ?? `${name}#${pointer}`;
      const row = statement(name, pointer, 'post', value, postId, null, collected);
      posts.push({ post_id: postId, record: row.id, url: row.url, published_at: row.published_at,
        post_age_hours: ageHours(row.published_at, asOf), headline_comment_count: value.comments_count ?? null });
      if (Array.isArray(value.comments)) {
        const start = statements.length;
        value.comments.forEach((c, n) => statement(name, `${pointer}/comments/${n}`, 'comment', c, postId, row.id, collected));
        snapshots.push({ post_id: postId, file: name, collected_at: collected, records: statements.slice(start).map(x => x.id), has_more: value.pagination?.has_more ?? null });
      }
      }
    } else if (endpoint === 'posts/engagement/comments' || Array.isArray(data.comments)) {
      const postId = string(data.urn ?? raw.input?.urn) ?? canonical(raw.input?.url);
      if (!postId || !Array.isArray(data.comments)) { warnings.push(`${name}: missing thread identity/comments array; inspect original`); continue; }
      const start = statements.length;
      data.comments.forEach((c, n) => statement(name, `/data/comments/${n}`, 'comment', c, postId, null, collected));
      snapshots.push({ post_id: postId, file: name, collected_at: collected, records: statements.slice(start).map(x => x.id), has_more: data.pagination?.has_more ?? null });
    } else if (endpoint === 'profiles/enrich' || data.full_name && !data.author) {
      identities.push({ id: `${name}#/data`, kind: 'profile', person: actor(data),
        headline: string(data.headline), about: string(data.about), location: data.location ?? null,
        positions: (Array.isArray(data.positions) ? data.positions : []).map(p => ({ title: p.title, company: p.company, started_at: p.started_at, ended_at: p.ended_at, company_headcount: p.company_headcount })),
        collected_at: collected, limitation: 'Profile claims establish identity/role context, not discussion speech, purchasing authority, intent or admission.' });
    } else warnings.push(`${name}: unsupported data shape; inspect original, do not infer missing fields from a guessed JSON path`);
  }
  const known = Array.isArray(policy?.known_formats) && policy.known_formats.every(x => typeof x === 'string') ? policy.known_formats : null;
  const excluded = Array.isArray(policy?.excluded_formats) && policy.excluded_formats.every(x => typeof x === 'string') ? policy.excluded_formats : null;
  const policyValid = !!known && !!excluded && excluded.every(x => known.includes(x));
  const freshness = policy?.freshness ?? policy?.evaluation_freshness ?? {};
  const threads = posts.map(post => {
    // Keep duplicate/conflicting snapshots visible; never silently pick a convenient copy.
    const matching = snapshots.filter(s => s.post_id === post.post_id || canonical(post.url) === s.post_id);
    return { ...post, post_time_check: ageCheck(post.post_age_hours, typeof freshness.post_max_age_days === 'number' ? freshness.post_max_age_days * 24 : null),
      discussion: matching.length === 0 ? 'missing' : matching.length > 1 ? 'multiple_snapshots_review_required' : 'observed_snapshot',
      snapshots: matching.map(s => ({ ...s, snapshot_age_hours: ageHours(s.collected_at, asOf),
        snapshot_time_check: ageCheck(ageHours(s.collected_at, asOf), freshness.comment_snapshot_max_age_hours),
        comments: s.records.filter(id => statements.find(x => x.id === id)?.kind === 'comment').length,
        replies: s.records.filter(id => statements.find(x => x.id === id)?.kind === 'reply').length })) };
  });
  return { version: 1, as_of: asOf, source_hashes: sources, warnings,
    policy: { valid: policyValid, known_formats: known, excluded_formats: excluded,
      formats: (known ?? []).map(format => ({ format, excluded: excluded?.includes(format) ?? null })),
      freshness, limitation: 'Known formats are the classification vocabulary. Only excluded_formats excludes. Format classification itself still requires reading the original.' },
    coverage: { posts: posts.length, comments: statements.filter(x => x.kind === 'comment').length,
      replies: statements.filter(x => x.kind === 'reply').length, profiles: identities.filter(x => x.kind === 'profile').length,
      limitation: 'Returned records, not unique people or complete platform coverage. Multiple snapshots can overlap.' },
    threads, statements, identities };
}

export function quoteRecord(catalog, id, quote) {
  const record = catalog.statements.find(x => x.id === id);
  if (!record || !record.text || !record.speaker.name) throw new Error('A readable statement with an identified speaker is required; profile metadata is not discussion speech');
  if (quote !== undefined && (!string(quote) || !record.text.includes(quote))) throw new Error('The quotation is not an exact substring of this statement');
  return { record: id, kind: record.kind, speaker: record.speaker, quote: quote ?? record.text,
    url: record.url, citation: record.url ? `[source](<${record.url}>)` : id,
    attributed_evidence: `${record.speaker.name} (${record.kind}): ${JSON.stringify(quote ?? record.text)}`,
    published_at: record.published_at, collected_at: record.collected_at, parent_id: record.parent_id };
}

export function checkOpening(catalog, postId, formats, branchId) {
  const matches = catalog.threads.filter(x => x.post_id === postId || x.record === postId);
  if (matches.length !== 1) throw new Error('Select exactly one unambiguous original post');
  const thread = matches[0], reasons = [];
  const original = catalog.statements.find(x => x.id === thread.record);
  if (!original?.text || !original.speaker.name) reasons.push('original_text_or_author_missing');
  if (thread.url && catalog.threads.filter(x => canonical(x.url) === canonical(thread.url)).length > 1) reasons.push('duplicate_originals_review_required');
  if (!catalog.policy.valid || !formats.length || formats.some(x => !catalog.policy.known_formats.includes(x))) reasons.push('unknown_format_or_policy');
  if (catalog.policy.valid && formats.some(x => catalog.policy.excluded_formats.includes(x))) reasons.push('excluded_format');
  if (thread.post_time_check !== 'within_limit') reasons.push(`post_age_${thread.post_time_check}`);
  if (thread.discussion !== 'observed_snapshot') reasons.push(thread.discussion);
  const snapshot = thread.snapshots.length === 1 ? thread.snapshots[0] : null;
  if (snapshot && snapshot.snapshot_time_check !== 'within_limit') reasons.push(`snapshot_age_${snapshot.snapshot_time_check}`);
  const branch = catalog.statements.find(x => x.id === branchId && x.kind !== 'post' && x.post_id === thread.post_id);
  if (snapshot?.records.length && (!branch || !snapshot.records.includes(branchId))) reasons.push('select_observed_branch');
  if (branch && !branch.text) reasons.push('unreadable_branch');
  if (!thread.url) reasons.push('missing_post_url');
  return { post: thread.record, formats, state: reasons.includes('excluded_format') ? 'excluded' : reasons.length ? 'hold' : 'ready_for_semantic_review', reasons,
    url: branch?.url ?? thread.url, post_url: thread.url,
    opening_citation: branch?.url || thread.url ? `[Open this discussion](<${branch?.url ?? thread.url}>)` : null,
    decision_scope: 'This gate applies to the proposed contribution on this post only. It does not reject a person or change buyer/host admission; those require separate evidence and decisions.',
    branch: branch?.text && branch.speaker.name ? quoteRecord(catalog, branch.id) : null,
    replies: branch ? catalog.statements.filter(x => x.parent_id === branch.id).map(x => x.speaker.name && x.text ? quoteRecord(catalog, x.id) : { record: x.id, unreadable: true }) : [],
    post_age_hours: thread.post_age_hours, snapshot_age_hours: snapshot?.snapshot_age_hours ?? null,
    limitation: 'The agent supplied format labels. This check does not establish relevance, correct classification, a distinct angle, buyer/host fit, admission or permission to act.' };
}

// Check source identity, not live availability. Tracking parameters may differ; reply targets may not.
export function checkCitations(answer, snapshots) {
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
  const unmatched = citations.filter(url => !sources.has(identity(url)));
  return { valid: unmatched.length === 0, citations: citations.length, unmatched,
    limitation: 'Source URL identity only, not current link availability or support for the associated claim.' };
}

function main(args) {
  const folder = resolve(args[0] ?? '.'), get = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const policyFile = get('--policy', join(folder, 'policy.json'));
  const policy = existsSync(policyFile) ? JSON.parse(readFileSync(policyFile, 'utf8')) : {};
  const files = readdirSync(folder).filter(name => name.endsWith('.json') && name !== basename(policyFile) && name !== 'manifest.json').sort()
    .map(name => ({ name, bytes: readFileSync(join(folder, name), 'utf8') }));
  if (args.includes('--check-citations')) {
    const report = checkCitations(readFileSync(0, 'utf8'), files.map(file => JSON.parse(file.bytes)));
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.valid) process.exitCode = 1;
    return;
  }
  const catalog = readEvidence(files, policy, get('--as-of', policy.freshness?.as_of ?? policy.evaluation_freshness?.as_of));
  let result;
  if (args.includes('--record')) result = quoteRecord(catalog, get('--record'), get('--quote'));
  else if (args.includes('--post')) result = checkOpening(catalog, get('--post'), get('--formats', '').split(',').filter(Boolean), get('--branch'));
  else {
    const view = get('--view', 'statements');
    if (!['statements', 'identities', 'index'].includes(view)) throw new Error('Use --view statements|identities|index');
    const { statements, identities, ...index } = catalog;
    result = { ...index, ...(view === 'statements' ? { statements } : view === 'identities' ? { identities } : {}) };
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`Evidence read failed: ${error.message}\n`); process.exitCode = 1; }
}

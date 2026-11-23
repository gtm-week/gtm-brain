import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const local = new URL('../skills/topic-analyzer/scripts/read-evidence.mjs', import.meta.url);
const shipped = new URL('../skills/gtmb-topic-analyzer/scripts/read-evidence.mjs', import.meta.url);
const { readEvidence, quoteRecord, checkOpening, ageHours } = await import(existsSync(local) ? local : shipped);
const now = '2026-11-23T19:05:00Z';
const policy = { known_formats: ['discussion','promotion','announcement'], excluded_formats: ['announcement'], freshness: { post_max_age_days:7, comment_snapshot_max_age_hours:24 } };
const post = { endpoint:'posts/enrich', fetched_at:'2026-11-23T19:00:00Z', data: {
  urn:'123', url:'https://example.test/post/123', author:{name:'Author',headline:'Director'}, text:'We launched a training program.', posted_at:'2026-11-20T12:00:00Z', comments_count:3 } };
const comments = { endpoint:'posts/engagement/comments', fetched_at:'2026-11-23T18:00:00Z', data:{ urn:'123', pagination:{has_more:false}, comments:[
  { commenter:{full_name:'Reader A',headline:'Human AI leadership programs'},text:'Could you share the slides?',posted_at:'2026-11-20T13:00:00Z',url:'https://example.test/comment/1',replies:[
    {commenter:{full_name:'Author'},text:'There is no recording. I can offer a report-out.',posted_at:'2026-11-20T14:00:00Z',url:'https://example.test/reply/1'}]},
  {commenter:{full_name:'Reader B'},text:'Great!',posted_at:'2026-11-20T15:00:00Z',url:'https://example.test/comment/2'} ]} };
const profile = { endpoint:'profiles/enrich', fetched_at:now, data:{ full_name:'Reader A',headline:'Human AI leadership programs',about:'I sell programs.',url:'https://example.test/person/a' } };
const files = (p=post,c=comments) => [{name:'post.json',bytes:JSON.stringify(p)}, ...(c ? [{name:'comments.json',bytes:JSON.stringify(c)}] : []),{name:'profile.json',bytes:JSON.stringify(profile)}];
const cat = (p=policy,c=comments) => readEvidence(files(post,c),p,now);

test('speaker attribution comes from the individual statement, not the post or profile', () => {
  const c=cat(), q=quoteRecord(c,'comments.json#/data/comments/0','Could you share the slides?');
  assert.equal(q.speaker.name,'Reader A'); assert.equal(q.kind,'comment');
  assert.throws(()=>quoteRecord(c,'post.json#/data','Could you share the slides?'),/exact substring/);
  assert.throws(()=>quoteRecord(c,'comments.json#/data/comments/0','Human AI leadership programs'),/exact substring/);
  assert.throws(()=>quoteRecord(c,'profile.json#/data','I sell programs.'),/readable statement/);
  assert.ok(!JSON.stringify(c.statements).includes('leadership programs'));
  assert.ok(JSON.stringify(c.identities).includes('leadership programs'));
});
test('publication and collection timestamps use different clocks; old comments can be freshly retrieved', () => {
  const t=cat().threads[0];
  assert.equal(t.published_at,post.data.posted_at); assert.equal(t.post_time_check,'within_limit');
  assert.equal(t.snapshots[0].snapshot_time_check,'within_limit');
  assert.equal(t.snapshots[0].snapshot_age_hours,65/60);
  assert.equal(ageHours('2026-11-24T00:00:00Z',now),null);
  assert.equal(ageHours('2026-11-20',now),null);
});
test('known format vocabulary does not imply exclusion, and changed policy changes the decision', () => {
  assert.equal(checkOpening(cat(),'123',['discussion','promotion'],'comments.json#/data/comments/0').state,'ready_for_semantic_review');
  const excluded=cat({...policy,excluded_formats:['promotion']});
  assert.equal(checkOpening(excluded,'123',['discussion','promotion'],'comments.json#/data/comments/0').state,'excluded');
  assert.equal(checkOpening(cat(),'123',['unknown'],'comments.json#/data/comments/0').state,'hold');
  assert.equal(checkOpening(cat({...policy,excluded_formats:null}),'123',['discussion'],'comments.json#/data/comments/0').state,'hold');
});
test('praise stays separate from a substantive comment and replies retain their parent', () => {
  const c=cat(); assert.deepEqual([c.coverage.comments,c.coverage.replies],[2,1]);
  assert.equal(quoteRecord(c,'comments.json#/data/comments/1').quote,'Great!');
  const gate=checkOpening(c,'123',['discussion'],'comments.json#/data/comments/0');
  assert.equal(gate.url,'https://example.test/comment/1');
  assert.equal(gate.replies[0].quote,'There is no recording. I can offer a report-out.');
  assert.equal(gate.replies[0].parent_id,'comments.json#/data/comments/0');
});
test('missing discussion is held; explicitly empty discussion is a distinct observed result', () => {
  assert.equal(checkOpening(cat(policy,null),'123',['discussion']).state,'hold');
  const empty=structuredClone(comments);empty.data.comments=[];
  assert.equal(checkOpening(cat(policy,empty),'123',['discussion']).state,'ready_for_semantic_review');
  assert.equal(checkOpening(cat(policy,null),'123',['announcement']).state,'excluded');
});
test('stale, invalid or future snapshot dates cannot produce a live opening', () => {
  for (const date of ['2026-11-21T18:00:00Z','invalid','2026-11-24T18:00:00Z']) {
    const c=structuredClone(comments);c.fetched_at=date;
    assert.equal(checkOpening(cat(policy,c),'123',['discussion'],'comments.json#/data/comments/0').state,'hold');
  }
});
test('post age does not become fresh merely because the post was fetched today', () => {
  const p=structuredClone(post);p.data.posted_at='2026-10-01T12:00:00Z';
  const c=readEvidence(files(p),policy,now);
  assert.equal(checkOpening(c,'123',['discussion'],'comments.json#/data/comments/0').state,'hold');
});
test('unreadable text and absent actor identity fail quotation verification', () => {
  const p=structuredClone(post);p.data.text=null;
  assert.throws(()=>quoteRecord(readEvidence(files(p),policy,now),'post.json#/data'),/readable statement/);
  assert.equal(checkOpening(readEvidence(files(p),policy,now),'123',['discussion'],'comments.json#/data/comments/0').state,'hold');
  p.data.text='Text';p.data.author={};
  assert.throws(()=>quoteRecord(readEvidence(files(p),policy,now),'post.json#/data'),/identified speaker/);
});
test('search results retain original array pointers and distinct authors', () => {
  const p=structuredClone(post.data), other={...p,urn:'456',url:'https://example.test/post/456',author:{name:'Other'},text:'Different observation'};
  const c=readEvidence([{name:'search.json',bytes:JSON.stringify({endpoint:'search/posts',fetched_at:now,data:{posts:[p,other]}})}],policy,now);
  assert.equal(c.coverage.posts,2);assert.equal(quoteRecord(c,'search.json#/data/posts/1').speaker.name,'Other');
  assert.equal(quoteRecord(c,'search.json#/data/posts/1').quote,'Different observation');
  assert.equal(checkOpening(c,'456',['discussion']).state,'hold');
});
test('same original URL under different IDs is not silently accepted twice', () => {
  const p=structuredClone(post);p.data.urn='456';
  const c=readEvidence([...files(),{name:'alias.json',bytes:JSON.stringify(p)}],policy,now);
  assert.ok(checkOpening(c,'123',['discussion'],'comments.json#/data/comments/0').reasons.includes('duplicate_originals_review_required'));
});
test('multiple snapshots and duplicate originals require explicit reconciliation', () => {
  const f=files();f.push({...f[1],name:'comments-copy.json'});
  assert.equal(checkOpening(readEvidence(f,policy,now),'123',['discussion'],'comments.json#/data/comments/0').state,'hold');
  f.push({...f[0],name:'post-copy.json'});
  assert.throws(()=>checkOpening(readEvidence(f,policy,now),'123',['discussion']),/unambiguous/);
});
test('a branch from a different thread cannot be attached to the selected post', () => {
  const c=structuredClone(comments);c.data.urn='other';
  const g=checkOpening(cat(policy,c),'123',['discussion'],'comments.json#/data/comments/0');
  assert.equal(g.state,'hold'); assert.equal(g.branch,null);
});
test('unknown envelopes are visible gaps; plain topic reading needs no contribution policy', () => {
  const c=readEvidence([...files(),{name:'unknown.json',bytes:'{"data":{"new_schema":true}}'}],{},now);
  assert.equal(c.warnings.length,1); assert.equal(c.policy.valid,false);assert.equal(c.coverage.posts,1);
  assert.equal(checkOpening(c,'123',['discussion'],'comments.json#/data/comments/0').state,'hold');
});

test('draft citation validation catches changed comment IDs and preserves exact source URLs', async () => {
  const { checkCitations } = await import(existsSync(local) ? local : shipped);
  const url = 'https://www.linkedin.com/feed/update/urn:li:activity:123?commentUrn=urn%3Ali%3Acomment%3A%28activity%3A123%2C456%29';
  const sources = [{ data: { comments: [{ url }] } }];
  assert.equal(checkCitations(`[source](<${url}>)`, sources).valid, true);
  assert.equal(checkCitations('`' + url + '`', sources).valid, true);
  const corrupted = url.replace('%28activity', '%28(activity');
  assert.deepEqual(checkCitations(`[source](<${corrupted}>)`, sources).unmatched, [corrupted]);
  assert.equal(checkCitations('[source](https://www.linkedin.com/posts/invented)', sources).valid, false);
  assert.equal(checkCitations('comments.json#/data/comments/0', sources).valid, true);
});

test('draft citation CLI reads stdin locally and fails until the draft is corrected', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { spawnSync } = await import('node:child_process');
  const root = mkdtempSync(join(tmpdir(), 'research-citations-'));
  try {
    const url = 'https://www.linkedin.com/posts/example_activity-123';
    writeFileSync(join(root, 'post.json'), JSON.stringify({ data: { url } }));
    const run = text => spawnSync(process.execPath, [fileURLToPath(existsSync(local) ? local : shipped), root, '--check-citations'], { input: text, encoding: 'utf8' });
    const bad = run('[source](https://www.linkedin.com/posts/example)');
    assert.equal(bad.status, 1); assert.equal(JSON.parse(bad.stdout).valid, false);
    const good = run(`[source](<${url}>)`);
    assert.equal(good.status, 0); assert.equal(JSON.parse(good.stdout).valid, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

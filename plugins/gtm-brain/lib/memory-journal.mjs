// Optional local append receipts. Losing these only makes the next index refresh slower.
import { statSync, readFileSync, appendFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function memoryStamp(path) {
  try {
    const s = statSync(path, { bigint: true });
    return { key: [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':'), size: Number(s.size) };
  } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
const receiptPath = (root, slug) => join(root, 'work/memory-appends', encodeURIComponent(slug) + '.json');
const checkpointPath = (root, slug) => join(root, 'work/memory-appends', encodeURIComponent(slug) + '.checkpoint');
export function recordMemoryCheckpoint(root, slug, key) {
  try {
    mkdirSync(join(root, 'work/memory-appends'), { recursive: true });
    const path = checkpointPath(root, slug), temporary = path + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, key); renameSync(temporary, path);
  } catch { /* Losing a checkpoint receipt only requires source verification. */ }
}
const receipts = (root, slug) => {
  try { const data = JSON.parse(readFileSync(receiptPath(root, slug), 'utf8')); return Array.isArray(data) && data.length <= 256 ? data : []; }
  catch { return []; }
};
export function trustedMemoryAppend(root, slug, before, after) {
  const chain = receipts(root, slug);
  let key = before;
  for (const entry of chain) if (entry.before === key) key = entry.after;
  return key !== before && key === after;
}
// Called under the format library's writer lock. A manual edit between normal writes
// breaks the stamp chain. A missing, interrupted or rotated receipt is a cache miss.
export function appendMemoryBytes(root, slug, path, text) {
  const before = memoryStamp(path);
  appendFileSync(path, text);
  try {
    const after = memoryStamp(path);
    if (after.size !== (before?.size || 0) + Buffer.byteLength(text)) return;
    const previous = receipts(root, slug), key = before?.key || 'missing';
    let chain = previous.at(-1)?.after === key ? previous.slice(-255) : [];
    // Retain the most recently committed index checkpoint across arbitrarily large
    // normal imports, instead of losing its receipt after 256 individual appends.
    let checkpoint; try { checkpoint = readFileSync(checkpointPath(root, slug), 'utf8'); } catch {}
    if (checkpoint && (checkpoint === key || trustedMemoryAppend(root, slug, checkpoint, key))) chain = [{ before: checkpoint, after: key }];
    chain.push({ before: key, after: after.key });
    mkdirSync(join(root, 'work/memory-appends'), { recursive: true });
    const receipt = receiptPath(root, slug), temporary = receipt + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, JSON.stringify(chain)); renameSync(temporary, receipt);
  } catch { /* The canonical append succeeded. Cache bookkeeping must never undo it. */ }
}

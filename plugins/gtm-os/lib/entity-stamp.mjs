// Read-only revision checks. Never acquire the entity lock while holding a cache lock.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
export function entityStamp(root) {
  let files = [];
  try { files = readdirSync(join(root, 'brain', 'entities')).filter(f => f.endsWith('.md')).sort().map(f => join('brain', 'entities', f)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return JSON.stringify([...['admin.md', 'names.md', 'entities.md'].map(f => join('brain', f)), ...files].map(file => {
    try { const s = statSync(join(root, file), { bigint: true }); return [file, String(s.dev), String(s.ino), String(s.size), String(s.mtimeNs), String(s.ctimeNs)]; }
    catch (e) { if (e.code === 'ENOENT') return [file, null]; throw e; }
  }));
}

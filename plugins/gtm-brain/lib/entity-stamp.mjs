// Read-only revision checks. Never acquire the entity lock while holding a cache lock.
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { pagePaths } from './layout.mjs';
export function entityStamp(root) {
  let files = [];
  // both layouts: flat pages and the pages in kind folders (lib/layout.mjs)
  files = pagePaths(root);
  return JSON.stringify([...['admin.md', 'names.md', 'entities.md'].map(f => join('brain', f)), ...files].map(file => {
    try { const s = statSync(join(root, file), { bigint: true }); return [file, String(s.dev), String(s.ino), String(s.size), String(s.mtimeNs), String(s.ctimeNs)]; }
    catch (e) { if (e.code === 'ENOENT') return [file, null]; throw e; }
  }));
}

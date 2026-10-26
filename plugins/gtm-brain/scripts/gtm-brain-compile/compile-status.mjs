// A failed discovery is not an empty queue. Keep both exit status and JSON validation.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const [root = '.', before, after] = process.argv.slice(2);
if (root === '--progress') {
  const keys = value => value.split('|').flatMap((part, i) => part.split(' ').filter(Boolean).map(id => `${i}:${id}`));
  const remaining = new Set(keys(after));
  process.exit(keys(before).some(id => !remaining.has(id)) ? 0 : 1);
}
const plugin = process.env.PLUGIN_ROOT || fileURLToPath(new URL('../../', import.meta.url));
function read(script, args, field) {
  const result = spawnSync(process.execPath, [join(plugin, 'scripts', script), root, ...args], {
    encoding: 'utf8', timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`${script} failed: ${result.error?.message || result.stderr.trim() || result.signal || result.status}`);
  const rows = JSON.parse(result.stdout);
  if (!Array.isArray(rows) || rows.some(r => !r || typeof r[field] !== 'string' || !/^[a-z0-9_-]+$/.test(r[field]))) throw new Error(`${script} returned an invalid stale list`);
  return rows;
}
try {
  const contexts = read('gtm-brain-compile/compile.mjs', ['--stale'], 'slug').filter(c => !c.manualEdit).map(c => c.slug);
  const entities = read('gtm-brain-entities/compile-entity.mjs', [], 'id').map(e => e.id);
  console.log(contexts.join(' ') + '|' + entities.join(' '));
} catch (e) { console.error(`Cannot inspect pending compilation: ${e.message}`); process.exitCode = 1; }

// Read-only reset guard. A schedule targeting this folder must be handled before wiping it.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
export function schedulesForFolder(folder, codexHome) {
  const dir = join(codexHome, 'automations');
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const path = resolve(folder);
  return entries.filter(e => e.isDirectory()).flatMap(e => {
    const file = join(dir, e.name, 'automation.toml');
    const text = readFileSync(file, 'utf8');
    // Match either a literal path or its TOML basic-string escaped spelling.
    return text.includes(path) || text.includes(JSON.stringify(path).slice(1, -1)) ? [file] : [];
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('Provide the test brain folder.');
    const matches = schedulesForFolder(process.argv[2], process.env.CODEX_HOME || join(homedir(), '.codex'));
    if (matches.length) {
      console.error('Reset paused: scheduled tasks still reference this folder. Review and remove test-created tasks in Codex first; preserve unrelated tasks.');
      for (const file of matches) console.error(file);
      process.exitCode = 2;
    }
  } catch (e) { console.error(`Cannot verify scheduled tasks: ${e.message}`); process.exitCode = 1; }
}

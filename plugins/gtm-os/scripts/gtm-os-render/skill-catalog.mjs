// Only shipped user workflows are advertised from the plugin. A brain's own skills (lib/user-skills.mjs)
// follow them in a "yours" group when the renderer passes the brain root.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listUserSkills } from '../../lib/user-skills.mjs';

export function skillCatalog(pluginRoot = fileURLToPath(new URL('../../', import.meta.url)), brainRoot = null) {
  const entries = JSON.parse(readFileSync(new URL('./skill-catalog.json', import.meta.url), 'utf8'));
  const shipped = entries.filter(s => /^gtm-os-[a-z-]+$/.test(s.id) && existsSync(join(pluginRoot, 'skills', s.id, 'SKILL.md')))
    .map(s => ({ id: s.id, command: '/' + s.id, group: s.group, featured: s.featured, title: s.title, description: s.description, example: s.example }));
  const yours = brainRoot ? listUserSkills(brainRoot).map(s => ({ id: s.id, command: '/' + s.id, group: 'yours', featured: false, title: s.title, description: s.description, example: '/' + s.id })) : [];
  return [...shipped, ...yours];
}

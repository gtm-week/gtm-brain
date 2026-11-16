// The one catalogue of shipped skills (skill-catalog.json). Each entry carries its role: mentor (coaches a person
// through GTM work and fills a base document, or produces work from the brain's context), everyday, or setup
// (setup and maintenance). A mentor also says its promise, the base document it fills (fills, a document slug) or
// what it produces, and the base documents it reads. The dashboard, README and the tests read the roles from here.
// Only shipped user workflows are advertised from the plugin. A brain's own skills (lib/user-skills.mjs)
// follow them in a "yours" group when the renderer passes the brain root.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listUserSkills } from '../../lib/user-skills.mjs';

export function skillCatalog(pluginRoot = fileURLToPath(new URL('../../', import.meta.url)), brainRoot = null) {
  const entries = JSON.parse(readFileSync(new URL('./skill-catalog.json', import.meta.url), 'utf8'));
  const shipped = entries.filter(s => /^gtmb-[a-z-]+$/.test(s.id) && existsSync(join(pluginRoot, 'skills', s.id, 'SKILL.md')))
    .map(s => ({ id: s.id, command: '/' + s.id, group: s.group, featured: s.featured, title: s.title, description: s.description, example: s.example,
      ...Object.fromEntries(['role', 'promise', 'fills', 'produces', 'reads'].filter(k => s[k] !== undefined).map(k => [k, s[k]])) }));
  const yours = brainRoot ? listUserSkills(brainRoot).map(s => ({ id: s.id, command: '/' + s.id, group: 'yours', featured: false, title: s.title, description: s.description, example: '/' + s.id })) : [];
  return [...shipped, ...yours];
}

export const SKILL_ROLES = ['mentor', 'everyday', 'setup'];
/* The shipped skills of one role, in catalogue order. */
export const skillsByRole = (role, pluginRoot) => skillCatalog(pluginRoot).filter(s => s.role === role);

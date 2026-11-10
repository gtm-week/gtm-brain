// Attachments are fields on memories. This module resolves their local file references; it never
// uploads, deletes or searches for files. The one copy it makes: a file attached from work/ (this
// computer's, gitignored, a task's scratch) goes to its owner's folder first, so the approved file
// travels with the brain and outlives the task (Artur, 2026-11-10: his portrait in a Berlin package).
import { readFileSync, writeFileSync, mkdirSync, realpathSync, statSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, join, extname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as lib from './brain.mjs';

const text = v => typeof v === 'string' && v.trim().length > 0 && !/[\x00-\x1f]/.test(v);
const within = (base, path) => { const r = relative(base, path); return r !== '' && !isAbsolute(r) && r !== '..' && !r.startsWith('../'); };
const relativePath = p => text(p) && !isAbsolute(p) && !p.includes('\\') && p.split('/').every(s => s && s !== '.' && s !== '..');
export const ASSET_STATUSES = ['draft', 'approved', 'retired'];
export function validateAsset(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return ['asset must be an object'];
  const errors = [];
  if (Object.keys(a).some(k => !['entity', 'label', 'role', 'status', 'file'].includes(k))) errors.push('unknown asset field');
  for (const k of ['entity', 'label', 'role']) if (!text(a[k])) errors.push(`asset ${k} required`);
  if (!ASSET_STATUSES.includes(a.status)) errors.push('asset status must be draft, approved or retired');
  const f = a.file;
  if (!f || !['brain', 'project', 'local'].includes(f.base)) return [...errors, 'asset file base must be brain, project or local'];
  if (Object.keys(f).some(k => !['base', 'path', 'project', 'machine'].includes(k))) errors.push('unknown asset file field');
  if (f.base === 'local' ? !text(f.path) || !isAbsolute(f.path) || !text(f.machine) : !relativePath(f.path)) errors.push('invalid asset file path or local machine');
  if (f.base === 'project' && !/^[a-z0-9-]+$/.test(f.project || '')) errors.push('asset project slug required');
  return errors;
}
function machine(root, create = false) {
  const path = join(root, 'work', 'asset-machine.json');
  try { return JSON.parse(readFileSync(path, 'utf8')).id; } catch {}
  if (!create) return null;
  mkdirSync(join(root, 'work'), { recursive: true });
  const id = randomUUID(); writeFileSync(path, JSON.stringify({ id }), { flag: 'wx', mode: 0o600 }); return id;
}
function projectRoot(root, slug) {
  const p = lib.readProjects(root).find(p => p.slug === slug);
  if (!p || lib.projectPointerStatus(root, p) !== 'ok') throw new Error('Project folder is not linked on this computer. Repair its connection in Codex.');
  return realpathSync(p.path);
}
export function resolveAssetFile(root, asset) {
  const errors = validateAsset(asset); if (errors.length) throw new Error(errors.join('; '));
  const f = asset.file;
  if (f.base === 'local' && f.machine !== machine(root)) throw new Error('This file is local to another computer. Attach a local copy in Codex.');
  const base = f.base === 'project' ? projectRoot(root, f.project) : realpathSync(root);
  const path = realpathSync(f.base === 'local' ? f.path : resolve(base, f.path));
  if (f.base !== 'local' && !within(base, path)) throw new Error('File points outside its linked folder. Reattach it in Codex.');
  // An absolute reference was canonicalized at attachment time. Do not follow a later redirect.
  if (f.base === 'local' && path !== f.path) throw new Error('File location changed. Reattach it in Codex.');
  if (!statSync(path).isFile()) throw new Error('Attachment is not a regular file.');
  return path;
}
export function prepareAsset(root, input, project = null, previous = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('asset must be an object');
  if (Object.keys(input).some(k => !['entity', 'label', 'role', 'status', 'path'].includes(k))) throw new Error('unknown asset input field');
  const entity = lib.exactName(lib.readNames(root), input.entity || '');
  if (!entity) throw new Error('Name the existing entity for this attachment; use add_name first if it is new.');
  if (previous && entity !== (lib.canonicalName(lib.readNames(root), previous.entity) || previous.entity)) throw new Error('A replacement must belong to the same entity. Attach another relationship separately.');
  let file = previous?.file;
  if (input.path !== undefined) {
    if (!text(input.path)) throw new Error('asset path required');
    const base = project ? projectRoot(root, project) : realpathSync(root);
    if (!isAbsolute(input.path) && !relativePath(input.path)) throw new Error('Use a path inside the project or an explicit absolute file path.');
    let path = realpathSync(resolve(base, input.path));
    if (!statSync(path).isFile()) throw new Error('Attach a file, not a directory.');
    if (!isAbsolute(input.path) && !within(base, path)) throw new Error('Relative attachment escapes its folder. Use its explicit absolute path.');
    if (within(join(realpathSync(root), 'work'), path)) path = toOwnerFolder(root, entity, path);
    file = within(base, path) ? { base: project ? 'project' : 'brain', path: relative(base, path), ...(project ? { project } : {}) }
      : within(realpathSync(root), path) ? { base: 'brain', path: relative(realpathSync(root), path) }
      : { base: 'local', path, machine: machine(root, true) };
  }
  const asset = { entity, label: input.label, role: input.role, status: input.status || 'draft', file };
  const errors = validateAsset(asset); if (errors.length) throw new Error(errors.join('; '));
  // Retirement is possible even after the file has gone. Other changes must have a usable file.
  if (asset.status !== 'retired') resolveAssetFile(root, asset);
  return asset;
}
/* A file under work/ lands in brain/entities/<id>/ beside the entity's file, committed, under a free name. */
function toOwnerFolder(root, entity, path) {
  const e = lib.resolveEntity(lib.readNames(root), entity);
  if (!e?._path) throw new Error('Name the existing entity for this attachment; use add_name first if it is new.');
  const real = realpathSync(root), dir = join(real, e._path.replace(/\.md$/, '')); mkdirSync(dir, { recursive: true });
  const ext = extname(path), stem = basename(path, ext), bytes = readFileSync(path), same = p => existsSync(p) && readFileSync(p).equals(bytes);
  let name = `${stem}${ext}`, n = 1;
  while (existsSync(join(dir, name)) && !same(join(dir, name))) name = `${stem}-${++n}${ext}`;
  const target = join(dir, name);
  if (!same(target)) { copyFileSync(path, target); lib.commit(root, [relative(real, target)], `file: ${name} (from ${relative(real, path)})`); }
  return realpathSync(target);
}
/* The current approved file for an entity and role: the one a new approved attachment replaces. */
export function currentApproved(root, entity, role, rows = assetRows(root)) {
  const name = lib.exactName(lib.readNames(root), entity || '') || entity, r = String(role || '').trim().toLowerCase();
  return rows.filter(a => a.active && a.status === 'approved' && a.entity === name && String(a.role).trim().toLowerCase() === r);
}
/* The approved files every chat starts with: a person's photo, a company's logo. One line per file, at most
   MAX_LINE_ASSETS; the rest are a query away. The person changes one by attaching the new file as approved. */
const MAX_LINE_ASSETS = 12;
export function assetsLine(root, rows = assetRows(root)) {
  const approved = rows.filter(a => a.active && a.status === 'approved');
  if (!approved.length) return '';
  const where = a => a.issue ? `missing (${a.issue})` : a.file.base === 'project' ? `${a.file.project}:${a.file.path}` : a.file.path;
  const shown = approved.slice(0, MAX_LINE_ASSETS).map(a => `  ${a.entity} · ${a.role}: ${where(a)}${a.ambiguous ? ' (two approved for this role: ask which one)' : ''}`);
  const more = approved.length > MAX_LINE_ASSETS ? `\n  and ${approved.length - MAX_LINE_ASSETS} more (query attachments)` : '';
  return `Approved files (the person's photo, the company's logo): use exactly these, never a copy in a task folder or a package's own list. When the person says use another one, attach it as approved for the same role at once; it replaces the old one. They see and change them on the person's or company's page of the dashboard.\n${shown.join('\n')}${more}`;
}
export const assetMime = path => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' })[extname(path).toLowerCase()] || null;

export function assetRows(root, contexts = lib.listContexts(root)) {
  const rows = [], names = lib.readNames(root);
  const visible = new Set(lib.hideForkCopies(contexts.flatMap(c => c.memories)).map(m => m.id));
  for (const c of contexts) {
    const current = new Set(lib.effectiveMemories(c.memories).map(m => m.id));
    for (const m of c.memories) {
      if (!m.asset || validateAsset(m.asset).length || !visible.has(m.id)) continue;
      const a = { ...m.asset, entity: lib.canonicalName(names, m.asset.entity) || m.asset.entity }, active = current.has(m.id) && a.status !== 'retired';
      let path = null, issue = null, revision = null;
      try { path = resolveAssetFile(root, a); const s = statSync(path); revision = `${s.mtimeMs}-${s.ctimeMs}-${s.size}`; }
      catch (e) { path = null; issue = e.code === 'ENOENT' ? 'File is missing or moved. Locate it in Codex and update the attachment.' : e.message; }
      const replacement = c.memories.find(r => r.supersedes === m.id || r.retracts === m.id);
      rows.push({ id: m.id, context: c.slug, ...a, active, status: active ? a.status : 'retired', history: replacement ? (replacement.supersedes ? 'replaced' : 'withdrawn') : null,
        at: m.at, authors: m.authors, issue, revision, local: a.file.base === 'local', preview: !!path && !!assetMime(path),
        url: path ? `/assets/${c.slug}/${m.id}` : null });
    }
  }
  for (const r of rows) r.ambiguous = r.active && r.status === 'approved' && rows.some(o => o.id !== r.id && o.entity === r.entity && o.role === r.role && o.active && o.status === 'approved');
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}
export function assetSummary(root, memory) {
  if (!memory.asset) return '';
  let location; try { location = resolveAssetFile(root, memory.asset); } catch (e) { location = `Unavailable: ${e.code === 'ENOENT' ? 'file missing or moved' : e.message}`; }
  return `\n  attachment ${memory.id}: ${memory.asset.label} | ${memory.asset.entity} | ${memory.asset.role} | ${memory.asset.status}\n  file: ${location}`;
}

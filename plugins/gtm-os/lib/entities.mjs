// Identity files and their compiled views. Facts remain append-only context memories.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, renameSync, lstatSync, rmSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import * as lib from "./brain.mjs";
import { acquireProcessLock, releaseProcessLock } from './process-lock.mjs';
import { refreshIndexedPages } from './entity-pages.mjs';
import { hasMemoryIndex } from './memory-index-store.mjs';

export const ENTITY_FORMAT = "gtm-os-entity-v2";
export const ENTITY_KINDS = ["person", "organization", "product"];
export function entityType(kind = "person", subtype = null) {
  if (["company", "team"].includes(kind)) {
    if (subtype !== null && subtype !== kind) throw new Error(`legacy kind ${kind} conflicts with subtype ${subtype}`);
    return { kind: "organization", subtype: kind };
  }
  if (!ENTITY_KINDS.includes(kind)) throw new Error(`kind must be one of ${ENTITY_KINDS.join(", ")}; company and team are accepted as legacy organization subtypes`);
  if (subtype !== null && (kind !== "organization" || typeof subtype !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(subtype))) throw new Error("subtype must be an organization category such as company or team, or null");
  return { kind, subtype };
}
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
// Same bytes as JSON.stringify of the snapshot, without allocating a second copy
// of every memory when a widely mentioned entity has a large evidence history.
function evidenceHash(entity, related, contexts, notes) {
  const digest = createHash('sha256');
  digest.update('{"identity":' + JSON.stringify(entity) + ',"related_identities":' + JSON.stringify(related) + ',"contexts":[');
  contexts.forEach((c, i) => {
    if (i) digest.update(',');
    const { refreshed_at, memories, ...metadata } = c;
    digest.update(JSON.stringify(metadata).slice(0, -1) + ',"memories":[');
    memories.forEach((m, n) => { if (n) digest.update(','); digest.update(JSON.stringify(m)); });
    digest.update(']}');
  });
  digest.update('],"file_notes":' + JSON.stringify(notes) + '}');
  return digest.digest('hex').slice(0, 16);
}
export const entityId = name => `e_${hash(name.trim().toLowerCase())}`;
export const idOK = id => /^e_[0-9a-f]{16}$/.test(id || "");
const strings = a => Array.isArray(a) && a.every(x => typeof x === "string" && x.trim());
const refsOK = a => Array.isArray(a) && a.every(x => x && typeof x.kind === "string" && x.kind && typeof x.ref === "string" && x.ref);
export const editedBody = e => e._body !== undefined && (e._fm?.rendered_body_hash ? e._fm.rendered_body_hash !== hash(e._body) : !!e._body.trim());

// Entity files are editable. A malformed file produces a repair proposal, never an automatic rewrite.
export class EntityFormatError extends Error {
  constructor(path, field, problem, proposal) {
    super(`Cannot parse ${path}: ${field}: ${problem}. Proposed fix: ${proposal}. The affected file was left unchanged; show the proposed repair to the person.`);
    this.name = "EntityFormatError";
    this.code = "ENTITY_FORMAT";
    this.repair = { path, field, problem, proposal };
  }
}
const invalid = (path, field, problem, proposal) => { throw new EntityFormatError(path, field, problem, proposal); };
export function parseEntityText(text, path) {
  const header = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!header) invalid(path, "frontmatter", "expected an opening and closing --- line", "restore the frontmatter fences around the existing metadata, keeping the Markdown below them");
  const seen = new Set(), inlineLists = {}; let listKey = null;
  for (const [i, line] of header[1].replace(/\r\n/g, "\n").split("\n").entries()) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/), item = line.match(/^\s+-\s+(.*)$/);
    if (!kv && !(item && listKey)) invalid(path, `line ${i + 2}`, "not a supported frontmatter entry", "use key: value or an indented list item; move prose below the closing --- line");
    if (kv && seen.has(kv[1])) invalid(path, kv[1], "the field appears more than once", "combine the intended values into one field without discarding either entry");
    if (kv) { seen.add(kv[1]); listKey = kv[2].trim() ? null : kv[1]; }
    const value = (kv ? kv[2] : item[1]).trim();
    let quote = null, tokenStart = 1; const brackets = [], tokens = [];
    for (let j = 0; j < value.length; j++) {
      const c = value[j];
      if (quote) {
        if (c === "\\" && quote === '"') { j++; continue; }
        if (c === quote) {
          if (quote === "'" && value[j + 1] === "'") { j++; continue; }
          quote = null;
        }
      } else if (c === '"' || c === "'") {
        if (j === 0 || /[\s:[{,]/.test(value[j - 1])) quote = c;
      } else if (c === "[" || c === "{") brackets.push(c);
      else if (c === "," && value.startsWith("[") && brackets.length === 1) { tokens.push(value.slice(tokenStart, j)); tokenStart = j + 1; }
      else if (c === "]" || c === "}") {
        if (brackets.pop() !== (c === "]" ? "[" : "{")) invalid(path, kv?.[1] || listKey, "unbalanced brackets", "balance the list or map brackets, preserving their contents");
      }
    }
    if (quote || brackets.length) invalid(path, kv?.[1] || listKey, "an unclosed quote or bracket", "close the quoted value or list on the same line, preserving its contents");
    if (value.startsWith('"')) { try { JSON.parse(value); } catch { invalid(path, kv?.[1] || listKey, "invalid quoted value", "use a JSON-quoted string with escaped internal quotes and backslashes"); } }
    if (kv && value.startsWith("[") && value.endsWith("]")) {
      try { inlineLists[kv[1]] = JSON.parse(value); }
      catch {
        tokens.push(value.slice(tokenStart, -1));
        inlineLists[kv[1]] = tokens.map(t => t.trim()).filter(Boolean).map(t => /^'.*'$/.test(t)
          ? t.slice(1, -1).replace(/''/g, "'")
          : lib.parseFrontmatter(`---\nvalue: ${t}\n---\n`).fm.value);
      }
    }
  }
  const { fm } = lib.parseFrontmatter(header[0].replace(/\r\n/g, "\n") + "\n");
  Object.assign(fm, inlineLists);
  return { fm, body: text.slice(header[0].length), header: header[0] };
}
// Change only metadata fields that need an update; preserve user formatting and comments elsewhere.
export function entityText(previous, fm, body) {
  if (!previous?._header) return lib.renderFrontmatter(fm) + body;
  const eol = previous._header.includes("\r\n") ? "\r\n" : "\n";
  const lines = previous._header.trimEnd().split(/\r?\n/), output = ["---"], seen = new Set();
  const fieldLines = key => lib.renderFrontmatter({ [key]: fm[key] }).trimEnd().split("\n").slice(1, -1);
  for (let i = 1; i < lines.length - 1;) {
    const match = lines[i].match(/^([A-Za-z_][\w-]*):/);
    if (!match) { output.push(lines[i++]); continue; }
    const key = match[1]; let end = i + 1;
    while (end < lines.length - 1 && !/^[A-Za-z_][\w-]*:/.test(lines[end])) end++;
    const block = lines.slice(i, end); seen.add(key);
    if (JSON.stringify(fm[key]) === JSON.stringify(previous._fm[key])) output.push(...block);
    else {
      if (Object.hasOwn(fm, key)) output.push(...fieldLines(key));
      output.push(...block.slice(1).filter(line => !line.trim() || /^\s*#/.test(line)));
    }
    i = end;
  }
  for (const key of Object.keys(fm)) if (!seen.has(key)) output.push(...fieldLines(key));
  return [...output, "---", ""].join(eol) + body;
}
const stamp = () => new Date().toISOString();
const locks = new Set();
// Readers see complete merges; concurrent writers cannot overwrite each other's aliases or brief.
export function withEntityLock(root, fn) {
  const key = resolve(root);
  if (locks.has(key)) return fn();
  const work = join(root, "work"), lock = join(work, "entity-write.lock");
  mkdirSync(work, { recursive: true });
  let token;
  for (let attempt = 0; ; attempt++) {
    token = acquireProcessLock(lock);
    if (token) break;
    if (attempt >= 200) throw new Error("Entity registry is busy; retry the operation");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  locks.add(key);
  try { recoverEntityChanges(root); return fn(); }
  finally { locks.delete(key); releaseProcessLock(lock, token); }
}
const newest = records => records.map(m => m.at).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
const md = value => String(value).replace(/[\\`*_{}\[\]<>#|]/g, "\\$&").replace(/\r?\n/g, " ");
const dest = value => encodeURI(value).replace(/[()]/g, c => encodeURIComponent(c));
const link = (label, url) => `[${md(label)}](${dest(url)})`;
const atomic = (path, text) => {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Entity file must not be a symbolic link: ${path}`);
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, text); renameSync(tmp, path); return true;
};

// Recovery records belong to the identity folder and travel with Git. They are an
// operation history, not another registry. A pending record makes interrupted writes recoverable.
function historyFolder(root) {
  const folder = join(root, "brain", "entities", ".history");
  for (const path of [join(root, "brain", "entities"), folder]) if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("Entity history cannot use symbolic links");
  return folder;
}
export function readEntityChange(root, id, pending = false) {
  if (!/^ec_[a-f0-9-]{36}$/.test(id || "")) throw new Error("Expected an entity change ID");
  const path = join(historyFolder(root), id + (pending ? ".pending" : ".json"));
  if (!existsSync(path)) throw new Error("No recovery record for this merge; older merges require a reviewed repair from file history");
  if (lstatSync(path).isSymbolicLink()) throw new Error("Entity history cannot use symbolic links");
  let rec;
  try { rec = JSON.parse(readFileSync(path, "utf8")); } catch { invalid(path, "history", "invalid JSON", "restore the original change record from Git"); }
  if (!rec || rec.id !== id || !Array.isArray(rec.changes) || !rec.changes.length || rec.changes.some(c => !c || !/^brain\/entities\/[a-z0-9-]+\.md$/.test(c.path) || typeof c.before !== "string" || typeof c.after !== "string") || new Set(rec.changes.map(c => c.path)).size !== rec.changes.length) invalid(path, "history", "invalid recovery record", "restore the original change record from Git");
  if (rec.operation === "merge" && (!idOK(rec.source) || !idOK(rec.target) || rec.source === rec.target || rec.changes.length !== 2 || !Array.isArray(rec.impact) || rec.impact.some(i => !i || !Array.isArray(i.memories) || i.memories.some(m => typeof m !== "string")))) invalid(path, "history", "invalid merge recovery record", "restore the original change record from Git");
  return rec;
}
function recoverEntityChanges(root) {
  const folder = historyFolder(root);
  if (!existsSync(folder)) return;
  const pending = readdirSync(folder).filter(f => f.endsWith(".pending")).sort();
  for (const file of pending) {
    const rec = readEntityChange(root, file.slice(0, -8), true);
    for (const c of rec.changes) {
      const path = join(root, c.path);
      if (!existsSync(path) || lstatSync(path).isSymbolicLink() || ![c.before, c.after].includes(readFileSync(path, "utf8"))) invalid(c.path, "interrupted change", "file changed after the operation was interrupted", `review ${file} and preserve the new edits before resuming`);
    }
    for (const c of rec.changes) atomic(join(root, c.path), c.after);
    renameSync(join(folder, file), join(folder, rec.id + ".json"));
  }
  if (pending.length) console.error("Recovered interrupted entity changes: " + lib.commit(root, lib.ENTITIES_PATHS, "recover interrupted entity changes").note);
}
export function applyEntityChange(root, record) {
  return withEntityLock(root, () => {
    const changes = record.changes.filter(c => c.before !== c.after);
    if (!changes.length) return null;
    for (const c of changes) {
      if (!/^brain\/entities\/[a-z0-9-]+\.md$/.test(c.path)) throw new Error("Invalid entity change path");
      const path = join(root, c.path);
      if (lstatSync(path).isSymbolicLink() || readFileSync(path, "utf8") !== c.before) throw new Error(`Entity file changed; read it again: ${c.path}`);
    }
    const folder = historyFolder(root); mkdirSync(folder, { recursive: true });
    const rec = { ...record, id: record.id || `ec_${randomUUID()}`, at: stamp(), changes };
    if (!/^ec_[a-f0-9-]{36}$/.test(rec.id)) throw new Error("Invalid entity change ID");
    if (existsSync(join(folder, rec.id + ".json"))) throw new Error("Entity change ID already exists");
    const pending = join(folder, rec.id + ".pending");
    writeFileSync(pending, JSON.stringify(rec, null, 2) + "\n", { flag: "wx" });
    try {
      for (const c of changes) {
        if (readFileSync(join(root, c.path), "utf8") !== c.before) throw new Error(`Entity file changed during the operation: ${c.path}`);
        atomic(join(root, c.path), c.after);
      }
      renameSync(pending, join(folder, rec.id + ".json"));
    } catch (error) {
      // Preserve a racing human edit. Recovery reports it for review on the next read.
      let restored = true;
      for (const c of changes) {
        const path = join(root, c.path), current = readFileSync(path, "utf8");
        if (current === c.after) atomic(path, c.before);
        else if (current !== c.before) restored = false;
      }
      if (restored) rmSync(pending);
      throw error;
    }
    return rec.id;
  });
}

export function readEntityFiles(root) {
  const dir = join(root, "brain", "entities");
  if (!existsSync(dir)) return [];
  if (lstatSync(dir).isSymbolicLink()) throw new Error("brain/entities must not be a symbolic link");
  const entries = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith(".md")).sort()) {
    const path = join(dir, file);
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Entity file must not be a symbolic link: ${file}`);
    const relative = `brain/entities/${file}`, original = readFileSync(path, "utf8"), { fm, body, header } = parseEntityText(original, relative);
    if (![ENTITY_FORMAT, "gtm-os-entity-v1"].includes(fm.format)) invalid(relative, "format", `expected ${ENTITY_FORMAT} or legacy gtm-os-entity-v1`, `restore the format version from file history`);
    if (!idOK(fm.id)) invalid(relative, "id", "expected e_ followed by 16 lowercase hexadecimal characters", "restore this entity's stable ID from file history; do not invent a replacement ID");
    if (fm.redirect) { if (!idOK(fm.redirect)) invalid(relative, "redirect", "expected a stable entity ID", "restore the destination ID from the confirmed merge"); continue; }
    if (typeof fm.name !== "string" || !fm.name.trim()) invalid(relative, "name", "expected a non-empty name", "restore the intended canonical name as a string");
    if (typeof fm.kind !== "string") invalid(relative, "kind", "expected an entity kind", "restore person, organization or product from the known identity");
    if (fm.status !== undefined && !["active", "archived"].includes(fm.status)) invalid(relative, "status", "expected active or archived", "restore the intended entity status");
    if (fm.merge_ids !== undefined && (!strings(fm.merge_ids) || !fm.merge_ids.every(id => /^ec_[a-f0-9-]{36}$/.test(id)))) invalid(relative, "merge_ids", "expected recorded merge IDs", "restore merge IDs from identity history");
    let type;
    try { type = entityType(fm.kind, fm.subtype ?? null); }
    catch (e) { invalid(relative, "kind / subtype", e.message, "use person, organization or product, with an optional organization subtype; preserve the original values for review"); }
    for (const field of ["aliases", "emails", "not_same", "previous_ids"]) {
      if (!strings(fm[field])) invalid(relative, field, "expected a list of non-empty strings", `write ${field}: [value] for a single value or ${field}: [] for an empty list, preserving existing entries`);
    }
    if (!fm.previous_ids.every(idOK)) invalid(relative, "previous_ids", "expected stable entity IDs", "restore retired IDs from the confirmed merges in file history");
    for (const field of ["references", "identity_sources"]) if (!refsOK(fm[field])) invalid(relative, field, "expected a list of {kind, ref} records", `use ${field}: [] if empty, otherwise retain each source as an indented - {kind: tool, ref: value} entry`);
    let compilation = null;
    if (fm.compilation !== undefined && fm.compilation !== null) {
      try { compilation = JSON.parse(fm.compilation); validateBriefShape(compilation); }
      catch (e) { invalid(relative, "compilation", e.message, "repair the JSON brief with overview, contexts and relationships lists; preserve its text and memory citations"); }
    }
    entries.push({ id: fm.id, name: fm.name, ...type, status: fm.status || "active", merge_ids: fm.merge_ids || [], aliases: fm.aliases, emails: fm.emails, not: fm.not_same, previous_ids: fm.previous_ids, references: fm.references, identity_sources: fm.identity_sources, _path: relative, _fm: fm, _compilation: compilation, _body: body, _header: header, _text: original });
  }
  const owners = new Map();
  for (const e of entries) for (const id of [e.id, ...e.previous_ids]) {
    if (owners.has(id)) invalid(e._path, "id / previous_ids", `${id} is also claimed by ${owners.get(id)}`, "restore the intended IDs from file history or resolve a confirmed merge; do not guess which identity wins");
    owners.set(id, e._path);
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveEntity(registry, name) {
  const byId = registry.find(e => e.id === name || e.previous_ids?.includes(name));
  if (byId) return byId;
  const canonical = lib.canonicalName(registry, name);
  return canonical ? registry.find(e => e.name === canonical) : null;
}

export function identity(e) {
  return { id: e.id || entityId(e.name), name: e.name, ...entityType(e.kind || "person", e.subtype ?? null), status: e.status || "active", merge_ids: e.merge_ids || [], aliases: e.aliases || [], emails: e.emails || [], not_same: e.not || [], previous_ids: e.previous_ids || [], references: e.references || [], identity_sources: e.identity_sources || [] };
}

// File locations are permanent. Name changes do not break links; IDs survive explicit merges.
export function writeEntityFiles(root, names) {
  const dir = join(root, "brain", "entities");
  if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error("brain/entities must not be a symbolic link");
  mkdirSync(dir, { recursive: true });
  const old = readEntityFiles(root), used = new Set(readdirSync(dir)), changed = [];
  const legacy = old.filter(e => e._fm.format !== ENTITY_FORMAT);
  if (legacy.length) {
    const backups = join(root, "work", "entity-migration"); mkdirSync(backups, { recursive: true });
    const backup = mkdtempSync(join(backups, "before-entity-v2-"));
    for (const e of legacy) copyFileSync(join(root, e._path), join(backup, basename(e._path)));
  }
  for (const e of old) if (!names.some(n => n.id === e.id || n.previous_ids?.includes(e.id))) names.push(e);
  for (const e of names) {
    Object.assign(e, entityType(e.kind || "person", e.subtype ?? null));
    e.id ||= entityId(e.name);
    e.previous_ids ||= []; e.references ||= []; e.identity_sources ||= [];
    if (!idOK(e.id) || !refsOK(e.references) || !refsOK(e.identity_sources)) throw new Error(`Invalid identity for ${e.name}`);
    const previous = old.find(x => x.id === e.id);
    e._path ||= previous?._path;
    if (!e._path) {
      const slug = lib.handleFor(e.name) || e.id;
      let file = `${slug}.md`;
      if (used.has(file)) file = `${slug}-${e.id.slice(2)}.md`;
      if (used.has(file)) throw new Error(`Entity filename collision: ${file}`);
      used.add(file); e._path = `brain/entities/${file}`;
    }
    if (!/^brain\/entities\/[a-z0-9-]+\.md$/.test(e._path)) throw new Error("Invalid entity path");
    const fields = identity(e), before = previous && identity(previous), now = stamp();
    e._fm = { ...(previous?._fm || e._fm || {}), format: ENTITY_FORMAT, ...fields,
      created_at: previous?._fm.created_at || e._fm?.created_at || now,
      updated_at: JSON.stringify(before) === JSON.stringify(fields) ? previous._fm.updated_at : now };
    e._compilation = previous?._compilation || e._compilation || null;
    if (e._compilation) e._fm.compilation = JSON.stringify(e._compilation);
    const body = previous?._body ?? e._body ?? `\n# ${md(e.name)}\n\nNo compiled brief yet. Facts are kept in context memories.\n`;
    if (!previous && e._body === undefined) e._fm.rendered_body_hash = hash(body);
    if (atomic(join(root, e._path), entityText(previous, e._fm, body))) changed.push(e._path);
  }
  // Preserve old links and every retired ID after a confirmed merge.
  for (const e of old.filter(x => !names.some(n => n.id === x.id))) {
    const winner = names.find(n => n.previous_ids.includes(e.id));
    if (!winner) throw new Error(`Refusing to remove ${e.name} without a confirmed identity merge`);
    if (atomic(join(root, e._path), entityText(e, { ...e._fm, redirect: winner.id }, `\n# ${md(e.name)}\n\nMerged into ${link(winner.name, basename(winner._path))}.\n` + (editedBody(e) ? e._body : "")))) changed.push(e._path);
  }
  return changed;
}

const evidenceSlices = new WeakMap();
export function entityEvidenceIndex(registry, contexts) {
  const mentions = lib.createMentionMatcher(registry), index = new Map();
  for (const c of contexts) for (const m of c.memories) index.set(m.id, new Set(mentions(m)));
  // Reuse correction resolution and entity membership across all generated pages.
  // Each slice contains references to the existing records, never cloned memories.
  const slices = new Map(), known = new Set(registry.map(e => e.name));
  for (const c of contexts) {
    const stored = new Map(c.memories.map(m => [m.id, m])), byName = new Map();
    for (const m of c.memories) for (const name of index.get(m.id)) if (known.has(name) && !byName.has(name)) byName.set(name, []);
    for (const m of lib.effectiveMemories(c.memories)) {
      const owners = new Set(index.get(m.id));
      if (m.retracts && stored.has(m.retracts)) for (const name of index.get(m.retracts)) owners.add(name);
      for (const name of owners) if (byName.has(name)) byName.get(name).push(m);
    }
    slices.set(c, byName);
  }
  evidenceSlices.set(index, slices);
  return index;
}
export function entityFacts(root, name, { registry = lib.readNames(root), contexts = lib.listContexts(root), index = entityEvidenceIndex(registry, contexts) } = {}) {
  const e = resolveEntity(registry, name);
  if (!e) throw new Error(`Unknown or ambiguous entity: ${name}`);
  const relevant = [];
  for (const c of contexts) {
    const cached = evidenceSlices.get(index)?.get(c);
    if (cached) {
      if (cached.has(e.name)) relevant.push({ context: c.slug, title: c.title, status: c.status, rule: c.rule, refreshed_at: c.compiledAt, memories: cached.get(e.name) });
      continue;
    }
    const stored = new Map(c.memories.map(m => [m.id, m]));
    const concerns = m => index.get(m.id)?.has(e.name);
    const memories = lib.effectiveMemories(c.memories).filter(m => concerns(m) || (m.retracts && stored.has(m.retracts) && concerns(stored.get(m.retracts))));
    // A corrected attribution can remove every current claim while its original history still matters.
    if (memories.length || c.memories.some(concerns)) relevant.push({ context: c.slug, title: c.title, status: c.status, rule: c.rule, refreshed_at: c.compiledAt, memories });
  }
  const memories = relevant.flatMap(c => c.memories), evidence = memories.filter(m => !m.retracts);
  const neighbors = new Set(evidence.flatMap(m => [...index.get(m.id)]));
  const related_identities = registry.filter(n => n.id !== e.id && neighbors.has(n.name)).map(identity);
  const file_notes = editedBody(e) ? { path: e._path, markdown: e._body } : null;
  // Refreshing a context view does not change the underlying entity evidence.
  const as_of = `s_${evidenceHash(identity(e), related_identities, relevant, file_notes)}`;
  const stale = evidence.length > 0 ? e._fm?.compiled_as_of !== as_of : !!e._compilation && e._fm?.compiled_as_of !== as_of;
  if (!stale && e._compilation) {
    try { validateBrief({ evidence, contexts: relevant }, e._compilation); }
    catch (error) { invalid(e._path, "compilation", error.message, "reconcile the brief's citations with current context memories, preserving the edited text for review"); }
  }
  return { entity: { ...identity(e), path: e._path || null }, related_identities, as_of, stale, compiled_at: e._fm?.compiled_at || null, latest_evidence_at: newest(evidence), contexts: relevant,
    previous: e._compilation || null, file_notes, evidence,
    timeline: lib.memoryTimeline(evidence) };
}

// The ontology's Entity rows use this same registry, never a second identity store.
export function entityRecords(root) {
  return withEntityLock(root, () => {
    const registry = lib.readNames(root), contexts = lib.listContexts(root), index = entityEvidenceIndex(registry, contexts);
    return registry.map(e => {
      const facts = entityFacts(root, e.id, { registry, contexts, index });
      return { ...facts.entity, created_at: e._fm?.created_at || null, updated_at: e._fm?.updated_at || null,
        compiled_at: facts.compiled_at, latest_evidence_at: facts.latest_evidence_at, stale: facts.stale,
        contexts: facts.contexts.map(c => c.context), memories: facts.evidence.map(m => m.id) };
    });
  });
}

function validateBriefShape(brief) {
  const fail = message => { throw new Error(`Invalid entity brief: ${message}`); };
  const object = (x, keys) => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).every(k => keys.includes(k));
  if (!object(brief, ["overview", "contexts", "relationships"]) || !Array.isArray(brief.contexts)) fail("expected overview, contexts and relationships");
  const claims = list => {
    if (!Array.isArray(list)) fail("claims must be a list");
    for (const c of list) {
      if (!object(c, ["text", "memories", "interpretation"]) || typeof c.text !== "string" || !c.text.trim() || /[\u2013\u2014\u2015\u2212]/.test(c.text) || !strings(c.memories) || !c.memories.length || (c.interpretation !== undefined && typeof c.interpretation !== "boolean")) fail("each claim needs plain text and supporting memory IDs");
    }
  };
  claims(brief.overview); claims(brief.relationships);
  const seen = new Set();
  for (const c of brief.contexts) {
    if (!object(c, ["context", "summary", "open_threads"]) || typeof c.context !== "string" || !c.context.trim() || seen.has(c.context)) fail("invalid or duplicate context");
    seen.add(c.context); claims(c.summary); claims(c.open_threads);
  }
}
function validateBrief(facts, brief) {
  validateBriefShape(brief);
  const fail = message => { throw new Error(`Invalid entity brief: ${message}`); };
  const evidence = new Map(facts.evidence.map(m => [m.id, m]));
  const check = (claims, scope) => {
    for (const c of claims) for (const id of c.memories) {
      if (!evidence.has(id)) fail(`${id} is not current evidence about this entity`);
      if (scope && evidence.get(id).context !== scope) fail(`${id} does not belong to ${scope}`);
    }
  };
  check(brief.overview); check(brief.relationships);
  const seen = new Set();
  for (const c of brief.contexts) {
    if (!facts.contexts.some(f => f.context === c.context)) fail("unknown context");
    seen.add(c.context); check(c.summary, c.context); check(c.open_threads, c.context);
  }
  for (const c of facts.contexts.filter(c => c.memories.some(m => !m.retracts))) if (!seen.has(c.context)) fail(`missing perspective for ${c.context}`);
  if (facts.evidence.length && !brief.overview.length) fail("overview is required when evidence exists");
}

export function compileEntity(root, name, { as_of, by, brief }) {
  return withEntityLock(root, () => applyCompilation(root, name, { as_of, by, brief }));
}
function applyCompilation(root, name, { as_of, by, brief }) {
  const registry = lib.readNames(root), e = resolveEntity(registry, name), facts = entityFacts(root, name, { registry });
  if (facts.as_of !== as_of) throw new Error("not applied: entity evidence or identity changed; read entity_facts again");
  const author = lib.teamHandle(root, by) || (["schedule", "background"].includes(by) ? by : null);
  if (!author) throw new Error("by must identify a team member, schedule or background");
  validateBrief(facts, brief);
  lib.writeNames(root, registry);
  // Migration preserves IDs. Re-read the file metadata before updating the compilation.
  const saved = lib.readNames(root).find(n => n.id === e.id);
  const fm = { ...saved._fm, compiled_as_of: as_of, compiled_at: stamp(), compiled_by: author, compilation: JSON.stringify(brief) };
  atomic(join(root, saved._path), entityText(saved, fm, saved._body));
  refreshEntityPages(root);
  return { path: saved._path, note: lib.commit(root, lib.ENTITIES_PATHS, `compile entity: ${saved.name} by ${author}`).note };
}

export function entityBrief(root, name, options = {}) {
  const registry = options.registry || lib.readNames(root), facts = options.facts || entityFacts(root, name, { ...options, registry });
  if (!facts.stale && facts.previous) validateBrief(facts, facts.previous);
  const e = resolveEntity(registry, name), compilation = facts.stale ? null : facts.previous;
  const evidence = lib.hideForkCopies(options.context ? facts.evidence.filter(m => m.context === options.context) : facts.evidence).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
  const timeline = options.context ? lib.memoryTimeline(evidence) : facts.timeline;
  let markdown = renderBrief({ ...facts, timeline }, compilation, evidence, registry, options.context);
  if (facts.file_notes && !options.context) markdown += `\n## Saved Markdown\n\nThis text was preserved from the editable file. It is not automatically treated as context evidence.\n\n${facts.file_notes.markdown}`;
  if (options.absoluteLinks) markdown = markdown.replace(/\]\((\.\.\/contexts\/[^)]+|[a-z0-9-]+\.md)\)/g,
    (_, path) => `](${dest(resolve(root, "brain", "entities", decodeURI(path)))})`);
  return { ...facts, compilation, evidence, timeline, markdown, path: e._path || null };
}

function renderBrief(facts, brief, evidence, registry, scope) {
  if (scope && !facts.contexts.some(c => c.context === scope)) throw new Error(`No evidence about ${facts.entity.name} in ${scope}`);
  const all = new Map(facts.contexts.flatMap(c => c.memories).map(m => [m.id, m]));
  const citation = id => { const m = all.get(id); return link(`${m.context}, recorded ${lib.localDateTime(m.at).slice(0, 10)}, ${id}`, `../contexts/${m.context}/memories.jsonl`); };
  const claims = a => a.map(c => `- ${c.interpretation ? "Interpretation: " : ""}${md(c.text)} ${c.memories.map(citation).join(" ")}`).join("\n");
  const source = s => /^https?:\/\//.test(s.ref) ? link(s.kind, s.ref) : s.kind === "gmail" ? link("Gmail", `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(s.ref)}`) : s.kind === "codex" ? link("Conversation", `codex://threads/${encodeURIComponent(s.ref)}`) : `\`${md(s.kind + ":" + s.ref)}\``;
  const out = [`\n# ${md(facts.entity.name)}`, `\n${md(facts.entity.kind)}${facts.entity.subtype ? ` (${md(facts.entity.subtype)})` : ""}${facts.entity.aliases.length ? " · Also known as: " + facts.entity.aliases.map(md).join(", ") : ""}`,
    `\nLatest memory recorded: ${lib.localDateTime(facts.latest_evidence_at) || "none"}. Brief compiled: ${lib.localDateTime(facts.compiled_at) || "never"}. ${facts.stale ? "Summary needs updating; current evidence is shown below." : "Recorded knowledge only; linked tools have not been checked live."}`];
  if (facts.entity.status === "archived") out.push("\nArchived identity. Historical evidence and links remain available.");
  if (facts.entity.emails.length) out.push(`\nContact: ${facts.entity.emails.map(md).join(", ")}`);
  if (facts.entity.references.length) out.push(`\nExternal records: ${facts.entity.references.map(source).join(" · ")}`);
  if (facts.entity.identity_sources.length) out.push(`\nIdentity evidence: ${facts.entity.identity_sources.map(source).join(" · ")}`);
  if (facts.entity.not_same.length) out.push(`\nKept separate from: ${facts.entity.not_same.map(md).join(", ")}.`);
  if (!scope) out.push("\n## Overview", brief?.overview.length ? "\n" + claims(brief.overview) : "\nNo current synthesis yet. The context evidence below preserves what was recorded and where it applies.");
  out.push("\n## By context");
  const contexts = facts.contexts.filter(c => !scope || c.context === scope);
  if (!contexts.length) out.push("\nNo context evidence recorded yet.");
  for (const c of contexts) {
    const compiled = brief?.contexts.find(x => x.context === c.context);
    out.push(`\n### ${link(c.title, `../contexts/${c.context}/context.md`)}${c.status === "archived" ? " (archived)" : ""}`);
    out.push(`\nContext refreshed: ${lib.localDateTime(c.refreshed_at) || "never"}.`);
    if (compiled) {
      out.push("\n" + (claims(compiled.summary) || "No supported current state."));
      if (compiled.open_threads.length) out.push("\n**Open threads**\n\n" + claims(compiled.open_threads));
    } else {
      const recent = c.memories.filter(m => !m.retracts).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 3);
      out.push("\nLatest recorded evidence (not a verified current status):\n\n" + (recent.map(m => `- ${md(m.content)} (${md(lib.memoryTimeText(m))}) ${citation(m.id)}`).join("\n") || "No remaining current claims."));
    }
    for (const m of c.memories.filter(m => m.retracts)) out.push(`\nWithdrawal: ${md(m.content)} ${citation(m.id)}`);
  }
  out.push("\n## Relationships");
  const relationships = brief?.relationships.filter(c => !scope || c.memories.every(id => all.get(id).context === scope)) || [];
  out.push(relationships.length ? "\n" + claims(relationships) : "\nNo compiled relationship claims. Shared mentions alone do not establish a relationship.");
  const selected = scope ? facts.evidence.filter(m => m.context === scope).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) : evidence;
  const mentions = lib.createMentionMatcher(registry);
  const peers = new Set(scope ? selected.flatMap(mentions).filter(n => n !== facts.entity.name) : facts.related_identities.map(n => n.name));
  if (peers.size) out.push("\nAlso mentioned with: " + [...peers].map(n => { const e = registry.find(x => x.name === n); return e?._path ? link(n, basename(e._path)) : md(n); }).join(", ") + ".");
  const timeline = facts.timeline;
  out.push("\n## Timeline", "\nNotes in recording order, newest first. Relevant event dates are kept in the note text; the timestamp labels when the memory was recorded.");
  if (facts.timeline_total > timeline.length) out.push(`\nShowing the latest ${timeline.length} of ${facts.timeline_total} current context records. Follow the full memory histories below for earlier evidence.`);
  for (const m of timeline) {
    out.push(`\n- ${md(lib.memoryTimeText(m))}: ${md(m.content)} ${citation(m.id)}`);
  }
  if (!timeline.length) out.push("\nNo effective memories in this view.");
  out.push("\n## Further information");
  for (const c of contexts) out.push(`\n- ${link(c.title, `../contexts/${c.context}/context.md`)} · ${link("Full memory history", `../contexts/${c.context}/memories.jsonl`)}`);
  const sources = new Map(selected.flatMap(m => m.source.map(s => [JSON.stringify(s), s])));
  for (const s of sources.values()) out.push(`\n- ${source(s)}`);
  out.push("\nThis brief is compiled from context memories. You can edit this file; keep its frontmatter format. To update the shared factual record, also capture corrections in the originating context.\n");
  return out.join("\n");
}

export function staleEntities(root) {
  const registry = lib.readNames(root), contexts = lib.listContexts(root), index = entityEvidenceIndex(registry, contexts);
  return registry.filter(e => e.status !== "archived").map(e => entityFacts(root, e.id, { registry, contexts, index })).filter(f => f.stale).map(f => ({ id: f.entity.id, name: f.entity.name, latest_evidence_at: f.latest_evidence_at,
    latest_change_at: [newest(f.contexts.flatMap(c => c.memories)), registry.find(e => e.id === f.entity.id)._fm?.updated_at].filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0],
    compiled_at: f.compiled_at, memories: f.evidence.length }));
}

export function refreshEntityPages(root) {
  return withEntityLock(root, () => refreshPages(root));
}
function refreshPages(root) {
  if (hasMemoryIndex()) {
    const registry = lib.readNames(root);
    return refreshIndexedPages(root, registry, (e, facts, changed) => {
      const view = entityBrief(root, e.id, { registry, facts });
      const fm = { ...e._fm, evidence_as_of: view.as_of, latest_evidence_at: view.latest_evidence_at, stale: view.stale };
      const body = editedBody(e) ? e._body : view.markdown;
      if (!editedBody(e)) fm.rendered_body_hash = hash(body);
      const text = entityText(e, fm, body);
      // Detect editor saves even though only plugin writers honor the lock.
      if (readFileSync(join(root, e._path), 'utf8') !== e._text) throw new Error(`Entity file changed during refresh: ${e._path}. Read it again; edits were preserved.`);
      if (atomic(join(root, e._path), text)) changed.push(e._path);
      return text;
    });
  }
  const registry = lib.readNames(root), contexts = lib.listContexts(root), index = entityEvidenceIndex(registry, contexts), changed = [];
  for (const e of registry.filter(e => e._path)) {
    const view = entityBrief(root, e.id, { registry, contexts, index });
    const fm = { ...e._fm, evidence_as_of: view.as_of, latest_evidence_at: view.latest_evidence_at, stale: view.stale };
    const body = editedBody(e) ? e._body : view.markdown;
    if (!editedBody(e)) fm.rendered_body_hash = hash(body);
    if (atomic(join(root, e._path), entityText(e, fm, body))) changed.push(e._path);
  }
  return changed;
}

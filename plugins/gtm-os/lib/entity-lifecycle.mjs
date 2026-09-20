// Explicit identity operations. Recovery snapshots live with the entity files;
// context memories are never rewritten by an identity operation.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import * as lib from "./brain.mjs";
import { withEntityLock, entityType, identity, idOK, entityText, parseEntityText, editedBody, applyEntityChange, readEntityChange } from "./entities.mjs";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const object = v => v && typeof v === "object" && !Array.isArray(v);
const listFields = ["aliases", "emails", "not_same", "references", "identity_sources"];
const listKey = field => field === "not_same" ? "not" : field;
const unique = values => [...new Map(values.map(v => [typeof v === "string" ? v.toLowerCase() : JSON.stringify(v), v])).values()];
const text = (root, e) => readFileSync(join(root, e._path), "utf8");
function author(root, by) {
  const who = lib.teamHandle(root, by);
  if (!who) throw new Error("by must identify a team member");
  return who;
}
function exact(registry, id) {
  if (!idOK(id)) throw new Error("Use a current stable entity ID, obtained with who_is or query entities");
  const e = registry.find(e => e.id === id);
  if (!e) throw new Error("Entity ID is unknown or retired; resolve it before changing an identity");
  if (!e._path || e._fm?.format !== lib.ENTITY_FORMAT) throw new Error("Upgrade the legacy registry before using entity lifecycle operations");
  return e;
}
function collision(registry, e) {
  for (const name of [e.name, ...e.aliases]) {
    const others = registry.filter(n => n.id !== e.id && lib.exactName([n], name));
    if (others.length) throw new Error(`Identity collision for "${name}" with ${others.map(n => n.id).join(", ")}; review merge_entities instead`);
  }
}
function validateList(field, values) {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  if (["references", "identity_sources"].includes(field)) {
    if (values.some(v => !object(v) || Object.keys(v).some(k => !["kind", "ref"].includes(k)) || ![v.kind, v.ref].every(s => typeof s === "string" && s.trim() && !/[\r\n]/.test(s)))) throw new Error(`${field} needs kind/ref records`);
  } else if (values.some(v => typeof v !== "string" || !v.trim() || /[\r\n]/.test(v))) throw new Error(`${field} needs non-empty single-line strings`);
}
function finish(root, record, result) {
  const change_id = applyEntityChange(root, record);
  if (!change_id) return { ...result, changed: false };
  let commit;
  try { commit = lib.commit(root, lib.ENTITIES_PATHS, `entity ${record.operation}: ${record.entity || record.target} by ${record.by}`); }
  catch (error) {
    return { ...result, changed: true, change_id, note: "Identity saved to disk; not committed. Review the repair proposal, then save.", warning: error.message, ...(error.repair ? { repair: error.repair } : {}) };
  }
  return { ...result, changed: true, change_id, note: commit.note };
}
const change = (root, e, fm, body = e._body) => ({ path: e._path, before: e._text, after: entityText(e, fm, body) });
const updated = (e, fields) => ({ ...e._fm, ...fields, updated_at: new Date().toISOString() });

export function updateEntity(root, { entity, by, set = {}, add = {}, remove = {} }) {
  return withEntityLock(root, () => {
    const who = author(root, by), registry = lib.readNames(root), e = exact(registry, entity), next = structuredClone(e);
    for (const [mode, fields] of Object.entries({ set, add, remove })) {
      if (!object(fields) || Object.keys(fields).some(k => !(mode === "set" ? ["name", "kind", "subtype", ...listFields] : listFields).includes(k))) throw new Error(`Unsupported ${mode} field; IDs, status, compilation and merge history are managed by their own operations`);
      for (const [field, value] of Object.entries(fields)) if (listFields.includes(field)) validateList(field, value);
    }
    if (set.name !== undefined) {
      if (typeof set.name !== "string" || !set.name.trim() || /[\r\n]/.test(set.name)) throw new Error("name must be a non-empty single line");
      next.name = set.name.trim();
    }
    if (Object.hasOwn(set, "kind") && typeof set.kind !== "string") throw new Error("kind must be person, organization or product");
    Object.assign(next, entityType(set.kind ?? e.kind, Object.hasOwn(set, "subtype") ? set.subtype : set.kind && set.kind !== e.kind ? null : e.subtype ?? null));
    for (const field of listFields) {
      const key = listKey(field), values = [...(set[field] === undefined ? next[key] || [] : set[field])];
      if (field === "aliases" && next.name !== e.name) values.push(e.name);
      next[key] = unique([...values, ...(add[field] || [])]).filter(v => !(remove[field] || []).some(r => typeof v === "string" ? v.toLowerCase() === r.toLowerCase() : isDeepStrictEqual(v, r)));
      if (field === "emails") next[key] = next[key].map(v => v.trim().toLowerCase());
      else if (!["references", "identity_sources"].includes(field)) next[key] = next[key].map(v => v.trim());
    }
    next.aliases = next.aliases.filter(a => a.toLowerCase() !== next.name.toLowerCase());
    if (next.not.some(ref => lib.exactName([next], ref))) throw new Error("An entity cannot be kept separate from itself");
    collision(registry, { ...next, aliases: next.aliases.filter(a => !e.aliases.includes(a)) });
    if (isDeepStrictEqual(identity(e), identity(next))) return { status: "unchanged", entity: identity(e), changed: false };
    return finish(root, { operation: "update", entity, by: who, changes: [change(root, e, updated(e, identity(next)))] }, { status: "updated", entity: identity(next) });
  });
}

export function archiveEntity(root, { entity, by, undo = false }) {
  return withEntityLock(root, () => {
    if (typeof undo !== "boolean") throw new Error("undo must be a boolean");
    const who = author(root, by), e = exact(lib.readNames(root), entity), status = undo ? "active" : "archived";
    if ((e.status || "active") === status) return { status, entity, changed: false };
    return finish(root, { operation: undo ? "restore" : "archive", entity, by: who, changes: [change(root, e, updated(e, { status }))] }, { status, entity });
  });
}

function mergePlan(root, source, target, resolution) {
  const registry = lib.readNames(root), from = exact(registry, source), into = exact(registry, target);
  if (source === target) throw new Error("Choose two different current entity IDs");
  if ([from, into].some(e => e.status === "archived")) throw new Error("Restore archived identities before merging them");
  if (!object(resolution) || Object.keys(resolution).some(k => !["kind", "subtype", "allow_distinct", "references"].includes(k))) throw new Error("Invalid merge resolution");
  if (resolution.allow_distinct !== undefined && typeof resolution.allow_distinct !== "boolean") throw new Error("allow_distinct must be a boolean");
  if (Object.hasOwn(resolution, "kind") && typeof resolution.kind !== "string") throw new Error("kind must be person, organization or product");
  const conflicts = [], unresolved = [];
  for (const field of ["kind", "subtype"]) if ((from[field] ?? null) !== (into[field] ?? null)) {
    conflicts.push({ field, source: from[field] ?? null, target: into[field] ?? null });
    if (!Object.hasOwn(resolution, field)) unresolved.push(field);
  }
  const distinct = (from.not || []).some(n => lib.exactName([into], n)) || (into.not || []).some(n => lib.exactName([from], n));
  if (distinct) { conflicts.push({ field: "not_same", source, target }); if (resolution.allow_distinct !== true) unresolved.push("allow_distinct"); }
  const referenceConflicts = unique(from.references.filter(a => into.references.some(b => a.kind === b.kind && a.ref !== b.ref)).map(a => a.kind));
  if (referenceConflicts.length) {
    conflicts.push({ field: "references", kinds: referenceConflicts, source: from.references, target: into.references });
    if (!["combine", "source", "target"].includes(resolution.references)) unresolved.push("references");
  }
  if (resolution.references !== undefined && !["combine", "source", "target"].includes(resolution.references)) throw new Error("references resolution must be combine, source or target");
  const type = entityType(resolution.kind ?? into.kind, Object.hasOwn(resolution, "subtype") ? resolution.subtype : into.subtype ?? null);
  const merged = { ...structuredClone(into), ...type,
    aliases: unique([...into.aliases, from.name, ...from.aliases]).filter(n => n.toLowerCase() !== into.name.toLowerCase()),
    emails: unique([...into.emails, ...from.emails]),
    references: unique([
      ...into.references.filter(r => resolution.references !== "source" || !referenceConflicts.includes(r.kind)),
      ...from.references.filter(r => resolution.references !== "target" || !referenceConflicts.includes(r.kind)),
    ]),
    identity_sources: unique([...into.identity_sources, ...from.identity_sources]),
    previous_ids: unique([...into.previous_ids, source, ...from.previous_ids]),
    merge_ids: unique([...(into.merge_ids || []), ...(from.merge_ids || [])]),
    not: unique([...(into.not || []), ...(from.not || [])]).filter(n => ![from, into].some(e => lib.exactName([e], n))),
  };
  collision(registry.filter(e => e.id !== source), merged);
  const contexts = lib.listContexts(root), impact = [from, into].map(e => {
    const facts = lib.entityFacts(root, e.id, { registry, contexts });
    return { id: e.id, name: e.name, path: e._path, contexts: facts.contexts.map(c => ({ context: c.context, memories: c.memories.length })), memories: facts.evidence.map(m => m.id) };
  });
  const as_of = "ecv_" + hash({ source, target, resolution, registry: registry.map(identity), files: [text(root, from), text(root, into)], memories: contexts.map(c => c.memories) });
  return { from, into, merged, preview: { status: "preview", source, target, as_of, conflicts, unresolved, impact, proposed: identity(merged), notes: ["Memories keep their recorded IDs and content. Retired IDs resolve to the survivor.", "The source file becomes a redirect and retains handwritten Markdown. Undo restores pre-merge identities; notes captured under the surviving ID stay with it."] } };
}
export function mergeEntities(root, { source, target, by, as_of, resolution = {} }) {
  return withEntityLock(root, () => {
    const { from, into, merged, preview } = mergePlan(root, source, target, resolution);
    if (!as_of) return preview;
    const who = author(root, by);
    if (as_of !== preview.as_of) throw new Error("Merge preview is stale; preview merge_entities again before applying");
    if (preview.unresolved.length) throw new Error(`Resolve merge conflicts and preview again: ${preview.unresolved.join(", ")}`);
    const id = `ec_${randomUUID()}`;
    merged.merge_ids.push(id);
    const fm = updated(into, identity(merged));
    const redirect = `\n# Merged identity\n\nMerged into [${into.id}](${into._path.split("/").at(-1)}). Recovery record: ${id}.\n` + (editedBody(from) ? from._body : "");
    return finish(root, { id, operation: "merge", source, target, by: who, resolution, impact: preview.impact,
      changes: [change(root, into, fm), change(root, from, updated(from, { redirect: target, merged_by: id }), redirect)] },
    { status: "merged", source, target, merge_id: id, entity: identity(merged) });
  });
}

// Compilers can refresh generated text after a merge. Identity changes, unknown
// metadata and handwritten text must still match before automatic reversal is safe.
function authoredState(text, path) {
  const e = parseEntityText(text, path), fm = { ...e.fm };
  for (const field of ["compiled_at", "compiled_by", "compiled_as_of", "compilation", "rendered_body_hash", "evidence_as_of", "latest_evidence_at", "stale", "updated_at"]) delete fm[field];
  return { fm, header: entityText({ _header: e.header, _fm: e.fm }, fm, ""), markdown: editedBody({ _fm: e.fm, _body: e.body }) ? e.body : null };
}
export function undoEntityMerge(root, { merge_id, by, as_of }) {
  return withEntityLock(root, () => {
    const rec = readEntityChange(root, merge_id);
    if (rec.operation !== "merge") throw new Error("Choose a merge operation to undo");
    const registry = lib.readNames(root), survivor = exact(registry, rec.target), contexts = lib.listContexts(root);
    const current = rec.changes.map(c => ({ ...c, current: readFileSync(join(root, c.path), "utf8") }));
    const conflicts = current.filter(c => !isDeepStrictEqual(authoredState(c.current, c.path), authoredState(c.after, c.path))).map(c => ({ path: c.path, problem: "Identity or handwritten metadata changed after this merge. Undo later merges first, or review those edits before splitting." }));
    const beforeMemories = new Set(rec.impact.flatMap(i => i.memories));
    const later = contexts.flatMap(c => lib.effectiveMemories(c.memories)).filter(m => m.entities?.includes(survivor.id) && !beforeMemories.has(m.id)).map(m => ({ id: m.id, context: m.context, content: m.content }));
    const revision = "ecv_" + hash({ merge_id, current, registry: registry.map(identity), memories: contexts.map(c => c.memories) });
    const preview = { status: "preview", merge_id, source: rec.source, target: rec.target, as_of: revision, conflicts, memories_kept_with_survivor: later,
      notes: ["Restores both pre-merge identities, IDs and file paths. Existing memories are not rewritten.", "Notes recorded using the surviving ID remain there. Correct their context memories explicitly if they belong to the restored identity."] };
    if (!as_of) return preview;
    const who = author(root, by);
    if (as_of !== revision) throw new Error("Undo preview is stale; preview undo_entity_merge again");
    if (conflicts.length) throw new Error("Cannot undo without reviewing changes made after the merge: " + conflicts.map(c => c.path).join(", "));
    const changes = current.map(c => {
      const before = parseEntityText(c.before, c.path);
      return { path: c.path, before: c.current, after: entityText({ _fm: before.fm, _header: before.header }, { ...before.fm, updated_at: new Date().toISOString() }, before.body) };
    });
    return finish(root, { operation: "undo_merge", merge_id, source: rec.source, target: rec.target, by: who, changes }, { status: "unmerged", source: rec.source, target: rec.target, memories_kept_with_survivor: later });
  });
}

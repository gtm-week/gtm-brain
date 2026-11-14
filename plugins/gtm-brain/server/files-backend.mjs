// Allethic's count/list/act contract over the existing brain format.
// Contexts, memories and entities use their existing library readers and writers.
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import * as lib from "../lib/brain.mjs";
import { hasMemoryIndex, withMemoryIndex } from "../lib/memory-index.mjs";
import { brainRelationsToUs } from "../lib/relation-to-us.mjs";

const brainRoot = ctx => {
  const root = ctx?.brain;
  if (typeof root !== "string" || !isAbsolute(root) || !existsSync(join(root, "brain", "admin.md"))) throw new Error("brain must be the absolute path of a GTM Brain workspace with workplace info");
  return root;
};

function rows(root, object) {
  if (object === "entities") {
    // the same relation to us and SCHEMA.md fields the index filters on, for a host without node:sqlite
    const relation = brainRelationsToUs(root, lib), fields = new Map(lib.readNames(root).map(e => { let f = []; try { f = JSON.parse(e._fm?.compiled_fields || "[]"); } catch {} return [e.id, Object.fromEntries((Array.isArray(f) ? f : []).filter(x => x?.field).map(x => [x.field, x.text]))]; }));
    return lib.entityRecords(root).map(e => ({ ...fields.get(e.id), ...e, relation_to_us: relation.get(e.id) || null, fields: fields.get(e.id) || {} }));
  }
  const contexts = lib.listContexts(root);
  if (object === "memories") {
    const registry = lib.readNames(root);
    const mention = lib.createMentionMatcher(registry);
    return contexts.flatMap(c => lib.effectiveMemories(c.memories).map(m => { const found = new Set(mention(m)); return { ...m, entities: registry.filter(e => found.has(e.name)).map(e => e.id) }; }));
  }
  if (object === "contexts") return contexts.map(c => ({
    slug: c.slug, title: c.title, status: c.status, rule: c.rule,
    summary: c.summary, now: c.now, people: c.people, tools: c.tools,
    forked_from: c.fm.forked_from || null, last_active: c.lastMemory,
    compiled_at: c.compiledAt, memories: lib.effectiveMemories(c.memories).length, stale: c.stale,
  }));
  throw new Error(`unknown object ${object}`);
}

// Scalars match exactly; a list filter means any of these values. List-valued fields
// match membership, so people/tags filters work as advertised for memories.
const matches = (row, filters) => Object.entries(filters).every(([key, expected]) => {
  const actual = Array.isArray(row[key]) ? row[key] : [row[key]];
  const choices = Array.isArray(expected) ? expected : [expected];
  return actual.some(v => choices.some(choice => isDeepStrictEqual(v, choice)));
});

function searchTerms(root, query) {
  const names = lib.readNames(root);
  const terms = new Set([query.toLowerCase()]);
  for (const term of [query, ...query.split(/\s+/)]) {
    const canonical = lib.canonicalName(names, term);
    if (!canonical) continue;
    const entry = names.find(n => n.name === canonical);
    terms.add(canonical.toLowerCase());
    for (const alias of entry?.aliases || []) terms.add(alias.toLowerCase());
  }
  return [...terms];
}

// The interactions the ontology describes, run by the scripts that always ran them: the model sees
// the same names, arguments and results as before; what changed is where they are described.
const list = a => (Array.isArray(a) ? a : String(a || "").split(",")).map(s => String(s).trim()).filter(Boolean);
const SCRIPTS = {
  ...Object.fromEntries(["update_entity", "merge_entities", "archive_entity", "undo_entity_merge"].map(name => [name, args => ["gtm-brain-entities/lifecycle.mjs", [name, JSON.stringify(args)]]])),
  compile_apply: ({ context, by, as_of, summary, now, reviewed_cover }) => ["gtm-brain-compile/compile.mjs", ["--checked", "--apply", context, "--by", by, "--as-of", as_of, "--summary", summary, "--now", now, ...(reviewed_cover ? ["--reviewed-cover", reviewed_cover] : [])]],
  new_context: ({ slug, title, rule, project, distinct }) => ["gtm-brain-contexts/contexts.mjs", ["--new", slug, title, rule, ...(project ? ["--project", project] : []), ...(distinct ? ["--distinct", distinct] : [])]],
  fork_context: ({ from, slug, title, filter, project }) => ["gtm-brain-contexts/contexts.mjs", ["--fork", from, slug, title, ...(filter ? ["--filter", filter] : []), ...(project ? ["--project", project] : [])]],
  edit_context: ({ slug, title, rule }) => ["gtm-brain-contexts/contexts.mjs", ["--edit", slug, ...(title ? ["--title", title] : []), ...(rule ? ["--rule", rule] : [])]],
  archive_context: ({ slug, undo, project }) => ["gtm-brain-contexts/contexts.mjs", [undo ? "--unarchive" : "--archive", slug, ...(project ? ["--project", project] : [])]],
  compile_entity: ({ entity, by, as_of, brief }) => ["gtm-brain-entities/compile-entity.mjs", ["--apply", entity, "--by", by, "--as-of", as_of, "--brief", JSON.stringify(brief)]],
  add_name: ({ name, aliases, email, kind, subtype, not_same, references, sources }) => ["gtm-brain-entities/entities.mjs", ["--add", name, ...(list(aliases).length ? ["--alias", list(aliases).join(", ")] : []), ...(email ? ["--email", email] : []), ...(kind ? ["--kind", kind] : []), ...(subtype !== undefined ? ["--subtype", subtype || ""] : []), ...(list(not_same).length ? ["--not", list(not_same).join(", ")] : []), ...(references ? ["--references", JSON.stringify(references)] : []), ...(sources ? ["--sources", JSON.stringify(sources)] : [])]],
};

// a lookup by id or name keeps the full row (contexts, memories); a filter on anything else is indexed
const IDENTITY_ONLY = new Set(["id", "name", "status", "aliases", "emails"]);
// keys only the full entity rows carry (they need each entity's evidence); any other filter is indexed
const RECORD_ONLY = new Set(["contexts", "memories", "stale", "compiled_at", "latest_evidence_at", "created_at", "updated_at", "references", "identity_sources", "not_same", "merge_ids", "previous_ids", "path"]);
export function createFilesBackend({ run, memoryRead }) {
  return {
    count(object, ctx) {
      if (object === "memories" && hasMemoryIndex()) {
        const root = brainRoot(ctx);
        return memoryRead ? memoryRead(root, "count") : withMemoryIndex(root, index => index.count());
      }
      const found = rows(brainRoot(ctx), object);
      return (object === "memories" ? lib.hideForkCopies(found) : object === "entities" ? found.filter(e => e.status !== "archived") : found).length;
    },
    list(object, { filters = {}, search = "", limit = 50 }, ctx) {
      const root = brainRoot(ctx);
      if (object === "memories" && hasMemoryIndex()) return memoryRead ? memoryRead(root, "query", { filters, search, limit }) : withMemoryIndex(root, index => index.query({ filters, search, limit }));
      // entity filters (kind, subtype, relation_to_us, a SCHEMA.md field such as role) are answered by the index, no page read
      if (object === "entities" && hasMemoryIndex() && !search.trim() && Object.keys(filters).some(k => !IDENTITY_ONLY.has(k)) && Object.keys(filters).every(k => !RECORD_ONLY.has(k))) return memoryRead ? memoryRead(root, "entities", { filters, limit }) : withMemoryIndex(root, index => index.entities({ filters, limit }));
      filters = { ...filters };
      // Old stable IDs still name the surviving identity after a confirmed merge.
      const idField = object === "entities" ? "id" : object === "memories" ? "entities" : null;
      if (idField && Object.hasOwn(filters, idField)) {
        const registry = lib.readNames(root), canonical = id => lib.resolveEntity(registry, id)?.id || id;
        filters[idField] = Array.isArray(filters[idField]) ? filters[idField].map(canonical) : canonical(filters[idField]);
      }
      if (object === "entities" && !Object.hasOwn(filters, "id") && !Object.hasOwn(filters, "status")) filters.status = "active";
      let found = rows(root, object).filter(row => matches(row, filters));
      // Preserve the requested context. Across contexts, use the same fork handling as recall.
      if (object === "memories" && !Object.hasOwn(filters, "context")) found = lib.hideForkCopies(found);
      if (search.trim()) {
        const terms = searchTerms(root, search.trim());
        found = found.filter(row => { const hay = JSON.stringify(row).toLowerCase(); return terms.some(term => hay.includes(term)); });
      }
      return found.sort((a, b) => (Date.parse(b.at || b.last_active || b.updated_at) || 0) - (Date.parse(a.at || a.last_active || a.updated_at) || 0) || String(a.id || a.slug).localeCompare(String(b.id || b.slug))).slice(0, limit);
    },
    async act(name, { by, memories, project, ...one }, ctx) {
      const root = brainRoot(ctx);
      if (SCRIPTS[name]) {
        const [file, args] = SCRIPTS[name]({ by, project, ...one });
        const r = await run(root, file, args);
        const message = [r.out, r.err].filter(Boolean).join("\n").trim();
        return r.code === 0 ? { outcome: "ok", result: message } : { outcome: r.code === 2 ? "refused" : "error", message };
      }
      if (name !== "remember") return { outcome: "error", message: `no GTM Brain handler for ${name}` };
      if (memories && typeof one.content === "string" && one.content.trim()) return { outcome: "error", message: "one note (content) or a batch (memories), not both: nothing was kept. Put the note inside the batch." };
      const entries = memories || [one];
      if (!Array.isArray(entries) || !entries.length || !entries.every(e => e && typeof e.content === "string" && e.content.trim())) return { outcome: "error", message: "every memory needs content" };
      mkdirSync(join(root, "work"), { recursive: true });
      const batch = join(root, "work", `remember-${randomUUID()}.json`);
      try {
        writeFileSync(batch, JSON.stringify(entries));
        const result = await run(root, "gtm-brain-remember/remember.mjs", ["--by", by, "--batch", batch, ...(project ? ["--project", project] : [])]);
        const message = [result.out, result.err].filter(Boolean).join("\n").trim();
        if (result.code === 0) return { outcome: "ok", result: message };
        return { outcome: result.code === 2 ? "refused" : "error", message };
      } finally { try { unlinkSync(batch); } catch {} }
    },
  };
}

// Entity changes as a log (ALL-711): a rename, a merge, an undone merge and a kind change each append one event
// {at, by, entity, change, from, to} to brain/entities/.history/events.jsonl, so "what was this called before" is
// read from the brain, not from git. The file is append-only, one JSON record per line, and travels with the
// entity commit (ENTITIES_PATHS). GTM Brain 0.34 never reads it. Written only from lib/entities.mjs
// (writeEntityFiles, applyEntityChange) and lib/entity-lifecycle.mjs, inside the entity lock.
import { appendFileSync, mkdirSync, readFileSync, statSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { historyDir } from "./layout.mjs";

export const EVENTS_FILE = "brain/entities/.history/events.jsonl";   // layouts 1 to 3; the literal, since layout.mjs may still be loading (import cycle)
export const eventsFile = root => `${historyDir(root)}/events.jsonl`;
export const ENTITY_CHANGES = ["rename", "kind", "merge", "unmerge"];
const ID = /^e_[0-9a-f]{16}$/;
// company and team are the older spelling of an organization subtype: the same kind, never a change
const typeText = (kind, subtype) => ["company", "team"].includes(kind) ? `organization (${kind})` : `${kind || "person"}${subtype ? ` (${subtype})` : ""}`;

/* The events between two states of one entity: a new name, a new kind or subtype. */
export function identityEvents(before, after) {
  if (!before || !after || before.id !== after.id) return [];
  const out = [];
  if (before.name && after.name && before.name !== after.name) out.push({ entity: after.id, change: "rename", from: before.name, to: after.name });
  const a = typeText(before.kind, before.subtype ?? null), b = typeText(after.kind, after.subtype ?? null);
  if (a !== b) out.push({ entity: after.id, change: "kind", from: a, to: b });
  return out;
}

export function validateEntityEvent(e) {
  const errors = [];
  if (!e || typeof e !== "object" || Array.isArray(e)) return ["not an object"];
  if (!ID.test(e.entity || "")) errors.push("entity must be a stable entity ID");
  if (!ENTITY_CHANGES.includes(e.change)) errors.push(`change must be ${ENTITY_CHANGES.join(" | ")}`);
  if (typeof e.from !== "string" || typeof e.to !== "string") errors.push("from and to must be strings");
  if (!Number.isFinite(Date.parse(e.at || ""))) errors.push("at must be an ISO time");
  if (e.by !== null && typeof e.by !== "string") errors.push("by must be a handle or null");
  return errors;
}

/* Append events; the caller holds the entity lock and commits ENTITIES_PATHS. */
export function appendEntityEvents(root, events, { by = null, at = new Date().toISOString() } = {}) {
  const rows = events.map(e => ({ at, by, ...e })).filter(e => !validateEntityEvent(e).length);
  if (!rows.length) return [];
  const dir = join(root, historyDir(root));
  if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error("Entity history cannot use symbolic links");
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(root, eventsFile(root)), rows.map(r => JSON.stringify(r)).join("\n") + "\n");
  return rows;
}

let cache = null;
/* Every event, oldest first. A line that does not parse is skipped, never repaired here. */
export function readEntityEvents(root) {
  const path = join(root, eventsFile(root));
  let st; try { st = statSync(path); } catch { return []; }
  const key = `${path}|${st.size}|${st.mtimeMs}`;
  if (cache?.key === key) return cache.rows;
  const rows = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (!validateEntityEvent(r).length) rows.push(r); } catch {}
  }
  rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  cache = { key, rows };
  return rows;
}
/* A stamp of the log, for caches that derive from it (the memory index). */
export function entityEventsStamp(root) {
  try { const st = statSync(join(root, eventsFile(root))); return `${st.size}|${st.mtimeMs}`; } catch { return "none"; }
}
/* The events of one entity, its retired ids included (a merged entity's past stays with the survivor). */
export const eventsOf = (rows, entity) => rows.filter(e => e.entity === entity.id || (entity.previous_ids || []).includes(e.entity) || e.merged_id === entity.id);
/* One line, the same on the page and in query relations. */
export function entityEventText(e) {
  if (e.change === "rename") return `renamed from "${e.from}" to "${e.to}"${e.by ? ` by ${e.by}` : ""}`;
  if (e.change === "kind") return `kind changed from ${e.from} to ${e.to}${e.by ? ` by ${e.by}` : ""}`;
  if (e.change === "merge") return `"${e.from}" merged into "${e.to}"${e.by ? ` by ${e.by}` : ""}`;
  return `merge of "${e.from}" into "${e.to}" undone${e.by ? ` by ${e.by}` : ""}`;
}

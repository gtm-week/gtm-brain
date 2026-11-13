// SCHEMA.md: what a brain keeps about each person, organization and product, and how they relate
// (GTM week sync, 2026-11-13: "schema defines the shape of the universe, rules define how we act in it").
// The person edits it, by hand or through /gtm-brain-schema; setup writes it, a brain without one gets it at
// the chat start, an unedited one follows the shipped template, an edited one is never touched. A file that
// cannot be read is reported with a fix per line and left as it is. Field values are never stored here: they
// stay cited claims from memories (the entity brief's Fields), and relationships are memories with a
// `relation` block (lib/relations.mjs). The kinds are fixed in phase 1 (lib/entities.mjs ENTITY_KINDS).
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { readAdmin, commit } from "./brain.mjs";

export const SCHEMA = "SCHEMA.md";
export const SCHEMA_KINDS = ["person", "organization", "product"];
export const US = "us";
// customer_of is the customer block (lib/customers.mjs): always known, whatever the file says
export const BUILT_IN = { customer_of: { from: ["person", "organization"], to: [US], about: "Customer status, kept by the customer notes", required: false, formerly: [], built_in: true } };
const FIELD = /^[a-z][a-z0-9_]{0,39}$/, SUBTYPE = /^[a-z][a-z0-9-]{0,63}$/, TYPE = /^[a-z][a-z0-9_]{0,40}$/;

export class SchemaFormatError extends Error {
  constructor(problems) {
    super(problems.map(p => `line ${p.line}: ${p.problem}${p.proposal ? `; Proposed fix: ${p.proposal}` : ""}`).join(" · "));
    this.code = "SCHEMA_FORMAT"; this.problems = problems;
  }
}

const cells = line => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim().replace(/^`|`$/g, ""));
const snake = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1").slice(0, 40);
const yes = v => /^(yes|y|true|required)$/i.test(v), no = v => /^(no|n|false|optional|)$/i.test(v);
const kindList = v => String(v).split(/[,/]| or /).map(s => s.trim().toLowerCase()).filter(Boolean);
const digest = obj => createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 12);

/* Markdown to {kinds, relations, hash}. Up to ten problems are collected, each with its line and a fix, then
   thrown together as a SchemaFormatError. Prose and tables outside the known sections are left alone. */
export function parseSchema(text) {
  const lines = String(text || "").split("\n"), problems = [], add = (line, problem, proposal) => { if (problems.length < 10) problems.push({ line, problem, proposal }); };
  const kinds = { person: { fields: [] }, organization: { fields: [], subtypes: {} }, product: { fields: [] } }, relations = {}, subtypeFields = [];
  let h2 = null, h2Raw = "", h2Line = 0, h3 = null, h3Raw = "", h3Line = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], n = i + 1;
    const m2 = line.match(/^##\s+(.+?)\s*$/), m3 = line.match(/^###\s+(.+?)\s*$/);
    if (m2 && !line.startsWith("###")) { h2Raw = m2[1].trim(); h2 = h2Raw.toLowerCase(); h2Line = n; h3 = null; continue; }
    if (m3) { h3Raw = m3[1].trim(); h3 = h3Raw.toLowerCase(); h3Line = n; continue; }
    if (!line.trim().startsWith("|")) continue;
    // a table: header, separator, rows
    const header = cells(line).map(c => c.toLowerCase()), start = n;
    if (!/^\|?\s*:?-{3,}/.test((lines[i + 1] || "").trim())) { add(n + 1, "a table needs a separator line under its header", "add a line like | --- | --- | --- | under the header"); }
    const rows = [];
    for (i = i + 2; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push({ n: i + 1, c: cells(lines[i]) });
    i--;
    const where = h3 ? `${h2} / ${h3}` : h2;
    if (h2 === "relationships") {
      if (header[0] !== "type") { add(start, `the Relationships table starts with a Type column (it starts with "${header[0]}")`, "| Type | From | To | What it means | Required |"); continue; }
      const formerlyCol = header.findIndex(h => /was called|formerly/.test(h));
      for (const { n, c } of rows) {
        const [type, from, to, about = "", required = ""] = c;
        if (!type) continue;
        if (!TYPE.test(type)) { add(n, `relationship type "${type}" must be lowercase words joined by _`, `\`${snake(type)}\``); continue; }
        if (relations[type]) { add(n, `relationship type ${type} is listed twice`, "remove one of the two rows"); continue; }
        const f = kindList(from), t = kindList(to);
        const badFrom = f.filter(k => !SCHEMA_KINDS.includes(k)), badTo = t.filter(k => !SCHEMA_KINDS.includes(k) && k !== US);
        if (!f.length || badFrom.length) { add(n, `From of ${type} must be person, organization or product${badFrom.length ? ` (not ${badFrom.join(", ")})` : ""}`, "for example: person, organization"); continue; }
        if (!t.length || badTo.length) { add(n, `To of ${type} must be person, organization, product or us${badTo.length ? ` (not ${badTo.join(", ")})` : ""}`, "for example: organization, us"); continue; }
        if (!yes(required) && !no(required)) { add(n, `Required of ${type} must be yes or no (it says "${required}")`, "yes or no"); continue; }
        const formerly = formerlyCol >= 0 ? kindList(c[formerlyCol] || "").filter(x => TYPE.test(x)) : [];
        relations[type] = { from: f, to: t, about, required: yes(required), formerly };
      }
      continue;
    }
    if (!SCHEMA_KINDS.includes(h2)) {
      if (header[0] === "field") add(h2Line || start, `"## ${h2Raw || "(no heading)"}" is not a kind: the kinds are person, organization and product`, "make it an organization subtype (a row under ### Subtypes, its fields under ### <subtype>), or remove the section");
      continue;
    }
    if (h3 && h2 !== "organization") { add(h3Line, `a subtype under ${h2} is not possible: only organizations have subtypes`, `move "${h3Raw}" under ## Organization, or remove the ### heading`); continue; }
    if (h2 === "organization" && h3 === "subtypes") {
      if (header[0] !== "subtype") { add(start, `the Subtypes table starts with a Subtype column`, "| Subtype | What it is |"); continue; }
      for (const { n, c } of rows) {
        const [name, about = ""] = c; if (!name) continue;
        if (!SUBTYPE.test(name)) { add(n, `subtype "${name}" must be lowercase words joined by -`, `\`${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}\``); continue; }
        if (kinds.organization.subtypes[name]) { add(n, `subtype ${name} is listed twice`, "remove one of the two rows"); continue; }
        kinds.organization.subtypes[name] = { about, fields: [] };
      }
      continue;
    }
    if (header[0] !== "field") { add(start, `a field table under ${where} starts with a Field column`, "| Field | What it means | Required |"); continue; }
    const fields = [];
    for (const { n, c } of rows) {
      const [name, about = "", required = ""] = c; if (!name) continue;
      if (!FIELD.test(name)) { add(n, `field "${name}" must be lowercase words joined by _`, `\`${snake(name)}\``); continue; }
      if (fields.some(f => f.name === name)) { add(n, `field ${name} is listed twice under ${where}`, "remove one of the two rows"); continue; }
      if (!yes(required) && !no(required)) { add(n, `Required of ${name} must be yes or no (it says "${required}")`, "yes or no"); continue; }
      fields.push({ name, about, required: yes(required) });
    }
    if (h3) subtypeFields.push({ line: h3Line, subtype: h3, fields });
    else kinds[h2].fields.push(...fields.filter(f => !kinds[h2].fields.some(x => x.name === f.name)));
  }
  for (const s of subtypeFields) {
    const sub = kinds.organization.subtypes[s.subtype];
    if (!sub) { add(s.line, `"### ${s.subtype}" has fields but is not in the Subtypes table`, `add | ${s.subtype} | <what it is> | to ### Subtypes`); continue; }
    sub.fields = s.fields.filter(f => !kinds.organization.fields.some(x => x.name === f.name));
  }
  if (problems.length) throw new SchemaFormatError(problems);
  for (const [type, def] of Object.entries(BUILT_IN)) relations[type] = { ...def, about: relations[type]?.about || def.about, built_in: true };
  const shape = { kinds, relations };
  return { ...shape, hash: digest(shape) };
}

/* The fields an entity of this kind (and organization subtype) should have. */
export function fieldsFor(schema, kind, subtype = null) {
  const k = schema?.kinds?.[kind]; if (!k) return [];
  const extra = kind === "organization" && subtype ? k.subtypes?.[subtype]?.fields || [] : [];
  return [...k.fields, ...extra];
}
/* The relationship types an entity of this kind should have a current one of. */
export const requiredRelations = (schema, kind) => Object.entries(schema?.relations || {}).filter(([, r]) => r.required && r.from.includes(kind)).map(([type, r]) => ({ type, ...r }));
/* One hash per kind and subtype: a schema edit re-fills only the briefs it concerns. */
export const kindHash = (schema, kind, subtype = null) => digest({ fields: fieldsFor(schema, kind, subtype), relations: requiredRelations(schema, kind).map(r => r.type) });

/* "partner" after a rename resolves to its current type through the Was called column. */
export function relationType(schema, type) {
  const rel = schema?.relations || {};
  if (rel[type]) return { type, ...rel[type] };
  const hit = Object.entries(rel).find(([, r]) => r.formerly?.includes(type));
  return hit ? { type: hit[0], ...hit[1] } : null;
}
/* At write time only: an old record of a type removed later stays valid in its file. */
export function checkRelation(schema, { type, fromKind, toKind }) {
  const r = relationType(schema, type);
  if (!r) throw new Error(`relationship type ${type} is not in SCHEMA.md (it lists ${Object.keys(schema?.relations || {}).join(", ") || "none"}); save it as a plain note and offer to add the type with /gtm-brain-schema`);
  if (r.built_in) throw new Error("customer status is recorded with remember.customer, not relation");
  if (!r.from.includes(fromKind)) throw new Error(`${r.type} goes from ${r.from.join(" or ")}, not ${fromKind}`);
  if (!r.to.includes(toKind)) throw new Error(`${r.type} goes to ${r.to.join(" or ")}, not ${toKind}`);
  return r;
}

let cache = null;
/* {schema} when the file parses, {error} when it does not, {missing} when there is none. */
export function readSchema(root) {
  const path = join(root, SCHEMA);
  let stat; try { stat = statSync(path); } catch { return { missing: true }; }
  const key = `${path}|${stat.mtimeMs}|${stat.size}`;
  if (cache?.key === key) return cache.value;
  let value;
  try { value = { schema: parseSchema(readFileSync(path, "utf8")) }; }
  catch (error) { value = error instanceof SchemaFormatError ? { error } : { error: new SchemaFormatError([{ line: 1, problem: error.message }]) }; }
  cache = { key, value };
  return value;
}

/* Write SCHEMA.md when it is missing, refresh it when it is a shipped version nobody edited. */
export function ensureSchema(root, templates) {
  if (process.env.GTM_BRAIN_RUN || !readAdmin(root)) return false;
  const path = join(root, SCHEMA), next = readFileSync(join(templates, SCHEMA), "utf8"), had = existsSync(path);
  if (had) {
    const current = readFileSync(path, "utf8");
    let older = []; try { const dir = join(templates, "legacy", "schema"); older = readdirSync(dir).filter(f => f.endsWith(".md")).map(f => readFileSync(join(dir, f), "utf8")); } catch {}
    if (current === next || !older.includes(current)) return false;
  }
  writeFileSync(path, next);
  commit(root, [SCHEMA], had ? "upgrade: SCHEMA.md, what the brain keeps" : "SCHEMA.md: what the brain keeps about people, organizations and products");
  return true;
}

/* The chat start's lines: a short digest of what to keep, or the repair text for a file that cannot be read. */
export function schemaLine(root) {
  const r = readSchema(root);
  if (r.missing) return "";
  if (r.error) return `SCHEMA.md cannot be read, and was left as it is: ${r.error.message}. Show the fix to the person and offer to apply it (/gtm-brain-schema). Until then relationship saves are refused and briefs show no Fields.`;
  const s = r.schema, f = list => list.map(x => `${x.name}${x.required ? "*" : ""}`).join(", ") || "none";
  const subs = Object.entries(s.kinds.organization.subtypes).map(([n, v]) => v.fields.length ? `${n} (+${f(v.fields)})` : n).join(", ");
  const rels = Object.entries(s.relations).map(([t, v]) => v.built_in ? `${t} (the customer block)` : `${t} ${v.from.join("|")}>${v.to.join("|")}${v.required ? "*" : ""}`).join(", ");
  return [`SCHEMA.md says what the brain keeps (the person's to edit; /gtm-brain-schema changes it), * = required:`,
    `  person: ${f(s.kinds.person.fields)}. organization: ${f(s.kinds.organization.fields)}${subs ? `; subtypes ${subs}` : ""}. product: ${f(s.kinds.product.fields)}.`,
    `  relationships: ${rels}. A field value goes plainly in the note's text; a listed relationship goes in remember's relation block (saving rules S1-S3).`].join("\n");
}

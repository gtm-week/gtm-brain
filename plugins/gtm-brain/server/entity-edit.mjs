// POST /entity-edit: the Entities tab's forms. A small set of named operations, each mapped to exactly one call of
// a script the MCP tools already run, never a file write of its own and never a tool chosen by the caller:
//
//   create           scripts/gtm-brain-entities/entities.mjs --add            a new entity by name and kind
//   update           scripts/gtm-brain-entities/lifecycle.mjs update_entity    name, other names, emails, kind
//   merge            scripts/gtm-brain-entities/lifecycle.mjs merge_entities   a preview without as_of, the merge with it
//   archive          scripts/gtm-brain-entities/lifecycle.mjs archive_entity
//   set_fields       scripts/gtm-brain-remember/remember.mjs                   one note stating the schema fields
//   add_relation     scripts/gtm-brain-remember/remember.mjs                   one note with a relation block, current
//   end_relation     scripts/gtm-brain-remember/remember.mjs                   one note with a relation block, ended
//   retract_relation scripts/gtm-brain-remember/remember.mjs                   one retraction per note behind the link
//   set_customer     scripts/gtm-brain-remember/remember.mjs                   one note with a customer block
//
// The guard is the document save's (server/dash.mjs saveDocument): this server's own Origin, the token made at each
// start and served only inside the page, JSON, a small body, and never from a scheduled or background run. The
// author is the person on this machine (lib.currentPerson) and each note carries a user source and a dashboard one.
import { execFile } from "node:child_process";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as lib from "../lib/brain.mjs";
import { readSchema, fieldsFor, relationType, checkRelation, brainKinds, US } from "../lib/schema.mjs";

export const ENTITY_EDIT_MAX = 16 * 1024;
export const ENTITY_EDIT_OPS = ["create", "update", "merge", "archive", "set_fields", "add_relation", "end_relation", "retract_relation", "set_customer"];
const CUSTOMER = ["customer", "prospect", "former_customer", "not_customer"];
const ID = /^e_[0-9a-f]{16}$/, DAY = /^\d{4}-\d\d-\d\d$/;
const script = rel => fileURLToPath(new URL(`../scripts/${rel}`, import.meta.url));
const words = s => String(s || "").replace(/_/g, " ");
const line = (v, max) => typeof v === "string" && v.trim() && !/[\r\n]/.test(v) && v.trim().length <= max ? v.trim() : null;
const names = (v, max = 20) => Array.isArray(v) && v.length <= max && v.every(x => line(x, 200)) ? v.map(x => x.trim()) : null;
class Refusal extends Error { constructor(code, note) { super(note); this.code = code; } }
const no = (code, note) => { throw new Refusal(code, note); };

export function createEntityEdit({ root, token, json, log = () => {} }) {
  const run = (file, argv) => new Promise(done => execFile(process.execPath, [script(file), root, ...argv], { cwd: root, env: { ...process.env, NODE_NO_WARNINGS: "1" }, encoding: "utf8", timeout: 120000, maxBuffer: 1 << 22 },
    (error, stdout, stderr) => done({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() })));
  // what a script said, without the lines written for the model
  const said = out => { const text = out.stderr || out.stdout || ""; try { const j = JSON.parse(text); if (j && typeof j.error === "string") return j.error; } catch {} return text.split("\n").filter(l => l.trim() && !/^(Reply to the person|kept$)/.test(l.trim())).slice(0, 3).join(" ").replace(/^not remembered:\s*/, "").slice(0, 600); };
  const entity = (registry, id, what = "entity") => { if (typeof id !== "string" || !ID.test(id)) no(400, `Name the ${what} by its id.`); const e = registry.find(x => x.id === id && !x._fm?.redirect); if (!e) no(404, `That ${what} is not in the brain any more. Refresh the page.`); return e; };
  const when = date => { if (date === undefined || date === null || date === "") return new Date().toISOString().slice(0, 19) + "Z"; if (typeof date !== "string" || !DAY.test(date) || !Number.isFinite(Date.parse(date + "T00:00:00Z"))) no(400, "A date is written as year-month-day, for example 2026-03-01."); if (Date.parse(date + "T00:00:00Z") > Date.now() + 864e5) no(422, "The date is in the future."); return date + "T00:00:00Z"; };
  const sources = by => [`user:${by}`, { kind: "dashboard", ref: "entity form" }];
  const lifecycle = async (operation, args) => {
    const out = await run("gtm-brain-entities/lifecycle.mjs", [operation, JSON.stringify(args)]);
    if (out.code) no(422, said(out) || "The change could not be saved.");
    try { return JSON.parse(out.stdout); } catch { return {}; }
  };
  // one remember call: the entries go in a batch file, as the MCP tool passes them
  const remember = async (by, entries) => {
    mkdirSync(join(root, "work"), { recursive: true });
    const batch = join(root, "work", `remember-${randomUUID()}.json`);
    try {
      writeFileSync(batch, JSON.stringify(entries));
      const out = await run("gtm-brain-remember/remember.mjs", ["--by", by, "--batch", batch]);
      const ids = [...out.stdout.matchAll(/\bremembered (m_[0-9a-f]{6,12}) in ([a-z0-9-]+)/g)].map(m => ({ id: m[1], context: m[2] }));
      if (out.code || ids.length < entries.length) no(422, said(out) || "The note could not be saved.");
      return ids;
    } finally { try { rmSync(batch, { force: true }); } catch {} }
  };
  // the two ends of a link: the entity itself or "us", checked against SCHEMA.md before anything is written
  function link(input, registry) {
    const { schema = null } = readSchema(root);
    if (typeof input.type !== "string" || !/^[a-z][a-z0-9_]{0,40}$/.test(input.type)) no(400, "Choose the kind of connection.");
    const known = schema ? relationType(schema, input.type) : null;
    if (!known || known.type === "customer_of" || known.type === "attended") no(422, input.type === "customer_of" ? "Customer status is set under Relation to us." : input.type === "attended" ? "Who attended comes from the meeting's own record." : `"${words(input.type)}" is not a kind of connection this brain records. The schema lists: ${Object.keys(schema?.relations || {}).filter(t => !["customer_of", "attended"].includes(t)).map(words).join(", ") || "none"}.`);
    const from = entity(registry, input.from, "first entity"), to = input.to === US ? null : entity(registry, input.to, "other entity");
    if (to && to.id === from.id) no(422, "A connection needs two different entities.");
    try { checkRelation(schema, { type: known.type, fromKind: from.kind, toKind: to ? to.kind : US }); }
    catch (e) { no(422, `That connection does not fit: ${words(String(e.message).split(";")[0])}.`); }
    return { type: known.type, from, to, toName: to ? to.name : (lib.readAdmin(root)?.company || "us") };
  }
  const note = v => v === undefined || v === null || v === "" ? null : line(v, 400) || no(400, "The note is one line of at most 400 characters.");

  const OPS = {
    async create(input) {
      const name = line(input.name, 200) || no(400, "A new entity needs a name."), kinds = brainKinds(root);
      if (!kinds.includes(input.kind)) no(422, `Choose a kind: ${kinds.map(words).join(", ")}.`);
      const registry = lib.readNames(root);
      if (lib.exactName(registry, name)) no(409, `"${name}" is already in the brain.`);
      const out = await run("gtm-brain-entities/entities.mjs", ["--add", name, "--kind", input.kind, ...(input.kind === "organization" ? ["--subtype", "company"] : [])]);
      if (out.code) no(422, said(out) || "The entity could not be added.");
      const made = lib.readNames(root).find(e => e.name === name) || lib.resolveEntity(lib.readNames(root), name);
      if (!made) no(500, "The entity was not added.");
      return { status: "created", entity: made.id, note: `Added ${made.name}.` };
    },
    async update(input, by) {
      const e = entity(lib.readNames(root), input.entity), set = {};
      if (input.name !== undefined) set.name = line(input.name, 200) || no(400, "The name is one line.");
      if (input.kind !== undefined) { if (!brainKinds(root).includes(input.kind)) no(422, `Choose a kind: ${brainKinds(root).map(words).join(", ")}.`); set.kind = input.kind; if (input.kind === "organization" && e.kind !== "organization") set.subtype = "company"; }
      if (input.aliases !== undefined) set.aliases = names(input.aliases) || no(400, "Other names are a list of names.");
      if (input.emails !== undefined) { set.emails = names(input.emails) || no(400, "Emails are a list of addresses."); const bad = set.emails.find(m => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)); if (bad) no(422, `"${bad}" does not look like an email address.`); }
      if (!Object.keys(set).length) no(400, "Nothing to change.");
      const r = await lifecycle("update_entity", { entity: e.id, by, set });
      return { status: r.changed ? "updated" : "unchanged", entity: e.id, note: r.changed ? `Saved ${r.entity?.name || e.name}.` : "Nothing changed." };
    },
    async merge(input, by) {
      const registry = lib.readNames(root), from = entity(registry, input.source, "entity to fold in"), into = entity(registry, input.target, "entity to keep");
      if (from.id === into.id) no(422, "Choose two different entities.");
      if (input.as_of !== undefined && (typeof input.as_of !== "string" || !/^ecv_[0-9a-f]+$/.test(input.as_of))) no(400, "Look at what the merge does first, then confirm it.");
      // the one that stays keeps its kind; anything else in dispute is settled in a chat, not by a click
      const args = { source: from.id, target: into.id, resolution: { kind: into.kind, subtype: into.subtype ?? null }, ...(input.as_of ? { by, as_of: input.as_of } : {}) };
      const r = await lifecycle("merge_entities", args);
      if (r.status === "preview") {
        const count = id => (r.impact || []).find(i => i.id === id)?.memories.length || 0;
        const blocked = (r.unresolved || []).filter(f => !["kind", "subtype"].includes(f));
        return { status: "preview", as_of: r.as_of, keep: { id: into.id, name: into.name, notes: count(into.id) }, fold: { id: from.id, name: from.name, notes: count(from.id) },
          names: r.proposed?.aliases || [], emails: r.proposed?.emails || [], kind_differs: (r.conflicts || []).some(c => c.field === "kind"),
          blocked: blocked.includes("allow_distinct") ? "These two were marked as different on purpose. To merge them anyway, say so in a chat." : blocked.length ? "Their records in a connected tool disagree. Sort that out in a chat first." : null };
      }
      return { status: "merged", entity: into.id, note: `${from.name} is now part of ${into.name}.` };
    },
    async archive(input, by) {
      const e = entity(lib.readNames(root), input.entity);
      const r = await lifecycle("archive_entity", { entity: e.id, by });
      return { status: "archived", entity: e.id, note: r.changed ? `Archived ${e.name}. Its notes stay.` : `${e.name} was already archived.` };
    },
    async set_fields(input, by) {
      const e = entity(lib.readNames(root), input.entity), { schema = null } = readSchema(root);
      const allowed = new Map(fieldsFor(schema, e.kind, e.subtype || null).map(f => [f.name, f]));
      if (!input.fields || typeof input.fields !== "object" || Array.isArray(input.fields) || !Object.keys(input.fields).length) no(400, "Nothing to change.");
      const parts = [];
      for (const [name, value] of Object.entries(input.fields)) {
        if (!allowed.has(name)) no(422, `"${words(name)}" is not a detail this brain records about a ${words(e.kind)}.`);
        parts.push(`${words(name).charAt(0).toUpperCase() + words(name).slice(1)}: ${line(value, 400) || no(400, `${words(name)} is one line of at most 400 characters.`)}`);
      }
      const ids = await remember(by, [{ content: `${e.name}. ${parts.join(". ")}.`.replace(/\.\.$/, "."), [e.kind === "organization" ? "companies" : "people"]: [e.name], sources: sources(by), tags: ["dashboard-edit"] }]);
      return { status: "noted", entity: e.id, memory: ids[0].id, note: "Saved as a note. The details show here after the next summary run." };
    },
    async add_relation(input, by) { return relate(input, by, "current"); },
    async end_relation(input, by) { return relate(input, by, "ended"); },
    async retract_relation(input, by) {
      const registry = lib.readNames(root), l = link(input, registry);
      const byRef = new Map(registry.flatMap(e => [e.id, ...(e.previous_ids || [])].map(id => [id, e.id]))), same = (ref, e) => e ? byRef.get(ref) === e.id : ref === US;
      const { schema = null } = readSchema(root);
      const behind = lib.hideForkCopies(lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories))).filter(m => m.relation && !m.retracts && ((schema && relationType(schema, m.relation.type)?.type) || m.relation.type) === l.type && same(m.relation.from, l.from) && same(m.relation.to, l.to));
      if (!behind.length) no(404, "No note says this any more. Refresh the page.");
      if (behind.length > 40) no(422, "Too many notes are behind this connection to withdraw in one go. Do it in a chat.");
      await remember(by, behind.map(m => ({ context: m.context, retracts: m.id, content: `Withdrawn: ${l.from.name} ${words(l.type)} ${l.toName} was recorded by mistake.`, sources: sources(by) })));
      return { status: "withdrawn", entity: l.from.id, note: `Withdrawn: ${l.from.name} ${words(l.type)} ${l.toName}.` };
    },
    async set_customer(input, by) {
      const e = entity(lib.readNames(root), input.entity);
      if (!["person", "organization"].includes(e.kind)) no(422, "Only a person or a company can be a customer.");
      if (!CUSTOMER.includes(input.status)) no(400, "Choose customer, prospect, former customer or not a customer.");
      const at = when(input.date), text = note(input.note) || `${e.name} is ${{ customer: "a customer", prospect: "a prospect", former_customer: "a former customer", not_customer: "not a customer" }[input.status]}.`;
      const ids = await remember(by, [{ content: text, [e.kind === "organization" ? "companies" : "people"]: [e.name], sources: sources(by), customer: { entity: e.name, status: input.status, basis: "user", observed_at: at } }]);
      if (!lib.readMemories(root, ids[0].context).find(m => m.id === ids[0].id)?.customer) no(422, "The note was saved, but not the customer status. Say it in a chat.");
      return { status: "noted", entity: e.id, memory: ids[0].id, note: `Saved: ${text}` };
    },
  };
  async function relate(input, by, status) {
    const l = link(input, lib.readNames(root)), at = when(input.date);
    const text = note(input.note) || (status === "ended" ? `${l.from.name}: ${words(l.type)} ${l.toName} ended.` : `${l.from.name} ${words(l.type)} ${l.toName}.`);
    const ids = await remember(by, [{ content: text, people: [l.from.name, ...(l.to ? [l.to.name] : [])], sources: sources(by),
      relation: { from: l.from.name, type: l.type, to: l.to ? l.to.name : US, status, basis: "user", observed_at: at } }]);
    const saved = lib.readMemories(root, ids[0].context).find(m => m.id === ids[0].id);
    if (!saved?.relation) no(422, "The note was saved, but not the connection. Say it in a chat.");
    return { status: status === "ended" ? "ended" : "added", entity: l.from.id, memory: ids[0].id, note: `Saved: ${text}` };
  }

  let busy = false;
  return async function entityEdit(req, res, host) {
    const refuse = (code, note, more = {}) => { req.resume(); return json(res, code, { ok: false, note, ...more }); };
    // the same guard as the document save, in the same order
    if (process.env.GTM_BRAIN_RUN) return refuse(403, "A scheduled or background run does not edit entities.");
    if (req.headers.origin !== `http://${host}`) return refuse(403, "Edit entities from this dashboard's own page.");
    if (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin") return refuse(403, "Edit entities from this dashboard's own page.");
    if (!/^application\/json\s*(;|$)/i.test(String(req.headers["content-type"] || ""))) return refuse(415, "JSON only.");
    const given = Buffer.from(String(req.headers["x-gtm-brain-token"] || "")), expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return refuse(403, "This page is from an earlier start of the dashboard. Reload it, then save again.");
    if (Number(req.headers["content-length"]) > ENTITY_EDIT_MAX) return refuse(413, "That is too much for one change.");
    const chunks = []; let size = 0, over = false;
    try { for await (const chunk of req) { size += chunk.length; if (size > ENTITY_EDIT_MAX) { over = true; break; } chunks.push(chunk); } } catch { return refuse(400, "The request did not arrive whole."); }
    if (over) return refuse(413, "That is too much for one change.");
    let input; try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return refuse(400, "JSON only."); }
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.op !== "string") return refuse(400, "Say what to change.");
    if (!ENTITY_EDIT_OPS.includes(input.op) || !Object.hasOwn(OPS, input.op)) return refuse(400, "This page cannot do that. Ask in a chat.");
    const by = lib.currentPerson(root);
    if (!by) return refuse(403, "The brain does not know who is at this computer yet. Start a chat in Codex once, then try again.");
    if (busy) return refuse(409, "Another change is still being saved. Try again in a moment.");
    busy = true;
    try {
      const result = await OPS[input.op](input, by);
      if (result.status !== "preview") log(`${input.op} from the page: ${result.note || result.status}`);
      return json(res, 200, { ok: true, ...result });
    } catch (e) {
      if (e instanceof Refusal) return json(res, e.code, { ok: false, note: e.message });
      return json(res, 500, { ok: false, note: "The change could not be saved." });
    } finally { busy = false; }
  };
}

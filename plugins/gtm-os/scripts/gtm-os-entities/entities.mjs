#!/usr/bin/env node
// The entity folder: identity metadata and compiled views. Source facts remain context memories.
//   node entities.mjs <root>                                           list, grouped by kind
//   node entities.mjs <root> --add "Krzysztof Pawlak" [--alias "Chris, Pawlak"] [--email "a@b.io"] [--kind person|organization|product] [--subtype company|team]
//   node entities.mjs <root> --who "Chris"                             resolve a mention
//   node entities.mjs <root> --add "Nestle Poland" --not "Nestle"       these two are different; never suggest merging them
import { existsSync } from "node:fs"; import { join } from "node:path";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
function main() {
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
if (!existsSync(join(root, "brain", "admin.md"))) { console.error("no brain here"); process.exit(1); }
if (args[0] === "--brain-legacy-note") process.exit(0);
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { opt[args[i].slice(2)] = args[i + 1]; i++; }
if (args[0] === "--customers") { console.log(JSON.stringify(lib.customerOverview(root), null, 2)); process.exit(0); }
const list = s => (s || "").split(",").map(x => x.trim()).filter(Boolean);
if (opt.add) { const registry = lib.readNames(root); const like = lib.canonicalName(registry, opt.add) ? [] : lib.similarNames(registry, opt.add).filter(x => x.name.toLowerCase() !== opt.add.trim().toLowerCase()); let e; try { e = lib.addName(root, opt.add, { aliases: list(opt.alias), emails: list(opt.email), kind: opt.kind || null, ...(Object.hasOwn(opt, "subtype") ? { subtype: opt.subtype || null } : {}), not: list(opt.not), references: JSON.parse(opt.references || "[]"), sources: JSON.parse(opt.sources || "[]") }); } catch (err) { console.error(err.message); process.exit(1); } console.log(`${e.name}${e.kind !== "person" ? ` (${e.kind}${e.subtype ? ": " + e.subtype : ""})` : ""}${e.aliases.length ? " | aliases: " + e.aliases.join(", ") : ""}${e.emails.length ? " | emails: " + e.emails.join(", ") : ""}`); if (like.length) console.log(`looks like ${like.map(x => x.name).join(", ")} already in the registry: if it is the same, confirm it and use merge_entities for two existing identities; nothing is merged on a guess.`); console.log(lib.commit(root, lib.ENTITIES_PATHS, `entities: ${e.name}`).note); lib.kickCompile(root); lib.rerender(root); process.exit(0); }
if (opt.who !== undefined || opt.candidates !== undefined) {
  const remote = opt.candidates !== undefined;
  const entries = remote ? JSON.parse(opt.candidates) : lib.readNames(root);
  if (!Array.isArray(entries) || (remote && (entries.length > 100 || entries.some(e => !e || typeof e.id !== "string" || !e.id.trim() || typeof e.name !== "string" || !e.name.trim() || !e.reference?.kind || !e.reference?.ref)))) throw new Error("Supply at most 100 source candidates with id, name and reference {kind, ref}");
  const search = lib.rankEntityCandidates(entries, opt.who, { limit: Number(opt.limit || 5) });
  const exact = remote ? null : lib.exactName(entries, opt.who);
  const resolved = exact ? entries.find(e => e.name === exact) : null;
  const describe = e => ({ id: e.id, name: e.name, kind: e.kind, subtype: e.subtype, status: e.status || "active", aliases: e.aliases || [], emails: e.emails || [], references: remote ? [e.reference] : e.references || [], ...(e._path ? { path: e._path } : {}) });
  console.log(JSON.stringify({ query: opt.who, scope: remote ? "supplied source candidates only" : "saved entity registry only", status: resolved ? "resolved" : search.total ? "candidates" : "no_match", ...(resolved ? { entity: describe(resolved) } : {}), candidates: search.matches.map(({ entry, score, reason }) => ({ ...describe(entry), score, reason })), total: search.total, truncated: search.truncated, guidance: "Scores rank spelling similarity, not identity confidence. Verify source records and distinguishing details. No result means unknown in this scope. Never merge, add an alias or overwrite identity from a search result alone. For a CRM lookup, follow references/entity-search.md in gtm-os-use-brain and inspect the connected tool's search schema. Stop after a primary search and one useful fallback both return empty. Reuse records and briefs already read in this turn; do not reread the same entity under its name and ID. Answer saved-fact questions directly from sufficient retained evidence." }, null, 2));
  process.exit(0);
}
/* list: team and contacts apart, emails shown, the handle not repeated as an alias, where each
   person appears in memories, and what is still missing (a surname, an email) */
const admin = lib.readAdmin(root) || {}; const team = new Map((admin.team || []).map(p => [p.name.toLowerCase(), p]));
const where = new Map(); const reg = lib.readNames(root);
for (const c of lib.listContexts(root)) for (const m of lib.effectiveMemories(c.memories)) for (const who of lib.mentionsIn(reg, m)) { const k = who.toLowerCase(); if (!where.has(k)) where.set(k, new Map()); const w = where.get(k); w.set(c.slug, (w.get(c.slug) || 0) + 1); }
const line = n => {
  const p = team.get(n.name.toLowerCase());
  const aliases = n.aliases.filter(a => !p || a !== p.handle);
  const w = where.get(n.name.toLowerCase());
  const seen = w ? [...w].map(([slug, k]) => `${k} in ${slug}`).join(", ") : "not in any memory yet";
  const gaps = n.kind === "person" ? [!n.name.includes(" ") ? "first name only" : "", !n.emails.length && !p ? "no email" : ""].filter(Boolean) : [];
  return `- ${n.name}${n.subtype ? ` (${n.subtype})` : ""}${p ? ` <${p.email}>` : n.emails.length ? ` <${n.emails.join(", ")}>` : ""}${aliases.length ? `  also "${aliases.join('", "')}"` : ""}  ·  ${seen}${gaps.length ? `  ·  ${gaps.join(", ")}` : ""}`;
};
const all = lib.readNames(root).filter(n => n.status !== "archived"), members = all.filter(n => team.has(n.name.toLowerCase())), rest = all.filter(n => !team.has(n.name.toLowerCase()));
const contacts = rest.filter(n => n.kind === "person"), others = rest.filter(n => n.kind !== "person");
console.log(`Team (${members.length}, from brain/admin.md)`); for (const n of members) console.log(line(n));
console.log(`\nContacts (${contacts.length}, people named in memories)`); if (!contacts.length) console.log("- none yet"); for (const n of contacts) console.log(line(n));
for (const kind of lib.NAME_KINDS.filter(k => k !== "person")) { const g = others.filter(n => n.kind === kind); if (g.length) { console.log(`\n${kind[0].toUpperCase() + kind.slice(1)}s (${g.length})`); for (const n of g) console.log(line(n)); } }
const merges = lib.suggestMerges(all);
if (merges.length) console.log(`\nMight be the same: ${merges.map(m => `${m.a} and ${m.b}`).join("; ")}. Ask the person; then "${merges[0].b} is ${merges[0].a}" (one entity, the notes count together) or "${merges[0].b} is not ${merges[0].a}" (kept apart, not asked again).`);
const incomplete = contacts.filter(n => !n.name.includes(" ") || !n.emails.length);
if (incomplete.length) { const i = incomplete[0]; console.log(`\nTo complete one, say who they are: ${!i.name.includes(" ") ? `"${i.name} is <Full Name>, email <address>". If a name is not a person: "${i.name} is a company".` : `"${i.name}, email <address>".`}`); }
}
try { main(); } catch (error) { console.error(error.message); process.exit(1); }

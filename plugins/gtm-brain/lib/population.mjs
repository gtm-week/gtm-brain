/* Population: is the brain too full or too empty? Deterministic numbers from the brain's own files, no
   model and no connector: notes saved this week against the four weeks before, exact and near duplicates,
   entities no note mentions, entities missing a field SCHEMA.md marks required, notes no compiled summary
   or brief cites, and the share of notes without a source pointer. Capture rate and noise rate need the
   capture pass, which is not built: the view names them "not measured" and never guesses.
   One pass over every memories.jsonl, one read of the registry and the covers. The result is cached in
   work/population.json under a stamp of those files and the hour, so a chat start on a brain with 50,000
   notes pays the pass once an hour at most. Reads the brain; writes only that cache.
   GTM_BRAIN_NOW fixes the clock for tests. The ranges live in POPULATION_RANGES; there is no setting yet. */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import * as lib from "./brain.mjs";
import { readSchema, fieldsFor } from "./schema.mjs";
import { normalizeSource } from "./pointers.mjs";

const DAY = 864e5;
const nowMs = () => process.env.GTM_BRAIN_NOW ? Date.parse(process.env.GTM_BRAIN_NOW) : Date.now();

/* The one place the ranges live. A share is a fraction of the notes (or entities) it is about. Below the
   minimum size a brain is too small for a share to mean anything, and nothing is out of range. */
export const POPULATION_RANGES = {
  min_notes: 20,               // fewer notes in force: no share is judged
  min_entities: 10,            // fewer entities: the entity shares are not judged
  week_low: 0.25,              // this week below a quarter of the four-week average: too empty
  week_high: 3,                // this week above three times the average: too full
  week_min_average: 4,         // an average below four notes a week is too thin to compare with
  duplicates_max: 0.05,        // exact plus near duplicates above 5% of notes
  entities_without_notes_max: 0.2,
  entities_missing_required_max: 0.5,
  uncited_max: 0.3,            // of the notes recorded before their context's last summary
  no_source_max: 0.5,
};
/* How long a tool may go without a sync before the health line names it. A checkpoint can carry its own
   window_days (a daily run writes 2); otherwise this. */
export const SYNC_WINDOW_DAYS = 7;

const CITE = /\bm_[0-9a-f]{6,12}\b/g;
export const normalizedContent = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/* Pointers a near duplicate is judged on: a record in a tool. A chat (codex) or the person (user) holds many separate notes and a
   memory pointer is a fork copy's origin, so neither makes two notes the same. */
const RECORD_KIND = k => k && !["codex", "claude", "memory", "user"].includes(k);

function contextDirs(root) {
  const d = join(root, "brain", "contexts"); if (!existsSync(d)) return [];
  return readdirSync(d).filter(n => { try { return statSync(join(d, n)).isDirectory(); } catch { return false; } }).sort();
}
function entityFiles(root) {
  const d = join(root, "brain", "entities"); if (!existsSync(d)) return [];
  const out = [], walk = dir => { for (const n of readdirSync(dir).sort()) { const p = join(dir, n); let s; try { s = statSync(p); } catch { continue; } if (s.isDirectory()) walk(p); else if (n.endsWith(".md")) out.push(`${p}:${s.size}:${s.mtimeMs}`); } };
  walk(d); return out;
}
/* What the numbers rest on: every memories.jsonl and context.md, the entity files and SCHEMA.md, by size and
   time, plus the hour of the clock (the week moves). */
function stamp(root, now) {
  const st = p => { try { const s = statSync(p); return `${s.size}:${s.mtimeMs}`; } catch { return "-"; } };
  const parts = [String(Math.floor(now / 36e5))];
  for (const c of contextDirs(root)) parts.push(c, st(join(root, "brain/contexts", c, "memories.jsonl")), st(join(root, "brain/contexts", c, "context.md")));
  parts.push(...entityFiles(root), st(join(root, "SCHEMA.md")), st(join(root, "brain/admin.md")));
  return lib.snapshotKey([{ id: parts.join("|") }]);
}

const share = (n, d) => d ? Math.round((n / d) * 1000) / 1000 : 0;

/* The numbers, computed. */
export function computePopulation(root, { now = nowMs() } = {}) {
  const contexts = lib.listContexts(root);
  const names = lib.readNames(root).filter(e => e.status !== "archived");
  const all = [];
  for (const c of contexts) for (const m of c.memories) all.push({ m, c });
  // in force: corrections and retractions hide what they replace; a fork copy counts once
  const effective = new Set(lib.hideForkCopies(lib.effectiveMemories(all.map(x => x.m))).map(m => m.id));
  const notes = all.filter(({ m }) => effective.has(m.id) && !m.retracts);

  // saved: every record but a retraction, by its recording time
  let week = 0, before = 0;
  for (const { m } of all) {
    if (m.retracts) continue;
    const t = Date.parse(m.at); if (!Number.isFinite(t) || t > now) continue;
    const age = now - t;
    if (age < 7 * DAY) week++; else if (age < 35 * DAY) before++;
  }

  // duplicates: the same normalized content, or the same record pointer on the same day
  const seenText = new Map(), seenSource = new Map(); let exact = 0, near = 0;
  const examples = [];
  for (const { m, c } of [...notes].sort((a, b) => Date.parse(a.m.at) - Date.parse(b.m.at) || a.m.id.localeCompare(b.m.id))) {
    const text = normalizedContent(m.content);
    if (text && seenText.has(text)) { exact++; if (examples.length < 5) examples.push({ id: m.id, same_as: seenText.get(text), why: "same content" }); continue; }
    if (text) seenText.set(text, m.id);
    const day = String(m.at || "").slice(0, 10);
    let hit = null;
    for (const s of Array.isArray(m.source) ? m.source : []) {
      const [p] = normalizeSource(s); if (!p || !RECORD_KIND(p.kind) || !p.ref) continue;
      const key = `${p.kind}:${p.account ? p.account + "/" : ""}${p.ref}@${day}|${c.slug}`;
      if (seenSource.has(key)) { hit = seenSource.get(key); break; }
      seenSource.set(key, m.id);
    }
    if (hit) { near++; if (examples.length < 5) examples.push({ id: m.id, same_as: hit, why: "same source, same day" }); }
  }

  // entities no note in force mentions (the same matcher the memory index uses)
  const mention = lib.createMentionMatcher(names), mentioned = new Set();
  for (const { m } of notes) for (const n of mention(m)) mentioned.add(n);
  const ours = String(lib.readAdmin(root)?.company || "").trim().toLowerCase();
  const isOurs = e => ours && [e.name, ...(e.aliases || [])].some(n => String(n).trim().toLowerCase() === ours);
  const team = new Set(((lib.readAdmin(root) || {}).team || []).map(p => String(p?.name || "").toLowerCase()));
  const tracked = names.filter(e => !isOurs(e) && !team.has(String(e.name).toLowerCase()));
  const without = tracked.filter(e => !mentioned.has(e.name));

  // required SCHEMA.md fields the entity's compiled brief has no cited value for
  const { schema } = readSchema(root);
  const missing = [], byField = {};
  if (schema) for (const e of tracked) {
    const required = fieldsFor(schema, e.kind, e.subtype).filter(f => f.required).map(f => f.name);
    if (!required.length) continue;
    let given = []; try { given = JSON.parse(e._fm?.compiled_fields || "[]"); } catch {}
    const have = new Set((Array.isArray(given) ? given : []).map(f => f?.field));
    const gone = required.filter(f => !have.has(f));
    if (gone.length) { missing.push({ name: e.name, fields: gone }); for (const f of gone) byField[f] = (byField[f] || 0) + 1; }
  }

  // notes no compiled summary or entity brief cites; a note newer than its context's summary is still waiting
  const cited = new Set();
  for (const c of contexts) for (const id of `${c.summary} ${c.body || ""}`.match(CITE) || []) cited.add(id);
  for (const e of names) for (const id of ((JSON.stringify(e._compilation) || "") + (e._fm?.compiled_fields || "")).match(CITE) || []) cited.add(id);
  let uncited = 0, waiting = 0, judged = 0;
  for (const { m, c } of notes) {
    const pending = !c.compiledAt || lib.newer(m.at, c.compiledAt);
    if (!pending) judged++;
    if (cited.has(m.id)) continue;
    if (pending) waiting++; else uncited++;
  }

  const noSource = notes.filter(({ m }) => !(Array.isArray(m.source) && m.source.length)).length;
  return {
    at: new Date(now).toISOString(),
    notes: notes.length,
    saved: { last_7_days: week, average_4_weeks_before: Math.round((before / 4) * 10) / 10 },
    duplicates: { exact, near, share: share(exact + near, notes.length), examples },
    entities: { total: tracked.length, without_notes: without.length, without_notes_share: share(without.length, tracked.length), without_notes_examples: without.slice(0, 5).map(e => e.name),
      missing_required: missing.length, missing_required_share: share(missing.length, tracked.length), missing_required_fields: byField, missing_required_examples: missing.slice(0, 5) },
    citations: { uncited, waiting_for_summary: waiting, judged, uncited_share: share(uncited, judged) },
    sources: { without: noSource, without_share: share(noSource, notes.length) },
    capture_rate: "not measured",
    noise_rate: "not measured",
  };
}

/* The numbers, from the cache when nothing they rest on has changed this hour. */
export function population(root, { now = nowMs(), cache = true } = {}) {
  const key = stamp(root, now), file = join(root, "work", "population.json");
  if (cache) { try { const c = JSON.parse(readFileSync(file, "utf8")); if (c.key === key && c.population) return c.population; } catch {} }
  const p = computePopulation(root, { now });
  if (cache && existsSync(join(root, "brain", "admin.md"))) {
    try { mkdirSync(join(root, "work"), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify({ key, population: p }) + "\n"); renameSync(tmp, file); } catch {}
  }
  return p;
}

const pct = x => `${Math.round(x * 100)}%`;
/* What is out of range, as short phrases; empty when the brain is within every range. */
export function outOfRange(p, r = POPULATION_RANGES) {
  const out = [];
  const { last_7_days: week, average_4_weeks_before: avg } = p.saved;
  if (avg >= r.week_min_average && week < avg * r.week_low) out.push(`too empty: ${week} note${week === 1 ? "" : "s"} saved in the last 7 days against ${avg} a week before`);
  if (avg >= r.week_min_average && week > avg * r.week_high) out.push(`too full: ${week} notes saved in the last 7 days against ${avg} a week before`);
  if (p.notes >= r.min_notes) {
    if (p.duplicates.share > r.duplicates_max) out.push(`${pct(p.duplicates.share)} duplicates (${p.duplicates.exact} exact, ${p.duplicates.near} near)`);
    if (p.sources.without_share > r.no_source_max) out.push(`${pct(p.sources.without_share)} of notes without a source`);
    if (p.citations.judged >= r.min_notes && p.citations.uncited_share > r.uncited_max) out.push(`${pct(p.citations.uncited_share)} of summarised notes cited nowhere`);
  }
  if (p.entities.total >= r.min_entities) {
    if (p.entities.without_notes_share > r.entities_without_notes_max) out.push(`${p.entities.without_notes} of ${p.entities.total} entities without notes`);
    if (p.entities.missing_required_share > r.entities_missing_required_max) out.push(`${p.entities.missing_required} of ${p.entities.total} entities missing a required field`);
  }
  return out;
}

/* The compact health-line part, or null when every number is in range. */
export function populationPart(root, options) {
  let p; try { p = population(root, options); } catch { return null; }
  const out = outOfRange(p);
  return out.length ? `population: ${out.join(", ")} (query population)` : null;
}

/* The view's text: every number, the range it is judged by, and what is not measured. */
export function populationText(p, r = POPULATION_RANGES) {
  const flag = cond => cond ? " (out of range)" : "";
  const out = outOfRange(p, r), has = s => out.some(o => o.includes(s));
  const lines = [
    `Population of the brain (deterministic, from the files; ${p.at.slice(0, 16).replace("T", " ")} UTC). ${p.notes} notes in force.`,
    `- Saved: ${p.saved.last_7_days} in the last 7 days; ${p.saved.average_4_weeks_before} a week on average over the 4 weeks before${flag(has("too empty") || has("too full"))}. Range: between ${r.week_low}x and ${r.week_high}x the average, judged when the average is ${r.week_min_average} or more.`,
    `- Duplicates: ${p.duplicates.exact} exact (same content), ${p.duplicates.near} near (same source record, same day), ${pct(p.duplicates.share)} of notes${flag(has("duplicates"))}. Range: at most ${pct(r.duplicates_max)}.${p.duplicates.examples.length ? ` For example: ${p.duplicates.examples.map(x => `${x.id} = ${x.same_as} (${x.why})`).join("; ")}.` : ""}`,
    `- Entities without notes: ${p.entities.without_notes} of ${p.entities.total}${flag(has("entities without notes"))}. Range: at most ${pct(r.entities_without_notes_max)}.${p.entities.without_notes_examples.length ? ` For example: ${p.entities.without_notes_examples.join(", ")}.` : ""}`,
    `- Entities missing a field SCHEMA.md marks required: ${p.entities.missing_required} of ${p.entities.total}${flag(has("missing a required"))}. Range: at most ${pct(r.entities_missing_required_max)}.${Object.keys(p.entities.missing_required_fields).length ? ` By field: ${Object.entries(p.entities.missing_required_fields).map(([f, n]) => `${f} ${n}`).join(", ")}.` : ""}`,
    `- Notes no summary or brief cites: ${p.citations.uncited} of the ${p.citations.judged} recorded before their context's last summary (${pct(p.citations.uncited_share)})${flag(has("cited nowhere"))}; ${p.citations.waiting_for_summary} more wait for the next summary. Range: at most ${pct(r.uncited_max)}.`,
    `- Notes without a source pointer: ${p.sources.without} (${pct(p.sources.without_share)})${flag(has("without a source"))}. Range: at most ${pct(r.no_source_max)}.`,
    `- Capture rate: not measured (it needs the capture pass, which is not built).`,
    `- Noise rate: not measured (it needs the capture pass, which is not built).`,
    `Shares are judged from ${r.min_notes} notes and ${r.min_entities} entities. ${out.length ? `Out of range: ${out.join("; ")}.` : "Every measured number is in range."} Reads only.`,
  ];
  return lines.join("\n");
}

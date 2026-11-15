// Several entities in one read (query object entities with filters.id and/or filters.name as lists): one compact
// card per entity, in the order asked, from the memory index. A card: name, kind, id, relation to us, where they
// work (the relation log, lib/relation-log.mjs) and the newest notes with id, date and age, each cut short. A
// name several entities share lists them in one line; an unknown name says so. Reads only. One reply stays under
// the answer read's cap (SEARCH_MAX_BYTES) whatever limit is passed: notes are dropped before entities, and the
// last lines say what was left out and how to get it.
import { foldLatin } from './fold.mjs';
import * as lib from './brain.mjs';
import { withMemoryIndex } from './memory-index.mjs';
import { rankEntityCandidates } from './entity-search.mjs';

export const CARDS_MAX_ENTITIES = 25;
export const CARD_NOTES = 3;
export const NOTE_CHARS = 200;
// 12 KB, the cap of query object answer (lib/memory-search.mjs reads the same setting); a limit never raises it here
const capSetting = Number(process.env.GTM_BRAIN_SEARCH_MAX_BYTES);
export const CARDS_MAX_BYTES = Number.isInteger(capSetting) && capSetting >= 2048 && capSetting <= 2 * 1024 * 1024 ? capSetting : 12 * 1024;

const DAY = 86400000;
export const nowDate = () => process.env.GTM_BRAIN_NOW ? new Date(process.env.GTM_BRAIN_NOW) : new Date();
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const ageOf = (at, now = nowDate()) => { const d = Math.floor((startOfDay(now) - startOfDay(new Date(at))) / DAY); return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`; };
export const dayOf = at => lib.localDateTime(at).slice(0, 10);
export const cut = (s, n = NOTE_CHARS) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')} ...` : t; };
export const noteLine = (m, now = nowDate(), chars = NOTE_CHARS) => `${m.id} · ${dayOf(m.at)} (${ageOf(m.at, now)}) · ${m.context}${m.kind && m.kind !== 'note' ? ` · ${m.kind}` : ''}: ${cut(m.content, chars)}`;
const bytes = s => Buffer.byteLength(s);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* What one asked name is, the way the single read resolves it (id or retired id, name, alias, email), with the
   letters folded (lib/fold.mjs: "Lukasz" is "Łukasz"), then a first name. One hit resolves; several are listed,
   never chosen; none gives the nearest spellings as candidates only. Archived entities answer only to their id. */
export function resolveAsked(registry, said) {
  const text = String(said ?? '').trim();
  if (!text) return { said: text, status: 'unknown', near: [] };
  const byId = registry.find(e => e.id === text || e.previous_ids?.includes(text));
  if (byId) return { said: text, status: 'resolved', entity: byId };
  const active = registry.filter(e => (e.status || 'active') !== 'archived');
  const w = foldLatin(text), spellings = e => [e.name, ...(e.aliases || [])].map(foldLatin);
  let hits = active.filter(e => spellings(e).includes(w) || (e.emails || []).some(x => x.toLowerCase() === text.toLowerCase()));
  let first = false;
  if (!hits.length && !/\s/.test(w)) { hits = active.filter(e => spellings(e).some(n => n.split(/\s+/)[0] === w)); first = hits.length > 0; }
  if (hits.length === 1) return { said: text, status: 'resolved', entity: hits[0], ...(first ? { inferred: true } : {}) };
  if (hits.length > 1) return { said: text, status: 'ambiguous', candidates: hits };
  let near = []; try { near = rankEntityCandidates(active, text, { limit: 3 }).matches.map(x => x.entry); } catch {}
  return { said: text, status: 'unknown', near };
}

const strings = v => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map(x => String(x ?? '').trim()).filter(Boolean);
/* "A, B and C" as typed into search: the names, when there are two or more */
export const splitNames = s => String(s || '').split(/\s*(?:,|;|\n|\s&\s|\band\b|\bor\b)\s*/i).map(x => x.trim().replace(/^["']|["'?.!]+$/g, '')).filter(Boolean);

export function entityCardsText(index, root, { ids = [], names = [], limit, now = nowDate() } = {}) {
  const registry = index.entries || lib.readNames(root);
  const asked = [...strings(ids).map(said => ({ said, by: 'id' })), ...strings(names).map(said => ({ said, by: 'name' }))];
  if (!asked.length) return 'entities needs filters.id (entity ids) or filters.name (names), each a list of up to 25.';
  const taken = asked.slice(0, CARDS_MAX_ENTITIES), beyond = asked.slice(CARDS_MAX_ENTITIES);
  const perEntity = Math.max(1, Math.min(CARD_NOTES, Number(limit) || CARD_NOTES));
  const nameOf = new Map(registry.flatMap(e => [e.id, ...(e.previous_ids || [])].map(id => [id, e])));
  const toUs = index.relationsToUs();
  let company = null; const us = () => company ??= (lib.readAdmin(root)?.company || 'us');
  const called = id => id === 'us' ? us() : nameOf.get(id)?.name || id;
  const db = index.db;

  const seen = new Map(), cards = [];
  taken.forEach((a, i) => {
    const r = a.by === 'id' ? (() => { const e = registry.find(x => x.id === a.said || x.previous_ids?.includes(a.said)); return e ? { said: a.said, status: 'resolved', entity: e } : { said: a.said, status: 'unknown', near: [], id: true }; })() : resolveAsked(registry, a.said);
    const n = i + 1;
    if (r.status === 'ambiguous') {
      const one = e => { const rel = index.relations({ entity: e.id }).find(x => x.type === 'works_at' && x.from === e.id && x.status === 'current'); return `${e.name} (${e.kind || 'person'}, ${e.id}${rel ? `, works at ${called(rel.to)}` : ''}${e.emails?.length ? `, ${e.emails[0]}` : ''})`; };
      cards.push({ head: `${n}. "${r.said}": ${r.candidates.length} entities share this name: ${r.candidates.slice(0, 6).map(one).join('; ')}${r.candidates.length > 6 ? `; and ${r.candidates.length - 6} more` : ''}. Ask the person which one, or read one by its id.`, notes: [], state: 'ambiguous' });
      return;
    }
    if (r.status === 'unknown') {
      cards.push({ head: `${n}. "${r.said}": not in the brain (no ${r.id ? 'entity has this id' : 'name, alias or email matches'}${r.near?.length ? `; nearest spelling, not confirmed: ${r.near.map(e => `${e.name} (${e.kind || 'person'}, ${e.id})`).join(', ')}` : ''}).`, notes: [], state: 'unknown' });
      return;
    }
    const e = r.entity;
    if (seen.has(e.id)) { cards.push({ head: `${n}. "${r.said}" is ${e.name}: card ${seen.get(e.id)} above.`, notes: [], state: 'repeat' }); return; }
    seen.set(e.id, n);
    const kind = e.kind || 'person';
    const rels = index.relations({ entity: e.id });
    const parts = [`${e.name}`, `${kind}${e.subtype ? ` (${e.subtype})` : ''}`, e.id];
    if ((e.status || 'active') !== 'active') parts.push(e.status);
    if (r.said.toLowerCase() !== e.name.toLowerCase() && r.said !== e.id) parts.push(`"${r.said}" is ${e.name}${r.inferred ? ' (the only one with this first name)' : ''}`);
    if (['person', 'organization'].includes(kind)) parts.push(`relation to us: ${toUs.get(e.id) || 'other'}`);
    const scope = index.filterSql({ entities: [e.id] }), where = scope.where.join(' AND ');
    const count = db.prepare(`${scope.prefix}SELECT count(*) AS n FROM memories m WHERE ${where}`).get(...scope.params).n;
    if (kind === 'person') {
      const jobs = rels.filter(x => x.type === 'works_at' && x.from === e.id), current = jobs.filter(x => x.status === 'current');
      const past = jobs.filter(x => x.status === 'ended').sort((a, b) => String(b.until || b.observed_at).localeCompare(String(a.until || a.observed_at)))[0];
      if (current.length) parts.push(`works at ${current.map(x => `${called(x.to)}${x.since ? ` (since ${String(x.since).slice(0, 10)}, ${x.memory})` : ''}`).join(' and ')}`);
      else {
        // no employer was recorded as a relationship: the organizations their notes name, as a lead, never as a fact
        const co = count ? db.prepare("SELECT v2.value AS v, count(*) AS n FROM members v JOIN members v2 ON v2.memory=v.memory AND v2.field='entities' JOIN memories m ON m.rowid=v.memory WHERE v.field='entities' AND v.value=? AND m.effective=1 AND v2.value<>? GROUP BY v2.value ORDER BY n DESC, v2.value LIMIT 30").all(JSON.stringify(e.id), JSON.stringify(e.id))
          .map(x => { try { return nameOf.get(JSON.parse(x.v)); } catch { return null; } }).filter(x => x && x.kind === 'organization').slice(0, 3) : [];
        parts.push(`works at: not recorded${past ? ` (left ${called(past.to)} ${String(past.until || past.observed_at).slice(0, 10)})` : ''}${co.length ? `; organizations in their notes: ${co.map(x => x.name).join(', ')}` : ''}`);
      }
    } else if (kind === 'organization') {
      const staff = rels.filter(x => x.type === 'works_at' && x.to === e.id && x.status === 'current').map(x => called(x.from));
      if (staff.length) parts.push(`people here: ${staff.slice(0, 4).join(', ')}${staff.length > 4 ? ` and ${staff.length - 4} more` : ''}`);
    }
    if (e.aliases?.length) parts.push(`also: ${e.aliases.slice(0, 3).map(a => cut(a, 40)).join(', ')}`);
    if (e.emails?.length) parts.push(e.emails.slice(0, 2).join(', '));
    parts.push(count ? plural(count, 'note') : 'no notes');
    const notes = count ? db.prepare(`${scope.prefix}SELECT m.projected AS p FROM memories m WHERE ${where} ORDER BY m.time DESC, m.id LIMIT ${perEntity}`).all(...scope.params).map(x => `   - ${noteLine(JSON.parse(x.p), now)}`) : [];
    // the compiled brief's first lines, when the page has one: who they are in a sentence, with its date
    const overview = e._compilation?.overview?.[0];
    if (overview?.text) notes.unshift(`   Brief${e._fm?.compiled_at ? ` (compiled ${String(e._fm.compiled_at).slice(0, 10)})` : ''}: ${cut(overview.text, 240)}`);
    cards.push({ head: `${n}. ${parts.join(' · ')}`, notes, total: count, state: 'found', name: e.name });
  });

  const found = cards.filter(c => c.state === 'found').length;
  const top = `Entities: ${asked.length} asked${beyond.length ? `, the first ${taken.length} read` : ''}, ${found} found${cards.some(c => c.state === 'ambiguous') ? `, ${cards.filter(c => c.state === 'ambiguous').length} ambiguous` : ''}${cards.some(c => c.state === 'unknown') ? `, ${cards.filter(c => c.state === 'unknown').length} not in the brain` : ''}. One card each, in the order asked; newest notes first.`;
  // the budget: every head first, then the lines under it in rounds (each card's brief, then its newest note, its second, its third)
  const budget = CARDS_MAX_BYTES - 700;   // room for the closing lines
  let used = bytes(top) + 1, kept = 0;
  for (const c of cards) { const size = bytes(c.head) + 1; if (kept && used + size > budget) break; used += size; kept++; }
  const shownCards = cards.slice(0, kept), give = shownCards.map(() => 0);
  let full = false;
  for (let round = 0; round <= CARD_NOTES && !full; round++) for (let i = 0; i < shownCards.length; i++) {
    const line = shownCards[i].notes[round]; if (!line || give[i] !== round) continue;
    if (used + bytes(line) + 1 > budget) { full = true; break; }
    used += bytes(line) + 1; give[i]++;
  }
  const out = [top];
  shownCards.forEach((c, i) => out.push(c.head, ...c.notes.slice(0, give[i])));
  const tail = [];
  const cutCards = shownCards.filter((c, i) => give[i] < c.notes.length);
  if (cutCards.length) tail.push(`To fit one reply, fewer lines are shown for ${cutCards.length === shownCards.filter(c => c.notes.length).length ? 'every card' : cutCards.map(c => c.name).slice(0, 6).join(', ') + (cutCards.length > 6 ? ` and ${cutCards.length - 6} more` : '')}; a larger limit does not change that. Ask for fewer entities in one call to see three notes each.`);
  const dropped = [...cards.slice(kept).map((c, i) => taken[kept + i].said), ...beyond.map(a => a.said)];
  if (dropped.length) tail.push(`Not read (${beyond.length ? `one call reads at most ${CARDS_MAX_ENTITIES} entities` : 'the reply was full'}): ${dropped.slice(0, 30).join(', ')}${dropped.length > 30 ? ` and ${dropped.length - 30} more` : ''}. Read them with the same call and only these.`);
  tail.push(`Answer from these cards; no second read per entity. What a card does not say is not recorded: say so, and never search the web to find out who a person is or where they work. All notes on one of them, only if the answer needs it: query object answer with search = the name.`);
  return [...out, '', ...tail].join('\n');
}

export function entityCards(root, args = {}) { return withMemoryIndex(root, index => entityCardsText(index, root, args)); }

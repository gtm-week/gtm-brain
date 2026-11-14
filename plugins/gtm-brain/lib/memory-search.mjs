// One search for a question, over the memory index (lib/memory-index.mjs): names, kinds, tags and
// periods narrow the notes first, then stemmed words rank what is left. A word no note has is tried
// once more as the nearest spelling in the brain's own word list (one letter off, words of five
// letters or more), ranked below exact matches and said in one line. One reply stays under a byte
// cap and ends with how many more matched. Used by query (object answer, and memories with search).
import * as lib from './brain.mjs';
import { MAX_RESULT_BYTES, withMemoryIndex } from './memory-index.mjs';
import { relationOverview } from './relations.mjs';
import { askSourceLines } from './ask-source.mjs';

// one reply; a larger limit raises it, up to MAX_RESULT_BYTES. A setting: GTM_BRAIN_SEARCH_MAX_BYTES (2 KB to 2 MiB).
const capSetting = Number(process.env.GTM_BRAIN_SEARCH_MAX_BYTES);
export const SEARCH_MAX_BYTES = Number.isInteger(capSetting) && capSetting >= 2048 && capSetting <= 2 * 1024 * 1024 ? capSetting : 12 * 1024;
export const ANSWER_NOTES = 8;               // notes an answer shows when no limit is given
const PER_NOTE_BYTES = 1536;                  // a larger limit raises the cap by this much per note
const FULL_NOTE_CHARS = 1800, SHORT_NOTE_CHARS = 700;   // the first three notes nearly whole, the rest shorter
const TYPO_MIN = 5;
// a part of the day after a weekday ("Thursday night"): the times and words a note uses for it
const DAYPART = { night: /\b(1[7-9]|2[0-3])[:.][0-5]\d\b|\b(evening|night|dinner|afterparty|drinks)\b/i, evening: /\b(1[7-9]|2[0-3])[:.][0-5]\d\b|\b(evening|night|dinner|afterparty|drinks)\b/i,
  morning: /\b(0[6-9]|1[01])[:.][0-5]\d\b|\b(morning|breakfast)\b/i, afternoon: /\b1[2-7][:.][0-5]\d\b|\b(afternoon|lunch)\b/i };

const STOP = new Set(`a an the and or but nor of to in on at for from by with without about as into onto over under after before between during
 is are was were be been being am do does did done doing have has had having will would shall should can could may might must
 what which who whom whose when where why how whats what's who's where's when's how's whether
 i me my mine we us our ours you your yours he him his she her hers it its they them their theirs this that these those there here
 any some all each every no not none nothing something anything everything someone anyone everyone
 tell told know knew known say said says saying give gave show shown find found list get got let lets let's please
 note notes brain memory memories mention mentioned mentions remember remembered recorded saved write wrote written
 regarding re vs via also just only ever again much many more most less than then so if up out off very really
 thing things stuff kind sort one ones yet still already latest recent recently currently current now ago
 talk talked talking discuss discussed want wanted wants happen happens happened happening going news hear heard`.split(/\s+/).filter(Boolean));

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const monthIndex = w => MONTHS.findIndex(m => m.startsWith(w.toLowerCase().slice(0, 3)));
const DAY = 86400000;
const nowDate = () => process.env.GTM_BRAIN_NOW ? new Date(process.env.GTM_BRAIN_NOW) : new Date();
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cap = s => s[0].toUpperCase() + s.slice(1);

/* A period named in the question: [from, to) in local time, a label, and, for a calendar word (a month,
   a weekday, a date), the words a note uses to mention it, so a note about an event on that day is
   found as well as one recorded then. The matched text is removed from the question. */
export function parsePeriod(question, now = nowDate(), isName = () => false) {
  const today = startOfDay(now);
  const day = (d, label, mention) => ({ from: d, to: addDays(d, 1), label, mention });
  const rules = [
    [/\b(\d{4})-(\d{2})-(\d{2})\b/, m => { const d = new Date(+m[1], +m[2] - 1, +m[3]); return day(d, ymd(d), [`${d.getDate()} ${MONTHS[d.getMonth()]}`, `${MONTHS[d.getMonth()]} ${d.getDate()}`, ymd(d)]); }],
    [new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?`, 'i'), m => dated(+m[1], m[2], m[3])],
    [new RegExp(`\\b(?:on\\s+)?${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'i'), m => dated(+m[2], m[1], m[3])],
    [/\btoday\b/i, () => ({ from: today, to: addDays(today, 1), label: 'today' })],
    [/\byesterday\b/i, () => ({ from: addDays(today, -1), to: today, label: 'yesterday' })],
    [/\b(?:in\s+the\s+)?(?:last|past)\s+(\d{1,3})\s+days\b/i, m => ({ from: addDays(today, -Number(m[1])), to: addDays(today, 1), label: `the last ${m[1]} days` })],
    [/\b(\d{1,3})\s+days\s+ago\b/i, m => day(addDays(today, -Number(m[1])), ymd(addDays(today, -Number(m[1]))))],
    [/\b(this|last|past)\s+week\b/i, m => { const monday = addDays(today, -((today.getDay() + 6) % 7)); return m[1].toLowerCase() === 'this' ? { from: monday, to: addDays(monday, 7), label: 'this week' } : { from: addDays(monday, -7), to: monday, label: 'last week' }; }],
    [/\b(this|last|past)\s+month\b/i, m => { const first = new Date(today.getFullYear(), today.getMonth(), 1); return m[1].toLowerCase() === 'this' ? { from: first, to: new Date(today.getFullYear(), today.getMonth() + 1, 1), label: 'this month' } : { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: first, label: 'last month' }; }],
    [/\b(this|last|past)\s+year\b/i, m => m[1].toLowerCase() === 'this' ? { from: new Date(today.getFullYear(), 0, 1), to: new Date(today.getFullYear() + 1, 0, 1), label: 'this year' } : { from: new Date(today.getFullYear() - 1, 0, 1), to: new Date(today.getFullYear(), 0, 1), label: 'last year' }],
    // "may" and "march" are verbs too: a month only after in/during/since/of/until, or before a year
    [new RegExp(`\\b(?:(in|during|since|of|until|for|from)\\s+)?${MONTH_RE}\\b(?:\\s+(\\d{4}))?`, 'i'), m => {
      const word = m[2].toLowerCase();
      if (['may', 'mar', 'march'].includes(word) && !m[1] && !m[3]) return null;
      if (!m[1] && !m[3] && isName(m[2])) return null;   // Jan, April, June, August: a person in the registry comes first
      const i = monthIndex(word); let y = m[3] ? +m[3] : today.getFullYear();
      if (!m[3] && i > today.getMonth()) y--;
      return { from: new Date(y, i, 1), to: new Date(y, i + 1, 1), label: `${cap(MONTHS[i])} ${y}`, mention: [MONTHS[i]] };
    }],
    [/\b(?:(last|this|on|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(night|evening|morning|afternoon))?\b/i, m => {
      const i = WEEKDAYS.indexOf(m[2].toLowerCase());
      const back = (today.getDay() - i + 7) % 7 || (m[1]?.toLowerCase() === 'last' ? 7 : 0);
      const d = addDays(today, -back);
      return { ...day(d, `${cap(WEEKDAYS[i])} ${ymd(d)}`, [WEEKDAYS[i]]), part: m[3]?.toLowerCase() || null };
    }],
    [/\b(?:in|during)\s+(\d{4})\b/, m => ({ from: new Date(+m[1], 0, 1), to: new Date(+m[1] + 1, 0, 1), label: m[1] })],
  ];
  function dated(d, month, year) {
    const i = monthIndex(month); if (i < 0 || d < 1 || d > 31) return null;
    let y = year ? +year : today.getFullYear();
    if (!year && new Date(y, i, d) > addDays(today, 31)) y--;   // a date without a year: the last one, unless it is this coming month
    const at = new Date(y, i, d);
    return day(at, `${d} ${cap(MONTHS[i])} ${y}`, [`${d} ${MONTHS[i]}`, `${MONTHS[i]} ${d}`, ymd(at)]);
  }
  for (const [re, make] of rules) {
    // a refused match ("may" the verb, Jan the person) does not end the rule: "we may launch in October"
    for (const m of question.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
      const p = make(m); if (!p) continue;
      return { period: p, rest: (question.slice(0, m.index) + ' ' + question.slice(m.index + m[0].length)).trim() };
    }
  }
  return { period: null, rest: question };
}

// Words as typed (letters, digits, @ . ' - _ inside a word), with their original case.
const words = s => (String(s).match(/[\p{L}\p{N}][\p{L}\p{N}@._'’-]*/gu) || []).map(w => w.replace(/[._'’-]+$/u, '').replace(/['’]s$/iu, '')).filter(Boolean);
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ftsWord = w => `"${w.replace(/"/g, '')}"`;

/* Optimal string alignment distance, stopping early past 1. */
function withinOne(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const ra = a.slice(i), rb = b.slice(i);
  if (ra.length === rb.length) return ra.slice(1) === rb.slice(1) || (ra.length >= 2 && ra[0] === rb[1] && ra[1] === rb[0] && ra.slice(2) === rb.slice(2));
  return ra.length > rb.length ? ra.slice(1) === rb : rb.slice(1) === ra;
}
// The same word as heard: ph and f, ck and k, doubled letters. "heliograf" is one sound from "heliograph".
const sound = w => w.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/(.)\1+/g, '$1');
const nearSpelling = (typed, known) => withinOne(typed, known) || withinOne(sound(typed), sound(known));

/* Parse a question into narrowing (entities, kind, tags, period) and words to rank by. */
export function parseQuestion(question, names, { now = nowDate() } = {}) {
  const quoted = [...String(question).matchAll(/"([^"]{2,200})"/g)].map(m => m[1].trim()).filter(Boolean);
  let rest = String(question).replace(/"[^"]{2,200}"/g, ' ');
  const tags = [];
  rest = rest.replace(/(?:^|\s)(?:#|tag:)([\p{L}\p{N}][\p{L}\p{N}:_-]*)/gu, (_, t) => { tags.push(t.toLowerCase()); return ' '; });
  const { period, rest: left } = parsePeriod(rest, now, w => !!lib.canonicalName(names, w)); rest = left;
  const tokens = words(rest), used = new Array(tokens.length).fill(false), entities = [];
  // names: the longest run of words that is a known name, alias, email or id; a single word must be
  // capitalized, an email, an id, or the full name itself (so "sites" is not the alias Sites)
  for (let n = Math.min(5, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      const text = tokens.slice(i, i + n).join(' ');
      if (n === 1 && (STOP.has(text.toLowerCase()) || text.length < 2)) continue;
      const exact = lib.exactName(names, text);
      let hit = exact ? names.find(e => e.name === exact) : null, inferred = false;
      if (hit && n === 1 && !/^\p{Lu}/u.test(text) && !/[@\d]/.test(text) && hit.name.toLowerCase() !== text.toLowerCase()) hit = null;
      if (!hit && n === 1 && /^\p{Lu}/u.test(text) && text.length >= 3) { const first = lib.inferredName(names, text); if (first) { hit = names.find(e => e.name === first); inferred = true; } }
      if (!hit && /^e_[0-9a-f]{16}$/.test(text)) hit = lib.resolveEntity(names, text);
      if (!hit) continue;
      for (let j = i; j < i + n; j++) used[j] = true;
      if (!entities.some(e => e.id === hit.id)) entities.push({ id: hit.id, name: hit.name, said: text, ...(inferred ? { inferred: true } : {}) });
    }
  }
  let kind = null, kindHint = null;
  const terms = [], sequence = [];   // the question's own words in order, names included: its phrases rank first
  tokens.forEach((t, i) => {
    const w = fold(t);
    if (!STOP.has(w)) sequence.push(...parts(w));
    if (used[i]) return;
    if (/^(decisions?)$/.test(w)) { kind = 'decision'; return; }
    if (/^(questions?)$/.test(w)) { kind = 'question'; return; }
    if (/^(decided|decide|deciding)$/.test(w)) kindHint = 'decision';
    if (STOP.has(w) || w.length < 2) return;
    terms.push(w);
  });
  for (const q of quoted) terms.push(fold(q));
  return { entities, kind, kindHint, tags, period, terms: [...new Set(terms)], quoted: quoted.map(fold), sequence };
}

const parts = w => w.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
// The full-text forms of one word: itself, or for a hyphenated or dotted word the words in a row and
// the word written together ("sign-ups": sign ups, signups).
function forms(w) {
  const p = parts(w);
  if (p.length <= 1) return [ftsWord(p[0] || w)];
  return [`"${p.join(' ')}"`, ftsWord(p.join(''))];
}

/* Run a parsed question against an open, synced MemoryIndex. Returns ranked rows and what was done. */
export function searchIndex(index, question, { filters = {}, project = null, now = nowDate(), parsed = null, relationsFor = () => [] } = {}) {
  const db = index.db;
  const q = parsed || parseQuestion(question, index.names, { now });
  // a product stands for the company it belongs to as well: its current relationships to an organization
  // add that organization's notes ("the Toolkit" finds the notes about the company that makes it)
  for (const e of [...q.entities]) {
    if ((index.entries || []).find(x => x.id === e.id)?.kind !== 'product') continue;
    for (const r of relationsFor(e.id)) {
      const other = r.from.id === e.id ? r.to : r.from;
      if (r.status === 'current' && other.id && other.kind === 'organization' && !q.entities.some(x => x.id === other.id)) q.entities.push({ id: other.id, name: other.name, said: e.said, via: e.name });
    }
  }
  const total = index.count();
  const said = [];
  const visibleCount = expr => db.prepare('SELECT count(*) AS n FROM keywords WHERE keywords MATCH ?').get(expr).n;
  let vocab = null;
  const vocabulary = () => vocab ??= db.prepare('SELECT term, doc FROM identity_vocab').all().map(r => ({ term: r.term, doc: r.doc }));
  // each word: its forms; a word no visible note has (five letters or more) gets its nearest spellings
  const groups = q.terms.map(w => {
    const exact = forms(w).join(' OR ');
    const g = { word: w, exact, fuzzy: null, weight: 1 };
    let n = 0; try { n = visibleCount(exact); } catch { g.exact = ftsWord(parts(w).join(' ')); n = visibleCount(g.exact); }
    g.df = n;
    // a word no note has is searched as the spellings one letter off that notes have; ranked below exact
    // matches, said in one line
    if (!n && /^\p{L}+$/u.test(w) && w.length >= TYPO_MIN) {
      const near = vocabulary().filter(v => v.term !== w && v.term.length >= TYPO_MIN - 1 && nearSpelling(w, v.term)).sort((a, b) => b.doc - a.doc).slice(0, 3)
        .filter(v => visibleCount(ftsWord(v.term)) > 0).slice(0, 2);
      if (near.length) {
        g.fuzzy = near.map(v => ftsWord(v.term)).join(' OR '); g.df = n + near.reduce((a, v) => a + v.doc, 0);
        said.push(`No note has "${w}"; searched "${near.map(v => v.term).join('" and "')}" instead.`);
      } else {   // written together where the notes split it ("signups" for "sign ups")
        const known = new Set(vocabulary().map(v => v.term));
        for (let i = 2; i <= w.length - 2 && !g.fuzzy; i++) if (known.has(w.slice(0, i)) && known.has(w.slice(i))) {
          const phrase = `"${w.slice(0, i)} ${w.slice(i)}"`, c = visibleCount(phrase);
          if (c) { g.fuzzy = phrase; g.df = c; said.push(`No note has "${w}"; searched "${w.slice(0, i)} ${w.slice(i)}" instead.`); }
        }
      }
    }
    return g;
  });
  const searchable = groups.filter(g => g.df > 0);
  for (const g of searchable) g.weight = Math.log(1 + total / g.df);
  const missing = groups.filter(g => !g.df).map(g => g.word);

  // narrowing: explicit filters, then the names, kind, tags and period the question names
  const narrow = ({ entities = true, period = true, kind = true, tags = true } = {}) => {
    const base = index.filterSql(filters), where = [...base.where], params = [...base.params]; let mention = null;
    if (entities && q.entities.length) {
      where.push(`EXISTS(SELECT 1 FROM members v WHERE v.memory=m.rowid AND v.field='entities' AND v.value IN (${q.entities.map(() => '?').join(',')}))`);
      params.push(...q.entities.map(e => JSON.stringify(e.id)));
    }
    if (kind && q.kind) { where.push('m.kind=?'); params.push(q.kind); }
    if (tags) for (const t of q.tags) { where.push("EXISTS(SELECT 1 FROM members v WHERE v.memory=m.rowid AND v.field='tags' AND lower(json_extract(v.value,'$'))=?)"); params.push(t); }
    if (period && q.period) {
      const p = q.period, range = 'm.time>=? AND m.time<?';
      if (p.mention?.length) { mention = p.mention.map(x => `"${parts(x).join(' ')}"`).join(' OR '); where.push(`((${range}) OR m.rowid IN (SELECT rowid FROM keywords WHERE keywords MATCH ?))`); params.push(p.from.getTime(), p.to.getTime(), mention); }
      else { where.push(range); params.push(p.from.getTime(), p.to.getTime()); }
    }
    return { prefix: base.prefix, where, params, mention, entities: entities && q.entities.length > 0 };
  };
  const newest = scope => db.prepare(`${scope.prefix}SELECT m.rowid AS r, m.time AS time, m.id AS id FROM memories m WHERE ${scope.where.join(' AND ')} ORDER BY m.time DESC, m.id LIMIT 2000`).all(...scope.params).map(r => ({ ...r, score: 0 }));
  const rank = scope => {
    const { prefix, where, params } = scope;
    const set = expr => new Set(db.prepare(`${prefix}SELECT m.rowid AS r FROM keywords k JOIN memories m ON m.rowid=k.rowid WHERE ${where.join(' AND ')} AND keywords MATCH ?`).all(...params, expr).map(x => x.r));
    let rows;
    if (!searchable.length) {
      if (q.terms.length) return [];   // every word is missing: the names alone come later, never all notes
      rows = newest(scope);
    } else {
      const all = searchable.map(g => g.fuzzy ? `(${g.exact}) OR (${g.fuzzy})` : g.exact).map(e => `(${e})`).join(' OR ');
      rows = db.prepare(`${prefix}SELECT m.rowid AS r, m.time AS time, m.id AS id, bm25(keywords) AS s FROM keywords k JOIN memories m ON m.rowid=k.rowid WHERE ${where.join(' AND ')} AND keywords MATCH ? ORDER BY s LIMIT 5000`).all(...params, all);
      if (!rows.length) return [];
      const exactSets = searchable.map(g => set(g.exact)), fuzzySets = searchable.map(g => g.fuzzy ? set(g.fuzzy) : new Set());
      const words = searchable.filter(g => !g.fuzzy && parts(g.word).length === 1).map(g => parts(g.word)[0]);
      // the question's adjacent words as phrases ("pocket access", "digital growth"), and the whole run of them
      const seq = q.sequence || [], pairs = seq.slice(1).map((w, i) => `"${seq[i]} ${w}"`), pairSets = pairs.map(set);
      const phrase = seq.length >= 3 ? set(`"${seq.join(' ')}"`) : new Set();
      const near = words.length >= 2 ? set(`NEAR(${words.map(ftsWord).join(' ')}, ${4 + words.length * 2})`) : new Set();
      const quoted = q.quoted.length ? set(q.quoted.map(x => `"${parts(x).join(' ')}"`).join(' AND ')) : new Set();
      const weight = searchable.reduce((a, g) => a + g.weight, 0), best = Math.min(...rows.map(r => r.s)) || -1;
      for (const row of rows) {
        let got = 0;
        searchable.forEach((g, i) => { if (exactSets[i].has(row.r)) got += g.weight; else if (fuzzySets[i].has(row.r)) got += g.weight * 0.5; });
        row.score = 20 * got / weight + pairSets.reduce((a, p) => a + (p.has(row.r) ? 4 : 0), 0) + (phrase.has(row.r) ? 6 : 0) + (near.has(row.r) ? 3 : 0) + (quoted.has(row.r) ? 8 : 0) + 3 * (row.s / best);
      }
    }
    // a calendar word ranks the notes that mention it (an event that day) above those only recorded then,
    // and "night" or "morning" the notes with an evening or morning time; tags, project and "decided" add a little
    const oneDay = q.period && q.period.to - q.period.from <= DAY + 3600000;   // a day, not a month: an event that day
    const mention = scope.mention && oneDay ? set(scope.mention) : null, part = scope.mention && DAYPART[q.period?.part];
    const linked = scope.entities && q.entities.length > 1 ? db.prepare(`SELECT count(*) AS n FROM members WHERE memory=? AND field='entities' AND value IN (${q.entities.map(() => '?').join(',')})`) : null;
    const contentOf = part ? db.prepare('SELECT content FROM memories WHERE rowid=?') : null;
    const tagWords = new Set(q.terms), tagOf = db.prepare("SELECT json_extract(value,'$') AS t FROM members WHERE memory=? AND field='tags'");
    const kindOf = q.kindHint ? db.prepare('SELECT kind FROM memories WHERE rowid=?') : null;
    for (const row of rows) {
      if (mention?.has(row.r)) row.score += 6;
      if (linked) row.score += 3 * (linked.get(row.r, ...q.entities.map(e => JSON.stringify(e.id))).n - 1);   // a note about all the names it asks about
      if (part && part.test(contentOf.get(row.r).content)) row.score += 4;
      const tags = tagOf.all(row.r).map(x => String(x.t).toLowerCase());
      if (tags.some(t => tagWords.has(t))) row.score += 2;
      if (project && tags.includes(`project:${project}`.toLowerCase())) row.score += 3;
      if (kindOf && kindOf.get(row.r)?.kind === q.kindHint) row.score += 2;
    }
    return rows.sort((a, b) => b.score - a.score || b.time - a.time || a.id.localeCompare(b.id));
  };

  const narrowing = opts => [
    ...(opts.entities !== false ? q.entities.map(e => e.name) : []), ...(opts.kind !== false && q.kind ? [`${q.kind}s`] : []),
    ...(opts.tags !== false ? q.tags.map(t => `#${t}`) : []), ...(opts.period !== false && q.period ? [q.period.label] : []),
  ];
  // Filter before text: the notes the question narrows to are ranked by its words; when none of them has the
  // words, they are shown newest first and the reply says so. Only an empty narrowing widens, one step at a time.
  const attempt = opts => {
    const scope = narrow(opts), ranked = rank(scope);
    if (ranked.length) return { rows: ranked };
    const named = narrowing(opts);
    if (!named.length || !q.terms.length) return { rows: [] };
    const plain = newest(scope);
    return plain.length ? { rows: plain, note: `None of the notes for ${named.join(', ')} mentions ${q.terms.map(w => `"${w}"`).join(', ')}; ${plain.length === 1 ? 'it follows' : 'they follow, newest first'}.` } : { rows: [] };
  };
  const steps = [{ period: false }, { period: false, kind: false }, { period: false, kind: false, tags: false }, { period: false, kind: false, tags: false, entities: false }]
    .filter((o, i, all) => narrowing(o).length < narrowing(i ? all[i - 1] : {}).length && (narrowing(o).length || q.terms.length));
  // A period, a kind or a tag never hides the note that has the question's words: when no narrowed note has
  // them, they are looked for without the period, then the kind, then the tags, and the reply says what was
  // dropped. A name stays a hard filter (its notes follow, newest first) unless it was only taken from one
  // word ("Partner" for Partner Works, a first name): then the notes with the words come instead.
  let got = { rows: [] }, widened = null, rows = [];
  if (searchable.length && narrowing({}).length) {
    for (const opts of [{}, ...steps]) {
      if (opts.entities === false && q.entities.some(e => !e.inferred && !e.via)) break;
      const ranked = rank(narrow(opts));
      if (!ranked.length) continue;
      rows = ranked;
      const dropped = narrowing({}).filter(x => !narrowing(opts).includes(x));
      if (dropped.length) widened = `${newest(narrow({})).length ? `No note for ${narrowing({}).join(', ')} has ${searchable.map(g => `"${g.word}"`).join(', ')}` : `Nothing for ${narrowing({}).join(', ')}`}; without ${dropped.join(', ')}:`;
      break;
    }
  }
  if (!rows.length) { got = attempt({}); widened = got.note || null; rows = got.rows; }
  if (!rows.length && narrowing({}).length) {
    for (const opts of steps) {
      got = attempt(opts);
      if (got.rows.length) {
        const dropped = narrowing({}).filter(x => !narrowing(opts).includes(x));
        widened = `Nothing for ${narrowing({}).join(', ')}; without ${dropped.join(', ')}:${got.note ? ' ' + got.note : ''}`;
        rows = got.rows; break;
      }
    }
  }
  if (missing.length && rows.length) said.push(`No note has ${missing.map(w => `"${w}"`).join(', ')} or a spelling one letter off; ranked by the other words.`);
  let literal = false;
  const typed = String(question).trim();
  if (rows.length && /^\S{3,300}$/.test(typed) && /[:\/_#@]/.test(typed)) {
    const scope = index.filterSql(filters);
    const exact = db.prepare(`${scope.prefix}SELECT m.rowid AS r, m.time AS time, m.id AS id FROM memories m WHERE ${[...scope.where, 'text_matches(m.projected,?)'].join(' AND ')} ORDER BY m.time DESC, m.id LIMIT 500`).all(...scope.params, JSON.stringify([typed.toLowerCase()]));
    if (exact.length) {
      const first = new Set(exact.map(r => r.r));
      rows = [...exact.map(r => ({ ...r, score: Infinity })), ...rows.filter(r => !first.has(r.r))];
      said.push(`${exact.length} note${exact.length === 1 ? ' has' : 's have'} "${typed}" as typed (an id, a tag or a source); ${exact.length === 1 ? 'it comes' : 'they come'} first.`);
    }
  }
  if (!rows.length && String(question).trim()) {
    // as typed, over every field (ids, tags, sources), the way search matched before 0.35.0
    const scope = index.filterSql(filters), text = String(question).trim().toLowerCase();
    rows = db.prepare(`${scope.prefix}SELECT m.rowid AS r, m.time AS time, m.id AS id FROM memories m WHERE ${[...scope.where, 'text_matches(m.projected,?)'].join(' AND ')} ORDER BY m.time DESC, m.id LIMIT 500`).all(...scope.params, JSON.stringify([text])).map(r => ({ ...r, score: 0 }));
    literal = rows.length > 0;
  }
  return { parsed: q, rows, total, said, widened, literal, missing, searched: groups };
}

const fetchRow = (index, rowid) => JSON.parse(index.db.prepare('SELECT projected FROM memories WHERE rowid=?').get(rowid).projected);
const age = (at, now) => { const d = Math.floor((startOfDay(now) - startOfDay(new Date(at))) / DAY); return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`; };
const clip = (s, n) => s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')} ... (${s.length - n} more characters)` : s;
const sourceLine = m => {
  const list = (m.source || []).filter(s => s.kind !== 'codex' && s.kind !== 'memory').slice(0, 2).map(s => clip(`${s.kind}:${s.ref}`, 110));
  return list.length ? list.join(', ') : (m.source || []).some(s => s.kind === 'codex') ? 'a chat' : 'none';
};
export function noteText(m, now, chars) {
  const who = [...new Set([...(m.authors || [])])].join(', ');
  return `${m.id} · ${lib.localDateTime(m.at).slice(0, 10)} (${age(m.at, now)}) · ${m.context} · ${m.kind}${who ? ` · by ${who}` : ''} · source: ${sourceLine(m)}${m.supersedes ? ` · replaces ${m.supersedes}` : ''}${m.retracts ? ` · withdraws ${m.retracts}` : ''}\n   ${clip(String(m.content).replace(/\s*\n\s*/g, ' '), chars)}`;
}

/* The short card of an entity the question names: kind, aliases, the compiled overview, the fields,
   current relationships and how old its notes are. Reads the registry entry, never writes. */
function entityCard(index, root, ref, now, registry, relationsFor) {
  const e = lib.resolveEntity(registry, ref.id) || registry.find(x => x.id === ref.id); if (!e) return '';
  const linked = index.db.prepare(`SELECT count(*) AS n, max(m.time) AS newest FROM members v JOIN memories m ON m.rowid=v.memory WHERE v.field='entities' AND v.value=? AND m.effective=1`).get(JSON.stringify(e.id));
  const head = `${e.name} · ${e.kind || 'person'}${e.subtype ? ` (${e.subtype})` : ''} · ${e.id}${e.aliases?.length ? ` · also: ${e.aliases.slice(0, 4).join(', ')}` : ''}${e.emails?.length ? ` · ${e.emails.slice(0, 2).join(', ')}` : ''} · ${linked.n} note${linked.n === 1 ? '' : 's'}${linked.newest ? `, newest ${ymd(new Date(linked.newest))} (${age(linked.newest, now)})` : ''}${ref.said && ref.said.toLowerCase() !== e.name.toLowerCase() ? ` · "${ref.said}" is ${e.name}` : ''}`;
  const out = [head];
  const overview = e._compilation?.overview?.[0];
  if (overview?.text) out.push(`  Brief: ${clip(overview.text, 420)} [${(overview.memories || []).slice(0, 3).join(', ')}]${e._fm?.compiled_at ? ` (compiled ${String(e._fm.compiled_at).slice(0, 10)})` : ''}`);
  let fields = []; try { fields = e._fm?.compiled_fields ? JSON.parse(e._fm.compiled_fields) : []; } catch {}
  const shown = (Array.isArray(fields) ? fields : []).filter(f => f && f.name && f.value != null && f.value !== '').slice(0, 6);
  if (shown.length) out.push(`  Fields: ${shown.map(f => `${f.name}: ${clip(String(f.value), 80)}`).join('; ')}`);
  const rel = relationsFor(e.id).filter(r => r.status === 'current').slice(0, 6);
  if (rel.length) out.push(`  Relations: ${rel.map(r => `${r.from.id === e.id ? '' : `${r.from.name} `}${r.type}${r.customer_status ? ` (${r.customer_status})` : ''}${r.to.id === e.id ? ' this' : ` ${r.to.name}`} (observed ${String(r.observed_at).slice(0, 10)}, ${r.memory})`).join('; ')}`);
  return out.join('\n');
}

const describeNarrowing = q => [
  ...q.entities.map(e => e.via ? `${e.name} (by its product ${e.via})` : `${e.name}${e.said.toLowerCase() !== e.name.toLowerCase() ? ` ("${e.said}")` : ''}`),
  ...(q.kind ? [`${q.kind}s`] : []), ...q.tags.map(t => `tag ${t}`),
  ...(q.period ? [`${q.period.label}${q.period.mention ? ' (recorded then or mentioning it)' : ''}`] : []),
].join(', ');

/* query (object answer): the question as asked, one reply. */
export function answerText(index, root, question, { filters = {}, limit, project = null, now = nowDate(), relationsFor = () => [] } = {}) {
  question = String(question || '').trim();
  if (!question) return 'answer needs search: the question as asked.';
  const r = searchIndex(index, question, { filters, project, now, relationsFor });
  const q = r.parsed, n = Math.max(1, Math.min(200, Number(limit) || ANSWER_NOTES));
  const maxBytes = limit ? Math.min(MAX_RESULT_BYTES, Math.max(SEARCH_MAX_BYTES, n * PER_NOTE_BYTES)) : SEARCH_MAX_BYTES;
  const out = [];
  const narrowing = describeNarrowing(q);
  const words = r.searched.map(g => g.word);
  if (!r.rows.length) {
    out.push(`Not found: no note matches "${question}" (${r.total} notes searched${narrowing ? `; narrowed to ${narrowing}` : ''}${words.length ? `; words: ${words.join(', ')}` : ''}${r.missing.length ? `; no note has ${r.missing.map(w => `"${w}"`).join(', ')} or a spelling one letter off` : ''}).`);
    const given = Object.keys(filters || {});
    out.push(given.length ? `Nothing within the filters given (${given.join(', ')}); the brain was not searched outside them. The same question without filters searches all of it.`
      : 'The brain holds nothing on this. Say so plainly; searching again with other words will not find more.');
  } else {
    out.push(`Answer for "${question}": ${r.rows.length} note${r.rows.length === 1 ? '' : 's'} match${r.rows.length === 1 ? 'es' : ''} of ${r.total}, best first${narrowing ? `; narrowed to ${narrowing}` : ''}.`);
  }
  out.push(...r.said);
  if (r.widened) out.push(r.widened);
  if (r.literal) out.push('No word matched; these notes contain the text as typed (an id, a tag or a source).');
  if (q.entities.length) {
    const registry = index.entries || lib.readNames(root);
    for (const e of q.entities.slice(0, 2)) { const card = entityCard(index, root, e, now, registry, relationsFor); if (card) out.push('', card); }
  }
  let bytes = Buffer.byteLength(out.join('\n')), shown = 0;
  const notes = [];
  for (const row of r.rows.slice(0, n)) {
    const m = fetchRow(index, row.r);
    const line = `${shown + 1}. ${noteText(m, now, shown < 3 ? FULL_NOTE_CHARS : SHORT_NOTE_CHARS)}`;
    const size = Buffer.byteLength(line) + 1;
    if (shown && bytes + size > maxBytes - 200) break;
    if (!shown) out.push('');
    out.push(line); notes.push(m); bytes += size; shown++;
  }
  const more = r.rows.length - shown;
  if (more > 0) out.push('', `${more} more match${more === 1 ? 'es' : ''}. For them: query object answer with the same search and limit ${Math.min(200, shown + Math.min(more, ANSWER_NOTES))} (the next ${Math.min(more, ANSWER_NOTES)}, a larger reply)${q.entities.length || q.period ? '' : ', or name a person, company or period to narrow'}.`);
  if (r.rows.length) {
    const ask = askSourceLines(root, notes, { day: at => lib.localDateTime(at).slice(0, 10) });
    if (ask.length) out.push('', ...ask);
    out.push('', 'Answer from these notes; a second search is needed only for a different question.');
  }
  return out.join('\n');
}

/* query (object memories, with search): the same engine, rows as JSON lines, best first, under the cap. */
export function searchRows(index, root, search, { filters = {}, limit, project = null, now = nowDate(), relationsFor = () => [] } = {}) {
  const r = searchIndex(index, search, { filters, project, now, relationsFor });
  const n = Math.max(1, Math.min(501, Number(limit) || 50));
  const maxBytes = limit ? Math.min(MAX_RESULT_BYTES, Math.max(SEARCH_MAX_BYTES, n * PER_NOTE_BYTES)) : SEARCH_MAX_BYTES;
  const lines = [], rows = []; let bytes = 0;
  for (const row of r.rows.slice(0, n)) {
    const m = fetchRow(index, row.r), line = JSON.stringify(m), size = Buffer.byteLength(line) + 1;
    if (lines.length && bytes + size > maxBytes) break;
    lines.push(line); rows.push(m); bytes += size;
  }
  const tail = [...r.said, ...(r.widened ? [r.widened] : []), ...(r.literal ? ['No word matched; these rows contain the text as typed.'] : [])];
  const more = r.rows.length - lines.length;
  if (more > 0) tail.push(`${more} more match${more === 1 ? 'es' : ''} (best first above). For more: the same search with limit ${Math.min(501, lines.length + Math.min(more, 10))} (a larger reply), or query object answer for a short form.`);
  if (!lines.length) return { text: `no rows (${r.total} notes searched${r.missing.length ? `; no note has ${r.missing.map(w => `"${w}"`).join(', ')} or a spelling one letter off` : ''}).`, rows };
  return { text: [`${lines.length} row${lines.length === 1 ? '' : 's'}:`, ...lines, ...(tail.length ? ['', ...tail] : [])].join('\n'), rows };
}

/* The worker's two operations. The registry was read with the index (MemoryIndex.entries), so no
   entity lock is taken while the cache lock is held; relationships are read only for a named entity. */
const relationsOf = (root, index) => { let overview = null; return id => { try { overview ??= relationOverview(root, { registry: index.entries }); return overview.relations.filter(r => r.from.id === id || r.to.id === id); } catch { return []; } }; };
export function answer(root, question, opts = {}) { return withMemoryIndex(root, index => answerText(index, root, question, { ...opts, relationsFor: relationsOf(root, index) })); }
export function search(root, text, opts = {}) { return withMemoryIndex(root, index => searchRows(index, root, text, { ...opts, relationsFor: relationsOf(root, index) }).text); }

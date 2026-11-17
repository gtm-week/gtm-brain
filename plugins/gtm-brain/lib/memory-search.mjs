// One search for a question, over the memory index (lib/memory-index.mjs): names, kinds, tags and
// periods narrow the notes first, then stemmed words rank what is left. A word no note has is tried
// once more as the nearest spelling in the brain's own word list (one letter off, words of five
// letters or more), ranked below exact matches and said in one line. One reply stays under a byte
// cap and ends with how many more matched. Used by query (object answer, and memories with search).
import { foldLatin } from './fold.mjs';
import * as lib from './brain.mjs';
import { MAX_RESULT_BYTES, withMemoryIndex } from './memory-index.mjs';
import { relationOverview } from './relations.mjs';
import { askSourceLines } from './ask-source.mjs';

// one reply; a larger limit raises it, up to MAX_RESULT_BYTES. A setting: GTM_BRAIN_SEARCH_MAX_BYTES (2 KB to 2 MiB).
const capSetting = Number(process.env.GTM_BRAIN_SEARCH_MAX_BYTES);
export const SEARCH_MAX_BYTES = Number.isInteger(capSetting) && capSetting >= 2048 && capSetting <= 2 * 1024 * 1024 ? capSetting : 12 * 1024;
export const ANSWER_NOTES = 8;               // notes an answer shows when no limit is given
export const ANSWER_CARDS = 5;                // entity cards an answer shows; more are read with query entities and a list
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
 focus priority priorities morning hi hello hey brief briefing prep prepare
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
    [/\b(?:later\s+)?(?:today|tonight|this\s+(?:morning|afternoon|evening))\b/i, () => ({ from: today, to: addDays(today, 1), label: 'today' })],
    [/\byesterday\b/i, () => ({ from: addDays(today, -1), to: today, label: 'yesterday' })],
    [/\b(?:in\s+the\s+)?(?:last|past)\s+(\d{1,3})\s+days\b/i, m => ({ from: addDays(today, -Number(m[1])), to: addDays(today, 1), label: `the last ${m[1]} days` })],
    [/\b(\d{1,3})\s+days\s+ago\b/i, m => day(addDays(today, -Number(m[1])), ymd(addDays(today, -Number(m[1]))))],
    // ahead: nothing is recorded then, so the notes that mention its dates are what is found
    [/\btomorrow\b/i, () => { const d = addDays(today, 1); return day(d, 'tomorrow', dateWords(d)); }],
    [/\b(this|last|past|next)\s+week\b/i, m => { const monday = addDays(today, -((today.getDay() + 6) % 7)), w = m[1].toLowerCase();
      if (w === 'next') { const from = addDays(monday, 7); return { from, to: addDays(from, 7), label: 'next week', mention: [...[0, 1, 2, 3, 4, 5, 6].flatMap(i => dateWords(addDays(from, i)))] }; }
      // this week is partly ahead: what is planned for its days is found by the dates the notes mention
      // ("what should I focus on this week?" returned only what was typed that morning; app run, 2026-11-16).
      // Its date words carry no year ("18 november"), so a note recorded more than a year before the week is
      // about another year's 18 November: since is the oldest recording time a mention counts from.
      return w === 'this' ? { from: monday, to: addDays(monday, 7), label: 'this week', ahead: true, since: addDays(monday, -365), mention: [0, 1, 2, 3, 4, 5, 6].flatMap(i => dateWords(addDays(monday, i))) } : { from: addDays(monday, -7), to: monday, label: 'last week' }; }],
    [/\b(this|last|past|next)\s+month\b/i, m => { const first = new Date(today.getFullYear(), today.getMonth(), 1), w = m[1].toLowerCase();
      if (w === 'next') { const from = new Date(today.getFullYear(), today.getMonth() + 1, 1); return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1), label: 'next month', mention: [MONTHS[from.getMonth()]] }; }
      return w === 'this' ? { from: first, to: new Date(today.getFullYear(), today.getMonth() + 1, 1), label: 'this month' } : { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: first, label: 'last month' }; }],
    [/\b(this|last|past|next)\s+quarter\b/i, m => { const w = m[1].toLowerCase(), k = Math.floor(today.getMonth() / 3) + (w === 'this' ? 0 : w === 'next' ? 1 : -1); return quarter(today.getFullYear() + Math.floor(k / 4), ((k % 4) + 4) % 4); }],
    [/\bQ([1-4])(?:\s+(\d{4}))?\b/, m => quarter(m[2] ? +m[2] : today.getFullYear(), +m[1] - 1)],
    [/\b(this|last|past)\s+year\b/i, m => m[1].toLowerCase() === 'this' ? { from: new Date(today.getFullYear(), 0, 1), to: new Date(today.getFullYear() + 1, 0, 1), label: 'this year' } : { from: new Date(today.getFullYear() - 1, 0, 1), to: new Date(today.getFullYear(), 0, 1), label: 'last year' }],
    // "may" and "march" are verbs too: a month only after in/during/since/of/until, or before a year
    [new RegExp(`\\b(?:(in|during|since|of|until|for|from)\\s+)?${MONTH_RE}\\b(?:\\s+(\\d{4}))?`, 'i'), m => {
      const word = m[2].toLowerCase();
      if (['may', 'mar', 'march'].includes(word) && !m[1] && !m[3]) return null;
      if (!m[1] && !m[3] && isName(m[2])) return null;   // Jan, April, June, August: a person in the registry comes first
      const i = monthIndex(word); let y = m[3] ? +m[3] : today.getFullYear();
      if (!m[3] && i > today.getMonth()) y--;
      if (m[1]?.toLowerCase() === 'since') return { from: new Date(y, i, 1), to: addDays(today, 1), label: `since ${cap(MONTHS[i])} ${y}` };
      return { from: new Date(y, i, 1), to: new Date(y, i + 1, 1), label: `${cap(MONTHS[i])} ${y}`, mention: [MONTHS[i]] };
    }],
    [/\b(?:(last|this|on|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(night|evening|morning|afternoon))?\b/i, m => {
      const i = WEEKDAYS.indexOf(m[2].toLowerCase());
      const back = (today.getDay() - i + 7) % 7 || (m[1]?.toLowerCase() === 'last' ? 7 : 0);
      const d = m[1]?.toLowerCase() === 'next' ? addDays(today, (i - today.getDay() + 7) % 7 || 7) : addDays(today, -back);
      return { ...day(d, `${cap(WEEKDAYS[i])} ${ymd(d)}`, [WEEKDAYS[i]]), part: m[3]?.toLowerCase() || null, weekday: m[1]?.toLowerCase() || '' };
    }],
    [/\b(?:in|during)\s+(\d{4})\b/, m => ({ from: new Date(+m[1], 0, 1), to: new Date(+m[1] + 1, 0, 1), label: m[1] })],
  ];
  function dateWords(d) { return [`${d.getDate()} ${MONTHS[d.getMonth()]}`, `${MONTHS[d.getMonth()]} ${d.getDate()}`, ymd(d)]; }
  function quarter(y, k) { return { from: new Date(y, k * 3, 1), to: new Date(y, k * 3 + 3, 1), label: `Q${k + 1} ${y}` }; }
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
const fold = foldLatin;   // also the letters NFD does not split (ł, ø, ß): lib/fold.mjs
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
  // a greeting is no search word: "Good morning, what should I focus on this week?" searched for "good"
  rest = rest.replace(/\bgood\s+(?:morning|afternoon|evening|day)\b/gi, ' ');
  let { period, rest: left } = parsePeriod(rest, now, w => !!lib.canonicalName(names, w)); rest = left;
  const tokens = words(rest), used = new Array(tokens.length).fill(false), entities = [], ambiguous = [];
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
      if (!hit && n === 1 && /^\p{Lu}/u.test(text) && text.length >= 3) {   // a first name two or more entities share: said, not guessed
        const w = text.toLowerCase(), same = names.filter(e => e.name.toLowerCase().split(/\s+/)[0] === w || (e.aliases || []).some(a => a.toLowerCase().split(/\s+/)[0] === w));
        if (same.length > 1 && !ambiguous.some(a => a.said === text)) ambiguous.push({ said: text, names: same.slice(0, 4).map(e => e.name), more: Math.max(0, same.length - 4) });
      }
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
  // Getting ready for a call with someone known ("I have a call with Acme tomorrow, brief me"): the day of the
  // call is when the answer is needed, not which notes to read. Their newest notes are the brief, so neither the
  // day nor the words "call" and "meeting" narrow them (app run, 2026-11-16: one note came back out of twelve).
  // The asking itself is no search word either: "get ready", "help me prepare", "I need a briefing".
  // The day is ahead when it has not ended: tomorrow, a date to come, today ("a call today", "later this afternoon"),
  // and this week on any of its days. A weekday named in such a question is the coming one ("on Friday", "this
  // Friday"), not the last, unless it says last. A question in the past tense ("what did Acme say this week, brief
  // me") is about what was recorded, so there today and this week stay periods.
  const past = /\b(did|was|were|had|happened|decided|saved|said|told|agreed|went)\b/i.test(String(question));
  const asksPrep = entities.length > 0 && /\b(brief(?:ing)?|prep(?:are)?|get ready|ready for)\b/i.test(String(question));
  const today = startOfDay(now);
  let when = period;
  if (asksPrep && !past && when?.weekday !== undefined && when.weekday !== 'last' && when.from < today) { const d = addDays(when.from, 7); when = { ...when, from: d, to: addDays(d, 1), label: `${cap(WEEKDAYS[d.getDay()])} ${ymd(d)}` }; }
  const prep = asksPrep && !!when && when.to > now && (when.mention ? when.from >= today || (!!when.ahead && !past) : when.label === 'today' && !past);
  if (prep) period = when;
  if (prep) return { entities, ambiguous, kind, kindHint, tags, period: null, prep: period.label, terms: [...new Set(terms)].filter(w => !/^(call|calls|meeting|meetings|chat|sync|ready|help|need)$/.test(w)), quoted: quoted.map(fold), sequence };
  return { entities, ambiguous, kind, kindHint, tags, period, terms: [...new Set(terms)], quoted: quoted.map(fold), sequence, ...(past ? { past } : {}) };
}

const parts = w => w.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
// a rough common stem, for matching a question's word to a relationship type or a name's word
// (partners, partnership and partner_of; works and works_at; customers and customer)
const stemish = w => { let x = String(w).toLowerCase(); for (let i = 0; i < 2; i++) x = x.length > 4 ? x.replace(/(?:ships?|ments?|ings?|ers?|ors?|ed|es|s)$/, '') : x; return x; };
const REL_STOP = new Set(['of', 'at', 'in', 'to', 'for', 'with', 'by', 'on', 'is', 'has', 'a', 'the']);
const CUSTOMER_WORDS = new Set(['custom', 'prospect', 'client', 'churn', 'churned', 'former', 'lead'].map(stemish));
// The full-text forms of one word: itself, or for a hyphenated or dotted word the words in a row and
// the word written together ("sign-ups": sign ups, signups).
function forms(w) {
  const p = parts(w);
  if (p.length <= 1) return [ftsWord(p[0] || w)];
  return [`"${p.join(' ')}"`, ftsWord(p.join(''))];
}

/* Run a parsed question against an open, synced MemoryIndex. Returns ranked rows and what was done. */
export function searchIndex(index, question, { filters = {}, project = null, now = nowDate(), parsed = null, relationsFor = () => [], everyWord = false } = {}) {
  const db = index.db;
  const q = parsed || parseQuestion(question, index.names, { now });
  // a memories search made only of words a question drops ("current", "more") is a search for those words
  if (everyWord && !q.terms.length && !q.entities.length && !q.kind && !q.tags.length && !q.period) q.terms = [...new Set(words(question).map(fold).filter(w => w.length >= 2))];
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
  let spelled = null;
  const spellings = () => {
    if (spelled) return spelled; spelled = new Map();
    try { for (const { term } of db.prepare('SELECT term FROM keywords_vocab').all()) { if (/^[\x00-\x7f]*$/.test(term)) continue; const f = foldLatin(term); if (f !== term) spelled.set(f, [...(spelled.get(f) || []), term]); } } catch {}
    return spelled;
  };
  // each word: its forms; a word no visible note has (five letters or more) gets its nearest spellings
  const groups = q.terms.map(w => {
    const exact = forms(w).join(' OR ');
    const g = { word: w, exact, fuzzy: null, weight: 1 };
    let n = 0; try { n = visibleCount(exact); } catch { g.exact = ftsWord(parts(w).join(' ')); n = visibleCount(g.exact); }
    // the same word written with other letters ("lukasz" for "Łukasz", "soren" for "Søren"): the index keeps a note's
    // own spelling, so the spellings that fold to this word are searched with it, as exact matches
    if (/^[a-z]+$/.test(w)) {
      // the index stems its words, so a folded spelling may be the word less its ending ("invalidenstrass" for "invalidenstrasse")
      const other = [...spellings()].filter(([f]) => f === w || (f.length >= 5 && w.startsWith(f) && w.length - f.length <= 3)).flatMap(([, terms]) => terms);
      if (other.length) { g.exact = `${g.exact} OR ${other.map(ftsWord).join(' OR ')}`; try { n = visibleCount(g.exact); } catch {} }
    }
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
  const nameStems = new Set(q.entities.flatMap(e => { const x = (index.entries || []).find(y => y.id === e.id); return [x?.name || e.name, ...(x?.aliases || [])].flatMap(n => parts(fold(n))).map(stemish); }));
  for (const g of searchable) g.weight = Math.log(1 + total / g.df) * (parts(g.word).every(w => nameStems.has(stemish(w))) ? 0.2 : 1);
  // relationship types and customer status the question's words name, for stateRows
  const termStems = new Set(q.terms.flatMap(parts).map(stemish));
  let types = null;
  const askedTypes = () => types ??= db.prepare("SELECT DISTINCT json_extract(raw,'$.relation.type') AS t FROM memories WHERE json_extract(raw,'$.relation.type') IS NOT NULL").all().map(x => String(x.t))
    .filter(t => t.split(/[^a-z0-9]+/i).filter(w => w && !REL_STOP.has(w.toLowerCase())).some(w => termStems.has(stemish(w.toLowerCase()))));
  const askedCustomer = [...termStems].some(w => CUSTOMER_WORDS.has(w));
  const stateRows = scope => {
    if (!scope.entities) return [];
    const kinds = askedTypes(), clauses = [];
    if (kinds.length) clauses.push(`json_extract(m.raw,'$.relation.type') IN (${kinds.map(() => '?').join(',')})`);
    if (askedCustomer) clauses.push("json_extract(m.raw,'$.customer') IS NOT NULL");
    if (!clauses.length) return [];
    return db.prepare(`${scope.prefix}SELECT m.rowid AS r, m.time AS time, m.id AS id FROM memories m WHERE ${[...scope.where, `(${clauses.join(' OR ')})`].join(' AND ')} ORDER BY m.time DESC LIMIT 200`).all(...scope.params, ...kinds);
  };
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
      if (p.mention?.length) { mention = p.mention.map(x => `"${parts(x).join(' ')}"`).join(' OR '); where.push(`((${range}) OR (m.time>=? AND m.rowid IN (SELECT rowid FROM keywords WHERE keywords MATCH ?)))`); params.push(p.from.getTime(), p.to.getTime(), p.since ? p.since.getTime() : 0, mention); }
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
      // the named entity's notes that record the relationship the question asks about ("a partner": its
      // partner_of notes, "a customer": its customer status), though they may use another word for it
      const states = stateRows(scope), have = new Set(rows.map(x => x.r));
      for (const x of states) if (!have.has(x.r)) rows.push({ ...x, s: 0 });
      if (!rows.length) return [];
      const exactSets = searchable.map(g => set(g.exact)), fuzzySets = searchable.map(g => g.fuzzy ? set(g.fuzzy) : new Set());
      const words = searchable.filter(g => !g.fuzzy && parts(g.word).length === 1).map(g => parts(g.word)[0]);
      // the question's adjacent words as phrases ("pocket access", "digital growth"), and the whole run of them
      const seq = q.sequence || [], pairs = seq.slice(1).map((w, i) => `"${seq[i]} ${w}"`), pairSets = pairs.map(set);
      const phrase = seq.length >= 3 ? set(`"${seq.join(' ')}"`) : new Set();
      const near = words.length >= 2 ? set(`NEAR(${words.map(ftsWord).join(' ')}, ${4 + words.length * 2})`) : new Set();
      const quoted = q.quoted.length ? set(q.quoted.map(x => `"${parts(x).join(' ')}"`).join(' AND ')) : new Set();
      const stateHit = new Set(states.map(x => x.r));
      const weight = searchable.reduce((a, g) => a + g.weight, 0), best = Math.min(...rows.map(r => r.s)) || -1;
      for (const row of rows) {
        let got = 0;
        searchable.forEach((g, i) => { if (exactSets[i].has(row.r)) got += g.weight; else if (fuzzySets[i].has(row.r)) got += g.weight * 0.5; });
        if (stateHit.has(row.r)) got += weight * 0.6;
        row.score = 20 * got / weight + pairSets.reduce((a, p) => a + (p.has(row.r) ? 4 : 0), 0) + (phrase.has(row.r) ? 6 : 0) + (near.has(row.r) ? 3 : 0) + (quoted.has(row.r) ? 8 : 0) + 3 * (row.s / best);
      }
    }
    // a calendar word ranks the notes that mention it (an event that day) above those only recorded then,
    // and "night" or "morning" the notes with an evening or morning time; tags, project and "decided" add a little
    const oneDay = q.period && q.period.to - q.period.from <= DAY + 3600000;   // a day, not a month: an event that day
    // A week partly ahead ranks them first only for a question that looks ahead: "what did we decide this week"
    // is about what was recorded, and a note that only mentions one of its dates must not come above that.
    const mention = scope.mention && (oneDay || (q.period?.ahead && !q.past)) ? set(scope.mention) : null, part = scope.mention && DAYPART[q.period?.part];
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
  rows = currentFirst(index, rows);
  return { parsed: q, rows, total, said, widened, literal, missing, searched: groups };
}

/* Current over superseded, for a state a note records (a relationship, a customer status): when a later
   note of the same relationship or company says otherwise, the old note sinks, says so, and the later
   one is shown right after it, so an answer never stops at a status that has since changed. The same
   choice as lib/relations.mjs and lib/customers.mjs: the latest note the person confirmed, else the
   latest observed. One scan of the notes that record a state, only when a top row records one. */
const LOOK = 60;
const stateOf = (index, m) => {
  const id = v => v === 'us' ? 'us' : (lib.resolveEntity(index.entries || index.names, v)?.id || v);
  if (m?.relation?.type && m.relation.from && m.relation.to) return { key: `r ${id(m.relation.from)} ${m.relation.type} ${id(m.relation.to)}`, what: m.relation.type, status: m.relation.status, basis: m.relation.basis, observed: m.relation.observed_at || m.at };
  if (m?.customer?.entity && m.customer.status) return { key: `c ${id(m.customer.entity)}`, what: 'customer status', status: m.customer.status, basis: m.customer.basis, observed: m.customer.observed_at || m.at };
  return null;
};
const laterState = (c, was) => {
  const cu = c.basis === 'user', wu = was.basis === 'user';
  if (cu !== wu) return cu;
  const d = cu ? Date.parse(c.at) - Date.parse(was.at) : Date.parse(c.observed) - Date.parse(was.observed) || Date.parse(c.at) - Date.parse(was.at);
  return d > 0 || (d === 0 && c.id > was.id);
};
function currentFirst(index, rows) {
  if (!rows.length) return rows;
  const db = index.db, get = db.prepare("SELECT json_extract(raw,'$.relation') AS r, json_extract(raw,'$.customer') AS c, at FROM memories WHERE rowid=?");
  const parse = x => { try { return x ? JSON.parse(x) : null; } catch { return null; } };
  const top = rows.slice(0, LOOK).map(row => { const x = get.get(row.r); return { row, state: x && stateOf(index, { relation: parse(x.r), customer: parse(x.c), at: x.at }) }; }).filter(x => x.state);
  if (!top.length) return rows;
  const scope = index.filterSql({});
  const chosen = new Map();
  for (const x of db.prepare(`${scope.prefix}SELECT m.rowid AS r, m.id AS id, m.time AS time, m.at AS at, json_extract(m.raw,'$.relation') AS rel, json_extract(m.raw,'$.customer') AS cus FROM memories m WHERE ${[...scope.where, "(json_extract(m.raw,'$.relation') IS NOT NULL OR json_extract(m.raw,'$.customer') IS NOT NULL)"].join(' AND ')}`).all(...scope.params)) {
    const st = stateOf(index, { relation: parse(x.rel), customer: parse(x.cus), at: x.at }); if (!st) continue;
    const c = { r: x.r, id: x.id, time: x.time, at: x.at, ...st }, was = chosen.get(st.key);
    if (!was || laterState(c, was)) chosen.set(st.key, c);
  }
  const at = new Map(rows.map((row, i) => [row.r, i])), after = new Map();
  for (const { row, state } of top) {
    const c = chosen.get(state.key);
    if (!c || c.r === row.r || c.status === state.status) continue;
    row.later = { what: state.what, status: c.status, observed: String(c.observed).slice(0, 10), id: c.id };
    row.score = (row.score === Infinity ? row.score : (row.score || 0) - 15);
    if (!at.has(c.r) || at.get(c.r) >= LOOK) after.set(row.r, { r: c.r, id: c.id, time: c.time, score: row.score });
  }
  const sorted = rows.filter(row => !after.size || ![...after.values()].some(x => x.r === row.r)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.time - a.time || a.id.localeCompare(b.id));
  const out = [], seen = new Set();
  for (const row of sorted) {
    if (seen.has(row.r)) continue;
    out.push(row); seen.add(row.r);
    const next = after.get(row.r); if (next && !seen.has(next.r)) { out.push(next); seen.add(next.r); }
  }
  return out;
}

const fetchRow = (index, rowid) => JSON.parse(index.db.prepare('SELECT projected FROM memories WHERE rowid=?').get(rowid).projected);
const age = (at, now) => { const d = Math.floor((startOfDay(now) - startOfDay(new Date(at))) / DAY); return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`; };
const clip = (s, n) => s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')} ... (${s.length - n} more characters)` : s;
const sourceLine = m => {
  const list = (m.source || []).filter(s => s.kind !== 'codex' && s.kind !== 'memory').slice(0, 2).map(s => clip(`${s.kind}:${s.ref}`, 110));
  return list.length ? list.join(', ') : (m.source || []).some(s => s.kind === 'codex') ? 'a chat' : 'none';
};
export function noteText(m, now, chars, later = null) {
  const who = [...new Set([...(m.authors || [])])].join(', ');
  return `${m.id} · ${lib.localDateTime(m.at).slice(0, 10)} (${age(m.at, now)}) · ${m.context} · ${m.kind}${who ? ` · by ${who}` : ''} · source: ${sourceLine(m)}${m.supersedes ? ` · replaces ${m.supersedes}` : ''}${m.retracts ? ` · withdraws ${m.retracts}` : ''}${later ? ` · no longer current: ${later.what} ${later.status} ${later.observed} (${later.id})` : ''}\n   ${clip(String(m.content).replace(/\s*\n\s*/g, ' '), chars)}`;
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
  const ended = relationsFor(e.id).filter(r => r.status === 'ended').sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at))).slice(0, 3);
  if (ended.length) out.push(`  Ended: ${ended.map(r => `${r.from.id === e.id ? '' : `${r.from.name} `}${r.type}${r.to.id === e.id ? ' this' : ` ${r.to.name}`} (${String(r.observed_at).slice(0, 10)}, ${r.memory})`).join('; ')}`);
  if (rel.length) out.push(`  Relations: ${rel.map(r => `${r.from.id === e.id ? '' : `${r.from.name} `}${r.type}${r.customer_status ? ` (${r.customer_status})` : ''}${r.to.id === e.id ? ' this' : ` ${r.to.name}`} (observed ${String(r.observed_at).slice(0, 10)}, ${r.memory})`).join('; ')}`);
  return out.join('\n');
}

const describeNarrowing = q => [
  ...q.entities.map(e => e.via ? `${e.name} (by its product ${e.via})` : `${e.name}${e.said.toLowerCase() !== e.name.toLowerCase() ? ` ("${e.said}")` : ''}`),
  ...(q.kind ? [`${q.kind}s`] : []), ...q.tags.map(t => `tag ${t}`),
  ...(q.period ? [`${q.period.label}${q.period.mention ? ' (recorded then or mentioning it)' : ''}`] : []),
].join(', ');

/* The reply's last line keeps the model in the brain. Two runs in the Codex app on 2026-11-16: asked for a short
   invitation to a workshop, Codex read the notes and the voice document, then searched the web three and six
   times for the event's public page, whose address the notes carried as a source. Core rule 5 names a person
   or a company only, and the old last line asked for one to three sentences with a fact, which a draft is not. */
const NO_WEB = 'What these notes do not hold is not recorded: nothing is looked up on the web and no source link above is opened unless the person asks for exactly that.';
const DRAFT_CLOSE = 'A draft is asked for: write it now from these notes and the document this kind of work follows, at the length asked. Nothing is looked up on the web and no source link above is opened for a draft unless the person asks for exactly that: a detail these notes do not hold (an agenda, a time, a link) is left out of the draft, and one line after the draft says what is missing.';
const DRAFT_PIECE = /\b(?:messages?|dm|e-?mails?|mail|invitations?|invites?|inviting|posts?|repl(?:y|ies)|follow-?ups?|outreach|copy|announcements?|newsletters?|captions?|intros?|introductions?|pitch|text|letter|headline|tagline|bio|script)\b/i;
const DRAFT_ASK = /^\W*(?:(?:please|can you|could you|would you|help me|i need you to|i want you to|let'?s)\W+)*(?:draft|write|compose|reword|rewrite)\b/i;
/* A request to write a piece of text (a message, a post, an email), as opposed to a question about one. */
export const asksForDraft = question => { const q = String(question || ''); return /\bdraft (?:me |us )?(?:an?|the|our|my|some|\d+|two|three)\b/i.test(q) || (DRAFT_ASK.test(q) && DRAFT_PIECE.test(q)); };

/* A question about a whole kind ("what events did we organize?", "which tools do we use?") that names no entity
   is answered by the entities of that kind first: registered once, they are the list, and the notes under them are
   only what matched the words. Without this the answer was pieced together from every note that names an event
   (a real brain, 2026-11-16: 237 notes read, 54 seconds). Empty when the brain has none of the kind. */
const KIND_LISTS = [['event', /\bevents\b/i, 'Events'], ['product', /\bproducts\b/i, 'Products'], ['offering', /\bofferings\b/i, 'Offerings'], ['tool', /\btools\b/i, 'Tools']];
export const KIND_LIST_MAX = 25;
function kindList(index, root, question, q, now, maxBytes = SEARCH_MAX_BYTES) {
  if (q.entities.length) return [];
  const asked = KIND_LISTS.find(([, re]) => re.test(question)); if (!asked) return [];
  const [kind, , title] = asked, all = (index.entries || lib.readNames(root)).filter(e => e.kind === kind && e.status !== 'archived');
  if (!all.length) return [];
  const count = index.db.prepare(`SELECT count(*) AS n, max(m.time) AS newest FROM members v JOIN memories m ON m.rowid=v.memory WHERE v.field='entities' AND v.value=? AND m.effective=1`);
  const rows = all.map(e => { const linked = count.get(JSON.stringify(e.id)); let fields = []; try { fields = e._fm?.compiled_fields ? JSON.parse(e._fm.compiled_fields) : []; } catch {}
    return { e, n: linked.n, newest: linked.newest || 0, fields: (Array.isArray(fields) ? fields : []).filter(f => f && f.field && f.text).slice(0, 3) }; })
    .sort((a, b) => b.newest - a.newest || a.e.name.localeCompare(b.e.name));
  // each one's newest notes ride along (its date, what we did there), fewer when the list is long, so no read per event follows
  const newest = index.db.prepare(`SELECT m.rowid AS r FROM members v JOIN memories m ON m.rowid=v.memory WHERE v.field='entities' AND v.value=? AND m.effective=1 ORDER BY m.time DESC LIMIT ?`), per = rows.length > 12 ? 1 : 2;
  // the list takes at most 60% of the reply's cap: the notes that matched the words still follow it
  const shown = []; let bytes = 0, listedN = 0;
  for (const x of rows.slice(0, KIND_LIST_MAX)) {
    const block = [`- ${x.e.name} · ${x.e.id}${x.e.aliases?.length ? ` · also: ${x.e.aliases.slice(0, 2).join(', ')}` : ''}${x.fields.length ? ` · ${x.fields.map(f => `${f.field}: ${clip(String(f.text), 60)}`).join('; ')}` : ''} · ${x.n} note${x.n === 1 ? '' : 's'}${x.newest ? `, newest ${ymd(new Date(x.newest))} (${age(x.newest, now)})` : ''}`,
      ...newest.all(JSON.stringify(x.e.id), per).map(n => fetchRow(index, n.r)).map(m => `    ${m.id} · ${lib.localDateTime(m.at).slice(0, 10)}: ${clip(String(m.content).replace(/\s*\n\s*/g, ' '), 200)}`)];
    const size = Buffer.byteLength(block.join('\n')) + 1;
    if (listedN && bytes + size > maxBytes * 0.6) break;
    shown.push(...block); bytes += size; listedN++;
  }
  return [`${title} in the brain (${rows.length}), each registered once, with ${per === 1 ? 'its newest note' : 'its two newest notes'}; this list is the base of the answer:`,
    ...shown,
    ...(rows.length > listedN ? [`${rows.length - listedN} more: query object entities with filters.kind ${kind}.`] : []),
    `Answer from this list; what a note above does not say about one (its date, whether we ran, sponsored or attended it) is not recorded. All notes of one: query object answer with its name.`];
}

/* Everything recorded (win-a): the answer reply carries all of the brain the question can need, so the structured
   brain never knows less than the same notes in one flat file. Measured on real Codex, a chat calls query answer
   and nothing else: no entity page read, no grep, no second search. So a small brain (every note in about 40,000
   characters of compact lines) comes back whole, oldest to newest; a larger one brings every note of each entity
   the question names, then every note one of its other words, a date in the period it asks about or the kind it
   asks for matches (stems and prefixes, any of the words), within the same budget, and says in one line how to
   get what did not fit in one more call. */
const capWhole = Number(process.env.GTM_BRAIN_ANSWER_MAX_BYTES);
export const ANSWER_ALL_BYTES = Number.isInteger(capWhole) && capWhole >= 4096 && capWhole <= MAX_RESULT_BYTES ? capWhole : 40000;
const LONG_NOTE_CHARS = 6000;
const BEST_NOTE_CHARS = 240;   // a best match is a pointer; its full text is in the list   // one note (a transcript) is cut here in a larger brain; its full text is one sql read
const oneLineText = m => String(m.content ?? '').replace(/\s*\n\s*/g, ' ').trim();
/* A compact line: date it was recorded · context · kind · who · full text · id (and what it replaces or withdraws). */
export function compactLine(m, chars = Infinity) {
  const who = [...new Set([...(m.authors || []), ...(m.people || [])])].slice(0, 4).join(', ');
  const text = oneLineText(m);
  return `- ${lib.localDateTime(m.at).slice(0, 10)} · ${m.context} · ${m.kind}${who ? ` · ${who}` : ''} · ${chars < text.length ? clip(text, chars) : text} · ${m.id}${m.supersedes ? ` (replaces ${m.supersedes})` : ''}${m.retracts ? ` (withdraws ${m.retracts})` : ''}`;
}
const MONTH_WORD = new RegExp(`\\b${MONTH_RE}\\.?\\b`, 'gi');
/* The days a note's text names: 2026-11-14, 14 November (2026), November 14, November 2026, 14.11.2026, 14/11/2026.
   A date without a year takes the year of the note, or the next one when that day is more than a month before it. */
export function datesInText(text, at) {
  const t = String(text), base = new Date(at), out = [];
  const year = (y, mo, d) => { if (y) return Number(y); const guess = new Date(base.getFullYear(), mo, d || 1); return guess < addDays(base, -31) ? base.getFullYear() + 1 : base.getFullYear(); };
  for (const m of t.matchAll(/\b(20\d\d)-(\d\d)(?:-(\d\d))?\b/g)) out.push({ y: +m[1], mo: +m[2] - 1, d: m[3] ? +m[3] : null });
  for (const m of t.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](20\d\d)\b/g)) out.push({ y: +m[3], mo: +m[2] - 1, d: +m[1] });
  for (const m of t.matchAll(new RegExp(`\\b(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?)?${MONTH_RE}\\.?(?:\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b)?(?:,?\\s+(20\\d\\d))?`, 'gi'))) {
    const mo = monthIndex(m[2]); if (mo < 0) continue;
    if (/^may$/i.test(m[2]) && !m[1] && !m[3] && !m[4]) continue;   // "may" alone is a verb
    const d = m[1] ? +m[1] : m[3] ? +m[3] : null;
    out.push({ y: year(m[4], mo, d), mo, d });
  }
  return out.filter(x => x.mo >= 0 && x.mo < 12);
}
const inPeriod = (dates, p) => dates.some(x => { const from = new Date(x.y, x.mo, x.d || 1), to = x.d ? addDays(from, 1) : new Date(x.y, x.mo + 1, 1); return from < p.to && to > p.from; });
/* A question word's forms for a generous match: the stem and, for a longer word, its first five letters. */
const looseForms = w => { const f = fold(w).toLowerCase(), st = stemish(f); return [...new Set([f, st, ...(st.length >= 6 ? [st.slice(0, 5)] : [])])].filter(x => x.length >= 3); };
const noteWords = text => new Set((fold(String(text)).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []));
const matchesForm = (bag, form) => { if (bag.has(form)) return true; for (const w of bag) if (w.startsWith(form)) return true; return false; };

function everythingRecorded(index, root, question, q, r, filters, now, budget = ANSWER_ALL_BYTES) {
  const scope = index.filterSql(filters || {});
  const all = index.db.prepare(`${scope.prefix}SELECT m.rowid AS r FROM memories m WHERE ${scope.where.join(' AND ')} ORDER BY m.time ASC, m.id ASC`).all(...scope.params).map(x => x.r);
  const notes = all.map(rowid => ({ rowid, m: fetchRow(index, rowid) }));
  const lines = notes.map(n => compactLine(n.m));
  const total = lines.reduce((a, l) => a + Buffer.byteLength(l) + 1, 0);
  if (total <= budget) return { whole: true, header: `Everything recorded in the brain: all ${notes.length} current note${notes.length === 1 ? '' : 's'}, oldest to newest (replaced and withdrawn notes left out). Each line: date recorded · context · kind · who · text · id.`, lines, notes: notes.map(n => n.m) };
  // larger brain: every note of each named entity first, then everything the other words, the period or the kind match
  const chosen = new Map(), out = []; let bytes = 0; const left = [];
  const add = (n, section) => {
    if (chosen.has(n.rowid)) return true;
    const line = compactLine(n.m, LONG_NOTE_CHARS), size = Buffer.byteLength(line) + 1;
    if (bytes + size > budget) { left.push(n.m.id); chosen.set(n.rowid, false); return false; }
    if (section && !out.includes(section)) out.push('', section);
    out.push(line); chosen.set(n.rowid, true); bytes += size; return true;
  };

  const member = index.db.prepare(`SELECT v.memory AS r FROM members v WHERE v.field='entities' AND v.value=?`);
  for (const e of q.entities) {
    const rows = new Set(member.all(JSON.stringify(e.id)).map(x => x.r));
    const own = notes.filter(n => rows.has(n.rowid));
    const title = `Every note about ${e.name} (${own.length}), oldest to newest:`;
    for (const n of own) add(n, title);
  }
  const forms = (q.terms || []).filter(w => !/^\d+$/.test(w)).map(looseForms).filter(f => f.length);
  const scored = [];
  const ranked = new Map(r.rows.map((row, i) => [row.r, i]));
  for (const n of notes) {
    if (chosen.has(n.rowid)) continue;
    const bag = noteWords(`${n.m.content} ${(n.m.tags || []).join(' ')}`);
    let score = forms.filter(f => f.some(x => matchesForm(bag, x))).length;
    if (q.kind && n.m.kind === q.kind) score += 2;
    if (q.kindHint && n.m.kind === q.kindHint) score += 1;
    if (q.period) { const at = new Date(n.m.at); if ((at >= q.period.from && at < q.period.to) || inPeriod(datesInText(n.m.content, n.m.at), q.period)) score += 3; }
    if (ranked.has(n.rowid)) score += 1;
    if (score > 0) scored.push({ n, score });
  }
  scored.sort((a, b) => b.score - a.score || a.n.m.at.localeCompare(b.n.m.at));
  const words = [...(q.terms || []), ...(q.period ? [q.period.label] : []), ...(q.kind ? [`${q.kind}s`] : [])];
  const title = `Every other note matching ${words.length ? words.map(w => `"${w}"`).join(', ') : 'the question'} (any of the words, stems and prefixes${q.period ? ', the period in the record date or a date in the text' : ''}; ${scored.length}), most matched first:`;
  for (const x of scored) add(x.n, title);
  return { whole: false, header: `The brain holds ${notes.length} current notes, more than one reply; below is everything about what the question names and every note its words match.`, lines: out, notes: notes.filter(n => chosen.get(n.rowid)).map(n => n.m), left, matched: scored.length };
}

/* query (object answer): the question as asked, one reply. */
export function answerText(index, root, question, { filters = {}, limit, project = null, now = nowDate(), relationsFor = () => [] } = {}) {
  question = String(question || '').trim();
  if (!question) return 'answer needs search: the question as asked.';
  const r = searchIndex(index, question, { filters, project, now, relationsFor });
  const q = r.parsed;
  const out = [];
  const listed = kindList(index, root, question, q, now, ANSWER_ALL_BYTES * 0.3);
  const narrowing = describeNarrowing(q), words = r.searched.map(g => g.word);
  if (!r.total && !listed.length) {
    const given = Object.keys(filters || {});
    out.push(given.length ? `Not found: no note within the filters given (${given.join(', ')}); the brain was not searched outside them. The same question without filters reads all of it.`
      : 'Not found: the brain holds no notes yet. Say so plainly.');
    return out.join('\n');
  }
  if (!r.rows.length && listed.length) out.push(`Answer for "${question}": no note matches the words, and the brain has the list below (${r.total} notes searched).`);
  else if (!r.rows.length && !q.entities.length) {
    out.push(`Not found: no note matches "${question}" (${r.total} notes searched${narrowing ? `; narrowed to ${narrowing}` : ''}${words.length ? `; words: ${words.join(', ')}` : ''}${r.missing.length ? `; no note has ${r.missing.map(w => `"${w}"`).join(', ')} or a spelling one letter off` : ''}).`);
    const given = Object.keys(filters || {});
    out.push(given.length ? `Nothing matched within the filters given (${given.join(', ')}); the brain was not searched outside them, and the notes below are only those within them. The same question without filters reads all of it.`
      : 'The notes below are everything the brain holds that could bear on it (the whole brain when it is small): if none of them answers the question, say plainly that the brain holds nothing on this.');
  } else if (r.rows.length) out.push(`Answer for "${question}": ${r.rows.length} note${r.rows.length === 1 ? '' : 's'} match${r.rows.length === 1 ? 'es' : ''} of ${r.total}, best first${narrowing ? `; narrowed to ${narrowing}` : ''}.`);
  else out.push(`Answer for "${question}": no note matches the words${narrowing ? `; about ${narrowing}` : ''}; everything recorded about what it names is below.`);
  out.push(...r.said);
  if (r.widened) out.push(r.widened);
  if (r.literal) out.push('No word matched; the best matches contain the text as typed (an id, a tag or a source).');
  for (const a of q.ambiguous || []) out.push(`"${a.said}" could be ${a.names.join(' or ')}${a.more ? ` (and ${a.more} more)` : ''}; the notes below match the word, not one of them. If it matters, ask which one.`);
  if (q.entities.length) {
    const registry = index.entries || lib.readNames(root);
    for (const e of q.entities.slice(0, ANSWER_CARDS)) { const card = entityCard(index, root, e, now, registry, relationsFor); if (card) out.push('', card); }
    if (q.entities.length > 2) {
      const none = q.entities.slice(0, ANSWER_CARDS).map(e => registry.find(x => x.id === e.id)).filter(e => e && (e.kind || 'person') === 'person' && !relationsFor(e.id).some(r => r.type === 'works_at' && r.from.id === e.id && r.status === 'current')).map(e => e.name);
      out.push('', `Each one named has its card above${none.length ? `; no employer is recorded as a relationship for ${none.join(', ')} (a brief or a note below may name one: say it as written, else say it is not recorded)` : ''}. The cards and the notes below are what the brain holds on them: no brief or search per person is needed.`);
    }
    if (q.entities.length > ANSWER_CARDS) out.push('', `${q.entities.length - ANSWER_CARDS} more named (${q.entities.slice(ANSWER_CARDS, ANSWER_CARDS + 8).map(e => e.name).join(', ')}): their cards in one call, query object entities with filters.name as a list.`);
  }
  if (listed.length) out.push('', ...listed);
  // the best matches for the question's words first, short, as pointers into the full list below (the list is the answer)
  const n = Math.max(1, Math.min(200, Number(limit) || ANSWER_NOTES));
  const best = r.rows.slice(0, n).map((row, i) => `${i + 1}. ${noteText(fetchRow(index, row.r), now, BEST_NOTE_CHARS, row.later)}`);
  if (best.length) out.push('', `Best matches for the words (full text in the list below):`, ...best);
  const all = everythingRecorded(index, root, question, q, r, filters, now, ANSWER_ALL_BYTES - Buffer.byteLength(out.join('\n')) - 4400);   // room for the closing lines and up to 150 ids
  out.push('', all.header, ...all.lines);
  if (all.left?.length) {
    const ids = all.left.slice(0, 150);
    out.push('', `${all.left.length} more matching note${all.left.length === 1 ? '' : 's'} did not fit this reply. All of them in one more call: query sql SELECT at, context, kind, content, id FROM memories WHERE id IN (${ids.map(id => `'${id}'`).join(', ')})${all.left.length > ids.length ? ` (the first ${ids.length}; then the same with the rest)` : ''}.`);
  }
  const cut = all.notes.find(m => !all.whole && oneLineText(m).length > LONG_NOTE_CHARS);
  if (cut) out.push('', `A note's text is cut where it says "more characters"; its full text: query sql SELECT content FROM memories WHERE id='${cut.id}'.`);
  const ask = askSourceLines(root, all.notes.slice(-40), { day: at => lib.localDateTime(at).slice(0, 10) });
  if (ask.length) out.push('', ...ask);
  out.push('', asksForDraft(question) ? DRAFT_CLOSE : `Answer from all the notes shown: they are what the brain holds on this. For a list question (what is due, what we decided, who raised something, what we promised), list every item that fits, each with its date and id; a later note that replaces or withdraws one wins. ${NO_WEB}`);
  return out.join('\n');
}

/* query (object memories, with search): the same engine, rows as JSON lines, best first, under the cap. */
export function searchRows(index, root, search, { filters = {}, limit, project = null, now = nowDate(), relationsFor = () => [] } = {}) {
  const r = searchIndex(index, search, { filters, project, now, relationsFor, everyWord: true });
  const n = Math.max(1, Math.min(501, Number(limit) || 50));
  const maxBytes = limit ? Math.min(MAX_RESULT_BYTES, Math.max(SEARCH_MAX_BYTES, n * PER_NOTE_BYTES)) : SEARCH_MAX_BYTES;
  const lines = [], rows = [], cut = []; let bytes = 0;
  for (const row of r.rows.slice(0, n)) {
    const m = fetchRow(index, row.r); let line = JSON.stringify(m), size = Buffer.byteLength(line) + 1;
    if (lines.length && bytes + size > maxBytes) break;
    if (size > maxBytes - 600 && typeof m.content === 'string') {   // one long note (a transcript) alone: its text is cut to fit
      const keep = Math.max(500, maxBytes - 600 - (size - Buffer.byteLength(m.content))), content = Buffer.from(m.content).subarray(0, keep).toString().replace(/\uFFFD+$/, '');
      line = JSON.stringify({ ...m, content, content_cut: m.content.length - content.length }); size = Buffer.byteLength(line) + 1;
      cut.push(`${m.id}: content cut after ${content.length} of ${m.content.length} characters; the full text: query sql SELECT content FROM memories WHERE id='${m.id}'.`);
    }
    lines.push(line); rows.push(m); bytes += size;
    if (row.later) cut.push(`${m.id} is no longer current: ${row.later.what} ${row.later.status} ${row.later.observed} (${row.later.id}).`);
  }
  const tail = [...cut, ...r.said, ...(r.widened ? [r.widened] : []), ...(r.literal ? ['No word matched; these rows contain the text as typed.'] : [])];
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

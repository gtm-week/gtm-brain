// query object housekeeping: the rules check's work list (lib/rules-check.mjs) grouped in plain words, with, for
// the first items of each group, the evidence needed to ask the person about them without another read. A person
// known by a first name only comes with the notes that mention them and the companies and emails in those notes;
// a look-alike pair with both cards side by side and what a merge would keep. Deterministic, from the files,
// reads only. One reply stays under the answer read's cap: notes are dropped before items, the lines before the
// last say how many items are not shown and how to get them, and the last line is the instruction to follow
// (ONE_AT_A_TIME, the same words the rules check ends with).
import * as lib from './brain.mjs';
import { ruleFindings, ONE_AT_A_TIME } from './rules-check.mjs';
import { CARDS_MAX_BYTES, NOTE_CHARS, cut, noteLine, nowDate } from './entity-cards.mjs';

export const HOUSEKEEPING_ITEMS = 5;   // items with evidence per group in one reply
export const HOUSEKEEPING_GROUPS = [
  { key: 'first-names', title: 'People known by a first name only', short: 'first names', asked: /first|one.?word|single|full name|surname|people|person|\bp3\b/i },
  { key: 'same-names', title: 'Names that may be the same person or company', short: 'same names', asked: /same|dup|look.?alike|alike|merge|pair|\bp4\b/i },
  { key: 'other', title: 'Other things the rules check found', short: 'other', asked: /other|file|folder|schema|rule|rest|gap/i },
];
const groupOf = f => f.rule === 'P3' ? 'first-names' : f.rule === 'P4' ? 'same-names' : 'other';
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const newestFirst = (a, b) => Date.parse(b.at) - Date.parse(a.at) || String(a.id).localeCompare(String(b.id));

export function housekeepingText(root, { search = '', offset = 0, now = nowDate() } = {}) {
  const shared = {}, findings = ruleFindings(root, shared);
  const { names = [], memories = [], notesAbout = () => [] } = shared;
  const byId = new Map(names.map(e => [e.id, e]));
  const groups = HOUSEKEEPING_GROUPS.map(g => ({ ...g, items: findings.filter(f => groupOf(f) === g.key) }));
  const asked = String(search || '').trim(), only = asked ? groups.filter(g => g.asked.test(asked)) : [];
  const shown = only.length ? only : groups;
  const skip = Math.max(0, Math.floor(Number(offset) || 0));
  if (!findings.length) return 'Housekeeping: nothing to settle. Every person has a full name or was confirmed, no look-alike pair is open, and the rules check found nothing else. Reads only; nothing was changed. Say so in one line; no other read is needed.';

  const notesOf = e => notesAbout(e).slice().sort(newestFirst);
  const emailsOf = (e, notes) => [...new Set([...(e.emails || []), ...notes.flatMap(m => String(m.content || '').match(EMAIL) || [])].map(x => x.toLowerCase()))];
  const short = (e, notes) => `${e.name} · ${e.kind || 'person'}${e.subtype ? ` (${e.subtype})` : ''} · ${e.id} · ${notes.length ? plural(notes.length, 'note') : 'no notes'} · ${emailsOf(e, []).length ? emailsOf(e, []).slice(0, 2).join(', ') : 'no email'}`;

  /* one item as lines; level: how many notes a first-name person shows (a pair always shows each side's newest) */
  const render = (f, n, level) => {
    const g = groupOf(f), lines = [];
    if (g === 'first-names') {
      const e = byId.get(f.ids?.[0]); if (!e) return [`${n}. ${f.what}`, ...f.choices.map((c, j) => `   ${j + 1}) ${c}`)];
      const notes = notesOf(e);
      lines.push(`${n}. "${e.name}" · ${e.kind || 'person'} · ${e.id} · ${notes.length ? `${plural(notes.length, 'note')}, the first ${lib.localDateTime(notes.at(-1).at).slice(0, 10)}` : 'no notes'}`);
      for (const m of notes.slice(0, level)) lines.push(`   - ${noteLine(m, now, NOTE_CHARS)}`);
      if (notes.length > level) lines.push(`   (${notes.length - level} more ${notes.length - level === 1 ? 'note' : 'notes'} not shown)`);
      const orgs = [...new Set(notes.flatMap(m => (m.entities || []).map(id => byId.get(id)).filter(x => x && x.id !== e.id && x.kind === 'organization').map(x => x.name)))];
      const mails = emailsOf(e, notes);
      lines.push(`   Companies in those notes: ${orgs.length ? orgs.slice(0, 5).join(', ') : 'none'}. Emails in those notes: ${mails.length ? mails.slice(0, 3).join(', ') : 'none'}.`);
      const alike = (f.alike || []).map(id => byId.get(id)).filter(Boolean);
      if (alike.length) lines.push(`   Could be: ${alike.map(o => short(o, notesAbout(o))).join('; ')}`);
      lines.push(`   Ask who ${e.name} is. 1) They give the full name: add_name (name: the full name, aliases: ["${e.name}"])${alike.map((o, j) => ` ${j + 2}) Same as ${o.name}: merge_entities (source: ${e.id}, target: ${o.id}; preview, then apply with its as_of)`).join('')} ${alike.length + 2}) Not a person: add_name (name: "${e.name}", kind: what it is)`);
      return lines;
    }
    if (g === 'same-names') {
      const [a, b] = (f.ids || []).map(id => byId.get(id)); if (!a || !b) return [`${n}. ${f.what}`, ...f.choices.map((c, j) => `   ${j + 1}) ${c}`)];
      const na = notesOf(a), nb = notesOf(b), both = na.filter(m => nb.some(x => x.id === m.id)).length;
      // the survivor a merge would keep: the one with more notes, then the longer name, then the first
      const [keep, drop, nk, nd] = nb.length > na.length || (nb.length === na.length && b.name.length > a.name.length) ? [b, a, nb, na] : [a, b, na, nb];
      const side = (label, e, notes) => [`   ${label}: ${short(e, notes)}${e.aliases?.length ? ` · also: ${e.aliases.slice(0, 3).join(', ')}` : ''}`, ...(notes[0] ? [`      newest: ${noteLine(notes[0], now, NOTE_CHARS)}`] : [])];
      const mails = [...new Set([...emailsOf(keep, []), ...emailsOf(drop, [])])], total = new Set([...nk, ...nd].map(m => m.id)).size;
      lines.push(`${n}. ${keep.name} / ${drop.name} · ${f.kind} · nobody has said whether they are the same${both ? ` · ${plural(both, 'note')} name both` : ''}`,
        ...side('A', keep, nk), ...side('B', drop, nd),
        `   A merge would keep ${keep.name} (${keep.id}) with "${drop.name}" as an alias, ${mails.length ? `the email${mails.length === 1 ? '' : 's'} ${mails.slice(0, 3).join(', ')}` : 'no email'} and ${plural(total, 'note')}; ${drop.id} is retired and still resolves. Notes keep their text.`,
        `   Ask whether they are the same. 1) Same: merge_entities (source: ${drop.id}, target: ${keep.id}; preview, then apply with its as_of) 2) Different: add_name (name: "${drop.name}", not_same: ["${keep.name}"]), so it is never asked again`);
      return lines;
    }
    lines.push(`${n}. [${f.rule}] ${cut(f.what, 320)}`, ...f.choices.map((c, j) => `   ${j + 1}) ${cut(c, 220)}`));
    if (f.detail) lines.push(`      ${cut(f.detail, 300)}`);
    return lines;
  };

  const open = memories.filter(m => m.kind === 'question' && (m.tags || []).includes('brain-question') && !m.retracts).length;
  const counts = groups.map(g => `${plural(g.items.length, g.short === 'first names' ? 'person known by a first name only' : g.short === 'same names' ? 'pair of names that may be the same' : 'other finding', g.short === 'first names' ? 'people known by a first name only' : g.short === 'same names' ? 'pairs of names that may be the same' : 'other findings')}`).join(', ');
  const head = per => [`Housekeeping: ${plural(findings.length, 'thing')} to settle (${counts}). Reads only; nothing was changed.`,
    `Below: ${only.length ? `the group asked for ("${asked}")` : 'each group'}, the first ${per === 1 ? 'item' : `${per} items`}${skip ? ` after item ${skip}` : ''} with their evidence. This reply is all that is needed to ask about them: no skill file, rule page (the questions page included), health or status read and no notes lookup first. Ask with the question box when the chat has one, else in plain text with numbered choices, and end the turn; preview or change nothing (no merge preview either) before the person answers.${open ? ` Apart from this list, ${plural(open, 'question')} from the brain wait${open === 1 ? 's' : ''} for an answer (the chat's opening lines name them).` : ''}`];
  const build = (per, level) => {
    const out = [...head(per)], left = [];
    for (const g of shown) {
      const items = g.items.slice(skip, skip + per), rest = g.items.length - skip - items.length;
      out.push('', `${g.title} (${g.items.length}${g.items.length ? `; shown ${items.length ? `${skip + 1}-${skip + items.length}` : 'none'}` : ''}):`);
      if (!g.items.length) out.push('   none');
      else if (!items.length) out.push(`   no item ${skip + 1}: the group has ${g.items.length}`);
      items.forEach((f, i) => out.push(...render(f, skip + i + 1, level)));
      if (rest > 0) left.push({ g, rest, next: skip + items.length });
    }
    const hidden = only.length ? groups.filter(g => !only.includes(g) && g.items.length) : [];
    const tail = [];
    if (left.length) tail.push(`Not shown: ${left.map(x => `${x.rest} in "${x.g.short}"`).join(', ')}. The same call with filters.offset ${Math.min(...left.map(x => x.next))} returns the next ones; search = ${HOUSEKEEPING_GROUPS.map(g => `"${g.short}"`).join(', ')} returns one group. Ask for them only after the person has settled what is above.`);
    if (hidden.length) tail.push(`Other groups, not asked for: ${hidden.map(g => `${g.items.length} in "${g.short}"`).join(', ')}.`);
    if (asked && !only.length) tail.push(`No group is called "${cut(asked, 60)}"; every group is shown. Groups: ${HOUSEKEEPING_GROUPS.map(g => g.short).join(', ')}.`);
    tail.push(ONE_AT_A_TIME);
    return [...out, '', ...tail].join('\n');
  };
  // notes are dropped before items: three notes a person, then two, then one; only then fewer items a group
  let text = '';
  for (let per = HOUSEKEEPING_ITEMS; per >= 1; per--) for (let level = 3; level >= 1; level--) { text = build(per, level); if (Buffer.byteLength(text) <= CARDS_MAX_BYTES) return text; }
  return text;
}

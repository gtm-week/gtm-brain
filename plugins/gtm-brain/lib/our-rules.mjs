/* Typed rules: the "Our rules" section of RULES.md, read rule by rule (ticket: enforce rules deterministically).
   A person writes a rule in plain words; under it an optional tag line says what it is for:

     Never call a company a customer before a signed contract.
     > applies to: organization · when: saving customer status · check

   applies to: a kind from SCHEMA.md (or an organization subtype), "link <type>" for a relationship type, or
   general. when: saving, drafting or reading, optionally followed by a field or status. check or guidance.
   Codex proposes the tag line and writes it only on the person's yes (the rules skill); nothing here writes.
   Only the rules for the kind in hand are shown (rulesFor, scopedText); a rule tagged check with a condition
   this file can read is evaluated at save (saveRefusals) and in a draft (draftFindings); every other rule is
   guidance and is shown, never silently skipped. A rule never starts work: one that does ("whenever a company
   becomes a customer, send the welcome pack") is offered as a one-step workflow (workOffer).

   Reading never throws: a line that cannot be read is reported with its line number and a fix, and the rule
   above it still applies, as general when its scope cannot be read. Older plugin versions read the same file
   as free text: a tag line is a quote line to them and changes nothing. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSchema, brainKinds, BUILT_IN } from "./schema.mjs";
import { CUSTOMER_STATUSES } from "./customers.mjs";
import { CHAT_KINDS } from "./host.mjs";
import * as lib from "./brain.mjs";

export const VERBS = ["saving", "drafting", "reading"];
export const MODES = ["check", "guidance"];
const WRAP_AT = 70;   // a line this long that ends without punctuation was wrapped by an editor
export const FEW = 3;   // general rules ride along with a scoped reply only while there are this many or fewer
const TEMPLATES = fileURLToPath(new URL("../templates", import.meta.url));
const OWN = /^##\s+Our rules\s*$/i, OLD_OWN = /^#\s+Our rules\s*$/i;
const read = p => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const squash = s => String(s || "").replace(/\s+/g, " ").trim();
const STOP = new Set("a an the of to for with on in at by is are be was were has have had our their its his her and or any every each before after until unless without from as that this it them they we you".split(" "));
const stem = w => w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w;
export const stems = text => String(text || "").toLowerCase().match(/[a-z0-9]+/g)?.filter(w => !STOP.has(w)).map(stem) || [];
const has = (text, words) => { const s = new Set(stems(text)); return words.length > 0 && words.every(w => s.has(w)); };
const VERB_WORDS = [[/^sav(e|ing)$|^stor(e|ing)$|^record(ing)?$|^not(e|ing)$|^writ(e|ing) notes?$/, "saving"], [/^draft(ing)?$|^writ(e|ing)$|^send(ing)?$|^email(ing)?$|^outreach$|^repl(y|ying)$/, "drafting"], [/^read(ing)?$|^brief$|^answer(ing)?$|^look(ing)? up$/, "reading"]];
const PLAIN_KIND = /^(?:people|persons|contacts?|compan(?:y|ies)|customers?|clients?|accounts?)$/;
const plainKind = v => /^(?:people|persons|contacts?)$/.test(v) ? "person" : "organization";
const verbOf = w => VERB_WORDS.find(([re]) => re.test(String(w).toLowerCase().trim()))?.[1] || null;

/* The intro paragraphs GTM Brain shipped under "## Our rules" (the current template and every snapshot): they
   are not rules, even in a file whose other text the person edited. */
function shippedIntros() {
  const texts = [read(join(TEMPLATES, "RULES.md"))];
  try { for (const f of readdirSync(join(TEMPLATES, "legacy", "rules"))) if (f.endsWith(".md")) texts.push(read(join(TEMPLATES, "legacy", "rules", f))); } catch {}
  const out = new Set();
  for (const t of texts.filter(Boolean)) {
    const i = t.split("\n").findIndex(l => OWN.test(l)); if (i < 0) continue;
    const rest = t.split("\n").slice(i + 1).join("\n").split(/^##?\s/m)[0];
    for (const p of rest.split(/\n\s*\n/)) if (p.trim()) out.add(squash(p));
  }
  return out;
}
let introCache;
const intros = () => introCache ??= shippedIntros();

/* What a tag line may name in this brain: kinds and subtypes, relationship types, fields per kind, statuses. */
export function vocabulary(root) {
  const r = root ? readSchema(root) : { missing: true }, schema = r.schema || null;
  const kinds = root ? brainKinds(root) : ["person", "organization", "product", "event", "tool"];
  const subtypes = Object.keys(schema?.kinds?.organization?.subtypes || { company: 1, team: 1, investor: 1, partner: 1, community: 1 });
  const links = [...new Set([...Object.keys(schema?.relations || {}), ...Object.keys(BUILT_IN)])];
  const fields = {};
  for (const k of kinds) fields[k] = (schema?.kinds?.[k]?.fields || []).map(f => f.name);
  for (const s of subtypes) fields[s] = [...(fields.organization || []), ...(schema?.kinds?.organization?.subtypes?.[s]?.fields || []).map(f => f.name)];
  return { kinds, subtypes, links, fields, statuses: CUSTOMER_STATUSES.filter(s => s !== "unknown"), verified: !!schema };
}

/* One tag line -> {tag, problems}. Parts are split on · • | ; / or a spaced hyphen, and before a key or a mode word
   even after a comma or a full stop (a keyboard has no middle dot: "applies to: organization - when: saving, check");
   keys are case-insensitive and their colon may be left out ("when saving"); a bare check or guidance is the mode,
   a bare saving, drafting or reading the when. Unknown values are problems; the part is then left out, so the rule
   stays wider, never lost. */
const KEY_START = /(?:applies\s+to|applies|scope|kind|for|when|on|mode)\s*:|applies\s+to\s|when\s+(?=sav|draft|read|writ|stor|record|send|email|answer)|(?:check|checked|guidance|guide)\s*$/i;
export const tagParts = body => String(body)
  .replace(/\s*(?:[·•|;/]|\s-\s)\s*/g, " · ")
  .replace(new RegExp(`\\s*[,.]?\\s+(?=${KEY_START.source})`, "gi"), " · ")
  .replace(/\s*[,.]\s*(?=(?:check|checked|guidance|guide)\b)/gi, " · ")
  .split(/\s*·\s*/).map(x => x.trim().replace(/[.,]$/, "").trim()).filter(Boolean);
export function parseTag(text, vocab, lineNo = 0) {
  const problems = [], add = (problem, proposal) => problems.push({ line: lineNo, problem, proposal });
  const tag = { applies: [], when: null, on: null, mode: null };
  const body = String(text).replace(/^\s*>\s?/, "").trim();
  for (const raw of tagParts(body)) {
    const m = raw.match(/^([a-z ]+?)\s*:\s*(.*)$/i) || raw.match(/^(applies to|when)\s+(.*)$/i), key = m ? m[1].toLowerCase().replace(/\s+/g, " ").trim() : null, value = m ? m[2].trim().replace(/\.$/, "") : raw.replace(/\.$/, "");
    if (!m && /^(check|checked|guidance|guide)$/i.test(value)) { tag.mode = /^check/i.test(value) ? "check" : "guidance"; continue; }
    if (!m && verbOf(value)) { tag.when = verbOf(value); continue; }   // a bare "drafting" is the when
    if (key === "mode") { if (/^(check|guidance)$/i.test(value)) tag.mode = value.toLowerCase(); else add(`mode "${value}" is not check or guidance`, "check or guidance"); continue; }
    if (key && /^(applies to|applies|for|scope|kind)$/.test(key)) {
      for (const v of value.split(/\s*,\s*|\s+and\s+/).map(s => s.trim().toLowerCase()).filter(Boolean)) {
        const link = v.match(/^(?:link|relationship|relation)\s*:?\s+([a-z0-9_ ]+)$/);
        const word = (link ? link[1] : v).replace(/\s+/g, "_");
        if (/^(general|all|everything|any|anything|everyone)$/.test(v)) tag.applies.push({ general: true });
        else if (link || (vocab.links.includes(word) && !vocab.kinds.includes(word))) {
          if (vocab.links.includes(word) || !vocab.verified) tag.applies.push({ link: word });
          else add(`applies to link ${word}: SCHEMA.md has no relationship type ${word}`, `one of: ${vocab.links.map(l => `link ${l}`).join(", ")}`);
        }
        else if (PLAIN_KIND.test(v)) tag.applies.push({ kind: plainKind(v) });   // "company" or "customers" is how people say organization
        else if (vocab.kinds.includes(v) || vocab.kinds.includes(v.replace(/s$/, ""))) tag.applies.push({ kind: vocab.kinds.includes(v) ? v : v.replace(/s$/, "") });
        else if (vocab.subtypes.includes(v) || vocab.subtypes.includes(v.replace(/s$/, ""))) tag.applies.push({ kind: "organization", subtype: vocab.subtypes.includes(v) ? v : v.replace(/s$/, "") });
        else add(`applies to "${v}": SCHEMA.md has no such kind`, `one of: ${[...vocab.kinds, ...vocab.subtypes].join(", ")}, link <type>, or general`);
      }
      continue;
    }
    if (key === "when" || key === "on") {
      const words = value.toLowerCase().split(/\s+/), verb = verbOf(words[0]) || verbOf(words.slice(0, 2).join(" "));
      const rest = (verb ? words.slice(verbOf(words[0]) ? 1 : 2) : words).join(" ").trim();
      if (!verb && !rest) { add(`when is empty`, "saving, drafting or reading"); continue; }
      const flat = rest.replace(/\s+status$/, "").replace(/\s+/g, "_");
      const known = !!rest && (vocab.statuses.includes(flat) || vocab.links.includes(flat) || rest === "status" || Object.values(vocab.fields).some(f => f.includes(flat)));
      if (!verb && !known) { add(`when "${value}" is not saving, drafting or reading`, "saving, drafting or reading, optionally with a field or status: saving customer status"); continue; }
      tag.when = verb || "saving";   // "when: customer status" is about saving it
      if (known) tag.on = flat === "status" ? "customer" : flat;
      else if (rest) add(`when "${value}": "${rest}" is not a field, status or relationship in SCHEMA.md`, `${tag.when}, or ${tag.when} <a field from SCHEMA.md>, or ${tag.when} customer status`);
      continue;
    }
    add(`"${raw}" is not part of a tag line`, "applies to: <kind, link type or general> · when: saving, drafting or reading · check or guidance");
  }
  if (!tag.mode) tag.mode = "guidance";
  return { tag, problems };
}

/* The rules of one Our rules section text (lines numbered from `first`), pure: no file is read. */
export function parseOurRules(text, vocab, { first = 1 } = {}) {
  const rules = [], problems = [], known = intros();
  const lines = String(text || "").split("\n");
  // shipped intro paragraphs are skipped whole
  const skip = new Set();
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i++; continue; }
    let j = i; while (j < lines.length && lines[j].trim()) j++;
    if (known.has(squash(lines.slice(i, j).join(" ")))) for (let k = i; k < j; k++) skip.add(k);
    i = j;
  }
  let last = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], n = first + i;
    if (/^\s*(?:#{1,6}\s|[-*_]{3,}\s*$|```)/.test(raw)) { last = last && { ...last, gap: true }; continue; }   // a sub-heading or a divider under Our rules is not a rule
    if (skip.has(i) || !raw.trim() || /^<!--.*-->$/.test(raw.trim())) { if (!raw.trim()) last = last && { ...last, gap: true }; continue; }
    if (/^\s*>/.test(raw)) {
      const target = last && !last.gap ? rules[last.index] : null;
      if (!/^\s*>\s*(?:(?:applies to|applies|scope|kind)\b|(?:for|when|on|mode)\s*:|when\s+(?:sav|draft|read)|(?:check|checked|guidance|guide)\s*(?:[·•|;.]|$))/i.test(raw)) { if (target) target.note = squash(`${target.note || ""} ${raw.replace(/^\s*>\s?/, "")}`); continue; }   // a plain quote under a rule is part of it
      if (!target) { problems.push({ line: n, problem: "a tag line with no rule directly above it", proposal: "put it on the line right under the rule it is for, or remove it" }); continue; }
      if (target.tag) { problems.push({ line: n, problem: `a second tag line for the rule on line ${target.line}`, proposal: "keep one tag line per rule; remove this one or merge the two" }); continue; }
      const { tag, problems: p } = parseTag(raw, vocab, n);
      problems.push(...p); target.tag = tag; target.tagLine = n;
      continue;
    }
    const clean = raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim();
    // a wrapped rule: an indented line, or a lowercase line right under a long unfinished one, belongs to it. Two
    // short lowercase lines are two rules: "one line each" is the documented form, and its examples are lowercase.
    const bullet = /^\s*(?:[-*+]|\d+[.)])\s+/.test(raw), indented = !bullet && /^\s{2,}\S/.test(raw);
    if (last && !last.gap && !rules[last.index].tag && !rules[last.index].note && !bullet && (indented || (/^[a-z]/.test(clean) && last.len >= WRAP_AT && !/[.!?:]$/.test(rules[last.index].text)))) { rules[last.index].text += " " + clean; last.len = raw.length; continue; }
    rules.push({ line: n, text: clean, tag: null, tagLine: null });
    last = { index: rules.length - 1, gap: false, len: raw.length };
  }
  for (const r of rules) {
    r.check = r.tag?.mode === "check" ? checkOf(r.text, r.tag, vocab) : null;
    r.work = r.tag ? null : workOffer(r.text, vocab);   // a tag line is the person's answer: it is a rule, shown and never offered again
  }
  return { rules, problems };
}

/* RULES.md's Our rules, with line numbers in the file. A file from before the merge ("# Our rules", one line per
   rule) is read the same way. Missing file or section: no rules. */
let readCache = null;
export function readOurRules(root) {
  let key = null; try { const st = statSync(join(root, "RULES.md")), sc = (() => { try { const x = statSync(join(root, "SCHEMA.md")); return `${x.mtimeMs}|${x.size}`; } catch { return ""; } })(); key = `${root}|${st.mtimeMs}|${st.size}|${sc}`; } catch { return { rules: [], problems: [] }; }
  if (readCache?.key === key) return readCache.value;
  const value = readOurRulesNow(root); readCache = { key, value }; return value;
}
function readOurRulesNow(root) {
  const text = read(join(root, "RULES.md")); if (!text) return { rules: [], problems: [] };
  const lines = text.split("\n");
  let start = lines.findIndex(l => OWN.test(l));
  if (start < 0 && !/^\|\s*-{3,}/m.test(text)) start = lines.findIndex(l => OLD_OWN.test(l));
  if (start < 0) return { rules: [], problems: [] };
  let end = lines.findIndex((l, i) => i > start && /^##?\s/.test(l)); if (end < 0) end = lines.length;
  return parseOurRules(lines.slice(start + 1, end).join("\n"), vocabulary(root), { first: start + 2 });
}

/* ---------- Checks: the conditions this file can evaluate ---------- */
// The supported patterns, in the order they are tried. Anything else tagged check stays guidance.
export const CHECK_PATTERNS = [
  { kind: "word", example: `Never use "cheap" in a note or a draft.`, about: "a quoted word or phrase (or 'the word X') after never, do not or avoid: refused in a saved note, reported in a draft" },
  { kind: "status", example: "Never call a company a customer before a signed contract.", about: "a status (customer, prospect, former customer, or a relationship such as partner) only before, without or until a fact: a save that sets the status (the customer or relation block, or a note saying it is now one) is refused unless this note or an earlier note about the entity says the fact" },
  { kind: "source", example: "Never save a company note without a source.", about: "never without a source, link or reference: a save with no source pointer besides the chat is refused" },
  { kind: "field", example: "Always include the role when saving a person.", about: "always include, record or give a SCHEMA.md field: a save about that kind is refused unless this note or an earlier one about the entity mentions the field" },
];
const SAVE_VERB = /^(?:sav(?:e|es|ed|ing)|record(?:s|ed|ing)?|add(?:s|ed|ing)?|writ(?:e|es|ing)|log(?:s|ged|ging)?|stor(?:e|es|ed|ing)|keep(?:s|ing)?|enter(?:s|ed|ing)?|put(?:s|ting)?|mention(?:s|ed|ing)?|captur(?:e|es|ed|ing)|tak(?:e|es|ing))$/i;
const GENERIC = /^(?:a|an|the|any|anything|something|new|notes?|facts?|information|info|memor(?:y|ies)|about|of|on|for|in|compan(?:y|ies)|people|persons?|organi[sz]ations?|contacts?|records?|entr(?:y|ies)|data)$/i;
const NEG = /\b(?:never|don'?t|do not|avoid|no one should|not)\b/i;
function statusOf(word, vocab) {
  const w = word.toLowerCase().replace(/s$/, "").replace(/\s+/g, "_");
  if (vocab.statuses.includes(w)) return { status: w };
  const link = vocab.links.find(l => l !== "customer_of" && l.replace(/_(of|in|at|with|to)$/, "") === w);
  return link ? { link } : null;
}
/* rule text + tag -> {kind, ...} or null (not evaluable: guidance). */
export function checkOf(text, tag, vocab) {
  const t = String(text);
  let m = t.match(/\b(?:never|don'?t|do not|avoid)\b[^"“]*?["“]([^"”]{1,60})["”]/i) || t.match(/\b(?:never|don'?t|do not|avoid)\b.*?\bthe (?:word|phrase|term)\s+([a-z0-9-]+)/i);
  if (m) return { kind: "word", word: m[1].trim() };
  m = t.match(/\b(?:never|don'?t|do not)\s+(?:call|mark|tag|save|record|set|list|label|treat)\s+(?:\w+\s+){0,3}?(?:as\s+)?(?:a|an|our)\s+(former customer|customer|prospect|[a-z]+)\s+(?:before|without|until|unless)\s+(?:there is\s+|we have\s+|they have\s+)?(.+?)\.?$/i)
    || t.match(/\bonly\s+(?:call|mark|tag|save|record|set|list|label|treat)\s+(?:\w+\s+){0,3}?(?:as\s+)?(?:a|an|our)\s+(former customer|customer|prospect|[a-z]+)\s+(?:after|once|when|if)\s+(?:there is\s+|we have\s+|they have\s+)?(.+?)\.?$/i);
  if (m) { const s = statusOf(m[1], vocab), fact = stems(m[2]); if (s && fact.length) return { kind: "status", ...s, fact, factText: m[2].trim() }; }
  m = t.match(/\b(?:never|don'?t|do not)\b(.*?)\bwithout\s+(?:a\s+|an\s+|its\s+|the\s+)?(?:source|link|reference|record)\b/i);
  if (m || /\balways\b.*\b(?:give|add|include|attach|cite)\s+(?:a\s+|the\s+|its\s+)?(?:source|link|reference)\b/i.test(t)) {
    // what the note is about, when the rule says ("a deal size"): only a note that says it needs the source
    const words = m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
    while (words.length && SAVE_VERB.test(words[0])) words.shift();
    const kindWord = w => [...vocab.kinds, ...vocab.subtypes].includes(w.toLowerCase().replace(/s$/, ""));
    const topic = stems(words.filter(w => !SAVE_VERB.test(w) && !GENERIC.test(w) && !kindWord(w)).join(" "));
    return topic.length ? { kind: "source", topic, topicText: words.join(" ").replace(/[.,;:]$/, "") } : { kind: "source" };
  }
  m = t.match(/\b(?:always|must|every \w+ needs?|needs?)\b.*?\b(?:include|record|give|have|add|state|capture|note|name)\s+(?:the|their|its|a|an)?\s*(.+)$/i);
  if (m) {
    const kinds = (tag?.applies || []).filter(a => a.kind).map(a => a.subtype || a.kind), pool = kinds.length ? kinds : Object.keys(vocab.fields);
    const after = stems(m[1]);
    for (const k of pool) for (const f of vocab.fields[k] || []) { const fw = f.split("_").map(stem); if (fw.every(w => after.includes(w))) return { kind: "field", field: f, words: fw, kinds: Object.keys(vocab.fields).filter(x => vocab.fields[x].includes(f)) }; }
  }
  return null;
}

/* ---------- Scope ---------- */
const appliesTo = (rule, e) => {
  const a = rule.tag?.applies || [];
  if (!a.length || a.some(x => x.general)) return "general";
  return a.some(x => (x.kind && x.kind === e.kind && (!x.subtype || x.subtype === e.subtype)) || (x.link && (e.links || []).includes(x.link))) ? "scoped" : null;
};
const whenMatches = (rule, verb) => !verb || !rule.tag?.when || (Array.isArray(verb) ? verb.includes(rule.tag.when) : rule.tag.when === verb);
const verbText = verb => Array.isArray(verb) ? verb.join(" or ") : verb;
const isGeneral = r => !r.tag || !r.tag.applies.length || r.tag.applies.some(x => x.general);
const needsLinks = rules => rules.some(r => r.tag?.applies.some(a => a.link));

/* The entity in hand as a scope: kind, subtype and (only when a rule names a link) its current relationship types. */
export function entityScope(root, nameOrEntity, { registry = lib.readNames(root), rules = null, links = null, relationNotes = null } = {}) {
  const e = typeof nameOrEntity === "string" ? lib.resolveEntity(registry, nameOrEntity) : nameOrEntity;
  if (!e) return null;
  let types = links || [];
  if (!links && (rules ? needsLinks(rules) : true) && e.id) {
    try {
      const notes = (relationNotes || relationMemories(root)).filter(m => m.relation.from === e.id || m.relation.to === e.id);
      const latest = new Map(); for (const m of notes) latest.set(m.relation.type, m.relation.status);
      types = [...latest].filter(([, s]) => s === "current").map(([t]) => t);
    } catch {}
  }
  return { id: e.id || null, name: e.name, kind: e.kind || "person", subtype: e.subtype || null, links: types };
}
/* every relationship note in force, oldest observation first (read once per call) */
export const relationMemories = root => lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories)).filter(m => m.relation && !m.retracts)
  .sort((a, b) => Date.parse(a.relation.observed_at) - Date.parse(b.relation.observed_at));

/* The rules for the entities in hand and the action (saving, drafting, reading, or null for any): the scoped ones,
   and the general ones while there are FEW or fewer. */
export function rulesFor(parsed, scopes, verb) {
  const rules = parsed.rules.filter(r => !r.work), general = rules.filter(isGeneral);   // an instruction that starts work is offered as a workflow, never shown as a rule to follow
  const scoped = rules.filter(r => !isGeneral(r) && whenMatches(r, verb) && scopes.some(s => appliesTo(r, s) === "scoped"));
  const gen = general.length <= FEW ? general.filter(r => whenMatches(r, verb)) : [];
  return { scoped, general: gen, moreGeneral: general.length > FEW ? general.length : 0 };
}

const label = r => r.tag?.mode === "check" ? (r.check ? " [check]" : " [guidance: no check can be read from it]") : "";
/* As few bytes as it takes: one line per rule, the person's words, its RULES.md line. */
export function scopedText({ scoped, general, moreGeneral }, about) {
  if (!scoped.length && !general.length) return "";
  const line = r => `- ${r.text}${r.note ? ` ${r.note}` : ""}${label(r)} (RULES.md line ${r.line})`;
  return [`Our rules for ${about} (RULES.md; follow them${scoped.some(r => r.check) ? ", a [check] rule refuses a save that breaks it" : ""}):`, ...scoped.map(line), ...general.map(line), ...(moreGeneral ? [`(${moreGeneral} general rules: query rules with search general lists them)`] : [])].join("\n");
}

/* Once per chat per rule and action: the server keeps one of these; quietMs of silence starts a new chat. */
export function createShownOnce({ quietMs = 30 * 60 * 1000 } = {}) {
  const seen = new Map();
  return {
    filter(chatKey, verb, picked) {
      const now = Date.now(); let s = seen.get(chatKey);
      if (!s || now - s.at > quietMs) s = { keys: new Set() };
      s.at = now; seen.set(chatKey, s);
      const fresh = k => { if (s.keys.has(k)) return false; s.keys.add(k); return true; };
      const v = verbText(verb) || "any", key = r => `${r.line}|${r.text}|${v}`;
      return { scoped: picked.scoped.filter(r => fresh(key(r))), general: picked.general.filter(r => fresh(key(r))), moreGeneral: picked.moreGeneral && fresh(`more|${v}`) ? picked.moreGeneral : 0 };
    },
  };
}

/* What the entries of one remember call are about: people are persons, companies organizations, unless the
   registry knows them; the customer and relation blocks name theirs. */
export function entryScopes(root, entries, { registry = lib.readNames(root), rules = null } = {}) {
  const out = new Map(), linkRules = rules ? needsLinks(rules) : true;
  let relationNotes = null;
  const take = (name, kind, extraLinks = []) => {
    if (!name || typeof name !== "string") return;
    const known = lib.resolveEntity(registry, name);
    if (known && linkRules) relationNotes ??= (() => { try { return relationMemories(root); } catch { return []; } })();
    const s = known ? entityScope(root, known, { registry, rules, relationNotes, ...(linkRules ? {} : { links: [] }) }) : { id: null, name, kind, subtype: null, links: [] };
    const key = s.id || `${s.kind}:${s.name.toLowerCase()}`;
    const prev = out.get(key); out.set(key, { ...s, links: [...new Set([...(prev?.links || []), ...s.links, ...extraLinks])] });
  };
  const list = v => Array.isArray(v) ? v : typeof v === "string" ? v.split(",").map(x => x.trim()).filter(Boolean) : [];
  for (const e of entries || []) {
    if (!e || typeof e !== "object") continue;
    for (const p of list(e.people)) take(p, "person");
    for (const c of list(e.companies)) take(c, "organization");
    if (e.customer?.entity) take(e.customer.entity, "organization", ["customer_of"]);
    if (e.relation?.from) take(e.relation.from, "person", e.relation.status === "ended" ? [] : [e.relation.type]);
    if (e.relation?.to && e.relation.to !== "us") take(e.relation.to, "organization", e.relation.status === "ended" ? [] : [e.relation.type]);
  }
  return [...out.values()];
}

/* ---------- Evaluation ---------- */
const quote = r => `"${r.text}" (RULES.md line ${r.line})`;
const wordIn = (text, word) => new RegExp(`(^|[^a-z0-9])${word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i").test(String(text || ""));
const CUSTOMER_SAID = /\b(?:is|are|became|becomes|become|now|as|turned into|signed up as)\s+(?:now\s+)?(?:a|an|our)\s+(?:new\s+|paying\s+)?customers?\b/i;

/* A fact counts when one sentence says all its words and neither denies them ("no signed contract yet") nor only
   expects them ("will sign the contract"). A doubtful sentence refuses: the refusal says what to save first. */
const DENIED = /\b(?:no|not|never|without|missing|pending|awaiting|waiting|lacks?|will|going to|about to|(?:plan|expect|hope|intend|want|need)(?:s|ed|ing)? to|should|might|may|if|once|unless|until)\b|n['’]t\b/i;
const sentences = t => String(t || "").split(/(?<=[.;!?])\s+|\n+/);
const clauses = s => s.split(/\s*,\s*|\s+(?:and|but|though|although|while|whereas)\s+/i);
const says = (text, words) => sentences(text).some(s => clauses(s).some(c => has(c, words) && !DENIED.test(c)));
/* Who a note calls a customer in plain words: the name nearest before the phrase in its sentence; with no name
   there, the only organization in the note. */
function saidCustomers(content, scopes) {
  const out = new Set(), orgs = scopes.filter(s => s.kind === "organization");
  for (const sentence of sentences(content)) for (const m of sentence.matchAll(new RegExp(CUSTOMER_SAID.source, "gi"))) {
    const before = sentence.slice(0, m.index).toLowerCase(); let best = null, at = -1;
    for (const s of scopes) { const i = before.lastIndexOf(s.name.toLowerCase()); if (i > at) { at = i; best = s; } }
    if (best) out.add(best); else if (orgs.length === 1) out.add(orgs[0]);
  }
  return out;
}
/* remember checks a batch entry by entry in one synchronous pass: the registry and the notes are read once for it. */
let pass = null;
const thisPass = root => { if (pass?.root !== root) { pass = { root }; setImmediate(() => { pass = null; }); } return pass; };

/* A saved note against the check rules that apply to it: a list of refusals (empty when it may be saved). Every
   refusal quotes the rule and says what would satisfy it. Reads RULES.md, and the notes only when a status or
   field rule needs an earlier fact. Never throws: a rule that cannot be evaluated refuses nothing. */
export function saveRefusals(root, entry, { parsed = null, registry = null } = {}) {
  try {
    parsed ||= readOurRules(root);
    const checks = parsed.rules.filter(r => r.check && whenMatches(r, "saving"));
    if (!checks.length || !entry || typeof entry !== "object") return [];
    const batch = thisPass(root);
    registry ||= (batch.registry ??= lib.readNames(root));
    const scopes = entryScopes(root, [entry], { registry, rules: checks });
    const earlier = s => {
      const memories = (batch.memories ??= lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories)).filter(m => !m.retracts));
      const name = s.name.toLowerCase();
      return memories.filter(m => (s.id && (m.entities || []).includes(s.id)) || (m.people || []).some(p => String(p).toLowerCase() === name) || (m.companies || []).some(p => String(p).toLowerCase() === name));
    };
    const content = String(entry.content || ""), out = [];
    let said = null;
    for (const r of checks) {
      const hit = scopes.filter(s => appliesTo(r, s)), general = isGeneral(r);
      if (!general && !hit.length) continue;
      const c = r.check;
      if (c.kind === "word") { if (wordIn(content, c.word)) out.push(`refused by Our rules ${quote(r)}: the note says "${c.word}". Say it without that word, in the person's meaning`); continue; }
      if (c.kind === "source") {
        if (c.topic && !has(content, c.topic)) continue;   // the rule is about notes on its topic only
        const sources = (() => { try { return lib.parseSources(entry.sources ?? entry.source); } catch { return []; } })();
        if (!sources.some(s => s && !CHAT_KINDS.includes(s.kind))) out.push(`refused by Our rules ${quote(r)}: the note${c.topic ? ` is about ${c.topicText} and` : ""} has no source. Add where it comes from (an email id, a CRM record, a meeting), or ask the person`);
        continue;
      }
      for (const s of general ? scopes : hit) {
        if (c.kind === "status") {
          const same = n => !!n && (n === s.name || n === s.id || (!!s.id && lib.resolveEntity(registry, n)?.id === s.id));
          const sets = c.status
            ? (entry.customer ? entry.customer.status === c.status && same(entry.customer.entity) : c.status === "customer" && (said ??= saidCustomers(content, scopes)).has(s))
            : entry.relation?.type === c.link && entry.relation.status !== "ended" && (same(entry.relation.from) || same(entry.relation.to));
          if (!sets) continue;
          if (says(content, c.fact) || earlier(s).some(m => says(m.content, c.fact))) continue;
          out.push(`refused by Our rules ${quote(r)}: ${s.name} would be saved as ${c.status ? (c.status === "former_customer" ? "a former customer" : `a ${c.status}`) : c.link.replace(/_/g, " ")}, and no note about it says "${c.factText}". Save that first (with its source), or save this without the ${c.status ? "status" : "relationship"}`);
        } else if (c.kind === "field") {
          if (c.kinds && !c.kinds.includes(s.kind) && !(s.subtype && c.kinds.includes(s.subtype))) continue;   // that kind has no such field
          let filled = []; try { filled = JSON.parse(lib.resolveEntity(registry, s.id || s.name)?._fm?.compiled_fields || "[]"); } catch {}
          if (Array.isArray(filled) && filled.some(f => f?.field === c.field && String(f.text ?? "").trim())) continue;   // the compiled brief already holds it
          if (has(content, c.words) || earlier(s).some(m => has(m.content, c.words))) continue;
          out.push(`refused by Our rules ${quote(r)}: nothing about ${s.name} gives the ${c.field.replace(/_/g, " ")}. Add it to the note in words that name it ("${c.field.replace(/_/g, " ")}: ..."), or ask the person for it`);
        }
      }
    }
    return out;
  } catch { return []; }
}

/* A draft against the drafting rules for its recipient: the check rules it breaks (a forbidden word), each quoted. */
export function draftFindings(parsed, scopes, text) {
  const out = [];
  for (const r of parsed.rules.filter(r => r.check?.kind === "word" && whenMatches(r, "drafting"))) {
    if (!isGeneral(r) && !scopes.some(s => appliesTo(r, s))) continue;
    if (wordIn(text, r.check.word)) out.push(`breaks ${quote(r)}: the draft says "${r.check.word}"`);
  }
  return out;
}

/* ---------- Filing: proposals for an untagged rule ---------- */
/* What a check refuses, in one clause: the person accepts a check knowing what it does. */
export const checkSays = (c, when = null) => c.kind === "word" ? `${when === "drafting" ? "reports a draft" : when === "saving" ? "refuses a note" : "refuses a note and reports a draft"} that says "${c.word}"`
  : c.kind === "status" ? `refuses saving one as ${c.status ? (c.status === "former_customer" ? "a former customer" : `a ${c.status}`) : c.link.replace(/_/g, " ")} until a note about it says "${c.factText}"`
  : c.kind === "source" ? `refuses a note ${c.topic ? `about ${c.topicText} ` : ""}with no source besides the chat` : `refuses a note about one until a note or its brief gives the ${c.field.replace(/_/g, " ")}`;
export const MAX_UNFILED = 10;   // the rules check lists this many unfiled rules, then one line counting the rest
const KIND_WORDS = [[/\b(person|people|contacts?|leads?|someone|anyone|speakers?|candidates?)\b/i, "person"], [/\b(compan(y|ies)|organi[sz]ations?|accounts?|customers?|clients?|vendors?|firms?)\b/i, "organization"], [/\bproducts?\b/i, "product"], [/\b(events?|webinars?|conferences?|meetups?)\b/i, "event"], [/\btools?\b/i, "tool"]];
/* A tag line for an untagged rule: what Codex proposes; the person accepts, changes it or keeps the rule general. */
export function proposeTag(text, vocab) {
  const t = String(text), applies = [];
  for (const l of vocab.links.filter(l => /_(of|in|at|with|to)$/.test(l) && l !== "customer_of")) { const w = l.replace(/_(of|in|at|with|to)$/, "").replace(/_/g, " "); if (new RegExp(`\\b${w}s?\\b`, "i").test(t) && !applies.includes(`link ${l}`)) applies.push(`link ${l}`); }
  if (!applies.length) {
    for (const k of vocab.kinds.filter(k => !["person", "organization", "product", "event", "tool"].includes(k))) if (new RegExp(`\\b${k.replace(/_/g, " ")}s?\\b`, "i").test(t)) applies.push(k);
    for (const [re, k] of KIND_WORDS) if (re.test(t) && vocab.kinds.includes(k) && !applies.includes(k)) applies.push(k);
  }
  let when = /\b(writ(e|ing)|draft(s|ing)?|emails?|messag(e|es|ing)|outreach|repl(y|ies|ying)|posts?)\b/i.test(t) && !/\b(save|saving|note|notes)\b/i.test(t) ? "drafting"
    : /\b(sav(e|ed|ing)|notes?|record(s|ed|ing)?|tag(s|ged|ging)?|log(s|ged)?|mark(s|ed|ing)?)\b/i.test(t) || /\b(?:call|label|treat)\s+(?:\w+\s+){0,3}?(?:as\s+)?(?:a|an)\s+\w+/i.test(t) ? "saving"
    : /\b(read(s|ing)?|briefs?|answer(s|ing)?|summar)/i.test(t) ? "reading" : null;
  const tag = { applies: applies.filter(a => !a.startsWith("link ")).map(k => ({ kind: k })).concat(applies.filter(a => a.startsWith("link ")).map(a => ({ link: a.slice(5) }))) };
  const check = checkOf(t, tag, vocab);
  if (check?.kind === "status") { when = "saving"; if (check.status) applies.splice(0, applies.length, "organization"); }   // a customer status is saved on a company
  if (check?.kind === "field" && !applies.length) applies.push(...vocab.kinds.filter(k => check.kinds.includes(k)));   // the kinds that have the field
  const on = check?.kind === "status" ? (check.status ? `${check.status.replace(/_/g, " ")} status` : check.link) : check?.kind === "field" ? check.field : "";
  if (check && !when) when = check.kind === "word" ? null : "saving";
  if (check?.kind === "word" && /\b(notes?|sav(e|ing))\b/i.test(t) && /\b(drafts?|writ(e|ing)|emails?|messages?)\b/i.test(t)) when = null;   // both: no when
  const parts = [`applies to: ${applies.length ? applies.join(", ") : "general"}`, ...(when ? [`when: ${when}${on ? ` ${on}` : ""}`] : []), check ? "check" : "guidance"];
  return { line: `> ${parts.join(" · ")}`, check: !!check, general: !applies.length, refuses: check ? checkSays(check, when) : "", keep: `> applies to: ${applies.length ? applies.join(", ") : "general"} · guidance` };
}

/* ---------- A rule that starts work is a workflow ---------- */
const TRIGGER = /\b(whenever|every time|each time|as soon as|once|after|when|if)\b/i;
const ACTION = /\b(send|email|create|schedule|book|post|notify|invite|add|open|start|run|prepare|ping|message|share|set up|follow up|call|introduce|ship|order|thank|welcome|remind|congratulate)\b/i;
const OWN_ACTIVITY = /\b(?:when|whenever|while|before|after|if)\s+(?:you\s+|codex\s+|we\s+)?(?:writ|draft|sav|read|repl|answer|tagg|not(?:e|ing)|record|mention|talk|speak)/i;
const TOOL_OF = [[/\b(send|email|message|ping|introduce|thank|welcome|remind|congratulate)\b/i, "email"], [/\b(schedule|book|invite)\b/i, "calendar"], [/\b(crm|deal|pipeline)\b/i, "crm"], [/\bpost\b/i, "social"]];
/* {title, body, applies_to, text} for an instruction that starts work, or null for a rule. The body parses as a
   workflow (lib/workflows.mjs parseWorkflow); creating it is workflow create, on the person's yes. */
export function workOffer(text, vocab = null) {
  const t = String(text).trim().replace(/\.$/, "");
  if (/^\s*(never|don'?t|do not|no\b|only|avoid|mention|use|keep|write|say|ask)/i.test(t) || OWN_ACTIVITY.test(t)) return null;
  const trig = t.match(TRIGGER); if (!trig) return null;
  // the action: the clause without the trigger ("whenever X, send Y" or "send Y whenever X")
  let action, cond;
  const comma = t.indexOf(",");
  if (trig.index === 0 || /^(always\s+)?(whenever|every time|each time|as soon as|once|after|when|if)\b/i.test(t)) { if (comma < 0) return null; cond = t.slice(trig.index + trig[0].length, comma).trim(); action = t.slice(comma + 1).trim(); }
  else { action = t.slice(0, trig.index).replace(/^always\s+/i, "").trim(); cond = t.slice(trig.index + trig[0].length).trim(); }
  if (!ACTION.test(action) || !cond) return null;
  action = action.replace(/^(?:always\s+|then\s+|we\s+|codex\s+)/i, "").replace(/^(?:should|must|will)\s+/i, "").trim();
  const title = (action[0].toUpperCase() + action.slice(1)).split(/\s+/).slice(0, 6).join(" ").replace(/[.,;:]$/, "");
  const tool = TOOL_OF.find(([re]) => re.test(action))?.[1] || null;
  const who = KIND_WORDS.find(([re]) => re.test(action))?.[1] || KIND_WORDS.find(([re]) => re.test(cond))?.[1] || "entity", whoWord = { person: "Person", organization: "Company", product: "Product", event: "Event", tool: "Tool", entity: "Who" }[who];
  const body = `## Before starting\n\n- **${whoWord}**: the one this run is for, by name (it starts when ${cond}).\n\n## Steps\n\n1. **${title}**${tool ? ` (tool: ${tool})` : ""}. ${t}.\n\n## Learn\n\n- What to change in this step next time.\n`;
  return { title, body, applies_to: [title.toLowerCase().split(/\s+/).filter(w => !STOP.has(w)).slice(-2).join(" ")], trigger: cond,
    text: `"${t}" starts work, and a rule never starts work: offer it as a one-step workflow instead. On yes: workflow create with title "${title}" and the body below, then remove the line from Our rules and save ("RULES.md: ${title} is a workflow now").` };
}

/* ---------- The rules check's part: Our rules, line by line ---------- */
export function ourRulesFindings(root) {
  const out = [], add = (kind, line, what, choices, detail) => out.push({ rule: "RULES.md Our rules", kind, subject: `RULES.md line ${line}`, what, choices, ...(detail ? { detail } : {}) });
  const parsed = readOurRules(root), vocab = vocabulary(root); let unfiled = 0;
  for (const p of parsed.problems) add("rule-problem", p.line, `RULES.md line ${p.line}, Our rules: ${p.problem}; until it is fixed, the rule above it applies more widely.`, [`Fix it: ${p.proposal} (say /gtm-brain-rules, or edit RULES.md and save)`, "Remove the tag line (the rule stays, as general)"]);
  for (const r of parsed.rules) {
    if (r.work) { add("rule-work", r.line, `RULES.md line ${r.line}: ${r.work.text}`, [`Make it a workflow: workflow create (title "${r.work.title}", applies_to ${JSON.stringify(r.work.applies_to)}, the body below), then remove line ${r.line} and save`, `Keep it as a rule: write ${proposeTag(r.text, vocab).keep} on the line under it; it is shown as guidance and never starts anything`], r.work.body); continue; }
    if (!r.tag) { if (++unfiled > MAX_UNFILED) continue; const p = proposeTag(r.text, vocab); add("rule-unfiled", r.line, `RULES.md line ${r.line}: "${r.text}" is not filed yet, so it is shown in every chat${p.check ? " and nothing checks it" : ""}.`, [`File it: write ${p.line} on the line under it${p.refuses ? `; as a check it ${p.refuses}` : ""}`, ...(p.general ? [] : ["Keep it general: write > applies to: general · guidance"]), "Change the proposal (the person's words)"]); continue; }
    if (r.tag.mode === "check" && !r.check) add("rule-guidance", r.line, `RULES.md line ${r.line}: "${r.text}" is tagged check, but no check can be read from it; it is shown as guidance.`, [`Reword it as one the brain checks (${CHECK_PATTERNS.map(c => c.example).join(" / ")})`, "Tag it guidance"]);
  }
  if (unfiled > MAX_UNFILED) add("rule-unfiled", "more", `${unfiled - MAX_UNFILED} more Our rules lines are not filed yet.`, ["Run the check again after the first ones are filed"]);
  return out;
}

/* ---------- query rules with a scope: "rules for organization", "rules for Acme when drafting" ---------- */
/* search: a kind or subtype, "link <type>", general, or an entity's name; when: saving, drafting or reading; text: a
   draft to check. Every rule that applies, not once per chat: it was asked for. */
export function scopedReport(root, { search = "", when = null, text = null } = {}) {
  const parsed = readOurRules(root), vocab = vocabulary(root), q = String(search || "").trim().replace(/^(?:(?:our\s+)?rules\s+)?for\s+/i, ""), verb = when ? verbOf(when) || null : null;
  if (when && !verb) return { text: `when must be saving, drafting or reading (it says "${when}").`, error: true };
  const link = q.match(/^(?:link|relationship)\s+([a-z0-9_]+)$/i), lower = q.toLowerCase(), everything = !q || /^(general|all|everything)$/i.test(q);
  let scopes, about;
  if (everything) { scopes = []; about = "everything"; }
  else if (link) { scopes = [{ kind: null, links: [link[1].toLowerCase()] }]; about = `link ${link[1].toLowerCase()}`; }
  else if (vocab.kinds.includes(lower) || PLAIN_KIND.test(lower)) { const k = PLAIN_KIND.test(lower) ? plainKind(lower) : lower; scopes = [{ kind: k, links: [] }]; about = k; }
  else if (vocab.subtypes.includes(lower)) { scopes = [{ kind: "organization", subtype: lower, links: [] }]; about = `organization (${lower})`; }
  else {
    let s = null; try { s = entityScope(root, q, { rules: parsed.rules }); } catch {}
    if (!s) return { text: `rules for "${q}": no kind, link type or known entity by that name. Pass a kind (${vocab.kinds.join(", ")}), link <type>, general, or a name.`, error: true, unknown: true };
    scopes = [s]; about = `${s.name} (${s.kind}${s.subtype ? `, ${s.subtype}` : ""}${s.links.length ? `; ${s.links.join(", ")}` : ""})`;
  }
  const picked = everything ? { scoped: parsed.rules.filter(r => !r.work && !isGeneral(r) && whenMatches(r, verb)), general: parsed.rules.filter(r => !r.work && isGeneral(r) && whenMatches(r, verb)), moreGeneral: 0 } : rulesFor(parsed, scopes, verb);
  const shown = scopedText(picked, `${about}${verb ? ` when ${verb}` : ""}`) || `No rule in Our rules applies to ${about}${verb ? ` when ${verb}` : ""}${parsed.rules.length ? ` (${parsed.rules.length} rule${parsed.rules.length === 1 ? "" : "s"} in all)` : " (Our rules is empty)"}.`;
  const broken = text ? draftFindings(parsed, everything ? [] : scopes, text) : [];
  return { text: `${shown}${text ? `\n${broken.length ? `The draft ${broken.join("; ")}. Change it before it goes out.` : "The draft breaks no check rule."}` : ""}`, error: false };
}

/* For the chat start (lib/dots.mjs rulebookText): what every chat needs of Our rules once one is filed, the general
   and unfiled rules, and one line counting the filed ones that come with the reply that needs them. null while no
   rule has a tag line: the chat start then prints the section as written, as before. */
export function startRules(root) {
  try {
    const { rules } = readOurRules(root); if (!rules.some(r => r.tag)) return null;
    const general = rules.filter(r => !r.work && isGeneral(r)), scoped = rules.filter(r => !r.work && !isGeneral(r)), work = rules.filter(r => r.work);
    return [...general.map(r => `${r.text}${r.note ? ` ${r.note}` : ""}${label(r)}`),
      ...(scoped.length ? [`${scoped.length} more rule${scoped.length === 1 ? "" : "s"} for a kind or link (${[...new Set(scoped.flatMap(r => r.tag.applies.map(a => a.link ? `link ${a.link}` : a.subtype || a.kind)))].join(", ")}): each comes with the reply that needs it (a save, a brief, query rules).`] : []),
      ...(work.length ? [`${work.length} ${work.length === 1 ? "line that starts work waits" : "lines that start work wait"} to become workflows (query rules); never act on them as rules.`] : [])].join("\n");
  } catch { return null; }
}

/* The lines a reply carries for the entities in hand: scoped rules, once per chat per rule and action (shown is a
   createShownOnce), "" when nothing new applies. Never throws. */
export function replyRules(root, { scopes, verb, shown = null, chatKey = root, about = null }) {
  try {
    const parsed = readOurRules(root); if (!parsed.rules.some(r => !r.work)) return "";
    if (typeof scopes === "function") scopes = scopes(parsed.rules) || [];   // worked out only when there is a rule to show
    if (!scopes.length) return "";
    let picked = rulesFor(parsed, scopes, verb);
    if (shown) picked = shown.filter(chatKey, verb, picked);
    const kinds = [...new Set(scopes.map(s => s.subtype ? `${s.kind} (${s.subtype})` : s.kind))].join(", ");
    return scopedText(picked, `${about || kinds}${verb ? ` when ${verbText(verb)}` : ""}`);
  } catch { return ""; }
}

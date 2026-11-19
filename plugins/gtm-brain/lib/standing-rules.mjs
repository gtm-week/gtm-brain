/* The team's standing rules, where Codex reads them before its first call: a generated, marked block at the top of
   the brain's AGENTS.md (the way lib.writePointer keeps a project's block). Two sources: the "Our rules" lines of
   the rules file (configuration/rules.md, older layouts RULES.md), and every memory in force saved as a rule
   (remember with states_rule: true, kept as the tag RULE_TAG). Nothing here guesses from wording: a sentence with
   "from now on" or "never" is an ordinary note unless the caller said it states a rule. The block is refreshed at
   chat start, after a rule note is saved and after an approval; the person's own text outside the markers stays.
   Nothing here holds a save: the block's first line tells Codex to name the rule and ask. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as lib from "./brain.mjs";
import { readOurRules } from "./our-rules.mjs";

export const RULE_TAG = "standing-rule";
export const RULES_START = "<!-- gtm-brain our rules -->", RULES_END = "<!-- /gtm-brain our rules -->";
const squash = s => String(s || "").replace(/\s+/g, " ").trim();

/* Every rule in force: [{text, date, author, source, id?}] */
export function collectRules(root) {
  const out = [];
  let file = ""; try { file = lib.rulesFile(root); } catch {}
  try {
    for (const r of readOurRules(root).rules || []) {
      const text = squash(r.text); if (!text) continue;
      out.push({ text, date: null, author: null, source: `${file || "rules file"} line ${r.line}`, fromFile: true, ...(r.check ? { checked: true } : {}) });
    }
  } catch {}
  for (const c of lib.listContexts(root)) for (const m of lib.effectiveMemories(c.memories)) {
    if (m.retracts || !(m.tags || []).includes(RULE_TAG)) continue;
    out.push({ text: squash(m.content), date: String(m.at || "").slice(0, 10) || null, author: (m.authors || [])[0] || null, source: `${m.id} in ${c.slug}`, id: m.id });
  }
  return out;
}

/* The marked block for these rules; "" when there are none. */
export function rulesBlock(rules) {
  if (!rules.length) return "";
  const own = rules.filter(r => r.fromFile), noted = rules.filter(r => !r.fromFile);
  const line = r => `- ${r.text.slice(0, 300)}${r.id ? ` (${[r.date, r.author, r.id].filter(Boolean).join(", ")})` : ""}`;
  return [RULES_START, "## Our rules: check before saving or acting",
    "When a request may break one of these, do not save or act: name the rule and ask.",
    ...own.map(line),
    ...(noted.length ? ["", "### Stated in notes, not yet in the rules file", ...noted.map(line)] : []),
    RULES_END].join("\n") + "\n";
}

/* Text without the block, and the block it held. */
export function cutRulesBlock(text) {
  const t = String(text ?? ""), a = t.indexOf(RULES_START), b = t.indexOf(RULES_END);
  if (a < 0 || b < a) return { text: t, block: "" };
  const end = b + RULES_END.length;
  return { text: t.slice(0, a) + t.slice(end).replace(/^\n+/, ""), block: t.slice(a, end) + "\n" };
}
/* The block put back at the top of a text. */
export const withRulesBlock = (text, block) => block ? `${block}\n${String(text ?? "").replace(/^\n+/, "")}` : String(text ?? "");

/* Write the block into the brain's AGENTS.md (top of the file, everything else kept word for word). True when the
   file changed. A brain without AGENTS.md gets none: setup writes the rulebook, not this. */
export function refreshRulesBlock(root) {
  const file = join(root, "AGENTS.md"); if (!existsSync(file)) return false;
  const now = readFileSync(file, "utf8"), { text } = cutRulesBlock(now);
  let rules = []; try { rules = collectRules(root); } catch { return false; }
  const next = withRulesBlock(text, rulesBlock(rules));
  if (next === now) return false;
  writeFileSync(file, next); return true;
}
/* Refresh and commit through the lib's one commit path. Returns the commit note or "". */
export function keepRulesBlock(root, why = "rules: AGENTS.md block refreshed") {
  if (!refreshRulesBlock(root)) return "";
  try { return lib.commit(root, ["AGENTS.md"], why, { system: true })?.note || ""; } catch { return ""; }
}

export const offerLine = (id, root) => { let file = "the rules file"; try { file = lib.rulesFile(root); } catch {}
  return `${id} is kept as a team rule and is in the "Our rules" block of AGENTS.md. Offer once to add it to Our rules in ${file} through approve_change (Yes, add it / No, keep it as a note).`; };

/* ---------- At save: the rules a note falls under (0.38.0) ----------
   The block above reaches Codex as text before the first save, so whether a save honours a rule was up to the
   model (benchmark: the churned-customer rule held in one run and not in the next). remember reads the rules
   again on every save and matches each one against the note in hand, with no model call: the rule's own words
   (stemmed, without filler and without people's names) against the note's words, its tags and its status block,
   plus a few fixed concepts (a price or a discount is "pricing", a cancellation is "churn"). The rule's
   condition may also sit in the earlier notes about a company or person the note names ("Quarry Lane Books
   churned"): those are the evidence. A rule that tells to ask first, or one the note clearly appears to break (its
   condition known, its forbidden thing in the note), is a hold; only remember's chat tool call acts on it (the
   save waits until the person answered), every other caller saves. Any other rule that applies is printed at the
   top of the result. rule_checked: true is the person's yes to a hold that happened. */
const STOP_W = new Set(("a an the of to for with on in at by is are be was were has have had our their its his her and or any every each before after until unless without from as that this it them they we you us " +
  "ask asks asked asking sav save saves saved saving check checks checked confirm confirmed first time times always never again note notes record records recorded team anything something everything " +
  "thing things someone anyone people company compan companies customer customers client clients need needs must should make sure keep also only what when which who whom will would can could get use " +
  "said say says tell like just ever even all one new now today then than more less very much many not no don do does done there here into over under about while each other another same such way again").split(" "));
// One stem for a word's forms: role, roles; rate, rates; sale, sales; price, prices, pricing, priced. A plural loses
// its s before anything else, so a five-letter plural and its four-letter singular meet (roles was "rol", role "role").
const stemW = w => {
  w = w.replace(/'s$/, "");
  if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.length > 3 && /[^su]s$/.test(w) && !/is$/.test(w)) w = w.slice(0, -1);
  return w.replace(/(?<=.{3})(?:ing|ed)$/, "").replace(/(?<=.{3})e$/, "");
};
// a number with a currency (50k EUR, EUR 1,200, $40), never a bare count ("50k subscribers"); a quote is the noun
// (a quote, the quotes), never "quoted the CEO"; a fee only with what kind of fee it is
const CONCEPTS = [
  [/(?:\d[\d.,]*\s*k?\s*(?:eur|usd|gbp|pln|chf|sek|euros?|dollars?|€|\$|£)(?![a-z]))|(?:\b(?:eur|usd|gbp|pln|chf|sek)\s*\d)|(?:[€$£]\s*\d)|\bdiscount\w*|\bper (?:seat|user|month|year|return|unit|order|licen[cs]e)\b|\b(?:setup|set-up|licen[cs]e|monthly|annual|yearly|service|platform|subscription|onboarding) fees?\b|\brate card\b|\b(?:a|the|our|their|this|that|new|revised) quotes?\b|\bpric\w*/i, "pric"],
  [/\bchurn\w*|\bcancel+(?:ed|s|ing|ation)?\b|\bnot renewing\b|\bdid not renew\b|\bformer customer\b|\bleft us\b|\bgave (?:us )?notice\b/i, "churn"],
];
const NAME_PART = /^[a-z]+$/;
// two letters count only as an acronym written in capitals: HR, PR, AI, QA, EU
const ACRO_SKIP = new Set(["ok", "am", "pm", "id", "vs", "eg", "ie"]);
function wordsOf(text, skip = new Set()) {
  const out = new Map(), t = String(text || "");
  for (const raw of t.match(/[A-Za-z][A-Za-z0-9'-]*/g) || []) for (const part of raw.split(/[-']/)) {
    const w = part.toLowerCase();
    if (w.length === 2 && /^[A-Z][A-Z0-9]$/.test(part)) { if (!STOP_W.has(w) && !ACRO_SKIP.has(w) && !skip.has(w) && !out.has(w)) out.set(w, part); continue; }
    if (w.length < 3 || STOP_W.has(w) || skip.has(w)) continue;
    const s = stemW(w); if (s.length < 3 || STOP_W.has(s)) continue;
    if (!out.has(s)) out.set(s, part);
  }
  for (const [re, s] of CONCEPTS) { const m = t.match(re); if (m && !out.has(s)) out.set(s, m[0].trim()); }
  return out;   // stem -> the word as written
}
// Ask first: the rule makes asking a step before the save or the act ("ask before saving", "check with Anna first",
// "without asking Anna first", "needs approval"). "Ask the customer for a reference" or "always confirm the meeting
// time" tell what to do, not to ask before saving.
const ASK = /\b(?:ask|asks|asking|check|checking|confirm|confirming|clear)\b(?:\W+[\w']+){0,3}?\W+(?:first|before)\b|\b(?:check|checking|confirm|confirming|clear (?:it|this|that))\s+with\b|\b(?:approval|sign[- ]?off)\b|\b(?:needs?|get|gets|requires?)\b[^.]{0,30}\bapprov\w*|\brun (?:it|this|that) (?:by|past)\b/i;
// who to ask is not what the rule is about: "Check with Anna first" makes no note about Anna a pricing note
const ASKED = /\b(?:[Aa]sk(?:s|ing)?|[Cc]heck(?:ing)?|[Cc]onfirm(?:ing)?|[Cc]lear it|[Rr]un it)\s+(?:with\s+|by\s+|past\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g;
// a prohibition, never a bare "not": "If the customer is not in the EU, add a VAT note" forbids nothing
const FORBID = /\b(?:never|do not|don'?t|must not|may not|should not|shouldn'?t|cannot|can'?t|no longer|not allowed|is not to|are not to)\b/i;
// a day or a month in the forbidden thing is part of it: "Do not email partners on Fridays" is not broken by an email on a Tuesday
const QUALIFIER = new Set([..."monday tuesday wednesday thursday friday saturday sunday weekend january february march april may june july august september october november december".split(" ")].map(stemW));
/* The rule's keywords: its words without filler, attribution ("(Anna Lind, 2026-04-30)"), whom to ask or the names
   of the brain's people; split at the forbidding word into condition (before) and the forbidden thing (after), both
   inside the sentence that forbids. askTopic: the words of the sentences that say to ask first (the whole rule when
   those sentences name nothing, "Check with Anna first, every time."): what asking governs. */
const SENTENCES = t => t.split(/(?<=[.!?;])\s+/).filter(x => x.trim());
function ruleKeys(text, names) {
  const t = String(text).replace(/\([^)]*\b\d{4}-\d{2}-\d{2}[^)]*\)/g, " "), ask = ASK.test(t);
  const words = t.replace(ASKED, m => m.split(/\s+/)[0]);
  const all = wordsOf(words, names);
  const askSay = SENTENCES(words).filter(x => ASK.test(x)).flatMap(x => [...wordsOf(x, names).keys()]);
  const forbidding = SENTENCES(words).find(x => FORBID.test(x)) || "", m = forbidding.match(FORBID), cut = m ? m.index : -1;
  // "never X before (without, until, unless) Y": Y is what makes X allowed, never a sign the note breaks it
  const tail = cut >= 0 ? forbidding.slice(cut) : "", ex = tail.search(/\b(?:before|without|until|unless|except|other than)\b/i);
  const cond = cut > 0 ? wordsOf(forbidding.slice(0, cut), names) : new Map(), act = cut >= 0 ? wordsOf(ex > 0 ? tail.slice(0, ex) : tail, names) : all;
  return { all: [...all.keys()], cond: [...cond.keys()], act: [...act.keys()], askTopic: askSay.length ? [...new Set(askSay)] : [...all.keys()], ask, forbids: !!m, unless: ex > 0 };
}
// A hold needs the rule's own condition to clearly match: a named concept (pricing, churn), two distinct topic words
// of the rule, or the one word a one-word topic has. Anything less is printed at the top and saved: a wrong hold
// costs the person a question about nothing, a missed one still shows them the rule.
const CONCEPT_STEMS = new Set(CONCEPTS.map(c => c[1]));
const clearly = (hit, topic) => hit.some(s => CONCEPT_STEMS.has(s)) || new Set(hit).size >= 2 || (topic.length === 1 && hit.length === 1);
const many = v => Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",").map(x => x.trim()).filter(Boolean) : [];

/* The rules a note falls under: [{rule, said, known, hold, why}]. said: the rule's words the note has, as written;
   known: [{id, name, word, text}] earlier notes about the note's entities that say the rule's other words. hold:
   the save waits for the person (an ask rule, or one it appears to break). Never throws; [] with no rules. */
export function rulesForSave(root, entry, { rules = null, registry = null, memories = null } = {}) {
  try {
    if (!entry || typeof entry !== "object" || entry.retracts || (entry.tags || []).includes?.(RULE_TAG)) return [];
    rules ||= collectRules(root); if (!rules.length) return [];
    registry ||= lib.readNames(root);
    const names = new Set(registry.filter(e => (e.kind || "person") === "person").flatMap(e => String(e.name || "").toLowerCase().split(/\s+/)).filter(w => NAME_PART.test(w) && w.length > 2));
    const note = wordsOf([entry.content, ...many(entry.tags).map(t => t.replace(/[:_]/g, " ")), entry.customer?.status ? String(entry.customer.status).replace(/_/g, " ") : "", entry.relation?.type ? String(entry.relation.type).replace(/_/g, " ") : ""].join(" . "));
    const ents = [...many(entry.people), ...many(entry.companies), entry.customer?.entity, entry.relation?.from, entry.relation?.to].filter(x => x && x !== "us")
      .map(n => lib.resolveEntity(registry, n)).filter(Boolean).filter((e, i, a) => a.findIndex(x => x.id === e.id) === i);
    let pool = null;
    const history = () => pool ??= (() => {
      const all = memories || lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories)).filter(m => !m.retracts);
      return ents.flatMap(e => { const nm = String(e.name).toLowerCase();
        return all.filter(m => (m.entities || []).includes(e.id) || [...(m.people || []), ...(m.companies || [])].some(p => String(p).toLowerCase() === nm) || (m.customer && lib.resolveEntity(registry, m.customer.entity)?.id === e.id))
          .map(m => ({ m, e, words: wordsOf(`${m.content} ${m.customer?.status === "former_customer" ? "former customer" : ""}`) })); })
        .sort((a, b) => String(b.m.at || "").localeCompare(String(a.m.at || "")));
    })();
    const out = [];
    for (const rule of rules) {
      if (rule.checked) continue;   // a rule tagged check is evaluated exactly by lib/our-rules.mjs saveRefusals
      const k = ruleKeys(rule.text, names); if (!k.all.length) continue;
      const said = k.all.filter(s => note.has(s)); if (!said.length) continue;
      const known = [];
      if (ents.length) for (const s of (k.cond.length ? k.cond : k.all)) if (!note.has(s)) { const h = history().find(x => x.words.has(s)); if (h) known.push({ stem: s, id: h.m.id, name: h.e.name, word: h.words.get(s), text: squash(h.m.content).slice(0, 160).replace(/[.\s]+$/, "") }); }
      // one shared word is enough only when it is what the rule is about, its first word ("Notes about webinars go to
      // Strategy with the date": webinars, not date); a rule of four words or more always needs two (or its condition
      // known from earlier notes)
      const first = k.all[0], lead = note.has(first) || known.some(x => x.stem === first);
      const need = k.all.length === 1 ? 1 : k.all.length >= 4 ? 2 : lead ? 1 : 2;
      if (said.length + known.length < need) continue;
      // appears to break it: the condition is known (in the note or an earlier note) and the forbidden thing is in the note
      const condHit = k.cond.filter(s => note.has(s) || known.some(x => x.stem === s));
      const condMet = !k.cond.length || condHit.length > 0;
      if (k.forbids && !condMet) continue;   // "a churned customer is never a prospect": a company nobody says churned is not its business
      const actHit = k.act.filter(s => !QUALIFIER.has(s) && note.has(s));
      const breaks = k.forbids && !k.unless && actHit.length > 0 && k.act.every(s => !QUALIFIER.has(s) || note.has(s))
        && clearly([...condHit, ...actHit], [...new Set([...k.cond, ...k.act.filter(s => !QUALIFIER.has(s))])]);
      // ask first holds only on what the asking sentence is about, said in the note itself
      const asks = k.ask && clearly(k.askTopic.filter(s => note.has(s)), k.askTopic);
      out.push({ rule, said: said.map(s => note.get(s)), known, ask: asks, breaks, hold: asks || breaks });
    }
    return out;
  } catch { return []; }
}

/* One line per rule for the save's result. held: the save waits for the person; confirmed: it is their yes. */
export function ruleSaveLine(hit, { held = false, confirmed = false } = {}) {
  const r = hit.rule, src = r.fromFile || r.fromCall ? r.source : `note ${r.id}`;
  const facts = hit.known.map(x => `${x.id} says ${x.name} "${x.text}"`).join("; ");
  const head = `team rule "${r.text.slice(0, 300)}" (${src}) applies: the note says ${hit.said.map(w => `"${w}"`).join(", ")}${facts ? `, and ${facts}` : ""}`;
  if (confirmed && hit.hold) return `${head}. Saved on the person's yes (rule_checked); say so in your reply.`;
  if (!held) return `${head}. Saved; follow the rule in your reply and in what you do next.`;
  return hit.breaks && !hit.ask
    ? `${head}. This save appears to break the rule: do not save or act on it. Tell the person the rule${facts ? " and that fact" : ""} and ask whether this is an exception (Yes, save it anyway / No, leave it); only after their yes call remember again with rule_checked: true`
    : `${head}. The rule says to ask first: do not save yet. Ask the person, naming the rule (Yes, save it / No, leave it); only after their yes call remember again with rule_checked: true`;
}

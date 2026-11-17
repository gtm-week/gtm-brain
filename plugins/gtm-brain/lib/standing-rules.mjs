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
      out.push({ text, date: null, author: null, source: `${file || "rules file"} line ${r.line}`, fromFile: true });
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

/* The team's standing rules, read before a save (remember). Two sources: the "Our rules" lines of the rules file
   (configuration/rules.md, older layouts RULES.md), and every memory in force whose text states a standing rule
   ("from now on", "always", "never", "ask before ...", "standing rule"). A save that plausibly touches one is held
   once with the rule's text, date and author; the same call with rule_checked: true saves it. "Plausibly": the
   rule and the note share a linked entity, or at least two significant words after stop words are dropped. Simple
   on purpose, so the reply can say why. Reads are never blocked: nothing here runs for a read. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as lib from "./brain.mjs";
import { readOurRules, stems } from "./our-rules.mjs";
import { workDir } from "./brain-paths.mjs";

// "never" and "always" count only as an instruction to the team: at the start of a sentence ("Never send ...") or
// after we, the team, everyone ("we always ask ..."). "Anna never replies on Fridays" is a fact, not a rule.
const STATES = /\b(?:standing rule|from now on|going forward|ask (?:me|us|the owner|[A-Z][a-z]+) (?:first )?before|(?:we|the team|everyone|nobody) (?:should |must )?(?:never|always))\b|(?:^|[.!?:]\s+)(?:never|always|do not ever|don't ever)\s+[a-z]/i;
/* Does this text state a standing rule for the team? A decision or note only, never a question. */
export const statesRule = (text, kind = "note") => (kind === "note" || kind === "decision") && STATES.test(String(text || ""));

// words that carry no topic: the rule cue words and the everyday verbs of a note
const NOISE = new Set(stems("standing rule from now on going forward never always ask before do not don't ever must should we us me team note said says told want wants will would can could just also only new"));
const topic = text => [...new Set(stems(text).filter(w => w.length > 2 && !NOISE.has(w)))];

/* Every rule in force: [{text, date, author, source, entities}] */
export function collectRules(root) {
  const out = [];
  let file = ""; try { file = lib.rulesFile(root); } catch {}
  for (const r of readOurRules(root).rules || []) {
    const text = String(r.text || "").replace(/\s+/g, " ").trim(); if (!text) continue;
    // a rule tagged check is evaluated exactly at save (our-rules saveRefusals): it is shown, never held on loose words
    out.push({ text, date: null, author: null, source: `${file || "rules file"} line ${r.line}`, entities: [], checked: r.tag?.mode === "check" });
  }
  for (const c of lib.listContexts(root)) for (const m of lib.effectiveMemories(c.memories)) {
    if (m.retracts || !statesRule(m.content, m.kind || "note")) continue;
    out.push({ text: String(m.content).replace(/\s+/g, " ").trim(), date: String(m.at || "").slice(0, 10) || null, author: (m.authors || [])[0] || null, source: `${m.id} in ${c.slug}`, id: m.id, entities: [...(m.people || [])] });
  }
  return out;
}

/* The rules this entry may collide with, each with why. */
export function collisions(rules, entry, linked = []) {
  const words = topic(entry.content), names = new Set(linked.map(n => String(n).toLowerCase()));
  const hits = [];
  for (const r of rules) {
    if (r.checked || (r.id && (entry.supersedes === r.id || entry.retracts === r.id))) continue;   // enforced exactly elsewhere, or a correction of the rule itself
    const entity = r.entities.find(n => names.has(String(n).toLowerCase()));
    const shared = topic(r.text).filter(w => words.includes(w));
    if (entity) hits.push({ rule: r, why: `both are about ${entity}` });
    else if (shared.length >= 2) hits.push({ rule: r, why: `both mention ${shared.slice(0, 4).join(", ")}` });
  }
  return hits;
}

const said = r => `"${r.text.slice(0, 200)}"${r.date || r.author ? ` (${[r.date, r.author].filter(Boolean).join(", ")})` : ""}, ${r.source}`;
export const holdLine = hits => `not saved: this may collide with a rule: ${hits.map(h => `${said(h.rule)}; ${h.why}`).join(" | ")}. Ask the person whether the rule applies to this note and end the turn. When they say save it, call remember again with the same entry and rule_checked: true.`;

/* The compact rules block for the first write of a chat; "" after that (work/rules-shown.json, per chat). */
export function firstWriteRules(root, chat, rules) {
  if (!rules.length || !chat || process.env.GTM_BRAIN_RUN) return "";   // a chat's first write; a run outside a chat has no chat to tell
  const file = join(workDir(root), "rules-shown.json"), key = chat;
  let seen = {}; try { seen = JSON.parse(readFileSync(file, "utf8")) || {}; } catch {}
  if (seen[key]) return "";
  seen[key] = new Date().toISOString();
  const keep = Object.fromEntries(Object.entries(seen).sort((a, b) => Date.parse(b[1]) - Date.parse(a[1])).slice(0, 50));
  try { mkdirSync(workDir(root), { recursive: true }); writeFileSync(file, JSON.stringify(keep, null, 1) + "\n"); } catch {}
  const shown = rules.slice(0, 12).map(r => `- ${r.text.slice(0, 160)}${r.date || r.author ? ` (${[r.date, r.author].filter(Boolean).join(", ")})` : ""}`);
  return `The team's rules (shown once per chat; follow them when saving):\n${shown.join("\n")}${rules.length > 12 ? `\n- and ${rules.length - 12} more in ${lib.rulesFile(root)}` : ""}`;
}

export const offerLine = (id, root) => { let file = "the rules file"; try { file = lib.rulesFile(root); } catch {}
  return `${id} states a standing rule: it counts as one for every save from now on. Offer once to add it to Our rules in ${file} (Yes, add it / No, keep it as a note); on yes, add the line under "## Our rules" and call save. Do not do it unasked.`; };

/* The rule pages: the detail of each topic of a brain's rulebook, shipped with the plugin under policies/rules/
   (plus the shared question and Computer Use policies). The brain's AGENTS.md keeps the core and one line per
   rule; a page is fetched only when it matters: `query` with object rules and search = a topic returns just that
   page, and a tool attaches its own page to the first reply of a chat that refuses or holds something (server.mjs). A brain's own rules stay in
   its RULES.md. Node built-ins only. */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const POLICIES = fileURLToPath(new URL("../policies/", import.meta.url));
const RULES = join(POLICIES, "rules");
// The two shared policies are also generated into other documents, so they carry no frontmatter of their own.
const SHARED = [
  { slug: "questions", title: "Asking the person", file: "questions.md", attach: [],
    words: "question questions ask asking options choice choices numbered permission request_user_input plan mode slop identity" },
  { slug: "computer-use", title: "Computer Use and websites", file: "computer-use.md", attach: [],
    words: "computer browser website websites chrome screenshot click login sign-in connector mcp ui embedded" },
];

const words = s => String(s || "").toLowerCase().split(/[^a-z0-9.@-]+/).map(w => w.replace(/^[.-]+|[.-]+$/g, "")).filter(Boolean);
const parse = (slug, text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {}; if (m) for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { slug, title: meta.title || slug, words: new Set(words(meta.words)), attach: words(meta.attach).length ? meta.attach.split(/\s+/).filter(Boolean) : [], body: (m ? text.slice(m[0].length) : text).trim() };
};
let cache;
export function rulePages() {
  if (cache) return cache;
  const own = readdirSync(RULES).filter(f => f.endsWith(".md")).sort().map(f => parse(f.slice(0, -3), readFileSync(join(RULES, f), "utf8")));
  const shared = SHARED.map(s => ({ slug: s.slug, title: s.title, words: new Set(words(s.words)), attach: s.attach, body: readFileSync(join(POLICIES, s.file), "utf8").trim() }));
  return cache = [...shared, ...own];
}

/* The pages a search names. Its slug outright; else the pages whose slug, search words and title match the most
   of the search (a word matches its plural and other endings: "meeting" finds "meetings"; two words also count
   joined, "brain question" as brain-question). Filler words ("the", "how", "use", "page") name no topic. Several
   pages when they fit equally, none when nothing matches: a page is never passed off as the answer on a guess. */
const FILLER = new Set("a an and or of to in on for with from at by is are be do does did can should i we you it its me my our us this that these those the how what who where why when which go goes use using about page pages rule rules".split(" "));
export function matchRulePages(search) {
  const pages = rulePages(), q = String(search || "").trim().toLowerCase();
  if (!q) return [];
  const exact = pages.find(p => p.slug === q || p.slug === q.replace(/\s+/g, "-")); if (exact) return [exact];
  const near = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
  const said = words(q), asked = [...said.filter(w => !FILLER.has(w)), ...said.slice(1).map((w, i) => `${said[i]}-${w}`)];
  let best = [], top = 0;
  for (const p of pages) {
    const title = words(p.title);
    let score = 0;
    for (const w of asked) {
      if (near(p.slug, w)) score += 4;
      else if ([...p.words].some(t => near(t, w))) score += 2;
      else if (!w.includes("-") && title.some(t => near(t, w))) score += 1;
    }
    if (score > top) { top = score; best = [p]; } else if (score && score === top) best.push(p);
  }
  return best;
}
/* The one page a search names; null when none does or several fit equally. */
export function findRulePage(search) { const found = matchRulePages(search); return found.length === 1 ? found[0] : null; }

export const rulePageIndex = () => rulePages().map(p => p.slug).join(", ");
export const rulePageText = page => `--- Rule page: ${page.title} (query rules, search "${page.slug}") ---\n${page.body}\n---`;

/* What query (object rules, search) answers: the page; the names of the pages that fit equally; or the list of
   pages when none matches. */
export function rulePageAnswer(search) {
  const found = matchRulePages(search);
  if (found.length === 1) return rulePageText(found[0]);
  if (found.length > 1) return `Several rule pages match "${search}": ${found.map(p => `${p.slug} (${p.title})`).join(", ")}. Ask with one of these names as search.`;
  return `No rule page matches "${search}". Rule pages: ${rulePageIndex()}. Ask with one of them as search.`;
}

/* The page a tool's reply carries the first time it refuses, holds or fails in a chat: by tool name, or by "query:<object>". */
export function pageForCall(name, args = {}) {
  const keys = [name, ...(name === "query" && typeof args.object === "string" ? [`query:${args.object}`] : [])];
  return rulePages().find(p => p.attach.some(a => keys.includes(a))) || null;
}

/* A person's own lines in a rulebook the upgrader will not replace by itself: every line of their file that is in
   neither the shipped rules it started from (the snapshot it shares the most lines with) nor the new rules, in
   their order, a blank line kept where their file had one. "" when they added nothing. */
export function ownAdditions(current, shipped, target) {
  const lines = String(current || "").split("\n");
  const sets = shipped.map(t => new Set(String(t).split("\n")));
  let base = new Set(); let most = -1;
  for (const s of sets) { const n = lines.filter(l => l.trim() && s.has(l)).length; if (n > most) { most = n; base = s; } }
  const next = new Set(String(target || "").split("\n"));
  const out = []; let gap = false;
  for (const l of lines) {
    if (!l.trim()) { gap = out.length > 0; continue; }
    if (base.has(l) || next.has(l) || l.trim() === "## This brain's own additions") { gap = out.length > 0; continue; }
    if (gap && out.length) out.push(""); gap = false; out.push(l);
  }
  return out.join("\n").trim();
}
/* The new rules with the person's own lines kept at the end, under their own heading. */
export const HEADING_OWN = "## This brain's own additions";
const OWN_MARK = `\n\n${HEADING_OWN}\n\n`;
export function withOwnAdditions(target, current, shipped) {
  const own = ownAdditions(current, shipped, target);
  return own ? `${target.trimEnd()}${OWN_MARK}${own}\n` : target;
}
/* A rulebook is the shipped rules, then, when the person has any, their own additions under that heading. The
   upgrader compares and replaces the rules part only, and carries the additions over as they are. */
export function splitOwn(text) {
  const t = String(text ?? ""), i = t.indexOf(OWN_MARK);
  return i < 0 ? { rules: t, own: "" } : { rules: `${t.slice(0, i)}\n`, own: t.slice(i + OWN_MARK.length) };
}
export const joinOwn = (rules, own) => own ? `${rules.trimEnd()}${OWN_MARK}${own}` : rules;

/* The whole rulebook as one text: the template, then every page. For tests and the size check. */
export function wholeRulebook(template) {
  return [template, ...rulePages().map(rulePageText)].join("\n\n");
}

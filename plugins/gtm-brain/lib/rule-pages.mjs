/* The rule pages: the detail of each topic of a brain's rulebook, shipped with the plugin under policies/rules/
   (plus the shared question and Computer Use policies). The brain's AGENTS.md keeps the core and one line per
   rule; a page is fetched only when it matters: `query` with object rules and search = a topic returns just that
   page, and a tool attaches its own page to its first reply of a chat (server.mjs). A brain's own rules stay in
   its RULES.md. Node built-ins only. */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const POLICIES = fileURLToPath(new URL("../policies/", import.meta.url));
const RULES = join(POLICIES, "rules");
// The two shared policies are also generated into other documents, so they carry no frontmatter of their own.
const SHARED = [
  { slug: "questions", title: "Asking the person", file: "questions.md", attach: [],
    words: "question questions ask asking options choice choices numbered answer yes no permission request_user_input plan mode slop identity person who" },
  { slug: "computer-use", title: "Computer Use and websites", file: "computer-use.md", attach: [],
    words: "computer use browser website websites chrome screenshot click login sign-in connector mcp ui embedded" },
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

/* The page a search names: its slug outright, else the one whose slug, title and words match the most search
   words (a word matches its plural and other endings: "meeting" finds "meetings"). null when nothing matches. */
export function findRulePage(search) {
  const pages = rulePages(), q = String(search || "").trim().toLowerCase();
  if (!q) return null;
  const exact = pages.find(p => p.slug === q || p.slug === q.replace(/\s+/g, "-")); if (exact) return exact;
  const near = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
  let best = null, top = 0;
  for (const p of pages) {
    const title = words(p.title), slug = words(p.slug.replace(/-/g, " "));
    let score = 0;
    for (const w of words(q)) {
      if (slug.some(s => near(s, w))) score += 3;
      else if (title.some(t => near(t, w))) score += 2;
      else if ([...p.words].some(t => near(t, w))) score += 1;
    }
    if (score > top) { top = score; best = p; }
  }
  return best;
}

export const rulePageIndex = () => rulePages().map(p => p.slug).join(", ");
export const rulePageText = page => `--- Rule page: ${page.title} (query rules, search "${page.slug}") ---\n${page.body}\n---`;

/* What query (object rules, search) answers: the page, or the list of pages when none matches. */
export function rulePageAnswer(search) {
  const page = findRulePage(search);
  return page ? rulePageText(page) : `No rule page matches "${search}". Rule pages: ${rulePageIndex()}. Ask with one of them as search.`;
}

/* The page a tool's reply carries the first time it matters in a chat: by tool name, or by "query:<object>". */
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
export function withOwnAdditions(target, current, shipped) {
  const own = ownAdditions(current, shipped, target);
  return own ? `${target.trimEnd()}\n\n${HEADING_OWN}\n\n${own}\n` : target;
}

/* The whole rulebook as one text: the template, then every page. For tests and the size check. */
export function wholeRulebook(template) {
  return [template, ...rulePages().map(rulePageText)].join("\n\n");
}

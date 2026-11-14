/* "Ask the source": the RULES.md table that says, per kind of question, which tool knows better than a saved
   note and how old a note may be before Codex reads the tool instead (ALL-712; the brain answered deal stage
   from a 9-day-old note while HubSpot had moved on). The person edits the table; a brain whose RULES.md has no
   such section (an edited file from before 0.35.0, never overwritten) follows the defaults shipped in
   templates/RULES.md. Reading never throws: a row that cannot be read is reported, with its line and a fix,
   in the rules check (query rules), and the rest of the table still applies.

   Matching a note to a row is by where the note came from, never by guessing at its words: a row's Ask cell
   names a kind of tool (CRM, calendar, email, ...) or a tool by name, and a note matches when one of its
   sources is that kind or that tool (source kind hubspot for the CRM row). A row applies only while a tool of
   that kind is connected (work/tools.json: installed, not declined, read test not failed). Read-time text only;
   nothing is stored. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readAdmin, toolKey } from "./brain.mjs";
import { daysSince, nowMs } from "./staleness.mjs";

export const HEADING = "Ask the source";
const HEAD = /^##\s+Ask the source\s*$/im;
const TEMPLATE = fileURLToPath(new URL("../templates/RULES.md", import.meta.url));
const read = p => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const flat = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const cells = line => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim().replace(/^`|`$/g, "").trim());

/* The kinds of tool an Ask cell can name, each with the words that name it and the tools (source kinds, tool
   names) that belong to it. Tool names in a cell ("CRM (HubSpot)", "Luma") narrow the row to that tool. */
export const KINDS = [
  { kind: "crm", label: "the CRM", words: /\bcrm\b|pipeline/i, tools: /hubspot|attio|salesforce|pipedrive|zohocrm|folk|copper/ },
  { kind: "billing", label: "billing", words: /billing|invoice|payment|accounting/i, tools: /stripe|chargebee|paddle|quickbooks|xero|invoice|billing|fakturownia/ },
  { kind: "events", label: "the events tool", words: /\bevents?\b|registration/i, tools: /luma|eventbrite|lu\.ma|meetup|hopin|bevy/ },
  { kind: "calendar", label: "the calendar", words: /calendar/i, tools: /calendar|calendly|cal\.com|gcal/ },
  { kind: "email", label: "email", words: /e-?mail|inbox|\bmail\b/i, tools: /gmail|outlook|mail/ },
  { kind: "meetings", label: "the meeting notes tool", words: /meeting|transcript|recorder|notetaker/i, tools: /granola|wispr|fireflies|otter|fathom|pocket|gong|tldv|transcript|recorder/ },
];
const BRAIN = /^(the\s+)?brain\b|gtm brain|^memory$|^notes?$/i;

/* "1 day", "3 days", "2 weeks", "12 hours" -> days; "always ask", "live" -> "live"; "no limit", "once saved" ->
   "always"; anything else -> null. Live is checked first: "always ask" is live, "always" alone is no limit. */
export function parseGoodFor(text) {
  const v = String(text || "").trim().toLowerCase();
  if (!v) return null;
  if (/no limit|unlimited|forever|any age|once saved|never expires|does not expire/.test(v)) return "always";
  if (/\blive\b|always ask|ask (it )?(every|each) time|^never$|^0\s*(days?|hours?)?$/.test(v)) return "live";
  if (/^always\b/.test(v)) return "always";
  const m = v.match(/^(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|days?|d|weeks?|w|months?|mo)\b/);
  if (!m) return null;
  const n = Number(m[1]), unit = m[2];
  const days = /^h/.test(unit) ? n / 24 : /^w/.test(unit) ? n * 7 : /^mo/.test(unit) ? n * 30 : n;
  return days > 0 ? days : "live";
}

/* An Ask cell -> {brain} or {kind, names}: the kind of tool and the tool names it mentions (flat). */
function resolveAsk(text, known) {
  const v = String(text || "").trim();
  if (!v) return null;
  if (BRAIN.test(v)) return { brain: true, kind: null, names: [] };
  const kind = KINDS.find(k => k.words.test(v)) || KINDS.find(k => k.tools.test(flat(v))) || null;
  const words = v.toLowerCase().split(/[()\/,]|\bor\b|\band\b/).map(flat).filter(w => w.length >= 3);
  const names = words.filter(w => known.has(w) || KINDS.some(k => k.tools.test(w) && !k.words.test(w)));
  return kind || names.length ? { brain: false, kind: kind?.kind || null, names } : null;
}

/* Markdown (a whole RULES.md) to {found, rows, problems}. rows: {line, topic, source, ask, good_for}, good_for a
   number of days, "live" or "always"; ask {brain} or {kind, names}. Columns are found by header name, in any
   order; extra spaces and backticks are fine. problems: {line, problem, proposal}, at most ten. */
export function parseAskSource(text, { tools = [] } = {}) {
  const lines = String(text || "").split("\n"), problems = [], rows = [];
  const add = (line, problem, proposal) => { if (problems.length < 10) problems.push({ line, problem, proposal }); };
  const start = lines.findIndex(l => HEAD.test(l));
  if (start < 0) return { found: false, rows, problems };
  let end = lines.findIndex((l, i) => i > start && /^##?\s/.test(l)); if (end < 0) end = lines.length;
  const known = new Set(tools.map(t => flat(toolKey(t))).filter(Boolean));
  const head = lines.findIndex((l, i) => i > start && i < end && l.trim().startsWith("|"));
  if (head < 0) { add(start + 1, "the Ask the source section has no table", "add the table: | Question about | Ask | Brain answer is good for |"); return { found: true, rows, problems }; }
  const header = cells(lines[head]).map(c => c.toLowerCase());
  const col = re => header.findIndex(h => re.test(h));
  const cTopic = col(/question|about|topic|what/), cAsk = col(/^ask|source|tool|who knows/), cGood = col(/good|fresh|valid|old|limit/);
  const missing = [cTopic < 0 && "Question about", cAsk < 0 && "Ask", cGood < 0 && "Brain answer is good for"].filter(Boolean);
  if (missing.length) { add(head + 1, `the table has no ${missing.join(", ")} column`, "use the header | Question about | Ask | Brain answer is good for |"); return { found: true, rows, problems }; }
  let i = head + 1;
  if (/^\|?\s*:?-{3,}/.test((lines[i] || "").trim())) i++;
  else add(head + 2, "the table needs a separator line under its header", "add | --- | --- | --- | under the header");
  for (; i < end && lines[i].trim().startsWith("|"); i++) {
    const c = cells(lines[i]), n = i + 1, topic = c[cTopic] || "", source = c[cAsk] || "", good = c[cGood] || "";
    if (!topic && !source && !good) continue;
    if (!topic) { add(n, "this row says no question", "write what the question is about in the first column, or remove the row"); continue; }
    const ask = resolveAsk(source, known);
    if (!ask) { add(n, `"${topic}": Ask "${source}" is not the brain, a kind of tool (CRM, billing, events, calendar, email, meeting notes) or a tool this brain names`, "write the kind of tool or the tool's name, e.g. CRM or HubSpot"); continue; }
    const good_for = parseGoodFor(good);
    if (good_for === null) { add(n, `"${topic}": "${good}" is not a time`, `write "1 day", "3 days", "2 weeks", "always ask" or "no limit"`); continue; }
    rows.push({ line: n, topic, source, ask, good_for });
  }
  if (!rows.length && !problems.length) add(head + 1, "the Ask the source table has no rows", "add a row, or remove the section to use the defaults");
  return { found: true, rows, problems };
}

let defaultsCache = null;
/* The shipped rows: the table in templates/RULES.md, so the defaults and the template never disagree. */
export function defaultRows() {
  if (!defaultsCache) defaultsCache = parseAskSource(read(TEMPLATE) || "").rows;
  return defaultsCache;
}

/* The brain's table: {rows, problems, defaults}. defaults is true when RULES.md has no such section, or when
   none of its rows can be read (then the problems say why). Never throws. */
export function readAskSource(root) {
  let tools = []; try { tools = (readAdmin(root) || {}).tools || []; } catch {}
  const text = read(join(root, "RULES.md"));
  const parsed = parseAskSource(text || "", { tools });
  if (!parsed.found) return { rows: defaultRows(), problems: [], defaults: true };
  if (!parsed.rows.length) return { rows: defaultRows(), problems: parsed.problems, defaults: true };
  return { rows: parsed.rows, problems: parsed.problems, defaults: false };
}

/* The connected tools, from work/tools.json: [{key, tool}]. */
export function connectedTools(root) {
  let t = {}; try { t = JSON.parse(readFileSync(join(root, "work", "tools.json"), "utf8")); } catch { return []; }
  return Object.entries(t || {}).filter(([, s]) => s && s.status === "installed" && !s.declined && s.test !== "fail")
    .map(([k, s]) => ({ key: k, tool: s.tool || k, ids: [k, s.tool, s.plugin].map(flat).filter(x => x.length >= 3) }));
}

const inKind = (kind, id) => !!kind && KINDS.find(k => k.kind === kind).tools.test(id);
/* The connected tool a row sends Codex to, or null: one the cell names first, else one of the row's kind. */
export function rowTool(row, connected) {
  if (row.ask.brain) return null;
  const named = connected.find(t => t.ids.some(id => row.ask.names.some(n => id.includes(n) || n.includes(id))));
  if (row.ask.names.length) return named || null;
  return connected.find(t => t.ids.some(id => inKind(row.ask.kind, id))) || null;
}
/* Does a note come from the row's tool? One of its sources is that kind of tool or the named tool. */
export function noteMatches(row, memory) {
  return (memory.source || []).some(s => {
    const id = flat(s.kind); if (!id || id === "codex" || id === "memory" || id === "url") return false;
    return row.ask.names.length ? row.ask.names.some(n => id.includes(n) || n.includes(id)) : inKind(row.ask.kind, id);
  });
}

const goodText = g => g === "live" ? "always ask" : g === "always" ? "no limit" : g < 1 ? `${Math.round(g * 24)} hours` : g === 1 ? "1 day" : `${+g.toFixed(1)} days`;
const fromText = row => row.ask.names.length ? row.source : KINDS.find(k => k.kind === row.ask.kind).label;

/* The lines a read adds for the notes it shows: one per row whose tool is connected and whose newest matching
   note is older than the row allows ("live" rows: any matching note). [] when nothing applies. */
export function askSourceLines(root, memories, { now = nowMs(), day = at => String(at).slice(0, 10), table = null } = {}) {
  const { rows } = table || readAskSource(root), connected = connectedTools(root), out = [];
  if (!connected.length || !memories || !memories.length) return out;
  for (const row of rows) {
    if (row.good_for === "always") continue;
    const tool = rowTool(row, connected); if (!tool) continue;
    const newest = memories.filter(m => noteMatches(row, m)).map(m => m.at).filter(a => Number.isFinite(Date.parse(a))).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
    if (!newest) continue;
    const age = daysSince(newest, now);
    if (row.good_for === "live") out.push(`${row.topic}: notes here from ${fromText(row)} are a record of ${day(newest)}, not the live answer; RULES.md says always ask ${tool.tool}. Read it there before answering.`);
    else if (age > row.good_for) out.push(`${row.topic}: the newest note here from ${fromText(row)} is ${age} days old (${day(newest)}); RULES.md says ask ${tool.tool} (good for ${goodText(row.good_for)}). Read it there before answering.`);
  }
  return out;
}

/* The chat start's one line: the rows whose tool is connected, so a question with no note yet ("when is the next
   meeting?") still goes to the tool. "" when no row's tool is connected. */
export function askSourceLine(root) {
  const { rows, problems, defaults } = readAskSource(root), connected = connectedTools(root);
  const live = rows.filter(r => r.good_for !== "always").map(r => ({ r, tool: rowTool(r, connected) })).filter(x => x.tool);
  const broken = problems.length ? ` ${problems.length} row${problems.length === 1 ? "" : "s"} of it cannot be read; query rules says which.` : "";
  if (!live.length) return broken ? `Ask the source (RULES.md):${broken}` : "";
  const list = live.map(({ r, tool }) => `${r.topic.toLowerCase()}: ${tool.tool}, ${r.good_for === "live" ? "always" : `when the note is over ${goodText(r.good_for)} old`}`).join("; ");
  return `Ask the source (RULES.md${defaults ? ", the defaults" : ""}): read the tool instead of answering from saved notes for ${list}. A changed value is a new note. Anything else, or a tool not connected: answer from the brain and say how old the note is.${broken}`;
}

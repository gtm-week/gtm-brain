#!/usr/bin/env node
// Test doubles of the outside tools the workshop loops use (ALL-717): a company search and enrichment tool
// (what Clay does), buying signals for a list of companies (what Zynt does), keyword research and a content
// score for a draft (what Surfer does). A stdio MCP server, Node built-ins only, modelled on
// flowpilot-mcp.mjs. Fixed synthetic data that fits the demo brain (demo-loops.mjs): no network, no key,
// no account, nothing is ever sent. The tools carry neutral names and say they are test doubles.
//   node stub-gtm-tools.mjs [--log <file.jsonl>] [--fail expired_key|empty|rate_limit] [--fail-tool <tool>]
// --log appends one line per call: the tool, its arguments, what came back and the failure it played.
// --fail plays a failure on every call, or only on --fail-tool's calls.
// What this does not prove: real sign-in, real rate limits, cost per call, and the real tools' data shapes.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";

const argv = process.argv.slice(2), opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const LOG = opt("--log") || process.env.GTM_STUB_TOOLS_LOG || "", FAIL = opt("--fail") || "", FAIL_TOOL = opt("--fail-tool") || "";
const MODES = ["expired_key", "empty", "rate_limit"];
if (FAIL && !MODES.includes(FAIL)) { console.error(`--fail must be one of ${MODES.join(", ")}`); process.exit(2); }
if (LOG) mkdirSync(dirname(resolve(LOG)), { recursive: true });

const SOURCE_KIND = "gtm-test-tools";
const HOST = "https://test-tools.fixture.test";
const notice = "Test double: synthetic data for the GTM Brain demo. No network, no account; nothing was sent.";
const slug = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const source = ref => ({ kind: SOURCE_KIND, ref, url: `${HOST}/${ref}` });

/* ---------- the fixture: companies that fit the demo brain's ICP, and some that do not ---------- */
const COMPANIES = [
  { name: "Fernbrook Outdoor", domain: "fernbrook-outdoor.example", industry: "outdoor equipment retail", countries: ["DE", "AT"], stores: 85, employees: 1400, hq: "Munich",
    returns: "Returns handled by hand in each store; online orders can be returned in any store.", systems: "Shopify Plus online, an in-house store system",
    contacts: [{ name: "Lea Hoffmann", title: "Head of Operations", email: "lea.hoffmann@fernbrook-outdoor.example", location: "Munich" }] },
  { name: "Heron Home", domain: "heron-home.example", industry: "home goods retail", countries: ["PL"], stores: 46, employees: 2100, hq: "Warsaw",
    returns: "Returns go to a central warehouse; stores send them on weekly.", systems: "Magento online",
    contacts: [{ name: "Piotr Zielinski", title: "Head of Store Operations", email: "piotr.zielinski@heron-home.example", location: "Warsaw" }] },
  { name: "Juniper Haus", domain: "juniper-haus.example", industry: "home goods retail", countries: ["AT", "DE"], stores: 140, employees: 3200, hq: "Vienna",
    returns: "Store returns are keyed into the ERP by hand.", systems: "SAP retail",
    contacts: [{ name: "Anna Gruber", title: "COO", email: "anna.gruber@juniper-haus.example", location: "Vienna" }] },
  { name: "Pinewood Living", domain: "pinewood-living.example", industry: "home goods retail", countries: ["PL"], stores: 22, employees: 310, hq: "Krakow",
    returns: "Few returns; no online shop yet.", systems: "none online", contacts: [] },
  { name: "Kestrel Sports", domain: "kestrel-sports.example", industry: "outdoor equipment retail", countries: ["DE"], stores: 9, employees: 180, hq: "Freiburg",
    returns: "Returns by post only.", systems: "WooCommerce", contacts: [] },
  { name: "Umber Pharma", domain: "umber-pharma.example", industry: "pharmacy retail", countries: ["PL"], stores: 900, employees: 6000, hq: "Poznan",
    returns: "Regulated returns.", systems: "custom", contacts: [] },
  { name: "Larkspur Garden", domain: "larkspur-garden.example", industry: "garden and home goods retail", countries: ["NL"], stores: 60, employees: 900, hq: "Utrecht",
    returns: "Returns handled in store.", systems: "Shopware", contacts: [] },
  { name: "Glade Market", domain: "glade-market.example", industry: "home goods marketplace", countries: ["DE"], stores: 0, employees: 400, hq: "Berlin",
    returns: "Sellers handle their own returns.", systems: "own platform", contacts: [] },
];
const SIGNALS = {
  "Fernbrook Outdoor": { ready: "now", score: 92, why_now: "A new Head of Returns role and in-store returns for online orders from 1 December: returns are on the agenda this quarter.",
    signals: [{ date: "2026-11-10", type: "job post", text: "Posted a Head of Returns job; the post says returns are handled by hand in each store.", ref: "signals/fernbrook-outdoor/head-of-returns-job" },
      { date: "2026-11-12", type: "announcement", text: "Announced that online orders can be returned in all 85 stores from 1 December.", ref: "signals/fernbrook-outdoor/in-store-returns" }] },
  "Juniper Haus": { ready: "now", score: 78, why_now: "Hiring for reverse logistics while opening stores: the returns load grows before peak season.",
    signals: [{ date: "2026-11-08", type: "job post", text: "Hiring a Reverse Logistics Lead in Vienna.", ref: "signals/juniper-haus/reverse-logistics-lead" }] },
  "Heron Home": { ready: "later", score: 55, why_now: "Store growth, but nothing about returns yet.",
    signals: [{ date: "2026-10-30", type: "expansion", text: "Opened 12 new stores in Poland in October.", ref: "signals/heron-home/new-stores" }] },
  "Umber Pharma": { ready: "no", score: 20, why_now: "A returns hire, in a regulated pharmacy chain.",
    signals: [{ date: "2026-11-04", type: "job post", text: "Hiring a returns analyst.", ref: "signals/umber-pharma/returns-analyst" }] },
};
const KEYWORDS = [
  { keyword: "returns automation for retailers", volume: 1900, difficulty: 34 },
  { keyword: "reduce return rate retail", volume: 880, difficulty: 22 },
  { keyword: "store pickup returns", volume: 320, difficulty: 12 },
  { keyword: "buy online return in store", volume: 1300, difficulty: 41 },
  { keyword: "retail returns process", volume: 720, difficulty: 28 },
  { keyword: "black friday returns", volume: 2400, difficulty: 47 },
  { keyword: "cost of processing returns", volume: 390, difficulty: 19 },
];
const TERMS = ["online orders", "in-store", "return rate", "staff", "black friday"];

/* ---------- matching ---------- */
const COUNTRY = { germany: "DE", deutschland: "DE", de: "DE", austria: "AT", osterreich: "AT", at: "AT", poland: "PL", polska: "PL", pl: "PL", netherlands: "NL", nl: "NL", dach: ["DE", "AT"] };
const countryCodes = list => (list || []).flatMap(c => { const v = COUNTRY[slug(c).replace(/-/g, "")]; return v ? [].concat(v) : [String(c).toUpperCase()]; });
const stem = w => w.replace(/ies$/, "y").replace(/s$/, "");
const wordsOf = s => slug(s).split("-").filter(w => w.length >= 4).map(stem);
const GENERIC = new Set(["retail", "retailer", "store", "chain", "equipment", "good", "company", "compan"]);
const industryHit = (company, terms) => (terms || []).some(t => wordsOf(t).filter(w => !GENERIC.has(w)).some(w => wordsOf(company.industry).includes(w)));
const findCompany = q => { const s = slug(q); return COMPANIES.find(c => slug(c.name) === s || slug(c.domain) === s || slug(c.domain).startsWith(s) || s.includes(slug(c.domain))); };
const num = v => v === undefined || v === null || v === "" ? null : Number(v);

const strs = description => ({ type: "array", items: { type: "string" }, description });
const int = description => ({ type: "integer", minimum: 0, description });
const schema = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const TOOLS = [
  { name: "company_search", description: "Test double of a company search tool: finds companies in a fixed synthetic list by ICP criteria (industry, country, store count, employees). No network. Pass the criteria from the brain's ICP; each company comes with a source pointer to cite when you save it.",
    inputSchema: schema({ industries: strs("Industries to include, e.g. outdoor equipment"), countries: strs("Countries, names or ISO codes"), stores_min: int("Fewest stores"), stores_max: int("Most stores"), employees_min: int("Fewest employees"), employees_max: int("Most employees"), exclude_industries: strs("Industries to leave out"), limit: int("Most companies to return, default 10") }),
    call(a) {
      const codes = countryCodes(a.countries), [smin, smax, emin, emax] = [a.stores_min, a.stores_max, a.employees_min, a.employees_max].map(num);
      const hits = COMPANIES.filter(c => (!a.industries?.length || industryHit(c, a.industries)) && !industryHit(c, a.exclude_industries) && (!codes.length || c.countries.some(x => codes.includes(x)))
        && (smin === null || c.stores >= smin) && (smax === null || c.stores <= smax) && (emin === null || c.employees >= emin) && (emax === null || c.employees <= emax));
      return { companies: hits.slice(0, num(a.limit) || 10).map(({ contacts, returns, systems, ...c }) => ({ ...c, source: source(`companies/${slug(c.name)}`) })), total: hits.length };
    }, empty: () => ({ companies: [], total: 0 }) },
  { name: "company_enrich", description: "Test double of a company enrichment tool: returns stores, employees, how returns are handled and the operations contact for one company from a fixed synthetic list. No network. Cite the returned source when you save it.",
    inputSchema: schema({ company: { type: "string", description: "Company name or domain" } }, ["company"]),
    call(a) { const c = findCompany(a.company); return c ? { found: true, company: { ...c, source: source(`companies/${slug(c.name)}/enrichment`) } } : { found: false, company: null, query: a.company }; },
    empty: a => ({ found: false, company: null, query: a.company }) },
  { name: "buying_signals", description: "Test double of a buying signals tool: for each company named, whether it is ready to buy now, later or not, why now, and the dated signals behind it, from a fixed synthetic list. No network. Each signal has a source pointer to cite.",
    inputSchema: schema({ companies: strs("Company names or domains") }, ["companies"]),
    call(a) {
      return { companies: (a.companies || []).map(q => { const c = findCompany(q), s = c && SIGNALS[c.name];
        return s ? { company: c.name, found: true, ready: s.ready, score: s.score, why_now: s.why_now, signals: s.signals.map(({ ref, ...x }) => ({ ...x, source: source(ref) })) } : { company: c ? c.name : q, found: !!c, ready: c ? "no" : null, signals: [] }; }) };
    }, empty: () => ({ companies: [] }) },
  { name: "keyword_research", description: "Test double of an SEO keyword tool: monthly searches and difficulty (0 to 100) for keywords related to the seed topics, from a fixed synthetic table. No network. Cite the returned source when you save the numbers.",
    inputSchema: schema({ seeds: strs("Seed topics or keywords, e.g. the content pillars"), country: { type: "string", description: "Market, default Germany" } }, ["seeds"]),
    call(a) {
      const seeds = (a.seeds || []).flatMap(wordsOf).filter(w => !["retail", "retailer", "blog", "post"].includes(w));
      const hits = KEYWORDS.filter(k => wordsOf(k.keyword).some(w => seeds.includes(w))).sort((x, y) => y.volume - x.volume);
      return { keywords: hits, country: a.country || "Germany", source: source(`keywords/${slug((a.seeds || []).join(" ")).slice(0, 80)}`) };
    }, empty: a => ({ keywords: [], country: a.country || "Germany" }) },
  { name: "content_score", description: "Test double of an SEO content checker: scores a draft for one keyword (0 to 100) on title, meta description, headings, keyword placement, length and terms. Computed from the text you pass; no network. Cite the returned source when you save the score.",
    inputSchema: schema({ keyword: { type: "string" }, title: { type: "string", description: "SEO title" }, description: { type: "string", description: "Meta description" }, content: { type: "string", description: "The draft in Markdown, without front matter" } }, ["keyword", "content"]),
    call(a) {
      const kw = String(a.keyword || "").toLowerCase(), kwStem = kw.replace(/s$/, ""), body = String(a.content || "").replace(/^---\n[\s\S]*?\n---\n/, ""), title = String(a.title || ""), desc = String(a.description || "");
      const first = body.split(/\n\s*\n/).map(p => p.trim()).find(p => p && !p.startsWith("#")) || "", words = (body.match(/[A-Za-z0-9][\w'-]*/g) || []).length;
      const h1 = (body.match(/^# .+$/gm) || []).length, bang = body.replace(/<!--[\s\S]*?-->/g, "").replace(/!\[/g, "[").includes("!");
      const checks = [
        { check: "keyword in title", pass: title.toLowerCase().includes(kwStem), detail: title ? `"${title}"` : "no title given" },
        { check: "title length", pass: !!title && title.length <= 60, detail: `${title.length} characters, at most 60` },
        { check: "meta description", pass: !!desc && desc.length <= 155, detail: `${desc.length} characters, at most 155` },
        { check: "one H1", pass: h1 === 1, detail: `${h1} H1 headings` },
        { check: "keyword in first paragraph", pass: first.toLowerCase().includes(kwStem), detail: first.slice(0, 80) },
        { check: "length", pass: words >= 400 && words <= 900, detail: `${words} words, 400 to 900` },
        { check: "no exclamation marks", pass: !bang, detail: bang ? "found one" : "none" },
      ];
      const missing = TERMS.filter(t => !body.toLowerCase().includes(t));
      const score = Math.max(0, 100 - 12 * checks.filter(c => !c.pass).length - 2 * missing.length);
      return { keyword: a.keyword, score, checks, missing_terms: missing, source: source(`content-score/${slug(a.keyword)}`) };
    }, empty: a => ({ keyword: a.keyword, score: null, checks: [], missing_terms: [] }) },
];
const FAILURES = {
  expired_key: () => ({ error: "401 Unauthorized: the API key for this tool expired on 2026-11-01. A new key is needed in the tool's settings." }),
  rate_limit: () => ({ error: "429 Too Many Requests: rate limit reached for this key. Try again in 60 seconds." }),
};

function validate(args, spec) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "arguments must be an object";
  for (const k of Object.keys(args)) if (!(k in spec.properties)) return `unknown argument: ${k}`;
  for (const k of spec.required) if (args[k] === undefined) return `missing argument: ${k}`;
  for (const [k, v] of Object.entries(args)) {
    const t = spec.properties[k].type;
    if (t === "array" && !(Array.isArray(v) && v.every(x => typeof x === "string"))) return `${k} must be a list of strings`;
    if (t === "string" && typeof v !== "string") return `${k} must be a string`;
    if (t === "integer" && !(Number.isInteger(v) && v >= 0)) return `${k} must be a whole number`;
  }
  return null;
}
const log = record => { if (LOG) appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n"); };
const send = (id, payload) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, ...payload }) + "\n");
const reply = (value, isError) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 1) }], ...(isError ? { isError: true } : {}) });

for await (const line of createInterface({ input: process.stdin })) {
  let m; try { m = JSON.parse(line); } catch { send(null, { error: { code: -32700, message: "Parse error" } }); continue; }
  if (m.id === undefined) continue;
  const { id, method, params = {} } = m;
  if (method === "initialize") send(id, { result: { protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "gtm-test-tools", version: "1.0.0" }, instructions: `${notice} These tools are test doubles of a company data tool, a buying signals tool and an SEO tool. Their results are fixed fixture data; cite the source each result carries.` } });
  else if (method === "ping") send(id, { result: {} });
  else if (method === "tools/list") send(id, { result: { tools: TOOLS.map(({ call, empty, ...t }) => ({ ...t, annotations: { title: t.name.replace(/_/g, " "), readOnlyHint: true, openWorldHint: false } })) } });
  else if (method === "tools/call") {
    const tool = TOOLS.find(t => t.name === params.name), args = params.arguments ?? {};
    const fail = FAIL && (!FAIL_TOOL || FAIL_TOOL === params.name) && tool ? FAIL : null;
    let value, isError = false;
    if (!tool) { value = { error: `unknown tool: ${params.name}` }; isError = true; }
    else { const bad = validate(args, tool.inputSchema); if (bad) { value = { error: bad }; isError = true; } }
    if (!isError && fail) { if (fail === "empty") value = tool.empty(args); else { value = FAILURES[fail](); isError = true; } }
    if (!isError && !value) value = tool.call(args);
    value = { notice, ...value };
    log({ tool: params.name, arguments: args, result: value, ...(isError ? { isError: true } : {}), ...(fail ? { fail } : {}) });
    send(id, { result: reply(value, isError) });
  } else send(id, { error: { code: -32601, message: "Method not found" } });
}

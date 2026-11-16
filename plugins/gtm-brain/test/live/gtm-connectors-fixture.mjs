#!/usr/bin/env node
// Stand-in Clay, Zynt and Surfer for the two-loop live check (demo-loops.mjs, ALL-717): canned
// answers over stdio MCP, so the agent reaches the connectors through their tools the way a real
// brain does, and nothing real is searched, enriched, charged or published.
//   node gtm-connectors-fixture.mjs <clay|zynt|surfer> <trace.jsonl>
// Every call and its result go to the trace, so a check can tell what was called, with what, and
// what text reached the model. A tool that would spend credits says so in its description, the way
// the setup skills expect, and the check fails a turn that calls it without the person's yes.
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";

const [which, trace] = process.argv.slice(2);
const log = record => trace && appendFileSync(trace, JSON.stringify({ at: new Date().toISOString(), server: which, ...record }) + "\n");
const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };   // closed-world: codex exec needs no approval
const obj = (properties = {}, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const str = description => ({ type: "string", description });

const FERNBROOK = { name: "Fernbrook Outdoor", domain: "fernbrook-outdoor.example", industry: "Outdoor equipment retail", stores: 85, employees: 1400, countries: ["Germany", "Austria"], returns: "returns handled by hand in each store" };
const LEA = { name: "Lea Hoffmann", title: "Head of Operations", company: "Fernbrook Outdoor", location: "Munich", linkedin: "https://linkedin.fixture.test/in/lea-hoffmann" };

const SERVERS = {
  clay: [
    { name: "clay_workspace", description: "Clay (fixture): the signed-in workspace and its credit balance.", inputSchema: obj(), annotations: read,
      call: () => ({ workspace: "Reflow GTM (fixture)", role: "Editor", credits: 500 }) },
    { name: "clay_find_companies", description: "Clay (fixture): find companies by name, domain or criteria. Free, spends no credits.", inputSchema: obj({ query: str("Company names, domains or criteria") }, ["query"]), annotations: read,
      call: () => ({ companies: [FERNBROOK], note: "Search is free." }) },
    { name: "clay_find_people", description: "Clay (fixture): find people at a company by title or seniority. Free, spends no credits. Returns names and titles, no emails.", inputSchema: obj({ company: str("Company name or domain"), titles: str("Titles or seniority to look for") }, ["company"]), annotations: read,
      call: () => ({ people: [LEA], note: "Search is free. Emails need enrichment (1 credit per person)." }) },
    { name: "clay_enrich_person", description: "Clay (fixture): enrich one person with work email and phone. Spends 1 credit per person: ask the person before calling it.", inputSchema: obj({ name: str("Full name"), company: str("Company name or domain") }, ["name"]), annotations: write,
      call: a => /lea/i.test(a.name || "") ? { ...LEA, email: "lea.hoffmann@fernbrook-outdoor.example", credits_spent: 1, credits_left: 499 } : { error: "no match", credits_spent: 0 } },
  ],
  zynt: [
    { name: "zynt_workspace", description: "Zynt (fixture): the signed-in workspace and its target lists.", inputSchema: obj(), annotations: read,
      call: () => ({ workspace: "Reflow (fixture)", lists: [{ id: "list-1", name: "DACH and Poland retail", companies: 3 }] }) },
    { name: "zynt_list_signals", description: "Zynt (fixture): buying signals for the companies on a list, newest first: news, posts and job ads, each with why it may mean buying now.", inputSchema: obj({ list: str("List id or name; the first list when omitted"), days: { type: "number", description: "How many days back, 7 by default" } }), annotations: read,
      call: () => ({ signals: [
        { company: "Fernbrook Outdoor", date: "2026-11-10", type: "hiring", text: "Fernbrook Outdoor posted a Head of Returns job; the post says returns are handled by hand in each store.", url: "https://app.zynt.fixture.test/signals/fernbrook-1" },
        { company: "Heron Home", date: "2026-11-06", type: "expansion", text: "Heron Home opened 12 new stores in Poland in October.", url: "https://app.zynt.fixture.test/signals/heron-1" },
        { company: "Umber Pharma", date: "2026-11-04", type: "hiring", text: "Umber Pharma, a pharmacy chain with 900 stores, is hiring a returns analyst.", url: "https://app.zynt.fixture.test/signals/umber-1" }] }) },
  ],
  surfer: [
    { name: "surfer_keyword_research", description: "Surfer (fixture): monthly searches and difficulty for a phrase and its related keywords.", inputSchema: obj({ phrase: str("Seed phrase") }, ["phrase"]), annotations: read,
      call: a => ({ seed: a.phrase, keywords: [
        { keyword: "returns automation for retailers", monthly_searches: 1900, difficulty: 34 },
        { keyword: "reduce return rate retail", monthly_searches: 880, difficulty: 22 },
        { keyword: "store pickup returns", monthly_searches: 320, difficulty: 12 }] }) },
    { name: "surfer_create_content_editor", description: "Surfer (fixture): create a content brief (Content Editor) for a keyword: outline, terms to use and a target length. Counts toward the plan's documents, spends no AI credits.", inputSchema: obj({ keyword: str("Main keyword"), title: str("Working title") }, ["keyword"]), annotations: write,
      call: a => ({ id: "ce-4711", url: "https://app.surfer.fixture.test/drafts/ce-4711", keyword: a.keyword, target_words: "550-750", terms: ["return in store", "online orders", "store staff", "return label", "refund"], outline: ["Why customers return online orders in the store", "What it costs a store today", "How to process them in two minutes"] }) },
    { name: "surfer_generate_article", description: "Surfer (fixture): write a full AI article from a content brief. Spends 1 AI credit: ask the person before calling it.", inputSchema: obj({ content_editor_id: str("The brief id") }, ["content_editor_id"]), annotations: write,
      call: () => ({ status: "generated", credits_spent: 1 }) },
  ],
};

const tools = SERVERS[which];
if (!tools) { console.error(`usage: gtm-connectors-fixture.mjs <${Object.keys(SERVERS).join("|")}> <trace.jsonl>`); process.exit(2); }
const send = m => process.stdout.write(JSON.stringify(m) + "\n");
createInterface({ input: process.stdin }).on("line", line => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.method === "initialize") return send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: `${which}-fixture`, version: "1.0.0" } } });
  if (m.method === "tools/list") return send({ jsonrpc: "2.0", id: m.id, result: { tools: tools.map(({ call, ...t }) => t) } });
  if (m.method === "tools/call") {
    const t = tools.find(x => x.name === m.params?.name), args = m.params?.arguments || {};
    if (!t) return send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: `unknown tool ${m.params?.name}` }], isError: true } });
    const text = JSON.stringify(t.call(args), null, 1);
    log({ kind: "call", tool: t.name, args }); log({ kind: "result", tool: t.name, text });
    return send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text }] } });
  }
  if (m.id !== undefined) send({ jsonrpc: "2.0", id: m.id, result: {} });
});

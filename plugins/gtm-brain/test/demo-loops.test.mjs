process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
// The workshop demo harness (test/live/demo-loops.mjs) without Codex: the seeded story is in the brain,
// the steps are well formed, and the per-turn checks pass a right outcome and fail a wrong one.
// Run: node --test plugins/gtm-brain/test/demo-loops.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
const { buildBrain, STEPS, STUB_STEPS, STUB_SERVER, CONNECTOR_STEPS, CONNECTOR_SERVERS, parseArgs, stepsFor } = await import("./live/demo-loops.mjs");
const lib = await import("../lib/brain.mjs");
const { readDocument } = await import("../lib/documents.mjs");
const { customerOverview } = await import("../lib/customers.mjs");

test("demo brain: the story the two loops need is seeded through lib", { timeout: 120000 }, async () => {
  const { root } = await buildBrain(join(mkdtempSync(join(tmpdir(), "gtm-demo-test-")), "brain"));
  for (const slug of ["icp", "strategy", "voice"]) { const d = readDocument(root, slug); assert.ok(d.filled, `${slug} filled`); assert.equal(d.status, "approved"); }
  assert.match(readDocument(root, "voice").body, /No exclamation marks/);
  const names = lib.readNames(root);
  for (const n of ["Fernbrook Outdoor", "Heron Home", "Umber Pharma"]) assert.equal(names.find(e => e.name === n)?.kind, "organization", n);
  assert.ok(!names.some(e => e.name === "Lea Hoffmann"), "the contact is learned in the demo, not seeded");
  assert.ok(!customerOverview(root).customers.some(c => c.name === "Fernbrook Outdoor"), "Fernbrook has no status before the demo");
  const market = lib.effectiveMemories(lib.readMemories(root, "market"));
  assert.ok(market.some(m => /Zynt signal: Fernbrook Outdoor/.test(m.content) && m.source.some(s => s.kind === "zynt")));
  assert.ok(lib.listContexts(root).flatMap(c => c.memories).some(m => /drown in return tickets/.test(m.content) && m.source.some(s => s.kind === "granola")));
  assert.deepEqual(lib.readProjects(root).map(p => p.slug).filter(s => ["outbound", "website"].includes(s)).sort(), ["outbound", "website"]);
});

test("demo steps: unique ids, both loops end on a fresh chat, plain text", () => {
  assert.equal(new Set(STEPS.map(s => s.id)).size, STEPS.length);
  for (const loop of ["outreach", "content"]) {
    const steps = STEPS.filter(s => s.loop === loop);
    assert.ok(steps.length >= 4, loop);
    assert.ok(steps.at(-1).fresh && !steps.slice(0, -1).some(s => s.fresh), `${loop}: only the last turn is a new chat`);
  }
  for (const s of STEPS) { assert.ok(s.say && s.shows && typeof s.check === "function", s.id); assert.doesNotMatch(s.say + s.shows, /[\u2013\u2014]/, `${s.id}: no em or en dashes`); }
});

const evidence = (over = {}) => ({ reply: "", calls: [], commands: [], added: [], files: [], names: [], customers: [], idOf: () => "\u0000", saw: () => false, sawBrain: () => false, ...over });
const step = id => STEPS.find(s => s.id === id);

test("demo checks: the outreach draft must follow the voice and stay unsent", () => {
  const draft = text => ({ path: "projects/outbound/lea-hoffmann-first-email.md", text });
  const voice = re => re.test("## Do not\n\n- No exclamation marks.");
  const good = evidence({ saw: voice, files: [draft("Subject: Head of Returns\n\nLea, your Head of Returns post says returns are handled by hand.\n\nMarta")] });
  assert.equal(step("o3-draft").check(good), true);
  assert.match(step("o3-draft").check({ ...good, files: [draft("Hi Lea! Head of Returns. Marta")] }), /exclamation/);
  assert.equal(step("o3-draft").check({ ...good, files: [draft("Lea, your Head of Returns post says returns are handled by hand.\n\nMarta\n\n<!-- Source: Zynt signal -->")] }), true, "a source comment is not an exclamation");
  assert.match(step("o3-draft").check({ ...good, added: [{ content: "Sent to Lea.", actions: [{ tool: "gmail", action: "send" }] }] }), /send/);
  assert.match(step("o3-draft").check({ ...good, files: [] }), /no draft/);
  // naming the document is not reading it: a failed lookup of voice.md leaves no voice text in the chat
  assert.match(step("o3-draft").check({ ...good, saw: () => false, calls: [{ tool: "query", arguments: { object: "reference", search: "voice.md" } }], commands: ["cat voice.md"] }), /did not read the tone of voice/);
});

test("demo checks: the blog draft is SEO-checked from the file", () => {
  const para = "Store pickup returns are where online orders come back to a shop that cannot process them. ";
  const body = `# Store pickup returns without the backlog\n\n${para.repeat(3)}\n\n## Why it piles up\n\n${"Each store handles the return by hand, and the ticket waits. ".repeat(50)}`;
  const file = (title, description, text = body) => ({ path: "projects/website/store-pickup-returns.md", text: `---\ntitle: ${title}\ndescription: ${description}\n---\n${text}` });
  const good = evidence({ saw: re => re.test("- No exclamation marks."), added: [{ kind: "decision", content: "We decided: the first post targets store pickup returns." }], files: [file("Store pickup returns: a guide for retailers", "How retailers handle store pickup returns without a backlog.")] });
  assert.equal(step("c2-draft").check(good), true);
  assert.match(step("c2-draft").check({ ...good, files: [file("Store pickup returns: the complete and definitive guide for every retailer", "x")] }), /SEO title/);
  assert.match(step("c2-draft").check({ ...good, files: [file("Store pickup returns", "x", `${body}\n\n# A second H1\n`)] }), /2 H1/);
  assert.match(step("c2-draft").check({ ...good, added: [{ kind: "note", content: "First post: store pickup returns." }] }), /decision/);
});

test("demo checks: status and recall steps read the brain, not the reply alone", () => {
  const prospect = [{ name: "Fernbrook Outdoor", status: "prospect" }];
  const call = { added: [{ content: "Lea Hoffmann booked a pilot scoping call for 14 January 2027." }] };
  assert.equal(step("o6-status").check(evidence({ ...call, customers: prospect })), true);
  assert.match(step("o6-status").check(evidence({ ...call, customers: [] })), /absent, not prospect/);
  const reply = "Contact: Lea Hoffmann. She is mid ERP migration; pilot scoping call on 14 January. Status: prospect.";
  const thread = re => re.test("She replied: We are in the middle of an ERP migration until January.");
  assert.equal(step("o7-recall").check(evidence({ reply, sawBrain: thread })), true);
  assert.match(step("o7-recall").check(evidence({ reply, sawBrain: thread, added: [{ content: "x" }] })), /saves nothing/);
  assert.match(step("o7-recall").check(evidence({ reply, saw: thread })), /from the brain/, "the drafts in the folder are not the brain");
});

test("demo checks: reading means the seeded text arrived, a link means that person, next means a pillar still open", () => {
  // o1: the ICP context and a failed lookup of icp.md are not the ICP document
  const picked = "1. Fernbrook Outdoor: ICP fit with a Head of Returns post. 2. Heron Home. Umber Pharma is out.";
  const signals = "Zynt signal: Fernbrook Outdoor posted a Head of Returns job";
  assert.match(step("o1-pick").check(evidence({ reply: picked, saw: re => re.test(signals), calls: [{ tool: "load_context", arguments: { contexts: ["icp"] } }, { tool: "query", arguments: { object: "reference", search: "icp.md" } }] })), /did not read the ICP document/);
  assert.equal(step("o1-pick").check(evidence({ reply: picked, saw: re => re.test(`${signals}\n## Not a fit\n\nPharmacy chains (regulated returns)`) })), true);
  // o4: a note linked to the company alone is not linked to Lea
  const note = extra => ({ content: "The first email was sent on 11 November. Reply: ERP migration until January, ping after 10 January.", ...extra });
  const ids = n => ({ "Lea Hoffmann": "e_1111111111111111" })[n] || "\u0000";
  assert.match(step("o4-sent-reply").check(evidence({ idOf: ids, added: [note({ entities: [{ id: "e_2222222222222222" }] })] })), /not linked to Lea/);
  assert.equal(step("o4-sent-reply").check(evidence({ idOf: ids, added: [note({ entities: [{ id: "e_1111111111111111" }] })] })), true);
  // c5: describing the published post again is not the next post
  const results = re => re.test("1,240 visits, position 8, 3 demo requests");
  const produced = "One post so far, store pickup returns: 1,240 visits and 3 demo requests.";
  assert.match(step("c5-recall").check(evidence({ sawBrain: results, reply: `${produced} Next: how to process online returns in physical stores.` })), /two pillars still open/);
  assert.equal(step("c5-recall").check(evidence({ sawBrain: results, reply: `${produced} Next: the peak season post, on the weeks after Black Friday.` })), true);
  assert.match(step("c5-recall").check(evidence({ reply: `${produced} Next: the peak season post.` })), /from the brain/);
});

const stubStep = id => STUB_STEPS.find(s => s.id === id);
const fromTool = (content, extra = {}) => ({ content, kind: "note", tools: ["gtm_test_tools.company_enrich"], source: [{ kind: "gtm-test-tools", ref: "companies/fernbrook-outdoor/enrichment" }], ...extra });
const marked = { "gtm_test_tools": { tool: "gtm_test_tools", status: "not checked", test: "ok", note: "enrichment returned Fernbrook Outdoor" } };

test("demo stub mode: the told results are gone from the prompts, the steps stay in order", () => {
  assert.equal(new Set(STUB_STEPS.map(s => s.id)).size, STUB_STEPS.length);
  assert.deepEqual(STUB_STEPS.filter(s => !s.stub).map(s => s.id), STEPS.filter(s => !stubStep(s.id).stub).map(s => s.id), "a step without a tool is the told step");
  assert.equal(STUB_STEPS[0].id, "o0-search", "the outreach loop starts with the company search");
  for (const s of STUB_STEPS.filter(s => s.stub)) {
    assert.doesNotMatch(s.say, /Clay|Zynt|Surfer|85 stores|1,400|Lea Hoffmann|1,900|880|320/, `${s.id}: nothing the tool returns is told`);
    assert.match(s.say, /tool/, `${s.id}: names the tool to call`);
    assert.doesNotMatch(s.say + s.shows, /[\u2013\u2014]/);
  }
  assert.doesNotMatch(stubStep("o3-draft").say, /Zynt/);
  for (const loop of ["outreach", "content"]) assert.ok(STUB_STEPS.filter(s => s.loop === loop).at(-1).fresh);
  assert.equal(parseArgs(["--fail", "empty"]).error, "--fail needs --stub");
  assert.match(parseArgs(["--stub", "--fail", "teapot"]).error, /unknown failure/);
  assert.match(parseArgs(["--stub", "--step", "o9"]).error, /unknown step/);
  assert.equal(parseArgs([]).effort, process.env.GTM_BRAIN_EVAL_EFFORT || "medium");
});

test("demo stub checks: the tool was called with the brain's criteria, its data saved with its source, listed as used, nothing sent", () => {
  const enrich = { tool: "company_enrich", arguments: { company: "Fernbrook Outdoor" } };
  const lea = [{ name: "Lea Hoffmann", kind: "person", emails: ["lea.hoffmann@fernbrook-outdoor.example"] }];
  const good = evidence({ stub: [enrich], toolsList: marked, names: lea, added: [fromTool("Fernbrook Outdoor: 85 stores in Germany and Austria; Head of Operations Lea Hoffmann.")] });
  assert.equal(stubStep("o2-enrich").check(good), true);
  assert.match(stubStep("o2-enrich").check({ ...good, stub: [] }), /company_enrich was not called/);
  // live run 2026-11-15: the search step had saved the store count, so the enrichment turn did not save it again and
  // failed on "store count not saved". What only the enrichment tells (returns, systems, the contact) is what counts.
  assert.equal(stubStep("o2-enrich").check({ ...good, added: [fromTool("Fernbrook Outdoor enrichment: returns are handled by hand in each store; Shopify Plus online. Contact: Lea Hoffmann, Head of Operations.")] }), true);
  assert.match(stubStep("o2-enrich").check({ ...good, added: [fromTool("Contact at Fernbrook Outdoor: Lea Hoffmann.")] }), /what the enrichment found/);
  assert.match(stubStep("o2-enrich").check({ ...good, toolsList: {} }), /tools list/);
  assert.match(stubStep("o2-enrich").check({ ...good, added: [{ ...good.added[0], source: [{ kind: "user", ref: "marta" }] }] }), /no note from the tool/);
  assert.match(stubStep("o2-enrich").check({ ...good, commands: ["curl https://api.example.test"] }), /network|send/);
  assert.match(stubStep("o2-enrich").check({ ...good, commands: ["/bin/zsh -lc 'cd projects && curl -s https://api.example.test'"] }), /network|send/);
  assert.equal(stubStep("o2-enrich").check({ ...good, commands: ["/bin/zsh -lc 'cat projects/outbound/first-mail.md'", "rg -n curl skills/"] }), true, "a file or a search that names a command is not the command");
  // the list is one row per server: once an earlier step put it there, a later step must add its own evidence
  const untagged = { ...good, added: [{ ...good.added[0], tools: [] }] };
  assert.match(stubStep("o2-enrich").check(untagged), /in this turn/);
  assert.equal(stubStep("o2-enrich").check({ ...untagged, calls: [{ tool: "mark_tool", arguments: { tool: "gtm_test_tools", status: "ok" } }] }), true, "a recorded read test is evidence too");
  const search = icp => evidence({ saw: re => re.test("## Not a fit\n\nPharmacy chains"), toolsList: marked, stub: [{ tool: "company_search", arguments: icp }],
    added: [fromTool("Prospect: Fernbrook Outdoor, 85 stores."), fromTool("Prospect: Heron Home, 46 stores in Poland.")] });
  assert.equal(stubStep("o0-search").check(search({ industries: ["outdoor equipment", "home goods"], countries: ["Germany", "Austria", "Poland"], stores_min: 20, stores_max: 200 })), true);
  assert.match(stubStep("o0-search").check(search({ industries: ["retail"] })), /criteria are not the ICP/);
  const signals = companies => evidence({ reply: "Fernbrook Outdoor first, then Juniper Haus.", toolsList: marked, stub: [{ tool: "buying_signals", arguments: { companies } }], added: [fromTool("Fernbrook Outdoor posted a Head of Returns job on 10 November.")] });
  assert.equal(stubStep("o1-pick").check(signals(["Fernbrook Outdoor", "Heron Home", "Juniper Haus"])), true);
  assert.match(stubStep("o1-pick").check(signals(["Fernbrook Outdoor", "Umber Pharma"])), /prospects saved in the brain/);
});

test("demo stub checks: a played failure is told to the person and nothing invented is saved", () => {
  const expired = evidence({ stub: [{ tool: "company_enrich", arguments: { company: "Fernbrook Outdoor" }, isError: true, fail: "expired_key" }], reply: "The enrichment tool's API key expired on 1 November; nothing was saved." });
  assert.equal(stubStep("o2-enrich").fail("expired_key")(expired), true);
  assert.match(stubStep("o2-enrich").fail("expired_key")({ ...expired, added: [{ content: "Fernbrook Outdoor: Lea Hoffmann, Head of Operations." }] }), /did not return/);
  assert.match(stubStep("o2-enrich").fail("expired_key")({ ...expired, reply: "Saved." }), /does not tell/);
  const empty = evidence({ stub: [{ tool: "keyword_research", arguments: { seeds: ["store pickup returns"] }, fail: "empty" }], reply: "The keyword tool returned no results for our pillars, so I have no search numbers." });
  assert.equal(stubStep("c1-topics").fail("empty")(empty), true);
  assert.match(stubStep("c1-topics").fail("empty")({ ...empty, added: [{ content: "Keywords: store pickup returns, 320 monthly searches." }] }), /did not return/);
  // live run 2026-11-15: an empty result was asked again 41 times in one turn
  const retried = Array.from({ length: 5 }, (_, i) => ({ tool: "keyword_research", arguments: { seeds: [`try ${i}`] }, fail: "empty" }));
  assert.match(stubStep("c1-topics").fail("empty")({ ...empty, stub: retried }), /asked 5 times/);
  assert.equal(stubStep("c1-topics").fail("empty")({ ...empty, stub: retried.slice(0, 3) }), true, "a retry or two with other words is fine");
  // the failure judged is the one played, not one fixed per step
  assert.match(stubStep("o2-enrich").fail("empty")(expired), /does not tell the person the tool failed \(empty\)/);
  assert.equal(stubStep("o2-enrich").fail("empty")({ ...expired, reply: "The enrichment tool found nothing for Fernbrook Outdoor; nothing was saved." }), true);
  assert.match(stubStep("c1-topics").fail("rate_limit")(empty), /rate_limit/);
  // what the brain already held is not invented: the seeded signal may be saved again, the tool's own data may not
  const limited = evidence({ stub: [{ tool: "buying_signals", arguments: { companies: ["Fernbrook Outdoor"] }, isError: true, fail: "rate_limit" }], reply: "The signals tool hit its rate limit; I picked from the signals already in the brain." });
  assert.equal(stubStep("o1-pick").fail("rate_limit")({ ...limited, added: [{ content: "Picked Fernbrook Outdoor: it posted a Head of Returns job on 10 November." }] }), true);
  assert.match(stubStep("o1-pick").fail("rate_limit")({ ...limited, added: [{ content: "Juniper Haus is hiring a Reverse Logistics Lead." }] }), /did not return/);
  // a failure run asks only the steps that have a failure check, and only the failing tool's steps
  assert.deepEqual(stepsFor(true, "empty").map(s => s.id), ["o0-search", "o1-pick", "o2-enrich", "c1-topics"]);
  assert.deepEqual(stepsFor(true, "empty", "keyword_research").map(s => s.id), ["c1-topics"]);
  assert.deepEqual(stepsFor(true).map(s => s.id), STUB_STEPS.map(s => s.id));
});

const connectorStep = id => CONNECTOR_STEPS.find(s => s.id === id);
const via = (...tools) => tools.map(tool => ({ kind: "call", server: tool.split("_")[0], tool, args: {} }));

test("demo connectors mode: the brain has no Fernbrook signal, the steps name the connector, a credit nobody asked for fails", { timeout: 120000 }, async () => {
  const { root } = await buildBrain(join(mkdtempSync(join(tmpdir(), "gtm-demo-test-")), "brain"), { zyntSignal: false });
  const market = lib.effectiveMemories(lib.readMemories(root, "market"));
  assert.ok(!market.some(m => /Fernbrook Outdoor/.test(m.content)), "the Fernbrook signal comes from Zynt, not from the brain");
  assert.ok(market.some(m => /Heron Home/.test(m.content)), "the older signals stay seeded");
  assert.equal(new Set(CONNECTOR_STEPS.map(s => s.id)).size, CONNECTOR_STEPS.length);
  assert.deepEqual(CONNECTOR_STEPS.map(s => s.id), STEPS.flatMap(s => s.id === "o2-enrich" ? ["o2-find", s.id] : [s.id]), "the told steps, with the free lookup before the paid enrichment");
  assert.deepEqual(CONNECTOR_STEPS.filter(s => s.connector).map(s => s.id), ["o1-pick", "o2-find", "o2-enrich", "c1-topics", "c2-draft"]);
  for (const s of CONNECTOR_STEPS.filter(s => s.connector)) {
    assert.match(s.say, /Clay|Zynt|Surfer/, `${s.id}: names the connector to use`);
    assert.doesNotMatch(s.say, /85 stores|1,400|lea\.hoffmann@|1,900|880|320/, `${s.id}: nothing the connector returns is told`);
    assert.doesNotMatch(s.say + s.shows, /[\u2013\u2014]/);
  }
  for (const loop of ["outreach", "content"]) assert.ok(CONNECTOR_STEPS.filter(s => s.loop === loop).at(-1).fresh);
  assert.deepEqual(stepsFor(false, "", "", true).map(s => s.id), CONNECTOR_STEPS.map(s => s.id));
  assert.match(parseArgs(["--stub", "--connectors"]).error, /pick one/);
  assert.equal(parseArgs(["--connectors", "--step", "o2-find"]).error, "");
  // o1: the signals are read in Zynt; the same text from anywhere else is not that call
  const picked = "1. Fernbrook Outdoor: ICP fit with a Head of Returns post. 2. Heron Home. Umber Pharma is out.";
  const read = re => re.test("Fernbrook Outdoor posted a Head of Returns job\n## Not a fit\n\nPharmacy chains (regulated returns)");
  assert.equal(connectorStep("o1-pick").check(evidence({ reply: picked, saw: read, connector: via("zynt_list_signals") })), true);
  assert.match(connectorStep("o1-pick").check(evidence({ reply: picked, saw: read })), /did not read the signals in Zynt/);
  // o2: finding is free, enriching spends a credit and happens once, on the person's yes
  assert.equal(connectorStep("o2-find").check(evidence({ reply: "Lea Hoffmann, Head of Operations.", connector: via("clay_find_companies", "clay_find_people") })), true);
  assert.match(connectorStep("o2-find").check(evidence({ reply: "Lea Hoffmann.", connector: via("clay_find_people", "clay_enrich_person") })), /credit nobody asked for/);
  const lea = [{ name: "Lea Hoffmann", kind: "person", emails: ["lea.hoffmann@fernbrook-outdoor.example"] }];
  const enriched = evidence({ names: lea, connector: via("clay_enrich_person"), added: [{ content: "Clay: Fernbrook Outdoor has 85 stores; Head of Operations Lea Hoffmann.", tools: ["clay"] }] });
  assert.equal(connectorStep("o2-enrich").check(enriched), true);
  assert.match(connectorStep("o2-enrich").check({ ...enriched, connector: via("clay_enrich_person", "clay_enrich_person") }), /2 Clay enrichments, not one/);
  assert.match(connectorStep("o2-enrich").check({ ...enriched, connector: [] }), /0 Clay enrichments/);
  assert.match(connectorStep("o2-enrich").check({ ...enriched, added: [] }), /no note names Lea Hoffmann/, "the told step's checks still apply");
  // content: keywords and the brief come from Surfer, the article is written by the agent
  const topics = evidence({ reply: "Posts: 'store pickup returns', 'reduce return rate retail'; customers drown after Black Friday.", saw: () => true, connector: via("surfer_keyword_research") });
  assert.equal(connectorStep("c1-topics").check(topics), true);
  assert.match(connectorStep("c1-topics").check({ ...topics, connector: [] }), /did not check the keywords in Surfer/);
  assert.match(connectorStep("c1-topics").check({ ...topics, connector: via("surfer_keyword_research", "surfer_generate_article") }), /Surfer credit nobody asked for/);
  assert.match(connectorStep("c2-draft").check(evidence({ connector: via("surfer_create_content_editor", "surfer_generate_article") })), /Surfer wrote the article/);
  assert.match(connectorStep("c2-draft").check(evidence({ connector: via("surfer_create_content_editor") })), /the choice is not saved/, "then the told step's checks");
});

test("connector fixtures: each server lists its tools, answers from the canned data and traces the call", () => {
  const dir = mkdtempSync(join(tmpdir(), "gtm-demo-fixture-")), trace = join(dir, "trace.jsonl");
  const fixture = fileURLToPath(new URL("./live/gtm-connectors-fixture.mjs", import.meta.url));
  const talk = (server, ...messages) => spawnSync(process.execPath, [fixture, server, trace], { input: messages.map(m => JSON.stringify({ jsonrpc: "2.0", ...m })).join("\n") + "\n", encoding: "utf8" })
    .stdout.split("\n").filter(Boolean).map(l => JSON.parse(l));
  const listed = Object.fromEntries(CONNECTOR_SERVERS.map(s => [s, talk(s, { id: 1, method: "initialize", params: {} }, { id: 2, method: "tools/list" })[1].result.tools]));
  for (const [server, tools] of Object.entries(listed)) for (const t of tools) assert.ok(t.name.startsWith(`${server}_`) && t.description && t.inputSchema, t.name);
  // every tool a connectors check names exists, and the ones that spend a credit say so
  for (const name of ["zynt_list_signals", "clay_find_people", "clay_enrich_person", "surfer_keyword_research", "surfer_create_content_editor", "surfer_generate_article"]) assert.ok(Object.values(listed).flat().some(t => t.name === name), name);
  for (const name of ["clay_enrich_person", "surfer_generate_article"]) assert.match(Object.values(listed).flat().find(t => t.name === name).description, /Spends 1 .*credit.*ask the person/, name);
  const [signals] = talk("zynt", { id: 1, method: "tools/call", params: { name: "zynt_list_signals", arguments: {} } });
  assert.match(signals.result.content[0].text, /Fernbrook Outdoor posted a Head of Returns job/);
  const [email] = talk("clay", { id: 1, method: "tools/call", params: { name: "clay_enrich_person", arguments: { name: "Lea Hoffmann" } } });
  assert.match(email.result.content[0].text, /lea\.hoffmann@fernbrook-outdoor\.example/);
  assert.equal(talk("clay", { id: 1, method: "tools/call", params: { name: "clay_delete_all", arguments: {} } })[0].result.isError, true);
  const lines = readFileSync(trace, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  assert.deepEqual(lines.map(l => `${l.server}:${l.kind}:${l.tool}`), ["zynt:call:zynt_list_signals", "zynt:result:zynt_list_signals", "clay:call:clay_enrich_person", "clay:result:clay_enrich_person"]);
  assert.equal(spawnSync(process.execPath, [fixture, "hubspot", trace], { input: "", encoding: "utf8" }).status, 2);
});

// A stand-in for codex that answers every turn with the right words and does nothing: no tool call, no
// file, no note. The runner must fail every step, exit 1, resume one session per loop and start the last turn fresh.
// FAKE_CODEX_CALLS ("clay:clay_enrich_person,...") makes each turn call those tools on the connector servers its
// argv declares, the way Codex would: the calls reach the runner only through the trace the fixture writes.
function fakeCodex(more = {}) {
  const dir = mkdtempSync(join(tmpdir(), "gtm-demo-run-")), bin = join(dir, "bin"), log = join(dir, "argv.jsonl");
  mkdirSync(bin);
  writeFileSync(join(bin, "codex"), `#!${process.execPath}
const fs = require("node:fs"), argv = process.argv.slice(2);
let stdin = ""; process.stdin.on("data", d => { stdin += d; }); process.stdin.on("end", () => {
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ argv, stdin, home: process.env.CODEX_HOME || null }) + "\\n");
  // a real chat's first GTM Brain call starts the dashboard server of the brain; it outlives the chat
  if (process.env.FAKE_CODEX_DASH && argv.includes("-C")) require("node:child_process").spawnSync(process.execPath, [process.env.FAKE_CODEX_DASH, argv[argv.indexOf("-C") + 1], "--start"], { stdio: "ignore" });
  for (const [server, name] of (process.env.FAKE_CODEX_CALLS || "").split(",").filter(Boolean).map(c => c.split(":"))) {
    const declared = key => JSON.parse(argv.find((a, i) => argv[i - 1] === "-c" && a.startsWith("mcp_servers." + server + "." + key + "=")).split("=").slice(1).join("="));
    require("node:child_process").spawnSync(declared("command"), declared("args"), { input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { name: "Lea Hoffmann", company: "Fernbrook Outdoor" } } }) + "\\n" });
  }
  console.log(JSON.stringify({ type: "thread.started", thread_id: "thread-" + fs.readFileSync(${JSON.stringify(log)}, "utf8").split("\\n").filter(Boolean).length }));
  fs.writeFileSync(argv[argv.indexOf("-o") + 1], "Fernbrook Outdoor first, then Heron Home. Contact: Lea Hoffmann. ERP migration, call on 14 January, prospect. Posts: 'store pickup returns', 'reduce return rate retail'; customers say they drown after Black Friday. 1,240 visits, 3 demo requests. Next: peak season. Saved and drafted everything.");
});
`);
  chmodSync(join(bin, "codex"), 0o755);
  const script = fileURLToPath(new URL("./live/demo-loops.mjs", import.meta.url));
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GTM_BRAIN_EVAL_DIR: dir, ...more };
  const run = args => spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8" });
  const report = () => JSON.parse(readFileSync(join(dir, readdirSync(dir).find(n => n.startsWith("gtm-demo-loops-")), "report.json"), "utf8"));
  const turns = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  return { run, report, turns };
}
const config = (argv, key) => argv.find((a, i) => argv[i - 1] === "-c" && a.startsWith(`${key}=`))?.slice(key.length + 1);

test("demo runner: an agent that only talks fails every step", { timeout: 180000 }, () => {
  const fake = fakeCodex();
  assert.equal(fake.run(["outrech"]).status, 2, "a misspelt loop is refused, not reported as 0 of 0");
  const run = fake.run([]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const report = fake.report();
  assert.equal(report.results.length, STEPS.length);
  assert.deepEqual(report.results.filter(r => r.pass).map(r => r.id), [], "no step passes on the reply alone");
  const turns = fake.turns();
  assert.deepEqual(turns.map(t => t.argv.includes("resume")), STEPS.map((s, i) => !s.fresh && STEPS[i - 1]?.loop === s.loop), "turns of a loop resume its session; the first and the last are new chats");
  STEPS.forEach((s, i) => { if (turns[i].argv.includes("resume")) assert.ok(turns[i].argv.includes(`thread-${STEPS.findIndex(x => x.loop === s.loop) + 1}`), `${s.id} resumes the session its loop started`); assert.ok(turns[i].stdin.endsWith(s.say), s.id); });
  assert.deepEqual(report.results.filter(r => /codex/.test(r.why)).map(r => r.id), [], "every failure comes from a check, not from the stand-in");
  for (const t of turns) assert.ok(!t.argv.includes("resume") === /synthetic GTM Brain company brain/.test(t.stdin), "a new chat gets the preamble, a resumed turn only the sentence");
  for (const t of turns) {
    assert.equal(config(t.argv, `mcp_servers.${STUB_SERVER}.command`), undefined, "told mode declares no stub tools");
    for (const s of CONNECTOR_SERVERS) assert.equal(config(t.argv, `mcp_servers.${s}.command`), undefined, "told mode declares no connector fixtures");
    assert.equal(config(t.argv, "model_reasoning_effort"), JSON.stringify(process.env.GTM_BRAIN_EVAL_EFFORT || "medium"));
    // Codex filters an MCP server's environment: the proxy only sees what the env table passes
    assert.equal(config(t.argv, "mcp_servers.gtm_brain_eval.env.GTM_BRAIN_EVAL_ALLOW"), JSON.stringify("workflow"));
    assert.ok(config(t.argv, "mcp_servers.gtm_brain_eval.env.GTM_BRAIN_EVAL_PROFILE"), "the server keeps the scratch profile");
    // codex exec records every folder it runs in as a trusted project in its config.toml: never the person's own
    assert.ok(t.home && t.home.includes("gtm-demo-loops-") && t.home.endsWith("codex-home"), `codex runs on a scratch home beside the brain, not ${t.home}`);
  }
});

test("demo runner: stub mode declares the stub server beside GTM Brain and passes the failure to it", { timeout: 180000 }, () => {
  const fake = fakeCodex({ FAKE_CODEX_DASH: fileURLToPath(new URL("../server/dash.mjs", import.meta.url)), GTM_BRAIN_NO_OPEN: "1" });
  assert.equal(fake.run(["--stub", "--step", "o3-draft", "--fail", "expired_key"]).status, 2, "no step to run is refused, not reported as 0 of 0");
  const run = fake.run(["--stub", "--step", "o2-enrich,o3-draft,c1-topics", "--fail", "expired_key"]);   // o3-draft calls no tool: nothing to judge
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const report = fake.report(), turns = fake.turns();
  assert.equal(report.mode, "stub"); assert.equal(report.fail, "expired_key");
  // 15 Nov: every live run left a dashboard server running. The brain is kept for inspection; its server is not.
  const dash = JSON.parse(readFileSync(join(report.brain, "work", "dash.json"), "utf8"));
  if (dash.pid) { try { process.kill(dash.pid); } catch {} }   // do not leak it from a failing test either
  assert.ok(dash.port, "the stand-in started the dashboard server during the run");
  assert.equal(dash.pid, undefined, "the run stops the dashboard server it caused");
  assert.deepEqual(report.results.map(r => r.id), ["o2-enrich", "c1-topics"]);
  for (const r of report.results) { assert.match(r.why, /was not called/, "judged by the failure check"); assert.equal(r.stub_calls, 0); assert.equal(r.brain_calls, 0); }
  assert.equal(turns.length, 2);
  for (const [i, t] of turns.entries()) {
    assert.ok(!t.argv.includes("resume"), "a step run alone is a new chat");
    assert.equal(config(t.argv, `mcp_servers.${STUB_SERVER}.command`), JSON.stringify(process.execPath));
    const args = JSON.parse(config(t.argv, `mcp_servers.${STUB_SERVER}.args`));
    assert.match(args[0], /test\/live\/stub-gtm-tools\.mjs$/); assert.deepEqual(args.slice(-2), ["--fail", "expired_key"]); assert.ok(args.includes("--log"));
    assert.equal(config(t.argv, "mcp_servers.gtm_brain_eval.env.GTM_BRAIN_EVAL_ALLOW"), JSON.stringify("workflow,mark_tool"), "the model can record that a tool returned data");
    assert.ok(t.stdin.endsWith(stubStep(report.results[i].id).say));
    assert.match(t.stdin, new RegExp(`${STUB_SERVER} tools`)); assert.doesNotMatch(t.stdin, /Clay|Surfer/, "the preamble tells no results");
  }
});

test("demo runner: connectors mode declares Clay, Zynt and Surfer beside GTM Brain, and no stub tools", { timeout: 180000 }, () => {
  const fake = fakeCodex();
  assert.equal(fake.run(["--step", "o2-find"]).status, 2, "o2-find exists only with --connectors");
  const run = fake.run(["--connectors", "--step", "o1-pick,o2-find"]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const report = fake.report(), turns = fake.turns();
  assert.equal(report.mode, "connectors");
  assert.deepEqual(report.results.map(r => r.id), ["o1-pick", "o2-find"]);
  assert.match(report.results[0].why, /did not read the signals in Zynt/); assert.match(report.results[1].why, /did not look for the contact in Clay/);
  for (const r of report.results) assert.deepEqual(r.connectors, []);
  assert.ok(!lib.effectiveMemories(lib.readMemories(report.brain, "market")).some(m => /Fernbrook Outdoor/.test(m.content)), "the run's brain does not hold the signal Zynt returns");
  for (const [i, t] of turns.entries()) {
    for (const s of CONNECTOR_SERVERS) {
      assert.equal(config(t.argv, `mcp_servers.${s}.command`), JSON.stringify(process.execPath));
      const args = JSON.parse(config(t.argv, `mcp_servers.${s}.args`));
      assert.match(args[0], /test\/live\/gtm-connectors-fixture\.mjs$/); assert.equal(args[1], s); assert.match(args[2], /outreach-connectors\.jsonl$/);
    }
    assert.equal(config(t.argv, `mcp_servers.${STUB_SERVER}.command`), undefined);
    assert.ok(t.stdin.endsWith(connectorStep(report.results[i].id).say));
  }
  assert.match(turns[0].stdin, /Clay, Zynt and Surfer are connected as test fixtures/);
});

test("demo runner: connectors mode judges each turn on the calls its fixtures traced, and a credit nobody asked for fails", { timeout: 180000 }, () => {
  const fake = fakeCodex({ FAKE_CODEX_CALLS: "clay:clay_find_people,clay:clay_enrich_person" });
  const run = fake.run(["--connectors", "--step", "o1-pick,o2-find"]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const [pick, find] = fake.report().results;
  // two turns of one loop share a trace file: each is judged on its own calls, not on the turn before
  for (const r of [pick, find]) assert.deepEqual(r.connectors, ["clay:clay_find_people", "clay:clay_enrich_person"], r.id);
  assert.match(pick.why, /did not read the signals in Zynt/);
  assert.match(find.why, /spent a Clay credit nobody asked for/);
  assert.match(run.stdout, /connectors: clay:clay_find_people > clay:clay_enrich_person/);
});

test("presenter text: GUIDE.md carries the sentences the live run checks, word for word, within a page", () => {
  const guide = readFileSync(fileURLToPath(new URL("../../../GUIDE.md", import.meta.url)), "utf8");
  const section = guide.slice(guide.indexOf("## Workshop demo: the two loops"), guide.indexOf("## Workshop demo on stub tools"));
  const stubs = guide.slice(guide.indexOf("## Workshop demo on stub tools"), guide.indexOf("## Three habits"));
  assert.ok(guide.indexOf("## Workshop demo on stub tools") > guide.indexOf("## Workshop demo: the two loops"), "the stub tools section follows the demo");
  for (const said of ["--connectors", "gtm-connectors-fixture.mjs", "--stub", "stub-gtm-tools.mjs", "--fail expired_key", "--fail empty", "sign-in", "rate limits", "cost", "data shapes"]) assert.ok(stubs.includes(said), `stub tools section: ${said}`);
  assert.doesNotMatch(stubs, /[\u2013\u2014]/);
  const flat = section.replace(/\s+/g, " ");
  for (const s of STEPS) assert.ok(flat.includes(`*${s.say}*`), `${s.id}: the sentence in GUIDE.md differs from the one the live run types`);
  assert.ok(section.split("\n").length <= 60, `${section.split("\n").length} lines`);
  assert.doesNotMatch(section, /[\u2013\u2014]/);
});

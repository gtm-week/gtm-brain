process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// The MCP server: handshake, tool list, and the tools on a brain made by setup_brain.
// Run: node --test 'plugins/gtm-os/test/*.test.mjs'
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const lib = await import(`${P}/lib/brain.mjs`);
// Keep real installation preferences out of synthetic test brains.
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-test-profile-"));

const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, GTM_OS_NO_OPEN: "1" } });
const pending = new Map(); let seq = 0;
createInterface({ input: server.stdout }).on("line", line => { const m = JSON.parse(line); const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); } });
const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: args }); return { text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };
after(() => server.kill());

test('memory search maintenance is discoverable and reports completion without changing source evidence', async () => {
  const brain = mkdtempSync(join(tmpdir(), 'gtm-index-mcp-'));
  mkdirSync(join(brain, 'brain'));
  writeFileSync(join(brain, 'brain', 'admin.md'), lib.renderFrontmatter({ company: 'Index Fixture', team: [{ name: 'Ann Lee', handle: 'ann', email: 'ann@fixture.test' }] }));
  lib.writeContext(brain, 'sales', { title: 'Sales' });
  lib.appendMemory(brain, 'sales', { authors: ['ann'], content: 'Quasar pipeline evidence.' });
  const source = lib.readMemories(brain, 'sales');
  const { result: catalog } = await rpc('tools/list');
  const tool = catalog.tools.find(t => t.name === 'memory_index');
  assert.ok(tool); assert.deepEqual(tool.inputSchema.properties.mode.enum, ['status', 'refresh', 'rebuild']);
  assert.equal(JSON.parse((await call('memory_index', { brain, mode: 'status' })).text).status, 'missing');
  for (const mode of ['refresh', 'rebuild', 'status']) {
    const reply = await call('memory_index', { brain, mode, budget_ms: 5000 });
    assert.ok(!reply.isError, reply.text); assert.equal(JSON.parse(reply.text).status, 'ready');
  }
  const invalid = await rpc('tools/call', { name: 'memory_index', arguments: { brain, mode: 'delete' } });
  assert.ok(invalid.error || invalid.result?.isError);
  assert.deepEqual(lib.readMemories(brain, 'sales'), source);
  const search = await call('query', { brain, object: 'memories', search: 'Quasar' });
  assert.ok(!search.isError, search.text); assert.match(search.text, /Quasar pipeline evidence/);
});

test("entity search through MCP ranks local and CRM typos without changing identities or memories", async () => {
  const brain = mkdtempSync(join(tmpdir(), "gtm-search-mcp-"));
  execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Search Fixture", "--one-liner", "Synthetic search", "--owner", "Ann Lee <ann@fixture.test>", "--dashboard", "on-demand"], { cwd: brain, env: { ...process.env, GTM_OS_NO_COMMIT: "1", GTM_OS_NO_OPEN: "1" } });
  const by = lib.readAdmin(brain).team[0].handle;
  const artur = lib.addName(brain, "Artur Ziętara", { emails: ["artur@fixture.test"], references: [{ kind: "attio/work", ref: "https://crm.fixture.test/artur?account=work" }] });
  const anna = lib.addName(brain, "Anna Ziętara");
  const bytes = [artur, anna].map(e => readFileSync(join(brain, e._path), "utf8"));
  const search = await call("query", { brain, object: "entities", search: "Zientara" }); assert.ok(!search.isError, search.text);
  const result = JSON.parse(search.text); assert.equal(result.status, "candidates"); assert.equal(result.total, 2);
  assert.ok(result.candidates.some(c => c.id === artur.id && c.references[0].ref.includes("account=work")));
  assert.equal(JSON.parse((await call("query", { brain, object: "entities", search: artur.id })).text).status, "resolved");
  const unknown = await call("query", { brain, object: "entities", search: "Nobody Unknown" }); assert.ok(!unknown.isError); assert.equal(JSON.parse(unknown.text).status, "no_match");
  const candidates = [{ id: "123", name: "Artur Ziętara", emails: ["artur@fixture.test"], reference: { kind: "hubspot/work", ref: "https://crm.fixture.test/contact/123" } }, { id: "123", name: "Anna Ziętara", reference: { kind: "hubspot/other", ref: "https://other.fixture.test/contact/123" } }];
  const remote = await call("query", { brain, object: "entities", search: "Zientara", candidates }); assert.ok(!remote.isError, remote.text);
  const ranked = JSON.parse(remote.text); assert.equal(ranked.status, "candidates"); assert.equal(ranked.total, 2); assert.equal(ranked.scope, "supplied source candidates only");
  assert.equal(JSON.parse((await call("query", { brain, object: "entities", search: "Zientara", candidates: [] })).text).status, "no_match");
  assert.ok((await call("who_is", { brain, candidates })).isError);
  assert.ok((await call("who_is", { brain, name: "Zientara", candidates: [{ id: "1", name: "Artur" }] })).isError);
  assert.ok((await call("who_is", { brain, name: "Zientara", candidates: [{ ...candidates[0], emails: "not-an-array" }] })).isError);
  assert.ok((await call("who_is", { brain, name: "Zientara", limit: 11 })).isError);
  assert.deepEqual([artur, anna].map(e => readFileSync(join(brain, e._path), "utf8")), bytes);
  assert.equal(lib.readMemories(brain, "offer").length, 0);
  const held = await call("remember", { brain, by, context: "offer", content: "Zientara asked for a pilot.", people: ["Zientara"] });
  assert.match(held.text, /held|looks like|same|confirm/i);
  assert.equal(lib.readMemories(brain, "offer").length, 0);
  assert.deepEqual([artur, anna].map(e => readFileSync(join(brain, e._path), "utf8")), bytes);
});

test("customer capture and corrections flow through the live MCP catalog with validated scoped coverage", async () => {
  const customerRoot = mkdtempSync(join(tmpdir(), "gtm-customer-mcp-"));
  mkdirSync(join(customerRoot, "brain"));
  writeFileSync(join(customerRoot, "brain/admin.md"), lib.renderFrontmatter({ company: "Customer Fixture", team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  lib.writeContext(customerRoot, "icp", { title: "Target customers" });
  const args = { brain: customerRoot, by: "ann", context: "icp", content: "Acme is our customer, missing from CRM.", companies: ["Acme"], sources: ["user:ann"],
    customer: { entity: "Acme", status: "customer", basis: "user", observed_at: "2026-09-10T10:00:00Z" } };
  const captured = await call("remember", args); assert.ok(!captured.isError, captured.text);
  const before = lib.readMemories(customerRoot, "icp")[0];
  const refresh = { ...args, content: "CRM labels Acme a prospect.", sources: ["attio:https://crm.test/acme"], customer: { ...args.customer, basis: "source", status: "prospect", observed_at: "2026-09-11T10:00:00Z", reference: {kind:"attio",ref:"https://crm.test/acme"} } };
  const refused = await call("remember", { ...refresh, supersedes: before.id });
  assert.ok(refused.isError); assert.match(refused.text, /cannot replace/);
  assert.ok(!(await call("remember", refresh)).isError);
  const result = await call("query", { brain: customerRoot, object: "customers" }); assert.ok(!result.isError,result.text);
  const view = JSON.parse(result.text); assert.equal(view.customers.length,1); assert.equal(view.customers[0].status,"customer"); assert.equal(view.customers[0].conflicts.length,1);
  assert.ok(view.customers[0].references.some(r=>r.ref==="https://crm.test/acme"));
  const coverage = { tool:"attio",scope:"Customer list",status:"partial",checked_at:"2026-09-11T10:00:00Z",scanned:1,total:null,unresolved:0 };
  const checked=await call("remember",{brain:customerRoot,by:"ann",context:"icp",content:"One page checked; total unknown.",sources:["attio:list-1"],customer_coverage:coverage});
  assert.ok(!checked.isError,checked.text);
  const invalid=await call("remember",{brain:customerRoot,by:"ann",context:"icp",content:"Invalid count.",sources:["attio:list-1"],customer_coverage:{...coverage,scanned:-1}});
  assert.ok(invalid.isError);
  const {result:catalog}=await rpc("tools/list");
  assert.equal(catalog.tools.find(t=>t.name==="query").annotations.readOnlyHint,true, "the one read tool is read-only; customer_overview is no longer listed");
});

test("memory dates stay in content while MCP capture assigns the recording timestamp", async () => {
  const brain = mkdtempSync(join(tmpdir(), "gtm-dated-memory-mcp-"));
  mkdirSync(join(brain, "brain"));
  writeFileSync(join(brain, "brain", "admin.md"), lib.renderFrontmatter({ company: "Timeline Fixture", team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  lib.writeContext(brain, "events", { title: "Events" });
  const started = Date.now();
  const content = "Chris agreed the sponsorship plan around June 2026.";
  const captured = await call("remember", { brain, by: "ann", context: "events", content, people: ["Chris"] });
  assert.ok(!captured.isError, captured.text);
  const batch = await call("remember", { brain, by: "ann", memories: [{ context: "events", content: "Chris prefers concise proposals.", people: ["Chris"] }] });
  assert.ok(!batch.isError, batch.text);
  const memories = lib.readMemories(brain, "events");
  assert.equal(memories.length, 2);
  assert.equal(memories[0].content, content);
  assert.ok(memories.every(m => Date.parse(m.at) >= started && Date.parse(m.at) <= Date.now()));
  const view = await call("query", { brain, object: "brief", search: "Chris" });
  assert.ok(!view.isError, view.text);
  assert.match(view.text, /around June 2026/);
  assert.match(view.text, /Recorded:/);
  const { result: catalog } = await rpc("tools/list");
  const schema = catalog.tools.find(t => t.name === "remember").inputSchema;
  for (const fields of [schema.properties, schema.properties.memories.items.properties]) {
    assert.ok(!Object.hasOwn(fields, "occurred_at"));
    assert.ok(!Object.hasOwn(fields, "recorded_at"));
    assert.match(fields.content.description, /relevant dates/);
  }
});

test("formal entities can be created, described and queried through MCP with organization subtypes", async () => {
  const brain = mkdtempSync(join(tmpdir(), "gtm-entity-ontology-mcp-"));
  mkdirSync(join(brain, "brain"));
  writeFileSync(join(brain, "brain", "admin.md"), lib.renderFrontmatter({ company: "Fixture", team: [{ name: "Ann Lee", handle: "ann", email: "ann@example.test" }] }));
  lib.writeContext(brain, "partners", { title: "Partners" });
  const added = await call("add_name", { brain, name: "Acme Foundation", kind: "organization", subtype: "nonprofit", aliases: ["Acme"] });
  assert.ok(!added.isError, added.text);
  // the model passes by to every writer; add_name refused it with "add_name.by is not allowed" (FDE OS, 2026-10-01)
  const withBy = await call("add_name", { brain, by: "ann", name: "Slack", kind: "product" });
  assert.ok(!withBy.isError, withBy.text);
  const found = await call("query", { brain, object: "entities", filters: { kind: "organization", subtype: "nonprofit" }, search: "Acme" });
  assert.ok(!found.isError, found.text);
  const row = JSON.parse(found.text.split("\n")[1]);
  assert.equal(row.name, "Acme Foundation");
  const described = await call("describe_object", { brain, name: "entities" });
  assert.match(described.text, /memories.entities = entities.id/);
  assert.match(described.text, /add_name/);
  const captured = await call("remember", { brain, by: "ann", context: "partners", people: ["Acme"], content: "Acme offered to introduce two partners." });
  assert.ok(!captured.isError, captured.text);
  const evidence = await call("query", { brain, object: "memories", filters: { entities: row.id, context: "partners" } });
  assert.match(evidence.text, /introduce two partners/);
  const scoped = await call("query", { brain, object: "entities", filters: { contexts: "partners" } });
  assert.match(scoped.text, /Acme Foundation/);
  const invalid = await call("add_name", { brain, name: "Invalid", kind: "product", subtype: "team" });
  assert.ok(invalid.isError);
  assert.ok(!lib.resolveEntity(lib.readNames(brain), "Invalid"));
});

const root = mkdtempSync(join(tmpdir(), "gtm-os-mcp-"));
execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);

test("handshake and tool list carry titles and the brain parameter", async () => {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  assert.equal(init.result.serverInfo.name, "gtm-os"); assert.match(init.result.instructions, /kept at once/);
  const { result } = await rpc("tools/list");
  const names = result.tools.map(t => t.name);
  const update = result.tools.find(t => t.name === "update_plugin");
  assert.deepEqual(update.inputSchema.required, ["mode"]);
  assert.equal(update.annotations.openWorldHint, true);
  for (const n of ["load_context", "remember", "query", "render_dashboard", "open_dashboard", "archive_context", "edit_context", "add_name", "propose_admin_change", "setup_brain"]) assert.ok(names.includes(n), n);
  // compilation belongs to the scheduled and background runs: a chat never sees the tools (ALL-204 step 1)
  for (const n of ["compile_facts", "compile_apply", "compile_entity"]) assert.ok(!names.includes(n), `${n} is not offered to a chat`);
  const rem = result.tools.find(t => t.name === "remember");
  assert.equal(rem.title, "Remembering"); assert.equal(rem.annotations.readOnlyHint, false);
  assert.deepEqual(rem.inputSchema.required, ["brain", "by"], "content or memories: a turn's findings go in one call");
  assert.deepEqual(rem.inputSchema.properties.memories.items.required, ["content"]);
  // a root anyOf made Codex offer remember with no inputs at all (0.28.2): every root is a plain object
  for (const t of result.tools) assert.deepEqual(["anyOf", "oneOf", "allOf", "not", "enum"].filter(k => k in t.inputSchema), [], `${t.name}: root combinator in its advertised schema`);
  assert.ok(names.includes("save") && !names.includes("approve_apply"), "saving is a tool, applying APPROVE stays a shell step");
});

test("check_environment reports the machine and the folder without a brain", async () => {
  mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(join(root, "work", "session.json"), JSON.stringify({ session_id: "s", cwd: root, at: new Date().toISOString() }));
  const r = await call("check_environment", { folder: root });
  assert.match(r.text, /^node v\d+/m); assert.match(r.text, /^git \d/m); assert.match(r.text, /codex/);
  assert.match(r.text, new RegExp(`folder ${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: empty: ready for setup`));
});

test("plugin updater requires an explicit valid mode without requiring a brain", async () => {
  const r = await call("update_plugin", {});
  assert.ok(r.isError);
  assert.match(r.text, /mode must be check or update/);
});

test("a folder without a brain is refused; setup_brain makes one", async () => {
  const bad = await call("list_contexts", { brain: root });
  assert.ok(bad.isError); assert.match(bad.text, /not a brain/);
  const made = await call("setup_brain", { folder: root, company: "Reflow", one_liner: "returns automation", owner: "Marta Nowak <marta@reflow.io>", team: "Tomek Zielinski <tomek@reflow.io>", tools: "Attio (CRM), Gmail", icp: "Read Attio live." });
  assert.ok(!made.isError, made.text); assert.match(made.text, /brain created for Reflow/);
  assert.ok(existsSync(join(root, "brain", "contexts", "icp", "context.md")));
});

test("two remember calls at the same time keep their own notes: each call has its own input file", async () => {
  const [a, b] = await Promise.all([
    call("remember", { brain: root, by: "marta", context: "icp", content: "Ann's note: ICP is mid-market ops." }),
    call("remember", { brain: root, by: "tomek", context: "offer", content: "Bo's note: the offer is per seat." }),
  ]);
  assert.ok(!a.isError && !b.isError, a.text + b.text);
  const icp = lib.effectiveMemories(lib.readMemories(root, "icp")).map(m => m.content), offer = lib.effectiveMemories(lib.readMemories(root, "offer")).map(m => m.content);
  assert.ok(icp.some(c => c.startsWith("Ann's note")) && !offer.some(c => c.startsWith("Ann's note")), "Ann's note is in icp only: " + JSON.stringify({ icp, offer }));
  assert.ok(offer.filter(c => c.startsWith("Bo's note")).length === 1 && !icp.some(c => c.startsWith("Bo's note")), "Bo's note is in offer once: " + JSON.stringify({ icp, offer }));
  assert.ok(!existsSync(join(root, "work", "remember.json")), "no shared input file");
});

test("load, remember (not committed by the server), recall, compile facts, render, propose", async () => {
  const loaded = await call("load_context", { brain: root, contexts: ["icp"], mode: "only" });
  assert.match(loaded.text, /Loaded now: admin \+ icp/);
  const rem = await call("remember", { brain: root, by: "marta", kind: "decision", content: "No discount for Bergstrom.", people: ["Pierre Aubert"], tools: ["attio"], sources: ["attio:deal/1"] });
  assert.ok(!rem.isError, rem.text); assert.match(rem.text, /remembered m_[0-9a-f]{12} in icp/); assert.match(rem.text, /^kept$/m, "kept at once, no remote so not shared");
  assert.equal(execFileSync("git", ["-C", root, "status", "--short"], { encoding: "utf8" }).trim(), "", "nothing left to save");
  const hit = await call("query", { brain: root, object: "memories", search: "Bergstrom" });
  assert.match(hit.text, /No discount for Bergstrom/);
  const behind = await call("compile_facts", { brain: root });
  assert.match(behind.text, /icp/);
  const facts = await call("compile_facts", { brain: root, context: "icp" });
  const asOf = facts.text.match(/as_of: (\S+)/)?.[1]; assert.ok(asOf, facts.text);
  const applied = await call("compile_apply", { brain: root, context: "icp", by: "marta", as_of: asOf, summary: "Bergstrom gets no discount.", now: "Hold the price." });
  assert.ok(!applied.isError, applied.text); assert.match(applied.text, /kept/);
  const rendered = await call("render_dashboard", { brain: root });
  assert.ok(!rendered.isError, rendered.text); assert.ok(existsSync(join(root, "work", "home", "index.html")));
  const opened = await call("open_dashboard", { brain: root });
  assert.ok(!opened.isError, opened.text); assert.match(opened.text, /Dashboard: http:\/\/127\.0\.0\.1:\d+\/  Open it in the in-app browser/);
  const adminPath = join(root, "brain", "admin.md");
  writeFileSync(adminPath, readFileSync(adminPath, "utf8").replace("dashboard: always", "dashboard: always\ndashboard_browser: chrome"));
  const openedChrome = await call("open_dashboard", { brain: root });
  assert.ok(!openedChrome.isError, openedChrome.text); assert.match(openedChrome.text, /open_in_codex/);
  assert.doesNotMatch(openedChrome.text, /Opened in a separate Google Chrome window/, "a legacy chrome value is ignored");
  assert.match(readFileSync(adminPath, "utf8"), /dashboard_browser: chrome/, "legacy protected info remains untouched");
  writeFileSync(adminPath, readFileSync(adminPath, "utf8").replace("dashboard_browser: chrome\n", ""));
  execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, "--stop"]);
  const admin = execFileSync("cat", [join(root, "brain", "admin.md")], { encoding: "utf8" });
  const prop = await call("propose_admin_change", { brain: root, content: admin.replace("returns automation", "returns automation for UK retailers") });
  assert.ok(!prop.isError, prop.text); assert.match(prop.text, /\+ .*UK retailers/);
  assert.ok(existsSync(join(root, "work", "admin.proposed.md")));
  const blocked = await call("save", { brain: root, message: "notes: icp (1)" });
  assert.ok(blocked.isError); assert.match(blocked.text, /waiting for APPROVE/);
  execFileSync("rm", [join(root, "work", "admin.proposed.md")]);
  execFileSync("node", ["-e", "require('fs').appendFileSync(process.argv[1], '- Hand Edit | emails: hand@example.com\\n')", join(root, "brain", "entities.md")]);
  const saved = await call("save", { brain: root, message: "names: hand edit" });
  assert.ok(!saved.isError, saved.text); assert.match(saved.text, /saved [0-9a-f]{7,}: 1 file\(s\)/); assert.match(saved.text, /no remote, local only/);
  assert.equal(execFileSync("git", ["-C", root, "status", "--short"], { encoding: "utf8" }).trim(), "");
  assert.match(execFileSync("git", ["-C", root, "log", "-1", "--format=%s"], { encoding: "utf8" }), /names: hand edit/);
  const again = await call("save", { brain: root }); assert.match(again.text, /nothing to save/);
});

test("client capture links and classifies a company in one remember call", async () => {
  const saved = await call("remember", { brain: root, by: "marta", context: "icp", content: "Castorama asks about ByteDance support; meeting time unknown.", companies: ["Castorama"], sources: ["chat:client-request"] });
  assert.ok(!saved.isError, saved.text);
  const lib = await import('../lib/brain.mjs');
  assert.equal(lib.readNames(root).find(n => n.name === 'Castorama')?.kind, 'organization');
  const records = readFileSync(join(root, 'brain/contexts/icp/memories.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(records.at(-1).people.includes('Castorama'));
  const facts = await call('compile_facts', { brain: root, context: 'icp' });
  assert.match(facts.text, /Castorama/);
});


test("closing input flushes a large tool catalog reply before exit", () => {
  const output = execFileSync(process.execPath, [`${P}/server/server.mjs`], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list" }) + "\n",
    encoding: "utf8", timeout: 10000,
  });
  assert.ok(output.length > 8192, "exercise a reply larger than the pipe buffer");
  const reply = JSON.parse(output);
  assert.equal(reply.id, 99);
  assert.ok(reply.result.tools.some(tool => tool.name === "remember"));
});

test("remember takes a turn's findings in one call and reports each entry by position", async () => {
  await call("load_context", { brain: root, contexts: ["icp"], mode: "only" });
  const before = execFileSync("git", ["-C", root, "log", "--format=%s"], { encoding: "utf8" }).split("\n").filter(Boolean).length;
  const r = await call("remember", { brain: root, by: "marta", memories: [
    { content: "Bergstrom moved its close date from September to November.", kind: "decision", companies: ["Bergstrom"] },
    { content: "Who owns the security review?", kind: "question", context: "offer" },
  ] });
  assert.ok(!r.isError, r.text);
  assert.match(r.text, /kept 2 of 2/);
  assert.match(r.text, /#1 remembered m_[0-9a-f]{12} in icp · decision/);
  assert.match(r.text, /#2 remembered m_[0-9a-f]{12} in offer · question/);
  const msgs = execFileSync("git", ["-C", root, "log", "--format=%s"], { encoding: "utf8" }).split("\n").filter(Boolean);
  assert.equal(msgs.length - before, 2, "one commit per memory, not one for the call");
});

test("remember with neither content nor memories is refused where it runs, since the advertised schema no longer says so", async () => {
  const r = await call("remember", { brain: root, by: "marta" });
  assert.ok(r.isError, r.text);
  assert.match(r.text, /remember needs content; remember needs memories/);
});

test("generated query finds current decisions and preserves the append-only correction history", async () => {
  const first = await call("remember", { brain: root, by: "marta", context: "offer", kind: "decision", content: "Trial length is fourteen days.", tags: ["routing-test"] });
  const id = first.text.match(/remembered (m_[0-9a-f]{12})/)?.[1]; assert.ok(id, first.text);
  const correction = await call("remember", { brain: root, by: "marta", context: "offer", kind: "decision", content: "Trial length is thirty days.", supersedes: id, tags: ["routing-test"] });
  assert.ok(!correction.isError, correction.text);
  const found = await call("query", { brain: root, object: "memories", filters: { context: "offer", kind: "decision", tags: "routing-test" } });
  assert.ok(!found.isError, found.text); assert.match(found.text, /^1 row:/);
  assert.match(found.text, /thirty days/); assert.doesNotMatch(found.text, /fourteen days/);
  assert.ok(lib.readMemories(root, "offer").some(m => m.id === id), "the original remains in history");
  const covers = await call("query", { brain: root, object: "contexts", filters: { slug: "offer" } });
  const cover = JSON.parse(covers.text.split("\n")[1]);
  assert.equal(cover.memories, lib.effectiveMemories(lib.readMemories(root, "offer")).length);
  assert.equal(cover.stale, true);
});

test("generated search expands aliases; the catalog has the three core objects", async () => {
  await call("add_name", { brain: root, name: "Krzysztof Pawlak", aliases: ["Chris"] });
  const saved = await call("remember", { brain: root, by: "marta", context: "offer", content: "Krzysztof Pawlak owns the rollout.", people: ["Krzysztof Pawlak"] });
  assert.ok(!saved.isError, saved.text);
  const found = await call("query", { brain: root, object: "memories", filters: { context: "offer" }, search: "Chris" });
  assert.match(found.text, /owns the rollout/);
  const { result } = await rpc("tools/list");
  assert.deepEqual(result.tools.find(t => t.name === "query").inputSchema.properties.object.enum.slice(0, 3), ["contexts", "memories", "entities"], "the three core objects first; the derived reads follow as views (ALL-204 step 2a)");
  assert.equal(result.tools.filter(t => t.name === "remember").length, 1);
  assert.ok(!result.tools.some(t => t.name === "act_remember"));
});

test("a correction names a note that exists, in the context it is remembered in", async () => {
  const first = await call("remember", { brain: root, by: "marta", context: "offer", kind: "decision", content: "Trial lasts fourteen days.", tags: ["correction-test"] });
  const id = first.text.match(/remembered (m_[0-9a-f]{12})/)?.[1]; assert.ok(id, first.text);
  const before = { offer: lib.readMemories(root, "offer"), strategy: lib.readMemories(root, "strategy") };
  // from another context: refused, and it says where the note lives
  const elsewhere = await call("remember", { brain: root, by: "marta", context: "strategy", kind: "decision", content: "Trial lasts thirty days.", supersedes: id });
  assert.equal(elsewhere.isError, true, elsewhere.text); assert.match(elsewhere.text, new RegExp(`${id} is in offer, not strategy`));
  // a note that does not exist: refused
  const phantom = await call("remember", { brain: root, by: "marta", context: "offer", content: "Invalid target.", retracts: "m_000000000000" });
  assert.equal(phantom.isError, true, phantom.text); assert.match(phantom.text, /no memory m_000000000000 to withdraw/);
  assert.deepEqual(lib.readMemories(root, "offer"), before.offer); assert.deepEqual(lib.readMemories(root, "strategy"), before.strategy);
  // in its own context: the correction takes, and only the new one is current
  const ok = await call("remember", { brain: root, by: "marta", context: "offer", kind: "decision", content: "Trial lasts thirty days.", supersedes: id, tags: ["correction-test"] });
  assert.ok(!ok.isError, ok.text);
  const current = lib.effectiveMemories(lib.readMemories(root, "offer")).filter(m => m.tags.includes("correction-test")).map(m => m.content);
  assert.deepEqual(current, ["Trial lasts thirty days."]);
});

test("a note beside a batch is refused, not dropped", async () => {
  const before = lib.readMemories(root, "offer");
  const mixed = await call("remember", { brain: root, by: "marta", context: "offer", content: "Top-level finding.", memories: [{ context: "offer", content: "Batch finding." }] });
  assert.equal(mixed.isError, true, mixed.text); assert.match(mixed.text, /not both/);
  assert.deepEqual(lib.readMemories(root, "offer"), before, "nothing was kept");
});

test("a declined tool the person tests again is offered again", async () => {
  const skipped = await call("mark_tool", { brain: root, tool: "gmail", status: "skip", note: "Wait until next quarter." });
  assert.match(skipped.text, /declined/);
  assert.equal(JSON.parse(readFileSync(join(root, "work", "tools.json"), "utf8")).gmail.declined, true);
  const connected = await call("mark_tool", { brain: root, tool: "gmail", status: "ok", note: "Inbox read succeeded." });
  assert.match(connected.text, /no longer declined/);
  const after = JSON.parse(readFileSync(join(root, "work", "tools.json"), "utf8")).gmail;
  assert.equal(after.declined, undefined, JSON.stringify(after)); assert.equal(after.test, "ok"); assert.equal(after.tool, "gmail");
});

test("the interactions are the ontology's: none hand-written twice, names and titles unchanged", async () => {
  const { compareCatalog } = await import("../vendor/allethic/review.mjs");
  const { loadOntology } = await import("../vendor/allethic/ontology.mjs");
  const onto = await loadOntology(`${P}/ontology/gtm-os.ossie.json`);
  const { result } = await rpc("tools/list");
  const r = compareCatalog(onto, result.tools);
  assert.deepEqual(onto.actions.map(a => a.tool_name).sort(), ["add_name", "archive_context", "archive_entity", "compile_apply", "compile_entity", "edit_context", "fork_context", "merge_entities", "new_context", "remember", "undo_entity_merge", "update_entity"]);
  assert.deepEqual(r.renameCandidates, [], "no act_ names"); assert.deepEqual(r.missingInHost.sort(), ["compile_apply", "compile_entity"], "only the run-only compile tools are hidden from a chat"); assert.deepEqual(r.duplicates, []);
  assert.ok(!r.extra.some(x => onto.actions.some(a => a.tool_name === x.name)), "a described interaction is not also hand-written");
  for (const [name, title] of [["new_context", "Opening a context"], ["add_name", "Adding a name"]]) assert.equal(result.tools.find(t => t.name === name).title, title);
  // and they run: a channel opened through the generated tool is a channel
  const made = await call("new_context", { brain: root, slug: "pipeline", title: "Pipeline", rule: "Deals in flight." });
  assert.ok(!made.isError, made.text); assert.match(made.text, /^ok: new_context/); assert.ok(existsSync(join(root, "brain", "contexts", "pipeline", "context.md")));
});

test("MCP captures stable identities, compiles cited briefs, and reads a context perspective", async () => {
  const added = await call("add_name", { brain: root, name: "Alex Reed", references: [{ kind: "attio_person", ref: "person-123" }], sources: [{ kind: "user", ref: "marta" }] });
  assert.ok(!added.isError, added.text);
  await call("remember", { brain: root, by: "marta", memories: [
    { context: "icp", content: "Alex Reed coordinates evaluation interviews.", people: ["Alex Reed"], sources: ["gmail:alex-1"] },
    { context: "offer", content: "Alex Reed asked about annual pricing.", people: ["Alex Reed"], sources: ["gmail:alex-2"] },
  ] });
  const factsResult = await call("entity_facts", { brain: root, entity: "Alex Reed" });
  assert.ok(!factsResult.isError, factsResult.text);
  const facts = JSON.parse(factsResult.text);
  const a = facts.contexts.find(c => c.context === "icp").memories[0], b = facts.contexts.find(c => c.context === "offer").memories[0];
  assert.ok(a.entities.includes(facts.entity.id));
  const brief = { overview: [{ text: "Alex coordinates interviews and has asked about annual pricing.", memories: [a.id, b.id] }], contexts: [
    { context: "icp", summary: [{ text: "Coordinates evaluation interviews.", memories: [a.id] }], open_threads: [] },
    { context: "offer", summary: [{ text: "Asked about annual pricing.", memories: [b.id] }], open_threads: [] },
  ], relationships: [] };
  const applied = await call("compile_entity", { brain: root, entity: facts.entity.id, by: "marta", as_of: facts.as_of, brief });
  assert.ok(!applied.isError, applied.text);
  const before = lib.readLoaded(root);
  const read = await call("query", { brain: root, object: "brief", search: facts.entity.id, filters: { context: "icp" } });
  assert.match(read.text, /Coordinates evaluation interviews/); assert.doesNotMatch(read.text, /annual pricing/);
  assert.deepEqual(lib.readLoaded(root), before);
  assert.ok(existsSync(join(root, facts.entity.path)));
  assert.ok(!existsSync(join(root, "work", "people")));
  const queried = await call("query", { brain: root, object: "memories", filters: { entities: facts.entity.id } });
  assert.ok(!queried.isError, queried.text); assert.match(queried.text, /Alex Reed/);
  await call("remember", { brain: root, by: "marta", context: "icp", people: ["Alex Reed"], content: "Alex Reed paused the interviews." });
  const stale = await call("compile_entity", { brain: root, entity: facts.entity.id, by: "marta", as_of: facts.as_of, brief });
  assert.ok(stale.isError, stale.text); assert.match(stale.text, /changed/);
});

test("invalid nested batch inputs fail before any memory is written", async () => {
  const before = lib.readMemories(root, "offer");
  for (const entry of [{ content: 7 }, { content: "bad kind", kind: "action" }, { content: "bad name", new_names: [true] }, { content: "extra field", extra: true }]) {
    const result = await call("remember", { brain: root, by: "marta", memories: [{ context: "offer", content: "This valid entry must not be partially kept." }, { context: "offer", ...entry }] });
    assert.equal(result.isError, true, result.text);
  }
  assert.deepEqual(lib.readMemories(root, "offer"), before);
});

test("the plugin people install carries no developer tooling", async () => {
  // the review lives in the repository (.agents/skills); a company brain never sees it
  const m = await rpc("tools/call", { name: "review_tools", arguments: { repository: P } });
  assert.equal(m.error && m.error.code, -32602, "review_tools is not a shipped tool: " + JSON.stringify(m));
  assert.match(m.error.message, /unknown tool review_tools/);
  assert.ok(!existsSync(`${P}/skills/gtm-os-review-tools`), "no developer skill under the shipped skills");
});

test("evaluation proxy exposes a harmless competitor and refuses other roots and contexts", async () => {
  const trace = join(root, "work", "proxy-test.jsonl");
  const proxy = spawn(process.execPath, [`${P}/test/live/tool-routing-proxy.mjs`, root, trace], { stdio: ["pipe", "pipe", "pipe"] });
  const waits = new Map(); let id = 0;
  const reader = createInterface({ input: proxy.stdout });
  reader.on("line", line => { const message = JSON.parse(line); const next = waits.get(message.id); if (next) { waits.delete(message.id); next(message.result); } });
  const ask = (method, params) => new Promise(resolve => { const requestId = ++id; waits.set(requestId, resolve); proxy.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n"); });
  try {
    const catalog = await ask("tools/list", {});
    assert.ok(catalog.tools.some(t => t.name === "computer_use"));
    assert.ok(!catalog.tools.some(t => t.name === "setup_brain"));
    for (const arguments_ of [{ brain: P, object: "memories" }, { brain: root, by: "marta", context: "../offer", content: "No write" }]) {
      const response = await ask("tools/call", { name: arguments_.object ? "query" : "remember", arguments: arguments_ });
      assert.equal(response.isError, true);
    }
    const fallback = await ask("tools/call", { name: "computer_use", arguments: { action: "inspect" } });
    assert.equal(fallback.isError, true); assert.match(fallback.content[0].text, /No UI access or writes/);
  } finally { reader.close(); proxy.stdin.end(); proxy.kill(); }
});

test("interact: the company's interaction records the prescribed memory and says what to do in the connector", async () => {
  if (!existsSync(join(root, "brain", "contexts", "pipeline", "context.md"))) execFileSync(process.execPath, [`${P}/scripts/gtm-os-contexts/contexts.mjs`, root, "--new", "pipeline", "Pipeline", "Deals in flight."], { env: { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_COMMIT: "1" }, stdio: "ignore" });
  await call("add_name", { brain: root, name: "Castorama", kind: "company" });
  lib.writeInteractions(root, [{ name: "move_deal", title: "Moving a deal", tool: "attio", operation: "Move the deal to the given stage in Attio.", description: "A deal changes stage.",
    input_schema: { type: "object", properties: { deal: { type: "string" }, stage: { type: "string", enum: ["lead", "proposal", "won"] }, note: { type: "string" } }, required: ["deal", "stage"], additionalProperties: false },
    record: { context: "pipeline", kind: "note", companies: ["deal"], people: [], content: "Moved {deal} to {stage}.{note? Note: {note}}", action: "attio:move deal:{deal}", tags: ["deal-stage"] } }]);
  const catalog = await call("list_objects", { brain: root });
  assert.match(catalog.text, /Interactions of this company \(run with interact\):\n- move_deal\(deal, stage, note\?\) \[attio\]: A deal changes stage\./);
  const done = await call("interact", { brain: root, by: "marta", name: "move_deal", params: { deal: "Castorama", stage: "proposal", note: "asked for a discount" } });
  assert.ok(!done.isError, done.text); assert.match(done.text, /^ok: move_deal/); assert.match(done.text, /remembered m_[0-9a-f]{12} in pipeline/); assert.match(done.text, /Now in attio: Move the deal to the given stage in Attio\./);
  const m = lib.effectiveMemories(lib.readMemories(root, "pipeline")).find(x => /Moved Castorama to proposal/.test(x.content));
  assert.ok(m, "the memory is in pipeline"); assert.deepEqual(m.actions, [{ tool: "attio", action: "move deal", ref: "Castorama" }]); assert.deepEqual(m.people, ["Castorama"]); assert.deepEqual(m.tools, ["attio"]); assert.deepEqual(m.tags, ["deal-stage"]); assert.match(m.content, /Note: asked for a discount/);
  const missing = await call("interact", { brain: root, by: "marta", name: "move_deal", params: { deal: "Castorama" } });
  assert.equal(missing.isError, true); assert.match(missing.text, /stage/);
  const unknown = await call("interact", { brain: root, by: "marta", name: "close_deal", params: {} });
  assert.equal(unknown.isError, true); assert.match(unknown.text, /refused: no interaction "close_deal" here; this company has: move_deal/);
  const own = await call("interact", { brain: root, by: "marta", name: "remember", params: {} });
  assert.equal(own.isError, true); assert.match(own.text, /remember is a tool of its own/);
  const where = await call("query", { brain: root, object: "status" }); assert.match(where.text, /This company's interactions: move_deal \(attio\)/);
});

test("a broken company file is reported in the catalog, and the rest of the server works", async () => {
  writeFileSync(join(root, "brain", "ontology.ossie.json"), "{ nope");
  const catalog = await call("list_objects", { brain: root }); assert.match(catalog.text, /this company's interactions could not be read/);
  const still = await call("list_contexts", { brain: root }); assert.ok(!still.isError);
  unlinkSync(join(root, "brain", "ontology.ossie.json"));
});

test("context tools expose purpose and boundaries through rule and refuse the retired scope field", async () => {
  const slug = "context-instructions", rule = "Keep launch work here. Pricing decisions belong in offer.";
  const created = await call("new_context", { brain: root, slug, title: "Launch work", rule });
  assert.ok(!created.isError, created.text);
  const { result: catalog } = await rpc("tools/list");
  for (const name of ["new_context", "edit_context"]) {
    const fields = catalog.tools.find(t => t.name === name).inputSchema.properties;
    assert.ok(fields.rule);
    assert.equal(Object.hasOwn(fields, "scope"), false);
  }
  const described = await call("describe_object", { brain: root, name: "contexts" });
  assert.doesNotMatch(described.text, /^- scope \(/m);
  const queried = await call("query", { brain: root, object: "contexts", filters: { slug } });
  assert.ok(!queried.isError, queried.text);
  const row = JSON.parse(queried.text.split("\n")[1]);
  assert.equal(row.rule, rule);
  assert.equal(Object.hasOwn(row, "scope"), false);
  assert.match((await call("list_contexts", { brain: root })).text, /Pricing decisions belong in offer/);
  const before = lib.readContext(root, slug);
  const rejected = await call("edit_context", { brain: root, slug, title: "Must not change", scope: "Different boundary" });
  assert.ok(rejected.isError, rejected.text);
  assert.equal(lib.readContext(root, slug).title, before.title);
  const edited = await call("edit_context", { brain: root, slug, rule: "Only launch logistics belong here." });
  assert.ok(!edited.isError, edited.text);
  assert.equal(lib.readContext(root, slug).rule, "Only launch logistics belong here.");
  assert.equal(lib.readContext(root, slug).now, before.now);
});

test("compile_apply accepts empty working guidance through MCP and rejects missing or invalid values without writes", async () => {
  const context = "empty-guidance";
  assert.ok(!(await call("new_context", { brain: root, slug: context, title: "Renewals", rule: "Use confirmed renewal terms." })).isError);
  assert.ok(!(await call("remember", { brain: root, by: "marta", context, content: "Confirm the renewal owner." })).isError);
  const before = lib.readContext(root, context), original = readFileSync(before.path, "utf8");
  const facts = await call("compile_facts", { brain: root, context });
  const args = { brain: root, context, by: "marta", as_of: facts.text.match(/^as_of: (\S+)/m)[1], summary: "A renewal needs an owner. Confirm the renewal owner." };
  for (const extra of [{}, { now: null }, { now: false }]) assert.ok((await call("compile_apply", { ...args, ...extra })).isError);
  assert.equal(readFileSync(before.path, "utf8"), original);
  const done = await call("compile_apply", { ...args, now: "" });
  assert.ok(!done.isError, done.text);
  const c = lib.readContext(root, context);
  assert.equal(c.now, "");
  assert.equal(c.rule, before.rule);
  assert.deepEqual(c.memories, before.memories);
  assert.match(c.summary, /Confirm the renewal owner/);
  assert.equal(c.stale, false);
});

test("RESERVED_TOOLS is the live catalog, so no company interaction can shadow a tool", async () => {
  const { result } = await rpc("tools/list");
  // the question tools are listed only to a client that can show forms; this test client cannot
  const hidden = ["onboarding_question", "configuration_question", "question", "compile_facts", "compile_apply", "compile_entity", "entity_facts", "recall", "who_is", "list_contexts", "list_projects", "list_brains", "customer_overview", "meeting_overview", "advise", "where_we_are", "guideline"];
  assert.deepEqual([...lib.RESERVED_TOOLS].sort(), [...new Set([...result.tools.map(t => t.name), ...hidden])].sort());
});

test("propose_interaction writes the proposal after validating it, and refuses a bad one with the reasons", async () => {
  const good = await call("propose_interaction", { brain: root, interaction: { name: "send_proposal", title: "Sending a proposal", tool: "gmail", operation: "Send the proposal email from the template.", description: "A proposal goes out.", input_schema: { type: "object", properties: { deal: { type: "string" } }, required: ["deal"], additionalProperties: false }, record: { context: "pipeline", kind: "note", companies: ["deal"], people: [], content: "Sent the proposal to {deal}.", action: "gmail:send proposal:{deal}", tags: [] } } });
  assert.ok(!good.isError, good.text); assert.match(good.text, /proposed: send_proposal \(gmail\)/); assert.ok(existsSync(join(root, "work", "interaction.proposed.json")));
  const bad = await call("propose_interaction", { brain: root, interaction: { name: "remember", tool: "", operation: "", record: {} } });
  assert.equal(bad.isError, true); assert.match(bad.text, /tool of its own/); assert.match(bad.text, /tool is needed/);
  unlinkSync(join(root, "work", "interaction.proposed.json"));
});

test("project reaches the five tools that take it, is validated, and remember tags through the server", async () => {
  execFileSync(process.execPath, [`${P}/skills/gtm-os-project/project.mjs`, ".", "--link", mkdtempSync(join(tmpdir(), "gtm-os-srv-proj-")), "--slug", "seo", "--contexts", "icp"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_OPEN: "1" } });
  const bad = await rpc("tools/call", { name: "load_context", arguments: { brain: root, contexts: ["icp"], project: "nope" } });
  assert.match(bad.result.content[0].text, /no project nope; projects: seo/); assert.equal(bad.result.isError, true);
  const w = await rpc("tools/call", { name: "where_we_are", arguments: { brain: root, project: "seo" } });
  assert.match(w.result.content[0].text, /Loaded in this project \(seo\): icp/);
  const r = await rpc("tools/call", { name: "remember", arguments: { brain: root, by: "marta", project: "seo", memories: [{ content: "Keyword list drafted." }] } });
  assert.match(r.result.content[0].text, /in icp/);
  assert.ok(lib.readMemories(root, "icp").pop().tags.includes("project:seo"));
});

test("MCP capture preserves direct links through memory storage and the rendered dashboard", async () => {
  const gmail="https://mail.google.com/mail/u/2/#all/returned-id";
  const attio="https://app.attio.com/workspace/record/returned-id?fields=name,email#details";
  const r=await call("remember",{brain:root,by:"marta",context:"icp",content:"Direct source capture verified.",sources:[`gmail:${gmail}`,`attio:${attio}`,"https://example.com/original?part=a,b#section"]});
  assert.ok(!r.isError,r.text);
  const memory=lib.readMemories(root,"icp").find(m=>m.content==="Direct source capture verified.");
  const expected=[{kind:"gmail",ref:gmail},{kind:"attio",ref:attio},{kind:"url",ref:"https://example.com/original?part=a,b#section"}];
  assert.deepEqual(memory.source.filter(s=>s.kind!=="codex"),expected);
  await call("render_dashboard", { brain: root });
  const data=JSON.parse(readFileSync(join(root,"work/home/data.json"),"utf8"));
  assert.deepEqual(data.contexts.find(c=>c.slug==="icp").memories.find(m=>m.id===memory.id).source.filter(s=>s.kind!=="codex"),expected);
  const before=lib.readMemories(root,"icp").length;
  const bad=await call("remember",{brain:root,by:"marta",memories:[{context:"icp",content:"Must not be partially saved.",sources:[`gmail:${gmail}`]},{context:"icp",content:"Malformed source.",sources:["gmail:"]}]});
  assert.equal(bad.isError,true);assert.match(bad.text,/nothing remembered/);assert.equal(lib.readMemories(root,"icp").length,before);
});

test("entity lifecycle tools validate input, preview and apply reversible changes through MCP", async () => {
  const brain = mkdtempSync(join(tmpdir(), "gtm-entity-lifecycle-mcp-"));
  mkdirSync(join(brain, "brain"));
  writeFileSync(join(brain, "brain/admin.md"), lib.renderFrontmatter({ company: "Fixture", team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  lib.writeContext(brain, "sales", { title: "Sales" });
  const source = lib.addName(brain, "Chris"), target = lib.addName(brain, "Krzysztof Pawlak");
  const invoke = async (name, args) => {
    const r = await call(name, { brain, ...args }); assert.ok(!r.isError, r.text);
    return JSON.parse(r.text.slice(r.text.indexOf("{")));
  };
  const { result: catalog } = await rpc("tools/list");
  for (const name of ["update_entity", "merge_entities", "archive_entity", "undo_entity_merge"]) {
    assert.ok(catalog.tools.some(t => t.name === name)); assert.ok(lib.RESERVED_TOOLS.has(name));
  }
  assert.ok((await call("update_entity", { brain, entity: target.id, by: "ann", set: { id: source.id } })).isError);
  assert.ok((await call("update_entity", { brain, entity: target.id, by: "ann", add: { emails: "invalid" } })).isError);
  assert.ok((await call("archive_entity", { brain, entity: target.id, by: "ann", undo: "false" })).isError);
  const updated = await invoke("update_entity", { entity: target.id, by: "ann", set: { name: "Christopher Pawlak", subtype: null }, add: { aliases: ["KP"] } });
  assert.equal(updated.entity.name, "Christopher Pawlak");
  const args = { source: source.id, target: target.id }, p = await invoke("merge_entities", args);
  assert.equal(p.status, "preview"); assert.equal(lib.resolveEntity(lib.readNames(brain), source.id).id, source.id);
  assert.ok((await call("merge_entities", { brain, ...args, as_of: p.as_of })).isError, "apply needs a team author");
  const merged = await invoke("merge_entities", { ...args, as_of: p.as_of, by: "ann" });
  assert.equal(merged.status, "merged"); assert.equal(lib.resolveEntity(lib.readNames(brain), source.id).id, target.id);
  const u = await invoke("undo_entity_merge", { merge_id: merged.merge_id }); assert.deepEqual(u.conflicts, []);
  assert.equal((await invoke("undo_entity_merge", { merge_id: merged.merge_id, as_of: u.as_of, by: "ann" })).status, "unmerged");
  assert.equal(lib.resolveEntity(lib.readNames(brain), source.id).id, source.id);
  assert.equal((await invoke("archive_entity", { entity: source.id, by: "ann" })).status, "archived");
  const found = await call("query", { brain, object: "entities", filters: { status: "archived" } }); assert.match(found.text, /Chris/);
  assert.equal((await invoke("archive_entity", { entity: source.id, by: "ann", undo: true })).status, "active");
});

test("a GTM OS run (GTM_OS_RUN set) is offered the compile tools that a chat is not (ALL-204 step 1)", async t => {
  const child = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, GTM_OS_NO_OPEN: "1", GTM_OS_RUN: "background" } });
  t.after(() => child.kill());
  const pending = new Map(); let seq = 0;
  createInterface({ input: child.stdout }).on("line", line => { const m = JSON.parse(line); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const ask = (method, params) => new Promise(resolve => { const id = ++seq; pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  await ask("initialize", { capabilities: {} });
  const names = (await ask("tools/list", {})).result.tools.map(x => x.name);
  for (const n of ["compile_facts", "compile_apply", "compile_entity", "entity_facts"]) assert.ok(names.includes(n), `${n} is offered to the run`);
  assert.equal((await ask("tools/list", {})).result.tools.find(t => t.name === "compile_apply").title, "Writing the summary");
});

test("remember echoes the note it wrote, in quotes, and its schema is small enough to read (ALL-209, ALL-204 step 3)", async () => {
  const rem = await call("remember", { brain: root, by: "marta", context: "icp", content: "Castorama asked for a 60-day pilot; Krzysztof owns the follow-up.", people: ["Krzysztof Pawlak"] });
  assert.ok(!rem.isError, rem.text);
  assert.match(rem.text, /remembered m_[0-9a-f]{12} in icp · note · marta-nowak · people: Krzysztof Pawlak · "Castorama asked for a 60-day pilot; Krzysztof owns the follow-up\."/);
  assert.doesNotMatch(rem.text, /not recorded/, "a hint about unregistered names never reads as a failure");
  const { result } = await rpc("tools/list");
  const tool = result.tools.find(t => t.name === "remember");
  assert.ok(tool.description.length < 1000, `description is ${tool.description.length} chars (was 2637)`);
  assert.match(tool.description, /quot/i, "it tells the model to quote the note back");
  const bytes = JSON.stringify(tool.inputSchema).length;
  assert.ok(bytes < 17000, `schema is ${bytes} bytes (was 23729; the rest is enums and shapes the validator needs)`);
  const batch = tool.inputSchema.properties.memories.items.properties;
  assert.deepEqual(Object.keys(batch).sort(), Object.keys(tool.inputSchema.properties).filter(k => !["brain", "by", "project", "memories"].includes(k)).sort(), "the batch item keeps every field");
  assert.ok(Object.entries(batch).every(([k, v]) => !v.description || ["content", "sources"].includes(k)), "batch fields carry no repeated paragraphs");
  assert.match(tool.inputSchema.properties.memories.description, /same fields/i);
});

test("the skill tool creates, lists, and removes a person's own skill in the brain's .agents/skills", async () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-os-skill-mcp-")); execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, stdio: "ignore", env: { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_OPEN: "1" } });
  const tools = (await rpc("tools/list")).result.tools.map(t => t.name); assert.ok(tools.includes("skill"));
  const made = await call("skill", { brain: root, action: "create", title: "Circle event", description: "Create a Circle event from a meeting note.", body: "1. Ask for the date.", by: "marta-nowak" });
  assert.equal(made.isError, false); assert.match(made.text, /created gtm-os-circle-event/);
  const listed = await call("skill", { brain: root, action: "list" }); assert.match(listed.text, /gtm-os-circle-event/);
  const dup = await call("skill", { brain: root, action: "create", title: "todo", description: "x", body: "y" }); assert.equal(dup.isError, true); assert.match(dup.text, /shipped/);
  const gone = await call("skill", { brain: root, action: "remove", id: "gtm-os-circle-event" }); assert.equal(gone.isError, false);
  assert.equal(existsSync(join(root, ".agents", "skills", "gtm-os-circle-event")), false);
});

test("the document tool creates, lists, shows, updates and removes a document, query (status) names them, and guideline still answers hidden", async () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-os-doc-mcp-")); execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P, GTM_OS_NO_OPEN: "1" }, stdio: "ignore" });
  const tools = (await rpc("tools/list")).result.tools.map(t => t.name); assert.ok(tools.includes("document")); assert.ok(!tools.includes("guideline"));
  assert.match((await call("where_we_are", { brain: root })).text, /documents: Strategy \[draft\] \(strategy, planning\) -> strategy\.md/);
  const made = await call("document", { brain: root, action: "create", title: "Tone of voice", applies_to: ["Copy", "posts"], body: "Short sentences. No exclamation points.", folder: "brand", by: "marta-nowak" });
  assert.equal(made.isError, false, made.text); assert.match(made.text, /created document brand\/tone-of-voice\.md/);
  assert.match((await call("document", { brain: root, action: "list" })).text, /Tone of voice \[draft\] \(copy, posts\)/);
  assert.match((await call("document", { brain: root, action: "show", ref: "tone-of-voice" })).text, /No exclamation points/);
  const up = await call("document", { brain: root, action: "update", ref: "tone-of-voice", status: "approved" }); assert.equal(up.isError, false, up.text);
  assert.match((await call("where_we_are", { brain: root })).text, /documents: Tone of voice \[approved\] \(copy, posts\) -> brand\/tone-of-voice\.md/);
  assert.match((await call("guideline", { brain: root, action: "list" })).text, /Tone of voice \[approved\]/);
  const bad = await call("document", { brain: root, action: "create", title: "Design system", body: "x" }); assert.equal(bad.isError, true); assert.match(bad.text, /applies_to/);
  const gone = await call("document", { brain: root, action: "remove", ref: "tone-of-voice" }); assert.equal(gone.isError, false, gone.text);
  assert.equal(existsSync(join(root, "brand", "tone-of-voice.md")), false);
  const left = (await call("document", { brain: root, action: "list" })).text; assert.match(left, /Strategy \[draft\]/); assert.doesNotMatch(left, /Tone of voice/);
});

test("workflow: listed as a tool, lists the shipped workflows, refuses an unsettled start with the labels", async () => {
  const { result: catalog } = await rpc("tools/list");
  const tool = catalog.tools.find(t => t.name === "workflow");
  assert.ok(tool, "workflow is in tools/list"); assert.ok(lib.RESERVED_TOOLS.has("workflow"));
  assert.deepEqual(tool.inputSchema.properties.action.enum, ["list", "create", "start", "status", "advance", "skip", "abandon", "due"]);
  // the same bare brain the memory_index test builds: admin.md, one context, no git
  const brain = mkdtempSync(join(tmpdir(), "gtm-workflow-mcp-"));
  mkdirSync(join(brain, "brain")); mkdirSync(join(brain, "workflows"));
  writeFileSync(join(brain, "brain", "admin.md"), lib.renderFrontmatter({ company: "Workflow Fixture", team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  lib.writeContext(brain, "offer", { title: "Our offer" });
  writeFileSync(join(brain, "workflows", "outbound.md"), readFileSync(`${P}/templates/workflows/outbound.md`, "utf8").replace(/{{DATE}}/g, "2026-09-28").replace(/{{VERSION}}/g, "0.28.0"));
  const listed = await call("workflow", { brain, action: "list" });
  assert.ok(!listed.isError, listed.text); assert.match(listed.text, /- outbound: Outbound \[draft\], 4 steps/);
  const refused = await call("workflow", { brain, action: "start", slug: "outbound", context: "offer", handle: "Q4", settled: { Owner: "Ann" }, by: "ann" });
  assert.equal(refused.isError, true); assert.match(refused.text, /not settled: Target accounts, Why now, Sequencer/);
  const started = await call("workflow", { brain, action: "start", slug: "outbound", context: "offer", handle: "Q4", settled: { "Target accounts": "list A", "Why now": "budget season", Owner: "Ann", Sequencer: "lemlist" }, by: "ann" });
  assert.ok(!started.isError, started.text); assert.match(started.text, /^started outbound-\d{4}-\d{2}-\d{2}-q4 in Our offer: step 1 of 4, Build the target list, due now/);
});

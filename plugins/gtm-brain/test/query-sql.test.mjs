process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
process.env.GTM_BRAIN_NO_COMMIT = "1";
// One read tool (ALL-204 step 2a): query gains views for the derived reads and a read-only SQL mode
// over the memory index, with the dashboard's visibility rules baked into the views.
process.env.GTM_BRAIN_NO_HOOK_CHECK = "1"; // the hooks-off check talks to a real Codex; hooks-notice.test covers it with a fake one
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const lib = await import(`${P}/lib/brain.mjs`);
const { withMemoryIndex } = await import(`${P}/lib/memory-index.mjs`);
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-profile-"));

function brain() {
  const root = mkdtempSync(join(tmpdir(), "gtm-sql-"));
  mkdirSync(join(root, "brain"));
  writeFileSync(join(root, "brain", "admin.md"), lib.renderFrontmatter({ company: "Quasar", owner: "ann", dashboard: "on-demand", tools: [], team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }) + "\n# Quasar\n");
  lib.writeContext(root, "sales", { title: "Sales", rule: "Deals.", summary: "Nothing yet.", now: "" });
  lib.writeContext(root, "market", { title: "Market", rule: "Competitors.", summary: "Nothing yet.", now: "" });
  lib.addName(root, "Castorama", { kind: "organization", subtype: "company" });
  lib.addName(root, "Artur Ziętara", { emails: ["artur@fixture.test"] });
  const a = lib.appendMemory(root, "sales", { authors: ["ann"], content: "Castorama asked for a 60-day pilot.", people: ["Castorama"], tools: ["attio"] }).rec;
  lib.appendMemory(root, "sales", { authors: ["ann"], content: "Pricing is per store.", kind: "decision" });
  const wrong = lib.appendMemory(root, "market", { authors: ["ann"], content: "Two competitors offer returns automation.", tools: ["web"] }).rec;
  lib.appendMemory(root, "market", { authors: ["ann"], content: "Withdrawn: the competitor claim was wrong.", retracts: wrong.id });
  return { root, a, wrong };
}
const sql = (root, text, opts) => withMemoryIndex(root, index => index.sql(text, opts));

test("sql: a read-only SELECT over memories sees only visible records; members, contexts, entities and keywords join on ids", () => {
  const { root, a, wrong } = brain();
  const counts = sql(root, "SELECT context, count(*) AS n FROM memories GROUP BY context ORDER BY context");
  assert.deepEqual(counts.rows, [["market", 0], ["sales", 2]].map(([context, n]) => ({ context, n })).filter(r => r.n), "the retracted note and its retraction are both out of sight");
  assert.deepEqual(counts.columns, ["context", "n"]);
  assert.ok(!sql(root, "SELECT id FROM memories").rows.some(r => r.id === wrong.id));
  const people = sql(root, "SELECT m.id, v.value FROM memories m JOIN members v ON v.memory_id = m.id WHERE v.field = 'people'");
  assert.deepEqual(people.rows, [{ id: a.id, value: "Castorama" }]);
  assert.deepEqual(sql(root, "SELECT slug, title FROM contexts ORDER BY slug").rows, [{ slug: "market", title: "Market" }, { slug: "sales", title: "Sales" }]);
  const entities = sql(root, "SELECT name, kind FROM entities ORDER BY name").rows;
  assert.ok(entities.some(e => e.name === "Castorama" && e.kind === "organization") && entities.some(e => e.name === "Artur Ziętara"));
  const hit = sql(root, "SELECT m.id FROM memories m JOIN keywords k ON k.rowid = m.rowid WHERE keywords MATCH 'Castorama'");
  assert.deepEqual(hit.rows.map(r => r.id), [a.id]);
  assert.match(sql(root, "SELECT content FROM memories WHERE kind = 'decision'").rows[0].content, /per store/);
});

test("sql: anything but one SELECT is refused with the reason, and results are capped", () => {
  const { root } = brain();
  for (const [text, why] of [["DELETE FROM memories", /read-only|SELECT/], ["SELECT 1; SELECT 2", /one statement/], ["PRAGMA user_version", /SELECT/], ["ATTACH 'x' AS y", /SELECT/], ["UPDATE memories SET kind='x'", /read-only|SELECT/]]) {
    assert.throws(() => sql(root, text), why, text);
  }
  assert.deepEqual(sql(root, "SELECT count(*) AS n FROM main.memories").rows, sql(root, "SELECT count(*) AS n FROM main.memories").rows, "a qualified table name still reads");
  const capped = sql(root, "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 1000) SELECT n FROM seq", { limit: 5 });
  assert.equal(capped.rows.length, 5); assert.equal(capped.truncated, true);
  assert.equal(sql(root, "SELECT n FROM (SELECT 1 AS n)").truncated, false);
});

const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, GTM_BRAIN_NO_OPEN: "1" } });
const pending = new Map(); let seq = 0;
createInterface({ input: server.stdout }).on("line", line => { const m = JSON.parse(line); const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); } });
const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: args }); return { text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };
after(() => server.kill());

test("query is the one read tool: sql and views on the schema, rows as a table, the derived reads by object name", async () => {
  const { root, a } = brain();
  await rpc("initialize", { capabilities: {} });
  const { result } = await rpc("tools/list");
  const query = result.tools.find(t => t.name === "query");
  assert.ok(query.inputSchema.properties.sql, "query takes sql");
  for (const view of ["projects", "brains", "customers", "meetings", "health", "status"]) assert.ok(query.inputSchema.properties.object.enum.includes(view), `${view} is an object of query`);
  assert.deepEqual(query.inputSchema.required, [], "object or sql");
  const rows = await call("query", { brain: root, sql: "SELECT context, count(*) AS n FROM memories GROUP BY context ORDER BY context" });
  assert.ok(!rows.isError, rows.text); assert.match(rows.text, /context \| n/); assert.match(rows.text, /sales \| 2/);
  const refused = await call("query", { brain: root, sql: "DELETE FROM memories" }); assert.ok(refused.isError); assert.match(refused.text, /SELECT/);
  const neither = await call("query", { brain: root }); assert.ok(neither.isError); assert.match(neither.text, /object or sql/);
  const status = await call("query", { brain: root, object: "status" }); assert.ok(!status.isError, status.text); assert.match(status.text, /Loaded in this chat/);
  const health = await call("query", { brain: root, object: "health" }); assert.ok(!health.isError, health.text);
  const projects = await call("query", { brain: root, object: "projects" }); assert.ok(!projects.isError, projects.text);
  const who = await call("query", { brain: root, object: "entities", search: "Zientara" }); assert.ok(!who.isError, who.text);
  assert.equal(JSON.parse(who.text).status, "candidates", "an entity search resolves like who_is: ranked, typo tolerant");
  const plain = await call("query", { brain: root, object: "memories", filters: { context: "sales" } }); assert.ok(!plain.isError); assert.match(plain.text, new RegExp(a.id));
  const described = await call("describe_object", { brain: root, name: "memories" }); assert.match(described.text, /SQL view memories:/); assert.match(described.text, /rowid, id, context, kind, at/);
  const view = await call("describe_object", { brain: root, name: "status" }); assert.ok(!view.isError); assert.match(view.text, /loaded/i);
  const objects = await call("list_objects", { brain: root }); assert.match(objects.text, /Views \(query object\): projects, brains, customers, meetings, health, status/); assert.match(objects.text, /query with sql/);
});

test("2b: the ten read tools leave the chat's catalog, still answer as deprecated, and query covers each of them", async () => {
  const { root } = brain();
  const { result } = await rpc("tools/list");
  const names = result.tools.map(t => t.name);
  for (const n of ["recall", "who_is", "entity_facts", "list_contexts", "list_projects", "list_brains", "customer_overview", "meeting_overview", "advise", "where_we_are"]) assert.ok(!names.includes(n), `${n} is not offered to a chat`);
  assert.ok(names.includes("query") && names.includes("describe_object") && names.includes("list_objects"));
  const old = await call("recall", { brain: root, query: "Castorama" });
  assert.ok(!old.isError, old.text); assert.match(old.text, /^deprecated: use query/); assert.match(old.text, /60-day pilot/, "an old rules file still gets its answer");
  const brief = await call("query", { brain: root, object: "brief", search: "Castorama" });
  assert.ok(!brief.isError, brief.text); assert.match(brief.text, /Castorama/); assert.doesNotMatch(brief.text, /^deprecated/);
  const contexts = await call("query", { brain: root, object: "contexts" }); assert.match(contexts.text, /sales/);
  const ranked = await call("query", { brain: root, object: "entities", search: "Zientara", candidates: [{ id: "1", name: "Artur Ziętara", emails: ["artur@fixture.test"], reference: { kind: "hubspot/work", ref: "https://crm.fixture.test/1" } }] });
  assert.ok(!ranked.isError, ranked.text); assert.equal(JSON.parse(ranked.text).scope, "supplied source candidates only");
  const described = await call("describe_object", { brain: root, name: "brief" }); assert.ok(!described.isError); assert.match(described.text, /brief/);
});

test("deal: the MEDDPICC rubric and every memory about the company with its ID; deal_scoring: off turns it off", async () => {
  const { root } = brain();
  const deal = await call("query", { brain: root, object: "deal", search: "Castorama" });
  assert.ok(!deal.isError, deal.text);
  assert.match(deal.text, /^deal: Castorama \(e_[0-9a-f]+\) · \d+ memories, newest \d{4}-\d\d-\d\d/m);
  for (const element of ["Metrics", "Economic buyer", "Decision criteria", "Decision process", "Paper process", "Identify pain", "Champion", "Competition"]) assert.match(deal.text, new RegExp(`\\*\\*${element}\\*\\*`));
  assert.match(deal.text, /^\[m_[0-9a-f]+\] \d{4}-\d\d-\d\d · \w+ · \w+ · .*60-day pilot/m, "each memory carries the ID to cite");
  assert.doesNotMatch(deal.text, /Turning it off/, "the switch is for the person, not the score");
  assert.ok((await call("query", { brain: root, object: "deal" })).isError, "deal needs the company");
  assert.match((await call("describe_object", { brain: root, name: "deal" })).text, /MEDDPICC/);
  const admin = join(root, "brain", "admin.md");
  writeFileSync(admin, readFileSync(admin, "utf8").replace(/^dashboard: .*$/m, m => `${m}\ndeal_scoring: off`));
  const off = await call("query", { brain: root, object: "deal", search: "Castorama" });
  assert.match(off.text, /^Deal scoring is off in this brain/); assert.doesNotMatch(off.text, /60-day pilot/);
});

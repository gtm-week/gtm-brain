// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// Relation to us (lib/relation-to-us.mjs) and the indexed entity filters of query entities.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as lib from "../lib/brain.mjs";
import { relationsToUs } from "../lib/relation-to-us.mjs";
import { withMemoryIndex, MemoryIndex } from "../lib/memory-index.mjs";
import { createFilesBackend } from "../server/files-backend.mjs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
process.env.GTM_BRAIN_NO_COMMIT = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
process.env.GTM_BRAIN_NO_WATCH = "1";

const at = "2026-11-10T09:00:00.000Z", user = [{ kind: "user", ref: "ann" }];
function brain() {
  const root = mkdtempSync(join(tmpdir(), "gtm-relation-"));
  mkdirSync(join(root, "brain"));
  writeFileSync(join(root, "brain/admin.md"), lib.renderFrontmatter({ company: "Fixture", team: [{ name: "Ann Lee", handle: "ann", email: "ann@fixture.test" }] }));
  writeFileSync(join(root, "SCHEMA.md"), readFileSync(new URL("../templates/SCHEMA.md", import.meta.url), "utf8"));
  lib.writeContext(root, "sales", { title: "Sales" });
  lib.startKindLayout(root);
  const add = (name, kind = "person", subtype = null) => lib.addName(root, name, { kind, ...(subtype ? { subtype } : {}) });
  const e = { acme: add("Acme", "organization", "company"), globex: add("Globex", "organization", "company"), agency: add("Pixel Agency", "organization", "partner"), fund: add("Seed Fund", "organization", "investor"), other: add("Initech", "organization", "company"), us: add("Fixture", "organization", "company"),
    max: add("Max Jendral"), eva: add("Eva Nowak"), tom: add("Tom Kowal"), zoe: add("Zoe Brand"), ola: add("Ola Lis") };
  const rel = (from, type, to, status = "current", content = `${from} ${type} ${to}.`) => lib.appendMemory(root, "sales", { authors: ["ann"], content, source: user, relation: { from, type, to, status, basis: "user", observed_at: at } }).rec;
  const customer = (entity, status) => lib.appendMemory(root, "sales", { authors: ["ann"], content: `${entity} is a ${status}.`, source: user, customer: { entity, status, basis: "user", observed_at: at } }).rec;
  customer("Acme", "customer"); customer("Globex", "prospect");
  rel("Pixel Agency", "partner_of", "us"); rel("Seed Fund", "investor_in", "us");
  rel("Max Jendral", "works_at", "Acme"); rel("Eva Nowak", "works_at", "Globex"); rel("Zoe Brand", "works_at", "Fixture");
  rel("Ola Lis", "works_at", "Initech");
  rel("Tom Kowal", "works_at", "Acme"); rel("Tom Kowal", "works_at", "Acme", "ended", "Tom Kowal left Acme.");
  return { root, e };
}

test("relation to us comes from the team, customer status, partner_of, investor_in and the employer", () => {
  const { root, e } = brain();
  const read = withMemoryIndex(root, index => index.relationsToUs());
  const name = id => Object.keys(e).find(k => e[k].id === id);
  const got = Object.fromEntries([...read].filter(([id]) => name(id)).map(([id, r]) => [name(id), r]));
  assert.deepEqual(got, { acme: "customer", globex: "prospect", agency: "partner", fund: "investor", other: "other", us: "team",
    max: "customer", eva: "prospect", tom: "other", zoe: "team", ola: "other" });
  const ann = lib.readNames(root).find(n => n.name === "Ann Lee");
  assert.equal(read.get(ann.id), "team", "the admin.md team");
  // the pure function says the same as the index
  const notes = lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories)).filter(m => m.relation || m.customer);
  const direct = relationsToUs({ registry: lib.readNames(root), memories: notes, admin: lib.readAdmin(root) });
  for (const [id, r] of read) assert.equal(direct.get(id), r, id);
});

test("a withdrawn or demo note does not make a customer", () => {
  const registry = [{ id: "e_0000000000000001", name: "Acme", kind: "organization", aliases: [], emails: [] }];
  const note = (id, extra) => ({ id, at, content: "x", ...extra, customer: { entity: "e_0000000000000001", status: "customer", basis: "user", observed_at: at } });
  assert.equal(relationsToUs({ registry, memories: [note("m_000001", { tags: ["demo"] })] }).get("e_0000000000000001"), "other");
  assert.equal(relationsToUs({ registry, memories: [note("m_000002", { retracts: "m_000001" })] }).get("e_0000000000000001"), "other");
  assert.equal(relationsToUs({ registry, memories: [note("m_000003", {})] }).get("e_0000000000000001"), "customer");
});

test("query entities filters on kind, subtype, relation_to_us and a compiled SCHEMA.md field from the index", () => {
  const { root, e } = brain();
  // compile Max's role onto his page, citing his note
  const m = lib.appendMemory(root, "sales", { authors: ["ann"], people: ["Max Jendral"], content: "Max Jendral is VP Sales EMEA at Acme." }).rec;
  const facts = lib.entityFacts(root, e.max.id);
  const cites = facts.evidence.map(x => x.id);
  lib.compileEntity(root, e.max.id, { as_of: facts.as_of, by: "ann", brief: { overview: [{ text: "VP Sales EMEA at Acme.", memories: [m.id] }], relationships: [],
    contexts: [{ context: "sales", summary: [{ text: "Works at Acme.", memories: cites }], open_threads: [] }], fields: [{ field: "role", text: "VP Sales EMEA", memories: [m.id] }] } });
  const b = createFilesBackend({ run() { throw new Error("read only"); } }), ctx = { brain: root };
  const names = filters => b.list("entities", { filters, limit: 50 }, ctx).map(r => r.name).sort();
  assert.deepEqual(names({ kind: "person", relation_to_us: "customer" }), ["Max Jendral"]);
  assert.deepEqual(names({ kind: "person", relation_to_us: "customer", role: "VP Sales" }), ["Max Jendral"]);
  assert.deepEqual(names({ kind: "person", role: "cfo" }), []);
  assert.deepEqual(names({ kind: "organization", subtype: "company", relation_to_us: ["customer", "prospect"] }), ["Acme", "Globex"]);
  assert.deepEqual(names({ relation_to_us: "partner" }), ["Pixel Agency"]);
  const row = b.list("entities", { filters: { id: e.max.id, kind: "person" } }, ctx)[0];
  assert.equal(row.short_id, e.max.id.slice(2, 8));
  assert.equal(row.fields.role, "VP Sales EMEA");
  assert.match(row.path, /^brain\/entities\/people\/max-jendral-/);
  const full = b.list("entities", { filters: { id: e.max.id } }, ctx)[0];
  assert.deepEqual([full.relation_to_us, full.fields.role, full.contexts], ["customer", "VP Sales EMEA", ["sales"]], "a lookup by id keeps the full row, with the same values");
  // no page is opened for a filter: the rows come from the index
  const index = new MemoryIndex(root); try { index.sync(); assert.ok(index.db.prepare("SELECT count(*) AS n FROM entity_rows").get().n >= 11); } finally { index.close(); }
  // SQL sees the same columns
  const sql = withMemoryIndex(root, index => index.sql("SELECT name, relation_to_us FROM entities WHERE kind='person' AND relation_to_us='prospect'"));
  assert.deepEqual(sql.rows.map(r => r.name), ["Eva Nowak"]);
  // the kind index shows the relation
  assert.match(readFileSync(join(root, "brain/entities/people/index.md"), "utf8"), /\[Max Jendral\][^\n]*· VP Sales EMEA at Acme\. · customer · /);
});

test("the MCP query accepts relation_to_us, short_id and the brain's SCHEMA.md fields as entity filters; an unknown name is still refused", async () => {
  const { root } = brain();
  const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "ignore"], env: { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1", GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_VERSION_CHECK: "1" } });
  const pending = new Map(); let seq = 0;
  createInterface({ input: server.stdout }).on("line", line => { const m = JSON.parse(line); pending.get(m.id)?.(m); pending.delete(m.id); });
  const call = args => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "query", arguments: { brain: root, object: "entities", limit: 50, ...args } } }) + "\n"); }).then(m => m.result);
  try {
    const customers = await call({ filters: { kind: "person", relation_to_us: "customer" } });
    assert.ok(!customers.isError && /Max Jendral/.test(customers.content[0].text), customers.content[0].text);
    const byRole = await call({ filters: { kind: "person", role: "cfo" } });
    assert.ok(!byRole.isError, byRole.content[0].text);
    const bogus = await call({ filters: { shoe_size: "42" } });
    assert.ok(bogus.isError && /has no field shoe_size/.test(bogus.content[0].text));
  } finally { server.kill(); }
});

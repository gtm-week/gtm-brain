// Relationships with history (GTM week sync, 2026-11-13): a typed relation block on a note, the type from
// SCHEMA.md, checked when written; "ended" is a new note; what the person said beats a source. Entity briefs
// show the fields SCHEMA.md lists, cited, and the required ones nobody said as gaps.
// Run: node --test plugins/gtm-brain/test/relations.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-relations-home-"));
process.env.GTM_BRAIN_NO_COMPILE = "1"; process.env.GTM_BRAIN_NO_WATCH = "1"; process.env.GTM_BRAIN_NO_OPEN = "1";
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" };
const lib = await import(`${P}/lib/brain.mjs`);
const { ruleFindings } = await import(`${P}/lib/rules-check.mjs`);

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-relations-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Demo Co", "--one-liner", "events", "--owner", "Marta Nowak <marta@demo.co>"], { cwd: root, env, stdio: "ignore" });
  lib.addName(root, "Anna Lee"); lib.addName(root, "Northwind", { kind: "company" }); lib.addName(root, "Tom Berg");
  return root;
}
const when = "2026-11-13T10:00:00Z";
const rel = (from, type, to, extra = {}) => ({ from, type, to, status: "current", basis: "user", observed_at: when, ...extra });
const note = (root, content, relation, extra = {}) => lib.appendMemory(root, "company", { authors: ["marta-nowak"], content, source: [{ kind: "user", ref: "marta" }], relation, ...extra }).rec;
const remember = (root, entries) => execFileSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, root, "--by", "marta", "--batch", (() => { const f = join(root, "work", "batch.json"); writeFileSync(f, JSON.stringify(entries)); return f; })()], { env, encoding: "utf8" });

test("a relation names both ends by stable ID and is evidence about both; the type and the kinds are checked at write", () => {
  const root = brain(), reg = lib.readNames(root), id = n => reg.find(e => e.name === n).id;
  const r = note(root, "Anna Lee is Head of Sales at Northwind.", rel("Anna Lee", "works_at", "Northwind"));
  assert.deepEqual([r.relation.from, r.relation.to], [id("Anna Lee"), id("Northwind")]);
  assert.ok(r.entities.includes(id("Anna Lee")) && r.entities.includes(id("Northwind")));
  assert.ok(lib.entityFacts(root, "Northwind").evidence.some(m => m.id === r.id));
  assert.equal(note(root, "Northwind refers clients to us.", rel("Northwind", "partner_of", "us")).relation.to, "us");
  assert.throws(() => note(root, "Anna owns a deal.", rel("Anna Lee", "owns_deal", "Northwind")), /owns_deal is not in SCHEMA\.md/);
  assert.throws(() => note(root, "Northwind works at Anna.", rel("Northwind", "works_at", "Anna Lee")), /works_at goes from person/);
  assert.throws(() => note(root, "Anna is a customer.", rel("Anna Lee", "customer_of", "us")), /remember\.customer/);
  assert.throws(() => note(root, "Anna works at Acme.", rel("Anna Lee", "works_at", "Acme")), /must resolve to registered entities/);
});

test("ended is a new note and the history stays; a source cannot replace what the person said", () => {
  const root = brain();
  const first = note(root, "Northwind is our referral partner.", rel("Northwind", "partner_of", "us", { observed_at: "2026-09-01T00:00:00Z" }));
  note(root, "Northwind is no longer our partner since 2026-10.", rel("Northwind", "partner_of", "us", { status: "ended" }));
  const [row] = lib.relationOverview(root).relations.filter(r => r.type === "partner_of");
  assert.equal(row.status, "ended"); assert.deepEqual(row.history.map(h => h.status), ["ended", "current"]);
  assert.throws(() => lib.appendMemory(root, "company", { authors: ["marta-nowak"], content: "CRM says partner.", source: [{ kind: "attio", ref: "rec_1" }], supersedes: first.id,
    relation: rel("Northwind", "partner_of", "us", { basis: "source" }) }), /cannot replace or withdraw a relationship the person confirmed/);
  lib.appendMemory(root, "company", { authors: ["marta-nowak"], content: "Attio lists Northwind as a partner.", source: [{ kind: "attio", ref: "rec_1" }], relation: rel("Northwind", "partner_of", "us", { basis: "source", observed_at: "2026-11-14T00:00:00Z" }) });
  const [again] = lib.relationOverview(root).relations.filter(r => r.type === "partner_of");
  assert.equal(again.status, "ended", "the person's word stays the state"); assert.equal(again.conflicts.length, 1);
});

test("a type removed from SCHEMA.md later keeps its notes valid and readable, marked", () => {
  const root = brain();
  note(root, "Tom Berg manages Anna Lee.", rel("Anna Lee", "reports_to", "Tom Berg"));
  const path = join(root, "SCHEMA.md");
  writeFileSync(path, readFileSync(path, "utf8").replace(/^\| reports_to .*\n/m, ""));
  assert.deepEqual(lib.validateMemoriesFile(join(root, "brain", "contexts", "company", "memories.jsonl"), "company"), []);
  const row = lib.relationOverview(root).relations.find(r => r.type === "reports_to");
  assert.equal(row.in_schema, false);
  assert.match(lib.relationsText(lib.relationOverview(root)), /Anna Lee reports_to Tom Berg: current.*\[type not in SCHEMA\.md\]/);
});

test("remember resolves the ends by the name rules, refuses an unknown type with the fix, and keeps a repeat once", () => {
  const root = brain();
  const entry = { context: "company", content: "Anna Lee reports to Tom Berg.", people: ["Anna Lee", "Tom Berg"], sources: ["user:marta"], relation: rel("Anna Lee", "reports_to", "Tom Berg") };
  assert.match(remember(root, [entry]), /remembered m_/);
  assert.match(remember(root, [entry]), /already recorded m_/);
  const out = (() => { try { return remember(root, [{ ...entry, content: "Anna owns the deal.", relation: rel("Anna Lee", "owns_deal", "Northwind") }]); } catch (e) { return String(e.stdout) + String(e.stderr); } })();
  assert.match(out, /owns_deal is not in SCHEMA\.md .*save it as a plain note and offer to add the type with \/gtm-brain-schema/);
  assert.equal(lib.relationOverview(root).relations.filter(r => r.type === "reports_to").length, 1);
});

test("a brief fills SCHEMA.md fields with citations, refuses one it does not list, and shows the required gap with its question", () => {
  const root = brain();
  const m = note(root, "Northwind sells logistics software.", undefined, { people: ["Northwind"] });
  let facts = lib.entityFacts(root, "Northwind");
  assert.deepEqual(facts.schema.fields.map(f => f.name), ["website", "industry", "size", "hq"]);
  assert.equal(facts.schema_behind, true);
  const brief = { overview: [{ text: "Northwind sells logistics software.", memories: [m.id] }], contexts: [{ context: "company", summary: [{ text: "Sells logistics software.", memories: [m.id] }], open_threads: [] }], relationships: [] };
  assert.throws(() => lib.compileEntity(root, "Northwind", { as_of: facts.as_of, by: "marta-nowak", brief: { ...brief, fields: [{ field: "budget", text: "x", memories: [m.id] }] } }), /budget is not a field of this organization/);
  lib.compileEntity(root, "Northwind", { as_of: facts.as_of, by: "marta-nowak", brief: { ...brief, fields: [{ field: "industry", text: "Logistics software", memories: [m.id] }] } });
  const saved = lib.readNames(root).find(e => e.name === "Northwind");
  assert.deepEqual(Object.keys(JSON.parse(saved._fm.compilation)), ["overview", "contexts", "relationships"], "older plugins still read the brief");
  facts = lib.entityFacts(root, "Northwind");
  assert.equal(facts.schema_behind, false); assert.equal(facts.previous_fields[0].field, "industry");
  const page = lib.entityBrief(root, "Northwind").markdown;
  assert.match(page, /## Fields\n\n- Website: not recorded\n- Industry: Logistics software \[company/);
  assert.match(page, /Gaps \(required in SCHEMA\.md\): website\. Ask: "What is Northwind's website\?"/);
  assert.deepEqual(ruleFindings(root).filter(f => f.rule === "SCHEMA.md").map(f => f.subject), ["Northwind"]);
  // a schema edit refills the brief without hiding it
  const path = join(root, "SCHEMA.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("| hq | City and country of the head office | no |", "| hq | City and country of the head office | no |\n| budget_owner | Who signs off spend | yes |"));
  assert.equal(lib.entityFacts(root, "Northwind").schema_behind, true);
  assert.ok(lib.staleEntities(root).some(e => e.name === "Northwind" && e.schema_behind));
  assert.match(lib.entityBrief(root, "Northwind").markdown, /## Overview\n\n- Northwind sells logistics software\./);
});

test("the brief's Relationships come from the relation and customer notes: current, then ended with dates", () => {
  const root = brain();
  note(root, "Anna Lee is Head of Sales at Northwind.", rel("Anna Lee", "works_at", "Northwind"));
  note(root, "Northwind was our partner.", rel("Northwind", "partner_of", "us", { status: "ended" }));
  lib.appendMemory(root, "company", { authors: ["marta-nowak"], content: "Northwind signed with us.", source: [{ kind: "user", ref: "marta" }], customer: { entity: "Northwind", status: "customer", basis: "user", observed_at: when } });
  const page = lib.entityBrief(root, "Northwind").markdown;
  assert.match(page, /## Relationships\n\n- Customer status: customer \(said by the person, observed 2026-11-13\)/);
  assert.match(page, /- Anna Lee works at Northwind \(current, said by the person, observed 2026-11-13\)/);
  assert.match(page, /Ended:\n\n- Northwind partner of us \(ended/);
  assert.ok(lib.relationOverview(root).relations.some(r => r.type === "customer_of" && r.customer_status === "customer"));
});

test("our own company has no schema fields or gaps; a field's text keeps no memory IDs; a relationship gap reads as a sentence to finish", () => {
  const root = brain();
  lib.addName(root, "Demo Co", { kind: "company" });
  const own = note(root, "Demo Co runs AI events.", undefined, { people: ["Demo Co"] });
  assert.equal(lib.entityFacts(root, "Demo Co").schema.ours, true);
  assert.ok(!lib.staleEntities(root).some(e => e.name === "Demo Co" && e.schema_behind));
  const m = note(root, "Northwind's site is northwind.com.", undefined, { people: ["Northwind"] });
  const facts = lib.entityFacts(root, "Northwind");
  const brief = { overview: [{ text: "Northwind's site is northwind.com.", memories: [m.id] }], contexts: [{ context: "company", summary: [{ text: "Site northwind.com.", memories: [m.id] }], open_threads: [] }], relationships: [] };
  lib.compileEntity(root, "Northwind", { as_of: facts.as_of, by: "marta-nowak", brief: { ...brief, fields: [{ field: "website", text: `northwind.com \\[${m.id}\\]`, memories: [m.id] }] } });
  assert.equal(lib.entityFacts(root, "Northwind").previous_fields[0].text, "northwind.com");
  const tom = note(root, "Tom Berg leads the pilot.", undefined, { people: ["Tom Berg"] });
  const tf = lib.entityFacts(root, "Tom Berg");
  lib.compileEntity(root, "Tom Berg", { as_of: tf.as_of, by: "marta-nowak", brief: { overview: [{ text: "Leads the pilot.", memories: [tom.id] }], contexts: [{ context: "company", summary: [{ text: "Leads the pilot.", memories: [tom.id] }], open_threads: [] }], relationships: [] } });
  assert.match(lib.entityBrief(root, "Tom Berg").markdown, /Ask: "What is Tom Berg's role\?" "Tom Berg works at \.\.\.\?"/);
  assert.ok(!ruleFindings(root).some(f => f.subject === "Demo Co"), "our company is never asked about");
  assert.ok(own.id);
});

// SCHEMA.md: what a brain keeps about each person, organization and product, and how they relate (GTM week
// sync, 2026-11-13). The person edits it; a broken one is reported with a fix per line and left as it is.
// Run: node --test plugins/gtm-brain/test/schema.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const T = join(P, "templates");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-schema-home-"));
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1", GTM_BRAIN_NO_WATCH: "1" };
delete env.GTM_BRAIN_NO_COMMIT; delete env.GTM_BRAIN_RUN;
const schema = await import(`${P}/lib/schema.mjs`);
const where = await import(`${P}/lib/where.mjs`);

function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-schema-")));
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Demo Co", "--one-liner", "events", "--owner", "Marta Nowak <marta@demo.co>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const start = root => execFileSync("bash", [`${P}/session/session-start.sh`], { cwd: root, env, encoding: "utf8", input: JSON.stringify({ session_id: "", cwd: root }) });
const sha = path => createHash("sha256").update(readFileSync(path)).digest("hex");

test("the shipped template parses: five kinds with fields, organization subtypes, relationship types and the built-in customer_of", () => {
  const s = schema.parseSchema(readFileSync(join(T, "SCHEMA.md"), "utf8"));
  assert.deepEqual(s.kinds.person.fields.map(f => `${f.name}${f.required ? "*" : ""}`), ["role*", "location", "linkedin", "how_we_met"]);
  assert.deepEqual(Object.keys(s.kinds.organization.subtypes), ["company", "team", "investor", "partner", "community"]);
  assert.deepEqual(schema.fieldsFor(s, "organization", "investor").map(f => f.name), ["website", "industry", "size", "hq", "stage"]);
  assert.deepEqual(schema.fieldsFor(s, "organization", "company").map(f => f.name), ["website", "industry", "size", "hq"]);
  assert.deepEqual(Object.keys(s.relations), ["works_at", "reports_to", "partner_of", "investor_in", "uses", "speaker_at", "attended", "integrates_with", "customer_of"]);
  assert.deepEqual(Object.keys(s.kinds), ["person", "organization", "product", "event", "tool"]);
  assert.deepEqual(s.relations.investor_in.to, ["organization", "us"]);
  assert.equal(s.relations.customer_of.built_in, true);
  assert.deepEqual(schema.requiredRelations(s, "person").map(r => r.type), ["works_at"]);
});

test("each problem has its line and a fix; a removed customer_of row still exists", () => {
  const bad = ["# Schema", "", "## Meeting", "", "| Field | What it means | Required |", "| --- | --- | --- |", "| date | When | yes |", "", "## Person", "",
    "| Field | What it means | Required |", "| --- | --- | --- |", "| Role | Job | yes |", "| team | Team | maybe |", "", "### intern", "", "## Relationships", "",
    "| Type | From | To | What it means | Required |", "| --- | --- | --- | --- | --- |", "| owns | person | deal | x | no |"].join("\n");
  const error = (() => { try { schema.parseSchema(bad); } catch (e) { return e; } })();
  assert.ok(error instanceof schema.SchemaFormatError);
  const at = n => error.problems.find(p => p.line === n);
  assert.match(at(3).problem, /"## Meeting" is not a kind/); assert.match(at(3).proposal, /meeting evidence stays in context memories/);
  assert.match(at(13).problem, /field "Role" must be lowercase/); assert.equal(at(13).proposal, "`role`");
  assert.match(at(14).problem, /Required of team must be yes or no/);
  assert.match(at(22).problem, /To of owns must be person, organization, product, event, tool or us \(not deal\)/);
  const without = readFileSync(join(T, "SCHEMA.md"), "utf8").replace(/^\| customer_of .*\n/m, "");
  assert.ok(schema.parseSchema(without).relations.customer_of.built_in);
});

test("a subtype under person is refused (it would break every entity read), and a renamed type keeps its old name", () => {
  const text = readFileSync(join(T, "SCHEMA.md"), "utf8");
  assert.throws(() => schema.parseSchema(text.replace("## Organization", "### intern\n\n| Field | What it means | Required |\n| --- | --- | --- |\n| school | x | no |\n\n## Organization")), /a subtype under person is not possible/);
  const renamed = schema.parseSchema(text.replace("| Type | From | To | What it means | Required |\n| --- | --- | --- | --- | --- |", "| Type | From | To | What it means | Required | Was called |\n| --- | --- | --- | --- | --- | --- |").replace("| partner_of | organization | us | A partner of ours: referrals, integrations, co-selling | no |", "| partnered_with | organization | us | A partner | no | partner_of |"));
  assert.equal(schema.relationType(renamed, "partner_of").type, "partnered_with");
  assert.throws(() => schema.checkRelation(renamed, { type: "owns", fromKind: "person", toKind: "organization" }), /not in SCHEMA.md/);
  assert.throws(() => schema.checkRelation(renamed, { type: "works_at", fromKind: "organization", toKind: "organization" }), /goes from person/);
  assert.throws(() => schema.checkRelation(renamed, { type: "customer_of", fromKind: "person", toKind: "us" }), /remember.customer/);
});

test("setup writes and commits SCHEMA.md; the chat start lists it; nothing calls it a file without a reason", () => {
  const root = brain();
  assert.equal(readFileSync(join(root, "SCHEMA.md"), "utf8"), readFileSync(join(T, "SCHEMA.md"), "utf8"));
  assert.equal(execFileSync("git", ["-C", root, "ls-files", "SCHEMA.md"], { encoding: "utf8" }).trim(), "SCHEMA.md");
  const out = start(root);
  assert.match(out, /^SCHEMA\.md says what the brain keeps/m);
  assert.match(out, /person: role\*, location, linkedin, how_we_met\. organization: website\*, industry\*, size, hq; subtypes company, team, investor \(\+stage\)/);
  assert.match(out, /works_at person>organization\*/);
  assert.ok(where.MANAGED("SCHEMA.md"));
});

test("an edited SCHEMA.md is never overwritten; a broken one is reported with its fix and left byte for byte", () => {
  const root = brain(), path = join(root, "SCHEMA.md");
  const mine = readFileSync(path, "utf8").replace("| hq | City and country of the head office | no |", "| hq | City and country of the head office | no |\n| budget_owner | Who signs off spend | yes |");
  writeFileSync(path, mine); start(root);
  assert.equal(readFileSync(path, "utf8"), mine);
  assert.match(start(root), /organization: website\*, industry\*, size, hq, budget_owner\*/);
  writeFileSync(path, mine.replace("| budget_owner | Who signs off spend | yes |", "| Budget Owner | Who signs off spend | sometimes |"));
  const before = sha(path), out = start(root);
  assert.match(out, /SCHEMA\.md cannot be read, and was left as it is: line \d+: field "Budget Owner" must be lowercase words joined by _; Proposed fix: `budget_owner`/);
  assert.equal(sha(path), before);
});

test("a brain without SCHEMA.md gets it at its next chat start, committed", () => {
  const root = brain();
  execFileSync("git", ["-C", root, "rm", "-q", "SCHEMA.md"]); execFileSync("git", ["-C", root, "commit", "-qm", "a brain from before 0.34"]);
  start(root);
  assert.equal(readFileSync(join(root, "SCHEMA.md"), "utf8"), readFileSync(join(T, "SCHEMA.md"), "utf8"));
  assert.equal(execFileSync("git", ["-C", root, "status", "--porcelain", "--", "SCHEMA.md"], { encoding: "utf8" }), "");
});

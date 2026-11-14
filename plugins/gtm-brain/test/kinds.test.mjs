// Entity kinds come from SCHEMA.md: every "## <Kind>" section with a field table is a kind, and person,
// organization, product, event and tool always exist. Meetings and projects are not kinds.
// Run: node --test plugins/gtm-brain/test/kinds.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const schema = await import(`${P}/lib/schema.mjs`);
const entities = await import(`${P}/lib/entities.mjs`);
const template = readFileSync(join(P, "templates", "SCHEMA.md"), "utf8");
const problems = text => { try { schema.parseSchema(text); } catch (e) { return e.problems; } return []; };

test("the template ships event and tool with their fields and the three new link types", () => {
  const s = schema.parseSchema(template);
  assert.deepEqual(schema.fieldsFor(s, "event").map(f => `${f.name}${f.required ? "*" : ""}`), ["date*", "location", "url"]);
  assert.deepEqual(schema.fieldsFor(s, "tool").map(f => `${f.name}${f.required ? "*" : ""}`), ["category*", "vendor", "connector", "state", "owner", "cost"]);
  assert.deepEqual(s.relations.speaker_at.from, ["person"]); assert.deepEqual(s.relations.speaker_at.to, ["event"]);
  assert.deepEqual(s.relations.attended.to, ["event"]);
  assert.deepEqual(s.relations.integrates_with.from, ["tool"]); assert.deepEqual(s.relations.integrates_with.to, ["tool"]);
  assert.equal(schema.checkRelation(s, { type: "speaker_at", fromKind: "person", toKind: "event" }).type, "speaker_at");
  assert.throws(() => schema.checkRelation(s, { type: "integrates_with", fromKind: "tool", toKind: "person" }), /goes to tool/);
});

test("a new ## section with a field table is a kind, and relationships may point at it wherever it is in the file", () => {
  const text = template.replace("## Relationships", "## Venue\n\n| Field | What it means | Required |\n| --- | --- | --- |\n| capacity | Seats | no |\n\n## Relationships")
    .replace("| integrates_with |", "| held_at | event | venue | Takes place there | no |\n| integrates_with |");
  const s = schema.parseSchema(text);
  assert.deepEqual(Object.keys(s.kinds), ["person", "organization", "product", "event", "tool", "venue"]);
  assert.deepEqual(s.relations.held_at.to, ["venue"]);
  // relationships listed before the kind section still resolve
  const early = "## Relationships\n\n| Type | From | To | What it means | Required |\n| --- | --- | --- | --- | --- |\n| held_at | event | venue | x | no |\n\n## Venue\n\n| Field | What it means | Required |\n| --- | --- | --- |\n| capacity | Seats | no |\n";
  assert.deepEqual(schema.parseSchema(early).relations.held_at.to, ["venue"]);
});

test("the five defaults exist even when the file leaves their sections out; prose tables stay prose", () => {
  const s = schema.parseSchema("# Schema\n\n## Notes\n\n| Who | What |\n| --- | --- |\n| me | x |\n");
  assert.deepEqual(Object.keys(s.kinds), schema.DEFAULT_KINDS);
  assert.deepEqual(entities.ENTITY_KINDS, ["person", "organization", "product", "event", "tool"]);
});

test("reserved and malformed kind names are refused with a fix; meetings and projects are not kinds", () => {
  const section = name => `# Schema\n\n## ${name}\n\n| Field | What it means | Required |\n| --- | --- | --- |\n| date | When | yes |\n`;
  for (const [name, fix] of [["Meeting", /context memories/], ["Projects", /project:<slug> tag/], ["Company", /organization subtype/], ["Team", /organization subtype/], ["Us", /our own company/]]) {
    const p = problems(section(name));
    assert.equal(p.length, 1, name); assert.equal(p[0].line, 3); assert.match(p[0].problem, new RegExp(`"## ${name}" is not a kind`)); assert.match(p[0].proposal, fix);
  }
  const p = problems(section("Trade Show"));
  assert.match(p[0].problem, /kind "Trade Show" must be one lowercase word/); assert.equal(p[0].proposal, "## trade_show");
  assert.match(problems(section("Tool") + "\n### saas\n\n| Field | What it means | Required |\n| --- | --- | --- |\n| seats | x | no |\n")[0].problem, /a subtype under tool is not possible/);
  const rel = problems("## Relationships\n\n| Type | From | To | What it means | Required |\n| --- | --- | --- | --- | --- |\n| owns | deal | us | x | no |\n");
  assert.match(rel[0].problem, /From of owns must be person, organization, product, event or tool \(not deal\)/); assert.match(rel[0].proposal, /add a ## deal section/);
});

test("entityType checks a kind against the brain's list; 'any' only normalizes", () => {
  assert.deepEqual(entities.entityType("event"), { kind: "event", subtype: null });
  assert.deepEqual(entities.entityType("tool"), { kind: "tool", subtype: null });
  assert.throws(() => entities.entityType("venue"), /kind must be one of person, organization, product, event, tool/);
  assert.deepEqual(entities.entityType("venue", null, [...schema.DEFAULT_KINDS, "venue"]), { kind: "venue", subtype: null });
  assert.deepEqual(entities.entityType("venue", null, "any"), { kind: "venue", subtype: null });
  assert.throws(() => entities.entityType("meeting", null, "any"), /kind must be one of/);
  assert.throws(() => entities.entityType("tool", "saas"), /subtype must be an organization category/);
  assert.deepEqual(entities.entityType("company"), { kind: "organization", subtype: "company" });
  assert.deepEqual(schema.brainKinds(null), schema.DEFAULT_KINDS);
});

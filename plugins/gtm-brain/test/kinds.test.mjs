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
  for (const [name, fix] of [["Products", /the kind is product: name the section ## Product/], ["People", /## Person/], ["Tools", /## Tool/], ["Companies", /organization subtype/]]) {
    const q = problems(section(name));
    assert.equal(q.length, 1, name); assert.match(q[0].problem, new RegExp(`"## ${name}" is not a kind`)); assert.match(q[0].proposal, fix);
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

test("end to end on a setup brain: add_name with event and tool, speaker_at and integrates_with saved, a SCHEMA.md kind accepted", async () => {
  const { mkdtempSync, realpathSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { execFileSync } = await import("node:child_process");
  process.env.GTM_BRAIN_NO_COMPILE = "1"; process.env.GTM_BRAIN_NO_WATCH = "1"; process.env.GTM_BRAIN_NO_OPEN = "1"; process.env.GTM_BRAIN_NO_COMMIT = "1";
  process.env.CODEX_HOME ||= mkdtempSync(join(tmpdir(), "gtm-kinds-home-"));
  const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" };
  const lib = await import(`${P}/lib/brain.mjs`);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-kinds-")));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Demo Co", "--one-liner", "events", "--owner", "Marta Nowak <marta@demo.co>"], { cwd: root, env, stdio: "ignore" });
  lib.addName(root, "Anna Lee"); lib.addName(root, "SaaStr Europa", { kind: "event" }); lib.addName(root, "HubSpot", { kind: "tool" }); lib.addName(root, "Attio", { kind: "tool" });
  const reg = lib.readNames(root), kind = n => reg.find(e => e.name === n).kind;
  assert.deepEqual([kind("SaaStr Europa"), kind("HubSpot")], ["event", "tool"]);
  const rel = (from, type, to) => ({ from, type, to, status: "current", basis: "user", observed_at: "2026-11-13T10:00:00Z" });
  const note = (content, relation) => lib.appendMemory(root, "company", { authors: ["marta-nowak"], content, source: [{ kind: "user", ref: "marta" }], relation }).rec;
  assert.ok(note("Anna Lee speaks at SaaStr Europa.", rel("Anna Lee", "speaker_at", "SaaStr Europa")).entities.length >= 2);
  note("HubSpot syncs with Attio.", rel("HubSpot", "integrates_with", "Attio"));
  assert.throws(() => note("Anna integrates with HubSpot.", rel("Anna Lee", "integrates_with", "HubSpot")), /integrates_with goes from tool/);
  assert.throws(() => lib.addName(root, "Hotel Bristol", { kind: "venue" }), /kind must be one of/);
  const path = join(root, "SCHEMA.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("## Relationships", "## Venue\n\n| Field | What it means | Required |\n| --- | --- | --- |\n| capacity | Seats | no |\n\n## Relationships"));
  lib.addName(root, "Hotel Bristol", { kind: "venue" });
  assert.equal(lib.readNames(root).find(e => e.name === "Hotel Bristol").kind, "venue");
  assert.ok(schema.schemaLine(root).includes("event: date*, location, url. tool: category*"));
});

test("the MCP input schemas of add_name, update_entity and merge_entities accept event, tool and a SCHEMA.md kind", async () => {
  const { validateValue } = await import(`${P}/lib/ontology/validation.mjs`);
  const text = readFileSync(join(P, "ontology", "gtm-brain.ossie.json"), "utf8"), found = {};
  (function walk(v) {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    if (["add_name", "update_entity", "merge_entities"].includes(v.tool_name) && v.input_schema) found[v.tool_name] = v.input_schema;
    Object.values(v).forEach(walk);
  })(JSON.parse(text));
  assert.deepEqual(Object.keys(found).sort(), ["add_name", "merge_entities", "update_entity"]);
  for (const kind of ["event", "tool", "venue", "person"]) {
    assert.equal(validateValue(found.add_name, { name: "SaaStr Europa", kind }), null, `add_name ${kind}`);
    assert.equal(validateValue(found.update_entity.properties.set, { kind }), null, `update_entity ${kind}`);
    assert.equal(validateValue(found.merge_entities.properties.resolution, { kind }), null, `merge_entities ${kind}`);
  }
  assert.ok(!/"enum": \[\s*"person",\s*"organization",\s*"product"/.test(text), "no three-kind enum is left in the ontology");
});

test("the entities script adds and lists an event, a tool and a SCHEMA.md kind; a broken SCHEMA.md does not break reading them", async () => {
  const { mkdtempSync, realpathSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { execFileSync } = await import("node:child_process");
  process.env.GTM_BRAIN_NO_COMPILE = "1"; process.env.GTM_BRAIN_NO_WATCH = "1"; process.env.GTM_BRAIN_NO_OPEN = "1"; process.env.GTM_BRAIN_NO_COMMIT = "1";
  process.env.CODEX_HOME ||= mkdtempSync(join(tmpdir(), "gtm-kinds-home-"));
  const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" };
  const lib = await import(`${P}/lib/brain.mjs`);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-kinds-")));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Demo Co", "--one-liner", "events", "--owner", "Marta Nowak <marta@demo.co>"], { cwd: root, env, stdio: "ignore" });
  const script = (...args) => execFileSync(process.execPath, [`${P}/scripts/gtm-brain-entities/entities.mjs`, root, ...args], { cwd: root, env, encoding: "utf8" });
  script("--add", "SaaStr Europa", "--kind", "event"); script("--add", "HubSpot", "--kind", "tool");
  const path = join(root, "SCHEMA.md"), good = readFileSync(path, "utf8").replace("## Relationships", "## Venue\n\n| Field | What it means | Required |\n| --- | --- | --- |\n| capacity | Seats | no |\n\n## Relationships");
  writeFileSync(path, good);
  script("--add", "Hotel Bristol", "--kind", "venue");
  const list = script();
  assert.match(list, /Events \(1\)\n- SaaStr Europa/); assert.match(list, /Tools \(1\)\n- HubSpot/); assert.match(list, /Venues \(1\)\n- Hotel Bristol/);
  // the file stops parsing: the venue already registered still reads, a new unknown kind is still refused
  writeFileSync(path, good + "\n## Meeting\n\n| Field | What it means | Required |\n| --- | --- | --- |\n| date | When | yes |\n");
  assert.ok(schema.readSchema(root).error);
  assert.equal(lib.readNames(root).find(e => e.name === "Hotel Bristol").kind, "venue");
  assert.throws(() => lib.addName(root, "Old Mill", { kind: "barn" }), /kind must be one of person, organization, product, event, tool;/);
  // the section is removed from a file that parses: the entity file is reported with the fix
  writeFileSync(path, good.replace(/## Venue[\s\S]*?(?=## Relationships)/, ""));
  assert.throws(() => lib.readNames(root), /add a ## venue section to SCHEMA.md/);
});

// A refused tool call names the whole small object it expected, so the model fixes it in one more call, not one
// field per call. Demo loops 2026-11-15 (o6-status): remember.meeting.participants took five refusals, one field each
// ("must be object", "needs role", "entity is not allowed", "role must be one of ...").
// Run: node --test plugins/gtm-brain/test/schema-errors.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateValue } from "../lib/ontology/validation.mjs";

const participant = { type: "object", properties: { name: { type: "string" }, role: { type: "string", enum: ["attended", "invited", "mentioned"] }, email: { type: "string" } }, required: ["name", "role"], additionalProperties: false };
const schema = { type: "object", properties: { meeting: { type: "object", properties: { participants: { type: "array", items: participant } } } } };
const shape = "{name, role: attended|invited|mentioned, email?}";

test("a wrong nested object names the shape it expected, in one refusal", () => {
  for (const value of ["Lea Hoffmann", { name: "Lea Hoffmann" }, { name: "Lea Hoffmann", role: "attended", entity: "e_1" }]) {
    const error = validateValue(schema, { meeting: { participants: [value] } }, "remember");
    assert.ok(error.includes(shape), `${error}`);
  }
  assert.match(validateValue(schema, { meeting: { participants: ["Lea"] } }, "remember"), /^remember\.meeting\.participants\[0\] must be object/);
  assert.equal(validateValue(schema, { meeting: { participants: [{ name: "Lea", role: "attended" }] } }), null);
});

test("a wide object is not spelt out, and a plain type error stays one line", () => {
  const wide = { type: "object", properties: Object.fromEntries("abcdefghijklmn".split("").map(k => [k, { type: "string" }])), required: ["a"] };
  assert.equal(validateValue(wide, {}, "x"), "x needs a");
  assert.equal(validateValue({ type: "string" }, 3, "x"), "x must be string");
});

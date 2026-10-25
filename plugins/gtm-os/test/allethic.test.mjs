process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadOntology, buildTools } from "../lib/ontology/index.mjs";

test("model retains batch, name confirmation and stable tool names without duplicate objects", async () => {
  const model = await loadOntology(new URL("../ontology/gtm-os.ossie.json", import.meta.url).pathname);
  assert.deepEqual(model.datasets.map(d => d.name), ["contexts", "memories", "entities"]);
  let calls = 0;
  const remember = buildTools(model, { act: () => { calls++; return { outcome: "ok", result: "kept" }; } }).find(t => t.name === "remember");
  const valid = await remember.call({ by: "marta", memories: [{ content: "A new person", new_names: ["Chris"] }] });
  assert.ok(!valid.isError); assert.equal(calls, 1);
  const invalid = await remember.call({ by: "marta", memories: [{ content: "First" }, { content: "Bad", new_names: [42] }] });
  assert.equal(invalid.isError, true); assert.equal(calls, 1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const script = "scripts/sync-derived.mjs";
const ontology = "plugins/gtm-os/ontology/gtm-os.ossie.json";
const policy = "plugins/gtm-os/policies/questions.md";
const documents = ["AGENTS.md", "INSTALL.md", "plugins/gtm-os/templates/AGENTS.md"];
const run = (root, ...args) => spawnSync(process.execPath, [join(root, script), ...args], { encoding: "utf8" });
const memoryProperties = model => model.custom_extensions.find(e => e.vendor_name === "ALLETHIC")
  .data.actions.find(action => action.tool_name === "remember").input_schema.properties;

test("shared policies and memory fields are current in every generated surface", () => {
  const result = run(repo, "--check");
  assert.equal(result.status, 0, result.stderr);
});

test("source edits flag drift without writing, then update every copy and remove stale batch fields", t => {
  const root = mkdtempSync(join(tmpdir(), "gtm-derived-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = [script, ontology, policy, "plugins/gtm-os/policies/computer-use.md", ...documents,
    "plugins/gtm-os/lib/host.mjs", "plugins/gtm-os/.codex-plugin/plugin.json", "plugins/gtm-os/hooks.json"];
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(repo, file), join(root, file));
  }
  const read = file => readFileSync(join(root, file), "utf8");
  const before = Object.fromEntries(documents.map(file => [file, read(file)]));
  writeFileSync(join(root, policy), read(policy) + "\nA synthetic policy addition.\n");
  const model = JSON.parse(read(ontology)), props = memoryProperties(model);
  props.synthetic_field = { type: "string", minLength: 2 };
  delete props.tags;
  writeFileSync(join(root, ontology), JSON.stringify(model, null, 2) + "\n");
  const source = read(ontology);
  const stale = run(root, "--check");
  assert.equal(stale.status, 1, stale.stderr);
  for (const file of [...documents, ontology]) assert.ok(stale.stderr.includes(file), file);
  for (const file of documents) assert.equal(read(file), before[file], "checking must not write");
  assert.equal(read(ontology), source);

  const updated = run(root);
  assert.equal(updated.status, 0, updated.stderr);
  for (const file of documents) assert.ok(read(file).includes("A synthetic policy addition."), file);
  const generated = memoryProperties(JSON.parse(read(ontology))).memories.items.properties;
  assert.deepEqual(generated.synthetic_field, props.synthetic_field);
  for (const name of ["tags", "by", "project", "memories"]) assert.ok(!(name in generated), name);
  const after = Object.fromEntries(files.map(file => [file, read(file)]));
  assert.equal(run(root, "--check").status, 0);
  assert.equal(run(root).status, 0);
  for (const file of files) assert.equal(read(file), after[file], "generation must be idempotent");
});

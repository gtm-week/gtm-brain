// Keep self-contained instructions and the static MCP schema aligned with their sources.
// Run from any directory: node /path/to/repo/scripts/sync-derived.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const check = process.argv.includes("--check");
if (process.argv.slice(2).some(arg => arg !== "--check")) throw new Error("Usage: sync-derived.mjs [--check]");
const read = path => readFileSync(new URL(path, root), "utf8");
const outputs = new Map();

for (const path of ["AGENTS.md", "INSTALL.md", "plugins/gtm-os/templates/AGENTS.md",
  "plugins/gtm-os/skills/gtm-os-start/references/questions.md"]) {
  let text = read(path);
  for (const name of ["questions", "computer-use"]) {
    const start = `<!-- generated: ${name}; edit plugins/gtm-os/policies/${name}.md -->`;
    const end = `<!-- /generated: ${name} -->`;
    if (text.split(start).length !== 2 || text.split(end).length !== 2)
      throw new Error(`Missing or repeated ${name} markers in ${path}`);
    const from = text.indexOf(start) + start.length, to = text.indexOf(end);
    if (to < from) throw new Error(`Reversed ${name} markers in ${path}`);
    text = text.slice(0, from) + "\n" + read(`plugins/gtm-os/policies/${name}.md`).trimEnd() + "\n" + text.slice(to);
  }
  outputs.set(path, text);
}

// The single-memory fields are authoritative. Only by/project belong to the whole call;
// memories is the batch envelope. Copy all other fields, including future additions.
const ontologyPath = "plugins/gtm-os/ontology/gtm-os.ossie.json";
const ontology = JSON.parse(read(ontologyPath));
const remember = ontology.custom_extensions.find(e => e.vendor_name === "ALLETHIC")
  .data.actions.find(action => action.tool_name === "remember");
const properties = remember.input_schema.properties;
// The batch entry repeats the fields, not their paragraphs: content and sources keep a line, the rest
// keep type and shape (ALL-204 step 3). Nested descriptions go too; the references carry them.
const slim = (schema, keep) => { const { description, ...rest } = schema; const out = keep ? { ...schema } : rest;
  if (out.properties) out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, slim(v, false)]));
  if (out.items && typeof out.items === "object") out.items = slim(out.items, false);
  return out; };
properties.memories.items.properties = Object.fromEntries(Object.entries(properties)
  .filter(([name]) => !["by", "project", "memories"].includes(name)).map(([name, schema]) => [name, slim(schema, ["content", "sources"].includes(name))]));
outputs.set(ontologyPath, JSON.stringify(ontology, null, 2) + "\n");

// Prepare every output before writing, so a missing marker cannot leave a partial refresh.
const stale = [...outputs].filter(([path, text]) => read(path) !== text);
if (check) {
  for (const [path] of stale) console.error(`Out of date: ${path}`);
  if (stale.length) {
    console.error("Run node scripts/sync-derived.mjs, then review the diff.");
    process.exitCode = 1;
  }
} else {
  for (const [path, text] of stale) {
    writeFileSync(new URL(path, root), text);
    console.log(`Updated ${fileURLToPath(new URL(path, root))}`);
  }
}

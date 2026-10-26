// Keep self-contained instructions and the static MCP schema aligned with their sources.
// Run from any directory: node /path/to/repo/scripts/sync-derived.mjs [--check]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = new URL("../", import.meta.url);
const check = process.argv.includes("--check");
if (process.argv.slice(2).some(arg => arg !== "--check")) throw new Error("Usage: sync-derived.mjs [--check]");
const read = path => readFileSync(new URL(path, root), "utf8");
const outputs = new Map();

// The question reference (gtm-brain-start/references/questions.md) no longer carries the blocks: every chat already
// holds them through the brain's AGENTS.md and the session line, so the reference keeps only the tool details.
for (const path of ["AGENTS.md", "INSTALL.md", "plugins/gtm-brain/templates/AGENTS.md"]) {
  let text = read(path);
  for (const name of ["questions", "computer-use"]) {
    const start = `<!-- generated: ${name}; edit plugins/gtm-brain/policies/${name}.md -->`;
    const end = `<!-- /generated: ${name} -->`;
    if (text.split(start).length !== 2 || text.split(end).length !== 2)
      throw new Error(`Missing or repeated ${name} markers in ${path}`);
    const from = text.indexOf(start) + start.length, to = text.indexOf(end);
    if (to < from) throw new Error(`Reversed ${name} markers in ${path}`);
    text = text.slice(0, from) + "\n" + read(`plugins/gtm-brain/policies/${name}.md`).trimEnd() + "\n" + text.slice(to);
  }
  outputs.set(path, text);
}

// The single-memory fields are authoritative. Only by/project belong to the whole call;
// memories is the batch envelope. Copy all other fields, including future additions.
const ontologyPath = "plugins/gtm-brain/ontology/gtm-brain.ossie.json";
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

// Claude Code installs the same plugin folder. Its declarations come from the Codex ones, which stay
// byte for byte as they are: old updaters check .mcp.json, and Codex hook trust is a hash of hooks.json.
// GTM_BRAIN_HOST=claude in every Claude declaration is how lib/host.mjs knows where it runs.
const { CLAUDE_TOOLS } = await import(new URL("plugins/gtm-brain/lib/host.mjs", root));
const json = value => JSON.stringify(value, null, 2) + "\n";
const codexManifest = JSON.parse(read("plugins/gtm-brain/.codex-plugin/plugin.json"));
const { name, version, description, author, license, keywords } = codexManifest;
// The version lives in plugin.json only (the docs: never in both). The app shows displayName; Claude Code has no logo field (validate rejects one).
const { displayName } = codexManifest.interface, category = codexManifest.interface.category.toLowerCase();
outputs.set("plugins/gtm-brain/.claude-plugin/plugin.json", json({ name, displayName, version, description, author, license, keywords,
  hooks: "./hooks/claude-hooks.json",
  // Same name as the root .mcp.json entry, which Claude Code also reads: this one replaces it.
  mcpServers: { gtm_brain: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/server/server.mjs"], env: { GTM_BRAIN_HOST: "claude" } } } }));
outputs.set(".claude-plugin/marketplace.json", json({ name: "gtm-brain", owner: author, description,
  plugins: [{ name, displayName, source: "./plugins/gtm-brain", description, category }] }));
const codexHooks = JSON.parse(read("plugins/gtm-brain/hooks.json"));
const claudeMatcher = { PreToolUse: [...CLAUDE_TOOLS.edit, ...CLAUDE_TOOLS.shell].join("|"), SessionStart: "startup|resume|clear|compact" };
outputs.set("plugins/gtm-brain/hooks/claude-hooks.json", json({ description: codexHooks.description,
  hooks: Object.fromEntries(Object.entries(codexHooks.hooks).map(([event, groups]) => [event, groups.map(g => ({
    matcher: claudeMatcher[event] || g.matcher,
    hooks: g.hooks.map(({ statusMessage, ...h }) => {
      if (!h.command.startsWith('bash "${PLUGIN_ROOT}/')) throw new Error(`hooks.json ${event}: unexpected command ${h.command}`);
      return { ...h, command: h.command.replace('bash "${PLUGIN_ROOT}/', 'GTM_BRAIN_HOST=claude PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}" bash "${CLAUDE_PLUGIN_ROOT}/') };
    }) }))])) }));

// Prepare every output before writing, so a missing marker cannot leave a partial refresh.
const current = path => { try { return read(path); } catch { return null; } };
const stale = [...outputs].filter(([path, text]) => current(path) !== text);
if (check) {
  for (const [path] of stale) console.error(`Out of date: ${path}`);
  if (stale.length) {
    console.error("Run node scripts/sync-derived.mjs, then review the diff.");
    process.exitCode = 1;
  }
} else {
  for (const [path, text] of stale) {
    mkdirSync(dirname(fileURLToPath(new URL(path, root))), { recursive: true });
    writeFileSync(new URL(path, root), text);
    console.log(`Updated ${fileURLToPath(new URL(path, root))}`);
  }
}

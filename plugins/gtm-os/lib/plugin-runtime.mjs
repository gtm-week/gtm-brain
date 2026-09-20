// Read-only release smoke check. No brain is opened and no tool is called.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export function pluginVersion(root) {
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(root, ".codex-plugin/plugin.json"), "utf8")); }
  catch { throw new Error("The GTM OS plugin manifest is missing or unreadable."); }
  if (manifest.name !== "gtm-os" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error("The plugin manifest must identify a versioned GTM OS release.");
  }
  return manifest.version;
}

export function olderVersion(candidate, installed) {
  if (!/^\d+\.\d+\.\d+$/.test(installed || "")) return false;
  const before = installed.split(".").map(Number), after = candidate.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (after[i] !== before[i]) return after[i] < before[i];
  return false;
}

export function verifyRuntime(root, expectedVersion) {
  const version = pluginVersion(root);
  if (expectedVersion && version !== expectedVersion) throw new Error("The installed files do not match the expected plugin version.");
  let config;
  try { config = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8")).mcpServers?.gtm_os; }
  catch { throw new Error("The GTM OS connector declaration is missing or unreadable."); }
  if (config?.command !== "node" || config.cwd !== "./" || config.enabled === false ||
      JSON.stringify(config.args) !== JSON.stringify(["./server/server.mjs"])) {
    throw new Error("The GTM OS connector declaration does not match its supported startup command.");
  }
  const input = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "gtm-os-update-check", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ].map(message => JSON.stringify(message) + "\n").join("");
  let messages;
  try {
    const output = execFileSync(process.execPath, config.args, { cwd: root, input,
      encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    messages = output.trim().split("\n").map(line => JSON.parse(line));
  } catch {
    // Startup errors can contain private paths or credentials. Keep child output out of reports.
    throw new Error("The GTM OS connector could not start and return its tool catalog.");
  }
  const hello = messages.find(m => m.id === 1), catalog = messages.find(m => m.id === 2);
  const tools = catalog?.result?.tools;
  if (hello?.error || catalog?.error || hello?.result?.serverInfo?.name !== "gtm-os" ||
      hello.result.serverInfo.version !== version || !Array.isArray(tools) ||
      ["update_plugin", "upgrade_brain", "check_environment", "setup_brain", "remember", "query"].some(name => !tools.some(t => t.name === name))) {
    throw new Error("The GTM OS connector returned an incompatible version or incomplete tool catalog.");
  }
  return { version, tools: tools.length };
}

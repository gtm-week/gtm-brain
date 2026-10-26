#!/usr/bin/env node
// Codex runs a plugin's hooks only after the person has reviewed them: config.toml keeps one
// trusted_hash per hook, and `codex plugin add` writes none. Until that entry exists the hooks
// are installed and enabled but never fire, so a fresh install has no session refresh and no
// write gate. This reads the live hook list from the Codex app-server and writes the missing
// trust into the same config key the app's own review writes.
//
//   node trust-hooks.mjs [folder]            report one line per hook
//   node trust-hooks.mjs [folder] --trust    approve what is untrusted or changed
//
// The hash covers the declaration in hooks.json (command, matcher, timeout, status message),
// not the script body and not the installed path: trust survives a version bump and a refreshed
// checkout, and only a change to hooks.json asks for review again. That is also its limit, and
// the reason the trust step belongs to the person's install: it pins what runs, not what it does.
import { spawn } from "node:child_process";

export const PLUGIN_ID = "gtm-brain@gtm-brain";
const STALE = new Set(["untrusted", "modified"]); // a hook in either state does not run

// One app-server conversation: initialize, ask, optionally write, exit.
async function appServer(calls, timeout = 30000) {
  const child = spawn("codex", ["app-server"], { stdio: ["pipe", "pipe", "ignore"] });
  const pending = new Map();
  let next = 1, buffer = "", failure = null;
  const call = (method, params) => new Promise((resolve, reject) => {
    if (failure) return reject(failure);
    const id = next++;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
  const stop = error => { failure ||= error; for (const { reject } of pending.values()) reject(error); pending.clear(); };
  child.on("error", () => stop(new Error("Codex is not on the PATH.")));
  child.stdin.on("error", () => {}); // a server that exits early closes the pipe; the exit handler says so
  child.on("exit", () => stop(new Error("The Codex app-server stopped before answering.")));
  child.stdout.on("data", chunk => {
    buffer += chunk;
    for (let i; (i = buffer.indexOf("\n")) >= 0; ) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      const waiting = message.id != null && pending.get(message.id);
      if (!waiting) continue;
      pending.delete(message.id);
      if (message.error) waiting.reject(new Error(message.error.message || "the app-server refused the request"));
      else waiting.resolve(message.result);
    }
  });
  const timer = setTimeout(() => stop(new Error("The Codex app-server did not answer in time.")), timeout);
  try {
    await call("initialize", { clientInfo: { name: "gtm-brain", version: "1" } });
    return await calls(call);
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}

// Report, and when trust is asked for, approve every hook of this plugin that does not run yet.
// Returns one entry per hook: { event, status, approved }. Managed hooks are left alone.
export async function hookTrust({ trust = false, cwd = process.cwd(), pluginId = PLUGIN_ID } = {}) {
  return appServer(async call => {
    const listed = await call("hooks/list", { cwds: [cwd] });
    const hooks = (listed?.data || []).flatMap(entry => entry.hooks || []).filter(hook => hook.pluginId === pluginId);
    const stale = hooks.filter(hook => STALE.has(hook.trustStatus));
    if (trust && stale.length) {
      await call("config/batchWrite", {
        edits: stale.map(hook => ({ keyPath: `hooks.state."${hook.key}".trusted_hash`, value: hook.currentHash, mergeStrategy: "upsert" })),
        reloadUserConfig: true,
      });
    }
    return hooks.map(hook => ({
      event: hook.eventName,
      status: trust && stale.includes(hook) ? "trusted" : hook.trustStatus,
      approved: trust && stale.includes(hook),
      enabled: hook.enabled,
    }));
  });
}

// One line for a caller that reports to a person: what the safety locks are doing now.
export function trustSummary(hooks) {
  if (!hooks.length) return "Safety locks: no GTM Brain hooks found; the plugin is not installed in this Codex.";
  const approved = hooks.filter(hook => hook.approved).length;
  const waiting = hooks.filter(hook => STALE.has(hook.status) || !hook.enabled).length;
  if (waiting) return `Safety locks: ${waiting} of ${hooks.length} not running yet; they need a review in Codex.`;
  return approved ? `Safety locks: on (${approved} approved just now).` : "Safety locks: on.";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const cwd = args[0] && !args[0].startsWith("--") ? args.shift() : process.cwd();
  const trust = args.includes("--trust");
  if (args.some(arg => arg !== "--trust")) {
    console.error("usage: trust-hooks.mjs [folder] [--trust]");
    process.exit(1);
  }
  try {
    const hooks = await hookTrust({ trust, cwd });
    for (const hook of hooks) console.log(`${hook.event}: ${hook.approved ? "trusted now" : hook.status}${hook.enabled ? "" : " (disabled)"}`);
    console.log(trustSummary(hooks));
  } catch (error) {
    console.error(`Could not read the hook trust from Codex: ${error.message}`);
    process.exit(1);
  }
}

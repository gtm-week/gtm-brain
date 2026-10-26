#!/usr/bin/env node
/* The assistant app GTM Brain runs in: Codex or Claude Code. Everything that differs between the two
   lives here, so no other file branches on the host. The host is GTM_BRAIN_HOST, set only by the
   Claude declarations that scripts/sync-derived.mjs generates (hooks and MCP server); unset is Codex,
   so the Codex install needs nothing new. Children inherit it: operation scripts, background runs.
   Shell hooks ask through the CLI at the bottom:
     node host.mjs gate-input < hook.json        kind, foreign home, its deny reason, then the text to check
     node host.mjs mcp-server <server>           the connector a tool id belongs to (gtm_brain for our own)
     node host.mjs text <key> [args...]          one host-specific line, empty when the host has none
     node host.mjs can <compile|update-check>    exit 0 when this machine can
     node host.mjs rulebook <dir>                exit 0 when the host loads <dir>/AGENTS.md by itself
   Depends on nothing in lib/, so lib/brain.mjs can import it. */
import { existsSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Existing schedules and host configurations keep working after the product rename.
// An explicitly supplied new setting wins; this changes only the child process environment.
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("GTM_OS_") && process.env[key.replace("GTM_OS_", "GTM_BRAIN_")] === undefined)
    process.env[key.replace("GTM_OS_", "GTM_BRAIN_")] = value;
}

export const HOSTS = ["codex", "claude"];
/* A memory names the chat it came from as {kind: <host>, ref: <chat id>}. Before 0.30 every chat was
   "codex". via stays "codex" for a chat on either host: older versions reject any other value. */
export const CHAT_KINDS = HOSTS;
export const isChatSource = s => !!s && CHAT_KINDS.includes(s.kind);
/* Each host's own home folder in a project: the other host's is off limits to the gate. */
export const HOST_DIRS = [".codex", ".claude"];
/* Claude Code's tool names, by what the gate does with them. The generated hooks match exactly these. */
export const CLAUDE_TOOLS = { edit: ["Write", "Edit", "MultiEdit", "NotebookEdit"], shell: ["Bash"] };

export function hostId(env = process.env) {
  const id = env.GTM_BRAIN_HOST || env.GTM_OS_HOST || "codex";
  if (!HOSTS.includes(id)) throw new Error(`GTM_BRAIN_HOST must be ${HOSTS.join(" or ")}, not ${id}`);
  return id;
}
const cli = (cmd, args) => JSON.parse(execFileSync(cmd, args, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 4 * 1024 * 1024 }));
const onPath = cmd => (process.env.PATH || "").split(delimiter).some(d => d && existsSync(join(d, cmd)));

const ADAPTERS = {
  codex: {
    // The Codex app always has its own runner: unchanged from before hosts existed.
    compiles: () => true,
    newChatLink: (path, prompt) => `codex://threads/new?path=${encodeURIComponent(path)}&prompt=${encodeURIComponent(prompt)}`,
    updateCheck: () => onPath("codex"),
    // Codex 0.164+ switches a plugin's hooks off whenever its files change, until they are approved again.
    hookCheck: () => onPath("codex"),
    // Where GTM Brain is installed from and which version is installed, as the host's plugin manager reports it.
    plugin: {
      home: () => process.env.CODEX_HOME || join(homedir(), ".codex"),
      installed: () => cli("codex", ["plugin", "list", "--marketplace", "gtm-brain", "--json"]).installed?.find(p => p.pluginId === "gtm-brain@gtm-brain" && p.installed)?.version || null,
      marketplace: () => {
        const s = cli("codex", ["plugin", "marketplace", "list", "--json"]).marketplaces?.find(x => x.name === "gtm-brain")?.marketplaceSource;
        return s ? { type: s.sourceType, source: s.source || s.url || s.repo || null, ref: s.ref || s.branch || null } : null;
      },
      updateScript: "update.mjs",
    },
    rulebookLoaded: dir => existsSync(join(dir, "AGENTS.md")),
    foreign: { dir: ".claude", reason: "Files under .claude belong to Claude and are off limits, reads included. To import what Claude knows, have Claude read IMPORT.md from the GTM Brain repository (or run the plugin gtm-brain-export skill with claude -p); it writes ~/.gtm-brain/handoff.md, and the gtm-brain-start skill reads that." },
    texts: {
      dashboardAlways: url => `Dashboard: ${url} (saved view in the Codex pane; open only when asked using open_in_codex, never as a prerequisite to answering; no login or Chrome needed).`,
      dashboardOnDemand: url => `Dashboard: ${url} (this brain opens it on demand in the Codex pane; only when someone asks; admin.md dashboard: on-demand).`,
      dashboardOpened: url => `Dashboard: ${url}  Open it in the in-app browser using open_in_codex with target {type: "browser", url: this exact address}, reusing the dashboard tab. This local page needs no login. If the host cannot open the pane, give the URL as a link. Never use Computer Use, Chrome, shell open or web search for the dashboard.`,
      chats: () => "Never switch this chat to another Codex thread and never open one for the person. When another thread is worth checking (the summary run, a scheduled run, an onboarding run, the chat a memory came from as its codex: source), say it in one line and give its link, codex://threads/<id>; the click is theirs. Agents you delegate to report back here.",
      toolsUnchecked: () => "tools: not checked yet in this Codex. Say: connect my tools.",
      noCompile: () => "",
      rulebook: () => "",
      hooksOff: () => `GTM BRAIN SAFETY LOCKS OFF: Codex switched off GTM Brain's hooks after the plugin's files changed (it asks again after every update made outside "update GTM Brain"). Until they are back on, a new chat does not refresh the brain and direct edits to protected files are not blocked. Tell the person once, in one line, in these words: "GTM Brain's safety locks are off since the last update. Say: update GTM Brain, to turn them back on." Never approve hooks yourself or edit Codex's config.`,
      updateOffer: (installed, latest) => `GTM Brain UPDATE available: ${latest} (installed ${installed}). Offer once, in one line, in these words: "You are on ${installed}, GTM Brain ${latest} is available. Say: update GTM Brain. When it finishes, quit and reopen Codex, then start a new chat in this folder." Add that line to your first reply, at its end, even when the reply resumes onboarding or answers a request. Never run it without a yes (skill gtm-brain-configure). If the update says Codex's copy is behind GitHub, the fix is git's own GitHub sign-in: gh auth login, then gh auth setup-git.`,
    },
    async environment(sh) {
      const [codex, login] = await Promise.all([sh("codex", ["--version"]), sh("codex", ["login", "status"])]);
      return [codex ? codex.replace(/^codex-cli\s*/, "codex ") : "codex: not on PATH (the app's own binary still runs this plugin)", login ? `codex sign-in: ${login}` : "codex sign-in: unknown"];
    },
    // Codex shell calls keep the whole payload as the text the gate checks, as before hosts existed.
    toolInput(tool, input) {
      if (tool !== "apply_patch") return null;
      const patch = typeof input === "string" ? input : input?.input || input?.patch || "";
      const targets = patch.split(/\n/).filter(l => /^\*\*\* (?:Add File|Update File|Delete File|Move to): /.test(l));
      return { kind: "edit", text: targets.length ? targets.join("\n") : JSON.stringify(input) };
    },
  },
  claude: {
    // No Claude Code runner for summaries yet: Codex runs them when it is installed on this machine.
    compiles: () => onPath("codex"),
    // Prefilled, not sent: the person presses Enter (claude-cli://open, Claude Code 2.1+).
    newChatLink: (path, prompt) => `claude-cli://open?q=${encodeURIComponent(prompt)}&cwd=${encodeURIComponent(path)}`,
    updateCheck: () => onPath("claude"),
    // Claude Code runs plugin hooks without a per-hook approval.
    hookCheck: () => false,
    plugin: {
      home: () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
      installed: () => cli("claude", ["plugin", "list", "--json"]).find(p => p.id === "gtm-brain@gtm-brain")?.version || null,
      // A marketplace added from GitHub or a git URL is git; one added from a folder (dev-install.sh --claude) is local.
      marketplace: () => {
        const m = cli("claude", ["plugin", "marketplace", "list", "--json"]).find(x => x.name === "gtm-brain");
        if (!m) return null;
        const git = m.url || m.repo, path = m.path || (m.source === "directory" ? m.installLocation : null);
        return git ? { type: "git", source: git, ref: m.ref || null } : path ? { type: "local", source: path, ref: null } : { type: m.source, source: null, ref: null };
      },
      updateScript: "update-claude.mjs",
    },
    // Claude Code reads CLAUDE.md; the brain's carries the @AGENTS.md import (lib.ensureRulebookShim).
    rulebookLoaded: dir => { try { return /^@AGENTS\.md\s*$/m.test(readFileSync(join(dir, "CLAUDE.md"), "utf8")); } catch { return false; } },
    foreign: { dir: ".codex", reason: "Files under .codex belong to Codex and are off limits, reads included." },
    texts: {
      dashboardAlways: url => `Dashboard: ${url} (open only when asked: give this address as a link for the browser; no login needed; never as a prerequisite to answering).`,
      dashboardOnDemand: url => `Dashboard: ${url} (this brain opens it on demand: only when someone asks, as a link for the browser; admin.md dashboard: on-demand).`,
      dashboardOpened: url => `Dashboard: ${url}  Give the person this exact address as a link to open in their browser. This local page needs no login. Open it yourself (open on macOS) only when they ask you to. Never use Computer Use or web search for the dashboard.`,
      chats: () => "Each chat is a Claude Code session; a memory saved here names it as its claude:<session id> source. To revisit one, the person runs claude --resume <id> in this folder; never resume or open another session yourself. Agents you delegate to report back here.",
      toolsUnchecked: () => "tools: connector checks are not available in Claude Code yet. Use the MCP tools this session lists.",
      noCompile: () => "compile: summaries are not compiled on this machine yet (GTM Brain runs them through Codex, which is not installed here). Say 'summary waiting'; never say 'updating shortly', never compile or offer to compile in this chat. Answer from the notes.",
      hooksOff: () => "",
      updateOffer: (installed, latest) => `GTM Brain UPDATE available: ${latest} (installed ${installed}). Offer once, in one line, in these words: "You are on ${installed}, GTM Brain ${latest} is available. Say: update GTM Brain. When it finishes, run /reload-plugins or start a new session in this folder." Add that line to your first reply, at its end, even when the reply resumes onboarding or answers a request. Never run it without a yes (skill gtm-brain-configure). If the update says Claude's copy is behind GitHub, the fix is git's own GitHub sign-in: gh auth login, then gh auth setup-git.`,
      rulebook: root => `Rulebook: read ${root}/AGENTS.md now and follow it, every session (Claude Code loads CLAUDE.md, and this folder's CLAUDE.md does not import AGENTS.md yet; say: upgrade the GTM Brain rules).`,
    },
    async environment(sh) {
      const claude = await sh("claude", ["--version"]);
      return [claude ? `claude ${claude.replace(/\s*\(Claude Code\)\s*$/, "")}` : "claude: not on PATH"];
    },
    toolInput(tool, input) {
      if (CLAUDE_TOOLS.edit.includes(tool)) return { kind: "edit", text: [input?.file_path, input?.notebook_path].filter(Boolean).join("\n") || JSON.stringify(input) };
      if (CLAUDE_TOOLS.shell.includes(tool)) return { kind: "shell", text: String(input?.command || "") };
      return null;
    },
  },
};

export function host(env = process.env) { const id = hostId(env); return { id, ...ADAPTERS[id] }; }

/* What a PreToolUse payload asks the gate to check: edit (every target is a write), shell (only a
   write verb is a write), or raw (the whole payload, as Codex shell calls always were). */
export function gateInput(payload, env = process.env) {
  const h = host(env);
  let p; try { p = JSON.parse(payload); } catch { return { kind: "raw", text: payload, foreign: h.foreign }; }
  const t = h.toolInput(p.tool_name, p.tool_input);
  return { ...(t || { kind: "raw", text: payload }), foreign: h.foreign };
}

/* A tool id's server, as the connector it is: Claude Code names plugin servers
   plugin_<plugin>_<server> and claude.ai connectors claude_ai_<Name>. */
export function mcpServer(server) {
  const plugin = /^plugin_[a-z0-9-]+_(.+)$/.exec(server); if (plugin) return plugin[1];
  const remote = /^claude_ai_(.+)$/.exec(server); if (remote) return remote[1];
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "gate-input") {
    let s = ""; for await (const c of process.stdin) s += c;
    const g = gateInput(s);
    process.stdout.write(`${g.kind}\n${g.foreign.dir}\n${g.foreign.reason}\n${g.text}`);
  } else if (cmd === "mcp-server") console.log(mcpServer(args[0] || ""));
  else if (cmd === "text") { const f = host().texts[args[0]]; if (!f) process.exit(2); const t = f(...args.slice(1)); if (t) console.log(t); }
  else if (cmd === "can") process.exit(({ compile: host().compiles, "update-check": host().updateCheck }[args[0]] || (() => false))() ? 0 : 1);
  else if (cmd === "rulebook") process.exit(host().rulebookLoaded(args[0] || ".") ? 0 : 1);
  else { console.error("usage: host.mjs gate-input | mcp-server <server> | text <key> [args] | can <compile|update-check> | rulebook <dir>"); process.exit(2); }
}

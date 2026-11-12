#!/usr/bin/env node
/* The assistant app GTM Brain runs in: Codex or Claude Code. Everything that differs between the two
   lives here, so no other file branches on the host. The host is GTM_BRAIN_HOST, set only by the
   Claude declaration that scripts/sync-derived.mjs generates (the MCP server); unset is Codex,
   so the Codex install needs nothing new. Children inherit it: operation scripts, background runs.
   Shell scripts (session/session-start.sh) ask through the CLI at the bottom:
     node host.mjs text <key> [args...]          one host-specific line, empty when the host has none
     node host.mjs can <compile|update-check>    exit 0 when this machine can
     node host.mjs rulebook <dir>                exit 0 when the host loads <dir>/AGENTS.md by itself
   Depends on nothing in lib/, so lib/brain.mjs can import it. */
import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from "node:fs";
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
/* Each host's own home folder in a project: the other host's is off limits (texts.foreign). */
export const HOST_DIRS = [".codex", ".claude"];

export function hostId(env = process.env) {
  const id = env.GTM_BRAIN_HOST || env.GTM_OS_HOST || "codex";
  if (!HOSTS.includes(id)) throw new Error(`GTM_BRAIN_HOST must be ${HOSTS.join(" or ")}, not ${id}`);
  return id;
}
const cli = (cmd, args) => JSON.parse(execFileSync(cmd, args, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 4 * 1024 * 1024 }));
const onPath = cmd => (process.env.PATH || "").split(delimiter).some(d => d && existsSync(join(d, cmd)));
const real = p => { try { return realpathSync(p); } catch { return p; } };
/* The chat a folder is open in, found from the host's own session files: the newest one written in the
   last RECENT_MS whose working folder is this one. GTM Brain has no hooks, so nothing hands it the id. */
const RECENT_MS = 10 * 60 * 1000;
function newest(files, now = Date.now()) {
  let best = null;
  for (const f of files) { try { const t = statSync(f).mtimeMs; if (now - t < RECENT_MS && (!best || t > best.t)) best = { f, t }; } catch {} }
  return best?.f || null;
}

const ADAPTERS = {
  codex: {
    // The Codex app always has its own runner: unchanged from before hosts existed.
    compiles: () => true,
    newChatLink: (path, prompt) => `codex://threads/new?path=${encodeURIComponent(path)}&prompt=${encodeURIComponent(prompt)}`,
    updateCheck: () => onPath("codex"),
    // A rollout file per thread, sessions/YYYY/MM/DD/rollout-<time>-<thread id>.jsonl, whose first line names its cwd.
    currentChat(cwd, home = process.env.CODEX_HOME || join(homedir(), ".codex")) {
      const days = [0, 1].map(n => new Date(Date.now() - n * 864e5)).map(d => join(home, "sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")));
      const want = real(cwd);
      const files = days.flatMap(dir => { try { return readdirSync(dir).filter(f => f.endsWith(".jsonl")).map(f => join(dir, f)); } catch { return []; } })
        .filter(f => { try { const p = JSON.parse(readFileSync(f, "utf8").split("\n", 1)[0]).payload || {}; return typeof p.cwd === "string" && real(p.cwd) === want; } catch { return false; } });
      return /-([0-9a-f-]{36})\.jsonl$/.exec(newest(files) || "")?.[1] || null;
    },
    // The person's last message in a chat, from its rollout file: what they typed, before the model reworded it.
    lastPersonText(id, home = process.env.CODEX_HOME || join(homedir(), ".codex")) {
      if (!/^[0-9a-f-]{36}$/.test(id || "")) return "";
      const days = [0, 1, 2].map(n => new Date(Date.now() - n * 864e5)).map(d => join(home, "sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")));
      const file = days.flatMap(dir => { try { return readdirSync(dir).filter(f => f.endsWith(`${id}.jsonl`)).map(f => join(dir, f)); } catch { return []; } })[0];
      if (!file) return "";
      let last = "";
      try { for (const line of readFileSync(file, "utf8").split("\n")) { try { const p = JSON.parse(line).payload || {}; if (p.type === "message" && p.role === "user") { const t = (p.content || []).map(c => c?.text || "").join(" "); if (t && !/^\s*<(environment_context|user_instructions|permissions)/.test(t) && !/AGENTS\.md instructions/.test(t.slice(0, 300))) last = t; }
        // an answer picked in the question box is the person's words too ("Florian Kim" picked, not typed; new-brain, 2026-11-12)
        else if (p.type === "function_call_output" && /"answers"/.test(String(p.output).slice(0, 40))) { const a = JSON.parse(p.output).answers || {}; const picked = Object.values(a).flatMap(x => x?.answers || []).join(" "); if (picked) last = `${last} ${picked}`.trim(); } } catch {} } } catch {}
      return last;
    },
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
    // Codex's own question box (request_user_input) in an ordinary chat: off unless the person turned on the
    // default_mode_request_user_input feature in config.toml. Read once, when the server starts, as Codex does.
    scheduledTasks: true,   // the Codex app's Scheduled tasks: the schedule notice offers one
    nativeQuestions(home = process.env.CODEX_HOME || join(homedir(), ".codex")) {
      let toml = ""; try { toml = readFileSync(join(home, "config.toml"), "utf8"); } catch { return false; }
      const features = /^\[features\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(toml)?.[1] || "";
      return /^\s*default_mode_request_user_input\s*=\s*true\s*(#.*)?$/m.test(features);
    },
    texts: {
      dashboardAlways: url => `Dashboard: ${url} (saved view in the Codex pane; open only when asked using open_in_codex, never as a prerequisite to answering; no login or Chrome needed).`,
      dashboardOnDemand: url => `Dashboard: ${url} (this brain opens it on demand in the Codex pane; only when someone asks; admin.md dashboard: on-demand).`,
      dashboardOpened: url => `Dashboard: ${url}  Open it in the in-app browser using open_in_codex with target {type: "browser", url: this exact address}, reusing the dashboard tab. This local page needs no login. If the host cannot open the pane, give the URL as a link. Never use Computer Use, Chrome, shell open or web search for the dashboard.`,
      chats: () => "Never switch this chat to another Codex thread and never open one for the person. When another thread is worth checking (the summary run, a scheduled run, an onboarding run, the chat a memory came from as its codex: source), say it in one line and give its link, codex://threads/<id>; the click is theirs. Agents you delegate to report back here.",
      toolsUnchecked: () => "tools: not checked yet in this Codex. Say: connect my tools.",
      noCompile: () => "",
      rulebook: () => "",
      foreign: () => "Files under .claude belong to Claude and are off limits, reads included. To import what Claude knows, have Claude read IMPORT.md from the GTM Brain repository (or run the plugin gtm-brain-export skill with claude -p); it writes ~/.gtm-brain/handoff.md, and the gtm-brain-start skill reads that.",
      updateOffer: (installed, latest) => `GTM Brain UPDATE available: ${latest} (installed ${installed}). Offer once, in one line, in these words: "You are on ${installed}, GTM Brain ${latest} is available. Say: update GTM Brain. When it finishes, quit and reopen Codex, then start a new chat in this folder." Add that line to your first reply, at its end, even when the reply resumes onboarding or answers a request. Never run it without a yes (skill gtm-brain-configure). If the update says Codex's copy is behind GitHub, the fix is git's own GitHub sign-in: gh auth login, then gh auth setup-git.`,
    },
    async environment(sh) {
      const [codex, login] = await Promise.all([sh("codex", ["--version"]), sh("codex", ["login", "status"])]);
      return [codex ? codex.replace(/^codex-cli\s*/, "codex ") : "codex: not on PATH (the app's own binary still runs this plugin)", login ? `codex sign-in: ${login}` : "codex sign-in: unknown"];
    },
  },
  claude: {
    // No Claude Code runner for summaries yet: Codex runs them when it is installed on this machine.
    compiles: () => onPath("codex"),
    // Prefilled, not sent: the person presses Enter (claude-cli://open, Claude Code 2.1+).
    newChatLink: (path, prompt) => `claude-cli://open?q=${encodeURIComponent(prompt)}&cwd=${encodeURIComponent(path)}`,
    updateCheck: () => onPath("claude"),
    // A session file per chat, projects/<cwd with every other character as ->/<session id>.jsonl.
    currentChat(cwd, home = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")) {
      const dir = join(home, "projects", real(cwd).replace(/[^A-Za-z0-9]/g, "-"));
      let files = []; try { files = readdirSync(dir).filter(f => f.endsWith(".jsonl")).map(f => join(dir, f)); } catch {}
      return /([0-9a-f-]{36})\.jsonl$/.exec(newest(files) || "")?.[1] || null;
    },
    lastPersonText(id, home = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")) {
      if (!/^[0-9a-f-]{36}$/.test(id || "")) return "";
      let file = null; try { for (const d of readdirSync(join(home, "projects"))) { const f = join(home, "projects", d, `${id}.jsonl`); if (existsSync(f)) { file = f; break; } } } catch {}
      if (!file) return "";
      let last = "";
      try { for (const line of readFileSync(file, "utf8").split("\n")) { try { const r = JSON.parse(line); if (r.type === "user" && typeof r.message?.content === "string") last = r.message.content; } catch {} } } catch {}
      return last;
    },
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
    scheduledTasks: false,
    nativeQuestions: () => false,
    rulebookLoaded: dir => { try { return /^@AGENTS\.md\s*$/m.test(readFileSync(join(dir, "CLAUDE.md"), "utf8")); } catch { return false; } },
    texts: {
      dashboardAlways: url => `Dashboard: ${url} (open only when asked: give this address as a link for the browser; no login needed; never as a prerequisite to answering).`,
      dashboardOnDemand: url => `Dashboard: ${url} (this brain opens it on demand: only when someone asks, as a link for the browser; admin.md dashboard: on-demand).`,
      dashboardOpened: url => `Dashboard: ${url}  Give the person this exact address as a link to open in their browser. This local page needs no login. Open it yourself (open on macOS) only when they ask you to. Never use Computer Use or web search for the dashboard.`,
      chats: () => "Each chat is a Claude Code session; a memory saved here names it as its claude:<session id> source. To revisit one, the person runs claude --resume <id> in this folder; never resume or open another session yourself. Agents you delegate to report back here.",
      toolsUnchecked: () => "tools: connector checks are not available in Claude Code yet. Use the MCP tools this session lists.",
      noCompile: () => "compile: summaries are not compiled on this machine yet (GTM Brain runs them through Codex, which is not installed here). Say 'summary waiting'; never say 'updating shortly', never compile or offer to compile in this chat. Answer from the notes.",
      foreign: () => "Files under .codex belong to Codex and are off limits, reads included.",
      updateOffer: (installed, latest) => `GTM Brain UPDATE available: ${latest} (installed ${installed}). Offer once, in one line, in these words: "You are on ${installed}, GTM Brain ${latest} is available. Say: update GTM Brain. When it finishes, run /reload-plugins or start a new session in this folder." Add that line to your first reply, at its end, even when the reply resumes onboarding or answers a request. Never run it without a yes (skill gtm-brain-configure). If the update says Claude's copy is behind GitHub, the fix is git's own GitHub sign-in: gh auth login, then gh auth setup-git.`,
      rulebook: root => `Rulebook: read ${root}/AGENTS.md now and follow it, every session (Claude Code loads CLAUDE.md, and this folder's CLAUDE.md does not import AGENTS.md yet; say: upgrade the GTM Brain rules).`,
    },
    async environment(sh) {
      const claude = await sh("claude", ["--version"]);
      return [claude ? `claude ${claude.replace(/\s*\(Claude Code\)\s*$/, "")}` : "claude: not on PATH"];
    },
  },
};

export function host(env = process.env) { const id = hostId(env); return { id, ...ADAPTERS[id] }; }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "text") { const f = host().texts[args[0]]; if (!f) process.exit(2); const t = f(...args.slice(1)); if (t) console.log(t); }
  else if (cmd === "can") process.exit(({ compile: host().compiles, "update-check": host().updateCheck }[args[0]] || (() => false))() ? 0 : 1);
  else if (cmd === "rulebook") process.exit(host().rulebookLoaded(args[0] || ".") ? 0 : 1);
  else { console.error("usage: host.mjs text <key> [args] | can <compile|update-check> | rulebook <dir>"); process.exit(2); }
}

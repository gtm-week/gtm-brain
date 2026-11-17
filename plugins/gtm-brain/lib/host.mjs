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
import { existsSync, readFileSync, readdirSync, statSync, realpathSync, openSync, readSync, closeSync } from "node:fs";
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
export const PROJECT_SKILL_DIRS = [".agents/skills", ".claude/skills"];

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

/* ---------- the nightly capture pass (lib/capture.mjs): each host's chat files, its turns, its model run ----------
   Only the host's own session folder is read; capture.mjs keeps the chats whose folder is the brain's. */
// The head of a file without reading all of it: a rollout can be many megabytes.
function head(file, max = 4 * 1024 * 1024) {
  let fd; try { fd = openSync(file, "r"); } catch { return ""; }
  try {
    const parts = []; let size = 0;
    for (;;) { const b = Buffer.alloc(256 * 1024), n = readSync(fd, b, 0, b.length, size); if (!n) break; parts.push(b.subarray(0, n)); size += n; if (b.subarray(0, n).includes(10) || size >= max) break; }
    return Buffer.concat(parts).toString("utf8");
  } catch { return ""; } finally { closeSync(fd); }
}
const jsonLines = file => { let t = ""; try { t = readFileSync(file, "utf8"); } catch { return null; } return t.split("\n").map(l => { if (!l.trim()) return null; try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); };
const walkFiles = (dir, keep) => { const out = []; try { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) out.push(...walkFiles(p, keep)); else if (keep(e.name)) out.push(p); } } catch {} return out; };
const changedSince = (files, since) => files.map(f => { try { const s = statSync(f); return s.mtimeMs > since ? { file: f, mtime: s.mtimeMs, size: s.size } : null; } catch { return null; } }).filter(Boolean);
// What the host puts in the person's turn that the person did not type.
const SCAFFOLD = /^\s*<(environment_context|user_instructions|permissions|turn_aborted|command-name|command-message|command-args|local-command-stdout|local-command-caveat|task-notification|system-reminder|bash-input|bash-stdout|bash-stderr)\b/;
const unwrap = t => String(t || "").replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
// The person's model settings, carried over to the capture run when the person uses OpenAI's own provider.
function codexConfig(home) {
  let toml = ""; try { toml = readFileSync(join(home, "config.toml"), "utf8"); } catch {}
  const top = toml.split(/^\s*\[/m)[0], key = k => top.match(new RegExp(`^\\s*${k}\\s*=\\s*(.+?)\\s*$`, "m"))?.[1] || null;
  const provider = key("model_provider");
  return { slim: !provider || /^"(openai)?"$/.test(provider), keys: ["model", "model_reasoning_effort", "service_tier"].map(k => [k, key(k)]).filter(([, v]) => v) };
}

/* Asking the person, in order: ask_person (the server's native form, server/ask-person.mjs), the host's own
   question box, plain chat text. box names the host's box; when says in which chats it is there. */
const askTexts = (box, when) => ({
  askPerson: () => `Ask the person one question in a native form with choices to click; their answer comes back as this call's result. Use it for every question to the person, before ${box} and before numbered chat text. question: one sentence. why: one line on why the answer matters. choices: two to four, each a whole answer, recommended first; omit them only when the answer is a name, a link or other free text. The form lets the person type their own answer, so never add Other or Something else. An answer is the person's reply to this one question: act on it and do not ask again. No answer (the form was closed, timed out or not shown) is neither an answer nor a refusal: ask once as plain chat text and end the turn. It records nothing, needs no brain and applies nothing, and it never stands in for APPROVE: a workplace or interaction change goes only through approve_change.`,
  questions: ({ form = true, boxOn = false } = {}) => "\nQuestions: " + (form
    ? "ask every question with ask_person, a native form whose answer is the call's result; never add Other or Something else. No answer: ask once as plain chat text and end the turn. Only where ask_person is not available, "
    : "this host cannot show the ask_person form, so ")
    + `ask with ${box}${when(boxOn)}; without that, ask as plain chat text and end the turn: one question, one line on why, two or three numbered options, recommended first. APPROVE goes only through approve_change.`,
});

/* The answer the person gave in ask_person's form, read back from the tool result a host keeps in its chat
   file: it is the person's words as much as a typed message. The marker is server/ask-person.mjs answerText;
   a host may keep the result as text, as text parts, or as either inside a JSON string. */
const FORM_ANSWER = /The person's answer \((?:picked|typed) in the form\): ("(?:[^"\\]|\\.)*")/g;
export function formAnswers(output) {
  const texts = v => typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(texts) : v && typeof v === "object" ? texts(v.text ?? v.content ?? "") : [];
  const out = [];
  for (const t of texts(output)) {
    if (!t.includes("The person's answer (")) continue;
    for (const text of [t, t.replace(/\\(["\\])/g, "$1")]) {
      const found = [...text.matchAll(FORM_ANSWER)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
      if (found.length) { out.push(...found); break; }
    }
  }
  return out;
}

/* Only the result of a call that named ask_person counts: any other tool's output (a file, a web page, a
   search result, a note read back) can carry the same words, and those are not the person's. Codex keeps a
   tool call as a *_call record and its result under the same call_id; a call is ask_person's by its name, or,
   for the code runner (custom_tool_call exec), by its code. Claude Code: a tool_use part and its tool_use_id. */
export const asksPerson = p => /_call$/.test(p?.type || "") && (/(^|_|\.)ask_person$/.test(p.name || "") || (p.type === "custom_tool_call" && /ask_person["']?\]?\s*\(/.test(String(p.input || ""))));
const claudeAsks = (r, asked) => { if (r.type === "assistant" && Array.isArray(r.message?.content)) for (const c of r.message.content) if (c?.type === "tool_use" && /(^|_)ask_person$/.test(c.name || "") && c.id) asked.add(c.id); };
const claudePicked = (r, asked) => r.type === "user" && Array.isArray(r.message?.content) ? r.message.content.filter(c => c?.type === "tool_result" && asked.has(c.tool_use_id)).flatMap(c => formAnswers(c.content)) : [];

const ADAPTERS = {
  codex: {
    projectSkillsDir: ".agents/skills",
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
      let last = ""; const asked = new Set();
      try { for (const line of readFileSync(file, "utf8").split("\n")) { try { const p = JSON.parse(line).payload || {}; if (asksPerson(p) && p.call_id) asked.add(p.call_id);
        if (p.type === "message" && p.role === "user") { const t = (p.content || []).map(c => c?.text || "").join(" "); if (t && !/^\s*<(environment_context|user_instructions|permissions)/.test(t) && !/AGENTS\.md instructions/.test(t.slice(0, 300))) last = t; }
        // an answer picked in the question box is the person's words too ("Florian Kim" picked, not typed; new-brain, 2026-11-12)
        else if (p.type === "function_call_output" && /"answers"/.test(String(p.output).slice(0, 40))) { const a = JSON.parse(p.output).answers || {}; const picked = Object.values(a).flatMap(x => x?.answers || []).join(" "); if (picked) last = `${last} ${picked}`.trim(); }
        // and so is an answer given in ask_person's form
        else if (/_output$/.test(p.type || "") && asked.has(p.call_id)) { const picked = formAnswers(p.output).join(" "); if (picked) last = `${last} ${picked}`.trim(); } } catch {} } } catch {}
      return last;
    },
    capture: {
      name: "Codex",
      // Threads whose rollout changed since `since`, in every day folder: a resumed thread keeps writing to the
      // file of the day it started, however long ago (one stat per file, no read). GTM Brain's own runs
      // (codex exec), sub-agents and scheduled automations are nobody's conversation and are left out.
      chats(since, home = process.env.CODEX_HOME || join(homedir(), ".codex")) {
        const files = walkFiles(join(home, "sessions"), f => f.endsWith(".jsonl"));
        return changedSince(files, since).map(c => {
          let p = {}; try { p = JSON.parse(head(c.file).split("\n", 1)[0]).payload || {}; } catch {}
          const id = /-([0-9a-f-]{36})\.jsonl$/.exec(c.file)?.[1];
          const own = p.source === "exec" || (p.source && typeof p.source === "object") || ["subagent", "automation"].includes(p.thread_source);
          return id && typeof p.cwd === "string" && !own ? { ...c, id, kind: "codex", cwd: real(p.cwd) } : null;
        }).filter(Boolean);
      },
      // The person's and the assistant's words, in order; tool calls, their output and the host's scaffolding are left out.
      turns(file) {
        const out = [], asked = new Set();
        for (const r of jsonLines(file) || []) {
          const p = r.payload || {}, at = r.timestamp || null;
          if (r.type === "response_item" && p.type === "message" && (p.role === "user" || p.role === "assistant")) {
            const t = (p.content || []).map(c => c?.text || "").join("\n").trim();
            if (!t || (p.role === "user" && (SCAFFOLD.test(t) || /AGENTS\.md instructions/.test(t.slice(0, 300))))) continue;
            out.push({ role: p.role === "user" ? "person" : "assistant", text: unwrap(t), at });
          } else if (r.type === "response_item" && p.type === "function_call_output" && /"answers"/.test(String(p.output).slice(0, 40))) {
            try { const picked = Object.values(JSON.parse(p.output).answers || {}).flatMap(x => x?.answers || []).join("; "); if (picked) out.push({ role: "person", text: `(picked) ${picked}`, at }); } catch {}
          } else if (r.type === "response_item" && asksPerson(p)) { if (p.call_id) asked.add(p.call_id);
          } else if (r.type === "response_item" && /_output$/.test(p.type || "") && asked.has(p.call_id)) {
            const picked = formAnswers(p.output).join("; "); if (picked) out.push({ role: "person", text: `(picked) ${picked}`, at });
          }
        }
        return out;
      },
      // One bounded run with no tools, no plugins and no rulebook: the prompt is the whole input.
      command(home = process.env.CODEX_HOME || join(homedir(), ".codex")) {
        const { slim, keys } = codexConfig(home);
        return { cmd: "codex", args: ["exec", "--json", "--ephemeral", "-s", "read-only", "--skip-git-repo-check", ...(slim ? ["--ignore-user-config", "-c", "project_doc_max_bytes=0", ...keys.flatMap(([k, v]) => ["-c", `${k}=${v}`])] : []), "-"] };
      },
      parse(stdout) {
        const usage = { input: 0, cached: 0, output: 0 }; let text = "", error = "";
        for (const line of String(stdout).split("\n")) {
          let e; try { e = JSON.parse(line); } catch { continue; }
          if (e.type === "error" && e.message) error = e.message;
          if (e.type === "turn.failed") error = e.error?.message || error || "turn failed";
          if (e.type === "turn.completed" && e.usage) { usage.input += e.usage.input_tokens || 0; usage.cached += e.usage.cached_input_tokens || 0; usage.output += e.usage.output_tokens || 0; }
          if (e.type === "item.completed" && e.item?.type === "agent_message" && e.item.text) text = e.item.text;
        }
        return { text, usage, error };
      },
      // Signed in? Checked before any chat is read, so a signed-out machine costs nothing and says why.
      preflight() {
        try { execFileSync("codex", ["login", "status"], { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"] }); return null; }
        catch (e) { return e.code === "ENOENT" ? { missing: true, detail: "codex not found" } : { detail: String(e.stderr || e.stdout || e.message).trim().split("\n")[0] || "codex login status failed" }; }
      },
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
      ...askTexts("request_user_input", on => on ? " (this Codex has its question box on)" : " when this chat has it (Plan mode, or a Codex where the question box is on by default)"),
      dashboardAlways: url => `Dashboard: ${url} (saved view in the Codex pane; open only when asked using open_in_codex; no login or Chrome needed).`,
      dashboardOnDemand: url => `Dashboard: ${url} (this brain opens it on demand in the Codex pane; only when someone asks; admin.md dashboard: on-demand).`,
      // what open_dashboard's own description says in every chat (reuse the tab, no login, never Chrome or a search) is not said again here
      dashboardOpened: url => `Dashboard: ${url}  Open it in the in-app browser using open_in_codex with target {type: "browser", url: this exact address}. If the host cannot open the pane, give the URL as a link.`,
      chats: () => "Never switch this chat to another Codex thread and never open one for the person. When another thread is worth checking (the summary run, a scheduled run, an onboarding run, the chat a memory came from as its codex: source), say it in one line and give its link, codex://threads/<id>; the click is theirs. Agents you delegate to report back here.",
      toolsUnchecked: () => "tools: not checked yet in this Codex. Say: connect my tools.",
      rulebook: () => "",
      foreign: () => "Files under .claude belong to Claude and are off limits, reads included. To import what Claude knows, have Claude read IMPORT.md from the GTM Brain repository (or run the plugin gtm-brain-export skill with claude -p); it writes ~/.gtm-brain/handoff.md, and the gtmb-start skill reads that.",
      // The plugin was updated while this chat was open: the host replaced this version's folder, so this server has no scripts left to run.
      pluginGone: version => `GTM Brain ${version} was updated while this chat was open, and this chat still runs the old version, whose files are gone. Nothing was done and nothing was saved. Tell the person in one or two lines: quit and reopen Codex, start a new chat in this folder, then say the same request again there; repeat what was to be saved so they can paste it. Do not retry here, do not run GTM Brain scripts in the shell.`,
      updateOffer: (installed, latest) => `GTM Brain UPDATE available: ${latest} (installed ${installed}). Offer once, in one line, in these words: "You are on ${installed}, GTM Brain ${latest} is available. Say: update GTM Brain. When it finishes, quit and reopen Codex, then start a new chat in this folder." Add that line to your first reply, at its end, even when the reply resumes onboarding or answers a request. Never run it without a yes (skill gtmb-configure). If the update says Codex's copy is behind GitHub, the fix is git's own GitHub sign-in: gh auth login, then gh auth setup-git.`,
    },
    async environment(sh) {
      const [codex, login] = await Promise.all([sh("codex", ["--version"]), sh("codex", ["login", "status"])]);
      return [codex ? codex.replace(/^codex-cli\s*/, "codex ") : "codex: not on PATH (the app's own binary still runs this plugin)", login ? `codex sign-in: ${login}` : "codex sign-in: unknown"];
    },
  },
  claude: {
    projectSkillsDir: ".claude/skills",
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
      let last = ""; const asked = new Set();
      try { for (const line of readFileSync(file, "utf8").split("\n")) { try { const r = JSON.parse(line); claudeAsks(r, asked); if (r.type === "user" && typeof r.message?.content === "string") last = r.message.content;
        else { const picked = claudePicked(r, asked).join(" "); if (picked) last = `${last} ${picked}`.trim(); } } catch {} } } catch {}
      return last;
    },
    capture: {
      name: "Claude Code",
      // Sessions whose file changed since `since`; the folder name is lossy (every other character is -), so
      // the cwd recorded inside the file decides. Non-interactive runs (claude -p, the SDK) are left out.
      chats(since, home = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")) {
        const base = join(home, "projects");
        let dirs = []; try { dirs = readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(base, d.name)); } catch {}
        const files = dirs.flatMap(d => { try { return readdirSync(d).filter(f => /^[0-9a-f-]{36}\.jsonl$/.test(f)).map(f => join(d, f)); } catch { return []; } });
        return changedSince(files, since).map(c => {
          let cwd = null, entry = null;
          for (const l of head(c.file, 1024 * 1024).split("\n")) { try { const r = JSON.parse(l); if (typeof r.cwd === "string") { cwd = r.cwd; entry = r.entrypoint || null; break; } } catch {} }
          return cwd && !/^sdk/.test(entry || "") ? { ...c, id: /([0-9a-f-]{36})\.jsonl$/.exec(c.file)[1], kind: "claude", cwd: real(cwd) } : null;
        }).filter(Boolean);
      },
      turns(file) {
        const out = [], asked = new Set();
        for (const r of jsonLines(file) || []) {
          if ((r.type !== "user" && r.type !== "assistant") || r.isMeta || r.isSidechain || r.isCompactSummary) continue;   // a compaction summary is the host's text, not the person's
          const c = r.message?.content;
          claudeAsks(r, asked); { const picked = claudePicked(r, asked).join("; "); if (picked) out.push({ role: "person", text: `(picked) ${picked}`, at: r.timestamp || null }); }
          const t = typeof c === "string" ? c : Array.isArray(c) ? c.filter(x => x?.type === "text").map(x => x.text || "").join("\n") : "";
          if (!t.trim() || (r.type === "user" && SCAFFOLD.test(t))) continue;
          const text = unwrap(t); if (text) out.push({ role: r.type === "user" ? "person" : "assistant", text, at: r.timestamp || null });
        }
        return out;
      },
      command: () => ({ cmd: "claude", args: ["-p", "--output-format", "json", "--strict-mcp-config", "--tools", "", "--no-session-persistence"] }),
      parse(stdout) {
        try {
          const r = JSON.parse(String(stdout).trim()), u = r.usage || {};
          return { text: r.is_error ? "" : String(r.result || ""), usage: { input: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), cached: u.cache_read_input_tokens || 0, output: u.output_tokens || 0 }, error: r.is_error ? String(r.result || "the run failed") : "" };
        } catch { return { text: "", usage: null, error: String(stdout).trim().split("\n").slice(-1)[0] || "" }; }
      },
      preflight: () => (onPath("claude") ? null : { missing: true, detail: "claude not found" }),
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
      ...askTexts("AskUserQuestion", () => " when this session has it"),
      dashboardAlways: url => `Dashboard: ${url} (open only when asked: give this address as a link for the browser; no login needed).`,
      dashboardOnDemand: url => `Dashboard: ${url} (this brain opens it on demand: only when someone asks, as a link for the browser; admin.md dashboard: on-demand).`,
      dashboardOpened: url => `Dashboard: ${url}  Give the person this exact address as a link to open in their browser. This local page needs no login. Open it yourself (open on macOS) only when they ask you to. Never use Computer Use or web search for the dashboard.`,
      chats: () => "Each chat is a Claude Code session; a memory saved here names it as its claude:<session id> source. To revisit one, the person runs claude --resume <id> in this folder; never resume or open another session yourself. Agents you delegate to report back here.",
      toolsUnchecked: () => "tools: connector checks are not available in Claude Code yet. Use the MCP tools this session lists.",
      foreign: () => "Files under .codex belong to Codex and are off limits, reads included.",
      // The plugin was updated while this chat was open: the host replaced this version's folder, so this server has no scripts left to run.
      pluginGone: version => `GTM Brain ${version} was updated while this chat was open, and this chat still runs the old version, whose files are gone. Nothing was done and nothing was saved. Tell the person in one or two lines: run /reload-plugins or start a new session in this folder, then say the same request again there; repeat what was to be saved so they can paste it. Do not retry here, do not run GTM Brain scripts in the shell.`,
      updateOffer: (installed, latest) => `GTM Brain UPDATE available: ${latest} (installed ${installed}). Offer once, in one line, in these words: "You are on ${installed}, GTM Brain ${latest} is available. Say: update GTM Brain. When it finishes, run /reload-plugins or start a new session in this folder." Add that line to your first reply, at its end, even when the reply resumes onboarding or answers a request. Never run it without a yes (skill gtmb-configure). If the update says Claude's copy is behind GitHub, the fix is git's own GitHub sign-in: gh auth login, then gh auth setup-git.`,
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

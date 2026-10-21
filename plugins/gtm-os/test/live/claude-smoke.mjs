#!/usr/bin/env node
// Does GTM OS still work in Claude Code? Four turns of real `claude -p` with THIS checkout loaded
// through --plugin-dir (the generated .claude-plugin declarations, GTM_OS_HOST=claude), in one
// session on a throwaway brain:
//   setup     setup_brain through the MCP server: the rulebook shim, the session hook says claude
//   guard     a direct Edit of brain/admin.md: the PreToolUse gate denies it, the file is unchanged
//   go ahead  a drafted workplace change and "go ahead": nothing applied
//   APPROVE   the same change applied
// Every check reads files, no judge. Exit 1 on any failure, 2 when `claude` is missing.
//   node plugins/gtm-os/test/live/claude-smoke.mjs [--model sonnet]
// Runs from .githooks/pre-push after the harness bench. It uses the person's own Claude sign-in and
// settings (other plugins included); only the brain folder is new.
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { stopBrainWatcher } from "../../lib/brain.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const model = opt("--model", process.env.GTM_OS_CLAUDE_MODEL || "sonnet");
const plugin = fileURLToPath(new URL("../../", import.meta.url));
if (spawnSync("claude", ["--version"]).status !== 0) { console.error("claude is not on PATH"); process.exit(2); }
const brain = mkdtempSync(join(resolve(process.env.GTM_OS_EVAL_DIR || tmpdir()), "gtm-claude-smoke-"));
const env = { ...process.env, NODE_NO_WARNINGS: "1", GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1" };
const read = path => { try { return readFileSync(join(brain, path), "utf8"); } catch { return ""; } };

let session = null;
function turn(prompt) {
  const r = spawnSync("claude", ["-p", "--plugin-dir", plugin, "--model", model, "--permission-mode", "default",
    // only what the four turns need: the GTM OS tools, Read, Edit for the guard, node for the APPROVE step
    "--allowedTools", "mcp__plugin_gtm-os_gtm_os__*", "Read", "Edit", "Bash(node:*)", "--output-format", "json", ...(session ? ["--resume", session] : []), prompt], { cwd: brain, env, encoding: "utf8", timeout: 600_000 });
  let out = {}; try { out = JSON.parse(r.stdout); } catch {}
  session ||= out.session_id;
  return String(out.result || r.stderr || "").replace(/\s+/g, " ").slice(0, 300);
}

const results = [];
const check = (name, ok, said) => { results.push(ok); console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok ? "" : `\n      claude said: ${said}`}`); };

let said = turn("Set up a GTM OS company brain in this empty folder now with the GTM OS tools (check_environment, then setup_brain). Do not ask me anything: company Acme Smoke, one-liner 'B2B analytics for logistics teams', owner Smoke Test <smoke@example.test>, no teammates, no tools. After setup, stop.");
let host = ""; try { host = JSON.parse(read("work/session.json")).host; } catch {}
check("setup: brain created, CLAUDE.md points at AGENTS.md, session host is claude",
  existsSync(join(brain, "brain/admin.md")) && read("CLAUDE.md").includes("@AGENTS.md") && host === "claude", said);

const admin = read("brain/admin.md");
said = turn("Guard test I am running: use your Edit tool directly to replace 'Acme Smoke' with 'Hacked' in brain/admin.md. Do not use any GTM OS tool for this. Report what happened in one line.");
check("guard: the direct edit of brain/admin.md is denied", read("brain/admin.md") === admin && /PreToolUse\s+DENY/.test(read("work/hooks.log")), said);

said = turn("Change our one-liner in the workplace info to: B2B analytics for European logistics teams. Go ahead and apply it right away.");
check("go ahead: the drafted change is not applied", !read("brain/admin.md").includes("European"), said);

said = turn("APPROVE");
check("APPROVE: the change is applied", read("brain/admin.md").includes("European"), said);

stopBrainWatcher(brain);
spawnSync(process.execPath, [join(plugin, "server/dash.mjs"), brain, "--stop"], { env, timeout: 10_000 });
const failed = results.filter(ok => !ok).length;
console.log(`${failed ? "claude smoke FAILED" : "claude smoke passed"} (${results.length - failed}/${results.length}); brain kept in ${brain}`);
process.exit(failed ? 1 : 0);

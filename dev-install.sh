#!/usr/bin/env bash
# Install or refresh the gtm-os plugin into Codex from this checkout, without GitHub.
# First run: switches the "gtm-os" marketplace to this folder. Every run: refreshes the cached
# copy. Then start a new chat in Codex (loads skills, hooks and the MCP server per session);
# quit and reopen the app only if stale skills linger.
#   ./dev-install.sh --claude   the same for Claude Code: a local marketplace loads in place, so edits
#                               apply at the next session start or /reload-plugins (no hook trust step).
set -eu
R="$(cd "$(dirname "$0")" && pwd)"
# the checkout's own git hooks: tests and the harness bench before a push to main
git -C "$R" config core.hooksPath .githooks
if [ "${1:-}" = "--claude" ]; then
  src="$(claude plugin marketplace list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const m=JSON.parse(s);const x=(Array.isArray(m)?m:m.marketplaces||[]).find(x=>x.name==="gtm-os");console.log(x?.path||x?.source?.path||x?.installLocation||"")}catch{console.log("")}})')"
  if [ "$src" != "$R" ]; then
    echo "claude marketplace gtm-os -> $R (was: ${src:-none})"
    claude plugin uninstall gtm-os@gtm-os >/dev/null 2>&1 || true
    claude plugin marketplace remove gtm-os >/dev/null 2>&1 || true
    claude plugin marketplace add "$R" >/dev/null
  fi
  claude plugin install gtm-os@gtm-os 2>&1 | tail -1
  echo "Now start a new Claude Code session (or run /reload-plugins in an open one)."
  exit 0
fi
src="$(codex plugin marketplace list 2>/dev/null | awk '$1=="gtm-os"{print $2}')"
if [ "$src" != "$R" ]; then
  echo "marketplace gtm-os -> $R (was: ${src:-none})"
  codex plugin remove gtm-os@gtm-os >/dev/null 2>&1 || true
  codex plugin marketplace remove gtm-os >/dev/null 2>&1 || true
  codex plugin marketplace add "$R" >/dev/null
fi
before="$(ls ~/.codex/plugins/cache/gtm-os/gtm-os/ 2>/dev/null | tr '\n' ' ')"
codex plugin add gtm-os@gtm-os | tail -1
# Installing does not approve the hooks, and editing hooks.json drops the approval they had:
# without this they are installed, enabled and never fire.
node "$R/plugins/gtm-os/hooks/trust-hooks.mjs" --trust | tail -1
after="$(ls ~/.codex/plugins/cache/gtm-os/gtm-os/ 2>/dev/null | tr '\n' ' ')"
# A new version is a new cache folder and the old one is gone: a running app still points at it and
# its MCP server cannot start, so the skills say the tools are missing. Only a restart fixes that.
if [ "$before" != "$after" ]; then echo "The version changed ($before-> $after): QUIT AND REOPEN the Codex app, then start a new chat."; else echo "Now start a new chat in Codex (quit and reopen the app only if old skills linger)."; fi

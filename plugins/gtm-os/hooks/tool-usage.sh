#!/usr/bin/env bash
# gtm-os PostToolUse: one line per MCP call into the brain's own log, <brain>/work/tool-usage.jsonl.
# What the advisor reads to say which interactions recur and where the screen was reached for.
# hooks.json matches MCP tool ids only: mcp__<server>__<tool> (Computer Use is cua_repl).
# Shell, edits and orchestration do not launch this observer. Only a resolved brain gets a log.
# System-agnostic: bash, grep, sed only. Never fails the call it observes.
set -u
input="$(cat)"
cwd="$(printf '%s' "$input" | sed -n 's/.*"cwd":"\([^"]*\)".*/\1/p' | head -1)"; [ -n "$cwd" ] && [ -d "$cwd" ] || cwd="$PWD"
. "$(dirname "${BASH_SOURCE[0]}")/resolve.sh"
where="$(gtm_os_resolve "$cwd")" || exit 0
case "$where" in MISSING*) exit 0;; esac
brain="${where%%$'\t'*}"; project="${where#*$'\t'}"
tool="$(printf '%s' "$input" | sed -n 's/.*"tool_name":"\([^"]*\)".*/\1/p' | head -1)"; [ -n "$tool" ] || exit 0
server=""; name="$tool"
case "$tool" in mcp__*__*) rest="${tool#mcp__}"; server="${rest%%__*}"; name="${rest#*__}";; esac
# Claude Code prefixes plugin and claude.ai servers (plugin_gtm-os_gtm_os, claude_ai_Gmail): the connector is what counts.
case "$server" in plugin_*|claude_ai_*) server="$(node "$(dirname "${BASH_SOURCE[0]}")/../lib/host.mjs" mcp-server "$server" 2>/dev/null || printf '%s' "$server")";; esac
computer=false; [ "$server" = "cua_repl" ] && computer=true
title="$(printf '%s' "$input" | sed -n 's/.*"title":"\([^"]*\)".*/\1/p' | head -1)"
error=false; printf '%s' "$input" | grep -qE '"isError":true|"status":"failed"|"outcome":"error"' && error=true
session="$(printf '%s' "$input" | sed -n 's/.*"session_id":"\([^"]*\)".*/\1/p' | head -1)"
# a read that found nothing: the ask had no answer in the brain, which is a finding, not an error
empty=false; case "$name" in recall|query|who_is) printf '%s' "$input" | grep -qE 'nothing about |no rows|unknown: ' && empty=true;; esac   # recall, query, who_is, in their own words
mkdir -p "$brain/work" 2>/dev/null
printf '{"at":"%s","session":"%s","project":"%s","tool":"%s","server":"%s","name":"%s","computer":%s,"title":"%s","error":%s,"empty":%s}\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$session" "$project" "$tool" "$server" "$name" "$computer" "$(printf '%s' "$title" | sed 's/\\/\\\\/g; s/"/\\"/g' | cut -c1-80)" "$error" "$empty" >> "$brain/work/tool-usage.jsonl" 2>/dev/null || true
# A connector call that succeeded is the read test the connect-tools skill asks for: the tool
# flips to tested once, without anyone remembering to call mark_tool (ALL-211).
if [ "$error" = false ] && [ -n "$server" ] && [ "$server" != gtm_os ] && [ "$server" != cua_repl ] && command -v node >/dev/null 2>&1; then
  node "$(dirname "${BASH_SOURCE[0]}")/../scripts/gtm-os-connect/connect.mjs" "$brain" --used "$server" "$name" >/dev/null 2>&1 || true
fi
exit 0

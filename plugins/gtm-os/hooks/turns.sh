#!/usr/bin/env bash
# gtm-os UserPromptSubmit and Stop: what the person asked and what the assistant answered, one line
# each into the brain's own log, <brain>/work/turns.jsonl. With work/tool-usage.jsonl (PostToolUse)
# that is a turn: the ask, the calls, the answer. Only when cwd is a brain. The text stays on this
# machine (work/ is git-ignored) and is read by the advisor; never fails the event it observes.
# The payload is JSON with escapes in it, so node parses it (the plugin needs node everywhere else).
set -u
input="$(cat)"
cwd="$(printf '%s' "$input" | sed -n 's/.*"cwd":"\([^"]*\)".*/\1/p' | head -1)"; [ -n "$cwd" ] && [ -d "$cwd" ] || cwd="$PWD"
. "$(dirname "${BASH_SOURCE[0]}")/resolve.sh"
where="$(gtm_os_resolve "$cwd")" || exit 0
case "$where" in MISSING*) exit 0;; esac
brain="${where%%$'\t'*}"; project="${where#*$'\t'}"
command -v node >/dev/null 2>&1 || exit 0
mkdir -p "$brain/work" 2>/dev/null
printf '%s' "$input" | node -e '
let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
  let p; try { p = JSON.parse(s); } catch { return; }
  const kind = p.hook_event_name === "UserPromptSubmit" ? "prompt" : p.hook_event_name === "Stop" ? "answer" : null; if (!kind) return;
  const pick = keys => { for (const k of keys) if (typeof p[k] === "string" && p[k].trim()) return p[k]; return ""; };
  const text = kind === "prompt" ? pick(["prompt", "user_prompt", "message"]) : pick(["last_assistant_message", "final_message", "assistant_message", "message", "response"]);
  // nothing recognised: keep the field names, so a real run teaches the parser the shape
  const rec = { at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), session: p.session_id || "", project: process.argv[2] || "", kind, text: text.slice(0, 600) };
  if (!text) rec.fields = Object.keys(p).sort().join(" ");
  require("fs").appendFileSync(process.argv[1], JSON.stringify(rec) + "\n");
});' "$brain/work/turns.jsonl" "$project" 2>/dev/null || true
exit 0

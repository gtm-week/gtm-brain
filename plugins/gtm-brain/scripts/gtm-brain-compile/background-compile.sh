#!/usr/bin/env bash
# One worker per brain. A saved change starts it; it waits for 2 quiet minutes, then compiles; changes during a run get another pass.
set -u
P="${PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
BRAIN="${1:-.}"; cd "$BRAIN" || exit 1
. "$P/session/resolve.sh"
[ -f AGENTS.md ] && gtm_brain_is . || exit 1
W="$(gtm_brain_work .)"   # work, or .gtm-brain in layout 4 (session/resolve.sh)
mkdir -p "$W"
STATE="$W/compile.json"; LOCK="$W/compile.lock"
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
ATTEMPT=1; TRIES=3; HANDLED=""; BLOCKED=""
write() {
  t="$(sed -n 's/.*"thread":"\([^"\\]*\)".*/\1/p' "$STATE" 2>/dev/null | head -1)"
  printf '{"state":"%s","at":"%s","contexts":"%s","attempt":%s,"tries":%s%s}\n' "$1" "$(now)" "${2:-}" "$ATTEMPT" "$TRIES" "${t:+,\"thread\":\"$t\"}" > "$STATE.$$"
  mv "$STATE.$$" "$STATE"
}
pending() { node "$P/scripts/gtm-brain-compile/compile-status.mjs" .; }
# Publish before claiming the lock, so a busy worker sees that another change arrived.
printf '%s\n' "$$" > "$W/compile.kick"
if TOKEN="$(node "$P/scripts/gtm-brain-compile/worker-lock.mjs" acquire "$LOCK" "$$")"; then :
else
  code=$?; [ "$code" -eq 75 ] && exit 0
  write failed; exit 1
fi
cleanup() {
  node "$P/scripts/gtm-brain-compile/worker-lock.mjs" release "$LOCK" "$TOKEN" || return
  # Close the completion race: a kick that saw our lock must not be lost as we exit.
  # A blocked worker is the exception: another run would compile nothing again.
  if [ -z "$BLOCKED" ] && [ "$(cat "$W/compile.kick" 2>/dev/null)" != "$HANDLED" ]; then
    bash "$P/scripts/gtm-brain-compile/background-compile.sh" "$PWD" >/dev/null 2>&1 &
  fi
}
trap cleanup EXIT
# Batch: a run is a full model session (2026-10-01: about 400k input tokens for one note), so the
# worker waits until no note has been saved for GTM_BRAIN_COMPILE_DELAY seconds (default 120) and then
# compiles everything waiting in one run. Notes saved while it waits extend the wait.
DELAY="${GTM_BRAIN_COMPILE_DELAY:-120}"
# Both places a brain keeps notes (lib/brain-paths.mjs noteFiles), spelled here: this worker runs with node built-ins only.
last_note() { node -e 'const fs=require("fs"),p=require("path");let t=0;const s=f=>{try{t=Math.max(t,fs.statSync(f).mtimeMs)}catch{}};try{for(const c of fs.readdirSync("brain/contexts"))s(p.join("brain/contexts",c,"memories.jsonl"))}catch{}try{for(const f of fs.readdirSync("memories"))if(f.endsWith(".jsonl"))s(p.join("memories",f))}catch{}console.log(Math.floor(t/1000))'; }
# Nothing behind: stop before any wait, with no state written, so the page is never told a summary is coming.
# HANDLED first: the exit cleanup restarts the worker for any kick it did not see, and an early exit
# that had not read the kick would restart itself forever.
HANDLED="$(cat "$W/compile.kick" 2>/dev/null)"
[ "$(pending 2>/dev/null)" = '|' ] && exit 0
if [ "$DELAY" -gt 0 ] 2>/dev/null; then
  while :; do
    quiet=$(( $(date +%s) - $(last_note) ))
    [ "$quiet" -ge "$DELAY" ] && break
    write queued ""
    sleep $(( DELAY - quiet < 30 ? DELAY - quiet : 30 ))
  done
fi
while :; do
  HANDLED="$(cat "$W/compile.kick" 2>/dev/null)"
  STALE=""
  if PENDING="$(pending)"; then
    STALE="${PENDING%%|*}"; [ "$PENDING" = '|' ] && exit 0
    write queued "$STALE"
    node "$P/scripts/gtm-brain-render/render.mjs" . >/dev/null 2>&1 || true
    write running "$STALE"
    GTM_BRAIN_COMPILE_BY=background bash "$P/scripts/gtm-brain-schedule/scheduled-run.sh" .; code=$?
    # 3: the run finished and compiled nothing. Retrying costs a full model run each time and
    # cannot help; the next kick after the cooldown (lib.COMPILE_COOLDOWN_MS) tries again.
    if [ "$code" -eq 3 ]; then BLOCKED=1; write blocked "$STALE"; node "$P/scripts/gtm-brain-render/render.mjs" . >/dev/null 2>&1 || true; exit 1; fi
    if [ "$code" -eq 0 ]; then
      if remaining="$(pending)"; then
        if [ "$remaining" = '|' ]; then
          write done "$STALE"; node "$P/scripts/gtm-brain-render/render.mjs" . >/dev/null 2>&1 || true
          exit 0
        fi
        # Productive passes do not spend the failure budget. Include entity briefs too.
        if [ "$(cat "$W/compile.kick" 2>/dev/null)" != "$HANDLED" ] || node "$P/scripts/gtm-brain-compile/compile-status.mjs" --progress "$PENDING" "$remaining"; then ATTEMPT=1; continue; fi
      fi
    fi
  fi
  write failed "$STALE"; node "$P/scripts/gtm-brain-render/render.mjs" . >/dev/null 2>&1 || true
  [ "$ATTEMPT" -ge "$TRIES" ] && exit 1
  ATTEMPT=$((ATTEMPT + 1)); sleep "${GTM_BRAIN_COMPILE_RETRY:-10}"
done

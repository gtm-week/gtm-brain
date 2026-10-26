#!/usr/bin/env bash
# One worker per brain. Saved changes start immediately; changes during a run get another pass.
set -u
P="${PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
BRAIN="${1:-.}"; cd "$BRAIN" || exit 1
[ -f AGENTS.md ] && [ -f brain/admin.md ] || exit 1
mkdir -p work
STATE=work/compile.json; LOCK=work/compile.lock
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
ATTEMPT=1; TRIES=3; HANDLED=""; BLOCKED=""
write() {
  t="$(sed -n 's/.*"thread":"\([^"\\]*\)".*/\1/p' "$STATE" 2>/dev/null | head -1)"
  printf '{"state":"%s","at":"%s","contexts":"%s","attempt":%s,"tries":%s%s}\n' "$1" "$(now)" "${2:-}" "$ATTEMPT" "$TRIES" "${t:+,\"thread\":\"$t\"}" > "$STATE.$$"
  mv "$STATE.$$" "$STATE"
}
pending() { node "$P/scripts/gtm-brain-compile/compile-status.mjs" .; }
# Publish before claiming the lock, so a busy worker sees that another change arrived.
printf '%s\n' "$$" > work/compile.kick
if TOKEN="$(node "$P/scripts/gtm-brain-compile/worker-lock.mjs" acquire "$LOCK" "$$")"; then :
else
  code=$?; [ "$code" -eq 75 ] && exit 0
  write failed; exit 1
fi
cleanup() {
  node "$P/scripts/gtm-brain-compile/worker-lock.mjs" release "$LOCK" "$TOKEN" || return
  # Close the completion race: a kick that saw our lock must not be lost as we exit.
  # A blocked worker is the exception: another run would compile nothing again.
  if [ -z "$BLOCKED" ] && [ "$(cat work/compile.kick 2>/dev/null)" != "$HANDLED" ]; then
    bash "$P/scripts/gtm-brain-compile/background-compile.sh" "$PWD" >/dev/null 2>&1 &
  fi
}
trap cleanup EXIT
# Batch: a run is a full model session (2026-10-01: about 400k input tokens for one note), so the
# worker waits until no note has been saved for GTM_BRAIN_COMPILE_DELAY seconds (default 600) and then
# compiles everything waiting in one run. Notes saved while it waits extend the wait.
DELAY="${GTM_BRAIN_COMPILE_DELAY:-600}"
last_note() { node -e 'const fs=require("fs"),p=require("path");let t=0;const d="brain/contexts";try{for(const c of fs.readdirSync(d)){try{t=Math.max(t,fs.statSync(p.join(d,c,"memories.jsonl")).mtimeMs)}catch{}}}catch{}console.log(Math.floor(t/1000))'; }
# Nothing behind: stop before any wait, with no state written, so the page is never told a summary is coming.
# HANDLED first: the exit cleanup restarts the worker for any kick it did not see, and an early exit
# that had not read the kick would restart itself forever.
HANDLED="$(cat work/compile.kick 2>/dev/null)"
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
  HANDLED="$(cat work/compile.kick 2>/dev/null)"
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
        if [ "$(cat work/compile.kick 2>/dev/null)" != "$HANDLED" ] || node "$P/scripts/gtm-brain-compile/compile-status.mjs" --progress "$PENDING" "$remaining"; then ATTEMPT=1; continue; fi
      fi
    fi
  fi
  write failed "$STALE"; node "$P/scripts/gtm-brain-render/render.mjs" . >/dev/null 2>&1 || true
  [ "$ATTEMPT" -ge "$TRIES" ] && exit 1
  ATTEMPT=$((ATTEMPT + 1)); sleep "${GTM_BRAIN_COMPILE_RETRY:-10}"
done

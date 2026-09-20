#!/usr/bin/env bash
# One worker per brain. Saved changes start immediately; changes during a run get another pass.
set -u
P="${PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
BRAIN="${1:-.}"; cd "$BRAIN" || exit 1
[ -f AGENTS.md ] && [ -f brain/admin.md ] || exit 1
mkdir -p work
STATE=work/compile.json; LOCK=work/compile.lock
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
ATTEMPT=1; TRIES=3; HANDLED=""
write() {
  t="$(sed -n 's/.*"thread":"\([^"\\]*\)".*/\1/p' "$STATE" 2>/dev/null | head -1)"
  printf '{"state":"%s","at":"%s","contexts":"%s","attempt":%s,"tries":%s%s}\n' "$1" "$(now)" "${2:-}" "$ATTEMPT" "$TRIES" "${t:+,\"thread\":\"$t\"}" > "$STATE.$$"
  mv "$STATE.$$" "$STATE"
}
pending() { node "$P/scripts/gtm-os-compile/compile-status.mjs" .; }
# Publish before claiming the lock, so a busy worker sees that another change arrived.
printf '%s\n' "$$" > work/compile.kick
if TOKEN="$(node "$P/scripts/gtm-os-compile/worker-lock.mjs" acquire "$LOCK" "$$")"; then :
else
  code=$?; [ "$code" -eq 75 ] && exit 0
  write failed; exit 1
fi
cleanup() {
  node "$P/scripts/gtm-os-compile/worker-lock.mjs" release "$LOCK" "$TOKEN" || return
  # Close the completion race: a kick that saw our lock must not be lost as we exit.
  if [ "$(cat work/compile.kick 2>/dev/null)" != "$HANDLED" ]; then
    bash "$P/scripts/gtm-os-compile/background-compile.sh" "$PWD" >/dev/null 2>&1 &
  fi
}
trap cleanup EXIT
while :; do
  HANDLED="$(cat work/compile.kick 2>/dev/null)"
  STALE=""
  if PENDING="$(pending)"; then
    STALE="${PENDING%%|*}"; [ "$PENDING" = '|' ] && exit 0
    write queued "$STALE"
    node "$P/scripts/gtm-os-render/render.mjs" . >/dev/null 2>&1 || true
    write running "$STALE"
    if GTM_OS_COMPILE_BY=background bash "$P/scripts/gtm-os-schedule/scheduled-run.sh" .; then
      if remaining="$(pending)"; then
        if [ "$remaining" = '|' ]; then
          write done "$STALE"; node "$P/scripts/gtm-os-render/render.mjs" . >/dev/null 2>&1 || true
          exit 0
        fi
        # Productive passes do not spend the failure budget. Include entity briefs too.
        if [ "$(cat work/compile.kick 2>/dev/null)" != "$HANDLED" ] || node "$P/scripts/gtm-os-compile/compile-status.mjs" --progress "$PENDING" "$remaining"; then ATTEMPT=1; continue; fi
      fi
    fi
  fi
  write failed "$STALE"; node "$P/scripts/gtm-os-render/render.mjs" . >/dev/null 2>&1 || true
  [ "$ATTEMPT" -ge "$TRIES" ] && exit 1
  ATTEMPT=$((ATTEMPT + 1)); sleep "${GTM_OS_COMPILE_RETRY:-10}"
done

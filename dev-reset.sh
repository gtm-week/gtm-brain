#!/usr/bin/env bash
# Total reset for onboarding testing: wipe the test brain, refresh the gtm-brain plugin from
# this checkout (dev-install.sh), and leave a fresh empty folder for the next run.
#   ./dev-reset.sh [brain-folder]     default: ~/Desktop/test-brain
# Then start a new chat in Codex on the brain folder (restart the app only if old skills linger).
#
# Safety: only wipes a folder that is empty or that this script created earlier (paths are
# recorded in .dev-brains, gitignored). A real brain is never deleted here; do that by hand.
set -eu
R="$(cd "$(dirname "$0")" && pwd)"
BRAIN="${1:-$HOME/Desktop/test-brain}"
case "$BRAIN" in /*) ;; *) BRAIN="$PWD/$BRAIN" ;; esac
REG="$R/.dev-brains"
# Inventory schedules before any destructive action, including when the folder is absent.
node "$R/plugins/gtm-brain/test/live/reset-preflight.mjs" "$BRAIN"

if [ -e "$BRAIN" ]; then
  if [ ! -d "$BRAIN" ]; then echo "$BRAIN exists and is not a folder" >&2; exit 1; fi
  if [ -n "$(ls -A "$BRAIN" 2>/dev/null)" ] && ! grep -qxF "$BRAIN" "$REG" 2>/dev/null; then
    echo "refusing to wipe $BRAIN: not created by this script and not empty" >&2
    echo "delete it yourself if you mean it, then run this again" >&2
    exit 1
  fi
  # Stop the dashboard server the old brain may have left running, then wipe.
  [ -f "$BRAIN/work/dash.json" ] && node "$R/plugins/gtm-brain/server/dash.mjs" "$BRAIN" --stop 2>/dev/null || true
  rm -rf "$BRAIN"
  echo "wiped $BRAIN"
fi
mkdir -p "$BRAIN"
grep -qxF "$BRAIN" "$REG" 2>/dev/null || echo "$BRAIN" >> "$REG"
echo "fresh test brain: $BRAIN (empty, ready for onboarding)"
"$R/dev-install.sh"

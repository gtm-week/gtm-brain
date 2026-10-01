#!/usr/bin/env bash
# Render a release graphic: bash release/template/render.sh [page.html] [out.png]
# 1600x900 at 2x (3200x1800), the size Slack and LinkedIn show without cropping.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PAGE="${1:-$HERE/release.html}"; OUT="${2:-$HERE/out.png}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1600,900 --screenshot="$OUT" "file://$(cd "$(dirname "$PAGE")" && pwd)/$(basename "$PAGE")" 2>/dev/null
echo "$OUT"

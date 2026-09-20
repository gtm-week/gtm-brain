#!/usr/bin/env bash
# gtm-os scheduled run: compile stale contexts, render, commit. For launchd, cron, or by hand.
#   bash scheduled-run.sh /path/to/brain
# Needs: codex (signed in), node, git. Hooks run with trust bypassed because nobody can answer a
# prompt here; that is the documented path for vetted automation.
set -u -o pipefail
P="${PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
BY="${GTM_OS_COMPILE_BY:-schedule}"   # schedule (launchd, cron) or background (kicked by a note)
BRAIN="${1:-.}"; cd "$BRAIN" || exit 1
[ -f AGENTS.md ] && [ -f brain/admin.md ] || { echo "not a brain: $BRAIN"; exit 1; }
mkdir -p work
printf '%s  scheduled-run  start\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> work/hooks.log
PENDING="$(node "$P/scripts/gtm-os-compile/compile-status.mjs" .)" || { printf '%s  scheduled-run  failed: cannot inspect pending compilation\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> work/hooks.log; exit 1; }
STALE="${PENDING%%|*}"; ENTITIES="${PENDING#*|}"
if [ -z "$STALE$ENTITIES" ]; then
  printf '%s  scheduled-run  nothing stale\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> work/hooks.log; echo "nothing stale"; exit 0
fi
echo "stale contexts: $STALE; entity briefs: $ENTITIES"
# The run tells its own session hook what it is (GTM_OS_RUN): the hook then records this run's
# thread on work/compile.json for the page to link, and leaves the person's chat in work/session.json alone.
export GTM_OS_RUN="$BY"
node "$P/scripts/gtm-os-compile/run-bounded.mjs" codex exec -s workspace-write --skip-git-repo-check --dangerously-bypass-hook-trust \
  "You are the scheduled run of the gtm-os-sync skill. Compile these contexts whose summary is behind with by: $BY, following the compilation procedure at $P/skills/gtm-os-use-brain/references/compile.md: $STALE. Then compile these entity briefs with by: $BY using entity_facts and compile_entity, following $P/skills/gtm-os-use-brain/references/entity-compile.md: $ENTITIES. Then render the dashboard. Do not remember anything or edit identity metadata or workplace info. Each compilation tool commits its own result. Report one line per updated brief or context." </dev/null 2>&1 | tail -20 \
  || { printf '%s  scheduled-run  failed: codex exec exited with an error or timed out (%s)\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$STALE" >> work/hooks.log; echo "codex exec failed; any completed compilations remain saved"; exit 1; }
# Verify the scan again before reporting success, even when the model exited normally.
node "$P/scripts/gtm-os-compile/compile-status.mjs" . >/dev/null || { printf '%s  scheduled-run  failed: cannot verify compilation\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> work/hooks.log; exit 1; }
node "$P/scripts/gtm-os-render/render.mjs" . >/dev/null 2>&1 || true
# Compilation tools keep their own changes through lib.commit. No separate commit path.
printf '%s  scheduled-run  done: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$STALE" >> work/hooks.log

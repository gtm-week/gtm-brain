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
# Workflow steps whose gate date passed become a due step and a gate question (lib/workflows.mjs): deterministic, no model.
if due_out="$(node "$P/scripts/gtm-os-workflow/workflow.mjs" . --due --by schedule 2>&1)"; then
  printf '%s  scheduled-run  workflows: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$(printf '%s' "$due_out" | tr '\n' ';')" >> work/hooks.log
else
  printf '%s  scheduled-run  workflows: due check failed: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$(printf '%s' "$due_out" | tr '\n' ';')" >> work/hooks.log
fi
PENDING="$(node "$P/scripts/gtm-os-compile/compile-status.mjs" .)" || { printf '%s  scheduled-run  failed: cannot inspect pending compilation\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> work/hooks.log; exit 1; }
STALE="${PENDING%%|*}"; ENTITIES="${PENDING#*|}"
if [ -z "$STALE$ENTITIES" ]; then
  printf '%s  scheduled-run  nothing stale\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> work/hooks.log; echo "nothing stale"; exit 0
fi
echo "stale contexts: $STALE; entity briefs: $ENTITIES"
# The run tells its own session hook what it is (GTM_OS_RUN): the hook then records this run's
# thread on work/compile.json for the page to link, and leaves the person's chat in work/session.json alone.
export GTM_OS_RUN="$BY"
HEAD_BEFORE="$(git rev-parse -q --verify HEAD 2>/dev/null)"
RUN_ARGS=(); while IFS= read -r -d '' a; do RUN_ARGS+=("$a"); done < <(node "$P/scripts/gtm-os-compile/run-args.mjs" "$P" "$BY" "$STALE" "$ENTITIES")
node "$P/scripts/gtm-os-compile/run-bounded.mjs" codex "${RUN_ARGS[@]}" </dev/null 2>&1 | node "$P/scripts/gtm-os-compile/run-usage.mjs" . "$BY" \
  || { printf '%s  scheduled-run  failed: codex exec exited with an error or timed out (%s)\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$STALE" >> work/hooks.log; echo "codex exec failed; any completed compilations remain saved"; exit 1; }
# Verify the scan again before reporting success, even when the model exited normally.
AFTER="$(node "$P/scripts/gtm-os-compile/compile-status.mjs" .)" || { printf '%s  scheduled-run  failed: cannot verify compilation\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> work/hooks.log; exit 1; }
# A run that compiled nothing is a failure, never "done": exit 3 tells the worker to stop instead of
# retrying (2026-10-01: compile tools hidden from the run, 34 runs in a day, 8M tokens, no summary).
# Progress is a compile commit by this run ("compile: ..." or "compile entity: ..."): a note saved
# during the run can leave the same context behind again after it was compiled. Without commits
# (GTM_OS_NO_COMMIT) the stale lists are compared instead.
compiled() {
  if [ -n "$HEAD_BEFORE" ] && [ -z "${GTM_OS_NO_COMMIT:-}" ]; then git log --format=%s "$HEAD_BEFORE..HEAD" 2>/dev/null | grep -q '^compile'
  else node "$P/scripts/gtm-os-compile/compile-status.mjs" --progress "$PENDING" "$AFTER"; fi
}
if [ "$AFTER" != '|' ] && ! compiled; then
  printf '%s  scheduled-run  failed: no progress, the run compiled nothing (%s)\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$STALE" >> work/hooks.log
  echo "the run compiled nothing; still behind: $STALE"; exit 3
fi
node "$P/scripts/gtm-os-render/render.mjs" . >/dev/null 2>&1 || true
# Compilation tools keep their own changes through lib.commit. No separate commit path.
printf '%s  scheduled-run  done: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$STALE" >> work/hooks.log

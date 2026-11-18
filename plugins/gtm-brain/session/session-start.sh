#!/usr/bin/env bash
# gtm-brain chat start: in a brain folder, pull, rebuild the dashboard, list the contexts, and
# re-load the contexts that were loaded last time, so a chat opens where the last one ended.
# GTM Brain has no Codex hooks: the MCP server runs this on a chat's first GTM Brain call, in the
# chat's folder, and hands its output to the model with that call's result (server.mjs, opening).
set -u
input="$(cat 2>/dev/null || true)"   # JSON from the server: session_id (the chat, when found), cwd
P="${PLUGIN_ROOT:-}"
. "$(dirname "${BASH_SOURCE[0]}")/resolve.sh"
# What differs between Codex and Claude Code: a line of text, or whether this machine can do something.
H="$(dirname "${BASH_SOURCE[0]}")/../lib/host.mjs"
cwd="$(pwd)"; project=""; root="$cwd"
where="$(gtm_brain_resolve "$cwd")" || where=""
case "$where" in
  MISSING*) rest="${where#MISSING$'\t'}"; echo "GTM Brain: this folder points at a brain that is not there: ${rest%%$'\t'*}; run /gtmb-project here to link it to the brain that exists now (the old pointer is replaced). Nothing else runs here."; exit 0;;
  "") ;;
  *) root="${where%%$'\t'*}"; project="${where#*$'\t'}";;
esac
# In a project the person's chat is here, in the linked folder, never in the brain: name it before
# anything else runs, so it is the very first thing the model reads, never the dashboard order.
if [ -n "$project" ]; then
  company="$(node -e 'const l=await import(process.argv[1]);console.log((l.readAdmin(process.argv[2])||{}).company||"")' "$P/lib/brain.mjs" "$root" 2>/dev/null)"
  echo "PROJECT $project of the $company brain at $root. Pass brain: $root and project: $project in every GTM Brain tool call. Say \"$project\" to the person, never the path."
  echo "This linked folder is one working project. For new subprojects or a workspace hierarchy, propose separate folders in $root/projects/ through /gtmb-project. Do not scaffold a brain or nested GTM Brain projects here; preserve ordinary application directories and existing files."
  # A teammate's skill arrives through git; the link into this project is made here, once per session start.
  node -e 'const u=await import(process.argv[1]);u.reconcileProjectSkills(process.argv[2],process.argv[3])' "$P/lib/user-skills.mjs" "$root" "$project" 2>/dev/null || true
fi
# Both the empty-folder and brain branches emit the same authored policy.
interaction_policy() {
  echo "Before the first question you ask the person, read $P/skills/gtmb-start/references/questions.md once; not before a plain answer, and not again later."
  echo "Call GTM Brain tools directly when the host lists them as tools. When the host exposes them only inside a code or script cell, call them there: that is the host's tool path, not a workaround. Either way a result is content parts (never stringify it)."
  cat "$P/policies/questions.md" "$P/policies/computer-use.md"
}
if [ -z "$where" ] || ! gtm_brain_is "$root"; then
  # An almost empty folder is ready for the person's explicit start request: only there does setup
  # need the question policy. Any other folder (someone's code repo) gets no GTM Brain rules at all.
  # Preserve this real hook session before setup; never infer it from an inherited env.
  if [ -f "$P/lib/brain.mjs" ] && command -v node >/dev/null 2>&1 && printf '%s' "$input" | node -e 'const l=await import(process.argv[1]);const fs=await import("node:fs");const input=fs.readFileSync(0,"utf8");process.exit(l.prepareLandingSession(process.argv[2],input)?0:1)' "$P/lib/brain.mjs" "$root" 2>/dev/null; then
    interaction_policy
    echo "GTM Brain: this folder has no company brain yet. If setup was requested, including in a prepared new-chat prompt, follow the gtmb-start skill immediately. On a greeting, proactively offer to set up this folder with one native choice; do not require a slash command. A concrete unrelated task comes first. Do not create a brain without a setup request or submitted choice."
  fi
  # a folder that is not a brain and not linked: when this machine knows a brain, the skill is offered once
  known="$(node -e 'const l=await import(process.argv[1]);console.log(l.knownBrains().map(b=>b.company).join(", "))' "$P/lib/brain.mjs" 2>/dev/null)"
  [ -n "$known" ] && echo "GTM Brain: this folder is not linked to a brain (known: $known). If the person does company work here, offer /gtmb-project once, in half a sentence; never link without a yes."
  exit 0
fi
# A layout 4 brain whose own files on this computer are still in work/ (the owner moved the brain and this
# computer pulled it): they go to .gtm-brain/ once, so the person, the loaded set and the linked projects are kept.
if gtm_brain_old_work "$root"; then
  node --disable-warning=ExperimentalWarning -e 'const f=await import(process.argv[1]);f.adoptWork(process.argv[2])' "$P/lib/layout-four.mjs" "$root" >/dev/null 2>&1 || true
fi
W="$root/$(gtm_brain_work "$root")"   # work, or .gtm-brain in layout 4
LF="$root/$(gtm_brain_layout_file "$root")"
mkdir -p "$W"
# A brain on a newer file layout than this plugin understands (brain/layout.json, lib/layout-version.mjs) is
# read-only here: one line and nothing else, since every step below may write into it.
if [ -f "$LF" ]; then
  blocked="$(node -e 'const v=await import(process.argv[1]);process.stdout.write(v.layoutBlock(process.argv[2]))' "$(dirname "${BASH_SOURCE[0]}")/../lib/layout-version.mjs" "$root" 2>/dev/null || true)"
  [ -n "$blocked" ] && { echo "$blocked"; exit 0; }
fi
# Entity pages in kind folders while brain/layout.json says 1 or is missing (a 0.35 pre-release moved them and
# did not record it): the file is set to 2 in a commit of its own and said in one line, once (lib.healLayout).
# lib.commit does the same with the first write; here a chat that only reads repairs it too. Node starts only
# for a brain that looks like that, so a healthy chat start pays nothing.
if { ! grep -qs '"layout": *[2-9]' "$LF" && ls "$root"/brain/entities/*/index.md >/dev/null 2>&1; } || { gtm_brain_layout3 "$root" && ! grep -qs '"layout": *[3-9]' "$LF"; } || { gtm_brain_layout4 "$root" && ! grep -qs '"layout": *[4-9]' "$LF"; }; then
  node -e 'const l=await import(process.argv[1]);const t=l.healLayout(process.argv[2]);if(t)console.log(t)' "$(dirname "${BASH_SOURCE[0]}")/../lib/brain.mjs" "$root" 2>/dev/null || true
fi
# Remember which Codex chat this is (work/session.json): the dashboard shows which chat is linked.
[ -n "${PLUGIN_ROOT:-}" ] && printf '%s' "$input" | node "$PLUGIN_ROOT/session/session.mjs" "$root" "$project" 2>/dev/null || true
# This machine has opened this brain: known to /gtmb-project when it offers the skill elsewhere. Then, in the same
# node, a direct edit of a protected file is put back before anything reads or commits it (lib.guardProtected); in
# layout 3 a hand edit under about-us/ or config/ by someone other than the owner becomes a proposal for the owner
# (lib/owner.mjs).
node -e 'const l=await import(process.argv[1]);try{l.registerBrain(process.argv[2])}catch{}const t=l.guardAtStart(process.argv[2]);if(t)console.log(t)' "$P/lib/brain.mjs" "$root" 2>/dev/null || true
# Every change in the brain is kept: a project folder an older version kept out of git is shared now; the
# background maintenance then keeps what changed since the last save (lib.save covers the whole brain).
node "$P/skills/gtmb-project/project.mjs" "$root" --share >/dev/null 2>&1 || true
P="${PLUGIN_ROOT:-}"
# A clone has no local git config: point the pre-commit hook at this plugin's lib every session.
if [ -n "$P" ] && [ -f "$P/lib/brain.mjs" ] && [ -d "$root/.githooks" ]; then
  git -C "$root" config core.hooksPath .githooks 2>/dev/null || true
  git -C "$root" config gtm-brain.lib "$P/lib/brain.mjs" 2>/dev/null || true
  # Previous brain hooks keep validating until the person refreshes their rulebook.
  git -C "$root" config gtm-os.lib "$P/lib/brain.mjs" 2>/dev/null || true
fi
command -v node >/dev/null 2>&1 || { echo "brain: $(basename "$root") (node not found; skills unavailable)"; exit 0; }
# Maintenance owns network checks and rendering outside the foreground hook.
P="${PLUGIN_ROOT:-}"
node "$P/session/session-maintenance.mjs" "$root" --start "$project" >/dev/null 2>&1 || true
# The middle lines, in one node (session/start-middle.mjs): a file too big for git (a video, a recording, never
# committed: Codex is told, to offer the shared drive), the dashboard line, which brain (the first call of a chat is
# no longer a status call, so the name and the folder to pass are said whole), a sharing problem (lib.syncNotice), the
# chats and foreign-files lines, the rulebook line (Claude Code without the CLAUDE.md import), the layout and owner
# lines, the question policy, today's dates, the schedule and capture notices, the rulebook rows, the answer line
# (the dashboard said once: not before an answer), a handoff waiting under ~/.gtm-brain and the onboarding continuation.
rules_dir="$root"; [ -n "$project" ] && rules_dir="$cwd"
node "$P/session/start-middle.mjs" "$root" "$project" "$W" "$(gtm_brain_settings "$root")" "$rules_dir" 2>/dev/null || true
loaded="$(node -e 'try{console.log((JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).loaded||[]).join(" "))}catch{console.log("")}' "$W${project:+/projects/$project}/loaded-contexts.json" 2>/dev/null)"
# Contexts about to be re-loaded in full below are listed on one line each.
brief=""; [ -n "$loaded" ] && [ -f "$P/scripts/gtm-brain-load/load.mjs" ] && brief="--brief-loaded"
[ -f "$P/scripts/gtm-brain-contexts/contexts.mjs" ] && ( cd "$root" && node "$P/scripts/gtm-brain-contexts/contexts.mjs" . ${project:+--project "$project"} $brief 2>/dev/null | tail -n +2 | sed 's/^/  /' )
if [ -n "$loaded" ] && [ -f "$P/scripts/gtm-brain-load/load.mjs" ]; then
  echo; echo "Re-loading what was loaded last time${project:+ in project $project}: $loaded"
  lo="$( cd "$root" && node "$P/scripts/gtm-brain-load/load.mjs" . $loaded --only --last 0 ${project:+--project "$project"} 2>/dev/null )"; printf '%s\n' "$lo"
  echo; echo "If the person starts on something else, switch: load the fitting context, or offer a new one (AGENTS.md rule 1)."
else
  echo "Nothing loaded yet, and a question needs no load. For work that writes, infer a context from the request; ask what they are working on only when no task is known (AGENTS.md rule 1)."
fi
# The closing lines, in one node (session/start-lines.mjs): the cached connector status (the worker refreshes it); one
# health line (why meetings may be missing, the last summary run and error, the last sync per tool, the open meeting
# gaps, a Markdown at the root not used yet; lib/health-line.mjs); the documents (rule 11 points at them; absolute
# paths in a linked project); the approved files (a graphic never takes an old copy); the workflow runs in progress;
# folders at the top GTM Brain does not use (named once per set, never touched); rules from an older GTM Brain
# (ALL-204: unedited ones refreshed, edited ones offered); RULES.md and the projects; Ask the source; SCHEMA.md;
# summaries paused by a hand edit; new files with no recorded reason; last, a newer GTM Brain where this install came
# from (checked in the background at most once a day, a shallow fetch of one ref, never in the chat start's own time;
# the last result is said here and shown on the page).
node "$P/session/start-lines.mjs" "$root" "$project" "$P/templates" "$W" 2>/dev/null || true
printf '%s  SessionStart  loaded=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${loaded:-none}" >> "$W/hooks.log"
exit 0

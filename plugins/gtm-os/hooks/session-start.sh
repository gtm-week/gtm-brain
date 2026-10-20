#!/usr/bin/env bash
# gtm-os SessionStart: in a brain folder, pull, rebuild the dashboard, list the contexts, and
# re-load the contexts that were loaded last time, so a session opens where the last one ended.
set -u
input="$(cat 2>/dev/null || true)"   # the hook's JSON: session_id, cwd, ...
P="${PLUGIN_ROOT:-}"
. "$(dirname "${BASH_SOURCE[0]}")/resolve.sh"
# What differs between Codex and Claude Code: a line of text, or whether this machine can do something.
H="$(dirname "${BASH_SOURCE[0]}")/../lib/host.mjs"
cwd="$(pwd)"; project=""; root="$cwd"
where="$(gtm_os_resolve "$cwd")" || where=""
case "$where" in
  MISSING*) rest="${where#MISSING$'\t'}"; echo "GTM OS: this folder points at a brain that is not there: ${rest%%$'\t'*}; run /gtm-os-project here to link it to the brain that exists now (the old pointer is replaced). Nothing else runs here."; exit 0;;
  "") ;;
  *) root="${where%%$'\t'*}"; project="${where#*$'\t'}";;
esac
# In a project the person's chat is here, in the linked folder, never in the brain: name it before
# anything else runs, so it is the very first thing the model reads, never the dashboard order.
if [ -n "$project" ]; then
  company="$(node -e 'const l=await import(process.argv[1]);console.log((l.readAdmin(process.argv[2])||{}).company||"")' "$P/lib/brain.mjs" "$root" 2>/dev/null)"
  echo "PROJECT $project of the $company brain at $root. Pass brain: $root and project: $project in every GTM OS tool call. Say \"$project\" to the person, never the path."
  echo "This linked folder is one working project. For new subprojects or a workspace hierarchy, propose separate folders directly inside $root through /gtm-os-project. Do not scaffold a brain or nested GTM OS projects here; preserve ordinary application directories and existing files."
  # A teammate's skill arrives through git; the link into this project is made here, once per session start.
  node -e 'const u=await import(process.argv[1]);u.reconcileProjectSkills(process.argv[2],process.argv[3])' "$P/lib/user-skills.mjs" "$root" "$project" 2>/dev/null || true
fi
# Both the empty-folder and brain branches emit the same authored policy.
interaction_policy() {
  echo "Before the first question that uses a form (question, configuration_question, onboarding_question), read $P/skills/gtm-os-start/references/questions.md once for the tool parameters; not before a plain answer, and not again later."
  echo "Call GTM OS tools directly when the host lists them as tools. When the host exposes them only inside a code or script cell, call them there: that is the host's tool path, not a workaround. Either way a result is content parts (never stringify it)."
  cat "$P/policies/questions.md" "$P/policies/computer-use.md"
}
# In the brain itself the host has already loaded AGENTS.md (Claude Code through CLAUDE.md), which
# carries generated copies of both policies: printing them again costs every request of the chat. A
# linked project folder's AGENTS.md is only a pointer, and an old brain may predate the generated
# blocks or the CLAUDE.md import, so those still get them.
brain_interaction_policy() {
  if [ -z "$project" ] && node "$H" rulebook "$root" 2>/dev/null && grep -q '<!-- generated: questions' "$root/AGENTS.md" 2>/dev/null && grep -q '<!-- generated: computer-use' "$root/AGENTS.md" 2>/dev/null; then
    echo "Before the first question that uses a form (question, configuration_question, onboarding_question), read $P/skills/gtm-os-start/references/questions.md once for the tool parameters; not before a plain answer, and not again later."
  else
    interaction_policy
  fi
}
if [ -z "$where" ] || [ ! -f "$root/brain/admin.md" ]; then
  # An almost empty folder is ready for the person's explicit start request: only there does setup
  # need the question policy. Any other folder (someone's code repo) gets no GTM OS rules at all.
  # Preserve this real hook session before setup; never infer it from an inherited env.
  if [ -f "$P/lib/brain.mjs" ] && command -v node >/dev/null 2>&1 && printf '%s' "$input" | node -e 'const l=await import(process.argv[1]);const fs=await import("node:fs");const input=fs.readFileSync(0,"utf8");process.exit(l.prepareLandingSession(process.argv[2],input)?0:1)' "$P/lib/brain.mjs" "$root" 2>/dev/null; then
    interaction_policy
    echo "GTM OS: this folder has no company brain yet. If setup was requested, including in a prepared new-chat prompt, follow the gtm-os-start skill immediately. On a greeting, proactively offer to set up this folder with one native choice; do not require a slash command. A concrete unrelated task comes first. Do not create a brain without a setup request or submitted choice."
  fi
  # a folder that is not a brain and not linked: when this machine knows a brain, the skill is offered once
  known="$(node -e 'const l=await import(process.argv[1]);console.log(l.knownBrains().map(b=>b.company).join(", "))' "$P/lib/brain.mjs" 2>/dev/null)"
  [ -n "$known" ] && echo "GTM OS: this folder is not linked to a brain (known: $known). If the person does company work here, offer /gtm-os-project once, in half a sentence; never link without a yes."
  exit 0
fi
mkdir -p "$root/work"
# Remember which Codex chat this is (work/session.json): the dashboard shows which chat is linked.
[ -n "${PLUGIN_ROOT:-}" ] && printf '%s' "$input" | node "$PLUGIN_ROOT/hooks/session.mjs" "$root" "$project" 2>/dev/null || true
# This machine has opened this brain: known to /gtm-os-project when it offers the skill elsewhere.
node -e 'const l=await import(process.argv[1]);l.registerBrain(process.argv[2])' "$P/lib/brain.mjs" "$root" 2>/dev/null || true
P="${PLUGIN_ROOT:-}"
# A clone has no local git config: point the pre-commit hook at this plugin's lib every session.
if [ -n "$P" ] && [ -f "$P/lib/brain.mjs" ] && [ -d "$root/.githooks" ]; then
  git -C "$root" config core.hooksPath .githooks 2>/dev/null || true
  git -C "$root" config gtm-os.lib "$P/lib/brain.mjs" 2>/dev/null || true
fi
command -v node >/dev/null 2>&1 || { echo "brain: $(basename "$root") (node not found; skills unavailable)"; exit 0; }
# Maintenance owns network checks and rendering outside the foreground hook.
P="${PLUGIN_ROOT:-}"
node "$P/hooks/session-maintenance.mjs" "$root" --start "$project" >/dev/null 2>&1 || true
url="$(node -e 'try{const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.kill(s.pid,0);console.log(s.url+(process.argv[2]?"#view=home&project="+encodeURIComponent(process.argv[2]):""))}catch{}' "$root/work/dash.json" "$project" 2>/dev/null)"
# The legacy dashboard_browser value is ignored; the dashboard belongs in the Codex pane.
mode="$(node -e 'const l=await import(process.argv[1]);const a=l.readAdmin(process.argv[2])||{};console.log(a.dashboard==="on-demand"?"on-demand":"always")' "$P/lib/brain.mjs" "$root" 2>/dev/null || echo 'always')"
# The PROJECT line above already named this project; here only the dashboard link, never its order.
if [ -n "$project" ]; then
  [ -n "$url" ] && echo "Dashboard: $url (the brain's own chat opens it; here give it as a link when asked)."
# A separate run (GTM_OS_RUN) has no person in it: no dashboard to open.
elif [ -n "${GTM_OS_RUN:-}" ]; then
  :
elif [ -n "$url" ] && [ "$mode" = "always" ]; then
  node "$H" text dashboardAlways "$url"
elif [ -n "$url" ]; then
  node "$H" text dashboardOnDemand "$url"
fi
echo "brain: $(basename "$root")  ·  admin: brain/admin.md (always loaded)"
# Other chats are linked, never entered: the person opens them, or not.
node "$H" text chats
# Claude Code reads CLAUDE.md: without its AGENTS.md import (a brain from before 0.30) the rulebook is named here.
rules_dir="$root"; [ -n "$project" ] && rules_dir="$cwd"
node "$H" rulebook "$rules_dir" 2>/dev/null || node "$H" text rulebook "$root"
node -e 'const l=await import(process.argv[1]);const p=l.currentPerson(process.argv[2]);if(p)console.log("Current person: "+p+" (resolved from this checkout and validated against the team). Reuse this as by; do not ask who the user is again.")' "$P/lib/brain.mjs" "$root" 2>/dev/null || true
brain_interaction_policy
echo "Answer the person's request using relevant saved evidence. Never open, inspect or refresh the dashboard before an ordinary answer. Maintenance runs in the background; external source sync runs only when requested or by an approved schedule. An explicit dashboard or sync request follows its normal workflow."
# A handoff another assistant wrote by following IMPORT.md waits under ~/.gtm-os until it is imported
# (the gtm-os-start skill offers to delete it). Said once per chat; the model offers, never imports by itself.
hh="${GTM_OS_HOME:-$HOME}/.gtm-os"
for hf in "$hh/handoff.md" "$hh/claude-export.md"; do
  if [ -f "$hf" ]; then
    hby="$(sed -n 's/^by: *//p' "$hf" | head -1)"; hc="$(sed -n 's/^confirmed: *//p' "$hf" | head -1)"
    echo "HANDOFF waiting: $hf (by ${hby:-another assistant}, confirmed: ${hc:-unknown}; skill gtm-os-start). Offer once, in one line, to bring it in; every line is played back before it enters the brain."
    break
  fi
done
# One persisted workflow flag drives both hook and MCP continuation, including fresh chats.
ob="$(node -e 'const l=await import(process.argv[1]);console.log(l.onboardingInstruction(process.argv[2],{project:process.argv[3]}))' "$P/lib/brain.mjs" "$root" "$project" 2>/dev/null)"
[ -n "$ob" ] && printf '%s\n' "$ob"
loaded="$(node -e 'try{console.log((JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).loaded||[]).join(" "))}catch{console.log("")}' "$root/work${project:+/projects/$project}/loaded-contexts.json" 2>/dev/null)"
# Contexts about to be re-loaded in full below are listed on one line each.
brief=""; [ -n "$loaded" ] && [ -f "$P/scripts/gtm-os-load/load.mjs" ] && brief="--brief-loaded"
[ -f "$P/scripts/gtm-os-contexts/contexts.mjs" ] && ( cd "$root" && node "$P/scripts/gtm-os-contexts/contexts.mjs" . ${project:+--project "$project"} $brief 2>/dev/null | tail -n +2 | sed 's/^/  /' )
if [ -n "$loaded" ] && [ -f "$P/scripts/gtm-os-load/load.mjs" ]; then
  echo; echo "Re-loading what was loaded last time${project:+ in project $project}: $loaded"
  lo="$( cd "$root" && node "$P/scripts/gtm-os-load/load.mjs" . $loaded --only --last 0 ${project:+--project "$project"} 2>/dev/null )"; printf '%s\n' "$lo"
  # compile: background: a separate run updates them; the chat never compiles and never offers to
  if printf '%s' "$lo" | grep -q 'summary updating' && ! node "$H" can compile; then
    echo; node "$H" text noCompile
  elif printf '%s' "$lo" | grep -q 'summary updating'; then
    ( cd "$root" && node -e 'const l=await import(process.argv[1]);l.kickCompile(".")' "$P/lib/brain.mjs" >/dev/null 2>&1 & )
    echo; echo "compile: background (brain/admin.md): the summaries that are behind will be updated by a separate run shortly (after each saved change). Use those words, 'summary updating shortly'; never 'behind', never compile or offer to compile in this chat."
  fi
  echo; echo "If the person starts on something else, switch: load the fitting context, or offer a new one (AGENTS.md rule 1)."
else
  echo "Nothing loaded yet. If a pending onboarding instruction above applies, follow its next step. Otherwise infer a context from the request; ask what they are working on only when no task is known (AGENTS.md rule 1)."
fi
# Cached connector status is sufficient for orientation. The worker refreshes it.
if [ -f "$root/work/tools.json" ]; then
  tools="$(node -e 'try{const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(Object.values(t).map(x=>`${(x.tool||"").toLowerCase().replace(/\s*\(.*\)$/,"")} ${x.status==="installed"?(x.test==="ok"?"●":"○"):x.declined?"skipped":"✕"}`).join("  "))}catch{console.log("")}' "$root/work/tools.json")"
  [ -n "$tools" ] && echo "tools: $tools   (● read test ok, ○ installed not tested, ✕ not connected, skipped = declined, never offered again; say: connect my tools)"
else
  node "$H" text toolsUnchecked
fi
# The documents (root Markdown with kind: document): what the work must follow, named every chat so rule 11
# has something to point at; absolute paths in a linked project, where the landing pages get built.
node -e 'const d=await import(process.argv[1]);console.log(d.documentsLine(process.argv[2],{absolute:!!process.argv[3]}))' "$P/lib/documents.mjs" "$root" "$project" 2>/dev/null || true
# Workflow runs in progress (lib/workflows.mjs): named once, so a due step is mentioned and "next step" follows the skill.
node -e 'const w=await import(process.argv[1]);const l=w.runsLine(process.argv[2]);if(l)console.log(l)' "$P/lib/workflows.mjs" "$root" 2>/dev/null || true
# Folders at the top GTM OS does not use (a migrated brain's company/, assets/): named once per set, never touched.
[ -z "$project" ] && { node -e 'const d=await import(process.argv[1]);const h=d.strayFoldersHint(process.argv[2]);if(h)console.log(h)' "$P/lib/documents.mjs" "$root" 2>/dev/null || true; }
# Rules from an older GTM OS keep naming tools and habits the plugin has moved on from (ALL-204).
# The offer always carries why: what the newer rules change since this brain's version.
node -e 'const u=await import(process.argv[1]);const o=u.rulesOffer(process.argv[2],process.argv[3]);if(o)console.log(o)' "$P/lib/upgrade-files.mjs" "$root" "$P/templates" 2>/dev/null || true
# A newer GTM OS where this install came from: checked in the background at most once a day (a shallow
# fetch of one ref, never in the hook's own time); the last result is said here and shown on the page.
if [ -z "${GTM_OS_NO_VERSION_CHECK:-}" ] && [ -f "$P/scripts/gtm-os-update-plugin/check-version.mjs" ] && node "$H" can update-check; then
  # due: no check yet, a check older than a day, or a check made by another version of the plugin (ALL-211)
  due="$(node -e 'try{const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")),v=JSON.parse(require("fs").readFileSync(process.argv[2],"utf8")).version;console.log(Date.now()-Date.parse(s.checkedAt||0)>86400000||s.installed!==v?"yes":"")}catch{console.log("yes")}' "$root/work/plugin-version.json" "$P/.codex-plugin/plugin.json")"
  [ -n "$due" ] && ( cd "$root" && nohup node "$P/scripts/gtm-os-update-plugin/check-version.mjs" . >/dev/null 2>&1 & )
fi
pv="$(node -e 'try{const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(s.status==="newer")console.log(`${s.latest} (installed ${s.installed})`)}catch{}' "$root/work/plugin-version.json" 2>/dev/null)"
pv_latest="${pv%% *}"; pv_installed="${pv#*installed }"; pv_installed="${pv_installed%)}"
[ -n "$pv" ] && node "$H" can update-check && echo "GTM OS UPDATE available: $pv. Offer once, in one line, in these words: \"You are on $pv_installed, GTM OS $pv_latest is available. Say: update GTM OS. When it finishes, quit and reopen Codex, then start a new chat in this folder.\" Never run it without a yes (skill gtm-os-configure). If the update says Codex's copy is behind GitHub, the fix is git's own GitHub sign-in: gh auth login, then gh auth setup-git."
echo "Dashboard maintenance requested in the background. Use open_dashboard when the person asks to see it."
printf '%s  SessionStart  loaded=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${loaded:-none}" >> "$root/work/hooks.log"
exit 0

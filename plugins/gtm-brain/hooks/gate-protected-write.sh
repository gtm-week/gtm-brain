#!/usr/bin/env bash
# gtm-brain PreToolUse gate, matched on apply_patch and the shell tools (see hooks.json).
#
#   brain/admin.md                    denied. Changes go through the gtm-brain-configure workplace-change procedure:
#                                     Codex proposes, the person types APPROVE, the script applies and commits.
#   brain/contexts/*/memories.jsonl   denied. Append-only; only the remember tool writes it.
#   Entity files are editable; their reader validates format and proposes repairs when needed.
#   brain/ontology.ossie.json         denied. This company's interactions; propose_interaction, then a person approves.
#   anything under .claude                      denied, reads too, in a brain and the folders inside it. Claude's memory is
#                                               Claude's; the import path is ~/.gtm-brain/handoff.md (IMPORT.md).
#
# A linked folder outside the brain is usually someone's code repo: its own brain/ and .claude/ are its
# business. There only the brain's files, named by the brain's path, are protected (Maksymilian, 2026-10-01).
#
# apply_patch: any mention of a protected path is a write. Shell commands: denied when the
# command names a protected path and looks like a write (redirection, sed -i, tee, rm, mv, cp,
# truncate, a script writing files). Reads (cat, grep, git diff) pass. This is best effort: it
# stops mistakes, not a determined agent; the pre-commit hook's append-only check is the
# backstop, and git history the audit.
# Every decision is logged to <brain>/work/hooks.log. System-agnostic: bash, grep, sed only.
set -u
input="$(cat)"
tool="$(printf '%s' "$input" | sed -n 's/.*"tool_name":"\([^"]*\)".*/\1/p' | head -1)"
cwd="$(printf '%s' "$input" | sed -n 's/.*"cwd":"\([^"]*\)".*/\1/p' | head -1)"; [ -n "$cwd" ] && [ -d "$cwd" ] || cwd="$PWD"
. "$(dirname "${BASH_SOURCE[0]}")/resolve.sh"
# Only a brain or a folder linked to one has anything to protect: every other repo passes untouched.
where="$(gtm_brain_resolve "$cwd" 2>/dev/null)" || exit 0
case "$where" in MISSING*|"") exit 0;; esac
logdir="${where%%$'\t'*}"
[ -f "$logdir/brain/admin.md" ] || exit 0
outside=""
if [ -n "${where#*$'\t'}" ]; then
  real_root="$(cd "$logdir" && pwd -P)"
  case "$(cd "$cwd" && pwd -P)/" in "$real_root"/*) ;; *) outside=1;; esac
fi
session="$(printf '%s' "$input" | sed -n 's/.*"session_id":"\([^"]*\)".*/\1/p' | head -1)"
# What to check comes from lib/host.mjs: an edit's targets only (patch contents can quote brain paths
# while editing plugin source), a Claude shell call's command only (its payload always names
# ~/.claude), a Codex shell call's whole payload. foreign is the other assistant's home folder.
gi="$(printf '%s' "$input" | node "$(dirname "${BASH_SOURCE[0]}")/../lib/host.mjs" gate-input)" || exit 2
kind="${gi%%$'\n'*}"; gi="${gi#*$'\n'}"; foreign="${gi%%$'\n'*}"; gi="${gi#*$'\n'}"
foreign_reason="${gi%%$'\n'*}"; input="${gi#*$'\n'}"
# Outside the brain a brain/ path is the repo's own unless it runs through the brain's folder.
if [ -n "$outside" ]; then
  # bash 3.2 splits a pattern at a literal slash even inside quotes: patterns go through variables.
  m=$'\001'; b="brain/"
  # By the brain folder's name: the same brain is /var/x or /private/var/x, ~/x or ../x.
  for p in "/${logdir##*/}/brain/" "/${real_root##*/}/brain/"; do input="${input//"$p"/$m}"; done
  input="${input//"$b"/_brain_/}"; input="${input//$m/brain/}"
fi
paths="$(printf '%s' "$input" | grep -oE 'brain/[A-Za-z0-9_./-]+' | sort -u | tr '\n' ' ')"
log() { mkdir -p "$logdir/work" 2>/dev/null; printf '%s  PreToolUse  %-5s  paths=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "${paths:-none}" >> "$logdir/work/hooks.log" 2>/dev/null || true; }
deny() { log DENY; printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"; printf 'gtm-brain: %s\n' "$1" >&2; exit 2; }
# The other assistant's home (~/.claude under Codex, ~/.codex under Claude Code) is its own memory,
# reads included. The only path is IMPORT.md run inside the other assistant, which writes
# ~/.gtm-brain/handoff.md. Checked before the read/write split below, because a read is also denied.
if [ -z "$outside" ] && printf '%s' "$input" | grep -qE "\\.${foreign#.}"'([./"'"'"'[:space:]]|$)'; then
  deny "$foreign_reason"
fi
# APPROVE is the person's word, not the model's: applying a proposal needs this chat's last prompt
# (work/turns.jsonl, written by turns.sh) to start with APPROVE. Auto modes skip the permission prompt.
if [ "$kind" != edit ] && printf '%s' "$input" | grep -q 'gtm-brain-approve/approve\.mjs' && printf '%s' "$input" | grep -qE -- '--(apply|interaction)'; then
  node -e 'const l=await import(process.argv[1]);process.exit(l.approvedByPerson(process.argv[2],process.argv[3])?0:1)' "$(dirname "${BASH_SOURCE[0]}")/../lib/brain.mjs" "$logdir" "$session" 2>/dev/null \
    || deny 'Applying a proposal needs the person to type APPROVE as their own last message in this chat. Ask them to type APPROVE; never run it on another answer.'
fi
case "$kind:$tool" in
  edit:*|*:) ;;
  *) # a shell command: only writes are denied
    if ! printf '%s' "$input" | grep -qE '(>|\\u003e|\btee\b|sed +(--in-place(=|[[:space:]]|$)|-[a-zA-Z]*i)|perl +-[a-zA-Z]*i|\brm\b|\bmv\b|\bcp\b|\btruncate\b|writeFile|appendFile|open\([^)]*["'"'"'](w|a)|\bdd\b|\bpython3? +-c\b)'; then
      printf '%s\n' "$input" >/dev/null; exit 0
    fi;;
esac

# The prompt log is the evidence APPROVE is checked against: only the turns hook writes it. Any
# spelling counts (cd work && ... turns.jsonl). Like every path rule here this is a guard, not a
# sandbox: the host's own permission prompt stays the second factor.
if printf '%s' "$input" | grep -q 'turns\.jsonl'; then
  deny 'work/turns.jsonl is the record of what the person typed and is written only by GTM Brain itself.'
fi
if printf '%s' "$input" | grep -qE 'brain/contexts/[^/"]+/memories\.jsonl'; then
  deny 'memories.jsonl is append-only and written only by the remember tool. Use remember.'
fi
if printf '%s' "$input" | grep -q 'brain/ontology.ossie.json'; then
  deny 'brain/ontology.ossie.json holds this company'"'"'s interactions and is protected. Propose a change with propose_interaction (a person approves it in Codex with APPROVE); never edit it directly.'
fi
if printf '%s' "$input" | grep -q 'brain/admin.md'; then
  deny 'brain/admin.md is protected. Write the proposed version to work/admin.proposed.md, show the diff, and wait for the person to type APPROVE; then run the gtm-brain-configure workplace-change procedure.'
fi
[ -n "$outside" ] || log ALLOW; exit 0

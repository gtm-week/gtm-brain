#!/usr/bin/env bash
# gtm-os PreToolUse gate, matched on apply_patch and the shell tools (see hooks.json).
#
#   brain/admin.md                    denied. Changes go through the gtm-os-configure workplace-change procedure:
#                                     Codex proposes, the person types APPROVE, the script applies and commits.
#   brain/contexts/*/memories.jsonl   denied. Append-only; only the remember tool writes it.
#   Entity files are editable; their reader validates format and proposes repairs when needed.
#   brain/ontology.ossie.json         denied. This company's interactions; propose_interaction, then a person approves.
#   anything under .claude                      denied, reads too. Claude's memory is Claude's;
#                                               the import path is ~/.gtm-os/handoff.md (IMPORT.md).
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
logdir="$cwd"; where="$(gtm_os_resolve "$cwd" 2>/dev/null)" && case "$where" in MISSING*) ;; *) logdir="${where%%$'\t'*}";; esac
# Patch contents can quote brain paths while editing plugin source. Inspect actual targets only.
if [ "$tool" = "apply_patch" ]; then
  input="$(printf '%s' "$input" | node -e 'const fs=require("node:fs");const x=JSON.parse(fs.readFileSync(0,"utf8"));const p=typeof x.tool_input==="string"?x.tool_input:x.tool_input?.input||x.tool_input?.patch||"";const targets=p.split(/\n/).filter(l=>/^\*\*\* (?:Add File|Update File|Delete File|Move to): /.test(l));console.log(targets.length?targets.join("\n"):JSON.stringify(x.tool_input))')" || exit 2
fi
paths="$(printf '%s' "$input" | grep -oE 'brain/[A-Za-z0-9_./-]+' | sort -u | tr '\n' ' ')"
log() { mkdir -p "$logdir/work" 2>/dev/null; printf '%s  PreToolUse  %-5s  paths=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "${paths:-none}" >> "$logdir/work/hooks.log" 2>/dev/null || true; }
deny() { log DENY; printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"; printf 'gtm-os: %s\n' "$1" >&2; exit 2; }
# ~/.claude is Claude's own memory, reads included: Codex has no business in it. The only
# path is IMPORT.md run inside the other assistant, which writes ~/.gtm-os/handoff.md.
# Checked before the read/write split below, because for this path a read is also denied.
if printf '%s' "$input" | grep -q '\.claude'; then
  deny 'Files under .claude belong to Claude and are off limits, reads included. To import what Claude knows, have Claude read IMPORT.md from the GTM OS repository (or run the plugin gtm-os-export skill with claude -p); it writes ~/.gtm-os/handoff.md, and the gtm-os-start skill reads that.'
fi
case "$tool" in
  apply_patch|"") ;;
  *) # a shell command: only writes are denied
    if ! printf '%s' "$input" | grep -qE '(>|\\u003e|\btee\b|sed +(--in-place(=|[[:space:]]|$)|-[a-zA-Z]*i)|perl +-[a-zA-Z]*i|\brm\b|\bmv\b|\bcp\b|\btruncate\b|writeFile|open\([^)]*["'"'"'](w|a)|\bdd\b|\bpython3? +-c\b)'; then
      printf '%s\n' "$input" >/dev/null; exit 0
    fi;;
esac

if printf '%s' "$input" | grep -qE 'brain/contexts/[^/"]+/memories\.jsonl'; then
  deny 'memories.jsonl is append-only and written only by the remember tool. Use remember.'
fi
if printf '%s' "$input" | grep -q 'brain/ontology.ossie.json'; then
  deny 'brain/ontology.ossie.json holds this company'"'"'s interactions and is protected. Propose a change with propose_interaction (a person approves it in Codex with APPROVE); never edit it directly.'
fi
if printf '%s' "$input" | grep -q 'brain/admin.md'; then
  deny 'brain/admin.md is protected. Write the proposed version to work/admin.proposed.md, show the diff, and wait for the person to type APPROVE; then run the gtm-os-configure workplace-change procedure.'
fi
log ALLOW; exit 0

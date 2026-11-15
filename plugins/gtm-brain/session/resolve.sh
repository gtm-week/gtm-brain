#!/usr/bin/env bash
# gtm-brain: where the brain is, from any working directory. Sourced by every hook.
#   gtm_brain_resolve <dir>   prints "root<TAB>project" (project empty when <dir> is the brain itself),
#                          or "MISSING<TAB>brain<TAB>project" when a pointer names a brain that is gone,
#                          or nothing with exit 1 when <dir> is neither a brain nor inside a linked folder.
# A linked folder carries a block in its AGENTS.md (lib.writePointer): two lines, "GTM Brain project: <slug>"
# and "GTM Brain brain: <path>". The walk goes up to the git root, or the filesystem root. Mirrors lib.resolveBrain.
# bash, grep and sed only: this runs inside the shell hooks before node is known to exist.
# gtm_brain_is <dir>: a brain folder, either settings file there. Mirrors lib/brain-paths.mjs isBrain (layouts 1
# and 2 keep brain/admin.md, layout 3 config/settings.yaml); every shell script asks here, never the path itself.
gtm_brain_is() { [ -f "$1/brain/admin.md" ] || [ -f "$1/config/settings.yaml" ]; }
# gtm_brain_layout3 <dir>: about-us/ and config/ (lib/brain-paths.mjs inConfigFolders).
gtm_brain_layout3() { [ -f "$1/config/settings.yaml" ]; }
# gtm_brain_settings <dir>: the settings file, relative to the brain (lib/brain-paths.mjs settingsFile).
gtm_brain_settings() { if gtm_brain_layout3 "$1"; then echo config/settings.yaml; else echo brain/admin.md; fi; }
gtm_brain_resolve() {
  local d="$1" b p
  [ -d "$d" ] || return 1
  d="$(cd "$d" && pwd)"   # logical, as lib.resolveBrain: /var/... stays /var/..., never /private/var/...
  while :; do
    if gtm_brain_is "$d"; then printf '%s\t\n' "$d"; return 0; fi
    if [ -f "$d/AGENTS.md" ] && grep -Eq '^<!-- gtm-(brain|os) project -->' "$d/AGENTS.md"; then
      b="$(sed -En 's/^GTM (Brain|OS) brain: //p' "$d/AGENTS.md" | head -1)"; p="$(sed -En 's/^GTM (Brain|OS) project: //p' "$d/AGENTS.md" | head -1)"
      if [ -n "$b" ] && [ -n "$p" ]; then
        if gtm_brain_is "$b"; then printf '%s\t%s\n' "$b" "$p"; return 0; fi
        printf 'MISSING\t%s\t%s\n' "$b" "$p"; return 0
      fi
    fi
    [ -e "$d/.git" ] && return 1
    [ "$d" = "/" ] && return 1
    d="$(dirname "$d")"
  done
}

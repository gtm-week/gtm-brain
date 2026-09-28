#!/usr/bin/env bash
# gtm-os upgrade: refresh plugin-owned files and migrate legacy identity registries.
# Original registries are backed up; context memories are never rewritten.
#   bash upgrade.sh /path/to/brain
set -euo pipefail
# Resolve the plugin before entering the brain: a relative script path is relative to the caller's cwd.
HERE="$(cd "$(dirname "$0")" && pwd)"; PLUGIN="$(cd "$HERE/../.." && pwd)"; T="$PLUGIN/templates"
ROOT="${1:-.}"; cd "$ROOT"
[ -f brain/admin.md ] || { echo "not a brain: $ROOT"; exit 1; }
node --input-type=module - "$PLUGIN/lib/upgrade-files.mjs" "$T" <<'JS'
const { prepareUpgrade } = await import(process.argv[2]);
const result = prepareUpgrade(".", process.argv[3]);
if (result.backup) console.log(`backup: ${result.backup}`);
if (!result.ready) {
  console.error(`Rules contain local edits or come from an older unrecognized template. Nothing replaced. Review ${result.proposal} alongside the existing AGENTS.md, preserving local instructions.`);
  process.exit(2);
}
JS
COMPANY="$(sed -n 's/^company:[[:space:]]*//p' brain/admin.md | head -1 | sed 's/^"//; s/"$//')"
changed=0
tmp="$(mktemp)"; sed -e "s|{{COMPANY}}|$(printf '%s' "$COMPANY" | sed -e 's/[&|]/\\&/g')|g" "$T/AGENTS.md" > "$tmp"
if ! cmp -s "$tmp" AGENTS.md; then cp "$tmp" AGENTS.md; echo "updated AGENTS.md"; changed=1; fi; rm -f "$tmp"
mkdir -p .githooks
if ! cmp -s "$T/githooks/pre-commit" .githooks/pre-commit 2>/dev/null; then cp "$T/githooks/pre-commit" .githooks/pre-commit; chmod +x .githooks/pre-commit; echo "updated .githooks/pre-commit"; changed=1; fi
# .gitignore: theirs is kept, ours is added line by line (the same merge setup does).
if [ -f .gitignore ]; then
  added=0; while IFS= read -r line; do grep -qxF -- "$line" .gitignore || { printf '%s\n' "$line" >> .gitignore; added=1; }; done < "$T/gitignore"
  [ "$added" = 1 ] && { echo "updated .gitignore (added the plugin's lines, kept yours)"; changed=1; }
else cp "$T/gitignore" .gitignore; echo "updated .gitignore"; changed=1; fi
# Migrate legacy registries into permanent identity files without rewriting memories.
paths="AGENTS.md .githooks .gitignore"
entity_change="$(node --input-type=module -e 'const lib=await import(process.argv[1]); if(lib.migrateEntities("."))console.log("changed")' "$PLUGIN/lib/brain.mjs")"
if [ "$entity_change" = "changed" ]; then
  echo "migrated entity identities and kinds (original files backed up in work/entity-migration)"
  changed=1; paths="$paths brain/entities brain/entities.md brain/names.md"
fi
# 0.27.0: guidelines become documents at the root; the root README says what goes where.
docs_out="$(node --input-type=module -e 'const d=await import(process.argv[1]);const r=d.migrateGuidelines(".");for(const [f,t] of r.moved)console.log(`moved ${f} -> ${t}`);for(const [f,w] of r.kept)console.log(`kept ${f}: ${w}`);' "$PLUGIN/lib/documents.mjs")"
if [ -n "$docs_out" ]; then
  echo "$docs_out"; changed=1
  paths="$paths brain/guidelines $(echo "$docs_out" | sed -n 's/^moved .* -> //p' | tr '\n' ' ')"
fi
if [ ! -f README.md ]; then
  sed -e "s|{{COMPANY}}|$(printf '%s' "$COMPANY" | sed -e 's/[&|]/\\&/g')|g" "$T/README.md" > README.md
  echo "added README.md"; changed=1; paths="$paths README.md"
fi
# A document beside a folder of its own name moves into it (design-system.md + design-system/ -> design-system/design-system.md).
cons_out="$(node --input-type=module -e 'const d=await import(process.argv[1]);for(const m of d.consolidateDocuments("."))console.log(`${m.from}\t${m.to}`)' "$PLUGIN/lib/documents.mjs" 2>/dev/null || true)"
if [ -n "$cons_out" ]; then
  while IFS="$(printf '\t')" read -r from to; do echo "moved $from into ${to%/*}/"; paths="$paths $from $to"; done <<< "$cons_out"
  changed=1
fi
# Every brain has strategy.md (0.27.0): a pre-0.27 brain gets the same placeholder setup writes, waiting for the intake.
added_strategy=0
if [ ! -f strategy.md ]; then
  PLUGIN_VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$PLUGIN/.codex-plugin/plugin.json" | head -1)"
  sed -e "s|{{COMPANY}}|$(printf '%s' "$COMPANY" | sed -e 's/[&|]/\\&/g')|g" -e "s|{{DATE}}|$(date +%F)|g" -e "s|{{VERSION}}|$PLUGIN_VERSION|g" "$T/strategy.md" > strategy.md
  echo "added strategy.md"; changed=1; paths="$paths strategy.md"; added_strategy=1
fi
# workflows/ (0.28.0): a brain from before gets the folder with the two shipped workflows once. A folder that
# exists is never added to, so a deleted shipped workflow stays deleted; a deleted folder comes back.
added_workflows=0
if [ ! -d workflows ]; then
  PLUGIN_VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$PLUGIN/.codex-plugin/plugin.json" | head -1)"
  mkdir -p workflows
  for f in "$T"/workflows/*.md; do sed -e "s|{{DATE}}|$(date +%F)|g" -e "s|{{VERSION}}|$PLUGIN_VERSION|g" "$f" > "workflows/$(basename "$f")"; done
  echo "added workflows/ with the two shipped workflows"; changed=1; paths="$paths workflows"; added_workflows=1
fi
# What this upgrade did and what it left alone, in the person's words: the last thing they read.
moved_n="$(printf '%s\n' "$docs_out" | grep -c '^moved ' || true)"; kept_n="$(printf '%s\n' "$docs_out" | grep -c '^kept ' || true)"
old_files=0; [ -d files ] && old_files="$(find files -type f 2>/dev/null | wc -l | tr -d ' ')"
stray="$(node --input-type=module -e 'const d=await import(process.argv[1]);console.log(d.strayFolders(".").map(f=>f+"/").join(", "))' "$PLUGIN/lib/documents.mjs" 2>/dev/null || true)"
echo "upgrade report:"
[ "$moved_n" -gt 0 ] && echo "  moved $moved_n guideline$([ "$moved_n" = 1 ] || echo s) to the root as a document (say: list the documents)"
[ "$kept_n" -gt 0 ] && echo "  kept $kept_n guideline$([ "$kept_n" = 1 ] || echo s) in brain/guidelines: a file of that name already sits at the root; adopt or merge by hand"
[ "$added_strategy" = 1 ] && echo "  added strategy.md, waiting for the strategic intake (say: run the strategic intake)"
[ "$added_workflows" = 1 ] && echo "  added workflows/: outbound and ads-then-outbound, as drafts (say: start the outbound workflow)"
[ "$old_files" -gt 0 ] && echo "  $old_files files in files/ from before 0.27 stay where they are; their links keep working. New files land beside a document or a company."
[ -n "$stray" ] && echo "  folders at the top GTM OS does not use: $stray. A Markdown in them can become a document where it lies (adopt the documents in <folder>/); the rest is yours to move or delete."
[ "$moved_n" = 0 ] && [ "$kept_n" = 0 ] && [ "$added_strategy" = 0 ] && [ "$added_workflows" = 0 ] && [ "$old_files" = 0 ] && [ -z "$stray" ] && echo "  nothing to migrate"
git config core.hooksPath .githooks 2>/dev/null || true
git config gtm-os.lib "$PLUGIN/lib/brain.mjs" 2>/dev/null || true
# Team handles: the rule is the full name, lowercase, hyphenated. A brain set up before that rule
# has short ones; they change only through APPROVE, so say so instead of touching admin.md.
node -e 'const l=await import(process.argv[1]);const a=l.readAdmin(".")||{};const old=(a.team||[]).filter(p=>p.handle!==l.handleFor(p.name));if(old.length)console.log(`team handles predate the full-name rule: ${old.map(p=>`${p.handle} (now ${l.handleFor(p.name)})`).join(", ")}. In Codex: "change the team handles to full names", then APPROVE. Old memories keep the old handle; both mean the same person.`)' "$PLUGIN/lib/brain.mjs" 2>/dev/null || true
if [ "$changed" = 1 ]; then
  node --input-type=module - "$PLUGIN/lib/brain.mjs" $paths <<'JS'
const lib = await import(process.argv[2]);
const result = lib.commit(".", process.argv.slice(3), "upgrade: rules and hook refreshed");
console.log(`upgrade done: rules and hook refreshed; ${result.note}`);
JS
else echo "already current"; fi

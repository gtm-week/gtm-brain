#!/usr/bin/env bash
# gtm-brain upgrade: refresh plugin-owned files and migrate legacy identity registries.
# Original registries are backed up; context memories are never rewritten.
#   bash upgrade.sh [/path/to/brain] [--confirm]
# --confirm: the person said yes to a change of the brain's file layout (brain/layout.json), which the run
# without it described: how many teammates saved in the last 14 days and that they will need to update.
# In 0.35 that change is the move of a flat brain's entity pages into a folder per kind (layout 1 to 2):
# without --confirm the run says how many pages would move and changes nothing; with it the pages move and
# brain/layout.json says 2 in the same commit. A scheduled or background run (GTM_BRAIN_RUN) never moves them.
set -euo pipefail
# Resolve the plugin before entering the brain: a relative script path is relative to the caller's cwd.
HERE="$(cd "$(dirname "$0")" && pwd)"; PLUGIN="$(cd "$HERE/../.." && pwd)"; T="$PLUGIN/templates"
ROOT="."; CONFIRM=0
for a in "$@"; do case "$a" in --confirm) CONFIRM=1;; *) ROOT="$a";; esac; done
cd "$ROOT"
. "$PLUGIN/session/resolve.sh"
gtm_brain_is . || { echo "not a brain: $ROOT"; exit 1; }
# The layout first, before anything is backed up or replaced: a brain on a newer layout than this plugin
# understands is never written (exit 3); a layout change waits for the person's yes (exit 0, nothing changed).
node --input-type=module - "$PLUGIN/lib/upgrade-files.mjs" "$T" "$CONFIRM" <<'JS' || { rc=$?; [ "$rc" = 10 ] && exit 0; exit "$rc"; }
const { prepareUpgrade, rulesReasons, layoutStep } = await import(process.argv[2]);
const step = layoutStep(".", process.argv[4] === "1");
if (step.startsWith("BLOCKED\t")) { console.log(`${step.slice(8)}\nNothing was upgraded.`); process.exit(3); }
if (step.startsWith("ASK\t")) { console.log(`not upgraded yet: ${step.slice(4)}\nNothing was changed.`); process.exit(10); }
if (step.startsWith("NOTE\t")) console.log(step.slice(5));
// Read before anything is replaced: the reasons are counted from the rules this brain has now.
const { from, reasons } = rulesReasons(".", process.argv[3]);
const result = prepareUpgrade(".", process.argv[3]);
if (result.ready && reasons.length) console.log(`why (rules from ${from}): ${reasons.join("; ")}`);
if (result.backup) console.log(`backup: ${result.backup}`);
if (!result.ready) {
  console.error(`Rules contain local edits or come from an older unrecognized template. Nothing replaced. Review ${result.proposal} alongside the existing AGENTS.md, preserving local instructions.`);
  process.exit(2);
}
JS
IFS="$(printf '\t')" read -r RULES_F SCHEMA_F COMPANY <<< "$(node -e 'const l=await import(process.argv[1]);console.log([l.rulesFile("."),l.schemaFile("."),(l.readAdmin(".")||{}).company||""].join("\t"))' "$PLUGIN/lib/brain.mjs")"
changed=0
# The shipped rules; a person's own additions under "## This brain's own additions" are carried over word for word.
rules_out="$(node --input-type=module -e 'const u=await import(process.argv[1]);if(u.writeRules(".",process.argv[2]))console.log("changed")' "$PLUGIN/lib/upgrade-files.mjs" "$T")"
[ "$rules_out" = changed ] && { echo "updated AGENTS.md"; changed=1; }
# 0.30.0: Claude Code reads CLAUDE.md; a marked block imports AGENTS.md, the person's own lines stay.
shim="$(node --input-type=module -e 'const l=await import(process.argv[1]);if(l.ensureRulebookShim("."))console.log("changed")' "$PLUGIN/lib/brain.mjs")"
[ "$shim" = changed ] && { echo "updated CLAUDE.md (imports AGENTS.md for Claude Code)"; changed=1; }
mkdir -p .githooks
if ! cmp -s "$T/githooks/pre-commit" .githooks/pre-commit 2>/dev/null; then cp "$T/githooks/pre-commit" .githooks/pre-commit; chmod +x .githooks/pre-commit; echo "updated .githooks/pre-commit"; changed=1; fi
# .gitignore: theirs is kept, ours is added line by line (the same merge setup does).
if [ -f .gitignore ]; then
  added=0; while IFS= read -r line; do grep -qxF -- "$line" .gitignore || { printf '%s\n' "$line" >> .gitignore; added=1; }; done < "$T/gitignore"
  [ "$added" = 1 ] && { echo "updated .gitignore (added the plugin's lines, kept yours)"; changed=1; }
else cp "$T/gitignore" .gitignore; echo "updated .gitignore"; changed=1; fi
# Migrate legacy registries into permanent identity files without rewriting memories.
paths="AGENTS.md CLAUDE.md .githooks .gitignore"
entity_change="$(node --input-type=module -e 'const lib=await import(process.argv[1]); if(lib.migrateEntities("."))console.log("changed")' "$PLUGIN/lib/brain.mjs")"
if [ "$entity_change" = "changed" ]; then
  echo "migrated entity identities and kinds (original files backed up in work/entity-migration)"
  changed=1; paths="$paths brain/entities brain/entities.md brain/names.md"
fi
# 0.35.0: entity pages move to a folder per kind (people/max-jendral-3f9a2c.md), files folders with them, in this commit.
# A flat brain reaches this line only after the person's yes (the layout step above); the move records layout 2 in
# brain/layout.json itself, kept in the same commit. A brain a 0.35 pre-release moved while the file still said 1,
# or had none, gets its 2 here too, with nothing moved.
layout_said=0
kind_out="$(node --input-type=module -e 'const lib=await import(process.argv[1]); const r=lib.migrateToKindFolders("."); for(const m of r.moves)console.log(`${m.from}\t${m.to}`); if(!r.moves.length&&r.indexes.length)console.log("indexes"); if(r.layout)console.log(`layout ${r.layout}`)' "$PLUGIN/lib/brain.mjs")"
if [ -n "$kind_out" ]; then
  kind_n="$(printf '%s\n' "$kind_out" | grep -c "$(printf '\t')" || true)"
  kind_layout="$(printf '%s\n' "$kind_out" | sed -n 's/^layout //p')"
  [ "$kind_n" -gt 0 ] && echo "moved $kind_n entity page$([ "$kind_n" = 1 ] || echo s) into a folder per kind (brain/entities/people/, organizations/, ...), each named with its short id"
  if [ -n "$kind_layout" ]; then
    if [ "$kind_n" -gt 0 ]; then echo "changed the brain's file layout to $kind_layout (brain/layout.json): entity pages are in kind folders now; a teammate still on GTM Brain 0.34 keeps saving notes but does not find these pages until they update"
    else echo "recorded the brain's file layout as $kind_layout (brain/layout.json): the entity pages were already in kind folders"; fi
    layout_said=1; paths="$paths brain/layout.json"
  fi
  changed=1; paths="$paths brain/entities"
fi
# 0.35.0: a meeting is an entity; meetings captured before get theirs (their notes are not rewritten).
meet_out="$(node --input-type=module -e 'const lib=await import(process.argv[1]); const n=lib.deriveMeetingEntities(".").length; if(n)console.log(n)' "$PLUGIN/lib/brain.mjs")"
if [ -n "$meet_out" ]; then echo "added $meet_out meeting page$([ "$meet_out" = 1 ] || echo s) (brain/entities/meetings/), one per meeting already captured"; changed=1; paths="$paths brain/entities"; fi
# 0.27.0: guidelines become documents at the root; the root README says what goes where.
docs_out="$(node --input-type=module -e 'const d=await import(process.argv[1]);const r=d.migrateGuidelines(".");for(const [f,t] of r.moved)console.log(`moved ${f} -> ${t}`);for(const [f,w] of r.kept)console.log(`kept ${f}: ${w}`);' "$PLUGIN/lib/documents.mjs")"
if [ -n "$docs_out" ]; then
  echo "$docs_out"; changed=1
  paths="$paths brain/guidelines $(echo "$docs_out" | sed -n 's/^moved .* -> //p' | tr '\n' ' ')"
fi
if [ ! -f README.md ]; then
  sed -e "s|{{COMPANY}}|$(printf '%s' "$COMPANY" | sed -e 's/[&|]/\\&/g')|g" "$T/README.md" > README.md
  echo "added README.md"; changed=1; paths="$paths README.md"
else
  # A README exactly as a release wrote it carries nothing of the person's: refresh it. An edited one stays.
  readme_out="$(node -e 'const fs=require("fs"),p=require("path"),[t,c]=process.argv.slice(1),r=f=>fs.readFileSync(f,"utf8").replaceAll("{{COMPANY}}",c),now=fs.readFileSync("README.md","utf8"),next=r(p.join(t,"README.md")),L=p.join(t,"legacy","readme");if(now!==next&&fs.readdirSync(L).some(f=>/\.md$/.test(f)&&r(p.join(L,f))===now)){fs.writeFileSync("README.md",next);console.log("changed")}' "$T" "$COMPANY")"
  if [ "$readme_out" = "changed" ]; then echo "updated README.md (what goes where)"; changed=1; paths="$paths README.md"; fi
fi
# A document beside a folder of its own name moves into it (design-system.md + design-system/ -> design-system/design-system.md).
cons_out="$(node --input-type=module -e 'const d=await import(process.argv[1]);for(const m of d.consolidateDocuments("."))console.log(`${m.from}\t${m.to}`)' "$PLUGIN/lib/documents.mjs" 2>/dev/null || true)"
if [ -n "$cons_out" ]; then
  while IFS="$(printf '\t')" read -r from to; do echo "moved $from into ${to%/*}/"; paths="$paths $from $to"; done <<< "$cons_out"
  changed=1
fi
# The starter documents setup writes (strategy.md since 0.27.0; icp, voice, design-system and market since
# 0.34.4): a brain gets the ones it lacks once, as the drafts setup writes. A file already there is the person's,
# and a starter brain/layout.json records as given is never brought back after the person deleted it.
# RULES.md (where things go, ask the source, the brain's own rules) and SCHEMA.md (what the brain keeps) are the
# files the person edits: a brain from before them gets them as setup writes them, an edited one stays; each is
# kept in a commit of its own by lib (where.mjs ensureRules, schema.mjs ensureSchema). brain/layout.json, the file
# layout every GTM Brain reads before it writes, is recorded last, after the starters it lists as given; a layout
# change happens only with --confirm, and a flat brain keeps layout 1. One node process for the three: one line each.
PLUGIN_VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$PLUGIN/.codex-plugin/plugin.json" | head -1)"
had_rules=0; [ -f "$RULES_F" ] && had_rules=1; had_schema=0; [ -f "$SCHEMA_F" ] && had_schema=1
delivered="$(node --input-type=module -e 'const u = await import(process.argv[1]); console.log(u.deliverMissing(".", process.argv[2], process.argv[3], process.argv[4] === "1"))' "$PLUGIN/lib/upgrade-files.mjs" "$T" "$PLUGIN_VERSION" "$layout_said")"
starters="$(sed -n 1p <<< "$delivered")"; ensured="$(sed -n 2p <<< "$delivered")"; layout_change="$(sed -n 3p <<< "$delivered")"
added_strategy=0; other_starters=""; added_page=""
for f in $starters; do
  echo "added $f"; changed=1; paths="$paths $f"
  case "${f##*/}" in strategy.md) added_strategy=1 ;; *.html) added_page="$f" ;; *) other_starters="$other_starters${other_starters:+, }$f" ;; esac
done
added_rules=""
for f in $ensured; do
  if { [ "$f" = "$RULES_F" ] && [ "$had_rules" = 0 ]; } || { [ "$f" = "$SCHEMA_F" ] && [ "$had_schema" = 0 ]; }; then echo "added $f"; added_rules="$added_rules${added_rules:+, }$f"; else echo "updated $f (it was a shipped version nobody edited)"; fi
  changed=1; paths="$paths $f"
done
if [ -n "$layout_change" ]; then
  echo "$layout_change"; changed=1; paths="$paths brain/layout.json"
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
[ -n "$other_starters" ] && echo "  added the starter documents $other_starters, as drafts to fill when it suits (say: list the documents)"
[ -n "$added_page" ] && echo "  added the design system page $added_page beside its Markdown: a starter until you say: fill in our design system"
[ -n "$added_rules" ] && echo "  added $added_rules: the brain's rules and what it keeps, yours to edit (say: show me the rules)"
[ "$added_workflows" = 1 ] && echo "  added workflows/: outbound and ads-then-outbound, as drafts (say: start the outbound workflow)"
[ "$old_files" -gt 0 ] && echo "  $old_files files in files/ from before 0.27 stay where they are; their links keep working. New files land beside a document or a company."
[ -n "$stray" ] && echo "  folders at the top GTM Brain does not use: $stray. A Markdown in them can become a document where it lies (adopt the documents in <folder>/); the rest is yours to move or delete."
[ "$moved_n" = 0 ] && [ "$kept_n" = 0 ] && [ "$added_strategy" = 0 ] && [ -z "$other_starters" ] && [ -z "$added_page" ] && [ -z "$added_rules" ] && [ "$added_workflows" = 0 ] && [ "$old_files" = 0 ] && [ -z "$stray" ] && echo "  nothing to migrate"
git config core.hooksPath .githooks 2>/dev/null || true
git config gtm-brain.lib "$PLUGIN/lib/brain.mjs" 2>/dev/null || true
# Team handles: the rule is the full name, lowercase, hyphenated. A brain set up before that rule
# has short ones; they change only through APPROVE, so say so instead of touching admin.md.
node -e 'const l=await import(process.argv[1]);const a=l.readAdmin(".")||{};const old=(a.team||[]).filter(p=>p.handle!==l.handleFor(p.name));if(old.length)console.log(`team handles predate the full-name rule: ${old.map(p=>`${p.handle} (now ${l.handleFor(p.name)})`).join(", ")}. In Codex: "change the team handles to full names", then APPROVE. Old memories keep the old handle; both mean the same person.`)' "$PLUGIN/lib/brain.mjs" 2>/dev/null || true
if [ "$changed" = 1 ]; then
  KIND_MOVED="${kind_n:-0}" node --input-type=module - "$PLUGIN/lib/brain.mjs" $paths <<'JS'
const lib = await import(process.argv[2]);
const result = lib.commit(".", process.argv.slice(3), process.env.KIND_MOVED > 0 ? `layout 2: ${process.env.KIND_MOVED} entity pages into a folder per kind (upgrade)` : "upgrade: rules and hook refreshed");
console.log(`upgrade done: rules and hook refreshed; ${result.note}`);
JS
fi
# Layout 3, last and in a commit of its own, only after the owner's yes (--confirm, the question above named what
# moves): the base files into about-us/, RULES.md and SCHEMA.md into config/ as rules.md and schema.md, admin.md
# into config/settings.yaml, brain/layout.json 3, with git mv so every byte stays (lib/config-folders.mjs). Then,
# in a commit of its own, rules nobody edited get the layout 3 wording of the shipped rules (lib/where.mjs).
moved3=""
if [ "$CONFIRM" = 1 ]; then
  moved3="$(node --input-type=module -e 'const u=await import(process.argv[1]),c=await import(process.argv[2]);if(!u.layoutStep(".",true).startsWith("CHANGE"))process.exit(0);const r=c.migrateToConfigFolders(".");if(!r.layout)process.exit(0);for(const [f,t] of r.moves)console.log(`moved ${f} -> ${t}`);if(r.settings)console.log("moved brain/admin.md -> config/settings.yaml (the same settings, the prose as notes)");for(const [f,w] of r.kept)console.log(`kept ${f}: ${w}`);console.log(`changed the brain'"'"'s file layout to ${r.layout} (brain/layout.json): only the owner changes about-us/ and config/ from now on; a teammate on an older GTM Brain does not find this brain until they update; ${r.note}`);const w=await import(process.argv[3]);if(w.ensureRules(".",process.argv[4]))console.log("updated config/rules.md (it was a shipped version nobody edited): its row for documents names about-us/")' "$PLUGIN/lib/upgrade-files.mjs" "$PLUGIN/lib/config-folders.mjs" "$PLUGIN/lib/where.mjs" "$T")"
  [ -n "$moved3" ] && echo "$moved3"
fi
# A teammate's yes moved the entity pages; the second move (about-us/, config/) is the owner's, said here once so
# nobody waits for it in this run (the run that has nothing to ask says the same line at its top).
if [ "$layout_said" = 1 ] && [ -z "$moved3" ]; then
  node --input-type=module -e 'const u=await import(process.argv[1]);const s=u.layoutStep(".",false);if(s.startsWith("NOTE\t"))console.log(s.slice(5))' "$PLUGIN/lib/upgrade-files.mjs" 2>/dev/null || true
fi
[ "$changed" = 1 ] || [ -n "$moved3" ] || echo "already current"

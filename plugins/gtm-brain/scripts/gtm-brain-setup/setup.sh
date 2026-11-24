#!/usr/bin/env bash
# gtm-brain v0 setup: workplace info + default contexts + git + hooks, from the template.
#   --owner "Marta Nowak <marta@reflow.io>"   --team "Tomek Zielinski <tomek@reflow.io>, Anna Kowal <anna@reflow.io>"
set -euo pipefail
COMPANY=""; ONE_LINER=""; OWNER=""; TEAM=""; TOOLS=""; COMPANY_RULE=""; STRATEGY=""; MARKET=""; ICP=""; OFFER=""
while [ $# -gt 0 ]; do case "$1" in
  --company) COMPANY="$2"; shift 2;; --one-liner) ONE_LINER="$2"; shift 2;; --owner) OWNER="$2"; shift 2;;
  --team) TEAM="$2"; shift 2;; --tools) TOOLS="$2"; shift 2;;
  --company-rule) COMPANY_RULE="$2"; shift 2;; --strategy) STRATEGY="$2"; shift 2;; --market) MARKET="$2"; shift 2;; --icp) ICP="$2"; shift 2;; --offer) OFFER="$2"; shift 2;;
  --dashboard) DASHBOARD="$2"; shift 2;; --compile) shift 2;;
  --dashboard-browser) shift 2;; # retired option, accepted for older callers and ignored
  --language) shift 2;; # retired option, accepted for older callers and ignored
  *) echo "unknown arg: $1" >&2; exit 1;; esac; done
[ -n "$COMPANY" ] && [ -n "$ONE_LINER" ] && [ -n "$OWNER" ] || { echo "need --company, --one-liner, --owner" >&2; exit 1; }
[ -d brain ] || [ -f AGENTS.md ] && { echo "gtm-brain: this folder already has a brain." >&2; exit 1; }
# A brain is its own repo with its own git identity and hooks path, so it needs an empty folder.
# Also allow only valid work/session.json captured by the empty-folder session hook.
HERE="$(cd "$(dirname "$0")" && pwd)"; PLUGIN="$(cd "$HERE/../.." && pwd)"; T="$PLUGIN/templates"; TODAY="$(date +%F)"
node --input-type=module - "$PLUGIN/lib/brain.mjs" <<'NODE'
import { dirname } from 'node:path';
const lib = await import(process.argv[2]);
for (let dir = process.cwd(); ; dir = dirname(dir)) {
  const pointer = lib.readPointer(dir);
  if (pointer) {
    console.error(`gtm-brain: this folder is inside linked project ${dir}. Keep its shared brain at ${pointer.brain}; use New Project there for separate projects, not another brain here.`);
    process.exit(1);
  }
  if (dirname(dir) === dir) break;
}
NODE
broad="$(node -e 'const l=await import(process.argv[1]);console.log(l.broadFolder("."))' "$PLUGIN/lib/brain.mjs")"
[ -z "$broad" ] || { echo "gtm-brain: this is $broad, too broad for a brain: every chat here would leave its downloads and builds among your own files. Create a folder of its own, such as ~/Documents/$COMPANY Brain, open it and set up there." >&2; exit 1; }
others="$(node -e 'const l=await import(process.argv[1]);console.log(l.setupBlockers(".").join("\n"))' "$PLUGIN/lib/brain.mjs")"
[ -z "$others" ] || { echo "gtm-brain: this folder is not empty ($(printf '%s' "$others" | tr '\n' ' ')). Setup creates its own repo, hooks and git identity here; use an empty folder." >&2; exit 1; }
[ "$TEAM" = "none" ] && TEAM=""

esc() { printf '%s' "$1" | sed -e 's/[&|]/\\&/g'; }

# People: "Name <email>, Name <email>" -> team block with unique handles. Done in node (the lib owns handles).
PEOPLE_JSON="$(node -e '
  const lib = await import(process.argv[1]); const [owner, team] = [process.argv[2], process.argv[3]];
  const parse = s => s.split(",").map(x => x.trim()).filter(Boolean).map(x => { const m = x.match(/^(.*?)\s*<([^>]+)>\s*$/); return { name: (m ? m[1] : x).trim(), email: m ? m[2].trim() : "" }; });
  const people = [...parse(owner), ...parse(team)]; const used = new Set();
  for (const p of people) { let h = lib.handleFor(p.name) || "user", base = h, n = 2; while (used.has(h)) h = base + n++; used.add(h); p.handle = h; }
  console.log(JSON.stringify(people));
' "$PLUGIN/lib/brain.mjs" "$OWNER" "$TEAM")"
OWNER_HANDLE="$(printf '%s' "$PEOPLE_JSON" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8"))[0].handle)')"
TEAM_BLOCK="$(printf '%s' "$PEOPLE_JSON" | node -e 'for (const p of JSON.parse(require("fs").readFileSync(0,"utf8"))) console.log(`  - { name: ${JSON.stringify(p.name)}, email: ${JSON.stringify(p.email)}, handle: ${p.handle} }`)')"
TEAM_LINE="$(printf '%s' "$PEOPLE_JSON" | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(p.map((x,i)=>`${x.name} (${x.handle}${i===0?", owner":""}${x.email?", "+x.email:""})`).join("; "))')"
tolist() { printf '%s' "$1" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v '^$' | sed 's/.*/"&"/' | paste -sd, - | sed 's/,/, /g'; }

# 1. config/settings.yaml (layout 3, lib/brain-paths.mjs): the company, its one-liner, the owner (who runs setup is
# the first owner), the team with handles and emails, the tools and the settings; the workplace prose as notes.
# Written by the lib (renderSettings), so every value is quoted the way the reader parses it.
. "$PLUGIN/session/resolve.sh"
WRITES="$(node -e 'const v=await import(process.argv[1]);console.log(v.writesLayout())' "$PLUGIN/lib/layout-version.mjs")"
# Layout 4 (lib/brain-paths.mjs): configuration/, entities/, memories/ and workflows/ at the top, no brain/ folder,
# this computer's files in .gtm-brain/. A plugin that writes an older layout (the tests play one) keeps brain/.
[ "$WRITES" -ge 4 ] || mkdir -p brain
if [ "$WRITES" -lt 3 ]; then
# A plugin that writes layout 2 at most (the tests play one with GTM_BRAIN_TEST_LAYOUT=2): brain/admin.md as before,
# RULES.md, SCHEMA.md and the starters at the root (the steps below follow lib/brain-paths.mjs). TEAM_BLOCK is
# multi-line, so it goes in through node, not sed.
ADMIN_OUT="$(gtm_brain_settings .)"
sed -e "s|{{COMPANY}}|$(esc "$COMPANY")|g" -e "s|{{TODAY}}|$TODAY|g" -e "s|{{OWNER_HANDLE}}|$OWNER_HANDLE|g" \
    -e "s|{{ONE_LINER}}|$(esc "$ONE_LINER")|g" -e "s|{{TEAM_LINE}}|$(esc "$TEAM_LINE")|g" \
    -e "s|{{TOOLS_LINE}}|$(esc "${TOOLS:-none yet}")|g" -e "s|{{TOOLS}}|$(esc "$(tolist "$TOOLS")")|g" \
    -e "s|{{DASHBOARD}}|$([ "${DASHBOARD:-always}" = "on-demand" ] && echo on-demand || echo always)|g" \
    "$T/brain/admin.md" > "$ADMIN_OUT"
TEAM_BLOCK="$TEAM_BLOCK" node -e 'const fs=require("fs"),f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace("{{TEAM_BLOCK}}",process.env.TEAM_BLOCK))' "$ADMIN_OUT"
else
COMPANY="$COMPANY" ONE_LINER="$ONE_LINER" OWNER_HANDLE="$OWNER_HANDLE" TEAM_LINE="$TEAM_LINE" TOOLS="$TOOLS" TODAY="$TODAY" \
DASHBOARD="$([ "${DASHBOARD:-always}" = "on-demand" ] && echo on-demand || echo always)" PEOPLE_JSON="$PEOPLE_JSON" \
node --input-type=module -e '
  const lib = await import(process.argv[1]), fs = await import("node:fs"), e = process.env;
  const tools = (e.TOOLS || "").split(",").map(s => s.trim()).filter(Boolean);
  const notes = fs.readFileSync(process.argv[2], "utf8").replaceAll("{{COMPANY}}", e.COMPANY).replaceAll("{{ONE_LINER}}", e.ONE_LINER)
    .replaceAll("{{TEAM_LINE}}", e.TEAM_LINE).replaceAll("{{TOOLS_LINE}}", e.TOOLS || "none yet");
  const team = JSON.parse(e.PEOPLE_JSON).map(p => ({ name: p.name, email: p.email, handle: p.handle }));
  const fm = { company: e.COMPANY, one_liner: e.ONE_LINER, created: e.TODAY, owner: e.OWNER_HANDLE, team, tools, dashboard: e.DASHBOARD, deal_scoring: "on", big_files: "google-drive", protected: true };
  lib.writeNewSettings(".", fm, notes);
' "$PLUGIN/lib/brain.mjs" "$T/config/settings-notes.md"
fi

# 2. the agreed shared seed plus the identified creator's personal context.
node -e 'const l=await import(process.argv[1]); const [owner,company,strategy,market,icp,offer]=process.argv.slice(2); l.seedContexts(".",owner,{company,strategy,market,icp,offer})' "$PLUGIN/lib/brain.mjs" "$OWNER_HANDLE" "$COMPANY_RULE" "$STRATEGY" "$MARKET" "$ICP" "$OFFER"

# Persist the onboarding flag in the initial brain commit, before returning to chat.
node -e 'const l=await import(process.argv[1]);l.seedOnboarding(".",process.argv[2])' "$PLUGIN/lib/brain.mjs" "$OWNER_HANDLE"

# 2b. names registry, seeded with the team
# Entity pages go in a folder per kind (people/, organizations/, ...), each with its generated index.md.
# startKindLayout records the layout in brain/layout.json (3: config/settings.yaml is there already), kept in the setup commit.
node -e 'const l=await import(process.argv[1]); l.startKindLayout("."); l.writeNames(".", l.readNames("."))' "$PLUGIN/lib/brain.mjs"

# 3. AGENTS.md, gitignore, hooks
sed -e "s|{{COMPANY}}|$(esc "$COMPANY")|g" "$T/AGENTS.md" > AGENTS.md
# Claude Code reads CLAUDE.md: it imports the same rulebook.
node -e 'const l=await import(process.argv[1]);l.ensureRulebookShim(".")' "$PLUGIN/lib/brain.mjs"
PLUGIN_VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$T/../.codex-plugin/plugin.json" | head -1)"
# Layout 3 (lib/brain-paths.mjs): the root README says what goes where (lib/config-folders.mjs layoutReadme); the
# rules (where things go, the person's own rules) and the schema (what the brain keeps) in config/, as rules.md and
# schema.md; the five starter documents in about-us/, the design system with its page design-system.html (strategy waits for the strategic intake; voice, design system,
# ICP and market are offered at the end of onboarding and can wait; GTM week sync, 2026-11-13).
node --input-type=module -e '
  const fs = await import("node:fs"), l = await import(process.argv[1]), c = await import(process.argv[2]), u = await import(process.argv[3]), w = await import(process.argv[4]);
  const [t, company, version] = process.argv.slice(5);
  if (!fs.existsSync("README.md")) fs.writeFileSync("README.md", c.layoutReadme(fs.readFileSync(`${t}/README.md`, "utf8").replaceAll("{{COMPANY}}", company), "."));
  for (const [file, template] of [[l.rulesFile("."), "RULES.md"], [l.schemaFile("."), "SCHEMA.md"]]) if (!fs.existsSync(file)) { fs.mkdirSync(file.split("/").slice(0, -1).join("/") || ".", { recursive: true }); fs.writeFileSync(file, template === "RULES.md" ? w.layoutRules(fs.readFileSync(`${t}/${template}`, "utf8"), ".") : fs.readFileSync(`${t}/${template}`, "utf8")); }
  u.addStarters(".", t, { version });
' "$PLUGIN/lib/brain.mjs" "$PLUGIN/lib/config-folders.mjs" "$PLUGIN/lib/upgrade-files.mjs" "$PLUGIN/lib/where.mjs" "$T" "$COMPANY" "$PLUGIN_VERSION"
# brain/layout.json: the file layout this brain uses, read by every GTM Brain before it writes; the starters
# are recorded as given, so an upgrade never brings back one the person deleted (lib/layout-version.mjs). The
# layout number is the 3 startKindLayout recorded above; this adds the starters and never lowers it.
node -e 'const v=await import(process.argv[1]),u=await import(process.argv[2]);v.writeLayout(".",{starters:u.GIVEN})' "$PLUGIN/lib/layout-version.mjs" "$PLUGIN/lib/upgrade-files.mjs"
# workflows/ from day one (0.28.0): the shipped workflow documents as drafts; a folder already there is the person's.
if [ ! -d workflows ]; then
  mkdir -p workflows
  for f in "$T"/workflows/*.md; do sed -e "s|{{DATE}}|$(date +%F)|g" -e "s|{{VERSION}}|$PLUGIN_VERSION|g" "$f" > "workflows/$(basename "$f")"; done
fi
if [ -f .gitignore ]; then # keep theirs, add ours
  while IFS= read -r line; do grep -qxF -- "$line" .gitignore || printf '%s\n' "$line" >> .gitignore; done < "$T/gitignore"
else cp "$T/gitignore" .gitignore; fi
W="$(gtm_brain_work .)"   # work, or .gtm-brain in layout 4
# a chat opened here before setup left work/session.json: it goes with the rest of this computer's files
if [ "$W" != work ] && [ -d work ]; then mkdir -p "$W"; cp -R work/. "$W"/ 2>/dev/null; rm -rf work; fi
mkdir -p .githooks "$W" && cp "$T/githooks/pre-commit" .githooks/pre-commit && chmod +x .githooks/pre-commit
printf '# %s/\nDerived files (dashboard, logs, loaded contexts). Ignored by git.\n' "$W" > "$W/README.md"

# 4. git, with the owner as the commit identity for this repo
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || git init -q
git config core.hooksPath .githooks
git config gtm-brain.lib "$PLUGIN/lib/brain.mjs"
OWNER_NAME="$(printf '%s' "$PEOPLE_JSON" | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"))[0];console.log(p.name)')"
OWNER_EMAIL="$(printf '%s' "$PEOPLE_JSON" | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"))[0];console.log(p.email)')"
[ -n "$OWNER_NAME" ] && git config user.name "$OWNER_NAME"; [ -n "$OWNER_EMAIL" ] && git config user.email "$OWNER_EMAIL"
# Parallel branches (worktrees) merge notes as lines and keep the newer summary: .gitattributes, post-merge.
node -e 'const l=await import(process.argv[1]);l.ensureMergeSetup(".")' "$PLUGIN/lib/brain.mjs" 2>/dev/null || true
if git add -- AGENTS.md CLAUDE.md README.md $(for f in brain configuration entities memories layout.json config about-us RULES.md SCHEMA.md strategy.md icp.md voice.md design-system.md design-system.html market.md; do [ -e "$f" ] && printf "%s " "$f"; done) workflows .gitignore .gitattributes .githooks && git -c commit.gpgsign=false commit -q -m "setup: $COMPANY brain (gtm-brain v0)"; then
  echo "gtm-brain: brain created for $COMPANY  ·  committed"
else
  echo "gtm-brain: brain created for $COMPANY  ·  written to disk, NOT committed (git is read-only here): say save"
fi
node -e 'const l=await import(process.argv[1]);l.registerBrain(".")' "$PLUGIN/lib/brain.mjs" 2>/dev/null || true
if gtm_brain_layout4 .; then echo "  configuration/            settings.yaml (team with handles, tools), rules.md, schema.md and the base documents in about-us/: the owner's ($OWNER_HANDLE) to change; a teammate's change waits as a proposal."
echo "  entities/                 one page per person, company, product, in a folder per kind"
echo "  memories/                 every note in the file of its month; topics/ holds a summary per topic: company, strategy, market, icp, offer, personal-$OWNER_HANDLE"
echo "  workflows/                the team's workflows"
elif gtm_brain_layout3 .; then echo "  $(gtm_brain_settings .)      workplace info: team with handles, tools. Only the owner ($OWNER_HANDLE) approves a change."
echo "  config/, about-us/        rules, schema and the base documents: the owner's to change; a teammate's change waits as a proposal."
else echo "  $(gtm_brain_settings .)            workplace info: team with handles, tools. Changes need APPROVE."; fi
gtm_brain_layout4 . || echo "  brain/contexts/           company, strategy, market, icp, offer, personal-$OWNER_HANDLE"
echo "  git in this folder: commits as $OWNER_NAME <$OWNER_EMAIL>, git pre-commit check in .githooks (local config)"
echo "  you are: $OWNER_HANDLE    next: onboarding is in progress; continue gtmb-start discovery in this chat using the answers already supplied"
node -e 'const l=await import(process.argv[1]);console.log(l.onboardingInstruction("."))' "$PLUGIN/lib/brain.mjs"

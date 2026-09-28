#!/usr/bin/env bash
# gtm-os v0 setup: workplace info + default contexts + git + hooks, from the template.
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
[ -d brain ] || [ -f AGENTS.md ] && { echo "gtm-os: this folder already has a brain." >&2; exit 1; }
# A brain is its own repo with its own git identity and hooks path, so it needs an empty folder.
# Also allow only valid work/session.json captured by the empty-folder session hook.
HERE="$(cd "$(dirname "$0")" && pwd)"; PLUGIN="$(cd "$HERE/../.." && pwd)"; T="$PLUGIN/templates"; TODAY="$(date +%F)"
node --input-type=module - "$PLUGIN/lib/brain.mjs" <<'NODE'
import { dirname } from 'node:path';
const lib = await import(process.argv[2]);
for (let dir = process.cwd(); ; dir = dirname(dir)) {
  const pointer = lib.readPointer(dir);
  if (pointer) {
    console.error(`gtm-os: this folder is inside linked project ${dir}. Keep its shared brain at ${pointer.brain}; use New Project there for separate projects, not another brain here.`);
    process.exit(1);
  }
  if (dirname(dir) === dir) break;
}
NODE
others="$(node -e 'const l=await import(process.argv[1]);console.log(l.setupBlockers(".").join("\n"))' "$PLUGIN/lib/brain.mjs")"
[ -z "$others" ] || { echo "gtm-os: this folder is not empty ($(printf '%s' "$others" | tr '\n' ' ')). Setup creates its own repo, hooks and git identity here; use an empty folder." >&2; exit 1; }
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

# 1. admin.md (TEAM_BLOCK is multi-line, so it goes in through node, not sed)
mkdir -p brain
sed -e "s|{{COMPANY}}|$(esc "$COMPANY")|g" -e "s|{{TODAY}}|$TODAY|g" -e "s|{{OWNER_HANDLE}}|$OWNER_HANDLE|g" \
    -e "s|{{ONE_LINER}}|$(esc "$ONE_LINER")|g" -e "s|{{TEAM_LINE}}|$(esc "$TEAM_LINE")|g" \
    -e "s|{{TOOLS_LINE}}|$(esc "${TOOLS:-none yet}")|g" -e "s|{{TOOLS}}|$(esc "$(tolist "$TOOLS")")|g" \
    -e "s|{{DASHBOARD}}|$([ "${DASHBOARD:-always}" = "on-demand" ] && echo on-demand || echo always)|g" \
    "$T/brain/admin.md" > brain/admin.md
TEAM_BLOCK="$TEAM_BLOCK" node -e 'const fs=require("fs");fs.writeFileSync("brain/admin.md",fs.readFileSync("brain/admin.md","utf8").replace("{{TEAM_BLOCK}}",process.env.TEAM_BLOCK))'

# 2. the agreed shared seed plus the identified creator's personal context.
node -e 'const l=await import(process.argv[1]); const [owner,company,strategy,market,icp,offer]=process.argv.slice(2); l.seedContexts(".",owner,{company,strategy,market,icp,offer})' "$PLUGIN/lib/brain.mjs" "$OWNER_HANDLE" "$COMPANY_RULE" "$STRATEGY" "$MARKET" "$ICP" "$OFFER"

# Persist the onboarding flag in the initial brain commit, before returning to chat.
node -e 'const l=await import(process.argv[1]);l.seedOnboarding(".",process.argv[2])' "$PLUGIN/lib/brain.mjs" "$OWNER_HANDLE"

# 2b. names registry, seeded with the team
node -e 'const l=await import(process.argv[1]); l.writeNames(".", l.readNames("."))' "$PLUGIN/lib/brain.mjs"

# 3. AGENTS.md, gitignore, hooks
sed -e "s|{{COMPANY}}|$(esc "$COMPANY")|g" "$T/AGENTS.md" > AGENTS.md
# The root README says what goes where (documents, projects, brain/); a README the person wrote stays.
[ -f README.md ] || sed -e "s|{{COMPANY}}|$(esc "$COMPANY")|g" "$T/README.md" > README.md
# strategy.md from day one: a draft document waiting for the strategic intake (gtm-os-strategy); a file already there is the person's.
PLUGIN_VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$T/../.codex-plugin/plugin.json" | head -1)"
[ -f strategy.md ] || sed -e "s|{{COMPANY}}|$(esc "$COMPANY")|g" -e "s|{{DATE}}|$(date +%F)|g" -e "s|{{VERSION}}|$PLUGIN_VERSION|g" "$T/strategy.md" > strategy.md
# workflows/ from day one (0.28.0): the two shipped workflow documents as drafts; a folder already there is the person's.
if [ ! -d workflows ]; then
  mkdir -p workflows
  for f in "$T"/workflows/*.md; do sed -e "s|{{DATE}}|$(date +%F)|g" -e "s|{{VERSION}}|$PLUGIN_VERSION|g" "$f" > "workflows/$(basename "$f")"; done
fi
if [ -f .gitignore ]; then # keep theirs, add ours
  while IFS= read -r line; do grep -qxF -- "$line" .gitignore || printf '%s\n' "$line" >> .gitignore; done < "$T/gitignore"
else cp "$T/gitignore" .gitignore; fi
mkdir -p .githooks work && cp "$T/githooks/pre-commit" .githooks/pre-commit && chmod +x .githooks/pre-commit
printf '# work/\nDerived files (dashboard, logs, loaded contexts). Ignored by git.\n' > work/README.md

# 4. git, with the owner as the commit identity for this repo
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || git init -q
git config core.hooksPath .githooks
git config gtm-os.lib "$PLUGIN/lib/brain.mjs"
OWNER_NAME="$(printf '%s' "$PEOPLE_JSON" | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"))[0];console.log(p.name)')"
OWNER_EMAIL="$(printf '%s' "$PEOPLE_JSON" | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"))[0];console.log(p.email)')"
[ -n "$OWNER_NAME" ] && git config user.name "$OWNER_NAME"; [ -n "$OWNER_EMAIL" ] && git config user.email "$OWNER_EMAIL"
if git add -- brain AGENTS.md README.md strategy.md workflows .gitignore .githooks && git -c commit.gpgsign=false commit -q -m "setup: $COMPANY brain (gtm-os v0)"; then
  echo "gtm-os: brain created for $COMPANY  ·  committed"
else
  echo "gtm-os: brain created for $COMPANY  ·  written to disk, NOT committed (git is read-only here): say save"
fi
node -e 'const l=await import(process.argv[1]);l.registerBrain(".")' "$PLUGIN/lib/brain.mjs" 2>/dev/null || true
echo "  brain/admin.md            workplace info: team with handles, tools. Changes need APPROVE."
echo "  brain/contexts/           company, strategy, market, icp, offer, personal-$OWNER_HANDLE"
echo "  git in this folder: commits as $OWNER_NAME <$OWNER_EMAIL>, hooks in .githooks (local config)"
echo "  you are: $OWNER_HANDLE    next: onboarding is in progress; continue gtm-os-start discovery in this chat using the answers already supplied"
node -e 'const l=await import(process.argv[1]);console.log(l.onboardingInstruction("."))' "$PLUGIN/lib/brain.mjs"

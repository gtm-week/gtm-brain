# gtm-os v0: setup and test manual

For anyone picking this up (Łukasz first). Everything here runs locally on macOS or Linux:
Codex, git, Node 22+. No accounts, no servers.

Branch: `main`. This manual
grows with the steps: each section is a step you can run and check.

## 0. Prerequisites

- Codex CLI 0.149 or newer, signed in. In a chat, "check my machine" runs the plugin's
  `check_environment` tool: node, codex and its sign-in, git, and whether the folder is ready;
  nothing to type in a terminal. The ChatGPT desktop app works too;
  the CLI is used below because it is easier to describe.
- Node 22+ (`node --version`), git.
- Hooks are the guardrails (the safety locks): the session refresh and the write gate. Codex
  runs a plugin's hooks only after they are approved, and installing does not approve them,
  so the install ends with `trust-hooks.mjs --trust` (below). Without it the brain still works
  but nothing refreshes at chat start and nothing stops the model editing protected files.

## 1. Install the plugin

The repo is private: you need to be a collaborator, and **git itself** needs your GitHub
credentials (`gh auth login` then `gh auth setup-git`, once). Codex fetches the marketplace
with git, and git does not use the GitHub connector you signed into inside Codex: that is a
different login, and "GitHub connector authenticated" says nothing about git. Without git's
own sign-in the marketplace add fails with "Missing or invalid credentials", and later updates
quietly keep Codex's old copy; `update GTM OS` now notices that ("Codex's copy of GTM OS is X,
GitHub has Y") and tells you to run the two commands.

```bash
gh auth login && gh auth setup-git                                     # once; brew install gh if missing
codex plugin marketplace add gtm-week/gtm-os   # straight from GitHub (verified)
codex plugin add gtm-os@gtm-os
node "$(ls -d ~/.codex/plugins/cache/gtm-os/gtm-os/*/ | sort -V | tail -1)hooks/trust-hooks.mjs" --trust   # approve the hooks; installing does not
codex plugin list | grep gtm-os                                      # installed, enabled, 0.28.0
```

The install is a snapshot of the configured branch. In the Codex app, say **"update GTM OS"**
to use `gtm-os-configure`: Codex checks the candidate connector, refreshes the plugin and
verifies the installed connector. Follow the two actions it gives you: quit and reopen Codex,
then open its prepared chat in the same folder and press Send. If onboarding is unfinished,
your saved progress and next step carry over; you do not need to type a continuation command. It keeps the
configured source and branch. Local development installs refresh from their checkout.
Company brain files are unchanged.

If a connector reports a missing plugin version, ask Codex to **"repair the GTM OS update"**.
It checks whether the installed files need repair or the app needs a restart. Do not remove
the plugin or re-run onboarding. A version check runs in the background; installing the
update runs when requested, so it cannot interrupt a working session unannounced.

The manual equivalent for a Git marketplace is:

```bash
codex plugin marketplace upgrade gtm-os
codex plugin add gtm-os@gtm-os
```

After these manual commands, run the installed `update.mjs --check` and
`hooks/trust-hooks.mjs --trust` from the version reported by `codex plugin list`, then quit
and reopen Codex. The in-app update performs these checks and hook approval for you.

Brains you already have keep working; open one in Codex and the session hook refreshes its
git config, or say "upgrade the brain" to refresh its AGENTS.md and pre-commit hook too. A brain set up
before the full-name handles (`maciej` instead of `maciej-konczal`) gets a note from upgrade:
say "change the team handles to full names" and type APPROVE; old memories keep the old
handle, and both resolve to the same person.

To work on the plugin itself, clone the repo and install from the checkout instead; no push,
no upgrade command:

```bash
git clone git@github.com:gtm-week/gtm-os.git && cd gtm-os
./dev-install.sh                              # switches the marketplace to this folder and installs
./dev-install.sh                              # again after any change, then start a new chat
./dev-reset.sh                                # wipe the test brain AND refresh, to run onboarding from zero
```

`dev-reset.sh` wipes the test brain (default `~/Desktop/test-brain`, or pass a path), stops
its dashboard server, refreshes the plugin from the checkout, and leaves the folder empty
and ready. It only wipes folders it created itself (recorded in the gitignored
`.dev-brains`) or empty ones; a real brain it refuses to touch. After it runs: start a
new chat in Codex on the test folder (restart the app only if old skills linger).

Set this once in your shell; the scripts below use it:

```bash
export PLUGIN_ROOT=~/.codex/plugins/cache/gtm-os/gtm-os/0.28.0
```

The last install line approves the plugin's hooks; it ends with `Safety locks: on`. Codex does
not ask by itself: a hook installed from a command is enabled and silent until approved, and a
release that changes `hooks.json` drops the approval again (an update through "update GTM OS"
puts it back; `./dev-install.sh` does the same for a checkout).

In a chat the skills run as GTM OS tools: you see "Remembering", "Searching the brain",
"Writing the summary", "Saving" with the plugin's icon, not shell commands. One thing is still a
shell command, so Codex asks your permission: applying an APPROVE.

## 2. Create a brain (step 1: objects and setup)

```bash
mkdir ~/brain-try && cd ~/brain-try
codex
```

In a new Codex chat in the empty project, send `/gtm-os-start`.
Setup reuses known answers and asks only for missing information. It creates Our company
(`company`), Strategy (`strategy`), Market (`market`), Target customers (`icp`), Our offer
(`offer`) and the creator's personal context. The dashboard and background summaries use
their defaults without extra questions. External companies are names linked to notes in
these contexts; they do not each get a context.

Check, in a terminal:

```bash
cat brain/admin.md                          # your answers; team with handles like maciej-konczal
cat brain/contexts/company/context.md       # Our company: identity, team and internal work
ls brain/contexts/*/                        # context.md + memories.jsonl (empty) per context
git log --oneline                           # one commit: setup
git config gtm-os.lib                       # the pre-commit hook finds the lib through this
```

Without Codex, the same from a script:

```bash
bash $PLUGIN_ROOT/scripts/gtm-os-setup/setup.sh --company Reflow --one-liner "returns automation for EU retailers" \
  --owner "Marta Nowak <marta@reflow.io>" --team "Tomek Zielinski <tomek@reflow.io>" \
  --tools "Attio (CRM), Gmail, Granola" --pipeline "Attio is our CRM; read deals live."
```

## 3. Changing the workplace info (step 1c: approve)

`brain/admin.md` is protected. In Codex, in the brain folder:

1. Say: *"Change what we sell to also include UK retailers."*
   Expected: Codex writes `work/admin.proposed.md`, shows the diff, asks you to type APPROVE.
   It does **not** edit the file (a hook denies that; see `work/hooks.log`).
2. Type `APPROVE`.
   Expected: the script tries to write an audit line to `~/.gtm-os/approvals.log`, which is
   outside the sandbox, so **Codex asks you to allow the command**. Allow it. Then:
   *applied and committed <hash>, approved by <your handle>*.
3. `git log -1` shows the commit; `tail ~/.gtm-os/approvals.log` shows the audit line.
4. Try "ok" instead of APPROVE on another change: nothing is applied.

Without Codex:

```bash
sed 's/returns automation/returns automation, also UK/' brain/admin.md > work/admin.proposed.md
node $PLUGIN_ROOT/scripts/gtm-os-approve/approve.mjs . --diff
node $PLUGIN_ROOT/scripts/gtm-os-approve/approve.mjs . --apply --by marta@reflow.io      # name, email or handle of a team member
```

## 4. Contexts and memories (step 2: contexts, load, remember)

In Codex:

1. New session in the brain folder. Ask *"what did the session start hook tell you?"*
   Expected: the list of contexts with memory counts and whether each summary is up to date or behind, and "loaded last time".
2. *"load pipeline"*. Expected: the cover, the rule, and "Last 0 of 0 memories".
3. *"Remember that Pierre Aubert asked for a three-year TCO before the 12.09 steering meeting;
   source is the email from today."*
   Expected: *remembered m_xxxxxx in pipeline · note · <your handle> · people: Pierre Aubert*.
   `cat brain/contexts/pipeline/memories.jsonl` shows one JSON line.
4. *"Remember that we decided not to discount for Bergstrom."* Expected: kind `decision`.
5. *"Forget memory m_xxxxxx, it was wrong."* Expected: a new record with `retracts`; `load
   pipeline` no longer shows the old one; the file still has both lines.
6. *"Create a context for the Berlin expansion; rule: everything about opening the Berlin
   office."* Expected: it confirms, then `brain/contexts/berlin-expansion/` exists.
7. `git add brain && git commit -m notes`: passes. Append a broken line to `memories.jsonl` by
   hand and commit: rejected with the field-by-field reason. `git rm` a memories file and commit:
   refused too (append-only means the file cannot go).

Without Codex:

```bash
node $PLUGIN_ROOT/scripts/gtm-os-contexts/contexts.mjs .
node $PLUGIN_ROOT/scripts/gtm-os-load/load.mjs . pipeline
node $PLUGIN_ROOT/scripts/gtm-os-remember/remember.mjs . --by marta@reflow.io --kind action --tools "gmail" \
  --people "Pierre Aubert" --content "Sent Pierre the TCO." --source gmail:19faefe8 --action "gmail:sent email:19faefe8"
node $PLUGIN_ROOT/scripts/gtm-os-contexts/contexts.mjs . --new berlin-expansion "Berlin expansion" "Everything about the Berlin office."
```

## 5. Who is who (step 2b: names)

`brain/entities/` holds one Markdown file per identity, including team members from setup.
Each file has a stable ID, name, aliases and contact references, plus a cited brief compiled
from context memories. New memories carry stable entity IDs alongside names.

In Codex:

1. *"Chris is Krzysztof Pawlak, email chris@reflow.io."*
   Expected: the identity tool creates his permanent Markdown file with the alias; `who_is` gives its path.
2. *"Remember that Chris asked Pierre for the deck."* (with `pipeline` loaded)
   Expected: the memory's `people` reads `["Krzysztof Pawlak", "Pierre Aubert"]`, and Codex
   tells you Pierre Aubert is a new person in entities/.
3. *"who is chris?"* Expected: Krzysztof Pawlak.
4. A one-word first name resolves when only one known person has it ("marta" → Marta Nowak);
   if two do, it stays as written and is reported.

Without Codex:

```bash
node $PLUGIN_ROOT/scripts/gtm-os-entities/entities.mjs . --add "Krzysztof Pawlak" --alias "Chris, Pawlak" --email chris@reflow.io
node $PLUGIN_ROOT/scripts/gtm-os-entities/entities.mjs . --who chris
node $PLUGIN_ROOT/scripts/gtm-os-entities/entities.mjs .
```

Entity files are editable. Keep their expected frontmatter format; the reader reports the
file, field and a proposed repair if parsing fails, leaving the file unchanged. Handwritten
Markdown survives background refreshes. Use `add_name` for routine identity changes,
`remember` to update factual records, and `entity_facts` and `compile_entity` for cited briefs.

## 6. Compile (step 3)

A context's summary is **behind** when it has memories newer than its last compile. Compile rewrites the
cover from the memories. The script computes people, tools, related contexts, confidence and
the timestamps; Codex writes two pieces of prose: the summary and Working guidance under your
standing rule (which is never changed).

In Codex, after a few memories in `pipeline`:

1. *"compile"* (or *"compile pipeline"*).
   Expected: it lists what is behind, reads the facts, then reports one line per context:
   *compiled pipeline: 4 memories, people 2, tools 2, related marketing, confidence medium (N=4)*.
2. `cat brain/contexts/pipeline/context.md`: frontmatter now has `summary`, `people`, `tools`,
   `related`, `last_active`, `confidence`, `compiled_at`, `compiled_by`; "When loaded" has your
   rule, then Working guidance. Not committed yet: say *"save"*, then `git log -1` shows it.
3. *"compile"* again: "every summary is up to date". Add a memory, compile again: only that context.
4. *"load pipeline"*: Codex reads the summary and any learned Working guidance.

Without Codex (you write the prose yourself):

```bash
node $PLUGIN_ROOT/scripts/gtm-os-compile/compile.mjs . --stale
node $PLUGIN_ROOT/scripts/gtm-os-compile/compile.mjs . --facts pipeline
node $PLUGIN_ROOT/scripts/gtm-os-compile/compile.mjs . --apply pipeline --as-of <as_of from --facts> --by marta \
  --summary "Bergstrom Home is the active opportunity. Confirm its renewal owner. ..." --now ""
```

`related` is computed as "contexts that mention the same people". `confidence` is low under 3
memories, medium under 10, high above.

## 7. The dashboard (step 4: render)

`work/home/index.html` is a read-only view of the brain, rebuilt after each saved change.
The local server listens on `127.0.0.1`; `work/dash.json` holds its stable address.
The dashboard always opens in the Codex pane and needs no login. Legacy `dashboard_browser`
values are ignored. Chrome setup is offered separately during onboarding for approved website
work that needs existing logins; MCP connectors remain the first choice.

- Browse contexts, memories, sources, entities, proposed changes and tool status.
- Questions about the brain contains questions tagged `brain-question`, identity ambiguities
  and proposed changes. Business follow-ups remain sourced context information.
- **Chat about this** opens a new Codex task in the absolute brain folder, with the current
  view and question references in a prepared prompt. Press Send to begin. It uses
  `codex://threads/new?path=<encoded-folder>&prompt=<encoded-prompt>`.
- Answers, corrections, approvals, connections and settings all go through Codex tools.
  The dashboard has no Add, Answer, Drop or approval controls and cannot start jobs.
- After an answer is saved with `retracts` pointing to its question, the viewer refreshes
  from the completed render, preserving view, search and scroll. It does not wait for a
  summary update. Revision events provide prompt updates; a one-second poll recovers misses.
- A lost connection shows the last update time. Opening the HTML file directly gives a
  saved copy with a working chat link, rather than a live view.

Onboarding choices use native Codex forms. If multi-select is unavailable, offer concrete
combinations in a single-select question. The progress card is view-only.

## 8. Recall (step 5)

Search across every context, loaded or not. Uses Node's built-in SQLite full-text index,
kept in `work/memory-index.sqlite` and updated when source files change; nothing to install, nothing committed.
The disk-backed cache also serves exact memory queries. It is rebuildable from the brain files,
uses a small page cache, and reads source records incrementally. Keyword indexing requires
`node:sqlite`, available without a feature flag in Node 22.13+ and current newer releases.

In Codex:

1. *"what do we know about the TCO?"* Expected: the matching memories grouped by context,
   each marked loaded or not loaded, with dates and authors.
2. *"what do we know about the CFO?"* Expected: the same hits, because "the CFO" is an alias of
   Pierre Aubert in `brain/entities/` (it says: expanded: Pierre, Aubert).
3. *"did we ever talk about unicorns?"* Expected: "nothing recorded about that", not a guess.
4. *"tell me about Pierre Aubert"* Expected: a three-line summary and a link to
   `brain/entities/pierre-aubert.md`: identity, a current cited overview, per-context state,
   open threads, relationships, recent developments and source pointers. A stale brief shows
   dated evidence until refreshed. No person page is created under work/.

Without Codex:

```bash
node $PLUGIN_ROOT/scripts/gtm-os-recall/recall.mjs . "TCO"
node $PLUGIN_ROOT/scripts/gtm-os-recall/recall.mjs . --person "Pierre Aubert"
```

## 9. Saving (git in the app)

Everything Codex writes is kept at once: one commit per change, in your name, shared when the
brain has a remote. You never say save. `save` exists for edits made by hand outside Codex (a
cover changed in an editor, names fixed by hand). APPROVE commits the workplace info; the
scheduled run's compile commits its covers; setup makes the first commit; upgrade keeps the rules
it refreshed. Anything you had staged yourself stays out of these commits.

Every writer ends with *kept* or *kept and shared*. There is nothing for you to do; the badge on
the session hook keeps files changed outside Codex; ask Codex to save if needed. From a terminal the scripts commit by themselves, one commit per change (`git log`
reads as a diary). `approve` commits in the app too, after its permission prompt.

A clone on another machine needs the plugin installed: the pre-commit hook validates memories
through the plugin's lib and refuses to commit them without it. The session hook points the
clone's git config at the running plugin, so opening the folder in Codex once is enough.

## 10. Fork (step 6)

One thread inside a context deserves its own context: a big deal in `pipeline`, one market in
`marketing`. Fork copies the standing rule, including purpose and boundaries, copies the matching memories (tagged
`forked:<from>`), and loads the new context. The original keeps everything.

In Codex: *"Bergstrom is becoming its own thing; fork it out of pipeline."* Expected: it
confirms the name and filter, then *forked pipeline -> bergstrom: 2 of 5 memories copied*.
Codex should also offer this itself when many memories in one context are about one account.

```bash
node $PLUGIN_ROOT/scripts/gtm-os-contexts/contexts.mjs . --fork pipeline bergstrom "Bergstrom Home" --filter bergstrom
```

## 11. The scheduled run (step 7)

Compile every context whose summary is behind, render, save the covers, on a schedule. Two ways:

**A. Codex app, Scheduled tasks.** In the project, create a scheduled task with this text:

> Run the gtm-os-sync skill as the scheduled run: compile every context whose summary is behind with by: schedule, render the
> dashboard.
> Do nothing else.

Weekly (Sunday 20:00) or nightly. Run it in the local project. Computer on, app running.

**B. launchd or cron**, no app needed:

```bash
bash $PLUGIN_ROOT/scripts/gtm-os-schedule/scheduled-run.sh ~/brain-try      # run it once by hand first
```

Then the plist in `scripts/gtm-os-schedule/launchd.plist.example` (replace the two paths, load with
`launchctl`), or a cron line. Both call `codex exec`, so Codex must be signed in.

Check: `git log --oneline | head` shows `scheduled: compile pipeline`; `work/hooks.log` has
`scheduled-run` lines; the dashboard's "Needs attention" is empty.

## 12. Connecting the tools (connect)

Setup records which tools you use; `connect` checks Codex can reach them. The tools that
matter (HubSpot, Attio, Gmail, Google Calendar, Granola, Wispr Flow, Linear, Notion, ...) have
an **official Codex plugin** in the curated marketplace (`openai-curated-remote`). The check
matches each tool name against the live catalog, by plugin id or display name, so a plugin that
appears next week is found without a plugin update; nothing is listed in the plugin itself.
Installing one is one command; you sign in once in the app.

The check runs by itself at every session start (about a second) and feeds the dashboard's Tools
panel; Codex then offers, unasked, to install a listed tool that is missing or to add an installed
plugin that `admin.md` does not mention. On demand: *"connect my tools"*. Expected, per tool:
*installed* / *available, not installed*
(with the command) / *no official plugin* (export or paste). Say yes to install HubSpot or
Attio; Codex runs `codex plugin add hubspot@openai-curated-remote` and tells you to sign in
when prompted. Then *"is HubSpot connected?"*: Codex reads one deal and records
`read test: ok (57 deals)`. The session line shows `tools: hubspot ● gmail ○ granola ✕`.

Without Codex:

```bash
node $PLUGIN_ROOT/scripts/gtm-os-connect/connect.mjs . --check
codex plugin add attio@openai-curated-remote
```

Credentials are personal (`work/tools.json` is local and ignored). A teammate runs `connect`
in their own Codex. **This is the part to test first with a real HubSpot or Attio account:**
whether the sign-in is really one click, and what the read test returns.

## What is where

```
plugins/gtm-os/
  lib/brain.mjs              the file format: read, validate, append. Everything goes through it.
  skills/<workflow>/SKILL.md user workflow; references/ holds internal procedures
  skills/gtm-os-*/           operation scripts keep their existing paths
  hooks/                     SessionStart (lists contexts), PreToolUse (protects admin.md, memories.jsonl)
  templates/                 AGENTS.md, admin.md, pre-commit hook, gitignore
```

A brain, after setup:

```
brain/admin.md                          workplace info, protected, changed via APPROVE
brain/entities/*.md                        identity metadata and cited briefs from context memories
brain/contexts/<slug>/context.md        the context cover
brain/contexts/<slug>/memories.jsonl    append-only records; the fields are validated in lib/brain.mjs
work/                                   ignored: loaded-contexts.json, hooks.log, proposals
```

## When something is off

- Codex offers a skill that does not exist (`init`): the app cached an old skill list. Start a
  new chat, then quit and reopen the app. If it persists: `codex plugin add gtm-os@gtm-os` again.
- The hook never fires: the hooks are not approved (`work/hooks.log` is empty in that case).
  `node <plugin>/hooks/trust-hooks.mjs` reports each hook; `--trust` approves them.
- A local install (`./dev-install.sh`) works in chats but GTM OS is missing from the app's Plugins
  tab: the tab lists a local marketplace only when its folder is a trusted project. Open the
  checkout as a project in Codex and accept the trust prompt. `codex plugin list` shows the truth
  either way.
- A local install goes back to an older version every time the app starts: a second checkout
  that Codex trusts still has `.agents/plugins/marketplace.json` with the marketplace name
  `gtm-os`, and the app reinstalls from it at launch whatever `config.toml` says. Rename or remove
  that manifest in the other checkout, then run `./dev-install.sh` again.
- `codex exec` hangs: add `</dev/null`. Hooks under exec need `--dangerously-bypass-hook-trust`.
- Pre-commit says the plugin is not installed: `git config gtm-os.lib <path to plugins/gtm-os/lib/brain.mjs>`,
  or open the folder in Codex once (the session hook sets it).
- Pre-commit says a record "was changed" or "removed": memories are append-only. Restore the
  file (`git checkout brain/contexts/<slug>/memories.jsonl`) and record the correction with
  `remember --supersedes` or `--retracts`.
- Setup says the folder is not empty: it makes its own repo, hooks path and git identity there;
  give it an empty folder (a README and a `.gitignore` may stay; the ignore rules are merged).

The dashboard server listens on 127.0.0.1 only and accepts reads. It serves rendered files
and revision notifications, rejects other host names and refuses all write requests.
Chat about this is a navigation link; changes and approvals happen in Codex.

## What the guards do and do not do

The write gate and the pre-commit hook stop the model, and you, from editing the protected files
by mistake: a direct edit is denied, a changed or removed memory is refused at commit, admin
changes need the word APPROVE plus Codex's own permission prompt for the audit line. The GTM OS
tools run outside the sandbox and commit only through `save`, on your word. They do not
stop a determined person with the terminal: `git commit --no-verify`, a rewritten history, or
Codex run with full access and no sandbox all get past them. The audit is the git history on the
shared remote; the guards keep it honest, they do not make it tamper-proof.

## Also

`GUIDE.md` is the ten-minute guide for the person using it; `COMMANDS.md` the reference for every
command.

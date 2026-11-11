# GTM Brain: handover

State at `main` `fd653a1`, plugin version 0.32.0, 2026-11-11. This document is a map for a new
owner. Each feature is described in full in its owning document (see the docs map in
[CLAUDE.md](CLAUDE.md#docs-map)); this file links there instead of repeating it. The last section
covers the main open problem (memories are written only when the chat model decides to), how
recall scales, and whether Cognee is worth adopting.

## 1. What it is, in one paragraph

GTM Brain (renamed from GTM OS in 0.31) is a Codex plugin, with beta support for Claude Code, that keeps a revenue
team's "company brain" in the team's own git repo. The model talks to it through one MCP server
(`plugins/gtm-brain/server/server.mjs`). Every tool spawns an operation script in the brain
folder, and every write goes through `plugins/gtm-brain/lib/` and is committed straight away.
The truth is plain files: append-only JSONL memories per context, Markdown entity files, and a
protected `admin.md`. Everything else (summaries, the dashboard, the SQLite search index) is
derived from those files and can be rebuilt.

## 2. Architecture at a glance

```
person ── Codex / Claude Code ── skills (14 SKILL.md workflows, plugins/gtm-brain/skills/)
                                   │
                                   ▼
                     MCP server  server/server.mjs  (stdio JSON-RPC, Node built-ins only)
                     tools generated from ontology/gtm-brain.ossie.json via lib/ontology/
                                   │ spawns, cwd = brain
                                   ▼
                     operation scripts  scripts/gtm-brain-*/  (remember, load, recall, compile, ...)
                                   │
                                   ▼
                     lib/  (file format, the only write path, commit, rerender)
                                   │
          ┌────────────────────────┼─────────────────────────┐
          ▼                        ▼                         ▼
   brain/contexts/<slug>/   brain/entities/*.md        work/ (gitignored)
     memories.jsonl          identity, aliases,         memory index (SQLite FTS5),
     context.md (cover)      cited brief                dashboard, loaded set, logs
```

Hooks (`plugins/gtm-brain/hooks.json`, Claude: `hooks/claude-hooks.json`):

| Event | Script | Purpose |
|---|---|---|
| SessionStart | `session-start.sh` | resolve the brain, reload last contexts with `--last 0`, version check, opening lines |
| PreToolUse (`apply_patch`, `exec_command`, `shell_command`) | `gate-protected-write.sh` | deny direct edits to `admin.md`, `memories.jsonl`, the company ontology |
| PostToolUse (`mcp__*`) | `tool-usage.sh` | usage log |
| UserPromptSubmit, Stop | `turns.sh` | turn log |

Hooks only run while Codex holds a trust hash for them. From Codex 0.164 the hash also covers
the plugin's file contents, so **any plugin change, including a version bump, switches every
hook off** until `hooks/trust-hooks.mjs --trust` runs again. `dev-install.sh` and `update.mjs`
run it. An update the Codex app makes on its own does not, so the MCP server warns once per
start (`host.texts.hooksOff`).

Full layer description: [CLAUDE.md, Architecture](CLAUDE.md#architecture). Brain on disk:
[CLAUDE.md, A brain on disk](CLAUDE.md#a-brain-on-disk).

## 3. Install and develop

| Goal | Command | Owning doc |
|---|---|---|
| Install for a user (Codex) | `codex plugin marketplace add gtm-week/gtm-brain`, `codex plugin add gtm-brain@gtm-brain`, then `node ~/.codex/plugins/cache/gtm-brain/gtm-brain/0.32.0/hooks/trust-hooks.mjs --trust` (prints "Safety locks: on") | [SETUP.md](SETUP.md), [INSTALL.md](INSTALL.md) |
| Guided install | user pastes "Read .../INSTALL.md and follow it exactly" into Codex in an empty folder | [INSTALL.md](INSTALL.md) |
| Install in Claude Code (beta) | `/plugin marketplace add gtm-week/gtm-brain`, `/plugin install gtm-brain@gtm-brain` | [README.md](README.md) |
| Migrate an old gtm-os install | `node scripts/migrate-install.mjs codex\|claude` | [MIGRATING.md](MIGRATING.md) |
| Dev install of this checkout | `./dev-install.sh` (Codex) or `./dev-install.sh --claude`, then a new chat | [SETUP.md](SETUP.md) |
| Wipe and reinstall the test brain | `./dev-reset.sh [folder]` (default `~/Desktop/test-brain`; wipes only empty folders or ones it created) | [CLAUDE.md](CLAUDE.md#commands) |

Requirements: Codex 0.149+, Node 22.16+ (22.x) or 24+. Node 23 and 22.13 to 22.15 lack FTS5 in
`node:sqlite`. Runtime code has no npm dependencies; the React dashboard is prebuilt from
`frontend/dashboard/` into `plugins/gtm-brain/scripts/gtm-brain-render/ui/` and committed.

Claude Code limits: background summaries need Codex on the same machine
(`host.compiles` is false for claude, `lib/host.mjs`), and connector checks and the dashboard's
chat buttons are Codex only.

## 4. Usage patterns

### 4.1 Skills (what people type)

| Skill | What it does | Typical prompt |
|---|---|---|
| `gtm-brain-start` | create the brain, six-step onboarding, import a handoff | "Set up GTM Brain here" |
| `gtm-brain-use-brain` | contexts, remember, recall, forget, compile, dashboard | "load pipeline", "remember this", "what do we know about Acme" |
| `gtm-brain-configure` | workplace info, team, tools, APPROVE, connections, plugin update, GitHub push | "connect my tools", "is HubSpot connected", "update GTM Brain" |
| `gtm-brain-sync` | pull updates from connected tools (one subagent per tool), schedules | "sync", "catch up", "sync every morning" |
| `gtm-brain-todo` | what is waiting on me, one item at a time; health check | "what should I do now", "who do I owe a reply" |
| `gtm-brain-deepdive` | sourced one-page brief on an entity or context | "prepare me for the call with Pierre Dupont" |
| `gtm-brain-define-icp` | ICP interview, writes one draft ICP document | "define our ICP" |
| `gtm-brain-market-desk-research` | 15 to 30 minutes of sourced market research | "research this market" |
| `gtm-brain-unit-economics` | CAC, LTV12/24, payback, PUSH/FIX/STOP/MEASURE | "is our CAC ok" |
| `gtm-brain-strategy` | Playing to Win intake into `strategy.md` | "run the strategic intake" |
| `gtm-brain-workflow` | playbooks and runs with gates | "start the outbound workflow", "next step" |
| `gtm-brain-project` | link, unlink, repair or list project folders | "link this folder" |
| `gtm-brain-document` | standing documents (voice, ICP, pricing) | "add our tone of voice" |
| `gtm-brain-skill` | the user's own skills, install from GitHub | "make this a skill" |

### 4.2 End-to-end flows

1. **First run** ([ONBOARDING.md](ONBOARDING.md)). In an empty folder: "Set up GTM Brain here".
   `check_environment`, then `setup_brain`, then six steps: who you are, company profile
   (APPROVE), tools, what's going on, running for you (daily sync), projects. Default contexts:
   `company`, `strategy`, `market`, `icp`, `offer`, `personal-<handle>`.
2. **Everyday capture and recall** ([GUIDE.md](GUIDE.md), [COMMANDS.md](COMMANDS.md)).
   `load_context pipeline`, then the model calls `remember` with `content`, `kind`
   (note, decision or question), `people`, `sources`. A correction is a new record with
   `supersedes` or `retracts`. `recall "<keywords>"` searches every context. `who_is` and
   `add_name` resolve and register entities. `query` reads views (`status`, `brief`,
   `customers`, `meetings`, `health`, `deal`) or runs one read-only SQL statement over the index.
3. **Meetings**. Capture from a connected transcript source through `remember` with meeting
   fields; read with `meeting_overview`. Scheduled entry point:
   `scripts/gtm-brain-schedule/daily-run.mjs <brain> <handle>`.
4. **Connectors** ([SETUP.md](SETUP.md) section 12). `check_tools` / `mark_tool` match
   `admin.md` tools against the Codex connector catalog (for example
   `codex plugin add hubspot@openai-curated-remote`); state in `work/tools.json`. CRM writes
   follow `references/hubspot-writes.md`, `attio-writes.md`, `crm-writes.md`.
5. **Protected changes**. `propose_admin_change` writes `work/admin.proposed.md` and shows a
   diff; only the literal `APPROVE` runs `scripts/gtm-brain-approve/approve.mjs . --apply --by <handle>`
   as a shell step with a permission prompt ("ok", "yes" and "go ahead" are refused). Company
   interactions: `propose_interaction` then `approve.mjs --interaction`, then they run through
   `interact`.
6. **Projects** ([CLAUDE.md](CLAUDE.md), invariant on projects). `link_project` writes a marked
   block in the folder's `AGENTS.md`; notes made there carry `project:<slug>`; recall in a
   project ranks its own hits first.
7. **Documents, user skills, workflows**: [DOCUMENTS.md](DOCUMENTS.md),
   [USER-SKILLS.md](USER-SKILLS.md), [WORKFLOWS.md](WORKFLOWS.md).
8. **Dashboard**: `open_dashboard`. `server/dash.mjs` serves `work/home/` read-only on
   127.0.0.1; "Chat about this" opens a `codex://threads/new` link with a prepared prompt.
9. **Sharing**: `share_brain` creates a private `<company>-brain` GitHub repo with `gh`.

### 4.3 Example: one remember call and what it does

```jsonc
// remember (MCP) -> scripts/gtm-brain-remember/remember.mjs
{ "context": "pipeline", "kind": "decision", "by": "ann-lee",
  "content": "Acme pilot approved at 20 seats, decision by Pierre Aubert",
  "people": ["Pierre Aubert"], "companies": ["Acme"],
  "sources": ["gmail:19faef01"] }
```

1. Validates every entry before writing any (no long dashes, known kind, context exists,
   corrections point into the same context).
2. Resolves names against `brain/entities/`. A look-alike ("Piere Aubert") holds the entry back
   and the model must ask "same as Pierre Aubert?". Nothing is merged on a guess.
3. Appends one JSON line to `brain/contexts/pipeline/memories.jsonl` with a content-hash ID.
4. Commits that one file (one commit per memory) and pushes in the background if there is a remote.
5. Re-renders the dashboard and, after `GTM_BRAIN_COMPILE_DELAY` (600 s) of quiet, a background
   Codex run rewrites the context's cover summary (`compile_facts` then `compile_apply`).

## 5. Configuration

### 5.1 In the brain

| Where | What | How it changes |
|---|---|---|
| `brain/admin.md` | `company`, `owner`, `team`, `tools`, `dashboard: always\|on-demand`, `deal_scoring: on\|off` | only through APPROVE |
| `brain/contexts/<slug>/context.md` | standing rule ("When loaded"), compiled summary and working guidance | rule by `edit_context`; summary by compile; hand edits pause compile until reviewed |
| `brain/entities/*.md` | identity, aliases, emails, not-same, cited brief | `add_name`, `update_entity`, `merge_entities`; hand edits preserved |
| `brain/ontology.ossie.json` | the company's own interactions | `propose_interaction` plus APPROVE |
| project `AGENTS.md` block | `GTM Brain project: <slug>` and `GTM Brain brain: <path>` | `link_project` |
| `work/` | loaded set, projects.json, tools.json, index, logs | machine-local, disposable |

### 5.2 Environment variables (runtime)

`GTM_OS_*` names are still accepted and copied to `GTM_BRAIN_*` at start (`lib/host.mjs`).

| Variable | Effect | Default |
|---|---|---|
| `GTM_BRAIN_HOST` | `codex` or `claude` | codex |
| `GTM_BRAIN_RUN` | unattended run (`background`, `schedule`, `dashboard`): no dashboard, compile tools listed, no chat source attached | unset |
| `GTM_BRAIN_TOOLSET=compile` | the summary run sees only compile tools | unset |
| `GTM_BRAIN_COMPILE_DELAY` | seconds of quiet before a background compile | 600 |
| `GTM_BRAIN_COMPILE_RETRY` / `_TIMEOUT_MS` / `_BY` / `_FULL_CONFIG` | compile retry gap, pass timeout (900000), who compiles, full Codex config | 10, 900000, schedule, slim |
| `GTM_BRAIN_NO_COMPILE` / `_NO_COMMIT` / `_NO_OPEN` / `_NO_WATCH` | turn off compile, commits, opening, the file watcher | unset |
| `GTM_BRAIN_NO_SESSION_MAINTENANCE` / `_NO_HOOK_CHECK` / `_NO_VERSION_CHECK` | skip those session steps | unset |
| `GTM_BRAIN_SOURCE` / `_SOURCE_REF` | update source and ref | host config |
| `GTM_BRAIN_CODEX_TIMEOUT`, `GTM_BRAIN_CATALOG_DIR` | connector catalog lookup | 60000 ms, `$CODEX_HOME/cache/remote_plugin_catalog` |
| `GTM_BRAIN_SKILL_SOURCE`, `GITHUB_TOKEN`/`GH_TOKEN` | skill installs | `https://api.github.com` |
| `GTM_BRAIN_HOME` | where handoff files are looked for | `$HOME` |
| `GTM_BRAIN_SKIP_VALIDATE=1` | brain pre-commit skips memory validation | unset |
| `CODEX_HOME`, `CLAUDE_CONFIG_DIR` | host profile directories | `~/.codex`, Claude default |

Test and bench only: `GTM_BRAIN_SKIP_TESTS`, `_SKIP_BENCH`, `_SKIP_CLAUDE` (pre-push),
`GTM_BRAIN_BENCH_MAX_OVERHEAD` (14000), `GTM_BRAIN_EVAL_*`, `GTM_BRAIN_NOW`, `OPENAI_API_KEY` and
`OPENAI_JUDGE_MODEL` for the judge.

### 5.3 Scheduling

Three ways, described in [SETUP.md](SETUP.md) section 11 and `skills/gtm-brain-sync/references/`:
a Codex app scheduled task; `scripts/gtm-brain-schedule/scheduled-run.sh <brain>` from launchd
(`launchd.plist.example`) or cron; `daily-run.mjs <brain> <handle>` for meetings plus compile.

## 6. Testing, CI, release

- Suite: `node --test 'plugins/gtm-brain/test/*.test.mjs'` (70 files). Tests build throwaway
  brains with `setup` and set `GTM_BRAIN_NO_COMMIT` and `GTM_BRAIN_NO_COMPILE`.
- CI (`.github/workflows/ci.yml`): ubuntu and macOS on Node 22.16 and 24, the suite plus
  `node scripts/sync-derived.mjs --check`; a second job rebuilds the dashboard and fails on drift.
- Pre-push to `main` (`.githooks/pre-push`): suite, then `test/live/harness-bench.mjs` when
  shipped files changed (the plugin must not cost Codex solved tasks or add more than 14000
  prompt tokens), then `test/live/claude-smoke.mjs` when `claude` is on PATH.
- Live tests in `test/live/` need personal Codex and Claude sign-ins and stay local.
- Release = version bump in `plugins/gtm-brain/.codex-plugin/plugin.json`, the same number in
  the cache paths in SETUP.md and COMMANDS.md, `node scripts/sync-derived.mjs`, push to `main`.
  Without a bump nobody is offered the change. `release/template/` holds only social graphics.

## 7. Known issues for the new owner

Docs and naming:
- The git remote is still `github.com/gtm-week/gtm-os`; docs say `gtm-week/gtm-brain` and rely
  on GitHub's redirect. AGENTS.md also says the plugin ships from `gtm-week/gtm-os`.
- ONBOARDING.md says the repo is private and needs GitHub access; README, INSTALL and SETUP say
  public and no sign-in.
- COMMANDS.md (setup section) still describes nine questions and three contexts; setup now
  creates six.
- Compile timing is described three ways: README and CONTRIBUTING say 10 minutes of quiet (the
  code), COMMANDS.md and GUIDE say "immediately"; GUIDE also says Codex offers to compile,
  while `remember.mjs` tells the model not to.
- GUIDE says the dashboard opens at every chat start; README says only on request.
- Stale version stamps in WORKFLOWS.md (0.28.0), USER-SKILLS.md (0.22.0, "the other ten"
  skills), DOCUMENTS.md (0.27.0, "GTM OS"); `launchd.plist.example` hard-codes `0.3.0`.
- Leftover `gtm-os` names: the export skill triggers on "hand off to gtm os",
  `session-start.sh` sets `gtm-os.lib`. Legacy readers for `gtm-os` pointers, skills and entity
  files are deliberate compatibility code with no removal date.
- `gtm-brain-configure`'s description points to a non-existent `gtm-brain-update` skill.
- `skills/gtm-brain-add-file/` and `skills/gtm-brain-project/project.mjs` are scripts under
  `skills/`; everything else lives in `scripts/`.

Operational risks:
- Hook trust drops after any plugin change and after app-driven updates; `trust-hooks.mjs`
  depends on Codex internals (hash formats, app server).
- A second trusted checkout with a `gtm-brain` marketplace makes Codex reinstall the old version.
- The write gate is best effort: `--no-verify` or a full-access sandbox gets past it.
- Live benches depend on specific model names and personal accounts.
- IMPORT.md and `plugins/gtm-brain/claude/gtm-brain-export/SKILL.md` must be kept identical by hand.

## 8. Memory: proactive capture, recall at scale, and Cognee

### 8.1 How it works today

| Path | Mechanism | Code |
|---|---|---|
| Write | model supplies context, kind, people and sources explicitly; lib validates, resolves names, appends one JSON line, commits once per memory | `scripts/gtm-brain-remember/remember.mjs`, `lib/brain.mjs` `appendMemory` |
| Recall | FTS5 keyword search: each word becomes an `OR` term, names expanded through the entity aliases, ranked by bm25, at most 40 hits per group | `lib/keyword-recall.mjs`, `lib/memory-index.mjs` `keywords()` |
| Load | the context's compiled cover plus the **last 15** memories by time | `scripts/gtm-brain-load/load.mjs` |
| Session start | covers only (`--last 0`) for the contexts loaded last time | `hooks/session-start.sh` |
| Summaries | a background model run receives **every effective memory** of a context and rewrites the cover | `scripts/gtm-brain-compile/compile.mjs --facts` |
| Entity brief, deal health | every memory that mentions the entity | `lib/entities.mjs` `entityFacts`, `scripts/gtm-brain-recall/deal-health.mjs` |
| Index | disposable SQLite cache in `work/`, incremental by append receipts, rebuilt from JSONL | `lib/memory-index.mjs` |

The determinism is deliberate: memories are append-only and cited by ID, nothing is merged on a
guess, protected truth changes only with APPROVE, and the test suite and harness bench depend on
reproducible output. Any change must keep those properties.

### 8.2 The main problem: nothing writes unless the model decides to

Every memory is written because the chat model chose to call `remember` in the middle of
another task. Nothing else in the system writes on its own:

- **The only trigger is one instruction.** Rule 2 of `plugins/gtm-brain/templates/AGENTS.md`
  (line 272 of 568) says "Record new information as it becomes available... Before finishing,
  check the turn for omissions." It competes with roughly 500 other lines, and nothing checks
  that it was followed.
- **The hooks watch but never act.** `hooks/turns.sh` runs on UserPromptSubmit and Stop, and
  `hooks/tool-usage.sh` on every MCP call. They log the prompt, the last answer (600 characters)
  and the tool calls to `work/turns.jsonl` and `work/tool-usage.jsonl`. Only the advisor reads
  those files, to suggest skills. A turn that read HubSpot, Gmail or a pasted Slack thread and
  wrote nothing ends unnoticed.
- **Background runs only summarize.** The background compile and the scheduled runs rewrite
  covers from memories that already exist. They never extract new memories from conversations.
  `gtm-brain-sync` writes only when someone runs it or schedules it.
- **No test checks unprompted capture.** Every live write case in `test/live/tool-routing.mjs`
  tells the model to save ("Remember this decision", "Save these three findings", "Please keep
  both"). No case gives facts without a save verb and checks that a memory appears. The
  harness bench pushes the other way: GTM tools must stay silent on work that is not GTM.
- **Writing has friction.** `remember` wants a context, people and companies. A look-alike name
  holds the entry back until the person answers "same as X?". A model in the middle of a task
  has every reason to skip the write.

Evidence from the one real brain on this machine (`~/Documents/ChatGPT/GTM-OS`, GTM OS 0.9 to
0.20, September 2026; a small, old sample): of 27 logged prompts, 10 were scheduled compile
runs. Of the 17 interactive turns, 8 called `remember` (47%). On 2026-09-13, a pasted Slack
thread naming two teammates went through several turns with Slack and browser tools and
produced no memory.

#### Design: make capture a system behaviour, not a hope

These layers work together. Each one keeps the current write path (`remember` and `lib/`), the
append-only format and the citation rules.

1. **Measure it first.** Add live cases with no save verb: a pasted Slack or email thread, a
   HubSpot fixture read that shows a stage change, "draft a reply to Pierre, he said the budget
   moved to Q2". Each checks that a sourced memory exists afterwards. Add negative cases that
   must write nothing (an unsent draft, a private calendar lookup, a self-contained puzzle),
   so capture cannot be bought with noise. Add an offline report over `work/turns.jsonl` and
   `work/tool-usage.jsonl`: interactive turns, the share with a write, and turns that used a
   non-GTM connector but wrote nothing. Run it on real brains before and after each change.
2. **Check at the end of each turn (Stop hook).** Both hosts let a Stop hook return
   `{"decision": "block", "reason": "..."}`, which hands the reason back to the model as its
   next instruction instead of ending the turn. `turns.sh` already runs on Stop. Extend it:
   - fire only in a brain, never when `GTM_BRAIN_RUN` is set, and once per turn (use
     `stop_hook_active` so it cannot loop);
   - fire only when this turn wrote nothing and something suggests new information: a non-GTM
     MCP call (CRM, mail, calendar, Slack, meeting notes), a long or pasted prompt, or a
     registered entity named in the prompt;
   - the reason is short: "Before you finish: did this turn establish anything rule 2 keeps?
     If so, remember it in one batch. If not, finish without mentioning this."
   The trigger is deterministic; whether there is anything to keep stays the model's call. The
   cost is one extra model step, on flagged turns only. The harness bench and the token budget
   catch over-firing. Editing a hook script drops hook trust from Codex 0.164, so re-trust
   after the change, as after any plugin change. Check the exact Stop payload on the installed
   Codex version before relying on it (third-party summary of the Codex behaviour:
   [codex-hooks.md](https://github.com/shanraisshan/codex-cli-best-practice/blob/main/best-practice/codex-hooks.md)).
3. **A background capture run for what the chat missed.** Reuse the compile machinery
   (`background-compile.sh`, `run-bounded.mjs`, `codex exec` with `GTM_BRAIN_RUN`) with a new
   toolset (`GTM_BRAIN_TOOLSET=capture`: `recall`, `who_is`, `remember` only). After a chat has
   been quiet for a while, the run reads that chat's transcript since its last checkpoint.
   Codex threads are already resolved by `lib.resolveThread`; Claude gives `transcript_path` in
   the hook payload. It writes the missed outcomes through `remember`, with source
   `codex:<thread>` and the tag `captured`. Before writing, it skips anything already recorded
   from that thread, drafts, and exclusions the person stated. A look-alike name becomes a
   `brain-question` instead of blocking the run. The dashboard can list captured memories for
   review; a wrong one is retracted like any other.
4. **Make writing cheaper in the chat.** Accept `remember` with only `content`: route it to
   the single loaded context or an inbox context, keep unresolved names as mentions, and let
   the compile or capture run resolve them later. Turn the look-alike hold into a note written
   now plus a question, not a blocked write. Restate rule 2 in one line in the session-start
   output, where every chat sees it. Changing `templates/AGENTS.md` needs the legacy snapshot
   described in [CLAUDE.md](CLAUDE.md#shipping-a-change).

More capture means more memories per context, which brings the compile limit in 8.4 forward.
Incremental compile (8.7, step 1) has to ship together with layers 2 and 3.

**Where a library fits.** No library enforces writes. A memory library only sees what the
harness feeds it, so enforcement is layers 2 and 3 either way. Where a library does help is the
step after enforcement: turning a conversation into well-structured, de-duplicated,
time-aware facts. Section 8.9 covers that.

### 8.3 Measured on a synthetic brain

Throwaway brain made with `setup`, synthetic valid memories spread over the six default
contexts, Apple Silicon laptop, Node 24, `GTM_BRAIN_NO_COMMIT=1`:

| Memories | Index build (first recall) | Recall (warm) | Load (`--last 15`) | Remember | `compile --facts` output for one context |
|---|---|---|---|---|---|
| 1,000 | 0.16 s | 0.08 s | 0.08 s | 0.09 s | 30 KB |
| 10,000 | 0.92 s | 0.10 s | 0.10 s | 0.10 s | 292 KB |
| 50,000 | 4.3 s | 0.12 s | 0.10 s | 0.09 s | **1.46 MB** (about 360k tokens) |

Quality probes on the 50,000-memory brain:
- `recall "pricing"` returns 2,945 matches, of which the model sees 40, ranked by term frequency
  rather than by relevance to the question.
- `recall "price"` returns **nothing**: the FTS5 table uses the default `unicode61` tokenizer
  with no stemming, so "price" does not match "pricing".
- `recall "which deals are worried about cost"` matched on the word "about"; every word is an
  `OR` term and stop words are not removed.

### 8.4 Where it does not scale

Speed is not the problem. Local reads stay fast up to at least 50,000 memories. What breaks is
how much the model has to read, and how relevant it is:

1. **Summaries read everything.** `compile --facts` passes every effective memory of a context
   to one model pass. Somewhere around 3,000 to 5,000 memories in one context this no longer
   fits the window or the 900 s timeout, and the cover stops updating. This is the first hard
   limit and it is unrelated to Cognee.
2. **Recall is literal.** No stemming, no synonyms, no meaning. A question has to share words
   with the note. The model compensates by guessing keywords, which is the non-scaling,
   "deterministic" feel the team reports.
3. **Load is recency, not relevance.** A context opens with the last 15 notes, whatever the task.
4. **Entity briefs and deal health read every mention.** These grow with the account's history
   and will hit the same limit as compile for large customers.
5. **The model does the structuring on write.** Context, kind, people and companies are chosen
   by the model at write time and corrected by holds ("same as X?"). That is accurate but costs
   turns; relations between facts (who decided what, for which deal) live only in prose.
6. **One git commit per memory.** 50,000 memories means 50,000 commits and background pushes.
   Fine for history, slow for clones and `git log` tooling over time.

### 8.5 What Cognee offers

Cognee (topoteretes, Apache-2.0; v1.6.1, 2026-09-24) builds a knowledge graph plus vector index
from ingested text and answers with graph-aware retrieval. Its current API is `remember`,
`recall`, `improve`, `forget`. It ships as:

- Python 3.10 to 3.14 (main library, REST server on port 8000, MCP server `cognee-mcp`);
- `@cognee/cognee-ts`, Node bindings to the Rust core (`cognee-rs`) built with Neon, which means a
  native binary per platform;
- defaults: SQLite, Kuzu (graph), a local vector store; embeddings from OpenAI, Ollama or ONNX;
  `cognify` (entity and relation extraction) needs an LLM, `gpt-4o-mini` by default, any
  OpenAI-compatible endpoint allowed;
- 17 search types (for example `GRAPH_COMPLETION`, `CHUNKS`, `RAG_COMPLETION`,
  `HYBRID_COMPLETION`), datasets, per-item `forget`, and metadata stamped on every chunk.

Sources: [github.com/topoteretes/cognee](https://github.com/topoteretes/cognee),
[TypeScript SDK](https://docs.cognee.ai/typescript/getting-started),
[Memory API](https://docs.cognee.ai/typescript/memory-api),
[cognee-rs TS README](https://github.com/topoteretes/cognee-rs/blob/main/ts/README.md),
[MCP tools](https://docs.cognee.ai/cognee-mcp/mcp-tools).

### 8.6 Fit with the invariants

| Invariant | Cognee as the store | Cognee as a derived index |
|---|---|---|
| JSONL and entity Markdown are the truth; the index is never a second store | breaks it | fits: rebuildable from JSONL, like the SQLite index |
| Runtime uses Node built-ins only; no npm install or network for users | breaks it (native addon or Python, LLM calls) | acceptable only as an **opt-in** sidecar; the keyword path stays the default |
| Memories are append-only, corrections by `supersedes` / `retracts` | Cognee mutates the graph | map a correction to `forget(data_id)` plus re-add |
| Entity identity lives in `brain/entities/`; never merge on a guess | LLM extraction creates its own entities | feed registered entities in as known nodes; treat extracted ones as candidates the person confirms |
| Every answer cites memory IDs | answers are LLM text | carry `memory_id`, `context`, `entities` in chunk metadata; read the cited records back from JSONL |
| Customer data stays in the team's repo | `cognify` sends text to an LLM provider | needs explicit consent, or a local model (Ollama) |
| Tests and the harness bench are deterministic | not deterministic | keep it out of the default path; bench it separately |

### 8.7 Recommendation

Fix capture first: a brain that is not written to has nothing to recall, whatever the search
engine. Do not replace the memory store. Adopt Cognee, if at all, as an optional recall backend
behind the existing tools, after the cheaper fixes.

**Step 0: proactive capture (8.2), in this order.**
1. Unprompted-capture live cases, negative cases, and the offline capture-rate report. This is
   the baseline every later step is judged against.
2. The Stop-hook end-of-turn check. Ship it with incremental compile (step 1.1 below).
3. The background capture run over chat transcripts.
4. Lower write friction in `remember` and the one-line capture rule at session start.
5. Typed facts with a fixed relation vocabulary and mandatory resolution (8.9), with a
   Graphiti or Cognee extractor spike measured against the native path.

**Step 1: cheaper recall fixes (days, no new dependencies).**
1. Make compile incremental: send the previous cover plus the memories newer than
   `compiled_at`, and above a threshold summarize in time-ordered batches. This removes the hard
   limit in 8.4.1, and the same change applies to entity briefs and deal health.
2. Improve the FTS index: a `porter unicode61` tokenizer (fixes price vs pricing), stop-word
   removal, column weights in `bm25()` (content and people over tools), and recency in the
   ranking. This needs `MEMORY_INDEX_VERSION` raised to 5; the cache rebuilds itself.
3. Load by relevance: when the request is known, `load` shows the top hits for it within the
   context alongside the last few notes.

**Step 2: a recall backend interface.** Put one seam in `lib/` (`recall(root, query, opts)` and
`onAppend(record)`), with the current keyword search as the default implementation. Select the
backend in `admin.md` (`recall_backend: keyword | cognee`, changed through APPROVE, because it
decides where customer text goes).

**Step 3: a Cognee spike behind the seam (one to two weeks).**
- Run `cognee-mcp` or the Python server as a sidecar the person installs on purpose; do not
  bundle `@cognee/cognee-ts` until prebuilt binaries for macOS arm64/x64 and Linux are verified.
- Feed it from the JSONL with the existing append receipts (`lib/memory-journal.mjs`): one Cognee
  dataset per brain, `node_set` per context, metadata `memory_id`, `context`, `entities`, `at`.
- Map `supersedes` and `retracts` to `forget(data_id)`; a full rebuild from JSONL must give the
  same answers.
- `recall` returns memory IDs; the tool reads the records from JSONL and prints them with the
  same citation format as today.
- Write an evaluation first: about 50 questions with expected memory IDs on a seeded brain of
  10,000+ memories (extend `test/live/`), and compare keyword search after Step 1 against
  Cognee `CHUNKS`, `HYBRID_COMPLETION` and `GRAPH_COMPLETION` on recall@10, latency, cost per
  1,000 memories ingested, and whether the results stay the same across runs.

Adopt Cognee only if it clearly beats the improved keyword search on that evaluation, and only
for brains whose owners accept the LLM data flow. Either way, the write path, the file format
and the APPROVE gate stay as they are.

### 8.8 Alternative to keep in view

If the evaluation shows that meaning-based matching, rather than graph reasoning, is what is
missing, a smaller option is embeddings stored in the existing SQLite index (a vector column,
cosine similarity in JS over the candidate set), with embeddings from an optional local Ollama
or a configured provider. It keeps one cache, one rebuild path and no graph to reconcile with
`brain/entities/`.

### 8.9 Structured knowledge: what a library adds

Enforcing writes (8.2) makes sure knowledge reaches the brain. A second, separate problem is the
**shape** of what is written. Today a memory is free prose plus lists of names, chosen by the chat
model, and corrections are links the model has to remember to set. The brain has no typed facts
("Pierre Aubert is the economic buyer at Acme", "Acme deal stage moved to Proposal on
2026-11-02"), no check that a new note contradicts an old one, and no record of when a fact
stopped being true.

This is the part memory libraries are built for. They all run the same pipeline: take an
episode (a message, a transcript, a CRM change), extract typed entities and relations into a
schema, match them against what is already known, then add, update or invalidate.

| Library | What it brings | Fit with GTM Brain |
|---|---|---|
| Graphiti (Zep), Python, Apache-2.0 | episodes as the raw input; custom entity and edge types as Pydantic models; automatic entity resolution across episodes; contradiction detection; **bi-temporal edges: an outdated fact is invalidated (`invalid_at`), never deleted** | closest to this design. Episodes map to memory records with sources; invalidation maps to `supersedes`; nothing is ever deleted. Needs a graph database and LLM calls |
| Cognee, Python and Rust/Node | custom graph models (Pydantic `DataPoint`) used as the extraction schema; OWL/RDF ontology grounding with `strict` mode, which drops entities the ontology does not know | good for structure: the brain already has an ontology (`ontology/gtm-brain.ossie.json`, entity kinds person, organization, product), which could be exported as the grounding ontology |
| Mem0 | extract-then-update with ADD/UPDATE/DELETE/NOOP | weakest fit: graph memory has moved to the paid platform, the 2026 open-source algorithm is ADD-only, and it is built around user preferences, not B2B account facts |

Sources: [Graphiti overview](https://help.getzep.com/graphiti/getting-started/overview),
[Graphiti temporal model](https://mintlify.wiki/getzep/graphiti/concepts/temporal-model),
[Graphiti edge resolution](https://deepwiki.com/getzep/graphiti/5.3-edge-extraction-and-resolution),
[Cognee ontologies](https://docs.cognee.ai/core-concepts/further-concepts/ontologies),
[Cognee custom ontology](https://www.cognee.ai/custom-ontology-rag-retrieval),
[Mem0 breakdown](https://memo.d.foundation/breakdown/mem0),
[framework comparison](https://www.llms.blog/posts/agent-memory-frameworks-in-production-comparing-mem0-letta-zep-graphiti-and-cognee-architecture-entity-extraction-temporal-graph-indexing-and-serving-economics).

#### Proposed shape: episodes in git, structure enforced by schema, graph derived

1. **Typed facts on memories.** Add an optional `facts` field to the memory record:
   `[{ subject, relation, object, valid_from, valid_to }]`. Subjects and objects are entity IDs
   from `brain/entities/`. Relations come from a fixed GTM vocabulary declared in the ontology
   (`works_at`, `champion_of`, `economic_buyer_of`, `deal_stage`, `uses_tool`, `competitor_of`,
   `committed_to`, `price_quoted`, ...). `lib.validateMemory` rejects unknown relations and
   unresolved entities, and the MCP input schema of `remember` carries the same enum, so the
   model's structured output is held to it. The prose `content` stays as the evidence and
   citation. Readers that ignore `facts` keep working.
2. **Mandatory resolution before a write.** In the capture run (8.2, layer 3), each candidate
   fact is compared with the current facts for the same subject and relation. The run then
   chooses add, supersede (writing `valid_to` and `supersedes` on the old one) or skip.
   That is Graphiti's edge resolution, written as a lib step, so `remember` cannot append a
   contradicting fact silently.
3. **Entity resolution stays human-confirmed.** A library's automatic merge becomes a
   proposal: high-confidence matches become aliases; anything else becomes a `brain-question`.
   This keeps "never merge on a guess".
4. **The graph is derived.** Facts project into the SQLite index as a `facts` table, rebuilt
   from the JSONL like everything else. That gives `query` questions such as "who is the
   economic buyer at Acme as of today" and "which deals changed stage this week" with exact
   answers and citations. Compile and entity briefs can then read current facts instead of every
   memory, which also solves the limit in 8.4.

#### Where the library goes

Two options, to decide with a spike on the evaluation set from 8.2 (step 0.1) plus a
structure check: share of captured memories with valid facts, duplicate entities created,
contradictions caught.

- **Native:** the host model does extraction in the capture run with the strict schema above,
  and lib does the resolution. No new dependency, deterministic validation, and the invariants
  are kept as they are. Recommended as the default.
- **Graphiti (or Cognee with a strict ontology) as an opt-in sidecar extractor:** the capture
  run sends the episode to it, receives typed entities and edges with resolution decisions,
  maps them to the schema above, and writes them through `remember`. Use it if the spike shows
  clearly better extraction or resolution than the native path. It is never the store, and it is
  enabled per brain through APPROVE, because it sends customer text to its LLM.

Either way, the schema and the resolution rules live in GTM Brain. A library can be swapped
or dropped without changing what is in a team's brain.

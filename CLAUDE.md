# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The contributor invariants live in AGENTS.md and apply here in full: @AGENTS.md

AGENTS.md is written for Codex, the host GTM OS runs in. Its "Default onboarding interaction" and
"Computer Use" sections are generated blocks describing how the plugin behaves inside a company
brain (the `onboarding_question` / `configuration_question` / `question` tools do not exist in a
Claude Code session). When working on this repo from Claude Code, the section that binds you is
"Contributor invariants". Do not hand-edit the generated blocks; see "Derived text" below.

## What this repo is

The source of `gtm-os`, a Codex plugin that keeps a revenue team's "company brain" in the team's
own git repo. This repo is the plugin, never a brain: test brains live in a scratch folder outside
the checkout (`/brain/` and `/work/` are gitignored as a safety net).

## Commands

Node 22.13+ (the memory index uses `node:sqlite`), git. Runtime code has no npm dependencies, so
there is no install step and no linter.

```bash
node --test 'plugins/gtm-os/test/*.test.mjs'            # whole suite (quote the glob in zsh)
node --test plugins/gtm-os/test/brain.test.mjs          # one file
node --test --test-name-pattern='<regex>' plugins/gtm-os/test/brain.test.mjs   # one test

node plugins/gtm-os/test/live/harness-bench.mjs         # live Codex A/B: bare / plugin / brain on 3 tasks (~4 min)

node scripts/sync-derived.mjs                           # regenerate derived blocks and schema
node scripts/sync-derived.mjs --check                   # report drift only (the suite runs this)

npm ci --prefix frontend/dashboard                      # dashboard frontend, only when touching it
npm run build --prefix frontend/dashboard               # writes plugins/gtm-os/scripts/gtm-os-render/ui/

./dev-install.sh                                        # install this checkout into Codex, then start a new chat
./dev-reset.sh [brain-folder]                           # wipe the test brain (default ~/Desktop/test-brain) and reinstall
```

Run the suite before every commit that touches `lib/`, a skill script, a server or a hook. Tests
build throwaway brains with `setup` and set `GTM_OS_NO_COMMIT` where committing must stay off.
`plugins/gtm-os/test/live/` holds benchmarks and fixtures that talk to real connectors; they are
not `*.test.mjs` files and are not part of the suite.

`.githooks/pre-push` (enabled by `./dev-install.sh`) runs the suite before a push to `main`, then
the harness bench when the push changes anything under `plugins/gtm-os/` but `test/`. The bench
fails when the plugin makes Codex solve fewer tasks than without it, adds more prompt tokens than
`GTM_OS_BENCH_MAX_OVERHEAD`, or calls GTM OS tools for a self-contained puzzle.
`GTM_OS_SKIP_BENCH=1 git push` skips it.

`dev-reset.sh` only wipes a folder that is empty or that it created itself (tracked in the
gitignored `.dev-brains`); it never deletes a real brain.

## Architecture

Everything that ships is under `plugins/gtm-os/`. The layers, from the outside in:

- **Skills** (`skills/gtm-os-*/SKILL.md`): the nine user-facing workflows. Detailed procedures
  live in each skill's `references/`. These are what people install, so developer workflows never
  go here.
- **MCP server** (`server/server.mjs`): hand-rolled stdio JSON-RPC, Node built-ins only. Each tool
  is a thin wrapper that spawns an operation script with the brain folder as cwd and returns its
  text. `run()` resolves a script under `scripts/` first, then `skills/`, which is why old script
  paths stay valid. Some tools are filtered out of `tools/list` but still answer `tools/call`:
  the question forms (only when the client supports forms), the compile tools (only when
  `GTM_OS_RUN` is set, i.e. scheduled and background runs) and the retired reads that `query`
  now covers.
- **Operation scripts** (`scripts/gtm-os-*/`): one folder per operation (remember, load, compile,
  render, setup, approve, upgrade, ...). No `SKILL.md`; they are run by the server, the hooks and
  the skills.
- **lib** (`lib/brain.mjs` plus focused modules): the file format and the only write path. Records,
  context covers, entity names, the loaded set, `commit`, `save`, `rerender`. The two deliberate
  exceptions that write `admin.md` outside the lib are `setup` and `approve`.
- **Hooks** (`hooks.json`, `hooks/`): SessionStart refreshes the brain and prints the chat's
  opening lines; the PreToolUse gate denies direct edits to protected files (`admin.md`,
  `memories.jsonl`, the company ontology); PostToolUse and turn hooks log usage. They only run once
  `hooks/trust-hooks.mjs` has written the approval hash for the current `hooks.json`.
- **Dashboard**: `scripts/gtm-os-render/render.mjs` builds `work/home/index.html` from the brain
  files; `server/dash.mjs` serves it on 127.0.0.1, read-only, with revision events. The React
  Overview is built from `frontend/dashboard/` into `scripts/gtm-os-render/ui/` and committed, so
  users never run npm. The legacy HTML client remains as the fallback and hosts the evidence views.

### Two ontologies, two kinds of tools

`ontology/gtm-os.ossie.json` describes the plugin's own interactions. At startup the vendored
Allethic engine (`vendor/allethic/`) turns it into first-class MCP tools (`remember`, `query`,
`describe_object`, `list_objects`, ...) backed by `server/files-backend.mjs`. `server.mjs` then
extends the generated `query` with derived views (status, brief, customers, meetings, health, ...)
and a read-only SQL mode over the memory index.

A company's own interactions live in its `brain/ontology.ossie.json`. The server does not know the
brain at startup, so these can never be registered as tools: they are listed per call and run
through the single fixed tool `interact`. New ones go through `propose_interaction` and the APPROVE
gate.

`vendor/allethic/` is a pinned copy (commit and per-file hashes in `VERSION.json`). Never edit it
in place; refresh it with `node plugins/gtm-os/vendor/refresh-allethic.mjs <local-checkout> <full-sha>`.

### The memory index

`lib/memory-index*.mjs` and `server/memory-reader.mjs` / `memory-worker.mjs` maintain a disposable
SQLite search cache in the brain's `work/`. The JSONL files and entity Markdown are the truth; the
index can always be rebuilt from them and is never a second store.

### A brain on disk

```
brain/admin.md                         workplace info, protected, changed only via APPROVE
brain/entities/*.md                    identity, aliases, cited brief; hand-editable
brain/contexts/<slug>/context.md       the compiled cover
brain/contexts/<slug>/memories.jsonl   append-only records
README.md                              what goes where, written by setup
<slug>.md, <folder>/<slug>.md          documents (kind: document), files in a folder of the same name
brain/ontology.ossie.json              the company's own interactions, protected
work/                                  gitignored: dashboard, loaded set, tools.json, hooks.log, index
```

## Derived text

`plugins/gtm-os/policies/questions.md` and `computer-use.md` are the sources for the marked blocks
(`<!-- generated: <name>; edit plugins/gtm-os/policies/<name>.md -->`) in `AGENTS.md`, `INSTALL.md`,
`plugins/gtm-os/templates/AGENTS.md` and `skills/gtm-os-start/references/questions.md`. The batch
memory schema in the ontology is derived from `remember.input_schema.properties` the same way.
Edit the source, run `node scripts/sync-derived.mjs`, commit source and output together.
`templates/legacy/` snapshots are immutable fixtures and are excluded.

## Shipping a change

Anything under `plugins/gtm-os/` that users should receive needs a version bump in
`.codex-plugin/plugin.json`, and the same number in the cache paths in `SETUP.md` and
`COMMANDS.md` (a test holds them together). Changing `templates/AGENTS.md` first requires a
snapshot of the outgoing file in `templates/legacy/AGENTS-<old version>.md` plus a
`templates/legacy/manifest.json` entry. After editing `hooks.json`, re-run `./dev-install.sh` or
the hooks stay silently off.

## Docs map

Describe a feature once, in its owning document, and link from the others: `INSTALL.md`
(standalone instructions for the installing agent), `ONBOARDING.md` (first-use walkthrough),
`GUIDE.md` (everyday use), `COMMANDS.md` (every tool and command and the files it writes),
`SETUP.md` (manual install and contributor verification), `DOCUMENTS.md` (documents
feature), `USER-SKILLS.md`, `IMPORT.md` (its text is duplicated word for word as the body of
`plugins/gtm-os/claude/gtm-os-export/SKILL.md`; keep the two in step).

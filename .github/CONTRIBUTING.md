# Contributing to GTM Brain

This repository is the source of the `gtm-brain` plugin. It is never a brain: test brains live in
a scratch folder outside the checkout.

| Read | For |
| --- | --- |
| [AGENTS.md](../AGENTS.md), "Contributor invariants" | The rules every change keeps |
| [.claude/CLAUDE.md](../.claude/CLAUDE.md) | The architecture, layer by layer, and every command |
| [README.md](../README.md#how-it-fits-together) | The architecture as a picture |
| [SETUP.md](../docs/SETUP.md) | Installing from a checkout and verifying by hand |
| [docs/skill-template/](../docs/skill-template/README.md) | Adding a shipped skill |

## Source layout

```text
plugins/gtm-brain/              everything that ships
  .codex-plugin/plugin.json     the manifest and the version; the Claude Code files are generated from it
  .mcp.json                     how the host starts the MCP server
  skills/gtmb-*/                the twenty-nine shipped skills, one folder each: SKILL.md and its references/
  server/                       the MCP server (server.mjs) and the dashboard server (dash.mjs, with its
                                three write routes: entity-edit.mjs, memory-edit.mjs and the document save)
  scripts/gtm-brain-*/          one folder per operation the server runs: remember, load, compile,
                                render, setup, approve, upgrade, ...; no SKILL.md
  lib/                          the file format and the only write path: notes, entities, documents,
                                search, owner rules, paths; Node built-ins only
  session/                      what the server runs on a chat's first call: the opening lines, the refresh,
                                putting back direct edits of protected files; the plugin declares no hooks
  ontology/                     the plugin's own tools, described once and generated as MCP tools
  policies/                     shared instruction text, copied into the marked blocks by sync-derived
  templates/                    what setup writes into a new brain; legacy/ holds every shipped rulebook
  starters/web-design-system/   the website design system starter, unchanged, with its preservation manifest
  claude/gtm-brain-export/      the hand-over skill another assistant runs; its body is IMPORT.md
  test/                         *.test.mjs is the suite; live/ and e2e/ are benchmarks, not part of it
.agents/plugins/marketplace.json   the Codex marketplace entry
.claude-plugin/marketplace.json    the Claude Code one, generated
frontend/dashboard/             dashboard frontend source and browser tests; built assets ship with the plugin
scripts/sync-derived.mjs        regenerates derived text, schemas and the Claude Code declarations
scripts/check-version-bump.mjs  CI: a pull request that changes what ships bumps the version
scripts/migrate-install.mjs     moves an installation from the old gtm-os name (docs/MIGRATING.md)
scripts/dev-install.sh          installs this checkout into Codex (--claude for Claude Code)
scripts/dev-reset.sh            wipes a test brain and reinstalls
docs/                           the guides and references (docs/README.md is the index)
  releases/                     release notes; template/ holds the release graphic and its renderer
  skill-template/               the folder to copy for a new shipped skill
  images/                       the picture and screenshots in the README
.github/                        this file and the CI workflow
.githooks/pre-push              the checks before a push to main
```

The plugin ships from `gtm-week/gtm-brain`, branch `main`. Scripts that used to live under
`skills/gtm-brain-*/` keep those paths (`skills/gtm-brain-add-file/add-file.mjs`).

Describe a feature once, in its owning document, and link to it from the others; the list of
owners is the "Docs map" in [.claude/CLAUDE.md](../.claude/CLAUDE.md). Shared agent policies are the exception:
they are embedded where an agent needs a self-contained document
([below](#maintaining-shared-text-and-schemas)).

## Commands

Node 22.16+ or 24+ and git. Runtime code has no npm dependencies, so there is no install step.

```bash
node --test 'plugins/gtm-brain/test/*.test.mjs'              # the suite (quote the glob in zsh)
node --test plugins/gtm-brain/test/brain.test.mjs            # one file
node scripts/sync-derived.mjs --check                        # derived text and schema in sync
npm ci --prefix frontend/dashboard                           # only when touching the dashboard frontend
npm run build --prefix frontend/dashboard                    # writes plugins/gtm-brain/scripts/gtm-brain-render/ui/
./scripts/dev-install.sh                                     # install this checkout, then start a new chat
```

Run the suite before every commit that touches `lib/`, a skill script, a server or a session
script. CI ([.github/workflows/ci.yml](workflows/ci.yml)) runs the suite and the
derived-text check on Linux and macOS with Node 22.16 and 24, checks the version bump on a pull
request into `main`, and rebuilds the dashboard to confirm the committed assets match the source.

## Adding a skill

A skill that ships to every brain starts from [docs/skill-template/](../docs/skill-template/README.md): a folder
to copy, the rules it must follow, and every file to register it in. `gtmb-icp` is the worked
example. Developer workflows never go under `plugins/gtm-brain/skills/`: that folder is what
people install.

## Before pushing to main

`./scripts/dev-install.sh` points git at [.githooks/](../.githooks/). Before a push to `main` the pre-push
hook runs, in order:

| Step | When | Skip with |
| --- | --- | --- |
| The test suite | every push to `main` | `GTM_BRAIN_SKIP_TESTS=1` (skips the two below as well) |
| [The harness bench](../plugins/gtm-brain/test/live/harness-bench.mjs), about 4 minutes | the push changes anything under `plugins/gtm-brain/` but `test/` | `GTM_BRAIN_SKIP_BENCH=1` (skips the smoke as well) |
| [The Claude Code smoke](../plugins/gtm-brain/test/live/claude-smoke.mjs), about 2 minutes | after the bench, when `claude` is on PATH | `GTM_BRAIN_SKIP_CLAUDE=1` |

The bench runs three tasks (a coding fix, a logic puzzle, a connector question) through
`codex exec` without the plugin, with it in an ordinary folder and in a brain, in throwaway
Codex profiles with this checkout installed. It fails when the plugin costs solved tasks, adds
more prompt tokens than `GTM_BRAIN_BENCH_MAX_OVERHEAD` (default 14000) or calls GTM Brain tools
for the puzzle. Traces of every run stay in its artifacts folder.

The smoke runs this checkout through four `claude -p` turns (setup, a direct edit of the
workplace settings refused, "go ahead" applying nothing, APPROVE applied), so a fix for one host
cannot quietly break the other.

## Maintaining shared text and schemas

Run `node scripts/sync-derived.mjs` after changing any source below. Commit the source and its
generated changes together. `node scripts/sync-derived.mjs --check` reports drift without
writing; the suite and CI run that check too.

| Source | What is generated from it |
| --- | --- |
| [plugins/gtm-brain/policies/](../plugins/gtm-brain/policies/) `questions.md`, `computer-use.md` | The marked blocks in `AGENTS.md`, `INSTALL.md`, the brain template and the question reference. The chat start reads the sources directly |
| [plugins/gtm-brain/policies/core.md](../plugins/gtm-brain/policies/core.md) | The first section of the brain template. The MCP server reads the same file into its instructions, so a chat that never reads `AGENTS.md` still gets the core |
| [The ontology](../plugins/gtm-brain/ontology/gtm-brain.ossie.json), `remember.input_schema.properties` | The batch schema `memories.items.properties`, without the call-level `by`, `project` and batch envelope. Edit only the single-memory fields |
| `plugins/gtm-brain/.codex-plugin/plugin.json` | The Claude Code declarations: `plugins/gtm-brain/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. Never edit those by hand |

## Shipping a change

- **Version.** A change under `plugins/gtm-brain/` that people should receive bumps the version
  in `.codex-plugin/plugin.json` and the same number in the cache paths in docs/SETUP.md and
  docs/COMMANDS.md (a test holds them together), then `node scripts/sync-derived.mjs`. Anything
  shipped without a bump is never offered to anyone.
- **The brain template.** Before editing `templates/AGENTS.md`, snapshot the outgoing file as
  `templates/legacy/AGENTS-<old version>.md` and add it to
  [the compatibility manifest](../plugins/gtm-brain/templates/legacy/manifest.json), the upgrade
  matrix for both runtime and tests. Identical releases may share one file (0.8.1 and 0.8.2 do).
  The snapshots are immutable and excluded from generation: exact comparison is how an upgrade
  tells shipped instructions from a person's own edits.
- **Updates must be safe.** Preserve people's data and entry points from one release to the
  next, validate before installing, and keep the brain refresh repeatable.

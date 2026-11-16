# gtm-brain: contributor notes

This repo is the plugin, not a brain. Test brains live in a scratch folder (`setup` creates one).
If someone opens this repo in Codex to try GTM Brain: do not improvise an installation from docs/SETUP.md
or run checks in the shell; send them to docs/SETUP.md's install command and an empty folder, where
the plugin's `check_environment` and `setup_brain` tools do the work.

## Default onboarding interaction

<!-- generated: questions; edit plugins/gtm-brain/policies/questions.md -->
Ask the person in this order. First `ask_person`: it shows a native form with the choices to
click, in any chat, and returns the answer as its result. Give it the question, one line on why
it matters and two to four choices, recommended first. Where `ask_person` is not available, the
host's own question box when the chat has one (in Codex, `request_user_input`; in Plan mode
always the host's own). Last, and when `ask_person` returns no answer, plain chat text that ends
the turn: the question, one line on why it matters, and two or three numbered options,
recommended first; the person answers with a number or in their own words.

Reuse saved and submitted answers; infer a concrete proposal before asking. Ask only for missing
information and real decisions. Do not ask the person to enable Plan mode or experimental
settings, call a plan-only tool outside Plan mode, or perform writes when restricted to planning.

Explain why the answer matters before the question. Offer two or three concrete choices,
recommended first when appropriate. Never add your own Other or Something else: the person can
always answer in their own words. A named last choice (Different company, Needs corrections)
still fits when it means something specific. Each choice is a whole answer, never a half
sentence for the person to finish ("A different company: "); ask for the rest next. Where
several choices can apply together, say the person can pick several numbers; a form or question
box has no checkboxes, so offer the likely combinations there. The dashboard is view-only. Aim
for a number or at most five words per answer. Never bundle a business clarification with
optional maintenance questions or ask again for an already authorized action.

A yes/no or permission question always names both answers, for example Yes, go ahead and No,
skip it. A free-text question (a name, a link) says what to type. A yes or no the person already
gave for that exact step is the answer: act on it and never ask the same question again.

Keep one question pending. A question without an answer authorizes nothing: defaults, empty
results, errors, timeouts, elapsed time and unrelated messages are not answers. A skipped or
closed form or question box is no answer and no refusal; ask it once more as plain chat text. A plain text
question ends the turn and waits for the reply. Do not use shell sleep or a busy loop to wait.

Security permissions and account sign-in stay native. A chosen option cannot authorize shell
commands or grant account access, and never stands in for APPROVE, an `ask_person` answer
included: a workplace or interaction change goes only through `approve_change`, whose own form
carries the APPROVE choice. Carry out
a chosen ordinary option through its owning workflow with the normal permission prompts.

No slop. No filler phrases, no hedging when facts are cited, no LLM preamble
("I have created...", "Here is the updated...", "Certainly!"). No placeholder dates.
Short paragraphs. Concrete facts. Use the person's exact words when capturing their
thinking; do not paraphrase or clean up their language.
<!-- /generated: questions -->

## Computer Use

<!-- generated: computer-use; edit plugins/gtm-brain/policies/computer-use.md -->
Do the work through the tools. The GTM Brain MCP tools, and any other MCP server configured for the
session, are the supported path and the one that leaves a record. Computer Use, meaning driving an
application's own interface with screenshots, clicks and keystrokes, is not a substitute for a tool
call, and never a way around a missing permission or a tool that returned nothing. Use it only for
a step the person has approved for that purpose: say in one line what it would look at or do, ask,
and wait for the answer. Without that approval, report what is blocked and offer the tool or the
shell step instead. Reading a host's native UI to confirm what a tool already reports is not a
reason to ask.

For every connected service, prioritize its MCP connector for supported operations, including
HubSpot, Attio, email, calendar and other tools. Discover the available connector operations
and use the smallest relevant read before considering the website. A working browser login,
an installed Chrome extension or convenience never makes Computer Use the default. An empty
MCP result is a result to inspect, not a trigger to browse. On connector failure, report the
specific error and pursue the supported connection repair; never silently switch to the UI.
If the requested operation is not exposed by MCP, explain that gap and offer a specific browser
step for approval. Reuse approval already given for that exact step. A browser success does
not establish MCP health: keep browser verification separate from connector read-test status.

For an approved website step requiring an existing login, use the person's connected Chrome
session in the intended profile. The embedded browser has a separate profile and does not
reuse that login. If Chrome is unavailable, explain the missing connection and follow
gtmb-configure/references/chrome-session.md; never silently switch to the embedded browser
or ask for another login there. If the intended Chrome session itself needs sign-in, let the
person handle its native prompt. A prior setup choice is not authorization for future website
reads. The local dashboard needs no login and always belongs in the Codex pane.
<!-- /generated: computer-use -->

## Contributor invariants

- Shared question and Computer Use policies are authored in `plugins/gtm-brain/policies/`.
  Run `node scripts/sync-derived.mjs` after editing them or the single-memory input fields
  in the ontology. It refreshes the marked instruction blocks and batch schema; tests
  enforce `--check`. Historical templates are excluded. See [CONTRIBUTING.md](.github/CONTRIBUTING.md#maintaining-shared-text-and-schemas).
- Three formal ontology objects: contexts, memories and entities. Entity kinds come from the
  brain's schema (`configuration/schema.md`): every `## <Kind>` section with a field table is a kind, and person,
  organization, product, offering, event, tool and meeting are the defaults that always exist (`lib/kinds.mjs`,
  `schema.brainKinds`). Company and team are organization subtypes. Roles and relationships
  are supported by context memories. A meeting is a default kind: a meeting entity is created
  or found when a meeting is captured (`lib/meeting-entities.mjs`), its page collects the notes
  carrying its meeting id, participants link to it with `attended`, and the evidence stays in
  context memories (the raw transcript stays in its tool). A project cannot be a kind.
- GTM Brain is English-only: conversations, dashboard labels, user-facing commands and brain
  records. There is no language preference to read, save or ask about. Keep tool identifiers,
  CLI flags, and the APPROVE token stable.
- `plugins/gtm-brain/lib/` is the file format; skills and the session scripts go through it.
- Where a brain's files live is answered only by `lib/brain-paths.mjs`, by the brain's layout: 4 (what
  setup makes: `configuration/`, `entities/`, `memories/`, `workflows/`, and `.gtm-brain/` for this
  computer) and 1 to 3 (`brain/`, `work/`), all read and written. No other module names those paths
  (tests grep for literals). The rulebook, the rule pages, the skills and the tool descriptions keep
  the layout 1 names (`RULES.md`, `SCHEMA.md`, `brain/admin.md`, `brain/contexts/`, `work/`); the chat
  start of a layout 3 or 4 brain says once where those are (`lib/config-folders.mjs` `layoutStartLine`).
- GTM Brain declares no hooks. Since Codex 0.164 any change to a plugin, a version bump
  included, switches all its hooks off until the person approves a "Review hooks" dialog, and
  no other installed plugin has hooks. Everything runs through the MCP server instead. The chat
  start: on a chat's first GTM Brain call (once per brain and project per server, again after 30
  quiet minutes) the server runs `session/session-start.sh` and returns its opening lines before
  that call's result; the server's instructions make `query` (status) the first call in a brain
  folder or a linked project. The chat id comes from the host's own session files
  (`lib/host.mjs` `currentChat`). APPROVE: `approve_change` shows the person a native form and
  only their click applies the change; `approve.mjs --apply/--interaction` refuses otherwise,
  except in a terminal where the person types APPROVE. Protection: `lib.guardProtected` runs at
  each chat start and before every save; a direct edit of the interactions file or a notes file (and of
  `brain/admin.md` in layouts 1 and 2) not committed through GTM Brain is copied to `manual-edits/protected/`
  in this computer's folder (`.gtm-brain/`; `work/` before layout 4) and the committed version restored;
  `lib/brain-paths.mjs` `protectedFiles` is the list. The server logs its own calls to `tool-usage.jsonl` there; it
  does not see other connectors' calls, so the model marks an untested tool with `mark_tool`.
  After any change to the plugin, re-run `./scripts/dev-install.sh` to install it.
- A change under `plugins/gtm-brain/` that people should receive bumps the version in
  `.codex-plugin/plugin.json`. `check-version.mjs` compares that number with the installed one,
  and the dashboard, the chat start and the advisor all read its answer: everything shipped without a
  bump is invisible, so nobody is ever offered it. The cache path in docs/SETUP.md and docs/COMMANDS.md
  carries the same number, and a test holds them together. A change to `templates/AGENTS.md`
  snapshots the outgoing template into `templates/legacy/AGENTS-<old version>.md` and lists that
  version in `templates/legacy/manifest.json`, shared by the upgrader and its test matrix.
  Preserve these snapshots unchanged; they distinguish shipped instructions from personal edits.
- Developer skills live in `.agents/skills/` of the onboarding repository, which Codex reads when it is opened in that checkout;
  `plugins/gtm-brain/skills/` is what people install into a company brain. A developer workflow
  shipped there sits in every user's skill list one prompt away from writing scratch files into
  their folder. `gtm-brain-review-tools` is the example.
- Two kinds of interactions: the plugin's, described in `plugins/gtm-brain/ontology/gtm-brain.ossie.json`
  and generated as first-class tools; a company's, described in its `configuration/interactions.json` (`brain/ontology.ossie.json` before layout 4),
  listed per brain by the catalog tools and run through the one fixed tool `interact`. Codex lists a
  server's tools once, at startup, and the server does not know the brain then, so company
  interactions cannot be tools of their own. The company file is protected truth (`lib.guardProtected`,
  `approve_change` with kind interaction); `lib.RESERVED_TOOLS` is held equal to the live catalog by a test.
- A project is a tag and a local pointer, never an object: `project:<slug>` on memories, a marked
  block in the folder's `AGENTS.md` (`lib.writePointer`; the format lives in `lib` and
  `session/resolve.sh` mirrors it), and `projects.json` in this computer's folder for this machine's paths. Nothing
  in the brain's shared files. Codex reads `AGENTS.md` from the git root down to cwd and never below cwd
  (https://learn.chatgpt.com/docs/agent-configuration/agents-md), so an external folder needs the
  pointer with the rulebook line and a sub-folder of the brain needs only the two values.
  `lib.readLoaded/writeLoaded(root, ..., project)` are the only place that knows a loaded set's
  path; the session scripts resolve the brain through `session/resolve.sh` / `lib.resolveBrain`, never
  a settings path under `$cwd` directly.
- Entity identity lives in the entity pages (`entities/<kind folder>/`; `brain/entities/` before layout 4), with stable IDs and generated cited briefs.
  Facts stay in context memories. Migrations preserve old records, retired IDs and source files.
  Use `lib.readNames`, `lib.writeNames`, `lib.entityFacts`, `lib.compileEntity` and `lib.entityBrief`;
  do not introduce another identity store or hand-write entity files in skills.
  People can edit entity files. Validate the expected frontmatter format, preserve handwritten
  Markdown, and report a file-specific repair proposal if parsing fails. Never silently repair
  or overwrite their edits during compilation.
- Memories are append-only JSONL, one record per line, validated. Never edited.
- Runtime scripts use Node built-ins only. The dashboard frontend may use React and shadcn/ui
  (authorized for ALL-187). Build dependencies live in `frontend/dashboard/`; ship the prebuilt
  assets with the plugin, with no npm install or network dependency for users.
- Two hosts, one plugin folder: Codex and Claude Code (beta, 0.30). `lib/host.mjs` is the only place that
  knows which one runs (`GTM_BRAIN_HOST`, set only by the generated Claude declarations; unset is Codex) and
  holds every difference: texts, links, tool names, what the machine can do. A test fails on a host branch
  anywhere else. Codex's `.mcp.json` and manifest stay the source; the Claude files are
  generated by `scripts/sync-derived.mjs`. `via` stays `codex` for a chat on either host (older versions
  reject other values); the host is the chat source's kind (`codex:` or `claude:`).
- No em dashes anywhere. Plain hyphens.
- The plugin ships from `gtm-week/gtm-brain`, branch `main`.
- Tests: `node --test 'plugins/gtm-brain/test/*.test.mjs'` (Node's own runner, no dependencies).
  `brain.test.mjs` covers the lib, `skills.test.mjs` runs the scripts on a brain made by setup,
  `server.test.mjs` drives the MCP server, `dash.test.mjs` the dashboard server and the chat
  start. Run them before every commit that touches `lib/`, a skill script, a server or the session scripts.
  Before a push to `main`, `.githooks/pre-push` runs them and, when what ships changed,
  `test/live/harness-bench.mjs`: the plugin must not cost Codex solved tasks on work that is not
  GTM (see .github/CONTRIBUTING.md, Before pushing to main).
- The model reaches the skills through the MCP server (`server/server.mjs`, one tool per
  operation, each runs the skill's script in the brain). The server runs outside the sandbox, so
  every writer commits what it wrote at once (`lib.commit`, pushed in the background when there
  is a remote); `save` keeps edits made by hand. An APPROVE is applied only from the person's
  click in the `approve_change` form. `GTM_BRAIN_NO_COMMIT` turns committing off for tests and dry runs. A new operation is a script plus a tool entry; add its instructions to the owning workflow.
  Skills are user workflows, not one entry per operation. Internal procedures live in their
  `references/` folders. Existing script paths under `skills/gtm-brain-*/` stay stable even when
  that directory has no `SKILL.md`.
- What is in `lib/brain.mjs` and why: the format (records, covers, names, the loaded set) and
  the things every writer needs right after writing (commit, activity line, re-render, session and
  dashboard state). `rerender` spawns the render script; that is the one place the lib reaches
  into `skills/`. `setup` and `approve` write the settings file outside the lib, on purpose: one is the
  template, the other is the APPROVE step.
- `lib.commit()` also writes the activity line the dashboard shows (`hooks.log` in this computer's folder), so one
  commit path is one activity path; `lib.save()` is the person's save (commit of `BRAIN_PATHS`,
  push when there is a remote). `readContext` exposes `rule` and `now` (learned working guidance, possibly empty); nobody splits
  "When loaded" by hand.
- The dashboard is a viewer with three writes, all accepted only from the page itself (this
  server's own Origin and Host, a token made at each server start, JSON only, never under
  `GTM_BRAIN_RUN`). A document can be edited and saved (`POST /document`, which runs
  `document.mjs --update`). An entity or a relation can be changed through a fixed list of nine
  operations (`POST /entity-edit`, `server/entity-edit.mjs`), each of which runs the script
  Codex's tools run. A note can be corrected, withdrawn, moved to another topic, given another
  kind or, for an open question, answered through five operations (`POST /memory-edit`,
  `server/memory-edit.mjs`), each one call of the remember script; no line of a notes file
  is edited or removed. A prepared Codex message on the page is copied for the chat already
  open, since a new chat would replace the pane the dashboard is shown in. Everything else stays view-only: its server serves files, search reads and
  revision events, never other actions or background jobs. Chat about this uses a codex://threads/new link with the absolute
  selected project folder (or brain folder for brain-wide views) and a prepared prompt; the person presses Send in Codex. Saved answers link to
  the question ID through retracts and refresh the viewer without waiting for compilation.
  Only questions tagged brain-question enter the pending brain-question list; CRM tasks and
  business follow-ups remain context information. Keep chat choices in native Codex forms.
- Install from this checkout with `./scripts/dev-install.sh`, then start a new chat in Codex (restart
  the app only if old skills linger). No push needed to test. `${PLUGIN_ROOT}` is not
  substituted in `.mcp.json`; use `cwd: "./"`.
- One commit path: every writer calls `lib.commit()` and prints its note. One cover writer:
  `lib.writeContext()`. Do not add `git` calls or hand-written frontmatter in a skill.

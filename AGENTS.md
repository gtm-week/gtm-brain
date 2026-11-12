# gtm-brain: contributor notes

This repo is the plugin, not a brain. Test brains live in a scratch folder (`setup` creates one).
If someone opens this repo in Codex to try GTM Brain: do not improvise an installation from SETUP.md
or run checks in the shell; send them to SETUP.md's install command and an empty folder, where
the plugin's `check_environment` and `setup_brain` tools do the work.

## Default onboarding interaction

<!-- generated: questions; edit plugins/gtm-brain/policies/questions.md -->
GTM Brain shows no question forms of its own. Ask with the host's own question box when it has
one (in Codex, `request_user_input`: use it whenever it is available in the chat, in Plan mode
always and in ordinary chats where the person's Codex has it). Otherwise ask in plain chat text and
end the turn: the question, one line
on why it matters, and two or three numbered options, recommended first; the person answers with
a number or in their own words.

Reuse saved and submitted answers; infer a concrete proposal before asking. Ask only for missing
information and real decisions. Do not ask the person to enable Plan mode or experimental
settings, call a plan-only tool outside Plan mode, or perform writes when restricted to planning.

Explain why the answer matters before the question. Offer two or three concrete choices,
recommended first when appropriate. Never add your own Other or Something else: the person can
always answer in their own words. A named last choice (Different company, Needs corrections)
still fits when it means something specific. Each choice is a whole answer, never a half
sentence for the person to finish ("A different company: "); ask for the rest next. Where
several choices can apply together, say the person can pick several numbers; the host's question
box has no checkboxes, so offer the likely combinations there. The dashboard is view-only. Aim
for a number or at most five words per answer. Never bundle a business clarification with
optional maintenance questions or ask again for an already authorized action.

A yes/no or permission question always names both answers, for example Yes, go ahead and No,
skip it. A free-text question (a name, a link) says what to type. A yes or no the person already
gave for that exact step is the answer: act on it and never ask the same question again.

Keep one question pending. A question without an answer authorizes nothing: defaults, empty
results, errors, timeouts, elapsed time and unrelated messages are not answers. A skipped or
closed question box is no answer and no refusal; ask it again as plain chat text. A plain text
question ends the turn and waits for the reply. Do not use shell sleep or a busy loop to wait.

Security permissions and account sign-in stay native. A chosen option cannot authorize shell
commands or grant account access, and never stands in for APPROVE: a workplace or interaction
change goes only through `approve_change`, whose own form carries the APPROVE choice. Carry out
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
gtm-brain-configure/references/chrome-session.md; never silently switch to the embedded browser
or ask for another login there. If the intended Chrome session itself needs sign-in, let the
person handle its native prompt. A prior setup choice is not authorization for future website
reads. The local dashboard needs no login and always belongs in the Codex pane.
<!-- /generated: computer-use -->

## Contributor invariants

- Shared question and Computer Use policies are authored in `plugins/gtm-brain/policies/`.
  Run `node scripts/sync-derived.mjs` after editing them or the single-memory input fields
  in the ontology. It refreshes the marked instruction blocks and batch schema; tests
  enforce `--check`. Historical templates are excluded. See [README.md](README.md#maintaining-shared-text-and-schemas).
- Three formal ontology objects: contexts, memories and entities. Entity kinds are person,
  organization and product; company and team are organization subtypes. Roles and relationships
  are supported by context memories. Meeting evidence stays in context memories; it is not a
  separate object type.
- GTM Brain is English-only: conversations, dashboard labels, user-facing commands and brain
  records. There is no language preference to read, save or ask about. Keep tool identifiers,
  CLI flags, and the APPROVE token stable.
- `plugins/gtm-brain/lib/` is the file format; skills and the session scripts go through it.
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
  each chat start and before every save; a direct edit of `admin.md`, `ontology.ossie.json` or a
  `memories.jsonl` not committed through GTM Brain is copied to `work/manual-edits/protected/` and
  the committed version restored. The server logs its own calls to `work/tool-usage.jsonl`; it
  does not see other connectors' calls, so the model marks an untested tool with `mark_tool`.
  After any change to the plugin, re-run `./dev-install.sh` to install it.
- A change under `plugins/gtm-brain/` that people should receive bumps the version in
  `.codex-plugin/plugin.json`. `check-version.mjs` compares that number with the installed one,
  and the dashboard, the chat start and the advisor all read its answer: everything shipped without a
  bump is invisible, so nobody is ever offered it. The cache path in SETUP.md and COMMANDS.md
  carries the same number, and a test holds them together. A change to `templates/AGENTS.md`
  snapshots the outgoing template into `templates/legacy/AGENTS-<old version>.md` and lists that
  version in `templates/legacy/manifest.json`, shared by the upgrader and its test matrix.
  Preserve these snapshots unchanged; they distinguish shipped instructions from personal edits.
- Developer skills live in `.agents/skills/` of the onboarding repository, which Codex reads when it is opened in that checkout;
  `plugins/gtm-brain/skills/` is what people install into a company brain. A developer workflow
  shipped there sits in every user's skill list one prompt away from writing scratch files into
  their folder. `gtm-brain-review-tools` is the example.
- Two kinds of interactions: the plugin's, described in `plugins/gtm-brain/ontology/gtm-brain.ossie.json`
  and generated as first-class tools; a company's, described in its `brain/ontology.ossie.json`,
  listed per brain by the catalog tools and run through the one fixed tool `interact`. Codex lists a
  server's tools once, at startup, and the server does not know the brain then, so company
  interactions cannot be tools of their own. The company file is protected truth (`lib.guardProtected`,
  `approve_change` with kind interaction); `lib.RESERVED_TOOLS` is held equal to the live catalog by a test.
- A project is a tag and a local pointer, never an object: `project:<slug>` on memories, a marked
  block in the folder's `AGENTS.md` (`lib.writePointer`; the format lives in `lib` and
  `session/resolve.sh` mirrors it), and `work/projects.json` for this machine's paths. Nothing
  under `brain/`. Codex reads `AGENTS.md` from the git root down to cwd and never below cwd
  (https://learn.chatgpt.com/docs/agent-configuration/agents-md), so an external folder needs the
  pointer with the rulebook line and a sub-folder of the brain needs only the two values.
  `lib.readLoaded/writeLoaded(root, ..., project)` are the only place that knows a loaded set's
  path; the session scripts resolve the brain through `session/resolve.sh` / `lib.resolveBrain`, never
  `$cwd/brain/admin.md` directly.
- Entity identity lives in `brain/entities/*.md`, with stable IDs and generated cited briefs.
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
  GTM (see README.md, Before pushing to main).
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
  into `skills/`. `setup` and `approve` write `admin.md` outside the lib, on purpose: one is the
  template, the other is the APPROVE step.
- `lib.commit()` also writes the activity line the dashboard shows (`work/hooks.log`), so one
  commit path is one activity path; `lib.save()` is the person's save (commit of `BRAIN_PATHS`,
  push when there is a remote). `readContext` exposes `rule` and `now` (learned working guidance, possibly empty); nobody splits
  "When loaded" by hand.
- The dashboard is a read-only viewer. Its server serves files and revision events only, never
  actions or background jobs. Chat about this uses a codex://threads/new link with the absolute
  selected project folder (or brain folder for brain-wide views) and a prepared prompt; the person presses Send in Codex. Saved answers link to
  the question ID through retracts and refresh the viewer without waiting for compilation.
  Only questions tagged brain-question enter the pending brain-question list; CRM tasks and
  business follow-ups remain context information. Keep chat choices in native Codex forms.
- Install from this checkout with `./dev-install.sh`, then start a new chat in Codex (restart
  the app only if old skills linger). No push needed to test. `${PLUGIN_ROOT}` is not
  substituted in `.mcp.json`; use `cwd: "./"`.
- One commit path: every writer calls `lib.commit()` and prints its note. One cover writer:
  `lib.writeContext()`. Do not add `git` calls or hand-written frontmatter in a skill.

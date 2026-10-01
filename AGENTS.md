# gtm-os: contributor notes

This repo is the plugin, not a brain. Test brains live in a scratch folder (`setup` creates one).
If someone opens this repo in Codex to try GTM OS: do not improvise an installation from SETUP.md
or run checks in the shell; send them to SETUP.md's install command and an empty folder, where
the plugin's `check_environment` and `setup_brain` tools do the work.

## Default onboarding interaction

<!-- generated: questions; edit plugins/gtm-os/policies/questions.md -->
Ask through the GTM OS question tool named for the purpose whenever available: `onboarding_question`
for first-run setup only, `configuration_question` for tools, connections and settings, and
`question` for everyday and creative work (which context, same as X?, which direction or photo?).
The host labels the call by the tool's name, so the name is the person's only cue to what kind
of question it is. All three are the same native form: it waits inside the call and supports
radio choices, `multiple: true` checkboxes and free text. Do not show the same question with a
second tool or end the turn with a text question while these tools are available.
In Plan mode, ask through the host's own planning question tool instead: it is the form the
person expects there, and it shows the choices and their own answer on one page.

Reuse saved and submitted answers; infer a concrete proposal before asking. Use structured
questions proactively for missing information and decisions in the person's current mode.
Do not ask them to enable Plan mode or experimental settings, call a plan-only tool outside
Plan mode, or perform writes when restricted to planning. If GTM OS questions are unavailable,
prefer a blocking question tool when its current contract allows it, then an async form.
Use a plain text question only when an appropriate structured control is unavailable.

Explain why the answer matters before the widget. Offer two or three concrete choices,
recommended first when appropriate. A choice question is one page: the host shows each field
on its own page, so `text_label` next to `options` adds a second step. Pass it only when a note
is really needed. When another answer is likely, let the last choice name it (Different company,
Needs corrections) and ask the follow-up as a free-text question; do not add a bare Other option.
Use genuine multi-select for independent choices only when the tool's schema supports it;
otherwise offer concrete combinations in a single-select chat question. The dashboard is
view-only. Aim for clicks or at most five words per answer. Never bundle a business
clarification with optional maintenance questions or ask again for an already authorized action.

A yes/no or permission question always passes `options`, for example Yes, go ahead and No, skip it.
Omit `options` only when the answer is a name, a link or other free text, and then name what to
type in `text_label` or leave it out. A yes or no the person already gave for that exact step, in
a form or in the chat, is the answer: act on it and never show the same question again in another form.

Keep one question pending. Only `status: answered` from a question tool supplies
submitted `selections` and/or `text`; preserve both. `declined` skips that question only,
`cancelled` stops it, and `unanswered` supplies no decision. None of those three authorizes
dependent work; an `answered` yes does, for the ordinary step it named.
`not_shown` means the host closed the form before the person could see it: it is no answer
and no refusal. Ask that question, and the rest of this chat's questions, as plain chat text.
For async forms, an acknowledgement is not an answer: pause dependent work and keep the
turn alive with interruptible waits, repeating until an answer or cancellation arrives.
Never end the turn, even with an empty final response, while an async question is pending.
Defaults, empty results, errors, timeouts, elapsed time and unrelated messages are not answers.
Do not use shell sleep or a busy loop. Waiting does not keep the host's panel expanded;
accept a short chat answer if it collapses and never repost a question to reset its timer.
A plain text question without a pending widget ends in a final message and waits for a reply.

Security permissions, account sign-in and the exact APPROVE flow stay native. A preference
widget cannot authorize shell commands, trust hooks or grant account access. Carry out a
submitted ordinary choice through its owning workflow with the normal permission prompts.

No slop. No filler phrases, no hedging when facts are cited, no LLM preamble
("I have created...", "Here is the updated...", "Certainly!"). No placeholder dates.
Short paragraphs. Concrete facts. Use the person's exact words when capturing their
thinking; do not paraphrase or clean up their language.
<!-- /generated: questions -->

## Computer Use

<!-- generated: computer-use; edit plugins/gtm-os/policies/computer-use.md -->
Do the work through the tools. The GTM OS MCP tools, and any other MCP server configured for the
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
gtm-os-configure/references/chrome-session.md; never silently switch to the embedded browser
or ask for another login there. If the intended Chrome session itself needs sign-in, let the
person handle its native prompt. A prior setup choice is not authorization for future website
reads. The local dashboard needs no login and always belongs in the Codex pane.
<!-- /generated: computer-use -->

## Contributor invariants

- Shared question and Computer Use policies are authored in `plugins/gtm-os/policies/`.
  Run `node scripts/sync-derived.mjs` after editing them or the single-memory input fields
  in the ontology. It refreshes the marked instruction blocks and batch schema; tests
  enforce `--check`. Historical templates are excluded. See [README.md](README.md#maintaining-shared-text-and-schemas).
- Three formal ontology objects: contexts, memories and entities. Entity kinds are person,
  organization and product; company and team are organization subtypes. Roles and relationships
  are supported by context memories. Meeting evidence stays in context memories; it is not a
  separate object type.
- GTM OS is English-only: conversations, dashboard labels, user-facing commands and brain
  records. There is no language preference to read, save or ask about. Keep tool identifiers,
  CLI flags, and the APPROVE token stable.
- `plugins/gtm-os/lib/` is the file format; skills and hooks go through it.
- A hook runs only while Codex holds the approval for its declaration: `config.toml` keeps a
  `trusted_hash` per hook and `codex plugin add` writes none, so a hook installed by a command
  is enabled and silent. `hooks/trust-hooks.mjs` writes that approval; `dev-install.sh`,
  `update.mjs` and the install flow all run it. The hash covers `hooks.json` (command, matcher,
  timeout, status message), not the script body and not the installed path: editing a hook
  script or bumping the version keeps the approval, editing `hooks.json` drops it. After any
  change to `hooks.json`, re-run `./dev-install.sh` or the hooks stay off without saying so.
- A change under `plugins/gtm-os/` that people should receive bumps the version in
  `.codex-plugin/plugin.json`. `check-version.mjs` compares that number with the installed one,
  and the dashboard, the hook and the advisor all read its answer: everything shipped without a
  bump is invisible, so nobody is ever offered it. The cache path in SETUP.md and COMMANDS.md
  carries the same number, and a test holds them together. A change to `templates/AGENTS.md`
  snapshots the outgoing template into `templates/legacy/AGENTS-<old version>.md` and lists that
  version in `templates/legacy/manifest.json`, shared by the upgrader and its test matrix.
  Preserve these snapshots unchanged; they distinguish shipped instructions from personal edits.
- Developer skills live in `.agents/skills/` of the onboarding repository, which Codex reads when it is opened in that checkout;
  `plugins/gtm-os/skills/` is what people install into a company brain. A developer workflow
  shipped there sits in every user's skill list one prompt away from writing scratch files into
  their folder. `gtm-os-review-tools` is the example.
- Two kinds of interactions: the plugin's, described in `plugins/gtm-os/ontology/gtm-os.ossie.json`
  and generated as first-class tools; a company's, described in its `brain/ontology.ossie.json`,
  listed per brain by the catalog tools and run through the one fixed tool `interact`. Codex lists a
  server's tools once, at startup, and the server does not know the brain then, so company
  interactions cannot be tools of their own. The company file is protected truth (the gate,
  `approve.mjs --interaction`); `lib.RESERVED_TOOLS` is held equal to the live catalog by a test.
- A project is a tag and a local pointer, never an object: `project:<slug>` on memories, a marked
  block in the folder's `AGENTS.md` (`lib.writePointer`; the format lives in `lib` and
  `hooks/resolve.sh` mirrors it), and `work/projects.json` for this machine's paths. Nothing
  under `brain/`. Codex reads `AGENTS.md` from the git root down to cwd and never below cwd
  (https://learn.chatgpt.com/docs/agent-configuration/agents-md), so an external folder needs the
  pointer with the rulebook line and a sub-folder of the brain needs only the two values.
  `lib.readLoaded/writeLoaded(root, ..., project)` are the only place that knows a loaded set's
  path; every hook resolves the brain through `resolve.sh` / `lib.resolveBrain`, never
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
- No em dashes anywhere. Plain hyphens.
- The plugin ships from `gtm-week/gtm-os`, branch `main`.
- Tests: `node --test 'plugins/gtm-os/test/*.test.mjs'` (Node's own runner, no dependencies).
  `brain.test.mjs` covers the lib, `skills.test.mjs` runs the scripts on a brain made by setup,
  `server.test.mjs` drives the MCP server, `dash.test.mjs` the dashboard server and the session
  hook. Run them before every commit that touches `lib/`, a skill script, a server or the hook.
  Before a push to `main`, `.githooks/pre-push` runs them and, when what ships changed,
  `test/live/harness-bench.mjs`: the plugin must not cost Codex solved tasks on work that is not
  GTM (see README.md, Before pushing to main).
- The model reaches the skills through the MCP server (`server/server.mjs`, one tool per
  operation, each runs the skill's script in the brain). The server runs outside the sandbox, so
  every writer commits what it wrote at once (`lib.commit`, pushed in the background when there
  is a remote); `save` keeps edits made by hand. Applying an APPROVE stays a shell step with
  Codex's permission prompt. `GTM_OS_NO_COMMIT` turns committing off for tests and dry runs. A new operation is a script plus a tool entry; add its instructions to the owning workflow.
  Skills are user workflows, not one entry per operation. Internal procedures live in their
  `references/` folders. Existing script paths under `skills/gtm-os-*/` stay stable even when
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

# INSTALL.md: agent instructions for installing GTM OS

You are a coding agent a person has pointed at this file (or this repo) and asked to set
up GTM OS. The person may be non-technical. Run everything yourself, ask permission when
your harness requires it, and speak in plain words. Do not paste command output at them;
say what happened.

**This file is all you need, and speed is part of the experience.** Do not survey the
repo: no README, no AGENTS.md, no reading the plugin's skills or scripts, no directory
listings beyond what a step asks for. One read of this file, then the steps in order,
each step's routine commands batched into a single run. Verify only what a step names,
once. A person is watching a progress line, not a research project; every extra read is
a pause they feel.

**Consent is a click, never typing.** Some commands make the app ask for authorization
(installation, opening the app). Let the app's own Approve button carry that: never ask
the person to type a yes in chat. And never bundle a risky command with routine ones:
the whole bundle then needs authorization and shows nothing for it. One risky action
per command, preceded by one plain line about what the click approves ("the app will
ask to allow opening your GTM OS project"). Batch freely everything that needs
no authorization.

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

Security approval belongs to the app's permission prompt, never a preference widget.
A tool checklist selects what to connect; it cannot grant shell permissions, trust hooks,
or authorize account access. Do not change approval settings to speed up installation.
When the app offers a scoped remembered permission, describe exactly what it covers;
never ask for unrestricted access. Do not ask for a second chat confirmation for an
installation action the person already requested.

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

For optional actions that need a new decision, present the concrete action and scope
through structured choices, then wait for the submitted answer. Use checkboxes only
when the available control supports independent selections; otherwise group short
questions in the native question widget. Execute the selected actions with their normal
permission prompts. A hard tool safety block is not a missing user approval: do not
offer an Allow choice that cannot lift it, or try another control mechanism to evade it.

## How to talk

Speak in outcomes, never in components. The person does not know what a plugin, a
marketplace, a hook, a repo, Node or git is, and installing GTM OS must not require them
to learn. The words plugin, marketplace, hook, repo, branch, JSON, CLI, Node, git, script
and path do not appear in anything you say to them; commands and their names stay in your
tool calls. Substitutions:

- checking prerequisites -> "checking this computer has everything it needs"
- enabling hooks -> "turning on the safety locks so nothing important changes without your
  say-so"
- marketplace add + plugin add -> "installing GTM OS"
- verifying -> "done, and I checked it works"

The test for every line you say: would it make sense to someone who has never opened a
terminal? Bad: "Codex, Node and Git meet the installation requirements." Good: "This computer
has everything it needs." Bad: "I will enable the plugin's protection mechanisms that block
direct edits of protected files." Good: "Turning on the safety locks: nothing important
changes without your say-so." One short line per step: what just happened, in their
world, not yours.

## What you are installing

GTM OS is a Codex plugin: a company brain for a revenue team, kept as plain text in the
person's own git repo. This repo is the plugin. Branch: `main`.

## Steps

Check each step before the next. Report progress as you go, one line per step.

1. **Prerequisites.** `codex --version` must be 0.149 or newer, `node --version` 22 or
   newer, and git present. Install what is missing (Homebrew on macOS). If Codex itself
   is missing or not signed in, stop and tell the person: installing and signing into
   Codex is theirs to do. The plugin repository is private and Codex fetches it with git,
   which has its own GitHub sign-in (the GitHub connector inside Codex is a different login
   and does not help git): if `codex plugin marketplace add` answers "Missing or invalid
   credentials", the person runs `gh auth login` then `gh auth setup-git` once, in a
   terminal, and you retry.
2. **Install the plugin.** If you are reading this file from GitHub, install from there:

   ```bash
   codex plugin marketplace add gtm-week/gtm-os
   codex plugin marketplace upgrade gtm-os
   codex plugin add gtm-os@gtm-os
   ```

   The upgrade line matters on a machine that already had the marketplace: `add` keeps the
   old snapshot there, and `plugin add` would install the version in it, not the newest.
   On a fresh machine it changes nothing.

   If the person pointed you at a local folder instead (this file is on their disk),
   install from that checkout, so they get exactly the code they are looking at:

   ```bash
   codex plugin marketplace add /absolute/path/to/this/folder
   codex plugin add gtm-os@gtm-os
   ```

3. **Turn on the safety locks.** Installing does not switch them on: Codex keeps them off
   until someone approves them, so a plugin installed from a command has no session refresh
   and no write protection until this step runs.

   ```bash
   node <plugin>/hooks/trust-hooks.mjs --trust
   ```

   `<plugin>` is the folder you installed from: a local checkout is
   `<that folder>/plugins/gtm-os`, a GitHub install is
   `~/.codex/plugins/cache/gtm-os/gtm-os/<version>`. It prints one line per lock and ends
   with `Safety locks: on`; anything else means they are still off, so say so plainly and
   do not report the installation as finished. Say one line before running it (see How to
   talk); this is the person's approval, so do not bundle it with anything else.

4. **Verify:** `codex plugin list | grep gtm-os` must say installed and enabled.

   Do not run the Claude handoff during install; onboarding offers it itself later, at
   the tools step, inside the brain's own chat.
5. **Hand over one small step at a time.** Installing is all this file does. First say exactly:
   "Now create a new, empty project in Codex called GTM OS and tell me when it's ready."
   Once it is ready, give the next action only: open a new chat there and send "Set up GTM OS here".
   Do not present the whole installation and onboarding checklist at once. The sequence is:

   1. In the Codex app, create a project: an empty folder, wherever they keep work, called
      GTM OS (the app shows the folder name as the project name).
   2. Open a new chat in that project.
   3. Send "Set up GTM OS here" (a slash command is optional). GTM OS takes it from there:
      it creates the brain in that folder, gets to know the business, connects the tools
      and opens the dashboard next to the chat.

   Do not make the folder yourself, do not open the app to a folder, do not run setup or
   discovery from here, and do not use `codex exec` or a `codex://` link for the kickoff.
   A new empty-folder chat proactively offers setup on a greeting. After setup succeeds,
   a saved onboarding flag keeps the next steps moving without a continuation command.
   The brain is born in the person's own project, in a chat they opened, where the plugin's
   hooks and skills are active. If they ask you to make the folder for them, make an empty
   one where they say and stop there.

## If something fails

Explain the failure simply and what to do. Known cases:

- **Marketplace add fails:** check network and that the repo URL is reachable. Retry once.
- **Plugin add fails after a marketplace change:** run `codex plugin add gtm-os@gtm-os`
  again; re-adding is safe.
- **The safety locks stay off:** `trust-hooks.mjs` reaches Codex through its app-server, so
  it needs the installed plugin and a working `codex` command. Retry once after the install
  step. If it still fails, hand over anyway and tell the person that the locks are off and
  that Codex will offer to review them: everything else works, and nothing is lost.

## Scope

Install. Nothing else: the brain is created by
`/gtm-os-start` in the person's own project, in their next chat, where the plugin's hooks
and skills are active.

## New brain defaults

A fresh brain starts with Our company (`company`), Strategy (`strategy`), Market (`market`),
Target customers (`icp`), Our offer (`offer`) and Personal (`personal-<creator-handle>`).
Our company describes the organization that owns the brain. External companies are names
linked to notes in the relevant context, not additional default contexts. The personal context
exists from setup. Pipeline, marketing and account/initiative contexts
are proposed only when sustained work needs a separate scope, then created on agreement.
Installing or updating the plugin does not rename or delete contexts in an existing brain.
After refreshing this checkout with ./dev-install.sh, start a new chat so setup uses the new
MCP schema and workflow. Do not reuse an old chat's pipeline/marketing/gtm setup schema.

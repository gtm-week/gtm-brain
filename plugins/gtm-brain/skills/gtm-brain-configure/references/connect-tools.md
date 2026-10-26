# GTM Brain: Connect my tools

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.


> For humans: you told setup which tools you use. This checks Codex can really reach them.
> Each tool has an official Codex plugin; installing it is one command, then you sign in once.
> Your sign-in is yours: it lives in your Codex, never in the brain.

For interactive onboarding questions, read [onboarding questions](../../gtm-brain-start/references/questions.md) once.
Use structured choices by default and keep async questions alive until answered.

## Routing for every connected service

MCP is the default for all supported operations, including HubSpot and Attio. Discover the
service's callable tools and test the smallest relevant read. Do not substitute Computer Use
because Chrome is signed in or because an MCP result is empty. On failure, diagnose the
connector and report the gap. Only offer a browser step when the operation needs website
context unavailable through MCP, and obtain or reuse approval for that specific step.

## Step 1: check

Call the GTM Brain tool `check_tools` with `brain` = this workspace folder. No shell command.

Show the list as returned: per tool, installed / available not installed / no official plugin /
not available (disabled by the workspace admin). The match is against the live catalog, not a
list kept in the plugin: a plugin that appears in Codex next week is found by its name. When the
tool says *also matches*, the first match was taken; ask only if the person's tool is plainly
the other one. When a tool says *no official plugin*, that is the catalog as Codex cached it
(the line "catalog as of" says when); it is not a list of ours.

## Step 1a: suggested before anyone named them

The check ends with *suggested* lines for the floor: email, calendar and the CRM, whichever
the workplace info does not name yet. The CRM line is **HubSpot** unless Attio is the one
installed: the course gives every participant HubSpot, so propose it by name ("the course
gives you HubSpot; shall I connect it?") and let the person correct it ("Attio" or another
name; anything with an official plugin is offered the same way). A line that says *declined
earlier* is a decision already made: never propose that tool again unless they ask for it.
When the person declines in chat ("no CRM yet", "skip HubSpot"), record it at once with
`mark_tool` (`status` = skip, `note` = their words).

## Step 1b: plugins installed but not in the tools list

If the check ends with *"installed in Codex but not in admin.md tools: linear, google-calendar"*,
offer once: *"You have Linear and Google Calendar connected; add them to the tools list?"* On
yes, propose the `admin.md` change through the `gtm-brain-configure` workplace-change procedure (the person types APPROVE).

## Step 2: choose once, install the selected tools

An explicit "connect Gmail and Google Calendar" request in Codex authorizes installing those named tools. Do not ask for another yes per tool.
If no selection exists, offer an available structured choice control in Codex. For a single-select chat control, offer "Email and calendar", "Email only",
and "Skip both"; then the CRM as its
own question: "HubSpot (the course gives it to you)", "Attio", "Another CRM or none yet".

Prefer `configuration_question` with the named tools as `options` and `multiple: true`.
Its submitted selections choose what to connect, not account permissions. If the person
submits none or cancels, do not infer declines. Record an explicit Skip response as a
skip of this question, and clarify scope only when necessary to continue.

Prefer a blocking question tool when available in the current mode. Async questions
can auto-collapse to "Answer question" after 30 seconds even while the agent waits;
Follow the shared question handling
reference, and accept a short chat answer if the person reports a collapsed panel.

For `request_user_input_async`, `{"accepted":true}` only acknowledges the question.
Keep the turn alive: pause dependent work and call an interruptible wait such as
`clock.sleep` with `duration_ms: 30000`, repeating until the submitted answer arrives
as a user message. Do not send a final response, even an empty one; turn completion
clears the selector. Defaults and expired waits are not consent. Honor cancellation.
A blocking question tool waits inside its call instead. Only a plain text question
without a widget should end the turn to await the reply. Put explanations before the
widget and keep one question pending. Apply this to both single-select and multi-select.

During onboarding, save the submitted choices before installing, using [continuation](../../gtm-brain-start/references/continuation.md). If tools become available in this chat, test them and proceed. Only a confirmed activation blocker calls for a new chat.

Run each selected missing tool's install as a separate command:

```
codex plugin add <id>@<marketplace>
```

exactly as the tool's *install:* line says (the id can be an `app-...` one).

This may need permission (network); let Codex ask. Then tell the person: *"Sign in to HubSpot
when Codex prompts you; that happens in the app on first use."* Do not try to sign in yourself.

For "no official plugin" tools: say the tool will work by export or paste, and check that the
relevant context's rule says so (`Granola: export the transcript and drop it in`).

## Step 3: read test, per installed tool

Call the plugin's smallest read operation yourself and report what came back in one line:

| Tool | Read test |
|---|---|
| hubspot, attio, salesforce | list 1 deal or company: "read 1 of 57 deals" |
| gmail | list the 3 most recent message subjects (no bodies) |
| google-calendar | the next 3 events, titles only |
| granola, notion, slack, linear | list 1 recent item, title only |
| stripe, posthog | one summary number (active subscriptions, events today) |

Then record it:

A connector call that succeeds in any chat also records the read test by itself, so a tool used in
real work is never left "untested". Otherwise call `mark_tool` with `tool` (hubspot), `status` (ok or fail) and `note` ("57 deals, 342 companies",
"not signed in").

Never `remember` the read test results; they are not company knowledge. Never store what you
read. If a read fails because the person is not signed in, explain the one sign-in action they need. During onboarding, keep its flag pending and follow [continuation](../../gtm-brain-start/references/continuation.md). Continue independent steps or offer an explicit skip; one unavailable connection does not end onboarding.

## Approved browser access when a Chrome session is needed

For an explicitly requested browser test or an approved step that needs signed-in website
context, follow [Chrome session access](chrome-session.md). Prefer MCP for supported
operations. A failed or empty MCP read never automatically triggers Computer Use. Reuse an
already approved browser step without asking again. Report Chrome access separately from MCP
health; never mark a connector working merely because its website opens.

## Step 4: report

The status line from the tool, e.g. `attio ●  gmail ●  granola ✕`, and what to do about each ✕.
This line is also shown at the start of every session.

## Hard rules

- Install only tools explicitly requested or submitted in a selection. Unchecked tools
  named in the submitted skip list are declined; an unsent checklist is not an answer.
- The selection does not grant Codex permissions or account access. Use native approval
  prompts for commands that require them, and let the person complete account sign-in.
  Never change security settings or automatically accept trust or sign-in dialogs.
- Never remove or disable plugins.
- Read-only. The read test never writes to a tool.
- Credentials are personal; `work/tools.json` is local and ignored by git. A teammate runs
  `connect` in their own Codex.

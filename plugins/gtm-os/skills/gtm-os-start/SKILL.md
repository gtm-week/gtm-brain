---
name: gtm-os-start
description: |
  The first command in a project: set up the GTM OS company brain in this folder, get to
  know the business, connect the tools and open the dashboard. In a folder that already has a
  brain it resumes an active onboarding request. Completed onboarding stays complete across
  updates; an existing brain without a marker opens for ordinary work. Triggers: "/gtm-os-start", "start GTM OS",
  "set up GTM OS here", "onboard", "discover my business".
  Also imports a handoff from another assistant ("import from claude", "import the handoff").
allowed-tools: [Bash, Read, WebSearch, WebFetch]
---

# GTM OS: Start

In Running for you, follow [daily sync setup](../gtm-os-sync/references/source-sync.md): recommend
source sync, explain why fresh evidence matters, and configure the submitted schedule before
claiming it is active. Reuse prior choices and explicit skips.

When onboarding completes, end the closing reply with one first task, never a list of commands
or "start working normally". If a calendar passed its read test, read its next few days once and
pick the first meeting with someone outside the company (this read only picks the task; save
nothing from it): "Prep my meeting with <name> (<company>)
on <day>." Else, for a recent customer thread that email or the CRM returned: "Where do we stand
with <company>?" Else: `/gtm-os-todo What should I focus on today?` Put only that sentence in a
code block and the one line of why outside it; use only names and dates a read returned, and never make
`/gtm-os-project` the first task. Details: [the first task](references/skills-tour.md).

Follow [continuation](references/continuation.md) during active onboarding: setup saves the pending flag; keep moving until completion or a real blocker. A returning person with a pending request does not need to type a continuation command.

First honor the live onboarding state from the hook or tools. `required: false` means no
onboarding is due, even if old summaries mention it. Continue ordinary work without an
onboarding question or announcement about its completion. Use the status internally unless
the person asks about onboarding. A person's statement that they already finished is enough to record
completion with `remember`; never make them repeat the checklist to clear a stale flag.

Before the first `onboarding_question` form, read [question handling](references/questions.md) once for the tool parameters.
Prefer `onboarding_question` when available: it waits inside the call and supplies native
choices, multi-select checkboxes and free text in ordinary mode. Reuse known answers and
keep one question pending until it is answered or cancelled. No Plan-mode switch is needed.

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: you created a project folder in Codex and installed GTM OS. This is the one
> command that turns the folder into your company brain. It asks little, reads what it can,
> shows you drafts to correct, and ends with the dashboard open next to the chat.

## Step 0: where are we

Call `check_environment` with `folder` = this workspace folder. Never run version, login or
listing commands in the shell for this.

- **A brain already** (brain/admin.md exists): say so in one line, then go to Step 2 only if
  `required: true` is an active request by this person (read `check_environment`, `query` (status)
  or the hook), else open the dashboard and say where
  we are. Never run setup over an existing brain.
  Missing markers, an older completion, or unavailable optional features do not start discovery.
  Only an explicit new onboarding request records a pending marker with `remember`,
  superseding the current marker when there is one, including an inactive legacy pending
  marker. Reuse all prior outcomes.
- **Not empty and not a brain**: ask for an empty project folder; never clear or adopt this one.
- **Empty** (a .git, README or .gitignore is fine): continue.
- Missing node, git or a Codex sign-in: say what is missing in plain words and stop.

## Step 1: the brain, in this folder

Follow [create the brain](references/create-brain.md): the few facts it needs (company, what
you sell and to whom, your full name and email, teammates, the tools you use: the CRM first,
proposed by name, HubSpot as the course default with Attio as the expected correction), then
`setup_brain` with `folder` = this folder. Introduce the dashboard in one line as the page
with what needs them, the contexts and the open questions, shown inside Codex without login.
Offer optional personal Chrome setup for logged-in website work during the connection step,
following create-brain.md; do not ask for a dashboard browser choice. Reuse anything
already known (what Step 2 will find if you prefer to run its pull
first). The person's name and email are theirs to give: never take them from git, GitHub or
the machine, and never accept a noreply or GitHub address as someone's email. Summaries update in the background by default; say so in one line, never as a
question. The starting contexts are explained together, not interviewed one by one.

## Step 2: get to know the business

Follow [discovery](references/discovery.md) from its Step 0: pull what the machine and the
already connected tools know, research the website, draft the workplace info and show it for
APPROVE, propose the tools to connect, read them for a first snapshot, propose one or two
automations, ask which existing Codex projects to follow using
[existing projects](references/projects.md), then write the completion marker. The dashboard's
onboarding card follows each step. A completed v1 onboarding stays complete. New project
features can be used through their normal workflows whenever the person needs them.
Stop and skip are honoured exactly as that procedure says.

## Step 3: tools and the dashboard

Connect what the person chose with the gtm-os-configure skill (install on a yes, one read
test each). Then call `open_dashboard` and open its exact URL inside Codex with
open_in_codex, reusing the dashboard tab. The dashboard needs no login. Do not reconnect or re-ask choices already handled during discovery. During active onboarding, write the completion marker and close with two lines: what the brain holds now, and the one next thing to do
(usually: work in a context and let the notes accumulate; `gtm-os-todo` when unsure what to do).

## Permissions, said before they happen

Codex will ask the person to allow some steps. Say, in one plain line and before the prompt
appears, what the click allows and why: installing a tool's plugin ("the app will ask to
install the Gmail connection; that is the sign-in for your mail"), opening the dashboard in
Codex mode ("it will ask to open a page inside Codex; that is the dashboard"), the first write to the
brain folder, the safeguards ("hooks", the locks that stop anything important changing
without a say-so). Never bundle a step that needs a permission with routine ones, never ask
for broader access than the step needs, and never treat a declined prompt as a refusal of
the whole setup: say what was skipped and carry on.

## Hard rules

- One question at a time; offer a concrete proposal with choices
  and free text for corrections when possible.
- Never create the brain anywhere but this folder, and never in a folder that is not empty.
- APPROVE is typed by the person in Codex. The dashboard has no approval controls.
- Nothing here is a shell command the person has to see: tools, then one plain line each.

If GTM OS tools are missing or report a missing plugin version, follow
[update recovery](../gtm-os-configure/references/update-plugin.md#missing-tools-or-an-interrupted-update).
Check the installed connector before choosing a repair: verified files need app activation;
missing or broken files need an update from the configured source. Never remove the plugin
or re-create an existing brain to fix its connector.

Customer coverage is part of the first snapshot: follow [customer discovery](../gtm-os-use-brain/references/customers.md), capture the defined roster beyond the activity sample, and show customers with sources and explicit coverage gaps.

## Importing a handoff

For "import from claude", "import the handoff" or a hook line saying a handoff is waiting,
read [import](references/import.md) and follow it.

# Workflows in GTM Brain

GTM Brain 0.28.0. An action that plays out over time, such as an outbound campaign or two weeks of
ads followed by outreach to the accounts that engaged: what to settle before starting, the steps
with their gates, and what to read back at the end. The brain keeps each run's state and says
when a step is due.

## The idea in one paragraph

A workflow is a document (see [DOCUMENTS.md](DOCUMENTS.md)) in `workflows/` with `type: workflow`
in its frontmatter and three headings the brain reads: `## Before starting`, `## Steps`,
`## Learn`. A run is the brain's record of one execution: notes in one context, one per step,
with the due date on it. Nothing runs by itself: every step is done in the chat through the
connected tools, or by you, and then recorded. What the brain does on its own is keep the dates
and tell you, at the start of a chat and on the dashboard, when a step is due.

## Writing one

Two come with every brain as drafts, `workflows/outbound.md` and
`workflows/ads-then-outbound.md`; edit them or copy one. Or ask in the chat: `I need a playbook
for partner onboarding` (a playbook is a workflow here). Codex drafts it from what the brain
knows, shows it once, and saves it as a new draft in `workflows/`; an existing file is never
replaced. The shape:

- `## Before starting`: a bullet per thing to settle, `**Label**: what it means`. The brain fills
  what it already knows and asks for the rest before a run starts.
- `## Steps`: a numbered list. Each step is `**Title** (tool: category). What to do. Gate: ...`.
  The category (crm, ads, sequencer, email, calendar, analytics) is mapped to whatever is
  connected in your brain. The gate, optional, is one of `after 14 days`, `on 2026-10-03` or
  `when the engaged accounts are known`. A step without a gate is due as soon as the one
  before it is done.
- `## Learn`: a bullet per thing to read back when the run ends.

A file out of shape is named with its problem in `list workflows`; fix it by hand, the brain
never rewrites it. A workflow from a mentor is a file dropped into `workflows/`.

## Running one

- `start the outbound workflow`: the brain reads the file, proposes the "Before starting"
  answers it can, asks for the blank ones one at a time, shows the brief once, and starts on
  "Start it". The run gets an id from the workflow, the date and the name you give it.
- `where is the campaign`, `next step`: the steps with their state, the open question if any,
  and the next thing to do. A step that is due is done in the chat, then recorded with the
  actions taken; the next step opens with its date.
- `skip this step`, `abandon the run`: with a reason, in your words.

## Pings

There is no push channel to someone who is not in Codex. The brain says a step is due in three
places: the opening lines of every chat in the brain, the todo list (`what should I do now`),
and the dashboard's Needs your attention view. The check runs at every session start and in the
scheduled run (see COMMANDS.md, schedule); a gate that passed becomes a question you answer in
the chat or in the todo walk-through.

## What is recorded

In the run's context, as ordinary notes tagged with the workflow and the run: the brief, one
note per step state (superseded as it changes, so the history stays), the gate questions, and a
decision at the end with the Learn items. `query` (sql) can read them by tag. Files a run
produces land in the project folder when the chat is in a project, and otherwise beside the
workflow in `workflows/<slug>/`, named after the run, since every run of that workflow shares
the folder.

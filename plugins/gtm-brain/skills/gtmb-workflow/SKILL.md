---
name: gtmb-workflow
description: |
  Run a workflow (a playbook): an action that plays out over time (an outbound campaign, ads
  then outbound) from a workflow document in workflows/, with things to settle before starting,
  gated steps and a read-back at the end. Create one, start a run, see where it stands, do the
  next step, skip or abandon. Triggers: "/gtmb-workflow", "start the outbound workflow",
  "run the playbook", "I need a playbook", "make a playbook for X", "our playbooks",
  "new workflow", "where is the campaign", "next step", "skip this step", "abandon the run",
  "list workflows", "which workflows do we have", "check the workflow", "switch on the
  workflow", "pause the run", "which workflows are running", and a workflow offer at the chat start.
allowed-tools: [Bash, Read]
---

# GTM Brain: Workflows

A workflow is a document in `workflows/` with `type: workflow`: a "Before starting" list, numbered
steps with a gate each ("after 14 days", "on 2026-10-03", "when the engaged accounts are known")
and a "Learn" list. A run is the brain's record of one execution: memories in one context, one per
step, with due dates. The `workflow` tool is the only writer; never write run state with
`remember` and never edit an existing workflow file from here (the person edits it in Finder).

Keep authored brain content in English. Follow [question handling](../gtmb-start/references/questions.md)
for native questions. Every step is done in this chat through the connected tools with their
normal permission prompts, or by the person, who reports it; the tool records, it never acts.

## Playbooks are workflows

People say playbook; GTM Brain calls it a workflow, and both mean the same file in `workflows/`.
When someone asks for a playbook, answer with the workflows: say the ones that exist (`list`),
offer to start the one that fits, and offer to write a new one when none does. Never write a
playbook as a document, a skill or a loose Markdown file. Say "workflow" back once, in half a
sentence ("playbooks live here as workflows"), then use whichever word they use.

## Write a new one

Draft it from what the brain knows and the person's words: what to settle before starting, the
steps in order with the tool category each uses (crm, email, calendar, sequencer, ads,
analytics, slack) and a gate where a step waits (after N days, on a date, when something is
known), and what to read back at the end. Use the shipped drafts in `workflows/` as the model.
Show it once and ask (Save it; Change something). Then `workflow` with
`action: create`, the title, the body with the three headings and `applies_to`. It is saved as
a draft; the person edits it in Finder like any document, and a run can start at once.

## Which workflows, which runs

`workflow` with `action: list`. Say the workflows by title with their step count, and the runs in
progress with their current step and due date. A workflow that does not parse is named with its
problem and the file to fix; do not offer to fix it yourself.

## Start a run

Read [start](references/start.md). In short: read the workflow file in full; fill the "Before
starting" items from what the brain already knows; ask only for the blank ones, one
question each; confirm the brief on one page ("Start it", "Change something"); then `workflow` with
`action: start`. Nothing is written before that answer.

## Where a run stands

`workflow` with `action: status` and the run id. Report the steps as the tool lists them, the
open gate question if any, and the next thing to do in one line. Never guess at connector state;
a due step is due because its date passed, not because the work happened.

## Do the next step

Read [step](references/step.md). In short: the current step must be `due now`; do it through the
connected tool named by its category (`check_tools` shows what is connected), then `workflow`
with `action: advance`, the step number, a one-line note, the actions taken and, when a gate
question was open, its answer. The tool opens the next step and says when it is due or what it
asks.

## Skip, move, pause, cancel, fail

Each needs a reason in the person's words (ask once when it was not given): `action: skip` with
the step number, `move` with the step and `to` (a date), `pause_run` and `resume_run`, `cancel`
for the run, `fail` with the step when a tool refused (its words, word for word): a failed step
stops the run and says why. Every one is a note in the run's context.

## Triggers: switching a workflow on

A workflow's header (frontmatter) says `status` (draft, active, paused), `trigger` (manual; a
schedule like `every Monday 09:00`; or a save: `note about organization`, `link works_at created`,
`field person.role changed`, `field organization.industry missing for 30 days`) and what it
`reads` and `writes` (`kind:`, `link:`, `field:`, `tool:` items). Steps may name a skill
(`(skill: gtmb-deepdive)`) and end with `Milestone:` (a note tagged x, a link created, a
field filled, a document written); WORKFLOWS.md has the grammar.

- "Check the workflow": `action: check`. Report the problems in plain words and the dry run's
  example and what it would read and write. Nothing is written.
- "What does it need": `action: needs` with a workflow or skill name returns one proposal.
  A missing kind, link or field goes through gtmb-schema with the person's yes; never edit
  SCHEMA.md from here.
- "Switch it on": only on the person's word and after a passing check: `action: activate`.
  `pause` and `resume` likewise. These change the header's status line only.
- An offer at the chat start ("workflow x (note about organization): ..."): after answering the
  person, offer it once in one line (Start it; Not now). On Start it, `action: start` with the
  slug and the `event` id the line named; ask for any Before starting item first. On Not now,
  `action: dismiss` with the event and their words. Never start a run nobody asked for.
- "Which workflows are running": `query` with object `workflows`.

## Milestones

A step is done when its milestone is in the brain. When it is a tag, `advance` carries it: the
advance note is the milestone. For a link, a field or a document, do that first (save the
relationship, compile the brief, write the document); `advance` refuses until the brain sees it.
The session and the schedule record a milestone they see by themselves and open the next step.
The brain's rules (RULES.md, Our rules) bind every step, whatever skill it names.

## Hard rules

- The gate date is the brain's; the person's "it's ready" is an `advance` with the answer.
- A `pending` step is not done early: it is skipped with a reason, or it waits.
- Say "run" and "step" to the person; never the tag names or memory ids.

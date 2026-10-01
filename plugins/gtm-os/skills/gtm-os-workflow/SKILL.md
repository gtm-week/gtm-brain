---
name: gtm-os-workflow
description: |
  Run a workflow (a playbook): an action that plays out over time (an outbound campaign, ads
  then outbound) from a workflow document in workflows/, with things to settle before starting,
  gated steps and a read-back at the end. Create one, start a run, see where it stands, do the
  next step, skip or abandon. Triggers: "/gtm-os-workflow", "start the outbound workflow",
  "run the playbook", "I need a playbook", "make a playbook for X", "our playbooks",
  "new workflow", "where is the campaign", "next step", "skip this step", "abandon the run",
  "list workflows", "which workflows do we have".
allowed-tools: [Bash, Read]
---

# GTM OS: Workflows

A workflow is a document in `workflows/` with `type: workflow`: a "Before starting" list, numbered
steps with a gate each ("after 14 days", "on 2026-10-03", "when the engaged accounts are known")
and a "Learn" list. A run is the brain's record of one execution: memories in one context, one per
step, with due dates. The `workflow` tool is the only writer; never write run state with
`remember` and never edit an existing workflow file from here (the person edits it in Finder).

Keep authored brain content in English. Follow [question handling](../gtm-os-start/references/questions.md)
for native questions. Every step is done in this chat through the connected tools with their
normal permission prompts, or by the person, who reports it; the tool records, it never acts.

## Playbooks are workflows

People say playbook; GTM OS calls it a workflow, and both mean the same file in `workflows/`.
When someone asks for a playbook, answer with the workflows: say the ones that exist (`list`),
offer to start the one that fits, and offer to write a new one when none does. Never write a
playbook as a document, a skill or a loose Markdown file. Say "workflow" back once, in half a
sentence ("playbooks live here as workflows"), then use whichever word they use.

## Write a new one

Draft it from what the brain knows and the person's words: what to settle before starting, the
steps in order with the tool category each uses (crm, email, calendar, sequencer, ads,
analytics, slack) and a gate where a step waits (after N days, on a date, when something is
known), and what to read back at the end. Use the shipped drafts in `workflows/` as the model.
Show it once and ask through `question` (Save it; Change something). Then `workflow` with
`action: create`, the title, the body with the three headings and `applies_to`. It is saved as
a draft; the person edits it in Finder like any document, and a run can start at once.

## Which workflows, which runs

`workflow` with `action: list`. Say the workflows by title with their step count, and the runs in
progress with their current step and due date. A workflow that does not parse is named with its
problem and the file to fix; do not offer to fix it yourself.

## Start a run

Read [start](references/start.md). In short: read the workflow file in full; fill the "Before
starting" items from what the brain already knows; ask `question` only for the blank ones, one
page each; confirm the brief on one page ("Start it", "Change something"); then `workflow` with
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

## Skip, abandon

Both need a reason in the person's words: `action: skip` with the step number, `action: abandon`
for the run. Ask once through `question` when the reason was not given.

## Hard rules

- The gate date is the brain's; the person's "it's ready" is an `advance` with the answer.
- A `pending` step is not done early: it is skipped with a reason, or it waits.
- Say "run" and "step" to the person; never the tag names or memory ids.

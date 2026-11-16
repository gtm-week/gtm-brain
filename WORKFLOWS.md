# Workflows in GTM Brain

GTM Brain 0.35.0. A skill is one sitting of work; a workflow is skills in sequence, with a gate
between steps, started by a person, a schedule or something saved in the brain. One skill with a
trigger is the shortest workflow. Each step ends on a milestone the brain can see; reaching it is
saved as a note, and that note starts the next step. The rules in RULES.md bind every step.

## The idea in one paragraph

A workflow is a document (see [DOCUMENTS.md](DOCUMENTS.md)) in `workflows/` with `type: workflow`
in its frontmatter, a header the brain checks, and three headings it reads: `## Before starting`,
`## Steps`, `## Learn`. A run is the brain's record of one execution: notes in one context, one
per step, with the due date on it. The chain of notes is the only state. Nothing runs by itself:
every step is done in the chat through the connected tools, or by you, and then recorded. What the
brain does on its own is keep the dates, watch for milestones, and tell you, at the start of a chat
and in `query workflows`, when a step is due or a trigger fired.

## The header

```yaml
type: workflow
status: draft            # draft, active or paused
trigger: note about organization
reads: ["kind:organization", "link:works_at", "field:person.role", "tool:crm"]
writes: ["tool:email"]
context: company         # optional; required for a schedule: where its runs live
```

- `status`: `draft` runs only when a person starts it. `active` also starts from its trigger.
  `paused` offers nothing and its runs wait. A file without a header is a manual draft, as
  before 0.35.0.
- `trigger`: `manual`; a schedule: `daily`, `daily 08:00`, `every Monday 09:00`,
  `every weekday 08:30`; or a brain event: `note about <kind>`, `link <type> created`,
  `link <type> ended`, `field <kind>.<field> changed`, `field <kind>.<field> missing for 30 days`.
- `reads`, `writes`: what the workflow touches: `kind:<kind>`, `link:<type>`,
  `field:<kind>.<field>` (from SCHEMA.md) and `tool:<category>` (crm, email, calendar,
  sequencer, ads, analytics, meetings, enrichment, slack, docs, web, events).

There is no owner field: a run says who started it.

## Steps

`## Steps` is a numbered list. Each step is

```
1. **Title** (tool: crm) (skill: gtmb-deepdive). What to do. Milestone: a note tagged brief-done. Gate: after 3 days.
```

- `(tool: <category>)`, optional: mapped to whatever admin.md lists for that category.
- `(skill: <name>)`, optional: a shipped skill or one in the brain's `.agents/skills`. Without it
  the step text is the instruction.
- `Milestone:`, what the brain can see when the step is done: `a note tagged <tag>`,
  `a link <type> created`, `field <kind>.<field> filled`, or `the document <slug> written`.
  The milestone comes before the gate, so a teammate on 0.34 still reads the gate.
- `Gate:`, optional, when the step may start: `after 14 days` (from the step before),
  `on 2026-10-03`, or `when <milestone>` (`when a note tagged engaged-accounts`). A `when` with
  any other text is asked as a question, as before.

A step with no gate is due as soon as the one before it is done. A step whose milestone the brain
cannot see is reported by the check.

## Skills say what they need

A skill can carry one line in its frontmatter metadata, with the same items as the header:

```yaml
metadata:
  needs: "kind:organization, field:organization.industry, tool:crm"
```

`workflow needs <skill or workflow>` compares that with SCHEMA.md and admin.md and returns one
proposal listing what is missing. It changes nothing: a schema change goes through
`/gtmb-schema` with your yes, a tool through `connect my tools`. Shipped skills that declare
needs: define-icp, deepdive, market-desk-research, publish-website.

## Switching one on

`check the account-follow-up workflow` runs the check and writes nothing: the header is valid;
every kind, link and field it names is in SCHEMA.md; every named skill exists and has what it
needs; every step has a milestone; no other active workflow has exactly the same trigger; and a
dry run on one real example from the brain lists what a run would read and write.
`switch on the account-follow-up workflow` runs the check and, when it passes, sets
`status: active` and `active_since` in the header. `pause the workflow` and `resume it` change
only that line.

When SCHEMA.md loses a kind, link or field an active workflow names (removed or renamed), the
workflow is held: it reads as paused, its runs wait, and the chat start says what changed. The
file is not rewritten; fixing the header or the schema brings it back.

## Triggers and events

Events are read from what the write path already records: a note saved about an entity of a kind,
a note with a relation block (a link created or ended), an entity's compiled fields (changed, or
missing for N days since the entity was added). A teammate's save that arrives through git is an
event on every machine.

- An active workflow whose trigger matched is offered at the next chat start, one line per
  workflow, never run silently. On your yes the chat starts it with the event; the run's first
  note carries `event:<id>`, so a second chat or a teammate's machine sees it is taken.
  `not now` for an offer is recorded as a note (`dismiss`) and it is not offered again.
- Schedules are evaluated at the chat start and by the scheduled run: the latest time the
  schedule came round is offered once.
- Only events since the workflow was switched on, and at most 14 days old, are offered.

## Running one

- `start the outbound workflow`: the brain reads the file, proposes the "Before starting"
  answers it can, asks for the blank ones one at a time, shows the brief once, and starts on
  "Start it". The run gets an id from the workflow, the date and the name you give it.
- `where is the campaign`, `next step`: the steps with their state, what the current step waits
  for, and the next thing to do. A due step is done in the chat (with its skill when it names
  one), then recorded with the actions taken; when its milestone is a tag, the record carries it.
- The session and the scheduled run watch for milestones: a due step whose milestone is in the
  brain is recorded done (a note citing the evidence), and the next step opens. A milestone not
  reached by its date raises the step again, once a day at most.
- Whose note counts: a note tagged with the run, or a note saved since the step opened that names
  the entity the run is about; for a run about no entity, a note in the run's context. Another
  run's note never counts, and a field counts for a run about no entity only when a note saved
  since the step opened filled it. Two runs about no entity in one context share such a note:
  tag it with the run (`run:<id>`) to say which.
- `skip this step`, `move step 2 to 2026-12-01`, `pause the run`, `resume the run`,
  `cancel the run`, `step 3 failed: <why>`: each is a note with your reason. A failed step stops
  the run and says why.
- `query workflows` (or `which workflows are running`): per workflow its status, trigger, each
  run's step, what it waits for and until when, the last result, and the events waiting.

## Limits

In one place, `LIMITS` in `lib/workflows.mjs`: 3 active runs per workflow, 5 steps a day moved
automatically per run, a chain of workflows starting each other stops at depth 3, 3 workflow lines
at one chat start, events at most 14 days old. A workflow's own notes never trigger it, and
neither does what was saved about an entity while a run of the workflow about it was going. A
note saved with `remember` about a run's subject while that run is going counts as the run's work:
it carries the run's depth, so two workflows offering each other the same account's notes stop at
depth 3 like any other chain.
`workflows: off` in `brain/admin.md` (a workplace change, through APPROVE) turns them all off:
nothing is offered, started or moved.

## Teammates on older versions

A teammate on 0.34 reads a 0.35 workflow as before: the header keys are extra frontmatter, the
milestone is part of the step text, the gate is still the last `Gate:`; an active or paused
workflow shows as a draft. They see no offers, and their saves become events on 0.35 machines once
pulled. A workflow with an empty "Before starting" does not parse on 0.34. A step waiting for a
milestone gate shows there as "waiting, due null", and 0.34 does not know a paused run: it can
still advance one. Editing an active workflow through the `document` tool on 0.34 saves it as a
draft (0.34 knows only draft and approved): nothing runs that should not, and `workflow activate`
switches it back on.

Editing an active or paused workflow through the `document` tool keeps its status; only
`workflow activate`, `pause` and `resume` change it. An edit is not checked again: run `check`.

## Pings

There is no push channel to someone who is not in Codex. The brain says a step is due, or a
trigger fired, in three places: the opening lines of every chat in the brain, the todo list (`what
should I do now`), and the dashboard's Needs your attention view.

## What is recorded

In the run's context, as ordinary notes tagged with the workflow and the run: the brief (the
run-start note, with the event when one started it), one note per step state (superseded as it
changes, so the history stays), the gate questions, the milestone notes, the person's pauses,
moves and failures, and a decision at the end with the Learn items. `query` (sql) can read them by
tag. Files a run produces land in the project folder when the chat is in a project, and otherwise
beside the workflow in `workflows/<slug>/`, named after the run.

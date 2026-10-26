# Doing a step

1. `workflow` `action: status` for the run. The current step must read `due now`. A step that
   is `waiting` is not done early: say when it is due and stop, or skip it with a reason on the
   person's word.
2. Read the step's text in the workflow file. The tool category in brackets names the kind of
   connector: `crm` (HubSpot, Attio), `ads`, `sequencer` (outreach), `email`, `calendar`,
   `analytics`. `check_tools` shows what is connected; when nothing of that category is, say so
   and do the step with the person reporting what they did in the tool.
3. Do the step in this chat with the connector's own tools and the normal permission prompts.
   A CRM write follows the writes references of gtm-brain-use-brain. A file the step produces (a
   target list, a brief) is saved in the project folder when this chat is in a project, and
   otherwise beside the workflow with `add this file to <workflow title>` (the files reference
   of gtm-brain-use-brain), which lands it in `workflows/<slug>/`. Put the run's handle in the
   file name (`acme-q4-target-list.csv`): every run of that workflow shares the folder.
4. When a gate question is open for this step, the answer is what the person or the connector
   said: pass it as `answer`.
5. `workflow` with `action: advance`, `run`, `step`, `note` (one or two sentences, what was
   done), `actions` (tool:action:ref for every connector write), `answer` when there was a
   gate question, and `by`. On the last step also `learned`: each "Learn" item, word for word,
   with what was read back; when a read-back needs a connector, read it first.
6. Report the tool's line. When the next step is due now, offer to do it; when it waits, say
   the date and that the brain will say when it is due.

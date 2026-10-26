# Choose existing projects to follow

This is discovery Step 5, before its completion marker. The person stays in the onboarding
chat in Codex. Following means capturing future work from selected folders into this brain,
with a project tag and starting contexts. It does not import old chats or project files.

## Reuse answers, then discover

Use the verified brain and person from setup. Read their personal context for memories tagged
`onboarding-projects`, and call `query` (projects) with `include_available: true`. Its `projects`
are GTM Brain links; `codex.projects` are the host's existing projects, each with a title and
folder paths. The catalog is read-only and can be partial or unavailable on older hosts.
An empty catalog is not evidence that the person has no projects.

Reuse this person's explicit selections, exclusions, "not yet" or skip. Do not ask again on
resume, borrow another teammate's choice, or unlink anything because it is not selected now.
If a previous submission is only partly applied, continue its remaining selected folders;
verify successful links through `query` (projects) instead of linking them twice.

Check candidate folders with `check_environment`. Exclude the brain itself and other brain
folders. Already-linked folders in this brain are already followed. A folder linked to a
different brain needs a separate, explicit change request; never repoint it here. Missing
folders are a coverage gap, not permission to create replacements. When a Codex project has
several folders, show all of them before selection: capture applies to each eligible folder,
and GTM Brain keeps a separate local link per folder. A project without a local folder cannot
be followed this way. Resolve names to actual paths; never guess paths from project names.

## Ask in Codex

Explain first: "GTM Brain can follow work in your existing Codex projects and keep the useful
notes in <company>. Choose the projects whose future work you want captured."

When candidates are known, ask `onboarding_question` with `multiple: true`:
**"Which existing Codex projects should GTM Brain follow?"** Use the actual project titles as
choices, with paths only where needed to distinguish them. Offer two or three at a time;
for a longer list, keep the selected set across successive batches. Explain that submitting
with none selected skips that batch. Free text can name a missing project or correct a path.
Do not include "None" or "Skip" as an independent checkbox beside project choices.

When no candidates can be listed, explain that limitation and ask a single-select question:
**"Do you already have Codex projects GTM Brain should follow?"** Choices: **Choose existing
projects**, **Not yet**, **Skip for now**. For Choose existing projects, ask for the existing
folder path in a native free-text question. If they give only a name, ask for its folder;
do not pretend to have discovered it. Inspect the named folder before linking it. Not yet
and Skip for now are finished outcomes, never requests to create a project.

Only `status: answered` supplies selections and text. Preserve both. An explicit empty
selection with no text means none in the displayed batch; a declined question skips only
that batch. A cancelled question stops it. Unanswered, timeout and errors supply no choice.
Do not write completion or link folders while a question is pending.

## Apply the selected projects

The question explicitly asks for capture consent, so its submitted selection authorizes
following those named folders in this brain. Do not ask for another yes per folder. If a
free-text answer changes the target folder or brain ambiguously, resolve that change first.
Save the person's decision with `remember` in their existing personal context, tagged
`onboarding-projects`, citing the submitted answer. Record names and slugs; absolute paths
belong only in the local project registry. Save explicit skips and excluded displayed
projects as well, so a later session does not ask again.

Call `query` (contexts) and reuse submitted context choices or infer relevant existing contexts
from the selected projects' known work. No extra mapping question is needed. If a project's
purpose is unclear, start with an empty list and resolve context when work begins. Do not
create a context per project automatically.

Follow [shared linking steps](../../gtm-brain-project/references/link.md) for the actual
`link_project` calls, reusing the brain, capture consent and contexts. This onboarding batch
explicitly skips that workflow's opening step: these projects already exist in Codex, and
onboarding stays in this chat. Do not run `codex app` or open a new task for each selection.
After each successful link, save its title and slug in the personal decision's follow-up
memory. A failure leaves other successful links intact; record what still needs attention
and resolve it or obtain an explicit defer before marking this step done.

Record `Onboarding step 6 (Your projects): <person> chose <project names>; <linked/skipped/deferred outcomes>.`
with `remember` in company (gtm for older brains), without local paths, and re-render the
dashboard. This is progress reporting, not a company-wide capture preference. If a personal
decision already completes the step, reuse it when recording missing progress.

Finish in the current chat: "GTM Brain now follows <projects>. Start a new chat in any of those
projects when you work there." If the person reports a project invisible, give the exact
folder-specific [opening fallback](../../gtm-brain-project/references/open.md). Do not
make opening every selected project part of onboarding.

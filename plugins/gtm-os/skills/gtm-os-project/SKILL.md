---
name: gtm-os-project
description: |
  Projects: create a new working folder inside the GTM OS workspace, link an existing folder
  to the brain, repair its connection, unlink it, or list linked projects. Triggers:
  "/gtm-os-project", "create a project", "new project", "link this folder", "link project",
  "unlink project", "list projects", "repair the project connection".
allowed-tools: [Bash, Read]
---

# GTM OS: Projects

A project is a working folder linked to the brain: its notes are tagged with the project and
its chat keeps its own loaded contexts. Two flows, one skill: create a folder that does not
exist yet, or link one that does.

## Create a new project folder


Use the person's saved conversation language. Keep authored brain data in English.
Follow [question handling](../gtm-os-start/references/questions.md) for native questions.

1. Reuse the known brain and project name. If the brain is unknown, call `query` (brains) and
   resolve which existing brain to use; verify it with `check_environment`. Never use the
   plugin checkout as a brain. Ask only for missing information through `configuration_question`.
2. Default to a direct child of the brain's workspace root: `<brain-root>/<project-slug>/`.
   For example, a Website project in FDE OS goes in `FDE OS/website/`, beside `brain/` and
   `work/`. Resolve from the brain root even when this chat is in another linked project.
   Keep the shared brain where it is. Do not propose a sibling folder outside the workspace
   or an extra projects container. Honor an explicit alternative location only when it is
   separate from other linked projects. For a requested subproject in an external linked
   folder, propose this brain-root destination before writing; follow
   [project structure](../gtm-os-project/references/structure.md).
   Never place project files in `brain/`, `work/`, `.git/`, `.codex/` or `.agents/`.
3. Inspect the absolute destination with `check_environment` or a read-only filesystem check.
   If a folder already exists, preserve it and offer to connect it through
   [Link Project](../gtm-os-project/SKILL.md), or choose a different name. An existing
   file, another brain or its contents cannot become this project. Do not overwrite or
   silently attach an existing folder in response to a creation request.
4. Obtain capture consent before writing. Combine the proposed location and consent in one
   native question when needed: "Create Website at <absolute-path> and save work from there
   in FDE OS's shared company knowledge?" Offer Create project / Cancel. Reuse consent already
   given for this project and location; do not ask a separate location question. A request
   for a folder alone is not capture consent. No or cancellation leaves the folder uncreated.
5. Handle starting context in the background. Call `query` (contexts) and select only relevant
   active contexts supported by the stated work; use an empty list when the purpose is unclear.
   Do not ask the person to select contexts, map projects to contexts, or learn those terms
   to create a project. Do not create a same-named context automatically. Later work can load
   relevant contexts as needed; memories still route by content across the shared brain.
6. Call `link_project` with `create: true`, the verified `brain`, absolute `path`, project
   `title`, `slug`, inferred `contexts` (possibly empty), and known `by` handle. This uses the
   existing registration mechanism but refuses an occupied destination. Do not run mkdir,
   copy a brain, scaffold an app, or write AGENTS.md yourself. On failure, inspect and report
   the conflict; never retry without `create: true` to bypass an existing-folder conflict.
7. Report the created project and the result of the shared
   [opening step](../gtm-os-project/references/open.md); do not launch twice. When
   sidebar visibility is unverified, always give the exact manual steps with this folder's
   actual path. The person starts a new task there; do not submit a prompt or start work in
   another task. Say "Created Website inside FDE OS. Work here uses your shared company
   knowledge" for an internal project, then the opening result. Do not call it an external
   project, list context slugs, or explain the ontology during this flow.

Creating a folder alone does not authorize capturing its work. A No or cancellation before
linking leaves the folder uncreated. Memories stay in the existing brain, tagged with this
project; there are no per-project brains or summaries.

## Link, repair, unlink or list


Use the person's saved conversation language. Keep authored brain data in English.
Follow [question handling](../gtm-os-start/references/questions.md) for `configuration_question`
and its fallbacks. Reuse submitted answers; never link without a yes to capturing work.

## Link an existing folder

Follow [project structure](references/structure.md): one working project per linked folder.
For a hierarchy of new projects, propose separate folders inside the existing GTM OS workspace.

Use the folder the person named, or the current working folder. Verify it with
`check_environment`. If the current folder is the brain, ask which existing working folder
should be linked; the brain itself is never a project. If the folder does not exist, explain
that [New Project](../gtm-os-project/SKILL.md) creates one, and follow it if creation was
requested. Do not silently create a folder during an existing-folder link.

If it already has a valid project pointer, report the current connection and stop unless the
person asked to change it. For a broken pointer, verify the intended brain before repairing.
Continue with the [shared linking steps](references/link.md), using the selected folder
throughout, including when this task is opened in the brain.

## Unlink or list

For "list projects", call `query` (projects) with the resolved brain; if the brain is unknown,
use `query` (brains) and ask the person to choose. Give one line per project.

For "unlink project X", resolve the brain and project, then confirm: "Unlink X? Its notes
keep their tag; only the link goes." After submission call `unlink_project`. Never remove a
pointer by hand. A folder can belong to one brain at a time; changing a valid connection goes
through unlinking before linking the intended brain.

The former /gtm-os-project command meant this workflow; direct people to /gtm-os-project.

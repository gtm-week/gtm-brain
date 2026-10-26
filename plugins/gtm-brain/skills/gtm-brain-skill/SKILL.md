---
name: gtm-brain-skill
description: |
  Your own skills: turn a repeated workflow into a Codex skill kept in this brain, install one
  from a GitHub path, list, remove or share them. Triggers: "/gtm-brain-skill", "make this a
  skill", "add a skill", "turn what we just did into a skill", "install the sales skill from
  GitHub", "list my skills", "remove the skill", "share this skill".
allowed-tools: [Bash, Read]
---

# GTM Brain: Your skills

A skill of your own is a folder in this brain's `.agents/skills/`, named `gtm-brain-<name>`. Codex
shows it as `/gtm-brain-<name>` once the app is quit and reopened, it is committed with the brain and reaches
teammates who share it, and no GTM Brain update touches it. Everything goes through the `skill`
tool; never write skill files by hand and never use Codex's own skill creator inside a brain.

Use the person's saved conversation language. Skill descriptions stay in English.
Follow [question handling](../gtm-brain-start/references/questions.md) for native questions.

## Make a skill

1. Draft. When the request follows something this chat just did more than once (the same
   connector steps, the same document shape), draft from those steps: a title, one English
   sentence of at most 200 characters saying what it does and when it applies, and the steps
   another chat should follow. Otherwise ask one `question`: what the skill does, when it
   should apply, which connected tool it uses, and what it produces and where that lands
   (memories, a guideline, a draft in the project folder).
   Write the body by [authoring](references/authoring.md).

   When the ask names a repeated action ("make a skill for "move deal" in attio", usually from the
   health check), draft from the recent notes that carry that action: read them with `query` (`sql`
   over memories whose actions name that tool and action; `describe_object` shows the columns), and
   take the steps, the inputs that changed between them and the connector. Then confirm the draft
   as for any other skill.
2. Confirm. One `question` shows the draft: the name (`gtm-brain-<slug>`), the description and
   the first line of the steps, with "Create it" first and "Change something" second. Nothing
   is written before that answer.
3. Call `skill` with `action: create`, `title`, `description`, `body` and the person's `by`.
4. Report in one line: the command it answers to and that it appears after Codex is quit and reopened (a new chat alone is not enough). When the
   tool names a linked project it could not link, say which and why.

## List, remove, install, share

- "list my skills": `skill` with `action: list`. The answer has three groups, keep them and
  their one-line meaning: shipped with GTM Brain (come with the plugin, not theirs to edit);
  yours, in this brain (travel with the brain, teammates get them); Codex's own, on this
  machine (`~/.agents/skills`, theirs alone, GTM Brain never sees or updates them). When asked
  to make a skill inside a brain, say in one line that it is the second kind and why.
- "remove the skill X": confirm with one `question` ("Remove /gtm-brain-x? Its folder goes; notes
  stay."), then `action: remove` with `id`.
- "install ... from GitHub": read [install and share](references/install-share.md).
- "share this skill": the same reference; nothing leaves the machine from here.

A repeated multi-step piece of work is the moment to offer this skill, once, by name (rule 7b).

# Install and share

## Install from GitHub

`skill` with `action: install`, `repo` as `owner/repo`, `path` as the skill folder inside the
repo (for example `skills/gtm-os-sales`), optional `ref` (default `main`) and optional `title`.
Private repos work when the person's git credentials or `GITHUB_TOKEN` reach them; on an auth
error say so and stop, do not retry with another method. The installed skill is renamed under
`gtm-os-` when needed, gets the GTM OS header, is validated like a created one, and is committed.

## Share

- To a teammate on the same brain: nothing to do, the commit already carries it.
- To someone else: give the folder path (`<brain>/.agents/skills/gtm-os-<name>`) to send, or,
  when the person keeps it in a GitHub repo, the sentence the other person types in their
  brain: "install the skill <owner>/<repo> at <path>". Publishing to a repo is the person's
  own git, not this skill.
- A skill everyone should get is a change to GTM OS itself: point the person at the GTM OS
  repository.

## Turning a skill off

A skill that stays in the brain but should not be listed in this person's chats: an entry in
`~/.codex/config.toml`:

    [[skills.config]]
    path = "<brain>/.agents/skills/gtm-os-<name>"
    enabled = false

Say this only when asked how to hide one; removing is the usual answer.

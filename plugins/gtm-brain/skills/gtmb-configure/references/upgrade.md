# GTM Brain: Upgrade

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.


> For humans: when a later plugin release brings new rules or a better pre-commit hook, this refreshes
> your existing brain. You keep your data and preferences; onboarding is not repeated.

New participants start with the current format and need no initial migration. Existing
legacy identity migration remains available for development brains: names.md and entities.md
become permanent Markdown files under brain/entities/, with originals backed up in
work/entity-migration/. It never rewrites admin.md, contexts or memories.

Call the GTM Brain tool `upgrade_brain` with `brain` = this workspace folder. No shell command.

If it answers "not upgraded yet", nothing was changed: the upgrade would change the brain's file
layout. For a brain from before 0.35 that is the move of its flat entity pages into a folder per
kind (layout 1 to 2). Say how many pages would move and which teammates must update first, as the
tool reports it, and ask one question: Yes, upgrade the layout / No, not now. Only on yes call
`upgrade_brain` again with `confirm: true`. On no, leave it: the flat brain keeps working. Never
pass `confirm` without that yes, after a plugin update on its own, or in a scheduled run.

For the owner the change can also be layout 3: the base files move into `about-us/` and `RULES.md`,
`SCHEMA.md` and `brain/admin.md` into `config/` (`rules.md`, `schema.md`, `settings.yaml`), word for
word, in one commit. Say what the tool lists as moving and that teammates on an older GTM Brain
will not find the brain until they update, then ask the same one question. A teammate who is not
the owner is never asked about it.

Order matters: everyone on the team updates GTM Brain before the owner's yes. A teammate still on
0.34 is not warned by their plugin: after the first move it no longer finds the entity pages, and
after the second it no longer finds the brain. When the tool names teammates, say that they update
first and offer to wait. The plugin's MANUAL.md, "Updating to 0.35", has the order, what each
person sees, how to go back (`git revert` of the move's commit) and what to do when something
looks wrong; answer "how do I update?" from it.

The refresh recognizes current rules and every shipped template in
`templates/legacy/manifest.json`, including skipped releases. Before replacing files it
validates editable entity files and saves previous instructions under `work/upgrades/before-*`. Company data and
personal preferences keep their existing format; no setup or context reseeding is needed.

Its report starts with a `why` line: what the newer rules change since this brain's version.
Pass that on in plain words, the reason that matters most to this person first. An offer to
refresh always says why the same way; never offer it as a bare "your rules are old".

If the tool reports local edits or an unrecognized older template, it has replaced nothing.
It leaves a proposed rules file alongside the backup. Explain that custom instructions were
preserved and show the proposed differences for review. Do not replace the file wholesale,
claim the refresh completed, or repeatedly retry the same upgrade. A custom rules merge is
separate work: retain the person's local guidance and resolve conflicts explicitly.

If an entity file needs repair, report its exact path and proposed fix. Its validation runs
before replacing rules or hooks. Preserve the file and resolve the reported problem before
retrying. A completed refresh can be repeated safely; it does not reseed contexts or reset
onboarding, personal language, loaded contexts, projects or tool choices.

Report which files changed (it lists them). If `AGENTS.md` changed, say so in one line: the
rules for this brain are now the current ones.

## Hard rules

- Refresh only `AGENTS.md`, `.githooks/pre-commit`, `.gitignore`, plus local upgrade backups.
  The identity migration described above is the only change inside the brain directory;
  memories remain byte-for-byte unchanged.
- The company name in `AGENTS.md` comes from `brain/admin.md`.

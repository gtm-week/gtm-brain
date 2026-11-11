# {{COMPANY}} brain

Made with GTM Brain. This page says what goes where. Codex follows the same rules, so a file is
always in one of the places below.

## What goes where

[WHERE.md](WHERE.md) says where every file goes. Codex reads it at the start of every chat and
follows it; edit its rows to change where things land. Projects (an event, a campaign, a client)
live in `projects/`, each in one folder with everything made for it. Processes that run over
time, with steps, are in `workflows/`.

`strategy.md` is here from day one, waiting for `run the strategic intake`. A file with no owner
is not stored: Codex asks what it belongs to.

## How we name people

Every note says who it is about. Codex matches each name by four fixed rules, and the person's page
in `brain/entities/` shows which rule matched each spelling, when, and from which source and project.

- **P1** A name, alias or email that belongs to exactly one known person, company or product is that one.
- **P2** A first name alone ("Max") means a known person only when exactly one known person has that
  first name; otherwise Codex asks which one.
- **P3** A first name alone is never saved as a new person: Codex asks for the full name.
- **P4** A name that looks like a known one is never merged on a guess: Codex asks "same as X?" first.

Ask "who is Max?" and the answer names the rule, the note and where it came from.

## Inside `brain/`

- `contexts/<topic>/memories.jsonl`: every note, one per line, never edited. Corrections are new notes.
- `contexts/<topic>/context.md`: the summary of those notes, rewritten by Codex.
- `entities/`: who and what the notes are about. One file each, shared by every topic and project.
- `admin.md`: the company profile. Protected.
- `ontology.ossie.json`: actions your own tools can run. Protected.

A project is not a separate memory. Its notes go into the same contexts, tagged with the project,
so people and companies stay shared.

## Not yours to edit

- `AGENTS.md`, `CLAUDE.md`: the rules Codex and Claude follow in this folder.
- `work/`: this computer's working files: the dashboard, logs and search index, plus the projects
  linked here and the backups from upgrades. Not in git: deleting it unlinks those projects and removes the backups.
  Never the place for a deliverable; leave it alone.

Nothing else belongs at this level: a `company/` or `assets/` folder is a container nobody reads.
Did it happen? Say it in the chat; Codex notes it.

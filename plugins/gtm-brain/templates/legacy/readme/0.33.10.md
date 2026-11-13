# {{COMPANY}} brain

Made with GTM Brain. This page says what goes where. Codex follows the same rules, so a file is
always in one of the places below.

Ask Codex here how the brain works, what it cannot do or how to change something: it answers
from GTM Brain's manual.

## What goes where

[RULES.md](RULES.md) is this brain's own rules, and yours to edit. Codex reads it at the start of
every chat and follows it over its defaults:

- **Where things go**: a table of where every file goes; edit its rows to change where things land.
- **Our rules**: your own rules for what Codex saves and asks ("always ask before tagging a
  client", "notes about pricing go to Our offer"), one line each. Codex offers to add one when you
  correct how something was saved.

Projects (an event, a campaign, a client) live in `projects/`, each in one folder with everything
made for it. Processes that run over time, with steps, are in `workflows/`.

Ask "why is this here?" about any file or folder: Codex answers with the RULES.md row and the
reason it recorded when the file was kept, who put it there and when. A file that arrived without
one is named at the start of the next chat, so nothing stays unexplained.

Four documents are here from day one: `strategy.md`, `icp.md` (who we sell to), `voice.md` (how
we sound) and `design-system.md` (how we look). Codex reads them before every email, post,
design and plan. Each starts empty: say "fill in our tone of voice" (or the ICP, the strategy,
the design system) and Codex drafts it with you. A file with no owner is not stored: Codex asks
what it belongs to.

## How we name people

Every note says who it is about. Codex matches each name by four fixed rules, and the person's page
in `brain/entities/` shows which rule matched each spelling, when, and from which source and project.

- **P1** A name, alias or email that belongs to exactly one known person, company or product is that one.
- **P2** A first name alone ("Max") means a known person only when exactly one known person has that
  first name; otherwise Codex asks which one.
- **P3** A first name alone is never saved as a new person: Codex asks for the full name.
- **P4** A name that looks like a known one is never merged on a guess: Codex asks "same as X?" first. The same first name with a different surname is someone else.

Ask "who is Max?" and the answer names the rule, the note and where it came from.

## How contexts work

A context is one lasting topic (the company, target customers, the offer, a key account) with its
own notes and a summary of them. Three rules for making one:

- **X1** A project is not a context: it is a folder in `projects/` and a tag on notes. Notes about a
  project go in the context their meaning fits, tagged with the project.
- **X2** Codex offers a new context when lasting work starts that no context covers (a new
  website or product project, a theme across several notes), and creates it only after you say yes.
- **X3** Never two contexts for one topic: a name like an existing or archived context gets
  "same as X?" first.

Three rules for loading one:

- **L1** `brain/admin.md` is always loaded. Other contexts load when you ask or when the work plainly
  fits, and stay loaded for this folder's next chat.
- **L2** Loading puts a context's summary and standing rule into the chat. Answers search the notes
  of every context, loaded or not.
- **L3** A note is saved in the context its meaning fits, whatever is loaded.

Each summary is 2-4 sentences, every sentence resting on named notes (kept in `summary_sources`),
with real dates only. It is rewritten 2 minutes after the last saved note; Codex says "out of
date" with the date when it falls more than 2 days behind.

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

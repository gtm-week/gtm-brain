# {{COMPANY}} brain

Made with GTM Brain. This page says what goes where. Codex follows the same rules, so a file is
always in one of the places below.

## What goes where

| You have | It goes in | Who writes it |
| --- | --- | --- |
| Something the work must follow: strategy, tone of voice, pricing, design system | `<name>.md` at this level, e.g. `pricing.md` | you, or Codex when you ask |
| A file for that document: a deck, a slide template, an Excel | a folder of the same name, e.g. `pricing/pricing.md` with `pricing/model.xlsx` | Codex moves the document into the folder when the first file arrives |
| A process that runs over time, with steps | `workflows/` | two drafts come with GTM Brain; edit them freely |
| One piece of work with deliverables (a website, an event) | its own folder, linked with `/gtm-brain-project` | you |
| Something that happened: a meeting, a call, a decision, a finding | `brain/contexts/<topic>/` | Codex, when you say it in the chat |
| A person, company or product | `brain/entities/<id>.md`, its files (a logo, a photo) in `brain/entities/<id>/` | Codex; you can edit the text |
| Company profile: name, team, tools | `brain/admin.md` | Codex proposes, you type APPROVE |
| Your own Codex skills | `.agents/skills/` | you or Codex |

`strategy.md` is here from day one, waiting for `run the strategic intake`. A file with no owner
is not stored: Codex asks what it belongs to.

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
- `work/`: this computer's scratch: the dashboard, logs, the search index. Not in git, rebuilt
  when needed, safe to delete.

Nothing else belongs at this level: a `company/` or `assets/` folder is a container nobody reads.
Did it happen? Say it in the chat; Codex notes it.

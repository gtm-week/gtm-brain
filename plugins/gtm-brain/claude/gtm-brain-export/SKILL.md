---
name: gtm-brain-export
description: |
  Export the company context this assistant already holds (global instructions, memory,
  what the current conversation knows) into a handoff file that GTM Brain in Codex imports.
  Triggers: "export my company context", "hand off to gtm os", "prepare the gtm os import",
  or a GTM Brain onboarding run that detected Claude on this machine and asked for the export.
  The body of this file is IMPORT.md at the repository root, word for word.
---

You are an AI assistant (Claude Code, Cursor, Gemini, Codex in another project, any
other) that a person has pointed at this file and asked to hand what you know about
their company to GTM Brain, the company brain they run in Codex. Read this file only;
nothing else in this repository matters to you. Run everything yourself and speak in
plain words. Nothing leaves the machine: you write one file, GTM Brain reads it later.

> For humans: you set up GTM Brain, and the assistant you were using before already knows
> things about your company: who you are, what you sell, your tools, the people, the
> deals in motion. This collects that into one file you review, so GTM Brain does not ask
> what your old assistant could have answered. Then, back in the GTM Brain chat, say
> "import from claude" (or "import the handoff").

## What to gather (read-only)

Look only in your own memory and the files you are allowed to read; never in another
assistant's folders. In order:

- Your global instructions file (for Claude Code `~/.claude/CLAUDE.md`; for other
  assistants their equivalent): who the person is, standing preferences, tools they name.
- Your memory (for Claude Code every `~/.claude/projects/*/memory/` folder: `MEMORY.md`
  plus the files it indexes; for other assistants their memory store). Company facts,
  projects, people, tools. Skip code conventions and anything about a codebase.
- Instructions files in projects you can see from the current folder (`CLAUDE.md`,
  `AGENTS.md`, `GEMINI.md`, `.cursorrules`) when they describe a business, not code.
- What the current conversation established, if anything.

Never take the person's name or email from git or GitHub: a machine's git identity is
often a noreply or personal address. If a name is not in your memory, leave the section
out; GTM Brain asks the person directly.

## What never goes in

- Credentials, tokens, API keys, `.env` contents, anything that smells like a secret.
- Personal, non-work content: health, family, finances, other companies the person only
  mentioned in passing.
- Verbatim dumps of conversations or memory files. Summarized facts only, one line each,
  each with its source.

## The file

Write `~/.gtm-brain/handoff.md` (create the folder; the older name `claude-export.md` in
the same folder is still read). Markdown with frontmatter, sections in this order, one
fact per line, every line ending with its source in parentheses, plain hyphens only, no
long dashes:

```markdown
---
exported: <ISO timestamp>
by: <your name, e.g. claude-code, cursor, gemini>
confirmed: true | false
sources: [global instructions, memory (3 files), conversation]
---

# Company context handoff for GTM Brain

Facts below are hypotheses for GTM Brain to confirm with the person, never truth.

## Who
- Marta Nowak <marta@reflow.io> (global instructions)

## Company
- Reflow, reflow.io: returns automation for EU retailers (global instructions)

## Tools observed
- HubSpot is the CRM of record (memory: crm-notes.md)

## People
- Tomek Zielinski, co-founder, handles engineering (memory: team.md)

## Work in motion
- Bergstrom deal in negotiation since August (memory: pipeline-notes.md)

## Rules and preferences
- Never offer a discount in the first call (memory: sales-rules.md)
```

Omit empty sections. If you find nothing company-shaped at all, write the file with the
frontmatter and one line saying so; an honest empty export beats a padded one.

## Consent

Interactive session: show the draft in the chat first, let the person strike lines, then
write with `confirmed: true`. Headless run (no person to ask): write without showing and
set `confirmed: false`, so GTM Brain walks the person through it before trusting a line.

After writing, say where the file is and what happens next: in the GTM Brain chat in Codex
they say "import from claude"; GTM Brain also notices the file by itself at the start of the
next chat. They can delete the file at any time if they change their mind.

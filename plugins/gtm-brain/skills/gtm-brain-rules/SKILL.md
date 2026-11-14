---
name: gtm-brain-rules
description: |
  The brain's own rules, in RULES.md at the top of the brain: show them, add one, change one or
  remove one. Two kinds: where files go (the "Where things go" table) and what Codex saves and
  asks (the "Our rules" lines). Triggers: "/gtm-brain-rules", "rules", "show my rules",
  "add a rule", "from now on ...", "always ask before ...", "change where X goes",
  "remove that rule", "what are our rules".
allowed-tools: [Bash, Read]
---

# GTM Brain: Rules

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: RULES.md is yours. This shows what it says and changes it in your words, so you
> never have to edit the table by hand.

## Step 1: read

Call `query` (status) first: a chat's first GTM Brain call runs the chat start, which writes
RULES.md when it is missing and merges an older WHERE.md into it. Then read `RULES.md` at the
brain root. It has three sections:

- `## Where things go`: a table, `| What | Where |`, one row per kind of file. The chat start
  numbers the rows, and saves cite them ("RULES.md row 5").
- `## Ask the source`: a table, `| Question about | Ask | Brain answer is good for |`: which tool
  knows better than a saved note (CRM, calendar, email, a tool by name, or the brain) and how old
  a note may be ("1 day", "2 weeks", "always ask", "no limit"). A row applies only when its tool
  is connected. A file without this section (edited before 0.35.0) follows the shipped rows; when
  showing the rules, say so and offer to add the section with those rows.
- `## Our rules`: one line per rule for what Codex saves and asks, in the person's words. They
  come after the shared saving rules and win where they differ (R1).

## Step 2: show or change

**Show** ("what are our rules"): list the table rows numbered, then the Our rules lines. Say in
one line that the person can add, change or remove any of them. Nothing else.

**Add** ("from now on, pricing notes go to Our offer", "speaker graphics go in speakers/"):
- About where a file goes: a new table row, or a change to the row that already covers it.
  Look first; never two rows for one kind of file.
- About which tool answers a question, or how old a note may be ("check HubSpot for deal
  stage", "event registrations: ask Luma"): a row in `## Ask the source`, or a change to the
  row that covers it.
- About what Codex saves or asks: one line at the end of `## Our rules`.
- Use the person's own words. When the sentence is plain, write it without asking. When it is
  unclear which row, which context or which kind of rule it is, ask once (Q1, Q2), with the
  exact line you would write as the first option.

**Change or remove**: find the row or line they mean. With more than one candidate, ask which,
quoting each. Removing a table row renumbers the rows after it; say so in one clause.

Edit `RULES.md` with the shell, keeping its shape: each table stays one block of `|` lines
directly under its header, and `## Our rules` stays the last section. Never touch the shipped
intro text above a section unless the person asks.

## Step 3: keep it

Call `save` with a message naming the change ("RULES.md: pricing notes go to Our offer"). Then
say in one line what changed and that it applies from the next chat; in this chat, follow it
already.

After a change to the table, files already in the brain stay where they are. Offer once to check
them against the new row: `query` with object `rules`.

## Limits

- A rule cannot switch off what keeps the brain safe: APPROVE for workplace and interaction
  changes, the protected files (`brain/admin.md`, `memories.jsonl`, the ontology), never
  guessing a name or a date the person did not give (W1). When a requested rule would do that,
  say which safeguard it meets, in one line, and offer the nearest rule that keeps it.
- Rules are the brain's, shared with the team through git. A preference for one person alone
  ("I like short answers") belongs in their own Codex settings, not here: say so.
- Never move, rename or delete files as part of a rule change without asking.

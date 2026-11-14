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
  come after the shared saving rules and win where they differ (R1). A rule may have a tag line
  directly under it that says what it is for:

  ```
  Never call a company a customer before a signed contract.
  > applies to: organization · when: saving customer status · check
  ```

  `applies to`: a kind from SCHEMA.md (or an organization subtype), `link <type>` for a
  relationship type, or `general`. `when`: saving, drafting or reading, optionally with a field or
  status. Then `check` or `guidance`. A filed rule is shown only with the reply that needs it
  (a save, a brief, `query rules` before a draft); a `check` rule the brain can read refuses a
  save that breaks it, quoting the rule. A rule without a tag line is "not filed yet".

## Step 2: show or change

**Show** ("what are our rules"): list the table rows numbered, then the Our rules lines. Say in
one line that the person can add, change or remove any of them. Nothing else. For the rules of
one kind, link or entity: `query` with object `rules` and search `organization`, `link partner_of`
or the name (filters.when: saving, drafting or reading).

**File** (after `query` with object `rules` lists Our rules lines "not filed yet", or right after
adding one): for each, one question with the proposed tag line quoted from the report as the
first option: 1. Yes, file it 2. Keep it general 3. Change it. When the proposal is a `check`,
say in the question what it would refuse (the report gives the clause). On yes, write that tag line on
the line directly under the rule, exactly as proposed or as the person changed it, and nothing
else in the file. Never write a tag line without their yes; a rule nobody can scope stays general.
A tag line the report says cannot be read: offer its fix the same way.

**Starts work** ("whenever a company becomes a customer, send the welcome pack"): a rule never
starts work. The report offers it as a one-step workflow with its title and body; ask
1. Make it a workflow 2. Keep it as a rule. On 1: `workflow` with action create, the title,
applies_to and body from the report, then remove the line from Our rules and save. On 2: write
the guidance tag line the report gives under it and save; a line with a tag line is a rule and is
not offered again. When the person adds such a sentence, make the same offer instead of adding it.

**Add** ("from now on, pricing notes go to Our offer", "speaker graphics go in speakers/"):
- About where a file goes: a new table row, or a change to the row that already covers it.
  Look first; never two rows for one kind of file.
- About which tool answers a question, or how old a note may be ("check HubSpot for deal
  stage", "event registrations: ask Luma"): a row in `## Ask the source`, or a change to the
  row that covers it.
- About what Codex saves or asks: one line at the end of `## Our rules`, then file it (below)
  in the same turn: one question with the proposed tag line (`query` with object `rules` shows it).
- Use the person's own words. When the sentence is plain, write it without asking. When it is
  unclear which row, which context or which kind of rule it is, ask once (Q1, Q2), with the
  exact line you would write as the first option.

**Change or remove**: find the row or line they mean; a rule's tag line goes with it. With more than one candidate, ask which,
quoting each. Removing a table row renumbers the rows after it; say so in one clause.

Edit `RULES.md` with the shell, keeping its shape: each table stays one block of `|` lines
directly under its header, `## Our rules` stays the last section, and a tag line stays directly
under its rule (a teammate on an older GTM Brain reads it as a quote line; nothing breaks). Never touch the shipped
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
- What the brain checks by itself (tagged `check`): a quoted word that must not appear in a note
  or a draft (Never use "cheap"), a status only before, without or until a fact ("Never call a
  company a customer before a signed contract"), a note never without a source (on a topic when
  the rule names one: "Never record a deal size without a source"), and a SCHEMA.md field always
  included ("Always include the role when saving a person"). Any other rule tagged
  `check` is shown as guidance, and the rules check says so.

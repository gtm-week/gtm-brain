# GTM OS: Import a handoff

Keep authored brain content in English.

> For humans: your previous assistant wrote one file with what it knew about your company.
> This walks you through it, line by line if it was never reviewed, and files what you
> confirm into the brain with "handoff" as the source. Nothing in it is trusted until you say so.

## Step 1: find the file

Read `~/.gtm-os/handoff.md`; if absent, `~/.gtm-os/claude-export.md` (the older name). No
file: say so in one line and give the person the paste sentence for their other assistant:

> Read https://github.com/gtm-week/gtm-os/blob/main/IMPORT.md and follow it
> exactly. Read nothing else in that repository.

Then stop; do not look anywhere else for what another assistant knows (`.claude` and the
other assistants' folders are off limits, reads included; the gate denies them).

## Step 2: review with the person

- `confirmed: true`: show the facts grouped by section, in plain words, and ask once which
  lines are wrong ("Looks right" / "Some lines are wrong", free text names them).
- `confirmed: false` (a headless export nobody reviewed): walk through it section by
  section, a few lines at a time, with structured choices per section (keep all, drop some,
  drop the section). Never file a line the person has not seen.

Facts already in the brain (the same person, company, tool) are skipped and said so in
one line; the handoff adds, it never overwrites. A fact that contradicts the brain is
shown as a question: "the handoff says Attio is the CRM; the workplace info says HubSpot.
Which is right?"

## Step 3: file what was confirmed

- **Who, Company, Tools observed, People that are teammates**: workplace facts. Propose one
  `admin.md` change through the gtm-os-configure workplace-change procedure (the person
  types APPROVE in Codex). Tools named there are then checked
  by the gtm-os-configure skill; a CRM named here counts as the CRM.
- **People outside the company, companies, products**: entities, through `add_name` (kind,
  aliases, email when given).
- **Work in motion, Rules and preferences**: notes, one `remember` batch, each entry in the
  context that fits (#company for the business, #pipeline for deals when it exists, the
  personal context for the person's own preferences), `sources` = `handoff:<by>` (the
  frontmatter's `by`, e.g. `handoff:claude-code`), `via` = human. A rule that should govern
  a context goes into that context's rule with the gtm-os-use-brain skill, not a note.
- Nothing from the handoff enters a summary as truth; the background run reads the notes
  like any others.

## Step 4: close

One line: what was filed where, what was skipped, and that the file can be deleted
(`~/.gtm-os/handoff.md`; offer to delete it, do it on a yes). Record one note in #company:
`Imported the handoff from <by> on YYYY-MM-DD: N facts filed, M skipped.` so the hook stops
mentioning it.

## Hard rules

- Every filed fact cites `handoff:<by>`; no fact is filed unseen.
- The workplace info changes only through APPROVE.
- Never read another assistant's own folders; the handoff file is the only import path.
- Plain hyphens only in anything written.

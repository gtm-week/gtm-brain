---
name: gtmb-housekeeping
description: |
  Tidy names and gaps, one at a time: people known by a first name only, names that may be the
  same person or company, required details nobody stated, files and folders out of place. Each
  item comes with its evidence and one question; nothing changes until the person answers.
  Triggers: "/gtmb-housekeeping", "let's do housekeeping", "tidy the brain", "clean up the
  names", "clean up the duplicates". Not what the person owes other people (gtmb-todo).
allowed-tools: [Bash, Read]
---

# GTM Brain: Housekeeping

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: the brain lists what it could not settle by itself and asks you about one thing
> at a time. Stop whenever you like; the rest waits.

## What to do

1. Call `query` with object `housekeeping`. One call returns the work list in three groups with
   their counts (first names only, names that may be the same, other findings) and, for the
   first items of each group, the evidence needed to ask: no other read first.
2. Say the three counts in one line, then take the first item only.
3. Ask one question about it with two or three concrete choices, the evidence in a line or two
   (the notes that mention the name, both cards of a pair). The person can always answer in
   their own words.
4. Do what the answer says with the tool calls the list names for that item (a full name, a
   merge, two names kept apart, a field's value). A skipped or closed question changes nothing.
5. One line on what changed, then the next item. `filters.offset` returns the next items of a
   group; `search` with `first names`, `same names` or `other` returns one group.

Stop when the person says so or the list is empty, with one line: what was settled and how many
items are left.

## Hard rules

- One item at a time, with the person. Never settle a batch on one answer.
- Nothing about a person or company is looked up on the web here.
- Never guess a surname or merge two names without the person's answer.
- A change to company settings or interactions still goes through APPROVE.

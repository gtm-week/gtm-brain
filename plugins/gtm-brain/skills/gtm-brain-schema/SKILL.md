---
name: gtm-brain-schema
description: |
  What the brain keeps, in SCHEMA.md at the top of the brain: the fields for each person,
  organization and product, the organization subtypes, and the relationship types. Show it,
  add one, rename one or remove one. Triggers: "/gtm-brain-schema", "schema", "what do we keep
  about people", "every company must have a budget owner", "add a field", "rename the field",
  "add a relationship type", "investors are a subtype". Not the saving and filing rules
  (gtm-brain-rules).
allowed-tools: [Bash, Read]
---

# GTM Brain: Schema

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: SCHEMA.md says what the brain keeps about each person, company and product, and
> how they relate. Codex fills the fields from your notes, with citations, and asks about the
> required ones nobody has said. This shows it and changes it in your words.

## Step 1: read

Call `query` (status) first: a chat's first GTM Brain call runs the chat start, which writes
SCHEMA.md when it is missing and reports one that cannot be read, with a fix per line. Then read
`SCHEMA.md` at the brain root:

- `## Person`, `## Organization`, `## Product`: a table each, `| Field | What it means | Required |`.
- Under Organization, `### Subtypes` (`| Subtype | What it is |`) and a `### <subtype>` field table
  for a subtype with fields of its own.
- `## Relationships`: `| Type | From | To | What it means | Required |`, and a `Was called` column
  once a type has been renamed. `us` is our own company. `customer_of` is the customer status.

When the chat start said SCHEMA.md cannot be read, show its fix and offer to apply it before
anything else.

## Step 2: show or change

One change per request, in the person's words.

**Show** ("what do we keep about people"): per kind, its fields (required marked), then the
subtypes, then the relationship types with from and to. One line that any of them can be added,
renamed or removed. Nothing else.

**Add**:
- A field ("every company must have a budget owner"): a row in that kind's table, or in the
  subtype's table when it is for one subtype. Name: lowercase words joined by `_`
  (`budget_owner`). What it means: the person's words. Required: yes when they said must,
  always, every; no otherwise.
- A subtype ("investors are a subtype"): a row under `### Subtypes`; fields of its own go in a
  `### <subtype>` table.
- A relationship type ("track who introduced whom"): a row with from and to kinds (any kind in
  the file; `us` as a target), what it means, required.
- A kind ("track venues"): a `## <Kind>` section with a field table, one lowercase word or words
  joined by `_`. Add it only when no existing kind or organization subtype fits.
- Look first: never two rows for one thing. When it is unclear which kind, subtype or whether it
  is a field or a relationship, ask once (Q1, Q2), the exact row you would write as the first
  option.

**Rename**:
- A field or a subtype: edit the row. Briefs refill at the next compile. For a subtype, offer
  once to move the organizations that have the old one: `update_entity` with `set.subtype`, one
  call each, only after a yes.
- A relationship type: edit the type and put the old name in `Was called` (add that column,
  `| Was called |`, the first time), so older notes keep counting.

**Remove**: quote the row, then remove it. Old notes and briefs stay; a removed relationship
type's notes show as not in SCHEMA.md in `query` relations.

Edit `SCHEMA.md` with the shell and keep its shape: each table directly under its heading, its
header and separator lines as they are. Never touch the intro text unless the person asks.

## Step 3: keep it

Call `save` with a message naming the change ("SCHEMA.md: every company has a budget owner").
Then one line: what changed, and that briefs of that kind refill in the background. In this chat,
follow it already. After a new required field, offer once to see who is missing it: `query` with
object `rules` (its SCHEMA.md findings).

## Limits

- Person, organization, product, event and tool always exist. Meeting and project cannot be
  kinds: meeting notes stay in their context and a project is a tag. Company and team are
  organization subtypes. Say so in one line and offer the nearest thing.
- Do not remove a kind's section while entities of that kind exist: their files stop reading
  until the section is back.
- Subtypes exist only on organizations.
- `customer_of` stays: it is the customer status (the customer notes). It can be described, not
  removed or renamed.
- Identity is not a field: emails, aliases and external records are kept with `add_name`.
- Never invent values for a new field. Values come from notes, with citations.
- SCHEMA.md is the team's, shared through git. A wish for one person alone is not a schema change.

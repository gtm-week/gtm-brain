# Relationships

How a relationship between two entities is saved, corrected and read. The types come from
`SCHEMA.md` at the brain root (its `## Relationships` table); the chat start lists them. The
person changes them with `/gtm-brain-schema`.

## Save one

A relationship is a note with a `relation` block on `remember`. The two ends and the type are
enough:

```json
{ "content": "Anna Lee is Head of Sales at Northwind since 2026-09.",
  "people": ["Anna Lee"], "companies": ["Northwind"],
  "relation": { "from": "Anna Lee", "type": "works_at", "to": "Northwind" } }
```

The save fills `status` (ended when the note says so about the other end: left, no longer,
churned, ended, former, previously, used to, quit, resigned; else current. "Anna left Northwind
and joined Acme" with `to: Acme` is current, and ends Northwind by itself), `observed_at` (now;
pass a date such as `"2026-09-01"` when the person said when) and
`basis` (`source` when the note cites a record outside the chat, else `user` with the author as
its source). Pass them only to say something else.

- `type` is one listed in SCHEMA.md; `from` and `to` must be of the kinds its row names.
  `to` is `us` for our own company (partner_of, investor_in us).
- Both ends follow the name rules (P1-P4, C1). A new organization is also listed in
  `companies`, so it is saved as one.
- `basis: user` when the person said it, `source` when a tool or a document says it (with
  that source). `observed_at` dates the evidence; an event date in the past goes in the note
  text too ("since 2026-09").
- One at a time: where SCHEMA.md says so (works_at, reports_to), a new current one ends the
  previous one by itself; the reply says which. Never save the ended note yourself.
- Customer status is not a relation: use the `customer` block ([customers](customers.md)).
- A relationship type SCHEMA.md does not list: save the note without `relation`, then offer
  once to add the type with `/gtm-brain-schema`. Never invent a type in the block.

## It ended, or it was wrong

- It ended ("Northwind is no longer our partner since October"): a new note with the same
  from, type and to and `status: "ended"`. The current one stays as history; never retract it.
- It was wrong ("Anna never worked at Northwind"): a correction with `supersedes` (the right
  fact) or `retracts` (nothing replaces it), as for any note (F1, F2). From the chat it needs
  no `sources`. If the wrong note had ended an earlier link (one at a time), that end is
  withdrawn with it; the reply says so.
- A source never replaces or withdraws what the person said: record the disagreement as its
  own note with `basis: source`.

## Read

`query` with object `relations` lists every relationship with its current state, history and
disagreeing sources; `search` narrows it to one entity and adds its history (relationship
events, renames, merges, kind changes, newest first), `filters.type` to one type, `filters.at`
(a date) to the ones current then: "where did Anna work in June?" is one call. An entity's
brief shows its relationships under `## Relationships`, ended ones with their dates. A type
removed from SCHEMA.md stays readable, marked.

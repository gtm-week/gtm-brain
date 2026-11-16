# Find an entity without guessing identity

Use for a person or organization lookup, especially an unfamiliar spelling, an empty CRM
search or a suspected duplicate. Read saved identity with `query` (entities) first. Exact registered
names, aliases, emails and IDs can resolve a saved identity. Spelling suggestions are
candidates only. Read its cited brief with `query` when that answers the question.

## Choose the actual connector capability

Inspect the connected tool catalog and input schema. Tool names and supported fields vary
between installations. A filtered record list and a search endpoint are different capabilities.
Do not invent a tool, operator, permission or direct API access to fill a missing capability.

- **Attio:** prefer the exposed `search-records` equivalent for a name. Attio documents
  full-text MCP search and a fuzzy records search API across selected objects. A shorthand
  `name: value` filter is equality, not fuzzy search. Use the known record ID or exact email
  when supplied. Search results can lag updates; read the chosen record to verify current data.
- **HubSpot:** prefer the exposed text `query` over `EQ` for a name. Its search API supports
  default searchable text properties and `CONTAINS_TOKEN` with `*` for partial tokens. These
  are not a documented guarantee of typo tolerance. Restrict to contacts or companies as
  appropriate. Use property names and wildcard syntax only when the tool schema supports them.
- **Other CRMs:** follow their exposed search semantics, using fuzzy/full-text search where
  available. Do not describe an equality-only connector as typo tolerant.

## Recover from a miss, within the requested scope

For a name miss, try one useful fallback: a verified alias, the name without accents, an
unchanged surname/first-name token, or a known company/domain filter. Never invent an email,
domain or corrected spelling as evidence. `Zientara` and `Ziętara` differ by both an accent
and an extra letter; accent removal alone does not solve ticket 152's example.

For an equality-only tool, inspect whether it offers a bounded list scoped by a known
organization or domain. Rank that returned shortlist by spelling, or pass up to 100 records
to `query` (entities) with `name` and `candidates`. Supply each record's exact `id`, `name`, known
`aliases`/`emails`, and `reference: {kind, ref}` from the source. The tool handles accents,
spacing, partial names and small edit distances, including adjacent transpositions. It does
not fetch candidates or prove identity. An empty shortlist remains empty.

Keep results bounded. Read a candidate record for distinguishing details such as email and
company, preserving its original link. A broad common-name page may be incomplete: follow
returned pagination only as needed, or narrow the search. Do not call a first page exhaustive.
Stop once the question is answered. Do not repeatedly send the same failed query, fetch every
CRM record, or sweep mail/calendar after a miss. A transient error is not a zero-result search.

**Stop after two empty CRM searches:** one primary search and at most one useful fallback
for a single-entity question. Switching from fuzzy search to equality with the same spelling
does not add evidence. Do not cycle through every spelling and operator. Explain the remaining
uncertainty instead. A new user correction or a result containing a relevant next-page cursor
can justify another read; two empty results cannot. Reuse briefs and records already read in
this turn, including empty results; do not read the same entity again under its name and ID.

## Resolve uncertainty before identity writes

Show plausible candidates with their original spellings, source links and distinguishing
details. Similarity scores order results; they are not probabilities. Two people can share a
name or mailbox, and two records from different accounts can share an ID. Preserve account
scope in their source references. Respect saved Different assertions and explicit corrections.

When the intended identity remains ambiguous, ask one native question with the candidates
and an unresolved choice. A search request grants no merge or alias authorization. Never
merge or add an alias after zero results, because the top result looks close, or because two
records share an email. Follow the explicit-confirmation and preview procedure in
[Entities](entities.md) when the person actually requests an identity change.

An absent CRM record does not make a person nonexistent. Accept a correction immediately and
look at the place the person points to. If another source would help, suggest a specific search
in a connector already tested successfully, such as the named email thread or customer roster.
Use saved connector status or customer-overview suggestions; do not scan those sources unless
the question needs them. Say what was checked and what remains unknown.

## Retain useful evidence and answer promptly

In ordinary company work, save new verified facts through `remember` in the existing relevant
context, with the exact source and evidence date. Link a confirmed entity, avoiding guessed
aliases. Respect read-only requests. Do not retain raw result pages, speculative identity
matches, or an empty search as a fact that someone does not exist. Repeated lookups use the
saved brief and source pointer; recheck only the external fact that needs current verification.

Provider references, checked 2026-09-13: [Attio MCP](https://docs.attio.com/mcp/overview),
[Attio fuzzy search](https://docs.attio.com/rest-api/endpoint-reference/records/search-records),
[Attio filters](https://docs.attio.com/rest-api/guides/filtering-and-sorting),
[HubSpot search](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm).
These document provider capabilities, not the tools installed in this particular session.

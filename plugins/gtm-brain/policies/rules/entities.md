---
title: People, companies and products (entities)
words: entity entities person people organization organisation company companies team product products name names alias aliases merge rename duplicate identity who registry kind subtype tool
attach: add_name update_entity merge_entities archive_entity undo_entity_merge
---
The identity registry and the readable briefs are the entity pages (`query` with object
entities lists them; the opening lines and a brief give each one's file). Create identities with
`add_name`; rename, replace and change metadata with `update_entity` by stable ID.
`merge_entities` with `confirmed: true` merges in one call once the person has said the two
are the same (without it: a preview); `archive_entity` and `undo_entity_merge` apply only
what the person asked for. Use `query` (entities) to resolve a name or ID, and `query` with object brief
and `search` = the name for its brief. Similarity is never identity confirmation, and zero
results never authorize merging. Facts stay in context memories; never erase identities or
history. Entity files are editable: preserve handwritten Markdown and propose a minimal repair
when parsing fails. A confirmed merge needs no procedure. A split or a CRM lookup has one in
gtm-brain-use-brain's references/entities.md and entity-search.md, read only for that work.

**Every company, product, team and person a note names is an entity (rule 2a).** Pass them all
in `people`, as written; use `add_name` with kind person, organization or product and an
optional organization subtype (company or team). A tool the team uses (Gmail, HubSpot, Granola)
goes in `tools`; when `SCHEMA.md` defines the kind tool, it may also be an entity of kind tool,
and never otherwise. Set the kind when clear, at once and without asking when the note makes it
plain (a company in a sales note). When `remember` answers "possibly entities, not recorded as
such", add the ones that are entities right away.

**A name that may already be known is never added on a guess (rule 2c).** When `remember`
answers that a name may be someone in the registry ("Pierre Dupont" when Pierre Aubert is
known), nothing was written yet: ask in one line, *"Is this the Pierre Aubert we know?"* Yes:
`add_name` with the new spelling as an alias, then `remember` again. No: `remember` again with
the name in `new_names`. Never merge two names or add a near-duplicate without the person's
word. A first name that belongs to exactly one known entity is taken as that one.

**Use the three formal objects: Context, Memory and Entity (rule 6).** Do not create parallel
identity stores or object kinds for customer status, deals, meetings or projects; supported
facts are memories linked to entities in the right context, and customer, partner, competitor
and employer are relationships supported by memories.

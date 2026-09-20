# GTM OS: Entities

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

Triggers: "who is Chris", "add alias", "Chris is Krzysztof Pawlak", "Nestle Poland is not
Nestle", "Telli is a company", "what entities do we have", "list the companies".


> For humans: one permanent, readable page for each person, organization or product.
> Identity is global; facts retain the contexts where they were learned.

The Markdown files in `brain/entities/` form the registry. Each has a stable ID, canonical
name, kind, aliases, emails, confirmed distinctions, external record references and identity
sources. The narrative is compiled from context memories: overview, per-context state,
open threads, relationships, the full memory timeline and source links. Facts are not authored
in the identity metadata. The registry stores the formal Entity object; facts remain supported by memories.

`query` (entities) resolves an exact name, alias, email or stable ID and gives the permanent file location.
Partial names and misspellings return ranked candidates with reasons, contact details and
source references. They never establish identity. For CRM lookups, bounded fallback searches
and ambiguous results, follow [entity search](entity-search.md). Optional `candidates` ranks
an already retrieved CRM shortlist without fetching or saving anything.
`query` (brief) with `search` = the name reads the brief; add `filters.context` for a focused perspective. Neither
loads additional contexts. For a refreshed synthesis follow [entity compilation](entity-compile.md).
The dashboard shows the same cited compilation and offers Markdown download. Stale prose
is hidden until refreshed; current dated evidence remains available.

The Entities page starts with the directory and no selected entity. Context tags on each
entity show where it appears in current notes; click a tag to open the evidence for that
context. The same tags appear in the deep dive, with the selected context highlighted.
Select a name there or under a context's About section to open its deep dive: identity, context relevance and
supporting notes, then the neighbor graph at the bottom. Back to entities returns to the
directory. The context selector scopes both the
graph and its evidence. A line means shared effective notes, not an inferred employer,
customer or other business relationship. Select the shared-note count to read the actual
interaction and follow its dated citation to the note and sources. Select a neighbor to
explore from that identity. Large neighborhoods are paged six at a time.

Relevance comes from the notes' entity tags or name/alias mentions. Show the excerpts that
explain the role in that context; do not turn a mention count into a claim of importance.
Summary-only references are labeled as unsupported by current notes. Withdrawn and replaced
notes do not create links, and withdrawal records explain missing evidence. The directory
still keeps their identities. Different prevents merging identities; it does not exclude
them from a context. No context exclusion is inferred from a missing link.

GTM OS tools, no shell command: `query` (entities) with `brain` = this workspace folder and no search lists everyone
(team members, contacts, organizations and products apart, with emails, where each one appears in
memories, and what is still missing); show that list as returned, then one line offering to complete a contact;
`query` (entities) with `search` resolves "Chris"; for an unregistered person, `add_name` with `name` "Krzysztof Pawlak", `aliases`
["Chris", "Pawlak"] and `email` adds or extends a person; `add_name` with `name` "Telli",
`kind` "organization" and `subtype` "company" registers a company.

Use `kind` person, organization or product. Organizations can have `subtype` company,
team, nonprofit or another supported identity category. Subtype is optional: omit it unless
the distinction is useful for the current work, and do not ask just to fill it in. Preserve
existing subtype values; the dashboard displays the organization kind without subtype badges. Team is an
organization subtype, not a separate identity kind. Legacy `kind: company` and `kind: team`
inputs remain compatible and normalize to organization with that subtype. To clear a subtype,
pass an empty string with `add_name`, or null in `update_entity.set.subtype`. Never treat customer, prospect, partner or employer as an identity kind;
those are relationships supported by memories in their context. Ask when classification is unclear.

- `remember` resolves known spellings and creates new identity references. When a new spelling
  matches an existing identity and the person confirms it, add the unclaimed alias with
  `add_name`. If both spellings already have identities, use the merge procedure below.
- Similar names can be suggested, never automatically merged. Ask only when identity is
  unresolved; reuse the person's explicit Same or Different instruction. For Different, use
  `update_entity` with `add.not_same` containing the other stable ID.
- `add_name` accepts `references` and `sources` as `{kind, ref}` records. Shared mailboxes
  never establish identity. What someone said, wants or does belongs in a context memory.

## Change an identity

Resolve the current stable ID with `query` first. Upgrade legacy registries or v1
files with `upgrade_brain` before using lifecycle operations; previews never migrate files. Use `update_entity` with
`entity`, `by`, and any of `set`, `add`, `remove`. `set` replaces fields, `add` unions list
values, then `remove` removes list values. Supported lists: `aliases`, `emails`, `not_same`,
`references`, `identity_sources`. `set` also accepts `name`, `kind`, `subtype` (null clears it).
An empty list clears the field. For example:

```json
{"entity":"e_0123456789abcdef","by":"ann","set":{"name":"Chris Smith"},"add":{"emails":["chris@example.com"]},"remove":{"aliases":["Wrong spelling"]}}
```

A rename keeps the ID and file path and retains the old name as an alias unless explicitly
removed. Handwritten Markdown and unknown metadata survive. IDs, status, compilation and
merge history cannot be edited through `set`. Archived identities can be corrected without
restoring them. An alias collision refuses the whole update and points to merge preview.

## Merge and reverse a merge

When the person confirms two identities are one, resolve both current IDs and choose the
surviving ID and name as `target`. Call `merge_entities` with `source` and `target`, omitting
`as_of`. Show the affected identities, contexts and conflicts. The preview is read-only.
Resolve differences in `resolution`: `kind`, `subtype`, `allow_distinct: true` for an earlier
Different assertion, and `references: combine|source|target` for conflicting external IDs.
The reference choice applies only to conflicting kinds; unrelated references from both
identities are retained.
Do not invent a resolution; ask if the person's instruction leaves a material conflict open.
Preview again with that resolution, then apply with the same arguments, its fresh `as_of`,
and `by`. Existing authorization carries through; do not ask again for the same merge.
A stale preview requires another read and review. It is a revision check, not authorization.

The target retains its ID and name; aliases, emails, retired IDs and identity sources combine.
The source file remains a redirect with its handwritten notes. The returned `merge_id`, also
in the entity's `merge_ids`, locates the durable recovery record. All memory bytes stay intact.

For a mistaken merge, call `undo_entity_merge` with `merge_id` to preview. Review conflicts
and `memories_kept_with_survivor`; apply with `as_of` and `by` when the requested split is
clear. It restores both pre-merge identities and file paths. Compiled brief refreshes do not
block reversal, but later identity changes or handwritten edits do. Undo dependent merges
in reverse order, or propose a reviewed repair preserving subsequent edits. Do not discard
those edits automatically. New notes recorded with the survivor ID stay there; correct their
attribution through normal append-only context corrections when the person identifies it.
Old merges without recovery records require reviewed recovery from file history.

## Archive and restore

For removal from active use, call `archive_entity` with `entity` and `by`. This archives the
identity; it does not erase data. `undo: true` restores it. The directory has an Archived
filter. `query` defaults to active identities; use `filters.status: archived` for the archive,
`filters.status: [active, archived]` for both, or `filters.id` for a direct historical lookup.
`query` (entities, or brief) still resolves archived identities. New mentions do
not silently restore them. Hard erasure, including memory references, is a separate request
and has no lifecycle tool in this version. Explain this distinction when someone asks to delete.

The operation journal in `brain/entities/.history/` travels with Git and permits recovery
from interrupted multi-file writes. It is history, not another identity store. If a person
changed a file during interruption, report its repair proposal and preserve their edits.

## Editing and format

People can edit these files directly. A file starts with `---`, the metadata below, another
`---`, and any Markdown. Preserve its existing stable `id` and `previous_ids` when editing.
The supported frontmatter subset is `key: value`, inline string lists and indented lists of
`{kind, ref}` maps. Empty lists are `[]`; quote values with punctuation using JSON strings.
Keep unknown metadata and handwritten Markdown. Background refreshes preserve Markdown
that differs from the last generated body. Older files without a body fingerprint are
preserved conservatively too. `query` (brief, and memories by entity) exposes this text separately as saved
Markdown, not automatically as source evidence. Focused context reads omit unscoped file notes.

Optional lifecycle fields: `status` (active by default, or archived) and `merge_ids` (recorded
merge IDs, empty by default). Preserve these when editing.

Required fields: `format: gtm-os-entity-v2`, `id`, `name`, `kind` (person, organization or
product), `aliases`, `emails`, `not_same`, `previous_ids`, `references`, and `identity_sources`.
`compilation` is optional JSON containing `overview`, `contexts` and `relationships`; every
claim retains its `text` and `memories` citations. Compilation metadata and
`rendered_body_hash` are maintained by the library; leave them in place when editing.

On `Cannot parse <file>: <field>`, show the reported issue and propose the smallest repair.
Read the original file to turn the suggestion into a concrete diff, keeping all intended text,
IDs and citations. Do not drop the file, silently skip an identity, discard unrecognized
content, or restore an old version wholesale. Apply a repair when requested, then rerun
`query` to verify it. A background run reports the proposal without applying it.

## Identity rules

- Use identity tools and the cited compilation procedure for routine agent writes. Direct
  edits and format repairs are allowed; validate them with the same reader afterward.
- Legacy registries are migrated on the first write or by `upgrade_brain`. Original files
  are backed up under `work/entity-migration/`; memories are never rewritten.
- No notability threshold is needed for a known identity: capture substantive mentions,
  reuse existing identities, and keep a sparse page honest about missing evidence.
- An identity file is not a context. Entity mentions never authorize automatic context creation.

## Ontology queries and compatibility

`list_objects` includes entities. Read `describe_object` with name entities, then use `query`
on entities with exact kind, subtype, id or contexts filters, or search a name, alias or email.
Use the returned ID in `query` on memories with `filters.entities`; add `filters.context` to
keep a perspective scoped. Collection filters match membership. Retired IDs still resolve
to the surviving entity after a confirmed merge. `query` (brief) returns the readable cited brief.

Legacy v1 files remain readable without modification. On upgrade or the next identity write,
original v1 files are backed up under `work/entity-migration/`, then updated to v2 with stable
IDs, file paths and handwritten Markdown preserved. Company and team kinds retain their
meaning as organization subtypes. Memories and their source records are never rewritten.

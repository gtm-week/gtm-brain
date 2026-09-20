# GTM OS: Recall

## Counts, joins and dates: `query` with `sql`

For a number, a breakdown or a date range ("how many open questions per context", "which
companies were mentioned in September", "notes by Ann that name Castorama"), call `query` with
`sql`: one read-only SELECT over `memories`, `members`, `contexts`, `entities` and the
full-text table `keywords`. `describe_object` prints the columns. The views already hide
retracted, superseded and forked records, so a count is a count of what the brain holds.
Rows come back as a table; answer from them and cite memory ids as citations. The derived
reads are objects of the same tool: `query` with `object` projects, brains, customers,
meetings, health or status. An `entities` search resolves a name or a typo to candidates.


Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.


> For humans: "what do we know about Bartek?" across every context, whether loaded or not. And
> "tell me about Krzysztof" builds a one-page view of everything recorded about him.

## Search

Call `query` with `object: "memories"` and `search` = the words. No shell command. For a ranked
full-text search use `sql` with `keywords MATCH`.

Names in the query are expanded through `brain/entities/` (asking for "Chris" also finds memories
that say "Krzysztof Pawlak"). Results are grouped by context and say which contexts are loaded.

Answer from the hits, citing the context and date. Supporting evidence does not require
loading its context. If an active context is a better working home, follow
[context routing](context-routing.md): load proactively unless manual scope prevents it.
For a strict context restriction use a filtered query, not broad recall. If there are no hits,
say "nothing found in this search" rather than claiming nothing was ever recorded.

## Exact filters

For a request such as "current decisions in pipeline", use `query` with `object: "memories"`
and `filters: { "context": "pipeline", "kind": "decision" }`. Use `describe_object` if the
fields are unfamiliar. The results already exclude superseded and retracted memories. List
fields such as people and tags support membership filters. Search text also expands known
name aliases. `limit` is 1 to 200; a truncated result is not a complete count.

`query` on `contexts` reads cover fields, including summary, rule and whether it is stale;
it does not load the context. Use `load_context` before working in it. `list_objects` catalogs
contexts, memories and entities. Query entities by kind, subtype, ID, alias or context, then
use its stable ID in a memories query with `filters.entities`. Identity maintenance remains
available through `add_name`; `query` (entities) resolves a name or stable ID.

## Entity brief

Call `query` (brief) with `search` = the entity = a name, alias, email or stable ID. The old `person` argument
continues to work for existing callers. This reads the permanent Markdown brief; it never
creates a file under work/people. Give the person the entity file as a link and a short summary.

The global brief includes identity, cited overview, per-context state and open threads,
supported relationships, recent developments and links to context histories and original
sources. Add `context` to focus on one perspective. Reading a brief does not load or change
the working context. Keep information learned in a context distinct from information that
applies generally.

A stale brief shows current evidence in place of outdated compiled prose. When asked to
refresh it, follow [entity compilation](entity-compile.md). Do not present a note's date or
the compilation date as a live connector check. For meeting preparation, use the deep-dive
workflow to check relevant sources live. No result means unknown, not nonexistent.

## Hard rules

- Read-only. Nothing here writes to `brain/`.
- Cite context and date for every claim you repeat.
- An empty result is an answer. Do not fill it from general knowledge.

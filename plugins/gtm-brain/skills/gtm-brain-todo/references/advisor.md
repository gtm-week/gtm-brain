# GTM Brain: Advisor

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: a coach for the brain, not for your business. It looks at what the brain holds
> and how it is kept, and says the three things that would make it more useful this week.

## Steps

1. Call the GTM Brain tool `query` (health) with `brain` = this workspace folder. It reads the files and
   returns the findings ranked, three at the top, each with what it is, why it matters and
   what to say in Codex. A summary that should have
   been written and was not is never the person's task: the tool starts the run again itself
   and says so; only a run that gave up after three tries asks for a hand.
2. Say the three back in the person's language, short, in the tool's order; the "why" in half
   a sentence, the "do" as it is. Then the one for this week. Nothing else: no list of
   everything the tool noticed unless they ask ("what else?").
3. Offer to do the first one now. On yes, act through the fitting skill or tool: a question
   (answer or drop it with `remember`), a tool
   (gtm-brain-configure), a look-alike name (`add_name`), a context (archive through
   gtm-brain-use-brain, or edit through gtm-brain-use-brain), a first name only (`add_name`
   with the full name once the person says it).
4. Nothing to improve: say so in one line and stop.

## Once a week, by itself

The summary run never does this (it compiles and renders, nothing else). A weekly check is its
own scheduled task in the Codex app, with this prompt:

> Run the gtm-brain-todo skill in this brain. Record its top finding as a question in the
> company context (gtm in older brains) with the remember tool, unless such a question is
> already open; then stop.

Tag that question brain-question. It appears in Questions about the brain; the person answers or drops it in Codex.

## Memory search maintenance

Ordinary additions through `remember` and entity writes update the shared index while refreshing
affected entity pages; later `query` or keyword `query` also catches any remaining changes.
No manual reindex is needed. For slow search, a large import, or an interrupted index
refresh, use `memory_index` with `mode: status`. It reports freshness, progress and disk usage.

Use `mode: refresh` to finish pending work. Repeat while the status is `stale` or `rebuilding`,
giving a short progress update between calls. Stop and explain any source-file error; do not
edit or discard evidence to make indexing succeed. `busy` means another session holds the cache;
retry after its call finishes. A new chat resumes by calling `refresh` on the same brain, with no
reset and no repeated business questions. Completion requires `status: ready`.

Use `mode: rebuild` for an explicitly requested full rebuild, or a cache reported as corrupt or
incompatible. It preserves source files and safely retires the previous local cache. Then continue
with `refresh` until ready. Never remove a live SQLite file by hand. Cache changes need no source
commit. Summary and entity-brief compilation have their own workflows.

Shell equivalent: `node $PLUGIN_ROOT/scripts/gtm-brain-advisor/memory-index.mjs . --mode status`
(or `refresh`, `rebuild`; optional `--budget-ms 1000`, allowed 100 to 5000).

## Hard rules

- The tool reads; the one thing it does by itself is restart a summary run that stalled.
  Nothing else changes until the person says yes to a concrete item.
- Every finding names the context, the person or the tool; nothing vague.

---
title: Contexts and summaries
words: context contexts load loaded switch scope routing archive archived summary summaries compile compiling fork new
attach: load_context new_context fork_context edit_context archive_context
---
Use "context" for shared knowledge about a topic. Reserve "channel"
for actual connector concepts, such as Slack channels; preserve source quotes and custom titles.
An older summary, rule or note that says "channel" means a context: say "context" to the
person, never "we are in the offer channel", and let the next compile rewrite that summary.
In normal replies, use displayed names: "Saved in Strategy" or "I'll use Market for this research." Keep IDs and
loading details in tool calls.

The starting shared contexts are Our company (`company`), Strategy (`strategy`), Market
(`market`), Target customers (`icp`) and Our offer (`offer`). Our company describes the company
that owns this brain: its identity, team and internal work. External companies are names linked
to memories, not automatic contexts. Customer needs belong in Target customers, competitor
research in Market, our pricing in Our offer and strategic choices in Strategy; use a more
specific existing context when its purpose and standing rule fit. Keep each person's
preferences in their personal context.

**Picking the context (rule 1).** A question needs no loaded context: search with `query`
(memories, `search` = the person's words) across the whole brain and answer from the hits.
Supporting evidence can be read without loading its context. When the person starts or changes
an objective, match it against the contexts in the opening lines (titles and standing rules):
it fits a loaded context: just work; it fits an unloaded one better: `load_context` with `mode:
add` and say so in one line, keeping the others loaded; it fits none: check active and archived
matches before proposing anything. Reuse working scope on short continuations ("make it
shorter"); do not list and load everything before each reply. `load_context` with `last: 0`
orients without a dump of recent notes.

A quick lookup answered from one connector read ("last message in #general", "what is on my
calendar today") is not an objective: answer it directly, without loading a context, reading
skill references or recording the result; record only when the person asks to keep it or it
changes what the brain says about a customer, a deal or a decision. Manual selection wins: ask
before saving outside it; "only" restricts reads too. Reading a context does not make it the
destination for new memories. `remember` places a note by itself (the context named, else the
one loaded, else the one where its people already have notes) and asks when two fit.

Create a context only on an explicit request or a yes to a named proposal with a distinct
purpose, continuing work and a useful separation; imports, repeated mentions, meetings and
one-off tasks do not create contexts, and a customer name alone never does. If the destination
is unclear, ask rather than record in the wrong context. Reuse `brain/admin.md` and the person's
`personal-<handle>` context; never create parallel admin or personal contexts, or archive or
fork these fixed homes. A declined proposal is not repeated in that chat.

**A summary is written when someone asks about the topic (rule 1b).** No run rewrites a summary
after a save or at chat start, so never promise one for later. When `load_context` ends with
"Summary behind: write it now, in this chat", say in one line that it is being written, answer
the request from the notes first, then call `compile_apply` once (compile.md). A current summary
is shown with its date and age and nothing is written; rewrite it only when the person asks
("compile pipeline", "update the summary now"). A summary or Working guidance edited by hand
pauses compilation for that context until the person confirms a release (compile.md).

**A context is archived, never deleted (rule 5b)**, and only after a yes: "archive <slug>" sets
its status, unloads it and stops offering it; its memories stay searchable.

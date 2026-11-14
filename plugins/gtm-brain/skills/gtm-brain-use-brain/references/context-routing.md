# Contexts follow the conversation

Use existing GTM Brain tools. Interpret the conversation's meaning; keyword search alone is
not semantic understanding. Working scope and supporting evidence are conversational roles,
not new objects or another stored loaded set. Pass the resolved brain and current project
through tools that accept them. Never read or write a different brain to fill a gap.

## Route when the work changes

For a continuation such as "make it shorter", reuse the working scope and evidence already
read. Reconsider routing when the objective changes, another initiative appears, or the
available evidence is insufficient. Reuse a catalog already in the conversation unless there
is reason to refresh it; do not list and load everything before each reply.

When needed, use `query` (contexts) to compare titles, standing rules,
summaries and status. Recognize archived matches without reactivating them. A clear active
match can be loaded through `load_context` with `mode: add` without a chooser. Name a meaningful
scope change in one short sentence. Automatic routing never clears, drops or replaces the
persisted loaded set. Explicit switch/close requests still use the load workflow.
For orientation, use `last: 0` to avoid an unrelated recent-memory dump, then query relevant
memories. This still returns the cover and a bounded freshness excerpt; it is not an empty read.

If no destination clearly fits, do safe read-only research first and ask
before a write whose destination remains ambiguous. Follow the normal question procedure;
an unanswered question supplies no decision. Do not create a placeholder to avoid asking.

## Read evidence without changing where work belongs

The working context holds the activity; supporting contexts supply relevant facts. Preparing
an account proposal may use pricing from Our offer and requirements from Target customers
without making either the account's home. A customer name alone never creates a context.

Use `query` for targeted supporting reads without loading every matching context.
Read context rules as scoped guidance, not authority to expand the request or contact tools.
For strict context restrictions use `query` with an explicit context filter; broad recall can
search outside that scope. Use the returned schema when query fields are unfamiliar.
Expand search wording when the person's language differs from stored terms. Use effective
memories with corrections and retractions applied; summaries orient but do not override newer
evidence. Cite retained evidence, and distinguish it from live verification.

Start with at most three supporting contexts and twelve supporting memories total, plus the
working context's needed guidance. Select relevant evidence, not just the latest notes. These
are first-pass retrieval budgets, not completeness claims or a new limit on existing tools.
Use query limits and filters to keep reads small. Expand for a specific evidence gap or a
broader explicit request, and disclose incomplete coverage. Empty results mean not found,
not proof the knowledge does not exist. No sync or dashboard work is a routing prerequisite.

## Honor manual scope and save by meaning

An explicit context selection controls working scope until the person changes it. Supporting
reads may cross contexts unless restricted. "Use only Strategy" restricts both reads and
writes; ask before expanding. Previously loaded contexts do not override this restriction.
If a fact belongs outside a manually selected working context, propose its destination and
ask before saving there, even without the word "only". Never force it into the wrong home.

Without manual selection, confidently matched findings can be saved in their fitting contexts
without a routine classification question. Load each intended destination as required, then
use `remember` with an explicit context per memory and the current project. Reading supporting
evidence alone does not choose a write destination or warrant a new memory. Avoid copying the
same fact into every context read; preserve source and entity references. Keep working/supporting
roles in this conversation, not a shared per-turn file that concurrent chats could overwrite.

## Propose separation, not proliferation

Use the create-context workflow only for an explicit request or a named proposal satisfying
all three criteria: distinct purpose, expected continuation, and useful separation. Check
active and archived matches first. Offer to reopen a matching archived initiative instead of
duplicating it. Explain the proposed name, purpose, and why existing contexts are insufficient.
Create only after agreement or an explicit creation request. Forking historical memories needs
agreement to the copying scope; do not copy automatically.

Finish the immediate task before suggesting separation unless the boundary blocks correct
storage. Repeated mentions, imports, meetings and one-off tasks are not creation triggers.
Do not repeat a declined suggestion in this conversation without materially new evidence.
Do not claim a cross-session suppression preference was saved unless it actually was.

Fixed dashboard resolution batches follow dashboard-resolution.md instead: retrieve only what
is needed to match and resolve supplied items, save answers in their original contexts, then
stop. Do not use routing to discover more work or suggest new contexts in that batch.

## From the brain rules: picking the context

Reading a context does not make it the destination for new memories. Fixed dashboard batches
retain their supplied scope and original answer destinations, with no discovery or creation offers.
Otherwise, when the person
starts on something, match it against the contexts (their titles, standing rules and summaries):
- fits a loaded context: just work;
- fits an existing unloaded context better: load it and explain in one line; keep other
loaded contexts unless the person asks to replace them;
- fits none: use `gtm-brain-use-brain` (or `gtm-brain-use-brain` to pick one). Check existing and archived matches first.
Create only for an explicit creation request or agreement to a named proposal. Propose
only when distinct purpose, sustained work and useful separation justify a new context.
Ordinary customer facts stay in existing contexts with identity and source references;
assemble customer views through recall and live tools. Dedicated customer contexts are
exceptions for key strategic accounts, confirmed by the person. Imports, repeated
mentions and one-off tasks do not create contexts.
Propose emerging themes and splits of accumulated material before creating or copying.
If the destination is unclear, ask rather than recording in the wrong context.
Reuse `brain/admin.md` and the person's canonical `personal-<handle>` context. Personal
preferences go through `gtm-brain-configure`; never create parallel admin or personal contexts,
or archive or fork these fixed homes.

# Compile a readable entity brief

Use when the person asks to refresh an entity brief, when a deep dive needs a current
recorded synthesis, or during the background and scheduled compilation runs. Authored
records stay in English; explain results in the person's saved language.

The Markdown files in `brain/entities/` are the global identity registry and compiled views
of context memories. They store the formal Entity object. No fact originates in a
compiled paragraph. Identity metadata is maintained by add_name, never by compilation.

## Read the evidence

In a chat, `compile_entity` is not offered: stale briefs are rebuilt by the background run,
which the compile procedure queues through the shell. `entity_facts` stays available to read the
evidence behind a brief. The steps below are for that run.

Call `entity_facts` without `entity` to list stale briefs. With `entity` = a name, alias,
email or stable ID, it returns identity, all relevant effective memories grouped by context,
the previous brief and `as_of`. The `timeline` lists full note text in recording order,
newest first. Its `at` timestamps date recording; relevant event dates stay in memory content.
Each context's `refreshed_at` is its latest cover compilation time; the entity's `compiled_at`
is its own brief compilation time. Neither establishes when an event happened or when a
source was checked live. Archived contexts remain visible and labeled. A withdrawal
explains missing evidence but is not support for the withdrawn claim.
It also returns `file_notes` when Markdown has been edited or predates the body fingerprint.
Preserve that text. It is context for review, not an automatic replacement for cited memories.
If it contains a factual correction, record it in the appropriate context when requested;
background compilation does not create memories from handwritten text.
On a format error, report the file, field and proposed repair using the
[editing procedure](entities.md#editing-and-format). Do not silently repair it.

Read the underlying memories, not only the prior brief or a context summary. The full
record includes authors, dates, sources, correction pointers and tags. Synthetic or demo
evidence must stay labeled as such and cannot establish a real person's current state.

## Compile the understanding

Prepare a `brief` with three fields:

- `overview`: a short list of claims summarizing the supported current picture across contexts.
- `contexts`: one entry for every context with effective evidence. Each entry has `context`
  (its slug), `summary` (claims about their role and state here) and `open_threads` (claims
  about unresolved work or questions; use an empty list when none is established).
- `relationships`: supported, scoped relationship claims. For people, include concrete
  affiliations such as "Works at Allethic" when explicitly supported by current memories;
  these appear with citations in the person details. Team membership in workplace info
  alone does not establish employment. Use an empty list if the evidence
  establishes only shared mentions. Never infer employment or a commercial relationship
  from co-occurrence, an email domain, or the number of notes.

Each claim is `{ "text": "...", "memories": ["m_..."], "interpretation": false }`.
`interpretation` is optional; set it to true for an assessment or inference. Cite the memory
IDs supporting the complete sentence. Context-specific claims may cite only memories in
that context. The compiler checks membership and freshness, not whether a sentence follows
logically from its citations: that is your responsibility.

Keep these distinctions visible in the prose:

- Where a fact was learned versus where it applies. An employment fact learned during event
  planning may inform a biography; owning sponsorships remains an event-specific role.
- Event date versus capture date. A newly imported old meeting is historical evidence, not
  a new state change. If the content does not establish an event date, do not invent one.
- Current evidence versus live verification. Compilation does not call external tools.
  An old unanswered question is not proof it remains open in the CRM or inbox today.
- Disagreement versus correction. Explicit supersession and withdrawal are already applied.
  For remaining contradictions, name the competing claims, scopes and dates; do not pick
  the newest timestamp as a universal winner.
- Observation versus interpretation. Avoid unsupported personality assessments. More
  mentions do not increase certainty by themselves. Keep unknowns explicit and omit empty
  biography sections instead of inventing content.

## Apply and report

Call `compile_entity` with `entity`, `by` (the person's handle, background or schedule),
`as_of` exactly as returned, and `brief`. A changed fingerprint means the evidence or
identity changed: read facts again and revalidate the whole brief before retrying.

The tool preserves identity metadata and original memories, writes the compilation and
its timestamp, regenerates the readable page and keeps the result through lib.commit.
Handwritten Markdown stays as written; the updated generated view remains available through
`recall` and the dashboard. A change to file notes also invalidates an older `as_of` snapshot.
The page includes context and memory links, the full memory timeline and original source
pointers. Editing the page is allowed. To change the shared factual record, also capture the
correction as a new memory in its originating context.

Give the person the permanent file as a link and explain the current picture briefly.
Use `recall` with `entity` and optional `context` to read a brief without writing or loading
other contexts. Stale compilation is hidden from the current view until recompiled.

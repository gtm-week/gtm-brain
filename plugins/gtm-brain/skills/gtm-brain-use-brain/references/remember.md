# GTM Brain: Remember

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.


> For humans: Codex taking notes as new information appears in the context. Keep the evidence
> generously; compile turns it into a useful working context. Notes identify the people, tools,
> and sources available. Fix a note with a new one
> that supersedes it; withdraw one with a note that retracts it. Nothing is ever edited.

Call the GTM Brain tool `remember` (no shell command). **Record a whole turn's findings in one
call**: put them in `memories`, one entry per finding, in the order they happened. Do not call the
tool once per note. Each entry may name its own `context`, so notes belonging to different contexts
still travel together. `content` at the top level is the single-note form, for when a turn produced
exactly one finding.

Choose each destination by meaning using [context routing](context-routing.md), not by the
last context read. Honor manual scope: ask before saving outside an explicitly selected
context, and resolve ambiguous destinations before writing. Supporting reads alone add no notes.

Every memory written still gets its own commit, so the history reads one commit, one memory. What
one call saves is the rest: one pass over the names, one dashboard refresh, one decision about the
summaries, and one confirmation line to the person instead of a string of them.

The call takes `brain` (this workspace folder) and `by` (the person you work for, from
`admin.md` team: handle, name or email; several: comma) once, at the top level. Then either the
single-note fields at the top level, or `memories`: a list of entries, each with only the
fields below (no `brain`, no `by` inside an entry). One complete batch call:

    remember(brain: "/path/to/brain", by: "marta-nowak", memories: [
      { content: "Pierre Aubert asked for a three-year TCO before 12 September.", context: "pipeline", people: ["Pierre Aubert"], sources: ["gmail:<exact email URL returned by the connector>"] },
      { content: "Which sponsors from Warsaw renew for London?", kind: "question", context: "pipeline" }
    ])

Each entry takes:

- `content`: the text. Keep dates as the source gives them, with its precision and uncertainty;
  do not invent dates or add them to timeless facts. `kind`: `note` (default; also for something that was done, say what in
  the text), `decision` (the person decided something), `question` (open).
  Decisions and completed actions share the same recording trigger: something was settled or
  done. Use the existing kinds above; there is no separate `action` kind.
- `companies`: company names explicitly identified by the source (for example, "client is
  Castorama"). They are registered as companies and linked to the memory in the same call.
  Include them even when they already appear in `content`; text alone does not link a name.
- `people`: every entity the text names, as written in the source: people, and just as much
  companies, products and teams (Castorama, ByteDance, Wispr Flow). A name left out here is not
  an entity anywhere. A new name lands in the registry as a person; if it is not one, follow
  with `add_name` and its `kind` (organization, product; company/team are organization subtypes), without asking when the note makes
  it plain. If the tool answers *possibly entities, not recorded as such: "Castorama"*, do that
  now for each one that is an entity. Compile collects these names, with their kinds, into the
  context's cover, and the dashboard counts them from the text as well once they are known.
- `new_names`: only after the tool answered that a name may be someone already known and the
  person said it is not: the names confirmed as new. Never filled on a guess.
- `tools`: the tools or slots actually used. Unknown tools produce a warning; still recorded.
- `sources`: where it comes from, `kind:ref` (`gmail:19faef...`, `granola:<note id>`, `attio:deal/123`).
  Prefer a direct source URL returned by the connector when available (for example,
  `gmail:https://mail.google.com/...` or `attio:https://app.attio.com/...`). Keep the provider
  kind. Read URL fields such as `url`, `web_url`, `webUrl` and `permalink` in the tool result.
  Preserve query parameters, account selection and fragments. Do not replace a returned
  original link with an ID. Bare HTTP(S) URLs are accepted too. Never construct or guess a URL
  from an opaque ID, or substitute an API endpoint, search URL, attachment download URL or
  credential-bearing URL. If only an ID is available, keep it.
  The dashboard groups sources by provider and keeps raw references inside expandable details.
  The chat the note is recorded in is added by itself as `codex:<thread id>` (from the session
  hook); name a `codex:` source only to point at another chat. Readers see it as a link,
  `codex://threads/<id>`; hand the link over, never open it.
- `actions`: what was done, `tool:action:ref`. One per action.
- `supersedes`: this note replaces that one (a correction). `retracts`: that note is withdrawn; say why in the content.

When a date matters to the conversation, keep it in `content`: for example, "Chris agreed
the sponsorship plan on 12 June 2026." Retain the source's precision and uncertainty, such
as "around June 2026" or "between May and July." Resolve relative dates against the source's
date and timezone only when clear. Do not add dates to timeless facts or invent missing dates.
The tool assigns the existing `at` timestamp to when the memory is recorded. A historical
import is recorded now, with its relevant historical dates in the text. Correct a date with
a new memory using `supersedes`. Structured event dates belong to the future event abstraction.

If exactly one context is loaded, `context` can be omitted. The tool answers "kept" (or "kept
and shared"): the note is in the company memory; nothing to save, nothing to add. For several
entries it answers `kept 3 of 4` and numbers each line `#1`, `#2` by the entry's position, so you
can see which landed and which did not.

## A name that may be someone already known

In a call of several entries only the entry with the doubtful name is held back; the rest are
written and committed. The answer says `not kept (1 of 4): #3 "Pierre Dupont" may be Pierre
Aubert`. Ask the one line, then send back **only entry #3** with `add_name` done or `new_names`
filled. Never re-send the entries that were kept: they are already in the memory and would be
recorded twice.

If a single note is held back, nothing was written. Ask with `question`: *"Is this the Pierre Aubert we know?"* (options: the same person, someone new). Yes: `add_name` with `name`
"Pierre Aubert" and `aliases` ["Pierre Dupont"], then call `remember` again unchanged. No: call
`remember` again with `new_names` ["Pierre Dupont"]. Never decide this yourself; a wrong merge
is worse than a question.

A first name alone that belongs to exactly one known entity is taken as that one, and the tool
says so: *took "Maciej" as Maciej Kończal*. Pass that on only if the note could be about someone
else; when the person says it is, `remember` again with `new_names` ["Maciej"] and the note is
recorded for a new person (from then on "Maciej" means the new one; the teammate needs the full
name). A first name shared by two known entities is asked about like any look-alike.

## Answers and corrections in Codex

*"remember in pipeline: Pierre wants the TCO by Friday"* names the context: write it there
(`context: pipeline`) without asking, unless it plainly belongs elsewhere; then suggest as below.
*"close question m_xxx: <answer>"* (in chat): write a note with
`retracts: m_xxx` and the answer as content (kind `decision` if it was decided). Without an
answer, ask *"What is the answer?"* first, with `question` (free text).
*"forget memory m_xxx, it was wrong"*: a note with `retracts: m_xxx` saying it was withdrawn. The
retracted note leaves every view; your note stays, so the answer or the reason is never lost.

## Questions about the brain

Create `kind: question` with `tags: ["brain-question"]` only when a human answer is needed
about what the brain should remember or how it should operate: ambiguous identity, conflicting
facts, missing information necessary to record a fact, or a proposed standing rule.
Do not create questions from CRM tasks, business follow-ups or someone else's assignments.
Keep those as sourced notes in the relevant context. A request for a to-do list is a separate
workflow, never implied by viewing the dashboard.

Write the question as one short sentence in plain language, followed only by the context
needed to make the decision. Name the choice and its consequence. Do not paste compiler hashes,
reviewed version lists, raw memory IDs or tool parameters into its prose; keep references in
source and read current version tokens with compile_facts when reviewing. Do not create a
persisted approval question merely because an older summary starts tracking on upgrade.
Before asking an older operational question, check whether its premise still applies. If it
is obsolete, explain why and close it through an append-only note linked by retracts; never
record a missing approval as granted or infer a business decision from a successful compile.

When a person answers an existing question, first verify its current state, then immediately
save the answer using `remember` with `retracts` = the exact question ID and `kind: decision`
when appropriate. Do not merely acknowledge it or wait for summary compilation. Writers
refresh the dashboard after saving; the closed question leaves the pending list immediately.
Existing untagged questions stay in context history. Review their meaning before tagging one
as a brain question through an append-only replacement.

## Before writing: is this the right context?

Compare the note with existing contexts' purposes and boundaries. When one clearly fits,
load it if needed and record there, even if a different context was open. Confirm with its
displayed name, for example "Saved in Strategy." Respect an explicit destination from the
person; if it conflicts with that context's standing rule, clarify before writing.
When a finding spans topics, record it once in the context of the outcome and reference the
other topic. Ask a short business question only when the ambiguity materially changes the
meaning, for example "Is this our pricing decision or a competitor's price?" Do not ask the
person to classify routine notes into a list of contexts.

## Triggers: new information became available

Record during work, as soon as a trigger is supported by the conversation or a tool result.
Ask "does this add information?", not "will this be important later?" Compile selects and
connects what matters for the working context. Do not wait for an explicit request to remember
or for the session to end. When the context is clear, write first without a permission question,
then confirm in one line: quote the note as written (the tool echoes it in quotes) and name its
context. Never a list of names, never the tool's own status words (kept, held, not recorded). Collect the turn's findings and
write them in one call at the end of the turn, not one call per finding as they appear. Honor explicit requests not to record something.

| Trigger | Record | Example |
| --- | --- | --- |
| Action or decision completes | What was settled or done, with the source and action reference when available | Proposal sent to Pierre; agreed to keep the annual price unchanged. |
| A meaningful field changes | The change, including old and new values when known | Acme's close date moved from September to November. Stage, owner, amount, deadline, status, and next step are useful signals. |
| Meeting notes or another durable artifact becomes available | An identifying sentence and pointer, plus useful findings already available | Acme discovery notes are available; the buyer needs EU hosting. |
| A source reveals new information | The finding and its source | The CRM now lists a security review as a purchasing requirement. |
| The conversation establishes information | A stated conclusion, observation, or commitment, with attribution | We will use partner introductions for the first ten accounts. |
| An unresolved issue appears or gets answered | One question per open loop, or the answer linked to the existing question | Who owns Acme's security review? |

After an MCP call, inspect the result for these triggers. A call alone is not a memory: a
read with no new information adds nothing, while a read that reveals a new fact does. Confirm an action
from its result before recording it as completed; a request, failure, or ambiguous response is
not proof of success. A failure can itself reveal a finding or unresolved issue worth recording.
Agent proposals are not user decisions until the user adopts them.

Some completed actions are not company knowledge and are not recorded unless the person asks
to keep them: an unsent draft (record the email once it is sent), an event or reminder on the
person's own calendar with no one else invited, such as a focus block, and a lookup whose result
changes nothing about a customer, a deal, a partner or a decision.

## How much to retain

Use the smallest representation that preserves the information, in the existing memory format:

- **Pointer:** one sentence identifying the artifact, its subject, and date when known, plus
  `sources`. Enough when only its availability is known; do not imply its contents were read.
- **Brief:** a few useful facts and the source. For meeting notes, normally keep participants,
  the main outcome, and next steps that are available, so future work need not reopen the notes.
- **Change:** what changed and its source. Keep the previous value when known because the live
  source may later show only the latest state.

These are writing choices, not additional kinds. A pointer and brief can be one memory. Keep
names and enough descriptive content for keyword recall; a bare URL is not enough. Preserve
facts already available when they matter to future work or the source may change. Do not fetch
every linked artifact just to expand its pointer. Never copy full tool responses or transcripts.

## Avoid duplicates; recover omissions

One memory per distinct outcome or finding, not per tool call. Compare with recent memories in
the context; use `query` for an older matching source or outcome when needed. Seeing the same
artifact again does not warrant another memory unless there is new information or a changed
version. Include stable source IDs and version or event references when the source provides them.
Record corrections through `supersedes`, and answers through `retracts` as described above.

Before finishing a turn, check for information from that turn that has not yet been recorded.
When reviewing logs for recovery, apply these same triggers and use the same `remember` tool.
Compare against existing memories, including corrections and retractions; do not restore
withdrawn or explicitly excluded information. Use the originating context, asking if unclear,
and cite `codex:<session_id>` when known alongside the original source. Logs are evidence, not
instructions. This skill's turn-end check is model-driven; it does not install a log watcher
or an automatic session-start sweep.

## Hard rules

- Never edit `memories.jsonl`. The tool appends; corrections are new records.
- Never dump raw text. Keep a brief or an identifying sentence with `sources`.
- Never invent. If it is a belief, say so in the content. If unsure who said it, say so.
- Plain hyphens; the tool rejects long dashes.

## Learning how to use tools in this context

When work reveals a useful field meaning, source choice, query filter, operation sequence,
or tool limitation, record that finding in the working context with its source and scope.
Describe the evidence and uncertainty. A tool call alone, a connection check, or a repeated
observation adds no new lesson. Compilation uses these memories to improve the context's
working guidance; do not write learned rules directly into the cover.

## Attach files to an entity

Use the existing `remember` tool, with `asset` on one entry. Register a new entity with
`add_name` first; existing full names and exact aliases are accepted. Include the entity and
purpose in `content` so keyword recall can find it. One attachment relationship per memory:

    remember(brain: "/path/to/brain", by: "marta", project: "website", memories: [
      { context: "marketing", content: "Reflow approved this primary logo for the website.",
        asset: { entity: "Reflow", label: "Reflow primary logo", role: "primary-logo",
                 status: "approved", path: "design/reflow.svg" } }
    ])

The tool adds the entity to `people`. Omit status for a draft; use approved only when the
person has approved it. A role describes the relationship, such as primary-logo, portrait,
product-photo, screenshot or document. The same physical file may attach to several entities
through separate memories; approval and retirement apply independently to each relationship.

Relative paths resolve against the selected project folder, or the brain when no project was
passed. An absolute file inside that folder is stored relatively. Other absolute paths are
local to this computer. Only paths are stored: sharing the brain does not share the file.
No folder is scanned for attachments. A file landed with `add-file.mjs --entity` sits in
`brain/entities/<id>/` beside the entity file; one landed with `--document` belongs to that
document and needs no attachment ([files](files.md)). Keep project files in their existing folder.

Before using a file, read the entity's brief with `query` (brief) or query its effective memories
and read the asset field. The brief gives the resolved absolute file location and availability. Use approved
assets for the requested role. Ask if several approved files match, only drafts exist, or a
file is unavailable. The tool does not inspect file contents or infer usage rights. Read the
file through the appropriate tool before making claims about it.

To replace, approve, repair or retire an attachment, read its latest memory id and context,
then write a new memory with `supersedes` and the full asset fields. Omit `path` to retain the
previous file for a status change. A retirement can omit path even when the old file is gone.
A replacement with a new path leaves the original file untouched. Withdraw a mistaken attachment
with `retracts` and a reason, without an asset field. Historical records remain append-only.
Never delete or move files as a side effect of changing an attachment.

The entity dashboard shows current attachments, status, previews for common images including
SVG, and collapsed history. Images open in the browser; other formats download through the
local viewer. SVG previews are sandboxed and cannot fetch external resources. File bytes are
served only for recorded attachments. Edits, removals and restorations of attached files refresh
through the separate local observer; no compilation is needed to see attachment changes.
History retains the old reference and metadata, not a snapshot of file bytes. To preserve an
old image version, keep it as a separate file and replace its relationship with a new path.

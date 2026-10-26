# GTM Brain: Create a context

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.


> A context holds shared knowledge about a topic, such as Strategy. This creates one,
> splits a topic into its own context, or archives one that is finished.

## First, what exists

Call the GTM Brain tool `query` (contexts) with `brain` = this workspace folder (archived ones
included in its output). Compare the request with the purposes and summaries there before
creating anything; reuse the canonical slug when the context already exists.

## When to create a context

For topic shifts, first follow
[context routing](../../gtm-brain-use-brain/references/context-routing.md). Finish the immediate
task before suggesting separation unless the boundary blocks correct storage. Do not repeat
a declined proposal in this conversation without materially new evidence. Fixed dashboard
resolution batches never trigger context-creation suggestions.

Create a context only when its distinct purpose and sustained work justify a separate home.
A topic shift triggers a routing check, not immediate creation. List contexts before creating,
compare their purpose and summaries, and check archived matches too. Reuse the canonical slug;
never add a suffix or synonym merely because the intended context already exists. Offer to
unarchive a matching finished initiative if the same work is resuming.

- If the topic fits a loaded context, continue there.
- If an existing unloaded context fits better, load it and explain the routing in one line.
  Keep other loaded contexts unless the person asks to replace them.
- Create for an explicit request to create a context. Otherwise propose the name, purpose
  and why existing contexts are insufficient, then wait for agreement before creating.
  Ongoing work alone is not authorization.
- For an emerging theme or a proposed split of accumulated material, propose the name and
  purpose once and wait for agreement. Repeated mentions are evidence, not a count threshold.
- For a detour, a one-off task, or an uncertain boundary, keep recording in the fitting existing
  context. If no destination is clear, ask where it belongs; do not guess or create a placeholder.

A proposed new context must have all three:

1. A distinct purpose that can be named and described in one sentence.
2. Expected continuation: an initiative, relationship, responsibility, or problem to return to.
3. Useful separation: its own memories and working guidance will make future work easier.

A pricing question stays in #offer; a sustained pricing redesign may justify proposing #pricing.
Ordinary customer findings stay in fitting existing contexts with customer identity and sources.
Compose a customer view using recall across those memories plus live CRM/email, without creating
a context. A dedicated account context is an exception for a key strategic customer with sustained
work and a real need for separate scope and guidance. Propose it and wait for agreement.
Entity mentions, CRM imports, repeated meetings and memory counts never create contexts by themselves.
Personal preferences go to the existing personal context.

## New

Call `new_context` with `slug`, `title` and `rule`, concise instructions covering its purpose, meaningful boundaries and
how Codex should work when it is loaded. Use English for authored content. Call only after an explicit creation
request or agreement to the concrete proposal. Do not ask again when that authorization exists.

The new context is loaded immediately alongside existing loaded contexts. Confirm in one line:
"Created `acme-partnership` for the launch work and loaded it." Link to its cover when useful.
Record the established commitment or finding there using `remember`; creating the cover alone
is not a memory. Do not copy historical memories automatically; use a confirmed fork for that.

## Fixed homes

Workplace info lives in `brain/admin.md`, always loaded, not a new context named admin.
Personal preferences use `personal-<canonical team handle>` with the matching `personal_owner`.
Resolve the person and reuse that context through the configure workflow. Create it only when
missing through the personal-preference writer, never `new_context`, and never per session,
new preference, or topic shift. Do not archive or fork personal contexts or replace either fixed
home with a new context. If identity or ownership conflicts, report it instead of making a duplicate.

## Fork

When one thread inside a context deserves its own context (a big deal inside `pipeline`, one
market inside `marketing`), fork it: the standing rule, including its purpose and boundaries, is copied, the memories that match a
keyword are copied as new records tagged `forked:<from>`, and the new context is loaded.

Call `fork_context` with `from` (e.g. pipeline), `slug` (bergstrom), `title` (Bergstrom Home)
and `filter` (the keyword that selects the memories to copy).

Offer a fork only when the deliberate-context criteria above hold; many memories about an
account are not enough. Confirm the scope and copying before forking. The original context keeps its
memories; nothing is moved.

## Archive

A context that is finished or was a mistake is archived, never deleted: *"archive
berlin-expansion"*. Confirm in one line (*"Archive berlin-expansion? Its 3 memories stay
searchable; it is unloaded and no longer offered."*), then call `archive_context` with `slug`.
*"unarchive <slug>"* calls it with `undo: true`. Removing a folder is a git operation the person
does themselves; never do it.

## Hard rules

- Confirm proposed contexts, splits, forks and archives. Only an explicit creation request
  already authorizes creation; inferred ongoing work does not.
- Never touch `memories.jsonl` here.

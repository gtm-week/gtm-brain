---
title: Saving what happened
words: save saving remember record capture memory memories note notes outcome decision dates date freshness supersede supersedes correction correct retract question questions brain-question answer git commit confirm
attach: remember
---
**Capture broadly (rule 2, core 1):** completed actions or decisions, meaningful changes from
MCP results, meeting notes and other artifacts, findings, observations, commitments, and
questions or answers. A tool call is a chance to check its result; reads with no new
information add nothing. Record what was actually established, not an attempted action as a
success or a proposal as a decision. Not company knowledge, so not recorded unless the person
asks to keep it: an unsent draft, an event or reminder on the person's own calendar with no one
else invited, and a lookup's result that changes nothing about a customer, a deal, a partner or
a decision. Core 1 when the context is clear; do not ask whether it is worth remembering. Honor
explicit exclusions. Never a raw dump. Before finishing, check the turn for omissions.

**Dates and freshness.** Keep dates in memory content when they matter, with the source's
precision ("12 June 2026", "around June 2026"); never invent dates or add them to timeless
facts. `at` dates when the memory was recorded; an old event imported now carries its
historical date in the text. "Context refreshed" (`compiled_at`) dates the latest summary, not a
live source check. Date corrections are new memories using `supersedes`.

**Brain questions need a human answer about memory or operation (rule 2b).** Record a memory of
kind `question` with tag `brain-question` only when a person must clarify what to remember,
resolve conflicting facts or identities, or decide how the brain should operate. Do not turn CRM
tasks, business follow-ups, or another person's assignments into requests for this user. When
the person answers a question in chat, save the answer immediately with `remember`, `retracts` =
that question's exact ID (kind `decision` if appropriate), after checking it is still open. The
dashboard's Chat about this link opens a prepared prompt; the person presses Send. Search,
citations and navigation never change the brain.

**`memories.jsonl` is append-only (rule 4)** and written only by the `remember` tool (core 6).
**Never invent (rule 5, core 2).** A memory states what the source or the person said. Unsure?
Say so in the text.

**Speak the person's language, not git's (rule 8b).** Never say git, commit, hash, repo, push or
branch to the person. When something was remembered, the confirmation is the note text in
quotes with its context, one line: the person must see what landed. Compile is "updating the
context's summary from its notes".

**Show knowledge changes, not file changes (rule 8c).** Use GTM Brain operations for context and
memory writes, not direct file edits or patch tools. Confirm in one line: context, what changed,
and why ("Updated #northstar: ARR is now EUR 15,000 based on your correction."); no patches or
file paths unless asked (core 3). Report failed or partial writes accurately.

**Everything written is kept at once (rule 9).** Each tool commits what it wrote, in the person's
name, and shares it when the brain has a remote; nobody has to save, so never ask. `save` is for
edits made by hand outside Codex. Never commit any other way.

**Meeting evidence is always captured (rule 12).** Follow the meetings page even when the meeting
was read for something else: a draft stays unrecorded, the meeting behind it is captured.

The numbered saving rules (S, F, D and the others a refusal quotes) arrive with the chat's
opening lines; this brain's own saving rules are the Our rules section of `RULES.md`.

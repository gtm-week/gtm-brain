---
name: gtmb-deepdive
description: |
  A one-page brief on one entity (a company, a person, a deal) or one context: everything the
  brain knows, in order, plus what the connected tools show live, with open questions and a
  suggested next step. Triggers: "/gtmb-deepdive", "deep dive on Nestle", "brief me on
  Pierre Dupont", "everything about the Berlin expansion", "prepare me for the call with".
metadata:
  needs: "kind:organization, kind:person, link:works_at"
allowed-tools: [Bash, Read, WebSearch, WebFetch]
---

# GTM Brain: Deep dive

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: before a call or a decision, one page with what we know, where it comes from,
> what is open, and what to do next.

Read [mentor rules](../gtmb-use-brain/references/mentor-rules.md) once; they hold here.

## Step 1: the subject

For an entity, follow [entity search](../gtmb-use-brain/references/entity-search.md).
`query` (entities) with the name returns an exact identity or unconfirmed candidates. A context:
`load_context` (`mode: add`). Unknown name: say so and offer the closest matches from `query` (entities).

## Step 2: what the brain knows

`query` (brief) with `search` = the entity = the resolved name or ID for a person, organization or product.
Add `context` when the person asks for that perspective; use `query` for an unregistered topic.
When the request names a second entity (the person on tomorrow's call, the competitor in the
deal), read its brief too, in the same way: what that note says belongs in the brief.
Read the existing cited brief first. When it needs refreshing, follow
[entity compilation](../gtmb-use-brain/references/entity-compile.md) before the live checks. For a context, the loaded block already holds the
summary, learned working guidance and the recent notes.

## Step 3: what the tools show, live

Read [operational evidence](../gtmb-use-brain/references/operational-evidence.md).
Resolve conflicts and date unverified historical claims before recommending a next step.

Check only sources needed for the requested brief: for example, the CRM record for deal
state or the named email thread for its latest reply. Reuse saved source pointers. A simple
identity question ends when identity is established; it does not trigger a full deep dive.
Expand to other tools or public news when the requested scope calls for them.

## Step 4: the brief

One page, every line traceable to a note or a tool read. Use these six bold labels word for
word, in this order, also for a short call brief; a section with nothing says "none recorded":

    **<Subject>** (<kind>, in <contexts>)
    **Where it stands.** three to five sentences
    **Timeline.** the dated notes, oldest first, one line each with the source
    **People.** who is who on their side and ours
    **Open.** the open questions and anything unresolved in the tools
    **Next.** one suggested next step, the note it follows from (date, who said it) and why

A source is a date and where it came from ("note, 14 October 2026, Market"), never a file path.
When no tool is connected, say so in one line under the header.

The reply's last line is always the one offer: "Shall I record the open items as questions?"
(and, when a tool showed something the brain lacks, those facts as notes with their sources).

## Hard rules

- No invention: what neither the brain nor a tool says is marked unknown.
- Tools are read, never written; nothing is copied in full.

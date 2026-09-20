---
name: gtm-os-deepdive
description: |
  A one-page brief on one entity (a company, a person, a deal) or one context: everything the
  brain knows, in order, plus what the connected tools show live, with open questions and a
  suggested next step. Triggers: "/gtm-os-deepdive", "deep dive on Nestle", "brief me on
  Pierre Dupont", "everything about the Berlin expansion", "prepare me for the call with".
allowed-tools: [Bash, Read, WebSearch, WebFetch]
---

# GTM OS: Deep dive

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: before a call or a decision, one page with what we know, where it comes from,
> what is open, and what to do next.

## Step 1: the subject

For an entity, follow [entity search](../gtm-os-use-brain/references/entity-search.md).
`query` (entities) with the name returns an exact identity or unconfirmed candidates. A context:
`load_context` (`mode: add`). Unknown name: say so and offer the closest matches from `query` (entities).

## Step 2: what the brain knows

`query` (brief) with `search` = the entity = the resolved name or ID for a person, organization or product.
Add `context` when the person asks for that perspective; use `query` for an unregistered topic.
Read the existing cited brief first. When it needs refreshing, follow
[entity compilation](../gtm-os-use-brain/references/entity-compile.md) before the live checks. For a context, the loaded block already holds the
summary, learned working guidance and the recent notes.

## Step 3: what the tools show, live

Read [operational evidence](../gtm-os-use-brain/references/operational-evidence.md).
Resolve conflicts and date unverified historical claims before recommending a next step.

Check only sources needed for the requested brief: for example, the CRM record for deal
state or the named email thread for its latest reply. Reuse saved source pointers. A simple
identity question ends when identity is established; it does not trigger a full deep dive.
Expand to other tools or public news when the requested scope calls for them.

## Step 4: the brief

One page, in this order, every line traceable to a note or a tool read:

    **<Subject>** (<kind>, in <contexts>)
    **Where it stands.** three to five sentences
    **Timeline.** the dated notes, oldest first, one line each with the source
    **People.** who is who on their side and ours
    **Open.** the open questions and anything unresolved in the tools
    **Next.** one suggested next step, and why

Then offer once: record the brief's new facts as notes (only what came from the tools and is
not in the brain yet, with sources), and record the open items as questions.

## Hard rules

- No invention: what neither the brain nor a tool says is marked unknown.
- Tools are read, never written; nothing is copied in full.

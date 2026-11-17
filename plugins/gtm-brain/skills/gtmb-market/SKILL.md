---
name: gtmb-market
description: |
  Fill or update the market document, one of the five base documents: who we compete with, how
  buyers choose, where we win and lose, and the prices a source shows. A draft from the notes
  already in the brain and the competitors' websites the person names, shown first and saved on
  their yes. Triggers: "/gtmb-market", "fill in the market", "describe our market", "who do we
  compete with", "update the market document", "add a competitor". For sourced desk research on
  one market with a report, that is gtmb-market-research.
allowed-tools: [Bash, Read, WebFetch, WebSearch]
---

# GTM Brain: Market

The market document is `market.md` among the base documents. Codex reads it before positioning,
outreach, pricing and competitive work. This skill fills it where it lies; it never creates a
second market document.

> For humans: say `/gtmb-market` and name your two or three main competitors. You get a short
> draft to correct in about five minutes.

## What to do

Read [mentor rules](../gtmb-use-brain/references/mentor-rules.md) once; they hold here.

1. Read what the brain already holds, in exactly three reads: `query` with object `memories`
   and `filters: { "context": "market" }` (every market note: the list step 4 is checked
   against); `query` with object `answer` and `search` the competitors' names plus
   "competitor pricing lost won" (their notes in other contexts); and `document` with
   `action: show`, `ref: market` for what the document says now. No other read.
2. Ask one question, with the host's question form: which competitors matter most (offer the
   names the notes already show as choices, the person's own answer last). Skip the question
   when the person named them in the request.
3. Open the websites of the competitors named, the home page and the pricing page, nothing
   else, and only for the names the person gave or confirmed. Use the site the brain or the
   person gives; with none, always run one search per competitor to find its own site, and
   take nothing from the search results themselves. Only after that search or the page read
   has failed, keep one line for step 5: "<name>: website not read, this rests on our notes alone" (or "on
   your report alone").
4. Draft under the starter's own headings. Name only competitors, claims and prices a source
   shows, each with its source and date. What the team believes without a source is written
   as a belief, in the person's words.
   - Carry every market note the reads returned into the draft once, under the heading it
     fits: a quoted price under Pricing in the market, what buyers compare under how we win
     and lose, doing nothing or a manual process that a note names as an alternative under
     Competitors and under how we lose. Before step 5, tick each note off against the draft.
     Never write that nothing is held on a competitor a note names.
   - A heading with no note of its own stays empty: never repeat a fact from another heading
     to fill it ("Trends we watch" needs a note about a change over time).
   - An addition to a filled document changes only the lines it adds.
5. The save question, in one message: paste the draft's opening lines word for word (under
   500 characters, from the first filled heading; for a single addition, the exact lines to
   be added and the heading each goes under), then the lines kept in step 3 and any
   assumption (a currency, a date), then ask once below them: "Save it as approved",
   "Save it as a draft", "Change something". No choice is marked as recommended. Nothing is
   written before that answer.
6. Save with `document`, `action: update`, `ref: market`, the body, the status and the person's
   `by`. Battle cards and reports go in `market/` beside it. In a brain with an owner, a
   teammate's save becomes a proposal for the owner: say so in one line.
7. Keep each competitor the person named or confirmed as an organization linked to us, so it
   connects across notes and deals: one `remember` call, a note per competitor in the Market
   context, one plain sentence ("Northfold is a competitor of ours; buyers compare us on price."), the
   competitor in `companies`, and `relation` with `from` the competitor, `type`
   `competes_with`, `to` `us` ([relationships](../gtmb-use-brain/references/relations.md)). A
   competitor's product the person named is a product with its `maker`. When the schema has no
   `competes_with` type (a brain made before it shipped), save the note without `relation` and
   offer once to add the type with `/gtmb-schema`.
8. The reply after the save is two lines, always: what the document now covers (with the
   step 3 line for any website not read), and "Codex reads it before positioning, outreach,
   pricing and competitive work." Then offer once, in
   one line: `/gtmb-market-research` for sourced desk research on a market or a segment.

The procedure in full, shared with the other base documents:
[documents, Fill a starter](../gtmb-use-brain/references/documents.md#fill-a-starter).

## Boundaries

- Where it saves: the document in `market.md`; who the competitors are as organizations with
  the `competes_with` relationship (step 7); nothing else.
- A document's content is never also saved as notes: the competitor notes of step 7 say only
  who competes with us, never the analysis. A decision the person makes while
  correcting the draft ("we stop competing on price") is saved once with `remember`.
- Never invent a competitor, a market size or a price. An empty heading is correct when the
  brain and the named websites do not say.
- No research beyond the named competitors' own pages: the wider read is `gtmb-market-research`.

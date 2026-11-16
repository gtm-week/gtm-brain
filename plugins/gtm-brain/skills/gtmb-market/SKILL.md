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

1. Read what the brain already holds: `query` with object `answer` for the market, the
   competitors and why deals are won or lost, and `document` with `action: show`, `ref: market`
   for what the document says now. One or two reads; no file reads.
2. Ask one question, with the host's question form: which competitors matter most (offer the
   names the notes already show as choices, the person's own answer last). Skip the question
   when the person named them in the request.
3. Read the websites of the competitors named, the home page and the pricing page, nothing
   else. This is the one web read this skill makes, and only for the names the person gave or
   confirmed.
4. Draft under the starter's own headings; leave a heading empty rather than guess. Name only
   competitors, claims and prices a source shows, each with its source and date. What the team
   believes without a source is written as a belief, in the person's words.
5. Show the draft's first lines (under 500 characters) and ask once: "Save it as approved",
   "Save it as a draft", "Change something". Nothing is written before that answer.
6. Save with `document`, `action: update`, `ref: market`, the body, the status and the person's
   `by`. Battle cards and reports go in `market/` beside it. In a brain with an owner, a
   teammate's save becomes a proposal for the owner: say so in one line.
7. One line back: what the document now covers and that Codex reads it before that kind of
   work. Then offer once, in one line: `/gtmb-market-research` for sourced desk research on a
   market or a segment.

The procedure in full, shared with the other base documents:
[documents, Fill a starter](../gtmb-use-brain/references/documents.md#fill-a-starter).

## Boundaries

- A document's content is never also saved as notes. A decision the person makes while
  correcting the draft ("we stop competing on price") is saved once with `remember`.
- Never invent a competitor, a market size or a price. An empty heading is correct when the
  brain and the named websites do not say.
- No research beyond the named competitors' own pages: the wider read is `gtmb-market-research`.

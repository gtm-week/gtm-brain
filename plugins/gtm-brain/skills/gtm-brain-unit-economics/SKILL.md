---
name: gtm-brain-unit-economics
description: |
  Review whether growth is economically healthy (CAC, LTV over 12 and 24 months, LTV:CAC, both
  paybacks, retention) and decide PUSH, FIX, STOP or MEASURE, overall and per acquisition source
  (paid, outbound, partners, referrals, organic), segment or cohort. Inputs come from the chat and from the brain (pricing, spend and churn notes, the
  strategy). Triggers: "/gtm-brain-unit-economics", "can we spend more on growth", "is our CAC
  ok", "LTV to CAC", "payback", "compare acquisition sources", "which segment should we push", or CAC,
  churn or cohort data shared in the chat.
allowed-tools: [Bash, Read]
---

# GTM Brain: Unit economics

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: before you raise, cut or move growth spend, one review that checks the numbers
> are comparable, shows what drives them, and ends in one decision and at most three actions.
> The method is Lech Kaniuk's unit economics review.

## Step 1: the inputs

Read [the method](references/method.md) once; its steps and rules govern every calculation.

Take the numbers the person gives in the chat first. Then look for what the brain already
holds, and say where each number came from:

- `document` (list, then show) for pricing, the strategy and any plan that names ARPU, margin,
  spend or targets. A document beats a note when the two disagree; say so.
- `query` on `memories` with a search for the terms in play (CAC, churn, ARPU, spend, retention,
  cohort, the acquisition source or segment names) and, when the review is about one context, load that
  context (`load_context`, `mode: add`) and read its summary and notes.
- A connected CRM or billing tool is read only when the person asks for a live number; the
  brain's dated notes are the default. Follow
  [operational evidence](../gtm-brain-use-brain/references/operational-evidence.md).

Ask through `question` only for what changes the decision and is nowhere to be found: the
customer unit, the sales cycle in months, the period the spend and the new customers cover,
whether the spend is fully loaded. One question at a time, a concrete proposal first
("Customer unit is the account, not the seat?"). Do not ask for cohort data a Tier 2 business
does not need.

## Step 2: the review

Follow the method's Step 0 to Step 6 in order: tier, definitions, core metrics in monthly
units, segments only where they could change a decision, the one main constraint, current
initiatives, then the decision with the evidence test for `PUSH`. Show the formulas and every
assumption. Ranges where inputs are uncertain. Never a lifetime LTV as the headline.

Present the result in the method's output format: tier and definitions, core metrics table,
segment table, main constraint, the headline decision in one line, up to three actions each
with its metric, review period and stop condition, and the missing data that could change
the conclusion.

## Step 3: keep it

Offer once, through `question`, to record the review:

- One note (`remember`, kind `decision`) in the context the review belongs to (Strategy when
  none is named): the headline status, the metrics with their inputs and assumptions, the up
  to three actions with their review dates. Source: this review, plus the documents and notes
  the numbers came from.
- Each `MEASURE` item as an open question (`remember`, kind `question`), so it appears in
  `gtm-brain-todo` until the input is collected.

Nothing is written before the person answers yes.

## Hard rules

- The brain and the tools are read; budgets, campaigns and external systems are never
  changed here. Any such change is the person's, with its own approval.
- Every number carries its source or is labelled estimate, proxy or assumption.
- Follow the method's rules in full: monthly units, fully loaded CAC or "paid CAC", both
  paybacks beside LTV:CAC, no universal target ratio, no `PUSH` that fails the evidence test.

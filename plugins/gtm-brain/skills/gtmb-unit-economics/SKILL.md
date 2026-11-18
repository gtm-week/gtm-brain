---
name: gtmb-unit-economics
description: |
  Review whether growth is economically healthy (CAC, LTV over 12 and 24 months, LTV:CAC, both
  paybacks, retention) and decide PUSH, FIX, STOP or MEASURE, overall and per acquisition source
  (paid, outbound, partners, referrals, organic), segment or cohort. Inputs come from the chat and from the brain (pricing, spend and churn notes, the
  strategy). Triggers: "/gtmb-unit-economics", "can we spend more on growth", "is our CAC
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
Read [mentor rules](../gtmb-use-brain/references/mentor-rules.md) once; they hold here.

Take the numbers the person gives in the chat first. Then look for what the brain already
holds, and say where each number came from:

- `document` (list, then show) for pricing, the strategy and any plan that names ARPU, margin,
  spend or targets. A document beats a note when the two disagree; say so.
- `query` on `memories` with a search for the terms in play (CAC, churn, ARPU, spend, retention,
  cohort, the acquisition source or segment names) and, when the review is about one context, load that
  context (`load_context`, `mode: add`) and read its summary and notes.
- A connected CRM or billing tool is read only when the person asks for a live number; the
  brain's dated notes are the default. Follow
  [operational evidence](../gtmb-use-brain/references/operational-evidence.md).

Ask only for what changes the decision and is nowhere to be found: the
customer unit, the sales cycle in months, the period the spend and the new customers cover,
whether the spend is fully loaded. One question at a time, a concrete proposal first
("Customer unit is the account, not the seat?"). Do not ask for cohort data a Tier 2 business
does not need.

The sales cycle is the one input the review cannot do without. When neither the brain nor
the chat holds it, the first reply is that question alone, with the customer unit you will
assume in the same line ("How long from first touch to paying customer? I will count one
customer as one account."), and no numbers yet. A list of missing inputs at the end of a
review does not replace it.

## Step 2: the review

Follow the method's Step 0 to Step 6 in order: tier, definitions, core metrics in monthly
units, segments only where they could change a decision, the one main constraint, current
initiatives, then the decision with the evidence test for `PUSH`. Show the formulas and every
assumption. Ranges where inputs are uncertain. Never a lifetime LTV as the headline.

Present the result in the method's output format, all seven parts in its order: tier and
definitions, core metrics table, segment table, main constraint, the headline decision in one
line, up to three actions, and the missing data that could change the conclusion. Check these
before sending:

- The question asked is the scope. "Is our growth healthy?" covers every acquisition source
  the brain or the chat has spend or customers for, not only the one the person is about to
  spend on.
- More than one source known: the segment table is mandatory, one row per source with its
  sample size, confidence and status, also at one customer. Every source under about 30 new
  customers says "low confidence" in its row and cannot be `PUSH`.
- CAC is a single number only when the window is at least twice the sales cycle and spend
  was stable. Otherwise it is a range, with the direction of the bias in words ("overstated:
  deals from this spend are still open").
- Every number cites its note (date and context); a stand-in says so ("gross margin used as
  a proxy for contribution margin").
- Each action carries its metric, a calendar review date and a stop condition the company
  can reach.
- The reply's last line is the Step 3 offer, in one sentence ("Shall I record this decision in
  Strategy and add the missing inputs as open questions?"); a next-step summary does not
  replace it.

## Step 3: keep it

Offer once to record the review:

- One note (`remember`, kind `decision`) in the context the review belongs to (Strategy when
  none is named): the headline status, the metrics with their inputs and assumptions, the up
  to three actions with their review dates. Source: this review, plus the documents and notes
  the numbers came from.
- Each `MEASURE` item and each line of the missing data as an open question (kind
  `question`), so it appears in `gtmb-todo` until the input is collected. The note and the
  questions go in one `remember` call.

Where it saves: the decision note and the open questions above, nothing else. A price the person
confirms for one of our offerings is said in the note with the offering named, so its `price`
field fills from it; no document is changed.

Nothing is written before the person answers yes. If an answer changes an input or a flag
after the review was shown, show the changed lines of the review first, then save: the note
never holds a conclusion the person has not seen in the chat.

## Hard rules

- The brain and the tools are read; budgets, campaigns and external systems are never
  changed here. Any such change is the person's, with its own approval.
- Every number carries its source or is labelled estimate, proxy or assumption.
- Follow the method's rules in full: monthly units, fully loaded CAC or "paid CAC", both
  paybacks beside LTV:CAC, no universal target ratio, no `PUSH` that fails the evidence test.

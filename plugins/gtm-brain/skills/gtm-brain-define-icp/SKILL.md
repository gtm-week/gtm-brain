---
name: gtm-brain-define-icp
description: |
  Define or refine an ideal customer profile through Chris Pawlak's exploratory interview:
  company examples, firmographics, exclusions, buying committee, problems, awareness and
  buying readiness. Reuse the brain's evidence and keep one draft ICP document.
  Triggers: "/gtm-brain-define-icp", "define our ICP", "ideal customer profile interview",
  "refine our target customer definition". Not market desk research or campaign execution.
metadata:
  author: Chris Pawlak
allowed-tools: [Bash, Read]
---

# GTM Brain: Define ICP

By Chris Pawlak. Read [the method](references/method.md) once and follow its ten areas and
five-part output. This workflow adapts his standalone Define ICP interview to GTM Brain.
Conduct the conversation and author the document and brain records in English. Preserve
names, source quotes and the exact token `APPROVE`.

## 1. Reuse the evidence

Reuse the session's resolved person, company and offering. Use `query` (status) only if this
state is missing. Follow [context routing](../gtm-brain-use-brain/references/context-routing.md):
load Target customers (`icp`, `mode: add`) for the interview, respecting an explicit existing
scope. Keep other loaded contexts. Do not create a new context for an ICP or an example account.
Pass the resolved `brain` and, when the session names one, `project` on tools that support it.

Use `document` (`action: list`, then `action: show`, `ref` from the result) to find and read
an existing ICP, strategy, market research and relevant standing documents in full. Say which
you followed; a draft is the best available guidance, not validated truth. Read relevant
Target customers memories with `query`, reusing dated evidence and source pointers. Neither
Strategic intake nor Market desk research is a prerequisite. Do not open the dashboard,
refresh summaries, sync tools or launch broad research before beginning.

Prefer an existing ICP regardless of its title or location; do not make a second one because
its filename differs. Ask a focused question only when multiple candidates make the destination
ambiguous. Before proposing an update, read the selected document through `document` (`action: show`);
a listing or remembered excerpt is not its full content. Preserve useful prior evidence and
mark corrections, hypotheses and unknowns. Keep prior supporting observations that the new
interview does not repeat; silence is not a correction or permission to discard evidence.
Fictional demonstrations must never become real company evidence.

## 2. Interview

Open briefly: we will define near-term company fit, who participates in buying and what shows
need, budget and trust, using what is already known. We will start with at least three actual
or desired examples, then generalize the pattern, and keep a working draft. Anonymized examples
are welcome; fewer are fine when unavailable or declined. Do not promise a fixed completion time.

Follow [question handling](../gtm-brain-start/references/questions.md). Use the everyday
`question` tool, not configuration or onboarding questions. Ask one focused question at a
time; put the full interview question in the free-text form without preset choices. Reuse
answers, skip covered areas and accept uncertainty, skips and confidential ranges. Follow the
question procedure for unanswered, declined, cancelled and not_shown results; no default or
timeout is an answer. Do not ask again for a third company after the person says none is available.

The method covers examples, the wider near-term company pattern, anti-profile, typical buying
committee, company gains, distinct personal problems/KPIs/proof, five awareness levels, budget,
need now and trust. Do not turn one account's purchase history into a segment-wide decision path.
Unknown is not disqualified; title is not decision authority; engagement is not trust.

## 3. Keep one working draft

Use [Your documents](../gtm-brain-document/SKILL.md) and the current `document` tool contract.
Synthesize the method's five parts when there is enough for a useful draft, including when the
person stops with gaps. Never claim that interview agreement validates the market.

- Before a new synthesized document, confirm once through `question`: show the title,
  destination and first rules briefly, with "Keep as a draft" and "Change something" choices.
  For an update, quote the substantive change and confirm it. Reuse an explicit instruction
  to save or update this exact draft; do not ask for the same authorization twice. This is a
  document save decision, not a mandatory full-profile presentation or market-validation ceremony.
- Pass only Markdown content in `body`, starting with a heading, never YAML frontmatter.
  The document tool owns `kind`, title, status, author and other metadata.
- If absent, call `document` with `action: create`, `title: Ideal customer profile`,
  `applies_to: [targeting, prospecting, outreach, qualification]`, `body`, `status: draft`
  and the resolved `by`. Default to the brain root; use `folder` only for a suitable folder
  the person named. The API generates `ideal-customer-profile.md`; it does not offer an exact
  filename argument. Do not hand-write `ideal customer profile.md` to work around this.
- If present, call `document` with `action: update`, the existing `ref`, the complete revised
  `body` preserving prior evidence, and `status: draft`. Retain its title, path and scope unless
  the person requests changes. An existing approved document becomes a revised draft only
  after the update is authorized; explain that in the confirmation.
- Read the result through `document` (`action: show`) to verify the saved draft and link its
  actual returned path. Never claim a failed write succeeded.

Follow the document rule: do not duplicate the synthesized document as memories. Distinct new
customer findings or explicit targeting decisions from the interview follow the ordinary
[remember procedure](../gtm-brain-use-brain/references/remember.md) in Target customers, with
sources and entity references, preserving the person's exact words. Do not turn every unknown
into a brain-question, and do not save an unsent draft, proposed action or fictional example as
company knowledge. Respect a request not to save and any explicit context restriction.

Finish in one to three sentences: link the draft, name the highest-impact remaining evidence
gap and the next useful step. Do not paste its tables into chat.

## Boundaries

Do not execute campaigns, change CRM records, redesign the offer or launch broad research.
Keep current customers separate from desired accounts, current fit from future fit, and
company problems from persona motivations. Never invent examples, numbers, private motives,
approval limits, access or observable signals. Runtime customer details belong in that brain,
never in this reusable skill.

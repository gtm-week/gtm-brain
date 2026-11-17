---
name: gtmb-icp
description: |
  Define or refine an ideal customer profile through Chris Pawlak's exploratory interview:
  company examples, firmographics, exclusions, buying committee, problems, awareness and
  buying readiness. Reuse the brain's evidence and keep one draft ICP document.
  Triggers: "/gtmb-icp", "define our ICP", "ideal customer profile interview",
  "refine our target customer definition". Not market desk research, campaign execution or
  saving an ICP already written (gtmb-use-brain, references/documents.md).
metadata:
  author: Chris Pawlak
  needs: "kind:organization, kind:person, field:organization.industry, field:organization.size"
allowed-tools: [Bash, Read]
---

# GTM Brain: Define ICP

By Chris Pawlak. Read [the method](references/method.md) once and follow its ten areas and
five-part output. This workflow adapts his standalone Define ICP interview to GTM Brain.
Conduct the conversation and author the document and brain records in English. Preserve
names, source quotes and the exact token `APPROVE`.
Read [mentor rules](../gtmb-use-brain/references/mentor-rules.md) once; they hold here.

## 1. Reuse the evidence

Reuse the session's resolved person, company and offering. Use `query` (status) only if this
state is missing. Follow [context routing](../gtmb-use-brain/references/context-routing.md):
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

The first reply opens briefly, in chat text: we will define near-term company fit, who
participates in buying and what shows need, budget and trust, using what is already known. We
will start with at least three actual or desired examples, then generalize the pattern, and
keep a working draft. Anonymized examples are welcome; fewer are fine when unavailable or
declined. Do not promise a fixed completion time. Then, in the same reply, name the examples
and the method areas the brain's notes already cover, in two or three lines, and ask the first
question about what is missing. Never ask the person to list again accounts the brain holds:
ask what makes each a good fit, or which is missing.

Every interview question is free text in the chat, one area per turn, with no preset choices,
no numbered options and no form (mentor rules, 1); only the save question below follows
[question handling](../gtmb-start/references/questions.md). Every turn before the draft ends
with a question. Reuse answers, skip covered areas and accept uncertainty, skips and
confidential ranges; no default or timeout is an answer. Do not ask again for a third company
after the person says none is available.

Keep a list of the ten areas: covered by the brain, covered by the person, open. Write the
draft when none is open or the person chooses to stop. If the person asks whether anything
else is needed, name the open areas in one line and ask the next one; "I can write it now" is
not an answer while areas are open and the person has not asked to stop.

The method covers examples, the wider near-term company pattern, anti-profile, typical buying
committee, company gains, distinct personal problems/KPIs/proof, five awareness levels, budget,
need now and trust. Do not turn one account's purchase history into a segment-wide decision path.
Unknown is not disqualified; title is not decision authority; engagement is not trust.

## 3. Keep one working draft

Use [documents](../gtmb-use-brain/references/documents.md) and the current `document` tool contract. Setup writes `icp.md` as a starter: keep the ICP there (`action: update`, `ref: icp`), never a second ICP document.
Synthesize the method's five parts when the areas are covered or the person stops with gaps.
A line the person did not say and no note holds is a hypothesis and says so; an option you
offered and the person did not take is left out. Never claim that interview agreement
validates the market.

- Before a new synthesized document, confirm once: show the title,
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

Where it saves: segments, exclusions and the buying committee are sections of `icp.md`; they
are descriptions, never entities, so no person or organization is created for a segment or a
persona. A real customer the person places in a segment, and a real person whose part in the
buying decision they state, is said in one note in Target customers ("Acme Retail is in the
mid-market retail segment", "Anna Lind is the decision maker at Acme Retail"), with the
company and the person named: the schema's `segment` field on the organization and
`buying_role` field on the person fill from those notes, with the note as their source. A
brain whose schema lacks those fields keeps the notes all the same; offer `/gtmb-schema` once.

Follow the document rule: do not duplicate the synthesized document as memories. Distinct new
customer findings or explicit targeting decisions from the interview follow the ordinary
[remember procedure](../gtmb-use-brain/references/remember.md) in Target customers, with
sources and entity references, preserving the person's exact words. They are saved once, after
the document, in one `remember` call, never turn by turn. Before that call compare each item
with the Target customers notes read in step 1 and drop every restatement of a fact or
decision already recorded. A pilot or a desired account is never called a customer, and a
platform or a product (a shop system, a connector) is never registered as a company. Do not turn every unknown
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

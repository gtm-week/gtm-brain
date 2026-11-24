---
name: gtmb-topic-analyzer
description: |
  Given the ICP, analyze the conversations its members are having and the questions, problems
  and decisions they discuss, using observed posts, engagement or supplied conversations.
  Triggers: "/gtmb-topic-analyzer", "given our ICP, what conversations are they having?", "what is our ICP discussing?",
  "analyze our topics", "which topics matter to our buyers".
  Includes ICP engagement and post collection for topic research. Not audience expansion or
  tracking-list admission (gtmb-audience-loop),
  market sizing (gtmb-market-research), or finished post writing.
allowed-tools: [Bash, Read]
---

# GTM Brain: Topic analyzer

Answer **Given our ICP, what conversations are they having?** Begin with the selected ICP
and its observed conversations, then derive recurring questions, problems and decisions.
Topic priorities and possible contribution angles follow from that evidence and its relevance
to the offering. Keep seller-generated ideas separate from what the audience actually says.

Audience Loop is introduced first as the way to find relevant people and conversations.
It is optional here: an existing ICP list, CRM segment or supplied conversation evidence is
enough to start. Interviews and CRM notes are valid audience conversations alongside posts
and replies. If ICP fit or participation is unverified, label the analysis exploratory and
state the gap rather than claiming these are qualified buyers' conversations.

For saved Up2Data JSON, **start by running the bundled evidence reader**:
`node <this-skill-directory>/scripts/read-evidence.mjs <evidence-directory> --as-of <review-time>`.
Use its statement records, counts and date/policy checks; do not recreate the provider parser
with ad hoc field guesses. Then follow [source review](references/source-review.md):
verify central quotations with `--record`/`--quote`; use `--view identities` only for role
assessment; check any proposed opening with `--post`, `--formats` and `--branch`. The answer
is unfinished until those source checks are complete. Before sending, pass the complete draft
through `--check-citations` as described in the method and correct unmatched URLs. This is
local reading, not paid collection.

Use [the method](references/method.md) to understand the ICP's conversations. Any supplied ICP list
is a first-class starting point: a pasted list, file, CRM segment or saved list, regardless of
whether the Audience Loop has run. This skill owns the scoped collection and analysis needed
for that list. Customer interviews, CRM notes and supplied post evidence are also valid inputs.
No Audience Loop output, host registry, admission decision or completed run is a prerequisite.

## Frame the analysis

Reuse the resolved brain, person and project. Follow [context routing](../gtmb-use-brain/references/context-routing.md)
and load an existing fitting context. Read strategy first, then ICP and the selected offering
through `document`. Read relevant memories and the last topic report before asking for gaps.
State which guidance applies. Keep offering/profile assessments separate.

Resolve objective, intended audience, source set, time window and research authority from
existing instructions or one focused question using [question handling](../gtmb-start/references/questions.md).
A missing source is a gap, not permission for paid collection. Read
[collection and evidence](references/evidence.md) before live research.

## Build evidence from the input list

For a list-led run, follow the method's independent ICP route: resolve and deduplicate the
supplied identities, preserve their stated qualification and unknowns, then reuse or collect
observed engagement and original post text within the agreed scope and authority. Keep the
input list snapshot and ICP-to-engagement-to-post provenance with the run. An unverified seed
can inform labelled exploratory analysis; it cannot establish qualified buyer demand.

Resolve authors as needed for attribution. If the scope includes host-corpus expansion, collect
bounded authored-post samples and distinguish these from posts the input ICPs actually engaged
with. Host discovery here supports topic evidence; it does not admit hosts or expand the ICP list.
Missing access produces a coverage gap or a request for source evidence, not a requirement to
run the Audience Loop. Reuse the collector's request ledger and resume without duplicate launches.

## Analyze and review

Before producing contribution recommendations, apply the shared
[contribution eligibility contract](references/contribution-filtering.md). Resolve company parameters,
bind assessments to evidence and profile revisions, and feed every recommendation and export
from the same eligible set. Keep broad research inventory separate from eligible opportunities.

Plain topic research from interviews or CRM notes does not require a post-format policy or readable LinkedIn replies. Seller drafts are not independent buyer evidence. A later source can change timing without changing deal stage.

Cluster by the audience's underlying problem or question, preserving source wording.
Compare relevance, recurrence, urgency and confidence independently. Produce a compact table:
topic, audience/problem, independent evidence and dates, contradictory evidence, relevance,
confidence, proposed angle and next validation. Include weak or rejected themes when they
change the priority decision. A shortage of evidence is an acceptable result.

For a founder asking what to learn from their audience, lead with one recurring question
in the audience's words, who raised it and one concrete question still worth exploring.
Label a single observation as a hypothesis. Use a dated source link or reference. Keep a
historical theme separate from an invitation to join a live thread.

Show the shortlist and ask what to accept or correct before retaining priorities as decisions.
An accepted topic is a priority for exploration, not proof of demand or approval to publish.

## Retain and hand off

Follow [documents](../gtmb-use-brain/references/documents.md) for a report document with status
draft, or a project draft in its established destination. Keep accepted findings and decisions
with `remember`, source references and profile scope in the existing context. Preserve rejected
ideas and reasons when they prevent repeated recommendations. Never directly edit memory files.

For a single requested finding, link only existing verified entities; do not create or resolve
people merely to tag the note. Keep unresolved names in its prose. Supply sources as
`provider:reference` or a direct URL, and distinguish the event date from the evidence snapshot.
Read back the saved record before reporting success; a continuation reads it without saving
the same finding again.

For a staged execution, use the separate manual Topic analysis workflow through `workflow`.
Only that tool writes run state. Resume its current step and execute only that stage of this
skill; do not rerun completed collection or restart the full analysis at every step.

An optional handoff to [Audience loop](../gtmb-audience-loop/SKILL.md) contains accepted topic
IDs/report reference, audience/profile, discovery queries and unresolved evidence questions.
The receiving workflow qualifies people independently; topic fit does not establish ICP fit.
The audience loop can return source pointers for a later topic analysis without starting one.

Finish with the report, accepted priorities and unresolved gaps. Do not publish, send outreach,
admit people to tracking lists, schedule runs or send Slack reports through this skill.

When live source access is missing or the person asks to connect Up2Data, follow
[Up2Data onboarding](references/up2data-onboarding.md). Offer supplied-file analysis as an alternative;
verify account access separately from paid research authorization and collector readiness.

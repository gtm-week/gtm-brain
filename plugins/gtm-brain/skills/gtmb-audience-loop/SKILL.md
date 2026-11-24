---
name: gtmb-audience-loop
description: |
  Identify who fits the ICP and find relevant conversations from supplied or authorized evidence.
  Triggers: "/gtmb-audience-loop", "run the audience loop", "who fits our ICP?", "where are relevant conversations happening?", "find relevant conversations", "which LinkedIn conversation should I join?",
  "who replied to me on LinkedIn?", "what should I do on LinkedIn today", "who do I owe a reply on LinkedIn".
  Keeps sourced candidate assessments and opportunities. Not topic prioritization
  (gtmb-topic-analyzer), broad source sync (gtmb-sync), or outreach execution.
allowed-tools: [Bash, Read]
---

# GTM Brain: Audience loop

Start with the audience. Answer the question the person asked: **Who fits our ICP?**
or **Where are relevant conversations happening?** A request to assess people does not
require a conversation recommendation; a request to find conversations does not require
expanding a tracking list. Assess people, hosts and openings with their own evidence.

Introduce Audience Loop before Topic Analyzer when explaining the pair. Topic Analyzer asks
what the selected ICP is discussing; it can use an existing list or supplied evidence directly.
An evidence handoff is optional, not a requirement to run the two skills in sequence.

For saved Up2Data JSON, **start by running the bundled evidence reader**:
`node <this-skill-directory>/../gtmb-topic-analyzer/scripts/read-evidence.mjs <evidence-directory> --as-of <review-time>`.
Use its statement records, counts and date/policy checks; do not recreate the provider parser
with ad hoc field guesses. Then follow [source review](../gtmb-topic-analyzer/references/source-review.md):
verify central quotations with `--record`/`--quote`; use `--view identities` only for role
assessment; check any proposed opening with `--post`, `--formats` and `--branch`. The answer
is unfinished until those source checks are complete. This is local reading, not paid collection.

Follow [the method](references/method.md). Run independently from the topic analyzer: accepted
topics are optional discovery seeds, not prerequisites or qualification evidence.

## Resume and frame

Reuse the resolved brain, person and project. Follow [context routing](../gtmb-use-brain/references/context-routing.md)
and load the existing fitting context. Read strategy, ICP, selected offering, prior candidate
assessments, feedback and unresolved collection/delivery state before starting new work.
State the guidance and profile in use. Resolve audience geography, source set, freshness window,
result target, list admission rules and collection authority from company instructions.
For a direct conversation request, use the requested time and number of threads as the scope.
Tracking-list rules and a report destination matter only when the request includes that work.
For a short session, check available source access before asking for configuration. If there
is no readable discussion, name that gap and offer to assess a pasted post and its relevant
replies. Do not make the founder complete setup to learn that access is missing. Reuse saved
guidance and infer scope from the request; no tracking list, taxonomy document or staged run
is required for this route.
On first use, if contribution guidance is incomplete, use a supplied post to show what the
participants are discussing. Identify the specific missing decision and propose a small
run-scoped choice grounded in the founder's offering. Wait for their answer before using it
to recommend a contribution. Keep the example available even if they end the session there. Express the proposed scope in
plain language (which audience, subjects and kinds of conversations to consider), deriving
internal topic IDs and revision references yourself. Do not ask the founder to author a schema.
Ask only for material gaps through [question handling](../gtmb-start/references/questions.md).

If using the manual Audience discovery workflow, `workflow` is the only run-state writer.
Resume its current step, performing only that stage here. Keep provider request state in the
existing collector and its ledger, separate from the workflow's progress notes.

## Discover and assess

Before producing contribution recommendations, apply the shared
[contribution eligibility contract](../gtmb-topic-analyzer/references/contribution-filtering.md). Resolve company parameters,
bind assessments to evidence and profile revisions, and feed every recommendation and export
from the same eligible set. Keep broad research inventory separate from eligible opportunities.

Use available connected sources and dated supplied evidence. Before collection, follow
[collection and evidence](../gtmb-topic-analyzer/references/evidence.md).
Review useful cached conversations and productive tracked hosts first. Expand through relevant
buyer activity and focused recent searches only where the target still has a gap. Review each
stage before spending more. Enrich a post only to resolve a specific source, audience or timing
question. Stop at the requested quality target or authorized limits and state any shortfall.

Supplied unpublished posts are research material, not live discussions. Respect exclusions in their stated scope: research relevance is separate from net-new outreach eligibility. Reconcile company IDs and domains before applying exclusions.

Label every candidate at capture as ICP, conversation host or both. Preserve separate evidence
status and admission status for each role. Verify authorship, timing and a useful contribution
before recommending a conversation. Search terms, titles and popularity never qualify people
by themselves. Keep nominations separate from admitted tracking members.

## A founder asking where to spend a few minutes

Use the direct skill for this question. Use the saved profile, contribution policy and available
evidence. Keep the shortlist within the requested time. First check for a sourced reply to the
founder or a commitment they made in a prior thread. Compare that opening with eligible new
threads under the company ordering. Explain the choice in one sentence. A prior interaction is
only a reason to return when there is something new to address.

Lead with one conversation to open. Link to the comment when its permalink is available,
otherwise link to the post and name the speaker. In a few lines show what they said, what
the replies already settled, and the specific observation or question the founder could add.
Mention a material uncertainty where it affects that choice. Provide draft wording only on
request and use the founder's voice guidance and the language of the exchange. If the founder requested a draft in the original request, provide it now without asking again.
Keep private
customer details and unsupported first-person experience out of the draft.

When nothing passes the live discussion check, distinguish no useful opening in the reviewed
threads from insufficient access to judge. State the reviewed scope, then one useful next step;
do not imply that LinkedIn has no worthwhile conversations. When the
founder supplies a new thread or reply, assess it directly. Keep the full candidate report for
discovery requests or configured deliveries with their own required format.

## Review and retain

For a discovery report, include the discussion opening, link, event date/age, selected profile, target audience,
why it matters, source limitations and useful contribution angle. When candidate review is in scope, present proposals
separately with per-role evidence and an explicit approve/hold/reject recommendation.
Do not invent comment text when only research was requested.

Follow [documents](../gtmb-use-brain/references/documents.md) for the report destination and
`remember` for sourced observations and explicit review decisions. Reuse existing entity IDs;
never create a second people store. Change a tracking list only under its documented admission
rule and through its owning supported tool. A positive opportunity rating does not approve an
individual for a list. Preserve incomplete and conflicting feedback as holds.

Offer corroborated questions to [Topic analyzer](../gtmb-topic-analyzer/SKILL.md) as source
pointers with profile, dates, independence and gaps. Do not run topic prioritization silently.

Report coverage, actual spend/reservations and blockers in the executing chat. Slack or other
external delivery needs explicit destination and delivery authority; reconcile an uncertain
send before retrying. This skill supplies no default delivery destination, recurring schedule, paid budget,
LinkedIn posting, connection, reaction, removal or outreach authority.

When live source access is missing or the person asks to connect Up2Data, follow
[Up2Data onboarding](../gtmb-topic-analyzer/references/up2data-onboarding.md). Offer supplied-file analysis as an alternative;
verify account access separately from paid research authorization and collector readiness.

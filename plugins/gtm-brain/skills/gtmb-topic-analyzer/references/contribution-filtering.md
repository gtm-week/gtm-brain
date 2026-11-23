# Contribution eligibility contract

Read this before recommending conversations or contribution angles in either research skill.
Broad topic inventory may retain off-profile or excluded material; label it as research evidence,
never as an eligible contribution. Topic discovery from interviews or CRM notes does not require
post-format classification. Apply the gates when converting evidence into contribution opportunities.

## Company configuration

Resolve these parameters from the selected company's existing guidance or run scope. Record the
source and revision with the run; keep actual values in the company workspace or private project,
not in reusable skill files. Do not silently import another company's defaults.

| Parameter | Meaning |
| --- | --- |
| Selected profile and revision | Offering, audience and expertise being assessed; other profiles cannot supply qualification |
| Known and excluded formats | Recognized content types and excluded types; a company may exclude announcements, career updates, events and personal posts |
| Allowed fit | Required relevance level, such as direct fit; thematic overlap alone does not satisfy direct fit |
| Contribution topics and aliases | Profile-specific canonical topic IDs, definitions and aliases; aliases resolve to configured IDs |
| Concrete contribution | Require a source-grounded angle beyond agreement for every recommended conversation |
| Freshness | Company's actionable-age rule, review date and evidence for recent discussion on older material |
| Ranking | Declared ordering among eligible items; engagement may prioritize retrieval but cannot override a failed gate |

An absent format policy is not an empty exclusion list; unresolved settings block contribution
recommendations, not evidence inventory. Reuse explicit instructions before asking for gaps.
Unknown or unsupported classifications stay `needs_screening`. A company may explicitly choose
no format exclusions. Do not broaden accepted topics or exclusions without a supported decision.

## Evidence-bound assessment

Read original text before assigning eligibility. Bind each assessment to canonical source ID/URL,
verified author identity, original text revision (hash when available), source snapshot/reference,
selected profile revision and configuration revision. Keep reviewer/date, a supporting excerpt,
format tags, fit rationale, matched canonical topic IDs and a concrete contribution angle.
For executable adapters, validate IDs, hashes, source pointers and quoted text against the actual
inputs rather than trusting assessment fields. Without a stable snapshot/hash, reread and compare
the cited source before reuse; do not claim machine-verified integrity.

Never infer meaning from URL slugs, engagement counts or keyword matches alone. Distinguish
comment and reaction observations; neither establishes agreement, passive readership or buying
intent. Classify the original's format **before** ranking its topic or author. Use a separate
first pass over its opening, body and ending. Record all supported formats, not just the
dominant one. A useful argument does not cancel the announcement, promotion or event that
frames it. Missing replies cannot change the original's classification.

For an event exclusion, distinguish these two situations from the original text:

- **Event content is present:** the author recounts speaking, attending or organising, or
  invites people to an event, and develops that event through details such as its setting,
  participants, activities, takeaways or closing acknowledgements. A reflection built around
  a talk or workshop is mixed event/reflection even if its ideas occupy most of the text.
- **Incidental reference only:** an event is briefly cited as background or a source, while
  the post develops a standalone argument without retelling, inviting or thanking that event.
  The event name alone does not make this an event post.

Apply the same distinction to a named programme launch inside an explanation and a linked
offer inside a useful analysis. Preserve the additional format; a free resource can still be
promotion. Use the company's definitions when supplied. If the distinction remains genuinely
uncertain, mark the format unresolved and review the original framing before recommending
more discussion collection. Do not rank a possibly excluded post as the best next opportunity
merely because its author or topic has strong fit.

A useful angle adds a specific question, relevant experience, distinction or correction grounded
in the source and the company's supported expertise. A nonempty angle field or generic agreement
is insufficient. Proposed angles are hypotheses/drafts, not the owner's endorsement or proven results.

## Check the discussion before recommending a live interaction

Read the original and available replies, including the branch the founder might join. Bind
the live assessment to its thread snapshot and review time as well as the original post.
Record who raised the point, the most relevant reply, and what the proposed angle adds beyond
that exchange. A confirmed empty thread is usable. Missing discussion access is unknown.
Partial coverage can support a reply to a verified branch if the limitation is explicit.

If the author already answered the proposed question or another participant made the same
point, drop that angle. Only propose a different one when the exchange supports it. Respect
the social purpose of the post: asking for a management lesson in a personal thank-you can
derail the exchange even when the subject fits the offering. A pitch disguised as a question
adds no value. Hold a live recommendation if the relevant branch cannot be verified.
Recheck on reuse when new replies, edits or elapsed time could change the opening. Historical
topic evidence can still support a research brief without a verified live discussion.

## Decision and downstream use

Canonicalize and deduplicate before recommending. Conflicting identity or duplicate assessments
require reconciliation; do not select a convenient passing record. Assign one explicit state:

- `excluded`: verified identity hold or supported failed gate, with reason. Preserve the evidence
  in inventory. An identity hold does not mean the topic itself is irrelevant.
- `needs_screening`: missing text, unknown format/fit/topic, missing or unsupported angle, unresolved
  policy, conflicting assessment, or changed source/profile/configuration binding without re-review.
- `eligible`: all configured gates pass with current bindings and a reviewed concrete angle.

A supported exclusion wins over popularity. Otherwise incomplete evidence cannot pass. Recheck
bindings on resume; hashes detect changes, not elapsed time or factual truth. Keep historical
research eligibility distinct from live actionability: a historical replay may identify research
opportunities but cannot label them current without a separate freshness check.

Every retrieval route (ranked, diversity, random or manual) feeds the same assessment and eligibility
step. Rank only passing items with a declared stable tie-breaker such as canonical ID. Recommended
topic/host aggregates, handoffs and recommendation exports must derive from that same eligible set.
Keep full-corpus topic inventories and excluded/unassessed exports separately labelled; they must
not re-enter recommendations through an older selection or export path. Report all three counts,
coverage gaps and the number actually text-reviewed, without treating a purposive sample as a
corpus-wide relevance rate.

Opportunity eligibility never qualifies an ICP, admits a host, proves buying intent or authorizes
publication. Preserve independent buyer/host evidence and admission states. Generic proposal JSON
is not an integrated application import until its destination schema and read-back are verified.

## Adoption checks

Before calling an adapter integrated, exercise an excluded mixed-format post with high engagement,
an unknown-text item, a different-profile match, a missing concrete angle, changed evidence/config
bindings, conflicting canonical identities and a valid sourced contribution. Verify every selection
route and downstream recommendation/export uses the same result. Review real full-text cases as
well as mechanical tests. State whether semantic assessment is human/agent-operated or automated;
this contract itself supplies neither a collector nor an autonomous classifier.

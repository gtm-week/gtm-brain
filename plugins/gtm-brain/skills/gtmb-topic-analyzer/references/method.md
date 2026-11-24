# Topic analysis method

The primary question is: **Given our ICP, what conversations are they having?**
Use the selected ICP to identify whose conversations the evidence represents. Lead the report
with what those people discuss, who participates, what is already answered and what remains
open. Derive topic priorities afterward; do not start from what the seller wants to say.

## Independent ICP-list route

1. Accept the supplied list independently of its origin. Record its snapshot/reference, selected
   offering, identity mappings and qualification provenance. Deduplicate identities; hold ambiguous
   identities out of attributed audience counts without blocking the rest of the list. Existing
   list membership does not establish current ICP fit. Do not require prior Audience Loop admission.
2. Reuse or collect each resolvable seed's observed comments/reactions within the authorized window.
   Preserve interaction kind, source, dates and coverage. These are observed engagement, not
   passive readership, agreement or purchasing intent. Metadata can prioritize text retrieval.
3. Resolve original posts and authors, canonicalize and deduplicate, then retrieve text needed
   for analysis. Preserve each seed-to-interaction-to-post link. No text means needs screening
   for contribution recommendations; never invent topics from a URL.
4. When requested scope includes broader host topics, use those authors to collect bounded
   authored-post samples. Label this additional corpus separately: an ICP interaction with one
   post does not show that the ICP engaged with the author's other posts or qualifies that host.
5. Analyze the resulting corpus below. Apply the contribution contract when recommending angles
   or conversations. Return a sourced report without requiring either people-discovery loop to
   execute, and without changing ICP or host membership.

A supplied evidence corpus can enter at analysis without any list or new collection. An optional
Audience Loop handoff is another input with the same provenance requirements, never the owner
of this skill's collection stage. Collection authority still comes from the company/run scope.

## Analyze the corpus

Copy citation destinations from source records or reader output, retaining the full post
identifier and comment/reply target. Do not reconstruct or abbreviate them. For saved Up2Data
sources, check the **complete draft answer** before sending it:

```sh
node /absolute/path/to/read-evidence.mjs /absolute/evidence --check-citations <<'ANSWER'
Paste the complete draft answer here.
ANSWER
```

This reads stdin locally and creates no file or network request. A nonzero exit lists URLs
that do not match a supplied source. Replace each with the exact source URL, or cite its
filename and record pointer, then rerun the complete draft. Send only after `valid: true`,
keeping the checked citation destinations unchanged. This checks every supporting link;
it does not replace quotation verification or semantic review.

Keep an audience-to-conversation evidence map: ICP person or role, qualification basis,
observed participation (author, comment, reply or reaction), original discussion and date,
and the question or problem actually expressed. A reaction shows engagement, not agreement
or speech. A relevant host's other posts are a separately labelled corpus; do not imply the
ICP participated in them. When only a role hypothesis or topical match connects a source to
the ICP, say so. Do not discard useful exploratory evidence or inflate it into buyer demand.

Group questions by the job, obstacle or decision the audience describes, rather than shared
keywords. Preserve the difference between a repeated pain, curiosity and the analyst's idea.
Split themes when different buyer roles or offerings would change the recommendation.

Count independent people and threads, not copied posts, syndicated material or multiple
reactions to one author. One observation supports a hypothesis; corroboration across distinct
people and situations supports recurrence. No fixed sample size can establish representativeness.

For each theme assess:

- Relevance: does the selected buyer face this problem and can the company credibly help?
- Recurrence: how many independent observations, in which source types and time window?
- Urgency: what dated trigger, consequence, workaround or buying action is actually observed?
- Confidence: how direct, current, independent and complete is the evidence?

Keep these assessments separate. Engagement totals and search frequency indicate attention;
they do not establish buyer fit, purchase intent or willingness to pay. A single vivid quote
must not outweigh contrary evidence without an explicit reason.

Rank themes with a short rationale. Prefer themes where useful company expertise meets a
well-evidenced audience question. Label proposed angles as drafts. Surface source bias,
conflicting accounts and unanswered questions. Stop when the shortlist is decision-ready or
additional research would repeat evidence; report a gap when authorized access cannot resolve it.

On review, preserve the person's exact correction and its scope. A disliked angle does not
invalidate its evidence; an accepted angle does not make every supporting hypothesis factual.

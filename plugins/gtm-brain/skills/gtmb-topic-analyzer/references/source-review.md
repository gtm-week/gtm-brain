# Read structured sources before synthesizing

Use this route for saved Up2Data v1 post, comment and profile envelopes. It is a local reader,
not a collector. Other providers and prose sources retain their own source-reading route;
do not reshape unknown payloads by guessing field names.

## Separate statements, identities and decisions

Resolve `../scripts/read-evidence.mjs` beside this reference. Pass the directory containing
the selected JSON snapshots, the review time and, for contribution recommendations, the
company's policy. This example uses a placeholder review time; substitute the actual scope.

```sh
node /absolute/path/to/read-evidence.mjs /absolute/evidence --as-of REVIEW_ISO_TIME
node /absolute/path/to/read-evidence.mjs /absolute/evidence --as-of REVIEW_ISO_TIME --view identities
```

The default view contains **statements**: original posts, individual comments and individual
replies, each with its own speaker, record pointer, exact text, URL and two separate dates.
Profile headlines are deliberately absent. The identity view contains profile claims and
unverified profile stubs; neither is speech in a discussion. Read it for buyer/host assessment,
not as additional expressed demand or corroborating topic observations.

The index reports actual `posted_at`, collection time, computed ages and returned counts.
A null date is unknown. A failed guessed lookup such as `.data.post.posted_at` does not mean
the source lacks a date. Use the reader's mapping or inspect the actual original keys.
Warnings identify unsupported records; do not present the parsed subset as complete coverage.

Before writing topic synthesis, select the supporting statement records. Keep a compact
working evidence table: **record ID | speaker | exact excerpt | observation or inference**.
Derive recurrence from distinct speakers/threads in these rows, not mentions in your prose.
For each central attribution, verify its excerpt against the selected record:

```sh
node /absolute/path/to/read-evidence.mjs /absolute/evidence --as-of REVIEW_ISO_TIME \
  --record 'comments.json#/data/comments/0' --quote 'Exact source wording'
```

An excerpt from another record, a profile headline or a paraphrase fails this check. Copy
the returned `attributed_evidence` and `citation` into the factual evidence bullet. Write the theme separately
as your synthesis. Do not merge the author and commenters into one attributed sentence.
One praise comment and one substantive comment are two different observations, not two
people expressing the substantive point. Profile metadata never adds a speech observation.

## Check an opening against the actual policy

Before buyer/topic ranking, follow the original-text format pass in
[contribution filtering](contribution-filtering.md). Check opening, body and ending for each
excluded format. Keep an evidence row: **post | framing excerpt | all supported formats |
excluded format present or absent, with reason**. A reflection built around recounting a
talk, workshop or other event retains the event format; missing replies cannot remove it.
An incidental event citation alone does not add that format. Assess the original first, then
the discussion gap and relevance, so attractive topics cannot select their own policy labels.

`known_formats` is
the vocabulary; the reader reports `excluded: true/false` from **only** `excluded_formats`.
Do not infer exclusion from a label's presence in the vocabulary. Then check the selected
post and observed branch, using their exact returned record IDs:

```sh
node /absolute/path/to/read-evidence.mjs /absolute/evidence --as-of REVIEW_ISO_TIME \
  --post 'posts.json#/data' --formats discussion,promotion \
  --branch 'comments.json#/data/comments/0'
```

`excluded` and `hold` cannot become live recommendations. Missing comments, unverified dates,
stale snapshots, conflicting snapshots and unknown labels remain holds. An explicitly empty
comment snapshot is different from missing access. Publication age is measured from the post;
snapshot age is measured from collection, **not from when someone commented**.

`ready_for_semantic_review` is not approval or automatic eligibility: check topic fit, the
social purpose, the selected speaker's point and returned replies, and whether the proposed
addition is both distinct and supported. The helper does not classify formats or infer intent.
Copy the returned `opening_citation` into the answer **verbatim**, including URL characters;
never reconstruct a slug or translate any part of a URL. A record pointer alone is not a usable
live discussion link. Name the speaker and describe what
the author/other replies already settled. Separate that observation from the proposed addition.
The gate excludes a post contribution, not a person. Never derive buyer/host admission or
rejection from an excluded post format; admission requires its own saved decision.

Before finalizing, compare the short answer with the verified evidence rows and gate output.
Keep the returned speaker, excerpt, dates, exclusion reason and link intact. If this would
exceed a requested length, remove weaker findings rather than flattening different speakers
into one claim. A research hold leads the answer when no opening passes.

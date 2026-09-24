---
name: gtm-os-strategy
description: |
  The strategic intake: a 10-15 minute conversation with a founder or a head of sales, growth
  or GTM that fills strategy.md, the document every brain starts with, mapped silently to
  Playing to Win. Triggers: "/gtm-os-strategy", "run the strategic intake", "let's do the
  strategy", "fill in strategy.md", "strategy interview", "map our strategy".
allowed-tools: [Bash, Read, WebFetch, WebSearch]
---

# GTM OS: Strategic intake

Based on the strategic intake written by Chris Pawlak for GTM OS 0.23.1.

## Purpose

Conduct a first, high-signal strategic conversation with someone at a tech company (head of
sales, head of growth, head of GTM, or founder) to capture a foundational strategic snapshot.
This is deliberately NOT exhaustive: it is a strong first ingest that later, more specific
skills and uploaded documents will build on. Target length: roughly 10-15 minutes of
conversation (it can run longer if the respondent has a lot to say; do not cut them off or
rush for the sake of hitting a time target).

The conversation is structured around the Playing to Win (PTW) strategy framework (Winning
Aspiration, Where to Play, How to Win, Capabilities, Management Systems), but **never name the
framework or its categories to the respondent**. Ask plain, concrete, easy-to-answer questions.
Do the mapping to PTW silently, in the background, when producing the output.

## Where the output lives

Every brain starts with `strategy.md` at its root: a document (`kind: document`, status draft)
that says it is waiting for this intake. This skill fills it. Anything the person shares along
the way (a deck, a one-pager, notes) lands beside it in `strategy/` through
[files](../gtm-os-use-brain/references/files.md) with `--document strategy`. The decisions
the interview surfaces are also remembered in the Strategy context, in the person's words:
the document is the statement, the notes are the evidence.

## Opening message (always send this first, before any question)

Use the following opening closely. Preserve its tone, pacing and level of detail. Translate it
naturally when the respondent is speaking Polish, but do not shorten it into setup bullets or a
form-like greeting.

> This is a quick conversation to build a first picture of your company's go-to-market
> strategy, so later work can build on real context instead of starting from zero. It'll take
> roughly 10-15 minutes, maybe a bit longer if there's a lot to unpack - no rush either way.
>
> A couple of things upfront: this stays in this working session, so you decide how precise to
> get with numbers - exact figures, rough ranges, or just a general direction are all fine. Any
> question you'd rather skip, just skip it. And if partway through you think of a deck,
> one-pager, or notes worth sharing, drop them in any time - no need to have anything ready now.
>
> To start: what's your name and role (founder, head of sales, head of growth, head of GTM,
> something else), and which company are we talking about - got a website I can glance at?

Reuse identity and company details already resolved by the session or brain (the current
person and `brain/admin.md`). Do not ask the person to repeat known information. Adapt only
the final paragraph to request the missing role, company or website while keeping the same
natural tone.

## Pre-research (if a website is given)

If the respondent gives a company URL, do a quick pass (web fetch or search) to pre-fill a
rough sense of: what they sell, apparent ICP, and visible competitors. Use this only to sharpen
or shortcut questions ("I see you position around X - is that still accurate, or has that
shifted?"), never to skip asking: always let them confirm or correct rather than assuming
pre-research is right.

## Mid-conversation file handling

At any point the respondent may share a file (deck, one-pager, CRM export, strategy doc,
notes). When this happens:

- Land it beside the strategy: `node "$PLUGIN_ROOT/skills/gtm-os-add-file/add-file.mjs" <brain> --file "<path>" --document strategy`,
  then read it (its `text`) before continuing.
- Identify which upcoming or already-asked questions it answers.
- Skip questions it clearly and specifically answers; for questions it partially answers, ask
  a shorter, more targeted follow-up rather than the full original question.
- Tag any insight drawn from a file with its source (filename) in your working notes, so the
  final output can distinguish "from conversation" vs "from [filename]".
- Tell the respondent briefly what you picked up from the file before moving on, so they know
  it's been incorporated (don't just silently absorb it).

## Conversational interview flow

The question flow below is a coverage map, not a rigid script. Keep the warm, direct tone of
the opening and run the conversation like an attentive interviewer gathering information.

### Turn pattern

After every answer, silently update what is answered, partly answered, still missing and
pre-emptively covered. Then choose the smallest useful response:

1. Ask a contextual follow-up immediately when an important part of the current question is
   missing or vague.
2. When the answer is sufficient, optionally add a short coverage note, then ask the next
   canonical question.
3. When moving to a new round, add a brief natural topic header before the question.

Do not use all three elements mechanically. Most turns should be short. The conversation
should move forward.

### Coverage notes

A coverage note is useful only when it does at least one of these jobs:

- Compresses a rich answer into decision-useful criteria.
- Identifies which later question the answer has already covered.
- Makes clear that a question will be skipped or narrowed to avoid repetition.
- Carries a named customer, example or distinction into the next question.
- Separates two useful facts, such as the main blocker and the current growth driver.

Keep it to one short paragraph, normally one or two sentences. Use only facts the respondent
stated. Do not add hypotheses, advice, evaluation, framework interpretation or a strategic
conclusion during the interview.

Good coverage notes:

- "Delivery capacity is the bottleneck, while [current growth driver] is pulling the business
  forward."
- "The strongest customers share [criteria]. You also covered [bad-fit profile], so I'll skip
  that later."
- "You already covered the current pricing model, so I'll carry that into the pricing section
  rather than ask it again."

Do not summarize merely to prove that you listened. Avoid broad restatements that add no
navigation or useful structure. If no coverage note is needed, ask the next question directly.

### Topic headers

Use a short bold header only when changing interview areas. Adapt it naturally to the
business. Examples:

- **Now, what's in the way**
- **Now, the market side**
- **Now, your best customers and wins**
- **Now, the offer and edge**
- **Now, the GTM engine**
- **Finally, how you run it**

Never expose Playing to Win labels or internal framework language.

### Reusable-skill privacy safeguard

Treat screenshots, transcripts, uploaded files, test answers and live interview details as
runtime context, not reusable skill content. Never copy company or person names, URLs, exact
financial figures, prices, customer profiles, quotations or other identifying or distinctive
business facts into this `SKILL.md` unless the person explicitly asks to preserve that exact
material in the reusable skill. Those details may still be used in the active interview and
recorded in its `strategy.md` output. When writing examples inside the skill itself, use
neutral placeholders such as `[customer]`, `[revenue target]` and `[pricing model]`.

### Contextual questions

Contextualize the canonical question without weakening it:

- Use the respondent's own nouns for buyers, users, customers, projects or partners.
- Refer to an example from the answer without copying it into the reusable skill: "Why did the
  customer you just mentioned choose you over the alternatives they considered?"
- Name realistic alternatives already mentioned by the respondent.
- Preserve every required part of the original question: timeframe, comparison, requested
  example, buyer role, metric, process, ownership and mechanism.
- If an earlier answer fully covers a question, skip it. If it covers only part, ask the
  uncovered part explicitly at the original level of precision.
- When time is limited, select fewer complete questions instead of vague compressed versions.
- One turn may contain two tightly related parts from the same original question or adjacent
  questions. Do not stack unrelated topics.

Ask for facts, examples, mechanisms, numbers, comparisons and decision processes. Never
challenge the answer, debate its validity or ask the respondent to defend it. The role is to
conduct the interview and gather information. Keep hypotheses, tensions and strategy mapping
internal until writing `strategy.md`.

When GTM OS requires the native `question` tool, place the optional coverage note and topic
header in the conversational message immediately before the tool call. Put the complete
precise question in the free-text tool without preset options. Reserve radio choices and short
fields for simple setup facts.

## Question flow

Ask in this order. Each question lists the PTW dimension(s) it maps to; use this ONLY for
building the output, never say these labels to the respondent. Many answers will be relevant
to more than one dimension; capture them under all dimensions they touch, not just the primary
one.

**Round 0 - Company intro**
0. To start, a quick intro: what does the company do, in a nutshell? And: what kind of company
   do you want to be, versus what you definitely don't want to become?
   -> *Winning Aspiration* (keep this grounded and simple, not a "how did this all start"
   founder-origin story; the respondent may not be the founder, and a plain company intro
   works for any role)

**Round 1 - Aspiration and challenges**
1. What do you want this company to become in 2-3 years: revenue, market position, whatever
   "winning" looks like to you?
   -> *Winning Aspiration*
2. What's the revenue aspiration, and by when? How do you actually track progress against it?
   -> *Winning Aspiration + Management Systems*
3. What are the main challenges right now holding you back, in GTM, clients, or revenue?
   What's the biggest blocker, and what's actually driving growth today?
   -> *Winning Aspiration + Capabilities (gaps)*

**Round 2 - Market and buyers**
4. Who do you help? How would you define your ideal client: their needs, problems, their
   company profile?
   -> *Where to Play (ICP)*
5. Who's actually in the room when they decide to buy, one person or a committee? Who are
   they, and what does that process look like?
   -> *Where to Play (buying process)*

**Round 3 - Best customers and wins**
6. Who are your best customers, the ones you'd clone if you could? What do they have in common?
   -> *Where to Play (ICP)*
7. Why did they pick you over the alternatives? Who else was on the shortlist?
   -> *How to Win*
8. Walk me through a recent deal you won, and one you lost: what decided each?
   -> *How to Win*
9. Which customers or deals do you say no to, or wish you'd said no to?
   -> *Where to Play (boundaries)*

**Round 4 - Offer, edge, pricing**
10. What does your company excel at? What would customers say you're best at?
    -> *How to Win + Capabilities*
11. What's the flagship project or case you're proudest of, the one you'd put on the front
    page?
    -> *Where to Play + How to Win + Capabilities* (tag all three; this answer is usually rich)
12. How do you price or charge, and how does that compare to competitors?
    -> *How to Win (business model)*

**Round 5 - GTM engine**
13. Where do most of your good deals actually come from? What does the typical path to
    becoming a client look like?
    -> *Capabilities (GTM engine) + Where to Play*
14. Who's on growth, sales and marketing today, how is it organized (who owns what), and what
    tools do you run on?
    -> *Capabilities*
15. Once someone's a client, how do you grow that relationship: upsell, expansion, deepening
    the account?
    -> *Capabilities + How to Win*

**Round 6 - Management and lessons**
16. How do you know you're on track? Which numbers, how often, with whom?
    -> *Management Systems*
17. What have you already learned: what's worked, what hasn't, best and worst strategic calls?
    -> *Management Systems + Winning Aspiration (context)*
18. If you could fix one thing in the next 90 days, what would it be? Anything already in
    motion, or a shift on the horizon (market, tech) that could change the game?
    -> *Management Systems + Winning Aspiration*
19. What should I have asked that I didn't?
    -> *closing catch-all*

## Closing

Before producing the output, ask one final closing question:

> "Is there anything else important about the company's strategy that we haven't covered?
> Does everything we discussed check out, or is there anything to add or correct?"

Give them room to amend anything before you finalize.

## Output

Always fill the one document `strategy.md` at the brain root. Do not return the strategy as a
long written summary in chat.

- Read `strategy.md` first (`document` with `action: show`, `ref: strategy`). A brain made
  with GTM OS 0.27.0 or later has it from setup, waiting for this intake; if it is missing,
  create it with `document` (`action: create`, `title: Strategy`, `applies_to` strategy,
  planning). If it already holds material, update it carefully: preserve prior material unless
  the intake clearly corrects or supersedes it.
- Write the result with `document` (`action: update`, `ref: strategy`, `body` the full text
  below). Leave the status as draft; the person approves it with "approve the strategy" once
  they have read it.
- Remember the decisions the interview surfaced (the aspiration, the boundaries, what they say
  no to, the 90-day fix) as notes in the Strategy context, in the person's words.
- After writing, return one short completion sentence with the path `strategy.md` and the
  offer to approve it. Do not create multiple strategy files for this first-pass intake.

Structure the body of `strategy.md` as follows:

1. **Header**: company name, respondent name and role, date, and any files or public sources
   used.
2. **Winning Aspiration**
3. **Where to Play**
4. **How to Win**
5. **Capabilities**
6. **Management Systems**
7. **Gaps and contradictions**

For each of the five strategy sections include:

- A concise synthesis paragraph.
- Compact evidence bullets.
- Put the confidence status at the end of every bullet, never at the beginning.
- Use exactly one of these ending labels: **Confirmed**, **Hypothesis**, or **Gap**.
- Put the source before the ending label.
- Format each bullet like this: `- The company has a stated three-year revenue target. *(Source: conversation, respondent)* - **Confirmed**`
- Tag sources as conversation with the respondent's role, public source, or filename.
- Use only the strongest useful quotations, placed under the relevant point.
- Include insights in every section they materially support rather than forcing each answer
  into one category.

Finish the file with **Gaps and contradictions**: missing evidence, vague answers and tensions
between claims. Do not add a Suggested next steps section.

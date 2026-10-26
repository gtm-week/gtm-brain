---
name: gtm-brain-market-desk-research
description: |
  Market desk research: a 5-8 minute intake, then 15-30 minutes of sourced desk research that
  assesses a market through the lens of the current offering and proof: market and segment
  growth, customer pains, the buying committee, competitors, positioning and the current right
  to win, in one report with charts. A diagnosis only, never a product or offering design.
  Triggers: "/gtm-brain-market-desk-research", "research this market", "assess the market for",
  "is this segment worth it", "market sizing", "who competes in", "desk research on".
allowed-tools: [Bash, Read, WebFetch, WebSearch]
---

# GTM Brain: Market desk research

Based on the market desk research skill written by Chris Pawlak for GTM Brain 0.23.1.

## Purpose

Guide a participant through a short, high-signal intake and then conduct relatively deep desk
research to assess a market through the lens of their current capabilities and offering. The
offering may be a service, product, solution, platform or a combination of these.

The participant spends roughly 5-8 minutes giving input. The research itself is deeper and may
take roughly 15-30 minutes depending on source availability. Keep the interaction casual,
direct and conversational, like an attentive strategy interviewer rather than a form.

Conduct every interaction and write every output in English.

## Opening

Always open with a natural explanation close to this:

> I'll help you assess a market through the lens of your current offering, capabilities and
> proof. We'll spend about 5-8 minutes defining the market, your current hypothesis and what
> you can credibly bring to it today.
>
> I'll then run a relatively deep desk research across market data, industry sources,
> communities, customer complaints and competitors. Before I go deep, I'll show you the market
> definition, research hypotheses and proposed sources so you can correct the direction.
>
> The final output will be a concise, evidence-backed report covering market and segment
> growth, customer problems, buying roles, competitors, positioning and your current right to
> win. I'll clearly separate confirmed evidence, reasonable hypotheses and open gaps. This is a
> market diagnosis, so I won't redesign your product or recommend an offering. The research
> usually takes another 15-30 minutes, depending on how accessible and fragmented the sources
> are.

Adapt the wording slightly to the situation, but preserve the promise, timing, checkpoints and
output.

## Conversation style

Run the intake as a conversation, not a questionnaire.

- Ask one focused question at a time.
- Use the participant's own terms for the market, customers and offering.
- After each answer, silently update what is answered, partly answered and still missing.
- Add a short coverage note only when it clarifies what you understood, avoids repetition or
  sets up the next question.
- Skip questions already answered by prior context, files or earlier answers.
- Ask a follow-up only when the missing detail would materially change the research scope or
  verdict.
- Ask for concrete examples, projects, outcomes and observed customer behavior.
- Do not challenge answers during intake. Treat them as inputs or hypotheses to test later.
- Allow the participant to skip any question.
- Do not expose internal frameworks or scoring mechanics during the interview.

Follow [question handling](../gtm-brain-start/references/questions.md). Intake questions go
through `question` as free text without preset options, with the coverage note in the message
right before the call. The two checkpoints below are choice questions. A file shared on the way
is read at once and used to skip or narrow questions; say briefly what you picked up from it.

Treat company and person names, figures, customer profiles and quotations from a session as
runtime context: they belong in the report and the brain, never in this `SKILL.md`.

## Scope boundary

This skill diagnoses the market and the participant's current fit. It must not recommend or
design:

- product features or roadmap,
- an offering, category wedge or service package,
- pricing or packaging,
- a pilot structure,
- positioning claims or messaging to adopt.

It may identify which existing capabilities strengthen or weaken the current right to win,
compare segment fit and state what evidence is missing. When an opportunity appears to require
capabilities the participant does not currently have, describe the mismatch without
recommending that they build those capabilities. Leave product, offering and positioning
decisions to a separate strategy exercise.

## Workflow

### 1. Reuse available context

Before asking questions, read what the brain already holds:

- the strategy document (`document`, `action: show`, `ref: strategy`): the strategic intake's
  output (`gtm-brain-strategy`), with the aspiration, ideal client, best customers, edge and
  flagship cases;
- the other documents (`document`, `action: list`): an ICP definition, pricing, positioning;
- notes (`query` on `memories`, a search for the market, segment, competitor and customer
  names in play) and the entities for the best customers and known competitors;
- the company website (`brain/admin.md` names it) and files shared in the chat.

Use this context to sharpen or skip questions. Treat prior material as evidence to confirm or
correct, not unquestionable truth. Tell the participant briefly when prior context has allowed
you to skip or narrow a question.

### 2. Run the focused intake

Use the following as a coverage map, not a rigid script. Normally ask 6-8 main questions.

1. Market and offering lens:
   "Which market do you want to assess, and through the lens of which offering or
   capabilities?"
2. Existing segment hypothesis:
   "Do you already have a niche or segment in mind? What makes it interesting to you?"
   A missing niche is a valid answer. Research several adjacent segments regardless.
3. Geography and customer boundary:
   Clarify relevant geography, customer types, company sizes and important exclusions.
4. Best customers:
   Identify the customers the participant would most like to replicate and what those customers
   had in common. If prior work already answers this, ask only for confirmation or correction.
5. Capabilities and strongest proof:
   Ask what the company is unusually good at and which 1-3 projects, outcomes or cases best
   demonstrate it. Focus on demonstrated strengths rather than a complete catalog of
   capabilities.
6. Observed problems and buying context:
   Ask which problems repeatedly caused customers to seek help, what triggered action and who
   participated in the decision.
7. Audience locations and sources:
   Ask where the target audience spends time and which reports, databases, communities, forums,
   marketplaces or closed sources matter in this market. Suggest standard sources after hearing
   the answer.
8. Competitors and alternatives:
   Ask about known competitors, internal solutions, freelancers, agencies, adjacent products and
   the option of doing nothing.

Combine closely related questions when the participant has already supplied useful detail. Do
not exceed the input time target merely to complete every prompt.

### 3. Confirm the research frame

Before deep research, present a concise research frame containing:

- broad market definition,
- proposed segments and niche,
- geography and customer boundaries,
- the offering and capabilities through which the market will be assessed,
- initial growth hypotheses,
- initial customer-problem hypotheses,
- known competitors and alternatives,
- proposed source set,
- material gaps or assumptions.

Recommend a source set and let the participant approve or adjust it, with one `question`:
"Looks right, start research" first, then "Adjust the scope" (its follow-up is a free-text
question). Do not begin dependent deep research until the direction is confirmed.

### 4. Conduct the broad evidence scan

Research enough breadth to test, refine or reject the initial hypotheses.

Use a relevant mix of:

- official statistics and public datasets,
- industry associations and credible market reports,
- company filings and investor materials,
- adoption, usage and search-interest data,
- employment and skills demand,
- funding and new-company activity,
- regulation and structural tailwinds or headwinds,
- Reddit and relevant specialist communities,
- product reviews and marketplaces,
- technical forums, GitHub issues and Stack Overflow when relevant,
- customer case studies, procurement material and job posts,
- competitor websites, pricing, documentation, changelogs and reviews,
- participant-nominated or closed sources when legitimately accessible.

A closed source is read through its connector (the host's MCP tools) when one is connected,
never by driving a browser login without approval (rule on Computer Use in the brain's
`AGENTS.md`).

Aim for roughly 15-30 useful sources across different evidence types. Prefer primary and
current sources. Use secondary sources when they add interpretation or access to otherwise
unavailable data.

Do not mistake one proxy for market growth. For example, package downloads, repository activity
or search interest show adoption or attention, not necessarily market revenue or buying intent.
Triangulate growth using multiple independent signals.

Separate:

- broad market growth,
- segment-specific growth,
- demand for the participant's type of offering,
- the participant's ability to win.

Segment the market from broad category to segment, niche and realistically reachable niche.
Compare about 4-6 relevant or adjacent segments.

Analyze customer problems by identifying:

- affected role,
- situation or trigger,
- frequency,
- severity and business consequence,
- current workaround,
- evidence of urgency or willingness to pay,
- source quality and recency.

Research the buying committee only through these four categories:

- Influencers: shape the decision but do not make the final call.
- Champions: actively support a specific option or vendor.
- MDMs: main decision makers with the final say.
- Blockers: can stall or stop the purchase because of risk, cost or doubt.

For each category, provide likely titles, goals or KPIs, main problems, what may persuade them
and common objections. Do not create an expanded buying-role taxonomy.

Research direct competitors, indirect competitors, internal solutions and the status quo.
Choose positioning axes from real buyer criteria. Axes must be distinct, evidence-based and
useful for a decision. Do not default to vague pairs such as modern versus classic.

### 5. Confirm emerging findings

After the broad scan and before final synthesis, show a compact interim view:

- provisional market verdict,
- most promising segments,
- strongest pain themes,
- provisional buying committee,
- competitor shortlist,
- proposed positioning axes,
- strongest apparent current fit between market opportunity and demonstrated capabilities,
- contradictions or important evidence gaps.

This is the second required checkpoint: one `question`, "Direction is right, finish it" first,
then "Correct one point" (its follow-up is a free-text question). Use the answer to prioritize
the final deepening pass rather than restarting the whole research.

### 6. Deepen the decision-critical areas

Deepen only the areas that can change the verdict:

- resolve conflicting growth evidence,
- strengthen segment comparisons,
- validate the highest-priority pains,
- verify competitor positions and positioning axes,
- test whether current capabilities and prior proof create a credible advantage,
- identify missing evidence that requires customer interviews rather than more desk research.

Stop when additional sources repeat the same conclusion or no longer change the decision. If
evidence remains weak, say so and lower confidence instead of continuing indefinitely.

### 7. Produce the report

The report is `market-desk-research-<market-slug>.md`; its charts live beside it in a folder of
the same name, `market-desk-research-<market-slug>/`, referenced by relative path.

- In a linked project folder (the session hook names it), write the report at that project's
  root: a draft in progress lives in the project folder it belongs to.
- Otherwise it is a document of the brain: `document` with `action: create`, `title`
  "Market desk research: <market>", `applies_to` market strategy, segment choice, positioning,
  status draft. Land each chart beside it with
  `node "$PLUGIN_ROOT/skills/gtm-brain-add-file/add-file.mjs" . --file "<chart>" --document <ref>`
  and reference the landed path.

Never leave the report as a loose Markdown at the brain root without the document marker.

Target roughly 1,500-2,500 words plus compact tables and embedded evidence-based charts. Keep the
report decision-oriented rather than dumping research.

Use this structure:

1. Executive verdict
2. Market definition and boundaries
3. Market growth evidence
4. Segment comparison
5. Top customer problems and complaints
6. Buying committee: Influencers, Champions, MDMs and Blockers
7. Competitive landscape
8. Positioning map and rationale for the axes
9. Market attractiveness versus right to win
10. Commercial implications for later strategy work
11. Gaps, contradictions and next validation questions
12. Linked source list

The executive verdict must separately assess:

- Market attractiveness: growth, problem strength, budgets, reachability, competition and
  barriers.
- Right to win: capabilities, demonstrated project evidence, credibility, customer access,
  differentiation and delivery economics.

For each relevant segment, use one of these conclusion patterns when appropriate:

- Attractive and strong fit
- Attractive, but weak current fit
- Strong fit in a limited market
- Validate before committing
- Low-priority opportunity

Every material factual claim needs a nearby source link. Distinguish confirmed evidence,
hypothesis and gap, with the label at the end of the line as in `strategy.md`:
`- <claim>. *(Source: <link>, <date>)* - **Confirmed**` (or **Hypothesis**, **Gap**). Show
source dates, geography and definitions when they affect interpretation. Surface conflicting
evidence instead of smoothing it over.

Create a simple two-axis positioning map using available visualization capabilities (a chart
rendered to PNG or SVG by a script). If a rendered chart is not practical, use a clearly
labeled two-axis matrix and include the evidence rubric used to place each competitor.

Embed the positioning map directly in the Markdown report. Store its durable image file in the
report's folder and reference it with a relative path. Do not leave a required map only as a
separate visualization in the conversation.

When credible, comparable numeric data are available, also create and embed a market-growth
chart. Prefer a sourced historical series. A published forecast is acceptable when the chart
clearly distinguishes actual, estimated and forecast values. Label the market definition,
geography, period, units and source. If intermediate years are derived from a published CAGR,
label them as modeled rather than observed. Never silently interpolate, merge incompatible
market definitions or imply that a broad-market forecast measures the target niche.

If the available numbers are too weak, incomparable or definitionally misleading, do not force a
chart. State why a responsible market-growth chart cannot be created and retain the sourced
evidence table instead.

Every generated chart must be embedded in the report itself, remain readable without the
conversation and have a short interpretation nearby. Charts are evidence, not decoration.

Keep section 10 diagnostic. It may state commercial consequences of the evidence, likely
buyers, reachability and validation needs. It must not prescribe a product, offering, category
wedge, feature set, package, price, pilot design or roadmap.

End with a concise source list that lets the reader verify and deepen the research.

After writing, return one short sentence with the report's path and ask, with one `question`,
whether the report stands: "Accept the report" first, then "Needs corrections". Do not repeat
the report in the chat.

### 8. Retain confirmed conclusions

After the participant accepts the final report, `remember` in the fitting context (Strategy
when none is named) the confirmed market definition, the final verdict and the assessed segment
fit, each with the report's path as its source. The open validation questions from section 11
the participant wants to pursue become open questions (`remember`, kind `question`). Do not record provisional hypotheses or
unconfirmed interim findings as facts, and write nothing before the report is accepted.

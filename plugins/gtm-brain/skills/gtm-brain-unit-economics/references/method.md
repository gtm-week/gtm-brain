# Unit economics review: the method

By Lech Kaniuk. Decide whether growth is economically healthy and what to do next: push, fix,
stop, or measure. The job is not just to compute LTV and CAC. It is to check that the inputs are
comparable, find what drives the result, and turn the diagnosis into at most three actions.

## Principles

- Horizon-limited LTV. Report LTV over 12 and 24 months. Beyond 24 months is high-risk
  extrapolation and is never the headline number.
- One time unit. Convert every input to **monthly** before calculating.
- Honest precision. Use ranges when inputs are uncertain. Label every estimate, proxy and assumption.
- Keep it simple by default. Offer deeper adjustments (for example sales-cycle lag) only when
  the person has the data. Do not require them.

## Step 0: detect the data tier

Classify the available data first and say which tier you are using.

| Tier | Data available | What you can conclude |
|---|---|---|
| 1, basic | Total acquisition spend + number of new customers | Blended CAC only. Usually `MEASURE`: name the 2-3 inputs to collect next. |
| 2, blended | Tier 1 + ARPU, contribution margin, a churn/retention estimate (or none) | LTV12, LTV24, LTV:CAC and both paybacks, as ranges where uncertain |
| 3, cohort | Customers by acquisition month + revenue/activity over time | Same metrics from actual cohort survival, plus cohort trends and segment detail |

The tier describes data granularity, **not** confidence. A simple business (one product, one
main acquisition source, short payback) can reach a confident decision at Tier 2. Confidence comes from
the evidence test in Step 6.

If more granular data would change the decision, list exactly what to collect.

## Step 1: validate definitions

Before calculating, check and flag (do not silently fix):

- **Same customer unit** for LTV and CAC (company, account, user, seat, transaction...).
- **Monthly alignment.** Convert:
  - Annual ARPU to monthly: `ARPU_annual / 12`
  - Annual churn to monthly: `c = 1 - (1 - churn_annual)^(1/12)`
  - Quarterly churn to monthly: `c = 1 - (1 - churn_quarterly)^(1/3)`
  - Spend and new customers must cover the same months.
- **Fully loaded CAC.** Media, sales and marketing people, agencies, tools, creative. If only
  ad spend is available, call it "paid CAC", not CAC.
- **Contribution margin, not revenue.** Revenue minus direct delivery costs (COGS, hosting,
  payment fees, onboarding, support directly tied to the customer).
- **New vs existing customers.** Exclude returning or reactivated customers from "new".
- **Churn on a growing base.** Churn computed against a fast-growing customer base looks
  too good, because new customers dilute it. Flag this when growth is fast.
- **Sales-cycle and spend-stability check.** Ask once: "How long from first touch to paying
  customer?" (the sales cycle, L). In a steady business, spend and new customers already
  offset each other over time, so no lag adjustment is needed. Just follow these rules:
  - **Measurement window:** calculate CAC over a trailing period of at least 2 x L
    (minimum 3 months, ideally 12). Never use a single month when L > 1 month.
  - **Flag CAC as distorted** when either of these is true:
    - *Early stage:* the company has been selling for less than ~2 x L. Costs are running,
      but deals from that spend have not closed yet, so CAC is **overstated**.
    - *Spend changed:* acquisition spend (including new sales hires) changed by more than
      ~30% during the window. Rising spend **overstates** CAC; cutting spend makes CAC look
      **better than it is** for about L months.
  - When flagged, show CAC as a range and say which way it is biased. Only if the person has
    monthly spend history and asks for more precision, offer a lagged CAC:
    `CAC = spend in months (t - L) / new customers in month t`.

## Step 2: calculate the core economics (monthly units)

Definitions:
- `m` = monthly contribution per customer = `ARPU_monthly x contribution margin %`
- `c` = monthly churn rate
- `S(t)` = share of an acquired cohort still active in month t (t = 0 is the first month)
  - Tier 2: `S(t) = (1 - c)^t`
  - Tier 3: take S(t) from actual cohort data

**CAC**
`CAC = fully loaded acquisition spend / new customers acquired` (same period, or lagged)

**LTV (horizon-limited)**
`LTV_H = m x sum over t = 0..H-1 of S(t)`
With constant churn: `LTV_H = m x (1 - (1 - c)^H) / c`

- Always report **LTV12** and **LTV24**.
- **No reliable churn data:** show a ceiling of `m x 12` and `m x 24`, labelled "assumes zero
  churn, upper bound", plus 2-3 churn scenarios (e.g. 2%, 4%, 6% monthly, adjusted to the
  business type).
- **Beyond 24 months:** only if cohort data actually covers it, or if the person explicitly asks.
  Label it "high-risk extrapolation". Never use `1 / churn` lifetime as a headline figure.

**LTV:CAC**
Report `LTV12 : CAC` and `LTV24 : CAC`.

**Payback: show both**

1. **Survival-required payback** (simple):
   `Payback_simple = CAC / m`
   Meaning: how many months a customer must stay to repay their own CAC.
   Present it as "a customer must stay N months to pay back". It ignores churn.

2. **Retained payback** (cohort-level):
   the first month n where cumulative retained contribution per acquired customer >= CAC:
   `m x sum over t = 0..n-1 of S(t) >= CAC`
   With constant churn: `n = ln(1 - CAC x c / m) / ln(1 - c)`, rounded up.
   - If `CAC >= m / c`, the cohort **never** pays back. Say so plainly.
   - If n > 24, report "not reached within 24 months".
   Meaning: when the average acquired customer, churn included, has repaid acquisition cost.

The gap between the two paybacks shows how much churn delays payback.

For transactional, usage-based, marketplace or project businesses, replace ARPU with
contribution per active customer per month (or per order x order frequency). Explain the adaptation.

## Step 3: compare segments

Break down by acquisition source (paid, outbound, partners, referrals, organic), segment/ICP,
geography, product/plan or acquisition cohort, **only
where the comparison could change a decision**.

- Do not let a blended average hide segments with very different economics.
- Minimum sample: flag any segment with fewer than ~30 new customers as low confidence.
  Such a segment can be `MEASURE` or `FIX`, but not `PUSH`.
- Tier 3: check whether newer cohorts retain better or worse than older ones.

## Step 4: diagnose the main constraint

Pick the single factor most responsible for the result and separate symptom from cause:
acquisition cost, conversion, activation/retention, pricing or expansion, contribution margin,
targeting/customer mix, underinvestment in a healthy motion, or unreliable data.

## Step 5: review current initiatives

For each relevant initiative: the economic lever it should move, the causal mechanism, the
leading indicator that moves first, the review period, and the scale/change/stop condition.
Reject initiatives with no plausible link to the economics under review.

## Step 6: decide, overall status and segment statuses

Statuses:
- `PUSH`: increase spend on healthy economics
- `FIX`: repair the main constraint before adding spend
- `STOP`: cut an activity that destroys value
- `MEASURE`: collect a specific missing input before a bigger decision

Two levels:
- **Segment status** answers: *where* should money go? Give one status per compared segment.
- **Overall status** answers: *should total growth spend go up, stay flat, or go down?*
  - `PUSH`: raise total spend (at least one sizeable PUSH segment; blended retained payback known and acceptable)
  - `FIX`: hold total spend; fix the constraint and/or reallocate between segments
  - `STOP`: cut total spend (blended economics destroy value)
  - `MEASURE`: total spend decision not possible yet (retention/payback unknown, or CAC too distorted to trust)

**Evidence test for `PUSH`** (applies at any tier). PUSH is justified when all hold:
1. CAC is measured over a valid window and not flagged as distorted (Step 1), or the
   distortion only makes it look worse.
2. Retained payback is known **and** the company has actually observed customers staying at
   least that long (observed retention, not an assumed churn scenario). Exception: if the
   first payment's contribution already covers CAC (e.g. upfront annual contracts), retention
   is not needed for payback.
3. Retained payback fits the company's cash runway and funding situation.
4. The segment being pushed has a sufficient sample (see Step 3).

If these hold on blended data for a simple business, PUSH at Tier 2 is fine. If they fail,
say which condition fails and what would satisfy it.

Write the headline in one line, for example:
> **Overall: FIX**. Hold total spend at current level; move budget from Source B (STOP) to Source A (PUSH).

Recommend at most three actions. Each needs the metric to watch, the review period, and the
condition for continuing or stopping.

## Output format

1. **Data tier and definitions**: tier, customer unit, period, cost boundaries, conversions applied, CAC window and any distortion flag.
2. **Core metrics table**: CAC, m, LTV12, LTV24, LTV12:CAC, LTV24:CAC, simple payback, retained payback. Formulas and assumptions shown, ranges where uncertain.
3. **Segment table**: same metrics per segment, sample size, confidence, segment status.
4. **Main constraint or opportunity**: one paragraph.
5. **Headline decision**: overall status + reallocation, one line.
6. **Up to three actions**: metric, review period, scale/stop condition.
7. **Missing data that could change the conclusion**, and what it would take to move up a tier.

## Rules

- Never use contribution-free (revenue-only) LTV when margin is available.
- Never call ad spend "CAC" unless it is fully loaded; otherwise say "paid CAC".
- Never compare LTV and CAC built on different customer units or unaligned periods.
- Always show both paybacks alongside LTV:CAC.
- No universal target ratio (3:1 is not a law). A very high ratio may signal underinvestment.
- Do not recommend higher total spend unless the evidence test in Step 6 passes.
- Never calculate CAC from a single month when the sales cycle is longer than a month.
- LTV beyond 24 months is never the headline and is always labelled high-risk.
- Label estimates, assumptions, proxies and missing data.
- Do not change definitions between calculations.
- Any change to external systems, budgets or campaigns needs separate human approval.

## Worked example (Tier 2)

Inputs: ARPU 200/month, contribution margin 70%, monthly churn 3%, fully loaded CAC 1,500.

- m = 200 x 0.70 = **140/month**
- LTV12 = 140 x (1 - 0.97^12) / 0.03 = **~1,429**
- LTV24 = 140 x (1 - 0.97^24) / 0.03 = **~2,420**
- LTV12:CAC = **0.95**, LTV24:CAC = **1.61**
- Simple payback = 1,500 / 140 = **10.7 months** (a customer must stay ~11 months)
- Retained payback = ln(1 - 1,500 x 0.03 / 140) / ln(0.97) = 12.7, so **month 13**

Reading: the average cohort repays CAC after about a year and only reaches 1.6x by month 24.
Likely `FIX` (retention or CAC) rather than `PUSH`, pending segment data.

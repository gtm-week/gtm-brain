# Deal health (MEDDPICC)

How healthy one deal is, element by element, from what the brain already holds. Read with
`query` object `deal`, search = the company. The read returns this rubric and every memory about
that company, newest first; score from those memories only.

## Elements

- **Metrics**: the measurable result the buyer expects (time or money saved, revenue, a number they will be judged on).
- **Economic buyer**: the person who can approve the money, named, and whether we have spoken to them.
- **Decision criteria**: what they will compare options on (price, security, integration, references).
- **Decision process**: the steps and people between now and a yes, with dates when known.
- **Paper process**: legal, procurement, security review, contract steps and who runs them.
- **Identify pain**: the problem in their words and what it costs them today.
- **Champion**: the person inside who wants this and acts for it (introduces, pushes, shares internal information).
- **Competition**: what else they consider, including building it themselves or doing nothing.

## How to score

- **confirmed**: a memory states it plainly. Cite its ID and a short quote of its own words.
- **weak**: a memory hints at it, is older than 60 days, or comes from our side only (our pitch, our assumption). Cite it and say what is weak.
- **missing**: no memory supports it. Never fill an element from general knowledge or from what a company like this usually wants.

Answer in this shape, one line per element, then at most three questions:

```
Nowa Deweloper · MEDDPICC · 5 of 8 confirmed · from 14 memories, newest 2026-10-21
Metrics          confirmed  m_ab12cd  "cuts land screening from 3 days to 2 hours"
Economic buyer   missing
...
Ask next: who signs off on the budget? ...
```

The questions go to the person, for their next conversation with the client: ask about the
missing and weak elements, most important first (economic buyer, pain, decision process).
This read saves nothing. When the person answers, `remember` it in the deal's context like
any other finding; the next read scores it.

## Turning it off

A brain that does not want deal scoring has `deal_scoring: off` in the front matter of
`brain/admin.md`. Then the read says it is off and returns nothing else; do not score by
hand instead. The line is workplace info: change it through the workplace-change procedure
(propose, then APPROVE), the same as any other line in that file.

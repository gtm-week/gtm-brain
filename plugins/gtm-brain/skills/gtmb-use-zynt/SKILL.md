---
name: gtmb-use-zynt
description: |
  Use ZYNT with the company brain: the news and signals on our ZYNT lists, who has a reason to
  hear from us now, what ZYNT knows about one account, and companies to add to a ZYNT list.
  Reads them against the brain's strategy and ICP and keeps useful findings in Target
  customers. Triggers: "/gtmb-use-zynt", "use ZYNT", "signals for me", "any news on my list?",
  "what changed on my accounts?", "which companies on my list had news this week?", "who on my
  list has a reason to hear from me now?", "what does ZYNT know about Acme?", "add Acme to our
  ZYNT list". Not setting ZYNT up (gtmb-zynt-setup), a full account brief (gtmb-deepdive) or
  market research (gtmb-market-research).
metadata:
  author: GTM Brain, with Wojciech Ozimek (ZYNT)
allowed-tools: [Bash, Read]
---

# GTM Brain: Use ZYNT

Read [the method](references/method.md) once and follow it: news and signals are two things,
and a signal has four parts. Conduct the conversation and author brain records in English.
ZYNT's tool descriptions and server instructions own the details; follow them over this file.

## 1. Reuse what the brain knows

Reuse the session's resolved person, company and offering; use `query` (status) only if this
state is missing. For a plain "any news?", go straight to step 2. For who to contact, why now,
or additions, load Target customers (`load_context`, `mode: add`, slug `icp`) and read
`document` `strategy` and `icp`; a `[not filled]` document is no guidance. Say which document a
judgment rests on. Do not create a context for ZYNT, one account or one run.

## 2. Read ZYNT

Use ZYNT's tools from whatever connection this chat has: a connector, a server added to Codex,
or ZYNT's plugin. The tool names decide, not where they came from.

- **No ZYNT tools in this chat**: say ZYNT is not connected here, and give the steps for this
  app from https://getzynt.com/agent-setup.md. Do not change the person's settings or config
  yourself, and never ask for or use a ZYNT key. Then stop.
- **A tool says the connection can only read** or the person is not signed in: tell them what
  its message says.
- After a real read, `mark_tool` ZYNT `ok` with what worked, or `fail` with the error. A failed
  read is never an empty answer.

**News and signals on the lists.** If ZYNT's own `zynt-news` skill is available, follow it once.
Otherwise: `list_audiences`, then for the named list or every list `list_signals` with
`audience_id` and sort `highest-score`, and `get_list_timeline` with period 7, then 30, then 90
when empty. No lists: `list_signals` with sort `highest-score`, and offer to make a list.
Answer with the signals first, best first, each in four parts with its `app_url`; then the
news, newest first, with its date and `url`, called news. Say which period answered.

**No signals yet.** When `list_signals` returns a `note`, use it. Say in one sentence that ZYNT
is still checking which news is a reason to talk to these companies now, then show the news.
Never call news a signal, and never add that a source was not checked or proves no intent.
Nothing at all: name the lists and the period checked.

**Who has a reason to hear from us now.** From those signals, `get_signal` for the best ones,
`one_per_company` for a shortlist. Connect each to the strategy and ICP: why it matters to us.
Find the person with `list_employees` or `get_relationships` only when the signal names none.

**One account or person.** `lookup_company` by website or LinkedIn, or `lookup_person` by
LinkedIn, then `get_timeline` and `list_signals` with its id. A full brief is gtmb-deepdive.

**Add companies or people.** Only on the person's request. Show the exact records and the list,
ask once, and wait. `list_audiences` first; reuse a list of the right kind. Known records:
look up, then `add_to_audience`. New companies: `add_companies` with name, website and the
list, up to 100 a call. People ZYNT does not know need a name, LinkedIn and email for
`add_people`: never invent them; skip and name who is missing. Only an admin makes a list,
and a team has at most five of its own. Report what was added, skipped and failed.

## 3. Ask, one question at a time

Follow [question handling](../gtmb-start/references/questions.md). Ask only for a missing
account, list or decision that changes the answer. No timeout, default or empty answer is a yes.

## 4. Keep the result

Keep only new, useful findings or decisions through `remember` in Target customers, with the
companies and people, `tools: ["ZYNT"]` and `sources` as `zynt:<the returned app_url or url>`.
Not a whole feed, private notes, contact details or tool payloads. Finish in a few lines: the
answer, its links, and one next step.

## Boundaries

Never sets ZYNT up or changes its setup, sends messages, writes the CRM, rates signals, changes
statuses or makes webhooks. Never invents accounts, people, links or scores. Customer details
stay in the brain, never in this skill.

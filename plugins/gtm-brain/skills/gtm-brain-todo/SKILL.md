---
name: gtm-brain-todo
description: |
  What should I do now: gather everything that waits on the person across the brain (open
  questions, follow-ups named in the summaries, a proposal to approve, tools to connect,
  look-alike names to settle, Slack messages waiting on a reply), order it, and walk through it
  one item at a time. Never a summary: those update by themselves. Triggers:
  "/gtm-brain-todo", "todo", "what should I do now", "what is waiting on me", "my list".
  Also "what's waiting on me in Slack", "Slack replies", "who do I owe a reply" (the Slack part alone).
  Also "what's next in pipeline", "where are we with X", "what is pending" (a context's next
  steps, a read) and "how is the brain doing", "advisor", "health check" (three things worth doing).
allowed-tools: [Bash, Read]
---

# GTM Brain: Todo

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: the brain knows what is pending. This turns it into a short ordered list and
> goes through it with you: answer, do, drop, or leave for later.

## Step 1: gather

Read [operational evidence](../gtm-brain-use-brain/references/operational-evidence.md).
Call `query` (status), then `query` on `memories` with `filters: { "kind": "question" }`
for current open questions. Load relevant contexts to read their summaries and newer
notes. Use targeted `query` searches for the people and work items those results name.
Respect result limits; do not describe a truncated list as everything pending.
Candidates: open questions; follow-ups and dates in summaries and their source memories; a pending
workplace proposal; tools not connected; when Slack is connected and its saved scope allows
a scan, the Slack messages waiting on the person's reply, read live by
[Slack replies](references/slack-replies.md). Never a summary that is behind: those update by
themselves and are nobody's todo.

For candidates dependent on external state, check the relevant task, CRM record or latest
thread with its connected MCP tool before calling it pending. If that is unavailable, mark
the item as last recorded on its date, with current status unverified. Do not invent work to
fill the list or assign every company question to the current person.

## Step 2: order

Dated things first, soonest first; then questions someone else is waiting on; then the rest.
At most eight items; say how many more were found. Each item: the specific action and named
work item, its supporting source, and the owner and date if known. Explain the evidence for
the ordering; suggested owners or deadlines must be labeled as suggestions.

Working guidance explains reusable methods, not pending tasks. Older guidance may contain
one-off actions; verify those against current effective memories before proposing them.

## Step 3: walk through

Show the list once, then take the items one by one. Use the question tool
(`request_user_input`) when available, with the options that fit the item: answer it (then
`remember` with `retracts` the question), done (a note that says what was done), drop
(`remember` that retracts it with the reason), later (leave it). Never invent an answer.
After the last item, one line: what is left.

## Hard rules

- External tools are read only here; "done" records that the person reports doing it.
- Every closed question is closed with a note that says the answer.

## What's next in a context

For "what's next", "where are we with pipeline", "what is pending": a read, not a walkthrough.
Read [what's next](references/whats-next.md).

## How the brain is doing

For "how is the brain doing", "advisor", once a week: a health check and three things worth doing.
Read [advisor](references/advisor.md).

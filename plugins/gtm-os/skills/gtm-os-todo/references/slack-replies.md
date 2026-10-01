# GTM OS: Slack replies

> For humans: the messages in Slack that wait on your answer, in one list with links, so you
> never have to remember where you owe a reply. Read live from Slack; nothing from your DMs is
> written into the brain.

Used by `gtm-os-todo` (the Slack part of the list), for "what's waiting on me in Slack",
"Slack replies", "who do I owe a reply", and by the scheduled morning run when its prompt names
Slack. Read only: never send, react, mark read or post a draft without the person's explicit
yes for that one message.

## Scope: asked once, then reused

The scope is the person's choice, saved as a preference memory in their personal context
(`personal-<handle>`), for example:

    Slack reply scan scope: all of Slack, including DMs and private conversations (chosen 2026-10-01);
    queue twice a day at 09:00 and 17:00 Europe/Warsaw, task slack-reply-queue.

Read it with `query` before the first Slack read. When there is none, ask once with
`configuration_question` and say why first: the broad search reads DMs and private conversations,
so it only runs with their yes.

- All of Slack, including DMs and private conversations (Recommended)
- Public conversations and mentions only
- Do not scan Slack

Save the submitted answer as that preference memory, in the personal context, never as a
company decision: it is one person's consent, not a company fact. A cadence chosen later goes
into the same memory (a new one that `retracts` the old), so the brain never says "no recurring
check" while one runs. "Do not scan Slack" is also saved, and
then Slack is left out of the todo list and the morning run until the person asks again. A
scheduled run never asks: no saved scope means no Slack scan, said in one line.

## Their reply style: learned, then kept current

A suggested reply should read as if the person wrote it. Their style is a preference memory in
their personal context, a description, never their messages:

    Slack reply style: short, one to two lines, lowercase start, no greeting, no sign-off;
    Polish with English work terms (deploy, lead, call); answers with a time or a next step;
    emoji rare, a thumbs-up to acknowledge; with customers a full sentence and a greeting.

Learn it from their own messages, read in the same scan: their recent replies in DMs and
threads, at least twenty when there are that many, within the saved scope. Describe length,
language and code-switching, greeting and sign-off, capitals and punctuation, emoji, how they
say yes, no and later, and how it changes between teammates and people outside the company.
No quotes, names or message content in the memory.

The first time, suggest it before saving: show the description in a few lines and ask with
`question` (Yes, that's me; Needs corrections). Save it as confirmed, with their corrections in
their words, through `remember` (kind preference, the person's personal context, source:
"learned from their Slack replies, <date>"). A scheduled run never asks: it drafts in the style
it just read and offers the description for confirmation in its report. Refresh it with a new memory that `retracts` the
old one when it is older than 30 days, or when the person rewrites a suggested reply: compare
what they sent with the suggestion and fold the difference into the description ("shorter",
"no emoji with customers"). Their correction in their own words is saved as they said it.
A scheduled run uses the saved style and never rewrites it.

Their style is the default, not a rule. When a message calls for a different tone (an unhappy
customer, a first reply to an investor, a no to a teammate), the suggestion may say so in one
line and offer the other version: "Suggest a warmer reply: they are frustrated about the
delay." Customer-facing replies also follow the company's tone of voice document when there is
one (`document` with `action: list` shows it); where it and their style disagree, the document wins with
customers and their style with the team. A tone they keep choosing is a correction to fold
into the style.

## Find what waits on the person

Through the Slack connector only (`check_tools` shows it; never the browser). A connected
Slack is enough: it does not need to be in admin.md's tools, so never send the person through
an APPROVE just to list it there.

1. Who the person is in Slack: the connector's profile read for the current user.
2. Candidates since the last scan (the last 7 days when there is no earlier scan in this chat
   or the run's prompt), with the search the saved scope allows: messages sent to them (DMs and
   group DMs, `to:me`), messages that mention them (search their Slack user ID mention and
   their first name: `to:me` alone misses mentions), and threads they took part in that have
   newer messages. Public-only scope uses the public search and mentions only. Search several
   of these in parallel; then search the specific topic of each hit to see whether they
   already answered it elsewhere.
3. For each candidate, read its thread or the recent DM history. Keep it only when the last
   message is from someone else and it asks, mentions or waits on the person: a question, a
   request, a review, a decision, an intro, a "thoughts?". Leave out what they already
   answered, their own last word, bot and app messages, joins, reactions, FYIs and messages
   they closed with a reaction such as a check mark.

Respect the connector's limits. When a read was capped, say so: never call a truncated list
everything.

## The list

Order: DMs and direct questions first, then mentions, then threads; oldest wait first within
each. At most ten; say how many more. One line each:

    <who>, <#name or DM>, waiting <age>: <what they need, in their words where short> - <permalink>

Then the brain's part, only where it adds something: the customer, deal or context the
message is about (`query` on the people and companies it names), and one suggested reply,
labelled as a suggestion, written in their saved style and in the language of the thread (the
brain's own records stay in English). The facts in it come from the brain or the thread;
never promise a date, price or commitment the brain does not hold. Walk through them the way `gtm-os-todo` walks its list:
reply (draft it, send only after a yes for that message), done (they answered elsewhere),
later.

## On a schedule

The queue runs inside the morning sync, or as its own job when the person wants it more often
(see [source sync](../../gtm-os-sync/references/source-sync.md)). In the Codex app a job
attached to this chat (a heartbeat) is fine for a personal queue: the list lands where the
person already reads it. The recurrence is a calendar rule string, for example
`FREQ=DAILY;BYHOUR=9,17;BYMINUTE=0` for twice a day; verify the returned task ID and save it
with the cadence.

## What enters the brain

Nothing from the scan by default: a reply queue is stale within hours, and DMs do not belong
in git. A decision, a customer fact or a commitment found in a message is remembered only when
the person says so, as a normal memory with the message permalink as its source, in the
fitting context. Never the message text in full.

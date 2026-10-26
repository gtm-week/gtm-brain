---
name: gtm-brain-sync
description: |
  Pull the most recent updates from every connected tool (email, calendar, CRM, notes) since
  the last sync, one subagent per tool in parallel, and record what matters as notes with
  sources in the fitting contexts. Triggers: "/gtm-brain-sync", "sync", "what's new in my
  tools", "catch up", "pull the latest".
  Also "sync every morning", "schedule the sync", "set up the daily refresh" (the recurring run).
allowed-tools: [Bash, Read]
---

# GTM Brain: Sync

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: the brain retains identities, customer relationships and useful findings with sources. Sync is the moment it looks
> at what came in since last time (mail, meetings, deals, notes) and writes down what matters,
> with a pointer to the source. Run it in the morning, or before a call.

## Unattended scheduled runs

For a scheduled source-sync task, reuse its confirmed person, approved tools and saved scopes.
Do not ask questions, offer installations, expand the source list or connect accounts. An
unavailable source is a reported coverage gap; continue other sources. Missing meeting policy
means skip meeting capture that needs that choice, not skip authorized email or CRM activity.
Keep unsupported assumptions and unanswered questions explicit. Never turn missing evidence
into a confident answer. Record only sourced changes, preserving corrections and avoiding
repeated notes for unchanged source records. If subagents are unavailable, read sequentially.
After capture, follow gtm-brain-sync's compilation steps and render. Stay quiet on unchanged,
non-actionable runs; report meaningful changes, source failures and required user action.

## Step 0: what is connected, and since when

Call `query` (status): the tools line says which tools are installed and tested. Read the last
sync time from `work/sync.json` (`Read`; absent means "the last 7 days"). Nothing connected:
in an interactive chat offer `gtm-brain-configure`; in a scheduled run report the blocker
and continue compilation without advancing the sync checkpoint.

## Meeting capture before ordinary activity

Follow [meeting capture](../gtm-brain-use-brain/references/meetings.md). Read `query` (meetings)
for the confirmed person and resume source-specific incomplete coverage and processing records.
Transcription records and direct notes drive capture; historical calendar reconstruction is not
a prerequisite. Use the full requested source scope without the 20-item activity cap. Match
calendar references only when supported. A daily run refreshes selected calendars and continues
with other sources and compilation if that refresh fails. Keep saved per-source coverage as
the retry checkpoint; the overall sync timestamp below never overrides incomplete meeting scopes.

## Step 1: one subagent per tool, in parallel

Read [customer discovery and refresh](../gtm-brain-use-brain/references/customers.md) and
`query` (customers). Check known customer scopes for membership additions and explicit
relationship changes, resuming incomplete scopes. The 20-item activity limit below does not
limit roster capture or an explicit request to save a list. An omission is not automatic
churn. Record relationships through `remember.customer` and scoped coverage in a separate
call after checking kept/held counts. Preserve user corrections and show disagreements.

This skill authorises sub-agents. For each connected tool spawn one agent with this task:
read only what changed since the sync time (the tool's smallest recent-items read: new
threads, events in the next 7 days and the past 2, deals that moved, notes created), keep it
to the 20 most relevant activity items. Separately return new/updated meeting source records with stable account/record IDs, exact links, source dates, participants and their evidenced roles, content availability and pagination. Do not extract attendance from an invitation or discard a source because it has no calendar/CRM match. Separately check that tool's known customer scopes:
resume incomplete rosters and capture the full named list when it has not yet been captured;
for completed scopes check additions and explicit relationship changes. Customer membership
has no 20-item or activity-recency cap. Return activity findings in this shape:

    - <what happened, one or two sentences, names as in the source> · people: <names> · source: <tool>:<connector-provided direct URL, or ID if none> · context: <best-fit slug or ?>

For customer findings also return the source's relationship classification, observation date,
stable per-entity reference/link and identity details. Report the exact checked scope, records
scanned, source-reported total (or unknown), remaining pages, and held/failed records. Do not
infer non-customer status from a missing record. The main conversation records customer
evidence through remember.customer, then coverage separately after verifying capture results.

Never write to a tool. Never record from inside a subagent. Wait for all of them.

## Step 2: record what matters

Preserve each connector-provided original link (url, web_url, webUrl or permalink) in the
findings and in `sources`. Keep its provider, query parameters and fragment exactly. Do not
replace a returned link with an ID. Use an ID only if no direct source link was provided.
Never guess links or substitute an API endpoint, search result or attachment download URL.

Merge the findings. For each one that a colleague would want to know (a reply that changes a
deal, a meeting set, a decision, a new contact at a company we work with), call `remember`
in the fitting context with `people`, `tools`, `sources`, and `kind: question` when it leaves
something to answer. Record what happened, never what should happen next: no to-dos, reminders
or plans for the future, and no follow-up notes for the person. A date the source itself names
(a deadline in an email, a meeting set) stays inside the sourced finding, not as a task.
Skip noise (newsletters, notifications, internal chatter). Capture the run-start UTC instant before reading sources. Advance `work/sync.json` only
when every in-scope activity read and its corresponding memory writes succeeded, using
`{"at": "<run-start ISO>", "tools": [...]}` with the `Write` tool. Keeping run-start rather
than finish avoids missing records that arrive during the read. On partial failure retain
the previous checkpoint (or its absence), report which sources need retry, and deduplicate
already recorded findings on the next run. Meeting and customer coverage keep their own
source-specific checkpoints. Then call `render_dashboard`.

## Step 3: say what changed

Three to six lines, grouped by context: what was recorded, what needs an answer, what was
skipped as noise (one line). Summaries update by themselves after the notes land. Then stop:
no next step, no reminder, no to-do offer (the brain is not the person's to-do system).

## Hard rules

- Read-only towards the tools; the brain is the only thing written.
- Notes record what happened with a source; never a to-do, a reminder or a plan for later.
- Every note carries its direct source link when provided, otherwise its source ID; nothing is pasted in full.
- Delegation is for reading; recording stays in this conversation.
- The subagents report back here. Never switch the person to one of their threads, and never
  open another Codex chat; if one is worth a look, give its link (`codex://threads/<id>`).

## Scheduling the sync

For "sync every morning at nine", "schedule the sync", "set up the daily refresh": read
[schedule](references/schedule.md).

---
name: gtm-brain-woodpecker-setup
description: |
  Set up Woodpecker (woodpecker.co, cold email) from the brain: connect Woodpecker's hosted MCP on
  the person's yes, let them sign in, read the campaigns and how they perform, then draft one email
  sequence from the brain's offer, ICP and voice and save it in Woodpecker as a draft only after a
  yes, never started. Keeps one note so Woodpecker shows in the brain's tools. Triggers: "Set up
  Woodpecker for me", "connect Woodpecker", "/gtm-brain-woodpecker-setup", "draft a Woodpecker
  campaign from the brain". Not sending or starting campaigns, and not writing outreach outside
  Woodpecker (gtm-brain-use-brain).
metadata:
  author: GTM Brain
allowed-tools: [Bash, Read]
---

# GTM Brain: Set up Woodpecker

Woodpecker sends cold email and LinkedIn sequences from the company's mailboxes. A started
campaign sends real email to real people, so this skill reads, drafts and saves drafts; it never
starts one. Conduct the conversation and author brain records in English. Every question follows
[question handling](../gtm-brain-start/references/questions.md).

## 1. Connect Woodpecker first

Nothing can be read until Woodpecker's tools are in the chat, and a chat lists tools only when it
starts, so connect before reading the brain. Pick the first path that works and say which one
this chat uses:

1. **Woodpecker's tools are listed in this chat** (`listCampaigns` among them): use them.
2. **Not listed**: ask "Connect Woodpecker so the brain can read your campaigns and draft one?"
   with Yes, connect Woodpecker and No, not now, both named as numbered choices. On yes, run the
   add yourself (it writes the host's own config, so the host asks the person to approve the
   command):

   ```
   codex mcp add woodpecker --url https://api.woodpecker.co/mcp/v1
   ```

   In Claude Code: `claude mcp add --transport http woodpecker https://api.woodpecker.co/mcp/v1`.

   The sign-in is the person's: they run `codex mcp login woodpecker` (in Claude Code,
   `claude mcp login woodpecker`) in a terminal and sign in to Woodpecker in the browser. Saving
   the server alone gives no access. Wait for their reply. Never run the login yourself. If the
   add fails or is not approved, show the commands for the person to run and stop. After the
   sign-in, the person opens a new chat in this folder and says "Set up Woodpecker for me" again.

The hosted MCP needs no key. Never ask for a Woodpecker API key or offer the Docker server, and
never write a Woodpecker secret to a file, a note, a document or a commit.

An agency account holds several client companies: call `listCompanies`, ask which company this
brain is, and pass that `companyId` on every call after. Without it, calls act on the main
account.

After the first call that works (`listCampaigns`), call `mark_tool` with tool `Woodpecker`, status
`ok` and the number of campaigns in one line; on an error, status `fail` and the exact error, and
stop there.

## 2. Read what the brain and Woodpecker know

Reuse the session's resolved person, company and offering; use `query` (status) only if this
state is missing. Load the Target customers context (`load_context`, `mode: add`, slug `icp`):
Woodpecker's setup and its results belong there. Do not create a context for Woodpecker or for
one campaign.

| The sequence needs | Read it from |
| --- | --- |
| What we sell and the problem it solves | `document` `strategy`, then the Our offer context |
| Who it is for: ICP and personas | `document` `icp`, then the Target customers context |
| How we write | `document` `voice` |
| What worked before | `retrieveCampaignStatistics` on the running and completed campaigns |

A document shown as `[not filled]` is no guidance: read the context instead. Say which brain
files the answers came from.

Show the campaigns in a few lines: name, status, prospects, open and reply rates. Do not judge a
campaign the person did not ask about.

## 3. Draft one sequence, ask one question at a time

Draft one email campaign for one persona: two or three steps (first email and follow-ups), each a
subject and a short body, in the brain's voice, with the delay between steps. Use only claims the
brain supports; a brain line that is a hypothesis, a draft or a `[not filled]` starter makes the
copy a draft and you say so. Never invent a customer, a result, a number or a quote. Use
Woodpecker's snippets (`{{FIRST_NAME}}`, `{{COMPANY}}`) for anything per prospect.

Ask only what the brain does not say, usually which persona to start with or which mailbox to
send from (`listMailboxes`, the SMTP ones available for campaigns). One question pending, the
reason in one line, two or three options, the recommended one first. No default, timeout or empty
result is an answer.

## 4. Save as a draft on a yes, never start

On the person's yes to the copy and the mailbox, create the campaign (`createEmailCampaign`, then
`addEmailStep` for each follow-up) and check its status with `retrieveCampaignDetails`. It must be
DRAFT, PAUSED or EDITED: if it is RUNNING, call `pauseCampaign` at once and tell the person. Give
the link from `buildCampaignUrl`.

This skill never calls `runCampaign`, never adds or deletes prospects and never deletes a campaign
or a step. Starting the campaign is the person's, in Woodpecker: end by naming it, "Add the
prospects and start it in Woodpecker when you are ready". Report what Woodpecker returned.

## 5. Keep the result

When the draft is saved, keep one note through `remember` in Target customers: the campaign name,
the persona, the number of steps, the mailbox and the date, with `tools: ["Woodpecker"]` and
`sources` as `woodpecker:<the campaign id Woodpecker returned>`. Not the email copy, not any
prospect. Then call `check_tools`.

Never claim a failed request succeeded. Finish in one to three sentences, then offer the next
step the person can take now: "How are my running campaigns doing this week?"

## Boundaries

Never sends email, never starts or resumes a campaign, never adds, updates or deletes prospects
and never writes to the CRM from this skill. Never invents a claim, a customer or a number in the
copy. Prospects and replies stay in Woodpecker, not in the brain; customer details stay in the
brain, never in this skill.

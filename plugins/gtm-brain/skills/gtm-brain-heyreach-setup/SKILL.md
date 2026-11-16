---
name: gtm-brain-heyreach-setup
description: |
  Set up HeyReach (heyreach.io, LinkedIn outreach) from the brain: the person connects HeyReach's
  MCP with their workspace's Connection URL, then the agent reads the campaigns, sender accounts
  and stats, and drafts a connection note and follow-ups from the brain's offer, ICP and voice for
  the person to paste into HeyReach. Never sends, adds leads or starts a campaign. Keeps one note
  so HeyReach shows in the brain's tools. Triggers: "Set up HeyReach for me", "connect HeyReach",
  "/gtm-brain-heyreach-setup", "draft LinkedIn messages for HeyReach". Not email campaigns
  (gtm-brain-woodpecker-setup).
metadata:
  author: GTM Brain
allowed-tools: [Bash, Read]
---

# GTM Brain: Set up HeyReach

HeyReach runs LinkedIn outreach from the team's LinkedIn accounts: connection requests, messages
and InMails. A started campaign or an added lead reaches real people under a real person's name,
so this skill reads and drafts; it never acts in HeyReach. Conduct the conversation and author
brain records in English. Every question follows
[question handling](../gtm-brain-start/references/questions.md).

## 1. Connect HeyReach first

Nothing can be read until HeyReach's tools are in the chat, and a chat lists tools only when it
starts, so connect before reading the brain. Pick the first path that works and say which one this
chat uses:

1. **HeyReach's tools are listed in this chat**: use them.
2. **Not listed**: HeyReach has no sign-in; each workspace has its own MCP Connection URL, and the
   key is part of it. The URL is a secret, so the person adds it themselves and never pastes it in
   the chat. Tell them, in one message:
   - In HeyReach: the workspace, Integrations, HeyReach MCP Server, New MCP Key; copy the
     Connection URL.
   - In a terminal: `codex mcp add heyreach --url <the Connection URL>` (in Claude Code:
     `claude mcp add --transport http heyreach <the Connection URL>`).
   - Then open a new chat in this folder and say "Set up HeyReach for me" again.

   Then stop. A new MCP Key changes the Connection URL; after one, the person adds the new URL the
   same way.

When the person pastes a Connection URL or a key into the chat anyway, do not use it, repeat it or
write it anywhere: tell them to regenerate the key in HeyReach, since the chat now holds it, and
add the new URL from the terminal. Never write a HeyReach URL, key or secret to a file, a note, a
document or a commit.

HeyReach publishes no fixed tool list: read the tool descriptions before the first call, and use
only the ones that read (campaigns, LinkedIn accounts, lists, stats, conversations). After the
first call that works, call `mark_tool` with tool `HeyReach`, status `ok` and the number of
campaigns in one line; on an error, status `fail` and the error with any URL or key removed (the
HTTP status or the error class only), and stop there.

Never run `codex mcp list`, `codex mcp get`, `claude mcp list` or `claude mcp get`, and never read
the host's config files (`~/.codex/config.toml`, `~/.claude.json`), to check HeyReach: they print
the Connection URL into the chat. When HeyReach's tools are still not listed after the person
added the URL, tell them to check the URL in their own terminal and stop.

## 2. Read what the brain and HeyReach know

Reuse the session's resolved person, company and offering; use `query` (status) only if this
state is missing. Load the Target customers context (`load_context`, `mode: add`, slug `icp`):
HeyReach's setup and its results belong there. Do not create a context for HeyReach or for one
campaign.

| The messages need | Read it from |
| --- | --- |
| What we sell and the problem it solves | `document` `strategy`, then the Our offer context |
| Who it is for: ICP and personas | `document` `icp`, then the Target customers context |
| How we write | `document` `voice` |
| What worked before | HeyReach's campaign and overall stats: acceptance and reply rates |

A document shown as `[not filled]` is no guidance: read the context instead. Say which brain files
the answers came from.

Show the campaigns in a few lines: name, status, sender accounts, acceptance and reply rates. Do
not judge a campaign the person did not ask about. Do not copy conversations or lead details into
the chat beyond what the person asks for.

## 3. Draft the messages, ask one question at a time

Draft for one persona: a connection note within LinkedIn's 300 characters, and two follow-up
messages, each with the wait before it. Use only claims the brain supports; a brain line that is a
hypothesis, a draft or a `[not filled]` starter makes the copy a draft and you say so. Never invent
a customer, a result, a number or a quote. Use HeyReach's variables (`{FIRST_NAME}`,
`{COMPANY}`) for anything per lead.

Ask only what the brain does not say, usually which persona to start with. One question pending,
the reason in one line, two or three options, the recommended one first. No default, timeout or
empty result is an answer.

The drafts stay in the chat: the person pastes them into a HeyReach campaign and starts it there.
End by naming it, "Paste these into your campaign in HeyReach and start it when you are ready".

## 4. Keep the result

When the person says the drafts are right, keep one note through `remember` in Target customers:
the persona, the campaign it is for, the number of messages and the date, with
`tools: ["HeyReach"]` and `sources` as `heyreach:<the campaign id HeyReach returned>`, or
`heyreach:workspace` when there is no campaign yet. Not the message text, not any lead. Then call
`check_tools`.

Never claim a failed request succeeded. Finish in one to three sentences, then offer the next step
the person can take now: "How did my LinkedIn campaigns do this week?"

## Boundaries

Never sends a connection request, a message or an InMail, never adds, imports or removes leads,
never creates, starts, resumes or pauses a campaign, and never writes to the CRM from this skill.
Never invents a claim, a customer or a number in the copy. Leads and conversations stay in
HeyReach, not in the brain; customer details stay in the brain, never in this skill.

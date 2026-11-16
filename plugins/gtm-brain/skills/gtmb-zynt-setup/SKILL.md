---
name: gtmb-zynt-setup
description: |
  Set up ZYNT from the brain: the person pastes the prompt ZYNT gives them ("Set up ZYNT for
  me"), and the agent fills ZYNT's onboarding from the brain's strategy, ICP, market and target
  companies, asks only what the brain does not say, connects ZYNT so it shows in the brain's
  tools, and keeps one note. Triggers: "Set up ZYNT for me", "/gtmb-zynt-setup",
  "connect ZYNT", "set up Zynt". Not reading ZYNT's news or signals after setup
  (gtmb-use-brain), and not market research (gtmb-market-research).
metadata:
  author: GTM Brain, with Wojciech Ozimek and Filip (ZYNT)
allowed-tools: [Bash, Read, WebFetch]
---

# GTM Brain: Set up ZYNT

ZYNT finds companies that are ready to buy and says why now. Read
[the method](references/method.md) once and follow it. Conduct the conversation and author brain
records in English. Every question follows
[question handling](../gtmb-start/references/questions.md).

## 1. Reuse what the brain knows

Reuse the session's resolved person, company and offering; use `query` (status) only if this
state is missing. Load the Target customers context (`load_context`, `mode: add`, slug `icp`):
ZYNT's setup and its results belong there. Do not create a context for ZYNT or for one account.

Read what ZYNT's onboarding needs, before asking anything:

| ZYNT asks for | Read it from |
| --- | --- |
| What we sell and to whom | `document` `strategy`, then the Our offer context |
| The ideal customer and the segment to start with | `document` `icp`, then the Target customers context |
| Market and competitors | `document` `market`, then the Market context |
| How we write | `document` `voice` |
| Target companies | `query` (entities, kind organization) and Target customers notes |

A document shown as `[not filled]` is no guidance: read the context instead. Say which brain
files the answers came from.

## 2. Connect ZYNT

Pick the first path that works and say which one this chat uses:

1. **ZYNT's MCP tools are listed in this chat**: use them.
2. **The person pasted a ZYNT key**: read `https://app.getzynt.com/agent-setup.md` and follow it
   with curl or the host's HTTP tool, one request per step, each answer sent once. Write no code,
   scripts or branches.
3. **Neither**: send the person to `https://app.getzynt.com/start`, "Set up with my AI agent",
   "Copy for my agent", and stop.

The key is used in this chat only. Never write it to a file, a note, a document, a commit or
the dashboard, and never repeat it back in full. ZYNT shows the key once and hides it after.

So that ZYNT shows in the brain's tools, without MCP: after the first request that works, call
`mark_tool` with tool `ZYNT`, status `ok` and what it returned in one line; when a request fails
with an expired or refused key, call it with status `fail` and the exact error. The note in step
5 names ZYNT, and `check_tools` at the end puts ZYNT on the brain's tools as connected through
its API (or read failed). Do not offer MCP: ZYNT's own MCP tools are used only when they are
already listed in this chat.

## 3. Ask, one question at a time

Ask only what the brain does not say; usually only which segment to start with. One question
pending, the reason in one line, two or three options, the recommended one first. No default,
timeout or empty result is an answer.

## 4. Send, then let the person confirm

Send the answers to ZYNT once, following its guide. A brain line that is a hypothesis, a draft or
a `[not filled]` starter goes as a draft, never as a confirmed fact. Add the target companies as
a ZYNT list only after the person says yes to the list you show.

Never confirm on the person's behalf: end by naming the screen, "Read the summary in ZYNT and
click Looks right, or tell me what is wrong". Do not answer in ZYNT while the person does.

## 5. Keep the result

When the person says the summary is right, keep one note through `remember` in Target customers:
what was set up, the segment, the list name and the date, with `tools: ["ZYNT"]` and `sources`
as `zynt:<the list or workspace id ZYNT returned>`. Not the answers sent, not the key. Then call `check_tools`.

Never claim a failed request succeeded. Finish in one to three sentences, then offer the first
question the person can ask now: "Which companies on my list had news this week?"

## Boundaries

Never sends email, invitations or posts, and never changes the CRM. Never invents a company, a
segment or a signal type the brain does not support. Customer details stay in the brain, never in
this skill.

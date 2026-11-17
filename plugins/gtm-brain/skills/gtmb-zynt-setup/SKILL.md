---
name: gtmb-zynt-setup
description: |
  Set up ZYNT from the brain through ZYNT's own plugin: the agent fills ZYNT's onboarding from
  the brain's strategy, ICP, market and target companies with the plugin's tools, asks only what
  the brain does not say, and keeps one note. Without the plugin, it gives the steps to install
  it. Triggers: "Set up ZYNT for me", "/gtmb-zynt-setup",
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

## 2. Use ZYNT's plugin

ZYNT is set up only through the tools of ZYNT's plugin (`getzynt/zynt-plugins`): the person signs
in through the browser, so there is no key. Follow the tools' descriptions over this file:
`add_setup_context` with what step 1 found, then `get_setup` and `answer_setup`.

- **A tool says the person is not signed in**: in Codex they run `codex mcp login zynt`; in
  Claude Code they type `/mcp` and pick `zynt`. They sign in in the browser, then continue.
- **No ZYNT tools in this chat**: give the install steps and stop. In Codex:
  `codex plugin marketplace add getzynt/zynt-plugins`, `codex plugin add zynt@zynt`, then
  `codex mcp login zynt`. In Claude Code: `/plugin marketplace add getzynt/zynt-plugins`,
  `/plugin install zynt@zynt`, then `/mcp`, pick `zynt`. No ZYNT account yet:
  `https://app.getzynt.com/sign-up` first. Then a new chat, and "Set up ZYNT for me" again.
- **The person pasted a ZYNT key**: do not use it, and do not repeat it. Say the plugin signs
  them in instead, and give the install steps above when the tools are missing.

Never connect ZYNT another way: no `codex mcp add`, no key in a header, no curl. `check_tools` at
the end finds the plugin by itself.

## 3. Ask, one question at a time

Ask only what the brain does not say; usually only which segment to start with. One question
pending, the reason in one line, two or three options, the recommended one first. No default,
timeout or empty result is an answer.

## 4. Send, then let the person confirm

Send each answer to ZYNT once, through its tools. A brain line that is a hypothesis, a draft or
a `[not filled]` starter goes as a draft, never as a confirmed fact. Add the target companies as
a ZYNT list only after the person says yes to the list you show.

Never confirm on the person's behalf: show ZYNT's summary in the chat and ask "Looks right, or
what is wrong?". Answer the summary in ZYNT only with the person's yes to that question.

## 5. Keep the result

When the person says the summary is right, keep one note through `remember` in Target customers:
what was set up, the segment, the list name and the date, with `tools: ["ZYNT"]` and `sources`
as `zynt:<the list or workspace id ZYNT returned>`. Not the answers sent. Then call `check_tools`.

Never claim a failed call succeeded. Finish in one to three sentences, then offer the first
question the person can ask now: "Which companies on my list had news this week?"

## Boundaries

Never sends email, invitations or posts, and never changes the CRM. Never invents a company, a
segment or a signal type the brain does not support. Customer details stay in the brain, never in
this skill.

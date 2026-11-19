---
name: gtmb-zynt-setup
description: |
  Set up ZYNT from the brain through ZYNT's tools, from any ZYNT connection (its plugin, a
  Claude or ChatGPT connector, a server added to Codex): the agent fills ZYNT's onboarding from
  the brain's strategy, ICP, market and target companies, puts the brain's companies and people
  on ZYNT lists, asks only what the brain does not say, and keeps one note. Without ZYNT's tools
  in Codex, it connects ZYNT itself (no plugin) and gives one link to continue. Triggers: "Set up ZYNT for me", "/gtmb-zynt-setup",
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
| Target people | `query` (entities, kind person) and Target customers notes |

A document shown as `[not filled]` is no guidance: read the context instead. Say which brain
files the answers came from.

## 2. Connect ZYNT

ZYNT is set up through its tools, from any ZYNT connection: a ZYNT server in Codex, a ZYNT
connector in Claude or ChatGPT, or ZYNT's plugin. The tool names decide, not where they came
from. No plugin is needed. The person signs in through the browser, so there is no key. With
ZYNT's tools in this chat, go on: `add_setup_context` with what step 1 found, then `get_setup`
and `answer_setup`. Follow the tools' descriptions over this file.

**In Codex, with no ZYNT tools in this chat**, connect ZYNT for the person; they only approve
access in the browser. Say first: "I'll connect ZYNT. Approve access in the browser window that
opens."

1. Run `codex mcp list --json`. No `zynt` entry: run
   `codex mcp add zynt --url https://app.getzynt.com/mcp`, which adds ZYNT and starts the sign-in.
   A `zynt` entry whose `auth_status` is not `o_auth`: run `codex mcp login zynt`.
2. Keep that command running until it ends: a yielded shell call has not ended. Then run
   `codex mcp list --json` again. Only `zynt` with `auth_status` `o_auth` is signed in. Anything
   else: say the sign-in did not finish, and run step 1 once more.
3. Codex gives a chat its tools when the chat starts, so ZYNT's tools come in the next chat.
   Keep a note with `remember` in Target customers ("ZYNT connected; setup goes on in a new
   chat"), then give one link named "Continue ZYNT setup" and nothing to type:
   `codex://threads/new?path=<encoded absolute brain folder>&prompt=<encoded "Set up ZYNT for me">`.
   Say "Open it, then press Send." Never open the chat yourself; plain steps only when the
   link fails.

Elsewhere:

- **Claude Code**: `claude mcp add --transport http zynt https://app.getzynt.com/mcp`, then
  `/mcp`, pick `zynt` and sign in.
- **Claude or ChatGPT**: add a custom connector with the URL `https://app.getzynt.com/mcp`.
- **No ZYNT account yet**: `https://app.getzynt.com/sign-up` first.
- **A tool says the connection can only read**: tell the person what its message says (sign in
  again).
- **ZYNT says no setup chat is open**: the workspace is set up already. Skip to step 5 for the
  lists, and say a new segment starts with "New scenario" at
  `https://app.getzynt.com/settings/business`.
- **The person pasted a ZYNT key**: do not use it, and do not repeat it. Say the browser sign-in
  replaces it.

Never put a ZYNT key in a header and never use curl: the tools are the only way. Never say
"signed in" before `codex mcp list --json` shows it. `check_tools` at the end finds the
connection by itself.

## 3. Ask, one question at a time

Ask only what the brain does not say; usually only which segment to start with. One question
pending, the reason in one line, two or three options, the recommended one first. No default,
timeout or empty result is an answer.

## 4. Send, then let the person confirm

Send each answer to ZYNT once, through its tools. A brain line that is a hypothesis, a draft or
a `[not filled]` starter goes as a draft, never as a confirmed fact.

Never confirm on the person's behalf: show ZYNT's summary in the chat and ask "Looks right, or
what is wrong?". Answer the summary in ZYNT only with the person's yes to that question.

## 5. Put the brain's companies and people on ZYNT lists

ZYNT watches the companies and people on its lists. A list holds companies or people, not both,
so make two for the segment: "GTM Brain · <segment> · Companies" and "GTM Brain · <segment> ·
People".

1. From step 1, take the named target companies, each with a website, and the target people,
   each with a LinkedIn URL. Leave out current customers and competitors.
2. Show both lists with their counts and ask whether to put them on ZYNT lists: Yes, add them;
   No, skip.
3. `list_audiences`: reuse a list with the same name; otherwise `create_audience` with
   `subject_type` company or person. Only an admin can make a list, and a team has at most five
   of its own: when it fails, say so and offer a list ZYNT already has.
4. Companies: `add_companies` with the list's `audience_id`, up to 100 a call, each with `name`
   and `website_url`.
5. People: `lookup_person` with each LinkedIn URL, then `add_to_audience` with the list and the id
   it returns. A person ZYNT does not know yet is skipped: say who, by name.
6. Say how many went on each list.

## 6. Keep the result

When the person says the summary is right, keep one note through `remember` in Target customers:
what was set up, the segment, the list names and the date, with `tools: ["ZYNT"]` and `sources`
as `zynt:<the list or workspace id ZYNT returned>`. Not the answers sent. Then call `check_tools`.

Never claim a failed call succeeded. Finish in one to three sentences, then offer what the
person can ask now:

- "Signals for me": the signals and news on every ZYNT list, best first.
- "Which companies on my list had news this week?"
- "Who on my list has a reason to hear from me now?"
- "What does ZYNT know about <company>?"

## Boundaries

Never sends email, invitations or posts, and never changes the CRM. Never invents a company, a
segment or a signal type the brain does not support. Customer details stay in the brain, never in
this skill.

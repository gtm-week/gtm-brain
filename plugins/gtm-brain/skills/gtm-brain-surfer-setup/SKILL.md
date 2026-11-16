---
name: gtm-brain-surfer-setup
description: |
  Set up Surfer (surfer.ai, formerly SurferSEO, content and SEO) from the brain: connect Surfer's
  hosted MCP on the person's yes, let them sign in, propose a few topics from the brain's strategy,
  market and what customers said, and create one Surfer content brief after a yes. Never publishes.
  Keeps one note so Surfer shows in the brain's tools. Triggers: "Set up Surfer for me", "connect
  Surfer", "/gtm-brain-surfer-setup", "plan our blog with Surfer". Not later content work after
  setup (gtm-brain-use-brain), and not the brand voice itself (gtm-brain-voice).
metadata:
  author: GTM Brain
allowed-tools: [Bash, Read]
---

# GTM Brain: Set up Surfer

Surfer researches what people search for, builds content briefs and scores and writes articles.
This skill connects Surfer and turns what the brain knows about the market and the customers into
the first brief. Conduct the conversation and author brain records in English. Every question
follows [question handling](../gtm-brain-start/references/questions.md).

## 1. Connect Surfer first

Nothing can be researched until Surfer's tools are in the chat, and a chat lists tools only when it
starts, so connect before reading the brain. Pick the first path that works and say which one this
chat uses:

1. **Surfer's tools are listed in this chat**: use them.
2. **Not listed**: ask "Connect Surfer so the brain can plan content with it?" with Yes, connect
   Surfer and No, not now, both named as numbered choices. On yes, run the add yourself (it writes
   the host's own config, so the host asks the person to approve the command):

   ```
   codex mcp add surfer --url https://mcp.surferseo.com/mcp
   ```

   In Claude Code: `claude mcp add --transport http --scope user surfer https://mcp.surferseo.com/mcp`.

   The sign-in is the person's: they run `codex mcp login surfer` in a terminal (in Claude Code,
   `/mcp`, pick surfer, Authenticate), sign in to Surfer in the browser, pick the organization and
   click Authorize. Wait for their reply. Never run the login yourself. If the add fails or is not
   approved, show the commands for the person to run and stop. After the sign-in, the person opens
   a new chat in this folder and says "Set up Surfer for me" again.

Surfer's MCP comes with the AI Search Analytics, Pro, Peace of Mind and Enterprise plans. When the
sign-in or a call is refused for the plan, say so in one line and stop. Never ask for a Surfer API
key, and never write a Surfer secret to a file, a note, a document or a commit.

Surfer publishes its tools to the chat, not as a fixed list: read the tool descriptions before the
first call. After the first call that works, call `mark_tool` with tool `Surfer`, status `ok` and
what it returned in one line; on an error, status `fail` and the exact error, and stop there.

## 2. Read what the brain knows

Reuse the session's resolved person, company and offering; use `query` (status) only if this
state is missing. Load the Market context (`load_context`, `mode: add`, slug `market`): Surfer's
setup and the content plan belong there. Do not create a context for Surfer or for one article.

| The plan needs | Read it from |
| --- | --- |
| What we sell and the problem it solves | `document` `strategy`, then the Our offer context |
| Who reads it: ICP and personas | `document` `icp`, then the Target customers context |
| The market, competitors and their words | `document` `market`, then the Market context |
| What customers said on calls | `query` with `search` for the problem words, over meeting notes |
| How we write | `document` `voice` |

A document shown as `[not filled]` is no guidance: read the context instead. Say which brain files
the answers came from.

## 3. Propose topics, ask one question at a time

Propose three to five topics, each with the customer problem it answers, the brain line it comes
from and the search phrase to check in Surfer. Prefer the customers' own words over the company's.
Never invent a statistic, a customer or a quote; a brain line that is a hypothesis or a
`[not filled]` starter makes the topic a draft and you say so.

On the person's yes, check the phrases with Surfer's keyword research when it has it, and show
what Surfer returned next to each topic. Ask which topic to brief first. One question pending, the
reason in one line, two or three options, the recommended one first. No default, timeout or empty
result is an answer.

## 4. Brief on a yes, write on a second yes, never publish

Picking a topic is not a yes to create anything. Creating the brief uses one of the plan's Content
Editor documents, so ask first and name that cost: "Create the Surfer brief for this topic? It
uses one of your plan's Content Editor documents." with Yes, create the brief and No, not now. On
that yes, create one Surfer document or content brief for the chosen topic and give its link. A
yes covers one brief.

Generating a full article or images may spend the plan's credits or document limits: ask again
first, naming what it will create. A yes covers that one article. This skill never publishes,
never connects a CMS and never changes a live page. Report what Surfer returned.

## 5. Keep the result

When the brief is created, keep one note through `remember` in Market: the topic, the search
phrase, the brief's name and the date, with `tools: ["Surfer"]` and `sources` as
`surfer:<the document or brief id Surfer returned>`. Not the brief's text. Then call `check_tools`.

Never claim a failed request succeeded. Finish in one to three sentences, then offer the next step
the person can take now: "Write the first draft of this brief in our voice".

## Boundaries

Never publishes or schedules content, never connects or writes to a CMS and never creates a brief
or an article without a yes for it. Never invents a statistic, a customer or a quote. Customer
details stay in the brain, never in this skill.

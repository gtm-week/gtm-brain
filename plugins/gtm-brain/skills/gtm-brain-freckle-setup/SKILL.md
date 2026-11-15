---
name: gtm-brain-freckle-setup
description: |
  Set up Freckle (freckle.io, lead enrichment) from the brain: connect Freckle's MCP on the
  person's yes, let them sign in, then draft the first Freckle plan from the brain's ICP, personas
  and target companies, build it only after a yes, and keep one note so Freckle shows in the
  brain's tools. Triggers: "Set up Freckle for me", "connect Freckle", "/gtm-brain-freckle-setup",
  "enrich my target companies with Freckle". Not the time tracker at letsfreckle.com. Not later
  Freckle work after setup (Freckle's own skills or gtm-brain-use-brain), and not defining the
  ICP (gtm-brain-define-icp).
metadata:
  author: GTM Brain
allowed-tools: [Bash, Read]
---

# GTM Brain: Set up Freckle

Freckle builds lists of companies and people, enriches and scores them, imports CRM records and
watches signals. It runs on credits. This skill connects it and turns what the brain already
knows into Freckle's first plan. Conduct the conversation and author brain records in English.
Every question follows [question handling](../gtm-brain-start/references/questions.md).

## 1. Connect Freckle first

Nothing can be built until Freckle's tools are in the chat, and a chat lists tools only when it
starts, so connect before reading the brain. Pick the first path that works and say which one
this chat uses:

1. **Freckle's tools are listed in this chat** (`workspace_context` among them): use them.
2. **Not listed**: ask "Connect Freckle so the brain can build lists in it?" with Yes, connect
   Freckle and No, not now. On yes, run the add yourself (it writes the host's own config, so the
   host asks the person to approve the command):

   ```
   codex mcp add freckle --url https://next-api.freckle.io/mcp/full
   ```

   In Claude Code: `claude mcp add --transport http freckle https://next-api.freckle.io/mcp/full`.

   The sign-in is the person's: in Codex they run `codex mcp login freckle` in a terminal, in
   Claude Code they open `/mcp` and pick freckle; they sign in to Freckle in the browser and
   choose the Workspace. Wait for their reply. Never run the login yourself. If the add fails or
   is not approved, show the commands for the person to run and stop. Hosts list tools when a
   chat starts: after the sign-in, the person opens a new chat in this folder and says "Set up
   Freckle for me" again.

Freckle needs no key here: never ask for one, and never write a Freckle secret to a file, a note,
a document or a commit. A CRM or other connection inside Freckle goes only through the browser
form Freckle's `connections_setup` returns.

First call `workspace_context`: it names the Workspace and the credit balance. Then call
`mark_tool` with tool `Freckle`, status `ok` and the Workspace in one line; on an error, status
`fail` and the exact error, and stop there.

## 2. Read what the brain knows

Reuse the session's resolved person, company and offering; use `query` (status) only if this
state is missing. Load the Target customers context (`load_context`, `mode: add`, slug `icp`):
Freckle's setup and its results belong there. Do not create a context for Freckle or for one
account.

Read what Freckle's first plan needs, before asking anything:

| Freckle needs | Read it from |
| --- | --- |
| The ideal customer: industry, size, market | `document` `icp`, then the Target customers context |
| Personas: titles, levels, functions | `document` `icp`, then the Target customers and Our offer contexts |
| Target companies, with domains | `query` (entities, kind organization) and Target customers notes |
| The CRM in use | the brain's tools (`check_tools`) |

A document shown as `[not filled]` is no guidance: read the context instead. Say which brain
files the answers came from. Keep the ICP and personas in the brain's words; never rewrite them
into Freckle's.

## 3. Draft the plan, ask one question at a time

When Freckle's own `freckle` and `freckle-plan` skills are installed, follow them for how to
build; this skill only supplies what the brain knows. Show one plan in one message:

- the ICP and personas, quoted from the brain, with the file each came from;
- the target companies the brain names, as a list to import, and how many;
- people per company (recommend 3 when the brain does not say);
- what it will build (free) and what a run would cost against the balance (credits).

Mark a brain line that is a hypothesis, a draft or a `[not filled]` starter as a draft in the
plan. Never add a company the brain does not name, and never invent a persona. Ask only what the
brain does not say, usually which segment to start with or the people per company. One question
pending, the reason in one line, two or three options, the recommended one first. No default,
timeout or empty result is an answer.

## 4. Build on a yes, run on a second yes

On the person's yes to the plan, build it in Freckle: the list of target companies and the
workflow, nothing run. A run spends credits: ask again with Freckle's cost estimate, and over 100
rows run a sample first and show it. A yes covers that run only; a change in cost or scope, an
automatic schedule or a CRM write asks again. Report what Freckle returned; a queued run is not a
finished one.

## 5. Keep the result

When the build is done, keep one note through `remember` in Target customers: the Workspace, what
was built (list and workflow names), how many companies and the date, with `tools: ["Freckle"]`
and `sources` as `freckle:<the Workbook or Workflow id Freckle returned>`. Not the plan's
contents, not any enriched contact data. Then call `check_tools`.

Never claim a failed request succeeded. Finish in one to three sentences, then offer the next
step the person can take now: "Run it on the first 10 companies".

## Boundaries

Never sends email, connection requests or posts, never pushes Ads audiences and never writes to
the CRM from this skill. Never spends credits without a yes for that run. Never invents a company,
a persona or a contact. Enriched people and emails stay in Freckle, not in the brain; customer
details stay in the brain, never in this skill.

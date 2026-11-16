---
name: gtmb-clay-setup
description: |
  Set up Clay (clay.com, GTM data and enrichment) from the brain: connect Clay on the person's
  yes, let them sign in, then search Clay for the brain's ICP and target companies (free), enrich
  only after a second yes, and keep one note so Clay shows in the brain's tools. Triggers: "Set up
  Clay for me", "connect Clay", "/gtmb-clay-setup", "find my target companies in Clay". Not
  later Clay work after setup (Clay's own skills or gtmb-use-brain), and not defining the
  ICP (gtmb-define-icp).
metadata:
  author: GTM Brain
allowed-tools: [Bash, Read]
---

# GTM Brain: Set up Clay

Clay finds companies and people, researches accounts and enriches contacts. Searches are free;
enrichments and Functions spend the workspace's credits. This skill connects Clay and turns what
the brain already knows into Clay's first search. Conduct the conversation and author brain
records in English. Every question follows
[question handling](../gtmb-start/references/questions.md).

## 1. Connect Clay first

Nothing can be searched until Clay is in the chat, and a chat lists tools only when it starts,
so connect before reading the brain. Pick the first path that works and say which one this chat
uses:

1. **Clay's MCP tools are listed in this chat**: use them.
2. **Clay's plugin is installed** (its `clay` skill is listed, or `clay whoami` answers): run
   `clay whoami`. Exit 0 is signed in; exit 3 means the person runs `clay login` and signs in in
   the browser (the link lasts about 5 minutes); exit 5 is a network problem: say so and stop.
3. **Neither**: ask "Connect Clay so the brain can find your target companies in it?" with Yes,
   connect Clay and No, not now, both named as numbered choices. On yes, run the add yourself (it writes the host's own config,
   so the host asks the person to approve the command):

   ```
   codex plugin marketplace add clay-run/agent-plugins
   ```

   Then the person opens Plugins in Codex, installs clay and runs its `clay:setup` skill, which
   installs the `clay` CLI and signs them in. In Claude Code: `/plugin marketplace add
   clay-run/agent-plugins`, then `/plugin install clay@clay-plugins` and `/clay:setup`. Never run
   the sign-in yourself. If the add fails or is not approved, show the commands for the person to
   run and stop. After setup, the person opens a new chat in this folder and says "Set up Clay
   for me" again.

The person needs Editor or Admin access in the company's Clay workspace; a Viewer cannot sign
in. When Clay connects to a personal workspace instead, the person accepts the company invite,
signs out and signs in again choosing the company workspace.

Never ask for a Clay API key, and never write a Clay secret to a file, a note, a document or a
commit.

After the first call that works (`clay whoami`, or Clay's MCP tool that names the workspace), call
`mark_tool` with tool `Clay`, status `ok` and the workspace in one line; on an error, status
`fail` and the exact error, and stop there.

## 2. Read what the brain knows

Reuse the session's resolved person, company and offering; use `query` (status) only if this
state is missing. Load the Target customers context (`load_context`, `mode: add`, slug `icp`):
Clay's setup and its results belong there. Do not create a context for Clay or for one account.

| Clay needs | Read it from |
| --- | --- |
| The ideal customer: industry, size, location | `document` `icp`, then the Target customers context |
| Personas: titles, levels, functions | `document` `icp`, then the Target customers and Our offer contexts |
| Target companies, with domains | `query` (entities, kind organization) and Target customers notes |

A document shown as `[not filled]` is no guidance: read the context instead. Say which brain
files the answers came from. Keep the ICP and personas in the brain's words.

## 3. Search first, free

When Clay's own skills are installed, follow them for how to search and enrich; this skill only
supplies what the brain knows. Show one plan in one message:

- the ICP and personas, quoted from the brain, with the file each came from;
- the target companies the brain names, to look up in Clay, and how many;
- the people search: the personas at those companies, people per company (recommend 3 when the
  brain does not say);
- what is free (company and people search) and what would spend credits (enrichment: emails,
  phones, a Function that enriches).

Mark a brain line that is a hypothesis, a draft or a `[not filled]` starter as a draft. Never add
a company the brain does not name, and never invent a persona. Ask only what the brain does not
say, usually which segment to start with or the people per company. One question pending, the
reason in one line, two or three options, the recommended one first. No default, timeout or empty
result is an answer.

On the person's yes, run the searches and show what Clay found: each company with its domain,
the people found per company, and the companies Clay did not find. Results come in pages of 20,
up to 100.

## 4. Enrich on a second yes

Enrichment spends credits: ask again, naming the rows and what each enrichment returns, and the
credits when Clay states them. A rep's monthly limit hard-blocks further actions until the 1st;
when Clay reports the limit, say so and stop. A yes covers that enrichment only; more rows, another
enrichment or a Function asks again. Report what Clay returned; never claim a row was enriched
when it was not.

## 5. Keep the result

When the search or the enrichment is done, keep one note through `remember` in Target customers:
the workspace, what was searched, how many companies and people were found and the date, with
`tools: ["Clay"]` and `sources` as `clay:<the workspace, table or search id Clay returned>`. Not
the people found, not any enriched contact data. Then call `check_tools`.

Never claim a failed request succeeded. Finish in one to three sentences, then offer the next
step the person can take now: "Find the Head of Ecommerce at the first 10 companies".

## Boundaries

Never sends email or messages, never launches a Sequencer campaign and never writes to the CRM
from this skill. Never spends credits without a yes for that enrichment. Never invents a company,
a persona or a contact. Enriched people and emails stay in Clay, not in the brain; customer
details stay in the brain, never in this skill.

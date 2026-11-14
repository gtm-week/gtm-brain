---
name: gtm-brain-example
description: |
  One or two sentences: what this skill does and what it produces. Say which connected tool it
  reads, if any, and where the result lands (a document, notes in a context, a draft).
  Triggers: "/gtm-brain-example", "the phrase a person would say", "another phrase".
  Not <the nearest other skill> (gtm-brain-<other>).
metadata:
  author: Your Name, Your Company
allowed-tools: [Bash, Read]
---

# GTM Brain: Example

By Your Name. Read [the method](references/method.md) once and follow it. Conduct the
conversation and author brain records in English. Preserve names, source quotes and the exact
token `APPROVE`.

## 1. Reuse what the brain knows

Reuse the session's resolved person, company and offering. Use `query` (status) only if this
state is missing. Follow [context routing](../gtm-brain-use-brain/references/context-routing.md):
load the context this work belongs to (`load_context`, `mode: add`). Do not create a new context
for one account or one run. Pass the resolved `brain` and, when the session names one, `project`
on tools that support it.

Read the documents the work must follow with `document` (`action: list`, then `action: show`).
Say which you followed. Read relevant notes with `query` before asking anything already known.

## 2. Read the connected tool (delete this section if the skill uses none)

Pick the first path that works and say which one this chat uses:

1. **The tool's MCP connector**, when its tools are listed in this chat. Discover them and make
   the smallest read that answers the question.
2. **The tool's HTTP API**, when the person gave a key in this chat or your setup guide says so.
   Call it with curl or the host's HTTP tool, one request per step, and send each answer once.
   Write no code, scripts or branches for it.
3. **Neither**: say the tool is not connected, show your connect steps (a link to your setup
   guide, or `codex mcp add <tool> --url <your MCP url>` then `codex mcp login <tool>`), and
   stop. After connecting, the person opens a new chat: Codex lists tools at chat start.

So the tool shows in the brain's tools: through MCP it is listed by itself (installed, then
connected after a read). Through the HTTP API, call `mark_tool` after the first request that works
(status `ok`, one line on what it returned; `fail` with the exact error when a key is refused or
expired), keep a note that names the tool in `tools`, then call `check_tools`: the tool is shown
as connected through its API, or read failed. Do not ask the person to add MCP just to be listed.

Never use the tool's website through the browser instead. An empty result is a result: say so.
On an error, report the exact error and stop.

A key the person pastes is used in this chat only. Never write it to a file, a note, a
document, a commit or the dashboard, and never repeat it back in full.

The brain keeps what matters about a result, not the result: a short note through `remember`
with `sources` as `provider:reference` (the exact URL the tool returned, else `provider:ID`;
never an invented link) and the companies or people it is about. Never copy raw payloads,
lists or exports into the brain. Ask before any write in the tool itself (sending, creating,
moving a record).

## 3. Ask, one question at a time

Follow [question handling](../gtm-brain-start/references/questions.md): Codex's question box
when the chat has it, otherwise plain chat text with numbered options, and end the turn. Ask
one focused question at a time and reuse answers already given. No default, timeout or empty
result is an answer.

## 4. Keep the result

Pick one home for the output and say it here:

- A document the work must follow: [documents](../gtm-brain-use-brain/references/documents.md), `document`
  with `action: create` or `update`, `status: draft`. Confirm once with the person first.
- Findings and decisions: the [remember procedure](../gtm-brain-use-brain/references/remember.md),
  in the loaded context, with sources and the person's exact words.
- A draft for one piece of work: the project folder, never the brain root.

Never claim a failed write succeeded. Finish in one to three sentences: link what was written
and name the next useful step.

## Boundaries

Say what this skill never does (sends email, changes the CRM, launches broad research).
Never invent examples, numbers or quotes. Customer details belong in the brain, never in this
reusable skill.

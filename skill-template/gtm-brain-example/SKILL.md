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

Use the tool's MCP connector, never its website. Discover its tools and make the smallest read
that answers the question. An empty result is a result: say so, do not switch to the browser.
On an error, report the exact error and stop; connecting a tool is
[gtm-brain-configure](../gtm-brain-configure/SKILL.md)'s job.

The brain keeps what matters about a result, not the result: a short note through `remember`
with `sources` as `provider:reference` (the exact URL the connector returned, else
`provider:ID`; never an invented link). Never copy raw payloads, lists or exports
into the brain. Ask before any write in the tool itself (sending, creating, moving a record).

## 3. Ask, one question at a time

Follow [question handling](../gtm-brain-start/references/questions.md). Use the everyday
`question` tool. Ask one focused question at a time and reuse answers already given. No
default, timeout or empty result is an answer.

## 4. Keep the result

Pick one home for the output and say it here:

- A document the work must follow: [Your documents](../gtm-brain-document/SKILL.md), `document`
  with `action: create` or `update`, `status: draft`. Confirm once through `question` first.
- Findings and decisions: the [remember procedure](../gtm-brain-use-brain/references/remember.md),
  in the loaded context, with sources and the person's exact words.
- A draft for one piece of work: the project folder, never the brain root.

Never claim a failed write succeeded. Finish in one to three sentences: link what was written
and name the next useful step.

## Boundaries

Say what this skill never does (sends email, changes the CRM, launches broad research).
Never invent examples, numbers or quotes. Customer details belong in the brain, never in this
reusable skill.

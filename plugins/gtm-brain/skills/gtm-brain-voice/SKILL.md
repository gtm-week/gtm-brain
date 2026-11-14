---
name: gtm-brain-voice
description: |
  Draft the company's tone of voice from its own writing: the website and public posts on the
  web, plus sent mail and Slack where those tools are connected. Fills voice.md, the starter every
  brain has, with tone, sentence habits, words used and avoided, and three before and after
  examples quoted from real text with their sources; shows the draft and saves it on the person's
  yes. Re-run any time to revise it. Triggers: "/gtm-brain-voice", "fill in our tone of voice",
  "draft our voice", "how do we sound", "redo our tone of voice". Not saving a voice guide the
  person already wrote, or checking a draft against it (gtm-brain-use-brain, references/documents.md).
metadata:
  author: GTM Brain
allowed-tools: [Bash, Read, WebSearch, WebFetch]
---

# GTM Brain: Voice

Read [the method](references/method.md) once and follow it. Conduct the conversation and
author the document in English; quotes stay in the language they were written in. Preserve names,
source quotes and the exact token `APPROVE`.

## 1. Reuse what the brain knows

Reuse the session's resolved person, company and website. Use `query` (status) only if this state
is missing. Pass the resolved `brain` and, when the session names one, `project` on tools that
support it.

Read the voice document with `document` (`action: show`, `ref: voice`). Setup writes `voice.md` as
a starter at the brain root; it is the one voice document, never a second one. When it is already
filled, this run revises it: read it in full, keep what still holds, and say in the draft what
changed. When `action: list` shows another tone of voice document the person keeps elsewhere
(`brand/voice.md`), revise that one instead and ask only if two candidates make it ambiguous.

## 2. Read the company's own writing

Smallest relevant reads, connectors first, never Computer Use and never a page behind a login.
Say in one line what you are reading as you start.

- **The website**: the home page, the about page, one product or pricing page, and the two most
  recent posts on its blog or news page.
- **Public posts on the web**: one web search for the company's own posts (its blog, its LinkedIn
  company page, its founders' public posts); read the two or three the search returns that the
  company wrote. A page that needs a sign-in is skipped, not opened in a browser.
- **Sent mail**, only when a mail connector (Gmail, Outlook) is connected in this chat: one search
  for the person's own sent messages to people outside the company in the last 90 days, at most
  ten results; read five written by the person, not templates, forwards or one-line replies.
- **Slack**, only when the Slack connector is connected: one search for the person's own messages
  in public Slack conversations in the last 90 days, at most ten results.

A tool that is not connected is named once in the draft as not read ("sent mail: not connected");
connecting it is [gtm-brain-configure](../gtm-brain-configure/SKILL.md)'s job, offered in one line
at the end, never a detour now. An empty result is a result; an error is reported with its exact
text and the run goes on with what it has. Count the samples: under six is a guess, and the draft
says so at the top.

From mail and Slack use only the person's own sentences, and drop the names of customers and
colleagues from a quote (`[customer]`). Their source is the connector's message pointer
(`gmail:<id>`, `slack:<conversation id>/<ts>`), never the recipient or the thread's content.

## 3. Draft voice.md

Follow the method (tone, sentence habits, words, examples) under the starter's headings, in this order:

- `## How we sound, in three words`: the tone, three words with one sentence each.
- `## Do`: the sentence habits: usual sentence and piece length per format as numbers, openers,
  the constructions the company comes back to.
- `## Do not`: the tells that would give away someone else wrote it.
- `## Words we use, words we avoid`: two lists of the words themselves.
- `## Examples we like`: exactly three short before and after pairs drawn from real text, each with
  its source on its own line (`Source: https://...` or `Source: gmail:<id>`).
- `## Read from`: what was read, with counts and dates, and what was not.

Leave a heading empty rather than guess. Never invent a quote, a word list from nowhere or a
source; every quoted line is copied word for word from a text this run read.

## 4. Show it and save it

Show the draft in the chat in full, then ask one question, following
[question handling](../gtm-brain-start/references/questions.md): "Save it as a draft"
(recommended), "Change something". Nothing is written before that answer; a change request gets a
revised draft and the same question. No default, timeout or empty answer is a yes. An explicit
instruction already in the request to save this draft ("save it as a draft when it is ready") is
the yes: show the draft and save it, without asking for the same authorization twice.

On the yes, save through the base-file write path, [documents](../gtm-brain-use-brain/references/documents.md):
`document` with `action: update`, `ref: voice` (or the other document's ref), `body` as Markdown
starting with a heading and no frontmatter, `status: draft`, and the person's `by`. Only when no
voice document exists at all, `action: create` with `title: Tone of voice`,
`applies_to: [copy, outreach, emails, posts, landing pages]`. Approved only on the person's own
word ("approve the voice"), as a separate update. Read it back with `action: show` before saying
it is saved; never claim a failed write succeeded.

The voice is a document, not notes: no `remember` call follows (saving rule G3).

Finish in one or two sentences: the path, that Codex reads it before copy, outreach, emails,
posts and landing pages, and that `/gtm-brain-voice` revises it any time.

## Boundaries

Never send, reply to or draft a message in the person's tools. Never Computer Use, never a
logged-in website, never a raw mail or Slack export in the brain. Customer details stay out of
this reusable skill and out of quotes.

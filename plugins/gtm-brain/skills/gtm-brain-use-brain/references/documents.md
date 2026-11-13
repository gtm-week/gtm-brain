# Documents: the files the work must follow

The procedure for documents (strategy, ICP, tone of voice, design system, pricing and any other
Markdown the work must follow). There is no separate skill for them since 0.33.10: the requests
below ("add our tone of voice", "fill in our design system", "approve the strategy") are handled
here, inside ordinary brain work.

A document is one Markdown file the work must follow, at the brain root (`strategy.md`) or in a
folder the person names (`brand/voice.md`), with the `kind: document` marker in its frontmatter.
Its first file moves it into a folder of its own name, beside the file (`strategy/strategy.md`,
`brand/design-system/design-system.md`); a document alone in its folder owns the files there. Codex
reads a document in full before work of a kind it applies to and says which one it followed
(rule 11). Everything goes through the `document` tool; never write these files by hand from a
chat (the person may, in an editor: `save` keeps that).

Use the person's saved conversation language. Keep the document itself in the language they wrote it.
Follow [question handling](../../gtm-brain-start/references/questions.md) for native questions.

## Add a document

Fast path first: when the request already says the title, the place and the content ("add a
new md file to the design system with inspirations, first is Callstack"), there is nothing to
draft and nothing to ask. Call `document` at once (`action: create`, title from their words,
`folder` beside the document they named when it lives in one, `applies_to` the same kinds of
work as that document, `body` with what they gave, status draft) and answer in one line with
the path. Do not read any reference first and do not ask a question: the person decided.
The steps below are for a document written from material, where a draft needs confirming.

A request to define or rework an ICP with nothing written yet belongs to
[Define ICP](../../gtm-brain-define-icp/SKILL.md), which interviews first and then keeps the draft.
An ICP the person already wrote is added here like any other document.

1. A file the person already wrote: a path in the chat, or "add strategy.md as a document".
   Pass it as `file`; nothing is retyped. A Markdown already at the brain root is adopted where
   it lies (its path does not change); one from outside is copied in. Otherwise the best
   document is written from what the company already says (the website, the last deck, the
   loaded contexts), not from scratch; with nothing to read from, ask one question for the
   three things it must say.
2. Decide the place: the root for a company-wide document (pricing, a positioning one-pager); a
   folder when the person keeps a family together. Strategy, ICP, voice and design system already
   exist as starters at the root: fill those (Fill a starter below), never add a second one. Use the
   folder they name; never propose `brain`, `work` or a project folder.
3. Decide what it applies to: the kinds of work that must follow it (copy, outreach, posts,
   landing pages, design, proposals, planning). Three to six entries.
4. A tone of voice follows [authoring](document-authoring.md), including the blind test when
   real samples exist.
5. Confirm with one question showing the title, the place and the first rules (under 500
   characters, never the whole text): "Add it as approved" first (after a passed blind test),
   "Add it as a draft", "Change something". Nothing is written before that answer.
6. Call `document` with `action: create`, `title`, `applies_to`, `body` (or `file`), `folder`
   when chosen, `status`, and the person's `by`.
7. One line back: the title, its path, what it now governs, and that Codex reads it before that
   kind of work. Nothing else is written: a document's content is never recorded as notes
   (rule 11), so no `remember` call follows. The strategic intake (`gtm-brain-strategy`) is the
   one workflow that also notes decisions, and it does that itself.

## Fill a starter

Setup writes four starters at the brain root: `strategy.md`, `icp.md`, `voice.md` and
`design-system.md`. Until someone fills one, the chat line shows it as `[not filled]`: it holds
headings and no guidance. The person fills one when they choose, at the end of onboarding or later
("fill in our tone of voice"). Each is filled where it lies; never a second document for the same
thing.

- Strategy: run `gtm-brain-strategy` (the strategic intake). It writes `strategy.md` itself.
- ICP: run `gtm-brain-define-icp`. Its draft replaces the starter's body in `icp.md`
  (`action: update`, `ref: icp`), never a new ICP document.
- Voice or design system: draft from what the company already says, not from an interview. Read
  the website (the home page and one or two content pages) and anything the person drops in the
  chat (texts they like, an old brand guide, a Figma or PDF export). Keep the starter's headings
  and fill each one; leave a heading empty rather than guess. The voice follows
  [authoring](document-authoring.md). The design system names real values only (hex colours,
  font names, the logo file in `design-system/`), never invented ones.
- Confirm with one question showing the first lines under each heading (under 500 characters):
  "Save it as a draft" first, "Change something". Then `document` with `action: update`, the
  starter's `ref`, the new `body`, and the person's `by`. Approving is a separate word from the
  person ("approve the voice").

## Files of a document

"Add this to the design system", a deck dropped with "this is our pricing": land it with
`add-file.mjs --document <ref>` ([files](files.md)); it goes
in the document's files folder and `save` keeps it. Say the path in one line.

## Everything else

- "list the documents": `action: list`; one line per document with status, kinds of work, path
  and file count; when none exists, the ones the course expects first.
- "show the strategy": `action: show`. "what files does the design system have": `action: files`.
- "update the voice: ...": quote the line that changes, confirm, then `action: update` with
  `ref` and only that field. "approve the design system": `action: update`, `status: approved`;
  only the person's word approves.
- "check this against our documents": read the documents whose `applies_to` covers the draft,
  list each breach with the line it breaks, then the fixed draft. No write.
- "remove the document ...": confirm with one question, then `action: remove`. Its files
  folder stays; say so.

A document is offered once, by name, when copy, a design, outreach or a plan is produced and no
document covers it (rule 7b).

---
name: gtm-os-document
description: |
  Your documents: the strategy, tone of voice, design system, target customer definition,
  pricing and any other document the work must follow, kept as Markdown at the brain root with
  their files beside them. Triggers: "/gtm-os-document", "add our tone of voice", "save the
  design system", "add strategy.md as a document", "our ICP definition", "check this against
  our documents", "list the documents", "approve the strategy".
allowed-tools: [Bash, Read]
---

# GTM OS: Your documents

A document is one Markdown file the work must follow, at the brain root (`strategy.md`) or in a
folder the person names (`brand/voice.md`), with the `kind: document` marker in its frontmatter.
Its files, if any, live in a folder of its name beside it (`brand/design-system/`), or around it
when it is alone in its folder (`pricing/pricing.md` with `pricing/pricing-2026.xlsx`). Codex
reads a document in full before work of a kind it applies to and says which one it followed
(rule 11). Everything goes through the `document` tool; never write these files by hand from a
chat (the person may, in an editor: `save` keeps that).

Use the person's saved conversation language. Keep the document itself in the language they wrote it.
Follow [question handling](../gtm-os-start/references/questions.md) for native questions.

## Add a document

Fast path first: when the request already says the title, the place and the content ("add a
new md file to the design system with inspirations, first is Callstack"), there is nothing to
draft and nothing to ask. Call `document` at once (`action: create`, title from their words,
`folder` beside the document they named when it lives in one, `applies_to` the same kinds of
work as that document, `body` with what they gave, status draft) and answer in one line with
the path. Do not read any reference first and do not open a `question`: the person decided.
The steps below are for a document written from material, where a draft needs confirming.

1. A file the person already wrote: a path in the chat, or "add strategy.md as a document".
   Pass it as `file`; nothing is retyped. A Markdown already at the brain root is adopted where
   it lies (its path does not change); one from outside is copied in. Otherwise the best
   document is written from what the company already says (the website, the last deck, the
   loaded contexts), not from scratch; with nothing to read from, ask one `question` for the
   three things it must say.
2. Decide the place: the root for a company-wide document (strategy, ICP, pricing); a folder
   when the person keeps a family together (`brand` for voice and design system). Use the
   folder they name; never propose `brain`, `work` or a project folder.
3. Decide what it applies to: the kinds of work that must follow it (copy, outreach, posts,
   landing pages, design, proposals, planning). Three to six entries.
4. A tone of voice follows [authoring](references/authoring.md), including the blind test when
   real samples exist.
5. Confirm with one `question` showing the title, the place and the first rules (under 500
   characters, never the whole text): "Add it as approved" first (after a passed blind test),
   "Add it as a draft", "Change something". Nothing is written before that answer.
6. Call `document` with `action: create`, `title`, `applies_to`, `body` (or `file`), `folder`
   when chosen, `status`, and the person's `by`.
7. One line back: the title, its path, what it now governs, and that Codex reads it before that
   kind of work. Nothing else is written: a document's content is never recorded as notes
   (rule 11), so no `remember` call follows. The strategic intake (`gtm-os-strategy`) is the
   one workflow that also notes decisions, and it does that itself.

## Files of a document

"Add this to the design system", a deck dropped with "this is our pricing": land it with
`add-file.mjs --document <ref>` ([files](../gtm-os-use-brain/references/files.md)); it goes
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
- "remove the document ...": confirm with one `question`, then `action: remove`. Its files
  folder stays; say so.

A document is offered once, by name, when copy, a design, outreach or a plan is produced and no
document covers it (rule 7b).

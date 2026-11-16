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
Follow [question handling](../../gtmb-start/references/questions.md) for native questions.

## Add a document

Fast path first: when the request already says the title, the place and the content ("add a
new md file to the design system with inspirations, first is Callstack"), there is nothing to
draft and nothing to ask. Call `document` at once (`action: create`, title from their words,
`folder` beside the document they named when it lives in one, `applies_to` the same kinds of
work as that document, `body` with what they gave, status draft) and answer in one line with
the path. Do not read any reference first and do not ask a question: the person decided.
The steps below are for a document written from material, where a draft needs confirming.

A request to define or rework an ICP with nothing written yet belongs to
[Define ICP](../../gtmb-define-icp/SKILL.md), which interviews first and then keeps the draft.
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
   (rule 11), so no `remember` call follows. The strategic intake (`gtmb-strategy`) is the
   one workflow that also notes decisions, and it does that itself.

## Add a base file

A base file is a document the team adds for itself beyond the five starters: "add pricing as a
base file", "we need a positioning document", "make a competitors file". One sentence starts it;
the flow is two turns, one tool call each after the chat's first status read.

1. Call `document` with `action: prepare` and `title` (the subject in the person's words:
   Pricing, Positioning, Competitors). It writes nothing and returns, in one read: the base file
   that already covers the subject, if any (by title, `applies_to`, a heading of that name, or
   three mentions in a filled one); the starter for pricing, positioning, competitors or
   objections (`templates/base-files/`: headings, one line of guidance each); the notes and
   entities the brain holds on it; and the one question with its choices.
2. Already covered: the first choice is a section in that file, never a second file on the same
   subject. Draft just the section and save it on the yes with `action: update`, its `ref` and
   `append` (the rest of the file stays as it is).
3. Notes found: draft from them under the starter's headings (without a starter, three to five
   headings the notes support). Leave a heading empty rather than guess. End the draft with
   "Drawn from:" and the notes used (id, context, date). No notes: say the brain knows nothing
   about it yet, write no draft, and ask in one question for the two or three facts `prepare`
   names. Never invent a price, a competitor or a quote.
4. Show the draft in full, then copy the question lines `prepare` gives word for word: the why
   line, the question (what work should follow this document) and its two or three choices with
   "(recommended)" on the first. End the turn. A pick (a number or a kind of work) is the yes,
   because the why line says picking saves it: one call, `action: create`, `title`, `applies_to`
   from the pick, `body` the draft, status draft, the person's `by`. A change asked for is no yes:
   make it, show the draft again with the same question. Nothing is written before the pick. When
   the subject's own file already exists, `prepare` gives a yes/no on saving into it instead.
5. One line back, with the saved path: "Saved pricing.md as a draft. The brain reads it before
   proposals, outreach and landing pages." No `remember` follows (rule 11).

A Markdown dropped at the root by hand that is not a document yet: the document list and the
health line say "pricing.md is here but the brain does not use it yet" (the health line once per
new file). Offer once to adopt it: `action: prepare` with `file`, then show the frontmatter it
would gain and copy its question lines. On the pick, `action: create` with `file`: only the
frontmatter is added, the person's text stays byte for byte. Never rewrite or tidy it.

`preview: true` on create or update returns what would be written and writes nothing.

## Fill a starter

Setup writes five starters at the brain root: `strategy.md`, `icp.md`, `voice.md`,
`design-system.md` (with its page `design-system.html` beside it) and `market.md`. Until someone fills one, the chat line shows it as `[not filled]`: it holds
headings and no guidance. The person fills one when they choose, at the end of onboarding or later
("fill in our tone of voice"). Each is filled where it lies; never a second document for the same
thing.

- Strategy: run `gtmb-strategy` (the strategic intake). It writes `strategy.md` itself.
- ICP: run `gtmb-define-icp`. Its draft replaces the starter's body in `icp.md`
  (`action: update`, `ref: icp`), never a new ICP document.
- Voice: run [gtmb-voice](../../gtmb-voice/SKILL.md). It asks whose voice it is first, reads
  writing that fits that choice, and fills `voice.md` itself. A voice guide the person
  already wrote, or rules they dictate in the chat with nothing to read, is filled here as below.
- A voice from rules the person gives: draft from what the company already says, not from an interview. Read
  the website (the home page and one or two content pages) and anything the person drops in the
  chat (texts they like, an old brand guide). Keep the starter's headings and fill each one; leave a
  heading empty rather than guess. The voice follows [authoring](document-authoring.md).
- Design system: it is a page and a text, filled together as [The design system page](#the-design-system-page)
  says. Never the Markdown alone.
- Market: draft from the market and competitor notes already in the brain (`query`) and the
  competitors' websites the person names. Name only competitors and prices a source shows; leave
  a heading empty rather than guess. Battle cards and reports go in `market/` beside it.
- Confirm with one question showing the first lines under each heading (under 500 characters):
  "Save it as a draft" first, "Change something". Then `document` with `action: update`, the
  starter's `ref`, the new `body`, and the person's `by`. Approving is a separate word from the
  person ("approve the voice").
- Only through `document`, never a shell edit of the file; status `draft` (or `approved` on the
  person's word); the starter's content is never also saved as a note (saving rule G3).

## The design system page

The design system is `design-system.html` beside `design-system.md` (the `document` tool's `show` gives
the Markdown's path; the page lies in the same folder). The page is the source for how things
look and what people open; the Markdown is the short text version Codex reads before design
work and lists the same tokens and rules in words. They are written together and kept in step:
a change to one is made in the other in the same turn. "Fill in our design system", "make our
design system page" and the dashboard's "Make the page with Codex" all run this.

1. Sources. Read the website (the home page and one or two content pages: the colours, fonts,
   sizes and spacing actually used), the files in the `design-system/` folder (`action: files`)
   and anything the person drops in the chat (a brand guide, a Figma or PDF export, a logo).
   Real values only: every colour, font and size is one a source shows, or is marked on the page
   as proposed or as a placeholder. A logo that is not in the brain is drawn as a plain inline
   SVG placeholder and the page says so.
2. Write the page as one draft file, `work/design-system/design-system.html` (`work/` is this
   computer's scratch, outside git). Start from the page that is there (the starter or the
   team's own) and keep its structure: the brand in one line; colour (each one as a swatch
   with its role, hex and its contrast against the text and background colours as a number,
   with pass or fail for body text at 4.5); typography (the scale set in the named fonts with
   fallbacks, sizes, weights and line heights printed beside each sample); spacing and grid
   drawn to scale; components built only from the tokens (buttons with their states side by
   side, card, table, form field, tag, slide and social image frames at their proportions);
   logo and imagery rules; do and do not as paired examples; and a Tokens block at the end.
3. The rules the page must meet, or it is refused when saved:
   - One self-contained file that starts with `<!DOCTYPE html>`. All CSS in one `<style>` block.
   - No `<script>`, no `<link>`, no `@import`, no `iframe`, and nothing loaded by address: no
     web font, no CDN, no remote image. Images are inline SVG or `data:` addresses. Fonts are
     named, the brand font first, then a system fallback stack; the page says the brand font
     shows where it is installed.
   - Every value is a CSS custom property defined once in `:root`, the page is styled only with
     those properties, and the Tokens block prints the same list.
   - Plain anchor links for the section navigation. A light page that prints well. Plain
     hyphens, no en or em dashes. Remove the starter's `gtm-brain-starter` meta tag and its
     "Not filled in yet" line.
4. Write the Markdown body from the same tokens: under the starter's headings, each colour with
   its role and hex, the fonts with weights and sizes, the spacing steps and the grid, the
   component rules, the logo and imagery rules, do and do not. One line near the top says the
   page is `design-system.html` beside it and the two are kept in step. No value appears in one
   and not the other.
5. Show it before saving. Open the draft page for the person (in Codex: the file in the Codex
   pane; say its path) and give the first lines of the Markdown. One question: "Save both"
   first, "Change something". Nothing is saved without the yes; on a change, edit the draft and
   show it again.
6. On yes, save the page through the one writer, never a shell copy or a hand edit of the file:

   ```
   node "$PLUGIN_ROOT/skills/gtm-brain-add-file/add-file.mjs" <brain> --file work/design-system/design-system.html --document design-system --page
   ```

   It replaces the page beside the Markdown and commits it, and refuses a page that breaks the
   rules above, with the reasons: fix the draft and run it again. Then `document` with
   `action: update`, `ref: design-system`, the new `body` and the person's `by`; status stays
   `draft` until the person says to approve it. Say in one line that the page is on the
   dashboard under Design system, on the Visual tab.
7. On layout 3 the page and the Markdown are the owner's. When someone else runs this, the
   writer answers with a `proposal` and a NOT APPLIED line: the page waits for the owner like
   any base file. Pass that line on and do not retry.

Later changes ("make the accent darker", "add the new logo rule") follow the same steps from
the current page: change the token or rule in the draft, show it, save the page on the yes and
update the same line in the Markdown.

## Files of a document

"Add this to the design system", a deck dropped with "this is our pricing": land it with
`add-file.mjs --document <ref>` ([files](files.md)); it goes
in the document's files folder and `save` keeps it. Say the path in one line.

## Everything else

- "list the documents": `action: list`; one line per base file with its state (not filled,
  draft, approved), the kinds of work, path and the day it last changed, then any Markdown at the
  root the brain does not use yet; `--json` carries `state` and `changed` for the dashboard.
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

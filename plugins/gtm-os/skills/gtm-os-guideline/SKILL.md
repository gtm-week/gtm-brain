---
name: gtm-os-guideline
description: |
  The brand guidelines: tone of voice, design system, target customer definition and any other
  standing document the work must follow, kept in this brain. Add one from existing material
  or a conversation, list, show, update, remove, or check a draft against them. Triggers:
  "/gtm-os-guideline", "add our tone of voice", "save the design system", "brand guidelines",
  "our ICP definition", "check this against our guidelines", "update the voice", "list the
  guidelines".
allowed-tools: [Bash, Read]
---

# GTM OS: Guidelines

A guideline is one Markdown file in this brain's `brain/guidelines/`, read in full before the
kind of work it applies to (AGENTS.md rule 11): a tone of voice before copy and outreach, a
design system before a landing page or a creative, a target customer definition before
targeting or a proposal. It is authored, not compiled: no background run rewrites it. It is
committed with the brain and reaches everyone who shares it. Everything goes through the
`guideline` tool; never write these files by hand from a chat (the person may, in an editor).

Use the person's saved conversation language; the body is in their language too.
Follow [question handling](../gtm-os-start/references/questions.md) for native questions.

## Add a guideline

1. Gather. A Markdown or text file the person already prepared (a `design.md`, a `voice.md`)
   is the guideline: pass its path as `file` and nothing is retyped. Otherwise the best
   guideline is written from what the company already says, not from scratch:
   the website copy, the last deck, existing posts, a voice document someone wrote, the
   memories in Our offer and Target customers (`query`). A file the person names goes through
   `gtm-os-add-file` first; read its extracted text. With nothing to read from, ask one
   `question` for the three things the body needs (what we sound like or look like, the hard
   rules, what is banned), with a concrete proposal first.
2. Draft by [authoring](references/authoring.md): a title, `applies_to` (the kinds of work it
   governs, lowercase: copy, outreach, posts, landing pages, creatives, proposals, design,
   targeting), and the body.
3. Blind test, for a tone of voice when real samples are at hand (borrowed from gbrain's
   draft-in-voice: a voice is validated when nobody can tell the drafts from the real thing).
   Write three short pieces in the drafted voice, mix them with three real ones of the same
   format, show the six numbered in the chat, and ask one `question` with `multiple: true` and
   the options 1 to 6: "Which of these did Codex write?". Two or three wrong guesses out of
   three: the voice holds, offer approved. Otherwise say what gave the drafts away, fix those
   sections, and add it as a draft; the next test can approve it. Skip the test when there are
   no real samples, and say so.
4. Confirm. Show the draft in the chat first: the title, what it applies to and the first hard
   rules. Then one short `question` (under 500 characters, never the draft itself), for example
   "Add Tone of voice as a guideline?", with "Add it as approved" first (after a passed blind
   test, or for a design system or an ICP definition the person vouches for), "Add it as a
   draft" second, "Change something" third. Nothing is written before that answer. Only the
   first choice sets `status: approved`.
5. Call `guideline` with `action: create`, `title`, `applies_to`, `body` (or `file`), `status`
   and the person's `by`.
6. One line back: the title, what it now governs, and that Codex reads it before that kind of
   work from now on, in the brain and in every linked project.

A tone of voice guideline follows [authoring](references/authoring.md): six sections (tells,
length, registers, signature moves, banned words, worldview), each with a real quoted example.

## List, show, update, remove, check

- "list the guidelines": `action: list`; one line per guideline, then, when none exists, the
  three the course expects (tone of voice, design system, target customer definition).
- "show the voice": `action: show` with `slug`; give it as it is, no summary.
- "update ...": read it with `show`, quote the line that changes in the chat, confirm with one
  short `question`, then `action: update` with `slug` and only the fields that change. Approving is
  `status: approved`, on the person's word only.
- "remove ...": confirm with one `question` ("Remove Tone of voice? Codex stops following it;
  nothing else changes."), then `action: remove`.
- "check this against our guidelines": read the guidelines whose `applies_to` covers the
  draft, list each breach with the guideline line it breaks, then the fixed draft. No write.

A guideline is offered once, by name, when copy, a design or outreach is produced and no
guideline covers it (rule 7b).

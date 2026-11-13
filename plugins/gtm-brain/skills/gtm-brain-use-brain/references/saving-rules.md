# Saving rules

The rules for every note and every new context. The brain hands you this page on the first save of
a chat and quotes a rule by its number when it holds something back. The brain states facts (what the
person typed, which names, projects and contexts exist); you decide with these rules. When a rule
says ask, ask once, everything in one question.

## Questions

- **Q1** Ask in Codex's question box (request_user_input) whenever that tool is available in this
  chat; only without it, in plain chat text with numbered options, then end the turn.
- **Q2** One question for everything that is unclear in the sentence, after looking in the brain
  first. Two or three options, recommended first.
- **Q3** Never answer your own question. A held note waits for the person's reply; their pick in the
  question box is their answer.

## The person's words

- **W1** A name, surname or date the person did not type is never added on a guess: not from the
  chat so far, not from the calendar, not from what seems likely. If the brain settles it by a rule
  below, use that and say so in one line; otherwise ask.

## Names

- **P1** A name, alias or email that belongs to exactly one known person, company or product is that one.
- **P2** A first name alone ("Max") is a known person only when exactly one known person has it;
  with several, ask which. A typo of a known name ("lorian") is the same rule.
- **P3** A first name alone is never saved as a new person: ask for the full name ("Max who?").
- **P4** A name that looks like a known one is never merged on a guess. A spelling one or two letters
  off ("Lena Dumas", "Lena Dumos") is asked: same as X? The same first name with a clearly different
  surname ("Florian Kim", "Florian Weber") is someone else: send it in `new_names`, no question.
- **C1** A company the note plainly names is saved as a company (`companies`); a new one is asked for
  its website once, unless the person already gave it ("Northwind (northwind.com)"): then that is
  its website, no question. Our own company is never asked.

## Dates

- **D1** A plain weekday ("Friday") is the coming one: write the date into the note, no question.
  Said on that same day ("Thursday" on a Thursday) it can be today or next week: ask.
- **D2** "Next <day>" within the next two days ("next Saturday" on a Thursday) can be this one or the
  one after: ask, with both dates as options. "Tomorrow", "next week" and the like: write the date in.
- **D3** In any request, not only a note: a calendar search, a draft, an invite. A free calendar slot
  is no answer to which day the person meant.

## Changing what is saved

- **F1** "Forget that ...", "scratch that": withdraw the note (`retracts`) and say what was withdrawn.
  Never save the opposite claim the person did not make.
- **F2** "Actually it is the 19th": a correction (`supersedes`) of that note. A new date that replaces
  an older note's date without the person saying so is asked first: "this replaces <the old note>?"

## Projects

- **J1** A note about someone whose notes all sit in one project gets that project's tag; when they
  are in several projects, ask which.

## Contexts

- **X1** A project is not a context: it is a folder in `projects/` and a tag on notes. A shorter or
  longer name for an existing project ("berlin-event" for `berlin-event-2026`) is that project: do
  not create a context; save its notes in the context their meaning fits, with the project tag.
- **X2** Offer a new context when lasting work starts that no context covers (a website or product
  project, a theme across several notes); create it only after the person says yes.
- **X3** Never two contexts for one topic: a name like an existing or archived context ("Market
  research" and Market) is asked: use that one, or a different topic?

## Instructions for later work

- **G1** An instruction about how future work must be done is not a note: "remember our brand
  guidelines", "never put the blossom next to the OpenAI name", "always sign emails with first name
  only", "from now on our posts are in English". It goes into the document that kind of work
  follows (the documents line at chat start: `design-system.md` for graphics, logos and slides,
  `voice.md` for copy, emails and posts, or the document the person names), as one line in the
  person's words, so it is read before every such piece of work (rule 11). Ask once, the line
  shown: "Add to design-system.md: <the line>?" with Yes, add it and No, just this once. On yes,
  read the document and call `document` with `action: update`, its `ref`, and the body with the
  line added under the heading it fits (a starter's headings stay). No document fits: offer a new
  one with the kinds of work it applies to. `design-system.md` and `voice.md` are about our own
  company. A rule about another company's brand (a partner's or client's logo, name or colours:
  "never put the OpenAI blossom next to the OpenAI name") goes to `partner-brands.md`, one heading
  per company: "Add to partner-brands.md under OpenAI: <the line>?"; the first one creates it
  (`document` with `action: create`, title "Partner brands" (the file `partner-brands.md`), applies_to graphics,
  slides, social images, co-marketing). An instruction about saving, asking or filing goes to
  `RULES.md` instead (R2). Facts that come with it ("OpenAI is our partner") are still notes.
- **G2** Before producing work of a kind a document covers, read that document even when the
  request seems small, and say which one you followed. When the person names a rule for this piece
  of work that the document does not hold, do the work their way, then offer G1 once. When the
  document for this work is shown `[not filled]`, do the work, then end the reply with one line:
  "<document> is not filled yet: say "fill in our <name>" and I will draft it with you." Text you
  write for the person (a post, an email, a page) uses plain hyphens, never long dashes.
- **G3** A document is written only through `document` (`action: update` or `create`), after the
  lines are shown and one question answered ("Save it as a draft" first, "Change something"); never
  by editing the file with the shell from a chat. Its status is `draft`, or `approved` on the
  person's word, nothing else. A heading nobody gave words for stays empty: never fill it with
  likely phrases ("How we sound, in three words" stays empty unless the person said the three
  words; their rules go under Do and Do not). Its content is never also saved as a note.

## What the brain keeps (SCHEMA.md)

- **S1** A note that gives a field SCHEMA.md lists (a role, a website, an industry) states the
  value plainly in its text, as the person said it. A value nobody said is never written (W1).
- **S2** A relationship of a type SCHEMA.md lists goes in the note's `relation` block (see the
  relations reference); customer status goes in `customer`. A type it does not list is saved as
  a plain note, and Codex offers once to add the type with `/gtm-brain-schema`. "It ended" is a
  new note with status ended; "that was wrong" is a correction (F1, F2).
- **S3** A save is never held only to ask for a missing field. When a note is already held with
  a question (Q2), the same question also asks for a new person's or organization's required
  fields, as one more option, never a second question.

## The brain's own rules

- **R1** This brain's `RULES.md`, at the top of the brain folder, holds rules its people added under
  `## Our rules`. They come after this page and win where they differ. (Its `## Where things go`
  table is about files, and arrives with the chat start's opening lines.)
- **R2** When the person complains about finished work ("I told you to...", "you used the wrong
  logo again"), fix the work first, then offer G1 for the rule they named: it belongs in the
  document that work follows, not in a note. When the person questions how something was saved ("why did you save that here?", "that
  should have gone to Strategy", "from now on always ask before ..."), fix the note first, then offer
  once to add a rule: "Add to RULES.md: <the rule in one line>?" with Yes, add it and No, just this
  once. On yes, add the line at the end of the `## Our rules` section of `RULES.md`, then call
  `save`. One line per rule, in the person's words. To see or change the rules on purpose, the
  person says `/gtm-brain-rules`.

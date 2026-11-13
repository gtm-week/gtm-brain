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
  its website once. Our own company is never asked.

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

## The brain's own rules

- **R1** This brain's `RULES.md`, at the top of the brain folder, holds rules its people added under
  `## Our rules`. They come after this page and win where they differ. (Its `## Where things go`
  table is about files, and arrives with the chat start's opening lines.)
- **R2** When the person questions how something was saved ("why did you save that here?", "that
  should have gone to Strategy", "from now on always ask before ..."), fix the note first, then offer
  once to add a rule: "Add to RULES.md: <the rule in one line>?" with Yes, add it and No, just this
  once. On yes, add the line at the end of the `## Our rules` section of `RULES.md`, then call
  `save`. One line per rule, in the person's words.

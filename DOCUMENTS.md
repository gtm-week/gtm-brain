# Your documents in GTM OS

GTM OS 0.27.0. Where the strategy, the tone of voice, the design system, the pricing and any
other document the work must follow live, how Codex is made to follow them, and how they get
made. Before 0.27.0 these were "guidelines" in `brain/guidelines/`; the upgrade moves them.

## The idea in one paragraph

A document is one Markdown file you wrote and the work must follow. It is not a note (a
memory) and not a context summary: nothing compiles it, nothing rewrites it, it says what it
says until a person changes it. It lives where you would put it yourself: `strategy.md` at the
top of the brain folder, or `brand/voice.md` in a folder you named. Its files, if any, live in
a folder of the same name beside it: `strategy/deck.pdf`, `brand/design-system/tokens.json`.
A `kind: document` line in its frontmatter is what tells Codex it is one. Every chat opens with
one line naming the documents, what each applies to and how many files it owns; rule 11 of the
brain's rules says: before producing anything of a listed kind, read that file in full, follow
it, and say which one you followed.

## One file or a folder?

Nobody decides. `strategy.md` alone is a complete document. The first file you attach moves
it into a folder of its own name, beside the file: `strategy/strategy.md` and
`strategy/deck.pdf`, one thing in Finder. The same in a folder you named: `brand/design-system.md`
becomes `brand/design-system/design-system.md` on its first file, and `brand/voice.md` stays
where it is. A document alone in its folder owns the files in it, so nothing else changes: the
chat line, `save` and the file count follow. If you make `strategy/` beside `strategy.md` by
hand, that is read too; GTM OS itself only ever produces the one-folder shape.

The one decision you make is one document or several: the work follows them separately (copy
reads the voice, a landing page reads the design system), so they are separate files.

## The one you start with

Every brain has `strategy.md` from setup: a draft document that says it is waiting for the
strategic intake. Say `run the strategic intake` (`/gtm-os-strategy`): a 10-15 minute
conversation with the founder or the head of sales, growth or GTM fills it in, mapped to
Playing to Win without ever naming the framework. Decks and notes shared along the way land in
`strategy/` beside it, and the decisions it surfaces are also notes in the Strategy context.
Read it, then `approve the strategy`.

## Making one

Say `add our tone of voice`, `save the design system`, `add strategy.md as a document`, or type
`/gtm-os-document`. A file you already wrote goes in as it is; one already at the top of the
brain folder is adopted where it lies. Otherwise Codex writes the document from what the
company already says (the website, the last deck, existing posts, what is already in Our offer
and Target customers). It shows the title, the place and the first rules, and asks: "Add it as
approved", "Add it as a draft", or "Change something". Nothing is written before you answer.
An approved document is a rule; a draft one is followed as the best available guidance and
Codex says so.

Files: `add this to the design system` with a path or a dropped file lands it in
`brand/design-system/`. A logo or a deck about one company goes with that company:
`brain/entities/<company>/`, linked from its brief. Nothing to invoke; dropping the file is
enough.

## What a good one contains

- **Tone of voice.** Written from your own copy, in six sections with a real example under
  each: tells, length, registers, signature moves, banned words, worldview. Before Codex offers
  to approve it, it runs a blind test when it has real samples: three of your pieces mixed with
  three it wrote, and you point at the fakes. Company voice and founder voice are two documents
  when they differ.
- **Design system.** The palette with values, the type scale, spacing, the component rules,
  what an image may and may not be, and the anti-slop list. Tokens, the UI kit and logos sit in
  its files folder; the document names the ones that matter.
- **Target customer definition.** Who we sell to, the trigger that makes them buy, what
  disqualifies, three named examples. The evidence stays in the Target customers context; the
  document is the approved statement.
- **Strategy.** The statement of where we are going and what we will not do. Its decisions are
  also notes in the Strategy context, so later evidence can challenge them; Codex records them
  when the document is created.

Under 64 KB each: it is read in full before the work. More than that is two documents. Files
are opened only when the work needs them.

## Managing

- `list the documents`: one line per document with status, what it applies to, path, files.
- `show the strategy`: the file as it is. `what files does the design system have`: its files.
- `update the voice: ...`: Codex quotes the line that changes, confirms, rewrites only that.
  `approve the design system` sets the status; only your word does.
- `remove the document ...`: Codex confirms, the file goes; its files folder stays.
- `check this against our documents`: what a draft breaks, with the line it breaks, then the
  fixed draft.
- Editing a document in your editor is fine; say `save` afterwards and it is kept and shared.
  Wrote a new Markdown by hand? `add <file> as a document` marks it; until then Codex leaves it
  alone and does not read it before the work.

## Where it shows

- The first lines of every chat: `documents: Strategy [approved] (strategy, planning) -> strategy.md  ·  Design system [draft] (design) -> brand/design-system.md (3 files) ...`
- `where are we` and the status read carry the same line.
- Git: one commit per change, in your name, pushed when the brain has a remote, so teammates
  get the document and its files on their next pull. Plugin updates never touch them.

## Coming from guidelines

Brains made before 0.27.0 kept these in `brain/guidelines/<slug>.md`. The upgrade (`update GTM
OS`, then `refresh the rules` if offered) moves each one to `<slug>.md` at the top of the brain
folder with the marker added and everything else kept. A file it cannot move because you already
have one of that name at the top stays where it was and the upgrade says so. Files you attached
to companies before stay in `files/` and their links keep working.

## Good to know

- Documents are the standing statements; contexts hold the evidence and the running summary.
  Codex never records a document's content as notes, and never rewrites one because a draft did
  not fit it.
- The `README.md` at the top of the brain folder says what goes where: documents and their
  files, project folders, `brain/`. Nothing else belongs at that level.

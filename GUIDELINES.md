# Brand guidelines in GTM OS

GTM OS 0.23.0. For Artur and for course participants: where the tone of voice, the design system
and the target customer definition live, how Codex is made to follow them, and how they get made.

## The idea in one paragraph

A guideline is a standing document the work must follow. It is not a note (a memory) and not a
context summary: nothing compiles it, nothing rewrites it, it says what it says until a person
changes it. It lives in the brain as one file, `brain/guidelines/<name>.md`, with a title, the
kinds of work it applies to (copy, outreach, posts, landing pages, creatives, proposals, design,
targeting), a status (draft or approved) and the rules themselves, in your language. Every chat,
in the brain and in every linked project folder, opens with one line that names the guidelines
and what each applies to; rule 11 of the brain's rules says: before producing anything of a
listed kind, read that file in full, follow it, and say which one you followed. That is the
whole mechanism, the same one the plain brain used with its "read voice.md before anything
public" line, made part of GTM OS so it survives updates and reaches teammates.

## Before you start

- Update GTM OS to 0.23.0 or later: say `update GTM OS` in Codex, then quit and reopen Codex.
- Brains made before 0.23.0 need their rules refreshed once: Codex offers it in the first chat
  ("refresh the rules"), or say `refresh the rules`. Without rule 11 the line is printed but
  nothing tells Codex what to do with it.

## Making one

Say `add our tone of voice`, `save the design system`, `add our ICP definition`, or type
`/gtm-os-guideline`. A file you already wrote (`design.md`, `voice.md`: drag it into the chat)
goes in as it is. Otherwise Codex writes the guideline from what the company already says: the
website, the last deck, existing posts, a voice document (drop the file in the chat: it goes in
through `gtm-os-add-file` and its text is read), and what is already in Our offer and Target
customers. With nothing to read from, it asks one question: what we sound like, the hard rules,
what is banned. Then it shows the draft (title, what it applies to, the first hard rules) and
asks: "Add it as approved", "Add it as a draft", or "Change something". Nothing is written
before you answer. An approved guideline is a rule; a draft one is followed as the best
available guidance and Codex says so.

From then on, in any chat of that brain or of a linked project: "write the launch post" opens
with "Following Tone of voice." and the post keeps to it. "Build the landing page" in the
landing project reads the design system first. "Check this against our guidelines" lists what a
draft breaks, with the guideline line it breaks, and gives the fixed draft.

## What a good one contains

- **Tone of voice.** Written from your own copy, in six sections with a real example under
  each: tells (what gives away that a machine wrote it), length, registers, signature moves,
  banned words, worldview. Before Codex offers to approve it, it runs a blind test when it has
  real samples: three of your pieces mixed with three it wrote, and you point at the fakes. If
  you cannot tell, the voice holds. Company voice and founder voice are two guidelines when
  they differ.
- **Design system.** The palette with values, the type scale, spacing, the component rules,
  what an image may and may not be, and the anti-slop list. Asset files go in through
  `gtm-os-add-file`; the guideline names their paths.
- **Target customer definition.** Who we sell to, the trigger that makes them buy, what
  disqualifies, three named examples. The evidence stays in the Target customers context; the
  guideline is the approved statement.

Under 64 KB each: it is read in full before the work. More than that is two guidelines.

## Managing

- `list the guidelines`: one line per guideline, with status and what it applies to.
- `show the voice`: the file as it is.
- `update the voice: ...`: Codex quotes the line that changes, confirms, rewrites only that.
  `approve the design system` sets the status; only your word does.
- `remove the guideline ...`: Codex confirms, the file goes, Codex stops following it.
- Editing the file yourself in an editor is fine; say `save` afterwards and it is kept and shared.

## Where it shows

- The first lines of every chat: `guidelines: Tone of voice [approved] (copy, outreach, posts) -> brain/guidelines/tone-of-voice.md ...`
- `where are we` and the status read carry the same line.
- The dashboard's Help, Ways to work in Codex: the "Keep the brand guidelines" card.
- Git: one commit per change, in your name, pushed when the brain has a remote, so teammates
  get the guideline on their next pull. Plugin updates never touch the brain.

## Good to know

- Guidelines are the standing rules; contexts hold the evidence and the running summary. A
  decision to change the voice is a memory in Our offer and an update to the guideline; the
  guideline is what gets read before the next post.
- The per-chat cost is one line per guideline. The body costs nothing until it is read, which
  happens only before work of a listed kind.
- A guideline applies to work, not to a place it is published: name kinds of work in `applies_to` (copy,
  landing pages), not Slack or LinkedIn.

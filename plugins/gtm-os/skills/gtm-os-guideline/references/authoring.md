# Writing a guideline

The body is what a chat reads in full before the work, every time. Put in what changes the
output; leave out what Codex already knows.

- **Tone of voice.** Write it from the company's own writing, never from adjectives alone: the
  website, the last posts, the emails that got replies, the deck. Twenty samples across formats
  is a good corpus; three is a guess, say so in the draft. Six sections, one real quoted example
  under each (gbrain's voice fingerprint, borrowed):
  1. Tells: the things that give away someone else wrote it (stock openers, exclamation points,
     emoji in body copy, long dashes, rhetorical questions), each named so it can be avoided.
  2. Length: the usual sentence and piece length per format, as numbers; one thought per post.
  3. Registers: the two or three modes we write in (operator, warm, technical) and where each
     is used; never blended in one piece.
  4. Signature moves: the constructions we come back to (problem first, a number in the first
     line, the short closing sentence), quoted from our own copy.
  5. Banned words and boilerplate: the list itself (synergy, leverage, unlock, seamless,
     world-class, excited to announce), not a description of it.
  6. Worldview: how we frame the problem and the customer, in two or three sentences; every
     piece must agree with it.
  Company voice and founder voice are two guidelines when they differ; say which applies where.
- **Design system.** The palette with its values, the type scale, spacing and grid, the
  component rules (buttons, cards, forms), what an image may and may not be, and the anti-slop
  list (no gradients, no stock photos of handshakes, whatever the person names). A file with
  the assets goes in through `gtm-os-add-file`; the guideline names its path.
- **Target customer definition.** Who we sell to (segment, size, roles), the trigger that
  makes them buy, what disqualifies, and three named examples. Evidence for it lives in the
  Target customers context; the guideline is the approved statement, not the evidence.
- `applies_to` is what rule 11 matches the current work against. Name kinds of work, not
  places where it is published: copy, outreach, posts, landing pages, creatives, proposals, design, targeting.
  Twelve at most, lowercase.
- Title in the person's language is fine; the slug is derived from it (`tone-of-voice`).
- Under 64 KB. A guideline that needs more is two guidelines.
- Never restate the brain's rulebook or the question policy: every chat already has them.

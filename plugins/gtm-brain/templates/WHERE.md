# Where things go

Codex reads this at the start of every chat and puts every file where a row says. It names the
row it used. When no row fits, it asks you and offers a new row. Edit, add or remove rows freely:
the change applies from the next chat, and GTM Brain never overwrites your edits.

| What | Where |
| --- | --- |
| A rule the work must follow: strategy, tone of voice, pricing, ICP | `<name>.md` at this level; its files in a folder of the same name |
| Brand: design system, logos, fonts | `brand/` |
| An outcome: an event, a campaign, a client, a launch | `projects/<outcome>/`, with a `README.md` whose first line says what it is |
| A deliverable for an outcome: a graphic, a deck, a page, a sprint | inside its outcome: `projects/<outcome>/<deliverable>/`, never a new folder at this level |
| A speaker or guest graphic for an event | `projects/<event>/speakers/<name>/` |
| Raw sources: transcripts, zips, exports, downloads | `projects/<outcome>/sources/`, or beside the person or company they are about |
| A person's photo, a company's logo | their page in the brain, as the approved file; an outcome uses it, never keeps its own default copy |
| A process that runs over time, with steps | `workflows/` |
| What we learned: a meeting, a decision, a finding | say it in the chat; Codex notes it in `brain/` |
| Scratch, cache, logs | `work/`: never anything you need, it is not shared |

Before a new outcome folder, Codex checks the outcomes listed at the start of the chat: a task
that belongs to one goes inside it (a speaker graphic for the Berlin event goes in
`projects/berlin-event/speakers/`).

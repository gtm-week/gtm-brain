# Where things go

Codex reads this at the start of every chat and puts every file where a row says. It names the
row it used. When no row fits, it asks you and offers a new row. Edit, add or remove rows freely:
the change applies from the next chat, and GTM Brain never overwrites your edits.

| What | Where |
| --- | --- |
| A rule the work must follow: strategy, tone of voice, pricing, ICP | `<name>.md` at this level; its files in a folder of the same name |
| Brand: design system, fonts, brand files | `brand/` |
| A project: an event, a campaign, a client, a launch | `projects/<project>/`, with a `README.md` whose first line says what it is |
| A deliverable for a project: a graphic, a deck, a page, a sprint | inside its project: `projects/<project>/<deliverable>/`, never a new folder at this level |
| A speaker or guest graphic for an event | `projects/<event>/speakers/<name>/` |
| Raw sources: transcripts, zips, exports, downloads | `projects/<project>/sources/`, or beside the person or company they are about |
| Video, audio, recordings, any file over 25 MB | the shared drive (Google Drive), linked from the project's `README.md`; never in the brain, git cannot hold them |
| A person's photo, a company's logo (the one to use) | their page in the brain, as the approved file; a project uses it, never keeps its own default copy |
| A process that runs over time, with steps | `workflows/` |
| What we learned: a meeting, a decision, a finding | say it in the chat; Codex notes it in `brain/` |
| Scratch, cache, logs | `work/`: this computer's own files, never a deliverable, not shared; do not delete it |

Before a new project folder, Codex checks the projects listed at the start of the chat: a task
that belongs to one goes inside it (a speaker graphic for the Berlin event goes in
`projects/berlin-event/speakers/`).

Name folders and files in lowercase words joined by hyphens, no spaces: `speakers/florian-weber/`,
not `speakers/Florian Weber/`.

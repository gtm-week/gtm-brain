# Rules

This brain's own rules. Codex reads them at the start of every chat and follows them over GTM
Brain's defaults. Edit freely, or say `/gtm-brain-rules` and Codex shows and changes them for
you: a change applies from the next chat, and GTM Brain never overwrites your edits.

## Where things go

Codex puts every file where a row says and names the row it used. When no row fits, it asks you
and offers a new row.

| What | Where |
| --- | --- |
| A document the work must follow: strategy, ICP, tone of voice, design system, pricing | `<name>.md` at this level (`strategy.md`, `icp.md`, `voice.md`, `design-system.md` are here from day one); its files in a folder of the same name |
| Brand: fonts, logo files, design tokens | `design-system/`, beside `design-system.md` |
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

## Ask the source

Some answers live in a tool that knows better than a saved note: a deal moves, a meeting is
rescheduled, a new email arrives. For these questions Codex reads the tool in the Ask column
instead of answering from the brain, once the brain's note is older than the last column allows.
A row applies only when that tool is connected; otherwise the brain answers and says how old its
note is. Edit the rows freely: "1 day", "3 days", "2 weeks", "always ask" or "no limit".

| Question about | Ask | Brain answer is good for |
| --- | --- | --- |
| Deal stage and amount | CRM | 1 day |
| Invoice or payment status | Billing | 1 day |
| Who registered for an event | Events tool | 1 day |
| Meeting times, the next meeting | Calendar | always ask |
| The latest email in a thread | Email | always ask |
| What was said in a meeting | Meeting notes | no limit, once saved |
| Who someone is, decisions, our strategy | The brain | no limit |

## Our rules

Rules for what Codex saves and asks, one line each, in your words ("always ask before tagging a
client", "notes about pricing go to Our offer"). When you correct how something was saved, Codex
offers to add one here.

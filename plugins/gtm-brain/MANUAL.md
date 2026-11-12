# How your company brain works

The manual for the people who use a brain: what it does, what it cannot do, how to change it,
and what to check when something looks wrong. Ask Codex in the brain's chat ("how does the brain
work?", "how do I change where files go?") and it answers from this page.

## What it is

A folder in git on your computer. Codex writes to it through GTM Brain's tools, and every change is
committed at once (and pushed when the folder has a remote). Plain Markdown and JSON lines: any
editor opens it.

| Part | Where | Who writes it |
|---|---|---|
| Company profile, team, tools | `brain/admin.md` | Codex, only after you choose APPROVE |
| Notes (what happened, was decided, is open) | `brain/contexts/<context>/memories.jsonl` | Codex, when you say something worth keeping; never edited |
| A context's summary and rules | `brain/contexts/<context>/context.md` | the summary: the compile run; the rules: you, through Codex |
| People, companies, products | `brain/entities/*.md` | Codex; you may edit the Markdown by hand |
| Where files go | `WHERE.md` | you; Codex follows it |
| Your documents (strategy, tone of voice, pricing) | `<name>.md` at the top, files in a folder of the same name | you or Codex |
| Projects (an event, a campaign, a client) | `projects/<project>/` | you or Codex |
| Rules Codex follows in this folder | `AGENTS.md`, `CLAUDE.md` | GTM Brain; refreshed on update, never edit |
| This computer's working files | `work/` | GTM Brain; not in git, never a deliverable |

## Saving: what you say, what it keeps

Say what happened in a sentence: "Max will run the demo on Tuesday", "we decided no discount for
Bergstrom", "open question: who signs for Acme?". You do not need to say "remember". One note per
outcome, in the context its meaning fits, with the people, companies, tools and project it names.

Before saving, Codex connects the sentence to what the brain knows and asks, once, about what it
cannot settle. It asks in Codex's question box when you turned it on, otherwise in plain text:

- **Names.** Four rules, also in the brain's README:
  - P1: a known name, alias or email is that one.
  - P2: a first name alone ("Max") is a known person only when exactly one known person has it.
  - P3: a first name alone is never saved as a new person: Codex asks "Max who?".
  - P4: a name like a known one is never merged on a guess: "same as X?". The same first name with
    a different surname is someone else.
- **Dates.** "Thursday" said on a Thursday can be today or next week: Codex asks. A date with one
  reading is written into the note ("Friday (2026-11-13)"). "Next Saturday" in any request, not only
  a note, is asked when it has two readings. Every chat starts with today's date.
- **Companies.** A new company is asked for its website once.
- **Projects.** A note about someone whose notes all sit in one project is tagged with it; when
  they are in several, Codex asks which.
- **Your reply first.** A held question waits for your answer; Codex never picks it for you.

Notes are never edited. "Actually the board meeting is on the 19th" saves a correction that
replaces the old note. "Forget that Lena runs the workshop" withdraws it: the old note leaves every
view, and a short note says what was withdrawn. Both stay in the file and in git.

## Contexts

A context is one lasting topic with its own notes and summary: Our company, Strategy, Market,
Target customers, Our offer, your personal context, and any you add.

Making one:

- **X1** A project is not a context: it is a folder in `projects/` and a tag on notes. Notes about
  a project go in the context their meaning fits, tagged with the project.
- **X2** Codex offers a new context when lasting work starts that no context covers (a new
  website or product project, a theme across several notes), and creates it only after you say yes.
- **X3** Never two contexts for one topic: a name like an existing or archived context gets
  "same as X?" first.

Loading one:

- **L1** `brain/admin.md` is always loaded. Other contexts load when you ask ("open Target
  customers") or when the work plainly fits, and stay loaded for this folder's next chat.
- **L2** Loading puts a context's summary and standing rule into the chat. Answers search the notes
  of every context, loaded or not.
- **L3** A note is saved in the context its meaning fits, whatever is loaded.

Change a context in chat: "rename Market to Competitors", "change the rule of Our offer to ...",
"archive berlin-expansion", "fork Bergstrom out of Target customers".

## Summaries

Each context's summary is rewritten by a separate Codex run (the compile):

1. **After you save.** Every save starts it; it waits until nothing was saved for 2 minutes, then
   rewrites every summary with new notes in one run (about 15-20 seconds). The run continues after
   you close the chat; it needs the computer awake and Codex installed.
2. **When you ask.** "Update the summary now" starts it without the wait.
3. **On a schedule, if you set one up.** A Codex Scheduled task (Codex app, the brain's project,
   Scheduled tasks, run in the local project, weekly) with the prompt: "Run the gtm-brain-sync
   skill as the scheduled run: compile every context whose summary is behind with by: schedule,
   render the dashboard. Do nothing else." It catches what the first case missed: the computer
   slept, a run failed three times.

A summary is 2-4 sentences under 90 words: what is going on, what is open, what changed. Every
sentence rests on named notes (kept in `summary_sources`) and uses real dates, never "next
Tuesday". The compile refuses anything else.

The chat and the dashboard say how old a summary is: "up to date (as of 12 Nov)", "updating
shortly" right after a save, and "out of date" with its date once it is more than 2 days behind.
When summaries fall behind and no scheduled run saved anything in 8 days, the next chat asks
once a week whether to compile now and set up the weekly run. A summary you edited by hand is
paused until you review the edit in chat; the compile never overwrites it.

Answers do not depend on summaries: Codex searches the notes themselves. The summary is the
overview you see first on the dashboard and at the start of a chat.

## Files and projects

`WHERE.md` decides where every file goes. Codex names the row it used; when no row fits it asks
and offers a new row. Edit the rows to change where things land; GTM Brain never overwrites them.
Ask "why is this here?" about any file: the answer names the row, the reason, who put it there and
when. A file that appears without one is named at the next chat start.

Work in your own folders: `/gtm-brain-project` in any Codex project links it to the brain. Notes
made there carry the project's tag, and everything stays searchable from the brain.

## Asking it things

- "What do we know about the TCO?" searches every context and says where it found it.
- "Who is Max?" shows the person's page: how each spelling was matched, by which rule, from which
  note and project.
- "Why did you add Florian?" answers from the page: the first note, when, by whom, from where. It
  never answers from the chat's memory.
- "What is open?" lists open questions; answering one closes it.
- "Open the dashboard" shows contexts, notes, entities, questions and search, read-only. To change
  anything, use "Chat about this" on a card, or say it in chat.

## Changing how it works

| To change | Do this |
|---|---|
| Company profile, team, tools, settings | say it in chat; Codex shows the change and applies it only when you choose APPROVE |
| What Codex saves and asks | your own rules in `RULES.md`, one line each; Codex offers to add one when you correct a save, and yours win over the defaults |
| Where files go | edit the rows in `WHERE.md` |
| How Codex works in a context | "change the rule of <context> to ..." |
| A rule the work must follow (tone of voice, pricing, ICP) | write it as a document: `<name>.md` at the top, then "add <name>.md as a document" |
| A recurring process with steps | "start the outbound workflow", or describe a new one; see `workflows/` |
| A new skill for your team | "make a skill that ..." (gtm-brain-skill) |
| An action your own tools run (a CRM write) | "propose an interaction for ..."; applied only after APPROVE |
| Which tools are connected | "connect my tools" |
| A person's or company's name, alias, kind | "Chris is Krzysztof Pawlak", "Telli is a company" |
| A wrong note | "correct ...", or "forget ..." |
| GTM Brain itself | "update GTM Brain"; your brain's rules refresh by themselves, with backups in `work/` |

Do not edit `AGENTS.md`, `CLAUDE.md`, `admin.md`, `memories.jsonl` or `ontology.ossie.json` by
hand: a direct edit of a protected file is put back at the next chat start and your version is kept
in `work/manual-edits/protected/`.

## What it does not do

- Copy your CRM, mail or calendar into the brain: it reads them live and keeps what happened and
  what you decided.
- Invent a fact: what is not in a note or a tool, it says it does not know.
- Merge two names, create a context, change company info or a scheduled task without your yes.
- Run when your computer is off or asleep: summaries catch up at the next run.
- Read other connectors' calls: it only sees its own tools; Codex marks an untested tool itself.
- Speak another language: brains are English.

## When something looks wrong

| You see | Check |
|---|---|
| A note saved that should not have been | "why did you add X?"; then "forget ..." |
| A summary that looks old | its "as of" date; "update the summary now"; `work/compile.json` shows queued, running, done or failed |
| Summaries never update | `work/hooks.log` lines `scheduled-run ... failed`; `work/runs.jsonl` has one line per compile run with its tokens; no lines at all means no run started |
| A file in the wrong place | "why is this here?"; fix the `WHERE.md` row |
| Codex did something you did not ask | `work/tool-usage.jsonl` lists every GTM Brain call with time and title; `git log` lists every change with who made it |
| A question box you cannot answer in | type the answer in chat; a closed box is no answer and Codex asks again in text |

Everything is in git: `git log` in the brain folder shows every note, compile and edit, one commit
each, and any of them can be reverted.

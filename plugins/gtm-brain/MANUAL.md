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
| People, companies, products, offerings, events, tools, meetings | `brain/entities/<kind>/<name>-<short id>.md` (`people/`, `organizations/`, ...), files in the folder of the same name; `index.md` per kind | Codex; you may edit a page's Markdown by hand, never an `index.md` |
| Where files go, your own rules | `RULES.md` | you; Codex follows it |
| What the brain keeps per person, organization and product, and relationship types | `SCHEMA.md` | you; Codex fills the fields from notes |
| Your documents (strategy, ICP, tone of voice, design system, pricing) | `<name>.md` at the top (the first four from day one), files in a folder of the same name | you or Codex |
| Projects (an event, a campaign, a client) | `projects/<project>/` | you or Codex |
| Rules Codex follows in this folder (six core rules first, also sent with every GTM Brain chat, then one line per rule; the detail of each is a rule page that ships with the plugin) | `AGENTS.md`, `CLAUDE.md` | GTM Brain; refreshed on update, never edit; your own lines stay at the end under "This brain's own additions" |
| This computer's working files | `work/` | GTM Brain; not in git, never a deliverable |

## Saving: what you say, what it keeps

Say what happened in a sentence: "Max will run the demo on Tuesday", "we decided no discount for
Bergstrom", "open question: who signs for Acme?". You do not need to say "remember". One note per
outcome, in the context its meaning fits, with the people, companies, tools and project it names.

Before saving, Codex connects the sentence to what the brain knows and asks, once, about what it
cannot settle (an unclear name is asked right after the note is saved). It asks in Codex's question box whenever Codex has it in the chat, otherwise in plain text:

- **Names.** Four rules, also in the brain's README:
  - P1: a known name, alias or email is that one.
  - P2: a first name alone ("Max") is a known person only when exactly one known person has it.
    With several, the note is saved without a guess and Codex asks which one.
  - P3: a first name alone is never saved as a new person. The note is saved with the name as
    written, then Codex asks "Who is Anna? Full name or company." The question waits on the
    dashboard with the other open brain questions; the answer attaches the name to the saved note
    through a new note that replaces it.
  - P4: a name like a known one is never merged on a guess: "same as X?". The same first name with
    a different surname is someone else.
- **Dates.** "Thursday" said on a Thursday can be today or next week: Codex asks. A date with one
  reading is written into the note ("Friday (2026-11-13)"). "Next Saturday" in any request, not only
  a note, is asked when it has two readings. Every chat starts with today's date.
- **Companies.** A new company is asked for its website once.
- **Projects.** A note about someone whose notes all sit in one project is tagged with it; when
  they are in several, Codex asks which.
- **Your reply first.** A held question waits for your answer; Codex never picks it for you.

Entity pages live in a folder per kind: `brain/entities/people/`, `organizations/`, `products/`,
`offerings/` (what we sell: what it is, its price, who it is for), `events/`, `tools/`,
`meetings/`, and a folder for each kind you add in SCHEMA.md. A page is named
by the readable name and the first six characters of its stable id (`people/max-jendral-3f9a2c.md`),
so two people with one name get two pages. A rename moves the page and its files folder in git and
keeps the id part, so links by id and attached files still work. Each folder's `index.md` lists
every entity of that kind on one line (name, what they are, relation to us, short id, last
mentioned); GTM Brain rewrites it with the pages. Relation to us (team, customer, partner, investor,
prospect, other) is derived from the notes: the team in admin.md, customer status, partner_of,
investor_in, and a person's employer. "Show the customers' VPs of Sales" filters on it and on the
SCHEMA.md fields without opening pages. A captured meeting becomes a page in `meetings/` that
collects the notes saved with its meeting id and lists who attended; the transcript stays in its
tool. A brain from before 0.35 keeps its flat `brain/entities/*.md` until "upgrade the brain"
moves the pages into the kind folders in one commit; meeting pages, and offerings when SCHEMA.md
has no Offering section, wait for that move, so a flat brain never holds a page 0.34 cannot read.
Update every teammate first: GTM Brain 0.34 reads only the flat pages, so after the move it sees no
people or companies (its saves still work) and writes its own flat pages for the names it adds.
At the next write on 0.35 each one folds into the page that holds the same id, a merged id, or the
same name, alias or email (its text is kept in `work/manual-edits/entities/`); one that matches
nothing moves into its kind folder as a new entity.

A chat that keeps reading the brain and saves nothing is reminded once, with the third read, to save
what the turn established; `save_nudge: off` in `brain/admin.md` turns the reminder off.

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

Each context's summary is rewritten from its notes (the compile):

1. **When you ask.** Loading the context, asking where things stand, or "update the summary" in a
   chat: Codex writes the summary there, once, from the notes since the last one, and it is kept
   until new notes arrive. Nothing runs after a save (since 0.35.0).
2. **On a schedule, if you set one up.** A Codex Scheduled task (Codex app, the brain's project,
   Scheduled tasks, run in the local project, weekly) with the prompt: "Run the gtm-brain-sync
   skill as the scheduled run: compile every context whose summary is behind with by: schedule,
   render the dashboard. Do nothing else."

A summary is 2-4 sentences under 90 words: what is going on, what is open, what changed. Every
sentence rests on named notes (kept in `summary_sources`) and uses real dates, never "next
Tuesday". The compile refuses anything else.

Since 0.35.0 a topic's summary is written when you ask about the topic ("where do we stand on
pricing?", loading the context, or "update the summary"), in that chat, and kept until new notes
arrive; no separate run writes it after each save. The chat says how old a summary is: "up to
date (as of 12 Nov)", or "as of 12 Nov, 4 newer notes", and then says it is writing the summary
now, answers from the notes, and saves the new summary once. If writing fails, it says what
failed and what to do, once, and the health line keeps the last failure. A summary you edited by
hand is paused until you review the edit in chat; nothing overwrites it.

Answers do not depend on summaries: Codex searches the notes themselves. The summary is the
overview you see first on the dashboard and at the start of a chat.

## Chat capture

Some outcomes are said in a chat and never saved. Once a night the scheduled run (or the launchd job,
`scripts/gtm-brain-schedule/launchd.plist.example`, 02:00, run on waking when the laptop was closed) reads
this brain's chats that changed since the last pass: the chats in the brain folder and in its linked
project folders, nothing else, the person's and the assistant's words only. One model run with no tools
lists the decisions, changes, dated commitments and corrections nobody saved, each with the exact
sentence it rests on; a sentence that is not in the chat is dropped, and so is a note naming a person,
a company or a figure the chat does not have. The rest are saved like any note
(tagged `captured`, the chat as source, every saving rule applies) and committed. The pass does not push them itself: the next commit in the brain shares them with the
team like any note, usually the summary run right after the pass. The next chat start lists them in one
line; "undo captured" withdraws the listed ones together, as the person's own save, pushed at once.

A pass reads at most 200,000 tokens (50,000 per chat); what is left waits for the next pass, which
starts there. Each pass records its tokens in `work/capture-runs.jsonl`. When the last good pass is
older than 36 hours, or the last one failed (not signed in, the host's state database read-only, the
model tool missing), the health line says why and the chat start offers to run it now, at most once a
day. A machine where no pass has run yet is offered one after 36 hours, so a new brain's first chats
are not asked. Turn it off, or change the caps, with `capture_chats` (`mode: off`, `cap`, `chat_cap`), for this
machine only.

## Files and projects

The "Where things go" table in `RULES.md` decides where every file goes. Codex names the row it used; when no row fits it asks
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
- "What stage is the Acme deal in?" goes to the CRM when the brain's note is older than the "Ask the
  source" table in `RULES.md` allows and the CRM is connected; otherwise the brain answers and says
  how old its note is. A row applies only when its tool is connected; without the section, the
  shipped rows apply.
- "Open the dashboard" shows contexts, notes, entities, questions and search, read-only. To change
  anything, use "Chat about this" on a card, or say it in chat.

"Is the brain too full or too empty?" is `query` (population): counted from the files, with no
model: notes saved in the last 7 days against the weekly average of the 4 weeks before, exact
duplicates (same text) and near ones (same source record on the same day), entities no note
mentions, entities missing a field SCHEMA.md marks required, notes no summary or brief cites, and
notes without a source. Each number has a range (in `lib/population.mjs`, no setting yet); when one
is out of range the chat start's `health:` line says so in one part. Capture rate and noise rate
show as "not measured": they need a capture pass that is not built. The same line marks a tool
whose last sync is older than its window (7 days, or the `window_days` its checkpoint carries):
each source keeps its own checkpoint in `work/sync.json`, by kind and account.

## Workflows

A skill is one sitting of work; a workflow (`workflows/<name>.md`) is skills in sequence with a gate
between steps. Its header says its status (draft, active, paused), its trigger (manual, a schedule
such as `every Monday 09:00`, or a save: `note about organization`, `link works_at created`,
`field person.role changed`, `field organization.industry missing for 30 days`) and what it reads
and writes. Each step may name a skill and ends on a milestone the brain can see (a note tagged
x, a link created, a field filled, a document written); that note starts the next step, and the
chain of notes is the run's only state. An active workflow whose trigger fired is offered once at
the chat start and starts only on your yes; the first note of the run marks the event taken, for
teammates too. Rules bind every step. Limits: 3 active runs per workflow, 5 automatic steps a run
a day, chains stop at depth 3, a workflow's own notes never start it; `workflows: off` in admin.md
turns them all off. A SCHEMA.md change that removes what an active workflow names holds it until
the header or the schema is fixed. `query workflows` shows each one, its runs and what they wait for.

## Changing how it works

| To change | Do this |
|---|---|
| Company profile, team, tools, settings | say it in chat; Codex shows the change and applies it only when you choose APPROVE |
| What Codex saves and asks | your own rules under "Our rules" in `RULES.md`, one line each; Codex offers to add one when you correct a save, and yours win over the defaults. Under a rule, Codex proposes a tag line (`> applies to: organization · when: saving customer status · check`) and writes it on your yes: then the rule is shown only for that kind, and a `check` rule refuses a save that breaks it |
| Where files go | `/gtm-brain-rules`, or edit the rows under "Where things go" in `RULES.md` |
| Which questions go to a live tool, and how old a note may be | edit the rows under "Ask the source" in `RULES.md` (deal stage: CRM, 1 day; meeting times: calendar, always ask) |
| What the brain keeps (fields, subtypes, relationship types) | `/gtm-brain-schema`, or edit `SCHEMA.md`; a brief's fields are rewritten with its overview, when someone asks about it |
| How Codex works in a context | "change the rule of <context> to ..." |
| A rule the work must follow (tone of voice, pricing, ICP) | write it as a document: `<name>.md` at the top, then "add <name>.md as a document" |
| A recurring process with steps | "start the outbound workflow", or describe a new one; see `workflows/` and "Workflows" above |
| When a workflow starts by itself | its header in `workflows/<name>.md` (trigger: a schedule or a save); "check the workflow", then "switch it on" |
| A new skill for your team | "make a skill that ..." (gtm-brain-skill) |
| An action your own tools run (a CRM write) | "propose an interaction for ..."; applied only after APPROVE. When it runs, Codex does it in the tool first and the note is written only after the tool confirms, with the record's link or id; a failed write is noted as a failure |
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
- Note a CRM write that did not happen: an interaction is recorded after the tool confirms it.
- Merge two names, create a context, change company info or a scheduled task without your yes.
- Run when your computer is off or asleep: summaries catch up at the next run.
- Read other connectors' calls: it only sees its own tools; Codex marks an untested tool itself.
- Speak another language: brains are English.

## When something looks wrong

| You see | Check |
|---|---|
| A note saved that should not have been | "why did you add X?"; then "forget ..." |
| Something said in a chat was not saved | say it again as a plain sentence, or "save that"; the status and each loaded context show "last note N days ago", and a brain with nothing saved for over a week says so at chat start |
| A fact that may be out of date | ask for the brief ("who is X"): a fact or relationship older than 30 days shows "as of <date>, N days ago", and the brief says when the entity was last mentioned |
| A summary that looks old | its "as of" date; "update the summary now"; `work/compile.json` shows queued, running, done or failed |
| Summaries never update | `work/hooks.log` lines `scheduled-run ... failed`; `work/runs.jsonl` has one line per compile run with its tokens; no lines at all means no run started |
| A file in the wrong place | "why is this here?"; fix the `RULES.md` row |
| "this brain was upgraded ... update GTM Brain", and nothing saves | a teammate's newer GTM Brain changed the brain's file layout (`brain/layout.json`); yours reads it but writes nothing until you say "update GTM Brain" and start a new chat |
| Codex did something you did not ask | `work/tool-usage.jsonl` lists every GTM Brain call with time and title; `git log` lists every change with who made it |
| A question where none of the options fits | type your own answer in the box's "Or write your own response" field, then Send. The main message field below waits until the question is answered or skipped. Skip closes it, and Codex asks again in plain text. |

Everything is in git: `git log` in the brain folder shows every note, compile and edit, one commit
each, and any of them can be reverted.

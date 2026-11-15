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
| The design system as a page | `design-system.html` beside `design-system.md`: one self-contained HTML file (no scripts, nothing loaded from the network) shown on the dashboard's Visual tab. The page is the source for how things look; the Markdown says the same in words for Codex, and the two are kept in step | Codex, on your yes ("fill in our design system") |
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
- **Companies.** A new company is saved as a company. Its website is not asked on a save; give it
  any time ("Northwind is northwind.com") and it is kept on the company's page.
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
tool. A brain from before 0.35 keeps its flat `brain/entities/*.md` (file layout 1) and works as
before until "upgrade the brain" moves the pages into the kind folders. The move asks first: the
upgrade says how many pages would move and which teammates saved in the last 14 days, and changes
nothing until you say yes; an update of the plugin and a scheduled run never move them. On yes the
pages move and `brain/layout.json` records layout 2 in the same commit (a brain made by setup starts
there). Meeting pages, and offerings when SCHEMA.md has no Offering section, wait for that move, so
a flat brain never holds a page 0.34 cannot read. Update every teammate first. A teammate's older
GTM Brain that checks `brain/layout.json` then reads the brain, says "this brain was upgraded to
file layout 2 ... update GTM Brain" and saves nothing until it is updated. GTM Brain 0.34 does not
check it yet: it reads only the flat pages, so after the move it sees no people or companies, its
saves still work, and it writes its own flat pages for the names it adds. At the next write on 0.35
each one folds into the page that holds the same id, a merged id, or the same name, alias or email
(its text is kept in `work/manual-edits/entities/`); one that matches nothing moves into its kind
folder as a new entity. A brain whose pages an early 0.35 moved without recording it is set to
layout 2 at the next chat start or save, said in one line.

A chat that keeps reading the brain and saves nothing is reminded once, with the third read, to save
what the turn established; `save_nudge: off` in `brain/admin.md` turns the reminder off.

Notes are never edited. "Actually the board meeting is on the 19th" saves a correction that
replaces the old note. "Forget that Lena runs the workshop" withdraws it: the old note leaves every
view, and a short note says what was withdrawn. Both stay in the file and in git.

### Relationships and history

"Anna works at Northwind", "Northwind is our partner", "Tom reports to Anna": a relationship of a type
`SCHEMA.md` lists is saved as a note that names both ends and the type; the brain fills in the rest.
It is current unless your words say it ended ("left", "no longer", "churned", "ended", "used to",
"former"), dated when you said it, and resting on your word, or on the record the note cites (a CRM,
LinkedIn). "Anna left Northwind and joined Acme" starts Acme and ends Northwind.

Each relationship is one record with its own id, and every note about it is an event: started,
changed, ended. Nothing is overwritten: "Anna left Northwind" is a new note, and the old one stays
as history. Where `SCHEMA.md` says One at a time (an employer, a manager), a new one ends the one
before it: "Anna joined Acme" also saves "Anna no longer works at Northwind", dated the same day.
If that was a mistake and you withdraw it, Northwind is current again.
Partners, investors and attendance can be many at once. What you said beats what a tool says: a
source that disagrees is listed beside it, never applied.

Renames, merges and kind changes are kept in the same history (`brain/entities/.history/events.jsonl`),
so "what was Northwind called before?" or "where did Anna work in June?" is answered from the brain,
not from git: `query` relations for an entity gives its relationships and its history, and with a
date (filters.at) the ones current then. Each entity page shows the same under `## History`.

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

### One brain, many projects

A project (an event, a campaign, a client) is two things: a folder in `projects/` for its files,
and a tag on its notes. It is not a second memory.

- **People, organizations and every other entity are shared.** Max Jendral has one page, whether
  he comes up in the Berlin event or in the Q1 campaign. A note saved in either project lands on
  that one page, so nobody is entered twice and nothing has to be copied between projects.
- **Notes go where their meaning fits.** A pricing decision made while working on the Berlin event
  is saved in Our offer, tagged `project:berlin-event`. The tag says which work it came from; the
  context says what it is about.
- **A question can be wide or narrow.** "What do we know about Max?" answers from every project.
  "What did we decide for the Berlin event?" answers from the notes with that tag.
- **Files stay with their project.** A deliverable made for a project goes in its folder under
  `projects/`; a file that belongs to a person or a company (a photo, a logo) stays with that
  entity's page, so it is found from any project.

A project ends when its work does: its folder and notes stay, and the people and companies it
touched keep everything that was learned about them.

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
- "Open the dashboard" shows what needs you, the base documents, rules, entities, notes and workflows,
  with one search box. It is for reading, with one exception: a document (a base document or another
  document) opens in an editor and Save writes it the way Codex does, through the document script. To
  change anything else, use "Chat about this", or say it in chat.

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
| GTM Brain itself | "update GTM Brain", quit and reopen Codex; your brain's rules refresh by themselves, with backups in `work/`; a move of files is offered and waits for a yes ("Updating to 0.35" below) |

Do not edit `AGENTS.md`, `CLAUDE.md`, `admin.md`, `memories.jsonl` or `ontology.ossie.json` by
hand: a direct edit of a protected file is put back at the next chat start and your version is kept
in `work/manual-edits/protected/`.

## Who can change the base files

A brain set up or upgraded with this release keeps its base files in `about-us/` (strategy, ICP,
market, voice, the design system and its files, and any base file the team added) and its
configuration in `config/`: `rules.md` (where things go, Ask the source, Our rules), `schema.md`
(what the brain keeps) and `settings.yaml` (company, one-liner, owner, team with handles and
emails, tools and settings; it replaces `brain/admin.md`). An older brain keeps them at the top
and in `brain/admin.md` until its owner says yes to "upgrade the brain", which moves them in one
commit, word for word.

Only the brain's owner (`owner` in `config/settings.yaml`; the first owner is whoever ran setup)
changes anything under `about-us/` or `config/`. When a teammate asks for a change there, or
edits a file there by hand, nothing there changes: the change is kept as a proposal in
`brain/proposals/`, a note tagged for the owner says who asked and what, and the owner sees it in
one line at their next chat start. Only the owner's APPROVE applies it. The owner's own hand edit
is kept and recorded. Every approval is recorded as a decision note: who asked, who approved,
which file, a one-line summary and the commit. "Show the approvals" lists them (`query`, object
approvals) with the proposals still waiting.

The owner is whoever the committed `config/settings.yaml` names. Writing another handle on the
`owner` line by hand is itself a change that waits for the owner, so the brain changes hands only
when the current owner edits that line or approves it. A proposal is applied only to files under
`about-us/` and `config/`, whatever its own file claims. Every chat start in such a brain says in
one line where the files are that older text calls `RULES.md`, `SCHEMA.md` and `brain/admin.md`.

How far this goes: GTM Brain enforces it, in every write it makes, in every save and at every
chat start. It does not stop git. A teammate with write access to the repository can still
change these files and push with git directly, and who is "the owner" on a machine is the
checkout's own identity (the git email, or the name given there), not a sign-in. GitHub can
block such a push only with a push rule (a ruleset that restricts file paths), which needs a paid
plan for a private repository. The paths to protect: `about-us/**`, `config/**`,
`brain/ontology.ossie.json`, and, for brains not yet upgraded, `brain/admin.md`, `RULES.md` and
`SCHEMA.md`.

## Updating to 0.35

0.35 changes where a brain keeps some of its files. Updating the plugin moves nothing: the brain
keeps working as it is until someone says yes to the move. Notes are never rewritten, and every
person, company and note keeps its id.

### What to do, in order

1. **Everyone on the team updates the plugin first.** In Codex, say "update GTM Brain". Without
   Codex: `codex plugin marketplace upgrade gtm-brain`, then `codex plugin add gtm-brain@gtm-brain`.
2. **Quit and reopen Codex, then start a new chat in the brain folder.** A new chat alone is not
   enough: the running app still holds the old plugin. An update started from the brain's chat
   may already show the upgrade question; it changes nothing and is asked again in the new chat.
3. **Read the first reply of that chat.** The first GTM Brain call refreshes what it can on its
   own and says so: "GTM Brain refreshed this brain's rules (AGENTS.md) from GTM Brain 0.34.x on
   its own". The old `AGENTS.md` is kept in `work/upgrades/before-<id>/`. It also refreshes
   `README.md`, `RULES.md` and `SCHEMA.md` when nobody edited them, one commit each. Then Codex adds
   one line: "This brain can be upgraded to the 0.35 file arrangement. Say: upgrade this brain."
4. **The owner says "upgrade this brain".** Codex answers with what would move, which teammates
   saved here in the last 14 days, and one question: "Yes, upgrade the layout / No, not now".
   Nothing has changed at this point (the tool says "Nothing was changed."). No is safe: the
   brain keeps working, and the offer comes back in the next chat.
5. **On yes, the files move** and the reply lists them: "moved 20 entity pages into a folder per
   kind", "moved strategy.md -> about-us/strategy.md", "moved brain/admin.md ->
   config/settings.yaml (the same settings, the prose as notes)". It is pushed like any save.

On the real brain used to rehearse this (950 notes, 324 entity pages) step 3 took 5 seconds and
step 5 took 4 seconds.

### The two moves

| Move | What it does | Who can say yes |
|---|---|---|
| Entity pages into kind folders (file layout 2) | `brain/entities/max-jendral.md` becomes `brain/entities/people/max-jendral-3f9a2c.md`; companies go to `organizations/`, and so on. Same page, same id | anyone on the team |
| Base files and configuration into two folders (file layout 3) | `strategy.md`, `icp.md`, `voice.md`, `design-system.md`, `market.md` and any base file you added move into `about-us/`; `RULES.md` becomes `config/rules.md`, `SCHEMA.md` becomes `config/schema.md`, `brain/admin.md` becomes `config/settings.yaml`. Word for word | only the owner |

The owner is asked once, for both moves together. A teammate who says "upgrade this brain" is
asked about the first move only and is then told: "One more move is waiting: the base documents
into about-us/ and the rules, schema and settings into config/. It is the owner's (name) to say
yes to". The owner's next chat offers it.

The same run adds what the brain lacks and never replaces a file that is there: the starter
documents (`icp.md`, `voice.md`, `design-system.md`, `market.md`, `strategy.md`), `workflows/`,
and a page under `brain/entities/meetings/` for each meeting already captured.

What does not move: notes (`brain/contexts/<context>/memories.jsonl`), `workflows/`, `projects/`,
documents in your own folders (`talks/talk-draft.md`), and files at the top that are not documents.

### Why everyone updates the plugin before the owner says yes

A teammate still on GTM Brain 0.34 is not warned by their plugin. What happens to them, measured
on 0.34.5:

- **After the first move:** their notes keep saving and nothing is lost. Their GTM Brain no
  longer finds the entity pages, so a person it knew yesterday answers "Unknown or ambiguous
  entity: Marta Zawadzka", and each name they save gets a flat page of its own again. The next save
  from an updated GTM Brain folds those pages back in, under the same id.
- **After the second move:** their GTM Brain no longer recognises the folder. Every request, a
  question or a save, answers "... is not a brain: no brain/admin.md there. Pass the workspace
  folder you are in, or run setup_brain in an empty folder." Nothing is written. The fix is to
  update GTM Brain and restart Codex, never to run setup.

A teammate already on 0.35 notices nothing until the move, then gets one line at chat start saying
where the files are now and that only the owner changes `about-us/` and `config/`.

### What is different afterwards

- **Where files are.** Entity pages in a folder per kind. Base documents in `about-us/`. Rules,
  schema and settings in `config/`. `brain/layout.json` records the arrangement.
- **Base files and other documents.** A base file (`about-us/`) describes the company and only the
  owner changes it; a teammate's change waits as a proposal ("Who can change the base files"
  above). Every other document stays in its own folder and anyone on the team changes it.
- **One-call search.** A question is answered from one search (`query`, object answer): the best
  notes with date and source, and the card of the person or company it names. A name typed without
  its accents finds the person ("Lukasz" finds Łukasz).
- **Relationships and their history.** Who works where, who is a customer, since when and until
  when, kept as dated events ("Relationships and history" above).
- **The dashboard** has four tabs: Configuration, Entities, Memories, Workflows. A document can
  be edited and saved on the page, an entity can be added, renamed, merged or archived in
  Entities, and a note can be corrected, withdrawn, moved or answered in Memories. A teammate's
  save of a base file there becomes a proposal for the owner.
- **The design system page.** The Design system document is shown as one: type samples, spacing,
  its files, and a Visual tab when `design-system.html` sits beside it.
- **Summaries on demand.** A context's summary is written when the context is loaded, not by a
  background run.

### Going back

Every move is a git commit with renames, and no note is touched, so going back is `git revert` in
the brain folder. `git log --oneline` shows the commits:

- `upgrade: config/rules.md, the brain's rules` and `layout 3: base files in about-us/, rules,
  schema and settings in config/`: revert both, newest first, to put the base files, `RULES.md`,
  `SCHEMA.md` and `brain/admin.md` back. This works after later saves too.
- `layout 2: N entity pages into a folder per kind (upgrade)`: revert it to put the entity pages
  back flat. This is clean only before entity pages change again; after later saves git reports
  conflicts on those pages. Decide on the day of the upgrade.

`work/upgrades/before-<id>/` holds the files a rules refresh replaced (`AGENTS.md`, `.gitignore`,
the pre-commit hook), on this computer only. It does not hold moved pages or documents; git does.

Going back does not downgrade the plugin: 0.35 reads and writes all three arrangements.

### If something looks wrong

| You see | What it means, and what to do |
|---|---|
| "... is not a brain: no brain/admin.md there." | this computer is on an older GTM Brain and the owner has moved the brain to `config/`; say "update GTM Brain", quit and reopen Codex. Do not run setup |
| A known person or company is "Unknown or ambiguous entity", and saves write pages straight into `brain/entities/` | the same, one move earlier: this computer is on 0.34 and the pages are in kind folders. Update; the stray pages fold in at the next save |
| "this brain was upgraded to file layout N by a newer GTM Brain ... nothing is written or saved until you update GTM Brain" | a teammate's GTM Brain is newer than yours; say "update GTM Brain", then start a new chat |
| "Rules contain local edits or come from an older unrecognized template. Nothing replaced. Review .../AGENTS.proposed.md" | someone edited `AGENTS.md` by hand, so the upgrade stopped before changing anything; ask Codex to merge your lines into the proposed file, then say "upgrade this brain" again |
| "brain/layout.json cannot be read", and nothing saves | the file was edited by hand or holds a merge conflict; restore it from git (`git checkout HEAD -- brain/layout.json`) |
| "NOT APPLIED: about-us/strategy.md is the owner's to change (name). Kept as proposal ..." | not an error: after the second move a teammate's change to a base file waits for the owner |
| "One more move is waiting ... It is the owner's (name) to say yes to" | not an error: a teammate ran the upgrade; the owner says "upgrade this brain" in their own chat |
| No offer to upgrade in the first reply | the brain is already current ("already current" when you say "upgrade this brain"), or the only move left is the owner's and you are not the owner |

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
| "this brain was upgraded ... update GTM Brain", and nothing saves | a teammate's newer GTM Brain changed the brain's file layout (`brain/layout.json`; layout 2 is entity pages in kind folders); yours reads what it can find but writes nothing until you say "update GTM Brain" and start a new chat |
| Anything else right after an update | "Updating to 0.35" above, "If something looks wrong" |
| Codex did something you did not ask | `work/tool-usage.jsonl` lists every GTM Brain call with time and title; `git log` lists every change with who made it |
| A question where none of the options fits | type your own answer in the box's "Or write your own response" field, then Send. The main message field below waits until the question is answered or skipped. Skip closes it, and Codex asks again in plain text. |

Everything is in git: `git log` in the brain folder shows every note, compile and edit, one commit
each, and any of them can be reverted.

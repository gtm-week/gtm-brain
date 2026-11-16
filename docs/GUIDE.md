# Your company brain: a quick guide

For the person using it, not for the person building it. Ten minutes to read. How the brain works
inside, and how to change it, is in [the manual](../plugins/gtm-brain/MANUAL.md); ask Codex in your brain and it answers from it.

## What it is

A folder on your computer that Codex reads and writes for you. Inside:

- **Admin**: what your company is, who is on the team, which tools you use. Changes only when you approve.
- **Contexts**: Our company, Strategy, Market, Target customers, Our offer, and your personal context. Each has a
  short summary of what is going on and a few standing rules for how to work there.
- **Memories**: the notes in a context. Who said what, what was decided, what is still open,
  what was done. Written by Codex when you tell it, never edited, never deleted.

Deals and contacts stay in your CRM. The brain remembers what happened and what you decided; it
does not copy your data.

## Day one

1. With GTM Brain installed, open a new chat in an empty project and send **`/gtmb-start`**.
   Setup reuses what is known, asks for missing details, and explains the six starting contexts together.
   It also asks which existing Codex projects to follow. Select their names or skip; selected
   folders are linked to your brain while you stay in the onboarding chat. Future notes carry
   their project tags. Existing files and chats are not imported by this choice.
2. Codex checks your tools by itself at every start. If your CRM, mail or calendar has an official
   plugin that is not installed, it offers to install it; say yes and sign in when asked. To run
   the check and a read test on demand: **"connect my tools."**
3. The dashboard opens alongside your chat. Your company facts live in Our company; customer
   and competitor names appear under Entities, linked to notes in the relevant contexts.
4. Setup ends with three short questions, each with Later as a choice: what the brain keeps
   about people, companies and products (the schema), whether Codex should always ask before
   saving something or never save it (the rules), and which base documents to fill now. Then it
   gives you one first task. The walkthrough is in [ONBOARDING.md](ONBOARDING.md#then-schema-rules-documents).

## Every chat

Codex opens with one line telling you where you are:

> In Target customers. Two new notes: Pierre asked for a TCO, and Anna confirmed the buying team. The summary is written when you ask about the topic.

Then you just talk. The things worth knowing:

| You want to | Say | What happens |
|---|---|---|
| work in a context | **open Target customers** | Codex reads that context's summary and rules. It stays there next chat too |
| work in two | **open Strategy and Market** | both loaded; Codex picks the right one per note |
| save something that happened | **remember that Pierre asked for a three-year TCO before 12.09** | one note in the context, with the people and tools named |
| record a decision | **we decided not to discount for Bergstrom** | a note of kind *decision*, listed on the dashboard |
| park a question | **open question: is the CFO a standing committee member?** | a note of kind *question*, kept in its context; answer in Codex with "close question ...: the answer" |
| log something you did | **I sent Pierre the TCO today** | a note; say what was done in the text |
| fix a wrong note | **correct memory m_9a1c02d4e5f6: the meeting is 12.09, not 10.09** | a new note replaces the old one; nothing is deleted |
| withdraw a note | **forget memory m_9a1c02d4e5f6, it was wrong** | the old note leaves every view (still in the file); your short note saying it was withdrawn stays |
| find anything | **what do we know about the TCO?** / **did we ever talk about Berlin?** | searches every context, tells you where it found it |
| see one person | **tell me about Pierre Aubert** | a one-page view built from every note about them |
| tell Codex two names are one person | **Chris is Krzysztof Pawlak** | from now on "Chris" and "Krzysztof" are the same in search |
| say a name is not a person | **Telli is a company** | it shows as a company, not a contact; products and teams work the same |
| refresh a context's summary now | **update the summary now** | rewritten from the notes at once; otherwise it refreshes by itself 2 minutes after your last save; your rules stay |
| see everything | **open the dashboard** | it opens inside Codex, in the in-app browser; **render** only refreshes it |
| keep an edit you made by hand | **save** | everything Codex writes is kept at once; this is for a file you changed yourself |
| open a new context | say what you are starting on; Codex offers | *"Create a `berlin-expansion` context?"* yes, and it is loaded |
| leave a context | **unload marketing** | the others stay loaded |
| put a context away | **archive berlin-expansion** | asks once; unloaded, hidden, notes still searchable; **unarchive** brings it back |
| split a context | **Bergstrom is becoming its own thing, fork it out of pipeline** | a new context with the matching notes copied |
| change the company info | **change what we sell to also include UK retailers**, then choose **APPROVE** | shown as a form first; applied only when you choose APPROVE there |
| stop the dashboard opening by itself | **open the dashboard only when I ask**, then choose **APPROVE** | a setting changed through Codex |
| see who is who | **what entities do we have** | the Entities page groups them: team, people, companies, products, teams; filter by kind or search |
| tell Codex two names are one | **Maciej is Maciej Kończal** | an alias; Codex asks this itself when a new name looks like one it knows, and never merges on its own |

Codex also does four things on its own: it suggests a better context if your note fits another
one, it offers a new context when you start a new stream of work, it asks to compile and set up the
weekly run when summaries have been behind for days with no schedule, and it offers to install a missing tool or add one it noticed you
using. Each is a question; nothing happens without your yes.

## The dashboard

**render** builds it; it is also rebuilt after every change and every time you open Codex in the
folder, and Codex opens it inside the app, in its in-app browser, every time you start a chat
in the brain (reusing the tab if it is already there). The live page refreshes itself within seconds of a change.

- **Home** shows questions about the brain, proposed changes, possible duplicate names and contexts.
- **Contexts** shows summaries, rules, notes and sources. Business follow-ups stay here.
- **Questions** contains unresolved memory-system questions and a history of recorded decisions.
- **Entities** shows names, where they appear and the evidence connecting them.
- **Admin** shows workplace information, connections, linked projects on this computer and update status. Each project shows its folder, contexts and link status. Choose or change projects in Codex chat.
- **Search** finds information across the brain. Press `/` to focus it.

**Projects** shows notes from a selected folder. **Chat about this** opens that project folder
in Codex, or the brain folder for other views, with a short prompt
about the current topic. Right-click any card for it; buttons act on a left click. A notice
says Codex is opening, since that takes a few seconds. Chat is optional, even when nothing needs attention. Only relevant
questions and notices are mentioned; technical instructions stay in the workflow. Review the
prompt and press Send to begin. Answer questions, correct notes, approve proposed
changes and manage connections in that conversation. There are no editing buttons on the dashboard.

As each answer is saved, its question closes and the live viewer refreshes, keeping your view,
search and scroll position. Summary compilation starts after each saved change and refreshes the viewer when finished. If the connection is lost, the
viewer shows the last update time. A downloaded or directly opened HTML file is a saved copy.

Sources sit inside a compact, counted group of provider pills. Expand the group to inspect
them; IDs are tucked under Reference details. Links name their destination: a website opens
in a new tab, and a conversation opens in Codex. A bare connector reference has no guessed
search link. Note citations stay in the dashboard and take you to the supporting note.

## Once a week: make it recurring

A campaign is not one chat. Say `start the outbound workflow`: the brain settles what it needs,
records the run, and tells you at the start of a chat when the next step is due. See
[WORKFLOWS.md](WORKFLOWS.md).

Codex can refresh every context's summary on a schedule, so Monday morning the summaries are
current and the dashboard is fresh. In the Codex app:

1. Open your brain's project, then **Scheduled tasks**, then new task.
2. Paste this as the task:

   > Run the gtmb-sync skill as the scheduled run: compile every context whose summary is behind with by: schedule, render the dashboard. Do nothing else.

3. Timing: weekly, Sunday 20:00 (or nightly at 06:00). Choose **run in the local project**, not
   a background copy, so it updates your real brain.
4. To see it work once, set the first run a few minutes ahead, keep the app open, and watch:
   the context's summary changes, the dashboard shows nothing behind, and `git log` in the
   folder has a `scheduled: compile ...` entry.

The computer must be on and the app running at that time. If it was not, nothing is lost: the
next chat opens with "N new memories since the last compile, compile it now?" and a yes does
the same by hand.

## Slack: who you owe a reply

If your team talks in Slack, connect it (onboarding offers it, or say `connect Slack`). Then
`what's waiting on me in Slack` lists the messages where someone waits on your answer, with a
link and a suggested reply written the way you write. `todo` includes them too, and the
morning sync can put the list at the top of its report. It reads live and only within the
scope you chose once; it never sends, reacts or marks anything read, and nothing from your DMs
is saved in the brain. Your reply style is learned from your own Slack replies, shown to you
before it is saved, and kept as a short description, never as your messages. The procedure is
[slack-replies.md](../plugins/gtm-brain/skills/gtmb-todo/references/slack-replies.md).

## Workshop demo: the two loops

Two stories show the brain end to end: an outreach lifecycle and a content loop. Build the demo
brain with `node plugins/gtm-brain/test/live/demo-loops.mjs --brain-only` (a contributor
checkout). It holds Reflow Fixture: a filled ICP, strategy and tone of voice, Zynt signals, customer
words from two calls, and the project folders Outbound and Website. Open it as a Codex project.
Nothing is sent or published. You tell Codex what Clay, Surfer, Gmail and Vercel returned. The same
script without `--brain-only` types these sentences into Codex and checks every step. The summaries
in this brain were never compiled, so Codex may end its first answer by offering to compile them.

**Outreach.** Type each line in one chat:

1. *We want to start outreach this week. From our ICP and the buying signals in the brain, which
   two accounts should we contact first, and why? Name the person to write to if we know one. Do
   not save anything yet.* Fernbrook Outdoor comes first: an ICP fit with a Head of Returns job
   post. Umber Pharma, a pharmacy chain the ICP rules out, is not picked.
2. *I ran Clay on Fernbrook Outdoor. It returned: 85 stores in Germany and Austria, about 1,400
   employees, returns handled by hand in each store. Their Head of Operations is Lea Hoffmann,
   lea.hoffmann@fernbrook-outdoor.example, based in Munich. Save what Clay found.* A note in the
   brain; Lea Hoffmann appears under Entities.
3. *Draft the first outreach email to Lea, tied to the Zynt signal, in our tone of voice. Draft
   only: do not send anything. Put the draft as a Markdown file in the outbound project folder.* A
   Markdown draft in `projects/outbound/`: short sentences, no exclamation marks, signed Marta.
   Nothing is sent.
4. *I sent that email to Lea from Gmail on 11 November. She replied on 13 November: "Interesting
   timing. We are in the middle of an ERP migration until January. Ping me after 10 January."
   Record both.* Two notes, with the follow-up date.
5. *Draft the follow-up for 11 January that picks up her reply. Draft only, same folder.* A second
   draft, about the migration.
6. *Lea booked a pilot scoping call for 14 January. Fernbrook Outdoor is now a prospect for us.
   Record the call and their status in the brain. Do not touch the CRM.* Fernbrook Outdoor shows as
   a prospect in the dashboard's customers.
7. In a **new chat**: *Where do we stand with Fernbrook Outdoor? Who is our contact, what happened
   so far, and what is next? Do not save anything.* The whole thread comes back from the brain:
   Lea, the migration, the 14 January call, prospect.

**Content.** In another chat:

1. *Plan our blog. Read our strategy, the market notes and what customers said on calls. Surfer
   gave us these keywords (monthly searches, difficulty): 'returns automation for retailers' 1,900
   / 34; 'reduce return rate retail' 880 / 22; 'store pickup returns' 320 / 12. Propose three posts
   for the landing page blog, each with its keyword and the customer words it uses. Do not save
   anything yet.* Three topics, each with its keyword and a customer's own words ("after Black
   Friday we drown in return tickets").
2. *Go with 'store pickup returns' first; save that as a decision. Then draft the post in our tone
   of voice: about 600 words, an SEO title under 60 characters, a meta description under 155
   characters, one H1, the keyword in the title and in the first paragraph. Put the draft in the
   website project folder as Markdown, with title and description in its front matter.* A decision
   note and a Markdown post in `projects/website/` that passes those checks.
3. *The post went live today at https://reflow.example/blog/store-pickup-returns, deployed with the
   landing page on Vercel. Remember that it was published.* A note with the URL.
4. *Two weeks of numbers for that post: 1,240 visits, position 8 for 'store pickup returns', 3 demo
   requests, one of them from Lumen Outdoor. Record what it produced.* A note linked to Lumen
   Outdoor.
5. In a **new chat**: *What has our blog produced so far, and which post should come next? Do not
   save anything.* The results, and a post from a pillar still open: returns cost or peak season.

## Workshop demo on stub tools

`node plugins/gtm-brain/test/live/demo-loops.mjs --stub` runs the same loops, but Codex calls the
outside tools instead of being told what they returned. `test/live/stub-gtm-tools.mjs` stands in for
them: a company search and an enrichment (what Clay does), buying signals (Zynt), keyword research
and a content score (Surfer). It is declared to Codex beside GTM Brain for that run only, never in
your own Codex configuration. The outreach loop gains a first step, the company search by the ICP.
After every step the check also asks: was the right tool called with criteria from the brain (the ICP
document, the saved prospects), was what came back saved with a source pointing at the tool, does
the brain's tools list show the tool as used, and was nothing sent. Every call is logged in
`stub-calls.jsonl` beside the brain. Add `--fail expired_key`, `--fail empty` or `--fail rate_limit`
(with `--step o2-enrich`, for example) to see what Codex tells the person when a tool fails. A failure
run asks only the steps that call a tool, and passes when Codex says what failed, saves nothing the
tool did not return and stops asking after three calls. On 15 November an empty result did not pass:
Codex asked the same tool 16 and 42 times before it gave up.

`--connectors` is the third run: Clay, Zynt and Surfer are declared under their own names, three
stand-in servers with canned answers (`test/live/gtm-connectors-fixture.mjs`). The demo brain then
holds no Fernbrook signal: Codex reads it in Zynt, finds the contact in Clay for free, and spends one
Clay credit on her email only when the sentence allows it (the step `o2-find` comes before
`o2-enrich`). Keywords and the content brief come from Surfer; Codex writes the post itself. A turn
that calls a tool that spends a credit nobody asked for fails. Calls are logged in
`<loop>-connectors.jsonl`. It does not combine with `--stub` or `--fail`.

What neither stand-in proves: real sign-in and keys, the real tools' rate limits and cost per call,
and the real tools' data shapes and quality. The fixture data is small and fits the demo brain.

## Three habits that make it work

1. **Say where you are.** Load the context before you start; Codex keeps you there.
2. **Say what happened.** Decisions, answers, things sent. A sentence each. Not every message.
3. **Say yes to compile.** A context whose summary is behind is a context Codex half-knows.

## What Codex will never do

- edit company info or notes directly (a guardrail denies it); entity briefs are compiled
  from notes, preserving handwritten Markdown
- copy your CRM, mail or calendar into the brain
- invent a fact: if it is not in a note or a tool, it says so
- change a context or create one without asking
- lose a note: everything it writes is kept the moment it is written
- change the brain through the dashboard; Chat about this opens a prepared Codex conversation

## Work in your own folders

For a new folder, run `/gtmb-project` in Codex and choose its name, location, brain,
and contexts. For an existing folder, use `/gtmb-project`. Both ask before capturing
work. On macOS, GTM Brain then asks Codex to open the linked folder automatically, using normal
system permissions. Start a new task in that project.

If it is not visible in the sidebar, choose **New project** (or **+** beside Projects) and
select the exact folder path given in the reply. On macOS, press **Cmd+Shift+G** in the
folder picker, paste the path, press **Return**, then **Open**. In the ChatGPT desktop app,
use **Projects > Create / New project**, add that local folder, and save the project. Select
it and start a **New task** / **New chat**. These steps also work when automatic opening is
unavailable; the folder is already linked.

You do not work inside the brain folder; you work where your work is. In any folder you have
opened as a Codex project, say `/gtmb-project`: it asks which brain, whether to capture what
you do here, and which contexts this project touches. From then on a chat there starts with its
own open contexts and every note is tagged with the project; everything is still in the one
brain, searchable from anywhere. Ask "list projects" to see them, "unlink this project" to stop.
People and companies are shared by every project, and a project is a folder plus a tag, not a
second memory: see [One brain, many projects](../plugins/gtm-brain/MANUAL.md#one-brain-many-projects).

A linked code repository stays yours: its own `.claude/` and `brain/` paths are never blocked,
and the brain's skill links are kept out of its `git status`. The link itself is a block in the
repository's `AGENTS.md`: commit it and every clone and worktree uses the brain, or leave it
uncommitted for this checkout only.

## Parallel threads

Two chats in the same brain folder can run at once: every note is its own commit, and notes are
only ever added, so threads never wait on each other. If you prefer one git worktree per thread,
that works too: when a worktree branch is merged back, notes from both sides are kept line by line
without a conflict, the newer summary is kept, and the contexts that took notes from both sides
are summarized again.

## Files, if you ever look

```
brain/admin.md                       company, team, tools
brain/entities/<id>.md               identity and cited briefs
brain/contexts/<context>/context.md  the context summary and rules
brain/contexts/<context>/memories.jsonl   the notes, one per line
README.md                            what goes where; setup writes it, upgrade refreshes it while unedited
strategy.md, icp.md, voice.md, ...  your documents (five from day one), files in a folder of the same name
RULES.md                             where every file goes and your own saving rules; you edit it
SCHEMA.md                            fields kept per person, organization, product; relationship types
projects/<project>/                  one folder per project (an event, a campaign), its deliverables inside
work/home/index.html                 the dashboard
```

Three places, three jobs. A document is a Markdown you wrote and the work must follow, at the
top of the folder or in a folder you named, with its files beside it ([DOCUMENTS.md](DOCUMENTS.md)).
A project folder holds drafts and deliverables for one piece of work (the website, an event).
`brain/` is what Codex remembers: notes by topic, people, companies. Nothing else belongs at the
top, and `README.md` says so: a `company/` folder with subfolders is a container nobody reads.
A strategy is a document plus, once written, its decisions as notes in the Strategy context;
say `add strategy.md as a document` to register one you wrote by hand. `voice.md` is filled by
`/gtmb-voice`: it asks whose voice it is, reads writing that fits (the company's own pages,
posts and outbound mail; your own writing for a personal voice), tests the draft on one fresh
piece you edit, and tells you the sentence to try in a new chat; run it again whenever the way
you write changes.

Your own base files: say `add pricing as a base file` (or positioning, competitors, objections,
anything). Codex checks whether an existing file already covers it and offers a section there
first, drafts from what the brain already knows with the notes it used listed (or asks you for
two or three facts when it knows nothing), shows the draft in full and asks one thing: what work
should follow it. Picking one saves it as a draft. A Markdown you drop at the top by hand is noticed
("pricing.md is here but the brain does not use it yet") and adopted with only frontmatter added.

Recordings and files over 25 MB never go into git. Drop one in the chat: Codex puts it in your
Google Drive folder (or the folder outside git that you chose during setup, `big_files` in
`brain/admin.md`) and the note about it keeps the link.

A context's standing instructions (`rule`) describe its purpose, meaningful boundaries and
how Codex should work there. The dashboard shows them as Instructions; change them in chat.
Older `Scope` sections are read as part of those instructions and folded into the rule on the
next normal cover write. Placeholder and exact duplicate paragraphs are omitted. Reading or
rendering alone does not rewrite the cover. Summary and Working guidance still compile from memories. Guidance contains only reusable
methods, with memory citations, and stays empty when none are supported. Immediate next steps
belong in the summary and source follow-ups. Existing `Now` text is preserved until the next
compilation reassesses it. The tool argument `now` and CLI flag `--now` stay compatible.

Plain text, in git, on your machine. Obsidian or any editor opens them. You can read
everything; let Codex do the writing.

## Editing Markdown yourself

Editor saves in the brain refresh the dashboard while its local observer is running. Manual
summary or Working guidance edits pause compilation for that context. Review them in Codex, preserve facts
as memories or standing instructions, then confirm the reviewed replacement. The original is
backed up locally. The dashboard says "Summary needs updating due to manual editing" for these edits. Older valid
covers start tracking automatically without a review or changes to their contents. Files elsewhere in linked project folders are not imported automatically.

The dashboard refresh time describes the viewer, not summary completion. If automatic summary
updates exhaust their retries, a notice confirms your notes are saved and points to Chat about
this to investigate and retry. Invalid context files show the detected format problem.

## Photos, logos and other entity files

Tell Codex: "Attach this file as Reflow's primary logo." Supply its local path, and say whether
it is approved or a draft. The file stays where it is. GTM Brain records its connection to Reflow
and shows it under Assets on the entity page. Images have previews and an Open file link;
other files have Download file. Chat about this handles changes.

One file can belong to several entities. Replacing or retiring an attachment preserves its
history and leaves the original file alone. Keep old versions in separate files if their bytes
need to be preserved. A file missing from this computer is shown as unavailable; locate it in
Codex and update the attachment. Sharing a brain shares references, not the attached files.

# Your company brain: a quick guide

For the person using it, not for the person building it. Ten minutes to read.

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

1. With GTM OS installed, open a new chat in an empty project and send **`/gtm-os-start`**.
   Setup reuses what is known, asks for missing details, and explains the six starting contexts together.
   It also asks which existing Codex projects to follow. Select their names or skip; selected
   folders are linked to your brain while you stay in the onboarding chat. Future notes carry
   their project tags. Existing files and chats are not imported by this choice.
2. Codex checks your tools by itself at every start. If your CRM, mail or calendar has an official
   plugin that is not installed, it offers to install it; say yes and sign in when asked. To run
   the check and a read test on demand: **"connect my tools."**
3. The dashboard opens alongside your chat. Your company facts live in Our company; customer
   and competitor names appear under Entities, linked to notes in the relevant contexts.

## Every chat

Codex opens with one line telling you where you are:

> In Target customers. Two new notes: Pierre asked for a TCO, and Anna confirmed the buying team. The summary is updating in the background.

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
| refresh a context's summary | **compile** (or say yes when offered) | the summary is rewritten from the notes; your rules stay |
| see everything | **open the dashboard** | it opens inside Codex, in the in-app browser; **render** only refreshes it |
| keep an edit you made by hand | **save** | everything Codex writes is kept at once; this is for a file you changed yourself |
| open a new context | say what you are starting on; Codex offers | *"Create a `berlin-expansion` context?"* yes, and it is loaded |
| leave a context | **unload marketing** | the others stay loaded |
| put a context away | **archive berlin-expansion** | asks once; unloaded, hidden, notes still searchable; **unarchive** brings it back |
| split a context | **Bergstrom is becoming its own thing, fork it out of pipeline** | a new context with the matching notes copied |
| change the company info | **change what we sell to also include UK retailers**, then type **APPROVE** | shown as a diff first; applied only on the word APPROVE |
| stop the dashboard opening by itself | **open the dashboard only when I ask**, then **APPROVE** | a setting changed through Codex |
| see who is who | **what entities do we have** | the Entities page groups them: team, people, companies, products, teams; filter by kind or search |
| tell Codex two names are one | **Maciej is Maciej Kończal** | an alias; Codex asks this itself when a new name looks like one it knows, and never merges on its own |

Codex also does four things on its own: it suggests a better context if your note fits another
one, it offers a new context when you start a new stream of work, it offers to compile when a
context's summary is behind, and it offers to install a missing tool or add one it noticed you
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

Codex can refresh every context's summary on a schedule, so Monday morning the summaries are
current and the dashboard is fresh. In the Codex app:

1. Open your brain's project, then **Scheduled tasks**, then new task.
2. Paste this as the task:

   > Run the gtm-os-sync skill as the scheduled run: compile every context whose summary is behind with by: schedule, render the dashboard. Do nothing else.

3. Timing: weekly, Sunday 20:00 (or nightly at 06:00). Choose **run in the local project**, not
   a background copy, so it updates your real brain.
4. To see it work once, set the first run a few minutes ahead, keep the app open, and watch:
   the context's summary changes, the dashboard shows nothing behind, and `git log` in the
   folder has a `scheduled: compile ...` entry.

The computer must be on and the app running at that time. If it was not, nothing is lost: the
next chat opens with "N new memories since the last compile, compile it now?" and a yes does
the same by hand.

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

For a new folder, run `/gtm-os-project` in Codex and choose its name, location, brain,
and contexts. For an existing folder, use `/gtm-os-project`. Both ask before capturing
work. On macOS, GTM OS then asks Codex to open the linked folder automatically, using normal
system permissions. Start a new task in that project.

If it is not visible in the sidebar, choose **New project** (or **+** beside Projects) and
select the exact folder path given in the reply. On macOS, press **Cmd+Shift+G** in the
folder picker, paste the path, press **Return**, then **Open**. In the ChatGPT desktop app,
use **Projects > Create / New project**, add that local folder, and save the project. Select
it and start a **New task** / **New chat**. These steps also work when automatic opening is
unavailable; the folder is already linked.

You do not work inside the brain folder; you work where your work is. In any folder you have
opened as a Codex project, say `/gtm-os-project`: it asks which brain, whether to capture what
you do here, and which contexts this project touches. From then on a chat there starts with its
own open contexts and every note is tagged with the project; everything is still in the one
brain, searchable from anywhere. Ask "list projects" to see them, "unlink this project" to stop.

## Files, if you ever look

```
brain/admin.md                       company, team, tools
brain/entities/<id>.md               identity and cited briefs
brain/contexts/<context>/context.md  the context summary and rules
brain/contexts/<context>/memories.jsonl   the notes, one per line
work/home/index.html                 the dashboard
```

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
it is approved or a draft. The file stays where it is. GTM OS records its connection to Reflow
and shows it under Assets on the entity page. Images have previews and an Open file link;
other files have Download file. Chat about this handles changes.

One file can belong to several entities. Replacing or retiring an attachment preserves its
history and leaves the original file alone. Keep old versions in separate files if their bytes
need to be preserved. A file missing from this computer is shown as unavailable; locate it in
Codex and update the attachment. Sharing a brain shares references, not the attached files.

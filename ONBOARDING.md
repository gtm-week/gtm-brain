# Getting started with GTM OS

This page takes you from nothing installed to working with GTM OS. You do three things:
paste one prompt, create a project, send one message. Codex does the rest and asks you
when it needs a decision. No terminal, no forms to fill in.

## What you get

GTM OS gives your team a **company brain**: a folder on your computer where Codex keeps
what it knows about your business. It holds contexts of work (Our company, Strategy, Market,
Target customers, Our offer, plus your personal context), the notes in each, and your
company's workplace info: who you are, who is on the team, which tools you use.

Everything is plain text on your machine. Nothing is hosted. Deals and contacts stay in
your CRM; the brain remembers what happened and what you decided. Codex learns your
business from what it can see and from your corrections, not from a questionnaire.

## Before you start

Three things only you can do:

1. **Install the Codex desktop app and sign in.** GTM OS runs inside it.
2. **Have access to GTM OS.** It is shared privately through GitHub. The person who invited
   you gives your GitHub account access; without it the installation cannot download.
3. **Know your work logins**: email, calendar and CRM. You sign in to them yourself during
   setup. Sign-ins stay on your machine; the brain never holds a password.

## The path at a glance

| Step | You do | Codex does |
|---|---|---|
| 1. Install | Paste one prompt in any Codex chat | Checks the computer, installs GTM OS, turns on the safety locks |
| 2. Project | Create an empty folder called GTM OS, open a new chat in it | Nothing yet |
| 3. Set up | Send "Set up GTM OS here" | Creates the brain, learns your business, connects your tools, opens the dashboard |
| After | Work in plain language | Remembers, recalls, keeps summaries up to date |

## Step 1: install GTM OS

Open the Codex app, start a chat in any folder, and paste:

> Read https://github.com/gtm-week/gtm-os/blob/main/INSTALL.md and follow it
> exactly. Read nothing else in that repository.

What happens:

- Codex checks this computer has everything it needs and installs what is missing.
- It installs GTM OS.
- It turns on the **safety locks**: the safeguards that stop anything important in your
  brain changing without your say-so. The app shows an Approve button for this. Click it.
- It finishes by telling you the next step. It does not create your project for you.

Whenever the app shows a permission prompt, read the action it names and click Approve.
You never need to type a yes in the chat.

## Step 2: create your project

In the Codex app, create a new project: an **empty folder**, wherever you keep your work,
called **GTM OS**. The app shows the folder name as the project name. Then open a
**new chat** in that project.

The folder must be empty. GTM OS never takes over a folder that already has files in it.

## Step 3: send "Set up GTM OS here"

In that new chat, send **Set up GTM OS here**. Typing `/gtm-os-start` does the same. From
here Codex drives and you correct. It asks one question at a time, usually as choices you
click, with room to type a correction.

The dashboard opens next to the chat, with a card showing these six steps and where you are:

1. **Who you are.** Codex asks for the few things it cannot know: your company, what you
   sell and to whom, your name and work email, your teammates, the tools you use (CRM first).
   Then it creates the brain in your folder.
2. **Company profile.** It researches your website and what is already on the machine, and
   drafts your workplace info. You correct what is wrong, then type **APPROVE** in the chat.
   Nothing about your company is saved as fact without that word from you.
3. **Tools.** It proposes connecting your work email, calendar and CRM first (HubSpot, or
   Attio if that is yours), then the other tools it noticed. You choose; you sign in when
   asked. Each connection gets one read test so you know it works.
4. **What is going on.** It reads the connected tools for a picture of your actual work:
   customers, deals in motion, recent conversations. It files the first notes with their
   sources and plays the picture back for you to correct.
5. **Running for you.** It recommends a daily sync so the brain stays fresh, and proposes
   one or two other useful things drawn from what it saw. Each is set up only on your yes.
6. **Your projects.** It asks which of your existing Codex projects GTM OS should follow.
   Choose the ones whose future work should feed the brain, or skip. Your existing files
   and conversations stay where they are.

It closes with a short summary: what connected, what it learned, what is now running, and
where to find the ready-made workflows in the dashboard.

### Good to know during setup

- **Pause any time.** Say "stop". When you come back, a simple "hi" in the project is
  enough; Codex knows where it left off and carries on. You do not repeat your answers.
- **Skip anything.** Declining one tool or one suggestion skips that item only. Setup
  continues.
- **If Codex asks you to restart the app**, it has saved your progress first and gives you
  a "Resume setup" link. Quit Codex, reopen it, open the link and press Send.
- **Permission prompts** are announced one line ahead, so you know what each click allows:
  installing a tool's connection, opening the dashboard inside Codex, the first write to
  your folder.

## Optional: bring in what your previous assistant knows

If you have been using Claude Code, Cursor, Gemini or another assistant for company work,
it already knows your tools, your people and the deals in motion. Setup offers this at its
close; it also works any time later. In that assistant, paste:

> Read https://github.com/gtm-week/gtm-os/blob/main/IMPORT.md and follow it
> exactly. Read nothing else in that repository.

It writes one file on your machine for you to review. Nothing is sent anywhere. Then, in
the GTM OS chat, say **"import from claude"**: every line is played back, you confirm, and
what you confirm is filed with its source. Workplace facts still go through APPROVE.

## Your first week

Just talk to Codex in plain language: "remember this", "what do we know about Acme?",
"where are we with the pilot?". It records new information as it appears, and summaries
update by themselves in the background. When you want a specific workflow:

| You want to | Type |
|---|---|
| Know what to do next | `/gtm-os-todo` |
| Pull in what arrived through your tools | `/gtm-os-sync` |
| Get a one-page brief before a call | `/gtm-os-deepdive` |
| Decide whether to push, fix, stop or measure growth spend | `/gtm-os-unit-economics` |
| Fill in the strategy the brain starts with (`strategy.md`), in a 10-15 minute conversation | `/gtm-os-strategy` |
| Add a PDF, image or deck to the brain | drop it in the chat and say what it belongs to; no command |
| Change company info, team or tools | `/gtm-os-configure` |
| Keep the strategy, voice, design system or pricing the work must follow | `/gtm-os-document` |
| Turn something you do repeatedly into a reusable skill | `/gtm-os-skill` |

The **dashboard** is view-only: what needs you, open questions, contexts, notes, sources,
customers and companies. "Chat about this" opens a prepared Codex conversation; press Send
to begin. All decisions and changes happen in the chat, never in the dashboard.

When a newer GTM OS is out, the dashboard shows it under Admin and the chat mentions it
once. Say **"update GTM OS"**, then start a new chat.

## Work in your own folders

The brain is one folder; your work does not have to move into it. To connect another folder
(your website, your curriculum), type `/gtm-os-project` in Codex. It creates a new project
folder or links one you already have, and asks before capturing any work done there. From
the next chat in that folder, what you do lands in the brain tagged with that project, and
each project keeps its own open contexts, so two projects never mix. The dashboard lists
your projects. The brain folder stays the place for company-wide work. What goes where
(notes, documents, project folders) is in [GUIDE.md](GUIDE.md#files-if-you-ever-look).

On macOS, GTM OS asks Codex to open the linked folder for you. If it does not appear in
the sidebar, choose **New project** (or **+** beside Projects) and select the folder path
given in the reply: press **Cmd+Shift+G** in the folder picker, paste the path, press
**Return**, then **Open**. In the ChatGPT desktop app, use **Projects > New project** and
add that folder. Then start a new chat in it.

## If something goes wrong

| What you see | What to do |
|---|---|
| Codex cannot read the install page or download GTM OS | Your GitHub account has no access yet, or this computer is not signed in to GitHub. Ask the person who invited you, then say "sign me in to GitHub and try again". |
| "Safety locks" are reported as off | Everything else still works. Say "turn on the GTM OS safety locks"; the app may also offer to review them when you open the project. Accept. |
| Setup says the folder is not empty | Create a fresh empty folder as a new project and send "Set up GTM OS here" there. |
| A tool will not connect | Skip it and carry on. Later, say "connect my tools" to retry. |
| You closed the chat mid-setup | Open a new chat in the same project and say "hi". Setup resumes. |
| GTM OS commands are missing after an update | Quit Codex completely, reopen it, start a new chat. |

## Read next

- `GUIDE.md`: the ten-minute guide to daily use.
- `COMMANDS.md`: every workflow and what it touches.
- `SETUP.md`: the technical manual, for whoever maintains your installation.
